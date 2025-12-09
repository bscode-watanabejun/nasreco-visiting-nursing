/**
 * 事前定義条件の評価を確認するスクリプト
 * 特に、has_24h_support_systemとmonthly_visit_limitの評価を確認
 */

import { db } from "../server/db";
import { monthlyReceipts, patients, nursingRecords, bonusMaster, facilities, bonusCalculationHistory } from "@shared/schema";
import { eq, and, gte, lte, inArray, isNull, ne } from "drizzle-orm";

async function checkPredefinedConditions() {
  console.log('🔍 事前定義条件の評価を確認中...\n');

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

    // 5. 24時間対応体制加算の加算マスタを取得
    const bonus24hBasic = await db.query.bonusMaster.findFirst({
      where: eq(bonusMaster.bonusCode, '24h_response_system_basic'),
    });

    if (!bonus24hBasic) {
      console.error('❌ 24時間対応体制加算（基本）の加算マスタが見つかりません');
      return;
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 24時間対応体制加算（基本）の適用条件:');
    console.log(JSON.stringify(bonus24hBasic.predefinedConditions, null, 2));
    console.log('');

    // 6. 事前定義条件の評価をシミュレート
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
      isReceiptRecalculation: true,
      isFirstRecordOfMonth: firstRecord.id === firstRecordId,
    };

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 事前定義条件の評価結果:');
    console.log('');

    const conditions = Array.isArray(bonus24hBasic.predefinedConditions)
      ? bonus24hBasic.predefinedConditions
      : [bonus24hBasic.predefinedConditions];

    for (const condition of conditions) {
      console.log(`  条件: ${condition.pattern || condition.type}`);
      
      if (condition.pattern === 'has_24h_support_system') {
        // evaluateHas24hSupportSystemの評価をシミュレート
        const passed = context.has24hSupportSystem === true;
        console.log(`    評価結果: ${passed ? '✅ 通過' : '❌ 失敗'}`);
        console.log(`    理由: ${passed ? '24時間対応体制あり' : '24時間対応体制なし'}`);
        console.log(`    has24hSupportSystem: ${context.has24hSupportSystem}`);
        
        // operator と value のチェック（278行目）
        if (condition.operator === "equals" && condition.value !== undefined) {
          const expectedValue = condition.value;
          if (passed !== expectedValue) {
            console.log(`    ⚠️  operatorチェック: 期待値=${expectedValue}, 実際=${passed} → ❌ 条件不一致`);
          } else {
            console.log(`    ✅ operatorチェック: 期待値=${expectedValue}, 実際=${passed} → ✅ 条件一致`);
          }
        }
      } else if (condition.pattern === 'monthly_visit_limit') {
        // evaluateMonthlyVisitLimitの評価をシミュレート
        const thisMonthStart = new Date(visitDate.getFullYear(), visitDate.getMonth(), 1);
        const thisMonthEnd = new Date(visitDate.getFullYear(), visitDate.getMonth() + 1, 0, 23, 59, 59);

        const whereConditions = [
          eq(nursingRecords.patientId, context.patientId),
          eq(bonusMaster.bonusCode, '24h_response_system_basic'),
          gte(nursingRecords.visitDate, thisMonthStart.toISOString().split('T')[0]),
          lte(nursingRecords.visitDate, thisMonthEnd.toISOString().split('T')[0]),
          inArray(nursingRecords.status, ['completed', 'reviewed']),
          isNull(nursingRecords.deletedAt),
          ne(bonusCalculationHistory.nursingRecordId, context.nursingRecordId),
        ];

        const existingRecords = await db
          .select({
            id: bonusCalculationHistory.id,
            nursingRecordId: bonusCalculationHistory.nursingRecordId,
          })
          .from(bonusCalculationHistory)
          .innerJoin(nursingRecords, eq(bonusCalculationHistory.nursingRecordId, nursingRecords.id))
          .innerJoin(bonusMaster, eq(bonusCalculationHistory.bonusMasterId, bonusMaster.id))
          .where(and(...whereConditions));

        const monthlyLimit = condition.value || 1;
        const currentCount = existingRecords.length;
        const passed = currentCount < monthlyLimit;

        console.log(`    評価結果: ${passed ? '✅ 通過' : '❌ 失敗'}`);
        console.log(`    理由: ${passed ? `月${monthlyLimit}回以内（${currentCount}/${monthlyLimit}回）` : `月${monthlyLimit}回まで（既に${currentCount}回算定済み）`}`);
        console.log(`    既存履歴数: ${currentCount}件`);
        console.log(`    月次制限: ${monthlyLimit}回`);
      }
      console.log('');
    }

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  }
}

// 実行
checkPredefinedConditions()
  .then(() => {
    console.log('\n✨ スクリプトが正常に完了しました');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ スクリプトの実行中にエラーが発生しました:', error);
    process.exit(1);
  });

