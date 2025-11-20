/**
 * bonus_calculation_historyテーブルの差分を詳細に確認するスクリプト
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const devPool = new Pool({ connectionString: process.env.DEV_DATABASE_URL! });
const prodPool = new Pool({ connectionString: process.env.PROD_DATABASE_URL! });

async function checkDifference() {
  console.log('🔍 bonus_calculation_historyテーブルの詳細比較...\n');

  try {
    // 開発環境のカラム情報
    const devColumns = await devPool.query(`
      SELECT 
        column_name,
        data_type,
        character_maximum_length,
        is_nullable,
        column_default
      FROM information_schema.columns 
      WHERE table_name = 'bonus_calculation_history'
        AND table_schema = 'public'
      ORDER BY ordinal_position;
    `);

    // 本番環境のカラム情報
    const prodColumns = await prodPool.query(`
      SELECT 
        column_name,
        data_type,
        character_maximum_length,
        is_nullable,
        column_default
      FROM information_schema.columns 
      WHERE table_name = 'bonus_calculation_history'
        AND table_schema = 'public'
      ORDER BY ordinal_position;
    `);

    console.log('📋 開発環境のカラム:');
    devColumns.rows.forEach((col: any, index: number) => {
      const length = col.character_maximum_length ? `(${col.character_maximum_length})` : '';
      console.log(`  ${index + 1}. ${col.column_name}: ${col.data_type}${length} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'} ${col.column_default ? `DEFAULT ${col.column_default}` : ''}`);
    });

    console.log('\n📋 本番環境のカラム:');
    prodColumns.rows.forEach((col: any, index: number) => {
      const length = col.character_maximum_length ? `(${col.character_maximum_length})` : '';
      console.log(`  ${index + 1}. ${col.column_name}: ${col.data_type}${length} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'} ${col.column_default ? `DEFAULT ${col.column_default}` : ''}`);
    });

    // 差分を確認
    const devColumnNames = new Set(devColumns.rows.map((r: any) => r.column_name));
    const prodColumnNames = new Set(prodColumns.rows.map((r: any) => r.column_name));

    const missingInProd = Array.from(devColumnNames).filter(c => !prodColumnNames.has(c));
    const missingInDev = Array.from(prodColumnNames).filter(c => !devColumnNames.has(c));

    console.log('\n⚠️  差分:');
    if (missingInProd.length > 0) {
      console.log(`  本番環境に不足しているカラム: ${missingInProd.join(', ')}`);
    }
    if (missingInDev.length > 0) {
      console.log(`  開発環境に不足しているカラム: ${missingInDev.join(', ')}`);
    }
    if (missingInProd.length === 0 && missingInDev.length === 0) {
      console.log('  カラム名は一致しています（型や制約が異なる可能性があります）');
    }

  } catch (error: any) {
    console.error('❌ エラーが発生しました:', error.message);
    console.error(error);
  } finally {
    await devPool.end();
    await prodPool.end();
  }
}

checkDifference();












