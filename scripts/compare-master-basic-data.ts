/**
 * 開発環境と本番環境のvisiting_nursing_master_basicテーブルの詳細比較スクリプト
 * 
 * 特に新しく追加した4つのカラムのデータが正しく投入されているか確認します。
 * 
 * 実行方法:
 *   npx tsx scripts/compare-master-basic-data.ts
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

// データベース接続文字列
const PROD_DB_URL = 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';
const DEV_DB_URL = 'postgresql://neondb_owner:npg_beoRr4gaQ5Dl@ep-polished-scene-a5twqv82.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function compareMasterBasicData() {
  console.log('🔍 開発環境と本番環境のvisiting_nursing_master_basicテーブル比較\n');
  console.log('═'.repeat(80));
  
  const prodPool = new Pool({ connectionString: PROD_DB_URL });
  const devPool = new Pool({ connectionString: DEV_DB_URL });

  try {
    // ========== 1. 基本統計情報の比較 ==========
    console.log('\n📊 1. 基本統計情報の比較');
    console.log('─'.repeat(80));
    
    const prodCount = await prodPool.query(`
      SELECT COUNT(*) as count FROM visiting_nursing_master_basic
    `);
    
    const devCount = await devPool.query(`
      SELECT COUNT(*) as count FROM visiting_nursing_master_basic
    `);
    
    const prodC = parseInt(prodCount.rows[0].count);
    const devC = parseInt(devCount.rows[0].count);
    
    console.log(`   本番環境: ${prodC}件`);
    console.log(`   開発環境: ${devC}件`);
    
    if (prodC !== devC) {
      console.log(`   ⚠️  件数に差異があります（${prodC} vs ${devC}）`);
    } else {
      console.log(`   ✅ 件数は一致しています`);
    }

    // ========== 2. 新しい4つのカラムのデータ有無確認 ==========
    console.log('\n📊 2. 新しい4つのカラムのデータ有無確認');
    console.log('─'.repeat(80));
    
    const newColumns = [
      { name: 'incremental_calculation_flag', label: 'きざみ値計算識別' },
      { name: 'special_instruction_type', label: '特別訪問看護指示区分' },
      { name: 'visit_count_category', label: '実施回数区分' },
      { name: 'staff_category_codes', label: '職種区分' },
    ];
    
    for (const { name, label } of newColumns) {
      const prodHasData = await prodPool.query(`
        SELECT COUNT(*) as count 
        FROM visiting_nursing_master_basic 
        WHERE ${name} IS NOT NULL
      `);
      
      const devHasData = await devPool.query(`
        SELECT COUNT(*) as count 
        FROM visiting_nursing_master_basic 
        WHERE ${name} IS NOT NULL
      `);
      
      const prodDataCount = parseInt(prodHasData.rows[0].count);
      const devDataCount = parseInt(devHasData.rows[0].count);
      
      console.log(`\n   ${label} (${name}):`);
      console.log(`      本番: ${prodDataCount}件 / ${prodC}件 (${Math.round(prodDataCount / prodC * 100)}%)`);
      console.log(`      開発: ${devDataCount}件 / ${devC}件 (${Math.round(devDataCount / devC * 100)}%)`);
      
      if (prodDataCount !== devDataCount) {
        console.log(`      ⚠️  データ件数に差異があります`);
      } else {
        console.log(`      ✅ データ件数は一致しています`);
      }
    }

    // ========== 3. サンプルデータの比較 ==========
    console.log('\n📊 3. サンプルデータの比較（最初の5件）');
    console.log('─'.repeat(80));
    
    const prodSamples = await prodPool.query(`
      SELECT 
        vmb.id,
        nsc.service_code,
        vmb.incremental_calculation_flag,
        vmb.special_instruction_type,
        vmb.visit_count_category,
        vmb.staff_category_codes,
        vmb.instruction_type
      FROM visiting_nursing_master_basic vmb
      JOIN nursing_service_codes nsc ON vmb.service_code_id = nsc.id
      ORDER BY nsc.service_code
      LIMIT 5
    `);
    
    const devSamples = await devPool.query(`
      SELECT 
        vmb.id,
        nsc.service_code,
        vmb.incremental_calculation_flag,
        vmb.special_instruction_type,
        vmb.visit_count_category,
        vmb.staff_category_codes,
        vmb.instruction_type
      FROM visiting_nursing_master_basic vmb
      JOIN nursing_service_codes nsc ON vmb.service_code_id = nsc.id
      ORDER BY nsc.service_code
      LIMIT 5
    `);
    
    console.log('\n   本番環境のサンプル:');
    for (const row of prodSamples.rows) {
      console.log(`     サービスコード: ${row.service_code}`);
      console.log(`       きざみ値計算識別: ${row.incremental_calculation_flag || '(NULL)'}`);
      console.log(`       特別訪問看護指示区分: ${row.special_instruction_type || '(NULL)'}`);
      console.log(`       実施回数区分: ${row.visit_count_category || '(NULL)'}`);
      console.log(`       職種区分: ${row.staff_category_codes ? JSON.stringify(row.staff_category_codes) : '(NULL)'}`);
      console.log(`       訪問看護指示区分: ${row.instruction_type || '(NULL)'}`);
      console.log('');
    }
    
    console.log('   開発環境のサンプル:');
    for (const row of devSamples.rows) {
      console.log(`     サービスコード: ${row.service_code}`);
      console.log(`       きざみ値計算識別: ${row.incremental_calculation_flag || '(NULL)'}`);
      console.log(`       特別訪問看護指示区分: ${row.special_instruction_type || '(NULL)'}`);
      console.log(`       実施回数区分: ${row.visit_count_category || '(NULL)'}`);
      console.log(`       職種区分: ${row.staff_category_codes ? JSON.stringify(row.staff_category_codes) : '(NULL)'}`);
      console.log(`       訪問看護指示区分: ${row.instruction_type || '(NULL)'}`);
      console.log('');
    }

    // ========== 4. 特定サービスコードの詳細比較 ==========
    console.log('\n📊 4. 特定サービスコードの詳細比較');
    console.log('─'.repeat(80));
    
    // よく使われるサービスコードを確認
    const testServiceCodes = ['510000110', '510000210', '510002070', '510003970'];
    
    for (const serviceCode of testServiceCodes) {
      const prodData = await prodPool.query(`
        SELECT 
          vmb.incremental_calculation_flag,
          vmb.special_instruction_type,
          vmb.visit_count_category,
          vmb.staff_category_codes,
          vmb.instruction_type
        FROM visiting_nursing_master_basic vmb
        JOIN nursing_service_codes nsc ON vmb.service_code_id = nsc.id
        WHERE nsc.service_code = $1
      `, [serviceCode]);
      
      const devData = await devPool.query(`
        SELECT 
          vmb.incremental_calculation_flag,
          vmb.special_instruction_type,
          vmb.visit_count_category,
          vmb.staff_category_codes,
          vmb.instruction_type
        FROM visiting_nursing_master_basic vmb
        JOIN nursing_service_codes nsc ON vmb.service_code_id = nsc.id
        WHERE nsc.service_code = $1
      `, [serviceCode]);
      
      console.log(`\n   サービスコード: ${serviceCode}`);
      
      if (prodData.rows.length === 0 && devData.rows.length === 0) {
        console.log(`      ⚠️  両環境ともデータが見つかりませんでした`);
        continue;
      }
      
      if (prodData.rows.length === 0) {
        console.log(`      ⚠️  本番環境にデータがありません`);
        continue;
      }
      
      if (devData.rows.length === 0) {
        console.log(`      ⚠️  開発環境にデータがありません`);
        continue;
      }
      
      const prod = prodData.rows[0];
      const dev = devData.rows[0];
      
      const fields = [
        { name: 'incremental_calculation_flag', label: 'きざみ値計算識別' },
        { name: 'special_instruction_type', label: '特別訪問看護指示区分' },
        { name: 'visit_count_category', label: '実施回数区分' },
        { name: 'staff_category_codes', label: '職種区分' },
        { name: 'instruction_type', label: '訪問看護指示区分' },
      ];
      
      let hasDiff = false;
      for (const { name, label } of fields) {
        const prodVal = prod[name];
        const devVal = dev[name];
        
        // JSONフィールドの比較
        if (name === 'staff_category_codes') {
          const prodJson = prodVal ? JSON.stringify(prodVal) : null;
          const devJson = devVal ? JSON.stringify(devVal) : null;
          
          if (prodJson !== devJson) {
            console.log(`      ⚠️  ${label}:`);
            console.log(`         本番: ${prodJson || '(NULL)'}`);
            console.log(`         開発: ${devJson || '(NULL)'}`);
            hasDiff = true;
          }
        } else {
          if (prodVal !== devVal) {
            console.log(`      ⚠️  ${label}:`);
            console.log(`         本番: ${prodVal || '(NULL)'}`);
            console.log(`         開発: ${devVal || '(NULL)'}`);
            hasDiff = true;
          }
        }
      }
      
      if (!hasDiff) {
        console.log(`      ✅ すべてのフィールドが一致しています`);
      }
    }

    // ========== 5. まとめ ==========
    console.log('\n📊 5. まとめ');
    console.log('─'.repeat(80));
    
    // NULL値の割合を確認
    const prodNullStats = await prodPool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE incremental_calculation_flag IS NULL) as incremental_null,
        COUNT(*) FILTER (WHERE special_instruction_type IS NULL) as special_null,
        COUNT(*) FILTER (WHERE visit_count_category IS NULL) as visit_count_null,
        COUNT(*) FILTER (WHERE staff_category_codes IS NULL) as staff_null
      FROM visiting_nursing_master_basic
    `);
    
    const devNullStats = await devPool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE incremental_calculation_flag IS NULL) as incremental_null,
        COUNT(*) FILTER (WHERE special_instruction_type IS NULL) as special_null,
        COUNT(*) FILTER (WHERE visit_count_category IS NULL) as visit_count_null,
        COUNT(*) FILTER (WHERE staff_category_codes IS NULL) as staff_null
      FROM visiting_nursing_master_basic
    `);
    
    const prodNull = prodNullStats.rows[0];
    const devNull = devNullStats.rows[0];
    
    console.log('\n   NULL値の統計:');
    console.log(`   きざみ値計算識別:`);
    console.log(`     本番: ${prodNull.incremental_null}件 / ${prodC}件`);
    console.log(`     開発: ${devNull.incremental_null}件 / ${devC}件`);
    console.log(`   特別訪問看護指示区分:`);
    console.log(`     本番: ${prodNull.special_null}件 / ${prodC}件`);
    console.log(`     開発: ${devNull.special_null}件 / ${devC}件`);
    console.log(`   実施回数区分:`);
    console.log(`     本番: ${prodNull.visit_count_null}件 / ${prodC}件`);
    console.log(`     開発: ${devNull.visit_count_null}件 / ${devC}件`);
    console.log(`   職種区分:`);
    console.log(`     本番: ${prodNull.staff_null}件 / ${prodC}件`);
    console.log(`     開発: ${devNull.staff_null}件 / ${devC}件`);
    
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

compareMasterBasicData()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('処理中にエラーが発生しました:', error);
    process.exit(1);
  });

