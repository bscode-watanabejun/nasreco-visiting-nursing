/**
 * 問題を再現するために、スケジュールのfacilityIdを一時的に変更するスクリプト
 * 
 * ⚠️  警告: このスクリプトはデータの整合性を壊します。
 * テスト後に必ず元に戻してください。
 * 
 * 実行方法:
 *   npx tsx scripts/create-mismatch-for-reproduction.ts
 * 
 * 元に戻す方法:
 *   npx tsx scripts/restore-schedule-facility-id.ts
 */

import { db } from '../server/db';
import { facilities, schedules, nursingRecords } from '../shared/schema';
import { eq, and, isNull, gte, lte } from 'drizzle-orm';

async function createMismatch() {
  console.log('⚠️  警告: このスクリプトはデータの整合性を壊します。');
  console.log('   テスト後に必ず元に戻してください。\n');

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

    // 2. 同じ会社の他の施設を取得（異なるfacilityIdを作るため）
    const otherFacilities = await db.select()
      .from(facilities)
      .where(eq(facilities.companyId, testClinic.companyId))
      .limit(10);

    if (otherFacilities.length < 2) {
      console.error('❌ 他の施設が見つかりません。複数の施設が必要です。');
      console.log('利用可能な施設:');
      otherFacilities.forEach(f => {
        console.log(`   - ${f.name} (ID: ${f.id})`);
      });
      process.exit(1);
    }

    const otherFacility = otherFacilities.find(f => f.id !== testClinic.id);
    if (!otherFacility) {
      console.error('❌ 異なる施設が見つかりません。');
      process.exit(1);
    }

    console.log(`✅ 他の施設: ${otherFacility.name} (ID: ${otherFacility.id})\n`);

    // 3. 12月2日 23:00-00:00のスケジュールを取得
    const targetDate = new Date('2025-12-02T00:00:00+09:00');
    const nextDay = new Date('2025-12-03T00:00:00+09:00');

    const schedulesOnDate = await db.select()
      .from(schedules)
      .where(
        and(
          eq(schedules.facilityId, testClinic.id),
          gte(schedules.scheduledStartTime, targetDate),
          lte(schedules.scheduledStartTime, nextDay)
        )
      );

    const lateNightSchedule = schedulesOnDate.find(s => {
      const startTime = new Date(s.scheduledStartTime);
      const hours = startTime.getHours();
      return hours >= 23 || hours === 0;
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

    // 4. 訪問記録を確認
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

    // 5. 元のfacilityIdを保存（復元用）
    const originalFacilityId = lateNightSchedule.facilityId;
    
    // 6. スケジュールのfacilityIdを一時的に変更（注意: データの整合性を壊す）
    console.log('⚠️  スケジュールのfacilityIdを変更します...');
    await db.update(schedules)
      .set({ facilityId: otherFacility.id })
      .where(eq(schedules.id, lateNightSchedule.id));

    console.log(`✅ スケジュールのfacilityIdを変更しました:`);
    console.log(`   ${originalFacilityId} → ${otherFacility.id}\n`);

    // 7. 変更後の状態を確認
    const updatedSchedule = await db.query.schedules.findFirst({
      where: eq(schedules.id, lateNightSchedule.id),
    });

    if (updatedSchedule) {
      console.log('📊 変更後の状態:');
      console.log('─'.repeat(80));
      console.log(`スケジュールのfacilityId: ${updatedSchedule.facilityId}`);
      console.log(`記録のfacilityId: ${record.facilityId}`);
      console.log(`APIが使用するfacilityId（予想）: ${testClinic.id}`);
      console.log(`一致: ${updatedSchedule.facilityId === record.facilityId ? '✅' : '❌'}`);
      console.log(`APIのfacilityIdとスケジュールのfacilityIdの一致: ${testClinic.id === updatedSchedule.facilityId ? '✅' : '❌'}\n`);
    }

    // 8. 復元用のスクリプト情報を表示
    console.log('📝 復元方法:');
    console.log('─'.repeat(80));
    console.log('以下のコマンドで元に戻せます:');
    console.log(`   npx tsx scripts/restore-schedule-facility-id.ts`);
    console.log('');
    console.log('または、直接SQLで:');
    console.log(`   UPDATE schedules SET facility_id = '${originalFacilityId}' WHERE id = '${lateNightSchedule.id}';`);
    console.log('');

    // 9. 復元用のスクリプトを作成
    const restoreScript = `/**
 * スケジュールのfacilityIdを元に戻すスクリプト
 * 
 * 実行方法:
 *   npx tsx scripts/restore-schedule-facility-id.ts
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

    // ファイルに保存
    const fs = await import('fs');
    const path = await import('path');
    const scriptPath = path.join(process.cwd(), 'scripts', 'restore-schedule-facility-id.ts');
    fs.writeFileSync(scriptPath, restoreScript);
    console.log(`✅ 復元用スクリプトを作成しました: scripts/restore-schedule-facility-id.ts\n`);

    // 10. 再現手順の表示
    console.log('🎯 再現手順:');
    console.log('─'.repeat(80));
    console.log('1. ブラウザでスケジュール一覧画面を確認:');
    console.log(`   URL: http://localhost:5000/nasreco/test-clinic/schedule`);
    console.log(`   日付を2025年12月2日に設定`);
    console.log('');
    console.log('2. 23:00-00:00のスケジュールを確認:');
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
    console.log(`   npx tsx scripts/restore-schedule-facility-id.ts`);

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  }
}

createMismatch()
  .then(() => {
    console.log('\n✅ 設定完了');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ エラーが発生しました:', error);
    process.exit(1);
  });

