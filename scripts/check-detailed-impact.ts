/**
 * 本番環境のサービスコードマスタ入れ替え影響範囲の詳細確認スクリプト
 * 
 * 本番環境で使用されているサービスコードIDがどの訪問記録で使用されているか、
 * より詳細な情報を確認します。
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { nursingServiceCodes, nursingRecords, bonusCalculationHistory, patients, users } from '../shared/schema';
import { sql, eq } from 'drizzle-orm';

const PROD_DB_URL = 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function checkDetailedImpact() {
  console.log('🔍 本番環境のサービスコードマスタ入れ替え影響範囲の詳細確認\n');
  console.log('⚠️  本番データベースに接続します\n');
  
  const pool = new Pool({ connectionString: PROD_DB_URL });
  const db = drizzle(pool);

  try {
    // 1. 使用されているサービスコードIDの詳細
    console.log('📊 1. 使用されているサービスコードIDの詳細');
    console.log('─'.repeat(60));
    
    const usedServiceCodes = await db.execute<{
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
    
    console.log(`使用されているサービスコードID数: ${usedServiceCodes.rows.length}件\n`);
    
    usedServiceCodes.rows.forEach((row, index) => {
      console.log(`${index + 1}. サービスコードID: ${row.service_code_id?.substring(0, 8)}...`);
      console.log(`   サービスコード: ${row.service_code || '(マスタに存在しない)'}`);
      console.log(`   サービス名称: ${row.service_name || '(マスタに存在しない)'}`);
      console.log(`   使用件数: ${row.count}件`);
      console.log('');
    });

    // 2. 訪問記録の詳細（サービスコードが設定されているもの）
    console.log('📊 2. 訪問記録の詳細（サービスコードが設定されているもの）');
    console.log('─'.repeat(60));
    
    const recordsWithServiceCode = await db.execute<{
      id: string;
      patient_id: string;
      patient_name: string;
      visit_date: string;
      service_code_id: string;
      service_code: string;
      service_name: string;
      record_date: string;
      status: string;
    }>(sql`
      SELECT 
        nr.id,
        nr.patient_id,
        p.last_name || ' ' || p.first_name as patient_name,
        nr.visit_date::text as visit_date,
        nr.service_code_id,
        nsc.service_code,
        nsc.service_name,
        nr.record_date::text as record_date,
        nr.status
      FROM nursing_records nr
      LEFT JOIN patients p ON nr.patient_id = p.id
      LEFT JOIN nursing_service_codes nsc ON nr.service_code_id = nsc.id
      WHERE nr.service_code_id IS NOT NULL
      ORDER BY nr.visit_date DESC, nr.record_date DESC
    `);
    
    console.log(`サービスコードが設定されている訪問記録数: ${recordsWithServiceCode.rows.length}件\n`);
    
    // 患者ごとにグループ化
    const recordsByPatient: Record<string, typeof recordsWithServiceCode.rows> = {};
    recordsWithServiceCode.rows.forEach(record => {
      if (!recordsByPatient[record.patient_id]) {
        recordsByPatient[record.patient_id] = [];
      }
      recordsByPatient[record.patient_id].push(record);
    });
    
    console.log(`患者数: ${Object.keys(recordsByPatient).length}人\n`);
    
    Object.entries(recordsByPatient).forEach(([patientId, records], index) => {
      const firstRecord = records[0];
      console.log(`${index + 1}. 患者: ${firstRecord.patient_name} (ID: ${patientId.substring(0, 8)}...)`);
      console.log(`   訪問記録数: ${records.length}件`);
      console.log(`   使用されているサービスコード: ${firstRecord.service_code || '(マスタに存在しない)'} - ${firstRecord.service_name || '(マスタに存在しない)'}`);
      console.log(`   最新の訪問日: ${records[0].visit_date}`);
      console.log(`   記録のステータス: ${records.map(r => r.status).join(', ')}`);
      console.log('');
    });

    // 3. 訪問記録の詳細リスト（最新10件）
    console.log('📊 3. 訪問記録の詳細リスト（最新10件）');
    console.log('─'.repeat(60));
    
    recordsWithServiceCode.rows.slice(0, 10).forEach((record, index) => {
      console.log(`${index + 1}. 訪問記録ID: ${record.id.substring(0, 8)}...`);
      console.log(`   患者: ${record.patient_name}`);
      console.log(`   訪問日: ${record.visit_date}`);
      console.log(`   記録日: ${record.record_date}`);
      console.log(`   ステータス: ${record.status}`);
      console.log(`   サービスコード: ${record.service_code || '(マスタに存在しない)'}`);
      console.log(`   サービス名称: ${record.service_name || '(マスタに存在しない)'}`);
      console.log(`   サービスコードID: ${record.service_code_id.substring(0, 8)}...`);
      console.log('');
    });

    // 4. 月次レセプトへの影響確認
    console.log('📊 4. 月次レセプトへの影響確認');
    console.log('─'.repeat(60));
    
    // 訪問記録の訪問日から月次レセプトの対象期間を確認
    const recordsByMonth = await db.execute<{
      year: number;
      month: number;
      count: number;
      service_code: string;
    }>(sql`
      SELECT 
        EXTRACT(YEAR FROM visit_date)::integer as year,
        EXTRACT(MONTH FROM visit_date)::integer as month,
        COUNT(*) as count,
        nsc.service_code
      FROM nursing_records nr
      LEFT JOIN nursing_service_codes nsc ON nr.service_code_id = nsc.id
      WHERE nr.service_code_id IS NOT NULL
      GROUP BY EXTRACT(YEAR FROM visit_date), EXTRACT(MONTH FROM visit_date), nsc.service_code
      ORDER BY year DESC, month DESC
    `);
    
    console.log('月別の訪問記録数（サービスコード設定済み）:\n');
    recordsByMonth.rows.forEach(row => {
      console.log(`  ${row.year}年${row.month}月: ${row.count}件 (サービスコード: ${row.service_code || '(マスタに存在しない)'})`);
    });
    console.log('');

    // 5. 影響を受ける可能性のある月次レセプト
    console.log('📊 5. 影響を受ける可能性のある月次レセプト');
    console.log('─'.repeat(60));
    
    const monthlyReceipts = await db.execute<{
      id: string;
      patient_id: string;
      patient_name: string;
      target_year: number;
      target_month: number;
      insurance_type: string;
      visit_count: number;
      total_points: number;
      is_confirmed: boolean;
      is_sent: boolean;
    }>(sql`
      SELECT 
        mr.id,
        mr.patient_id,
        p.last_name || ' ' || p.first_name as patient_name,
        mr.target_year,
        mr.target_month,
        mr.insurance_type,
        mr.visit_count,
        mr.total_points,
        mr.is_confirmed,
        mr.is_sent
      FROM monthly_receipts mr
      LEFT JOIN patients p ON mr.patient_id = p.id
      WHERE EXISTS (
        SELECT 1
        FROM nursing_records nr
        WHERE nr.patient_id = mr.patient_id
          AND EXTRACT(YEAR FROM nr.visit_date) = mr.target_year
          AND EXTRACT(MONTH FROM nr.visit_date) = mr.target_month
          AND nr.service_code_id IS NOT NULL
      )
      ORDER BY mr.target_year DESC, mr.target_month DESC
    `);
    
    console.log(`影響を受ける可能性のある月次レセプト数: ${monthlyReceipts.rows.length}件\n`);
    
    if (monthlyReceipts.rows.length > 0) {
      monthlyReceipts.rows.forEach((receipt, index) => {
        console.log(`${index + 1}. 月次レセプトID: ${receipt.id.substring(0, 8)}...`);
        console.log(`   患者: ${receipt.patient_name}`);
        console.log(`   対象期間: ${receipt.target_year}年${receipt.target_month}月`);
        console.log(`   保険種別: ${receipt.insurance_type}`);
        console.log(`   訪問回数: ${receipt.visit_count}件`);
        console.log(`   総点数: ${receipt.total_points}点`);
        console.log(`   確定済み: ${receipt.is_confirmed ? 'はい' : 'いいえ'}`);
        console.log(`   送信済み: ${receipt.is_sent ? 'はい' : 'いいえ'}`);
        console.log('');
      });
    }

    // 6. 影響範囲のサマリー
    console.log('📊 6. 影響範囲のサマリー');
    console.log('─'.repeat(60));
    
    const totalRecords = recordsWithServiceCode.rows.length;
    const uniquePatients = new Set(recordsWithServiceCode.rows.map(r => r.patient_id)).size;
    const uniqueServiceCodeIds = new Set(recordsWithServiceCode.rows.map(r => r.service_code_id)).size;
    
    // 最新の訪問日と最古の訪問日
    const visitDates = recordsWithServiceCode.rows.map(r => new Date(r.visit_date));
    const latestVisitDate = new Date(Math.max(...visitDates.map(d => d.getTime())));
    const oldestVisitDate = new Date(Math.min(...visitDates.map(d => d.getTime())));
    
    console.log(`総訪問記録数（サービスコード設定済み）: ${totalRecords}件`);
    console.log(`影響を受ける患者数: ${uniquePatients}人`);
    console.log(`使用されているサービスコードID数: ${uniqueServiceCodeIds}件`);
    console.log(`最新の訪問日: ${latestVisitDate.toISOString().split('T')[0]}`);
    console.log(`最古の訪問日: ${oldestVisitDate.toISOString().split('T')[0]}`);
    console.log(`影響を受ける可能性のある月次レセプト数: ${monthlyReceipts.rows.length}件`);
    
    // 確定済み・送信済みのレセプト数
    const confirmedReceipts = monthlyReceipts.rows.filter(r => r.is_confirmed).length;
    const sentReceipts = monthlyReceipts.rows.filter(r => r.is_sent).length;
    
    console.log(`\n⚠️  確定済みの月次レセプト: ${confirmedReceipts}件`);
    console.log(`⚠️  送信済みの月次レセプト: ${sentReceipts}件`);
    
    if (sentReceipts > 0) {
      console.log('\n🚨 注意: 送信済みの月次レセプトがあります。');
      console.log('   これらのレセプトは既に提出済みのため、サービスコードの変更は影響しません。');
    }

    console.log('\n' + '─'.repeat(60));
    console.log('✅ 影響範囲の詳細確認が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

checkDetailedImpact()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

