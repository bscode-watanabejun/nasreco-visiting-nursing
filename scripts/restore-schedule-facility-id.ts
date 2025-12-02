/**
 * スケジュールのfacilityIdを元に戻すスクリプト
 * 
 * 実行方法:
 *   npx tsx scripts/restore-schedule-facility-id.ts
 */

import { db } from '../server/db';
import { schedules } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function restoreFacilityId() {
  const scheduleId = '5bb624ae-8065-4c0f-83a5-f5fadb99f4ed';
  const originalFacilityId = 'fac-osaka-branch';

  console.log('🔄 スケジュールのfacilityIdを元に戻します...\n');

  try {
    await db.update(schedules)
      .set({ facilityId: originalFacilityId })
      .where(eq(schedules.id, scheduleId));

    console.log(`✅ スケジュールのfacilityIdを元に戻しました:`);
    console.log(`   スケジュールID: ${scheduleId}`);
    console.log(`   facilityId: ${originalFacilityId}`);
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  }
}

restoreFacilityId()
  .then(() => {
    console.log('\n✅ 復元完了');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ エラーが発生しました:', error);
    process.exit(1);
  });
