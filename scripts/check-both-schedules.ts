/**
 * 2つのスケジュールを比較して確認するスクリプト
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { eq, and, isNull } from 'drizzle-orm';
import * as schema from '../shared/schema';

neonConfig.webSocketConstructor = ws;

const PROD_DB_URL = 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function checkBothSchedules() {
  const scheduleId1 = '5f60a435-a78a-4ce5-ad71-167aa2c9c6c4'; // 「記録詳細」が表示されている
  const scheduleId2 = '1141dfd8-e14a-445c-9cec-d50bb636574a'; // 「記録作成」が表示されている

  console.log('🔍 2つのスケジュールを比較して確認します...\n');

  const prodPool = new Pool({ connectionString: PROD_DB_URL });
  const prodDb = drizzle({ client: prodPool, schema });

  try {
    // スケジュール1を確認
    console.log('═'.repeat(80));
    console.log('📋 スケジュール1（「記録詳細」が表示されている）');
    console.log('═'.repeat(80));
    await checkSchedule(prodDb, scheduleId1);
    
    console.log('\n');
    
    // スケジュール2を確認
    console.log('═'.repeat(80));
    console.log('📋 スケジュール2（「記録作成」が表示されている）');
    console.log('═'.repeat(80));
    await checkSchedule(prodDb, scheduleId2);

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prodPool.end();
  }
}

async function checkSchedule(prodDb: any, scheduleId: string) {
  // 1. スケジュールを取得
  const schedule = await prodDb.query.schedules.findFirst({
    where: eq(schema.schedules.id, scheduleId),
  });

  if (!schedule) {
    console.error(`❌ スケジュールが見つかりません: ${scheduleId}`);
    return;
  }

  const startTime = new Date(schedule.scheduledStartTime);
  console.log(`スケジュールID: ${schedule.id}`);
  console.log(`日時: ${startTime.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);
  console.log(`施設ID: ${schedule.facilityId}`);
  console.log(`患者ID: ${schedule.patientId}`);
  console.log(`ステータス: ${schedule.status}\n`);

  // 2. 患者情報を取得
  const patient = await prodDb.query.patients.findFirst({
    where: eq(schema.patients.id, schedule.patientId),
  });

  if (patient) {
    console.log(`患者: ${patient.lastName} ${patient.firstName}`);
    console.log(`患者の施設ID: ${patient.facilityId}\n`);
  }

  // 3. このスケジュールに紐づく訪問記録を検索（deletedAtを考慮しない）
  const allRecords = await prodDb.select()
    .from(schema.nursingRecords)
    .where(eq(schema.nursingRecords.scheduleId, scheduleId));

  console.log(`このスケジュールに紐づく訪問記録（deletedAtを考慮しない）: ${allRecords.length}件`);
  allRecords.forEach((r, index) => {
    console.log(`  ${index + 1}. 記録ID: ${r.id}`);
    console.log(`     facilityId: ${r.facilityId}`);
    console.log(`     scheduleId: ${r.scheduleId}`);
    console.log(`     deletedAt: ${r.deletedAt || 'null'}`);
    console.log(`     訪問日: ${r.visitDate}`);
  });
  console.log('');

  // 4. 修正後のロジックで検索（スケジュールのfacilityIdを使用、deletedAt IS NULL）
  const recordWithNewLogic = await prodDb.query.nursingRecords.findFirst({
    where: and(
      eq(schema.nursingRecords.scheduleId, scheduleId),
      eq(schema.nursingRecords.facilityId, schedule.facilityId),
      isNull(schema.nursingRecords.deletedAt)
    ),
  });

  console.log('修正後のロジックで検索:');
  console.log(`  スケジュールのfacilityId: ${schedule.facilityId}`);
  console.log(`  条件: scheduleId=${scheduleId}, facilityId=${schedule.facilityId}, deletedAt IS NULL`);
  
  if (recordWithNewLogic) {
    console.log(`  ✅ 記録が見つかりました: ${recordWithNewLogic.id}`);
    console.log(`  hasRecord: true`);
    console.log(`  → APIは「記録詳細」ボタンを表示すべき`);
  } else {
    console.log(`  ❌ 記録が見つかりませんでした`);
    console.log(`  hasRecord: false`);
    console.log(`  → APIは「記録作成」ボタンを表示する（現在の動作）`);
    
    if (allRecords.length > 0) {
      console.log(`\n  ⚠️  問題: 訪問記録は存在するが、以下の理由で見つかりません:`);
      allRecords.forEach((r) => {
        if (r.facilityId !== schedule.facilityId) {
          console.log(`    - 記録のfacilityId (${r.facilityId}) がスケジュールのfacilityId (${schedule.facilityId}) と異なる`);
        }
        if (r.deletedAt) {
          console.log(`    - 記録が削除されている (deletedAt: ${r.deletedAt})`);
        }
      });
    } else {
      console.log(`\n  ✅ このスケジュールには訪問記録が存在しません`);
      console.log(`     → APIの動作は正しいです`);
    }
  }
}

checkBothSchedules()
  .then(() => {
    console.log('\n✅ 確認完了');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ エラーが発生しました:', error);
    process.exit(1);
  });

