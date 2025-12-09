/**
 * 開発環境の新規テーブル（2つ）にデータを投入するスクリプト
 * 
 * 投入対象:
 * 1. receipt_special_note_codes
 * 2. work_related_reason_codes
 * 
 * 注意: visiting_nursing_master_basicは既にseed-master-data.tsで投入済み
 * 
 * 実行方法:
 *   npx tsx scripts/seed-new-master-tables-to-dev.ts
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import fs from 'fs';
import path from 'path';

neonConfig.webSocketConstructor = ws;

// 開発環境のデータベース接続文字列（DATABASE_URL環境変数から取得）
const DEV_DB_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_beoRr4gaQ5Dl@ep-polished-scene-a5twqv82.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function seedNewMasterTables() {
  console.log('🚀 開発環境の新規テーブルにデータを投入します...\n');
  console.log('⚠️  開発環境のデータベースに接続します\n');
  console.log('═'.repeat(80));
  
  const devPool = new Pool({ connectionString: DEV_DB_URL });

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
      
      await devPool.query(sql1);
      
      // 確認
      const count1 = await devPool.query(`
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
      
      await devPool.query(sql2);
      
      // 確認
      const count2 = await devPool.query(`
        SELECT COUNT(*) as count FROM work_related_reason_codes
      `);
      console.log(`   ✅ 投入完了: ${count2.rows[0].count}件`);
    }

    // まとめ
    console.log('\n📊 3. 投入結果の確認');
    console.log('─'.repeat(80));
    
    const count1 = await devPool.query(`SELECT COUNT(*) as count FROM receipt_special_note_codes`);
    const count2 = await devPool.query(`SELECT COUNT(*) as count FROM work_related_reason_codes`);
    
    console.log(`\n   receipt_special_note_codes: ${count1.rows[0].count}件`);
    console.log(`   work_related_reason_codes: ${count2.rows[0].count}件`);

    console.log('\n' + '═'.repeat(80));
    console.log('✅ データ投入が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await devPool.end();
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


































