# 本番環境サービスコードマスタ入れ替え 詳細移行計画

## 1. 移行戦略の詳細

### 1.1 移行アプローチ
**推奨アプローチ**: 段階的移行（3段階）

1. **フェーズ1**: 正しいコードの追加（既存コードは保持）
2. **フェーズ2**: 参照の更新（誤ったID → 正しいID）
3. **フェーズ3**: 誤ったコードの無効化

**理由**:
- 外部キー制約により、参照が残っているコードは削除できない
- 段階的に進めることで、各段階で検証可能
- 問題発生時にロールバックが容易

### 1.2 実行順序の最適化

```
1. バックアップ取得
   ↓
2. 正しいサービスコードマスタの追加（既存は保持）
   ↓
3. 訪問記録の参照更新（トランザクション内で実行）
   ↓
4. データ整合性チェック
   ↓
5. 誤ったコードの無効化
   ↓
6. 最終検証
```

## 2. 各フェーズの詳細設計

### フェーズ1: 正しいサービスコードマスタの追加

#### 2.1.1 実行内容
開発環境から正しいサービスコードマスタを本番環境にコピー

#### 2.1.2 実装方針
```typescript
// 1. 開発環境から正しいコード（51から始まる）を取得
// 2. 本番環境に既に存在するかチェック（service_codeで判定）
// 3. 存在しない場合のみ追加
// 4. IDは開発環境のものをそのまま使用（一貫性のため）
```

#### 2.1.3 注意事項
- **IDの扱い**: 開発環境のIDをそのまま使用（UUIDのため重複しない）
- **重複チェック**: `service_code` カラムで重複をチェック
- **既存コード**: 31から始まるコードはそのまま保持

#### 2.1.4 エラーハンドリング
- 重複エラー: スキップして続行
- 外部キー制約エラー: ロールバック
- その他のエラー: ロールバック

### フェーズ2: 訪問記録の参照更新

#### 2.2.1 実行内容
誤ったサービスコードIDを正しいサービスコードIDに更新

#### 2.2.2 マッピングテーブル
```typescript
const mapping: Record<string, string> = {
  // 誤ったコードID → 正しいコードID
  'a4d94b8d-xxxx-xxxx-xxxx-xxxxxxxxxxxx': 'f9940fce-d0fb-47f4-a4ee-e06b7e2664a2', // 311000110 → 510000110
  // 他のマッピングも追加（現在は1件のみ）
};
```

#### 2.2.3 実装方針
```sql
-- トランザクション内で実行
BEGIN;

-- 1. 更新対象の確認
SELECT COUNT(*) FROM nursing_records 
WHERE service_code_id IN ('a4d94b8d-xxxx-xxxx-xxxx-xxxxxxxxxxxx');

-- 2. 参照更新
UPDATE nursing_records
SET service_code_id = 'f9940fce-d0fb-47f4-a4ee-e06b7e2664a2'
WHERE service_code_id = 'a4d94b8d-xxxx-xxxx-xxxx-xxxxxxxxxxxx';

-- 3. 更新件数の確認
SELECT COUNT(*) FROM nursing_records 
WHERE service_code_id = 'f9940fce-d0fb-47f4-a4ee-e06b7e2664a2';

-- 4. 整合性チェック
SELECT COUNT(*) FROM nursing_records nr
LEFT JOIN nursing_service_codes nsc ON nr.service_code_id = nsc.id
WHERE nr.service_code_id IS NOT NULL AND nsc.id IS NULL;
-- → 0件であることを確認

COMMIT;
```

#### 2.2.4 エラーハンドリング
- 外部キー制約エラー: 正しいコードIDが存在しない → ロールバック
- 更新件数不一致: 期待値と異なる → ロールバック
- 整合性チェック失敗: 参照先が存在しない → ロールバック

### フェーズ3: 誤ったコードの無効化

#### 2.3.1 実行内容
31から始まる誤ったコードを無効化（`is_active = false`）

#### 2.3.2 実装方針
```sql
-- 1. 無効化対象の確認
SELECT COUNT(*) FROM nursing_service_codes 
WHERE service_code LIKE '31%' AND is_active = true;

-- 2. 参照が残っていないか確認
SELECT COUNT(*) FROM nursing_records 
WHERE service_code_id IN (
  SELECT id FROM nursing_service_codes WHERE service_code LIKE '31%'
);
-- → 0件であることを確認

-- 3. 無効化実行
UPDATE nursing_service_codes
SET is_active = false
WHERE service_code LIKE '31%' AND is_active = true;

-- 4. 無効化件数の確認
SELECT COUNT(*) FROM nursing_service_codes 
WHERE service_code LIKE '31%' AND is_active = false;
```

#### 2.3.2 注意事項
- **削除ではなく無効化**: 履歴保持のため
- **参照チェック**: 無効化前に参照が残っていないか確認
- **段階的無効化**: 使用されていないコードから順に無効化

## 3. データ整合性チェック

### 3.1 チェック項目

#### 3.1.1 参照整合性
```sql
-- 訪問記録のサービスコードIDがマスタに存在するか
SELECT COUNT(*) FROM nursing_records nr
LEFT JOIN nursing_service_codes nsc ON nr.service_code_id = nsc.id
WHERE nr.service_code_id IS NOT NULL AND nsc.id IS NULL;
-- → 0件であることを確認
```

#### 3.1.2 加算計算履歴の参照整合性
```sql
-- 加算計算履歴のサービスコードIDがマスタに存在するか
SELECT COUNT(*) FROM bonus_calculation_history bch
LEFT JOIN nursing_service_codes nsc ON bch.service_code_id = nsc.id
WHERE bch.service_code_id IS NOT NULL AND nsc.id IS NULL;
-- → 0件であることを確認
```

#### 3.1.3 サービスコードの状態
```sql
-- 正しいコード（51から始まる）が有効か
SELECT COUNT(*) FROM nursing_service_codes 
WHERE service_code LIKE '51%' AND is_active = true;
-- → 期待値と一致することを確認

-- 誤ったコード（31から始まる）が無効化されているか
SELECT COUNT(*) FROM nursing_service_codes 
WHERE service_code LIKE '31%' AND is_active = true;
-- → 0件であることを確認
```

### 3.2 検証スクリプト
各フェーズ実行後に、以下の検証を実施:
1. 参照整合性チェック
2. データ件数の確認
3. サービスコードの状態確認

## 4. ロールバック計画の詳細

### 4.1 ロールバック手順

#### 4.1.1 フェーズ2のロールバック（参照更新の取り消し）
```sql
BEGIN;

-- 訪問記録の参照を元に戻す
UPDATE nursing_records
SET service_code_id = 'a4d94b8d-xxxx-xxxx-xxxx-xxxxxxxxxxxx' -- 元のID
WHERE service_code_id = 'f9940fce-d0fb-47f4-a4ee-e06b7e2664a2';

COMMIT;
```

#### 4.1.2 フェーズ1のロールバック（追加したコードの削除）
```sql
BEGIN;

-- 追加した正しいコード（51から始まる）を削除
DELETE FROM nursing_service_codes
WHERE service_code LIKE '51%'
AND id NOT IN (
  SELECT DISTINCT service_code_id 
  FROM nursing_records 
  WHERE service_code_id IS NOT NULL
);

COMMIT;
```

#### 4.1.3 フェーズ3のロールバック（無効化の取り消し）
```sql
BEGIN;

-- 誤ったコードを再度有効化
UPDATE nursing_service_codes
SET is_active = true
WHERE service_code LIKE '31%';

COMMIT;
```

### 4.2 完全ロールバック（バックアップからの復元）
```sql
-- バックアップテーブルから復元
BEGIN;

-- サービスコードマスタの復元
TRUNCATE TABLE nursing_service_codes;
INSERT INTO nursing_service_codes 
SELECT * FROM nursing_service_codes_backup_YYYYMMDD;

-- 訪問記録の復元（サービスコードIDのみ）
UPDATE nursing_records nr
SET service_code_id = backup.service_code_id
FROM nursing_records_backup_YYYYMMDD backup
WHERE nr.id = backup.id;

COMMIT;
```

## 5. 実行スクリプトの設計

### 5.1 スクリプト構成

```
scripts/
├── migrate-service-codes-to-production.ts  # フェーズ1: マスタ追加
├── update-service-code-references.ts       # フェーズ2: 参照更新
├── deactivate-wrong-service-codes.ts       # フェーズ3: 無効化
├── verify-migration.ts                     # 検証
└── rollback-migration.ts                   # ロールバック
```

### 5.2 各スクリプトの責務

#### 5.2.1 migrate-service-codes-to-production.ts
- 開発環境から正しいコードを取得
- 本番環境に追加（重複チェック）
- 追加件数の確認

#### 5.2.2 update-service-code-references.ts
- マッピングテーブルから更新対象を取得
- トランザクション内で参照更新
- 更新件数の確認
- 整合性チェック

#### 5.2.3 deactivate-wrong-service-codes.ts
- 参照が残っていないか確認
- 誤ったコードの無効化
- 無効化件数の確認

#### 5.2.4 verify-migration.ts
- 参照整合性チェック
- データ件数の確認
- サービスコードの状態確認
- 検証結果のレポート出力

#### 5.2.5 rollback-migration.ts
- 各フェーズのロールバック実行
- ロールバック後の検証

## 6. 実行タイムライン

### 6.1 推奨実行スケジュール

```
【事前準備】実行前日まで
- バックアップ取得
- 影響範囲の最終確認
- スクリプトの動作確認

【移行実行】業務時間外（推奨: 22:00～）
- 22:00 バックアップ取得（5分）
- 22:05 フェーズ1実行（10分）
- 22:15 フェーズ2実行（5分）
- 22:20 検証（5分）
- 22:25 フェーズ3実行（5分）
- 22:30 最終検証（5分）
- 22:35 完了

【移行後】翌日
- 業務開始前に動作確認
- ユーザーへの通知
- モニタリング開始
```

### 6.2 実行時間の見積もり

| フェーズ | 実行時間 | 検証時間 | 合計 |
|---------|---------|---------|------|
| バックアップ | 5分 | - | 5分 |
| フェーズ1 | 10分 | 5分 | 15分 |
| フェーズ2 | 5分 | 5分 | 10分 |
| フェーズ3 | 5分 | 5分 | 10分 |
| 最終検証 | 5分 | - | 5分 |
| **合計** | **30分** | **15分** | **45分** |

## 7. リスクと対策の詳細

### 7.1 技術的リスク

#### リスク1: トランザクションタイムアウト
**対策**:
- バッチサイズを小さくする（9件なので問題なし）
- タイムアウト時間を延長
- リトライロジックの実装

#### リスク2: 外部キー制約違反
**対策**:
- 参照更新を先に実行
- 更新前に参照先の存在確認
- トランザクション内で実行

#### リスク3: データ不整合
**対策**:
- 各フェーズ後に整合性チェック
- 検証スクリプトの実行
- ロールバック準備

### 7.2 業務的リスク

#### リスク1: 月次レセプトへの影響
**現状**: 月次レセプト未作成のため影響なし
**対策**: 移行完了後に月次レセプト作成を確認

#### リスク2: 訪問記録の表示エラー
**対策**: 
- 移行後の画面確認
- エラーログの監視
- ユーザーへの確認

## 8. 承認と実行

### 8.1 承認フロー

```
1. 移行計画書の作成 ← 現在ここ
   ↓
2. 技術レビュー（システム管理者）
   ↓
3. 業務レビュー（業務責任者）
   ↓
4. 承認取得
   ↓
5. 実行日時の決定
   ↓
6. 移行実行
   ↓
7. 検証と報告
```

### 8.2 実行前チェックリスト

- [ ] バックアップ取得完了
- [ ] 影響範囲の最終確認完了
- [ ] スクリプトの動作確認完了
- [ ] ロールバック手順の確認完了
- [ ] 承認取得完了
- [ ] 実行日時の決定完了
- [ ] 関係者への通知完了

## 9. 次のステップ

1. **移行スクリプトの作成**
   - 各フェーズのスクリプトを実装
   - エラーハンドリングの実装
   - 検証ロジックの実装

2. **テスト環境での検証**
   - テスト環境で移行スクリプトを実行
   - 各フェーズの動作確認
   - ロールバック手順の確認

3. **本番環境での実行**
   - 承認取得後、本番環境で実行
   - 各フェーズごとに検証
   - 最終検証の実施

