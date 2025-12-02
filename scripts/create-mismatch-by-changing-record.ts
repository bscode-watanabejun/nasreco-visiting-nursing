/**
 * 問題を再現するために、訪問記録のfacilityIdを一時的に変更するスクリプト
 * 
 * ⚠️  警告: このスクリプトはデータの整合性を壊します。
 * テスト後に必ず元に戻してください。
 * 
 * 実行方法:
 *   npx tsx scripts/create-mismatch-by-changing-record.ts
 */

import { db } from '../server/db';
import { facilities, schedules, nursingRecords, patients } from '../shared/schema';
import { eq, and, isNull, gte, lte } from 'drizzle-orm';

async function createMismatchByChangingRecord() {
  console.log('⚠️  警告: このスクリプトはデータの整合性を壊します。');
  console.log('   テスト後に必ず元に戻してください。\n');

  try {
    // 1. テストクリニックを取得
    const testClinic = await db.query.facilities.findFirst({
      where: eq(facilities.slug, 'test-clinic'),
    });

    if (!testClinic) {
      console.error('❌ テストクリニックが見つかりません。');
      process.exit(1);
    }

    console.log(`✅ テストクリニック: ${testClinic.name} (ID: ${testClinic.id})\n`);

    // 2. 田中 次郎を検索
    const tanakaPatient = await db.query.patients.findFirst({
      where: and(
        eq(patients.facilityId, testClinic.id),
        eq(patients.lastName, '田中'),
        eq(patients.firstName, '次郎')
      ),
    });

    if (!tanakaPatient) {
      console.error('❌ 田中 次郎が見つかりません。');
      process.exit(1);
    }

    console.log(`✅ 患者: ${tanakaPatient.lastName} ${tanakaPatient.firstName} (ID: ${tanakaPatient.id})\n`);

    // 3. 12月2日のスケジュールを検索
    const targetDate = new Date('2025-12-02T00:00:00+09:00');
    const nextDay = new Date('2025-12-03T00:00:00+09:00');

    const schedulesOnDate = await db.select()
      .from(schedules)
      .where(
        and(
          eq(schedules.patientId, tanakaPatient.id),
          eq(schedules.facilityId, testClinic.id), // テストクリニックのスケジュールのみ
          gte(schedules.scheduledStartTime, targetDate),
          lte(schedules.scheduledStartTime, nextDay)
        )
      )
      .orderBy(schedules.scheduledStartTime);

    console.log(`📅 12月2日の田中 次郎のスケジュール: ${schedulesOnDate.length}件\n`);

    if (schedulesOnDate.length === 0) {
      console.error('❌ スケジュールが見つかりませんでした。');
      process.exit(1);
    }

    // 4. 最初のスケジュールを使用（または23:00-00:00のスケジュールを探す）
    let targetSchedule = schedulesOnDate[0];
    
    // 23:00-00:00のスケジュールを探す
    const lateNightSchedule = schedulesOnDate.find(s => {
      const startTime = new Date(s.scheduledStartTime);
      const hours = startTime.getHours();
      return hours >= 23 || hours === 0;
    });

    if (lateNightSchedule) {
      targetSchedule = lateNightSchedule;
    }

    const startTime = new Date(targetSchedule.scheduledStartTime);
    const endTime = new Date(targetSchedule.scheduledEndTime);
    console.log('✅ 対象スケジュールを確認:');
    console.log(`   スケジュールID: ${targetSchedule.id}`);
    console.log(`   日時: ${startTime.toLocaleString('ja-JP')} - ${endTime.toLocaleString('ja-JP')}`);
    console.log(`   facilityId: ${targetSchedule.facilityId}\n`);

    // 5. 訪問記録を確認
    const existingRecords = await db.select()
      .from(nursingRecords)
      .where(
        and(
          eq(nursingRecords.scheduleId, targetSchedule.id),
          eq(nursingRecords.facilityId, testClinic.id),
          isNull(nursingRecords.deletedAt)
        )
      );

    if (existingRecords.length === 0) {
      console.error('❌ このスケジュールに紐づく訪問記録が見つかりません。');
      process.exit(1);
    }

    const record = existingRecords[0];
    console.log(`✅ 訪問記録を確認:`);
    console.log(`   記録ID: ${record.id}`);
    console.log(`   現在のfacilityId: ${record.facilityId}`);
    console.log(`   scheduleId: ${record.scheduleId}\n`);

    // 6. 他の施設を取得
    const otherFacilities = await db.select()
      .from(facilities)
      .where(eq(facilities.companyId, testClinic.companyId))
      .limit(10);

    const otherFacility = otherFacilities.find(f => f.id !== testClinic.id);
    if (!otherFacility) {
      console.error('❌ 異なる施設が見つかりません。');
      process.exit(1);
    }

    console.log(`✅ 他の施設: ${otherFacility.name} (ID: ${otherFacility.id})\n`);

    // 7. 元のfacilityIdを保存
    const originalRecordFacilityId = record.facilityId;

    // 8. 訪問記録のfacilityIdを変更（スケジュールのfacilityIdは変更しない）
    console.log('⚠️  訪問記録のfacilityIdを変更します...');
    console.log('   （スケジュールのfacilityIdは変更しません）\n');
    
    await db.update(nursingRecords)
      .set({ facilityId: otherFacility.id })
      .where(eq(nursingRecords.id, record.id));

    console.log(`✅ 訪問記録のfacilityIdを変更しました:`);
    console.log(`   記録ID: ${record.id}`);
    console.log(`   ${originalRecordFacilityId} → ${otherFacility.id}\n`);

    // 9. 変更後の状態を確認
    const updatedRecord = await db.query.nursingRecords.findFirst({
      where: eq(nursingRecords.id, record.id),
    });

    if (updatedRecord) {
      console.log('📊 変更後の状態:');
      console.log('─'.repeat(80));
      console.log(`スケジュールのfacilityId: ${targetSchedule.facilityId}`);
      console.log(`記録のfacilityId: ${updatedRecord.facilityId}`);
      console.log(`APIが使用するfacilityId（予想）: ${testClinic.id}`);
      console.log(`スケジュールと記録のfacilityIdの一致: ${targetSchedule.facilityId === updatedRecord.facilityId ? '✅' : '❌'}`);
      console.log(`APIのfacilityIdと記録のfacilityIdの一致: ${testClinic.id === updatedRecord.facilityId ? '✅' : '❌'}\n`);
    }

    // 10. 復元用のスクリプトを作成
    const restoreScript = `/**
 * 訪問記録のfacilityIdを元に戻すスクリプト
 * 
 * 実行方法:
 *   npx tsx scripts/restore-record-facility-id.ts
 */

import { db } from '../server/db';
import { nursingRecords } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function restoreFacilityId() {
  const recordId = '${record.id}';
  const originalFacilityId = '${originalRecordFacilityId}';

  console.log('🔄 訪問記録のfacilityIdを元に戻します...\\n');

  try {
    await db.update(nursingRecords)
      .set({ facilityId: originalFacilityId })
      .where(eq(nursingRecords.id, recordId));

    console.log(\`✅ 訪問記録のfacilityIdを元に戻しました:\`);
    console.log(\`   記録ID: \${recordId}\`);
    console.log(\`   facilityId: \${originalFacilityId}\`);
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  }
}

restoreFacilityId()
  .then(() => {
    console.log('\\n✅ 復元完了');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\\n❌ エラーが発生しました:', error);
    process.exit(1);
  });
`;

    const fs = await import('fs');
    const path = await import('path');
    const scriptPath = path.join(process.cwd(), 'scripts', 'restore-record-facility-id.ts');
    fs.writeFileSync(scriptPath, restoreScript);
    console.log(`✅ 復元用スクリプトを作成しました: scripts/restore-record-facility-id.ts\n`);

    // 11. 再現手順の表示
    console.log('🎯 再現手順:');
    console.log('─'.repeat(80));
    console.log('1. ブラウザでスケジュール一覧画面を確認:');
    console.log(`   URL: http://localhost:5000/nasreco/test-clinic/schedule`);
    console.log(`   日付を2025年12月2日に設定`);
    console.log('');
    console.log('2. 田中 次郎のスケジュールを確認:');
    console.log(`   スケジュールID: ${targetSchedule.id}`);
    console.log(`   日時: ${startTime.toLocaleString('ja-JP')} - ${endTime.toLocaleString('ja-JP')}`);
    console.log('');
    console.log('3. 「記録作成」アイコンが表示されることを確認:');
    console.log('   （本来は「記録詳細」が表示されるべき）');
    console.log('');
    console.log('4. サーバーログを確認:');
    console.log(`   [ScheduleRecordAPI] Match: ✅ が表示される（スケジュールのfacilityIdは一致）`);
    console.log(`   [ScheduleRecordAPI] Record not found が表示される`);
    console.log(`   [ScheduleRecordAPI] ⚠️  Record found with schedule's facilityId が表示される`);
    console.log(`   [ScheduleRecordAPI] ⚠️  This indicates the bug! が表示される`);
    console.log('');
    console.log('5. テスト後は必ず元に戻してください:');
    console.log(`   npx tsx scripts/restore-record-facility-id.ts`);

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  }
}

createMismatchByChangingRecord()
  .then(() => {
    console.log('\n✅ 設定完了');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ エラーが発生しました:', error);
    process.exit(1);
  });

