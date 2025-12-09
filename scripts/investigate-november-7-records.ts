/**
 * 2025年11月7日の訪問記録を調査するスクリプト（読み取り専用）
 * 
 * ⚠️ 本番DBへの読み取り専用アクセスのみ。データの変更は一切行いません。
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from '../shared/schema';
import { eq, and, isNull, gte, lte } from 'drizzle-orm';

const { nursingRecords, patients } = schema;

// WebSocket設定
neonConfig.webSocketConstructor = ws;

async function investigateNovember7Records() {
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

    // 2. 2025年11月7日の訪問記録を全件取得（ステータス・削除フラグ問わず）
    console.log('📋 2. 2025年11月7日の訪問記録を全件取得中...');
    const visitDate = '2025-11-07';
    const allRecords = await db.query.nursingRecords.findMany({
      where: and(
        eq(nursingRecords.patientId, patient.id),
        eq(nursingRecords.visitDate, visitDate)
      ),
      orderBy: (nursingRecords, { asc }) => [asc(nursingRecords.actualStartTime)],
    });

    console.log(`✅ 全訪問記録数: ${allRecords.length}件\n`);

    if (allRecords.length === 0) {
      console.log('❌ 2025年11月7日の訪問記録が見つかりませんでした');
      process.exit(0);
    }

    // 3. 各訪問記録の詳細を表示
    console.log('📋 3. 訪問記録の詳細:');
    console.log('='.repeat(80));
    allRecords.forEach((record, index) => {
      console.log(`\n【記録 ${index + 1}】`);
      console.log(`  ID: ${record.id}`);
      console.log(`  ステータス: ${record.status}`);
      console.log(`  削除フラグ: ${record.deletedAt ? `削除済み (${record.deletedAt})` : 'なし'}`);
      console.log(`  訪問日: ${record.visitDate}`);
      console.log(`  訪問時間: ${record.actualStartTime} ～ ${record.actualEndTime}`);
      console.log(`  施設ID: ${record.facilityId}`);
      console.log(`  作成日時: ${record.createdAt}`);
      console.log(`  更新日時: ${record.updatedAt}`);
    });

    // 4. ステータス別の集計
    console.log('\n📋 4. ステータス別の集計:');
    console.log('='.repeat(80));
    const statusCounts = {
      draft: allRecords.filter(r => r.status === 'draft' && !r.deletedAt).length,
      completed: allRecords.filter(r => r.status === 'completed' && !r.deletedAt).length,
      reviewed: allRecords.filter(r => r.status === 'reviewed' && !r.deletedAt).length,
      deleted: allRecords.filter(r => r.deletedAt).length,
    };
    console.log(`  下書き: ${statusCounts.draft}件`);
    console.log(`  完成: ${statusCounts.completed}件`);
    console.log(`  確認済み: ${statusCounts.reviewed}件`);
    console.log(`  削除済み: ${statusCounts.deleted}件`);

    // 5. 削除フラグなしの訪問記録のみを取得（訪問記録画面の条件）
    console.log('\n📋 5. 削除フラグなしの訪問記録（訪問記録画面で表示されるべき記録）:');
    console.log('='.repeat(80));
    const activeRecords = allRecords.filter(r => !r.deletedAt);
    console.log(`✅ 件数: ${activeRecords.length}件`);
    activeRecords.forEach((record, index) => {
      console.log(`\n【記録 ${index + 1}】`);
      console.log(`  ID: ${record.id}`);
      console.log(`  ステータス: ${record.status}`);
      console.log(`  訪問時間: ${record.actualStartTime} ～ ${record.actualEndTime}`);
    });

    // 6. 確認済みステータスの訪問記録を特定
    console.log('\n📋 6. 確認済みステータスの訪問記録:');
    console.log('='.repeat(80));
    const reviewedRecords = activeRecords.filter(r => r.status === 'reviewed');
    console.log(`✅ 件数: ${reviewedRecords.length}件`);
    if (reviewedRecords.length > 0) {
      reviewedRecords.forEach((record, index) => {
        console.log(`\n【確認済み記録 ${index + 1}】`);
        console.log(`  ID: ${record.id}`);
        console.log(`  訪問時間: ${record.actualStartTime} ～ ${record.actualEndTime}`);
        console.log(`  施設ID: ${record.facilityId}`);
      });
    } else {
      console.log('❌ 確認済みステータスの訪問記録が見つかりませんでした');
    }

    // 7. 訪問記録画面の検索条件で実際に取得される記録をシミュレート
    console.log('\n📋 7. 訪問記録画面の検索条件シミュレーション:');
    console.log('='.repeat(80));
    console.log('  条件:');
    console.log(`    患者ID: ${patient.id}`);
    console.log(`    期間: 2025-11-07 ～ 2025-11-07`);
    console.log(`    ステータス: すべて（フィルタなし）`);
    console.log(`    施設ID: ${patient.facilityId}`);
    console.log(`    削除フラグ: なし`);
    
    const simulatedRecords = await db.query.nursingRecords.findMany({
      where: and(
        eq(nursingRecords.patientId, patient.id),
        eq(nursingRecords.facilityId, patient.facilityId),
        eq(nursingRecords.visitDate, visitDate),
        isNull(nursingRecords.deletedAt)
      ),
      orderBy: (nursingRecords, { desc }) => [desc(nursingRecords.visitDate), desc(nursingRecords.actualStartTime)],
    });

    console.log(`\n✅ シミュレーション結果: ${simulatedRecords.length}件`);
    simulatedRecords.forEach((record, index) => {
      console.log(`\n【記録 ${index + 1}】`);
      console.log(`  ID: ${record.id}`);
      console.log(`  ステータス: ${record.status}`);
      console.log(`  訪問時間: ${record.actualStartTime} ～ ${record.actualEndTime}`);
    });

    // 8. レセプト詳細画面の検索条件で実際に取得される記録をシミュレート
    console.log('\n📋 8. レセプト詳細画面の検索条件シミュレーション:');
    console.log('='.repeat(80));
    console.log('  条件:');
    console.log(`    患者ID: ${patient.id}`);
    console.log(`    期間: 2025年11月（2025-11-01 ～ 2025-11-30）`);
    console.log(`    ステータス: completed または reviewed`);
    console.log(`    施設ID: ${patient.facilityId}`);
    console.log(`    削除フラグ: なし`);
    
    const receiptStartDate = '2025-11-01';
    const receiptEndDate = '2025-11-30';
    const receiptRecords = await db.query.nursingRecords.findMany({
      where: and(
        eq(nursingRecords.patientId, patient.id),
        eq(nursingRecords.facilityId, patient.facilityId),
        gte(nursingRecords.visitDate, receiptStartDate),
        lte(nursingRecords.visitDate, receiptEndDate),
        isNull(nursingRecords.deletedAt)
      ),
      orderBy: (nursingRecords, { asc }) => [asc(nursingRecords.visitDate)],
    });

    // ステータスでフィルタ（completed または reviewed）
    const receiptFilteredRecords = receiptRecords.filter(r => 
      r.status === 'completed' || r.status === 'reviewed'
    );

    console.log(`\n✅ シミュレーション結果: ${receiptFilteredRecords.length}件`);
    receiptFilteredRecords.forEach((record, index) => {
      console.log(`\n【記録 ${index + 1}】`);
      console.log(`  ID: ${record.id}`);
      console.log(`  ステータス: ${record.status}`);
      console.log(`  訪問日: ${record.visitDate}`);
      console.log(`  訪問時間: ${record.actualStartTime} ～ ${record.actualEndTime}`);
    });

    // 9. 2025年11月7日の確認済み記録がレセプト詳細画面で表示されるか確認
    const nov7ReviewedInReceipt = receiptFilteredRecords.filter(r => r.visitDate === visitDate);
    console.log(`\n📋 9. 2025年11月7日の確認済み記録がレセプト詳細画面に含まれるか:`);
    console.log('='.repeat(80));
    console.log(`✅ 件数: ${nov7ReviewedInReceipt.length}件`);
    if (nov7ReviewedInReceipt.length > 0) {
      nov7ReviewedInReceipt.forEach((record, index) => {
        console.log(`\n【記録 ${index + 1}】`);
        console.log(`  ID: ${record.id}`);
        console.log(`  ステータス: ${record.status}`);
        console.log(`  訪問時間: ${record.actualStartTime} ～ ${record.actualEndTime}`);
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

investigateNovember7Records();

