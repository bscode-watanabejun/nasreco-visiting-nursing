/**
 * 本番環境の新規テーブル（3つ）にデータを投入するスクリプト
 * 
 * 投入対象:
 * 1. receipt_special_note_codes
 * 2. work_related_reason_codes
 * 3. visiting_nursing_master_basic
 * 
 * ⚠️ 警告: このスクリプトは本番データベースに書き込みを行います。
 * 
 * 実行方法:
 *   npx tsx scripts/seed-new-master-tables-to-production.ts
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import fs from 'fs';
import path from 'path';

neonConfig.webSocketConstructor = ws;

// 本番環境のデータベース接続文字列
const PROD_DB_URL = 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function seedNewMasterTables() {
  console.log('🚀 本番環境の新規テーブルにデータを投入します...\n');
  console.log('⚠️  本番データベースに接続します\n');
  console.log('═'.repeat(80));
  
  const prodPool = new Pool({ connectionString: PROD_DB_URL });

  try {
    // 1. receipt_special_note_codes への投入
    console.log('\n📊 1. receipt_special_note_codes へのデータ投入');
    console.log('─'.repeat(80));
    
    const sqlFile1 = path.join(process.cwd(), 'server/migrations/add-receipt-special-note-codes.sql');
    
    if (!fs.existsSync(sqlFile1)) {
      console.log(`   ❌ SQLファイルが見つかりません: ${sqlFile1}`);
    } else {
      const sql1 = fs.readFileSync(sqlFile1, 'utf-8');
      console.log('   SQLファイルを読み込みました');
      console.log('   データを投入中...\n');
      
      await prodPool.query(sql1);
      
      // 確認
      const count1 = await prodPool.query(`
        SELECT COUNT(*) as count FROM receipt_special_note_codes
      `);
      console.log(`   ✅ 投入完了: ${count1.rows[0].count}件`);
    }

    // 2. work_related_reason_codes への投入
    console.log('\n📊 2. work_related_reason_codes へのデータ投入');
    console.log('─'.repeat(80));
    
    const sqlFile2 = path.join(process.cwd(), 'server/migrations/add-work-related-reason-codes.sql');
    
    if (!fs.existsSync(sqlFile2)) {
      console.log(`   ❌ SQLファイルが見つかりません: ${sqlFile2}`);
    } else {
      const sql2 = fs.readFileSync(sqlFile2, 'utf-8');
      console.log('   SQLファイルを読み込みました');
      console.log('   データを投入中...\n');
      
      await prodPool.query(sql2);
      
      // 確認
      const count2 = await prodPool.query(`
        SELECT COUNT(*) as count FROM work_related_reason_codes
      `);
      console.log(`   ✅ 投入完了: ${count2.rows[0].count}件`);
    }

    // 3. visiting_nursing_master_basic への投入
    console.log('\n📊 3. visiting_nursing_master_basic へのデータ投入');
    console.log('─'.repeat(80));
    console.log('   ⚠️  このテーブルはseed-master-data.tsスクリプトで投入します');
    console.log('   別途実行が必要です。\n');

    // まとめ
    console.log('\n📊 4. 投入結果の確認');
    console.log('─'.repeat(80));
    
    const count1 = await prodPool.query(`SELECT COUNT(*) as count FROM receipt_special_note_codes`);
    const count2 = await prodPool.query(`SELECT COUNT(*) as count FROM work_related_reason_codes`);
    const count3 = await prodPool.query(`SELECT COUNT(*) as count FROM visiting_nursing_master_basic`);
    
    console.log(`\n   receipt_special_note_codes: ${count1.rows[0].count}件`);
    console.log(`   work_related_reason_codes: ${count2.rows[0].count}件`);
    console.log(`   visiting_nursing_master_basic: ${count3.rows[0].count}件`);

    console.log('\n' + '═'.repeat(80));
    console.log('✅ SQLマイグレーションファイルによる投入が完了しました\n');
    console.log('📋 次のステップ:');
    console.log('   visiting_nursing_master_basicへの投入は、以下のコマンドで実行してください:');
    console.log('   DATABASE_URL="本番環境の接続文字列" npx tsx scripts/seed-master-data.ts\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prodPool.end();
  }
}

seedNewMasterTables()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('処理中にエラーが発生しました:', error);
    process.exit(1);
  });






































