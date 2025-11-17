# docsディレクトリ クリーンアップ分析レポート

**作成日**: 2025-01-XX  
**目的**: docsディレクトリ内の不要なファイルを特定し、整理する

---

## 📊 ファイル分類

### ✅ 保持すべきファイル（現在も参照・使用中）

#### コアドキュメント
- `README.md` - ドキュメントのインデックス（最重要）
- `implementation-roadmap.md` - 実装ロードマップ（READMEで参照）

#### bonus/ ディレクトリ（加算機能関連）
- `加算実装ガイド.md` - 加算機能の包括的な実装ガイド（READMEで参照）
- `点数計算の仕組み.md` - 点数計算ロジックの仕組み（READMEで参照）
- `Phase2実装設計書.md` - Phase 2の詳細設計書（READMEで参照）
- `Phase2-1実装完了報告.md` - 実装完了報告（READMEで参照）
- `Phase2-A実装完了報告.md` - 実装完了報告（READMEで参照）
- `Phase2-1テスト手順書.md` - テスト手順書（READMEで参照）
- `bonus-service-code-mapping.md` - 加算マスタとサービスコード対応関係（参考資料として有用）

#### recept/ ディレクトリ（レセプト関連）
- `nursing_csv_spec.md` - CSVフォーマット仕様書（READMEで参照）
- `nursing_csv_sample.txt` - サンプルファイル（READMEで参照）
- その他のPDF・Excelファイル（参考資料として保持）

#### release/ ディレクトリ
- `RELEASE_NOTES.md` - リリース履歴（READMEで参照）

#### system_admin/ ディレクトリ
- `SYSTEM_ADMIN_GUIDE.md` - システム管理者ガイド（READMEで参照）

---

### 🗑️ 削除推奨ファイル（一時的な作業用、完了済み）

#### Replitデプロイ関連（一時的な分析ファイル）
1. `replit-redeploy-checklist.md` - デプロイチェックリスト（作業完了済み）
2. `replit-redeploy-summary.md` - デプロイ影響調査サマリー（作業完了済み）
3. `replit-redeploy-final-analysis.md` - 最終影響分析レポート（作業完了済み）
4. `replit-redeploy-impact-analysis.md` - 影響分析レポート（作業完了済み）
5. `replit-migration-error-analysis.md` - マイグレーションエラー分析（作業完了済み）

**理由**: Replitからの再デプロイ作業は完了しており、これらの分析ファイルは一時的なものです。

#### サービスコードマスタ移行関連（複数バージョン、作業完了済み）
6. `migration-plan-service-codes.md` - 移行計画書（初版）
7. `migration-plan-service-codes-detailed.md` - 詳細移行計画書（中間版）
8. `migration-plan-service-codes-final.md` - 最終移行計画書（最終版、作業完了済み）
9. `migration-execution-guide.md` - 実行手順書（作業完了済み）
10. `service-code-migration-ready.md` - 実行準備完了通知（作業完了済み）

**理由**: サービスコードマスタの移行作業は完了しており、複数のバージョンが存在します。最終版のみ保持するか、すべて削除しても問題ありません。

#### 加算マスタ関連（一時的な分析ファイル）
11. `bonus-master-diff-analysis.md` - 加算マスタ差分分析（作業完了済み）
12. `bonus-master-migration-plan.md` - 加算マスタ移行計画（作業完了済み）

**理由**: 加算マスタの差分分析と移行計画は完了しており、一時的なファイルです。

#### 重複データクリーンアップ関連（作業完了済み）
13. `duplicate-bonus-history-cleanup.md` - 重複データ解消手順書（作業完了済み）
14. `duplicate-cleanup-impact-analysis.md` - 重複データ解消の影響分析（作業完了済み）

**理由**: 重複データのクリーンアップ作業は完了しており、一時的なファイルです。

#### 差分分析関連（一時的な分析ファイル）
15. `schema-diff-analysis-final.md` - スキーマ差分分析結果（作業完了済み）
16. `changes-since-last-deploy.md` - 前回デプロイからの変更内容（作業完了済み）

**理由**: デプロイ前の一時的な分析ファイルで、作業完了済みです。

#### データ整合性レポート（作業完了済み）
17. `final-data-integrity-report.md` - データ整合性最終レポート（作業完了済み）

**理由**: データ整合性チェックは完了しており、一時的なレポートです。

#### スクリプトクリーンアップ推奨（メタファイル）
18. `scripts-cleanup-recommendation.md` - スクリプトクリーンアップ推奨（メタファイル）

**理由**: このファイル自体がクリーンアップ推奨のメタファイルです。削除しても問題ありません。

---

## 📋 削除推奨ファイル一覧（18件）

### 削除候補リスト

```
docs/
├── replit-redeploy-checklist.md              # Replitデプロイ関連
├── replit-redeploy-summary.md                 # Replitデプロイ関連
├── replit-redeploy-final-analysis.md          # Replitデプロイ関連
├── replit-redeploy-impact-analysis.md         # Replitデプロイ関連
├── replit-migration-error-analysis.md         # Replitデプロイ関連
├── migration-plan-service-codes.md            # サービスコード移行（初版）
├── migration-plan-service-codes-detailed.md   # サービスコード移行（中間版）
├── migration-plan-service-codes-final.md     # サービスコード移行（最終版）
├── migration-execution-guide.md               # サービスコード移行実行手順
├── service-code-migration-ready.md            # サービスコード移行準備完了
├── bonus-master-diff-analysis.md             # 加算マスタ差分分析
├── bonus-master-migration-plan.md            # 加算マスタ移行計画
├── duplicate-bonus-history-cleanup.md        # 重複データ解消
├── duplicate-cleanup-impact-analysis.md       # 重複データ解消影響分析
├── schema-diff-analysis-final.md             # スキーマ差分分析
├── changes-since-last-deploy.md               # デプロイ変更履歴
├── final-data-integrity-report.md            # データ整合性レポート
└── scripts-cleanup-recommendation.md          # スクリプトクリーンアップ推奨
```

---

## ✅ 推奨アクション

### オプション1: すべて削除（推奨）
作業完了済みの一時的なファイルはすべて削除し、コアドキュメントのみ保持します。

### オプション2: アーカイブディレクトリに移動
削除する代わりに、`docs/archive/` ディレクトリを作成して移動します。

### オプション3: 一部保持
重要な作業の記録として、最終版のみ保持します。
- `migration-plan-service-codes-final.md` - 移行計画の最終版
- `final-data-integrity-report.md` - データ整合性レポート

---

## 📝 注意事項

- 削除前に、必要に応じてバックアップを取得してください
- コード内で参照されているファイルは削除しないでください
- 削除後は `README.md` の更新は不要です（これらのファイルは参照されていません）

---

**作成者**: Claude Code  
**最終更新**: 2025-01-XX

