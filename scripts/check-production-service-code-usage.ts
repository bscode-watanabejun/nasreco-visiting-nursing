/**
 * 本番環境のサービスコード使用状況確認スクリプト
 * 
 * 確認内容:
 * 1. サービスコードマスタの現状（件数、コードの種類など）
 * 2. 訪問記録（nursing_records）で使用されているサービスコードIDとその件数
 * 3. 加算計算履歴（bonus_calculation_history）で使用されているサービスコードIDとその件数
 * 4. 使用されているサービスコードがマスタに存在するかどうか
 *
 * ⚠️ 注意: このスクリプトは本番データベースに読み取りアクセスを行います。
 *    ユーザーの承認がある場合のみ実行してください。
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { nursingServiceCodes, nursingRecords, bonusCalculationHistory } from '../shared/schema';
import { sql } from 'drizzle-orm';

const PRODUCTION_DB_URL = process.env.PRODUCTION_DB_URL || 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function checkProductionServiceCodeUsage() {
  console.log('🔍 本番環境のサービスコード使用状況を確認します...\n');
  console.log('⚠️  本番データベースに接続します\n');
  
  const pool = new Pool({ connectionString: PRODUCTION_DB_URL });
  const db = drizzle(pool);

  try {
    // 1. サービスコードマスタの現状確認
    console.log('📊 1. サービスコードマスタの現状');
    console.log('─'.repeat(60));
    const allServiceCodes = await db.select().from(nursingServiceCodes);
    const activeServiceCodes = allServiceCodes.filter(code => code.isActive);
    const inactiveServiceCodes = allServiceCodes.filter(code => !code.isActive);
    
    console.log(`総サービスコード数: ${allServiceCodes.length}件`);
    console.log(`有効なサービスコード: ${activeServiceCodes.length}件`);
    console.log(`無効なサービスコード: ${inactiveServiceCodes.length}件`);
    
    // サービスコードの先頭2桁別集計
    const codePrefixCounts: Record<string, number> = {};
    allServiceCodes.forEach(code => {
      const prefix = code.serviceCode.substring(0, 2);
      codePrefixCounts[prefix] = (codePrefixCounts[prefix] || 0) + 1;
    });
    
    console.log('\nサービスコードの先頭2桁別集計:');
    Object.entries(codePrefixCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([prefix, count]) => {
        console.log(`  ${prefix}xx: ${count}件`);
      });
    
    // 31から始まるコード（誤ったコード）の確認
    const wrongCodes = allServiceCodes.filter(code => code.serviceCode.startsWith('31'));
    if (wrongCodes.length > 0) {
      console.log(`\n⚠️  31から始まる誤ったコード: ${wrongCodes.length}件`);
      console.log('   例:');
      wrongCodes.slice(0, 5).forEach(code => {
        console.log(`     ${code.serviceCode} - ${code.serviceName.substring(0, 50)}... (isActive: ${code.isActive})`);
      });
      if (wrongCodes.length > 5) {
        console.log(`     ... 他 ${wrongCodes.length - 5}件`);
      }
    }
    
    // 51から始まるコード（正しいコード）の確認
    const correctCodes = allServiceCodes.filter(code => code.serviceCode.startsWith('51'));
    console.log(`\n✅ 51から始まる正しいコード: ${correctCodes.length}件`);
    if (correctCodes.length > 0) {
      console.log('   例:');
      correctCodes.slice(0, 5).forEach(code => {
        console.log(`     ${code.serviceCode} - ${code.serviceName.substring(0, 50)}... (isActive: ${code.isActive})`);
      });
      if (correctCodes.length > 5) {
        console.log(`     ... 他 ${correctCodes.length - 5}件`);
      }
    }
    console.log('');

    // 2. 訪問記録で使用されているサービスコードID
    console.log('📊 2. 訪問記録（nursing_records）で使用されているサービスコード');
    console.log('─'.repeat(60));
    const recordServiceCodeUsage = await db.execute<{
      service_code_id: string | null;
      count: number;
    }>(sql`
      SELECT service_code_id, COUNT(*) as count
      FROM nursing_records
      WHERE service_code_id IS NOT NULL
      GROUP BY service_code_id
      ORDER BY count DESC
    `);
    
    console.log(`サービスコードが設定されている訪問記録数: ${recordServiceCodeUsage.rows.reduce((sum, row) => sum + Number(row.count), 0)}件`);
    
    const recordsWithNullServiceCode = await db.execute<{ count: string }>(sql`
      SELECT COUNT(*) as count
      FROM nursing_records
      WHERE service_code_id IS NULL
    `);
    console.log(`サービスコードが未設定の訪問記録: ${recordsWithNullServiceCode.rows[0]?.count || 0}件`);
    
    if (recordServiceCodeUsage.rows.length > 0) {
      console.log('\n使用されているサービスコードID（上位10件）:');
      for (let i = 0; i < Math.min(10, recordServiceCodeUsage.rows.length); i++) {
        const row = recordServiceCodeUsage.rows[i];
        const serviceCode = allServiceCodes.find(sc => sc.id === row.service_code_id);
        if (serviceCode) {
          const status = serviceCode.isActive ? '✅' : '⚠️';
          console.log(`  ${status} ID: ${row.service_code_id?.substring(0, 8)}...`);
          console.log(`     コード: ${serviceCode.serviceCode} - ${serviceCode.serviceName.substring(0, 50)}...`);
          console.log(`     使用件数: ${row.count}件`);
        } else {
          console.log(`  ❌ ID: ${row.service_code_id?.substring(0, 8)}... (マスタに存在しない)`);
          console.log(`     使用件数: ${row.count}件`);
        }
      }
      if (recordServiceCodeUsage.rows.length > 10) {
        console.log(`  ... 他 ${recordServiceCodeUsage.rows.length - 10}件のサービスコードID`);
      }
    }
    console.log('');

    // 3. 加算計算履歴で使用されているサービスコードID
    console.log('📊 3. 加算計算履歴（bonus_calculation_history）で使用されているサービスコード');
    console.log('─'.repeat(60));
    const bonusServiceCodeUsage = await db.execute<{
      service_code_id: string | null;
      count: number;
    }>(sql`
      SELECT service_code_id, COUNT(*) as count
      FROM bonus_calculation_history
      WHERE service_code_id IS NOT NULL
      GROUP BY service_code_id
      ORDER BY count DESC
    `);
    
    console.log(`サービスコードが設定されている加算計算履歴数: ${bonusServiceCodeUsage.rows.reduce((sum, row) => sum + Number(row.count), 0)}件`);
    
    const bonusesWithNullServiceCode = await db.execute<{ count: string }>(sql`
      SELECT COUNT(*) as count
      FROM bonus_calculation_history
      WHERE service_code_id IS NULL
    `);
    console.log(`サービスコードが未設定の加算計算履歴: ${bonusesWithNullServiceCode.rows[0]?.count || 0}件`);
    
    if (bonusServiceCodeUsage.rows.length > 0) {
      console.log('\n使用されているサービスコードID（上位10件）:');
      for (let i = 0; i < Math.min(10, bonusServiceCodeUsage.rows.length); i++) {
        const row = bonusServiceCodeUsage.rows[i];
        const serviceCode = allServiceCodes.find(sc => sc.id === row.service_code_id);
        if (serviceCode) {
          const status = serviceCode.isActive ? '✅' : '⚠️';
          console.log(`  ${status} ID: ${row.service_code_id?.substring(0, 8)}...`);
          console.log(`     コード: ${serviceCode.serviceCode} - ${serviceCode.serviceName.substring(0, 50)}...`);
          console.log(`     使用件数: ${row.count}件`);
        } else {
          console.log(`  ❌ ID: ${row.service_code_id?.substring(0, 8)}... (マスタに存在しない)`);
          console.log(`     使用件数: ${row.count}件`);
        }
      }
      if (bonusServiceCodeUsage.rows.length > 10) {
        console.log(`  ... 他 ${bonusServiceCodeUsage.rows.length - 10}件のサービスコードID`);
      }
    }
    console.log('');

    // 4. 影響範囲の分析
    console.log('📊 4. 影響範囲の分析');
    console.log('─'.repeat(60));
    
    // 訪問記録で使用されているサービスコードIDがマスタに存在するか確認
    const recordUsedIds = new Set(recordServiceCodeUsage.rows.map(row => row.service_code_id).filter(Boolean) as string[]);
    const recordMissingIds = Array.from(recordUsedIds).filter(id => !allServiceCodes.find(sc => sc.id === id));
    const recordInactiveIds = Array.from(recordUsedIds).filter(id => {
      const code = allServiceCodes.find(sc => sc.id === id);
      return code && !code.isActive;
    });
    
    console.log('\n【訪問記録での使用状況】');
    console.log(`使用されているサービスコードID数: ${recordUsedIds.size}件`);
    if (recordMissingIds.length > 0) {
      console.log(`❌ マスタに存在しないID: ${recordMissingIds.length}件`);
      console.log('   → これらのIDを使用している訪問記録は、マスタ更新後に参照できなくなります');
    }
    if (recordInactiveIds.length > 0) {
      console.log(`⚠️  無効化されているID: ${recordInactiveIds.length}件`);
      console.log('   → これらのIDを使用している訪問記録は、現在は無効なコードを参照しています');
    }
    if (recordMissingIds.length === 0 && recordInactiveIds.length === 0) {
      console.log('✅ 使用されているすべてのIDがマスタに存在し、有効です');
    }
    
    // 加算計算履歴で使用されているサービスコードIDがマスタに存在するか確認
    const bonusUsedIds = new Set(bonusServiceCodeUsage.rows.map(row => row.service_code_id).filter(Boolean) as string[]);
    const bonusMissingIds = Array.from(bonusUsedIds).filter(id => !allServiceCodes.find(sc => sc.id === id));
    const bonusInactiveIds = Array.from(bonusUsedIds).filter(id => {
      const code = allServiceCodes.find(sc => sc.id === id);
      return code && !code.isActive;
    });
    
    console.log('\n【加算計算履歴での使用状況】');
    console.log(`使用されているサービスコードID数: ${bonusUsedIds.size}件`);
    if (bonusMissingIds.length > 0) {
      console.log(`❌ マスタに存在しないID: ${bonusMissingIds.length}件`);
      console.log('   → これらのIDを使用している加算計算履歴は、マスタ更新後に参照できなくなります');
    }
    if (bonusInactiveIds.length > 0) {
      console.log(`⚠️  無効化されているID: ${bonusInactiveIds.length}件`);
      console.log('   → これらのIDを使用している加算計算履歴は、現在は無効なコードを参照しています');
    }
    if (bonusMissingIds.length === 0 && bonusInactiveIds.length === 0) {
      console.log('✅ 使用されているすべてのIDがマスタに存在し、有効です');
    }
    
    // 31から始まる誤ったコードの使用状況
    const wrongCodeIds = wrongCodes.map(code => code.id);
    const recordUsingWrongCodes = recordServiceCodeUsage.rows.filter(row => 
      row.service_code_id && wrongCodeIds.includes(row.service_code_id)
    );
    const bonusUsingWrongCodes = bonusServiceCodeUsage.rows.filter(row => 
      row.service_code_id && wrongCodeIds.includes(row.service_code_id)
    );
    
    if (recordUsingWrongCodes.length > 0 || bonusUsingWrongCodes.length > 0) {
      console.log('\n【31から始まる誤ったコードの使用状況】');
      if (recordUsingWrongCodes.length > 0) {
        const totalRecords = recordUsingWrongCodes.reduce((sum, row) => sum + Number(row.count), 0);
        console.log(`⚠️  訪問記録で使用: ${totalRecords}件（${recordUsingWrongCodes.length}種類のID）`);
        console.log('   詳細:');
        recordUsingWrongCodes.forEach(row => {
          const code = wrongCodes.find(wc => wc.id === row.service_code_id);
          if (code) {
            console.log(`     - ${code.serviceCode} (${row.count}件)`);
          }
        });
      }
      if (bonusUsingWrongCodes.length > 0) {
        const totalBonuses = bonusUsingWrongCodes.reduce((sum, row) => sum + Number(row.count), 0);
        console.log(`⚠️  加算計算履歴で使用: ${totalBonuses}件（${bonusUsingWrongCodes.length}種類のID）`);
        console.log('   詳細:');
        bonusUsingWrongCodes.forEach(row => {
          const code = wrongCodes.find(wc => wc.id === row.service_code_id);
          if (code) {
            console.log(`     - ${code.serviceCode} (${row.count}件)`);
          }
        });
      }
      console.log('   → マスタ更新時に、これらの参照を新しいコードに移行する必要があります');
    }

    console.log('\n' + '─'.repeat(60));
    console.log('✅ サービスコード使用状況の確認が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

checkProductionServiceCodeUsage()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

