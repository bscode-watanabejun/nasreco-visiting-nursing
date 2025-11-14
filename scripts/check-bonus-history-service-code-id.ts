/**
 * bonus_calculation_historyテーブルのservice_code_id確認スクリプト
 * 
 * 本番環境のbonus_calculation_historyテーブルのservice_code_idの状態を確認します。
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';

const PROD_DB_URL = process.env.PRODUCTION_DB_URL || 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function checkBonusHistoryServiceCodeId() {
  console.log('🔍 bonus_calculation_historyテーブルのservice_code_idを確認します...\n');
  console.log('⚠️  本番データベースに接続します\n');
  
  const pool = new Pool({ connectionString: PROD_DB_URL });
  const db = drizzle(pool);

  try {
    // 1. 全体の統計
    console.log('📊 1. service_code_idの統計:');
    console.log('─'.repeat(60));
    
    const stats = await db.execute<{
      total_count: number;
      null_count: number;
      not_null_count: number;
    }>(sql`
      SELECT 
        COUNT(*) as total_count,
        COUNT(*) FILTER (WHERE service_code_id IS NULL) as null_count,
        COUNT(*) FILTER (WHERE service_code_id IS NOT NULL) as not_null_count
      FROM bonus_calculation_history
    `);
    
    const total = Number(stats.rows[0]?.total_count || 0);
    const nullCount = Number(stats.rows[0]?.null_count || 0);
    const notNullCount = Number(stats.rows[0]?.not_null_count || 0);
    
    console.log(`   総レコード数: ${total}件`);
    console.log(`   service_code_idがNULL: ${nullCount}件`);
    console.log(`   service_code_idがNOT NULL: ${notNullCount}件\n`);
    
    if (notNullCount === 0) {
      console.log('   ✅ service_code_idは全てNULLです。\n');
    } else {
      console.log('   ⚠️  service_code_idが設定されているレコードが存在します。\n');
    }

    // 2. service_code_idが設定されているレコードの詳細
    if (notNullCount > 0) {
      console.log('📊 2. service_code_idが設定されているレコードの詳細:');
      console.log('─'.repeat(60));
      
      const recordsWithServiceCode = await db.execute<{
        id: string;
        nursing_record_id: string;
        bonus_master_id: string;
        service_code_id: string;
        created_at: Date;
      }>(sql`
        SELECT 
          id,
          nursing_record_id,
          bonus_master_id,
          service_code_id,
          created_at
        FROM bonus_calculation_history
        WHERE service_code_id IS NOT NULL
        ORDER BY created_at DESC
      `);
      
      console.log(`   service_code_idが設定されているレコード数: ${recordsWithServiceCode.rows.length}件\n`);
      
      recordsWithServiceCode.rows.forEach((row, index) => {
        console.log(`   ${index + 1}. ID: ${row.id}`);
        console.log(`      nursing_record_id: ${row.nursing_record_id}`);
        console.log(`      bonus_master_id: ${row.bonus_master_id}`);
        console.log(`      service_code_id: ${row.service_code_id}`);
        console.log(`      created_at: ${row.created_at}`);
      });
      console.log('');
    }

    // 3. 重複データのservice_code_idの状態
    console.log('📊 3. 重複データのservice_code_idの状態:');
    console.log('─'.repeat(60));
    
    const duplicateStats = await db.execute<{
      total_duplicate_records: number;
      null_in_duplicates: number;
      not_null_in_duplicates: number;
    }>(sql`
      WITH duplicates AS (
        SELECT 
          id,
          service_code_id
        FROM bonus_calculation_history
        WHERE (nursing_record_id, bonus_master_id) IN (
          SELECT nursing_record_id, bonus_master_id
          FROM bonus_calculation_history
          GROUP BY nursing_record_id, bonus_master_id
          HAVING COUNT(*) > 1
        )
      )
      SELECT 
        COUNT(*) as total_duplicate_records,
        COUNT(*) FILTER (WHERE service_code_id IS NULL) as null_in_duplicates,
        COUNT(*) FILTER (WHERE service_code_id IS NOT NULL) as not_null_in_duplicates
      FROM duplicates
    `);
    
    const totalDup = Number(duplicateStats.rows[0]?.total_duplicate_records || 0);
    const nullInDup = Number(duplicateStats.rows[0]?.null_in_duplicates || 0);
    const notNullInDup = Number(duplicateStats.rows[0]?.not_null_in_duplicates || 0);
    
    console.log(`   重複レコード総数: ${totalDup}件`);
    console.log(`   重複レコード内でservice_code_idがNULL: ${nullInDup}件`);
    console.log(`   重複レコード内でservice_code_idがNOT NULL: ${notNullInDup}件\n`);

    // 4. 重複データの中でservice_code_idが設定されているレコードの確認
    if (notNullInDup > 0) {
      console.log('📊 4. 重複データの中でservice_code_idが設定されているレコード:');
      console.log('─'.repeat(60));
      
      const duplicatesWithServiceCode = await db.execute<{
        id: string;
        nursing_record_id: string;
        bonus_master_id: string;
        service_code_id: string;
        created_at: Date;
      }>(sql`
        WITH duplicates AS (
          SELECT 
            id,
            nursing_record_id,
            bonus_master_id,
            service_code_id,
            created_at
          FROM bonus_calculation_history
          WHERE (nursing_record_id, bonus_master_id) IN (
            SELECT nursing_record_id, bonus_master_id
            FROM bonus_calculation_history
            GROUP BY nursing_record_id, bonus_master_id
            HAVING COUNT(*) > 1
          )
        )
        SELECT *
        FROM duplicates
        WHERE service_code_id IS NOT NULL
        ORDER BY nursing_record_id, bonus_master_id, created_at DESC
      `);
      
      console.log(`   重複データ内でservice_code_idが設定されているレコード数: ${duplicatesWithServiceCode.rows.length}件\n`);
      
      duplicatesWithServiceCode.rows.forEach((row, index) => {
        console.log(`   ${index + 1}. ID: ${row.id}`);
        console.log(`      nursing_record_id: ${row.nursing_record_id}`);
        console.log(`      bonus_master_id: ${row.bonus_master_id}`);
        console.log(`      service_code_id: ${row.service_code_id}`);
        console.log(`      created_at: ${row.created_at}`);
      });
      console.log('');
    }

    // 5. 結論
    console.log('📊 5. 結論:');
    console.log('─'.repeat(60));
    
    if (notNullCount === 0) {
      console.log('\n   ✅ service_code_idは全てNULLです。');
      console.log('      重複データの解消時にservice_code_idを考慮する必要はありません。');
      console.log('      最新のレコードを残す方針で問題ありません。\n');
    } else {
      console.log('\n   ⚠️  service_code_idが設定されているレコードが存在します。');
      console.log('      重複データの解消時に、service_code_idが設定されているレコードを優先する必要があるかもしれません。\n');
    }

    console.log('─'.repeat(60));
    console.log('✅ service_code_idの確認が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

checkBonusHistoryServiceCodeId()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

