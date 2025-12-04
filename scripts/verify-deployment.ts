/**
 * デプロイ後の確認スクリプト
 * 
 * Replit再デプロイ後に、スキーマ変更が正しく適用されているか確認します。
 * 
 * 実行方法:
 *   npx tsx scripts/verify-deployment.ts
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

// 本番環境のデータベース接続文字列
const PROD_DB_URL = 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function verifyDeployment() {
  console.log('🔍 デプロイ後の確認を開始します...\n');
  console.log('⚠️  本番データベースに接続します（読み取り専用）\n');
  console.log('═'.repeat(80));
  
  const prodPool = new Pool({ connectionString: PROD_DB_URL });

  try {
    // ========== 1. スキーマ変更の確認 ==========
    console.log('\n📊 1. スキーマ変更の確認');
    console.log('─'.repeat(80));
    
    // doctor_ordersテーブルのdisease_presence_codeカラムの存在確認
    const columnCheck = await prodPool.query(`
      SELECT 
        column_name, 
        data_type, 
        character_maximum_length,
        column_default,
        is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = 'doctor_orders' 
        AND column_name = 'disease_presence_code'
    `);

    if (columnCheck.rows.length === 0) {
      console.log('   ❌ disease_presence_codeカラムが存在しません');
      console.log('      ⚠️  スキーマ変更が適用されていない可能性があります');
      console.log('      → Replitのデプロイログを確認してください');
      console.log('      → 手動で npm run db:push を実行する必要があるかもしれません');
    } else {
      const columnInfo = columnCheck.rows[0];
      console.log('   ✅ disease_presence_codeカラムが存在します');
      console.log(`      カラム名: ${columnInfo.column_name}`);
      console.log(`      データ型: ${columnInfo.data_type}(${columnInfo.character_maximum_length})`);
      console.log(`      デフォルト値: ${columnInfo.column_default}`);
      console.log(`      NULL許可: ${columnInfo.is_nullable}`);
      
      // 既存レコードの確認
      const recordCheck = await prodPool.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN disease_presence_code = '03' THEN 1 END) as default_count,
          COUNT(CASE WHEN disease_presence_code IS NULL THEN 1 END) as null_count,
          COUNT(CASE WHEN disease_presence_code IN ('01', '02') THEN 1 END) as custom_count
        FROM doctor_orders
      `);

      const stats = recordCheck.rows[0];
      console.log(`\n   既存レコードの統計:`);
      console.log(`      総レコード数: ${stats.total}`);
      console.log(`      デフォルト値'03'設定済み: ${stats.default_count}`);
      console.log(`      カスタム値（01/02）設定済み: ${stats.custom_count}`);
      console.log(`      NULL値: ${stats.null_count}`);

      if (parseInt(stats.null_count) > 0) {
        console.log(`\n   ⚠️  警告: ${stats.null_count}件のレコードがNULLのままです`);
        console.log(`      → マイグレーションスクリプトを実行する必要があるかもしれません`);
      } else {
        console.log(`\n   ✅ すべてのレコードに値が設定されています`);
      }
    }

    // ========== 2. ソレア春日部のデータ確認 ==========
    console.log('\n📊 2. ソレア春日部のデータ確認');
    console.log('─'.repeat(80));
    
    const soleraFacility = await prodPool.query(`
      SELECT id, name, facility_code, prefecture_code
      FROM facilities
      WHERE (name LIKE '%ソレア%' OR name LIKE '%春日部%')
        AND is_active = true
      LIMIT 1
    `);

    if (soleraFacility.rows.length === 0) {
      console.log('   ⚠️  ソレア春日部の施設が見つかりませんでした');
    } else {
      const facility = soleraFacility.rows[0];
      console.log(`   ✅ 施設情報を確認:`);
      console.log(`      名称: ${facility.name}`);
      console.log(`      ID: ${facility.id}`);
      console.log(`      施設コード: ${facility.facility_code || '未設定'}`);

      // 患者数
      const patients = await prodPool.query({
        text: `SELECT COUNT(*) as count FROM patients WHERE facility_id = $1 AND is_active = true`,
        values: [facility.id]
      });
      console.log(`      アクティブ患者数: ${patients.rows[0].count}名`);

      // 訪問記録数
      const records = await prodPool.query({
        text: `SELECT COUNT(*) as count FROM nursing_records WHERE facility_id = $1`,
        values: [facility.id]
      });
      console.log(`      訪問記録数: ${records.rows[0].count}件`);

      // ユーザー数
      const users = await prodPool.query({
        text: `SELECT COUNT(*) as count FROM users WHERE facility_id = $1`,
        values: [facility.id]
      });
      console.log(`      ユーザー数: ${users.rows[0].count}名`);
    }

    // ========== 3. アプリケーションの動作確認（データベースレベル） ==========
    console.log('\n📊 3. データベース接続と基本動作確認');
    console.log('─'.repeat(80));
    
    // 基本的なクエリが実行できるか確認
    const testQueries = [
      { name: 'facilitiesテーブル', query: 'SELECT COUNT(*) as count FROM facilities' },
      { name: 'patientsテーブル', query: 'SELECT COUNT(*) as count FROM patients' },
      { name: 'doctor_ordersテーブル', query: 'SELECT COUNT(*) as count FROM doctor_orders' },
      { name: 'nursing_recordsテーブル', query: 'SELECT COUNT(*) as count FROM nursing_records' },
    ];

    let allQueriesPassed = true;
    for (const { name, query } of testQueries) {
      try {
        const result = await prodPool.query(query);
        console.log(`   ✅ ${name}: クエリ成功 (${result.rows[0].count}件)`);
      } catch (error: any) {
        console.log(`   ❌ ${name}: クエリ失敗 - ${error.message}`);
        allQueriesPassed = false;
      }
    }

    // ========== 4. まとめ ==========
    console.log('\n📊 4. 確認結果のまとめ');
    console.log('─'.repeat(80));
    
    const schemaApplied = columnCheck.rows.length > 0;
    
    if (schemaApplied && allQueriesPassed) {
      console.log('   ✅ デプロイは正常に完了しています');
      console.log('      - スキーマ変更が適用されています');
      console.log('      - データベース接続が正常です');
      console.log('      - 基本的なクエリが実行できます');
      console.log('\n   📋 次の確認事項:');
      console.log('      [ ] アプリケーションが正常に起動している（Replitのログを確認）');
      console.log('      [ ] ブラウザからアプリケーションにアクセスできる');
      console.log('      [ ] ユーザーログインが正常に動作する');
      console.log('      [ ] 訪問看護指示書編集画面で「基準告示第2の1に規定する疾病等の有無」が選択できる');
      console.log('      [ ] レセプトCSV出力でJSレコードの3番目のフィールドに値が出力される');
    } else {
      console.log('   ⚠️  デプロイに問題がある可能性があります');
      if (!schemaApplied) {
        console.log('      - スキーマ変更が適用されていません');
        console.log('      → Replitのデプロイログを確認してください');
        console.log('      → 手動で npm run db:push を実行する必要があるかもしれません');
      }
      if (!allQueriesPassed) {
        console.log('      - データベースクエリに問題があります');
        console.log('      → データベース接続を確認してください');
      }
    }

    console.log('\n' + '═'.repeat(80));
    console.log('✅ デプロイ後の確認が完了しました\n');

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
    process.exit(0);
  })
  .catch((error) => {
    console.error('処理中にエラーが発生しました:', error);
    process.exit(1);
  });











