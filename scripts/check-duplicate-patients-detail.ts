/**
 * 重複患者詳細確認スクリプト
 */

import { db } from '../server/db';
import { patients, facilities } from '../shared/schema';
import { sql, eq, or, and } from 'drizzle-orm';

async function checkDuplicatePatientsDetail() {
  console.log('🔍 重複患者の詳細を確認中...\n');

  try {
    // テストクリニックの施設IDを取得
    const testClinic = await db.query.facilities.findFirst({
      where: eq(facilities.name, 'テストクリニック'),
    });

    if (!testClinic) {
      console.log('❌ テストクリニックが見つかりません');
      return;
    }

    // 佐藤 花子と小林 花音の詳細を取得
    const targetNames = [
      { lastName: '佐藤', firstName: '花子' },
      { lastName: '小林', firstName: '花音' },
    ];

    for (const target of targetNames) {
      console.log(`\n📋 ${target.lastName} ${target.firstName} の詳細:\n`);
      
      const matchingPatients = await db.query.patients.findMany({
        where: and(
          eq(patients.facilityId, testClinic.id),
          eq(patients.lastName, target.lastName),
          eq(patients.firstName, target.firstName)
        ),
        orderBy: (patients, { asc }) => [asc(patients.createdAt)],
      });

      if (matchingPatients.length === 0) {
        console.log('   見つかりませんでした');
        continue;
      }

      matchingPatients.forEach((patient, index) => {
        console.log(`   [${index + 1}] 患者ID: ${patient.id}`);
        console.log(`       患者番号: ${patient.patientNumber}`);
        console.log(`       生年月日: ${patient.dateOfBirth}`);
        console.log(`       性別: ${patient.gender}`);
        console.log(`       作成日: ${patient.createdAt}`);
        console.log(`       更新日: ${patient.updatedAt}`);
        console.log(`       アクティブ: ${patient.isActive}`);
        console.log('');
      });
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

checkDuplicatePatientsDetail();

