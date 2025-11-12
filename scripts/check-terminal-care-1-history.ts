/**
 * terminal_care_1の加算履歴を確認するスクリプト
 */

import { db } from '../server/db';
import { bonusCalculationHistory, bonusMaster } from '../shared/schema';
import { eq, and } from 'drizzle-orm';

async function checkTerminalCare1History() {
  console.log('🔍 terminal_care_1の加算履歴を確認中...\n');

  try {
    // terminal_care_1の加算マスタIDを取得
    const bonus = await db.query.bonusMaster.findFirst({
      where: eq(bonusMaster.bonusCode, 'terminal_care_1'),
    });

    if (!bonus) {
      console.log('❌ terminal_care_1の加算マスタが見つかりません\n');
      return;
    }

    // 加算履歴を取得
    const histories = await db.query.bonusCalculationHistory.findMany({
      where: eq(bonusCalculationHistory.bonusMasterId, bonus.id),
      orderBy: bonusCalculationHistory.appliedAt,
    });

    console.log(`📊 加算履歴の件数: ${histories.length}件\n`);

    if (histories.length === 0) {
      console.log('✅ 加算履歴はありません\n');
      return;
    }

    // 25,000点の履歴を確認
    const incorrectHistories = histories.filter(h => h.calculatedPoints === 25000);
    const correctHistories = histories.filter(h => h.calculatedPoints === 2500);

    console.log(`⚠️  25,000点の履歴: ${incorrectHistories.length}件`);
    console.log(`✅ 2,500点の履歴: ${correctHistories.length}件\n`);

    if (incorrectHistories.length > 0) {
      console.log('📋 25,000点の履歴（最初の5件）:');
      incorrectHistories.slice(0, 5).forEach((h, index) => {
        console.log(`   [${index + 1}] 履歴ID: ${h.id}`);
        console.log(`       訪問記録ID: ${h.nursingRecordId}`);
        console.log(`       点数: ${h.calculatedPoints.toLocaleString()}点`);
        console.log(`       適用日時: ${h.appliedAt}`);
        console.log('');
      });
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

checkTerminalCare1History();
