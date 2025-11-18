import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

// WebSocket設定
neonConfig.webSocketConstructor = ws;

// 環境設定
const DEV_DB_URL = 'postgresql://neondb_owner:npg_beoRr4gaQ5Dl@ep-polished-scene-a5twqv82.us-east-2.aws.neon.tech/neondb?sslmode=require';
const PROD_DB_URL = 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function getTableStructure(dbUrl: string) {
  const pool = new Pool({ connectionString: dbUrl });
  const db = drizzle(pool);

  try {
    // テーブル一覧を取得
    const tablesResult = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    const tables = tablesResult.rows.map(r => r.table_name);

    // 各テーブルのカラム情報を取得
    const structure: Record<string, any[]> = {};
    for (const table of tables) {
      const columnsResult = await pool.query(`
        SELECT
          column_name,
          data_type,
          character_maximum_length,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position;
      `, [table]);

      structure[table] = columnsResult.rows;
    }

    return { tables, structure };
  } finally {
    await pool.end();
  }
}

async function getDataCounts(dbUrl: string, tables: string[]) {
  const pool = new Pool({ connectionString: dbUrl });

  try {
    const counts: Record<string, number> = {};
    for (const table of tables) {
      // セッションテーブルはスキップ
      if (table === 'session') continue;

      try {
        const result = await pool.query(`SELECT COUNT(*) as count FROM "${table}"`);
        counts[table] = parseInt(result.rows[0].count);
      } catch (error) {
        counts[table] = -1; // エラーの場合
      }
    }
    return counts;
  } finally {
    await pool.end();
  }
}

async function main() {
  console.log('=== 開発環境と本番環境のDB比較 ===\n');

  console.log('📊 開発環境のスキーマを取得中...');
  const devSchema = await getTableStructure(DEV_DB_URL);

  console.log('📊 本番環境のスキーマを取得中...');
  const prodSchema = await getTableStructure(PROD_DB_URL);

  // テーブル一覧の比較
  console.log('\n【テーブル一覧の比較】');
  const devTables = new Set(devSchema.tables);
  const prodTables = new Set(prodSchema.tables);

  const devOnly = [...devTables].filter(t => !prodTables.has(t));
  const prodOnly = [...prodTables].filter(t => !devTables.has(t));
  const common = [...devTables].filter(t => prodTables.has(t));

  console.log(`\n開発環境のテーブル数: ${devTables.size}`);
  console.log(`本番環境のテーブル数: ${prodTables.size}`);

  if (devOnly.length > 0) {
    console.log(`\n⚠️  開発環境のみに存在するテーブル (${devOnly.length}個):`);
    devOnly.forEach(t => console.log(`  - ${t}`));
  }

  if (prodOnly.length > 0) {
    console.log(`\n⚠️  本番環境のみに存在するテーブル (${prodOnly.length}個):`);
    prodOnly.forEach(t => console.log(`  - ${t}`));
  }

  // 共通テーブルのカラム構造比較
  console.log(`\n✅ 共通テーブル: ${common.length}個\n`);

  const structuralDifferences: string[] = [];

  for (const table of common) {
    const devColumns = devSchema.structure[table];
    const prodColumns = prodSchema.structure[table];

    const devColNames = new Set(devColumns.map(c => c.column_name));
    const prodColNames = new Set(prodColumns.map(c => c.column_name));

    const devOnlyCols = devColumns.filter(c => !prodColNames.has(c.column_name));
    const prodOnlyCols = prodColumns.filter(c => !devColNames.has(c.column_name));

    if (devOnlyCols.length > 0 || prodOnlyCols.length > 0) {
      structuralDifferences.push(table);
      console.log(`\n📋 テーブル: ${table}`);

      if (devOnlyCols.length > 0) {
        console.log('  ⚠️  開発環境のみに存在するカラム:');
        devOnlyCols.forEach(c => {
          console.log(`    - ${c.column_name} (${c.data_type})`);
        });
      }

      if (prodOnlyCols.length > 0) {
        console.log('  ⚠️  本番環境のみに存在するカラム:');
        prodOnlyCols.forEach(c => {
          console.log(`    - ${c.column_name} (${c.data_type})`);
        });
      }
    }
  }

  if (structuralDifferences.length === 0) {
    console.log('✅ すべての共通テーブルでカラム構造が一致しています');
  }

  // データ件数の比較
  console.log('\n\n【データ件数の比較】\n');
  console.log('📊 開発環境のデータ件数を取得中...');
  const devCounts = await getDataCounts(DEV_DB_URL, common);

  console.log('📊 本番環境のデータ件数を取得中...');
  const prodCounts = await getDataCounts(PROD_DB_URL, common);

  console.log('\nテーブル別データ件数:');
  console.log('━'.repeat(60));
  console.log(`${'テーブル名'.padEnd(30)} ${'開発環境'.padStart(10)} ${'本番環境'.padStart(10)}`);
  console.log('━'.repeat(60));

  for (const table of common.sort()) {
    if (table === 'session') continue; // セッションテーブルは除外

    const devCount = devCounts[table] ?? 0;
    const prodCount = prodCounts[table] ?? 0;

    const marker = prodCount > 0 ? '🔴' : '  ';
    console.log(`${marker} ${table.padEnd(28)} ${String(devCount).padStart(10)} ${String(prodCount).padStart(10)}`);
  }

  // サマリー
  console.log('\n\n【再デプロイ影響分析サマリー】\n');

  const hasSchemaDiff = devOnly.length > 0 || prodOnly.length > 0 || structuralDifferences.length > 0;

  if (hasSchemaDiff) {
    console.log('⚠️  スキーマに差異があります:');
    if (devOnly.length > 0) {
      console.log(`   - 開発環境のみのテーブル: ${devOnly.length}個`);
    }
    if (prodOnly.length > 0) {
      console.log(`   - 本番環境のみのテーブル: ${prodOnly.length}個`);
    }
    if (structuralDifferences.length > 0) {
      console.log(`   - カラム構造が異なるテーブル: ${structuralDifferences.length}個`);
    }
    console.log('\n   ⚠️  再デプロイ前に npm run db:push の実行が必要です');
    console.log('   ⚠️  本番DBへのスキーマ変更は慎重に実施してください');
  } else {
    console.log('✅ スキーマ構造は完全に一致しています');
  }

  const tablesWithProdData = Object.entries(prodCounts).filter(([table, count]) => count > 0);
  if (tablesWithProdData.length > 0) {
    console.log(`\n🔴 本番環境に既存データがあるテーブル: ${tablesWithProdData.length}個`);
    console.log('   - これらのデータは保護する必要があります');
    console.log('   - 再デプロイ時にデータ削除や上書きが発生しないか確認してください');
  } else {
    console.log('\n✅ 本番環境にデータがないため、再デプロイは安全です');
  }

  console.log('\n━'.repeat(60));
}

main().catch(console.error);
