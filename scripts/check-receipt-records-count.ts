/**
 * 2025年12月分 - 高橋 次郎のレセプト詳細画面の訪問記録の件数を確認するスクリプト
 */

import { db } from "../server/db";
import { monthlyReceipts, patients, nursingRecords } from "@shared/schema";
import { eq, and, gte, lte } from "drizzle-orm";

async function checkReceiptRecordsCount() {
  console.log('🔍 2025年12月分 - 高橋 次郎のレセプト詳細画面の訪問記録の件数を確認中...\n');

  try {
    // 1. 高橋 次郎の患者情報を取得
    const patient = await db.query.patients.findFirst({
      where: eq(patients.lastName, '高橋'),
    });

    if (!patient) {
      console.error('❌ 高橋 次郎の患者情報が見つかりません');
      return;
    }

    console.log(`📋 患者情報:`);
    console.log(`  患者番号: ${patient.patientNumber}`);
    console.log(`  氏名: ${patient.lastName} ${patient.firstName}`);
    console.log('');

    // 2. 12月分のレセプトを取得
    let receipt = await db.query.monthlyReceipts.findFirst({
      where: and(
        eq(monthlyReceipts.patientId, patient.id),
        eq(monthlyReceipts.targetYear, 2024),
        eq(monthlyReceipts.targetMonth, 12)
      ),
    });

    if (!receipt) {
      receipt = await db.query.monthlyReceipts.findFirst({
        where: and(
          eq(monthlyReceipts.patientId, patient.id),
          eq(monthlyReceipts.targetYear, 2025),
          eq(monthlyReceipts.targetMonth, 12)
        ),
      });
    }

    if (!receipt) {
      console.error('❌ 12月分のレセプトが見つかりません');
      return;
    }

    console.log(`📋 レセプト情報:`);
    console.log(`  レセプトID: ${receipt.id}`);
    console.log(`  対象年月: ${receipt.targetYear}年${receipt.targetMonth}月`);
    console.log(`  保険種別: ${receipt.insuranceType}`);
    console.log('');

    // 3. レセプト詳細画面で表示される訪問記録を取得
    // レセプト詳細画面では、status: 'completed'の訪問記録のみが表示される
    const targetYear = receipt.targetYear;
    const startDate = new Date(targetYear, receipt.targetMonth - 1, 1);
    const endDate = new Date(targetYear, receipt.targetMonth, 0);

    const records = await db.query.nursingRecords.findMany({
      where: and(
        eq(nursingRecords.patientId, patient.id),
        eq(nursingRecords.facilityId, receipt.facilityId),
        gte(nursingRecords.visitDate, startDate.toISOString().split('T')[0]),
        lte(nursingRecords.visitDate, endDate.toISOString().split('T')[0]),
        eq(nursingRecords.status, 'completed')
      ),
      orderBy: [nursingRecords.visitDate, nursingRecords.actualStartTime],
    });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📋 レセプト詳細画面の訪問記録: ${records.length}件`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    if (records.length > 0) {
      console.log('訪問記録の詳細:');
      records.forEach((record, index) => {
        const visitDate = typeof record.visitDate === 'string' ? record.visitDate : record.visitDate.toISOString().split('T')[0];
        const startTime = record.actualStartTime 
          ? (typeof record.actualStartTime === 'string' ? new Date(record.actualStartTime).toLocaleString('ja-JP') : record.actualStartTime.toLocaleString('ja-JP'))
          : '未設定';
        console.log(`  ${index + 1}. ID: ${record.id}`);
        console.log(`     訪問日: ${visitDate}`);
        console.log(`     開始時刻: ${startTime}`);
        console.log(`     ステータス: ${record.status}`);
        console.log('');
      });
    } else {
      console.log('訪問記録が存在しません');
    }

    // 4. 訪問記録をソートして最初の訪問記録を確認
    const sortedRecords = [...records].sort((a, b) => {
      const dateA = typeof a.visitDate === 'string' ? new Date(a.visitDate) : a.visitDate;
      const dateB = typeof b.visitDate === 'string' ? new Date(b.visitDate) : b.visitDate;
      const dateDiff = dateA.getTime() - dateB.getTime();
      if (dateDiff !== 0) return dateDiff;
      
      const timeA = a.actualStartTime ? (typeof a.actualStartTime === 'string' ? new Date(a.actualStartTime).getTime() : a.actualStartTime.getTime()) : Infinity;
      const timeB = b.actualStartTime ? (typeof b.actualStartTime === 'string' ? new Date(b.actualStartTime).getTime() : b.actualStartTime.getTime()) : Infinity;
      return timeA - timeB;
    });

    const firstRecordId = sortedRecords.length > 0 ? sortedRecords[0].id : null;

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 最初の訪問記録:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if (firstRecordId) {
      const firstRecord = sortedRecords[0];
      const visitDate = typeof firstRecord.visitDate === 'string' ? firstRecord.visitDate : firstRecord.visitDate.toISOString().split('T')[0];
      const startTime = firstRecord.actualStartTime 
        ? (typeof firstRecord.actualStartTime === 'string' ? new Date(firstRecord.actualStartTime).toLocaleString('ja-JP') : firstRecord.actualStartTime.toLocaleString('ja-JP'))
        : '未設定';
      console.log(`  訪問記録ID: ${firstRecord.id}`);
      console.log(`  訪問日: ${visitDate}`);
      console.log(`  開始時刻: ${startTime}`);
    } else {
      console.log('  最初の訪問記録が見つかりません');
    }

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  }
}

// 実行
checkReceiptRecordsCount()
  .then(() => {
    console.log('\n✨ スクリプトが正常に完了しました');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ スクリプトの実行中にエラーが発生しました:', error);
    process.exit(1);
  });

