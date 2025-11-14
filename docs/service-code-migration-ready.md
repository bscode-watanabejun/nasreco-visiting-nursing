# サービスコードマスタ入れ替え 実行準備完了

## 📋 実行準備状況

### ✅ 準備完了項目

1. **移行スクリプトの作成**
   - ✅ `scripts/migrate-service-codes-to-production.ts` - フェーズ1: 正しいコードの追加
   - ✅ `scripts/update-service-code-references.ts` - フェーズ2: 参照の更新
   - ✅ `scripts/deactivate-wrong-service-codes.ts` - フェーズ3: 誤ったコードの無効化
   - ✅ `scripts/verify-migration.ts` - 検証スクリプト
   - ✅ `scripts/run-full-migration.ts` - 統合スクリプト

2. **移行計画書の作成**
   - ✅ `docs/migration-plan-service-codes-final.md` - 最終移行計画書
   - ✅ `docs/migration-execution-guide.md` - 実行手順書

3. **影響範囲の確認**
   - ✅ 訪問記録: 9件（患者2人）
   - ✅ 月次レセプト: 0件（未作成のため影響なし）
   - ✅ サービスコードマスタ: 21件（31から始まる誤ったコード）

## 🚀 実行手順

### 方法1: 統合スクリプトで一括実行（推奨）

```bash
# 1. 環境変数を設定
export PRODUCTION_DB_URL="postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require"

# 2. 統合スクリプトを実行
npx tsx scripts/run-full-migration.ts
```

### 方法2: 各フェーズを個別に実行

```bash
# 1. 環境変数を設定
export PRODUCTION_DB_URL="postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require"

# 2. フェーズ1: 正しいコードの追加
npx tsx scripts/migrate-service-codes-to-production.ts

# 3. フェーズ2: 参照の更新
npx tsx scripts/update-service-code-references.ts

# 4. フェーズ3: 誤ったコードの無効化
npx tsx scripts/deactivate-wrong-service-codes.ts

# 5. 検証
npx tsx scripts/verify-migration.ts
```

## ⚠️ 実行前の確認事項

### 必須確認項目

- [ ] **Replitからの再デプロイが完了しているか**
  - デプロイが正常に完了しているか確認
  - アプリケーションが正常に動作しているか確認

- [ ] **バックアップの取得**
  - 本番環境のデータベースバックアップを取得
  - 特に重要なデータ（nursing_service_codes, nursing_records等）

- [ ] **環境変数の設定**
  - `PRODUCTION_DB_URL`が正しく設定されているか確認

- [ ] **影響範囲の再確認**
  - 訪問記録のサービスコードIDが正しく設定されているか確認
  - 月次レセプトが作成されていないか確認

## 📊 実行予定の内容

### フェーズ1: 正しいサービスコードマスタの追加
- 開発環境から正しいコード（51から始まる）を本番環境に追加
- 既存のコード（31から始まる）は保持
- 追加件数: 約46件（開発環境の正しいコード数）

### フェーズ2: 訪問記録の参照更新
- 誤ったサービスコードIDを正しいIDに更新
- 更新件数: 9件（訪問記録）
- マッピング: `311000110` → `510000110`

### フェーズ3: 誤ったコードの無効化
- 31から始まる誤ったコードを無効化
- 無効化件数: 21件
- 削除ではなく無効化（履歴保持）

### 検証
- 参照整合性チェック
- サービスコードの状態確認
- データ整合性チェック

## 🔍 実行後の確認事項

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

## 📝 実行記録

実行日時: _______________

実行者: _______________

実行結果:
- [ ] 成功
- [ ] 失敗（理由: _______________）

備考:
_________________________________

## 📄 関連ドキュメント

- [最終移行計画書](./migration-plan-service-codes-final.md)
- [実行手順書](./migration-execution-guide.md)
- [詳細移行計画書](./migration-plan-service-codes-detailed.md)

