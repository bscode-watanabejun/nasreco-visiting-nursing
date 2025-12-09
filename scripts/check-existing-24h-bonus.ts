/**
 * 高橋 次郎の12月分レセプトで、24時間対応体制加算の既存履歴と月次制限チェックの動作を確認するスクリプト
 */

import { db } from "../server/db";
import { monthlyReceipts, patients, nursingRecords, bonusCalculationHistory, bonusMaster } from "@shared/schema";
import { eq, and, gte, lte, inArray, isNull, ne } from "drizzle-orm";

async function checkExisting24hBonus() {
  console.log('🔍 高橋 次郎の12月分レセプトで、24時間対応体制加算の既存履歴と月次制限チェックの動作を確認中...\n');

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

    console.log(`📋 対象訪問記録数: ${sortedRecords.length}件`);
    console.log(`📋 最初の訪問記録ID: ${firstRecordId}\n`);

    // 4. 24時間対応体制加算の加算マスタを取得
    const bonus24hBasic = await db.query.bonusMaster.findFirst({
      where: eq(bonusMaster.bonusCode, '24h_response_system_basic'),
    });

    if (!bonus24hBasic) {
      console.error('❌ 24時間対応体制加算（基本）の加算マスタが見つかりません');
      return;
    }

    console.log(`📋 24時間対応体制加算（基本）の加算マスタID: ${bonus24hBasic.id}\n`);

    // 5. 各訪問記録の既存の24時間対応体制加算履歴を確認
    console.log('📋 各訪問記録の既存の24時間対応体制加算履歴:');
    for (const record of sortedRecords) {
      const visitDate = typeof record.visitDate === 'string' ? record.visitDate : record.visitDate.toISOString().split('T')[0];
      const isFirst = record.id === firstRecordId;

      const existingHistory = await db.select({
        history: bonusCalculationHistory,
        bonus: bonusMaster,
        nursingRecord: nursingRecords,
      })
        .from(bonusCalculationHistory)
        .innerJoin(bonusMaster, eq(bonusCalculationHistory.bonusMasterId, bonusMaster.id))
        .innerJoin(nursingRecords, eq(bonusCalculationHistory.nursingRecordId, nursingRecords.id))
        .where(and(
          eq(bonusCalculationHistory.nursingRecordId, record.id),
          eq(bonusMaster.bonusCode, '24h_response_system_basic')
        ));

      console.log(`  訪問記録ID: ${record.id} (訪問日: ${visitDate}${isFirst ? ', 最初の訪問記録' : ''})`);
      console.log(`    既存の24時間対応体制加算履歴: ${existingHistory.length}件`);
      if (existingHistory.length > 0) {
        existingHistory.forEach((h, idx) => {
          console.log(`      ${idx + 1}. 履歴ID: ${h.history.id}, 作成日時: ${h.history.createdAt}`);
        });
      }
      console.log('');
    }

    // 6. evaluateMonthlyVisitLimitの動作をシミュレート
    console.log('📋 evaluateMonthlyVisitLimitの動作をシミュレート:');
    if (firstRecordId) {
      const firstRecord = sortedRecords[0];
      const visitDate = typeof firstRecord.visitDate === 'string' ? new Date(firstRecord.visitDate) : firstRecord.visitDate;
      const thisMonthStart = new Date(visitDate.getFullYear(), visitDate.getMonth(), 1);
      const thisMonthEnd = new Date(visitDate.getFullYear(), visitDate.getMonth() + 1, 0, 23, 59, 59);

      console.log(`  対象訪問記録ID: ${firstRecord.id}`);
      console.log(`  対象月: ${thisMonthStart.toISOString().split('T')[0]} ～ ${thisMonthEnd.toISOString().split('T')[0]}\n`);

      // evaluateMonthlyVisitLimitと同じロジックでチェック
      // 現在の訪問記録に紐づく加算履歴を除外
      const whereConditions = [
        eq(nursingRecords.patientId, patient.id),
        eq(bonusMaster.bonusCode, '24h_response_system_basic'),
        gte(nursingRecords.visitDate, thisMonthStart.toISOString().split('T')[0]),
        lte(nursingRecords.visitDate, thisMonthEnd.toISOString().split('T')[0]),
        inArray(nursingRecords.status, ['completed', 'reviewed']),
        isNull(nursingRecords.deletedAt),
        ne(bonusCalculationHistory.nursingRecordId, firstRecord.id), // 現在の訪問記録を除外
      ];

      const existingRecords = await db
        .select({
          id: bonusCalculationHistory.id,
          bonusMasterId: bonusCalculationHistory.bonusMasterId,
          nursingRecordId: bonusCalculationHistory.nursingRecordId,
          calculationDetails: bonusCalculationHistory.calculationDetails,
          visitDate: nursingRecords.visitDate,
        })
        .from(bonusCalculationHistory)
        .innerJoin(nursingRecords, eq(bonusCalculationHistory.nursingRecordId, nursingRecords.id))
        .innerJoin(bonusMaster, eq(bonusCalculationHistory.bonusMasterId, bonusMaster.id))
        .where(and(...whereConditions));

      console.log(`  現在の訪問記録（${firstRecord.id}）を除外した既存履歴数: ${existingRecords.length}件`);
      if (existingRecords.length > 0) {
        console.log('  既存履歴の詳細:');
        existingRecords.forEach((r, idx) => {
          const visitDateStr = typeof r.visitDate === 'string' ? r.visitDate : r.visitDate.toISOString().split('T')[0];
          console.log(`    ${idx + 1}. 訪問記録ID: ${r.nursingRecordId}, 訪問日: ${visitDateStr}, 履歴ID: ${r.id}`);
        });
      }
      console.log('');

      const monthlyLimit = 1;
      const currentCount = existingRecords.length;

      console.log(`  月次制限: ${monthlyLimit}回`);
      console.log(`  既存の算定回数: ${currentCount}回`);
      console.log(`  判定結果: ${currentCount >= monthlyLimit ? '❌ 制限超過（適用不可）' : '✅ 制限内（適用可能）'}`);
      
      if (currentCount >= monthlyLimit) {
        console.log(`  理由: 月${monthlyLimit}回まで（既に${currentCount}回算定済み）`);
      } else {
        console.log(`  理由: 月${monthlyLimit}回以内（${currentCount}/${monthlyLimit}回）`);
      }
      console.log('');

      // 7. 現在の訪問記録に既に24時間対応体制加算が適用されているか確認
      const currentRecordHistory = await db.select({
        history: bonusCalculationHistory,
        bonus: bonusMaster,
      })
        .from(bonusCalculationHistory)
        .innerJoin(bonusMaster, eq(bonusCalculationHistory.bonusMasterId, bonusMaster.id))
        .where(and(
          eq(bonusCalculationHistory.nursingRecordId, firstRecord.id),
          eq(bonusMaster.bonusCode, '24h_response_system_basic')
        ));

      console.log(`  現在の訪問記録（${firstRecord.id}）の24時間対応体制加算履歴: ${currentRecordHistory.length}件`);
      if (currentRecordHistory.length > 0) {
        console.log('  既に適用されているため、evaluateMonthlyVisitLimitで除外される');
        currentRecordHistory.forEach((h, idx) => {
          console.log(`    ${idx + 1}. 履歴ID: ${h.history.id}, 作成日時: ${h.history.createdAt}`);
        });
      } else {
        console.log('  まだ適用されていない');
      }
      console.log('');

      // 8. 問題の原因を特定
      console.log('📋 問題の原因分析:');
      if (currentRecordHistory.length > 0) {
        console.log('  ✅ 現在の訪問記録には既に24時間対応体制加算が適用されている');
        console.log('  ✅ evaluateMonthlyVisitLimitでは、現在の訪問記録を除外してチェックするため、');
        console.log('     既存履歴が0件であれば適用可能と判定される');
        console.log('  ✅ しかし、レセプト再計算時には、各訪問記録を順番に処理するため、');
        console.log('     最初の訪問記録を処理する時点では、他の訪問記録の既存履歴が存在する可能性がある');
        console.log('');
        console.log('  ⚠️  問題の可能性:');
        console.log('     - 最初の訪問記録以外に既に24時間対応体制加算が適用されている場合、');
        console.log('       最初の訪問記録を処理する際に、その既存履歴がカウントされて制限超過と判定される可能性がある');
      } else {
        console.log('  ❌ 現在の訪問記録には24時間対応体制加算が適用されていない');
        console.log('  ❌ これは予期しない状態です');
      }
    }

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  }
}

// 実行
checkExisting24hBonus()
  .then(() => {
    console.log('\n✨ スクリプトが正常に完了しました');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ スクリプトの実行中にエラーが発生しました:', error);
    process.exit(1);
  });

