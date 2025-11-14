/**
 * 移行後の検証スクリプト
 * 
 * サービスコードマスタの移行後、データ整合性を確認します。
 * 
 * 実行方法:
 *   PRODUCTION_DB_URL="postgresql://..." npx tsx scripts/verify-migration.ts
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { nursingServiceCodes, nursingRecords, bonusCalculationHistory } from '../shared/schema';
import { sql, like, eq } from 'drizzle-orm';

const PROD_DB_URL = process.env.PRODUCTION_DB_URL || 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function verifyMigration() {
  console.log('🔍 移行後の検証を実行します...\n');
  console.log('⚠️  本番データベースに接続します\n');
  
  const pool = new Pool({ connectionString: PROD_DB_URL });
  const db = drizzle(pool);

  try {
    let hasErrors = false;

    // 1. 参照整合性チェック（訪問記録）
    console.log('📊 1. 訪問記録の参照整合性チェック');
    console.log('─'.repeat(60));
    
    const recordIntegrityCheck = await db.execute<{ count: number }>(sql`
      SELECT COUNT(*) as count
      FROM nursing_records nr
      LEFT JOIN nursing_service_codes nsc ON nr.service_code_id = nsc.id
      WHERE nr.service_code_id IS NOT NULL AND nsc.id IS NULL
    `);
    
    const invalidRecordReferences = Number(recordIntegrityCheck.rows[0]?.count || 0);
    
    if (invalidRecordReferences === 0) {
      console.log('   ✅ 訪問記録の参照整合性: OK (0件の不整合)\n');
    } else {
      console.error(`   ❌ 訪問記録の参照整合性: NG (${invalidRecordReferences}件の不整合)\n`);
      hasErrors = true;
    }

    // 2. 参照整合性チェック（加算計算履歴）
    console.log('📊 2. 加算計算履歴の参照整合性チェック');
    console.log('─'.repeat(60));
    
    const bonusIntegrityCheck = await db.execute<{ count: number }>(sql`
      SELECT COUNT(*) as count
      FROM bonus_calculation_history bch
      LEFT JOIN nursing_service_codes nsc ON bch.service_code_id = nsc.id
      WHERE bch.service_code_id IS NOT NULL AND nsc.id IS NULL
    `);
    
    const invalidBonusReferences = Number(bonusIntegrityCheck.rows[0]?.count || 0);
    
    if (invalidBonusReferences === 0) {
      console.log('   ✅ 加算計算履歴の参照整合性: OK (0件の不整合)\n');
    } else {
      console.error(`   ❌ 加算計算履歴の参照整合性: NG (${invalidBonusReferences}件の不整合)\n`);
      hasErrors = true;
    }

    // 3. サービスコードの状態確認
    console.log('📊 3. サービスコードの状態確認');
    console.log('─'.repeat(60));
    
    const allCodes = await db.select().from(nursingServiceCodes);
    const correctCodes = allCodes.filter(c => c.serviceCode.startsWith('51'));
    const wrongCodes = allCodes.filter(c => c.serviceCode.startsWith('31'));
    const activeCorrectCodes = correctCodes.filter(c => c.isActive);
    const activeWrongCodes = wrongCodes.filter(c => c.isActive);
    
    console.log(`   総コード数: ${allCodes.length}件`);
    console.log(`   51から始まる正しいコード: ${correctCodes.length}件`);
    console.log(`   51から始まる正しいコード（有効）: ${activeCorrectCodes.length}件`);
    console.log(`   31から始まる誤ったコード: ${wrongCodes.length}件`);
    console.log(`   31から始まる誤ったコード（有効）: ${activeWrongCodes.length}件\n`);
    
    if (activeCorrectCodes.length > 0 && activeWrongCodes.length === 0) {
      console.log('   ✅ サービスコードの状態: OK\n');
    } else {
      if (activeCorrectCodes.length === 0) {
        console.error('   ❌ エラー: 正しいコード（51から始まる）が有効化されていません。\n');
        hasErrors = true;
      }
      if (activeWrongCodes.length > 0) {
        console.error(`   ❌ エラー: 誤ったコード（31から始まる）が ${activeWrongCodes.length}件 まだ有効です。\n`);
        hasErrors = true;
      }
    }

    // 4. 訪問記録のサービスコードID確認
    console.log('📊 4. 訪問記録のサービスコードID確認');
    console.log('─'.repeat(60));
    
    const recordsWithServiceCode = await db.execute<{
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
    
    console.log(`   サービスコードが設定されている訪問記録数: ${recordsWithServiceCode.rows.reduce((sum, row) => sum + Number(row.count), 0)}件\n`);
    
    if (recordsWithServiceCode.rows.length > 0) {
      console.log('   使用されているサービスコード:');
      recordsWithServiceCode.rows.forEach((row, index) => {
        const status = row.service_code?.startsWith('51') ? '✅' : '❌';
        console.log(`   ${status} ${index + 1}. ${row.service_code || '(マスタに存在しない)'} - ${row.service_name || '(マスタに存在しない)'} (${row.count}件)`);
        
        if (!row.service_code || !row.service_code.startsWith('51')) {
          hasErrors = true;
        }
      });
      console.log('');
    }

    // 5. 検証結果のサマリー
    console.log('📊 5. 検証結果のサマリー');
    console.log('─'.repeat(60));
    
    if (hasErrors) {
      console.error('   ❌ 検証結果: NG (エラーが検出されました)\n');
      console.error('   以下の問題を確認してください:');
      if (invalidRecordReferences > 0) {
        console.error(`   - 訪問記録の参照整合性エラー: ${invalidRecordReferences}件`);
      }
      if (invalidBonusReferences > 0) {
        console.error(`   - 加算計算履歴の参照整合性エラー: ${invalidBonusReferences}件`);
      }
      if (activeCorrectCodes.length === 0) {
        console.error('   - 正しいコードが有効化されていません');
      }
      if (activeWrongCodes.length > 0) {
        console.error(`   - 誤ったコードが ${activeWrongCodes.length}件 まだ有効です`);
      }
      console.log('');
      process.exit(1);
    } else {
      console.log('   ✅ 検証結果: OK (すべてのチェックが成功しました)\n');
      console.log('✅ 移行後の検証が完了しました。\n');
    }

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

verifyMigration()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

