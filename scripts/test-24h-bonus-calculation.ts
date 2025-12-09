/**
 * 高橋 次郎の12月分レセプトで24時間対応体制加算の計算をテストするスクリプト
 */

import { db } from "../server/db";
import { recalculateBonusesForReceipt } from "../server/bonus-engine";
import { monthlyReceipts, patients } from "@shared/schema";
import { eq, and } from "drizzle-orm";

async function test24hBonusCalculation() {
  console.log('🔍 高橋 次郎の12月分レセプトで24時間対応体制加算の計算をテスト中...\n');

  try {
    // 1. 高橋 次郎の患者情報を取得
    const patient = await db.query.patients.findFirst({
      where: eq(patients.lastName, '高橋'),
    });

    if (!patient) {
      console.error('❌ 高橋 次郎の患者情報が見つかりません');
      return;
    }

    console.log(`📋 患者: ${patient.lastName} ${patient.firstName} (${patient.patientNumber})`);

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

    console.log(`📋 レセプト: ${receipt.targetYear}年${receipt.targetMonth}月分`);
    console.log('');

    // 3. レセプト再計算を実行
    console.log('🔄 レセプト再計算を実行中...\n');
    await recalculateBonusesForReceipt({
      id: receipt.id,
      patientId: receipt.patientId,
      facilityId: receipt.facilityId,
      targetYear: receipt.targetYear,
      targetMonth: receipt.targetMonth,
      insuranceType: receipt.insuranceType,
    });

    console.log('✅ 再計算完了\n');

    // 4. 再計算後の加算履歴を確認
    const startDate = new Date(receipt.targetYear, receipt.targetMonth - 1, 1);
    const endDate = new Date(receipt.targetYear, receipt.targetMonth, 0);

    const records = await db.query.nursingRecords.findMany({
      where: and(
        eq(patients.id, receipt.patientId),
        eq(patients.facilityId, receipt.facilityId),
        gte(patients.visitDate, startDate.toISOString().split('T')[0]),
        lte(patients.visitDate, endDate.toISOString().split('T')[0]),
        eq(patients.status, 'completed')
      ),
    });

    console.log('📋 再計算後の加算履歴:');
    for (const record of records) {
      const visitDate = typeof record.visitDate === 'string' ? record.visitDate : record.visitDate.toISOString().split('T')[0];
      
      const bonusHistory = await db.query.bonusCalculationHistory.findMany({
        where: eq(schema.bonusCalculationHistory.nursingRecordId, record.id),
        with: {
          bonus: true,
        },
      });

      const has24hBonus = bonusHistory.some(h => 
        h.bonus.bonusCode === '24h_response_system_basic' || 
        h.bonus.bonusCode === '24h_response_system_enhanced'
      );

      console.log(`  訪問記録ID: ${record.id} (訪問日: ${visitDate})`);
      console.log(`    24時間対応体制加算: ${has24hBonus ? '✅ 適用済み' : '❌ 未適用'}`);
      
      if (has24hBonus) {
        const bonus24h = bonusHistory.find(h => 
          h.bonus.bonusCode === '24h_response_system_basic' || 
          h.bonus.bonusCode === '24h_response_system_enhanced'
        );
        if (bonus24h) {
          console.log(`      加算コード: ${bonus24h.bonus.bonusCode}`);
          console.log(`      加算名: ${bonus24h.bonus.bonusName}`);
          console.log(`      点数: ${bonus24h.calculatedPoints}`);
        }
      }
      console.log('');
    }

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  }
}

// 実行
test24hBonusCalculation()
  .then(() => {
    console.log('\n✨ スクリプトが正常に完了しました');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ スクリプトの実行中にエラーが発生しました:', error);
    process.exit(1);
  });

