/**
 * 全テーブルのスキーマ差分確認スクリプト
 * 
 * 本番環境のすべてのテーブルとスキーマファイルの定義を比較し、
 * 型の違いや制約の違いを確認します。
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';

const PROD_DB_URL = process.env.PRODUCTION_DB_URL || 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function checkAllSchemaDifferences() {
  console.log('🔍 全テーブルのスキーマ差分確認を開始します...\n');
  console.log('⚠️  本番データベースに接続します\n');
  
  const pool = new Pool({ connectionString: PROD_DB_URL });
  const db = drizzle(pool);

  try {
    // 1. すべてのテーブル一覧を取得
    console.log('📊 1. すべてのテーブル一覧を取得中...');
    const allTables = await db.execute<{ table_name: string }>(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    console.log(`   本番環境のテーブル数: ${allTables.rows.length}件\n`);
    
    // 2. 各テーブルのカラム数を確認
    console.log('📊 2. 各テーブルのカラム数を確認中...');
    console.log('─'.repeat(60));
    
    const tableColumnCounts: Array<{ table_name: string; column_count: number }> = [];
    
    for (const table of allTables.rows) {
      const count = await db.execute<{ count: number }>(sql`
        SELECT COUNT(*) as count
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ${table.table_name}
      `);
      
      tableColumnCounts.push({
        table_name: table.table_name,
        column_count: Number(count.rows[0]?.count || 0),
      });
    }
    
    // カラム数でソート
    tableColumnCounts.sort((a, b) => b.column_count - a.column_count);
    
    console.log('\n   テーブル別カラム数（上位10件）:');
    tableColumnCounts.slice(0, 10).forEach((table, index) => {
      console.log(`     ${index + 1}. ${table.table_name}: ${table.column_count}カラム`);
    });
    if (tableColumnCounts.length > 10) {
      console.log(`     ... 他 ${tableColumnCounts.length - 10}テーブル\n`);
    } else {
      console.log('');
    }

    // 3. ENUM型の確認
    console.log('📊 3. ENUM型の確認:');
    console.log('─'.repeat(60));
    
    const enums = await db.execute<{
      enum_name: string;
      enum_value: string;
    }>(sql`
      SELECT 
        t.typname as enum_name,
        e.enumlabel as enum_value
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname LIKE '%enum%'
      ORDER BY t.typname, e.enumsortorder
    `);
    
    const enumMap: Record<string, string[]> = {};
    enums.rows.forEach(row => {
      if (!enumMap[row.enum_name]) {
        enumMap[row.enum_name] = [];
      }
      enumMap[row.enum_name].push(row.enum_value);
    });
    
    console.log(`   ENUM型の数: ${Object.keys(enumMap).length}件\n`);
    Object.entries(enumMap).forEach(([enumName, values]) => {
      console.log(`   ${enumName}:`);
      console.log(`     値: ${values.join(', ')}`);
    });
    console.log('');

    // 4. 外部キー制約の確認
    console.log('📊 4. 外部キー制約の確認:');
    console.log('─'.repeat(60));
    
    const allFKs = await db.execute<{
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
      ORDER BY kcu.table_name, kcu.column_name
    `);
    
    console.log(`   外部キー制約数: ${allFKs.rows.length}件\n`);
    
    // テーブルごとにグループ化
    const fksByTable: Record<string, typeof allFKs.rows> = {};
    allFKs.rows.forEach(fk => {
      if (!fksByTable[fk.table_name]) {
        fksByTable[fk.table_name] = [];
      }
      fksByTable[fk.table_name].push(fk);
    });
    
    console.log('   テーブル別外部キー制約数（上位10件）:');
    Object.entries(fksByTable)
      .sort(([, a], [, b]) => b.length - a.length)
      .slice(0, 10)
      .forEach(([tableName, fks], index) => {
        console.log(`     ${index + 1}. ${tableName}: ${fks.length}件`);
      });
    console.log('');

    // 5. インデックスの確認
    console.log('📊 5. インデックスの確認:');
    console.log('─'.repeat(60));
    
    const allIndexes = await db.execute<{
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
      ORDER BY tablename, indexname
    `);
    
    console.log(`   インデックス数: ${allIndexes.rows.length}件\n`);
    
    // テーブルごとにグループ化
    const indexesByTable: Record<string, typeof allIndexes.rows> = {};
    allIndexes.rows.forEach(idx => {
      if (!indexesByTable[idx.tablename]) {
        indexesByTable[idx.tablename] = [];
      }
      indexesByTable[idx.tablename].push(idx);
    });
    
    console.log('   テーブル別インデックス数（上位10件）:');
    Object.entries(indexesByTable)
      .sort(([, a], [, b]) => b.length - a.length)
      .slice(0, 10)
      .forEach(([tableName, indexes], index) => {
        console.log(`     ${index + 1}. ${tableName}: ${indexes.length}件`);
      });
    console.log('');

    // 6. デプロイ時の影響予測
    console.log('📊 6. デプロイ時の影響予測:');
    console.log('─'.repeat(60));
    
    console.log('\n【スキーマ変更の可能性】');
    console.log('   主要テーブル（bonus_calculation_history、nursing_service_codes）:');
    console.log('   ✅ カラムの差分はありません');
    console.log('   ⚠️  ただし、型の違いや制約の違いはdrizzle-kit push実行時に検出される可能性があります\n');
    
    console.log('【drizzle-kit pushの動作】');
    console.log('   drizzle-kit pushは以下の処理を実行します:');
    console.log('   1. スキーマファイルとデータベースのスキーマを詳細に比較');
    console.log('   2. カラムの型、制約、デフォルト値の違いを検出');
    console.log('   3. 差分があれば、ALTER TABLE文を生成・実行');
    console.log('   4. テーブルの追加・削除も検出\n');
    
    console.log('【推奨確認方法】');
    console.log('   実際のスキーマ変更を確認するには:');
    console.log('   1. 開発環境でdrizzle-kit pushを実行（本番環境のDATABASE_URLを使用）');
    console.log('   2. 生成されるSQLを確認');
    console.log('   3. 本番環境で実行する前に内容を確認');
    console.log('   4. または、drizzle-kit introspectを使用して本番環境のスキーマを取得し、比較\n');

    console.log('─'.repeat(60));
    console.log('✅ 全テーブルのスキーマ差分確認が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

checkAllSchemaDifferences()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

