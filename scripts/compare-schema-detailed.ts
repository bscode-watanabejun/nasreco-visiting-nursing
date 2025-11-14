/**
 * スキーマ差分の詳細確認スクリプト
 * 
 * 本番環境のスキーマとスキーマファイルの定義を詳細に比較します。
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

const PROD_DB_URL = process.env.PRODUCTION_DB_URL || 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  character_maximum_length: number | null;
}

interface TableInfo {
  table_name: string;
  columns: ColumnInfo[];
  constraints: Array<{
    constraint_name: string;
    constraint_type: string;
    column_name: string | null;
  }>;
}

async function compareSchemaDetailed() {
  console.log('🔍 スキーマ差分の詳細確認を開始します...\n');
  console.log('⚠️  本番データベースに接続します\n');
  
  const pool = new Pool({ connectionString: PROD_DB_URL });
  const db = drizzle(pool);

  try {
    // 1. 本番環境のテーブル一覧を取得
    console.log('📊 1. 本番環境のテーブル一覧を取得中...');
    const prodTables = await db.execute<{ table_name: string }>(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    const tableNames = prodTables.rows.map(r => r.table_name);
    console.log(`   本番環境のテーブル数: ${tableNames.length}件\n`);

    // 2. 主要テーブルの詳細情報を取得
    console.log('📊 2. 主要テーブルの詳細情報を取得中...');
    console.log('─'.repeat(60));
    
    const importantTables = [
      'nursing_service_codes',
      'nursing_records',
      'bonus_calculation_history',
      'patients',
      'users',
      'facilities',
      'monthly_receipts',
      'session',
    ];
    
    const tableInfos: Record<string, TableInfo> = {};
    
    for (const tableName of importantTables) {
      if (!tableNames.includes(tableName)) {
        console.log(`\n⚠️  ${tableName} テーブルが存在しません。\n`);
        continue;
      }
      
      // カラム情報を取得
      const columns = await db.execute<ColumnInfo>(sql`
        SELECT 
          column_name,
          data_type,
          is_nullable,
          column_default,
          character_maximum_length
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ${tableName}
        ORDER BY ordinal_position
      `);
      
      // 制約情報を取得
      const constraints = await db.execute<{
        constraint_name: string;
        constraint_type: string;
        column_name: string | null;
      }>(sql`
        SELECT
          tc.constraint_name,
          tc.constraint_type,
          kcu.column_name
        FROM information_schema.table_constraints tc
        LEFT JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_schema = 'public'
          AND tc.table_name = ${tableName}
        ORDER BY tc.constraint_type, tc.constraint_name
      `);
      
      tableInfos[tableName] = {
        table_name: tableName,
        columns: columns.rows,
        constraints: constraints.rows,
      };
    }
    
    // 3. スキーマファイルの内容を確認
    console.log('\n📊 3. スキーマファイルの内容を確認中...');
    console.log('─'.repeat(60));
    
    const schemaFilePath = path.join(process.cwd(), 'shared', 'schema.ts');
    const schemaContent = fs.readFileSync(schemaFilePath, 'utf-8');
    
    // 主要テーブルの定義を抽出
    const schemaTables: Record<string, { defined: boolean; columns: string[] }> = {};
    
    for (const tableName of importantTables) {
      const camelCaseName = tableName.split('_').map((word, index) => {
        if (index === 0) return word;
        return word.charAt(0).toUpperCase() + word.slice(1);
      }).join('');
      
      // スキーマファイル内でテーブル定義を検索
      const tableRegex = new RegExp(`export const ${camelCaseName}\\s*=\\s*pgTable\\(["']${tableName}["']`, 's');
      const match = schemaContent.match(tableRegex);
      
      if (match) {
        // テーブル定義が見つかった場合、カラムを抽出
        const tableDefStart = schemaContent.indexOf(match[0]);
        const tableDefEnd = schemaContent.indexOf('});', tableDefStart);
        const tableDef = schemaContent.substring(tableDefStart, tableDefEnd);
        
        // カラム定義を抽出（簡易版）
        const columnMatches = tableDef.matchAll(/(\w+):\s*\w+\(["'](\w+)["']/g);
        const columns: string[] = [];
        for (const match of columnMatches) {
          columns.push(match[2]);
        }
        
        schemaTables[tableName] = {
          defined: true,
          columns: columns,
        };
      } else {
        schemaTables[tableName] = {
          defined: false,
          columns: [],
        };
      }
    }
    
    // 4. 差分の分析
    console.log('\n📊 4. スキーマ差分の分析:');
    console.log('─'.repeat(60));
    
    let hasDifferences = false;
    
    for (const tableName of importantTables) {
      const prodTable = tableInfos[tableName];
      const schemaTable = schemaTables[tableName];
      
      if (!prodTable) {
        console.log(`\n⚠️  ${tableName}:`);
        console.log(`   本番環境に存在しない`);
        if (schemaTable?.defined) {
          console.log(`   スキーマファイルには定義されている → デプロイ時に作成される可能性`);
          hasDifferences = true;
        }
        continue;
      }
      
      if (!schemaTable?.defined) {
        console.log(`\n⚠️  ${tableName}:`);
        console.log(`   スキーマファイルに定義されていない`);
        console.log(`   本番環境には存在する → デプロイ時に削除される可能性`);
        hasDifferences = true;
        continue;
      }
      
      // カラムの比較
      const prodColumns = new Set(prodTable.columns.map(c => c.column_name));
      const schemaColumns = new Set(schemaTable.columns);
      
      const missingInProd = Array.from(schemaColumns).filter(c => !prodColumns.has(c));
      const missingInSchema = Array.from(prodColumns).filter(c => !schemaColumns.has(c));
      
      if (missingInProd.length > 0 || missingInSchema.length > 0) {
        console.log(`\n⚠️  ${tableName}:`);
        if (missingInProd.length > 0) {
          console.log(`   本番環境に存在しないカラム（デプロイ時に追加される可能性）:`);
          missingInProd.forEach(col => console.log(`     - ${col}`));
          hasDifferences = true;
        }
        if (missingInSchema.length > 0) {
          console.log(`   スキーマファイルに定義されていないカラム（デプロイ時に削除される可能性）:`);
          missingInSchema.forEach(col => console.log(`     - ${col}`));
          hasDifferences = true;
        }
      }
    }
    
    if (!hasDifferences) {
      console.log('\n✅ 主要テーブルに大きな差分は見つかりませんでした。');
      console.log('   （詳細な型や制約の違いは、drizzle-kit push実行時に確認されます）\n');
    }

    // 5. サービスコードマスタテーブルの詳細比較
    console.log('\n📊 5. サービスコードマスタテーブルの詳細比較:');
    console.log('─'.repeat(60));
    
    const serviceCodeTable = tableInfos['nursing_service_codes'];
    if (serviceCodeTable) {
      console.log('\n【本番環境のnursing_service_codesテーブル】');
      console.log(`   カラム数: ${serviceCodeTable.columns.length}件`);
      console.log('\n   カラム一覧:');
      serviceCodeTable.columns.forEach(col => {
        const nullable = col.is_nullable === 'YES' ? 'NULL可' : 'NULL不可';
        const length = col.character_maximum_length ? `(${col.character_maximum_length})` : '';
        console.log(`     - ${col.column_name}: ${col.data_type}${length} ${nullable}`);
      });
      
      console.log('\n   制約一覧:');
      serviceCodeTable.constraints.forEach(con => {
        console.log(`     - ${con.constraint_name}: ${con.constraint_type}`);
      });
    }
    
    // 6. デプロイ時の影響予測
    console.log('\n📊 6. デプロイ時の影響予測:');
    console.log('─'.repeat(60));
    
    console.log('\n【drizzle-kit push実行時の動作】');
    console.log('   drizzle-kit pushは以下の処理を実行します:');
    console.log('   1. スキーマファイルとデータベースのスキーマを比較');
    console.log('   2. 差分があれば、自動的にALTER TABLE文を生成・実行');
    console.log('   3. テーブルの追加・削除・カラムの追加・削除・変更を反映\n');
    
    console.log('【注意事項】');
    console.log('   - カラムの削除はデータ損失を伴う可能性があります');
    console.log('   - カラムの型変更はデータ変換が必要な場合があります');
    console.log('   - 外部キー制約の変更は参照整合性に影響します');
    console.log('   - 推奨: デプロイ前にバックアップを取得\n');
    
    console.log('【推奨確認方法】');
    console.log('   実際のスキーマ変更を確認するには:');
    console.log('   1. テスト環境でdrizzle-kit pushを実行');
    console.log('   2. 生成されるSQLを確認');
    console.log('   3. 本番環境で実行する前に内容を確認\n');

    console.log('─'.repeat(60));
    console.log('✅ スキーマ差分の詳細確認が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

compareSchemaDetailed()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

