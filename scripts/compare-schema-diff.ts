/**
 * スキーマ定義と本番DBの差分を確認するスクリプト（読み取り専用）
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from "ws";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL環境変数が設定されていません');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function compareSchema() {
  console.log('🔍 スキーマ定義と本番DBの差分を確認中...\n');

  try {
    // 主要テーブルのカラムを詳細に確認
    const tablesToCheck = [
      'companies',
      'facilities', 
      'users',
      'patients',
      'nursing_records'
    ];

    for (const tableName of tablesToCheck) {
      console.log(`\n📋 ${tableName}テーブル:`);
      
      const columnsResult = await pool.query(`
        SELECT 
          column_name,
          data_type,
          character_maximum_length,
          is_nullable,
          column_default
        FROM information_schema.columns 
        WHERE table_name = $1
          AND table_schema = 'public'
        ORDER BY ordinal_position;
      `, [tableName]);

      if (columnsResult.rows.length === 0) {
        console.log(`  ⚠️  テーブルが存在しません`);
        continue;
      }

      console.log(`  カラム数: ${columnsResult.rows.length}`);
      columnsResult.rows.forEach((col: any) => {
        const length = col.character_maximum_length ? `(${col.character_maximum_length})` : '';
        const nullable = col.is_nullable === 'NO' ? ' NOT NULL' : '';
        const defaultValue = col.column_default ? ` DEFAULT ${col.column_default}` : '';
        console.log(`    - ${col.column_name}: ${col.data_type}${length}${nullable}${defaultValue}`);
      });
    }

    // 制約の確認
    console.log('\n\n🔗 制約の確認:');
    
    // UNIQUE制約
    const uniqueConstraints = await pool.query(`
      SELECT
        tc.table_name,
        kcu.column_name,
        tc.constraint_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.constraint_type = 'UNIQUE'
        AND tc.table_schema = 'public'
        AND tc.table_name IN ('companies', 'facilities', 'users', 'patients')
      ORDER BY tc.table_name, kcu.column_name;
    `);

    if (uniqueConstraints.rows.length > 0) {
      console.log('  UNIQUE制約:');
      uniqueConstraints.rows.forEach((constraint: any) => {
        console.log(`    ${constraint.table_name}.${constraint.column_name}`);
      });
    }

    // インデックスの確認
    console.log('\n インデックス:');
    const indexesResult = await pool.query(`
      SELECT
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('companies', 'facilities', 'users', 'patients', 'nursing_records')
      ORDER BY tablename, indexname;
    `);

    if (indexesResult.rows.length > 0) {
      indexesResult.rows.forEach((idx: any) => {
        console.log(`    ${idx.tablename}.${idx.indexname}`);
      });
    }

  } catch (error: any) {
    console.error('❌ エラーが発生しました:', error.message);
    console.error(error);
  } finally {
    await pool.end();
  }
}

compareSchema();


