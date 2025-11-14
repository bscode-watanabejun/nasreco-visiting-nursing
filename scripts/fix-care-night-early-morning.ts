/**
 * care_night_early_morningの修正スクリプト
 * 
 * 開発環境で有効なcare_night_early_morningを本番環境でも有効化します。
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql, eq } from 'drizzle-orm';
import { bonusMaster } from '../shared/schema';

const PROD_DB_URL = process.env.PRODUCTION_DB_URL || 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';
const DEV_DB_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_beoRr4gaQ5Dl@ep-polished-scene-a5twqv82.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function fixCareNightEarlyMorning() {
  console.log('🔧 care_night_early_morningを修正します...\n');
  
  const prodPool = new Pool({ connectionString: PROD_DB_URL });
  const devPool = new Pool({ connectionString: DEV_DB_URL });
  const prodDb = drizzle(prodPool);
  const devDb = drizzle(devPool);

  try {
    // 1. 開発環境で有効なcare_night_early_morningを取得
    console.log('📊 1. 開発環境で有効なcare_night_early_morningを取得中...');
    const devActive = await devDb.select().from(bonusMaster)
      .where(sql`bonus_code = 'care_night_early_morning' AND is_active = true`);
    
    console.log(`   開発環境（有効）: ${devActive.length}件\n`);
    
    if (devActive.length === 0) {
      console.log('   ✅ 開発環境で有効なcare_night_early_morningはありません。\n');
      return;
    }
    
    devActive.forEach((master, index) => {
      console.log(`   ${index + 1}. ${master.bonusCode} - ${master.bonusName}`);
      console.log(`      保険種別: ${master.insuranceType}`);
      console.log(`      点数タイプ: ${master.pointsType}`);
      console.log(`      固定点数: ${master.fixedPoints || '(条件分岐)'}`);
      console.log(`      条件分岐パターン: ${master.conditionalPattern || 'なし'}`);
    });
    console.log('');

    // 2. 本番環境のcare_night_early_morningを取得
    console.log('📊 2. 本番環境のcare_night_early_morningを取得中...');
    const prodAll = await prodDb.select().from(bonusMaster)
      .where(sql`bonus_code = 'care_night_early_morning'`);
    
    console.log(`   本番環境（全件）: ${prodAll.length}件\n`);
    
    prodAll.forEach((master, index) => {
      console.log(`   ${index + 1}. ${master.bonusCode} - ${master.bonusName}`);
      console.log(`      有効: ${master.isActive ? 'はい' : 'いいえ'}`);
      console.log(`      保険種別: ${master.insuranceType}`);
      console.log(`      点数タイプ: ${master.pointsType}`);
      console.log(`      固定点数: ${master.fixedPoints || '(条件分岐)'}`);
      console.log(`      条件分岐パターン: ${master.conditionalPattern || 'なし'}`);
    });
    console.log('');

    // 3. 開発環境で有効なものと同じものを本番環境で有効化
    if (devActive.length > 0 && prodAll.length > 0) {
      const devActiveMaster = devActive[0];
      
      // bonus_nameで一致するものを探す
      const matchingProd = prodAll.find(p => p.bonusName === devActiveMaster.bonusName);
      
      if (matchingProd) {
        console.log('📊 3. 一致する加算マスタを有効化中...');
        console.log(`   対象: ${matchingProd.bonusCode} - ${matchingProd.bonusName}\n`);
        
        // 確認プロンプト
        console.log('⚠️  この加算マスタを有効化しますか？\n');
        
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

        // 有効化
        await prodDb.update(bonusMaster)
          .set({ 
            isActive: true,
            updatedAt: new Date(),
          })
          .where(eq(bonusMaster.id, matchingProd.id));
        
        console.log('   ✅ 加算マスタを有効化しました。\n');
      } else {
        console.log('   ⚠️  開発環境で有効なものと一致する本番環境の加算マスタが見つかりませんでした。\n');
      }
    }

    // 4. 検証
    console.log('📊 4. 修正後の確認:');
    console.log('─'.repeat(60));
    
    const prodActiveAfter = await prodDb.select().from(bonusMaster)
      .where(sql`bonus_code = 'care_night_early_morning' AND is_active = true`);
    
    console.log(`   本番環境（有効）: ${prodActiveAfter.length}件`);
    console.log(`   開発環境（有効）: ${devActive.length}件\n`);
    
    if (prodActiveAfter.length === devActive.length) {
      console.log('   ✅ care_night_early_morningの有効数が一致しました。\n');
    } else {
      console.log(`   ⚠️  有効数が一致しません（差分: ${prodActiveAfter.length - devActive.length}件）。\n`);
    }

    console.log('─'.repeat(60));
    console.log('✅ 修正が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prodPool.end();
    await devPool.end();
  }
}

fixCareNightEarlyMorning()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

