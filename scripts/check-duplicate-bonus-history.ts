/**
 * bonus_calculation_historyテーブルの重複データ確認スクリプト
 * 
 * 本番環境のbonus_calculation_historyテーブルに重複データが存在するか確認します。
 * 重複の定義: 同じnursing_record_idとbonus_master_idの組み合わせが複数存在すること
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';

const PROD_DB_URL = process.env.PRODUCTION_DB_URL || 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function checkDuplicateBonusHistory() {
  console.log('🔍 bonus_calculation_historyテーブルの重複データを確認します...\n');
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
      ids: string[];
    }>(sql`
      SELECT 
        nursing_record_id,
        bonus_master_id,
        COUNT(*) as count,
        array_agg(id ORDER BY created_at) as ids
      FROM bonus_calculation_history
      GROUP BY nursing_record_id, bonus_master_id
      HAVING COUNT(*) > 1
      ORDER BY count DESC, nursing_record_id
    `);
    
    const duplicateCount = duplicates.rows.length;
    const totalDuplicateRecords = duplicates.rows.reduce((sum, row) => sum + Number(row.count), 0);
    
    console.log(`   重複している組み合わせ数: ${duplicateCount}件`);
    console.log(`   重複しているレコード総数: ${totalDuplicateRecords}件\n`);
    
    if (duplicateCount === 0) {
      console.log('   ✅ 重複データは存在しません。');
      console.log('      ユニークインデックスの追加に問題ありません。\n');
    } else {
      console.log('   ⚠️  重複データが存在します。');
      console.log('      ユニークインデックスを追加する前に重複データを解消する必要があります。\n');
      
      // 2. 重複データの詳細表示
      console.log('📊 2. 重複データの詳細:');
      console.log('─'.repeat(60));
      
      duplicates.rows.slice(0, 20).forEach((row, index) => {
        console.log(`\n   ${index + 1}. 重複組み合わせ:`);
        console.log(`      nursing_record_id: ${row.nursing_record_id}`);
        console.log(`      bonus_master_id: ${row.bonus_master_id}`);
        console.log(`      重複件数: ${row.count}件`);
        console.log(`      レコードID: ${row.ids.join(', ')}`);
      });
      
      if (duplicateCount > 20) {
        console.log(`\n   ... 他 ${duplicateCount - 20}件の重複組み合わせ\n`);
      }
      
      // 3. 重複データの詳細情報を取得
      console.log('📊 3. 重複データの詳細情報:');
      console.log('─'.repeat(60));
      
      const duplicateIds = duplicates.rows.flatMap(row => row.ids);
      
      if (duplicateIds.length > 0) {
        const duplicateDetails = await db.execute<{
          id: string;
          nursing_record_id: string;
          bonus_master_id: string;
          calculated_points: number;
          created_at: Date;
          service_code_id: string | null;
        }>(sql`
          SELECT 
            id,
            nursing_record_id,
            bonus_master_id,
            calculated_points,
            created_at,
            service_code_id
          FROM bonus_calculation_history
          WHERE id IN (${sql.join(duplicateIds.map(id => sql`${id}`), sql`, `)})
          ORDER BY nursing_record_id, bonus_master_id, created_at
        `);
        
        console.log(`\n   重複レコードの詳細（最初の10件）:`);
        duplicateDetails.rows.slice(0, 10).forEach((row, index) => {
          console.log(`\n   ${index + 1}. レコードID: ${row.id}`);
          console.log(`      nursing_record_id: ${row.nursing_record_id}`);
          console.log(`      bonus_master_id: ${row.bonus_master_id}`);
          console.log(`      calculated_points: ${row.calculated_points}`);
          console.log(`      service_code_id: ${row.service_code_id || '(null)'}`);
          console.log(`      created_at: ${row.created_at}`);
        });
        
        if (duplicateDetails.rows.length > 10) {
          console.log(`\n   ... 他 ${duplicateDetails.rows.length - 10}件の重複レコード\n`);
        }
      }
      
      // 4. 重複データの解消方法の提案
      console.log('\n📊 4. 重複データの解消方法:');
      console.log('─'.repeat(60));
      
      console.log('\n【推奨方法】');
      console.log('   1. 各重複組み合わせについて、最新のレコードを残し、古いレコードを削除');
      console.log('   2. または、各重複組み合わせについて、最も適切なレコードを残し、他のレコードを削除');
      console.log('   3. 重複データを解消した後、ユニークインデックスを追加\n');
      
      console.log('【注意事項】');
      console.log('   - 重複データを削除する前に、どのレコードを残すか慎重に判断してください');
      console.log('   - 削除するレコードのIDを記録しておくことを推奨します');
      console.log('   - バックアップを取得してから削除を実行してください\n');
    }

    // 5. ユニークインデックスの追加可能性の確認
    console.log('📊 5. ユニークインデックスの追加可能性:');
    console.log('─'.repeat(60));
    
    if (duplicateCount === 0) {
      console.log('\n   ✅ ユニークインデックスを追加できます。');
      console.log('      重複データが存在しないため、問題なく追加できます。\n');
    } else {
      console.log('\n   ❌ ユニークインデックスを追加できません。');
      console.log('      重複データが存在するため、先に重複データを解消する必要があります。');
      console.log(`      重複組み合わせ数: ${duplicateCount}件`);
      console.log(`      重複レコード総数: ${totalDuplicateRecords}件\n`);
    }

    console.log('─'.repeat(60));
    console.log('✅ 重複データの確認が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

checkDuplicateBonusHistory()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

