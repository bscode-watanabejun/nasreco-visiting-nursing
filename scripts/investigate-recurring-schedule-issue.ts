/**
 * 繰り返しスケジュールのスケジュール連携問題を調査
 * 
 * 本番環境の「訪問看護ステーションソレア春日部」テナントの
 * 繰り返しスケジュールを調査します。
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql, eq, and, isNotNull, desc } from 'drizzle-orm';
import { schedules, facilities, users, patients } from '../shared/schema';

const PROD_DB_URL = 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function investigateRecurringScheduleIssue() {
  console.log('🔍 繰り返しスケジュールのスケジュール連携問題を調査します...\n');
  
  const prodPool = new Pool({ connectionString: PROD_DB_URL });
  const prodDb = drizzle(prodPool);

  try {
    // 1. 「訪問看護ステーションソレア春日部」の施設IDを取得
    console.log('📊 1. 「訪問看護ステーションソレア春日部」の施設情報:');
    console.log('─'.repeat(60));
    
    const allFacilities = await prodDb.select().from(facilities);
    const soreaFacility = allFacilities.find(f => 
      f.name.includes('ソレア') && f.name.includes('春日部')
    );
    
    if (!soreaFacility) {
      console.log('   ⚠️  「訪問看護ステーションソレア春日部」が見つかりませんでした。');
      console.log('      全施設名を確認します:\n');
      allFacilities.forEach((facility, index) => {
        console.log(`   ${index + 1}. ${facility.name} (ID: ${facility.id})`);
      });
      return;
    }
    
    console.log(`   施設名: ${soreaFacility.name}`);
    console.log(`   施設ID: ${soreaFacility.id}\n`);

    // 2. その施設の繰り返しスケジュールを取得
    console.log('📊 2. 繰り返しスケジュール（子スケジュール）一覧:');
    console.log('─'.repeat(60));
    
    const recurringSchedules = await prodDb
      .select({
        schedule: schedules,
        patient: patients,
      })
      .from(schedules)
      .leftJoin(patients, eq(schedules.patientId, patients.id))
      .where(and(
        eq(schedules.facilityId, soreaFacility.id),
        eq(schedules.isRecurring, true),
        isNotNull(schedules.parentScheduleId)
      ))
      .orderBy(desc(schedules.createdAt))
      .limit(20);
    
    console.log(`   繰り返しスケジュール数: ${recurringSchedules.length}件\n`);
    
    if (recurringSchedules.length === 0) {
      console.log('   ⚠️  繰り返しスケジュールが見つかりませんでした。\n');
      
      // 繰り返しスケジュールがない場合、通常のスケジュールを確認
      const allSchedules = await prodDb
        .select()
        .from(schedules)
        .where(eq(schedules.facilityId, soreaFacility.id))
        .orderBy(desc(schedules.createdAt))
        .limit(10);
      
      console.log(`   施設の全スケジュール数（最新10件）: ${allSchedules.length}件\n`);
      allSchedules.forEach((s, index) => {
        console.log(`   ${index + 1}. スケジュールID: ${s.id}`);
        console.log(`      繰り返し: ${s.isRecurring ? 'はい' : 'いいえ'}`);
        console.log(`      親スケジュールID: ${s.parentScheduleId || 'なし'}`);
        console.log(`      予定日: ${s.scheduledDate}`);
        console.log(`      状態: ${s.status}`);
        console.log('');
      });
      
      return;
    }
    
    recurringSchedules.forEach((item, index) => {
      const s = item.schedule;
      const p = item.patient;
      console.log(`   ${index + 1}. スケジュールID: ${s.id}`);
      console.log(`      親スケジュールID: ${s.parentScheduleId}`);
      console.log(`      患者: ${p?.lastName || ''} ${p?.firstName || ''} (${p?.patientNumber || ''})`);
      console.log(`      予定日: ${s.scheduledDate}`);
      console.log(`      状態: ${s.status}`);
      console.log(`      作成日時: ${s.createdAt}`);
      console.log('');
    });

    // 3. ユーザーのfacilityIdとスケジュールのfacilityIdの不一致を確認
    console.log('📊 3. ユーザーとスケジュールのfacilityIdの関係:');
    console.log('─'.repeat(60));
    
    const facilityUsers = await prodDb
      .select()
      .from(users)
      .where(eq(users.facilityId, soreaFacility.id))
      .limit(10);
    
    console.log(`   施設のユーザー数: ${facilityUsers.length}件\n`);
    
    if (facilityUsers.length > 0) {
      console.log('   ユーザー一覧:');
      facilityUsers.forEach((user, index) => {
        console.log(`   ${index + 1}. ${user.fullName} (${user.email}) - facilityId: ${user.facilityId}`);
      });
      console.log('');
      
      // 最初のユーザーで確認
      const testUserId = facilityUsers[0].id;
      const testUserFacilityId = facilityUsers[0].facilityId;
      
      console.log(`   テストユーザー: ${facilityUsers[0].fullName}`);
      console.log(`   ユーザーのfacilityId: ${testUserFacilityId}`);
      console.log(`   施設のID: ${soreaFacility.id}`);
      console.log(`   一致: ${testUserFacilityId === soreaFacility.id ? '✅' : '❌'}\n`);
      
      // ユーザーのfacilityIdと異なるスケジュールを確認
      const mismatchedSchedules = recurringSchedules.filter(
        item => item.schedule.facilityId !== testUserFacilityId
      );
      
      if (mismatchedSchedules.length > 0) {
        console.log(`   ⚠️  ユーザーのfacilityIdと異なるスケジュール: ${mismatchedSchedules.length}件\n`);
        mismatchedSchedules.forEach((item, index) => {
          console.log(`   ${index + 1}. スケジュールID: ${item.schedule.id}`);
          console.log(`      スケジュールのfacilityId: ${item.schedule.facilityId}`);
          console.log(`      ユーザーのfacilityId: ${testUserFacilityId}`);
        });
        console.log('');
      } else {
        console.log('   ✅ 全てのスケジュールのfacilityIdがユーザーのfacilityIdと一致しています。\n');
      }
    }

    // 4. 最近作成された繰り返しスケジュールの詳細確認
    console.log('📊 4. 最近作成された繰り返しスケジュールの詳細:');
    console.log('─'.repeat(60));
    
    const recentSchedules = recurringSchedules.slice(0, 5);
    for (const item of recentSchedules) {
      const s = item.schedule;
      console.log(`   スケジュールID: ${s.id}`);
      console.log(`   施設ID: ${s.facilityId}`);
      console.log(`   患者ID: ${s.patientId}`);
      console.log(`   親スケジュールID: ${s.parentScheduleId}`);
      console.log(`   繰り返しパターン: ${s.recurrencePattern}`);
      console.log(`   作成日時: ${s.createdAt}`);
      console.log('');
    }

    // 5. スケジュール取得APIで問題が発生する可能性のあるスケジュールを確認
    console.log('📊 5. API取得時の問題可能性チェック:');
    console.log('─'.repeat(60));
    
    // ランダムに1つのスケジュールを選んで、そのスケジュールが取得できるか確認
    if (recurringSchedules.length > 0) {
      const testSchedule = recurringSchedules[0].schedule;
      console.log(`   テストスケジュールID: ${testSchedule.id}`);
      console.log(`   施設ID: ${testSchedule.facilityId}`);
      
      // 同じfacilityIdのユーザーが存在するか確認
      const usersWithSameFacility = await prodDb
        .select()
        .from(users)
        .where(eq(users.facilityId, testSchedule.facilityId))
        .limit(1);
      
      if (usersWithSameFacility.length > 0) {
        console.log(`   ✅ 同じfacilityIdのユーザーが存在します: ${usersWithSameFacility[0].fullName}`);
        console.log(`   ユーザーのfacilityId: ${usersWithSameFacility[0].facilityId}`);
        console.log(`   スケジュールのfacilityId: ${testSchedule.facilityId}`);
        console.log(`   一致: ${usersWithSameFacility[0].facilityId === testSchedule.facilityId ? '✅' : '❌'}\n`);
      } else {
        console.log(`   ⚠️  同じfacilityIdのユーザーが見つかりませんでした。\n`);
      }
    }

    console.log('─'.repeat(60));
    console.log('✅ 調査が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prodPool.end();
  }
}

investigateRecurringScheduleIssue()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('処理中にエラーが発生しました:', error);
    process.exit(1);
  });

