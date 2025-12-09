/**
 * 原因を特定するスクリプト
 */

import { db } from "../server/db";
import { monthlyReceipts, patients, nursingRecords, bonusCalculationHistory, bonusMaster } from "@shared/schema";
import { eq, and, gte, lte, inArray, isNull } from "drizzle-orm";

async function identifyRootCause() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 原因の特定');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  try {
    // 1. 高橋 次郎の患者情報を取得
    const patient = await db.query.patients.findFirst({
      where: eq(patients.lastName, '高橋'),
    });

    if (!patient) {
      console.error('❌ 高橋 次郎の患者情報が見つかりません');
      return;
    }

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

    const targetYear = receipt.targetYear;
    const targetMonth = receipt.targetMonth;
    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0);

    // 3. recalculateBonusesForReceipt関数と同じ条件で訪問記録を取得
    // 2064-2072行目の条件
    const targetRecords = await db.query.nursingRecords.findMany({
      where: and(
        eq(nursingRecords.patientId, receipt.patientId),
        eq(nursingRecords.facilityId, receipt.facilityId),
        gte(nursingRecords.visitDate, startDate.toISOString().split('T')[0]),
        lte(nursingRecords.visitDate, endDate.toISOString().split('T')[0]),
        eq(nursingRecords.status, 'completed')
      ),
    });

    console.log('📋 recalculateBonusesForReceipt関数で取得される訪問記録:');
    console.log(`  条件: status = 'completed'（削除フラグのチェックなし）`);
    console.log(`  件数: ${targetRecords.length}件`);
    console.log('');

    // 4. 訪問記録をソート（recalculateBonusesForReceiptと同じロジック）
    const sortedRecords = [...targetRecords].sort((a, b) => {
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
    console.log('📋 ソート後の訪問記録:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    sortedRecords.forEach((record, index) => {
      const visitDate = typeof record.visitDate === 'string' ? record.visitDate : record.visitDate.toISOString().split('T')[0];
      const startTime = record.actualStartTime 
        ? (typeof record.actualStartTime === 'string' ? new Date(record.actualStartTime).toLocaleString('ja-JP') : record.actualStartTime.toLocaleString('ja-JP'))
        : '未設定';
      const isFirst = record.id === firstRecordId;
      const isDeleted = record.deletedAt !== null;

      console.log(`  ${index + 1}. ID: ${record.id}${isFirst ? ' ← 最初の訪問記録' : ''}`);
      console.log(`     訪問日: ${visitDate}`);
      console.log(`     開始時刻: ${startTime}`);
      console.log(`     ステータス: ${record.status}`);
      console.log(`     削除フラグ: ${isDeleted ? '削除済み' : '未削除'}`);
      console.log('');
    });

    console.log(`📋 最初の訪問記録ID: ${firstRecordId}`);
    console.log('');

    // 5. レセプト詳細画面で表示される訪問記録を取得
    const displayRecords = await db.query.nursingRecords.findMany({
      where: and(
        eq(nursingRecords.patientId, receipt.patientId),
        eq(nursingRecords.facilityId, receipt.facilityId),
        gte(nursingRecords.visitDate, startDate.toISOString().split('T')[0]),
        lte(nursingRecords.visitDate, endDate.toISOString().split('T')[0]),
        inArray(nursingRecords.status, ['completed', 'reviewed']),
        isNull(nursingRecords.deletedAt)
      ),
      orderBy: [nursingRecords.visitDate, nursingRecords.actualStartTime],
    });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 レセプト詳細画面で表示される訪問記録:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  条件: status = 'completed' または 'reviewed' かつ deletedAt = null`);
    console.log(`  件数: ${displayRecords.length}件`);
    console.log('');

    displayRecords.forEach((record, index) => {
      const visitDate = typeof record.visitDate === 'string' ? record.visitDate : record.visitDate.toISOString().split('T')[0];
      const startTime = record.actualStartTime 
        ? (typeof record.actualStartTime === 'string' ? new Date(record.actualStartTime).toLocaleString('ja-JP') : record.actualStartTime.toLocaleString('ja-JP'))
        : '未設定';
      const isFirstInDisplay = index === 0;

      console.log(`  ${index + 1}. ID: ${record.id}${isFirstInDisplay ? ' ← 表示される最初の訪問記録' : ''}`);
      console.log(`     訪問日: ${visitDate}`);
      console.log(`     開始時刻: ${startTime}`);
      console.log(`     ステータス: ${record.status}`);
      console.log('');
    });

    // 6. 原因の特定
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 原因の特定:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    const firstRecordInRecalculation = sortedRecords[0];
    const firstRecordInDisplay = displayRecords[0];

    if (firstRecordInRecalculation && firstRecordInDisplay) {
      console.log(`  レセプト再計算時の最初の訪問記録: ${firstRecordInRecalculation.id}`);
      console.log(`  レセプト詳細画面の最初の訪問記録: ${firstRecordInDisplay.id}`);
      console.log('');

      if (firstRecordInRecalculation.id === firstRecordInDisplay.id) {
        console.log('  ✅ 一致しています');
        console.log('     レセプト再計算時とレセプト詳細画面で同じ訪問記録が最初の訪問記録として認識されています');
        console.log('');
        console.log('  しかし、24時間対応体制加算が適用されていない原因:');
        console.log('    1. レセプト再計算時に、この訪問記録が削除されていた可能性');
        console.log('    2. レセプト再計算後に、この訪問記録が削除された可能性');
        console.log('    3. レセプト再計算時に、evaluateMonthlyVisitLimitで制限超過と判定された可能性');
      } else {
        console.log('  ❌ 一致していません！');
        console.log('     これが問題の原因です！');
        console.log('');
        console.log('  問題:');
        console.log(`    - レセプト再計算時には、ID: ${firstRecordInRecalculation.id} が最初の訪問記録として認識される`);
        console.log(`    - しかし、この訪問記録は削除されているため、レセプト詳細画面には表示されない`);
        console.log(`    - レセプト詳細画面では、ID: ${firstRecordInDisplay.id} が最初の訪問記録として表示される`);
        console.log(`    - しかし、レセプト再計算時には、この訪問記録は2番目の訪問記録として認識される`);
        console.log(`    - そのため、isFirstRecordOfMonth = false となり、24時間対応体制加算がスキップされる`);
        console.log('');
        console.log('  解決策:');
        console.log('    recalculateBonusesForReceipt関数で、削除された訪問記録を除外する必要がある');
        console.log('    または、レセプト詳細画面と同じ条件で訪問記録を取得する必要がある');
      }
    }

    // 7. 24時間対応体制加算の適用状況を確認
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 24時間対応体制加算の適用状況:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    const bonus24hBasic = await db.query.bonusMaster.findFirst({
      where: eq(bonusMaster.bonusCode, '24h_response_system_basic'),
    });

    if (bonus24hBasic) {
      for (const record of displayRecords) {
        const history = await db.query.bonusCalculationHistory.findMany({
          where: and(
            eq(bonusCalculationHistory.nursingRecordId, record.id),
            eq(bonusCalculationHistory.bonusMasterId, bonus24hBasic.id)
          ),
        });

        const visitDate = typeof record.visitDate === 'string' ? record.visitDate : record.visitDate.toISOString().split('T')[0];
        const isFirst = record.id === firstRecordInDisplay?.id;

        console.log(`  訪問記録ID: ${record.id} (訪問日: ${visitDate}${isFirst ? ', 表示される最初の訪問記録' : ''})`);
        console.log(`    24時間対応体制加算: ${history.length > 0 ? '✅ 適用済み' : '❌ 未適用'}`);
        if (history.length > 0) {
          history.forEach((h, idx) => {
            console.log(`      履歴${idx + 1}: ${h.id}, 点数: ${h.calculatedPoints}点`);
          });
        }
        console.log('');
      }
    }

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  }
}

// 実行
identifyRootCause()
  .then(() => {
    console.log('\n✨ スクリプトが正常に完了しました');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ スクリプトの実行中にエラーが発生しました:', error);
    process.exit(1);
  });

