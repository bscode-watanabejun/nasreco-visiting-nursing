/**
 * 残っている加算マスタの修正スクリプト
 * 
 * discharge_joint_guidanceを無効化します。
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql, eq } from 'drizzle-orm';
import { bonusMaster } from '../shared/schema';

const PROD_DB_URL = process.env.PRODUCTION_DB_URL || 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';
const DEV_DB_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_beoRr4gaQ5Dl@ep-polished-scene-a5twqv82.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function fixRemainingBonusMaster() {
  console.log('🔧 残っている加算マスタを修正します...\n');
  
  const prodPool = new Pool({ connectionString: PROD_DB_URL });
  const devPool = new Pool({ connectionString: DEV_DB_URL });
  const prodDb = drizzle(prodPool);
  const devDb = drizzle(devPool);

  try {
    // 1. discharge_joint_guidanceの確認
    console.log('📊 1. discharge_joint_guidanceの確認:');
    console.log('─'.repeat(60));
    
    const prodDischargeJoint = await prodDb.select().from(bonusMaster)
      .where(sql`bonus_code = 'discharge_joint_guidance' AND is_active = true`);
    
    const devDischargeJoint = await devDb.select().from(bonusMaster)
      .where(sql`bonus_code = 'discharge_joint_guidance'`);
    
    console.log(`   本番環境（有効）: ${prodDischargeJoint.length}件`);
    console.log(`   開発環境: ${devDischargeJoint.length}件\n`);
    
    if (prodDischargeJoint.length === 0) {
      console.log('   ✅ 修正対象の加算マスタはありません。\n');
      return;
    }
    
    console.log('   本番環境の加算マスタ:');
    prodDischargeJoint.forEach((master, index) => {
      console.log(`   ${index + 1}. ${master.bonusCode} - ${master.bonusName}`);
      console.log(`      保険種別: ${master.insuranceType}`);
      console.log(`      点数: ${master.fixedPoints || '(条件分岐)'}`);
    });
    console.log('');

    // 2. 確認プロンプト
    console.log('⚠️  この加算マスタを無効化しますか？\n');
    
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

    // 3. 無効化
    console.log('📊 2. discharge_joint_guidanceを無効化中...');
    
    for (const master of prodDischargeJoint) {
      await prodDb.update(bonusMaster)
        .set({ 
          isActive: false,
          updatedAt: new Date(),
        })
        .where(eq(bonusMaster.id, master.id));
    }
    
    console.log(`   ✅ ${prodDischargeJoint.length}件の加算マスタを無効化しました。\n`);

    // 4. 検証
    console.log('📊 3. 修正後の確認:');
    console.log('─'.repeat(60));
    
    const prodActiveAfter = await prodDb.select().from(bonusMaster)
      .where(sql`bonus_code = 'discharge_joint_guidance' AND is_active = true`);
    
    if (prodActiveAfter.length === 0) {
      console.log('   ✅ discharge_joint_guidanceは無効化されました。\n');
    } else {
      console.log(`   ⚠️  まだ有効な加算マスタが残っています: ${prodActiveAfter.length}件\n`);
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

fixRemainingBonusMaster()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

