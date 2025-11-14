/**
 * 訪問場所コードマイグレーション実行スクリプト
 *
 * 訪問場所コードを公式の別表16に準拠した形式に更新します。
 *
 * 実行方法:
 *   npx tsx scripts/run-visit-location-migration.ts
 */

import fs from 'fs';
import path from 'path';
import { db, pool } from '../server/db';

async function runMigration() {
  console.log('🚀 訪問場所コードマイグレーションを開始します...\n');

  try {
    // SQLファイルを読み込む
    const migrationPath = path.join(process.cwd(), 'server/migrations/fix-visit-location-codes.sql');
    
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`マイグレーションファイルが見つかりません: ${migrationPath}`);
    }

    const sql = fs.readFileSync(migrationPath, 'utf-8');
    
    console.log('📄 マイグレーションSQLを読み込みました');
    console.log('🔄 データベースを更新中...\n');

    // SQLを実行（トランザクション内で実行される）
    // 複数のSQL文を含む場合は、クライアントのqueryメソッドを直接使用
    const client = await pool.connect();
    try {
      await client.query(sql);
    } finally {
      client.release();
    }

    // 確認: 登録されたコード数を確認
    const result = await db.execute<{ total_codes: number }>(
      `SELECT COUNT(*) as total_codes FROM visit_location_codes`
    );

    const count = result.rows[0]?.total_codes || 0;
    
    console.log('✅ マイグレーションが完了しました！');
    console.log(`📊 登録された訪問場所コード数: ${count}件\n`);

    // 実際のコード数は10件
    if (count === 10) {
      console.log('✅ すべてのコードが正しく登録されました。');
    } else {
      console.warn(`⚠️  警告: 期待されるコード数は10件ですが、実際には${count}件が登録されました。`);
    }

  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error);
    throw error;
  } finally {
    // 接続を閉じる
    await pool.end();
  }
}

// スクリプト実行
runMigration()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

