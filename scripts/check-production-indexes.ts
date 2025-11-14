/**
 * 本番環境のインデックス状態を確認するスクリプト
 * unique_nursing_record_bonus_masterインデックスの存在を確認
 */

import { Pool } from 'pg';

const PROD_DB_URL = process.env.PRODUCTION_DB_URL || 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function checkProductionIndexes() {
  console.log('🔍 本番環境のインデックス状態を確認します...\n');
  
  const pool = new Pool({ connectionString: PROD_DB_URL });

  try {
    // bonus_calculation_historyテーブルのインデックスを確認
    const indexQuery = `
      SELECT 
        indexname,
        indexdef,
        tablename
      FROM pg_indexes
      WHERE tablename = 'bonus_calculation_history'
      ORDER BY indexname;
    `;

    const indexes = await pool.query(indexQuery);
    
    console.log('📊 bonus_calculation_historyテーブルのインデックス:');
    console.log('─'.repeat(60));
    
    if (indexes.rows.length === 0) {
      console.log('   インデックスが見つかりませんでした。\n');
    } else {
      indexes.rows.forEach((row, index) => {
        console.log(`${index + 1}. ${row.indexname}`);
        console.log(`   テーブル: ${row.tablename}`);
        console.log(`   定義: ${row.indexdef}`);
        console.log('');
      });
    }

    // unique_nursing_record_bonus_masterインデックスの存在を確認
    const uniqueIndex = indexes.rows.find(
      idx => idx.indexname === 'unique_nursing_record_bonus_master'
    );

    if (uniqueIndex) {
      console.log('✅ unique_nursing_record_bonus_masterインデックスが存在します。');
      console.log(`   定義: ${uniqueIndex.indexdef}\n`);
    } else {
      console.log('⚠️  unique_nursing_record_bonus_masterインデックスが存在しません。\n');
    }

    // 制約も確認
    const constraintQuery = `
      SELECT 
        conname AS constraint_name,
        contype AS constraint_type,
        pg_get_constraintdef(oid) AS constraint_definition
      FROM pg_constraint
      WHERE conrelid = 'bonus_calculation_history'::regclass
      ORDER BY conname;
    `;

    const constraints = await pool.query(constraintQuery);
    
    console.log('📊 bonus_calculation_historyテーブルの制約:');
    console.log('─'.repeat(60));
    
    if (constraints.rows.length === 0) {
      console.log('   制約が見つかりませんでした。\n');
    } else {
      constraints.rows.forEach((row, index) => {
        console.log(`${index + 1}. ${row.constraint_name} (${row.constraint_type})`);
        console.log(`   定義: ${row.constraint_definition}`);
        console.log('');
      });
    }

    // ユニーク制約を確認
    const uniqueConstraints = constraints.rows.filter(
      c => c.constraint_type === 'u'
    );

    if (uniqueConstraints.length > 0) {
      console.log('📊 ユニーク制約:');
      uniqueConstraints.forEach((constraint, index) => {
        console.log(`${index + 1}. ${constraint.constraint_name}`);
        console.log(`   定義: ${constraint.constraint_definition}\n`);
      });
    }

    console.log('─'.repeat(60));
    console.log('✅ インデックス確認が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

checkProductionIndexes()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

