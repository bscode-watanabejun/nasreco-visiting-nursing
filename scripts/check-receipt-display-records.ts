/**
 * レセプト詳細画面で表示される訪問記録を確認するスクリプト
 * JST変換と削除・下書きの除外を確認
 */

import { db } from "../server/db";
import { monthlyReceipts, patients, nursingRecords } from "@shared/schema";
import { eq, and, gte, lte, inArray, isNull } from "drizzle-orm";

async function checkReceiptDisplayRecords() {
  console.log('🔍 レセプト詳細画面で表示される訪問記録を確認中...\n');

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

    console.log(`📋 レセプト情報:`);
    console.log(`  レセプトID: ${receipt.id}`);
    console.log(`  対象年月: ${targetYear}年${targetMonth}月`);
    console.log(`  施設ID: ${facilityId}`);
    console.log('');

    // 3. レセプト詳細画面のAPIと同じ条件で訪問記録を取得
    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0);

    console.log(`📋 取得条件:`);
    console.log(`  開始日: ${startDate.toISOString().split('T')[0]}`);
    console.log(`  終了日: ${endDate.toISOString().split('T')[0]}`);
    console.log(`  ステータス: completed または reviewed`);
    console.log(`  削除フラグ: null（削除されていない）`);
    console.log('');

    // レセプト詳細画面のAPIと同じ条件（7301-7309行目）
    const relatedRecords = await db.select({
      record: nursingRecords,
    })
      .from(nursingRecords)
      .where(and(
        eq(nursingRecords.patientId, receipt.patientId),
        eq(nursingRecords.facilityId, facilityId),
        gte(nursingRecords.visitDate, startDate.toISOString().split('T')[0]),
        lte(nursingRecords.visitDate, endDate.toISOString().split('T')[0]),
        inArray(nursingRecords.status, ['completed', 'reviewed']),
        isNull(nursingRecords.deletedAt) // 削除フラグが設定されていない記録のみ取得
      ))
      .orderBy(nursingRecords.visitDate);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📋 レセプト詳細画面で表示される訪問記録: ${relatedRecords.length}件`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    if (relatedRecords.length > 0) {
      relatedRecords.forEach((item, index) => {
        const record = item.record;
        const visitDate = typeof record.visitDate === 'string' ? record.visitDate : record.visitDate.toISOString().split('T')[0];
        
        // UTC時刻をJSTに変換（フロントエンドと同じロジック）
        let startTimeJST = '-';
        let endTimeJST = '-';
        
        if (record.actualStartTime) {
          const startTime = typeof record.actualStartTime === 'string' 
            ? new Date(record.actualStartTime) 
            : record.actualStartTime;
          startTimeJST = startTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        }
        
        if (record.actualEndTime) {
          const endTime = typeof record.actualEndTime === 'string' 
            ? new Date(record.actualEndTime) 
            : record.actualEndTime;
          endTimeJST = endTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        }

        console.log(`  ${index + 1}. ID: ${record.id}`);
        console.log(`     訪問日: ${visitDate}`);
        console.log(`     訪問時間（JST）: ${startTimeJST} - ${endTimeJST}`);
        console.log(`     ステータス: ${record.status}`);
        console.log(`     削除フラグ: ${record.deletedAt ? '削除済み' : '未削除'}`);
        console.log(`     UTC開始時刻: ${record.actualStartTime ? (typeof record.actualStartTime === 'string' ? record.actualStartTime : record.actualStartTime.toISOString()) : '未設定'}`);
        console.log(`     UTC終了時刻: ${record.actualEndTime ? (typeof record.actualEndTime === 'string' ? record.actualEndTime : record.actualEndTime.toISOString()) : '未設定'}`);
        console.log('');
      });
    } else {
      console.log('訪問記録が存在しません');
    }

    // 4. すべての訪問記録（条件なし）を確認
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 すべての訪問記録（条件なし）:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    const allRecords = await db.query.nursingRecords.findMany({
      where: and(
        eq(nursingRecords.patientId, receipt.patientId),
        eq(nursingRecords.facilityId, facilityId),
        gte(nursingRecords.visitDate, startDate.toISOString().split('T')[0]),
        lte(nursingRecords.visitDate, endDate.toISOString().split('T')[0])
      ),
      orderBy: [nursingRecords.visitDate, nursingRecords.actualStartTime],
    });

    console.log(`  全訪問記録数: ${allRecords.length}件`);
    console.log('');

    allRecords.forEach((record, index) => {
      const visitDate = typeof record.visitDate === 'string' ? record.visitDate : record.visitDate.toISOString().split('T')[0];
      
      let startTimeJST = '-';
      let endTimeJST = '-';
      
      if (record.actualStartTime) {
        const startTime = typeof record.actualStartTime === 'string' 
          ? new Date(record.actualStartTime) 
          : record.actualStartTime;
        startTimeJST = startTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
      }
      
      if (record.actualEndTime) {
        const endTime = typeof record.actualEndTime === 'string' 
          ? new Date(record.actualEndTime) 
          : record.actualEndTime;
        endTimeJST = endTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
      }

      const isDisplayed = record.status === 'completed' || record.status === 'reviewed';
      const isDeleted = record.deletedAt !== null;

      console.log(`  ${index + 1}. ID: ${record.id}`);
      console.log(`     訪問日: ${visitDate}`);
      console.log(`     訪問時間（JST）: ${startTimeJST} - ${endTimeJST}`);
      console.log(`     ステータス: ${record.status}${isDisplayed ? ' ✅ 表示対象' : ' ❌ 表示対象外'}`);
      console.log(`     削除フラグ: ${isDeleted ? '削除済み ❌ 表示対象外' : '未削除 ✅ 表示対象'}`);
      console.log(`     表示されるか: ${isDisplayed && !isDeleted ? '✅ 表示される' : '❌ 表示されない'}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  }
}

// 実行
checkReceiptDisplayRecords()
  .then(() => {
    console.log('\n✨ スクリプトが正常に完了しました');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ スクリプトの実行中にエラーが発生しました:', error);
    process.exit(1);
  });

