/**
 * 加算履歴の重複データをクリーンアップするスクリプト
 * 
 * 同じnursingRecordIdとbonusMasterIdの組み合わせで複数のレコードが存在する場合、
 * 最新のレコード（createdAtが最新）を残し、古いレコードを削除します。
 * 
 * 使用方法:
 *   npx tsx scripts/cleanup-duplicate-bonus-history.ts
 */

import { db } from "../server/db";
import { bonusCalculationHistory } from "../shared/schema";
import { sql, eq } from "drizzle-orm";

async function cleanupDuplicateBonusHistory() {
  console.log("加算履歴の重複データをクリーンアップします...\n");

  try {
    // 重複しているレコードを検出
    const duplicates = await db.execute(sql`
      SELECT 
        nursing_record_id,
        bonus_master_id,
        COUNT(*) as count,
        ARRAY_AGG(id ORDER BY created_at DESC) as ids,
        ARRAY_AGG(created_at ORDER BY created_at DESC) as created_dates
      FROM bonus_calculation_history
      GROUP BY nursing_record_id, bonus_master_id
      HAVING COUNT(*) > 1
      ORDER BY nursing_record_id, bonus_master_id
    `);

    if (duplicates.rows.length === 0) {
      console.log("✅ 重複データは見つかりませんでした。");
      return;
    }

    console.log(`⚠️  重複データが ${duplicates.rows.length} 件見つかりました。\n`);

    let totalDeleted = 0;

    for (const duplicate of duplicates.rows) {
      const nursingRecordId = duplicate.nursing_record_id as string;
      const bonusMasterId = duplicate.bonus_master_id as string;
      const count = duplicate.count as number;
      const ids = duplicate.ids as string[];
      const createdDates = duplicate.created_dates as Date[];

      // 最新のレコード（最初のID）を残し、残りを削除
      const idsToDelete = ids.slice(1); // 最初のID以外を削除対象

      console.log(`訪問記録ID: ${nursingRecordId}, 加算マスタID: ${bonusMasterId}`);
      console.log(`  重複数: ${count}件`);
      console.log(`  保持するレコードID: ${ids[0]} (作成日時: ${createdDates[0]})`);
      console.log(`  削除するレコードID: ${idsToDelete.join(", ")}`);

      // 削除を実行
      for (const idToDelete of idsToDelete) {
        await db.delete(bonusCalculationHistory)
          .where(eq(bonusCalculationHistory.id, idToDelete));
        totalDeleted++;
      }

      console.log(`  ✅ ${idsToDelete.length}件のレコードを削除しました。\n`);
    }

    console.log(`\n✅ クリーンアップ完了: 合計 ${totalDeleted} 件の重複レコードを削除しました。`);

    // ユニーク制約を追加する前に、再度重複がないか確認
    const remainingDuplicates = await db.execute(sql`
      SELECT 
        nursing_record_id,
        bonus_master_id,
        COUNT(*) as count
      FROM bonus_calculation_history
      GROUP BY nursing_record_id, bonus_master_id
      HAVING COUNT(*) > 1
    `);

    if (remainingDuplicates.rows.length > 0) {
      console.log(`\n⚠️  警告: まだ ${remainingDuplicates.rows.length} 件の重複が残っています。`);
      console.log("   ユニーク制約を追加する前に、手動で確認してください。");
    } else {
      console.log("\n✅ すべての重複が解消されました。ユニーク制約を追加できます。");
    }

  } catch (error) {
    console.error("❌ エラーが発生しました:", error);
    throw error;
  }
}

// スクリプトを実行
cleanupDuplicateBonusHistory()
  .then(() => {
    console.log("\nスクリプトが正常に完了しました。");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nスクリプトの実行中にエラーが発生しました:", error);
    process.exit(1);
  });

