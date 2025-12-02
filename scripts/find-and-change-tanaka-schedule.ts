/**
 * 田中 次郎の23:00-00:00のスケジュールを特定して変更するスクリプト
 */

import { db } from '../server/db';
import { facilities, schedules, nursingRecords, patients } from '../shared/schema';
import { eq, and, isNull, gte, lte } from 'drizzle-orm';

async function findAndChangeTanakaSchedule() {
  console.log('🔍 田中 次郎の23:00-00:00のスケジュールを特定して変更します...\n');

  try {
    // 1. テストクリニックを取得
    const testClinic = await db.query.facilities.findFirst({
      where: eq(facilities.slug, 'test-clinic'),
    });

    if (!testClinic) {
      console.error('❌ テストクリニックが見つかりません。');
      process.exit(1);
    }

    console.log(`✅ テストクリニック: ${testClinic.name} (ID: ${testClinic.id})\n`);

    // 2. 田中 次郎を検索
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

    console.log(`✅ 患者: ${tanakaPatient.lastName} ${tanakaPatient.firstName} (ID: ${tanakaPatient.id})\n`);

    // 3. 12月2日のスケジュールを検索
    const targetDate = new Date('2025-12-02T00:00:00+09:00');
    const nextDay = new Date('2025-12-03T00:00:00+09:00');

    const schedulesOnDate = await db.select()
      .from(schedules)
      .where(
        and(
          eq(schedules.patientId, tanakaPatient.id),
          gte(schedules.scheduledStartTime, targetDate),
          lte(schedules.scheduledStartTime, nextDay)
        )
      )
      .orderBy(schedules.scheduledStartTime);

    console.log(`📅 12月2日の田中 次郎のスケジュール: ${schedulesOnDate.length}件\n`);

    // 4. 23:00-00:00のスケジュールを特定
    const lateNightSchedule = schedulesOnDate.find(s => {
      const startTime = new Date(s.scheduledStartTime);
      const hours = startTime.getHours();
      const minutes = startTime.getMinutes();
      // 23:00-00:00の範囲をチェック
      return (hours === 23 && minutes === 0) || (hours === 0 && minutes === 0);
    });

    if (!lateNightSchedule) {
      console.error('❌ 23:00-00:00のスケジュールが見つかりませんでした。');
      console.log('見つかったスケジュール:');
      schedulesOnDate.forEach((s, index) => {
        const startTime = new Date(s.scheduledStartTime);
        console.log(`   ${index + 1}. ${startTime.toLocaleString('ja-JP')} - スケジュールID: ${s.id}`);
      });
      process.exit(1);
    }

    const startTime = new Date(lateNightSchedule.scheduledStartTime);
    const endTime = new Date(lateNightSchedule.scheduledEndTime);
    console.log('✅ 対象スケジュールを確認:');
    console.log(`   スケジュールID: ${lateNightSchedule.id}`);
    console.log(`   日時: ${startTime.toLocaleString('ja-JP')} - ${endTime.toLocaleString('ja-JP')}`);
    console.log(`   現在のfacilityId: ${lateNightSchedule.facilityId}\n`);

    // 5. 訪問記録を確認
    const existingRecords = await db.select()
      .from(nursingRecords)
      .where(
        and(
          eq(nursingRecords.scheduleId, lateNightSchedule.id),
          eq(nursingRecords.facilityId, testClinic.id),
          isNull(nursingRecords.deletedAt)
        )
      );

    if (existingRecords.length === 0) {
      console.error('❌ このスケジュールに紐づく訪問記録が見つかりません。');
      process.exit(1);
    }

    const record = existingRecords[0];
    console.log(`✅ 訪問記録を確認:`);
    console.log(`   記録ID: ${record.id}`);
    console.log(`   現在のfacilityId: ${record.facilityId}`);
    console.log(`   scheduleId: ${record.scheduleId}\n`);

    // 6. 他の施設を取得
    const otherFacilities = await db.select()
      .from(facilities)
      .where(eq(facilities.companyId, testClinic.companyId))
      .limit(10);

    const otherFacility = otherFacilities.find(f => f.id !== testClinic.id);
    if (!otherFacility) {
      console.error('❌ 異なる施設が見つかりません。');
      process.exit(1);
    }

    console.log(`✅ 他の施設: ${otherFacility.name} (ID: ${otherFacility.id})\n`);

    // 7. 元のfacilityIdを保存
    const originalFacilityId = lateNightSchedule.facilityId;

    // 8. スケジュールのfacilityIdを変更
    console.log('⚠️  スケジュールのfacilityIdを変更します...');
    await db.update(schedules)
      .set({ facilityId: otherFacility.id })
      .where(eq(schedules.id, lateNightSchedule.id));

    console.log(`✅ スケジュールのfacilityIdを変更しました:`);
    console.log(`   ${originalFacilityId} → ${otherFacility.id}\n`);

    // 9. 復元用のスクリプトを作成
    const restoreScript = `/**
 * スケジュールのfacilityIdを元に戻すスクリプト（田中 次郎用）
 * 
 * 実行方法:
 *   npx tsx scripts/restore-tanaka-schedule-facility-id.ts
 */

import { db } from '../server/db';
import { schedules } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function restoreFacilityId() {
  const scheduleId = '${lateNightSchedule.id}';
  const originalFacilityId = '${originalFacilityId}';

  console.log('🔄 スケジュールのfacilityIdを元に戻します...\\n');

  try {
    await db.update(schedules)
      .set({ facilityId: originalFacilityId })
      .where(eq(schedules.id, scheduleId));

    console.log(\`✅ スケジュールのfacilityIdを元に戻しました:\`);
    console.log(\`   スケジュールID: \${scheduleId}\`);
    console.log(\`   facilityId: \${originalFacilityId}\`);
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  }
}

restoreFacilityId()
  .then(() => {
    console.log('\\n✅ 復元完了');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\\n❌ エラーが発生しました:', error);
    process.exit(1);
  });
`;

    const fs = await import('fs');
    const path = await import('path');
    const scriptPath = path.join(process.cwd(), 'scripts', 'restore-tanaka-schedule-facility-id.ts');
    fs.writeFileSync(scriptPath, restoreScript);
    console.log(`✅ 復元用スクリプトを作成しました: scripts/restore-tanaka-schedule-facility-id.ts\n`);

    // 10. 再現手順の表示
    console.log('🎯 再現手順:');
    console.log('─'.repeat(80));
    console.log('1. ブラウザでスケジュール一覧画面を確認:');
    console.log(`   URL: http://localhost:5000/nasreco/test-clinic/schedule`);
    console.log(`   日付を2025年12月2日に設定`);
    console.log('');
    console.log('2. 田中 次郎の23:00-00:00のスケジュールを確認:');
    console.log(`   スケジュールID: ${lateNightSchedule.id}`);
    console.log('');
    console.log('3. 「記録作成」アイコンが表示されることを確認:');
    console.log('   （本来は「記録詳細」が表示されるべき）');
    console.log('');
    console.log('4. サーバーログを確認:');
    console.log(`   [ScheduleRecordAPI] Match: ❌ が表示されることを確認`);
    console.log(`   [ScheduleRecordAPI] ⚠️  This indicates the bug! が表示されることを確認`);
    console.log('');
    console.log('5. テスト後は必ず元に戻してください:');
    console.log(`   npx tsx scripts/restore-tanaka-schedule-facility-id.ts`);

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  }
}

findAndChangeTanakaSchedule()
  .then(() => {
    console.log('\n✅ 設定完了');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ エラーが発生しました:', error);
    process.exit(1);
  });

