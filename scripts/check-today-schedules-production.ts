/**
 * 本番環境の本日（12月2日）のスケジュールと訪問記録を確認するスクリプト
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { eq, and, isNull, sql } from 'drizzle-orm';
import * as schema from '../shared/schema';

neonConfig.webSocketConstructor = ws;

const PROD_DB_URL = 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function checkTodaySchedules() {
  console.log('🔍 本番環境の本日（12月2日）のスケジュールと訪問記録を確認します...\n');

  const prodPool = new Pool({ connectionString: PROD_DB_URL });
  const prodDb = drizzle({ client: prodPool, schema });

  try {
    // 1. 「訪問看護ステーションソレア春日部」の施設IDを取得
    const facility = await prodDb.query.facilities.findFirst({
      where: eq(schema.facilities.name, '訪問看護ステーションソレア春日部'),
    });

    if (!facility) {
      console.error('❌ 施設「訪問看護ステーションソレア春日部」が見つかりません。');
      // 施設名が異なる可能性があるので、施設一覧を表示
      const allFacilities = await prodDb.query.facilities.findMany();
      console.log('\n📋 登録されている施設一覧:');
      allFacilities.forEach(f => {
        console.log(`   - ${f.name} (ID: ${f.id})`);
      });
      process.exit(1);
    }

    console.log(`✅ 施設が見つかりました: ${facility.name} (ID: ${facility.id})\n`);

    // 2. 最近のスケジュールを確認（日付を特定するため）
    const recentSchedules = await prodDb.select()
      .from(schema.schedules)
      .where(eq(schema.schedules.facilityId, facility.id))
      .orderBy(sql`${schema.schedules.scheduledDate} DESC`)
      .limit(10);

    console.log(`📋 最近のスケジュール（最新10件）:`);
    recentSchedules.forEach((s, index) => {
      const date = new Date(s.scheduledDate);
      console.log(`   ${index + 1}. ${date.toLocaleDateString('ja-JP')} ${date.toLocaleTimeString('ja-JP')} - ステータス: ${s.status}`);
    });
    console.log('');

    // 3. 本日（12月2日）のスケジュールを取得（2024年と2025年の両方を試す）
    const targetDates = ['2024-12-02', '2025-12-02'];

    let schedules: any[] = [];
    for (const targetDate of targetDates) {
      const foundSchedules = await prodDb.select()
        .from(schema.schedules)
        .where(and(
          eq(schema.schedules.facilityId, facility.id),
          sql`DATE(${schema.schedules.scheduledDate}) = ${targetDate}`
        ));
      if (foundSchedules.length > 0) {
        schedules = foundSchedules;
        console.log(`📋 ${targetDate}のスケジュール: ${schedules.length}件\n`);
        break;
      }
    }

    if (schedules.length === 0) {
      console.log(`❌ 12月2日のスケジュールが見つかりませんでした（2024年と2025年の両方を確認しました）\n`);
      process.exit(0);
    }

    console.log(`📋 本日（12月2日）のスケジュール: ${schedules.length}件\n`);

    for (const schedule of schedules) {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`スケジュールID: ${schedule.id}`);
      console.log(`日時: ${new Date(schedule.scheduledStartTime).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);
      console.log(`ステータス: ${schedule.status}`);
      
      // 3. このスケジュールに紐づく訪問記録を検索
      const record = await prodDb.query.nursingRecords.findFirst({
        where: and(
          eq(schema.nursingRecords.scheduleId, schedule.id),
          eq(schema.nursingRecords.facilityId, facility.id),
          isNull(schema.nursingRecords.deletedAt)
        ),
      });

      if (record) {
        console.log(`✅ 訪問記録が見つかりました:`);
        console.log(`   記録ID: ${record.id}`);
        console.log(`   ステータス: ${record.status}`);
        console.log(`   scheduleId: ${record.scheduleId}`);
        console.log(`   facilityId: ${record.facilityId}`);
        console.log(`   → APIは「記録詳細」ボタンを表示すべき`);
      } else {
        console.log(`❌ 訪問記録が見つかりませんでした`);
        console.log(`   → APIは「開始」ボタンを表示する（現在の動作）`);
        
        // スケジュールIDで検索（facilityId条件なし）
        const recordsWithoutFacilityCheck = await prodDb.select()
          .from(schema.nursingRecords)
          .where(eq(schema.nursingRecords.scheduleId, schedule.id));
        
        if (recordsWithoutFacilityCheck.length > 0) {
          console.log(`\n⚠️  問題: 訪問記録は存在するが、以下の理由で見つかりません:`);
          recordsWithoutFacilityCheck.forEach(r => {
            console.log(`   - 記録ID: ${r.id}`);
            console.log(`     記録のfacilityId: ${r.facilityId}`);
            console.log(`     スケジュールのfacilityId: ${schedule.facilityId}`);
            if (r.facilityId !== schedule.facilityId) {
              console.log(`     → facilityIdが一致していません！`);
            }
            if (r.deletedAt) {
              console.log(`     → 記録が削除されています (deletedAt: ${r.deletedAt})`);
            }
          });
        }
      }
      console.log('');
    }

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prodPool.end();
  }
}

checkTodaySchedules()
  .then(() => {
    console.log('\n✅ 確認完了');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ エラーが発生しました:', error);
    process.exit(1);
  });

