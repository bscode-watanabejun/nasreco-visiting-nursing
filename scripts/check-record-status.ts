/**
 * 訪問記録の状態を詳細に確認するスクリプト
 */

import { db } from '../server/db';
import { nursingRecords, schedules } from '../shared/schema';
import { eq, and, isNull } from 'drizzle-orm';

async function checkRecordStatus() {
  const scheduleId = '08d6a210-abf8-4c0d-9f8d-57a580c61808';
  const recordId = '5fb6b65e-47d0-4534-8ac0-9c3abae69826';

  console.log('🔍 訪問記録の状態を詳細に確認します...\n');

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

    // 2. 訪問記録を取得（deletedAtを考慮しない）
    const record = await db.select()
      .from(nursingRecords)
      .where(eq(nursingRecords.id, recordId))
      .limit(1);

    if (record.length === 0) {
      console.error('❌ 訪問記録が見つかりません。');
      process.exit(1);
    }

    const recordData = record[0];
    console.log('📋 訪問記録情報（deletedAtを考慮しない）:');
    console.log(`   ID: ${recordData.id}`);
    console.log(`   scheduleId: ${recordData.scheduleId}`);
    console.log(`   facilityId: ${recordData.facilityId}`);
    console.log(`   deletedAt: ${recordData.deletedAt || 'null'}\n`);

    // 3. スケジュールIDで検索（deletedAtを考慮しない）
    const recordsByScheduleId = await db.select()
      .from(nursingRecords)
      .where(eq(nursingRecords.scheduleId, scheduleId));

    console.log(`📋 スケジュールIDで検索した結果（deletedAtを考慮しない）: ${recordsByScheduleId.length}件`);
    recordsByScheduleId.forEach((r, index) => {
      console.log(`   ${index + 1}. 記録ID: ${r.id}`);
      console.log(`      facilityId: ${r.facilityId}`);
      console.log(`      deletedAt: ${r.deletedAt || 'null'}`);
    });
    console.log('');

    // 4. APIエンドポイントと同じ条件で検索
    const apiFacilityId = schedule.facilityId; // fac-osaka-branch

    // 4-1. APIが使用するfacilityIdで検索
    const recordWithApiFacilityId = await db.query.nursingRecords.findFirst({
      where: and(
        eq(nursingRecords.scheduleId, scheduleId),
        eq(nursingRecords.facilityId, apiFacilityId),
        isNull(nursingRecords.deletedAt)
      ),
    });

    console.log('🔍 APIエンドポイントと同じ条件で検索:');
    console.log(`   APIが使用するfacilityId: ${apiFacilityId}`);
    console.log(`   条件: scheduleId=${scheduleId}, facilityId=${apiFacilityId}, deletedAt IS NULL`);
    if (recordWithApiFacilityId) {
      console.log(`   ✅ 記録が見つかりました: ${recordWithApiFacilityId.id}`);
    } else {
      console.log(`   ❌ 記録が見つかりませんでした`);
    }
    console.log('');

    // 4-2. スケジュールのfacilityIdで検索（deletedAtを考慮しない）
    const recordWithScheduleFacilityId = await db.select()
      .from(nursingRecords)
      .where(
        and(
          eq(nursingRecords.scheduleId, scheduleId),
          eq(nursingRecords.facilityId, schedule.facilityId)
        )
      )
      .limit(1);

    console.log(`🔍 スケジュールのfacilityIdで検索（deletedAtを考慮しない）:`);
    console.log(`   スケジュールのfacilityId: ${schedule.facilityId}`);
    if (recordWithScheduleFacilityId.length > 0) {
      console.log(`   ✅ 記録が見つかりました: ${recordWithScheduleFacilityId[0].id}`);
      console.log(`      facilityId: ${recordWithScheduleFacilityId[0].facilityId}`);
      console.log(`      deletedAt: ${recordWithScheduleFacilityId[0].deletedAt || 'null'}`);
    } else {
      console.log(`   ❌ 記録が見つかりませんでした`);
    }
    console.log('');

    // 4-3. スケジュールのfacilityIdで検索（deletedAtを考慮する）
    const recordWithScheduleFacilityIdAndDeleted = await db.query.nursingRecords.findFirst({
      where: and(
        eq(nursingRecords.scheduleId, scheduleId),
        eq(nursingRecords.facilityId, schedule.facilityId),
        isNull(nursingRecords.deletedAt)
      ),
    });

    console.log(`🔍 スケジュールのfacilityIdで検索（deletedAtを考慮する）:`);
    console.log(`   スケジュールのfacilityId: ${schedule.facilityId}`);
    if (recordWithScheduleFacilityIdAndDeleted) {
      console.log(`   ✅ 記録が見つかりました: ${recordWithScheduleFacilityIdAndDeleted.id}`);
    } else {
      console.log(`   ❌ 記録が見つかりませんでした`);
    }

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  }
}

checkRecordStatus()
  .then(() => {
    console.log('\n✅ 確認完了');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ エラーが発生しました:', error);
    process.exit(1);
  });

