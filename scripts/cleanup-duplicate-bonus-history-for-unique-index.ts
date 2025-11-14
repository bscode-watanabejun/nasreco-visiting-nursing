/**
 * bonus_calculation_historyテーブルの重複データ解消スクリプト
 * 
 * ユニークインデックス追加前に重複データを解消します。
 * 各重複組み合わせについて、最新のレコードを残し、古いレコードを削除します。
 * 
 * ⚠️ 警告: このスクリプトは本番データベースに書き込みを行います。
 *    ユーザーの明示的な承認なしに実行しないでください。
 * 
 * 実行方法:
 *   PRODUCTION_DB_URL="postgresql://..." npx tsx scripts/cleanup-duplicate-bonus-history-for-unique-index.ts
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';

const PROD_DB_URL = process.env.PRODUCTION_DB_URL || 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function cleanupDuplicateBonusHistory() {
  console.log('🔧 bonus_calculation_historyテーブルの重複データを解消します...\n');
  console.log('⚠️  本番データベースに接続します\n');
  
  const pool = new Pool({ connectionString: PROD_DB_URL });
  const db = drizzle(pool);

  try {
    // 1. 重複データの確認
    console.log('📊 1. 重複データの確認:');
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
      ORDER BY count DESC
    `);
    
    const duplicateCount = duplicates.rows.length;
    const totalDuplicateRecords = duplicates.rows.reduce((sum, row) => sum + Number(row.count), 0);
    
    console.log(`   重複している組み合わせ数: ${duplicateCount}件`);
    console.log(`   重複しているレコード総数: ${totalDuplicateRecords}件\n`);
    
    if (duplicateCount === 0) {
      console.log('   ✅ 重複データは存在しません。');
      console.log('      ユニークインデックスの追加に問題ありません。\n');
      return;
    }
    
    console.log('   ⚠️  重複データが存在します。');
    console.log('      重複データを解消します。\n');

    // 2. 削除対象のレコードを特定（各重複組み合わせで最新のレコード以外を削除）
    console.log('📊 2. 削除対象のレコードを特定中...');
    console.log('─'.repeat(60));
    
    const recordsToDelete = await db.execute<{
      id: string;
      nursing_record_id: string;
      bonus_master_id: string;
      created_at: Date;
    }>(sql`
      WITH ranked_records AS (
        SELECT 
          id,
          nursing_record_id,
          bonus_master_id,
          created_at,
          ROW_NUMBER() OVER (
            PARTITION BY nursing_record_id, bonus_master_id 
            ORDER BY created_at DESC
          ) as rn
        FROM bonus_calculation_history
      )
      SELECT 
        id,
        nursing_record_id,
        bonus_master_id,
        created_at
      FROM ranked_records
      WHERE rn > 1
      ORDER BY nursing_record_id, bonus_master_id, created_at DESC
    `);
    
    const deleteCount = recordsToDelete.rows.length;
    console.log(`   削除対象のレコード数: ${deleteCount}件\n`);
    
    if (deleteCount === 0) {
      console.log('   ✅ 削除対象のレコードはありません。\n');
      return;
    }

    // 3. 削除対象のレコードの詳細表示（最初の10件）
    console.log('📊 3. 削除対象のレコードの詳細（最初の10件）:');
    console.log('─'.repeat(60));
    
    recordsToDelete.rows.slice(0, 10).forEach((row, index) => {
      console.log(`   ${index + 1}. ID: ${row.id}`);
      console.log(`      nursing_record_id: ${row.nursing_record_id}`);
      console.log(`      bonus_master_id: ${row.bonus_master_id}`);
      console.log(`      created_at: ${row.created_at}`);
    });
    
    if (deleteCount > 10) {
      console.log(`   ... 他 ${deleteCount - 10}件\n`);
    } else {
      console.log('');
    }

    // 4. 確認プロンプト
    console.log('⚠️  重複データを削除しますか？\n');
    
    const readline = await import('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>(resolve => {
      rl.question('続行しますか？ (yes/no): ', resolve);
    });
    rl.close();
    if (answer.toLowerCase() !== 'yes') {
      console.log('❌ 実行をキャンセルしました。');
      return;
    }
    console.log('');

    // 5. トランザクション内で削除実行
    console.log('📊 4. 重複データを削除中...');
    console.log('─'.repeat(60));
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const deleteIds = recordsToDelete.rows.map(r => r.id);
      
      // 削除を実行
      const result = await client.query(
        `DELETE FROM bonus_calculation_history
         WHERE id IN (${deleteIds.map((_, i) => `$${i + 1}`).join(', ')})`,
        deleteIds
      );
      
      const deletedCount = result.rowCount || 0;
      
      await client.query('COMMIT');
      
      console.log(`\n✅ 削除完了:`);
      console.log(`   削除件数: ${deletedCount}件\n`);

      // 6. 削除後の確認
      console.log('📊 5. 削除後の確認:');
      console.log('─'.repeat(60));
      
      const duplicatesAfter = await db.execute<{
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
      
      const duplicateCountAfter = duplicatesAfter.rows.length;
      
      console.log(`   削除後の重複組み合わせ数: ${duplicateCountAfter}件\n`);
      
      if (duplicateCountAfter === 0) {
        console.log('   ✅ 重複データがすべて解消されました。');
        console.log('      ユニークインデックスの追加に問題ありません。\n');
      } else {
        console.error(`   ❌ まだ ${duplicateCountAfter}件 の重複組み合わせが残っています。`);
        console.error('      手動で確認してください。\n');
      }

      // 7. 残存レコード数の確認
      const totalRecords = await db.execute<{ count: number }>(sql`
        SELECT COUNT(*) as count
        FROM bonus_calculation_history
      `);
      
      console.log(`   残存レコード数: ${totalRecords.rows[0]?.count || 0}件\n`);

      console.log('✅ 重複データの解消が完了しました。\n');

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

cleanupDuplicateBonusHistory()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

