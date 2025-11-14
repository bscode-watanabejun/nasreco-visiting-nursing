/**
 * 月次レセプトへのサービスコード変更の影響確認
 * 
 * 月次レセプトがサービスコードの変更による影響を受けていないか確認します。
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';

const PROD_DB_URL = process.env.PRODUCTION_DB_URL || 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function checkMonthlyReceiptsImpact() {
  console.log('🔍 月次レセプトへのサービスコード変更の影響を確認します...\n');
  console.log('⚠️  本番データベースに接続します\n');
  
  const pool = new Pool({ connectionString: PROD_DB_URL });
  const db = drizzle(pool);

  try {
    // 1. 月次レセプトの一覧
    console.log('📊 1. 月次レセプトの一覧:');
    console.log('─'.repeat(60));
    
    const monthlyReceipts = await db.execute<{
      id: string;
      facility_id: string;
      patient_id: string;
      target_year: number;
      target_month: number;
      insurance_type: string;
      visit_count: number;
      total_visit_points: number;
    }>(sql`
      SELECT 
        id,
        facility_id,
        patient_id,
        target_year,
        target_month,
        insurance_type,
        visit_count,
        total_visit_points
      FROM monthly_receipts
      ORDER BY target_year DESC, target_month DESC
    `);
    
    console.log(`   総月次レセプト数: ${monthlyReceipts.rows.length}件\n`);
    
    if (monthlyReceipts.rows.length > 0) {
      console.log('   月次レセプトの詳細:');
      monthlyReceipts.rows.forEach((receipt, index) => {
        console.log(`   ${index + 1}. ID: ${receipt.id.substring(0, 8)}...`);
        console.log(`      対象年月: ${receipt.target_year}年${receipt.target_month}月`);
        console.log(`      保険種別: ${receipt.insurance_type}`);
        console.log(`      訪問回数: ${receipt.visit_count}回`);
        console.log(`      訪問点数合計: ${receipt.total_visit_points}点`);
      });
      console.log('');
    }

    // 2. 月次レセプトに関連する訪問記録のサービスコード確認
    console.log('📊 2. 月次レセプトに関連する訪問記録のサービスコード確認:');
    console.log('─'.repeat(60));
    
    const receiptsWithRecords = await db.execute<{
      receipt_id: string;
      target_year: number;
      target_month: number;
      insurance_type: string;
      record_count: number;
      records_with_service_code: number;
      records_with_wrong_service_code: number;
      service_codes: string[];
    }>(sql`
      SELECT 
        mr.id as receipt_id,
        mr.target_year,
        mr.target_month,
        mr.insurance_type,
        COUNT(nr.id) as record_count,
        COUNT(*) FILTER (WHERE nr.service_code_id IS NOT NULL) as records_with_service_code,
        COUNT(*) FILTER (
          WHERE nr.service_code_id IS NOT NULL 
          AND EXISTS (
            SELECT 1 FROM nursing_service_codes nsc 
            WHERE nsc.id = nr.service_code_id 
            AND nsc.service_code LIKE '31%'
          )
        ) as records_with_wrong_service_code,
        array_agg(DISTINCT nsc.service_code) FILTER (WHERE nsc.service_code IS NOT NULL) as service_codes
      FROM monthly_receipts mr
      INNER JOIN nursing_records nr ON nr.facility_id = mr.facility_id
        AND EXTRACT(YEAR FROM nr.visit_date) = mr.target_year
        AND EXTRACT(MONTH FROM nr.visit_date) = mr.target_month
      LEFT JOIN nursing_service_codes nsc ON nr.service_code_id = nsc.id
      GROUP BY mr.id, mr.target_year, mr.target_month, mr.insurance_type
      ORDER BY mr.target_year DESC, mr.target_month DESC
    `);
    
    console.log(`   訪問記録が関連する月次レセプト数: ${receiptsWithRecords.rows.length}件\n`);
    
    if (receiptsWithRecords.rows.length > 0) {
      let hasWrongCodes = false;
      
      receiptsWithRecords.rows.forEach((row, index) => {
        const wrongCount = Number(row.records_with_wrong_service_code || 0);
        const status = wrongCount > 0 ? '❌' : '✅';
        
        console.log(`   ${status} ${index + 1}. ${row.target_year}年${row.target_month}月 (${row.insurance_type})`);
        console.log(`      訪問記録数: ${row.record_count}件`);
        console.log(`      サービスコード設定済み: ${row.records_with_service_code}件`);
        console.log(`      誤ったコードを参照: ${wrongCount}件`);
        
        if (row.service_codes && row.service_codes.length > 0) {
          console.log(`      使用されているサービスコード: ${row.service_codes.join(', ')}`);
        }
        console.log('');
        
        if (wrongCount > 0) {
          hasWrongCodes = true;
        }
      });
      
      if (hasWrongCodes) {
        console.error('   ❌ エラー: 誤ったコードを参照している訪問記録が存在します。\n');
      } else {
        console.log('   ✅ すべての訪問記録が正しいサービスコードを参照しています。\n');
      }
    }

    // 3. 月次レセプトの作成日時確認
    console.log('📊 3. 月次レセプトの作成日時確認:');
    console.log('─'.repeat(60));
    
    const receiptDates = await db.execute<{
      id: string;
      target_year: number;
      target_month: number;
      created_at: Date;
    }>(sql`
      SELECT 
        id,
        target_year,
        target_month,
        created_at
      FROM monthly_receipts
      ORDER BY created_at DESC
    `);
    
    if (receiptDates.rows.length > 0) {
      console.log('   月次レセプトの作成日時（最新5件）:');
      receiptDates.rows.slice(0, 5).forEach((row, index) => {
        console.log(`   ${index + 1}. ${row.target_year}年${row.target_month}月 - ${row.created_at.toISOString().substring(0, 19)}`);
      });
      if (receiptDates.rows.length > 5) {
        console.log(`   ... 他 ${receiptDates.rows.length - 5}件\n`);
      } else {
        console.log('');
      }
    }

    // 4. 影響分析
    console.log('📊 4. 影響分析:');
    console.log('─'.repeat(60));
    
    console.log('\n【月次レセプトへの影響】');
    console.log('   月次レセプトは訪問記録のサービスコードIDを直接参照していません。');
    console.log('   月次レセプトは訪問記録の訪問日、訪問回数、点数を集計して作成されます。');
    console.log('   サービスコードマスタの変更は、月次レセプトの既存データには影響しません。\n');
    
    console.log('【注意事項】');
    console.log('   - 月次レセプトの再計算が必要な場合は、訪問記録のサービスコードIDが更新されているため、');
    console.log('     再計算時に正しいサービスコードが使用されます。');
    console.log('   - 既存の月次レセプトのデータは変更されません。\n');

    console.log('─'.repeat(60));
    console.log('✅ 月次レセプトへの影響確認が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

checkMonthlyReceiptsImpact()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

