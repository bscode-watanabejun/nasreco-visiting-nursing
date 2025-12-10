/**
 * 請求書番号管理サービス
 * 
 * 請求書Noの発番を管理します。
 * フォーマット: yyyymm + 連番（4桁）= 10桁
 * 例: 20251200001（2025年12月の1番目の請求書）
 */

import { db } from '../db';
import { invoiceNumbers } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';

/**
 * 請求書Noを生成
 * 
 * @param facilityId - 施設ID
 * @param outputDate - 出力日（デフォルト: 現在日時）
 * @returns 10桁の請求書No（例: "20251200001"）
 */
export async function generateInvoiceNumber(
  facilityId: string,
  outputDate: Date = new Date()
): Promise<string> {
  // 日付プレフィックスを生成（yyyymm形式、6桁）
  const year = outputDate.getFullYear();
  const month = outputDate.getMonth() + 1;
  const datePrefix = `${year}${String(month).padStart(2, '0')}`;

  // トランザクション内で連番を取得・更新
  return await db.transaction(async (tx) => {
    // 該当日付の最新の連番を取得
    const latestRecord = await tx.query.invoiceNumbers.findFirst({
      where: and(
        eq(invoiceNumbers.facilityId, facilityId),
        eq(invoiceNumbers.datePrefix, datePrefix)
      ),
      orderBy: desc(invoiceNumbers.sequenceNumber),
    });

    // 次の連番を決定
    const nextSequenceNumber = latestRecord ? latestRecord.sequenceNumber + 1 : 1;

    // 新しいレコードを挿入
    await tx.insert(invoiceNumbers).values({
      facilityId,
      datePrefix,
      sequenceNumber: nextSequenceNumber,
    });

    // 10桁の請求書Noを生成（6桁の日付プレフィックス + 4桁の連番）
    const invoiceNumber = `${datePrefix}${String(nextSequenceNumber).padStart(4, '0')}`;
    
    return invoiceNumber;
  });
}
