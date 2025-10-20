# Replit環境でのパス方式マルチテナント使用ガイド

## 🎯 Replit環境での動作

Replit開発環境では、以下の両方の方式でアクセス可能です:

### 1. レガシー方式（従来通り）

開発サーバーのルートURLにアクセスすると、従来のログイン画面が表示されます:

```
https://bc07f228-ff78-4ef1-817b-011bd992cfac-00-1bkf0ouvw4ec.riker.replit.dev/
```

**動作:**
- ✅ ログイン画面が表示される
- ✅ 既存の機能がすべて動作する
- ✅ `/patients`, `/users` などの既知のパスは自動的にレガシールーティング

### 2. パス方式（新規マルチテナント）

企業・施設のスラッグをURLに含めてアクセス:

```
# 東海グループ本社
https://bc07f228-ff78-4ef1-817b-011bd992cfac-00-1bkf0ouvw4ec.riker.replit.dev/tokai

# ミントクリニック越谷
https://bc07f228-ff78-4ef1-817b-011bd992cfac-00-1bkf0ouvw4ec.riker.replit.dev/tokai/mint-koshigaya

# ロイヤルレジデンス大宮
https://bc07f228-ff78-4ef1-817b-011bd992cfac-00-1bkf0ouvw4ec.riker.replit.dev/shakenfuku/royal-omiya
```

## 🔍 仕組み

### パステナントミドルウェアの動作

[server/middleware/path-tenant.ts](../server/middleware/path-tenant.ts) は以下のロジックで動作します:

1. **スキップ条件** - 以下のパスはテナント解決をスキップ:
   - ルートパス: `/`
   - API認証: `/api/auth/*`
   - 静的ファイル: `/assets/*`, `/uploads/*`, `/@vite/*`
   - 既知ページ: `/patients`, `/users`, `/schedules` など

2. **レガシールーティング検出** - 既知のページ名リスト:
   ```typescript
   const knownPages = [
     'patients', 'users', 'records', 'schedules', 'dashboard',
     'settings', 'reports', 'login', 'facilities', 'headquarters',
     // ... その他
   ];
   ```

3. **テナント解決** - 既知ページでない場合:
   - 第1パート → 企業スラッグ（`tokai`, `shakenfuku`）
   - 第2パート → 施設スラッグ（`mint-koshigaya`, `royal-omiya`）

### ログ出力

開発環境では詳細なログが出力されます:

```
[PathTenant] Skipping tenant resolution for: /
[PathTenant] Legacy page detected, skipping tenant resolution: /patients
[PathTenant] Looking up company: tokai
[PathTenant] Company resolved: 東海グループ (tokai)
[PathTenant] Looking up facility: mint-koshigaya in company: 東海グループ
[PathTenant] Facility resolved: ミントクリニック越谷 (mint-koshigaya)
```

## 📋 アクセス方法まとめ

### レガシー方式でアクセス

```bash
# 1. ルートURLを開く
https://<your-replit-url>/

# 2. ログイン
ユーザー名: admin（または既存ユーザー）
パスワード: password

# 3. 通常通り使用
/patients
/schedules
/users
```

### パス方式でアクセス

#### 施設スタッフとしてアクセス

```bash
# 1. 施設URLを開く
https://<your-replit-url>/tokai/mint-koshigaya

# 2. ログイン
ユーザー名: nurse.mint.koshigaya
パスワード: password123

# 3. 施設データにアクセス
/tokai/mint-koshigaya/patients
/tokai/mint-koshigaya/schedules
```

#### 本社管理者としてアクセス

```bash
# 1. 本社URLを開く
https://<your-replit-url>/tokai

# 2. ログイン
ユーザー名: admin.tokai
パスワード: password123

# 3. 全施設にアクセス可能
/tokai/mint-koshigaya/patients
/tokai/genki-kamifukuoka/patients
/tokai/mint-minami/patients
```

## 🧪 動作確認手順

### ステップ 1: レガシー方式の確認

1. ブラウザでReplitのURLを開く
2. ログイン画面が表示されることを確認
3. 既存ユーザーでログイン
4. `/patients` などにアクセスして動作確認

### ステップ 2: パス方式の確認

1. 新しいプライベートウィンドウを開く
2. `/tokai/mint-koshigaya` にアクセス
3. ログイン画面が表示されることを確認
4. `nurse.mint.koshigaya` / `password123` でログイン
5. 利用者一覧などにアクセスして動作確認

### ステップ 3: セキュリティの確認

1. 施設スタッフ（`nurse.mint.koshigaya`）でログイン
2. 別の施設のURL `/tokai/genki-kamifukuoka/patients` にアクセス
3. `403 Forbidden` エラーが表示されることを確認（正常動作）
4. 本社管理者（`admin.tokai`）でログイン
5. すべての施設にアクセスできることを確認

## 🐛 トラブルシューティング

### ログイン画面が表示されない

**症状**: ルートURLにアクセスしても何も表示されない

**原因**: パステナントミドルウェアでエラーが発生している

**解決方法**:
1. ブラウザのコンソールでエラーを確認
2. サーバーログで `[PathTenant]` を検索
3. 以下を確認:
   ```bash
   # パスがスキップされているか
   [PathTenant] Skipping tenant resolution for: /
   ```

### 404 Company not found

**症状**: `/tokai` にアクセスすると「企業が見つかりません」エラー

**原因**: データベースに企業が登録されていない

**解決方法**:
```sql
-- 企業を確認
SELECT id, name, slug FROM companies;

-- slugが正しく設定されているか確認
-- 必要に応じて更新
UPDATE companies SET slug = 'tokai' WHERE name LIKE '%東海%';
```

### 404 Facility not found

**症状**: `/tokai/mint-koshigaya` にアクセスすると「施設が見つかりません」エラー

**原因**: データベースに施設が登録されていない

**解決方法**:
```sql
-- 施設を確認
SELECT f.id, f.name, f.slug, c.slug as company_slug
FROM facilities f
JOIN companies c ON f.company_id = c.id
WHERE c.slug = 'tokai';
```

### パスワードが合わない

**症状**: テストユーザーでログインできない

**原因**: パスワードハッシュが正しく生成されていない

**解決方法**:
```bash
# Node.jsで正しいハッシュを生成
node -e "const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync('password123', 10));"

# 出力されたハッシュでユーザーを更新
# psql $DATABASE_URL
UPDATE users 
SET password = '$2a$10$...' 
WHERE username = 'nurse.mint.koshigaya';
```

## 📊 登録済みデータの確認

```sql
-- すべての企業と施設を確認
SELECT 
  c.slug AS company,
  f.slug AS facility,
  f.is_headquarters AS is_hq,
  f.name AS facility_name
FROM companies c
JOIN facilities f ON f.company_id = c.id
ORDER BY c.slug, f.is_headquarters DESC, f.name;
```

**期待される結果:**
```
 company    | facility          | is_hq | facility_name
------------+-------------------+-------+------------------------
 nasreco    | tokyo-main        | t     | 東京本院
 nasreco    | test-clinic       | f     | テストクリニック
 shakenfuku | headquarters      | t     | 社会福祉総合研究所本社
 shakenfuku | mint-iruma        | f     | ミントクリニック入間
 shakenfuku | royal-kazo        | f     | ロイヤルレジデンス加須
 shakenfuku | royal-omiya       | f     | ロイヤルレジデンス大宮
 tokai      | headquarters      | t     | 東海グループ本社
 tokai      | genki-kamifukuoka | f     | 元気クリニック上福岡
 tokai      | mint-koshigaya    | f     | ミントクリニック越谷
 tokai      | mint-minami       | f     | ミントクリニック南浦和
```

## 🎓 まとめ

Replit環境では:

✅ **レガシー方式とパス方式の両立**
- ルートURL（`/`）→ 従来のログイン画面
- 既知ページ（`/patients`）→ レガシールーティング
- テナントパス（`/tokai/mint-koshigaya`）→ パス方式

✅ **自動検出**
- URLパターンから自動的にルーティング方式を判定
- 開発者が意識せず両方式を使用可能

✅ **デバッグ容易**
- コンソールに詳細なログ出力
- どのパスがどの方式で処理されたか明確

開発サーバーを再起動して、ルートURLにアクセスしてみてください！
