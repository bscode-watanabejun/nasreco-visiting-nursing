/**
 * terminal_care_1の加算マスタの点数を2,500点に修正するスクリプト
 */

import { db } from '../server/db';
import { bonusMaster } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function fixTerminalCare1Points() {
  console.log('🔧 terminal_care_1の加算マスタの点数を修正中...\n');

  try {
    // 現在の値を確認
    const bonus = await db.query.bonusMaster.findFirst({
      where: eq(bonusMaster.bonusCode, 'terminal_care_1'),
    });

    if (!bonus) {
      console.log('❌ terminal_care_1の加算マスタが見つかりません\n');
      return;
    }

    console.log('📋 修正前の情報:');
    console.log(`   加算コード: ${bonus.bonusCode}`);
    console.log(`   加算名: ${bonus.bonusName}`);
    console.log(`   固定点数: ${bonus.fixedPoints?.toLocaleString() || 'なし'}点\n`);

    // 点数を2,500点に修正
    await db
      .update(bonusMaster)
      .set({ 
        fixedPoints: 2500,
        updatedAt: new Date(),
      })
      .where(eq(bonusMaster.bonusCode, 'terminal_care_1'));

    console.log('✅ 点数を2,500点に修正しました\n');

    // 修正後の値を確認
    const updatedBonus = await db.query.bonusMaster.findFirst({
      where: eq(bonusMaster.bonusCode, 'terminal_care_1'),
    });

    if (updatedBonus) {
      console.log('📋 修正後の情報:');
      console.log(`   加算コード: ${updatedBonus.bonusCode}`);
      console.log(`   加算名: ${updatedBonus.bonusName}`);
      console.log(`   固定点数: ${updatedBonus.fixedPoints?.toLocaleString() || 'なし'}点\n`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

fixTerminalCare1Points();
