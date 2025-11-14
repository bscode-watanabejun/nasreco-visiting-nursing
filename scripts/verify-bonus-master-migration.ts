/**
 * 加算マスタ移行後の検証スクリプト
 * 
 * 移行後の本番環境と開発環境の加算マスタが一致しているか確認します。
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import { bonusMaster } from '../shared/schema';

const PROD_DB_URL = process.env.PRODUCTION_DB_URL || 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';
const DEV_DB_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_beoRr4gaQ5Dl@ep-polished-scene-a5twqv82.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function verifyMigration() {
  console.log('🔍 加算マスタ移行後の検証を開始します...\n');
  
  const prodPool = new Pool({ connectionString: PROD_DB_URL });
  const devPool = new Pool({ connectionString: DEV_DB_URL });
  const prodDb = drizzle(prodPool);
  const devDb = drizzle(devPool);

  try {
    // 1. 有効な加算マスタ数の確認
    console.log('📊 1. 有効な加算マスタ数の確認:');
    console.log('─'.repeat(60));
    
    const prodActiveCount = await prodDb.execute<{ count: number }>(sql`
      SELECT COUNT(*) as count FROM bonus_master WHERE is_active = true
    `);
    
    const devActiveCount = await devDb.execute<{ count: number }>(sql`
      SELECT COUNT(*) as count FROM bonus_master WHERE is_active = true
    `);
    
    const prodCount = Number(prodActiveCount.rows[0]?.count || 0);
    const devCount = Number(devActiveCount.rows[0]?.count || 0);
    
    console.log(`   本番環境: ${prodCount}件`);
    console.log(`   開発環境: ${devCount}件`);
    
    if (prodCount === devCount) {
      console.log('   ✅ 有効な加算マスタ数が一致しています。\n');
    } else {
      console.log(`   ⚠️  有効な加算マスタ数が一致しません（差分: ${prodCount - devCount}件）。\n`);
    }

    // 2. 無効な加算マスタ数の確認
    console.log('📊 2. 無効な加算マスタ数の確認:');
    console.log('─'.repeat(60));
    
    const prodInactiveCount = await prodDb.execute<{ count: number }>(sql`
      SELECT COUNT(*) as count FROM bonus_master WHERE is_active = false
    `);
    
    const devInactiveCount = await devDb.execute<{ count: number }>(sql`
      SELECT COUNT(*) as count FROM bonus_master WHERE is_active = false
    `);
    
    const prodInactive = Number(prodInactiveCount.rows[0]?.count || 0);
    const devInactive = Number(devInactiveCount.rows[0]?.count || 0);
    
    console.log(`   本番環境: ${prodInactive}件`);
    console.log(`   開発環境: ${devInactive}件\n`);

    // 3. 有効な加算マスタのbonus_codeの一致確認
    console.log('📊 3. 有効な加算マスタのbonus_codeの一致確認:');
    console.log('─'.repeat(60));
    
    const prodActiveMasters = await prodDb.select().from(bonusMaster)
      .where(sql`is_active = true`);
    const prodActiveCodes = new Set(prodActiveMasters.map(m => m.bonusCode));
    
    const devActiveMasters = await devDb.select().from(bonusMaster)
      .where(sql`is_active = true`);
    const devActiveCodes = new Set(devActiveMasters.map(m => m.bonusCode));
    
    const missingInProd = devActiveMasters.filter(m => !prodActiveCodes.has(m.bonusCode));
    const extraInProd = prodActiveMasters.filter(m => !devActiveCodes.has(m.bonusCode));
    
    if (missingInProd.length === 0 && extraInProd.length === 0) {
      console.log('   ✅ 有効な加算マスタのbonus_codeが一致しています。\n');
    } else {
      if (missingInProd.length > 0) {
        console.log(`   ⚠️  本番環境に存在しない加算マスタ: ${missingInProd.length}件`);
        missingInProd.forEach((master, index) => {
          console.log(`      ${index + 1}. ${master.bonusCode} - ${master.bonusName}`);
        });
        console.log('');
      }
      if (extraInProd.length > 0) {
        console.log(`   ⚠️  本番環境にのみ存在する加算マスタ: ${extraInProd.length}件`);
        extraInProd.forEach((master, index) => {
          console.log(`      ${index + 1}. ${master.bonusCode} - ${master.bonusName}`);
        });
        console.log('');
      }
    }

    // 4. 内容の一致確認（主要フィールド）
    console.log('📊 4. 内容の一致確認（主要フィールド）:');
    console.log('─'.repeat(60));
    
    const devMasterMap = new Map(devActiveMasters.map(m => [m.bonusCode, m]));
    const prodMasterMap = new Map(prodActiveMasters.map(m => [m.bonusCode, m]));
    
    const differences: Array<{
      bonusCode: string;
      field: string;
      devValue: any;
      prodValue: any;
    }> = [];
    
    for (const [code, devMaster] of devMasterMap) {
      const prodMaster = prodMasterMap.get(code);
      if (!prodMaster) continue;
      
      if (devMaster.fixedPoints !== prodMaster.fixedPoints) {
        differences.push({
          bonusCode: code,
          field: 'fixedPoints',
          devValue: devMaster.fixedPoints,
          prodValue: prodMaster.fixedPoints,
        });
      }
      
      if (devMaster.pointsType !== prodMaster.pointsType) {
        differences.push({
          bonusCode: code,
          field: 'pointsType',
          devValue: devMaster.pointsType,
          prodValue: prodMaster.pointsType,
        });
      }
      
      if (devMaster.conditionalPattern !== prodMaster.conditionalPattern) {
        differences.push({
          bonusCode: code,
          field: 'conditionalPattern',
          devValue: devMaster.conditionalPattern,
          prodValue: prodMaster.conditionalPattern,
        });
      }
      
      const devPointsConfig = devMaster.pointsConfig ? JSON.stringify(devMaster.pointsConfig) : null;
      const prodPointsConfig = prodMaster.pointsConfig ? JSON.stringify(prodMaster.pointsConfig) : null;
      if (devPointsConfig !== prodPointsConfig) {
        differences.push({
          bonusCode: code,
          field: 'pointsConfig',
          devValue: devPointsConfig,
          prodValue: prodPointsConfig,
        });
      }
    }
    
    if (differences.length === 0) {
      console.log('   ✅ 有効な加算マスタの内容が一致しています。\n');
    } else {
      console.log(`   ⚠️  内容が異なる加算マスタ: ${differences.length}件\n`);
      differences.slice(0, 10).forEach((diff, index) => {
        console.log(`   ${index + 1}. ${diff.bonusCode} - ${diff.field}`);
        console.log(`      開発: ${diff.devValue}`);
        console.log(`      本番: ${diff.prodValue}`);
      });
      if (differences.length > 10) {
        console.log(`   ... 他 ${differences.length - 10}件\n`);
      } else {
        console.log('');
      }
    }

    // 5. 保険種別の内訳確認
    console.log('📊 5. 保険種別の内訳確認:');
    console.log('─'.repeat(60));
    
    const prodMedical = await prodDb.execute<{ count: number }>(sql`
      SELECT COUNT(*) as count FROM bonus_master 
      WHERE is_active = true AND insurance_type = 'medical'
    `);
    
    const prodCare = await prodDb.execute<{ count: number }>(sql`
      SELECT COUNT(*) as count FROM bonus_master 
      WHERE is_active = true AND insurance_type = 'care'
    `);
    
    const devMedical = await devDb.execute<{ count: number }>(sql`
      SELECT COUNT(*) as count FROM bonus_master 
      WHERE is_active = true AND insurance_type = 'medical'
    `);
    
    const devCare = await devDb.execute<{ count: number }>(sql`
      SELECT COUNT(*) as count FROM bonus_master 
      WHERE is_active = true AND insurance_type = 'care'
    `);
    
    console.log(`   本番環境 - 医療保険: ${prodMedical.rows[0]?.count || 0}件`);
    console.log(`   本番環境 - 介護保険: ${prodCare.rows[0]?.count || 0}件`);
    console.log(`   開発環境 - 医療保険: ${devMedical.rows[0]?.count || 0}件`);
    console.log(`   開発環境 - 介護保険: ${devCare.rows[0]?.count || 0}件\n`);

    // 6. サマリー
    console.log('📊 6. 検証結果のサマリー:');
    console.log('─'.repeat(60));
    
    const allChecksPassed = 
      prodCount === devCount &&
      missingInProd.length === 0 &&
      extraInProd.length === 0 &&
      differences.length === 0;
    
    if (allChecksPassed) {
      console.log('   ✅ すべての検証が成功しました。');
      console.log('   本番環境と開発環境の加算マスタが一致しています。\n');
    } else {
      console.log('   ⚠️  一部の検証で差分が検出されました。');
      console.log('   上記の詳細を確認してください。\n');
    }

    console.log('─'.repeat(60));
    console.log('✅ 検証が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prodPool.end();
    await devPool.end();
  }
}

verifyMigration()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

