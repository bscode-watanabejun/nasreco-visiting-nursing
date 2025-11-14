# scriptsディレクトリのクリーンアップ推奨

## 📊 分析結果

### 総ファイル数: 88件

## 🗑️ 削除推奨ファイル

### 1. 一時的な確認・調査用スクリプト（24件）

これらのファイルは、サービスコードマスタ入れ替え作業やデプロイ前の確認作業で使用した一時的なスクリプトです。作業が完了しているため、削除しても問題ありません。

#### 確認・調査用（check-*系）
- `check-all-schema-differences.ts` - スキーマ差分確認（完了済み）
- `check-bonus-history-service-code-id.ts` - service_code_id確認（完了済み）
- `check-dev-service-codes.ts` - 開発環境のサービスコード確認（完了済み）
- `check-duplicate-bonus-history.ts` - 重複データ確認（完了済み）
- `check-duplicate-patients-detail.ts` - 重複患者詳細確認
- `check-duplicate-patients.ts` - 重複患者確認
- `check-duplicate-service-codes.ts` - 重複サービスコード確認
- `check-missing-care-service-codes.ts` - 介護保険サービスコード確認
- `check-production-impact.ts` - 本番環境への影響確認（完了済み）
- `check-production-schema.ts` - 本番環境スキーマ確認
- `check-production-service-code-usage.ts` - 本番環境サービスコード使用状況確認（完了済み）
- `check-schema-changes.ts` - スキーマ変更確認（完了済み）
- `check-schema-diff.ts` - スキーマ差分確認（完了済み）
- `check-service-code-details.ts` - サービスコード詳細確認
- `check-service-code-points.ts` - サービスコード点数確認
- `check-terminal-care-service-codes.ts` - ターミナルケアサービスコード確認

#### 比較用（compare-*系）
- `compare-bonus-service-code-points.ts` - 加算サービスコード点数比較
- `compare-dev-prod-schema.ts` - 開発・本番環境スキーマ比較
- `compare-schema-accurate.ts` - スキーマ正確な比較（完了済み）
- `compare-schema-detailed.ts` - スキーマ詳細比較（完了済み）
- `compare-schema-diff.ts` - スキーマ差分比較（完了済み）
- `compare-service-codes-count.ts` - サービスコード件数比較（完了済み）

#### 分析用（analyze-*系）
- `analyze-changes-since-deploy.ts` - デプロイ後の変更分析（完了済み）
- `analyze-duplicate-impact.ts` - 重複データ影響分析（完了済み）

### 2. 重複ファイル（1件）

- `cleanup-duplicate-bonus-history.ts` - `cleanup-duplicate-bonus-history-for-unique-index.ts`と重複

## ✅ 保持推奨ファイル

### 移行スクリプト（完了済みだが履歴として保持）
- `migrate-service-codes-to-production.ts` - フェーズ1: 正しいコードの追加
- `update-service-code-references.ts` - フェーズ2: 参照の更新
- `deactivate-wrong-service-codes.ts` - フェーズ3: 誤ったコードの無効化
- `verify-migration.ts` - 検証スクリプト
- `run-full-migration.ts` - 統合スクリプト
- `add-all-missing-service-codes.ts` - 不足していたコードの追加
- `cleanup-duplicate-bonus-history-for-unique-index.ts` - 重複データ解消

### 検証・確認用スクリプト（今後も使用可能）
- `comprehensive-data-check.ts` - 包括的なデータチェック
- `check-unique-index-exists.ts` - ユニークインデックス確認
- `check-monthly-receipts-impact.ts` - 月次レセプトへの影響確認

### メンテナンス用スクリプト
- `fix-*`系、`import-*`系、`delete-*`系など

### ユーティリティスクリプト
- `seed-*`系、`list-*`系、`count-*`系など

## 📋 削除推奨ファイル一覧（25件）

```bash
# 一時的な確認・調査用スクリプト（24件）
scripts/analyze-changes-since-deploy.ts
scripts/analyze-duplicate-impact.ts
scripts/check-all-schema-differences.ts
scripts/check-bonus-history-service-code-id.ts
scripts/check-dev-service-codes.ts
scripts/check-duplicate-bonus-history.ts
scripts/check-duplicate-patients-detail.ts
scripts/check-duplicate-patients.ts
scripts/check-duplicate-service-codes.ts
scripts/check-missing-care-service-codes.ts
scripts/check-production-impact.ts
scripts/check-production-schema.ts
scripts/check-production-service-code-usage.ts
scripts/check-schema-changes.ts
scripts/check-schema-diff.ts
scripts/check-service-code-details.ts
scripts/check-service-code-points.ts
scripts/check-terminal-care-service-codes.ts
scripts/compare-bonus-service-code-points.ts
scripts/compare-dev-prod-schema.ts
scripts/compare-schema-accurate.ts
scripts/compare-schema-detailed.ts
scripts/compare-schema-diff.ts
scripts/compare-service-codes-count.ts

# 重複ファイル（1件）
scripts/cleanup-duplicate-bonus-history.ts
```

## ⚠️ 注意事項

1. **削除前に確認**: 削除する前に、各ファイルが本当に不要か確認してください
2. **履歴として保持**: 移行作業の履歴として残しておきたい場合は保持してください
3. **Git管理**: 削除する場合は、Gitで管理されているため履歴は残ります

## 🗑️ 削除実行方法

削除を実行する場合は、以下のコマンドを実行してください：

```bash
# 削除推奨ファイルを削除
rm scripts/analyze-changes-since-deploy.ts
rm scripts/analyze-duplicate-impact.ts
rm scripts/check-all-schema-differences.ts
rm scripts/check-bonus-history-service-code-id.ts
rm scripts/check-dev-service-codes.ts
rm scripts/check-duplicate-bonus-history.ts
rm scripts/check-duplicate-patients-detail.ts
rm scripts/check-duplicate-patients.ts
rm scripts/check-duplicate-service-codes.ts
rm scripts/check-missing-care-service-codes.ts
rm scripts/check-production-impact.ts
rm scripts/check-production-schema.ts
rm scripts/check-production-service-code-usage.ts
rm scripts/check-schema-changes.ts
rm scripts/check-schema-diff.ts
rm scripts/check-service-code-details.ts
rm scripts/check-service-code-points.ts
rm scripts/check-terminal-care-service-codes.ts
rm scripts/compare-bonus-service-code-points.ts
rm scripts/compare-dev-prod-schema.ts
rm scripts/compare-schema-accurate.ts
rm scripts/compare-schema-detailed.ts
rm scripts/compare-schema-diff.ts
rm scripts/compare-service-codes-count.ts
rm scripts/cleanup-duplicate-bonus-history.ts
```

