/**
 * テストクリニックの11月データをクリーンアップするスクリプト
 * 
 * 開発環境の「テストクリニック」テナント（slug: 'test-clinic'）の
 * 2025年11月の訪問記録データとレセプトデータを削除します。
 * 
 * 削除対象:
 * - 月次レセプト（monthly_receipts）: 2025年11月
 * - 訪問記録添付ファイル（nursing_record_attachments）: 11月の訪問記録に紐づくファイル
 * - 訪問記録（nursing_records）: 2025年11月の訪問記録
 *   → これにより自動削除される:
 *     - bonus_calculation_history（CASCADE）
 *     - nursing_record_edit_history（CASCADE）
 * 
 * 使用方法:
 *   npx tsx scripts/cleanup-test-clinic-november.ts
 */

import { db } from "../server/db";
import { facilities, monthlyReceipts, nursingRecords, nursingRecordAttachments } from "../shared/schema";
import { eq, and, gte, lte } from "drizzle-orm";

async function cleanupTestClinicNovember() {
  console.log("🧹 テストクリニックの11月データをクリーンアップします...\n");

  try {
    // テストクリニックの施設IDを取得
    const testClinic = await db.query.facilities.findFirst({
      where: eq(facilities.slug, 'test-clinic'),
    });

    if (!testClinic) {
      console.error("❌ テストクリニック (slug: 'test-clinic') が見つかりません。");
      process.exit(1);
    }

    console.log(`✅ テストクリニックを確認: ${testClinic.name} (ID: ${testClinic.id})\n`);

    // 2025年11月の範囲を定義
    const targetYear = 2025;
    const targetMonth = 11;
    const startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
    const endDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-30`;

    console.log(`📅 対象期間: ${startDate} 〜 ${endDate}\n`);

    // トランザクションで実行
    await db.transaction(async (tx) => {
      // 1. 月次レセプトの件数を確認
      const receiptsToDelete = await tx.query.monthlyReceipts.findMany({
        where: and(
          eq(monthlyReceipts.facilityId, testClinic.id),
          eq(monthlyReceipts.targetYear, targetYear),
          eq(monthlyReceipts.targetMonth, targetMonth)
        ),
      });

      console.log(`📊 削除対象データの確認:`);
      console.log(`   月次レセプト: ${receiptsToDelete.length}件`);

      // 2. 11月の訪問記録を取得（件数確認用）
      const recordsToDelete = await tx.query.nursingRecords.findMany({
        where: and(
          eq(nursingRecords.facilityId, testClinic.id),
          gte(nursingRecords.visitDate, startDate),
          lte(nursingRecords.visitDate, endDate)
        ),
      });

      console.log(`   訪問記録: ${recordsToDelete.length}件`);

      // 3. 訪問記録添付ファイルの件数を確認
      const recordIds = recordsToDelete.map(r => r.id);
      let attachmentsCount = 0;
      if (recordIds.length > 0) {
        const attachments = await tx.query.nursingRecordAttachments.findMany({
          where: (attachments, { inArray }) => inArray(attachments.nursingRecordId, recordIds),
        });
        attachmentsCount = attachments.length;
      }
      console.log(`   訪問記録添付ファイル: ${attachmentsCount}件\n`);

      if (receiptsToDelete.length === 0 && recordsToDelete.length === 0) {
        console.log("✅ 削除対象のデータはありませんでした。");
        return;
      }

      // 削除を実行
      console.log("🗑️  データを削除します...\n");

      // 1. 月次レセプトを削除
      if (receiptsToDelete.length > 0) {
        await tx.delete(monthlyReceipts)
          .where(and(
            eq(monthlyReceipts.facilityId, testClinic.id),
            eq(monthlyReceipts.targetYear, targetYear),
            eq(monthlyReceipts.targetMonth, targetMonth)
          ));
        console.log(`✅ 月次レセプト ${receiptsToDelete.length}件を削除しました`);
      }

      // 2. 訪問記録添付ファイルを削除
      if (recordIds.length > 0 && attachmentsCount > 0) {
        await tx.delete(nursingRecordAttachments)
          .where(inArray(nursingRecordAttachments.nursingRecordId, recordIds));
        console.log(`✅ 訪問記録添付ファイル ${attachmentsCount}件を削除しました`);
      }

      // 3. 訪問記録を削除（これによりbonus_calculation_historyとnursing_record_edit_historyも自動削除される）
      if (recordsToDelete.length > 0) {
        await tx.delete(nursingRecords)
          .where(and(
            eq(nursingRecords.facilityId, testClinic.id),
            gte(nursingRecords.visitDate, startDate),
            lte(nursingRecords.visitDate, endDate)
          ));
        console.log(`✅ 訪問記録 ${recordsToDelete.length}件を削除しました`);
        console.log(`   → bonus_calculation_history と nursing_record_edit_history も自動削除されました`);
      }

      console.log("\n✅ クリーンアップが完了しました！");
    });

  } catch (error) {
    console.error("❌ エラーが発生しました:", error);
    throw error;
  }
}

// スクリプトを実行
cleanupTestClinicNovember()
  .then(() => {
    console.log("\nスクリプトが正常に完了しました。");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nスクリプトの実行中にエラーが発生しました:", error);
    process.exit(1);
  });

