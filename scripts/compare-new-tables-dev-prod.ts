/**
 * 開発環境と本番環境の新規テーブル（3つ）のデータを比較するスクリプト
 * 
 * 比較対象:
 * 1. receipt_special_note_codes
 * 2. work_related_reason_codes
 * 3. visiting_nursing_master_basic
 * 
 * 実行方法:
 *   npx tsx scripts/compare-new-tables-dev-prod.ts
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

// データベース接続文字列
const PROD_DB_URL = 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';
const DEV_DB_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_beoRr4gaQ5Dl@ep-polished-scene-a5twqv82.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function compareTables() {
  console.log('🔍 開発環境と本番環境の新規テーブルのデータを比較します...\n');
  console.log('⚠️  本番データベースに接続します（読み取り専用）\n');
  console.log('═'.repeat(80));
  
  const prodPool = new Pool({ connectionString: PROD_DB_URL });
  const devPool = new Pool({ connectionString: DEV_DB_URL });

  try {
    // 1. receipt_special_note_codes の比較
    console.log('\n📊 1. receipt_special_note_codes の比較');
    console.log('─'.repeat(80));
    
    const prodCodes1 = await prodPool.query(`
      SELECT code, name, description, display_order, is_active
      FROM receipt_special_note_codes
      ORDER BY display_order
    `);
    
    const devCodes1 = await devPool.query(`
      SELECT code, name, description, display_order, is_active
      FROM receipt_special_note_codes
      ORDER BY display_order
    `);
    
    console.log(`   本番環境: ${prodCodes1.rows.length}件`);
    console.log(`   開発環境: ${devCodes1.rows.length}件`);
    
    if (prodCodes1.rows.length !== devCodes1.rows.length) {
      console.log(`   ⚠️  件数に差異があります`);
    } else {
      console.log(`   ✅ 件数は一致しています`);
    }
    
    // 詳細比較
    const prodCodeMap1 = new Map(prodCodes1.rows.map((r: any) => [r.code, r]));
    const devCodeMap1 = new Map(devCodes1.rows.map((r: any) => [r.code, r]));
    
    const onlyInProd1 = Array.from(prodCodeMap1.keys()).filter(code => !devCodeMap1.has(code));
    const onlyInDev1 = Array.from(devCodeMap1.keys()).filter(code => !prodCodeMap1.has(code));
    const differences1: string[] = [];
    
    for (const code of Array.from(prodCodeMap1.keys()).filter(c => devCodeMap1.has(c))) {
      const prod = prodCodeMap1.get(code)!;
      const dev = devCodeMap1.get(code)!;
      
      if (prod.name !== dev.name || prod.description !== dev.description || 
          prod.display_order !== dev.display_order || prod.is_active !== dev.is_active) {
        differences1.push(code);
      }
    }
    
    if (onlyInProd1.length > 0) {
      console.log(`\n   ⚠️  本番環境にのみ存在: ${onlyInProd1.length}件`);
      onlyInProd1.forEach(code => {
        const prod = prodCodeMap1.get(code)!;
        console.log(`     - ${code}: ${prod.name}`);
      });
    }
    
    if (onlyInDev1.length > 0) {
      console.log(`\n   ⚠️  開発環境にのみ存在: ${onlyInDev1.length}件`);
      onlyInDev1.forEach(code => {
        const dev = devCodeMap1.get(code)!;
        console.log(`     - ${code}: ${dev.name}`);
      });
    }
    
    if (differences1.length > 0) {
      console.log(`\n   ⚠️  内容に差異があるコード: ${differences1.length}件`);
      differences1.slice(0, 5).forEach(code => {
        const prod = prodCodeMap1.get(code)!;
        const dev = devCodeMap1.get(code)!;
        console.log(`     - ${code}:`);
        if (prod.name !== dev.name) console.log(`       名称: 本番="${prod.name}" vs 開発="${dev.name}"`);
        if (prod.description !== dev.description) console.log(`       説明: 本番="${prod.description}" vs 開発="${dev.description}"`);
        if (prod.display_order !== dev.display_order) console.log(`       表示順: 本番=${prod.display_order} vs 開発=${dev.display_order}`);
        if (prod.is_active !== dev.is_active) console.log(`       有効: 本番=${prod.is_active} vs 開発=${dev.is_active}`);
      });
    }
    
    if (onlyInProd1.length === 0 && onlyInDev1.length === 0 && differences1.length === 0) {
      console.log(`\n   ✅ データは完全に一致しています`);
    }

    // 2. work_related_reason_codes の比較
    console.log('\n📊 2. work_related_reason_codes の比較');
    console.log('─'.repeat(80));
    
    const prodCodes2 = await prodPool.query(`
      SELECT code, name, description, display_order, is_active
      FROM work_related_reason_codes
      ORDER BY display_order
    `);
    
    const devCodes2 = await devPool.query(`
      SELECT code, name, description, display_order, is_active
      FROM work_related_reason_codes
      ORDER BY display_order
    `);
    
    console.log(`   本番環境: ${prodCodes2.rows.length}件`);
    console.log(`   開発環境: ${devCodes2.rows.length}件`);
    
    if (prodCodes2.rows.length !== devCodes2.rows.length) {
      console.log(`   ⚠️  件数に差異があります`);
    } else {
      console.log(`   ✅ 件数は一致しています`);
    }
    
    // 詳細比較
    const prodCodeMap2 = new Map(prodCodes2.rows.map((r: any) => [r.code, r]));
    const devCodeMap2 = new Map(devCodes2.rows.map((r: any) => [r.code, r]));
    
    const onlyInProd2 = Array.from(prodCodeMap2.keys()).filter(code => !devCodeMap2.has(code));
    const onlyInDev2 = Array.from(devCodeMap2.keys()).filter(code => !prodCodeMap2.has(code));
    const differences2: string[] = [];
    
    for (const code of Array.from(prodCodeMap2.keys()).filter(c => devCodeMap2.has(c))) {
      const prod = prodCodeMap2.get(code)!;
      const dev = devCodeMap2.get(code)!;
      
      if (prod.name !== dev.name || prod.description !== dev.description || 
          prod.display_order !== dev.display_order || prod.is_active !== dev.is_active) {
        differences2.push(code);
      }
    }
    
    if (onlyInProd2.length > 0) {
      console.log(`\n   ⚠️  本番環境にのみ存在: ${onlyInProd2.length}件`);
      onlyInProd2.forEach(code => {
        const prod = prodCodeMap2.get(code)!;
        console.log(`     - ${code}: ${prod.name}`);
      });
    }
    
    if (onlyInDev2.length > 0) {
      console.log(`\n   ⚠️  開発環境にのみ存在: ${onlyInDev2.length}件`);
      onlyInDev2.forEach(code => {
        const dev = devCodeMap2.get(code)!;
        console.log(`     - ${code}: ${dev.name}`);
      });
    }
    
    if (differences2.length > 0) {
      console.log(`\n   ⚠️  内容に差異があるコード: ${differences2.length}件`);
      differences2.forEach(code => {
        const prod = prodCodeMap2.get(code)!;
        const dev = devCodeMap2.get(code)!;
        console.log(`     - ${code}:`);
        if (prod.name !== dev.name) console.log(`       名称: 本番="${prod.name}" vs 開発="${dev.name}"`);
        if (prod.description !== dev.description) console.log(`       説明: 本番="${prod.description}" vs 開発="${dev.description}"`);
        if (prod.display_order !== dev.display_order) console.log(`       表示順: 本番=${prod.display_order} vs 開発=${dev.display_order}`);
        if (prod.is_active !== dev.is_active) console.log(`       有効: 本番=${prod.is_active} vs 開発=${dev.is_active}`);
      });
    }
    
    if (onlyInProd2.length === 0 && onlyInDev2.length === 0 && differences2.length === 0) {
      console.log(`\n   ✅ データは完全に一致しています`);
    }

    // 3. visiting_nursing_master_basic の比較
    console.log('\n📊 3. visiting_nursing_master_basic の比較');
    console.log('─'.repeat(80));
    
    const prodCodes3 = await prodPool.query(`
      SELECT 
        vmb.service_code_id,
        nsc.service_code,
        vmb.instruction_type,
        vmb.receipt_symbol_1,
        vmb.service_type,
        vmb.receipt_display_column,
        vmb.receipt_display_item,
        vmb.amount_type
      FROM visiting_nursing_master_basic vmb
      LEFT JOIN nursing_service_codes nsc ON vmb.service_code_id = nsc.id
      ORDER BY nsc.service_code
    `);
    
    const devCodes3 = await devPool.query(`
      SELECT 
        vmb.service_code_id,
        nsc.service_code,
        vmb.instruction_type,
        vmb.receipt_symbol_1,
        vmb.service_type,
        vmb.receipt_display_column,
        vmb.receipt_display_item,
        vmb.amount_type
      FROM visiting_nursing_master_basic vmb
      LEFT JOIN nursing_service_codes nsc ON vmb.service_code_id = nsc.id
      ORDER BY nsc.service_code
    `);
    
    console.log(`   本番環境: ${prodCodes3.rows.length}件`);
    console.log(`   開発環境: ${devCodes3.rows.length}件`);
    
    if (prodCodes3.rows.length !== devCodes3.rows.length) {
      console.log(`   ⚠️  件数に差異があります`);
    } else {
      console.log(`   ✅ 件数は一致しています`);
    }
    
    // サービスコードでマッピング
    const prodCodeMap3 = new Map(prodCodes3.rows.map((r: any) => [r.service_code, r]));
    const devCodeMap3 = new Map(devCodes3.rows.map((r: any) => [r.service_code, r]));
    
    const onlyInProd3 = Array.from(prodCodeMap3.keys()).filter(code => code && !devCodeMap3.has(code));
    const onlyInDev3 = Array.from(devCodeMap3.keys()).filter(code => code && !prodCodeMap3.has(code));
    const differences3: string[] = [];
    
    for (const code of Array.from(prodCodeMap3.keys()).filter(c => c && devCodeMap3.has(c))) {
      const prod = prodCodeMap3.get(code)!;
      const dev = devCodeMap3.get(code)!;
      
      if (prod.instruction_type !== dev.instruction_type || 
          prod.receipt_symbol_1 !== dev.receipt_symbol_1 ||
          prod.service_type !== dev.service_type ||
          prod.receipt_display_column !== dev.receipt_display_column ||
          prod.receipt_display_item !== dev.receipt_display_item ||
          prod.amount_type !== dev.amount_type) {
        differences3.push(code);
      }
    }
    
    if (onlyInProd3.length > 0) {
      console.log(`\n   ⚠️  本番環境にのみ存在: ${onlyInProd3.length}件`);
      onlyInProd3.slice(0, 10).forEach(code => {
        console.log(`     - ${code}`);
      });
      if (onlyInProd3.length > 10) {
        console.log(`     ... 他 ${onlyInProd3.length - 10}件`);
      }
    }
    
    if (onlyInDev3.length > 0) {
      console.log(`\n   ⚠️  開発環境にのみ存在: ${onlyInDev3.length}件`);
      onlyInDev3.slice(0, 10).forEach(code => {
        console.log(`     - ${code}`);
      });
      if (onlyInDev3.length > 10) {
        console.log(`     ... 他 ${onlyInDev3.length - 10}件`);
      }
    }
    
    if (differences3.length > 0) {
      console.log(`\n   ⚠️  内容に差異があるサービスコード: ${differences3.length}件`);
      differences3.slice(0, 5).forEach(code => {
        const prod = prodCodeMap3.get(code)!;
        const dev = devCodeMap3.get(code)!;
        console.log(`     - ${code}:`);
        if (prod.instruction_type !== dev.instruction_type) console.log(`       指示区分: 本番="${prod.instruction_type}" vs 開発="${dev.instruction_type}"`);
        if (prod.service_type !== dev.service_type) console.log(`       療養費種類: 本番="${prod.service_type}" vs 開発="${dev.service_type}"`);
        if (prod.amount_type !== dev.amount_type) console.log(`       金額識別: 本番="${prod.amount_type}" vs 開発="${dev.amount_type}"`);
      });
      if (differences3.length > 5) {
        console.log(`     ... 他 ${differences3.length - 5}件`);
      }
    }
    
    if (onlyInProd3.length === 0 && onlyInDev3.length === 0 && differences3.length === 0) {
      console.log(`\n   ✅ データは完全に一致しています`);
    }

    // 4. まとめ
    console.log('\n📊 4. まとめ');
    console.log('─'.repeat(80));
    
    const hasDifferences = 
      (onlyInProd1.length > 0 || onlyInDev1.length > 0 || differences1.length > 0) ||
      (onlyInProd2.length > 0 || onlyInDev2.length > 0 || differences2.length > 0) ||
      (onlyInProd3.length > 0 || onlyInDev3.length > 0 || differences3.length > 0);
    
    if (!hasDifferences) {
      console.log('\n   ✅ すべてのテーブルでデータが完全に一致しています');
    } else {
      console.log('\n   ⚠️  一部のテーブルで差異が検出されました');
      console.log('\n   差異の詳細:');
      
      if (onlyInProd1.length > 0 || onlyInDev1.length > 0 || differences1.length > 0) {
        console.log(`     - receipt_special_note_codes: 本番のみ=${onlyInProd1.length}件, 開発のみ=${onlyInDev1.length}件, 内容差異=${differences1.length}件`);
      }
      
      if (onlyInProd2.length > 0 || onlyInDev2.length > 0 || differences2.length > 0) {
        console.log(`     - work_related_reason_codes: 本番のみ=${onlyInProd2.length}件, 開発のみ=${onlyInDev2.length}件, 内容差異=${differences2.length}件`);
      }
      
      if (onlyInProd3.length > 0 || onlyInDev3.length > 0 || differences3.length > 0) {
        console.log(`     - visiting_nursing_master_basic: 本番のみ=${onlyInProd3.length}件, 開発のみ=${onlyInDev3.length}件, 内容差異=${differences3.length}件`);
      }
    }

    console.log('\n' + '═'.repeat(80));
    console.log('✅ 比較が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prodPool.end();
    await devPool.end();
  }
}

compareTables()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('処理中にエラーが発生しました:', error);
    process.exit(1);
  });













