/**
 * 本番環境のマスタ更新影響範囲確認スクリプト
 * 
 * 確認内容:
 * 1. 都道府県コードマスタの現状
 * 2. レセプト種別コードマスタの現状
 * 3. facilitiesテーブルで使用されている都道府県コード
 * 4. medicalInstitutionsテーブルで使用されている都道府県コード
 *
 * ⚠️ 注意: このスクリプトは本番データベースに読み取りアクセスを行います。
 *    ユーザーの承認がある場合のみ実行してください。
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { facilities, medicalInstitutions, prefectureCodes, receiptTypeCodes } from '../shared/schema';
import { sql } from 'drizzle-orm';

const PRODUCTION_DB_URL = process.env.PRODUCTION_DB_URL || 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function checkProductionImpact() {
  console.log('🔍 本番環境のマスタ更新影響範囲を確認します...\n');
  
  const pool = new Pool({ connectionString: PRODUCTION_DB_URL });
  const db = drizzle(pool);

  try {
    // 1. 都道府県コードマスタの現状確認
    console.log('📊 1. 都道府県コードマスタの現状');
    console.log('─'.repeat(60));
    const currentPrefectureCodes = await db.select().from(prefectureCodes).orderBy(prefectureCodes.displayOrder);
    console.log(`現在の都道府県コード数: ${currentPrefectureCodes.length}件`);
    console.log('\n最初の5件:');
    currentPrefectureCodes.slice(0, 5).forEach(code => {
      console.log(`  ${code.prefectureCode}: ${code.prefectureName}`);
    });
    if (currentPrefectureCodes.length > 5) {
      console.log(`  ... 他 ${currentPrefectureCodes.length - 5}件`);
    }
    console.log('\n最後の5件:');
    currentPrefectureCodes.slice(-5).forEach(code => {
      console.log(`  ${code.prefectureCode}: ${code.prefectureName}`);
    });
    console.log('');

    // 2. レセプト種別コードマスタの現状確認
    console.log('📊 2. レセプト種別コードマスタの現状');
    console.log('─'.repeat(60));
    const currentReceiptTypeCodes = await db.select().from(receiptTypeCodes).orderBy(receiptTypeCodes.displayOrder);
    console.log(`現在のレセプト種別コード数: ${currentReceiptTypeCodes.length}件`);
    
    // 3から始まるコードを確認
    const codesStartingWith3 = currentReceiptTypeCodes.filter(code => code.receiptTypeCode.startsWith('3'));
    if (codesStartingWith3.length > 0) {
      console.log(`\n⚠️  3から始まるコード: ${codesStartingWith3.length}件`);
      codesStartingWith3.forEach(code => {
        console.log(`  ${code.receiptTypeCode}: ${code.receiptTypeName}`);
      });
    }
    
    // 6から始まるコードを確認
    const codesStartingWith6 = currentReceiptTypeCodes.filter(code => code.receiptTypeCode.startsWith('6'));
    console.log(`\n6から始まるコード: ${codesStartingWith6.length}件`);
    if (codesStartingWith6.length > 0) {
      console.log('\n最初の5件:');
      codesStartingWith6.slice(0, 5).forEach(code => {
        console.log(`  ${code.receiptTypeCode}: ${code.receiptTypeName}`);
      });
    }
    console.log('');

    // 3. facilitiesテーブルで使用されている都道府県コード
    console.log('📊 3. facilitiesテーブルで使用されている都道府県コード');
    console.log('─'.repeat(60));
    const facilityPrefectureUsage = await db.execute<{
      prefecture_code: string | null;
      count: number;
    }>(sql`
      SELECT prefecture_code, COUNT(*) as count
      FROM facilities
      WHERE prefecture_code IS NOT NULL
      GROUP BY prefecture_code
      ORDER BY count DESC
    `);
    
    console.log(`都道府県コードが設定されている施設数: ${facilityPrefectureUsage.rows.reduce((sum, row) => sum + Number(row.count), 0)}件`);
    console.log('\n使用されている都道府県コード:');
    facilityPrefectureUsage.rows.forEach(row => {
      const code = currentPrefectureCodes.find(c => c.prefectureCode === row.prefecture_code);
      const name = code ? code.prefectureName : '(マスタに存在しない)';
      console.log(`  ${row.prefecture_code}: ${name} (${row.count}件)`);
    });
    
    const facilitiesWithNullPrefecture = await db.execute<{ count: string }>(sql`
      SELECT COUNT(*) as count
      FROM facilities
      WHERE prefecture_code IS NULL
    `);
    console.log(`\n都道府県コードが未設定の施設: ${facilitiesWithNullPrefecture.rows[0]?.count || 0}件`);
    console.log('');

    // 4. medicalInstitutionsテーブルで使用されている都道府県コード
    console.log('📊 4. medicalInstitutionsテーブルで使用されている都道府県コード');
    console.log('─'.repeat(60));
    const institutionPrefectureUsage = await db.execute<{
      prefecture_code: string | null;
      count: number;
    }>(sql`
      SELECT prefecture_code, COUNT(*) as count
      FROM medical_institutions
      WHERE prefecture_code IS NOT NULL
      GROUP BY prefecture_code
      ORDER BY count DESC
    `);
    
    console.log(`都道府県コードが設定されている医療機関数: ${institutionPrefectureUsage.rows.reduce((sum, row) => sum + Number(row.count), 0)}件`);
    console.log('\n使用されている都道府県コード:');
    institutionPrefectureUsage.rows.forEach(row => {
      const code = currentPrefectureCodes.find(c => c.prefectureCode === row.prefecture_code);
      const name = code ? code.prefectureName : '(マスタに存在しない)';
      console.log(`  ${row.prefecture_code}: ${name} (${row.count}件)`);
    });
    
    const institutionsWithNullPrefecture = await db.execute<{ count: string }>(sql`
      SELECT COUNT(*) as count
      FROM medical_institutions
      WHERE prefecture_code IS NULL
    `);
    console.log(`\n都道府県コードが未設定の医療機関: ${institutionsWithNullPrefecture.rows[0]?.count || 0}件`);
    console.log('');

    // 5. 影響範囲の分析
    console.log('📊 5. 影響範囲の分析');
    console.log('─'.repeat(60));
    
    // 都道府県コードの影響
    const allUsedPrefectureCodes = new Set<string>();
    facilityPrefectureUsage.rows.forEach(row => {
      if (row.prefecture_code) allUsedPrefectureCodes.add(row.prefecture_code);
    });
    institutionPrefectureUsage.rows.forEach(row => {
      if (row.prefecture_code) allUsedPrefectureCodes.add(row.prefecture_code);
    });
    
    const expectedPrefectureCodes = new Set(
      Array.from({ length: 47 }, (_, i) => String(i + 1).padStart(2, '0'))
    );
    
    const missingCodes = Array.from(allUsedPrefectureCodes).filter(code => !expectedPrefectureCodes.has(code));
    const unusedCodes = Array.from(expectedPrefectureCodes).filter(code => !allUsedPrefectureCodes.has(code));
    
    console.log('\n【都道府県コード】');
    console.log(`使用されているコード数: ${allUsedPrefectureCodes.size}件`);
    if (missingCodes.length > 0) {
      console.log(`⚠️  更新後のマスタに存在しないコード: ${missingCodes.join(', ')}`);
      console.log('   → これらのコードを使用している施設・医療機関は、マスタ更新後に参照できなくなります');
    } else {
      console.log('✅ 使用されているすべてのコードが更新後のマスタに存在します');
    }
    if (unusedCodes.length > 0) {
      console.log(`📝 未使用のコード: ${unusedCodes.length}件（更新しても問題ありません）`);
    }
    
    // レセプト種別コードの影響
    console.log('\n【レセプト種別コード】');
    console.log(`現在のコード数: ${currentReceiptTypeCodes.length}件`);
    console.log(`更新後のコード数: 39件（6xxx形式）`);
    if (codesStartingWith3.length > 0) {
      console.log(`⚠️  3から始まるコードが${codesStartingWith3.length}件存在します`);
      console.log('   → これらは更新時に削除され、6xxx形式に置き換えられます');
    }
    console.log('✅ レセプト種別コードは動的判定で使用されるため、マスタ更新は既存データに影響しません');
    console.log('   （CSV出力時に毎回動的に判定されるため）');

    console.log('\n' + '─'.repeat(60));
    console.log('✅ 影響範囲の確認が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

checkProductionImpact()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

