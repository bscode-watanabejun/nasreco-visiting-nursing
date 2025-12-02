/**
 * 変更した訪問記録が正しいスケジュールに紐づいているか確認するスクリプト
 */

import { db } from '../server/db';
import { schedules, nursingRecords } from '../shared/schema';
import { eq, and, isNull } from 'drizzle-orm';

async function verifyChangedRecord() {
  const scheduleId = '08d6a210-abf8-4c0d-9f8d-57a580c61808';
  const recordId = '5fb6b65e-47d0-4534-8ac0-9c3abae69826';

  console.log('🔍 変更した訪問記録を確認します...\n');

  try {
    // 1. スケジュールを取得
    const schedule = await db.query.schedules.findFirst({
      where: eq(schedules.id, scheduleId),
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
    console.log(`UTC: ${startTime.toISOString()} - ${endTime.toISOString()}`);
    console.log(`JST: ${startTime.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} - ${endTime.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);
    console.log(`facilityId: ${schedule.facilityId}\n`);

    // 2. 訪問記録を取得
    const record = await db.query.nursingRecords.findFirst({
      where: eq(nursingRecords.id, recordId),
    });

    if (!record) {
      console.error('❌ 訪問記録が見つかりません。');
      process.exit(1);
    }

    console.log('📋 訪問記録情報:');
    console.log('─'.repeat(80));
    console.log(`記録ID: ${record.id}`);
    console.log(`scheduleId: ${record.scheduleId}`);
    console.log(`facilityId: ${record.facilityId}`);
    console.log(`訪問日: ${record.visitDate}`);
    console.log(`ステータス: ${record.status}\n`);

    // 3. 一致確認
    console.log('📊 一致確認:');
    console.log('─'.repeat(80));
    console.log(`スケジュールIDの一致: ${schedule.id === record.scheduleId ? '✅' : '❌'}`);
    console.log(`スケジュールのfacilityId: ${schedule.facilityId}`);
    console.log(`記録のfacilityId: ${record.facilityId}`);
    console.log(`facilityIdの一致: ${schedule.facilityId === record.facilityId ? '✅' : '❌'}\n`);

    // 4. APIが使用するfacilityIdで検索
    const apiFacilityId = schedule.facilityId; // APIはスケジュールのfacilityIdを使用する
    const recordFoundByApi = await db.query.nursingRecords.findFirst({
      where: and(
        eq(nursingRecords.scheduleId, scheduleId),
        eq(nursingRecords.facilityId, apiFacilityId),
        isNull(nursingRecords.deletedAt)
      ),
    });

    console.log('🔍 APIエンドポイントの動作確認:');
    console.log('─'.repeat(80));
    console.log(`APIが使用するfacilityId: ${apiFacilityId}`);
    if (recordFoundByApi) {
      console.log(`✅ APIで記録が見つかりました: ${recordFoundByApi.id}`);
      console.log(`   hasRecord: true`);
    } else {
      console.log(`❌ APIで記録が見つかりませんでした`);
      console.log(`   hasRecord: false`);
      console.log(`   ⚠️  これが問題の原因です！`);
    }

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  }
}

verifyChangedRecord()
  .then(() => {
    console.log('\n✅ 確認完了');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ エラーが発生しました:', error);
    process.exit(1);
  });

