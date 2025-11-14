# 本番環境サービスコードマスタ入れ替え 最終移行計画書

## 📋 実行サマリー

- **移行対象**: サービスコードマスタ（`nursing_service_codes`）
- **影響範囲**: 訪問記録 9件、患者 2人
- **実行時間**: 約45分（バックアップ含む）
- **リスクレベル**: 低（月次レセプト未作成のため）

## 1. 移行対象データの詳細

### 1.1 使用されているサービスコードID

| 誤ったコードID | サービスコード | サービス名称 | 使用件数 | 正しいコードID | 正しいコード |
|--------------|--------------|------------|---------|--------------|------------|
| `a4d94b8d-dce7-43f5-b574-a189eac8c203` | 311000110 | 訪問看護基本療養費（Ⅰ）週3日まで | 9件 | `f9940fce-d0fb-47f4-a4ee-e06b7e2664a2` | 510000110 |

### 1.2 影響を受ける訪問記録

- **総件数**: 9件
- **患者数**: 2人
  - 祓川 チカさん: 7件
  - 小川 照子さん: 2件
- **訪問期間**: 2025年11月9日～11月14日
- **ステータス**: 確定済み 5件、下書き 4件

### 1.3 誤ったコード一覧（31から始まる）

本番環境には21件の誤ったコードが存在しますが、実際に使用されているのは1件のみです。

## 2. 移行手順（詳細）

### ステップ1: バックアップ取得

```sql
-- 1. サービスコードマスタのバックアップ
CREATE TABLE nursing_service_codes_backup_20251115 AS 
SELECT * FROM nursing_service_codes;

-- 2. 訪問記録のバックアップ（サービスコードIDが設定されているもの）
CREATE TABLE nursing_records_backup_20251115 AS 
SELECT * FROM nursing_records WHERE service_code_id IS NOT NULL;

-- 3. 加算計算履歴のバックアップ（念のため）
CREATE TABLE bonus_calculation_history_backup_20251115 AS 
SELECT * FROM bonus_calculation_history WHERE service_code_id IS NOT NULL;
```

**実行時間**: 約5分

### ステップ2: 正しいサービスコードマスタの追加

**目的**: 開発環境から正しいコード（51から始まる）を本番環境に追加

**実行スクリプト**: `scripts/migrate-service-codes-to-production.ts`

**実行内容**:
1. 開発環境から正しいコード（51から始まる、`is_active = true`）を取得
2. 本番環境に既に存在するかチェック（`service_code`で判定）
3. 存在しない場合のみ追加（IDは開発環境のものをそのまま使用）

**期待結果**:
- 追加されるコード数: 約46件（51から始まるコード）
- 既存のコード（31から始まる）は保持

**実行時間**: 約10分

### ステップ3: 訪問記録の参照更新

**目的**: 誤ったサービスコードIDを正しいサービスコードIDに更新

**実行スクリプト**: `scripts/update-service-code-references.ts`

**実行内容**:
```sql
BEGIN;

-- 1. 更新対象の確認（9件であることを確認）
SELECT COUNT(*) FROM nursing_records 
WHERE service_code_id = 'a4d94b8d-dce7-43f5-b574-a189eac8c203';
-- → 9件

-- 2. 参照更新
UPDATE nursing_records
SET service_code_id = 'f9940fce-d0fb-47f4-a4ee-e06b7e2664a2'
WHERE service_code_id = 'a4d94b8d-dce7-43f5-b574-a189eac8c203';

-- 3. 更新件数の確認（9件であることを確認）
SELECT COUNT(*) FROM nursing_records 
WHERE service_code_id = 'f9940fce-d0fb-47f4-a4ee-e06b7e2664a2';
-- → 9件

-- 4. 整合性チェック（参照先が存在することを確認）
SELECT COUNT(*) FROM nursing_records nr
LEFT JOIN nursing_service_codes nsc ON nr.service_code_id = nsc.id
WHERE nr.service_code_id IS NOT NULL AND nsc.id IS NULL;
-- → 0件

COMMIT;
```

**マッピングテーブル**:
```typescript
const SERVICE_CODE_ID_MAPPING: Record<string, string> = {
  // 311000110 (訪問看護基本療養費（Ⅰ）週3日まで) → 510000110
  'a4d94b8d-dce7-43f5-b574-a189eac8c203': 'f9940fce-d0fb-47f4-a4ee-e06b7e2664a2',
};
```

**期待結果**:
- 更新件数: 9件
- 整合性エラー: 0件

**実行時間**: 約5分

### ステップ4: データ整合性チェック

**実行スクリプト**: `scripts/verify-migration.ts`

**チェック項目**:

1. **参照整合性チェック**
```sql
-- 訪問記録のサービスコードIDがマスタに存在するか
SELECT COUNT(*) FROM nursing_records nr
LEFT JOIN nursing_service_codes nsc ON nr.service_code_id = nsc.id
WHERE nr.service_code_id IS NOT NULL AND nsc.id IS NULL;
-- → 0件であることを確認
```

2. **加算計算履歴の参照整合性チェック**
```sql
-- 加算計算履歴のサービスコードIDがマスタに存在するか
SELECT COUNT(*) FROM bonus_calculation_history bch
LEFT JOIN nursing_service_codes nsc ON bch.service_code_id = nsc.id
WHERE bch.service_code_id IS NOT NULL AND nsc.id IS NULL;
-- → 0件であることを確認
```

3. **サービスコードの状態確認**
```sql
-- 正しいコード（51から始まる）が有効か
SELECT COUNT(*) FROM nursing_service_codes 
WHERE service_code LIKE '51%' AND is_active = true;
-- → 46件程度であることを確認

-- 誤ったコード（31から始まる）がまだ有効か（後で無効化するため）
SELECT COUNT(*) FROM nursing_service_codes 
WHERE service_code LIKE '31%' AND is_active = true;
-- → 21件であることを確認
```

**実行時間**: 約5分

### ステップ5: 誤ったコードの無効化

**目的**: 31から始まる誤ったコードを無効化（履歴保持のため削除ではなく無効化）

**実行スクリプト**: `scripts/deactivate-wrong-service-codes.ts`

**実行内容**:
```sql
BEGIN;

-- 1. 無効化対象の確認（21件であることを確認）
SELECT COUNT(*) FROM nursing_service_codes 
WHERE service_code LIKE '31%' AND is_active = true;
-- → 21件

-- 2. 参照が残っていないか確認（0件であることを確認）
SELECT COUNT(*) FROM nursing_records 
WHERE service_code_id IN (
  SELECT id FROM nursing_service_codes WHERE service_code LIKE '31%'
);
-- → 0件

-- 3. 無効化実行
UPDATE nursing_service_codes
SET is_active = false
WHERE service_code LIKE '31%' AND is_active = true;

-- 4. 無効化件数の確認（21件であることを確認）
SELECT COUNT(*) FROM nursing_service_codes 
WHERE service_code LIKE '31%' AND is_active = false;
-- → 21件

COMMIT;
```

**期待結果**:
- 無効化件数: 21件
- 参照エラー: 0件

**実行時間**: 約5分

### ステップ6: 最終検証

**実行スクリプト**: `scripts/verify-migration.ts`

**検証項目**:
1. 訪問記録のサービスコードIDが正しく更新されているか
2. サービスコードマスタに正しいコードが存在するか
3. 誤ったコードが無効化されているか
4. 外部キー制約が正しく機能しているか

**実行時間**: 約5分

## 3. ロールバック計画

### 3.1 各ステップのロールバック

#### ステップ3のロールバック（参照更新の取り消し）
```sql
BEGIN;

UPDATE nursing_records
SET service_code_id = 'a4d94b8d-dce7-43f5-b574-a189eac8c203'
WHERE service_code_id = 'f9940fce-d0fb-47f4-a4ee-e06b7e2664a2';

COMMIT;
```

#### ステップ2のロールバック（追加したコードの削除）
```sql
BEGIN;

-- 参照されていない正しいコード（51から始まる）を削除
DELETE FROM nursing_service_codes
WHERE service_code LIKE '51%'
AND id NOT IN (
  SELECT DISTINCT service_code_id 
  FROM nursing_records 
  WHERE service_code_id IS NOT NULL
);

COMMIT;
```

#### ステップ5のロールバック（無効化の取り消し）
```sql
BEGIN;

UPDATE nursing_service_codes
SET is_active = true
WHERE service_code LIKE '31%';

COMMIT;
```

### 3.2 完全ロールバック（バックアップからの復元）

```sql
BEGIN;

-- サービスコードマスタの復元
TRUNCATE TABLE nursing_service_codes;
INSERT INTO nursing_service_codes 
SELECT * FROM nursing_service_codes_backup_20251115;

-- 訪問記録の復元（サービスコードIDのみ）
UPDATE nursing_records nr
SET service_code_id = backup.service_code_id
FROM nursing_records_backup_20251115 backup
WHERE nr.id = backup.id;

COMMIT;
```

## 4. 実行チェックリスト

### 4.1 事前準備
- [ ] バックアップ取得
- [ ] 影響範囲の最終確認（訪問記録9件、患者2人）
- [ ] 移行スクリプトの動作確認
- [ ] ロールバック手順の確認
- [ ] 承認取得

### 4.2 移行実行
- [ ] ステップ1: バックアップ取得
- [ ] ステップ2: 正しいサービスコードマスタの追加
- [ ] ステップ3: 訪問記録の参照更新
- [ ] ステップ4: データ整合性チェック
- [ ] ステップ5: 誤ったコードの無効化
- [ ] ステップ6: 最終検証

### 4.3 移行後検証
- [ ] 訪問記録画面でサービスコードが正しく表示されるか
- [ ] サービスコードの名称が正しいか（510000110 → 訪問看護基本療養費１...）
- [ ] 月次レセプト作成時に正しいサービスコードが使用されるか
- [ ] エラーログの確認

## 5. 実行タイムライン

**推奨実行時間**: 業務時間外（22:00～22:45）

```
22:00 - 22:05  バックアップ取得（5分）
22:05 - 22:15  ステップ2: マスタ追加（10分）
22:15 - 22:20  ステップ3: 参照更新（5分）
22:20 - 22:25  ステップ4: 整合性チェック（5分）
22:25 - 22:30  ステップ5: 無効化（5分）
22:30 - 22:35  ステップ6: 最終検証（5分）
22:35          完了
```

## 6. リスクと対策

| リスク | 影響度 | 発生確率 | 対策 |
|--------|--------|---------|------|
| データ移行中のエラー | 高 | 低 | トランザクション使用、バックアップ取得 |
| サービスコードIDの更新漏れ | 中 | 低 | 事前に影響範囲を確認、更新後の検証 |
| 外部キー制約違反 | 高 | 低 | 参照を先に更新してからマスタを更新 |
| 月次レセプトへの影響 | 低 | 低 | 月次レセプト未作成のため影響なし |

## 7. 承認と実行

### 7.1 承認者
- [ ] システム管理者
- [ ] 業務責任者

### 7.2 実行者
- システム管理者（技術的な実行）
- 業務責任者（業務的な確認）

## 8. 次のステップ

1. **移行スクリプトの作成**
   - `scripts/migrate-service-codes-to-production.ts`
   - `scripts/update-service-code-references.ts`
   - `scripts/deactivate-wrong-service-codes.ts`
   - `scripts/verify-migration.ts`

2. **テスト環境での検証**
   - テスト環境で移行スクリプトを実行
   - 各ステップの動作確認
   - ロールバック手順の確認

3. **本番環境での実行**
   - 承認取得後、本番環境で実行
   - 各ステップごとに検証
   - 最終検証の実施

