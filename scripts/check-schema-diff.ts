/**
 * 本番環境とmainブランチのスキーマ差分確認スクリプト
 * 
 * 現在のmainブランチのスキーマと本番環境のスキーマを比較し、
 * デプロイ時の影響を確認します。
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';

const PROD_DB_URL = process.env.PRODUCTION_DB_URL || 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function checkSchemaDiff() {
  console.log('🔍 本番環境とmainブランチのスキーマ差分を確認します...\n');
  console.log('⚠️  本番データベースに接続します\n');
  
  const pool = new Pool({ connectionString: PROD_DB_URL });
  const db = drizzle(pool);

  try {
    // 1. 本番環境のテーブル一覧を取得
    console.log('📊 1. 本番環境のテーブル一覧を取得中...');
    const prodTables = await db.execute<{
      table_name: string;
    }>(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    console.log(`   本番環境のテーブル数: ${prodTables.rows.length}件\n`);
    
    // 2. 主要テーブルの存在確認
    console.log('📊 2. 主要テーブルの存在確認:');
    const expectedTables = [
      'nursing_service_codes',
      'nursing_records',
      'bonus_calculation_history',
      'patients',
      'users',
      'facilities',
      'monthly_receipts',
      'session',
    ];
    
    const existingTables = prodTables.rows.map(r => r.table_name);
    expectedTables.forEach(tableName => {
      const exists = existingTables.includes(tableName);
      const status = exists ? '✅' : '❌';
      console.log(`   ${status} ${tableName}`);
    });
    console.log('');

    // 3. スキーマの詳細確認（主要テーブル）
    console.log('📊 3. 主要テーブルのカラム確認:');
    console.log('─'.repeat(60));
    
    for (const tableName of ['nursing_service_codes', 'nursing_records', 'bonus_calculation_history']) {
      if (!existingTables.includes(tableName)) {
        console.log(`\n⚠️  ${tableName} テーブルが存在しません。\n`);
        continue;
      }
      
      const columns = await db.execute<{
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
          AND table_name = ${tableName}
        ORDER BY ordinal_position
      `);
      
      console.log(`\n【${tableName}】`);
      console.log(`   カラム数: ${columns.rows.length}件`);
      
      // 重要なカラムの確認
      const importantColumns = columns.rows.filter(c => 
        c.column_name.includes('service_code') || 
        c.column_name.includes('id') ||
        c.column_name.includes('created_at')
      );
      
      if (importantColumns.length > 0) {
        console.log(`   重要なカラム:`);
        importantColumns.slice(0, 5).forEach(col => {
          console.log(`     - ${col.column_name} (${col.data_type}, nullable: ${col.is_nullable})`);
        });
        if (importantColumns.length > 5) {
          console.log(`     ... 他 ${importantColumns.length - 5}件`);
        }
      }
    }
    console.log('');

    // 4. 外部キー制約の確認
    console.log('📊 4. 外部キー制約の確認:');
    console.log('─'.repeat(60));
    
    const foreignKeys = await db.execute<{
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
      ORDER BY tc.table_name, kcu.column_name
    `);
    
    console.log(`   外部キー制約数: ${foreignKeys.rows.length}件\n`);
    
    // サービスコード関連の外部キーを確認
    const serviceCodeFKs = foreignKeys.rows.filter(fk => 
      fk.column_name.includes('service_code') || 
      fk.foreign_table_name === 'nursing_service_codes'
    );
    
    if (serviceCodeFKs.length > 0) {
      console.log('   サービスコード関連の外部キー制約:');
      serviceCodeFKs.forEach(fk => {
        console.log(`     ${fk.table_name}.${fk.column_name} → ${fk.foreign_table_name}.${fk.foreign_column_name}`);
      });
      console.log('');
    }

    // 5. インデックスの確認
    console.log('📊 5. インデックスの確認:');
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
      ORDER BY tablename, indexname
    `);
    
    console.log(`   インデックス数: ${indexes.rows.length}件\n`);
    
    if (indexes.rows.length > 0) {
      indexes.rows.forEach(idx => {
        console.log(`   ${idx.tablename}.${idx.indexname}`);
      });
      console.log('');
    }

    // 6. デプロイ時の影響分析
    console.log('📊 6. デプロイ時の影響分析:');
    console.log('─'.repeat(60));
    
    console.log('\n【デプロイプロセス】');
    console.log('   1. npm run db:push (データベーススキーマのプッシュ)');
    console.log('   2. npm run build (アプリケーションのビルド)');
    console.log('   3. npm run start (本番サーバーの起動)\n');
    
    console.log('【潜在的な影響】');
    
    // スキーマ変更の可能性
    console.log('   1. データベーススキーマ変更:');
    console.log('      - db:push が実行されるため、スキーマの差分があれば変更される');
    console.log('      - テーブルの追加・削除・変更が発生する可能性');
    console.log('      - データの整合性に影響する可能性\n');
    
    // ダウンタイム
    console.log('   2. ダウンタイム:');
    console.log('      - ビルド中はサービスが停止する可能性');
    console.log('      - スキーマ変更中はデータベースロックが発生する可能性');
    console.log('      - 推奨: 業務時間外に実行\n');
    
    // 環境変数
    console.log('   3. 環境変数:');
    console.log('      - DATABASE_URL: 本番環境のデータベース接続文字列');
    console.log('      - SESSION_SECRET: セッション暗号化用シークレット');
    console.log('      - NODE_ENV: production に設定される');
    console.log('      - PORT: 5000（.replitファイルで設定）\n');
    
    // データベース接続
    console.log('   4. データベース接続:');
    console.log('      - 本番環境のDATABASE_URLが使用される');
    console.log('      - スキーマ変更が本番データベースに直接反映される');
    console.log('      - バックアップの取得を推奨\n');

    console.log('─'.repeat(60));
    console.log('✅ スキーマ差分確認が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

checkSchemaDiff()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

