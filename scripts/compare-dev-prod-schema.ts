/**
 * 開発環境と本番環境のスキーマ差異確認スクリプト
 * 
 * データベーススキーマの差異を確認します。
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';

const PROD_DB_URL = 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';
const DEV_DB_URL = 'postgresql://neondb_owner:npg_beoRr4gaQ5Dl@ep-polished-scene-a5twqv82.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function compareSchemas() {
  console.log('🔍 開発環境と本番環境のスキーマ差異を確認します...\n');
  
  const prodPool = new Pool({ connectionString: PROD_DB_URL });
  const devPool = new Pool({ connectionString: DEV_DB_URL });
  const prodDb = drizzle(prodPool);
  const devDb = drizzle(devPool);

  try {
    // 1. テーブル一覧を取得
    console.log('📊 1. テーブル一覧の比較:');
    console.log('─'.repeat(60));
    
    const prodTables = await prodDb.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    const devTables = await devDb.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    const prodTableNames = prodTables.rows.map((r: any) => r.table_name).sort();
    const devTableNames = devTables.rows.map((r: any) => r.table_name).sort();
    
    console.log(`   本番環境のテーブル数: ${prodTableNames.length}`);
    console.log(`   開発環境のテーブル数: ${devTableNames.length}\n`);
    
    const missingInProd = devTableNames.filter(t => !prodTableNames.includes(t));
    const missingInDev = prodTableNames.filter(t => !devTableNames.includes(t));
    
    if (missingInProd.length > 0) {
      console.log(`   ⚠️  本番環境に存在しないテーブル: ${missingInProd.join(', ')}\n`);
    }
    if (missingInDev.length > 0) {
      console.log(`   ⚠️  開発環境に存在しないテーブル: ${missingInDev.join(', ')}\n`);
    }
    if (missingInProd.length === 0 && missingInDev.length === 0) {
      console.log('   ✅ テーブル一覧は一致しています。\n');
    }

    // 2. 全テーブルのカラム定義を比較
    console.log('📊 2. 全テーブルのカラム定義比較:');
    console.log('─'.repeat(60));
    
    // 全テーブルを比較（共通のテーブルのみ）
    const commonTables = prodTableNames.filter(t => devTableNames.includes(t)).sort();
    const onlyInProd = prodTableNames.filter(t => !devTableNames.includes(t));
    const onlyInDev = devTableNames.filter(t => !prodTableNames.includes(t));
    
    if (onlyInProd.length > 0) {
      console.log(`   ⚠️  本番環境のみに存在するテーブル: ${onlyInProd.join(', ')}\n`);
    }
    if (onlyInDev.length > 0) {
      console.log(`   ⚠️  開発環境のみに存在するテーブル: ${onlyInDev.join(', ')}\n`);
    }
    
    console.log(`   比較対象テーブル数: ${commonTables.length}個\n`);
    
    let diffCount = 0;
    let matchCount = 0;
    
    for (const tableName of commonTables) {
      const prodColumns = await prodDb.execute(sql`
        SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${tableName}
        ORDER BY ordinal_position
      `);
      
      const devColumns = await devDb.execute(sql`
        SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${tableName}
        ORDER BY ordinal_position
      `);
      
      const prodColMap = new Map(prodColumns.rows.map((r: any) => [r.column_name, r]));
      const devColMap = new Map(devColumns.rows.map((r: any) => [r.column_name, r]));
      
      const prodColNames = Array.from(prodColMap.keys()).sort();
      const devColNames = Array.from(devColMap.keys()).sort();
      
      const missingColsInProd = devColNames.filter(c => !prodColMap.has(c));
      const missingColsInDev = prodColNames.filter(c => !devColMap.has(c));
      const commonCols = prodColNames.filter(c => devColMap.has(c));
      
      let hasDiff = false;
      const diffs: string[] = [];
      
      for (const colName of commonCols) {
        const prodCol = prodColMap.get(colName);
        const devCol = devColMap.get(colName);
        
        // data_typeの比較（character_maximum_lengthも考慮）
        let prodDataType = prodCol!.data_type;
        let devDataType = devCol!.data_type;
        
        if (prodCol!.character_maximum_length) {
          prodDataType = `${prodDataType}(${prodCol!.character_maximum_length})`;
        }
        if (devCol!.character_maximum_length) {
          devDataType = `${devDataType}(${devCol!.character_maximum_length})`;
        }
        
        if (prodDataType !== devDataType) {
          hasDiff = true;
          diffs.push(`      ${colName}: data_type (prod: ${prodDataType}, dev: ${devDataType})`);
        }
        if (prodCol!.is_nullable !== devCol!.is_nullable) {
          hasDiff = true;
          diffs.push(`      ${colName}: is_nullable (prod: ${prodCol!.is_nullable}, dev: ${devCol!.is_nullable})`);
        }
        // column_defaultの比較（NULLは無視）
        const prodDefault = prodCol!.column_default || '';
        const devDefault = devCol!.column_default || '';
        if (prodDefault && devDefault && prodDefault !== devDefault) {
          hasDiff = true;
          diffs.push(`      ${colName}: column_default (prod: ${prodDefault}, dev: ${devDefault})`);
        }
      }
      
      if (missingColsInProd.length > 0 || missingColsInDev.length > 0 || hasDiff) {
        diffCount++;
        console.log(`   ⚠️  ${tableName}: 差異あり`);
        if (missingColsInProd.length > 0) {
          console.log(`      本番環境に存在しないカラム: ${missingColsInProd.join(', ')}`);
        }
        if (missingColsInDev.length > 0) {
          console.log(`      開発環境に存在しないカラム: ${missingColsInDev.join(', ')}`);
        }
        if (diffs.length > 0) {
          console.log(`      カラム定義の差異:`);
          diffs.forEach(d => console.log(d));
        }
        console.log('');
      } else {
        matchCount++;
        // 詳細は出力しないが、進捗を表示
        if (matchCount % 10 === 0 || matchCount === commonTables.length) {
          process.stdout.write(`   ✅ ${matchCount}/${commonTables.length}個のテーブルを確認済み...\r`);
        }
      }
    }
    
    console.log(`\n   一致: ${matchCount}個、差異あり: ${diffCount}個\n`);

    // 3. ENUM型の比較
    console.log('📊 3. ENUM型の比較:');
    console.log('─'.repeat(60));
    
    const prodEnums = await prodDb.execute(sql`
      SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder) as enum_values
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname IN ('user_role', 'schedule_status', 'record_status', 'visit_status_record', 'recurrence_pattern')
      GROUP BY t.typname
      ORDER BY t.typname
    `);
    
    const devEnums = await devDb.execute(sql`
      SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder) as enum_values
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname IN ('user_role', 'schedule_status', 'record_status', 'visit_status_record', 'recurrence_pattern')
      GROUP BY t.typname
      ORDER BY t.typname
    `);
    
    const prodEnumMap = new Map(prodEnums.rows.map((r: any) => [r.typname, r.enum_values]));
    const devEnumMap = new Map(devEnums.rows.map((r: any) => [r.typname, r.enum_values]));
    
    const allEnumNames = new Set([...prodEnumMap.keys(), ...devEnumMap.keys()]);
    
    for (const enumName of Array.from(allEnumNames).sort()) {
      const prodValues = prodEnumMap.get(enumName) || [];
      const devValues = devEnumMap.get(enumName) || [];
      
      if (JSON.stringify(prodValues) !== JSON.stringify(devValues)) {
        console.log(`   ⚠️  ${enumName}: 差異あり`);
        console.log(`      本番環境: [${prodValues.join(', ')}]`);
        console.log(`      開発環境: [${devValues.join(', ')}]\n`);
      } else {
        console.log(`   ✅ ${enumName}: 一致\n`);
      }
    }

    // 4. インデックスの比較（簡易）
    console.log('📊 4. schedulesテーブルのインデックス比較:');
    console.log('─'.repeat(60));
    
    const prodIndexes = await prodDb.execute(sql`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'schedules'
      ORDER BY indexname
    `);
    
    const devIndexes = await devDb.execute(sql`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'schedules'
      ORDER BY indexname
    `);
    
    const prodIndexNames = prodIndexes.rows.map((r: any) => r.indexname).sort();
    const devIndexNames = devIndexes.rows.map((r: any) => r.indexname).sort();
    
    if (JSON.stringify(prodIndexNames) !== JSON.stringify(devIndexNames)) {
      console.log(`   ⚠️  インデックスに差異あり`);
      console.log(`      本番環境: ${prodIndexNames.length}個`);
      console.log(`      開発環境: ${devIndexNames.length}個\n`);
    } else {
      console.log(`   ✅ インデックスは一致しています (${prodIndexNames.length}個)\n`);
    }

    console.log('─'.repeat(60));
    console.log('✅ スキーマ比較が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prodPool.end();
    await devPool.end();
  }
}

compareSchemas()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('処理中にエラーが発生しました:', error);
    process.exit(1);
  });

