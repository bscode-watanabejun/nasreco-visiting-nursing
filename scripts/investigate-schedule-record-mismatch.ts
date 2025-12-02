/**
 * スケジュールと訪問記録の不整合調査スクリプト
 * 
 * 本番DBのデータを読み取り専用で確認します。
 * 12月1日 14:00-15:00 矢ヶ部 恭子のスケジュールと記録の関連を調査します。
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { eq, and, sql, isNull, gte, lte } from 'drizzle-orm';
import { schedules, nursingRecords, patients } from '../shared/schema';

const PROD_DB_URL = 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function investigateScheduleRecordMismatch() {
  console.log('🔍 スケジュールと訪問記録の不整合を調査します...\n');
  console.log('⚠️  本番DBへの読み取り専用アクセスです。更新操作は行いません。\n');
  
  const prodPool = new Pool({ connectionString: PROD_DB_URL });
  const prodDb = drizzle(prodPool);

  try {
    // 1. 矢ヶ部 恭子さんの患者情報を取得
    console.log('📋 1. 矢ヶ部 恭子さんの患者情報を検索...');
    const patientsList = await prodDb.select().from(patients).where(
      and(
        eq(patients.lastName, '矢ヶ部'),
        eq(patients.firstName, '恭子')
      )
    );

    if (patientsList.length === 0) {
      console.log('❌ 矢ヶ部 恭子さんの患者情報が見つかりませんでした。');
      return;
    }

    const patient = patientsList[0];
    console.log(`✅ 患者ID: ${patient.id}`);
    console.log(`   施設ID: ${patient.facilityId}`);
    console.log(`   氏名: ${patient.lastName} ${patient.firstName}\n`);

    // 2. 12月1日のスケジュールを検索（年は2024または2025を試す）
    console.log('📅 2. 12月1日のスケジュールを検索...');
    
    // 2024年と2025年の両方を試す
    const years = [2024, 2025];
    let targetSchedules: any[] = [];
    
    for (const year of years) {
      // 12月1日の範囲を広く検索（JSTで12月1日 00:00-23:59）
      const startOfDay = new Date(`${year}-12-01T00:00:00+09:00`); // JST
      const endOfDay = new Date(`${year}-12-01T23:59:59+09:00`); // JST
      
      const schedulesForYear = await prodDb.select().from(schedules).where(
        and(
          eq(schedules.patientId, patient.id),
          eq(schedules.facilityId, patient.facilityId),
          gte(schedules.scheduledStartTime, startOfDay),
          lte(schedules.scheduledStartTime, endOfDay)
        )
      );
      
      if (schedulesForYear.length > 0) {
        console.log(`   ${year}年12月1日のスケジュールが見つかりました: ${schedulesForYear.length}件`);
        targetSchedules = schedulesForYear;
        break;
      }
    }
    
    // 14:00-15:00のスケジュールをフィルタリング
    const filteredSchedules = targetSchedules.filter(s => {
      if (!s.scheduledStartTime) return false;
      const startTime = new Date(s.scheduledStartTime);
      const hours = startTime.getHours();
      return hours >= 14 && hours < 15;
    });

    if (filteredSchedules.length === 0 && targetSchedules.length > 0) {
      console.log(`   ⚠️  14:00-15:00のスケジュールは見つかりませんでしたが、12月1日のスケジュールは${targetSchedules.length}件あります。`);
      console.log('   全スケジュールを表示します...\n');
      targetSchedules.forEach(s => {
        const startTime = new Date(s.scheduledStartTime);
        console.log(`   - ID: ${s.id}`);
        console.log(`     開始時刻: ${s.scheduledStartTime} (${startTime.getHours()}:${String(startTime.getMinutes()).padStart(2, '0')})`);
        console.log(`     終了時刻: ${s.scheduledEndTime}`);
        console.log(`     担当: ${s.nurseId || s.demoStaffName || '未割当'}`);
        console.log('');
      });
      // 最初のスケジュールを使用して続行
      targetSchedules = [targetSchedules[0]];
    } else if (filteredSchedules.length > 0) {
      targetSchedules = filteredSchedules;
    }

    if (targetSchedules.length === 0) {
      console.log('❌ 12月1日のスケジュールが見つかりませんでした。');
      console.log('   12月のスケジュールを検索します...\n');
      
      // 12月全体のスケジュールを検索
      const decemberStart2024 = new Date('2024-12-01T00:00:00+09:00');
      const decemberEnd2024 = new Date('2024-12-31T23:59:59+09:00');
      const decemberStart2025 = new Date('2025-12-01T00:00:00+09:00');
      const decemberEnd2025 = new Date('2025-12-31T23:59:59+09:00');
      
      const decemberSchedules2024 = await prodDb.select().from(schedules).where(
        and(
          eq(schedules.patientId, patient.id),
          eq(schedules.facilityId, patient.facilityId),
          gte(schedules.scheduledStartTime, decemberStart2024),
          lte(schedules.scheduledStartTime, decemberEnd2024)
        )
      );
      
      const decemberSchedules2025 = await prodDb.select().from(schedules).where(
        and(
          eq(schedules.patientId, patient.id),
          eq(schedules.facilityId, patient.facilityId),
          gte(schedules.scheduledStartTime, decemberStart2025),
          lte(schedules.scheduledStartTime, decemberEnd2025)
        )
      );
      
      const allDecemberSchedules = [...decemberSchedules2024, ...decemberSchedules2025];
      console.log(`📊 12月のスケジュール数: ${allDecemberSchedules.length}`);
      allDecemberSchedules.slice(0, 10).forEach(s => {
        const startTime = new Date(s.scheduledStartTime);
        console.log(`   - ID: ${s.id}`);
        console.log(`     開始時刻: ${s.scheduledStartTime} (${startTime.getFullYear()}-${startTime.getMonth() + 1}-${startTime.getDate()} ${startTime.getHours()}:${String(startTime.getMinutes()).padStart(2, '0')})`);
        console.log(`     終了時刻: ${s.scheduledEndTime}`);
        console.log(`     担当: ${s.nurseId || s.demoStaffName || '未割当'}`);
        console.log('');
      });
      
      return;
    }

    console.log(`✅ 該当スケジュール数: ${targetSchedules.length}\n`);

    // 3. 各スケジュールの詳細と関連記録を確認
    for (const schedule of targetSchedules) {
      console.log(`📌 スケジュールID: ${schedule.id}`);
      console.log(`   開始時刻: ${schedule.scheduledStartTime}`);
      console.log(`   終了時刻: ${schedule.scheduledEndTime}`);
      console.log(`   担当看護師ID: ${schedule.nurseId || 'null'}`);
      console.log(`   デモスタッフ名: ${schedule.demoStaffName || 'null'}`);
      console.log(`   施設ID: ${schedule.facilityId}`);
      console.log(`   患者ID: ${schedule.patientId}`);
      console.log(`   ステータス: ${schedule.status}\n`);

      // 4. このスケジュールIDで記録を検索
      console.log('   🔍 このスケジュールIDで記録を検索...');
      const recordsByScheduleId = await prodDb.select().from(nursingRecords).where(
        and(
          eq(nursingRecords.scheduleId, schedule.id),
          eq(nursingRecords.facilityId, schedule.facilityId),
          isNull(nursingRecords.deletedAt)
        )
      );

      console.log(`   ✅ scheduleIdで見つかった記録数: ${recordsByScheduleId.length}`);
      recordsByScheduleId.forEach(r => {
        console.log(`      - 記録ID: ${r.id}`);
        console.log(`        訪問日: ${r.visitDate}`);
        console.log(`        記録日時: ${r.recordDate}`);
        console.log(`        実際の開始時刻: ${r.actualStartTime || 'null'}`);
        console.log(`        実際の終了時刻: ${r.actualEndTime || 'null'}`);
        console.log(`        ステータス: ${r.status}`);
      });

      // 5. 同じ日時・同じ患者の記録を検索（scheduleIdに関係なく）
      console.log('\n   🔍 同じ日時・同じ患者の記録を検索（scheduleIdに関係なく）...');
      // スケジュールの日付から訪問日を取得
      const scheduleDate = new Date(schedule.scheduledStartTime);
      const visitDateStr = `${scheduleDate.getFullYear()}-${String(scheduleDate.getMonth() + 1).padStart(2, '0')}-${String(scheduleDate.getDate()).padStart(2, '0')}`;
      
      const recordsByDateAndPatient = await prodDb.select().from(nursingRecords).where(
        and(
          eq(nursingRecords.patientId, schedule.patientId),
          eq(nursingRecords.facilityId, schedule.facilityId),
          eq(nursingRecords.visitDate, visitDateStr),
          isNull(nursingRecords.deletedAt)
        )
      );

      console.log(`   ✅ 同じ日時・同じ患者の記録数: ${recordsByDateAndPatient.length}`);
      recordsByDateAndPatient.forEach(r => {
        console.log(`      - 記録ID: ${r.id}`);
        console.log(`        scheduleId: ${r.scheduleId || 'null（スケジュール未連携）'}`);
        console.log(`        訪問日: ${r.visitDate}`);
        console.log(`        記録日時: ${r.recordDate}`);
        console.log(`        実際の開始時刻: ${r.actualStartTime || 'null'}`);
        console.log(`        実際の終了時刻: ${r.actualEndTime || 'null'}`);
        console.log(`        ステータス: ${r.status}`);
        
        // 時刻が一致するか確認
        if (r.actualStartTime && schedule.scheduledStartTime) {
          const recordStart = new Date(r.actualStartTime);
          const scheduleStart = new Date(schedule.scheduledStartTime);
          const timeDiff = Math.abs(recordStart.getTime() - scheduleStart.getTime());
          const timeDiffMinutes = timeDiff / (1000 * 60);
          
          if (timeDiffMinutes < 60) {
            console.log(`        ⚠️  時刻が近い（${timeDiffMinutes.toFixed(0)}分差）`);
            if (!r.scheduleId || r.scheduleId !== schedule.id) {
              console.log(`        ❌ scheduleIdが不一致！記録のscheduleId: ${r.scheduleId || 'null'}, スケジュールID: ${schedule.id}`);
            }
          }
        }
      });

      console.log('\n' + '─'.repeat(80) + '\n');
    }

    // 6. まとめ
    console.log('📊 調査結果のまとめ:');
    console.log('─'.repeat(80));
    console.log('問題の可能性:');
    console.log('1. 訪問記録のscheduleIdが設定されていない');
    console.log('2. 訪問記録のscheduleIdが異なるスケジュールIDを指している');
    console.log('3. 訪問記録とスケジュールのfacilityIdが一致していない');
    console.log('4. 訪問記録がdeletedAtで論理削除されている');
    console.log('5. APIのキャッシュが古い（staleTime: 5000ms）');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prodPool.end();
  }
}

investigateScheduleRecordMismatch()
  .then(() => {
    console.log('\n✅ 調査完了');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 調査中にエラーが発生しました:', error);
    process.exit(1);
  });

