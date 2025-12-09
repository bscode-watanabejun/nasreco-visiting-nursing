/**
 * 開発環境の24時間対応体制加算の加算マスタ設定を確認するスクリプト
 */

import { db } from "../server/db";
import { bonusMaster } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

async function checkDev24hBonusMaster() {
  console.log('🔍 開発環境の24時間対応体制加算の加算マスタ設定を確認中...\n');

  try {
    const bonusCodes = ['24h_response_system_basic', '24h_response_system_enhanced'];
    
    for (const bonusCode of bonusCodes) {
      const bonus = await db.query.bonusMaster.findFirst({
        where: eq(bonusMaster.bonusCode, bonusCode),
      });

      if (!bonus) {
        console.log(`❌ ${bonusCode} が見つかりません\n`);
        continue;
      }

      console.log('='.repeat(80));
      console.log(`【${bonus.bonusCode}】${bonus.bonusName}`);
      console.log('='.repeat(80));
      console.log(`適用条件（predefinedConditions）:`);
      console.log(JSON.stringify(bonus.predefinedConditions, null, 2));
      console.log('');
    }

    console.log('✅ 確認完了');
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  }
}

// 実行
checkDev24hBonusMaster()
  .then(() => {
    console.log('\n✨ スクリプトが正常に完了しました');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ スクリプトの実行中にエラーが発生しました:', error);
    process.exit(1);
  });

