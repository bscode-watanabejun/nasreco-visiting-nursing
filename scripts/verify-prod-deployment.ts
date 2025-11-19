/**
 * 本番環境デプロイ後の確認スクリプト
 * 
 * デプロイ後の状態を確認します：
 * 1. スキーマ変更が正しく適用されているか
 * 2. 既存データが影響を受けていないか
 * 3. 新機能が正常に動作可能か
 */

import { Pool } from 'pg';

const PROD_DB_URL = 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function verifyDeployment() {
  console.log('🔍 本番環境デプロイ後の確認\n');
  console.log('⚠️  本番データベースに接続します（読み取り専用）\n');
  
  const prodPool = new Pool({ connectionString: PROD_DB_URL });

  try {
    let hasErrors = false;
    let hasWarnings = false;

    // 1. スキーマ変更の確認（monthly_receiptsテーブル）
    console.log('📊 1. スキーマ変更の確認:');
    console.log('─'.repeat(60));
    
    const columns = await prodPool.query(`
      SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'monthly_receipts'
      ORDER BY ordinal_position
    `);
    
    const columnNames = columns.rows.map((r: any) => r.column_name);
    const expectedColumns = [
      'partial_burden_amount',
      'reduction_category',
      'reduction_rate',
      'reduction_amount',
      'certificate_number'
    ];
    
    const missingColumns = expectedColumns.filter(col => !columnNames.includes(col));
    const existingColumns = expectedColumns.filter(col => columnNames.includes(col));
    
    if (missingColumns.length > 0) {
      hasErrors = true;
      console.log(`   ❌ エラー: 以下のカラムが存在しません:`);
      missingColumns.forEach(col => console.log(`      - ${col}`));
      console.log('');
    } else {
      console.log(`   ✅ すべての新規カラムが存在します (${existingColumns.length}個)`);
      existingColumns.forEach(col => {
        const colInfo = columns.rows.find((r: any) => r.column_name === col);
        if (colInfo) {
          let dataType = colInfo.data_type;
          if (colInfo.character_maximum_length) {
            dataType = `${dataType}(${colInfo.character_maximum_length})`;
          }
          console.log(`      - ${col}: ${dataType}, NULL許容: ${colInfo.is_nullable === 'YES' ? 'はい' : 'いいえ'}`);
        }
      });
      console.log('');
    }

    // 2. 既存データの確認
    console.log('📊 2. 既存データの確認:');
    console.log('─'.repeat(60));
    
    const receiptCount = await prodPool.query(`
      SELECT COUNT(*) as count
      FROM monthly_receipts
    `);
    
    console.log(`   総レセプト数: ${receiptCount.rows[0].count}件`);
    
    if (parseInt(receiptCount.rows[0].count) > 0) {
      // 既存レセプトの新規フィールドの値を確認
      const receiptSamples = await prodPool.query(`
        SELECT 
          id,
          partial_burden_amount,
          reduction_category,
          reduction_rate,
          reduction_amount,
          certificate_number
        FROM monthly_receipts
        ORDER BY created_at DESC
        LIMIT 5
      `);
      
      console.log(`\n   最新5件のレセプトの新規フィールド値:`);
      receiptSamples.rows.forEach((r: any, index: number) => {
        console.log(`   ${index + 1}. ID: ${r.id.substring(0, 8)}...`);
        console.log(`      一部負担金額: ${r.partial_burden_amount || 'NULL'}`);
        console.log(`      減免区分: ${r.reduction_category || 'NULL'}`);
        console.log(`      減額割合: ${r.reduction_rate || 'NULL'}`);
        console.log(`      減額金額: ${r.reduction_amount || 'NULL'}`);
        console.log(`      証明書番号: ${r.certificate_number || 'NULL'}`);
      });
      
      // NULL値の確認（すべてNULLであるべき）
      const nullCheck = await prodPool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE partial_burden_amount IS NOT NULL) as has_partial_burden,
          COUNT(*) FILTER (WHERE reduction_category IS NOT NULL) as has_reduction_category,
          COUNT(*) FILTER (WHERE reduction_rate IS NOT NULL) as has_reduction_rate,
          COUNT(*) FILTER (WHERE reduction_amount IS NOT NULL) as has_reduction_amount,
          COUNT(*) FILTER (WHERE certificate_number IS NOT NULL) as has_certificate
        FROM monthly_receipts
      `);
      
      const nullStats = nullCheck.rows[0];
      const hasAnyValues = 
        parseInt(nullStats.has_partial_burden) > 0 ||
        parseInt(nullStats.has_reduction_category) > 0 ||
        parseInt(nullStats.has_reduction_rate) > 0 ||
        parseInt(nullStats.has_reduction_amount) > 0 ||
        parseInt(nullStats.has_certificate) > 0;
      
      if (hasAnyValues) {
        console.log(`\n   ⚠️  警告: 一部のレセプトに新規フィールドの値が設定されています`);
        console.log(`      一部負担金額: ${nullStats.has_partial_burden}件`);
        console.log(`      減免区分: ${nullStats.has_reduction_category}件`);
        console.log(`      減額割合: ${nullStats.has_reduction_rate}件`);
        console.log(`      減額金額: ${nullStats.has_reduction_amount}件`);
        console.log(`      証明書番号: ${nullStats.has_certificate}件`);
        console.log(`      （これは正常です。ユーザーが入力した場合に値が設定されます）`);
        hasWarnings = true;
      } else {
        console.log(`\n   ✅ すべての既存レセプトの新規フィールドはNULLです（正常）`);
      }
    } else {
      console.log(`   ✅ レセプトデータがないため、影響なし`);
    }
    console.log('');

    // 3. 「訪問看護ステーションソレア春日部」のデータ確認
    console.log('📊 3. 「訪問看護ステーションソレア春日部」のデータ確認:');
    console.log('─'.repeat(60));
    
    const facility = await prodPool.query(`
      SELECT id, name, facility_code
      FROM facilities
      WHERE name LIKE '%ソレア%' OR name LIKE '%春日部%'
      LIMIT 1
    `);
    
    if (facility.rows.length > 0) {
      const facilityId = facility.rows[0].id;
      console.log(`   施設: ${facility.rows[0].name} (ID: ${facilityId.substring(0, 8)}...)`);
      
      // ソレア春日部のレセプト確認
      const soleraReceipts = await prodPool.query({
        text: `
          SELECT 
            COUNT(*) as count,
            COUNT(*) FILTER (WHERE is_confirmed = true) as confirmed_count
          FROM monthly_receipts
          WHERE facility_id = $1
        `,
        values: [facilityId]
      });
      
      console.log(`   レセプト数: ${soleraReceipts.rows[0].count}件（確定済み: ${soleraReceipts.rows[0].confirmed_count}件）`);
      
      if (parseInt(soleraReceipts.rows[0].count) > 0) {
        const soleraReceiptSamples = await prodPool.query({
          text: `
            SELECT 
              id,
              target_year,
              target_month,
              insurance_type,
              partial_burden_amount,
              reduction_category
            FROM monthly_receipts
            WHERE facility_id = $1
            ORDER BY created_at DESC
            LIMIT 3
          `,
          values: [facilityId]
        });
        
        console.log(`\n   最新3件のレセプト:`);
        soleraReceiptSamples.rows.forEach((r: any, index: number) => {
          console.log(`   ${index + 1}. ${r.target_year}年${r.target_month}月 (${r.insurance_type === 'medical' ? '医療保険' : '介護保険'})`);
          console.log(`      一部負担金額: ${r.partial_burden_amount || 'NULL'}`);
          console.log(`      減免区分: ${r.reduction_category || 'NULL'}`);
        });
      }
      console.log('');
    } else {
      console.log('   ⚠️  「訪問看護ステーションソレア春日部」が見つかりませんでした。\n');
    }

    // 4. テーブル構造の整合性確認
    console.log('📊 4. テーブル構造の整合性確認:');
    console.log('─'.repeat(60));
    
    const totalColumns = await prodPool.query(`
      SELECT COUNT(*) as count
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'monthly_receipts'
    `);
    
    console.log(`   monthly_receiptsテーブルのカラム数: ${totalColumns.rows[0].count}`);
    
    // 期待されるカラム数（開発環境と一致）
    const expectedColumnCount = 32; // 開発環境のカラム数
    
    if (parseInt(totalColumns.rows[0].count) === expectedColumnCount) {
      console.log(`   ✅ カラム数が期待値と一致しています (${expectedColumnCount}個)`);
    } else {
      hasWarnings = true;
      console.log(`   ⚠️  カラム数が期待値と異なります`);
      console.log(`      期待値: ${expectedColumnCount}個`);
      console.log(`      実際: ${totalColumns.rows[0].count}個`);
    }
    console.log('');

    // 5. データ整合性の最終確認
    console.log('📊 5. データ整合性の最終確認:');
    console.log('─'.repeat(60));
    
    // 既存レセプトのデータが変更されていないか確認
    const dataIntegrityCheck = await prodPool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE total_amount IS NULL) as null_total_amount,
        COUNT(*) FILTER (WHERE total_points IS NULL) as null_total_points,
        COUNT(*) FILTER (WHERE is_confirmed IS NULL) as null_is_confirmed
      FROM monthly_receipts
    `);
    
    const integrity = dataIntegrityCheck.rows[0];
    
    if (parseInt(integrity.null_total_amount) > 0 || 
        parseInt(integrity.null_total_points) > 0 || 
        parseInt(integrity.null_is_confirmed) > 0) {
      hasErrors = true;
      console.log(`   ❌ エラー: 既存の必須フィールドにNULL値が存在します`);
      console.log(`      total_amount: ${integrity.null_total_amount}件`);
      console.log(`      total_points: ${integrity.null_total_points}件`);
      console.log(`      is_confirmed: ${integrity.null_is_confirmed}件`);
    } else {
      console.log(`   ✅ 既存の必須フィールドは正常です`);
      console.log(`      総レセプト数: ${integrity.total}件`);
    }
    console.log('');

    // 6. まとめ
    console.log('📊 6. デプロイ確認のまとめ:');
    console.log('─'.repeat(60));
    
    if (hasErrors) {
      console.log('   ❌ エラーが検出されました。デプロイに問題がある可能性があります。');
    } else if (hasWarnings) {
      console.log('   ⚠️  警告がありますが、デプロイは正常に完了しています。');
      console.log('      警告内容は運用上の違いによるものです。');
    } else {
      console.log('   ✅ デプロイは正常に完了しています。');
      console.log('      - スキーマ変更が正しく適用されました');
      console.log('      - 既存データに影響はありません');
      console.log('      - 新機能が利用可能です');
    }
    console.log('');

    console.log('─'.repeat(60));
    if (hasErrors) {
      console.log('❌ デプロイ確認が完了しました（エラーあり）\n');
      process.exit(1);
    } else {
      console.log('✅ デプロイ確認が完了しました（正常）\n');
      process.exit(0);
    }

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prodPool.end();
  }
}

verifyDeployment()
  .then(() => {
    console.log('処理を終了します。');
  })
  .catch((error) => {
    console.error('処理中にエラーが発生しました:', error);
    process.exit(1);
  });


