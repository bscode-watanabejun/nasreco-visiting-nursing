/**
 * 削除済み訪問記録の削除フラグを解除するスクリプト
 * 
 * ⚠️ 本番DBへの更新操作を行います。
 * 対象: 祓川 チカの11月の削除済み記録4件
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from '../shared/schema';
import { eq, and, gte, lte, inArray, isNotNull } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

const { nursingRecords, patients } = schema;

// WebSocket設定
neonConfig.webSocketConstructor = ws;

async function restoreDeletedRecords() {
  // 本番環境のデータベースURLを使用
  const dbUrl = process.env.PRODUCTION_DB_URL;
  if (!dbUrl) {
    console.error('❌ PRODUCTION_DB_URL環境変数が設定されていません');
    console.error('   本番環境のデータベースURLを設定してください');
    process.exit(1);
  }

  console.log('⚠️  本番データベースに接続します（更新操作を行います）\n');

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

    // 2. 削除済みの記録を取得
    console.log('📋 2. 削除済みの記録を検索中...');
    const startDate = new Date(2025, 10, 1); // 2025年11月1日
    const endDate = new Date(2025, 11, 0); // 2025年11月30日

    const deletedRecords = await db.select({
      record: nursingRecords,
    })
      .from(nursingRecords)
      .where(and(
        eq(nursingRecords.patientId, patient.id),
        eq(nursingRecords.facilityId, patient.facilityId),
        gte(nursingRecords.visitDate, startDate.toISOString().split('T')[0]),
        lte(nursingRecords.visitDate, endDate.toISOString().split('T')[0]),
        inArray(nursingRecords.status, ['completed', 'reviewed']),
        isNotNull(nursingRecords.deletedAt) // 削除フラグが設定されている記録
      ))
      .orderBy(nursingRecords.visitDate);

    console.log(`✅ 削除済み記録数: ${deletedRecords.length}件\n`);

    if (deletedRecords.length === 0) {
      console.log('削除済みの記録が見つかりませんでした。');
      process.exit(0);
    }

    // 3. 対象記録の詳細を表示
    console.log('📋 3. 対象記録の詳細:');
    console.log('='.repeat(80));
    deletedRecords.forEach((item, index) => {
      const record = item.record;
      const visitDate = new Date(record.visitDate);
      const formattedDate = `${visitDate.getFullYear()}年${visitDate.getMonth() + 1}月${visitDate.getDate()}日`;
      
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

      console.log(`\n【記録 ${index + 1}】`);
      console.log(`  ID: ${record.id}`);
      console.log(`  訪問日: ${formattedDate}`);
      console.log(`  訪問時間: ${startTimeStr}～${endTimeStr}`);
      console.log(`  ステータス: ${record.status}`);
      console.log(`  削除日時: ${formattedDeleteDate}`);
    });

    // 4. 確認
    console.log('\n📋 4. 削除フラグを解除しますか？');
    console.log('='.repeat(80));
    console.log(`対象記録数: ${deletedRecords.length}件`);
    console.log('\n⚠️  この操作により、以下の記録の削除フラグ（deletedAt）が null に設定されます。');
    console.log('   レセプト詳細画面に表示されるようになります。\n');

    // 5. 削除フラグを解除
    console.log('📋 5. 削除フラグを解除中...');
    const recordIds = deletedRecords.map(r => r.record.id);
    
    for (const recordId of recordIds) {
      await db.update(nursingRecords)
        .set({ 
          deletedAt: null,
          updatedAt: sql`NOW()`
        })
        .where(eq(nursingRecords.id, recordId));
      
      console.log(`  ✅ ID: ${recordId} の削除フラグを解除しました`);
    }

    console.log(`\n✅ 完了: ${recordIds.length}件の記録の削除フラグを解除しました`);

    // 6. 確認: 削除フラグが解除されたか確認
    console.log('\n📋 6. 確認: 削除フラグが解除されたか確認中...');
    const restoredRecords = await db.select({
      record: nursingRecords,
    })
      .from(nursingRecords)
      .where(and(
        eq(nursingRecords.patientId, patient.id),
        eq(nursingRecords.facilityId, patient.facilityId),
        gte(nursingRecords.visitDate, startDate.toISOString().split('T')[0]),
        lte(nursingRecords.visitDate, endDate.toISOString().split('T')[0]),
        inArray(nursingRecords.status, ['completed', 'reviewed']),
        isNotNull(nursingRecords.deletedAt) // まだ削除フラグが設定されている記録
      ));

    if (restoredRecords.length === 0) {
      console.log('✅ 全ての記録の削除フラグが正常に解除されました。');
    } else {
      console.log(`⚠️  警告: ${restoredRecords.length}件の記録がまだ削除フラグが設定されています。`);
    }

    console.log('\n✅ 処理完了');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

restoreDeletedRecords();

