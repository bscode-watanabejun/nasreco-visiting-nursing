/**
 * テナント（施設）別の加算マスタ使用状況確認スクリプト
 * 
 * 本番環境の全テナントと「訪問看護ステーションソレア春日部」の
 * 加算マスタ使用状況を確認します。
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import { bonusMaster, bonusCalculationHistory, facilities, nursingRecords } from '../shared/schema';

const PROD_DB_URL = process.env.PRODUCTION_DB_URL || 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';
const DEV_DB_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_beoRr4gaQ5Dl@ep-polished-scene-a5twqv82.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function checkBonusMasterByTenant() {
  console.log('🔍 テナント（施設）別の加算マスタ使用状況を確認します...\n');
  
  const prodPool = new Pool({ connectionString: PROD_DB_URL });
  const devPool = new Pool({ connectionString: DEV_DB_URL });
  const prodDb = drizzle(prodPool);
  const devDb = drizzle(devPool);

  try {
    // 1. 本番環境の全テナント（施設）を取得
    console.log('📊 1. 本番環境の全テナント（施設）一覧:');
    console.log('─'.repeat(60));
    
    const prodFacilities = await prodDb.select().from(facilities);
    
    console.log(`   総施設数: ${prodFacilities.length}件\n`);
    prodFacilities.forEach((facility, index) => {
      console.log(`   ${index + 1}. ${facility.name} (ID: ${facility.id})`);
    });
    console.log('');

    // 2. 「訪問看護ステーションソレア春日部」の施設IDを取得
    console.log('📊 2. 「訪問看護ステーションソレア春日部」の情報:');
    console.log('─'.repeat(60));
    
    const soreaFacility = prodFacilities.find(f => 
      f.name.includes('ソレア') || f.name.includes('春日部')
    );
    
    if (soreaFacility) {
      console.log(`   施設名: ${soreaFacility.name}`);
      console.log(`   施設ID: ${soreaFacility.id}\n`);
    } else {
      console.log('   ⚠️  「訪問看護ステーションソレア春日部」が見つかりませんでした。');
      console.log('      全施設名を確認してください。\n');
      return;
    }

    // 3. 加算マスタの施設固有性を確認
    console.log('📊 3. 加算マスタの施設固有性:');
    console.log('─'.repeat(60));
    
    const prodAllMasters = await prodDb.select().from(bonusMaster)
      .where(sql`is_active = true`);
    
    const globalMasters = prodAllMasters.filter(m => m.facilityId === null);
    const facilitySpecificMasters = prodAllMasters.filter(m => m.facilityId !== null);
    const soreaSpecificMasters = prodAllMasters.filter(m => m.facilityId === soreaFacility.id);
    
    console.log(`   全施設共通（facility_id = null）: ${globalMasters.length}件`);
    console.log(`   施設固有（facility_id != null）: ${facilitySpecificMasters.length}件`);
    console.log(`   ソレア春日部固有: ${soreaSpecificMasters.length}件\n`);
    
    if (soreaSpecificMasters.length > 0) {
      console.log('   ソレア春日部固有の加算マスタ:');
      soreaSpecificMasters.forEach((master, index) => {
        console.log(`   ${index + 1}. ${master.bonusCode} - ${master.bonusName}`);
      });
      console.log('');
    }

    // 4. bonus_calculation_historyの使用状況をテナント別に確認
    console.log('📊 4. bonus_calculation_historyの使用状況（テナント別）:');
    console.log('─'.repeat(60));
    
    const usageByFacility = await prodDb.execute<{
      facility_id: string;
      facility_name: string;
      count: number;
    }>(sql`
      SELECT 
        f.id as facility_id,
        f.name as facility_name,
        COUNT(*) as count
      FROM bonus_calculation_history bch
      JOIN nursing_records nr ON bch.nursing_record_id = nr.id
      JOIN facilities f ON nr.facility_id = f.id
      GROUP BY f.id, f.name
      ORDER BY count DESC
    `);
    
    console.log(`   使用実績がある施設数: ${usageByFacility.rows.length}件\n`);
    usageByFacility.rows.forEach((row, index) => {
      const isSorea = row.facility_id === soreaFacility.id;
      const marker = isSorea ? ' ⭐' : '';
      console.log(`   ${index + 1}. ${row.facility_name}${marker}`);
      console.log(`      使用回数: ${row.count}回`);
    });
    console.log('');

    // 5. ソレア春日部での加算マスタ使用状況
    console.log('📊 5. ソレア春日部での加算マスタ使用状況:');
    console.log('─'.repeat(60));
    
    const soreaUsage = await prodDb.execute<{
      bonus_master_id: string;
      bonus_code: string;
      bonus_name: string;
      count: number;
    }>(sql`
      SELECT 
        bm.id as bonus_master_id,
        bm.bonus_code,
        bm.bonus_name,
        COUNT(*) as count
      FROM bonus_calculation_history bch
      JOIN nursing_records nr ON bch.nursing_record_id = nr.id
      JOIN bonus_master bm ON bch.bonus_master_id = bm.id
      WHERE nr.facility_id = ${soreaFacility.id}
      GROUP BY bm.id, bm.bonus_code, bm.bonus_name
      ORDER BY count DESC
    `);
    
    console.log(`   使用されている加算マスタ数: ${soreaUsage.rows.length}件`);
    console.log(`   総使用回数: ${soreaUsage.rows.reduce((sum, row) => sum + Number(row.count), 0)}回\n`);
    
    if (soreaUsage.rows.length > 0) {
      console.log('   使用されている加算マスタ（上位10件）:');
      soreaUsage.rows.slice(0, 10).forEach((row, index) => {
        console.log(`   ${index + 1}. ${row.bonus_code} - ${row.bonus_name}`);
        console.log(`      使用回数: ${row.count}回`);
      });
      if (soreaUsage.rows.length > 10) {
        console.log(`   ... 他 ${soreaUsage.rows.length - 10}件\n`);
      } else {
        console.log('');
      }
    } else {
      console.log('   ✅ ソレア春日部では加算マスタは使用されていません。\n');
    }

    // 6. 開発環境で無効だが本番環境で有効な加算マスタの使用状況（ソレア春日部）
    console.log('📊 6. 開発環境で無効だが本番環境で有効な加算マスタ（ソレア春日部での使用状況）:');
    console.log('─'.repeat(60));
    
    const devInactiveMasters = await devDb.select().from(bonusMaster)
      .where(sql`is_active = false`);
    const devInactiveCodes = new Set(devInactiveMasters.map(m => m.bonusCode));
    
    const prodOnlyActiveMasters = prodAllMasters.filter(m => devInactiveCodes.has(m.bonusCode));
    
    if (prodOnlyActiveMasters.length > 0) {
      const prodOnlyActiveIds = new Set(prodOnlyActiveMasters.map(m => m.id));
      const prodOnlyActiveIdsArray = Array.from(prodOnlyActiveIds);
      
      const soreaUsageOfProdOnly = await prodDb.execute<{
        bonus_master_id: string;
        bonus_code: string;
        bonus_name: string;
        count: number;
      }>(sql`
        SELECT 
          bm.id as bonus_master_id,
          bm.bonus_code,
          bm.bonus_name,
          COUNT(*) as count
        FROM bonus_calculation_history bch
        JOIN nursing_records nr ON bch.nursing_record_id = nr.id
        JOIN bonus_master bm ON bch.bonus_master_id = bm.id
        WHERE nr.facility_id = ${soreaFacility.id}
          AND bm.id = ANY(${sql.raw(`ARRAY[${prodOnlyActiveIdsArray.map(id => `'${id}'`).join(',')}]`)})
        GROUP BY bm.id, bm.bonus_code, bm.bonus_name
        ORDER BY count DESC
      `);
      
      if (soreaUsageOfProdOnly.rows.length > 0) {
        console.log(`   ⚠️  ソレア春日部で使用されている加算マスタ: ${soreaUsageOfProdOnly.rows.length}件\n`);
        soreaUsageOfProdOnly.rows.forEach((row, index) => {
          console.log(`   ${index + 1}. ${row.bonus_code} - ${row.bonus_name}`);
          console.log(`      使用回数: ${row.count}回`);
        });
        console.log('');
      } else {
        console.log('   ✅ ソレア春日部では使用されていません。\n');
      }
    } else {
      console.log('   ✅ 該当する加算マスタはありません。\n');
    }

    // 7. 内容が異なる加算マスタの使用状況（ソレア春日部）
    console.log('📊 7. 内容が異なる加算マスタ（ソレア春日部での使用状況）:');
    console.log('─'.repeat(60));
    
    const devActiveMasters = await devDb.select().from(bonusMaster)
      .where(sql`is_active = true`);
    
    const devMasterMap = new Map(devActiveMasters.map(m => [m.bonusCode, m]));
    const prodMasterMap = new Map(prodAllMasters.map(m => [m.bonusCode, m]));
    
    const differentMasters: Array<{
      bonusCode: string;
      field: string;
      devValue: any;
      prodValue: any;
    }> = [];
    
    for (const [code, devMaster] of devMasterMap) {
      const prodMaster = prodMasterMap.get(code);
      if (!prodMaster) continue;
      
      if (devMaster.fixedPoints !== prodMaster.fixedPoints) {
        differentMasters.push({
          bonusCode: code,
          field: 'fixedPoints',
          devValue: devMaster.fixedPoints,
          prodValue: prodMaster.fixedPoints,
        });
      }
      
      if (devMaster.pointsType !== prodMaster.pointsType) {
        differentMasters.push({
          bonusCode: code,
          field: 'pointsType',
          devValue: devMaster.pointsType,
          prodValue: prodMaster.pointsType,
        });
      }
    }
    
    if (differentMasters.length > 0) {
      const differentCodes = new Set(differentMasters.map(d => d.bonusCode));
      const differentIds = Array.from(differentCodes)
        .map(code => prodMasterMap.get(code)?.id)
        .filter((id): id is string => id !== undefined);
      
      if (differentIds.length > 0) {
        const differentIdsArray = differentIds;
        const soreaUsageOfDifferent = await prodDb.execute<{
          bonus_master_id: string;
          bonus_code: string;
          bonus_name: string;
          count: number;
        }>(sql`
          SELECT 
            bm.id as bonus_master_id,
            bm.bonus_code,
            bm.bonus_name,
            COUNT(*) as count
          FROM bonus_calculation_history bch
          JOIN nursing_records nr ON bch.nursing_record_id = nr.id
          JOIN bonus_master bm ON bch.bonus_master_id = bm.id
          WHERE nr.facility_id = ${soreaFacility.id}
            AND bm.id = ANY(${sql.raw(`ARRAY[${differentIdsArray.map(id => `'${id}'`).join(',')}]`)})
          GROUP BY bm.id, bm.bonus_code, bm.bonus_name
          ORDER BY count DESC
        `);
        
        if (soreaUsageOfDifferent.rows.length > 0) {
          console.log(`   ⚠️  ソレア春日部で使用されている加算マスタ: ${soreaUsageOfDifferent.rows.length}件\n`);
          soreaUsageOfDifferent.rows.forEach((row, index) => {
            const diffs = differentMasters.filter(d => d.bonusCode === row.bonus_code);
            console.log(`   ${index + 1}. ${row.bonus_code} - ${row.bonus_name}`);
            console.log(`      使用回数: ${row.count}回`);
            diffs.forEach(diff => {
              console.log(`      差分: ${diff.field} - 開発: ${diff.devValue}, 本番: ${diff.prodValue}`);
            });
          });
          console.log('');
        } else {
          console.log('   ✅ ソレア春日部では使用されていません。\n');
        }
      }
    }

    // 8. サマリー
    console.log('📊 8. サマリー:');
    console.log('─'.repeat(60));
    
    const totalUsageInHistory = await prodDb.execute<{ count: number }>(sql`
      SELECT COUNT(*) as count FROM bonus_calculation_history
    `);
    
    const soreaTotalUsage = await prodDb.execute<{ count: number }>(sql`
      SELECT COUNT(*) as count
      FROM bonus_calculation_history bch
      JOIN nursing_records nr ON bch.nursing_record_id = nr.id
      WHERE nr.facility_id = ${soreaFacility.id}
    `);
    
    console.log(`   本番環境全体のbonus_calculation_history総件数: ${totalUsageInHistory.rows[0]?.count || 0}件`);
    console.log(`   ソレア春日部のbonus_calculation_history総件数: ${soreaTotalUsage.rows[0]?.count || 0}件`);
    console.log(`   ソレア春日部の割合: ${totalUsageInHistory.rows[0]?.count ? ((Number(soreaTotalUsage.rows[0]?.count || 0) / Number(totalUsageInHistory.rows[0]?.count)) * 100).toFixed(1) : 0}%\n`);
    
    console.log('─'.repeat(60));
    console.log('✅ テナント別の加算マスタ使用状況の確認が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prodPool.end();
    await devPool.end();
  }
}

checkBonusMasterByTenant()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

