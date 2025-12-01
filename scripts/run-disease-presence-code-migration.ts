/**
 * 基準告示第2の1に規定する疾病等の有無コードマイグレーション実行スクリプト
 *
 * doctorOrdersテーブルにdisease_presence_codeカラムを追加し、既存レコードにデフォルト値'03'を設定します。
 *
 * 実行方法:
 *   npx tsx scripts/run-disease-presence-code-migration.ts
 */

import fs from 'fs';
import path from 'path';
import { pool } from '../server/db';

async function runMigration() {
  console.log('🚀 基準告示第2の1に規定する疾病等の有無コードマイグレーションを開始します...\n');

  try {
    // SQLファイルを読み込む
    const migrationPath = path.join(process.cwd(), 'server/migrations/add-disease-presence-code-to-doctor-orders.sql');
    
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

      // 確認: カラムが正しく追加されたか確認
      const checkResult = await client.query(`
      SELECT 
        column_name, 
        data_type, 
        character_maximum_length,
        column_default,
        is_nullable
      FROM information_schema.columns
      WHERE table_name = 'doctor_orders' 
        AND column_name = 'disease_presence_code'
    `);

    if (checkResult.rows.length === 0) {
      throw new Error('カラムが追加されていません');
    }

    const columnInfo = checkResult.rows[0];
    console.log('✅ マイグレーションが完了しました！');
    console.log(`📊 カラム情報:`);
    console.log(`   - カラム名: ${columnInfo.column_name}`);
    console.log(`   - データ型: ${columnInfo.data_type}(${columnInfo.character_maximum_length})`);
    console.log(`   - デフォルト値: ${columnInfo.column_default}`);
    console.log(`   - NULL許可: ${columnInfo.is_nullable}\n`);

    // 既存レコードの確認
    const countResult = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN disease_presence_code = '03' THEN 1 END) as default_count,
        COUNT(CASE WHEN disease_presence_code IS NULL THEN 1 END) as null_count
      FROM doctor_orders
    `);

    const stats = countResult.rows[0];
    console.log('📊 既存レコードの統計:');
    console.log(`   - 総レコード数: ${stats.total}`);
    console.log(`   - デフォルト値'03'設定済み: ${stats.default_count}`);
    console.log(`   - NULL値: ${stats.null_count}\n`);

      if (parseInt(stats.null_count) > 0) {
        console.warn(`⚠️  警告: ${stats.null_count}件のレコードがNULLのままです。`);
      } else {
        console.log('✅ すべてのレコードにデフォルト値が設定されました。');
      }
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error);
    if (error instanceof Error) {
      console.error('エラーメッセージ:', error.message);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration()
  .then(() => {
    console.log('\n処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('予期しないエラー:', error);
    process.exit(1);
  });

