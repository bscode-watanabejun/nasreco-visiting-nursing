/**
 * フェーズ2: 訪問記録のサービスコードID参照を更新
 * 
 * 誤ったサービスコードIDを正しいサービスコードIDに更新します。
 * 
 * ⚠️ 警告: このスクリプトは本番データベースに書き込みを行います。
 *    ユーザーの明示的な承認なしに実行しないでください。
 * 
 * 実行方法:
 *   PRODUCTION_DB_URL="postgresql://..." npx tsx scripts/update-service-code-references.ts
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { nursingRecords, nursingServiceCodes } from '../shared/schema';
import { sql, eq } from 'drizzle-orm';

const PROD_DB_URL = process.env.PRODUCTION_DB_URL || 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

// 誤ったコードID → 正しいコードID のマッピング
const SERVICE_CODE_ID_MAPPING: Record<string, string> = {
  // 311000110 (訪問看護基本療養費（Ⅰ）週3日まで) → 510000110
  'a4d94b8d-dce7-43f5-b574-a189eac8c203': 'f9940fce-d0fb-47f4-a4ee-e06b7e2664a2',
};

async function updateServiceCodeReferences() {
  console.log('🚀 フェーズ2: 訪問記録のサービスコードID参照を更新します...\n');
  console.log('⚠️  本番データベースに接続します\n');
  
  const pool = new Pool({ connectionString: PROD_DB_URL });
  const db = drizzle(pool);

  try {
    // 1. 更新対象の確認
    console.log('📊 1. 更新対象の確認中...');
    const wrongIds = Object.keys(SERVICE_CODE_ID_MAPPING);
    const correctIds = Object.values(SERVICE_CODE_ID_MAPPING);
    
    const recordsToUpdate = await db.execute<{
      service_code_id: string;
      count: number;
    }>(sql`
      SELECT service_code_id, COUNT(*) as count
      FROM nursing_records
      WHERE service_code_id IN (${sql.join(wrongIds.map(id => sql`${id}`), sql`, `)})
      GROUP BY service_code_id
      ORDER BY count DESC
    `);
    
    console.log(`   更新対象のサービスコードID数: ${recordsToUpdate.rows.length}件\n`);
    
    let totalRecordsToUpdate = 0;
    recordsToUpdate.rows.forEach((row, index) => {
      const correctId = SERVICE_CODE_ID_MAPPING[row.service_code_id];
      console.log(`   ${index + 1}. 誤ったID: ${row.service_code_id.substring(0, 8)}...`);
      console.log(`      正しいID: ${correctId.substring(0, 8)}...`);
      console.log(`      更新件数: ${row.count}件`);
      totalRecordsToUpdate += Number(row.count);
    });
    
    console.log(`\n   総更新件数: ${totalRecordsToUpdate}件\n`);

    if (totalRecordsToUpdate === 0) {
      console.log('✅ 更新対象のレコードがありません。\n');
      return;
    }

    // 2. 正しいコードIDが存在するか確認
    console.log('📊 2. 正しいコードIDの存在確認中...');
    const correctCodes = await db.select().from(nursingServiceCodes)
      .where(sql`id IN (${sql.join(correctIds.map(id => sql`${id}`), sql`, `)})`);
    
    console.log(`   確認したコードID数: ${correctIds.length}件`);
    console.log(`   存在するコードID数: ${correctCodes.length}件\n`);
    
    if (correctCodes.length !== correctIds.length) {
      const missingIds = correctIds.filter(id => !correctCodes.find(c => c.id === id));
      console.error(`❌ エラー: 以下のコードIDがマスタに存在しません:`);
      missingIds.forEach(id => console.error(`   - ${id}`));
      throw new Error('正しいコードIDがマスタに存在しません');
    }

    // 3. 確認プロンプト
    console.log('⚠️  訪問記録の参照を更新しますか？\n');
    
    const readline = await import('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>(resolve => {
      rl.question('続行しますか？ (yes/no): ', resolve);
    });
    rl.close();
    if (answer.toLowerCase() !== 'yes') {
      console.log('❌ 実行をキャンセルしました。');
      return;
    }
    console.log('');

    // 4. トランザクション内で更新実行
    console.log('📊 3. 訪問記録の参照を更新中...');
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      let totalUpdated = 0;

      for (const [wrongId, correctId] of Object.entries(SERVICE_CODE_ID_MAPPING)) {
        const result = await client.query(
          `UPDATE nursing_records
           SET service_code_id = $1
           WHERE service_code_id = $2`,
          [correctId, wrongId]
        );
        
        const updatedCount = result.rowCount || 0;
        totalUpdated += updatedCount;
        
        console.log(`   ✅ ${wrongId.substring(0, 8)}... → ${correctId.substring(0, 8)}... (${updatedCount}件)`);
      }

      await client.query('COMMIT');
      
      console.log(`\n✅ 更新完了:`);
      console.log(`   総更新件数: ${totalUpdated}件\n`);

      // 5. 更新後の確認
      console.log('📊 4. 更新後の確認中...');
      
      // 更新されたレコードの確認
      const updatedRecords = await db.execute<{
        service_code_id: string;
        count: number;
      }>(sql`
        SELECT service_code_id, COUNT(*) as count
        FROM nursing_records
        WHERE service_code_id IN (${sql.join(correctIds.map(id => sql`${id}`), sql`, `)})
        GROUP BY service_code_id
        ORDER BY count DESC
      `);
      
      console.log(`   更新後の参照件数:`);
      updatedRecords.rows.forEach((row) => {
        console.log(`     ${row.service_code_id.substring(0, 8)}...: ${row.count}件`);
      });

      // 整合性チェック
      const integrityCheck = await db.execute<{ count: number }>(sql`
        SELECT COUNT(*) as count
        FROM nursing_records nr
        LEFT JOIN nursing_service_codes nsc ON nr.service_code_id = nsc.id
        WHERE nr.service_code_id IS NOT NULL AND nsc.id IS NULL
      `);
      
      const invalidReferences = Number(integrityCheck.rows[0]?.count || 0);
      console.log(`\n   整合性チェック:`);
      console.log(`     参照先が存在しないレコード: ${invalidReferences}件`);
      
      if (invalidReferences > 0) {
        console.error(`\n❌ エラー: 参照先が存在しないレコードが ${invalidReferences}件 あります。`);
        throw new Error('データ整合性エラーが発生しました');
      }
      
      console.log(`   ✅ データ整合性チェック: OK\n`);

      console.log('✅ フェーズ2が完了しました。\n');

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

updateServiceCodeReferences()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

