/**
 * スケジュールのタイムゾーンを確認するスクリプト
 */

import { db } from '../server/db';
import { schedules, patients, facilities } from '../shared/schema';
import { eq, and, gte, lte } from 'drizzle-orm';

async function checkScheduleTimezone() {
  console.log('🔍 スケジュールのタイムゾーンを確認します...\n');

  try {
    // 1. 田中 次郎を検索
    const testClinic = await db.query.facilities.findFirst({
      where: eq(facilities.slug, 'test-clinic'),
    });

    if (!testClinic) {
      console.error('❌ テストクリニックが見つかりません。');
      process.exit(1);
    }

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

    // 2. 12月2日のスケジュールを検索（UTCとJSTの両方で）
    console.log('📅 12月2日のスケジュールを検索します...\n');

    // UTCで検索（2025-12-02 00:00:00 UTC から 2025-12-03 00:00:00 UTC）
    const utcStart = new Date('2025-12-02T00:00:00Z');
    const utcEnd = new Date('2025-12-03T00:00:00Z');

    // JSTで検索（2025-12-02 00:00:00 JST = 2025-11-30 15:00:00 UTC から 2025-12-03 00:00:00 JST = 2025-12-02 15:00:00 UTC）
    const jstStart = new Date('2025-12-02T00:00:00+09:00');
    const jstEnd = new Date('2025-12-03T00:00:00+09:00');

    console.log('UTCで検索:');
    console.log(`   開始: ${utcStart.toISOString()} (${utcStart.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })})`);
    console.log(`   終了: ${utcEnd.toISOString()} (${utcEnd.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })})`);
    console.log('');

    console.log('JSTで検索:');
    console.log(`   開始: ${jstStart.toISOString()} (${jstStart.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })})`);
    console.log(`   終了: ${jstEnd.toISOString()} (${jstEnd.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })})`);
    console.log('');

    // UTCで検索
    const schedulesUTC = await db.select()
      .from(schedules)
      .where(
        and(
          eq(schedules.patientId, tanakaPatient.id),
          gte(schedules.scheduledStartTime, utcStart),
          lte(schedules.scheduledStartTime, utcEnd)
        )
      )
      .orderBy(schedules.scheduledStartTime);

    // JSTで検索
    const schedulesJST = await db.select()
      .from(schedules)
      .where(
        and(
          eq(schedules.patientId, tanakaPatient.id),
          gte(schedules.scheduledStartTime, jstStart),
          lte(schedules.scheduledStartTime, jstEnd)
        )
      )
      .orderBy(schedules.scheduledStartTime);

    console.log(`📊 UTCで検索した結果: ${schedulesUTC.length}件`);
    schedulesUTC.forEach((s, index) => {
      const startTime = new Date(s.scheduledStartTime);
      const endTime = new Date(s.scheduledEndTime);
      console.log(`   ${index + 1}. UTC: ${startTime.toISOString()} - ${endTime.toISOString()}`);
      console.log(`      JST: ${startTime.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} - ${endTime.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);
      console.log(`      スケジュールID: ${s.id}`);
      console.log(`      facilityId: ${s.facilityId}`);
    });
    console.log('');

    console.log(`📊 JSTで検索した結果: ${schedulesJST.length}件`);
    schedulesJST.forEach((s, index) => {
      const startTime = new Date(s.scheduledStartTime);
      const endTime = new Date(s.scheduledEndTime);
      console.log(`   ${index + 1}. UTC: ${startTime.toISOString()} - ${endTime.toISOString()}`);
      console.log(`      JST: ${startTime.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} - ${endTime.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);
      console.log(`      スケジュールID: ${s.id}`);
      console.log(`      facilityId: ${s.facilityId}`);
    });
    console.log('');

    // 3. 23:00-00:00のスケジュールを特定（JSTで）
    const lateNightSchedule = schedulesJST.find(s => {
      const startTime = new Date(s.scheduledStartTime);
      const jstHours = new Date(startTime.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' })).getHours();
      return jstHours >= 23 || jstHours === 0;
    });

    if (lateNightSchedule) {
      const startTime = new Date(lateNightSchedule.scheduledStartTime);
      const endTime = new Date(lateNightSchedule.scheduledEndTime);
      console.log('✅ 23:00-00:00のスケジュール（JST）:');
      console.log(`   スケジュールID: ${lateNightSchedule.id}`);
      console.log(`   UTC: ${startTime.toISOString()} - ${endTime.toISOString()}`);
      console.log(`   JST: ${startTime.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} - ${endTime.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);
      console.log(`   facilityId: ${lateNightSchedule.facilityId}`);
    }

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  }
}

checkScheduleTimezone()
  .then(() => {
    console.log('\n✅ 確認完了');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ エラーが発生しました:', error);
    process.exit(1);
  });

