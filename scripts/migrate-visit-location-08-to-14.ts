/**
 * 訪問場所コード 08 → 14 データ移行スクリプト
 *
 * 本番環境で使用されている訪問場所コード「08（グループホーム）」を
 * 「14（認知症対応型グループホーム）」に移行します。
 *
 * ⚠️ 警告: このスクリプトは本番データベースに書き込みを行います。
 *    ユーザーの明示的な承認なしに実行しないでください。
 *
 * 実行方法:
 *   PRODUCTION_DB_URL="postgresql://..." npx tsx scripts/migrate-visit-location-08-to-14.ts
 */

import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../shared/schema';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

const PRODUCTION_DB_URL = process.env.PRODUCTION_DB_URL;
if (!PRODUCTION_DB_URL) {
  console.error('❌ PRODUCTION_DB_URL環境変数が設定されていません');
  process.exit(1);
}

async function migrateVisitLocationCodes() {
  console.log('🔄 訪問場所コード 08 → 14 のデータ移行を開始します...\n');
  console.log('⚠️  本番環境のデータベースに接続します\n');

  const pool = new Pool({ connectionString: PRODUCTION_DB_URL });
  const db = drizzle({ client: pool, schema });

  try {
    // 1. 移行対象の記録数を確認
    console.log('📊 1. 移行対象の記録を確認中...');
    console.log('─'.repeat(60));
    
    const recordsToMigrate = await db.execute<{
      id: string;
      visit_date: Date;
      patient_id: string;
      visit_location_code: string;
    }>(sql`
      SELECT id, visit_date, patient_id, visit_location_code
      FROM nursing_records
      WHERE visit_location_code = '08'
      ORDER BY visit_date DESC
    `);

    const count = recordsToMigrate.rows.length;
    console.log(`移行対象の記録数: ${count}件\n`);

    if (count === 0) {
      console.log('✅ 移行対象の記録がありません。処理を終了します。');
      return;
    }

    // 記録の詳細を表示
    console.log('移行対象の記録:');
    recordsToMigrate.rows.forEach((record, index) => {
      console.log(`  ${index + 1}. 記録ID: ${record.id}`);
      console.log(`     訪問日: ${record.visit_date}`);
      console.log(`     患者ID: ${record.patient_id}`);
    });
    console.log('');

    // 2. マスタコード14が存在するか確認
    console.log('📊 2. マスタコード14の存在確認...');
    console.log('─'.repeat(60));
    
    const targetCode = await db.select()
      .from(schema.visitLocationCodes)
      .where(eq(schema.visitLocationCodes.locationCode, '14'))
      .limit(1);

    if (targetCode.length === 0) {
      console.log('⚠️  警告: マスタコード14が存在しません。');
      console.log('   マスタ更新を先に実行してください。');
      return;
    }

    console.log(`✅ マスタコード14が存在します: ${targetCode[0].locationName}\n`);

    // 3. データ移行を実行
    console.log('📊 3. データ移行を実行中...');
    console.log('─'.repeat(60));
    
    const updateResult = await db
      .update(schema.nursingRecords)
      .set({
        visitLocationCode: '14',
        updatedAt: new Date(),
      })
      .where(eq(schema.nursingRecords.visitLocationCode, '08'))
      .returning({
        id: schema.nursingRecords.id,
        visitDate: schema.nursingRecords.visitDate,
      });

    const updatedCount = updateResult.length;
    console.log(`✅ ${updatedCount}件の記録を更新しました\n`);

    // 4. 移行結果の確認
    console.log('📊 4. 移行結果の確認...');
    console.log('─'.repeat(60));
    
    const remaining08Records = await db.execute<{ count: string }>(sql`
      SELECT COUNT(*) as count
      FROM nursing_records
      WHERE visit_location_code = '08'
    `);

    const remainingCount = Number(remaining08Records.rows[0]?.count || 0);
    
    if (remainingCount === 0) {
      console.log('✅ すべての記録が正常に移行されました。');
      console.log(`   更新された記録数: ${updatedCount}件`);
    } else {
      console.warn(`⚠️  警告: まだ08を使用している記録が${remainingCount}件残っています。`);
    }

    // 14を使用している記録数を確認
    const recordsWith14 = await db.execute<{ count: string }>(sql`
      SELECT COUNT(*) as count
      FROM nursing_records
      WHERE visit_location_code = '14'
    `);

    const count14 = Number(recordsWith14.rows[0]?.count || 0);
    console.log(`\n現在、コード14を使用している記録数: ${count14}件`);

    console.log('\n' + '─'.repeat(60));
    console.log('✅ データ移行が完了しました！\n');

  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// スクリプト実行
migrateVisitLocationCodes()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

