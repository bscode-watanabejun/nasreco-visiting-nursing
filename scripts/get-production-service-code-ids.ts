/**
 * 本番環境のサービスコードID取得スクリプト
 * 
 * 本番環境で使用されているサービスコードIDを取得し、
 * 移行計画に必要な具体的なIDを確認します。
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { nursingServiceCodes, nursingRecords } from '../shared/schema';
import { sql, eq } from 'drizzle-orm';

const PROD_DB_URL = 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function getProductionServiceCodeIds() {
  console.log('🔍 本番環境のサービスコードIDを取得します...\n');
  
  const pool = new Pool({ connectionString: PROD_DB_URL });
  const db = drizzle(pool);

  try {
    // 1. 使用されているサービスコードIDを取得
    console.log('📊 使用されているサービスコードID:');
    console.log('─'.repeat(60));
    
    const usedCodes = await db.execute<{
      service_code_id: string;
      service_code: string;
      service_name: string;
      count: number;
    }>(sql`
      SELECT 
        nr.service_code_id,
        nsc.service_code,
        nsc.service_name,
        COUNT(*) as count
      FROM nursing_records nr
      LEFT JOIN nursing_service_codes nsc ON nr.service_code_id = nsc.id
      WHERE nr.service_code_id IS NOT NULL
      GROUP BY nr.service_code_id, nsc.service_code, nsc.service_name
      ORDER BY count DESC
    `);
    
    usedCodes.rows.forEach((row, index) => {
      console.log(`\n${index + 1}. サービスコードID: ${row.service_code_id}`);
      console.log(`   サービスコード: ${row.service_code || '(マスタに存在しない)'}`);
      console.log(`   サービス名称: ${row.service_name || '(マスタに存在しない)'}`);
      console.log(`   使用件数: ${row.count}件`);
    });
    
    // 2. マッピング情報を出力
    console.log('\n\n📋 移行計画用マッピング情報:');
    console.log('─'.repeat(60));
    
    if (usedCodes.rows.length > 0) {
      console.log('\n// 誤ったコードID → 正しいコードID のマッピング');
      console.log('const SERVICE_CODE_ID_MAPPING: Record<string, string> = {');
      
      usedCodes.rows.forEach((row) => {
        // 311000110 → 510000110 のマッピング
        if (row.service_code === '311000110') {
          console.log(`  // ${row.service_code} (${row.service_name})`);
          console.log(`  '${row.service_code_id}': 'f9940fce-d0fb-47f4-a4ee-e06b7e2664a2', // 510000110`);
        }
      });
      
      console.log('};');
    }
    
    // 3. 誤ったコード（31から始まる）のID一覧
    console.log('\n\n📋 誤ったコード（31から始まる）のID一覧:');
    console.log('─'.repeat(60));
    
    const wrongCodes = await db.select().from(nursingServiceCodes)
      .where(sql`service_code LIKE '31%'`);
    
    console.log(`\n総数: ${wrongCodes.length}件\n`);
    wrongCodes.forEach((code, index) => {
      console.log(`${index + 1}. ID: ${code.id}`);
      console.log(`   サービスコード: ${code.serviceCode}`);
      console.log(`   サービス名称: ${code.serviceName}`);
      console.log(`   有効: ${code.isActive}`);
      console.log('');
    });

    console.log('─'.repeat(60));
    console.log('✅ サービスコードID取得が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

getProductionServiceCodeIds()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

