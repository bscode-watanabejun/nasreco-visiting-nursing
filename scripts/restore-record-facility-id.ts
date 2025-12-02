/**
 * 訪問記録のfacilityIdを元に戻すスクリプト
 * 
 * 実行方法:
 *   npx tsx scripts/restore-record-facility-id.ts
 */

import { db } from '../server/db';
import { nursingRecords } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function restoreFacilityId() {
  const recordId = '5fb6b65e-47d0-4534-8ac0-9c3abae69826';
  const originalFacilityId = 'fac-osaka-branch';

  console.log('🔄 訪問記録のfacilityIdを元に戻します...\n');

  try {
    await db.update(nursingRecords)
      .set({ facilityId: originalFacilityId })
      .where(eq(nursingRecords.id, recordId));

    console.log(`✅ 訪問記録のfacilityIdを元に戻しました:`);
    console.log(`   記録ID: ${recordId}`);
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
