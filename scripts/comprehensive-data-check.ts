/**
 * 本番環境のデータ整合性の包括的チェック
 * 
 * サービスコードマスタ入れ替え後のデータ整合性を詳細に確認します。
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';

const PROD_DB_URL = process.env.PRODUCTION_DB_URL || 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function comprehensiveDataCheck() {
  console.log('🔍 本番環境のデータ整合性を包括的にチェックします...\n');
  console.log('⚠️  本番データベースに接続します\n');
  
  const pool = new Pool({ connectionString: PROD_DB_URL });
  const db = drizzle(pool);

  try {
    let hasErrors = false;
    let hasWarnings = false;

    // 1. サービスコードマスタの整合性チェック
    console.log('📊 1. サービスコードマスタの整合性チェック:');
    console.log('─'.repeat(60));
    
    const serviceCodeStats = await db.execute<{
      insurance_type: string;
      is_active: boolean;
      count: number;
      wrong_prefix_count: number;
    }>(sql`
      SELECT 
        insurance_type,
        is_active,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE service_code LIKE '31%') as wrong_prefix_count
      FROM nursing_service_codes
      GROUP BY insurance_type, is_active
      ORDER BY insurance_type, is_active DESC
    `);
    
    const totalCodes = await db.execute<{ count: number }>(sql`
      SELECT COUNT(*) as count FROM nursing_service_codes
    `);
    
    const activeCodes = await db.execute<{ count: number }>(sql`
      SELECT COUNT(*) as count FROM nursing_service_codes WHERE is_active = true
    `);
    
    const wrongCodesActive = await db.execute<{ count: number }>(sql`
      SELECT COUNT(*) as count FROM nursing_service_codes 
      WHERE service_code LIKE '31%' AND is_active = true
    `);
    
    console.log(`   総コード数: ${totalCodes.rows[0]?.count || 0}件`);
    console.log(`   有効なコード数: ${activeCodes.rows[0]?.count || 0}件`);
    console.log(`   31から始まる誤ったコード（有効）: ${wrongCodesActive.rows[0]?.count || 0}件\n`);
    
    console.log('   保険種別・有効状態別の内訳:');
    serviceCodeStats.rows.forEach((row) => {
      const status = row.is_active ? '有効' : '無効';
      const wrong = Number(row.wrong_prefix_count || 0) > 0 ? ' ⚠️' : '';
      console.log(`     ${row.insurance_type} (${status}): ${row.count}件${wrong}`);
    });
    console.log('');
    
    if (Number(wrongCodesActive.rows[0]?.count || 0) > 0) {
      console.error(`   ❌ エラー: 31から始まる誤ったコードが ${wrongCodesActive.rows[0]?.count}件 まだ有効です。\n`);
      hasErrors = true;
    } else {
      console.log('   ✅ 31から始まる誤ったコードはすべて無効化されています。\n');
    }

    // 2. 訪問記録のサービスコードID参照の整合性
    console.log('📊 2. 訪問記録のサービスコードID参照の整合性:');
    console.log('─'.repeat(60));
    
    const recordIntegrity = await db.execute<{
      total_records: number;
      records_with_service_code: number;
      records_with_null_service_code: number;
      invalid_references: number;
      wrong_code_references: number;
    }>(sql`
      SELECT 
        COUNT(*) as total_records,
        COUNT(*) FILTER (WHERE service_code_id IS NOT NULL) as records_with_service_code,
        COUNT(*) FILTER (WHERE service_code_id IS NULL) as records_with_null_service_code,
        COUNT(*) FILTER (
          WHERE service_code_id IS NOT NULL 
          AND NOT EXISTS (
            SELECT 1 FROM nursing_service_codes nsc 
            WHERE nsc.id = nursing_records.service_code_id
          )
        ) as invalid_references,
        COUNT(*) FILTER (
          WHERE service_code_id IS NOT NULL 
          AND EXISTS (
            SELECT 1 FROM nursing_service_codes nsc 
            WHERE nsc.id = nursing_records.service_code_id 
            AND nsc.service_code LIKE '31%'
          )
        ) as wrong_code_references
      FROM nursing_records
    `);
    
    const stats = recordIntegrity.rows[0];
    console.log(`   総訪問記録数: ${stats?.total_records || 0}件`);
    console.log(`   サービスコード設定済み: ${stats?.records_with_service_code || 0}件`);
    console.log(`   サービスコード未設定: ${stats?.records_with_null_service_code || 0}件`);
    console.log(`   参照先が存在しない: ${stats?.invalid_references || 0}件`);
    console.log(`   誤ったコードを参照: ${stats?.wrong_code_references || 0}件\n`);
    
    if (Number(stats?.invalid_references || 0) > 0) {
      console.error(`   ❌ エラー: 参照先が存在しないレコードが ${stats.invalid_references}件 あります。\n`);
      hasErrors = true;
    } else {
      console.log('   ✅ 参照先が存在しないレコードはありません。\n');
    }
    
    if (Number(stats?.wrong_code_references || 0) > 0) {
      console.error(`   ❌ エラー: 誤ったコードを参照しているレコードが ${stats.wrong_code_references}件 あります。\n`);
      hasErrors = true;
    } else {
      console.log('   ✅ 誤ったコードを参照しているレコードはありません。\n');
    }

    // 3. 訪問記録で使用されているサービスコードの確認
    console.log('📊 3. 訪問記録で使用されているサービスコードの確認:');
    console.log('─'.repeat(60));
    
    const usedServiceCodes = await db.execute<{
      service_code_id: string;
      service_code: string;
      service_name: string;
      insurance_type: string;
      count: number;
    }>(sql`
      SELECT 
        nr.service_code_id,
        nsc.service_code,
        nsc.service_name,
        nsc.insurance_type,
        COUNT(*) as count
      FROM nursing_records nr
      LEFT JOIN nursing_service_codes nsc ON nr.service_code_id = nsc.id
      WHERE nr.service_code_id IS NOT NULL
      GROUP BY nr.service_code_id, nsc.service_code, nsc.service_name, nsc.insurance_type
      ORDER BY count DESC
    `);
    
    console.log(`   使用されているサービスコード数: ${usedServiceCodes.rows.length}件\n`);
    
    if (usedServiceCodes.rows.length > 0) {
      console.log('   使用されているサービスコード:');
      usedServiceCodes.rows.forEach((row, index) => {
        const status = row.service_code?.startsWith('51') ? '✅' : '❌';
        console.log(`   ${status} ${index + 1}. ${row.service_code || '(マスタに存在しない)'} - ${row.service_name || '(マスタに存在しない)'} (${row.insurance_type || '不明'}) (${row.count}件)`);
        
        if (!row.service_code || !row.service_code.startsWith('51')) {
          hasErrors = true;
        }
      });
      console.log('');
    }

    // 4. 加算計算履歴のサービスコードID参照の整合性
    console.log('📊 4. 加算計算履歴のサービスコードID参照の整合性:');
    console.log('─'.repeat(60));
    
    const bonusIntegrity = await db.execute<{
      total_bonuses: number;
      bonuses_with_service_code: number;
      bonuses_with_null_service_code: number;
      invalid_references: number;
      wrong_code_references: number;
    }>(sql`
      SELECT 
        COUNT(*) as total_bonuses,
        COUNT(*) FILTER (WHERE service_code_id IS NOT NULL) as bonuses_with_service_code,
        COUNT(*) FILTER (WHERE service_code_id IS NULL) as bonuses_with_null_service_code,
        COUNT(*) FILTER (
          WHERE service_code_id IS NOT NULL 
          AND NOT EXISTS (
            SELECT 1 FROM nursing_service_codes nsc 
            WHERE nsc.id = bonus_calculation_history.service_code_id
          )
        ) as invalid_references,
        COUNT(*) FILTER (
          WHERE service_code_id IS NOT NULL 
          AND EXISTS (
            SELECT 1 FROM nursing_service_codes nsc 
            WHERE nsc.id = bonus_calculation_history.service_code_id 
            AND nsc.service_code LIKE '31%'
          )
        ) as wrong_code_references
      FROM bonus_calculation_history
    `);
    
    const bonusStats = bonusIntegrity.rows[0];
    console.log(`   総加算計算履歴数: ${bonusStats?.total_bonuses || 0}件`);
    console.log(`   サービスコード設定済み: ${bonusStats?.bonuses_with_service_code || 0}件`);
    console.log(`   サービスコード未設定: ${bonusStats?.bonuses_with_null_service_code || 0}件`);
    console.log(`   参照先が存在しない: ${bonusStats?.invalid_references || 0}件`);
    console.log(`   誤ったコードを参照: ${bonusStats?.wrong_code_references || 0}件\n`);
    
    if (Number(bonusStats?.invalid_references || 0) > 0) {
      console.error(`   ❌ エラー: 参照先が存在しないレコードが ${bonusStats.invalid_references}件 あります。\n`);
      hasErrors = true;
    } else {
      console.log('   ✅ 参照先が存在しないレコードはありません。\n');
    }
    
    if (Number(bonusStats?.wrong_code_references || 0) > 0) {
      console.error(`   ❌ エラー: 誤ったコードを参照しているレコードが ${bonusStats.wrong_code_references}件 あります。\n`);
      hasErrors = true;
    } else {
      console.log('   ✅ 誤ったコードを参照しているレコードはありません。\n');
    }

    // 5. 重複データの確認
    console.log('📊 5. 重複データの確認:');
    console.log('─'.repeat(60));
    
    const duplicateBonusHistory = await db.execute<{
      nursing_record_id: string;
      bonus_master_id: string;
      count: number;
    }>(sql`
      SELECT 
        nursing_record_id,
        bonus_master_id,
        COUNT(*) as count
      FROM bonus_calculation_history
      GROUP BY nursing_record_id, bonus_master_id
      HAVING COUNT(*) > 1
    `);
    
    const duplicateCount = duplicateBonusHistory.rows.length;
    console.log(`   bonus_calculation_historyの重複組み合わせ数: ${duplicateCount}件\n`);
    
    if (duplicateCount > 0) {
      console.error(`   ❌ エラー: 重複データが ${duplicateCount}件 存在します。\n`);
      hasErrors = true;
    } else {
      console.log('   ✅ 重複データは存在しません。\n');
    }

    // 6. ユニークインデックスの確認
    console.log('📊 6. ユニークインデックスの確認:');
    console.log('─'.repeat(60));
    
    const uniqueIndex = await db.execute<{
      indexname: string;
      tablename: string;
    }>(sql`
      SELECT
        indexname,
        tablename
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'bonus_calculation_history'
        AND indexname = 'unique_nursing_record_bonus_master'
    `);
    
    if (uniqueIndex.rows.length > 0) {
      console.log('   ✅ unique_nursing_record_bonus_master インデックスが存在します。\n');
    } else {
      console.error('   ❌ エラー: unique_nursing_record_bonus_master インデックスが存在しません。\n');
      hasErrors = true;
    }

    // 7. 月次レセプトとの関連確認
    console.log('📊 7. 月次レセプトとの関連確認:');
    console.log('─'.repeat(60));
    
    const monthlyReceipts = await db.execute<{
      total_receipts: number;
      receipts_with_records: number;
    }>(sql`
      SELECT 
        COUNT(*) as total_receipts,
        COUNT(DISTINCT mr.id) FILTER (
          WHERE EXISTS (
            SELECT 1 FROM nursing_records nr 
            WHERE nr.facility_id = mr.facility_id
              AND EXTRACT(YEAR FROM nr.visit_date) = mr.target_year
              AND EXTRACT(MONTH FROM nr.visit_date) = mr.target_month
          )
        ) as receipts_with_records
      FROM monthly_receipts mr
    `);
    
    const receiptStats = monthlyReceipts.rows[0];
    console.log(`   総月次レセプト数: ${receiptStats?.total_receipts || 0}件`);
    console.log(`   訪問記録が関連するレセプト数: ${receiptStats?.receipts_with_records || 0}件\n`);
    
    if (Number(receiptStats?.total_receipts || 0) > 0) {
      console.log('   ℹ️  月次レセプトが存在します。サービスコードの変更による影響がないか確認してください。\n');
      hasWarnings = true;
    } else {
      console.log('   ✅ 月次レセプトは存在しません。影響はありません。\n');
    }

    // 8. サマリー
    console.log('📊 8. チェック結果のサマリー:');
    console.log('─'.repeat(60));
    
    if (hasErrors) {
      console.error('\n   ❌ エラーが検出されました。');
      console.error('      上記のエラーを確認して修正してください。\n');
      process.exit(1);
    } else if (hasWarnings) {
      console.log('\n   ⚠️  警告が検出されました。');
      console.log('      上記の警告を確認してください。\n');
    } else {
      console.log('\n   ✅ すべてのチェックが成功しました。');
      console.log('      データ整合性に問題はありません。\n');
    }

    console.log('─'.repeat(60));
    console.log('✅ 包括的なデータチェックが完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

comprehensiveDataCheck()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

