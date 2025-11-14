/**
 * 加算マスタの詳細な差分確認スクリプト
 * 
 * 検証で検出された差分の詳細を確認します。
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import { bonusMaster } from '../shared/schema';

const PROD_DB_URL = process.env.PRODUCTION_DB_URL || 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';
const DEV_DB_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_beoRr4gaQ5Dl@ep-polished-scene-a5twqv82.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function checkDetails() {
  console.log('🔍 加算マスタの詳細な差分を確認します...\n');
  
  const prodPool = new Pool({ connectionString: PROD_DB_URL });
  const devPool = new Pool({ connectionString: DEV_DB_URL });
  const prodDb = drizzle(prodPool);
  const devDb = drizzle(devPool);

  try {
    // 1. 本番環境に存在しない加算マスタの詳細
    console.log('📊 1. 本番環境に存在しない加算マスタ（開発環境で有効）:');
    console.log('─'.repeat(60));
    
    const devActiveMasters = await devDb.select().from(bonusMaster)
      .where(sql`is_active = true`);
    const prodAllMasters = await prodDb.select().from(bonusMaster);
    const prodCodes = new Set(prodAllMasters.map(m => m.bonusCode));
    
    const missingInProd = devActiveMasters.filter(m => !prodCodes.has(m.bonusCode));
    
    if (missingInProd.length > 0) {
      console.log(`   件数: ${missingInProd.length}件\n`);
      missingInProd.forEach((master, index) => {
        console.log(`   ${index + 1}. ${master.bonusCode} - ${master.bonusName}`);
        console.log(`      保険種別: ${master.insuranceType}`);
        console.log(`      点数タイプ: ${master.pointsType}`);
        console.log(`      固定点数: ${master.fixedPoints || '(条件分岐)'}`);
        console.log(`      適用バージョン: ${master.version}`);
      });
      console.log('');
    } else {
      console.log('   ✅ 該当する加算マスタはありません。\n');
    }

    // 2. 本番環境にのみ存在する加算マスタの詳細
    console.log('📊 2. 本番環境にのみ存在する加算マスタ（有効）:');
    console.log('─'.repeat(60));
    
    const prodActiveMasters = await prodDb.select().from(bonusMaster)
      .where(sql`is_active = true`);
    const devCodes = new Set(devActiveMasters.map(m => m.bonusCode));
    
    const extraInProd = prodActiveMasters.filter(m => !devCodes.has(m.bonusCode));
    
    if (extraInProd.length > 0) {
      console.log(`   件数: ${extraInProd.length}件\n`);
      extraInProd.forEach((master, index) => {
        console.log(`   ${index + 1}. ${master.bonusCode} - ${master.bonusName}`);
        console.log(`      保険種別: ${master.insuranceType}`);
        console.log(`      点数タイプ: ${master.pointsType}`);
        console.log(`      固定点数: ${master.fixedPoints || '(条件分岐)'}`);
        console.log(`      適用バージョン: ${master.version}`);
        console.log(`      有効: ${master.isActive ? 'はい' : 'いいえ'}`);
      });
      console.log('');
    } else {
      console.log('   ✅ 該当する加算マスタはありません。\n');
    }

    // 3. care_night_early_morningの詳細確認
    console.log('📊 3. care_night_early_morningの詳細確認:');
    console.log('─'.repeat(60));
    
    const devNightEarly = await devDb.select().from(bonusMaster)
      .where(sql`bonus_code = 'care_night_early_morning'`);
    
    const prodNightEarly = await prodDb.select().from(bonusMaster)
      .where(sql`bonus_code = 'care_night_early_morning'`);
    
    console.log(`   開発環境: ${devNightEarly.length}件`);
    devNightEarly.forEach((master, index) => {
      console.log(`   ${index + 1}. ${master.bonusCode} - ${master.bonusName}`);
      console.log(`      有効: ${master.isActive ? 'はい' : 'いいえ'}`);
      console.log(`      保険種別: ${master.insuranceType}`);
    });
    
    console.log(`\n   本番環境: ${prodNightEarly.length}件`);
    prodNightEarly.forEach((master, index) => {
      console.log(`   ${index + 1}. ${master.bonusCode} - ${master.bonusName}`);
      console.log(`      有効: ${master.isActive ? 'はい' : 'いいえ'}`);
      console.log(`      保険種別: ${master.insuranceType}`);
    });
    console.log('');

    // 4. discharge_joint_guidanceの詳細確認
    console.log('📊 4. discharge_joint_guidanceの詳細確認:');
    console.log('─'.repeat(60));
    
    const devDischargeJoint = await devDb.select().from(bonusMaster)
      .where(sql`bonus_code = 'discharge_joint_guidance'`);
    
    const prodDischargeJoint = await prodDb.select().from(bonusMaster)
      .where(sql`bonus_code = 'discharge_joint_guidance'`);
    
    console.log(`   開発環境: ${devDischargeJoint.length}件`);
    devDischargeJoint.forEach((master, index) => {
      console.log(`   ${index + 1}. ${master.bonusCode} - ${master.bonusName}`);
      console.log(`      有効: ${master.isActive ? 'はい' : 'いいえ'}`);
      console.log(`      保険種別: ${master.insuranceType}`);
    });
    
    console.log(`\n   本番環境: ${prodDischargeJoint.length}件`);
    prodDischargeJoint.forEach((master, index) => {
      console.log(`   ${index + 1}. ${master.bonusCode} - ${master.bonusName}`);
      console.log(`      有効: ${master.isActive ? 'はい' : 'いいえ'}`);
      console.log(`      保険種別: ${master.insuranceType}`);
    });
    console.log('');

    console.log('─'.repeat(60));
    console.log('✅ 詳細確認が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prodPool.end();
    await devPool.end();
  }
}

checkDetails()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

