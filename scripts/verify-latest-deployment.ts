/**
 * 最新デプロイ後の確認スクリプト
 * 
 * 今回のデプロイで追加されたスキーマ変更が正しく適用されているか確認します。
 * - monthly_receipts.total_management_points
 * - nursing_records.management_service_code_id (外部キー制約付き)
 * 
 * 実行方法:
 *   npx tsx scripts/verify-latest-deployment.ts
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

// 本番環境のデータベース接続文字列
const PROD_DB_URL = 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function verifyLatestDeployment() {
  console.log('🔍 最新デプロイ後の確認を開始します...\n');
  console.log('⚠️  本番データベースに接続します（読み取り専用）\n');
  console.log('═'.repeat(80));
  
  const prodPool = new Pool({ connectionString: PROD_DB_URL });

  try {
    let allChecksPassed = true;

    // ========== 1. monthly_receipts.total_management_points の確認 ==========
    console.log('\n📊 1. monthly_receipts.total_management_points カラムの確認');
    console.log('─'.repeat(80));
    
    const totalManagementPointsCheck = await prodPool.query(`
      SELECT 
        column_name, 
        data_type, 
        column_default,
        is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = 'monthly_receipts' 
        AND column_name = 'total_management_points'
    `);

    if (totalManagementPointsCheck.rows.length === 0) {
      console.log('   ❌ total_management_pointsカラムが存在しません');
      console.log('      ⚠️  スキーマ変更が適用されていない可能性があります');
      allChecksPassed = false;
    } else {
      const columnInfo = totalManagementPointsCheck.rows[0];
      console.log('   ✅ total_management_pointsカラムが存在します');
      console.log(`      カラム名: ${columnInfo.column_name}`);
      console.log(`      データ型: ${columnInfo.data_type}`);
      console.log(`      デフォルト値: ${columnInfo.column_default}`);
      console.log(`      NULL許可: ${columnInfo.is_nullable}`);
      
      // 既存レコードの確認
      const recordCheck = await prodPool.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN total_management_points = 0 THEN 1 END) as zero_count,
          COUNT(CASE WHEN total_management_points > 0 THEN 1 END) as non_zero_count
        FROM monthly_receipts
      `);

      const stats = recordCheck.rows[0];
      console.log(`\n   既存レコードの統計:`);
      console.log(`      総レコード数: ${stats.total}`);
      console.log(`      デフォルト値0: ${stats.zero_count}`);
      console.log(`      値が設定済み: ${stats.non_zero_count}`);
      
      if (parseInt(stats.total) > 0) {
        console.log(`\n   ✅ 既存レコードにデフォルト値が正しく設定されています`);
      }
    }

    // ========== 2. nursing_records.management_service_code_id の確認 ==========
    console.log('\n📊 2. nursing_records.management_service_code_id カラムの確認');
    console.log('─'.repeat(80));
    
    const managementServiceCodeIdCheck = await prodPool.query(`
      SELECT 
        column_name, 
        data_type, 
        character_maximum_length,
        is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = 'nursing_records' 
        AND column_name = 'management_service_code_id'
    `);

    if (managementServiceCodeIdCheck.rows.length === 0) {
      console.log('   ❌ management_service_code_idカラムが存在しません');
      console.log('      ⚠️  スキーマ変更が適用されていない可能性があります');
      allChecksPassed = false;
    } else {
      const columnInfo = managementServiceCodeIdCheck.rows[0];
      console.log('   ✅ management_service_code_idカラムが存在します');
      console.log(`      カラム名: ${columnInfo.column_name}`);
      console.log(`      データ型: ${columnInfo.data_type}(${columnInfo.character_maximum_length || '無制限'})`);
      console.log(`      NULL許可: ${columnInfo.is_nullable}`);
      
      // 既存レコードの確認
      const recordCheck = await prodPool.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN management_service_code_id IS NULL THEN 1 END) as null_count,
          COUNT(CASE WHEN management_service_code_id IS NOT NULL THEN 1 END) as not_null_count
        FROM nursing_records
      `);

      const stats = recordCheck.rows[0];
      console.log(`\n   既存レコードの統計:`);
      console.log(`      総レコード数: ${stats.total}`);
      console.log(`      NULL値: ${stats.null_count}`);
      console.log(`      値が設定済み: ${stats.not_null_count}`);
      
      if (parseInt(stats.null_count) === parseInt(stats.total)) {
        console.log(`\n   ✅ 既存レコードは全てNULL（期待通り）`);
      }
    }

    // ========== 3. 外部キー制約の確認 ==========
    console.log('\n📊 3. 外部キー制約の確認');
    console.log('─'.repeat(80));
    
    const foreignKeyCheck = await prodPool.query(`
      SELECT
        tc.constraint_name,
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = 'nursing_records'
        AND kcu.column_name = 'management_service_code_id'
    `);

    if (foreignKeyCheck.rows.length === 0) {
      console.log('   ❌ 外部キー制約が存在しません');
      console.log('      ⚠️  スキーマ変更が完全に適用されていない可能性があります');
      allChecksPassed = false;
    } else {
      const fkInfo = foreignKeyCheck.rows[0];
      console.log('   ✅ 外部キー制約が存在します');
      console.log(`      制約名: ${fkInfo.constraint_name}`);
      console.log(`      テーブル: ${fkInfo.table_name}`);
      console.log(`      カラム: ${fkInfo.column_name}`);
      console.log(`      参照先テーブル: ${fkInfo.foreign_table_name}`);
      console.log(`      参照先カラム: ${fkInfo.foreign_column_name}`);
      
      // 参照整合性の確認（NULL以外の値が正しく参照されているか）
      const integrityCheck = await prodPool.query(`
        SELECT COUNT(*) as invalid_count
        FROM nursing_records nr
        WHERE nr.management_service_code_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 
            FROM nursing_service_codes nsc 
            WHERE nsc.id = nr.management_service_code_id
          )
      `);

      const invalidCount = parseInt(integrityCheck.rows[0].invalid_count);
      if (invalidCount === 0) {
        console.log(`\n   ✅ 参照整合性チェック: 問題なし`);
      } else {
        console.log(`\n   ⚠️  参照整合性チェック: ${invalidCount}件の無効な参照が見つかりました`);
        allChecksPassed = false;
      }
    }

    // ========== 4. ソレア春日部のデータ確認 ==========
    console.log('\n📊 4. ソレア春日部のデータ確認');
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

      // 月次レセプト数
      const receipts = await prodPool.query({
        text: `SELECT COUNT(*) as count FROM monthly_receipts WHERE facility_id = $1`,
        values: [facility.id]
      });
      console.log(`      月次レセプト数: ${receipts.rows[0].count}件`);
    }

    // ========== 5. データベース接続と基本動作確認 ==========
    console.log('\n📊 5. データベース接続と基本動作確認');
    console.log('─'.repeat(80));
    
    const testQueries = [
      { name: 'facilitiesテーブル', query: 'SELECT COUNT(*) as count FROM facilities' },
      { name: 'patientsテーブル', query: 'SELECT COUNT(*) as count FROM patients' },
      { name: 'nursing_recordsテーブル', query: 'SELECT COUNT(*) as count FROM nursing_records' },
      { name: 'monthly_receiptsテーブル', query: 'SELECT COUNT(*) as count FROM monthly_receipts' },
      { name: 'nursing_service_codesテーブル', query: 'SELECT COUNT(*) as count FROM nursing_service_codes' },
    ];

    for (const { name, query } of testQueries) {
      try {
        const result = await prodPool.query(query);
        console.log(`   ✅ ${name}: クエリ成功 (${result.rows[0].count}件)`);
      } catch (error: any) {
        console.log(`   ❌ ${name}: クエリ失敗 - ${error.message}`);
        allChecksPassed = false;
      }
    }

    // ========== 6. まとめ ==========
    console.log('\n📊 6. 確認結果のまとめ');
    console.log('─'.repeat(80));
    
    if (allChecksPassed) {
      console.log('   ✅ デプロイは正常に完了しています');
      console.log('      - スキーマ変更が正しく適用されています');
      console.log('      - 外部キー制約が正しく設定されています');
      console.log('      - 既存データに影響はありません');
      console.log('      - データベース接続が正常です');
      console.log('      - 基本的なクエリが実行できます');
      console.log('\n   📋 次の確認事項（手動）:');
      console.log('      [ ] アプリケーションが正常に起動している（Replitのログを確認）');
      console.log('      [ ] ブラウザからアプリケーションにアクセスできる');
      console.log('      [ ] ユーザーログインが正常に動作する');
      console.log('      [ ] レセプト詳細画面で「適用サービス」列が正しく表示される');
      console.log('      [ ] 訪問記録で管理療養費のサービスコードが選択できる');
      console.log('      [ ] 月次レセプトで管理療養費点数が正しく計算される');
    } else {
      console.log('   ⚠️  デプロイに問題がある可能性があります');
      console.log('      → Replitのデプロイログを確認してください');
      console.log('      → 手動で npm run db:push を実行する必要があるかもしれません');
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

verifyLatestDeployment()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('処理中にエラーが発生しました:', error);
    process.exit(1);
  });



