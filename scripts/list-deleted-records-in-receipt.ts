/**
 * レセプト詳細画面に表示されている削除済み訪問記録をリストアップするスクリプト（読み取り専用）
 * 
 * ⚠️ 本番DBへの読み取り専用アクセスのみ。データの変更は一切行いません。
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from '../shared/schema';
import { eq, and, gte, lte, inArray } from 'drizzle-orm';

const { nursingRecords, patients, monthlyReceipts } = schema;

// WebSocket設定
neonConfig.webSocketConstructor = ws;

async function listDeletedRecordsInReceipt() {
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

    // 2. レセプト詳細画面のAPIと同じ条件で訪問記録を取得（削除フラグチェックなし）
    console.log('📋 2. レセプト詳細画面のAPIと同じ条件で訪問記録を取得（削除フラグチェックなし）:');
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

    console.log(`✅ 全件数: ${relatedRecordsWithoutDeletedCheck.length}件\n`);

    // 3. 削除済みの記録を抽出
    const deletedRecords = relatedRecordsWithoutDeletedCheck.filter(r => r.record.deletedAt);
    
    console.log(`📋 3. 削除済みの記録（レセプト詳細画面に表示されているが本来は非表示であるべき）:`);
    console.log('='.repeat(80));
    console.log(`✅ 件数: ${deletedRecords.length}件\n`);

    if (deletedRecords.length === 0) {
      console.log('削除済みの記録はありません。');
    } else {
      // 訪問日ごとにグループ化
      const recordsByDate = new Map<string, typeof deletedRecords>();
      deletedRecords.forEach(item => {
        const dateStr = item.record.visitDate;
        if (!recordsByDate.has(dateStr)) {
          recordsByDate.set(dateStr, []);
        }
        recordsByDate.get(dateStr)!.push(item);
      });

      // 訪問日順にソートして表示
      const sortedDates = Array.from(recordsByDate.keys()).sort();
      
      sortedDates.forEach(dateStr => {
        const records = recordsByDate.get(dateStr)!;
        console.log(`\n【訪問日: ${dateStr}】`);
        records.forEach((item, index) => {
          const record = item.record;
          const visitDate = new Date(record.visitDate);
          const formattedDate = `${visitDate.getFullYear()}年${visitDate.getMonth() + 1}月${visitDate.getDate()}日`;
          
          // 訪問時間をJSTに変換して表示
          let startTimeStr = '';
          let endTimeStr = '';
          if (record.actualStartTime) {
            const startTime = new Date(record.actualStartTime);
            const jstStartTime = new Date(startTime.getTime() + 9 * 60 * 60 * 1000);
            startTimeStr = `${String(jstStartTime.getUTCHours()).padStart(2, '0')}:${String(jstStartTime.getUTCMinutes()).padStart(2, '0')}`;
          }
          if (record.actualEndTime) {
            const endTime = new Date(record.actualEndTime);
            const jstEndTime = new Date(endTime.getTime() + 9 * 60 * 60 * 1000);
            endTimeStr = `${String(jstEndTime.getUTCHours()).padStart(2, '0')}:${String(jstEndTime.getUTCMinutes()).padStart(2, '0')}`;
          }

          const deleteDate = record.deletedAt ? new Date(record.deletedAt) : null;
          const formattedDeleteDate = deleteDate 
            ? `${deleteDate.getFullYear()}年${deleteDate.getMonth() + 1}月${deleteDate.getDate()}日 ${String(deleteDate.getHours()).padStart(2, '0')}:${String(deleteDate.getMinutes()).padStart(2, '0')}`
            : '';

          console.log(`  ${index + 1}. ${formattedDate} ${startTimeStr}～${endTimeStr}`);
          console.log(`     ID: ${record.id}`);
          console.log(`     ステータス: ${record.status}`);
          console.log(`     削除日時: ${formattedDeleteDate}`);
        });
      });

      // 4. サマリー
      console.log('\n📋 4. サマリー:');
      console.log('='.repeat(80));
      console.log(`削除済み記録の総数: ${deletedRecords.length}件`);
      console.log(`訪問日数: ${sortedDates.length}日`);
      console.log(`\n訪問日別の内訳:`);
      sortedDates.forEach(dateStr => {
        const records = recordsByDate.get(dateStr)!;
        const visitDate = new Date(dateStr);
        const formattedDate = `${visitDate.getFullYear()}年${visitDate.getMonth() + 1}月${visitDate.getDate()}日`;
        console.log(`  ${formattedDate}: ${records.length}件`);
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

listDeletedRecordsInReceipt();

