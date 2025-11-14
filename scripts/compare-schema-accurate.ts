/**
 * スキーマ差分の正確な確認スクリプト
 * 
 * 本番環境のスキーマとスキーマファイルの定義を正確に比較します。
 * 特に、bonus_calculation_historyテーブルの構造を詳細に確認します。
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';

const PROD_DB_URL = process.env.PRODUCTION_DB_URL || 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function compareSchemaAccurate() {
  console.log('🔍 スキーマ差分の正確な確認を開始します...\n');
  console.log('⚠️  本番データベースに接続します\n');
  
  const pool = new Pool({ connectionString: PROD_DB_URL });
  const db = drizzle(pool);

  try {
    // 1. bonus_calculation_historyテーブルの詳細確認
    console.log('📊 1. bonus_calculation_historyテーブルの詳細確認:');
    console.log('─'.repeat(60));
    
    const bonusTableColumns = await db.execute<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>(sql`
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'bonus_calculation_history'
      ORDER BY ordinal_position
    `);
    
    console.log(`   カラム数: ${bonusTableColumns.rows.length}件\n`);
    console.log('   カラム一覧:');
    bonusTableColumns.rows.forEach((col, index) => {
      const nullable = col.is_nullable === 'YES' ? 'NULL可' : 'NULL不可';
      const defaultValue = col.column_default ? ` (デフォルト: ${col.column_default})` : '';
      console.log(`     ${index + 1}. ${col.column_name}: ${col.data_type} ${nullable}${defaultValue}`);
    });
    
    // スキーマファイルで定義されているカラム（手動で確認）
    const schemaColumns = [
      'id',
      'nursing_record_id',
      'bonus_master_id',
      'calculated_points',
      'applied_version',
      'calculation_details',
      'service_code_id',
      'is_manually_adjusted',
      'manual_adjustment_reason',
      'adjusted_by',
      'adjusted_at',
      'created_at',
    ];
    
    console.log('\n   スキーマファイルで定義されているカラム:');
    schemaColumns.forEach((col, index) => {
      console.log(`     ${index + 1}. ${col}`);
    });
    
    // 差分の確認
    const prodColumns = new Set(bonusTableColumns.rows.map(c => c.column_name));
    const schemaCols = new Set(schemaColumns);
    
    const missingInProd = Array.from(schemaCols).filter(c => !prodColumns.has(c));
    const missingInSchema = Array.from(prodColumns).filter(c => !schemaCols.has(c));
    
    console.log('\n   差分分析:');
    if (missingInProd.length > 0) {
      console.log(`   ⚠️  本番環境に存在しないカラム（デプロイ時に追加される可能性）: ${missingInProd.length}件`);
      missingInProd.forEach(col => console.log(`     - ${col}`));
    }
    if (missingInSchema.length > 0) {
      console.log(`   ⚠️  スキーマファイルに定義されていないカラム（デプロイ時に削除される可能性）: ${missingInSchema.length}件`);
      missingInSchema.forEach(col => console.log(`     - ${col}`));
    }
    if (missingInProd.length === 0 && missingInSchema.length === 0) {
      console.log('   ✅ カラムの差分はありません');
    }
    console.log('');

    // 2. nursing_service_codesテーブルの詳細確認
    console.log('📊 2. nursing_service_codesテーブルの詳細確認:');
    console.log('─'.repeat(60));
    
    const serviceCodeColumns = await db.execute<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      character_maximum_length: number | null;
    }>(sql`
      SELECT 
        column_name,
        data_type,
        is_nullable,
        character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'nursing_service_codes'
      ORDER BY ordinal_position
    `);
    
    console.log(`   カラム数: ${serviceCodeColumns.rows.length}件\n`);
    console.log('   カラム一覧:');
    serviceCodeColumns.rows.forEach((col, index) => {
      const nullable = col.is_nullable === 'YES' ? 'NULL可' : 'NULL不可';
      const length = col.character_maximum_length ? `(${col.character_maximum_length})` : '';
      console.log(`     ${index + 1}. ${col.column_name}: ${col.data_type}${length} ${nullable}`);
    });
    
    // スキーマファイルで定義されているカラム
    const serviceCodeSchemaColumns = [
      'id',
      'service_code',
      'service_name',
      'points',
      'insurance_type',
      'valid_from',
      'valid_to',
      'description',
      'is_active',
      'created_at',
      'updated_at',
    ];
    
    console.log('\n   スキーマファイルで定義されているカラム:');
    serviceCodeSchemaColumns.forEach((col, index) => {
      console.log(`     ${index + 1}. ${col}`);
    });
    
    // 差分の確認
    const prodServiceColumns = new Set(serviceCodeColumns.rows.map(c => c.column_name));
    const schemaServiceCols = new Set(serviceCodeSchemaColumns);
    
    const missingInProdService = Array.from(schemaServiceCols).filter(c => !prodServiceColumns.has(c));
    const missingInSchemaService = Array.from(prodServiceColumns).filter(c => !schemaServiceCols.has(c));
    
    console.log('\n   差分分析:');
    if (missingInProdService.length > 0) {
      console.log(`   ⚠️  本番環境に存在しないカラム（デプロイ時に追加される可能性）: ${missingInProdService.length}件`);
      missingInProdService.forEach(col => console.log(`     - ${col}`));
    }
    if (missingInSchemaService.length > 0) {
      console.log(`   ⚠️  スキーマファイルに定義されていないカラム（デプロイ時に削除される可能性）: ${missingInSchemaService.length}件`);
      missingInSchemaService.forEach(col => console.log(`     - ${col}`));
    }
    if (missingInProdService.length === 0 && missingInSchemaService.length === 0) {
      console.log('   ✅ カラムの差分はありません');
    }
    console.log('');

    // 3. nursing_recordsテーブルの主要カラム確認
    console.log('📊 3. nursing_recordsテーブルの主要カラム確認:');
    console.log('─'.repeat(60));
    
    const recordColumns = await db.execute<{
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>(sql`
      SELECT 
        column_name,
        data_type,
        is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'nursing_records'
        AND column_name IN ('id', 'service_code_id', 'facility_id', 'patient_id', 'visit_date', 'status')
      ORDER BY ordinal_position
    `);
    
    console.log(`   主要カラム数: ${recordColumns.rows.length}件\n`);
    recordColumns.rows.forEach((col, index) => {
      const nullable = col.is_nullable === 'YES' ? 'NULL可' : 'NULL不可';
      console.log(`     ${index + 1}. ${col.column_name}: ${col.data_type} ${nullable}`);
    });
    console.log('');

    // 4. 外部キー制約の確認
    console.log('📊 4. サービスコード関連の外部キー制約確認:');
    console.log('─'.repeat(60));
    
    const serviceCodeFKs = await db.execute<{
      constraint_name: string;
      table_name: string;
      column_name: string;
      foreign_table_name: string;
      foreign_column_name: string;
    }>(sql`
      SELECT
        tc.constraint_name,
        kcu.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND (kcu.column_name LIKE '%service_code%' OR ccu.table_name = 'nursing_service_codes')
      ORDER BY kcu.table_name, kcu.column_name
    `);
    
    console.log(`   外部キー制約数: ${serviceCodeFKs.rows.length}件\n`);
    serviceCodeFKs.rows.forEach((fk, index) => {
      console.log(`     ${index + 1}. ${fk.table_name}.${fk.column_name} → ${fk.foreign_table_name}.${fk.foreign_column_name}`);
    });
    console.log('');

    // 5. インデックスの確認
    console.log('📊 5. サービスコード関連のインデックス確認:');
    console.log('─'.repeat(60));
    
    const indexes = await db.execute<{
      indexname: string;
      tablename: string;
      indexdef: string;
    }>(sql`
      SELECT
        indexname,
        tablename,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('nursing_service_codes', 'nursing_records', 'bonus_calculation_history')
        AND (indexdef LIKE '%service_code%' OR indexname LIKE '%service_code%')
      ORDER BY tablename, indexname
    `);
    
    console.log(`   インデックス数: ${indexes.rows.length}件\n`);
    if (indexes.rows.length > 0) {
      indexes.rows.forEach((idx, index) => {
        console.log(`     ${index + 1}. ${idx.tablename}.${idx.indexname}`);
        console.log(`        ${idx.indexdef.substring(0, 80)}...`);
      });
    } else {
      console.log('   （サービスコード関連のインデックスは見つかりませんでした）');
    }
    console.log('');

    // 6. デプロイ時の影響予測
    console.log('📊 6. デプロイ時の影響予測:');
    console.log('─'.repeat(60));
    
    console.log('\n【スキーマ変更の可能性】');
    
    if (missingInProd.length > 0 || missingInSchema.length > 0) {
      console.log('   ⚠️  bonus_calculation_historyテーブルに差分があります:');
      if (missingInProd.length > 0) {
        console.log(`      - 追加されるカラム: ${missingInProd.length}件`);
      }
      if (missingInSchema.length > 0) {
        console.log(`      - 削除される可能性のあるカラム: ${missingInSchema.length}件`);
      }
    } else {
      console.log('   ✅ bonus_calculation_historyテーブルに大きな差分はありません');
    }
    
    if (missingInProdService.length > 0 || missingInSchemaService.length > 0) {
      console.log('   ⚠️  nursing_service_codesテーブルに差分があります:');
      if (missingInProdService.length > 0) {
        console.log(`      - 追加されるカラム: ${missingInProdService.length}件`);
      }
      if (missingInSchemaService.length > 0) {
        console.log(`      - 削除される可能性のあるカラム: ${missingInSchemaService.length}件`);
      }
    } else {
      console.log('   ✅ nursing_service_codesテーブルに大きな差分はありません');
    }
    
    console.log('\n【推奨確認方法】');
    console.log('   実際のスキーマ変更を確認するには:');
    console.log('   1. 開発環境でdrizzle-kit pushを実行');
    console.log('   2. 生成されるSQLを確認');
    console.log('   3. 本番環境で実行する前に内容を確認\n');

    console.log('─'.repeat(60));
    console.log('✅ スキーマ差分の正確な確認が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

compareSchemaAccurate()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

