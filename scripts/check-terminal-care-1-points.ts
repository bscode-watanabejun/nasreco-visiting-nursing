/**
 * terminal_care_1の加算マスタの点数を確認するスクリプト
 */

import { db } from '../server/db';
import { bonusMaster } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function checkTerminalCare1Points() {
  console.log('🔍 terminal_care_1の加算マスタを確認中...\n');

  try {
    const bonus = await db.query.bonusMaster.findFirst({
      where: eq(bonusMaster.bonusCode, 'terminal_care_1'),
    });

    if (!bonus) {
      console.log('❌ terminal_care_1の加算マスタが見つかりません\n');
      return;
    }

    console.log('📋 加算マスタ情報:');
    console.log(`   加算コード: ${bonus.bonusCode}`);
    console.log(`   加算名: ${bonus.bonusName}`);
    console.log(`   点数タイプ: ${bonus.pointsType}`);
    console.log(`   固定点数: ${bonus.fixedPoints?.toLocaleString() || 'なし'}点`);
    console.log(`   保険種別: ${bonus.insuranceType}`);
    console.log(`   アクティブ: ${bonus.isActive}\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

checkTerminalCare1Points();
