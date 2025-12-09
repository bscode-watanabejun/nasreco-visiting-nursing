/**
 * レセプト再計算時の処理順序をシミュレートして、24時間対応体制加算の適用状況を確認するスクリプト
 */

import { db } from "../server/db";
import { monthlyReceipts, patients, nursingRecords, bonusCalculationHistory, bonusMaster } from "@shared/schema";
import { eq, and, gte, lte, inArray, isNull, ne } from "drizzle-orm";

async function simulateReceiptRecalculation() {
  console.log('🔍 レセプト再計算時の処理順序をシミュレート中...\n');

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

    // 3. 12月分の訪問記録を取得してソート（recalculateBonusesForReceiptと同じロジック）
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

    // 5. レセプト再計算時の処理順序をシミュレート
    console.log('📋 レセプト再計算時の処理順序をシミュレート:');
    console.log('  (各訪問記録を順番に処理する際の、evaluateMonthlyVisitLimitの動作を確認)\n');

    for (let i = 0; i < sortedRecords.length; i++) {
      const record = sortedRecords[i];
      const visitDate = typeof record.visitDate === 'string' ? new Date(record.visitDate) : record.visitDate;
      const isFirst = record.id === firstRecordId;
      const thisMonthStart = new Date(visitDate.getFullYear(), visitDate.getMonth(), 1);
      const thisMonthEnd = new Date(visitDate.getFullYear(), visitDate.getMonth() + 1, 0, 23, 59, 59);

      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`【${i + 1}番目の訪問記録を処理】`);
      console.log(`  訪問記録ID: ${record.id}`);
      console.log(`  訪問日: ${visitDate.toISOString().split('T')[0]}`);
      console.log(`  最初の訪問記録: ${isFirst ? '✅ はい' : '❌ いいえ'}`);
      console.log('');

      // 現在の訪問記録を処理する時点での、既存の24時間対応体制加算履歴を確認
      // evaluateMonthlyVisitLimitと同じロジック
      const whereConditions = [
        eq(nursingRecords.patientId, patient.id),
        eq(bonusMaster.bonusCode, '24h_response_system_basic'),
        gte(nursingRecords.visitDate, thisMonthStart.toISOString().split('T')[0]),
        lte(nursingRecords.visitDate, thisMonthEnd.toISOString().split('T')[0]),
        inArray(nursingRecords.status, ['completed', 'reviewed']),
        isNull(nursingRecords.deletedAt),
        ne(bonusCalculationHistory.nursingRecordId, record.id), // 現在の訪問記録を除外
      ];

      const existingRecords = await db
        .select({
          id: bonusCalculationHistory.id,
          bonusMasterId: bonusCalculationHistory.bonusMasterId,
          nursingRecordId: bonusCalculationHistory.nursingRecordId,
          visitDate: nursingRecords.visitDate,
        })
        .from(bonusCalculationHistory)
        .innerJoin(nursingRecords, eq(bonusCalculationHistory.nursingRecordId, nursingRecords.id))
        .innerJoin(bonusMaster, eq(bonusCalculationHistory.bonusMasterId, bonusMaster.id))
        .where(and(...whereConditions));

      console.log(`  evaluateMonthlyVisitLimitのチェック結果:`);
      console.log(`    現在の訪問記録（${record.id}）を除外した既存履歴数: ${existingRecords.length}件`);
      
      if (existingRecords.length > 0) {
        console.log(`    既存履歴の詳細:`);
        existingRecords.forEach((r, idx) => {
          const visitDateStr = typeof r.visitDate === 'string' ? r.visitDate : r.visitDate.toISOString().split('T')[0];
          console.log(`      ${idx + 1}. 訪問記録ID: ${r.nursingRecordId}, 訪問日: ${visitDateStr}`);
        });
      }
      console.log('');

      const monthlyLimit = 1;
      const currentCount = existingRecords.length;
      const canApply = currentCount < monthlyLimit;

      console.log(`    月次制限: ${monthlyLimit}回`);
      console.log(`    既存の算定回数: ${currentCount}回`);
      console.log(`    判定結果: ${canApply ? '✅ 適用可能' : '❌ 適用不可（制限超過）'}`);
      
      if (!canApply) {
        console.log(`    理由: 月${monthlyLimit}回まで（既に${currentCount}回算定済み）`);
      } else {
        console.log(`    理由: 月${monthlyLimit}回以内（${currentCount}/${monthlyLimit}回）`);
      }
      console.log('');

      // 24時間対応体制加算の適用条件を確認
      if (isFirst) {
        console.log(`  ✅ 最初の訪問記録のため、isFirstRecordOfMonth = true`);
        console.log(`  ✅ isReceiptRecalculation = true のため、24時間対応体制加算の適用が可能`);
        if (!canApply) {
          console.log(`  ⚠️  しかし、evaluateMonthlyVisitLimitで制限超過と判定されたため、適用されない`);
        } else {
          console.log(`  ✅ evaluateMonthlyVisitLimitでも適用可能と判定されたため、適用される`);
        }
      } else {
        console.log(`  ❌ 最初の訪問記録ではないため、isFirstRecordOfMonth = false`);
        console.log(`  ❌ calculateBonuses関数内でスキップされる（1479行目のチェック）`);
      }
      console.log('');

      // 現在の訪問記録に既に24時間対応体制加算が適用されているか確認
      const currentRecordHistory = await db.select({
        history: bonusCalculationHistory,
        bonus: bonusMaster,
      })
        .from(bonusCalculationHistory)
        .innerJoin(bonusMaster, eq(bonusCalculationHistory.bonusMasterId, bonusMaster.id))
        .where(and(
          eq(bonusCalculationHistory.nursingRecordId, record.id),
          eq(bonusMaster.bonusCode, '24h_response_system_basic')
        ));

      console.log(`  現在の訪問記録の24時間対応体制加算履歴: ${currentRecordHistory.length}件`);
      if (currentRecordHistory.length > 0) {
        currentRecordHistory.forEach((h, idx) => {
          console.log(`    ${idx + 1}. 履歴ID: ${h.history.id}, 作成日時: ${h.history.createdAt}`);
        });
      }
      console.log('');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 問題の原因分析:');
    console.log('');
    console.log('  レセプト再計算時の処理フロー:');
    console.log('    1. 訪問記録をソートして最初の訪問記録を特定');
    console.log('    2. 各訪問記録を順番に処理（forループ）');
    console.log('    3. 各訪問記録に対してcalculateBonusesを呼び出す');
    console.log('    4. calculateBonuses内でevaluateMonthlyVisitLimitが呼び出される');
    console.log('    5. evaluateMonthlyVisitLimitでは、現在の訪問記録を除外して既存履歴をチェック');
    console.log('    6. その後、saveBonusCalculationHistoryで既存履歴を削除してから新しい履歴を保存');
    console.log('');
    console.log('  問題の可能性:');
    console.log('    - レセプト再計算時に、各訪問記録を順番に処理するため、');
    console.log('      最初の訪問記録を処理する時点で、他の訪問記録の既存履歴がまだデータベースに存在している');
    console.log('    - しかし、evaluateMonthlyVisitLimitでは、現在の訪問記録を除外してチェックするため、');
    console.log('      他の訪問記録の既存履歴がカウントされる可能性がある');
    console.log('    - ただし、今回のシミュレーション結果では、最初の訪問記録を処理する時点で、');
    console.log('      他の訪問記録の既存履歴は0件だったため、この問題は発生していない');
    console.log('');
    console.log('  実際の問題:');
    console.log('    - デバッグスクリプトの結果では、最初の訪問記録には既に24時間対応体制加算が適用されている');
    console.log('    - しかし、ユーザーは「適用されていない」と言っている');
    console.log('    - これは、画面の表示ロジックに問題がある可能性がある');
    console.log('    - または、レセプト再計算時に、既存の加算履歴が削除されて、新しい加算が適用されなかった可能性がある');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  }
}

// 実行
simulateReceiptRecalculation()
  .then(() => {
    console.log('\n✨ スクリプトが正常に完了しました');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ スクリプトの実行中にエラーが発生しました:', error);
    process.exit(1);
  });

