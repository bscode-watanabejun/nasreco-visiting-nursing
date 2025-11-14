/**
 * 本番環境での加算マスタの使用状況確認スクリプト
 * 
 * 本番環境にのみ存在する加算マスタや、内容が異なる加算マスタが
 * 実際に使用されているか確認します。
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import { bonusMaster, bonusCalculationHistory, nursingRecords } from '../shared/schema';

const PROD_DB_URL = process.env.PRODUCTION_DB_URL || 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';
const DEV_DB_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_beoRr4gaQ5Dl@ep-polished-scene-a5twqv82.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function checkBonusMasterUsage() {
  console.log('🔍 本番環境での加算マスタの使用状況を確認します...\n');
  
  const prodPool = new Pool({ connectionString: PROD_DB_URL });
  const devPool = new Pool({ connectionString: DEV_DB_URL });
  const prodDb = drizzle(prodPool);
  const devDb = drizzle(devPool);

  try {
    // 1. 開発環境で無効だが本番環境で有効な加算マスタを取得
    console.log('📊 1. 開発環境で無効だが本番環境で有効な加算マスタを取得中...');
    
    const devInactiveMasters = await devDb.select().from(bonusMaster)
      .where(sql`is_active = false`);
    const devInactiveCodes = new Set(devInactiveMasters.map(m => m.bonusCode));
    
    const prodActiveMasters = await prodDb.select().from(bonusMaster)
      .where(sql`is_active = true`);
    
    const prodOnlyActiveMasters = prodActiveMasters.filter(m => devInactiveCodes.has(m.bonusCode));
    
    console.log(`   該当する加算マスタ数: ${prodOnlyActiveMasters.length}件\n`);

    // 2. これらの加算マスタがbonus_calculation_historyで使用されているか確認
    console.log('📊 2. bonus_calculation_historyでの使用状況:');
    console.log('─'.repeat(60));
    
    if (prodOnlyActiveMasters.length > 0) {
      const prodOnlyActiveIds = new Set(prodOnlyActiveMasters.map(m => m.id));
      
      const prodOnlyActiveIdsArray = Array.from(prodOnlyActiveIds);
      const usageInHistory = await prodDb.execute<{
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
        JOIN bonus_master bm ON bch.bonus_master_id = bm.id
        WHERE bm.id = ANY(${sql.raw(`ARRAY[${prodOnlyActiveIdsArray.map(id => `'${id}'`).join(',')}]`)})
        GROUP BY bm.id, bm.bonus_code, bm.bonus_name
        ORDER BY count DESC
      `);
      
      if (usageInHistory.rows.length > 0) {
        console.log(`   ⚠️  使用されている加算マスタ: ${usageInHistory.rows.length}件\n`);
        usageInHistory.rows.forEach((row, index) => {
          console.log(`   ${index + 1}. ${row.bonus_code} - ${row.bonus_name}`);
          console.log(`      使用回数: ${row.count}回`);
        });
        console.log('');
      } else {
        console.log('   ✅ これらの加算マスタはbonus_calculation_historyで使用されていません。\n');
      }
    } else {
      console.log('   ✅ 該当する加算マスタはありません。\n');
    }

    // 3. 内容が異なる加算マスタの使用状況確認
    console.log('📊 3. 内容が異なる加算マスタの使用状況:');
    console.log('─'.repeat(60));
    
    const devActiveMasters = await devDb.select().from(bonusMaster)
      .where(sql`is_active = true`);
    
    const devMasterMap = new Map(devActiveMasters.map(m => [m.bonusCode, m]));
    const prodMasterMap = new Map(prodActiveMasters.map(m => [m.bonusCode, m]));
    
    const differentMasters: Array<{
      bonusCode: string;
      field: string;
      devValue: any;
      prodValue: any;
    }> = [];
    
    for (const [code, devMaster] of devMasterMap) {
      const prodMaster = prodMasterMap.get(code);
      if (!prodMaster) continue;
      
      // fixedPointsの比較
      if (devMaster.fixedPoints !== prodMaster.fixedPoints) {
        differentMasters.push({
          bonusCode: code,
          field: 'fixedPoints',
          devValue: devMaster.fixedPoints,
          prodValue: prodMaster.fixedPoints,
        });
      }
      
      // pointsTypeの比較
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
        const usageInHistory = await prodDb.execute<{
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
          JOIN bonus_master bm ON bch.bonus_master_id = bm.id
          WHERE bm.id = ANY(${sql.raw(`ARRAY[${differentIdsArray.map(id => `'${id}'`).join(',')}]`)})
          GROUP BY bm.id, bm.bonus_code, bm.bonus_name
          ORDER BY count DESC
        `);
        
        if (usageInHistory.rows.length > 0) {
          console.log(`   ⚠️  内容が異なり、かつ使用されている加算マスタ: ${usageInHistory.rows.length}件\n`);
          usageInHistory.rows.forEach((row, index) => {
            const diffs = differentMasters.filter(d => d.bonusCode === row.bonus_code);
            console.log(`   ${index + 1}. ${row.bonus_code} - ${row.bonus_name}`);
            console.log(`      使用回数: ${row.count}回`);
            diffs.forEach(diff => {
              console.log(`      差分: ${diff.field} - 開発: ${diff.devValue}, 本番: ${diff.prodValue}`);
            });
          });
          console.log('');
        } else {
          console.log('   ✅ 内容が異なる加算マスタはbonus_calculation_historyで使用されていません。\n');
        }
      }
    }

    // 4. サマリー
    console.log('📊 4. 使用状況のサマリー:');
    console.log('─'.repeat(60));
    
    const totalUsageInHistory = await prodDb.execute<{ count: number }>(sql`
      SELECT COUNT(*) as count FROM bonus_calculation_history
    `);
    
    console.log(`   本番環境のbonus_calculation_history総件数: ${totalUsageInHistory.rows[0]?.count || 0}件`);
    
    if (prodOnlyActiveMasters.length > 0) {
      const prodOnlyActiveIds = new Set(prodOnlyActiveMasters.map(m => m.id));
      const prodOnlyActiveIdsArray = Array.from(prodOnlyActiveIds);
      const usageCount = await prodDb.execute<{ count: number }>(sql`
        SELECT COUNT(*) as count
        FROM bonus_calculation_history
        WHERE bonus_master_id = ANY(${sql.raw(`ARRAY[${prodOnlyActiveIdsArray.map(id => `'${id}'`).join(',')}]`)})
      `);
      console.log(`   本番環境のみ有効な加算マスタの使用回数: ${usageCount.rows[0]?.count || 0}回`);
    }
    
    console.log('');

    // 5. 推奨事項
    console.log('📊 5. 推奨事項:');
    console.log('─'.repeat(60));
    
    if (prodOnlyActiveMasters.length > 0) {
      const prodOnlyActiveIds = new Set(prodOnlyActiveMasters.map(m => m.id));
      const prodOnlyActiveIdsArray = Array.from(prodOnlyActiveIds);
      const usageCount = await prodDb.execute<{ count: number }>(sql`
        SELECT COUNT(*) as count
        FROM bonus_calculation_history
        WHERE bonus_master_id = ANY(${sql.raw(`ARRAY[${prodOnlyActiveIdsArray.map(id => `'${id}'`).join(',')}]`)})
      `);
      
      if (Number(usageCount.rows[0]?.count || 0) === 0) {
        console.log('   ✅ 本番環境のみ有効な加算マスタは使用されていないため、');
        console.log('      安全に無効化できます。\n');
      } else {
        console.log('   ⚠️  本番環境のみ有効な加算マスタが使用されているため、');
        console.log('      無効化する場合は慎重に判断してください。\n');
      }
    }
    
    if (differentMasters.length > 0) {
      const differentCodes = new Set(differentMasters.map(d => d.bonusCode));
      const differentIds = Array.from(differentCodes)
        .map(code => prodMasterMap.get(code)?.id)
        .filter((id): id is string => id !== undefined);
      
      if (differentIds.length > 0) {
        const differentIdsArray = differentIds;
        const usageCount = await prodDb.execute<{ count: number }>(sql`
          SELECT COUNT(*) as count
          FROM bonus_calculation_history
          WHERE bonus_master_id = ANY(${sql.raw(`ARRAY[${differentIdsArray.map(id => `'${id}'`).join(',')}]`)})
        `);
        
        if (Number(usageCount.rows[0]?.count || 0) === 0) {
          console.log('   ✅ 内容が異なる加算マスタは使用されていないため、');
          console.log('      安全に開発環境の値に更新できます。\n');
        } else {
          console.log('   ⚠️  内容が異なる加算マスタが使用されているため、');
          console.log('      更新する場合は既存の計算履歴への影響を確認してください。\n');
        }
      }
    }

    console.log('─'.repeat(60));
    console.log('✅ 使用状況の確認が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prodPool.end();
    await devPool.end();
  }
}

checkBonusMasterUsage()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

