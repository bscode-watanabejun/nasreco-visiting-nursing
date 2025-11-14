/**
 * 本番DBのスキーマ状態を確認するスクリプト（読み取り専用）
 * 
 * 注意: このスクリプトはデータベースの状態を変更しません
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from "ws";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL環境変数が設定されていません');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkSchema() {
  console.log('🔍 本番DBのスキーマ状態を確認中...\n');

  try {
    // 1. 主要テーブルの存在確認
    console.log('📋 テーブル一覧:');
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    
    const existingTables = tablesResult.rows.map((r: any) => r.table_name);
    console.log(`  見つかったテーブル数: ${existingTables.length}`);
    console.log(`  ${existingTables.join(', ')}\n`);

    // 2. companiesテーブルの構造確認（重要）
    console.log('🏢 companiesテーブルの構造:');
    const companiesColumns = await pool.query(`
      SELECT 
        column_name, 
        data_type, 
        is_nullable,
        column_default
      FROM information_schema.columns 
      WHERE table_name = 'companies'
      ORDER BY ordinal_position;
    `);
    
    if (companiesColumns.rows.length === 0) {
      console.log('  ⚠️  companiesテーブルが存在しません\n');
    } else {
      console.log('  カラム一覧:');
      companiesColumns.rows.forEach((col: any) => {
        console.log(`    - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? '(NOT NULL)' : '(NULLABLE)'}`);
      });
      console.log('');
    }

    // 3. facilitiesテーブルの構造確認
    console.log('🏥 facilitiesテーブルの構造:');
    const facilitiesColumns = await pool.query(`
      SELECT 
        column_name, 
        data_type, 
        is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'facilities'
      ORDER BY ordinal_position;
    `);
    
    if (facilitiesColumns.rows.length === 0) {
      console.log('  ⚠️  facilitiesテーブルが存在しません\n');
    } else {
      console.log('  カラム一覧:');
      facilitiesColumns.rows.forEach((col: any) => {
        console.log(`    - ${col.column_name}: ${col.data_type}`);
      });
      console.log('');
    }

    // 4. 重要なENUM型の確認
    console.log('📝 ENUM型の確認:');
    const enumsResult = await pool.query(`
      SELECT t.typname as enum_name, 
             array_agg(e.enumlabel ORDER BY e.enumsortorder)::text[] as enum_values
      FROM pg_type t 
      JOIN pg_enum e ON t.oid = e.enumtypid  
      WHERE t.typname IN ('user_role', 'user_access_level', 'gender', 'record_type', 'visit_status', 'record_status', 'insurance_type', 'care_level')
      GROUP BY t.typname
      ORDER BY t.typname;
    `);
    
    if (enumsResult.rows.length > 0) {
      enumsResult.rows.forEach((enumRow: any) => {
        const values = Array.isArray(enumRow.enum_values) 
          ? enumRow.enum_values.join(', ') 
          : String(enumRow.enum_values);
        console.log(`  ${enumRow.enum_name}: [${values}]`);
      });
    } else {
      console.log('  ENUM型が見つかりませんでした');
    }
    console.log('');

    // 5. データ件数の確認
    console.log('📊 データ件数:');
    const tablesToCheck = ['companies', 'facilities', 'users', 'patients', 'nursing_records', 'visits', 'schedules'];
    for (const table of tablesToCheck) {
      try {
        const countResult = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
        console.log(`  ${table}: ${countResult.rows[0].count}件`);
      } catch (err: any) {
        if (err.message.includes('does not exist')) {
          console.log(`  ${table}: テーブルが存在しません`);
        } else {
          console.log(`  ${table}: エラー - ${err.message}`);
        }
      }
    }
    console.log('');

    // 6. 重要な差分チェック
    console.log('⚠️  重要な差分チェック:');
    
    // companiesテーブルにdomainカラムがあるか
    const hasDomain = companiesColumns.rows.some((col: any) => col.column_name === 'domain');
    const hasSlug = companiesColumns.rows.some((col: any) => col.column_name === 'slug');
    
    if (hasDomain && !hasSlug) {
      console.log('  ⚠️  警告: companiesテーブルに"domain"カラムがありますが、"slug"カラムがありません');
      console.log('     これは古いスキーマです。マイグレーション時にデータ移行が必要です。\n');
    } else if (!hasDomain && hasSlug) {
      console.log('  ✅ companiesテーブルは新しいスキーマ（slug）を使用しています\n');
    } else if (hasDomain && hasSlug) {
      console.log('  ⚠️  警告: companiesテーブルに"domain"と"slug"の両方があります\n');
    } else {
      console.log('  ⚠️  警告: companiesテーブルに"domain"も"slug"もありません\n');
    }

    // 7. 期待されるテーブルの存在確認
    const expectedTables = [
      'companies', 'facilities', 'users', 'patients', 'nursing_records',
      'visits', 'schedules', 'medications', 'doctor_orders', 'insurance_cards',
      'medical_institutions', 'care_managers', 'care_plans', 'care_reports',
      'contracts', 'buildings', 'bonus_master', 'monthly_receipts'
    ];
    
    console.log('📋 期待されるテーブルの存在確認:');
    const missingTables = expectedTables.filter(t => !existingTables.includes(t));
    const extraTables = existingTables.filter(t => !expectedTables.includes(t));
    
    if (missingTables.length > 0) {
      console.log(`  ⚠️  不足しているテーブル (${missingTables.length}個):`);
      missingTables.forEach(t => console.log(`    - ${t}`));
    }
    
    if (extraTables.length > 0) {
      console.log(`  ℹ️  追加のテーブル (${extraTables.length}個):`);
      extraTables.forEach(t => console.log(`    - ${t}`));
    }
    
    if (missingTables.length === 0 && extraTables.length === 0) {
      console.log('  ✅ すべての期待されるテーブルが存在します');
    }
    console.log('');

    // 8. 外部キー制約の確認
    console.log('🔗 主要な外部キー制約:');
    const fkResult = await pool.query(`
      SELECT
        tc.table_name, 
        kcu.column_name, 
        ccu.table_name AS foreign_table_name
      FROM information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name IN ('facilities', 'users', 'patients', 'nursing_records')
      ORDER BY tc.table_name, kcu.column_name
      LIMIT 20;
    `);
    
    if (fkResult.rows.length > 0) {
      fkResult.rows.forEach((fk: any) => {
        console.log(`  ${fk.table_name}.${fk.column_name} -> ${fk.foreign_table_name}`);
      });
    }
    console.log('');

  } catch (error: any) {
    console.error('❌ エラーが発生しました:', error.message);
    console.error(error);
  } finally {
    await pool.end();
  }
}

checkSchema();

