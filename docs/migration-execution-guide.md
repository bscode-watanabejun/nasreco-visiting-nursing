# サービスコードマスタ移行 実行手順書

## 📋 実行前の確認事項

### 必須確認項目
- [ ] バックアップが取得されているか
- [ ] 影響範囲の最終確認が完了しているか（訪問記録9件、患者2人）
- [ ] 移行計画書を確認したか
- [ ] 承認が取得されているか
- [ ] 実行時間が決定しているか（推奨: 業務時間外）

### 環境変数の設定
```bash
export PRODUCTION_DB_URL="postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require"
```

## 🚀 実行手順

### 方法1: 統合スクリプトで一括実行（推奨）

```bash
# 1. 環境変数を設定
export PRODUCTION_DB_URL="postgresql://..."

# 2. 統合スクリプトを実行
npx tsx scripts/run-full-migration.ts
```

**注意**: 統合スクリプトは各フェーズを順番に実行します。エラーが発生した場合は中断されます。

### 方法2: 各フェーズを個別に実行

#### ステップ1: バックアップ取得（手動実行）

```sql
-- 本番環境で直接実行
CREATE TABLE nursing_service_codes_backup_20251115 AS 
SELECT * FROM nursing_service_codes;

CREATE TABLE nursing_records_backup_20251115 AS 
SELECT * FROM nursing_records WHERE service_code_id IS NOT NULL;
```

#### ステップ2: フェーズ1実行

```bash
npx tsx scripts/migrate-service-codes-to-production.ts
```

**確認事項**:
- 正しいコード（51から始まる）が追加されたか
- 既存のコード（31から始まる）が保持されているか

#### ステップ3: フェーズ2実行

```bash
npx tsx scripts/update-service-code-references.ts
```

**確認事項**:
- 訪問記録のサービスコードIDが正しく更新されたか（9件）
- 整合性チェックが成功したか

#### ステップ4: フェーズ3実行

```bash
npx tsx scripts/deactivate-wrong-service-codes.ts
```

**確認事項**:
- 誤ったコード（31から始まる）が無効化されたか（21件）
- 参照が残っていないか（0件）

#### ステップ5: 検証実行

```bash
npx tsx scripts/verify-migration.ts
```

**確認事項**:
- すべてのチェックが成功したか
- エラーが検出されなかったか

## 🔍 実行後の確認

### 1. データベースでの確認

```sql
-- 正しいコードが追加されているか確認
SELECT COUNT(*) FROM nursing_service_codes 
WHERE service_code LIKE '51%' AND is_active = true;
-- → 46件程度であることを確認

-- 誤ったコードが無効化されているか確認
SELECT COUNT(*) FROM nursing_service_codes 
WHERE service_code LIKE '31%' AND is_active = true;
-- → 0件であることを確認

-- 訪問記録のサービスコードIDが正しく更新されているか確認
SELECT 
  nr.id,
  nsc.service_code,
  nsc.service_name
FROM nursing_records nr
LEFT JOIN nursing_service_codes nsc ON nr.service_code_id = nsc.id
WHERE nr.service_code_id IS NOT NULL
LIMIT 10;
-- → すべて510000110などの正しいコードであることを確認
```

### 2. アプリケーションでの確認

- [ ] 訪問記録画面でサービスコードが正しく表示されるか
- [ ] サービスコードの名称が正しいか（`510000110` → `訪問看護基本療養費１...`）
- [ ] サービスコードの選択が正常に動作するか
- [ ] 月次レセプト作成時に正しいサービスコードが使用されるか

## 🔄 ロールバック手順

### 各フェーズのロールバック

#### フェーズ2のロールバック（参照更新の取り消し）

```sql
BEGIN;

UPDATE nursing_records
SET service_code_id = 'a4d94b8d-dce7-43f5-b574-a189eac8c203'
WHERE service_code_id = 'f9940fce-d0fb-47f4-a4ee-e06b7e2664a2';

COMMIT;
```

#### フェーズ1のロールバック（追加したコードの削除）

```sql
BEGIN;

DELETE FROM nursing_service_codes
WHERE service_code LIKE '51%'
AND id NOT IN (
  SELECT DISTINCT service_code_id 
  FROM nursing_records 
  WHERE service_code_id IS NOT NULL
);

COMMIT;
```

#### フェーズ3のロールバック（無効化の取り消し）

```sql
BEGIN;

UPDATE nursing_service_codes
SET is_active = true
WHERE service_code LIKE '31%';

COMMIT;
```

### 完全ロールバック（バックアップからの復元）

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

## ⚠️ トラブルシューティング

### エラー1: 外部キー制約違反

**症状**: `foreign key constraint violation`

**原因**: 参照先のコードIDが存在しない

**対処**:
1. フェーズ1が正常に完了したか確認
2. 正しいコードIDがマスタに存在するか確認
3. 必要に応じてフェーズ1を再実行

### エラー2: 参照が残っている

**症状**: フェーズ3で「参照が残っている」エラー

**原因**: フェーズ2が正常に完了していない

**対処**:
1. フェーズ2を再実行
2. 参照更新が正常に完了したか確認
3. 必要に応じて手動で参照を更新

### エラー3: トランザクションタイムアウト

**症状**: `transaction timeout`

**原因**: 処理時間が長すぎる

**対処**:
1. バッチサイズを小さくする（現在は9件なので問題なし）
2. タイムアウト時間を延長
3. 個別に実行する

## 📞 サポート

問題が発生した場合:
1. エラーメッセージを確認
2. ロールバック手順を実行
3. システム管理者に連絡

## 📝 実行記録

実行日時: _______________

実行者: _______________

実行結果:
- [ ] 成功
- [ ] 失敗（理由: _______________）

備考:
_________________________________

