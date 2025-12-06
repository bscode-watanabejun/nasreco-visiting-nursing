/**
 * 本番環境の新規テーブル（3つ）の作成状況を確認するスクリプト
 * 
 * 確認項目:
 * 1. receipt_special_note_codes
 * 2. work_related_reason_codes
 * 3. visiting_nursing_master_basic
 * 
 * 実行方法:
 *   npx tsx scripts/verify-new-tables-in-production.ts
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

// 本番環境のデータベース接続文字列
const PROD_DB_URL = 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function verifyNewTables() {
  console.log('🔍 本番環境の新規テーブルの作成状況を確認します...\n');
  console.log('⚠️  本番データベースに接続します（読み取り専用）\n');
  console.log('═'.repeat(80));
  
  const prodPool = new Pool({ connectionString: PROD_DB_URL });

  try {
    // 1. receipt_special_note_codes テーブルの確認
    console.log('\n📊 1. receipt_special_note_codes テーブル');
    console.log('─'.repeat(80));
    
    try {
      const tableExists = await prodPool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'receipt_special_note_codes'
        )
      `);
      
      if (tableExists.rows[0].exists) {
        console.log('   ✅ テーブルが存在します');
        
        // カラム情報を取得
        const columns = await prodPool.query(`
          SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'receipt_special_note_codes'
          ORDER BY ordinal_position
        `);
        
        console.log(`\n   カラム数: ${columns.rows.length}件`);
        columns.rows.forEach((col: any) => {
          const nullable = col.is_nullable === 'YES' ? 'NULL可' : 'NOT NULL';
          const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : '';
          console.log(`     - ${col.column_name}: ${col.data_type} (${nullable})${defaultVal}`);
        });
        
        // データ件数を確認
        const dataCount = await prodPool.query(`
          SELECT COUNT(*) as count FROM receipt_special_note_codes
        `);
        console.log(`\n   データ件数: ${dataCount.rows[0].count}件`);
        
        if (parseInt(dataCount.rows[0].count) > 0) {
          const sampleData = await prodPool.query(`
            SELECT code, name, description, display_order, is_active
            FROM receipt_special_note_codes
            ORDER BY display_order
            LIMIT 5
          `);
          console.log('\n   サンプルデータ（最初の5件）:');
          sampleData.rows.forEach((row: any, index: number) => {
            console.log(`     ${index + 1}. ${row.code} - ${row.name} (表示順: ${row.display_order}, 有効: ${row.is_active})`);
          });
        } else {
          console.log('   ⚠️  データは投入されていません（手動投入が必要）');
        }
      } else {
        console.log('   ❌ テーブルが存在しません');
      }
    } catch (error: any) {
      console.log(`   ❌ エラー: ${error.message}`);
    }

    // 2. work_related_reason_codes テーブルの確認
    console.log('\n📊 2. work_related_reason_codes テーブル');
    console.log('─'.repeat(80));
    
    try {
      const tableExists = await prodPool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'work_related_reason_codes'
        )
      `);
      
      if (tableExists.rows[0].exists) {
        console.log('   ✅ テーブルが存在します');
        
        // カラム情報を取得
        const columns = await prodPool.query(`
          SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'work_related_reason_codes'
          ORDER BY ordinal_position
        `);
        
        console.log(`\n   カラム数: ${columns.rows.length}件`);
        columns.rows.forEach((col: any) => {
          const nullable = col.is_nullable === 'YES' ? 'NULL可' : 'NOT NULL';
          const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : '';
          console.log(`     - ${col.column_name}: ${col.data_type} (${nullable})${defaultVal}`);
        });
        
        // データ件数を確認
        const dataCount = await prodPool.query(`
          SELECT COUNT(*) as count FROM work_related_reason_codes
        `);
        console.log(`\n   データ件数: ${dataCount.rows[0].count}件`);
        
        if (parseInt(dataCount.rows[0].count) > 0) {
          const sampleData = await prodPool.query(`
            SELECT code, name, description, display_order, is_active
            FROM work_related_reason_codes
            ORDER BY display_order
            LIMIT 5
          `);
          console.log('\n   サンプルデータ（最初の5件）:');
          sampleData.rows.forEach((row: any, index: number) => {
            console.log(`     ${index + 1}. ${row.code} - ${row.name} (表示順: ${row.display_order}, 有効: ${row.is_active})`);
          });
        } else {
          console.log('   ⚠️  データは投入されていません（手動投入が必要）');
        }
      } else {
        console.log('   ❌ テーブルが存在しません');
      }
    } catch (error: any) {
      console.log(`   ❌ エラー: ${error.message}`);
    }

    // 3. visiting_nursing_master_basic テーブルの確認
    console.log('\n📊 3. visiting_nursing_master_basic テーブル');
    console.log('─'.repeat(80));
    
    try {
      const tableExists = await prodPool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'visiting_nursing_master_basic'
        )
      `);
      
      if (tableExists.rows[0].exists) {
        console.log('   ✅ テーブルが存在します');
        
        // カラム情報を取得
        const columns = await prodPool.query(`
          SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'visiting_nursing_master_basic'
          ORDER BY ordinal_position
        `);
        
        console.log(`\n   カラム数: ${columns.rows.length}件`);
        columns.rows.forEach((col: any) => {
          const nullable = col.is_nullable === 'YES' ? 'NULL可' : 'NOT NULL';
          const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : '';
          console.log(`     - ${col.column_name}: ${col.data_type} (${nullable})${defaultVal}`);
        });
        
        // データ件数を確認
        const dataCount = await prodPool.query(`
          SELECT COUNT(*) as count FROM visiting_nursing_master_basic
        `);
        console.log(`\n   データ件数: ${dataCount.rows[0].count}件`);
        
        if (parseInt(dataCount.rows[0].count) > 0) {
          const sampleData = await prodPool.query(`
            SELECT 
              vmb.service_code_id,
              nsc.service_code,
              nsc.service_name,
              vmb.instruction_type,
              vmb.service_type
            FROM visiting_nursing_master_basic vmb
            LEFT JOIN nursing_service_codes nsc ON vmb.service_code_id = nsc.id
            ORDER BY nsc.service_code
            LIMIT 5
          `);
          console.log('\n   サンプルデータ（最初の5件）:');
          sampleData.rows.forEach((row: any, index: number) => {
            console.log(`     ${index + 1}. ${row.service_code || '(サービスコード不明)'} - ${row.service_name?.substring(0, 40) || '(名称不明)'}...`);
            console.log(`        指示区分: ${row.instruction_type || '(未設定)'}, 療養費種類: ${row.service_type || '(未設定)'}`);
          });
        } else {
          console.log('   ⚠️  データは投入されていません（手動投入が必要）');
        }
      } else {
        console.log('   ❌ テーブルが存在しません');
      }
    } catch (error: any) {
      console.log(`   ❌ エラー: ${error.message}`);
    }

    // 4. まとめ
    console.log('\n📊 4. まとめ');
    console.log('─'.repeat(80));
    
    const allTables = await prodPool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      AND table_name IN ('receipt_special_note_codes', 'work_related_reason_codes', 'visiting_nursing_master_basic')
      ORDER BY table_name
    `);
    
    console.log(`\n   作成されたテーブル数: ${allTables.rows.length}/3`);
    allTables.rows.forEach((row: any) => {
      console.log(`     ✅ ${row.table_name}`);
    });
    
    const missingTables = ['receipt_special_note_codes', 'work_related_reason_codes', 'visiting_nursing_master_basic']
      .filter(name => !allTables.rows.some((r: any) => r.table_name === name));
    
    if (missingTables.length > 0) {
      console.log('\n   ⚠️  未作成のテーブル:');
      missingTables.forEach(name => {
        console.log(`     ❌ ${name}`);
      });
    }

    console.log('\n' + '═'.repeat(80));
    console.log('✅ 確認が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prodPool.end();
  }
}

verifyNewTables()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('処理中にエラーが発生しました:', error);
    process.exit(1);
  });




























