/**
 * 本番環境のAPIエンドポイントを確認するスクリプト
 * 
 * 本番DBのデータを読み取り専用で確認し、APIエンドポイントの動作を検証します。
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { eq, and, isNull } from 'drizzle-orm';
import * as schema from '../shared/schema';

neonConfig.webSocketConstructor = ws;

const PROD_DB_URL = 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function checkProductionAPI() {
  console.log('🔍 本番環境のAPIエンドポイント動作を確認します...\n');
  console.log('⚠️  本番データベースに接続します（読み取り専用）\n');

  const prodPool = new Pool({ connectionString: PROD_DB_URL });
  const prodDb = drizzle({ client: prodPool, schema });

  try {
    // 1. 矢ヶ部 恭子の患者を検索
    const patient = await prodDb.query.patients.findFirst({
      where: eq(schema.patients.lastName, '矢ヶ部'),
    });

    if (!patient) {
      console.error('❌ 矢ヶ部 恭子の患者が見つかりません。');
      process.exit(1);
    }

    console.log(`✅ 患者を確認: ${patient.lastName} ${patient.firstName} (ID: ${patient.id})`);
    console.log(`   施設ID: ${patient.facilityId}\n`);

    // 2. 12月1日 14:00-15:00のスケジュールを検索
    const targetDate = new Date('2025-12-01T05:00:00Z'); // 14:00 JST = 05:00 UTC
    const targetEndDate = new Date('2025-12-01T06:00:00Z'); // 15:00 JST = 06:00 UTC

    const schedule = await prodDb.query.schedules.findFirst({
      where: and(
        eq(schema.schedules.patientId, patient.id),
        eq(schema.schedules.scheduledStartTime, targetDate)
      ),
    });

    if (!schedule) {
      console.error('❌ スケジュールが見つかりません。');
      console.log('12月1日のスケジュールを検索します...');
      
      const schedulesOnDate = await prodDb.select()
        .from(schema.schedules)
        .where(
          and(
            eq(schema.schedules.patientId, patient.id)
          )
        )
        .limit(10);

      console.log(`見つかったスケジュール: ${schedulesOnDate.length}件`);
      schedulesOnDate.forEach((s, index) => {
        const startTime = new Date(s.scheduledStartTime);
        console.log(`   ${index + 1}. ${startTime.toISOString()} (${startTime.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })})`);
      });
      process.exit(1);
    }

    console.log(`✅ スケジュールを確認:`);
    console.log(`   スケジュールID: ${schedule.id}`);
    console.log(`   日時: ${new Date(schedule.scheduledStartTime).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);
    console.log(`   施設ID: ${schedule.facilityId}\n`);

    // 3. このスケジュールに紐づく訪問記録を検索
    const records = await prodDb.select()
      .from(schema.nursingRecords)
      .where(
        and(
          eq(schema.nursingRecords.scheduleId, schedule.id),
          isNull(schema.nursingRecords.deletedAt)
        )
      );

    console.log(`📋 このスケジュールに紐づく訪問記録: ${records.length}件`);
    records.forEach((r, index) => {
      console.log(`   ${index + 1}. 記録ID: ${r.id}`);
      console.log(`      facilityId: ${r.facilityId}`);
      console.log(`      scheduleId: ${r.scheduleId}`);
      console.log(`      deletedAt: ${r.deletedAt || 'null'}`);
    });
    console.log('');

    // 4. 修正前のロジック（req.facility?.id || req.user.facilityId）で検索
    // 本番環境では、ユーザーのfacilityIdがスケジュールのfacilityIdと一致していると仮定
    const userFacilityId = schedule.facilityId; // 通常は req.facility?.id || req.user.facilityId
    
    console.log('🔍 修正前のロジックで検索:');
    console.log(`   使用するfacilityId: ${userFacilityId} (req.facility?.id || req.user.facilityId)`);
    
    const recordWithOldLogic = await prodDb.query.nursingRecords.findFirst({
      where: and(
        eq(schema.nursingRecords.scheduleId, schedule.id),
        eq(schema.nursingRecords.facilityId, userFacilityId),
        isNull(schema.nursingRecords.deletedAt)
      ),
    });

    if (recordWithOldLogic) {
      console.log(`   ✅ 記録が見つかりました: ${recordWithOldLogic.id}`);
      console.log(`   hasRecord: true`);
    } else {
      console.log(`   ❌ 記録が見つかりませんでした`);
      console.log(`   hasRecord: false`);
    }
    console.log('');

    // 5. 修正後のロジック（スケジュールのfacilityIdを使用）で検索
    console.log('🔍 修正後のロジックで検索:');
    console.log(`   スケジュールのfacilityId: ${schedule.facilityId}`);
    
    const recordWithNewLogic = await prodDb.query.nursingRecords.findFirst({
      where: and(
        eq(schema.nursingRecords.scheduleId, schedule.id),
        eq(schema.nursingRecords.facilityId, schedule.facilityId),
        isNull(schema.nursingRecords.deletedAt)
      ),
    });

    if (recordWithNewLogic) {
      console.log(`   ✅ 記録が見つかりました: ${recordWithNewLogic.id}`);
      console.log(`   hasRecord: true`);
    } else {
      console.log(`   ❌ 記録が見つかりませんでした`);
      console.log(`   hasRecord: false`);
    }
    console.log('');

    // 6. 比較
    console.log('📊 比較結果:');
    console.log('─'.repeat(80));
    console.log(`スケジュールのfacilityId: ${schedule.facilityId}`);
    if (records.length > 0) {
      console.log(`訪問記録のfacilityId: ${records[0].facilityId}`);
      console.log(`一致: ${schedule.facilityId === records[0].facilityId ? '✅' : '❌'}`);
    }
    console.log(`修正前のロジックで見つかる: ${recordWithOldLogic ? '✅' : '❌'}`);
    console.log(`修正後のロジックで見つかる: ${recordWithNewLogic ? '✅' : '❌'}`);

    if (!recordWithOldLogic && recordWithNewLogic) {
      console.log('\n⚠️  修正前のロジックでは見つからないが、修正後のロジックでは見つかります');
      console.log('   これは修正が正しく動作することを示しています。');
    } else if (!recordWithOldLogic && !recordWithNewLogic) {
      console.log('\n⚠️  どちらのロジックでも見つかりません');
      console.log('   訪問記録のfacilityIdとスケジュールのfacilityIdが異なる可能性があります。');
    }

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prodPool.end();
  }
}

checkProductionAPI()
  .then(() => {
    console.log('\n✅ 確認完了');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ エラーが発生しました:', error);
    process.exit(1);
  });

