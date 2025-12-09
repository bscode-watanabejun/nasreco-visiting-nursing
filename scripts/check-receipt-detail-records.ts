/**
 * レセプト詳細画面で表示される訪問記録を確認するスクリプト（読み取り専用）
 * 
 * ⚠️ 本番DBへの読み取り専用アクセスのみ。データの変更は一切行いません。
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from '../shared/schema';
import { eq, and, isNull, gte, lte, inArray } from 'drizzle-orm';

const { nursingRecords, patients, monthlyReceipts } = schema;

// WebSocket設定
neonConfig.webSocketConstructor = ws;

async function checkReceiptDetailRecords() {
  // 本番環境のデータベースURLを使用（読み取り専用）
  const dbUrl = process.env.PRODUCTION_DB_URL;
  if (!dbUrl) {
    console.error('❌ PRODUCTION_DB_URL環境変数が設定されていません');
    console.error('   本番環境のデータベースURLを設定してください');
    process.exit(1);
  }

  console.log('⚠️  本番データベースに接続します（読み取り専用）\n');

  const pool = new Pool({ connectionString: dbUrl });
  const db = drizzle({ client: pool, schema });

  try {
    // 1. 患者「祓川 チカ」を検索
    console.log('📋 1. 患者「祓川 チカ」を検索中...');
    const allPatients = await db.query.patients.findMany({});
    const patient = allPatients.find(p => 
      p.lastName?.includes('祓川') && p.firstName?.includes('チカ')
    );

    if (!patient) {
      console.error('❌ 患者「祓川 チカ」が見つかりませんでした');
      process.exit(1);
    }

    console.log(`✅ 患者ID: ${patient.id}`);
    console.log(`   氏名: ${patient.lastName} ${patient.firstName}`);
    console.log(`   施設ID: ${patient.facilityId}`);
    console.log('');

    // 2. 2025年11月のレセプトを検索
    console.log('📋 2. 2025年11月のレセプトを検索中...');
    const receipts = await db.query.monthlyReceipts.findMany({
      where: and(
        eq(monthlyReceipts.patientId, patient.id),
        eq(monthlyReceipts.facilityId, patient.facilityId),
        eq(monthlyReceipts.targetYear, 2025),
        eq(monthlyReceipts.targetMonth, 11)
      ),
      orderBy: (monthlyReceipts, { desc }) => [desc(monthlyReceipts.createdAt)],
    });

    if (receipts.length === 0) {
      console.error('❌ 2025年11月のレセプトが見つかりませんでした');
      process.exit(1);
    }

    const receipt = receipts[0];
    console.log(`✅ レセプトID: ${receipt.id}`);
    console.log(`   対象年月: ${receipt.targetYear}年${receipt.targetMonth}月`);
    console.log(`   保険種別: ${receipt.insuranceType}`);
    console.log('');

    // 3. レセプト詳細画面のAPIと同じ条件で訪問記録を取得（削除フラグチェックなし）
    console.log('📋 3. レセプト詳細画面のAPIと同じ条件で訪問記録を取得（削除フラグチェックなし）:');
    console.log('='.repeat(80));
    const startDate = new Date(2025, 10, 1); // 2025年11月1日
    const endDate = new Date(2025, 11, 0); // 2025年11月30日

    const relatedRecordsWithoutDeletedCheck = await db.select({
      record: nursingRecords,
    })
      .from(nursingRecords)
      .where(and(
        eq(nursingRecords.patientId, patient.id),
        eq(nursingRecords.facilityId, patient.facilityId),
        gte(nursingRecords.visitDate, startDate.toISOString().split('T')[0]),
        lte(nursingRecords.visitDate, endDate.toISOString().split('T')[0]),
        inArray(nursingRecords.status, ['completed', 'reviewed'])
        // 削除フラグのチェックなし（現在のAPIの実装と同じ）
      ))
      .orderBy(nursingRecords.visitDate);

    console.log(`✅ 件数: ${relatedRecordsWithoutDeletedCheck.length}件\n`);

    // 2025年11月7日の記録を抽出
    const nov7RecordsWithoutDeletedCheck = relatedRecordsWithoutDeletedCheck.filter(r => 
      r.record.visitDate === '2025-11-07'
    );

    console.log(`📋 2025年11月7日の記録: ${nov7RecordsWithoutDeletedCheck.length}件`);
    nov7RecordsWithoutDeletedCheck.forEach((item, index) => {
      const record = item.record;
      console.log(`\n【記録 ${index + 1}】`);
      console.log(`  ID: ${record.id}`);
      console.log(`  ステータス: ${record.status}`);
      console.log(`  削除フラグ: ${record.deletedAt ? `削除済み (${record.deletedAt})` : 'なし'}`);
      console.log(`  訪問時間: ${record.actualStartTime} ～ ${record.actualEndTime}`);
    });

    // 4. レセプト詳細画面のAPIと同じ条件で訪問記録を取得（削除フラグチェックあり）
    console.log('\n📋 4. レセプト詳細画面のAPIと同じ条件で訪問記録を取得（削除フラグチェックあり）:');
    console.log('='.repeat(80));

    const relatedRecordsWithDeletedCheck = await db.select({
      record: nursingRecords,
    })
      .from(nursingRecords)
      .where(and(
        eq(nursingRecords.patientId, patient.id),
        eq(nursingRecords.facilityId, patient.facilityId),
        gte(nursingRecords.visitDate, startDate.toISOString().split('T')[0]),
        lte(nursingRecords.visitDate, endDate.toISOString().split('T')[0]),
        inArray(nursingRecords.status, ['completed', 'reviewed']),
        isNull(nursingRecords.deletedAt) // 削除フラグのチェックあり
      ))
      .orderBy(nursingRecords.visitDate);

    console.log(`✅ 件数: ${relatedRecordsWithDeletedCheck.length}件\n`);

    // 2025年11月7日の記録を抽出
    const nov7RecordsWithDeletedCheck = relatedRecordsWithDeletedCheck.filter(r => 
      r.record.visitDate === '2025-11-07'
    );

    console.log(`📋 2025年11月7日の記録: ${nov7RecordsWithDeletedCheck.length}件`);
    nov7RecordsWithDeletedCheck.forEach((item, index) => {
      const record = item.record;
      console.log(`\n【記録 ${index + 1}】`);
      console.log(`  ID: ${record.id}`);
      console.log(`  ステータス: ${record.status}`);
      console.log(`  訪問時間: ${record.actualStartTime} ～ ${record.actualEndTime}`);
    });

    // 5. 比較結果
    console.log('\n📋 5. 比較結果:');
    console.log('='.repeat(80));
    console.log(`削除フラグチェックなし: ${nov7RecordsWithoutDeletedCheck.length}件`);
    console.log(`削除フラグチェックあり: ${nov7RecordsWithDeletedCheck.length}件`);
    
    if (nov7RecordsWithoutDeletedCheck.length > nov7RecordsWithDeletedCheck.length) {
      const deletedRecords = nov7RecordsWithoutDeletedCheck.filter(r => r.record.deletedAt);
      console.log(`\n⚠️  削除済みの記録が ${deletedRecords.length}件 含まれています:`);
      deletedRecords.forEach((item, index) => {
        const record = item.record;
        console.log(`  ${index + 1}. ID: ${record.id}, ステータス: ${record.status}, 削除日時: ${record.deletedAt}`);
      });
    }

    console.log('\n✅ 調査完了');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

checkReceiptDetailRecords();

