/**
 * 本番環境: 基準告示第2の1に規定する疾病等の有無コードマイグレーション実行スクリプト
 *
 * 本番環境のdoctorOrdersテーブルの既存レコードにデフォルト値'03'を設定します。
 *
 * ⚠️  警告: 本番データベースに書き込みを行います。
 *    ユーザーの明示的な承認後に実行してください。
 *
 * 実行方法:
 *   npx tsx scripts/run-production-disease-presence-code-migration.ts
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

// 本番環境のデータベース接続文字列
const PROD_DB_URL = 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function runProductionMigration() {
  console.log('🚀 本番環境: 基準告示第2の1に規定する疾病等の有無コードマイグレーションを開始します...\n');
  console.log('⚠️  本番データベースに接続します（書き込み操作）\n');
  console.log('═'.repeat(80));
  
  const prodPool = new Pool({ connectionString: PROD_DB_URL });

  try {
    // カラムの存在確認
    const columnCheck = await prodPool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = 'doctor_orders' 
        AND column_name = 'disease_presence_code'
    `);

    if (columnCheck.rows.length === 0) {
      throw new Error('disease_presence_codeカラムが存在しません。先にスキーマ変更を適用してください。');
    }

    console.log('✅ disease_presence_codeカラムが存在することを確認しました\n');

    // 更新前の統計を取得
    const beforeStats = await prodPool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN disease_presence_code IS NULL THEN 1 END) as null_count,
        COUNT(CASE WHEN disease_presence_code = '03' THEN 1 END) as default_count
      FROM doctor_orders
    `);

    const before = beforeStats.rows[0];
    console.log('📊 更新前の統計:');
    console.log(`   総レコード数: ${before.total}`);
    console.log(`   NULL値: ${before.null_count}`);
    console.log(`   デフォルト値'03'設定済み: ${before.default_count}\n`);

    if (parseInt(before.null_count) === 0) {
      console.log('✅ すべてのレコードに値が設定されています。マイグレーションは不要です。\n');
      return;
    }

    console.log('🔄 既存レコードを更新中...\n');

    // 既存レコードにデフォルト値'03'を設定
    const updateResult = await prodPool.query(`
      UPDATE doctor_orders
      SET disease_presence_code = '03'
      WHERE disease_presence_code IS NULL
    `);

    console.log(`✅ ${updateResult.rowCount}件のレコードを更新しました\n`);

    // 更新後の統計を取得
    const afterStats = await prodPool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN disease_presence_code IS NULL THEN 1 END) as null_count,
        COUNT(CASE WHEN disease_presence_code = '03' THEN 1 END) as default_count,
        COUNT(CASE WHEN disease_presence_code IN ('01', '02') THEN 1 END) as custom_count
      FROM doctor_orders
    `);

    const after = afterStats.rows[0];
    console.log('📊 更新後の統計:');
    console.log(`   総レコード数: ${after.total}`);
    console.log(`   NULL値: ${after.null_count}`);
    console.log(`   デフォルト値'03'設定済み: ${after.default_count}`);
    console.log(`   カスタム値（01/02）設定済み: ${after.custom_count}\n`);

    if (parseInt(after.null_count) === 0) {
      console.log('✅ すべてのレコードにデフォルト値が設定されました。\n');
    } else {
      console.warn(`⚠️  警告: ${after.null_count}件のレコードがNULLのままです。\n`);
    }

    // ソレア春日部のレコードも確認
    const soleraCheck = await prodPool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN disease_presence_code = '03' THEN 1 END) as default_count
      FROM doctor_orders
      WHERE facility_id = (
        SELECT id FROM facilities 
        WHERE (name LIKE '%ソレア%' OR name LIKE '%春日部%') 
          AND is_active = true 
        LIMIT 1
      )
    `);

    if (soleraCheck.rows[0].total > 0) {
      console.log('📊 ソレア春日部の訪問看護指示書:');
      console.log(`   総レコード数: ${soleraCheck.rows[0].total}`);
      console.log(`   デフォルト値'03'設定済み: ${soleraCheck.rows[0].default_count}\n`);
    }

    console.log('═'.repeat(80));
    console.log('✅ 本番環境マイグレーションが完了しました\n');

  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error);
    if (error instanceof Error) {
      console.error('エラーメッセージ:', error.message);
    }
    throw error;
  } finally {
    await prodPool.end();
  }
}

runProductionMigration()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('予期しないエラー:', error);
    process.exit(1);
  });




