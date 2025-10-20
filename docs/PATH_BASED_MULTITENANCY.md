# パス方式マルチテナント実装ガイド

## 概要

NASRECO訪問看護システムは、パス方式のマルチテナントアーキテクチャを実装しました。
複数の企業グループと、その傘下の複数施設を単一のドメインで管理できます。

## URL構造

### 基本パターン

```
visit.nasreco.com/:companySlug/:facilitySlug/...
```

### 具体例

```
# 東海グループ
visit.nasreco.com/tokai                           → 本社ダッシュボード
visit.nasreco.com/tokai/mint-koshigaya            → ミントクリニック越谷
visit.nasreco.com/tokai/mint-koshigaya/patients   → 利用者一覧
visit.nasreco.com/tokai/genki-kamifukuoka         → 元気クリニック上福岡

# 社会福祉総合研究所
visit.nasreco.com/shakenfuku                      → 本社ダッシュボード
visit.nasreco.com/shakenfuku/royal-omiya          → ロイヤルレジデンス大宮
visit.nasreco.com/shakenfuku/mint-iruma           → ミントクリニック入間
```

## 登録済みデータ

### 企業（Companies）

| 企業ID | 企業名 | slug | domain |
|--------|--------|------|--------|
| comp-nasreco | NASRECO訪問看護ステーション | nasreco | riker.replit.dev |
| comp-tokai | 東海グループ | tokai | nasreco.com |
| comp-shakenfuku | 社会福祉総合研究所 | shakenfuku | nasreco.com |

### 施設（Facilities）

#### 東海グループ（tokai）

| 施設名 | slug | 本社 | アクセスURL |
|--------|------|------|------------|
| 東海グループ本社 | headquarters | ✓ | /tokai |
| ミントクリニック越谷 | mint-koshigaya | - | /tokai/mint-koshigaya |
| 元気クリニック上福岡 | genki-kamifukuoka | - | /tokai/genki-kamifukuoka |
| ミントクリニック南浦和 | mint-minami | - | /tokai/mint-minami |

#### 社会福祉総合研究所（shakenfuku）

| 施設名 | slug | 本社 | アクセスURL |
|--------|------|------|------------|
| 社会福祉総合研究所本社 | headquarters | ✓ | /shakenfuku |
| ロイヤルレジデンス大宮 | royal-omiya | - | /shakenfuku/royal-omiya |
| ロイヤルレジデンス加須 | royal-kazo | - | /shakenfuku/royal-kazo |
| ミントクリニック入間 | mint-iruma | - | /shakenfuku/mint-iruma |

## テストユーザー

すべてのユーザーのパスワード: **password123**

| ユーザー名 | メール | 所属 | 役割 | アクセスレベル |
|-----------|--------|------|------|---------------|
| nurse.mint.koshigaya | nurse@mint-koshigaya.example.com | ミントクリニック越谷 | nurse | facility |
| admin.tokai | admin@tokai.example.com | 東海グループ本社 | corporate_admin | corporate |
| nurse.royal.omiya | nurse@royal-omiya.example.com | ロイヤルレジデンス大宮 | nurse | facility |

## 動作確認手順

### 1. レガシー方式（既存）

既存の `/patients` などのURLは引き続き動作します:

```
http://localhost:5000/
http://localhost:5000/patients
http://localhost:5000/users
```

### 2. パス方式（新規）

#### 施設スタッフのアクセス

```bash
# ミントクリニック越谷にアクセス
http://localhost:5000/tokai/mint-koshigaya

# ログイン
ユーザー名: nurse.mint.koshigaya
パスワード: password123

# アクセス可能なURL
http://localhost:5000/tokai/mint-koshigaya/patients
http://localhost:5000/tokai/mint-koshigaya/schedules
http://localhost:5000/tokai/mint-koshigaya/records
```

#### 本社管理者のアクセス

```bash
# 東海グループ本社にアクセス
http://localhost:5000/tokai

# ログイン
ユーザー名: admin.tokai
パスワード: password123

# 本社管理者は全施設にアクセス可能
http://localhost:5000/tokai/mint-koshigaya/patients
http://localhost:5000/tokai/genki-kamifukuoka/patients
http://localhost:5000/tokai/mint-minami/patients
```

### 3. API アクセス

#### レガシー方式

```bash
# 従来通り
GET http://localhost:5000/api/patients
```

#### パス方式

```bash
# 施設コンテキスト付き
GET http://localhost:5000/tokai/mint-koshigaya/api/patients

# 本社コンテキスト
GET http://localhost:5000/tokai/api/corporate/reports
```

## セキュリティ

### データ分離

- 施設スタッフは自分の施設のデータのみアクセス可能
- 他施設のデータは完全に分離
- URLで異なる施設を指定してもアクセス拒否

### 本社管理者の権限

- `corporate_admin` ロールかつ `corporate` アクセスレベル
- 本社（`is_headquarters: true`）に所属
- 同じ企業内の全施設にアクセス可能

### セッション管理

- ログイン時に `session.userId` と `session.facilityId` を保存
- パスの施設とセッションの施設が一致するかチェック
- 不一致の場合、企業管理者権限がなければアクセス拒否

## トラブルシューティング

### 404 Not Found

**原因**: 企業または施設が存在しない

**確認方法**:
```sql
-- 企業を確認
SELECT id, name, slug FROM companies;

-- 施設を確認
SELECT id, name, slug, company_id FROM facilities WHERE company_id = 'comp-tokai';
```

### 403 Forbidden

**原因**: ユーザーの施設とURLの施設が一致しない

**確認方法**:
```sql
-- ユーザーの所属施設を確認
SELECT u.username, u.facility_id, f.name, f.slug, c.slug as company_slug
FROM users u
JOIN facilities f ON u.facility_id = f.id
JOIN companies c ON f.company_id = c.id
WHERE u.username = 'nurse.mint.koshigaya';
```

### パスワードが合わない

テストユーザーのパスワードハッシュが正しく生成されていない可能性があります。

**解決方法**:
```bash
# Node.jsでパスワードハッシュを生成
node -e "const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync('password123', 10));"

# 生成されたハッシュでusersテーブルを更新
UPDATE users SET password = '<生成されたハッシュ>' WHERE username = 'nurse.mint.koshigaya';
```

## フロントエンド開発ガイド

### カスタムフックの使用

```tsx
import { useBasePath, useNavPath, useApiBasePath } from "@/hooks/useBasePath";

function MyComponent() {
  const basePath = useBasePath();           // "/tokai/mint-koshigaya"
  const patientsPath = useNavPath('/patients');  // "/tokai/mint-koshigaya/patients"
  const apiPath = useApiBasePath();         // "/tokai/mint-koshigaya/api"
  
  return (
    <div>
      <Link href={patientsPath}>利用者一覧</Link>
      <button onClick={() => fetch(`${apiPath}/patients`)}>データ取得</button>
    </div>
  );
}
```

### パスコンテキストの取得

```tsx
import { usePathContext } from "@/hooks/useBasePath";

function MyComponent() {
  const { companySlug, facilitySlug, basePath, isPathBased } = usePathContext();
  
  if (!isPathBased) {
    // レガシー方式
    return <div>従来のアクセス</div>;
  }
  
  return (
    <div>
      企業: {companySlug}<br/>
      施設: {facilitySlug || "本社"}<br/>
      ベースパス: {basePath}
    </div>
  );
}
```

## まとめ

- ✅ パス方式のマルチテナントが完全に実装されました
- ✅ 既存のレガシー方式も引き続き動作します
- ✅ 企業と施設のデータが登録されています
- ✅ テストユーザーが作成されています
- ✅ セキュリティとデータ分離が保証されています

詳細な実装については、以下のファイルを参照してください:

- [server/middleware/path-tenant.ts](../server/middleware/path-tenant.ts) - パステナント解決
- [server/middleware/path-security.ts](../server/middleware/path-security.ts) - セキュリティチェック
- [client/src/hooks/useBasePath.ts](../client/src/hooks/useBasePath.ts) - フロントエンド用フック
- [server/helpers/route-wrapper.ts](../server/helpers/route-wrapper.ts) - デュアルルート登録
