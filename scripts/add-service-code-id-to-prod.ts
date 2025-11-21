/**
 * 本番環境のbonus_calculation_historyテーブルにservice_code_idカラムを追加するスクリプト
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from "ws";

neonConfig.webSocketConstructor = ws;

if (!process.env.PROD_DATABASE_URL) {
  console.error('❌ PROD_DATABASE_URL環境変数が設定されていません');
  process.exit(1);
}

const prodPool = new Pool({ connectionString: process.env.PROD_DATABASE_URL });

async function addServiceCodeIdColumn() {
  console.log('🔍 本番環境のbonus_calculation_historyテーブルにservice_code_idカラムを追加中...\n');

  try {
    // 1. 現在の状態を確認
    console.log('📋 現在の状態を確認中...');
    const currentColumns = await prodPool.query(`
      SELECT column_name
      FROM information_schema.columns 
      WHERE table_name = 'bonus_calculation_history'
        AND table_schema = 'public'
        AND column_name = 'service_code_id';
    `);

    if (currentColumns.rows.length > 0) {
      console.log('  ✅ service_code_idカラムは既に存在しています');
      await prodPool.end();
      return;
    }

    console.log('  ⚠️  service_code_idカラムが存在しません。追加します...\n');

    // 2. nursing_service_codesテーブルの存在確認
    console.log('📋 nursing_service_codesテーブルの存在確認...');
    const serviceCodesTable = await prodPool.query(`
      SELECT table_name
      FROM information_schema.tables 
      WHERE table_name = 'nursing_service_codes'
        AND table_schema = 'public';
    `);

    if (serviceCodesTable.rows.length === 0) {
      console.error('  ❌ nursing_service_codesテーブルが存在しません');
      await prodPool.end();
      process.exit(1);
    }
    console.log('  ✅ nursing_service_codesテーブルが存在します\n');

    // 3. カラムを追加
    console.log('🔧 service_code_idカラムを追加中...');
    await prodPool.query(`
      ALTER TABLE bonus_calculation_history 
      ADD COLUMN service_code_id character varying;
    `);
    console.log('  ✅ カラムを追加しました\n');

    // 4. 外部キー制約を追加
    console.log('🔧 外部キー制約を追加中...');
    await prodPool.query(`
      ALTER TABLE bonus_calculation_history
      ADD CONSTRAINT bonus_calculation_history_service_code_id_fk 
      FOREIGN KEY (service_code_id) 
      REFERENCES nursing_service_codes(id);
    `);
    console.log('  ✅ 外部キー制約を追加しました\n');

    // 5. 確認
    console.log('✅ 確認中...');
    const verifyColumns = await prodPool.query(`
      SELECT 
        column_name,
        data_type,
        is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'bonus_calculation_history'
        AND table_schema = 'public'
        AND column_name = 'service_code_id';
    `);

    if (verifyColumns.rows.length === 0) {
      console.error('  ❌ カラムの追加に失敗しました');
      await prodPool.end();
      process.exit(1);
    }

    const column = verifyColumns.rows[0];
    console.log(`  ✅ service_code_idカラムが正しく追加されました:`);
    console.log(`     型: ${column.data_type}`);
    console.log(`     NULL許可: ${column.is_nullable === 'YES' ? 'YES' : 'NO'}\n`);

    // 6. 外部キー制約の確認
    const verifyFK = await prodPool.query(`
      SELECT
        tc.constraint_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_name = 'bonus_calculation_history'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'service_code_id';
    `);

    if (verifyFK.rows.length > 0) {
      const fk = verifyFK.rows[0];
      console.log(`  ✅ 外部キー制約が正しく追加されました:`);
      console.log(`     制約名: ${fk.constraint_name}`);
      console.log(`     カラム: ${fk.column_name}`);
      console.log(`     参照先: ${fk.foreign_table_name}\n`);
    } else {
      console.log('  ⚠️  外部キー制約の確認に失敗しました（追加は成功している可能性があります）\n');
    }

    // 7. 既存データの確認
    const dataCount = await prodPool.query(`
      SELECT COUNT(*) as total_count,
             COUNT(service_code_id) as non_null_count
      FROM bonus_calculation_history;
    `);

    const counts = dataCount.rows[0];
    console.log('📊 既存データの状態:');
    console.log(`  総レコード数: ${counts.total_count}件`);
    console.log(`  service_code_idがNULLのレコード: ${counts.total_count - counts.non_null_count}件`);
    console.log(`  service_code_idが設定されているレコード: ${counts.non_null_count}件\n`);

    console.log('✅ すべての処理が完了しました！');

  } catch (error: any) {
    console.error('❌ エラーが発生しました:', error.message);
    console.error(error);
    await prodPool.end();
    process.exit(1);
  } finally {
    await prodPool.end();
  }
}

addServiceCodeIdColumn();
















