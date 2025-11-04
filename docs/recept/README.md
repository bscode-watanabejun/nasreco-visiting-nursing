# 医療保険レセプトCSV出力機能 - 実装ドキュメント

このディレクトリには、令和6年6月版「オンライン請求に係る記録条件仕様（訪問看護用）」に準拠した医療保険レセプトCSV出力機能の実装に必要な全ドキュメントが格納されています。

## 📚 ドキュメント一覧

### 1. [implementation_plan.md](./implementation_plan.md) - **実装計画書** ⭐ まずはここから
実装全体の概要、段階的な実装計画、工数見積もり、優先順位が記載されています。
- **Phase 1-6の実装ステップ**
- **Week 1-6のスケジュール**
- **技術的な注意点**
- **依存ライブラリ**

### 2. [nursing_csv_spec.md](./nursing_csv_spec.md) - CSV仕様書（原本）
厚生労働省の仕様に基づいたCSVフォーマットの詳細仕様。
- **18種類のレコードタイプ**
- **フィールド定義**
- **コード表（別表1-24）**
- **文字エンコーディング（Shift_JIS）**

### 3. [database_schema_changes.md](./database_schema_changes.md) - データベーススキーマ変更仕様
必要なデータベーススキーマ変更の詳細。
- **既存テーブルへの追加フィールド**（6テーブル）
- **新規マスターテーブル**（5テーブル）
- **マイグレーション手順**
- **ロールバック計画**

### 4. [csv_record_specifications.md](./csv_record_specifications.md) - CSVレコード仕様詳細
18種類のレコードタイプごとのデータソースマッピング。
- **各レコードタイプの実装例**
- **データベーステーブルとのマッピング**
- **フォーマット関数**
- **バリデーションルール**

### 5. [data_requirements.md](./data_requirements.md) - データ要件チェックリスト
CSV出力に必要な全データ項目のチェックリスト。
- **6つのカテゴリ別バリデーション**
- **チェック関数の実装例**
- **エラーメッセージ定義**
- **既存データの補完方法**

### 6. [ui_changes.md](./ui_changes.md) - UI変更仕様
フロントエンド画面の変更仕様。
- **7つの画面の変更内容**
- **新規画面（マスターデータ管理）**
- **コンポーネント実装例**
- **バリデーション**

### 7. [api_specifications.md](./api_specifications.md) - API仕様
バックエンドAPIの仕様。
- **CSV出力API（書き換え）**
- **データチェックAPI（新規）**
- **マスターデータCRUD API（新規）**
- **エラーハンドリング**

### 8. [master_data_initial.md](./master_data_initial.md) - マスターデータ初期値
必要なマスターデータの初期値一覧。
- **都道府県コード**（47件）
- **職員資格コード**（10件）
- **訪問場所コード**（10件）
- **レセプト種別コード**（7件）
- **訪問看護サービスコード**（主要なもの）

### 9. [testing_checklist.md](./testing_checklist.md) - テスト計画
テスト計画とチェックリスト。
- **単体テスト**
- **統合テスト**
- **E2Eテスト**
- **仕様適合テスト**
- **手動テストチェックリスト**

---

## 🚀 実装の進め方

### Step 1: 全体把握（30分）
1. [implementation_plan.md](./implementation_plan.md) を読んで全体像を把握
2. [nursing_csv_spec.md](./nursing_csv_spec.md) でCSVフォーマットの仕様を確認

### Step 2: データベース準備（Week 1-2）
1. [database_schema_changes.md](./database_schema_changes.md) を参照してスキーマ変更
2. [master_data_initial.md](./master_data_initial.md) を参照してマスターデータ投入
3. [ui_changes.md](./ui_changes.md) を参照してUI拡張（データ入力画面）

### Step 3: データチェック機能（Week 3）
1. [data_requirements.md](./data_requirements.md) を参照してバリデーション実装
2. 月次レセプト管理画面に警告表示を追加

### Step 4: CSV生成エンジン（Week 4-5）
1. [csv_record_specifications.md](./csv_record_specifications.md) を参照して18種類のレコードジェネレーター実装
2. [api_specifications.md](./api_specifications.md) を参照してAPI実装

### Step 5: テスト（Week 6）
1. [testing_checklist.md](./testing_checklist.md) を参照してテスト実施
2. 仕様適合確認
3. 実データでの動作確認

---

## ⚠️ 重要な注意点

### 文字エンコーディング
- **Shift_JIS** を使用（UTF-8ではない）
- `iconv-lite` ライブラリが必要
- 全角文字は2バイト、半角文字は1バイトでカウント

### 改行コード
- **CR+LF (Windows形式)** を使用
- `\r\n` を明示的に使用

### ファイル終端
- 最終行の後に **EOF終端コード（0x1A）** を追加

### データの不足
- CSV出力前に必ず **データ充足状況チェック** を実施
- 不足データがある場合は出力をブロック

---

## 📋 実装チェックリスト

### Phase 1: データベーススキーマ拡張
- [ ] facilities テーブルにfacilityCode, prefectureCodeを追加
- [ ] medicalInstitutions テーブルにinstitutionCode, prefectureCodeを追加
- [ ] patients テーブルにkanaNameを追加
- [ ] doctorOrders テーブルにicd10Codeを追加
- [ ] nursingRecords テーブルにserviceCodeId, visitLocationCode, staffQualificationCodeを追加
- [ ] monthlyReceipts テーブルにcsvExportReady, csvExportWarnings, lastCsvExportCheckを追加
- [ ] 新規マスターテーブル5つを作成
- [ ] マイグレーション実行（`npm run db:push`）

### Phase 2: マスターデータ初期投入
- [ ] 都道府県コード（47件）
- [ ] 職員資格コード（10件）
- [ ] 訪問場所コード（10件）
- [ ] レセプト種別コード（7件）
- [ ] 訪問看護サービスコード（主要なもの）

### Phase 3: UI拡張
- [ ] 施設管理画面
- [ ] 患者登録・編集画面
- [ ] 医療機関登録・編集画面
- [ ] 医師指示書登録・編集画面
- [ ] 訪問記録登録・編集画面
- [ ] マスターデータ管理画面（新規）

### Phase 4: データチェック機能
- [ ] バリデーション関数実装
- [ ] CSV出力可否チェックAPI実装
- [ ] 月次レセプト管理画面に警告表示追加

### Phase 5: CSV生成エンジン
- [ ] Shift_JISエンコーダー実装
- [ ] 18種類のレコードジェネレーター実装
- [ ] 階層構造CSVビルダー実装
- [ ] CSV出力API実装

### Phase 6: テスト
- [ ] 単体テスト
- [ ] 統合テスト
- [ ] E2Eテスト
- [ ] 仕様適合テスト
- [ ] 手動テスト

---

## 📞 不明点がある場合

各ドキュメントの「変更履歴」セクションに記録を残すことで、変更の追跡が可能です。

実装中に不明点や問題が発生した場合は、該当するドキュメントを参照してください。

---

## 🔄 最終更新日

2025-11-03

---

## 📝 変更履歴

| 日付 | 変更内容 | 担当者 |
|------|---------|--------|
| 2025-11-03 | 全ドキュメント初版作成 | - |
