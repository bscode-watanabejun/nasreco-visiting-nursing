/**
 * テストクリニック環境でスケジュール・記録不整合を再現するスクリプト
 * 
 * 鈴木一郎（manager）でログインして確認できるように、
 * 既存のスケジュールと記録を修正して再現データを作成します。
 * 
 * 実行方法:
 *   npx tsx scripts/reproduce-schedule-record-mismatch-test-clinic.ts
 */

import { db } from '../server/db';
import { facilities, users, patients, schedules, nursingRecords } from '../shared/schema';
import { eq, and, isNull, desc } from 'drizzle-orm';

// 開発環境の確認
const DEV_DB_HOST = 'ep-polished-scene-a5twqv82';
const PROD_DB_HOST = 'ep-still-water-aeb6ynp2';

function checkDatabaseUrl() {
  const dbUrl = process.env.DATABASE_URL || '';
  
  if (!dbUrl) {
    console.error('❌ DATABASE_URL環境変数が設定されていません。');
    process.exit(1);
  }
  
  if (dbUrl.includes(PROD_DB_HOST)) {
    console.error('❌ エラー: 本番環境のデータベースURLが検出されました！');
    console.error(`   検出されたホスト: ${PROD_DB_HOST}`);
    console.error('   開発環境のDATABASE_URLを設定してください。');
    process.exit(1);
  }
  
  if (!dbUrl.includes(DEV_DB_HOST)) {
    console.warn('⚠️  警告: 開発環境のデータベースURLを確認できませんでした。');
    console.warn(`   検出されたURL: ${dbUrl.substring(0, 100)}...`);
    console.warn('   続行しますが、開発環境であることを確認してください。');
  } else {
    console.log('✅ 開発環境のデータベースURLを確認しました。');
  }
  console.log('');
}

async function reproduceIssue() {
  // データベースURLの確認
  checkDatabaseUrl();
  
  console.log('🔍 テストクリニック環境で不整合を再現するデータを準備します...\n');

  try {
    // 1. テストクリニックの施設を取得
    const testClinic = await db.query.facilities.findFirst({
      where: eq(facilities.slug, 'test-clinic'),
    });

    if (!testClinic) {
      console.error('❌ テストクリニック (test-clinic) が見つかりません。');
      console.log('先に seed-database.ts を実行してください。');
      process.exit(1);
    }

    console.log(`✅ テストクリニック: ${testClinic.name} (ID: ${testClinic.id})\n`);

    // 2. 鈴木一郎のユーザーを取得
    const suzukiUser = await db.query.users.findFirst({
      where: and(
        eq(users.facilityId, testClinic.id),
        eq(users.fullName, '鈴木 一郎')
      ),
    });

    if (!suzukiUser) {
      console.error('❌ 鈴木一郎が見つかりません。');
      console.log('先に seed-test-clinic.ts を実行してください。');
      process.exit(1);
    }

    console.log(`✅ ユーザー: ${suzukiUser.fullName} (username: ${suzukiUser.username}, role: ${suzukiUser.role})`);
    console.log(`   ユーザーID: ${suzukiUser.id}`);
    console.log(`   ユーザーのfacilityId: ${suzukiUser.facilityId}`);
    console.log(`   施設のID: ${testClinic.id}`);
    console.log(`   一致: ${suzukiUser.facilityId === testClinic.id ? '✅' : '❌'}\n`);

    // 3. テストクリニックの患者を取得（最初の1人）
    const testPatient = await db.query.patients.findFirst({
      where: eq(patients.facilityId, testClinic.id),
    });

    if (!testPatient) {
      console.error('❌ テストクリニックの患者が見つかりません。');
      console.log('先に seed-test-clinic.ts を実行してください。');
      process.exit(1);
    }

    console.log(`✅ 患者: ${testPatient.lastName} ${testPatient.firstName} (ID: ${testPatient.id})\n`);

    // 4. 既存のスケジュールを取得（最新の1件）
    // 注意: schedulesテーブルにはdeletedAtフィールドがないため、isNullチェックは不要
    const existingSchedules = await db.select()
      .from(schedules)
      .where(
        and(
          eq(schedules.facilityId, testClinic.id),
          eq(schedules.patientId, testPatient.id)
        )
      )
      .orderBy(desc(schedules.scheduledStartTime))
      .limit(1);

    let targetSchedule;
    if (existingSchedules.length > 0) {
      targetSchedule = existingSchedules[0];
      console.log(`✅ 既存のスケジュールを使用:`);
      console.log(`   スケジュールID: ${targetSchedule.id}`);
      console.log(`   日時: ${new Date(targetSchedule.scheduledStartTime).toLocaleString('ja-JP')}`);
      console.log(`   施設ID: ${targetSchedule.facilityId}`);
      console.log(`   ステータス: ${targetSchedule.status}\n`);
    } else {
      // スケジュールがない場合は作成
      const today = new Date();
      const scheduledStartTime = new Date(today);
      scheduledStartTime.setHours(14, 0, 0, 0); // 14:00
      const scheduledEndTime = new Date(today);
      scheduledEndTime.setHours(15, 0, 0, 0); // 15:00

      const [newSchedule] = await db.insert(schedules).values({
        facilityId: testClinic.id,
        patientId: testPatient.id,
        nurseId: suzukiUser.id,
        scheduledDate: scheduledStartTime,
        scheduledStartTime: scheduledStartTime,
        scheduledEndTime: scheduledEndTime,
        duration: 60,
        purpose: '再現テスト用スケジュール',
        status: 'scheduled',
      }).returning();

      targetSchedule = newSchedule;
      console.log(`✅ 新しいスケジュールを作成:`);
      console.log(`   スケジュールID: ${targetSchedule.id}`);
      console.log(`   日時: ${scheduledStartTime.toLocaleString('ja-JP')}`);
      console.log(`   施設ID: ${targetSchedule.facilityId}\n`);
    }

    // 5. このスケジュールに紐づく訪問記録を確認
    const existingRecords = await db.select()
      .from(nursingRecords)
      .where(
        and(
          eq(nursingRecords.scheduleId, targetSchedule.id),
          eq(nursingRecords.facilityId, testClinic.id),
          isNull(nursingRecords.deletedAt) // nursingRecordsにはdeletedAtがある
        )
      );

    let targetRecord;
    if (existingRecords.length > 0) {
      targetRecord = existingRecords[0];
      console.log(`✅ 既存の訪問記録を使用:`);
      console.log(`   記録ID: ${targetRecord.id}`);
      console.log(`   scheduleId: ${targetRecord.scheduleId}`);
      console.log(`   施設ID: ${targetRecord.facilityId}`);
      console.log(`   訪問日: ${targetRecord.visitDate}`);
      console.log(`   ステータス: ${targetRecord.status}\n`);
    } else {
      // 訪問記録がない場合は作成
      const visitDate = new Date(targetSchedule.scheduledStartTime).toISOString().split('T')[0];

      const [newRecord] = await db.insert(nursingRecords).values({
        facilityId: testClinic.id,
        patientId: testPatient.id,
        nurseId: suzukiUser.id,
        scheduleId: targetSchedule.id, // ✅ スケジュールIDを設定
        recordType: 'general_care',
        recordDate: new Date(),
        visitDate: visitDate,
        status: 'draft',
        title: `訪問記録 - ${visitDate}`,
        content: '再現テスト用の訪問記録',
        actualStartTime: new Date(targetSchedule.scheduledStartTime),
        actualEndTime: new Date(targetSchedule.scheduledEndTime),
      }).returning();

      targetRecord = newRecord;
      console.log(`✅ 新しい訪問記録を作成:`);
      console.log(`   記録ID: ${targetRecord.id}`);
      console.log(`   scheduleId: ${targetRecord.scheduleId}`);
      console.log(`   施設ID: ${targetRecord.facilityId}`);
      console.log(`   訪問日: ${visitDate}\n`);
    }

    // 6. データの整合性確認
    console.log('📊 データの整合性確認:');
    console.log('─'.repeat(80));
    console.log(`スケジュールID: ${targetSchedule.id}`);
    console.log(`スケジュールのfacilityId: ${targetSchedule.facilityId}`);
    console.log(`記録ID: ${targetRecord.id}`);
    console.log(`記録のfacilityId: ${targetRecord.facilityId}`);
    console.log(`記録のscheduleId: ${targetRecord.scheduleId}`);
    console.log(`一致確認:`);
    console.log(`  - scheduleId: ${targetSchedule.id === targetRecord.scheduleId ? '✅' : '❌'}`);
    console.log(`  - facilityId: ${targetSchedule.facilityId === targetRecord.facilityId ? '✅' : '❌'}\n`);

    // 7. APIエンドポイントの動作確認（データベース上で）
    console.log('🔍 APIエンドポイントの動作確認（データベース上で）:');
    console.log('─'.repeat(80));
    
    // APIロジックを再現: req.facility?.id || req.user.facilityId
    const apiFacilityId = testClinic.id; // 通常は req.facility?.id || req.user.facilityId
    
    console.log(`APIが使用するfacilityId: ${apiFacilityId}`);
    console.log(`スケジュールのfacilityId: ${targetSchedule.facilityId}`);
    console.log(`記録のfacilityId: ${targetRecord.facilityId}`);
    console.log(`APIのfacilityIdとスケジュールのfacilityIdの一致: ${apiFacilityId === targetSchedule.facilityId ? '✅' : '❌'}`);
    console.log(`APIのfacilityIdと記録のfacilityIdの一致: ${apiFacilityId === targetRecord.facilityId ? '✅' : '❌'}\n`);
    
    const recordFoundByApi = await db.query.nursingRecords.findFirst({
      where: and(
        eq(nursingRecords.scheduleId, targetSchedule.id),
        eq(nursingRecords.facilityId, apiFacilityId),
        isNull(nursingRecords.deletedAt)
      ),
    });

    if (recordFoundByApi) {
      console.log(`✅ APIで記録が見つかりました:`);
      console.log(`   記録ID: ${recordFoundByApi.id}`);
      console.log(`   hasRecord: true`);
      console.log(`   ⚠️  この場合、問題は再現されません。`);
      console.log(`   実際のAPIリクエストで req.facility?.id が異なる可能性があります。`);
    } else {
      console.log(`❌ APIで記録が見つかりませんでした:`);
      console.log(`   hasRecord: false`);
      console.log(`   ⚠️  これが問題の原因です！`);
      console.log(`   APIが使用するfacilityId (${apiFacilityId}) で検索したが、`);
      console.log(`   記録のfacilityId (${targetRecord.facilityId}) と一致しない可能性があります。`);
    }
    console.log('');

    // 8. 再現手順の表示
    console.log('🎯 再現手順:');
    console.log('─'.repeat(80));
    console.log('1. テストクリニックのユーザー「鈴木一郎」でログイン:');
    console.log(`   URL: http://localhost:5000/nasreco/test-clinic/`);
    console.log(`   ユーザー名: ${suzukiUser.username}`);
    console.log(`   パスワード: password123`);
    console.log('');
    console.log('2. スケジュール一覧画面にアクセス:');
    console.log(`   URL: http://localhost:5000/nasreco/test-clinic/schedule`);
    console.log('');
    console.log('3. 作成/修正したスケジュールを確認:');
    console.log(`   スケジュールID: ${targetSchedule.id}`);
    console.log(`   日時: ${new Date(targetSchedule.scheduledStartTime).toLocaleString('ja-JP')}`);
    console.log(`   患者: ${testPatient.lastName} ${testPatient.firstName}`);
    console.log('');
    console.log('4. 「記録作成」アイコンが表示されるか確認:');
    console.log('   （本来は「記録詳細」が表示されるべき）');
    console.log('');
    console.log('5. ブラウザの開発者ツールでAPIリクエストを確認:');
    console.log(`   GET /api/schedules/${targetSchedule.id}/nursing-record`);
    console.log(`   レスポンスの hasRecord が false になっているか確認`);
    console.log('');
    console.log('6. サーバーログを確認:');
    console.log('   APIエンドポイントで使用されているfacilityIdを確認');
    console.log('   （req.facility?.id または req.user.facilityId）');
    console.log('');
    console.log('7. 問題が再現しない場合:');
    console.log('   サーバーログで req.facility?.id と req.user.facilityId の値を確認');
    console.log('   これらがスケジュールのfacilityIdと異なる場合、問題が再現します');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  }
}

reproduceIssue()
  .then(() => {
    console.log('\n✅ 再現データの準備が完了しました');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ エラーが発生しました:', error);
    process.exit(1);
  });

