/**
 * 訪問回数の計算ロジックを確認するスクリプト
 */

import { db } from "../server/db";
import { monthlyReceipts, patients, nursingRecords } from "@shared/schema";
import { eq, and, gte, lte, inArray, isNull } from "drizzle-orm";

async function checkVisitCountCalculation() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 訪問回数の計算ロジックを確認');
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
    const facilityId = receipt.facilityId;
    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0);

    console.log(`📋 レセプト情報:`);
    console.log(`  レセプトID: ${receipt.id}`);
    console.log(`  対象年月: ${targetYear}年${targetMonth}月`);
    console.log(`  現在の訪問回数（DB）: ${receipt.visitCount}回`);
    console.log('');

    // 3. レセプト詳細画面の訪問記録セクションの条件で取得
    const displayRecords = await db.query.nursingRecords.findMany({
      where: and(
        eq(nursingRecords.patientId, receipt.patientId),
        eq(nursingRecords.facilityId, facilityId),
        gte(nursingRecords.visitDate, startDate.toISOString().split('T')[0]),
        lte(nursingRecords.visitDate, endDate.toISOString().split('T')[0]),
        inArray(nursingRecords.status, ['completed', 'reviewed']),
        isNull(nursingRecords.deletedAt)
      ),
      orderBy: [nursingRecords.visitDate, nursingRecords.actualStartTime],
    });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 レセプト詳細画面の訪問記録セクション:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  条件: status = 'completed' または 'reviewed' かつ deletedAt = null`);
    console.log(`  件数: ${displayRecords.length}件`);
    console.log('');

    // 4. レセプト再計算時の条件で取得（現在の実装）
    const recalculationRecords = await db.select()
      .from(nursingRecords)
      .where(and(
        eq(nursingRecords.facilityId, facilityId),
        eq(nursingRecords.patientId, receipt.patientId),
        gte(nursingRecords.visitDate, startDate.toISOString().split('T')[0]),
        lte(nursingRecords.visitDate, endDate.toISOString().split('T')[0]),
        inArray(nursingRecords.status, ['completed', 'reviewed'])
        // ⚠️ deletedAtのチェックなし
      ));

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 レセプト再計算時の訪問記録取得条件（現在の実装）:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  条件: status = 'completed' または 'reviewed'（deletedAtのチェックなし）`);
    console.log(`  件数: ${recalculationRecords.length}件`);
    console.log('');

    if (recalculationRecords.length > 0) {
      recalculationRecords.forEach((record, index) => {
        const visitDate = typeof record.visitDate === 'string' ? record.visitDate : record.visitDate.toISOString().split('T')[0];
        const isDeleted = record.deletedAt !== null;
        console.log(`  ${index + 1}. ID: ${record.id}`);
        console.log(`     訪問日: ${visitDate}`);
        console.log(`     ステータス: ${record.status}`);
        console.log(`     削除フラグ: ${isDeleted ? '削除済み ❌' : '未削除 ✅'}`);
        console.log('');
      });
    }

    // 5. レセプト生成時の条件で取得（確認が必要）
    // レセプト生成時のコードを確認する必要がある

    // 6. 原因の特定
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 原因の特定:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    if (recalculationRecords.length !== displayRecords.length) {
      console.log('  ❌ 問題が確認されました！');
      console.log('');
      console.log('  原因:');
      console.log(`    - レセプト詳細画面の訪問記録セクション: ${displayRecords.length}件`);
      console.log(`    - レセプト再計算時の訪問記録取得: ${recalculationRecords.length}件`);
      console.log(`    - レセプトの訪問回数（DB）: ${receipt.visitCount}回`);
      console.log('');
      console.log('  問題の詳細:');
      console.log('    レセプト再計算時（8066-8074行目）とレセプト生成時に、');
      console.log('    訪問記録を取得する際に`isNull(nursingRecords.deletedAt)`の条件が含まれていない');
      console.log('    そのため、削除された訪問記録も訪問回数にカウントされている');
      console.log('');
      console.log('  解決策:');
      console.log('    レセプト再計算時とレセプト生成時の訪問記録取得条件に、');
      console.log('    `isNull(nursingRecords.deletedAt)`を追加する必要がある');
    } else {
      console.log('  ✅ 訪問記録の件数は一致しています');
    }

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  }
}

// 実行
checkVisitCountCalculation()
  .then(() => {
    console.log('\n✨ スクリプトが正常に完了しました');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ スクリプトの実行中にエラーが発生しました:', error);
    process.exit(1);
  });

