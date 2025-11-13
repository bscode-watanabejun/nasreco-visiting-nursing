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

### 🔄 サーバー再起動の要否ガイドライン

実装完了後に画面で確認する際の、サーバー再起動の要否を判断するガイドライン:

#### ✅ 再起動不要（自動反映される）

1. **フロントエンド（`client/src/`配下）**
   - Reactコンポーネント（`.tsx`ファイル）
   - スタイル（CSS/Tailwind）
   - フックやユーティリティ関数
   - **理由**: ViteのHMR（Hot Module Replacement）により自動反映

2. **バックエンド（`server/`配下）の一部**
   - ルートハンドラ内のロジック変更
   - ビジネスロジックの変更
   - **理由**: `tsx`がファイル変更を検知して自動再起動

#### ⚠️ 再起動が必要

1. **環境変数の変更**
   - `.env`ファイルや環境変数の変更
   - **理由**: 起動時に読み込まれるため

2. **データベーススキーマ変更（`shared/schema.ts`）**
   - テーブル定義の変更後は`npm run db:push`を実行
   - **理由**: スキーマ変更はDB反映が必要

3. **パッケージの追加・削除（`package.json`）**
   - `npm install`実行後
   - **理由**: 依存関係の変更を反映するため

4. **サーバー設定ファイルの変更**
   - `server/index.ts`の初期化処理
   - `server/vite.ts`の設定変更
   - **理由**: 起動時の設定変更のため

5. **`tsx`が自動再起動しない場合**
   - エラーで停止した場合
   - 変更が反映されない場合

#### 📝 実装後の確認フロー

```bash
# 1. 型チェック（高速）
npm run check

# 2. ブラウザで確認（自動反映されるはず）
# 反映されない場合はサーバー再起動

# 3. 必要に応じて再起動
# Ctrl+C で停止 → npm run dev で再起動
```

**重要**: 修正内容に応じて、ユーザーに再起動が必要かどうかを案内すること。

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

## 本番環境へのアクセス制限

**🚨 最重要**: 本番データベースへのアクセスと修正は**ユーザーの明示的な指示と承認があるまで絶対に実行しない**

### 禁止事項
- 本番DBへの接続（`PRODUCTION_DB_URL`環境変数を使用したスクリプトの実行）
- 本番DBへのデータ更新・削除・挿入操作
- 本番DBのスキーマ変更
- 本番DBのマスタデータ更新

### 許可される操作（ユーザー承認後）
- 本番DBの**読み取り専用**での確認（影響範囲の分析など）
- ユーザーが明示的に「本番DBを更新して」と指示した場合のみ、更新スクリプトの実行を許可

### 本番DB関連スクリプトの実行前チェック
本番DBに接続するスクリプト（`scripts/run-production-*.ts`など）を実行する前に、必ず以下を確認:
1. ユーザーが明示的に本番DBへのアクセスを承認しているか
2. 実行内容が読み取り専用か、更新操作か
3. 更新操作の場合は、影響範囲の分析結果をユーザーに提示済みか

### 本番DB接続の検出
スクリプト内で`PRODUCTION_DB_URL`環境変数や本番DBの接続文字列を検出した場合:
- **読み取り操作**: ユーザーに確認を求める
- **更新操作**: ユーザーの明示的な承認なしでは実行しない

## 📋 実装ロードマップ

訪問看護アプリとして実運用可能にするための必須機能実装計画は [/docs/implementation-roadmap.md](/docs/implementation-roadmap.md) を参照してください。

**現在のステータス**: Phase 1（法令遵守・保険請求の最低限実装）準備中