/**
 * スケジュール記録APIの動作確認スクリプト
 * 
 * 本番DBで直接APIロジックを再現して確認します。
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { eq, and, isNull } from 'drizzle-orm';
import { schedules, nursingRecords } from '../shared/schema';

const PROD_DB_URL = 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function testScheduleRecordAPI() {
  console.log('🔍 スケジュール記録APIの動作確認\n');
  console.log('⚠️  本番DBへの読み取り専用アクセスです。更新操作は行いません。\n');
  
  const prodPool = new Pool({ connectionString: PROD_DB_URL });
  const prodDb = drizzle(prodPool);

  try {
    const scheduleId = '5f60a435-a78a-4ce5-ad71-167aa2c9c6c4';
    const expectedFacilityId = '2d4562ce-1aae-4d79-80ec-0b128654e466'; // ソレア春日部の施設ID
    
    console.log(`📋 テスト対象:`);
    console.log(`   スケジュールID: ${scheduleId}`);
    console.log(`   期待される施設ID: ${expectedFacilityId}\n`);

    // 1. スケジュールの情報を取得
    console.log('1️⃣ スケジュール情報を取得...');
    const scheduleList = await prodDb.select().from(schedules).where(
      eq(schedules.id, scheduleId)
    );
    
    if (scheduleList.length === 0) {
      console.log('❌ スケジュールが見つかりませんでした。');
      return;
    }
    
    const schedule = scheduleList[0];
    console.log(`   ✅ スケジュールが見つかりました`);
    console.log(`      スケジュールのfacilityId: ${schedule.facilityId}`);
    console.log(`      期待されるfacilityId: ${expectedFacilityId}`);
    console.log(`      一致: ${schedule.facilityId === expectedFacilityId ? '✅' : '❌'}\n`);

    // 2. APIロジックを再現: スケジュールのfacilityIdで検索（APIの実装通り）
    console.log('2️⃣ APIロジック再現: スケジュールのfacilityIdで記録を検索...');
    const recordWithScheduleFacilityId = await prodDb.select().from(nursingRecords).where(
      and(
        eq(nursingRecords.scheduleId, scheduleId),
        eq(nursingRecords.facilityId, schedule.facilityId), // スケジュールのfacilityIdを使用
        isNull(nursingRecords.deletedAt)
      )
    );
    
    console.log(`   ✅ 検索結果: ${recordWithScheduleFacilityId.length}件`);
    if (recordWithScheduleFacilityId.length > 0) {
      const record = recordWithScheduleFacilityId[0];
      console.log(`      記録ID: ${record.id}`);
      console.log(`      記録のfacilityId: ${record.facilityId}`);
      console.log(`      記録のscheduleId: ${record.scheduleId}`);
      console.log(`      一致: ${record.scheduleId === scheduleId ? '✅' : '❌'}`);
    } else {
      console.log(`      ❌ 記録が見つかりませんでした`);
    }
    console.log('');

    // 3. 異なるfacilityIdで検索した場合（APIでfacilityIdが間違っている場合）
    console.log('3️⃣ 異なるfacilityIdで検索した場合のテスト...');
    const wrongFacilityIds = [
      'wrong-facility-id-1',
      'wrong-facility-id-2',
    ];
    
    for (const wrongFacilityId of wrongFacilityIds) {
      const recordWithWrongFacilityId = await prodDb.select().from(nursingRecords).where(
        and(
          eq(nursingRecords.scheduleId, scheduleId),
          eq(nursingRecords.facilityId, wrongFacilityId),
          isNull(nursingRecords.deletedAt)
        )
      );
      console.log(`   facilityId: ${wrongFacilityId} → 検索結果: ${recordWithWrongFacilityId.length}件`);
    }
    console.log('');

    // 4. scheduleIdのみで検索（facilityId条件なし）
    console.log('4️⃣ scheduleIdのみで検索（facilityId条件なし）...');
    const recordWithoutFacilityId = await prodDb.select().from(nursingRecords).where(
      and(
        eq(nursingRecords.scheduleId, scheduleId),
        isNull(nursingRecords.deletedAt)
      )
    );
    
    console.log(`   ✅ 検索結果: ${recordWithoutFacilityId.length}件`);
    if (recordWithoutFacilityId.length > 0) {
      const record = recordWithoutFacilityId[0];
      console.log(`      記録ID: ${record.id}`);
      console.log(`      記録のfacilityId: ${record.facilityId}`);
      console.log(`      スケジュールのfacilityId: ${schedule.facilityId}`);
      console.log(`      facilityId一致: ${record.facilityId === schedule.facilityId ? '✅' : '❌'}`);
      
      if (record.facilityId !== schedule.facilityId) {
        console.log(`      ⚠️  警告: 記録のfacilityIdとスケジュールのfacilityIdが一致しません！`);
        console.log(`         これが原因でAPIが記録を見つけられない可能性があります。`);
      }
    }
    console.log('');

    // 5. まとめ
    console.log('📊 まとめ:');
    console.log('─'.repeat(80));
    if (recordWithScheduleFacilityId.length > 0) {
      console.log('✅ スケジュールのfacilityIdで検索した場合: 記録が見つかる');
    } else {
      console.log('❌ スケジュールのfacilityIdで検索した場合: 記録が見つからない');
    }
    
    if (recordWithoutFacilityId.length > 0) {
      const record = recordWithoutFacilityId[0];
      if (record.facilityId !== schedule.facilityId) {
        console.log('⚠️  問題発見: 記録のfacilityIdとスケジュールのfacilityIdが一致していません');
        console.log(`   記録のfacilityId: ${record.facilityId}`);
        console.log(`   スケジュールのfacilityId: ${schedule.facilityId}`);
        console.log(`   APIエンドポイントがreq.facility?.id || req.user.facilityIdを使用している場合、`);
        console.log(`   これがスケジュールのfacilityIdと異なると、記録が見つかりません。`);
      }
    }

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prodPool.end();
  }
}

testScheduleRecordAPI()
  .then(() => {
    console.log('\n✅ 確認完了');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 確認中にエラーが発生しました:', error);
    process.exit(1);
  });

