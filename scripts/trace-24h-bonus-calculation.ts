/**
 * 高橋 次郎の12月分レセプトで24時間対応体制加算の計算過程をトレースするスクリプト
 */

import { db } from "../server/db";
import { calculateBonuses } from "../server/bonus-engine";
import { monthlyReceipts, patients, nursingRecords, facilities, bonusMaster } from "@shared/schema";
import { eq, and, gte, lte } from "drizzle-orm";

async function trace24hBonusCalculation() {
  console.log('🔍 高橋 次郎の12月分レセプトで24時間対応体制加算の計算過程をトレース中...\n');

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

    // 3. 施設情報を取得
    const facility = await db.query.facilities.findFirst({
      where: eq(facilities.id, receipt.facilityId),
    });

    if (!facility) {
      console.error('❌ 施設情報が見つかりません');
      return;
    }

    // 4. 12月分の訪問記録を取得してソート
    const targetYear = receipt.targetYear;
    const startDate = new Date(targetYear, 11, 1);
    const endDate = new Date(targetYear, 11, 31);

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

    console.log(`📋 対象訪問記録数: ${sortedRecords.length}件`);
    console.log(`📋 最初の訪問記録ID: ${firstRecordId}\n`);

    // 5. 24時間対応体制加算の加算マスタを取得
    const bonus24hBasic = await db.query.bonusMaster.findFirst({
      where: eq(bonusMaster.bonusCode, '24h_response_system_basic'),
    });

    if (!bonus24hBasic) {
      console.error('❌ 24時間対応体制加算（基本）の加算マスタが見つかりません');
      return;
    }

    console.log('📋 24時間対応体制加算（基本）の加算マスタ:');
    console.log(`  加算コード: ${bonus24hBasic.bonusCode}`);
    console.log(`  加算名: ${bonus24hBasic.bonusName}`);
    console.log(`  アクティブ: ${bonus24hBasic.isActive}`);
    console.log(`  適用条件: ${JSON.stringify(bonus24hBasic.predefinedConditions, null, 2)}\n`);

    // 6. 最初の訪問記録でcalculateBonusesを実行してトレース
    if (firstRecordId) {
      const firstRecord = sortedRecords[0];
      const visitDate = typeof firstRecord.visitDate === 'string' ? new Date(firstRecord.visitDate) : firstRecord.visitDate;
      const visitStartTime = firstRecord.actualStartTime 
        ? (typeof firstRecord.actualStartTime === 'string' ? new Date(firstRecord.actualStartTime) : firstRecord.actualStartTime)
        : null;

      console.log('📋 最初の訪問記録でcalculateBonusesを実行:');
      console.log(`  訪問記録ID: ${firstRecord.id}`);
      console.log(`  訪問日: ${visitDate.toISOString().split('T')[0]}`);
      console.log(`  訪問開始時刻: ${visitStartTime ? visitStartTime.toISOString() : '未設定'}`);
      console.log('');

      // BonusCalculationContextを構築
      const context = {
        facilityId: receipt.facilityId,
        patientId: receipt.patientId,
        nursingRecordId: firstRecord.id,
        visitDate: visitDate,
        visitStartTime: visitStartTime,
        visitEndTime: firstRecord.actualEndTime 
          ? (typeof firstRecord.actualEndTime === 'string' ? new Date(firstRecord.actualEndTime) : firstRecord.actualEndTime)
          : null,
        insuranceType: receipt.insuranceType as 'medical' | 'care',
        has24hSupportSystem: facility.has24hSupportSystem || false,
        has24hSupportSystemEnhanced: facility.has24hSupportSystemEnhanced || false,
        burdenReductionMeasures: facility.burdenReductionMeasures || [],
        isReceiptRecalculation: true, // レセプト再計算時
        isFirstRecordOfMonth: firstRecord.id === firstRecordId, // 最初の訪問記録
      };

      console.log('📋 BonusCalculationContext:');
      console.log(`  isReceiptRecalculation: ${context.isReceiptRecalculation}`);
      console.log(`  isFirstRecordOfMonth: ${context.isFirstRecordOfMonth}`);
      console.log(`  has24hSupportSystem: ${context.has24hSupportSystem}`);
      console.log('');

      // calculateBonusesを実行
      console.log('🔄 calculateBonusesを実行中...\n');
      const result = await calculateBonuses(context);

      console.log('📋 計算結果:');
      console.log(`  適用された加算数: ${result.applicableBonuses.length}件`);
      console.log(`  総算定点数: ${result.totalPoints}点`);
      console.log('');

      // 24時間対応体制加算が適用されたか確認
      const has24hBonus = result.applicableBonuses.some(b => 
        b.bonusCode === '24h_response_system_basic' || 
        b.bonusCode === '24h_response_system_enhanced'
      );

      console.log(`  24時間対応体制加算: ${has24hBonus ? '✅ 適用された' : '❌ 適用されなかった'}`);
      
      if (has24hBonus) {
        const bonus24h = result.applicableBonuses.find(b => 
          b.bonusCode === '24h_response_system_basic' || 
          b.bonusCode === '24h_response_system_enhanced'
        );
        if (bonus24h) {
          console.log(`    加算コード: ${bonus24h.bonusCode}`);
          console.log(`    加算名: ${bonus24h.bonusName}`);
          console.log(`    点数: ${bonus24h.points}点`);
        }
      } else {
        console.log('  ❌ 24時間対応体制加算が適用されなかった理由を確認:');
        console.log(`    - isReceiptRecalculation === true: ${context.isReceiptRecalculation === true}`);
        console.log(`    - isFirstRecordOfMonth === true: ${context.isFirstRecordOfMonth === true}`);
        console.log(`    - has24hSupportSystem === true: ${context.has24hSupportSystem === true}`);
        console.log(`    - 加算マスタがアクティブ: ${bonus24hBasic.isActive}`);
      }
      console.log('');

      // 適用されたすべての加算を表示
      if (result.applicableBonuses.length > 0) {
        console.log('📋 適用されたすべての加算:');
        result.applicableBonuses.forEach((bonus, idx) => {
          console.log(`  ${idx + 1}. ${bonus.bonusCode}: ${bonus.bonusName} (${bonus.points}点)`);
        });
      }
    }

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  }
}

// 実行
trace24hBonusCalculation()
  .then(() => {
    console.log('\n✨ スクリプトが正常に完了しました');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ スクリプトの実行中にエラーが発生しました:', error);
    process.exit(1);
  });

