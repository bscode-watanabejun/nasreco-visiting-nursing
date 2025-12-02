/**
 * 変更したスケジュールの状態を確認するスクリプト
 */

import { db } from '../server/db';
import { schedules, nursingRecords, patients } from '../shared/schema';
import { eq, and, isNull, gte, lte } from 'drizzle-orm';

async function checkChangedSchedule() {
  const changedScheduleId = '5bb624ae-8065-4c0f-83a5-f5fadb99f4ed';

  console.log('🔍 変更したスケジュールの状態を確認します...\n');

  try {
    // 1. 変更したスケジュールを取得
    const schedule = await db.query.schedules.findFirst({
      where: eq(schedules.id, changedScheduleId),
    });

    if (!schedule) {
      console.error('❌ スケジュールが見つかりません。');
      process.exit(1);
    }

    const startTime = new Date(schedule.scheduledStartTime);
    const endTime = new Date(schedule.scheduledEndTime);

    console.log('📋 スケジュール情報:');
    console.log('─'.repeat(80));
    console.log(`スケジュールID: ${schedule.id}`);
    console.log(`日時: ${startTime.toLocaleString('ja-JP')} - ${endTime.toLocaleString('ja-JP')}`);
    console.log(`facilityId: ${schedule.facilityId}`);
    console.log(`patientId: ${schedule.patientId}`);
    console.log(`ステータス: ${schedule.status}\n`);

    // 2. 患者情報を取得
    const patient = await db.query.patients.findFirst({
      where: eq(patients.id, schedule.patientId),
    });

    if (patient) {
      console.log('👤 患者情報:');
      console.log(`   名前: ${patient.lastName} ${patient.firstName}`);
      console.log(`   facilityId: ${patient.facilityId}\n`);
    }

    // 3. 訪問記録を確認
    const records = await db.select()
      .from(nursingRecords)
      .where(
        and(
          eq(nursingRecords.scheduleId, changedScheduleId),
          isNull(nursingRecords.deletedAt)
        )
      );

    console.log('📋 訪問記録:');
    console.log(`   記録数: ${records.length}件`);
    records.forEach((record, index) => {
      console.log(`   ${index + 1}. 記録ID: ${record.id}`);
      console.log(`      facilityId: ${record.facilityId}`);
      console.log(`      scheduleId: ${record.scheduleId}`);
      console.log(`      訪問日: ${record.visitDate}`);
    });
    console.log('');

    // 4. 12月2日のすべてのスケジュールを確認
    const targetDate = new Date('2025-12-02T00:00:00+09:00');
    const nextDay = new Date('2025-12-03T00:00:00+09:00');

    const allSchedules = await db.select()
      .from(schedules)
      .where(
        and(
          eq(schedules.patientId, schedule.patientId),
          gte(schedules.scheduledStartTime, targetDate),
          lte(schedules.scheduledStartTime, nextDay)
        )
      )
      .orderBy(schedules.scheduledStartTime);

    console.log('📅 12月2日の同じ患者のスケジュール:');
    console.log(`   スケジュール数: ${allSchedules.length}件\n`);
    allSchedules.forEach((s, index) => {
      const st = new Date(s.scheduledStartTime);
      const et = new Date(s.scheduledEndTime);
      const isChanged = s.id === changedScheduleId;
      console.log(`   ${index + 1}. ${st.toLocaleString('ja-JP')} - ${et.toLocaleString('ja-JP')}`);
      console.log(`      スケジュールID: ${s.id}${isChanged ? ' ⚠️ 変更済み' : ''}`);
      console.log(`      facilityId: ${s.facilityId}`);
    });

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  }
}

checkChangedSchedule()
  .then(() => {
    console.log('\n✅ 確認完了');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ エラーが発生しました:', error);
    process.exit(1);
  });

