# bonus_calculation_historyテーブルの重複データ解消

## 📋 問題の概要

本番環境の`bonus_calculation_history`テーブルに重複データが存在します。

### 確認結果

- **重複している組み合わせ数**: 16件
- **重複しているレコード総数**: 57件
- **問題**: ユニークインデックス`unique_nursing_record_bonus_master`を追加する前に重複データを解消する必要があります

### 重複の定義

同じ`nursing_record_id`と`bonus_master_id`の組み合わせが複数存在すること。

## ⚠️ 影響

### ユニークインデックス追加への影響

重複データが存在する状態でユニークインデックスを追加しようとすると、以下のエラーが発生します：

```
ERROR: could not create unique index "unique_nursing_record_bonus_master"
DETAIL: Key (nursing_record_id, bonus_master_id)=(...) is duplicated.
```

### デプロイへの影響

Replitからの再デプロイ時に`db:push`が実行され、ユニークインデックスの追加が試みられますが、重複データが存在するため失敗する可能性があります。

## 🔧 解決方法

### 推奨方法: 最新のレコードを残して古いレコードを削除

各重複組み合わせについて、`created_at`が最新のレコードを残し、古いレコードを削除します。

### 実行手順

#### 1. 重複データの確認

```bash
export PRODUCTION_DB_URL="postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require"
npx tsx scripts/check-duplicate-bonus-history.ts
```

#### 2. バックアップの取得（推奨）

```sql
-- 本番環境で直接実行
CREATE TABLE bonus_calculation_history_backup_20251115 AS 
SELECT * FROM bonus_calculation_history;
```

#### 3. 重複データの解消

```bash
export PRODUCTION_DB_URL="postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require"
npx tsx scripts/cleanup-duplicate-bonus-history-for-unique-index.ts
```

**注意**: スクリプト内の確認プロンプトを有効化してから実行してください。

#### 4. 解消後の確認

```bash
npx tsx scripts/check-duplicate-bonus-history.ts
```

重複データが0件であることを確認してください。

## 📊 削除されるレコード

### 削除方針

各重複組み合わせについて、`created_at`が最新のレコードを残し、それ以外のレコードを削除します。

### 削除件数

- **削除対象のレコード数**: 約41件（57件の重複レコードから16件の最新レコードを除いた数）

### 削除されるレコードの例

```
重複組み合わせ1:
  - レコード1 (created_at: 2025-11-10 22:21:29) ← 残す（最新）
  - レコード2 (created_at: 2025-11-10 22:12:29) ← 削除
  - レコード3 (created_at: 2025-11-10 21:54:58) ← 削除
```

## ⚠️ 注意事項

### 1. バックアップの取得

削除を実行する前に、必ずバックアップを取得してください。

### 2. 削除対象の確認

削除されるレコードのIDを記録しておくことを推奨します。

### 3. データの整合性

削除後、データの整合性を確認してください。

### 4. デプロイタイミング

重複データを解消した後、Replitからの再デプロイを実行してください。

## 🔄 ロールバック手順

### バックアップからの復元

```sql
BEGIN;

-- 現在のデータを削除
TRUNCATE TABLE bonus_calculation_history;

-- バックアップから復元
INSERT INTO bonus_calculation_history 
SELECT * FROM bonus_calculation_history_backup_20251115;

COMMIT;
```

## 📋 実行チェックリスト

- [ ] 重複データの確認を実行
- [ ] バックアップを取得
- [ ] 削除対象のレコードを確認
- [ ] 重複データの解消を実行
- [ ] 解消後の確認を実行
- [ ] データの整合性を確認
- [ ] Replitからの再デプロイを実行

## 📄 関連ドキュメント

- [サービスコードマスタ移行計画](./migration-plan-service-codes-final.md)
- [Replitからの再デプロイ 最終影響分析レポート](./replit-redeploy-final-analysis.md)

