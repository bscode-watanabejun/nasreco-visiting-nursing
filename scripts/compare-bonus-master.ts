/**
 * 開発環境と本番環境の加算マスタ比較スクリプト
 * 
 * 加算マスタ管理画面で表示される加算マスタの内容を比較します。
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import { bonusMaster } from '../shared/schema';

const PROD_DB_URL = process.env.PRODUCTION_DB_URL || 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';
const DEV_DB_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_beoRr4gaQ5Dl@ep-polished-scene-a5twqv82.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function compareBonusMaster() {
  console.log('🔍 開発環境と本番環境の加算マスタを比較します...\n');
  
  const prodPool = new Pool({ connectionString: PROD_DB_URL });
  const devPool = new Pool({ connectionString: DEV_DB_URL });
  const prodDb = drizzle(prodPool);
  const devDb = drizzle(devPool);

  try {
    // 1. 本番環境の加算マスタ件数
    console.log('📊 1. 本番環境の加算マスタ件数:');
    console.log('─'.repeat(60));
    
    const prodStats = await prodDb.execute<{
      insurance_type: string;
      is_active: boolean;
      count: number;
    }>(sql`
      SELECT 
        insurance_type,
        is_active,
        COUNT(*) as count
      FROM bonus_master
      GROUP BY insurance_type, is_active
      ORDER BY insurance_type, is_active DESC
    `);
    
    const prodTotal = await prodDb.execute<{ count: number }>(sql`
      SELECT COUNT(*) as count FROM bonus_master
    `);
    
    const prodActive = await prodDb.execute<{ count: number }>(sql`
      SELECT COUNT(*) as count FROM bonus_master WHERE is_active = true
    `);
    
    const prodMedical = await prodDb.execute<{ count: number }>(sql`
      SELECT COUNT(*) as count FROM bonus_master 
      WHERE insurance_type = 'medical' AND is_active = true
    `);
    
    const prodCare = await prodDb.execute<{ count: number }>(sql`
      SELECT COUNT(*) as count FROM bonus_master 
      WHERE insurance_type = 'care' AND is_active = true
    `);
    
    console.log(`   総件数: ${prodTotal.rows[0]?.count || 0}件`);
    console.log(`   有効な件数: ${prodActive.rows[0]?.count || 0}件`);
    console.log(`   医療保険（有効）: ${prodMedical.rows[0]?.count || 0}件`);
    console.log(`   介護保険（有効）: ${prodCare.rows[0]?.count || 0}件\n`);
    
    console.log('   保険種別・有効状態別の内訳:');
    prodStats.rows.forEach((row) => {
      const status = row.is_active ? '有効' : '無効';
      console.log(`     ${row.insurance_type} (${status}): ${row.count}件`);
    });
    console.log('');

    // 2. 開発環境の加算マスタ件数
    console.log('📊 2. 開発環境の加算マスタ件数:');
    console.log('─'.repeat(60));
    
    const devStats = await devDb.execute<{
      insurance_type: string;
      is_active: boolean;
      count: number;
    }>(sql`
      SELECT 
        insurance_type,
        is_active,
        COUNT(*) as count
      FROM bonus_master
      GROUP BY insurance_type, is_active
      ORDER BY insurance_type, is_active DESC
    `);
    
    const devTotal = await devDb.execute<{ count: number }>(sql`
      SELECT COUNT(*) as count FROM bonus_master
    `);
    
    const devActive = await devDb.execute<{ count: number }>(sql`
      SELECT COUNT(*) as count FROM bonus_master WHERE is_active = true
    `);
    
    const devMedical = await devDb.execute<{ count: number }>(sql`
      SELECT COUNT(*) as count FROM bonus_master 
      WHERE insurance_type = 'medical' AND is_active = true
    `);
    
    const devCare = await devDb.execute<{ count: number }>(sql`
      SELECT COUNT(*) as count FROM bonus_master 
      WHERE insurance_type = 'care' AND is_active = true
    `);
    
    console.log(`   総件数: ${devTotal.rows[0]?.count || 0}件`);
    console.log(`   有効な件数: ${devActive.rows[0]?.count || 0}件`);
    console.log(`   医療保険（有効）: ${devMedical.rows[0]?.count || 0}件`);
    console.log(`   介護保険（有効）: ${devCare.rows[0]?.count || 0}件\n`);
    
    console.log('   保険種別・有効状態別の内訳:');
    devStats.rows.forEach((row) => {
      const status = row.is_active ? '有効' : '無効';
      console.log(`     ${row.insurance_type} (${status}): ${row.count}件`);
    });
    console.log('');

    // 3. 差分の確認
    console.log('📊 3. 差分の確認:');
    console.log('─'.repeat(60));
    
    const prodActiveCount = Number(prodActive.rows[0]?.count || 0);
    const devActiveCount = Number(devActive.rows[0]?.count || 0);
    const prodMedicalCount = Number(prodMedical.rows[0]?.count || 0);
    const devMedicalCount = Number(devMedical.rows[0]?.count || 0);
    const prodCareCount = Number(prodCare.rows[0]?.count || 0);
    const devCareCount = Number(devCare.rows[0]?.count || 0);
    
    console.log(`   有効な件数の差分: ${devActiveCount - prodActiveCount}件`);
    console.log(`   医療保険（有効）の差分: ${devMedicalCount - prodMedicalCount}件`);
    console.log(`   介護保険（有効）の差分: ${devCareCount - prodCareCount}件\n`);
    
    if (prodActiveCount < devActiveCount) {
      console.log('   ⚠️  本番環境の有効な件数が開発環境より少ないです。');
      console.log(`      不足: ${devActiveCount - prodActiveCount}件\n`);
    }
    
    if (prodCareCount < devCareCount) {
      console.log('   ⚠️  本番環境の介護保険加算マスタが開発環境より少ないです。');
      console.log(`      不足: ${devCareCount - prodCareCount}件\n`);
    }

    // 4. 本番環境に存在しない加算マスタの確認
    console.log('📊 4. 本番環境に存在しない加算マスタの確認:');
    console.log('─'.repeat(60));
    
    const devMasters = await devDb.select().from(bonusMaster)
      .where(sql`is_active = true`);
    
    const prodMasters = await prodDb.select().from(bonusMaster);
    const prodMasterCodes = new Set(prodMasters.map(m => m.bonusCode));
    
    const missingMasters = devMasters.filter(master => !prodMasterCodes.has(master.bonusCode));
    
    console.log(`   開発環境の有効な加算マスタ数: ${devMasters.length}件`);
    console.log(`   本番環境に存在しない加算マスタ数: ${missingMasters.length}件\n`);
    
    if (missingMasters.length > 0) {
      console.log('   本番環境に存在しない加算マスタ（最初の20件）:');
      missingMasters.slice(0, 20).forEach((master, index) => {
        console.log(`   ${index + 1}. ${master.bonusCode} - ${master.bonusName.substring(0, 50)}... (${master.insuranceType})`);
      });
      if (missingMasters.length > 20) {
        console.log(`   ... 他 ${missingMasters.length - 20}件\n`);
      } else {
        console.log('');
      }
      
      // 保険種別で分類
      const missingMedical = missingMasters.filter(m => m.insuranceType === 'medical');
      const missingCare = missingMasters.filter(m => m.insuranceType === 'care');
      
      console.log(`   本番環境に存在しない加算マスタの内訳:`);
      console.log(`     医療保険: ${missingMedical.length}件`);
      console.log(`     介護保険: ${missingCare.length}件\n`);
    } else {
      console.log('   ✅ 本番環境に存在しない加算マスタはありません。\n');
    }

    // 5. 加算マスタの詳細比較（サンプル）
    console.log('📊 5. 加算マスタの詳細比較（サンプル）:');
    console.log('─'.repeat(60));
    
    if (missingMasters.length > 0) {
      console.log('\n   本番環境に存在しない加算マスタの詳細（最初の5件）:');
      missingMasters.slice(0, 5).forEach((master, index) => {
        console.log(`\n   ${index + 1}. ${master.bonusCode} - ${master.bonusName}`);
        console.log(`      保険種別: ${master.insuranceType}`);
        console.log(`      点数: ${master.points}点`);
        console.log(`      有効: ${master.isActive ? 'はい' : 'いいえ'}`);
        console.log(`      適用バージョン: ${master.appliedVersion}`);
      });
      console.log('');
    }

    // 6. 本番環境に存在するが開発環境に存在しない加算マスタの確認
    console.log('📊 6. 本番環境に存在するが開発環境に存在しない加算マスタの確認:');
    console.log('─'.repeat(60));
    
    const prodActiveMasters = await prodDb.select().from(bonusMaster)
      .where(sql`is_active = true`);
    
    const devMasterCodes = new Set(devMasters.map(m => m.bonusCode));
    
    const extraMasters = prodActiveMasters.filter(master => !devMasterCodes.has(master.bonusCode));
    
    console.log(`   本番環境に存在するが開発環境に存在しない加算マスタ数: ${extraMasters.length}件\n`);
    
    if (extraMasters.length > 0) {
      console.log('   本番環境にのみ存在する加算マスタ（最初の10件）:');
      extraMasters.slice(0, 10).forEach((master, index) => {
        console.log(`   ${index + 1}. ${master.bonusCode} - ${master.bonusName.substring(0, 50)}... (${master.insuranceType})`);
      });
      if (extraMasters.length > 10) {
        console.log(`   ... 他 ${extraMasters.length - 10}件\n`);
      } else {
        console.log('');
      }
    } else {
      console.log('   ✅ 本番環境にのみ存在する加算マスタはありません。\n');
    }

    console.log('─'.repeat(60));
    console.log('✅ 加算マスタの比較が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prodPool.end();
    await devPool.end();
  }
}

compareBonusMaster()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

