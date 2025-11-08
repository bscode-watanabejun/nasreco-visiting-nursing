# Phase 2-A 実装完了報告

**実装日**: 2025-10-24
**対象**: 患者・記録フラグ系加算の自動計算実装（6項目中4項目完了）

---

## 📋 実装サマリー

### ✅ 実装完了した加算（4項目）

| # | 加算コード | 加算名 | 保険種別 | 点数/単位 | テスト結果 |
|---|-----------|--------|---------|----------|-----------|
| 1 | `medical_discharge_joint_guidance` | 退院時共同指導加算 | 医療保険 | 8,000点 | ✅ 成功 |
| 2 | `care_initial_visit_1` | 初回加算（I） | 介護保険 | 350単位 | ✅ 成功 |
| 3 | `care_initial_visit_2` | 初回加算（II） | 介護保険 | 300単位 | ✅ 成功 |
| 4 | `care_long_visit` | 長時間訪問看護加算 | 介護保険 | 300単位 | ✅ 成功 |

### ⏸️ 実装見送り（2項目）

| # | 加算名 | 理由 |
|---|--------|------|
| 5 | 早朝訪問加算 | 基本報酬×25%の計算機能が未実装 |
| 6 | 夜間訪問加算 | 基本報酬×25%の計算機能が未実装 |

---

## 🔧 実装内容

### 1. データベーススキーマ拡張

#### 1.1 患者マスタ（patients）への日付フィールド追加

```sql
ALTER TABLE patients ADD COLUMN last_discharge_date DATE;      -- 直近の退院日
ALTER TABLE patients ADD COLUMN last_plan_created_date DATE;   -- 直近の訪問看護計画作成日
ALTER TABLE patients ADD COLUMN death_date DATE;               -- 死亡日
```

#### 1.2 訪問記録（nursing_records）への記録フラグ追加

```sql
ALTER TABLE nursing_records ADD COLUMN is_discharge_date BOOLEAN DEFAULT FALSE;           -- 退院日当日の訪問
ALTER TABLE nursing_records ADD COLUMN is_first_visit_of_plan BOOLEAN DEFAULT FALSE;      -- 新規計画初回訪問
ALTER TABLE nursing_records ADD COLUMN has_collaboration_record BOOLEAN DEFAULT FALSE;    -- 多職種連携記録
ALTER TABLE nursing_records ADD COLUMN is_terminal_care BOOLEAN DEFAULT FALSE;            -- ターミナルケア
ALTER TABLE nursing_records ADD COLUMN terminal_care_death_date TIMESTAMPTZ;              -- ターミナルケア死亡日時
```

### 2. 加算マスタ登録

#### 2.1 退院時共同指導加算（医療保険）

```sql
INSERT INTO bonus_master (
  bonus_code, bonus_name, bonus_category, insurance_type,
  points_type, fixed_points, predefined_conditions,
  version, valid_from, is_active, display_order
) VALUES (
  'medical_discharge_joint_guidance',
  '退院時共同指導加算（医療保険）',
  'collaboration',
  'medical',
  'fixed',
  8000,
  '[
    {
      "pattern": "is_discharge_date",
      "operator": "equals",
      "value": true,
      "description": "退院日当日の訪問"
    },
    {
      "pattern": "has_collaboration_record",
      "operator": "equals",
      "value": true,
      "description": "多職種連携記録あり"
    }
  ]'::jsonb,
  '2024',
  '2024-04-01',
  true,
  102
);
```

#### 2.2 初回加算（I）（介護保険）

```sql
UPDATE bonus_master
SET predefined_conditions = '[
  {
    "pattern": "is_first_visit_of_plan",
    "operator": "equals",
    "value": true,
    "description": "新規計画初回訪問"
  },
  {
    "pattern": "care_visit_duration_90plus",
    "operator": "equals",
    "value": false,
    "description": "訪問時間が90分未満"
  }
]'::jsonb
WHERE bonus_code = 'care_initial_visit_1';
```

#### 2.3 初回加算（II）（介護保険）

```sql
UPDATE bonus_master
SET predefined_conditions = '[
  {
    "pattern": "is_first_visit_of_plan",
    "operator": "equals",
    "value": true,
    "description": "新規計画初回訪問"
  },
  {
    "pattern": "care_visit_duration_90plus",
    "operator": "equals",
    "value": true,
    "description": "訪問時間が90分以上"
  }
]'::jsonb
WHERE bonus_code = 'care_initial_visit_2';
```

#### 2.4 長時間訪問看護加算（介護保険）

```sql
UPDATE bonus_master
SET predefined_conditions = '[
  {
    "pattern": "care_visit_duration_90plus",
    "operator": "equals",
    "value": true,
    "description": "訪問時間が90分以上"
  }
]'::jsonb
WHERE bonus_code = 'care_long_visit';
```

#### 2.5 併算定ルールの設定

```sql
-- Phase 2-A加算と緊急時訪問看護加算を併算定可能に
UPDATE bonus_master
SET can_combine_with = ARRAY['care_emergency_system', 'care_emergency_system_2']
WHERE bonus_code IN ('care_initial_visit_1', 'care_initial_visit_2', 'care_long_visit');

-- 初回加算（II）と長時間訪問看護加算を併算定可能に
UPDATE bonus_master
SET can_combine_with = array_append(can_combine_with, 'care_long_visit')
WHERE bonus_code = 'care_initial_visit_2';

UPDATE bonus_master
SET can_combine_with = array_append(can_combine_with, 'care_initial_visit_2')
WHERE bonus_code = 'care_long_visit';
```

### 3. バックエンド実装（bonus-engine.ts）

#### 3.1 条件評価関数の追加

```typescript
// 退院日当日の訪問
function evaluateIsDischargeDate(context: BonusCalculationContext): ConditionEvaluationResult {
  const isDischargeDate = context.isDischargeDate === true;
  return {
    passed: isDischargeDate,
    reason: isDischargeDate ? "退院日当日の訪問" : "退院日当日の訪問ではない",
  };
}

// 新規計画初回訪問
function evaluateIsFirstVisitOfPlan(context: BonusCalculationContext): ConditionEvaluationResult {
  const isFirstVisit = context.isFirstVisitOfPlan === true;
  return {
    passed: isFirstVisit,
    reason: isFirstVisit ? "新規計画の初回訪問" : "初回訪問ではない",
  };
}

// 多職種連携記録
function evaluateHasCollaborationRecord(context: BonusCalculationContext): ConditionEvaluationResult {
  const hasRecord = context.hasCollaborationRecord === true;
  return {
    passed: hasRecord,
    reason: hasRecord ? "多職種連携記録あり" : "多職種連携記録なし",
  };
}

// 90分以上の訪問
function evaluateCareVisitDuration90Plus(context: BonusCalculationContext): ConditionEvaluationResult {
  const duration = context.actualDurationMinutes || 0;
  const is90Plus = duration >= 90;
  return {
    passed: is90Plus,
    reason: is90Plus ? `訪問時間${duration}分（90分以上）` : `訪問時間${duration}分（90分未満）`,
  };
}
```

#### 3.2 条件評価ロジックの修正（重要なバグ修正）

**修正前（バグあり）:**
```typescript
if (condition.operator === "equals" && condition.value !== undefined) {
  if (result.passed !== expectedValue) {
    return { passed: false, ... };
  }
}
return result;  // ❌ まだ passed=false のまま返している
```

**修正後（正しい）:**
```typescript
if (condition.operator === "equals" && condition.value !== undefined) {
  if (result.passed !== expectedValue) {
    return { passed: false, ... };
  }
  // ✅ 期待値と一致した場合は明示的に passed=true を返す
  return { passed: true, reason: `${result.reason} (期待値: ${expectedValue})` };
}
return result;
```

#### 3.3 pattern/type フィールドの両方をサポート

```typescript
// Phase 2-A: 'pattern' フィールドをサポート（後方互換性のため 'type' も維持）
const type = condition.pattern || condition.type;
```

### 4. フロントエンド実装

#### 4.1 患者情報画面への日付フィールド追加

**ファイル**: `client/src/components/PatientDetail.tsx`

```tsx
<div className="space-y-2">
  <Label htmlFor="lastDischargeDate">直近の退院日</Label>
  <Input
    id="lastDischargeDate"
    type="date"
    value={formData.lastDischargeDate || ""}
    onChange={(e) => setFormData(prev => ({ ...prev, lastDischargeDate: e.target.value || null }))}
  />
</div>

<div className="space-y-2">
  <Label htmlFor="lastPlanCreatedDate">直近の訪問看護計画作成日</Label>
  <Input
    id="lastPlanCreatedDate"
    type="date"
    value={formData.lastPlanCreatedDate || ""}
    onChange={(e) => setFormData(prev => ({ ...prev, lastPlanCreatedDate: e.target.value || null }))}
  />
</div>

<div className="space-y-2">
  <Label htmlFor="deathDate">死亡日</Label>
  <Input
    id="deathDate"
    type="date"
    value={formData.deathDate || ""}
    onChange={(e) => setFormData(prev => ({ ...prev, deathDate: e.target.value || null }))}
  />
</div>
```

#### 4.2 訪問記録画面への記録フラグ追加

**ファイル**: `client/src/components/RecordDetail.tsx`

```tsx
{/* Phase 2-A: 記録フラグ */}
<div className="flex items-center space-x-2">
  <Checkbox
    id="isDischargeDate"
    checked={formData.isDischargeDate || false}
    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isDischargeDate: checked }))}
  />
  <Label htmlFor="isDischargeDate">退院日当日の訪問</Label>
</div>

<div className="flex items-center space-x-2">
  <Checkbox
    id="isFirstVisitOfPlan"
    checked={formData.isFirstVisitOfPlan || false}
    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isFirstVisitOfPlan: checked }))}
  />
  <Label htmlFor="isFirstVisitOfPlan">新規計画書作成後の初回訪問</Label>
</div>

<div className="flex items-center space-x-2">
  <Checkbox
    id="hasCollaborationRecord"
    checked={formData.hasCollaborationRecord || false}
    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, hasCollaborationRecord: checked }))}
  />
  <Label htmlFor="hasCollaborationRecord">多職種連携記録</Label>
</div>
```

#### 4.3 加算マスタ管理画面への適用条件表示機能追加

**ファイル**: `client/src/components/BonusMasterManagement.tsx`

**機能**: 加算の適用条件を人間が読みやすい日本語で自動表示

**表示例:**
```
適用条件
1. 訪問記録の「退院日当日の訪問」にチェックあり
2. 訪問記録の「多職種連携記録」にチェックあり
```

**実装ポイント:**
- パターン名と具体的な表現のマッピング辞書を作成
- 訪問記録の条件: 「訪問記録の〜」
- 施設管理の条件: 「施設管理の〜」
- 時間・時刻の条件: 「訪問時間が〜」「訪問時刻が〜」
- operator と value を自然な日本語に変換

---

## 🧪 テスト結果

### テスト環境
- 施設: テストクリニック（大阪支店）
- 患者: テスト次郎（CLINIC-003）
- 保険種別: 介護保険（テスト2〜4）、医療保険（テスト1）

### テストケース

#### テスト1: 退院時共同指導加算（医療保険）
- **訪問日**: 2025-10-23
- **患者設定**: 直近の退院日 = 2025-10-23
- **訪問記録**: 退院日当日の訪問 ✓、多職種連携記録 ✓
- **期待結果**: 8,000点
- **実測結果**: ✅ **8,000点** - 成功

#### テスト2: 初回加算（I）
- **訪問日**: 2025-10-28
- **患者設定**: 直近の計画作成日 = 2025-10-28
- **訪問記録**: 新規計画初回訪問 ✓、訪問時間 30分（90分未満）
- **期待結果**: 初回加算（I）350単位 + 緊急時訪問看護加算574単位
- **実測結果**: ✅ **350単位 + 574単位** - 成功

#### テスト3: 初回加算（II） + 長時間訪問看護加算
- **訪問日**: 2025-10-28
- **患者設定**: 直近の計画作成日 = 2025-10-28
- **訪問記録**: 新規計画初回訪問 ✓、訪問時間 100分（90分以上）
- **期待結果**: 初回加算（II）300単位 + 長時間訪問300単位 + 緊急時訪問574単位
- **実測結果**: ✅ **300単位 + 300単位 + 574単位** - 成功

#### テスト4: 長時間訪問看護加算のみ
- **訪問日**: 2025-10-25
- **訪問記録**: 訪問時間 100分（90分以上）
- **期待結果**: 長時間訪問300単位 + 緊急時訪問574単位
- **実測結果**: ✅ **300単位 + 574単位** - 成功

---

## 🐛 発見・修正したバグ

### バグ1: 値比較ロジックの致命的なバグ

**症状**: `expectedValue=false` と `actualPassed=false` が一致しても条件不成立になる

**原因**:
```typescript
if (result.passed !== expectedValue) {
  return { passed: false, ... };
}
return result;  // ❌ まだ passed=false のまま
```

**修正**:
```typescript
if (result.passed !== expectedValue) {
  return { passed: false, ... };
}
// ✅ 明示的に passed=true を返す
return { passed: true, reason: `${result.reason} (期待値: ${expectedValue})` };
```

### バグ2: パターンフィールド名の不一致

**症状**: bonus_master は `pattern` フィールドを使用しているが、コードは `type` を参照

**修正**:
```typescript
const type = condition.pattern || condition.type;  // 両方サポート
```

### バグ3: パターン名の不一致

**症状**: bonus_master は `care_long_visit_duration` を使用、実装は `care_visit_duration_90plus`

**修正**: bonus_master のパターン名を実装に合わせて修正

---

## 📁 変更ファイル一覧

### バックエンド
- `server/bonus-engine.ts` - 条件評価関数追加、バグ修正
- `server/routes.ts` - BonusCalculationContext に Phase 2-A フィールド追加
- `shared/schema.ts` - patients/nursing_records テーブルにフィールド追加

### フロントエンド
- `client/src/components/PatientDetail.tsx` - 患者情報画面に日付フィールド追加
- `client/src/components/RecordDetail.tsx` - 訪問記録画面に記録フラグ追加
- `client/src/components/BonusMasterManagement.tsx` - 適用条件表示機能追加

### データベース
- `bonus_master` テーブル - Phase 2-A 加算4件を登録/更新

---

## 📝 次のステップ

### 優先度: 高
1. **早朝・夜間訪問加算の実装** - 基本報酬の取得機能が必要
2. **Phase 2-B: 患者状態・記録系加算** - 8項目（設計書参照）
3. **Phase 2-C: 看護師資格・研修系加算** - 3項目（設計書参照）

### 優先度: 中
4. **加算マスタ管理画面の改善** - predefined_conditions の編集UI
5. **訪問記録画面の改善** - 記録フラグの自動推論機能

### 優先度: 低
6. **ドキュメント整備** - 加算適用条件の一覧表作成
7. **テストケース拡充** - エッジケースのテスト追加

---

## 🎓 学んだこと

1. **値比較ロジックは明示的に**: 条件一致時は必ず `return { passed: true }` を返す
2. **フィールド名の統一**: pattern/type の両方をサポートすることで後方互換性を確保
3. **併算定ルールの重要性**: can_combine_with の設定が加算適用に直接影響
4. **ユーザー視点のUI**: 技術用語を排除し、実際の画面操作と紐付けた表現が重要
5. **デバッグログの活用**: 条件評価の流れを追跡できるログが問題解決の鍵

---

**作成者**: Claude Code
**最終更新**: 2025-10-24


