/**
 * 全ての加算マスタの点数をサービスコードの点数に合わせて修正するスクリプト
 */

import { db } from '../server/db';
import { bonusMaster, bonusCalculationHistory } from '../shared/schema';
import { eq, and } from 'drizzle-orm';

async function fixAllBonusMasterPoints() {
  console.log('🔧 加算マスタの点数を修正中...\n');

  // 修正対象の加算マスタと正しい点数
  const fixes: Array<{ bonusCode: string; correctPoints: number }> = [
    { bonusCode: 'terminal_care_2', correctPoints: 1000 },
    { bonusCode: '24h_response_system_basic', correctPoints: 652 },
    { bonusCode: '24h_response_system_enhanced', correctPoints: 680 },
    { bonusCode: 'discharge_special_management_guidance', correctPoints: 200 },
    { bonusCode: 'discharge_support_guidance_basic', correctPoints: 600 },
    { bonusCode: 'medical_discharge_joint_guidance', correctPoints: 800 },
    { bonusCode: 'special_management_1', correctPoints: 500 },
    { bonusCode: 'special_management_2', correctPoints: 250 },
    { bonusCode: 'specialist_management', correctPoints: 250 },
    { bonusCode: 'care_terminal_care', correctPoints: 250 },
  ];

  try {
    // トランザクションで処理
    await db.transaction(async (tx) => {
      for (const fix of fixes) {
        // 加算マスタを取得
        const bonus = await tx.query.bonusMaster.findFirst({
          where: eq(bonusMaster.bonusCode, fix.bonusCode),
        });

        if (!bonus) {
          console.log(`⚠️  ${fix.bonusCode}の加算マスタが見つかりません`);
          continue;
        }

        if (bonus.fixedPoints === fix.correctPoints) {
          console.log(`✅ ${fix.bonusCode}は既に正しい点数です（${fix.correctPoints}点）`);
          continue;
        }

        const oldPoints = bonus.fixedPoints || 0;
        console.log(`📋 ${fix.bonusCode} - ${bonus.bonusName}`);
        console.log(`   修正前: ${oldPoints.toLocaleString()}点 → 修正後: ${fix.correctPoints.toLocaleString()}点`);

        // 加算マスタの点数を修正
        await tx
          .update(bonusMaster)
          .set({
            fixedPoints: fix.correctPoints,
            updatedAt: new Date(),
          })
          .where(eq(bonusMaster.id, bonus.id));

        // 既存の加算履歴も修正
        const histories = await tx.query.bonusCalculationHistory.findMany({
          where: eq(bonusCalculationHistory.bonusMasterId, bonus.id),
        });

        if (histories.length > 0) {
          // 10倍になっている履歴を修正（oldPointsがfix.correctPointsの10倍の場合）
          if (oldPoints === fix.correctPoints * 10) {
            for (const history of histories) {
              if (history.calculatedPoints === oldPoints) {
                await tx
                  .update(bonusCalculationHistory)
                  .set({
                    calculatedPoints: fix.correctPoints,
                  })
                  .where(eq(bonusCalculationHistory.id, history.id));
              }
            }
            console.log(`   ✅ 加算履歴 ${histories.length}件を修正しました`);
          } else {
            console.log(`   ⚠️  加算履歴の点数が予期しない値のため、手動確認が必要です`);
          }
        }

        console.log('');
      }
    });

    console.log('✅ 全ての加算マスタの点数を修正しました\n');

    // 修正後の確認
    console.log('📊 修正後の確認:');
    for (const fix of fixes) {
      const bonus = await db.query.bonusMaster.findFirst({
        where: eq(bonusMaster.bonusCode, fix.bonusCode),
      });

      if (bonus) {
        const status = bonus.fixedPoints === fix.correctPoints ? '✅' : '❌';
        console.log(`${status} ${fix.bonusCode}: ${bonus.fixedPoints?.toLocaleString() || 'なし'}点（期待値: ${fix.correctPoints.toLocaleString()}点）`);
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

fixAllBonusMasterPoints();

