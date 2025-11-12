/**
 * terminal_care_1の加算履歴の点数を2,500点に修正するスクリプト
 */

import { db } from '../server/db';
import { bonusCalculationHistory, bonusMaster } from '../shared/schema';
import { eq, and } from 'drizzle-orm';

async function fixTerminalCare1History() {
  console.log('🔧 terminal_care_1の加算履歴の点数を修正中...\n');

  try {
    // terminal_care_1の加算マスタIDを取得
    const bonus = await db.query.bonusMaster.findFirst({
      where: eq(bonusMaster.bonusCode, 'terminal_care_1'),
    });

    if (!bonus) {
      console.log('❌ terminal_care_1の加算マスタが見つかりません\n');
      return;
    }

    // 25,000点の履歴を取得
    const incorrectHistories = await db.query.bonusCalculationHistory.findMany({
      where: and(
        eq(bonusCalculationHistory.bonusMasterId, bonus.id),
        eq(bonusCalculationHistory.calculatedPoints, 25000)
      ),
    });

    console.log(`📊 修正対象の履歴: ${incorrectHistories.length}件\n`);

    if (incorrectHistories.length === 0) {
      console.log('✅ 修正対象の履歴はありません\n');
      return;
    }

    // 各履歴の点数を2,500点に修正
    for (const history of incorrectHistories) {
      await db
        .update(bonusCalculationHistory)
        .set({ 
          calculatedPoints: 2500,
        })
        .where(eq(bonusCalculationHistory.id, history.id));

      console.log(`✅ 履歴ID ${history.id} の点数を2,500点に修正しました`);
    }

    console.log(`\n✅ 全${incorrectHistories.length}件の履歴を修正しました\n`);

    // 修正後の確認
    const updatedHistories = await db.query.bonusCalculationHistory.findMany({
      where: eq(bonusCalculationHistory.bonusMasterId, bonus.id),
    });

    const correctCount = updatedHistories.filter(h => h.calculatedPoints === 2500).length;
    const incorrectCount = updatedHistories.filter(h => h.calculatedPoints === 25000).length;

    console.log(`📊 修正後の状況:`);
    console.log(`   ✅ 2,500点の履歴: ${correctCount}件`);
    console.log(`   ⚠️  25,000点の履歴: ${incorrectCount}件\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

fixTerminalCare1History();
