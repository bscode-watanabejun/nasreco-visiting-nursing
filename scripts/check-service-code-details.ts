/**
 * サービスコードの詳細を確認するスクリプト（読み取り専用）
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from "ws";

neonConfig.webSocketConstructor = ws;

if (!process.env.DEV_DATABASE_URL || !process.env.PROD_DATABASE_URL) {
  console.error('❌ DEV_DATABASE_URL と PROD_DATABASE_URL 環境変数が必要です');
  process.exit(1);
}

const devPool = new Pool({ connectionString: process.env.DEV_DATABASE_URL });
const prodPool = new Pool({ connectionString: process.env.PROD_DATABASE_URL });

async function checkServiceCodeDetails() {
  console.log('🔍 サービスコードの詳細確認...\n');

  try {
    // 本番環境で使用されているサービスコードIDの詳細
    const prodUsedServiceCodeId = await prodPool.query(`
      SELECT DISTINCT nr.service_code_id, nsc.service_code, nsc.service_name, nsc.insurance_type, nsc.points
      FROM nursing_records nr
      LEFT JOIN nursing_service_codes nsc ON nr.service_code_id = nsc.id
      WHERE nr.service_code_id IS NOT NULL
      LIMIT 10;
    `);

    console.log('📋 本番環境で使用されているサービスコード:');
    prodUsedServiceCodeId.rows.forEach((row: any, index: number) => {
      console.log(`\n  ${index + 1}. ID: ${row.service_code_id}`);
      if (row.service_code) {
        console.log(`     サービスコード: ${row.service_code}`);
        console.log(`     名称: ${row.service_name}`);
        console.log(`     保険種別: ${row.insurance_type}`);
        console.log(`     点数: ${row.points}`);
      } else {
        console.log(`     ⚠️  マスタに存在しません（参照切れ）`);
      }
    });

    // 本番環境のサービスコード「311000110」の詳細
    const prodCode311 = await prodPool.query(`
      SELECT id, service_code, service_name, insurance_type, points, is_active
      FROM nursing_service_codes
      WHERE service_code = '311000110';
    `);

    console.log('\n\n📋 本番環境のサービスコード「311000110」の詳細:');
    if (prodCode311.rows.length > 0) {
      const code = prodCode311.rows[0];
      console.log(`  ID: ${code.id}`);
      console.log(`  サービスコード: ${code.service_code}`);
      console.log(`  名称: ${code.service_name}`);
      console.log(`  保険種別: ${code.insurance_type}`);
      console.log(`  点数: ${code.points}`);
      console.log(`  有効: ${code.is_active}`);
    } else {
      console.log('  ⚠️  見つかりませんでした');
    }

    // 開発環境に「311000110」が存在するか確認
    const devCode311 = await devPool.query(`
      SELECT id, service_code, service_name, insurance_type, points, is_active
      FROM nursing_service_codes
      WHERE service_code = '311000110';
    `);

    console.log('\n📋 開発環境のサービスコード「311000110」の確認:');
    if (devCode311.rows.length > 0) {
      const code = devCode311.rows[0];
      console.log(`  ✅ 存在します`);
      console.log(`  ID: ${code.id}`);
      console.log(`  サービスコード: ${code.service_code}`);
      console.log(`  名称: ${code.service_name}`);
      console.log(`  保険種別: ${code.insurance_type}`);
      console.log(`  点数: ${code.points}`);
      console.log(`  有効: ${code.is_active}`);
      
      // IDが異なるか確認
      if (prodCode311.rows.length > 0 && prodCode311.rows[0].id !== code.id) {
        console.log(`\n  ⚠️  IDが異なります:`);
        console.log(`    本番: ${prodCode311.rows[0].id}`);
        console.log(`    開発: ${code.id}`);
      }
    } else {
      console.log('  ⚠️  開発環境に存在しません');
    }

    // 本番環境で使用されているレコードの件数
    const prodRecordCount = await prodPool.query(`
      SELECT COUNT(*) as count
      FROM nursing_records
      WHERE service_code_id IS NOT NULL;
    `);

    console.log(`\n\n📊 本番環境でサービスコードが選択されているレコード数: ${prodRecordCount.rows[0].count}件`);

    // 本番環境のサービスコード一覧（最初の10件）
    const prodServiceCodesSample = await prodPool.query(`
      SELECT service_code, service_name, insurance_type, points
      FROM nursing_service_codes
      ORDER BY service_code
      LIMIT 10;
    `);

    console.log('\n📋 本番環境のサービスコード一覧（サンプル10件）:');
    prodServiceCodesSample.rows.forEach((code: any, index: number) => {
      console.log(`  ${index + 1}. ${code.service_code} - ${code.service_name.substring(0, 50)}... (${code.insurance_type}, ${code.points}点)`);
    });

    // 開発環境のサービスコード一覧（最初の10件）
    const devServiceCodesSample = await devPool.query(`
      SELECT service_code, service_name, insurance_type, points
      FROM nursing_service_codes
      ORDER BY service_code
      LIMIT 10;
    `);

    console.log('\n📋 開発環境のサービスコード一覧（サンプル10件）:');
    devServiceCodesSample.rows.forEach((code: any, index: number) => {
      console.log(`  ${index + 1}. ${code.service_code} - ${code.service_name.substring(0, 50)}... (${code.insurance_type}, ${code.points}点)`);
    });

  } catch (error: any) {
    console.error('❌ エラーが発生しました:', error.message);
    console.error(error);
  } finally {
    await devPool.end();
    await prodPool.end();
  }
}

checkServiceCodeDetails();


