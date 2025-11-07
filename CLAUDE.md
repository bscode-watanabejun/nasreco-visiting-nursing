# CLAUDE.md

このファイルはClaude Code (claude.ai/code) がこのリポジトリで作業する際のガイダンスを提供します。

## プロジェクト概要

医療管理システム（フルスタック）:
- **フロントエンド**: React 18 + TypeScript, Vite, Wouter ルーティング, TanStack Query, Radix UI + shadcn/ui コンポーネント, Tailwind CSS
- **バックエンド**: Express.js + TypeScript, Drizzle ORM, PostgreSQL (Neon), Express Session（PostgreSQLストア）
- **アーキテクチャ**: クライアント・サーバー型、共有スキーマ定義、マルチテナント施設対応

## 🚀 Quick Start
```bash
[DEVELOPMENT_COMMAND]  # Start development server (MANUAL EXECUTION ONLY)
```
- Frontend: [FRONTEND_URL]
- Backend: [BACKEND_URL]

**⚠️ 重要**: `[DEVELOPMENT_COMMAND]`は手動実行のみ。Claude Codeでは実行しない。
**✅ 必須**: 実装後は必ず高速エラーチェックを実施すること。

## ⚡ 高速エラーチェック
実装後の検証には以下の高速化手法を使用:
```bash
npm run check  # TypeScript型チェック（推奨：30秒以内）
npm run build  # 完全ビルド（時間要注意：フルビルドが必要な場合のみ）
```
**使い分け**:
- **通常の実装後**: `npm run check` で型エラーを高速検証
- **デプロイ前**: `npm run build` でフルビルドテスト
- **緊急修正**: `npm run check` で迅速確認

## 必須コマンド

### 開発
```bash
npm run dev          # 開発サーバー起動（tsx server/index.ts を NODE_ENV=development で実行）
npm run build        # クライアント（Vite）とサーバー（esbuild）を本番用にビルド
npm start           # 本番サーバー起動（NODE_ENV=production node dist/index.js）
npm run check       # TypeScript型チェック（tsc --noEmit）
npm run db:push     # Drizzleでデータベーススキーマ変更をPostgreSQLに反映
```
### データベース操作
- スキーマ変更は `/shared/schema.ts` 内の **Drizzle ORM** で管理
- スキーマを変更したら `npm run db:push` を実行し反映
- データベースは **Neon PostgreSQL serverless**（接続プール付き）を使用

### 必須環境変数
- `DATABASE_URL` - PostgreSQL接続文字列（必須）
- `SESSION_SECRET` - セッション暗号化用シークレット（必須）
- `PORT` - サーバーポート（デフォルト: 5000）
- `NODE_ENV` - 'development' または 'production' を設定

## アーキテクチャと主要パターン

### ディレクトリ構造
- `/client/src/` - Reactフロントエンドアプリケーション
  - `/components/` - Reactコンポーネント（shadcn/ui UIコンポーネント含む）
  - `/pages/` - ルーティング用ページコンポーネント
  - `/lib/` - ユーティリティとクライアント設定
  - `/hooks/` - カスタムReactフック
- `/server/` - Expressバックエンド
  - `index.ts` - サーバーエントリポイント（セッション、CSRF保護）
  - `routes.ts` - APIルート定義とビジネスロジック
  - `db.ts` - Drizzle ORMによるデータベース接続
  - `storage.ts` - ファイルストレージと管理ロジック
  - `vite.ts` - 開発用Vite統合
- `/shared/` - クライアント・サーバー共有コード
  - `schema.ts` - Drizzleスキーマ定義（DBの唯一の真実の源）

### マルチテナントアーキテクチャ
複数施設（テナント）対応、データ分離実装:
- 主要エンティティ（users、patients、records）すべてに`facilityId`フィールド
- 施設情報は`facilities`テーブルで管理
- セッションベース認証でユーザーの施設コンテキストを追跡

### 認証とセキュリティ
- express-sessionによるセッションベース認証（PostgreSQLストア）
- Originヘッダー検証によるCSRF保護（csurfパッケージは未使用のカスタム実装）
- セッションはPostgreSQL `session`テーブルに7日間の有効期限で保存
- bcryptjsによるパスワードハッシュ化
- ロールベースアクセス制御（admin、nurse、manager）

### データベーススキーマ管理
- PostgreSQL（Neonサーバーレス）でDrizzle ORM使用
- `/shared/schema.ts`でTypeScriptファーストでスキーマ定義
- `drizzle-kit push`コマンドでマイグレーション管理
- 主要テーブル: facilities、users、patients、nursing_records、visits、medications、test_results

### フロントエンド状態管理
- サーバー状態とデータフェッチにTanStack Query
- Reactフックでローカル状態管理
- テーマ設定はlocalStorageに永続化
- shadcn/ui toasterで通知表示

### APIパターン
- `/api/*`配下にRESTful APIエンドポイント
- JSONリクエスト/レスポンス形式
- 保護されたルートはセッションベース認証必須
- 開発環境では自動リクエストログ出力
- 適切なHTTPステータスコードでエラーハンドリング

### 開発サーバー
- ViteデブサーバーがHMRでクライアントを処理
- ExpressサーバーはtsxでTypeScriptを直接実行
- 開発環境ではViteがプロキシ設定を処理
- 単一ポートでAPIとクライアント両方を提供（デフォルト: 5000）

## 重要な実装詳細

### パスエイリアス
- `@/` → `./client/src/`
- `@shared/` → `./shared/`
- `@assets/` → `./attached_assets/`

### セッション設定
- connect-pg-simpleによるPostgreSQLバックドセッション
- セッションテーブルが存在しない場合は自動作成
- 本番環境ではセキュアクッキー（HTTPS限定）
- httpOnlyクッキー、sameSiteポリシーは'lax'

### ビルドプロセス
- クライアントはViteで`dist/public/`にビルド
- サーバーはesbuildで`dist/`にバンドル（ESM形式）
- サーバービルドでは外部パッケージはバンドルしない
- 本番環境では`dist/public/`から静的ファイルを提供

### 型安全性
- 厳格なTypeScript設定
- `/shared/`経由でクライアント・サーバー間で型共有
- drizzle-zodでDrizzleテーブルからZodスキーマ生成
- API入力の実行時バリデーション

## ⚠️ よくあるエラーと対処法

### shadcn/ui Selectコンポーネントの空文字列エラー

**エラーメッセージ:**
```
A <Select.Item /> must have a value prop that is not an empty string.
This is because the Select value can be set to an empty string to clear the selection and show the placeholder.
```

**原因:**
Radix UIのSelectコンポーネントは、空文字列 `""` を値として使用できません。プレースホルダーとクリア機能のために空文字列が予約されているためです。

**❌ 間違った実装:**
```tsx
<Select value={filter || ''} onValueChange={(v) => setFilter(v || null)}>
  <SelectContent>
    <SelectItem value="">すべて</SelectItem>  {/* ❌ エラー */}
    <SelectItem value="option1">オプション1</SelectItem>
  </SelectContent>
</Select>
```

**✅ 正しい実装:**
```tsx
// 状態を string 型で管理
const [filter, setFilter] = useState<string>('all')

<Select value={filter} onValueChange={setFilter}>
  <SelectContent>
    <SelectItem value="all">すべて</SelectItem>  {/* ✅ 正しい */}
    <SelectItem value="option1">オプション1</SelectItem>
  </SelectContent>
</Select>

// APIリクエスト時に 'all' を除外
const params = new URLSearchParams()
if (filter !== 'all') params.append("filter", filter)
```

**修正ポイント:**
1. **状態管理**: `null` や空文字列ではなく、`"all"` などの有効な文字列を使用
2. **SelectItem**: すべての選択肢に空でない値を設定
3. **APIロジック**: `filter !== 'all'` で条件分岐してパラメータに含めるか判定

**適用例:**
- フィルター選択（年月、保険種別、ステータス等）
- ドロップダウン選択（すべて/特定の値）
- 任意選択項目（未選択状態を表現する場合）

## Git運用ルール

**⚠️ 重要**: Git操作（コミット・プッシュ）は**ユーザーの明示的な指示があるまで実行しない**
- 実装完了後、`npm run check` で型チェックは実行する
- 変更内容の説明や確認は行う
- コミットメッセージの準備はする
- **ただし `git commit` コマンドはユーザーが「コミットして」と指示するまで実行しない**
- **`git push` コマンドもユーザーが「プッシュして」と指示するまで実行しない**
- コミットとプッシュを勝手に実行することは厳禁

## 📋 実装ロードマップ

訪問看護アプリとして実運用可能にするための必須機能実装計画は [/docs/implementation-roadmap.md](/docs/implementation-roadmap.md) を参照してください。

**現在のステータス**: Phase 1（法令遵守・保険請求の最低限実装）準備中