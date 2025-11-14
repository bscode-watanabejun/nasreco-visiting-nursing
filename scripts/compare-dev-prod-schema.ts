/**
 * 開発環境と本番環境のスキーマを比較するスクリプト
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

interface TableInfo {
  tableName: string;
  columnCount: number;
  columns: Array<{
    column_name: string;
    data_type: string;
    is_nullable: string;
  }>;
}

async function getTableInfo(pool: Pool, tableName: string): Promise<TableInfo | null> {
  try {
    const columnsResult = await pool.query(`
      SELECT 
        column_name,
        data_type,
        is_nullable
      FROM information_schema.columns 
      WHERE table_name = $1
        AND table_schema = 'public'
      ORDER BY ordinal_position;
    `, [tableName]);

    if (columnsResult.rows.length === 0) {
      return null;
    }

    return {
      tableName,
      columnCount: columnsResult.rows.length,
      columns: columnsResult.rows.map((r: any) => ({
        column_name: r.column_name,
        data_type: r.data_type,
        is_nullable: r.is_nullable,
      })),
    };
  } catch (error: any) {
    if (error.message.includes('does not exist')) {
      return null;
    }
    throw error;
  }
}

async function getAllTables(pool: Pool): Promise<string[]> {
  const result = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);
  return result.rows.map((r: any) => r.table_name);
}

async function compareSchemas() {
  console.log('🔍 開発環境と本番環境のスキーマを比較中...\n');

  try {
    // 1. テーブル一覧を取得
    console.log('📋 テーブル一覧を取得中...');
    const devTables = await getAllTables(devPool);
    const prodTables = await getAllTables(prodPool);

    console.log(`  開発環境: ${devTables.length}個のテーブル`);
    console.log(`  本番環境: ${prodTables.length}個のテーブル\n`);

    // 2. テーブル数の比較
    const allTables = new Set([...devTables, ...prodTables]);
    const missingInDev = prodTables.filter(t => !devTables.includes(t));
    const missingInProd = devTables.filter(t => !prodTables.includes(t));
    const commonTables = devTables.filter(t => prodTables.includes(t));

    console.log('📊 テーブル数の比較:');
    console.log(`  共通テーブル: ${commonTables.length}個`);
    if (missingInDev.length > 0) {
      console.log(`  ⚠️  開発環境に不足: ${missingInDev.length}個 - ${missingInDev.join(', ')}`);
    }
    if (missingInProd.length > 0) {
      console.log(`  ⚠️  本番環境に不足: ${missingInProd.length}個 - ${missingInProd.join(', ')}`);
    }
    if (missingInDev.length === 0 && missingInProd.length === 0) {
      console.log(`  ✅ テーブル数は一致しています`);
    }
    console.log('');

    // 3. 各テーブルのカラム数を比較
    console.log('📊 カラム数の比較:');
    const differences: Array<{
      table: string;
      devColumns: number;
      prodColumns: number;
      diff: number;
    }> = [];

    for (const tableName of Array.from(allTables).sort()) {
      const devInfo = await getTableInfo(devPool, tableName);
      const prodInfo = await getTableInfo(prodPool, tableName);

      if (!devInfo && !prodInfo) continue;

      const devCount = devInfo?.columnCount || 0;
      const prodCount = prodInfo?.columnCount || 0;

      if (devCount !== prodCount) {
        differences.push({
          table: tableName,
          devColumns: devCount,
          prodColumns: prodCount,
          diff: devCount - prodCount,
        });
      }
    }

    if (differences.length === 0) {
      console.log('  ✅ すべてのテーブルでカラム数が一致しています');
    } else {
      console.log(`  ⚠️  カラム数が異なるテーブル: ${differences.length}個\n`);
      differences.forEach(diff => {
        const sign = diff.diff > 0 ? '+' : '';
        console.log(`    ${diff.table}: 開発=${diff.devColumns}, 本番=${diff.prodColumns} (差: ${sign}${diff.diff})`);
      });
    }
    console.log('');

    // 4. 主要テーブルの詳細比較
    console.log('🔍 主要テーブルの詳細比較:');
    const importantTables = ['companies', 'facilities', 'users', 'patients', 'nursing_records'];
    
    for (const tableName of importantTables) {
      const devInfo = await getTableInfo(devPool, tableName);
      const prodInfo = await getTableInfo(prodPool, tableName);

      if (!devInfo && !prodInfo) {
        console.log(`\n  ${tableName}: 両環境に存在しません`);
        continue;
      }

      if (!devInfo) {
        console.log(`\n  ${tableName}: ⚠️  開発環境に存在しません`);
        continue;
      }

      if (!prodInfo) {
        console.log(`\n  ${tableName}: ⚠️  本番環境に存在しません`);
        continue;
      }

      const devColumnNames = new Set(devInfo.columns.map(c => c.column_name));
      const prodColumnNames = new Set(prodInfo.columns.map(c => c.column_name));

      const missingInDev = Array.from(prodColumnNames).filter(c => !devColumnNames.has(c));
      const missingInProd = Array.from(devColumnNames).filter(c => !prodColumnNames.has(c));
      const commonColumns = Array.from(devColumnNames).filter(c => prodColumnNames.has(c));

      console.log(`\n  ${tableName}:`);
      console.log(`    開発: ${devInfo.columnCount}カラム, 本番: ${prodInfo.columnCount}カラム`);
      
      if (missingInDev.length > 0) {
        console.log(`    ⚠️  開発環境に不足: ${missingInDev.join(', ')}`);
      }
      if (missingInProd.length > 0) {
        console.log(`    ⚠️  本番環境に不足: ${missingInProd.join(', ')}`);
      }
      if (missingInDev.length === 0 && missingInProd.length === 0) {
        console.log(`    ✅ カラムが一致しています`);
      }
    }

    // 5. 総合判定
    console.log('\n\n📋 総合判定:');
    const tableMatch = missingInDev.length === 0 && missingInProd.length === 0;
    const columnMatch = differences.length === 0;

    if (tableMatch && columnMatch) {
      console.log('  ✅ 開発環境と本番環境のスキーマは完全に一致しています');
      console.log(`     テーブル数: ${devTables.length}個`);
      console.log(`     すべてのテーブルでカラム数が一致`);
    } else {
      console.log('  ⚠️  開発環境と本番環境のスキーマに差異があります');
      if (!tableMatch) {
        console.log('     - テーブル数が異なります');
      }
      if (!columnMatch) {
        console.log('     - 一部のテーブルでカラム数が異なります');
      }
    }

  } catch (error: any) {
    console.error('❌ エラーが発生しました:', error.message);
    console.error(error);
  } finally {
    await devPool.end();
    await prodPool.end();
  }
}

compareSchemas();


