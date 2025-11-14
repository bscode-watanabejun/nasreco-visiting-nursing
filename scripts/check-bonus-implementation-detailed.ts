/**
 * 加算マスタの実装状況詳細確認スクリプト
 * 
 * 加算マスタのpredefinedConditionsやconditionalPatternの設定状況を確認し、
 * 汎用計算エンジンで計算可能かどうかを判定します。
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import { bonusMaster } from '../shared/schema';

const PROD_DB_URL = process.env.PRODUCTION_DB_URL || 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';
const DEV_DB_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_beoRr4gaQ5Dl@ep-polished-scene-a5twqv82.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function checkBonusImplementationDetailed() {
  console.log('🔍 加算マスタの実装状況を詳細に確認します...\n');
  
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
    
    console.log(`   有効な加算マスタ数: ${devActiveMasters.length}件\n`);

    // 2. 各加算マスタの実装可能性を判定
    console.log('📊 2. 各加算マスタの実装可能性を判定:');
    console.log('─'.repeat(60));
    
    const canCalculate: Array<typeof bonusMaster.$inferSelect & { reason: string }> = [];
    const cannotCalculate: Array<typeof bonusMaster.$inferSelect & { reason: string }> = [];
    
    for (const master of devActiveMasters) {
      let canCalc = false;
      let reason = '';
      
      // 固定点数の場合
      if (master.pointsType === 'fixed' && master.fixedPoints !== null) {
        // predefinedConditionsがあれば実装可能
        if (master.predefinedConditions) {
          canCalc = true;
          reason = '固定点数 + 事前定義条件あり';
        } else {
          // predefinedConditionsがなくても、条件なしの固定点数なら実装可能
          canCalc = true;
          reason = '固定点数（条件なし）';
        }
      }
      // 条件分岐の場合
      else if (master.pointsType === 'conditional' && master.conditionalPattern && master.pointsConfig) {
        canCalc = true;
        reason = `条件分岐パターン: ${master.conditionalPattern}`;
      }
      // その他
      else {
        canCalc = false;
        reason = '点数設定が不完全（fixedPointsまたはconditionalPattern+pointsConfigが必要）';
      }
      
      if (canCalc) {
        canCalculate.push({ ...master, reason });
      } else {
        cannotCalculate.push({ ...master, reason });
      }
    }
    
    console.log(`   計算可能: ${canCalculate.length}件`);
    console.log(`   計算不可: ${cannotCalculate.length}件\n`);
    
    if (canCalculate.length > 0) {
      console.log('   計算可能な加算マスタ:');
      canCalculate.forEach((master, index) => {
        console.log(`   ${index + 1}. ${master.bonusCode} - ${master.bonusName} (${master.insuranceType})`);
        console.log(`      理由: ${master.reason}`);
      });
      console.log('');
    }
    
    if (cannotCalculate.length > 0) {
      console.log('   ⚠️  計算不可の加算マスタ:');
      cannotCalculate.forEach((master, index) => {
        console.log(`   ${index + 1}. ${master.bonusCode} - ${master.bonusName} (${master.insuranceType})`);
        console.log(`      理由: ${master.reason}`);
        console.log(`      点数タイプ: ${master.pointsType}`);
        console.log(`      固定点数: ${master.fixedPoints || '(なし)'}`);
        console.log(`      条件分岐パターン: ${master.conditionalPattern || '(なし)'}`);
        console.log(`      点数設定: ${master.pointsConfig ? 'あり' : 'なし'}`);
        console.log(`      事前定義条件: ${master.predefinedConditions ? 'あり' : 'なし'}`);
      });
      console.log('');
    }

    // 3. 保険種別ごとの実装可能性
    console.log('📊 3. 保険種別ごとの実装可能性:');
    console.log('─'.repeat(60));
    
    const medicalCanCalc = canCalculate.filter(m => m.insuranceType === 'medical').length;
    const medicalCannotCalc = cannotCalculate.filter(m => m.insuranceType === 'medical').length;
    const careCanCalc = canCalculate.filter(m => m.insuranceType === 'care').length;
    const careCannotCalc = cannotCalculate.filter(m => m.insuranceType === 'care').length;
    
    console.log(`   医療保険 - 計算可能: ${medicalCanCalc}件 / 計算不可: ${medicalCannotCalc}件`);
    console.log(`   介護保険 - 計算可能: ${careCanCalc}件 / 計算不可: ${careCannotCalc}件\n`);

    // 4. predefinedConditionsの設定状況
    console.log('📊 4. predefinedConditionsの設定状況:');
    console.log('─'.repeat(60));
    
    const withPredefinedConditions = devActiveMasters.filter(m => m.predefinedConditions !== null);
    const withoutPredefinedConditions = devActiveMasters.filter(m => m.predefinedConditions === null);
    
    console.log(`   事前定義条件あり: ${withPredefinedConditions.length}件`);
    console.log(`   事前定義条件なし: ${withoutPredefinedConditions.length}件\n`);
    
    if (withoutPredefinedConditions.length > 0) {
      console.log('   事前定義条件がない加算マスタ:');
      withoutPredefinedConditions.forEach((master, index) => {
        console.log(`   ${index + 1}. ${master.bonusCode} - ${master.bonusName} (${master.insuranceType})`);
      });
      console.log('');
    }

    // 5. conditionalPatternの設定状況
    console.log('📊 5. conditionalPatternの設定状況:');
    console.log('─'.repeat(60));
    
    const withConditionalPattern = devActiveMasters.filter(m => m.conditionalPattern !== null);
    const withoutConditionalPattern = devActiveMasters.filter(m => m.conditionalPattern === null);
    
    console.log(`   条件分岐パターンあり: ${withConditionalPattern.length}件`);
    console.log(`   条件分岐パターンなし: ${withoutConditionalPattern.length}件\n`);
    
    if (withConditionalPattern.length > 0) {
      console.log('   条件分岐パターンがある加算マスタ:');
      const patternCounts = new Map<string, number>();
      withConditionalPattern.forEach(m => {
        const pattern = m.conditionalPattern || 'unknown';
        patternCounts.set(pattern, (patternCounts.get(pattern) || 0) + 1);
      });
      patternCounts.forEach((count, pattern) => {
        console.log(`   - ${pattern}: ${count}件`);
      });
      console.log('');
    }

    // 6. サマリー
    console.log('📊 6. サマリー:');
    console.log('─'.repeat(60));
    
    if (cannotCalculate.length === 0) {
      console.log('   ✅ すべての有効な加算マスタが計算可能です。');
      console.log('      汎用計算エンジンで計算できます。\n');
    } else {
      console.log(`   ⚠️  ${cannotCalculate.length}件の加算マスタが計算不可です。`);
      console.log('      これらの加算マスタは、点数設定や条件設定が不完全です。\n');
    }

    console.log('─'.repeat(60));
    console.log('✅ 実装状況の詳細確認が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prodPool.end();
    await devPool.end();
  }
}

checkBonusImplementationDetailed()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });


