/**
 * 修正後の状態を確認するスクリプト
 */

import { db } from '../server/db';
import { schedules, nursingRecords } from '../shared/schema';
import { eq, and, isNull } from 'drizzle-orm';

async function checkFixStatus() {
  const scheduleId = '08d6a210-abf8-4c0d-9f8d-57a580c61808';
  const recordId = '5fb6b65e-47d0-4534-8ac0-9c3abae69826';

  console.log('🔍 修正後の状態を確認します...\n');

  try {
    // 1. スケジュールを取得
    const schedule = await db.query.schedules.findFirst({
      where: eq(schedules.id, scheduleId),
    });

    if (!schedule) {
      console.error('❌ スケジュールが見つかりません。');
      process.exit(1);
    }

    console.log('📋 スケジュール情報:');
    console.log(`   ID: ${schedule.id}`);
    console.log(`   facilityId: ${schedule.facilityId}\n`);

    // 2. 訪問記録を取得
    const record = await db.query.nursingRecords.findFirst({
      where: eq(nursingRecords.id, recordId),
    });

    if (!record) {
      console.error('❌ 訪問記録が見つかりません。');
      process.exit(1);
    }

    console.log('📋 訪問記録情報:');
    console.log(`   ID: ${record.id}`);
    console.log(`   scheduleId: ${record.scheduleId}`);
    console.log(`   facilityId: ${record.facilityId}`);
    console.log(`   deletedAt: ${record.deletedAt || 'null'}\n`);

    // 3. 修正後のロジックで検索（スケジュールのfacilityIdを使用）
    const recordFoundByScheduleFacilityId = await db.query.nursingRecords.findFirst({
      where: and(
        eq(nursingRecords.scheduleId, scheduleId),
        eq(nursingRecords.facilityId, schedule.facilityId),
        isNull(nursingRecords.deletedAt)
      ),
    });

    console.log('🔍 修正後のロジックで検索:');
    console.log(`   スケジュールのfacilityId: ${schedule.facilityId}`);
    console.log(`   条件: scheduleId=${scheduleId}, facilityId=${schedule.facilityId}, deletedAt IS NULL`);
    
    if (recordFoundByScheduleFacilityId) {
      console.log(`   ✅ 記録が見つかりました: ${recordFoundByScheduleFacilityId.id}`);
      console.log(`   hasRecord: true`);
      console.log(`   → 「記録詳細」ボタンが表示されるべき`);
    } else {
      console.log(`   ❌ 記録が見つかりませんでした`);
      console.log(`   hasRecord: false`);
      console.log(`   → 「記録作成」ボタンが表示される`);
      
      if (record.facilityId !== schedule.facilityId) {
        console.log(`\n⚠️  問題: 訪問記録のfacilityIdがスケジュールのfacilityIdと異なります`);
        console.log(`   スケジュールのfacilityId: ${schedule.facilityId}`);
        console.log(`   訪問記録のfacilityId: ${record.facilityId}`);
        console.log(`\n   テスト用データを復元してください:`);
        console.log(`   npx tsx scripts/restore-record-facility-id.ts`);
      }
    }

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  }
}

checkFixStatus()
  .then(() => {
    console.log('\n✅ 確認完了');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ エラーが発生しました:', error);
    process.exit(1);
  });

