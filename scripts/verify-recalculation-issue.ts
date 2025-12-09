/**
 * レセプト再計算時の問題を確認するスクリプト
 * 特に、最初の訪問記録を処理する時点で、他の訪問記録の既存履歴がカウントされる問題を確認
 */

import { db } from "../server/db";
import { monthlyReceipts, patients, nursingRecords, bonusCalculationHistory, bonusMaster } from "@shared/schema";
import { eq, and, gte, lte, inArray, isNull, ne } from "drizzle-orm";

async function verifyRecalculationIssue() {
  console.log('🔍 レセプト再計算時の問題を確認中...\n');

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

    // 5. 現在の状態を確認（レセプト再計算前）
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 現在の状態（レセプト再計算前）:');
    console.log('');

    // すべての訪問記録の24時間対応体制加算履歴を確認
    const allHistory = await db.select({
      history: bonusCalculationHistory,
      bonus: bonusMaster,
      nursingRecord: nursingRecords,
    })
      .from(bonusCalculationHistory)
      .innerJoin(bonusMaster, eq(bonusCalculationHistory.bonusMasterId, bonusMaster.id))
      .innerJoin(nursingRecords, eq(bonusCalculationHistory.nursingRecordId, nursingRecords.id))
      .where(and(
        eq(bonusMaster.bonusCode, '24h_response_system_basic'),
        inArray(nursingRecords.id, sortedRecords.map(r => r.id))
      ));

    console.log(`  12月分のすべての訪問記録の24時間対応体制加算履歴: ${allHistory.length}件`);
    if (allHistory.length > 0) {
      allHistory.forEach((h, idx) => {
        const visitDate = typeof h.nursingRecord.visitDate === 'string' 
          ? h.nursingRecord.visitDate 
          : h.nursingRecord.visitDate.toISOString().split('T')[0];
        const isFirst = h.history.nursingRecordId === firstRecordId;
        console.log(`    ${idx + 1}. 訪問記録ID: ${h.history.nursingRecordId}${isFirst ? ' (最初の訪問記録)' : ''}, 訪問日: ${visitDate}, 履歴ID: ${h.history.id}`);
      });
    }
    console.log('');

    // 6. レセプト再計算時の処理順序をシミュレート
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 レセプト再計算時の処理順序をシミュレート:');
    console.log('  (recalculateBonusesForReceipt関数の処理順序を再現)');
    console.log('');

    // 最初の訪問記録を処理する時点での状態を確認
    if (firstRecordId) {
      const firstRecord = sortedRecords[0];
      const visitDate = typeof firstRecord.visitDate === 'string' ? new Date(firstRecord.visitDate) : firstRecord.visitDate;
      const thisMonthStart = new Date(visitDate.getFullYear(), visitDate.getMonth(), 1);
      const thisMonthEnd = new Date(visitDate.getFullYear(), visitDate.getMonth() + 1, 0, 23, 59, 59);

      console.log(`【最初の訪問記録を処理する時点での状態】`);
      console.log(`  訪問記録ID: ${firstRecord.id}`);
      console.log(`  訪問日: ${visitDate.toISOString().split('T')[0]}`);
      console.log('');

      // evaluateMonthlyVisitLimitのチェック（現在の訪問記録を除外）
      // これは、recalculateBonusesForReceipt関数内で最初の訪問記録を処理する際に実行される
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
          visitDate: nursingRecords.visitDate,
        })
        .from(bonusCalculationHistory)
        .innerJoin(nursingRecords, eq(bonusCalculationHistory.nursingRecordId, nursingRecords.id))
        .innerJoin(bonusMaster, eq(bonusCalculationHistory.bonusMasterId, bonusMaster.id))
        .where(and(...whereConditions));

      console.log(`  evaluateMonthlyVisitLimitのチェック結果:`);
      console.log(`    現在の訪問記録（${firstRecord.id}）を除外した既存履歴数: ${existingRecords.length}件`);
      
      if (existingRecords.length > 0) {
        console.log(`    ⚠️  問題発見: 他の訪問記録の既存履歴が存在します！`);
        console.log(`    既存履歴の詳細:`);
        existingRecords.forEach((r, idx) => {
          const visitDateStr = typeof r.visitDate === 'string' ? r.visitDate : r.visitDate.toISOString().split('T')[0];
          const recordIndex = sortedRecords.findIndex(rec => rec.id === r.nursingRecordId);
          console.log(`      ${idx + 1}. 訪問記録ID: ${r.nursingRecordId} (${recordIndex + 1}番目の訪問記録), 訪問日: ${visitDateStr}`);
        });
      } else {
        console.log(`    ✅ 他の訪問記録の既存履歴は存在しません`);
      }
      console.log('');

      const monthlyLimit = 1;
      const currentCount = existingRecords.length;
      const canApply = currentCount < monthlyLimit;

      console.log(`    月次制限: ${monthlyLimit}回`);
      console.log(`    既存の算定回数: ${currentCount}回`);
      console.log(`    判定結果: ${canApply ? '✅ 適用可能' : '❌ 適用不可（制限超過）'}`);
      
      if (!canApply) {
        console.log(`    ❌ 理由: 月${monthlyLimit}回まで（既に${currentCount}回算定済み）`);
        console.log(`    ❌ これが問題の原因です！`);
      } else {
        console.log(`    ✅ 理由: 月${monthlyLimit}回以内（${currentCount}/${monthlyLimit}回）`);
      }
      console.log('');

      // 7. 問題の原因を特定
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📋 問題の原因分析:');
      console.log('');

      if (existingRecords.length > 0) {
        console.log('  ❌ 問題が確認されました！');
        console.log('');
        console.log('  原因:');
        console.log('    レセプト再計算時に、各訪問記録を順番に処理するため、');
        console.log('    最初の訪問記録を処理する時点で、他の訪問記録の既存履歴がまだデータベースに存在している');
        console.log('    evaluateMonthlyVisitLimitでは、現在の訪問記録を除外してチェックするが、');
        console.log('    他の訪問記録の既存履歴はカウントされるため、制限超過と判定される');
        console.log('');
        console.log('  具体的な問題:');
        console.log(`    - 最初の訪問記録（${firstRecord.id}）を処理する時点で、`);
        console.log(`    - 他の訪問記録の既存履歴が${existingRecords.length}件存在する`);
        console.log(`    - 月次制限が${monthlyLimit}回のため、制限超過と判定される`);
        console.log(`    - その結果、24時間対応体制加算が適用されない`);
        console.log('');
        console.log('  解決策:');
        console.log('    レセプト再計算時には、すべての訪問記録の既存履歴を削除してから、');
        console.log('    最初の訪問記録から順番に処理する必要がある');
        console.log('    または、evaluateMonthlyVisitLimitで、レセプト再計算時には');
        console.log('    他の訪問記録の既存履歴をカウントしないようにする必要がある');
      } else {
        console.log('  ✅ この問題は発生していません');
        console.log('    最初の訪問記録を処理する時点で、他の訪問記録の既存履歴は存在しない');
        console.log('    そのため、evaluateMonthlyVisitLimitでは適用可能と判定される');
        console.log('');
        console.log('  別の原因を確認する必要があります:');
        console.log('    1. calculateBonuses関数内で24時間対応体制加算がスキップされた可能性');
        console.log('    2. saveBonusCalculationHistory関数で既存履歴が削除されたが、新しい履歴が保存されなかった可能性');
        console.log('    3. その他のエラーが発生した可能性');
      }
    }

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  }
}

// 実行
verifyRecalculationIssue()
  .then(() => {
    console.log('\n✨ スクリプトが正常に完了しました');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ スクリプトの実行中にエラーが発生しました:', error);
    process.exit(1);
  });

