/**
 * 難病等複数回訪問加算（3回以上/日）の条件を修正するスクリプト
 * 
 * 1日の訪問回数が3回以上という条件を追加します。
 */

import { db } from '../server/db';
import { bonusMaster } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function fixMultipleVisit3timesCondition() {
  console.log('🔧 難病等複数回訪問加算（3回以上/日）の条件を修正中...\n');

  try {
    // medical_multiple_visit_3timesの事前定義条件を修正
    await db
      .update(bonusMaster)
      .set({
        predefinedConditions: [
          {
            field: "multipleVisitReason",
            value: true,
            pattern: "field_not_empty",
            operator: "equals",
            description: "訪問記録の複数回訪問理由に入力あり"
          },
          {
            pattern: "daily_visit_count_gte",
            value: 3,
            description: "1日の訪問回数が3回以上"
          }
        ],
      })
      .where(eq(bonusMaster.bonusCode, "medical_multiple_visit_3times"));

    console.log('✅ medical_multiple_visit_3timesの事前定義条件を修正しました\n');

    // 確認
    const bonus = await db.query.bonusMaster.findFirst({
      where: eq(bonusMaster.bonusCode, "medical_multiple_visit_3times"),
    });

    if (bonus) {
      console.log('📋 修正後の加算マスタ:');
      console.log(`  加算コード: ${bonus.bonusCode}`);
      console.log(`  加算名: ${bonus.bonusName}`);
      console.log(`  事前定義条件:`);
      console.log(JSON.stringify(bonus.predefinedConditions, null, 2));
    } else {
      console.log('⚠️  加算マスタが見つかりませんでした');
    }

    console.log('\n✅ 修正が完了しました');
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

// スクリプトを実行
fixMultipleVisit3timesCondition()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ 予期しないエラー:', error);
    process.exit(1);
  });

