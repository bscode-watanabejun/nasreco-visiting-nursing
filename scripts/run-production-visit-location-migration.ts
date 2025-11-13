/**
 * 本番環境訪問場所コードマスタ更新スクリプト
 *
 * 訪問場所コードを本番環境に更新します。
 *
 * ⚠️ 警告: このスクリプトは本番データベースに書き込みを行います。
 *    ユーザーの明示的な承認なしに実行しないでください。
 *
 * 実行方法:
 *   PRODUCTION_DB_URL="postgresql://..." npx tsx scripts/run-production-visit-location-migration.ts
 */

import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

const PRODUCTION_DB_URL = process.env.PRODUCTION_DB_URL;
if (!PRODUCTION_DB_URL) {
  console.error('❌ PRODUCTION_DB_URL環境変数が設定されていません');
  process.exit(1);
}

async function updateVisitLocationCodes() {
  console.log('🚀 本番環境の訪問場所コードマスタ更新を開始します...\n');
  console.log('⚠️  本番環境のデータベースに接続します\n');

  const pool = new Pool({ connectionString: PRODUCTION_DB_URL });

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
    const client = await pool.connect();
    try {
      await client.query(sql);
      
      // 確認: 登録されたコード数を確認
      const result = await client.query<{ total_codes: number }>(
        `SELECT COUNT(*) as total_codes FROM visit_location_codes`
      );

      const count = result.rows[0]?.total_codes || 0;
      
      console.log('✅ 訪問場所コードマスタ更新が完了しました！');
      console.log(`📊 登録された訪問場所コード数: ${count}件\n`);

      if (count === 10) {
        console.log('✅ すべてのコードが正しく登録されました。');
        
        // コード一覧を表示
        const codesResult = await client.query<{ location_code: string; location_name: string }>(
          `SELECT location_code, location_name FROM visit_location_codes ORDER BY display_order`
        );
        console.log('\n登録されたコード一覧:');
        codesResult.rows.forEach(code => {
          console.log(`  ${code.location_code}: ${code.location_name}`);
        });
      } else {
        console.warn(`⚠️  警告: 期待されるコード数は10件ですが、実際には${count}件が登録されました。`);
      }
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// スクリプト実行
updateVisitLocationCodes()
  .then(() => {
    console.log('\n処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

