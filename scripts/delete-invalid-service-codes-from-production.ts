/**
 * 本番環境から無効なサービスコード（「31」で始まる誤ったコード）を削除するスクリプト
 * 
 * ⚠️ 警告: このスクリプトは本番データベースに書き込みを行います。
 *    ユーザーの明示的な承認が必要です。
 * 
 * 実行方法:
 *   npx tsx scripts/delete-invalid-service-codes-from-production.ts
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

// 本番環境のデータベース接続文字列
const PROD_DB_URL = 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function deleteInvalidServiceCodes() {
  console.log('🗑️  本番環境から無効なサービスコードを削除します...\n');
  console.log('⚠️  本番データベースに接続します\n');
  console.log('═'.repeat(80));
  
  const prodPool = new Pool({ connectionString: PROD_DB_URL });

  try {
    // 1. 削除対象のサービスコードを確認
    console.log('\n📊 1. 削除対象のサービスコードを確認');
    console.log('─'.repeat(80));
    
    const invalidCodes = await prodPool.query(`
      SELECT id, service_code, service_name, insurance_type, points, is_active
      FROM nursing_service_codes
      WHERE service_code LIKE '31%'
      ORDER BY service_code
    `);
    
    console.log(`   削除対象: ${invalidCodes.rows.length}件\n`);
    
    if (invalidCodes.rows.length === 0) {
      console.log('   ✅ 削除対象のサービスコードはありません\n');
      return;
    }
    
    console.log('   詳細:');
    invalidCodes.rows.forEach((code: any, index: number) => {
      const status = code.is_active ? '✅有効' : '❌無効';
      console.log(`   ${index + 1}. ${code.service_code} - ${code.service_name.substring(0, 50)}... (${code.insurance_type}, ${code.points}点, ${status})`);
    });

    // 2. これらのサービスコードが使用されているか確認
    console.log('\n📊 2. 使用状況の確認');
    console.log('─'.repeat(80));
    
    const serviceCodeIds = invalidCodes.rows.map((r: any) => r.id);
    const placeholders = serviceCodeIds.map((_, i) => `$${i + 1}`).join(',');
    
    const usedInRecords = await prodPool.query(`
      SELECT COUNT(*) as count
      FROM nursing_records
      WHERE service_code_id IN (${placeholders})
    `, serviceCodeIds);
    
    const usedInBonusHistory = await prodPool.query(`
      SELECT COUNT(*) as count
      FROM bonus_calculation_history
      WHERE service_code_id IN (${placeholders})
    `, serviceCodeIds);
    
    // visiting_nursing_master_basicテーブルが存在するか確認
    let usedInMasterBasic = { rows: [{ count: '0' }] };
    try {
      usedInMasterBasic = await prodPool.query(`
        SELECT COUNT(*) as count
        FROM visiting_nursing_master_basic
        WHERE service_code_id IN (${placeholders})
      `, serviceCodeIds);
    } catch (error: any) {
      // テーブルが存在しない場合は0件として扱う
      if (error.code === '42P01') {
        console.log('   visiting_nursing_master_basicテーブルは存在しません（スキップ）');
      } else {
        throw error;
      }
    }
    
    const totalUsed = parseInt(usedInRecords.rows[0].count) + 
                      parseInt(usedInBonusHistory.rows[0].count) + 
                      parseInt(usedInMasterBasic.rows[0].count);
    
    console.log(`   nursing_recordsでの使用: ${usedInRecords.rows[0].count}件`);
    console.log(`   bonus_calculation_historyでの使用: ${usedInBonusHistory.rows[0].count}件`);
    console.log(`   visiting_nursing_master_basicでの使用: ${usedInMasterBasic.rows[0].count}件`);
    console.log(`   合計: ${totalUsed}件\n`);
    
    if (totalUsed > 0) {
      console.log('   ⚠️  警告: これらのサービスコードは使用されています！');
      console.log('      削除前に参照を確認してください。\n');
      
      // 使用されているサービスコードの詳細を表示
      if (parseInt(usedInRecords.rows[0].count) > 0) {
        const usedCodes = await prodPool.query(`
          SELECT DISTINCT nsc.service_code, nsc.service_name, COUNT(*) as count
          FROM nursing_records nr
          JOIN nursing_service_codes nsc ON nr.service_code_id = nsc.id
          WHERE nr.service_code_id IN (${placeholders})
          GROUP BY nsc.service_code, nsc.service_name
          ORDER BY count DESC
        `, serviceCodeIds);
        
        console.log('   nursing_recordsで使用されているサービスコード:');
        usedCodes.rows.forEach((code: any) => {
          console.log(`     - ${code.service_code}: ${code.count}件`);
        });
        console.log('');
      }
      
      console.log('   ⚠️  削除を中止します。');
      console.log('      参照を削除または更新してから再度実行してください。\n');
      return;
    }

    // 3. 削除の実行
    console.log('📊 3. 削除の実行');
    console.log('─'.repeat(80));
    
    console.log('   削除を開始します...\n');
    
    // 使用されていない場合は削除を実行
    if (totalUsed === 0) {
      const deleteResult = await prodPool.query(`
        DELETE FROM nursing_service_codes
        WHERE service_code LIKE '31%'
        RETURNING service_code, service_name
      `);
      
      console.log(`   ✅ 削除完了: ${deleteResult.rows.length}件\n`);
      console.log('   削除されたサービスコード:');
      deleteResult.rows.forEach((code: any, index: number) => {
        console.log(`   ${index + 1}. ${code.service_code} - ${code.service_name.substring(0, 50)}...`);
      });
    } else {
      console.log('   ⚠️  使用されているため、削除をスキップします。');
    }

    // 4. 削除後の確認
    console.log('\n📊 4. 削除後の確認');
    console.log('─'.repeat(80));
    
    const remainingInvalidCodes = await prodPool.query(`
      SELECT COUNT(*) as count
      FROM nursing_service_codes
      WHERE service_code LIKE '31%'
    `);
    
    const totalServiceCodes = await prodPool.query(`
      SELECT COUNT(*) as count
      FROM nursing_service_codes
    `);
    
    console.log(`   残っている「31」で始まるサービスコード: ${remainingInvalidCodes.rows[0].count}件`);
    console.log(`   サービスコード総数: ${totalServiceCodes.rows[0].count}件\n`);

    console.log('\n' + '═'.repeat(80));
    console.log('✅ 処理が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prodPool.end();
  }
}

deleteInvalidServiceCodes()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('処理中にエラーが発生しました:', error);
    process.exit(1);
  });

