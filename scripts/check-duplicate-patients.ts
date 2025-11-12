/**
 * 重複患者確認スクリプト
 */

import { db } from '../server/db';
import { patients, facilities } from '../shared/schema';
import { sql, eq } from 'drizzle-orm';

async function checkDuplicatePatients() {
  console.log('🔍 重複患者を確認中...\n');

  try {
    // テストクリニックの施設IDを取得
    const testClinic = await db.query.facilities.findFirst({
      where: eq(facilities.name, 'テストクリニック'),
    });

    if (!testClinic) {
      console.log('❌ テストクリニックが見つかりません');
      return;
    }

    console.log(`✅ テストクリニックのID: ${testClinic.id}\n`);

    // 重複患者を検索（同じ名前と生年月日）
    const duplicates = await db.execute(sql`
      SELECT 
        facility_id,
        last_name,
        first_name,
        date_of_birth,
        COUNT(*) as count,
        array_agg(id) as patient_ids,
        array_agg(patient_number) as patient_numbers,
        array_agg(created_at) as created_dates
      FROM patients
      WHERE facility_id = ${testClinic.id}
      GROUP BY facility_id, last_name, first_name, date_of_birth
      HAVING COUNT(*) > 1
      ORDER BY count DESC
    `);

    if (duplicates.rows.length === 0) {
      console.log('✅ 重複患者は見つかりませんでした\n');
    } else {
      console.log(`⚠️  重複患者が ${duplicates.rows.length} 組見つかりました:\n`);
      
      for (const row of duplicates.rows) {
        console.log(`📋 ${row.last_name} ${row.first_name} (生年月日: ${row.date_of_birth})`);
        console.log(`   重複数: ${row.count}件`);
        console.log(`   患者ID: ${JSON.stringify(row.patient_ids)}`);
        console.log(`   患者番号: ${JSON.stringify(row.patient_numbers)}`);
        console.log(`   作成日: ${JSON.stringify(row.created_dates)}`);
        console.log('');
      }
    }

    // 全患者数を確認
    const allPatients = await db.query.patients.findMany({
      where: eq(patients.facilityId, testClinic.id),
    });

    console.log(`📊 テストクリニックの全患者数: ${allPatients.length}件\n`);

    // 名前別の集計
    const nameGroups = new Map<string, number>();
    for (const patient of allPatients) {
      const key = `${patient.lastName} ${patient.firstName}`;
      nameGroups.set(key, (nameGroups.get(key) || 0) + 1);
    }

    const duplicateNames = Array.from(nameGroups.entries())
      .filter(([_, count]) => count > 1)
      .sort((a, b) => b[1] - a[1]);

    if (duplicateNames.length > 0) {
      console.log(`⚠️  同じ名前の患者が ${duplicateNames.length} 組あります:\n`);
      for (const [name, count] of duplicateNames) {
        console.log(`   ${name}: ${count}件`);
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

checkDuplicatePatients();

