/**
 * 開発環境と本番環境の加算マスタの詳細な差分分析
 * 
 * どの加算マスタが異なるのか、詳細に確認します。
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import { bonusMaster } from '../shared/schema';

const PROD_DB_URL = process.env.PRODUCTION_DB_URL || 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';
const DEV_DB_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_beoRr4gaQ5Dl@ep-polished-scene-a5twqv82.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function analyzeBonusMasterDifferences() {
  console.log('🔍 開発環境と本番環境の加算マスタの詳細な差分を分析します...\n');
  
  const prodPool = new Pool({ connectionString: PROD_DB_URL });
  const devPool = new Pool({ connectionString: DEV_DB_URL });
  const prodDb = drizzle(prodPool);
  const devDb = drizzle(devPool);

  try {
    // 1. 開発環境の有効な加算マスタを取得
    console.log('📊 1. 開発環境の有効な加算マスタを取得中...');
    const devActiveMasters = await devDb.select().from(bonusMaster)
      .where(sql`is_active = true`)
      .orderBy(bonusMaster.bonusCode);
    
    console.log(`   開発環境の有効な加算マスタ数: ${devActiveMasters.length}件\n`);

    // 2. 本番環境の有効な加算マスタを取得
    console.log('📊 2. 本番環境の有効な加算マスタを取得中...');
    const prodActiveMasters = await prodDb.select().from(bonusMaster)
      .where(sql`is_active = true`)
      .orderBy(bonusMaster.bonusCode);
    
    console.log(`   本番環境の有効な加算マスタ数: ${prodActiveMasters.length}件\n`);

    // 3. bonus_codeで比較
    const devBonusCodes = new Set(devActiveMasters.map(m => m.bonusCode));
    const prodBonusCodes = new Set(prodActiveMasters.map(m => m.bonusCode));
    
    const missingInProd = devActiveMasters.filter(m => !prodBonusCodes.has(m.bonusCode));
    const extraInProd = prodActiveMasters.filter(m => !devBonusCodes.has(m.bonusCode));
    const commonCodes = devActiveMasters.filter(m => prodBonusCodes.has(m.bonusCode));

    // 4. 本番環境に存在しない加算マスタ
    console.log('📊 3. 本番環境に存在しない加算マスタ:');
    console.log('─'.repeat(60));
    
    if (missingInProd.length > 0) {
      console.log(`   件数: ${missingInProd.length}件\n`);
      missingInProd.forEach((master, index) => {
        console.log(`   ${index + 1}. ${master.bonusCode} - ${master.bonusName}`);
        console.log(`      保険種別: ${master.insuranceType}`);
        console.log(`      点数タイプ: ${master.pointsType}`);
        console.log(`      固定点数: ${master.fixedPoints || '(条件分岐)'}`);
        console.log(`      適用バージョン: ${master.appliedVersion}`);
      });
      console.log('');
    } else {
      console.log('   ✅ 本番環境に存在しない加算マスタはありません。\n');
    }

    // 5. 本番環境にのみ存在する加算マスタ
    console.log('📊 4. 本番環境にのみ存在する加算マスタ:');
    console.log('─'.repeat(60));
    
    if (extraInProd.length > 0) {
      console.log(`   件数: ${extraInProd.length}件\n`);
      extraInProd.forEach((master, index) => {
        console.log(`   ${index + 1}. ${master.bonusCode} - ${master.bonusName}`);
        console.log(`      保険種別: ${master.insuranceType}`);
        console.log(`      点数タイプ: ${master.pointsType}`);
        console.log(`      固定点数: ${master.fixedPoints || '(条件分岐)'}`);
        console.log(`      適用バージョン: ${master.appliedVersion}`);
      });
      console.log('');
    } else {
      console.log('   ✅ 本番環境にのみ存在する加算マスタはありません。\n');
    }

    // 6. 共通の加算マスタの内容比較
    console.log('📊 5. 共通の加算マスタの内容比較:');
    console.log('─'.repeat(60));
    
    let hasDifferences = false;
    const differences: Array<{
      bonusCode: string;
      field: string;
      devValue: any;
      prodValue: any;
    }> = [];
    
    for (const devMaster of commonCodes) {
      const prodMaster = prodActiveMasters.find(m => m.bonusCode === devMaster.bonusCode);
      if (!prodMaster) continue;
      
      // 主要フィールドの比較
      const fieldsToCompare = [
        'bonusName',
        'insuranceType',
        'pointsType',
        'fixedPoints',
        'conditionalPattern',
        'pointsConfig',
        'appliedVersion',
        'isActive',
      ];
      
      for (const field of fieldsToCompare) {
        const devValue = (devMaster as any)[field];
        const prodValue = (prodMaster as any)[field];
        
        // JSONの比較
        if (field === 'pointsConfig') {
          const devJson = devValue ? JSON.stringify(devValue) : null;
          const prodJson = prodValue ? JSON.stringify(prodValue) : null;
          if (devJson !== prodJson) {
            hasDifferences = true;
            differences.push({
              bonusCode: devMaster.bonusCode,
              field,
              devValue: devJson,
              prodValue: prodJson,
            });
          }
        } else if (devValue !== prodValue) {
          hasDifferences = true;
          differences.push({
            bonusCode: devMaster.bonusCode,
            field,
            devValue,
            prodValue,
          });
        }
      }
    }
    
    if (hasDifferences) {
      console.log(`   内容が異なる加算マスタ: ${differences.length}件\n`);
      differences.slice(0, 10).forEach((diff, index) => {
        console.log(`   ${index + 1}. ${diff.bonusCode} - ${diff.field}`);
        console.log(`      開発環境: ${diff.devValue}`);
        console.log(`      本番環境: ${diff.prodValue}`);
      });
      if (differences.length > 10) {
        console.log(`   ... 他 ${differences.length - 10}件の差分\n`);
      } else {
        console.log('');
      }
    } else {
      console.log('   ✅ 共通の加算マスタの内容に差分はありません。\n');
    }

    // 7. 開発環境の無効な加算マスタの確認
    console.log('📊 6. 開発環境の無効な加算マスタ:');
    console.log('─'.repeat(60));
    
    const devInactiveMasters = await devDb.select().from(bonusMaster)
      .where(sql`is_active = false`)
      .orderBy(bonusMaster.bonusCode);
    
    console.log(`   件数: ${devInactiveMasters.length}件\n`);
    
    if (devInactiveMasters.length > 0) {
      console.log('   無効な加算マスタ（最初の10件）:');
      devInactiveMasters.slice(0, 10).forEach((master, index) => {
        console.log(`   ${index + 1}. ${master.bonusCode} - ${master.bonusName} (${master.insuranceType})`);
      });
      if (devInactiveMasters.length > 10) {
        console.log(`   ... 他 ${devInactiveMasters.length - 10}件\n`);
      } else {
        console.log('');
      }
      
      // 本番環境でこれらのコードが有効か確認
      const devInactiveCodes = new Set(devInactiveMasters.map(m => m.bonusCode));
      const prodInactiveInDev = prodActiveMasters.filter(m => devInactiveCodes.has(m.bonusCode));
      
      if (prodInactiveInDev.length > 0) {
        console.log(`   ⚠️  開発環境で無効だが本番環境で有効な加算マスタ: ${prodInactiveInDev.length}件`);
        prodInactiveInDev.forEach((master, index) => {
          console.log(`   ${index + 1}. ${master.bonusCode} - ${master.bonusName} (${master.insuranceType})`);
        });
        console.log('');
      }
    }

    // 8. サマリー
    console.log('📊 7. 差分のサマリー:');
    console.log('─'.repeat(60));
    
    console.log(`   開発環境の有効な加算マスタ: ${devActiveMasters.length}件`);
    console.log(`   本番環境の有効な加算マスタ: ${prodActiveMasters.length}件`);
    console.log(`   共通の加算マスタ: ${commonCodes.length}件`);
    console.log(`   本番環境に存在しない: ${missingInProd.length}件`);
    console.log(`   本番環境にのみ存在する: ${extraInProd.length}件`);
    console.log(`   内容が異なる: ${differences.length}件\n`);
    
    if (missingInProd.length > 0 || extraInProd.length > 0 || differences.length > 0) {
      console.log('   ⚠️  開発環境と本番環境で加算マスタに差分があります。');
      console.log('      開発環境を本番環境に反映する必要があります。\n');
    } else {
      console.log('   ✅ 開発環境と本番環境の加算マスタは一致しています。\n');
    }

    console.log('─'.repeat(60));
    console.log('✅ 加算マスタの詳細な差分分析が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prodPool.end();
    await devPool.end();
  }
}

analyzeBonusMasterDifferences()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

