/**
 * calculateBonuses関数内で24時間対応体制加算がスキップされる条件を確認するスクリプト
 */

import { db } from "../server/db";
import { monthlyReceipts, patients, nursingRecords, bonusMaster, facilities } from "@shared/schema";
import { eq, and, gte, lte } from "drizzle-orm";

async function checkSkipConditions() {
  console.log('🔍 calculateBonuses関数内で24時間対応体制加算がスキップされる条件を確認中...\n');

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
    const startDate = new Date(targetYear, 11, 1);
    const endDate = new Date(targetYear, 11, 31);

    // 3. 12月分の訪問記録を取得してソート
    const targetRecords = await db.query.nursingRecords.findMany({
      where: and(
        eq(nursingRecords.patientId, patient.id),
        eq(nursingRecords.facilityId, receipt.facilityId),
        gte(nursingRecords.visitDate, startDate.toISOString().split('T')[0]),
        lte(nursingRecords.visitDate, endDate.toISOString().split('T')[0]),
        eq(nursingRecords.status, 'completed')
      ),
    });

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

    if (!firstRecordId) {
      console.error('❌ 最初の訪問記録が見つかりません');
      return;
    }

    const firstRecord = sortedRecords[0];

    // 4. 施設情報を取得
    const facility = await db.query.facilities.findFirst({
      where: eq(facilities.id, receipt.facilityId),
    });

    if (!facility) {
      console.error('❌ 施設情報が見つかりません');
      return;
    }

    // 5. recalculateBonusesForReceipt関数内で設定されるcontextを再現
    const visitDate = typeof firstRecord.visitDate === 'string' ? new Date(firstRecord.visitDate) : firstRecord.visitDate;
    
    const context = {
      nursingRecordId: firstRecord.id,
      patientId: firstRecord.patientId,
      facilityId: firstRecord.facilityId,
      visitDate: visitDate instanceof Date ? visitDate : new Date(visitDate),
      visitStartTime: firstRecord.actualStartTime 
        ? (typeof firstRecord.actualStartTime === 'string' ? new Date(firstRecord.actualStartTime) : firstRecord.actualStartTime)
        : null,
      visitEndTime: firstRecord.actualEndTime 
        ? (typeof firstRecord.actualEndTime === 'string' ? new Date(firstRecord.actualEndTime) : firstRecord.actualEndTime)
        : null,
      insuranceType: receipt.insuranceType as 'medical' | 'care',
      has24hSupportSystem: facility.has24hSupportSystem || false,
      has24hSupportSystemEnhanced: facility.has24hSupportSystemEnhanced || false,
      burdenReductionMeasures: facility.burdenReductionMeasures || [],
      // 24時間対応体制加算の適用タイミング制御
      isReceiptRecalculation: true,
      isFirstRecordOfMonth: firstRecord.id === firstRecordId,
    };

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 recalculateBonusesForReceipt関数内で設定されるcontext:');
    console.log('');
    console.log(`  nursingRecordId: ${context.nursingRecordId}`);
    console.log(`  patientId: ${context.patientId}`);
    console.log(`  facilityId: ${context.facilityId}`);
    console.log(`  visitDate: ${context.visitDate.toISOString().split('T')[0]}`);
    console.log(`  insuranceType: ${context.insuranceType}`);
    console.log(`  has24hSupportSystem: ${context.has24hSupportSystem}`);
    console.log(`  has24hSupportSystemEnhanced: ${context.has24hSupportSystemEnhanced}`);
    console.log(`  burdenReductionMeasures: ${JSON.stringify(context.burdenReductionMeasures)}`);
    console.log(`  isReceiptRecalculation: ${context.isReceiptRecalculation}`);
    console.log(`  isFirstRecordOfMonth: ${context.isFirstRecordOfMonth}`);
    console.log('');

    // 6. calculateBonuses関数内のスキップ条件を確認
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 calculateBonuses関数内のスキップ条件を確認:');
    console.log('');

    // 24時間対応体制加算の加算マスタを取得
    const bonus24hBasic = await db.query.bonusMaster.findFirst({
      where: eq(bonusMaster.bonusCode, '24h_response_system_basic'),
    });

    if (!bonus24hBasic) {
      console.error('❌ 24時間対応体制加算（基本）の加算マスタが見つかりません');
      return;
    }

    // スキップ条件をチェック（1479行目の条件）
    const skipCondition = context.isReceiptRecalculation !== true || context.isFirstRecordOfMonth !== true;

    console.log(`  加算コード: ${bonus24hBasic.bonusCode}`);
    console.log(`  加算名: ${bonus24hBasic.bonusName}`);
    console.log('');
    console.log(`  スキップ条件（1479行目）:`);
    console.log(`    context.isReceiptRecalculation !== true: ${context.isReceiptRecalculation !== true}`);
    console.log(`    context.isFirstRecordOfMonth !== true: ${context.isFirstRecordOfMonth !== true}`);
    console.log(`    スキップ条件の結果: ${skipCondition ? '❌ スキップされる' : '✅ スキップされない'}`);
    console.log('');

    if (skipCondition) {
      console.log('  ❌ 問題発見: 24時間対応体制加算がスキップされます！');
      console.log('');
      if (context.isReceiptRecalculation !== true) {
        console.log('    原因: isReceiptRecalculation !== true');
        console.log(`    実際の値: isReceiptRecalculation = ${context.isReceiptRecalculation}`);
      }
      if (context.isFirstRecordOfMonth !== true) {
        console.log('    原因: isFirstRecordOfMonth !== true');
        console.log(`    実際の値: isFirstRecordOfMonth = ${context.isFirstRecordOfMonth}`);
        console.log(`    最初の訪問記録ID: ${firstRecordId}`);
        console.log(`    現在の訪問記録ID: ${context.nursingRecordId}`);
        console.log(`    一致: ${firstRecordId === context.nursingRecordId}`);
      }
    } else {
      console.log('  ✅ スキップ条件は満たされていません');
      console.log('    24時間対応体制加算は適用されるはずです');
      console.log('');
      console.log('  別の原因を確認する必要があります:');
      console.log('    1. evaluateMonthlyVisitLimitで制限超過と判定された可能性');
      console.log('    2. 事前定義条件の評価で失敗した可能性');
      console.log('    3. saveBonusCalculationHistory関数で既存履歴が削除されたが、新しい履歴が保存されなかった可能性');
    }

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  }
}

// 実行
checkSkipConditions()
  .then(() => {
    console.log('\n✨ スクリプトが正常に完了しました');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ スクリプトの実行中にエラーが発生しました:', error);
    process.exit(1);
  });

