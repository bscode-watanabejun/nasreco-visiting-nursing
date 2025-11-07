/**
 * データ移行スクリプト: 保険者番号から審査支払機関コードを自動判定
 *
 * 判定ルール（公式仕様書 別表1 に基づく）:
 * - 6桁 → 国保連 ('2')
 * - 8桁 + '39'始まり → 後期高齢者医療 → 国保連 ('2')
 * - 8桁 + その他 → 健康保険（社保） → 社保 ('1')
 */

import { db } from "../server/db";
import { insuranceCards } from "../shared/schema";
import { sql } from "drizzle-orm";

/**
 * 保険者番号から審査支払機関コードを判定
 */
function determineReviewOrganizationCode(insurerNumber: string): '1' | '2' | null {
  if (!insurerNumber) return null;

  const length = insurerNumber.trim().length;
  const prefix = insurerNumber.substring(0, 2);

  // 6桁 → 国保連 ('2')
  if (length === 6) {
    return '2';
  }

  // 8桁の場合
  if (length === 8) {
    // 後期高齢者医療（39で始まる） → 国保連 ('2')
    if (prefix === '39') {
      return '2';
    }
    // その他の8桁 → 社保 ('1')
    return '1';
  }

  // 判定不能
  return null;
}

async function migrateReviewOrganizationCodes() {
  console.log('🚀 審査支払機関コードの自動判定マイグレーション開始...\n');

  try {
    // 既存の保険証データを取得
    const cards = await db.select({
      id: insuranceCards.id,
      insurerNumber: insuranceCards.insurerNumber,
      reviewOrganizationCode: insuranceCards.reviewOrganizationCode,
    }).from(insuranceCards);

    console.log(`📊 対象保険証数: ${cards.length}件\n`);

    let updatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const card of cards) {
      // 既に設定されている場合はスキップ
      if (card.reviewOrganizationCode) {
        skippedCount++;
        continue;
      }

      // 審査支払機関コードを判定
      const code = determineReviewOrganizationCode(card.insurerNumber);

      if (code) {
        await db.update(insuranceCards)
          .set({ reviewOrganizationCode: code })
          .where(sql`${insuranceCards.id} = ${card.id}`);

        const orgName = code === '1'
          ? '社会保険診療報酬支払基金'
          : '国民健康保険団体連合会';

        console.log(`✅ ID: ${card.id.substring(0, 8)}... | 保険者番号: ${card.insurerNumber} → ${orgName} (${code})`);
        updatedCount++;
      } else {
        console.log(`⚠️  ID: ${card.id.substring(0, 8)}... | 保険者番号: ${card.insurerNumber} → 判定不能（手動設定が必要）`);
        failedCount++;
      }
    }

    console.log(`\n📈 マイグレーション完了:`)
    console.log(`   - 更新: ${updatedCount}件`);
    console.log(`   - スキップ（既設定）: ${skippedCount}件`);
    console.log(`   - 判定不能: ${failedCount}件`);

    if (failedCount > 0) {
      console.log(`\n⚠️  注意: ${failedCount}件の保険証は審査支払機関を判定できませんでした。`);
      console.log(`   手動で設定してください。`);
    }

  } catch (error) {
    console.error('❌ マイグレーションエラー:', error);
    throw error;
  }
}

// スクリプト実行
migrateReviewOrganizationCodes()
  .then(() => {
    console.log('\n✨ マイグレーション成功！');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 マイグレーション失敗:', error);
    process.exit(1);
  });
