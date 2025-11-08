# Phase 2 実装設計書

Phase 2で実装する20項目の加算に必要なデータベーススキーマ拡張と条件評価ロジックの詳細設計。

---

## 📋 目次

1. [対象加算項目（20項目）](#対象加算項目20項目)
2. [データベーススキーマ拡張](#データベーススキーマ拡張)
3. [条件評価ロジック追加](#条件評価ロジック追加)
4. [UI拡張](#ui拡張)
5. [実装手順](#実装手順)

---

## 対象加算項目（20項目）

### 施設体制フラグ系（4項目）

| # | 加算名 | 加算コード | 必要な条件 |
|---|--------|-----------|----------|
| 1 | 24時間対応体制加算 | `medical_24h_support_basic` | `has_24h_support_system` |
| 2 | 24時間対応体制加算（看護負担軽減） | `medical_24h_support_enhanced` | `has_24h_support_system_enhanced` |
| 3 | 緊急時訪問看護加算（介護I） | `care_emergency_system` | `has_emergency_support_system` |
| 4 | 緊急時訪問看護加算（介護II） | `care_emergency_system_2` | `has_emergency_support_system_enhanced` |

### 患者状態・記録系（8項目）

| # | 加算名 | 加算コード | 必要な条件 |
|---|--------|-----------|----------|
| 5 | 退院時共同指導加算 | `medical_discharge_joint_guidance` | `is_discharge_guidance` |
| 6 | 退院支援指導加算（基本） | `medical_discharge_support_basic` | `is_discharge_date` |
| 7 | 退院支援指導加算（長時間） | `medical_discharge_support_long` | `is_discharge_date` + 90分超 |
| 8 | 在宅連携指導加算 | `medical_home_coordination` | `has_collaboration_record` |
| 9 | 在宅患者緊急時カンファレンス | `medical_emergency_conference` | `has_conference_record` |
| 10 | 精神科重症患者支援管理連携加算（月2回） | `psychiatric_support_5800` | 精神科訪問 + 連携記録 |
| 11 | 精神科重症患者支援管理連携加算（週2回） | `psychiatric_support_8400` | 精神科訪問 + 連携記録 |
| 12 | 看護・介護職員連携強化加算 | `medical_nursing_care_collaboration` | `has_sputum_suction_plan` |

### 看護師資格・研修系（3項目）

| # | 加算名 | 加算コード | 必要な条件 |
|---|--------|-----------|----------|
| 13 | 専門管理加算 | `medical_specialist_management` | `nurse_has_specialized_training` |
| 14 | 専門管理加算（介護） | `care_specialist_management` | `nurse_has_specialized_training` |
| 15 | 遠隔死亡診断補助加算 | `medical_remote_death_diagnosis` | `nurse_has_remote_death_training` |

### 初回訪問・新規計画系（2項目）

| # | 加算名 | 加算コード | 必要な条件 |
|---|--------|-----------|----------|
| 16 | 初回加算I（介護） | `care_initial_visit_1` | `is_discharge_date_first_visit` |
| 17 | 初回加算II（介護） | `care_initial_visit_2` | `is_new_plan_first_visit` |

### 複雑な時間・回数判定系（3項目）

| # | 加算名 | 加算コード | 必要な条件 |
|---|--------|-----------|----------|
| 18 | 長時間訪問看護加算（介護） | `care_long_visit` | 1時間以上〜1.5時間未満 |
| 19 | 複数名訪問加算（介護） | `care_multiple_staff_1/2` | 同行職種の記録 |
| 20 | サービス提供体制強化加算 | `care_service_system_1/2` | 勤続年数3年/7年以上の職員比率 |

---

## データベーススキーマ拡張

### 1. 施設マスタ（facilities テーブル）

施設の体制情報を記録するフィールドを追加。

```typescript
// shared/schema.ts - facilities テーブルに追加

export const facilities = pgTable("facilities", {
  // ... 既存フィールド ...

  // Phase 2: 施設体制フラグ
  has24hSupportSystem: boolean("has_24h_support_system").default(false),
  has24hSupportSystemEnhanced: boolean("has_24h_support_system_enhanced").default(false),
  hasEmergencySupportSystem: boolean("has_emergency_support_system").default(false),
  hasEmergencySupportSystemEnhanced: boolean("has_emergency_support_system_enhanced").default(false),

  // 看護業務負担軽減の取り組み（JSON配列）
  // 例: ["night_shift_interval", "consecutive_limit", "calendar_holiday", "ict_ai_iot", "support_system"]
  burdenReductionMeasures: json("burden_reduction_measures"),

  // ... 既存フィールド ...
});
```

### 2. 訪問記録（nursingRecords テーブル）

訪問時の記録フラグを追加。

```typescript
// shared/schema.ts - nursingRecords テーブルに追加

export const nursingRecords = pgTable("nursing_records", {
  // ... 既存フィールド ...

  // Phase 2: 記録フラグ
  isDischargeGuidance: boolean("is_discharge_guidance").default(false),           // 退院時共同指導実施
  isDischargeDate: boolean("is_discharge_date").default(false),                   // 退院日当日訪問
  hasCollaborationRecord: boolean("has_collaboration_record").default(false),     // 連携記録あり
  hasConferenceRecord: boolean("has_conference_record").default(false),           // カンファレンス実施
  hasSputumSuctionPlan: boolean("has_sputum_suction_plan").default(false),       // 喀痰吸引計画書あり
  isPsychiatricVisit: boolean("is_psychiatric_visit").default(false),            // 精神科訪問
  isFirstVisitOfPlan: boolean("is_first_visit_of_plan").default(false),         // 新規計画初回訪問

  // 同行職種記録（JSON配列）
  // 例: [{"role": "nurse", "name": "山田花子"}, {"role": "assistant", "name": "佐藤太郎"}]
  accompanyingStaff: json("accompanying_staff"),

  // ... 既存フィールド ...
});
```

### 3. ユーザー（users テーブル）

看護師の資格・研修情報を追加。

```typescript
// shared/schema.ts - users テーブルに追加

export const users = pgTable("users", {
  // ... 既存フィールド ...

  // Phase 2: 資格・研修情報
  hasSpecializedTraining: json("has_specialized_training"),        // 専門研修修了（配列）
  // 例: ["palliative", "wound", "stoma", "specific_acts"]
  // - palliative: 緩和ケア
  // - wound: 褥瘡ケア
  // - stoma: 人工肛門・人工膀胱ケア
  // - specific_acts: 特定行為研修

  hasRemoteDeathTraining: boolean("has_remote_death_training").default(false),    // ICT遠隔死亡診断研修修了
  tenureYears: integer("tenure_years").default(0),                                 // 勤続年数
  hireDate: date("hire_date"),                                                     // 入社日

  // ... 既存フィールド ...
});
```

### 4. 患者マスタ（patients テーブル）

退院日・新規計画日を追加。

```typescript
// shared/schema.ts - patients テーブルに追加

export const patients = pgTable("patients", {
  // ... 既存フィールド ...

  // Phase 2: 退院・計画情報
  lastDischargeDate: date("last_discharge_date"),           // 直近の退院日
  lastPlanCreatedDate: date("last_plan_created_date"),      // 直近の訪問看護計画作成日
  isPsychiatricPatient: boolean("is_psychiatric_patient").default(false),   // 精神科患者

  // ... 既存フィールド ...
});
```

---

## 条件評価ロジック追加

### bonus-engine.ts に追加する条件タイプ

#### 1. 施設体制フラグ判定

```typescript
// evaluateHas24hSupportSystem
// 施設の24時間対応体制を判定
function evaluateHas24hSupportSystem(
  context: BonusCalculationContext
): ConditionEvaluationResult {
  const facility = await db.query.facilities.findFirst({
    where: eq(facilities.id, context.facilityId)
  });

  return {
    passed: facility?.has24hSupportSystem || false,
    reason: facility?.has24hSupportSystem
      ? "24時間対応体制あり"
      : "24時間対応体制なし"
  };
}

// evaluateHas24hSupportSystemEnhanced
// 看護業務負担軽減の取り組みを含む24時間対応体制を判定
function evaluateHas24hSupportSystemEnhanced(
  context: BonusCalculationContext
): ConditionEvaluationResult {
  const facility = await db.query.facilities.findFirst({
    where: eq(facilities.id, context.facilityId)
  });

  // 看護業務負担軽減の取り組みが2項目以上あるか確認
  const measures = facility?.burdenReductionMeasures || [];
  const hasSufficientMeasures = Array.isArray(measures) && measures.length >= 2;

  return {
    passed: facility?.has24hSupportSystemEnhanced && hasSufficientMeasures,
    reason: `24時間対応体制（強化）: ${hasSufficientMeasures ? "○" : "×"}`
  };
}
```

#### 2. 退院日判定

```typescript
// evaluateIsDischargeDate
// 訪問日が退院日当日かを判定
function evaluateIsDischargeDate(
  context: BonusCalculationContext
): ConditionEvaluationResult {
  const patient = await db.query.patients.findFirst({
    where: eq(patients.id, context.patientId)
  });

  const visitDate = context.visitDate.toISOString().split('T')[0];
  const isDischargeDate = patient?.lastDischargeDate === visitDate;

  return {
    passed: isDischargeDate,
    reason: isDischargeDate ? "退院日当日の訪問" : "退院日以外の訪問"
  };
}
```

#### 3. 記録フラグ判定

```typescript
// evaluateHasCollaborationRecord
// 連携記録の有無を判定
function evaluateHasCollaborationRecord(
  recordData: any
): ConditionEvaluationResult {
  return {
    passed: recordData.hasCollaborationRecord === true,
    reason: recordData.hasCollaborationRecord
      ? "連携記録あり"
      : "連携記録なし"
  };
}

// evaluateHasConferenceRecord
// カンファレンス記録の有無を判定
function evaluateHasConferenceRecord(
  recordData: any
): ConditionEvaluationResult {
  return {
    passed: recordData.hasConferenceRecord === true,
    reason: recordData.hasConferenceRecord
      ? "カンファレンス記録あり"
      : "カンファレンス記録なし"
  };
}
```

#### 4. 看護師資格・研修判定

```typescript
// evaluateNurseSpecializedTraining
// 看護師の専門研修修了を判定
async function evaluateNurseSpecializedTraining(
  requiredTraining: string,  // "palliative" | "wound" | "stoma" | "specific_acts"
  context: BonusCalculationContext
): Promise<ConditionEvaluationResult> {
  const nurse = await db.query.users.findFirst({
    where: eq(users.id, context.nurseId)
  });

  const trainings = nurse?.hasSpecializedTraining || [];
  const hasTraining = Array.isArray(trainings) && trainings.includes(requiredTraining);

  const trainingNames = {
    palliative: "緩和ケア研修",
    wound: "褥瘡ケア研修",
    stoma: "人工肛門・人工膀胱ケア研修",
    specific_acts: "特定行為研修"
  };

  return {
    passed: hasTraining,
    reason: hasTraining
      ? `${trainingNames[requiredTraining]}修了`
      : `${trainingNames[requiredTraining]}未修了`
  };
}
```

#### 5. 勤続年数判定

```typescript
// evaluateTenureYears
// 勤続年数を判定
async function evaluateTenureYears(
  minYears: number,
  context: BonusCalculationContext
): Promise<ConditionEvaluationResult> {
  const nurse = await db.query.users.findFirst({
    where: eq(users.id, context.nurseId)
  });

  const tenureYears = nurse?.tenureYears || 0;
  const passed = tenureYears >= minYears;

  return {
    passed,
    reason: passed
      ? `勤続${tenureYears}年 (${minYears}年以上)`
      : `勤続${tenureYears}年 (${minYears}年未満)`
  };
}
```

#### 6. 初回訪問判定

```typescript
// evaluateIsFirstVisitOfPlan
// 新規計画初回訪問を判定
function evaluateIsFirstVisitOfPlan(
  recordData: any
): ConditionEvaluationResult {
  return {
    passed: recordData.isFirstVisitOfPlan === true,
    reason: recordData.isFirstVisitOfPlan
      ? "新規計画初回訪問"
      : "新規計画初回訪問ではない"
  };
}
```

#### 7. 同行職種判定

```typescript
// evaluateAccompanyingStaff
// 同行職種を判定
function evaluateAccompanyingStaff(
  requiredRole: string,  // "nurse" | "assistant" | "therapist"
  recordData: any
): ConditionEvaluationResult {
  const staff = recordData.accompanyingStaff || [];
  const hasRequiredRole = Array.isArray(staff) &&
                          staff.some(s => s.role === requiredRole);

  return {
    passed: hasRequiredRole,
    reason: hasRequiredRole
      ? `同行職種: ${requiredRole}`
      : `同行職種なし`
  };
}
```

---

## UI拡張

### 1. 施設管理画面

**追加項目**:
- ✅ 24時間対応体制加算（基本）
- ✅ 24時間対応体制加算（看護業務負担軽減）
- ✅ 緊急時訪問看護加算（介護）
- ✅ 看護業務負担軽減の取り組み選択（複数選択）
  - 夜間対応翌日の勤務間隔確保
  - 夜間対応の連続回数制限（2連続まで）
  - 夜間対応後の暦日休日確保
  - 夜間勤務ニーズを踏まえた勤務体制
  - ICT、AI、IoT等の活用
  - 電話連絡・相談担当者への支援体制

### 2. 訪問記録作成・編集画面

**追加項目**:
- ✅ 退院時共同指導実施（チェックボックス）
- ✅ 退院日当日訪問（チェックボックス）
- ✅ 連携記録あり（チェックボックス）
- ✅ カンファレンス実施（チェックボックス）
- ✅ 喀痰吸引計画書あり（チェックボックス）
- ✅ 精神科訪問（チェックボックス）
- ✅ 新規計画初回訪問（チェックボックス）
- ✅ 同行職種記録（複数追加可能）
  - 職種選択（看護師、准看護師、看護補助者、PT、OT、ST）
  - 氏名入力

### 3. 看護師管理画面

**追加項目**:
- ✅ 専門研修修了（複数選択）
  - 緩和ケア研修
  - 褥瘡ケア研修
  - 人工肛門・人工膀胱ケア研修
  - 特定行為研修
- ✅ ICT遠隔死亡診断研修修了（チェックボックス）
- ✅ 入社日（日付選択）
- ✅ 勤続年数（自動計算・手動修正可能）

### 4. 患者管理画面

**追加項目**:
- ✅ 直近の退院日（日付選択）
- ✅ 直近の訪問看護計画作成日（日付選択）
- ✅ 精神科患者（チェックボックス）

---

## 実装手順

**実装進捗状況**: Phase2-1（施設体制フラグ系4項目）完了 ✅

### Phase2-1: 施設体制フラグ系（4項目）✅ 完了 - 2025-10-22

**完了内容:**
1. ✅ スキーマ拡張: `facilities`テーブルに5フィールド追加
2. ✅ 条件評価ロジック: 4項目の評価関数実装
3. ✅ 加算マスタ設定: predefinedConditions設定完了
4. ✅ UI実装: 施設管理画面に設定UI追加
5. ✅ 併算定制御: cannotCombineWith + 点数降順ソート
6. ✅ テスト完了: 全6テストケース成功

**実装済み加算:**
- 24時間対応体制加算（医療保険 6,520点）
- 24時間対応体制加算（看護業務負担軽減）（医療保険 6,800点）
- 緊急時訪問看護加算（I）（介護保険 574単位）
- 緊急時訪問看護加算（II）（介護保険 574単位）

**詳細**: [Phase2-1テスト手順書.md](./Phase2-1テスト手順書.md)

---

### Phase2-2: 患者状態・記録系（8項目）⏳ 未着手

### Phase2-3: 看護師資格・研修系（3項目）⏳ 未着手

### Phase2-4: 初回訪問・新規計画系（2項目）⏳ 未着手

### Phase2-5: 複雑な時間・回数判定系（3項目）⏳ 未着手

---

### ステップ1: スキーマ変更（1週間）

1. **shared/schema.ts の修正**
   - facilitiesテーブルにフィールド追加
   - nursingRecordsテーブルにフィールド追加
   - usersテーブルにフィールド追加
   - patientsテーブルにフィールド追加

2. **マイグレーション実行**
   ```bash
   npm run db:push
   ```

3. **バリデーションスキーマ更新**
   - insertUserSchema に専門研修フィールド追加
   - insertNursingRecordSchema に記録フラグ追加
   - updateFacilitySchema に体制フラグ追加

### ステップ2: 条件評価ロジック追加（1週間）

1. **server/bonus-engine.ts に条件評価関数を追加**
   - evaluateHas24hSupportSystem
   - evaluateIsDischargeDate
   - evaluateHasCollaborationRecord
   - evaluateNurseSpecializedTraining
   - evaluateTenureYears
   - 他13種類の条件評価関数

2. **evaluatePredefinedCondition にケースを追加**
   ```typescript
   case "has_24h_support_system":
     return evaluateHas24hSupportSystem(context);
   case "is_discharge_date":
     return evaluateIsDischargeDate(context);
   // ...
   ```

### ステップ3: 加算マスタシードデータ作成（2〜3日）

1. **server/seed-bonus-master-phase2.ts を作成**
   - 20項目の加算マスタデータを定義
   - predefinedConditions に新しい条件タイプを使用

2. **package.json にスクリプト追加**
   ```json
   "db:seed:bonus-phase2": "tsx server/seed-bonus-master-phase2.ts"
   ```

### ステップ4: UI拡張（3〜4日）

1. **施設管理画面の修正**
   - FacilityForm.tsx に体制フラグ入力欄を追加
   - 看護業務負担軽減の取り組み選択UI追加

2. **訪問記録画面の修正**
   - NursingRecordForm.tsx に記録フラグ入力欄を追加
   - 同行職種記録UI追加

3. **看護師管理画面の修正**
   - UserForm.tsx に専門研修選択欄を追加
   - 勤続年数計算ロジック追加

4. **患者管理画面の修正**
   - PatientForm.tsx に退院日・計画日入力欄を追加

### ステップ5: テストと動作確認（2〜3日）

1. **単体テスト**
   - 各条件評価関数の動作確認
   - スキーマ変更の影響確認

2. **統合テスト**
   - 訪問記録作成時の加算自動計算
   - UI入力からデータベース保存まで

3. **実際の使用ケースでテスト**
   - 24時間対応体制加算の算定
   - 退院時共同指導加算の算定
   - 専門管理加算の算定

---

## 📊 実装スケジュール

| ステップ | 作業内容 | 期間 |
|---------|---------|------|
| ステップ1 | スキーマ変更 | 1週間 |
| ステップ2 | 条件評価ロジック追加 | 1週間 |
| ステップ3 | 加算マスタシードデータ | 2〜3日 |
| ステップ4 | UI拡張 | 3〜4日 |
| ステップ5 | テスト・動作確認 | 2〜3日 |
| **合計** | | **2〜3週間** |

---

**作成日**: 2025年10月22日
**対象**: Phase 2 - 20項目の加算実装


