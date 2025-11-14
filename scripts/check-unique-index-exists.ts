/**
 * ユニークインデックスの存在確認スクリプト
 * 
 * 本番環境にユニークインデックスが既に存在するか確認します。
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';

const PROD_DB_URL = process.env.PRODUCTION_DB_URL || 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function checkUniqueIndexExists() {
  console.log('🔍 ユニークインデックスの存在を確認します...\n');
  console.log('⚠️  本番データベースに接続します\n');
  
  const pool = new Pool({ connectionString: PROD_DB_URL });
  const db = drizzle(pool);

  try {
    // 1. ユニークインデックスの確認
    console.log('📊 1. ユニークインデックスの確認:');
    console.log('─'.repeat(60));
    
    const indexes = await db.execute<{
      indexname: string;
      tablename: string;
      indexdef: string;
    }>(sql`
      SELECT
        indexname,
        tablename,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'bonus_calculation_history'
        AND indexname LIKE '%unique%'
      ORDER BY indexname
    `);
    
    console.log(`   ユニークインデックス数: ${indexes.rows.length}件\n`);
    
    if (indexes.rows.length > 0) {
      console.log('   ユニークインデックスの詳細:');
      indexes.rows.forEach((idx, index) => {
        console.log(`   ${index + 1}. ${idx.indexname}`);
        console.log(`      ${idx.indexdef}`);
      });
      console.log('');
      
      // 特定のインデックスが存在するか確認
      const targetIndex = indexes.rows.find(idx => 
        idx.indexname === 'unique_nursing_record_bonus_master'
      );
      
      if (targetIndex) {
        console.log('   ✅ unique_nursing_record_bonus_master インデックスが既に存在します。\n');
      } else {
        console.log('   ⚠️  unique_nursing_record_bonus_master インデックスは存在しません。\n');
      }
    } else {
      console.log('   ⚠️  ユニークインデックスは存在しません。\n');
    }

    // 2. bonus_calculation_historyテーブルの全インデックス確認
    console.log('📊 2. bonus_calculation_historyテーブルの全インデックス確認:');
    console.log('─'.repeat(60));
    
    const allIndexes = await db.execute<{
      indexname: string;
      tablename: string;
      indexdef: string;
    }>(sql`
      SELECT
        indexname,
        tablename,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'bonus_calculation_history'
      ORDER BY indexname
    `);
    
    console.log(`   全インデックス数: ${allIndexes.rows.length}件\n`);
    
    if (allIndexes.rows.length > 0) {
      allIndexes.rows.forEach((idx, index) => {
        console.log(`   ${index + 1}. ${idx.indexname}`);
        console.log(`      ${idx.indexdef.substring(0, 100)}...`);
      });
      console.log('');
    }

    // 3. 重複データの確認（念のため）
    console.log('📊 3. 重複データの確認（念のため）:');
    console.log('─'.repeat(60));
    
    const duplicates = await db.execute<{
      nursing_record_id: string;
      bonus_master_id: string;
      count: number;
    }>(sql`
      SELECT 
        nursing_record_id,
        bonus_master_id,
        COUNT(*) as count
      FROM bonus_calculation_history
      GROUP BY nursing_record_id, bonus_master_id
      HAVING COUNT(*) > 1
    `);
    
    const duplicateCount = duplicates.rows.length;
    
    if (duplicateCount === 0) {
      console.log('   ✅ 重複データは存在しません。\n');
    } else {
      console.log(`   ⚠️  重複データが ${duplicateCount}件 存在します。\n`);
    }

    console.log('─'.repeat(60));
    console.log('✅ ユニークインデックスの確認が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

checkUniqueIndexExists()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

