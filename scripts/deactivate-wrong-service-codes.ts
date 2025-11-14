/**
 * フェーズ3: 誤ったサービスコードの無効化
 * 
 * 31から始まる誤ったサービスコードを無効化します。
 * 削除ではなく無効化を選択することで、履歴を保持します。
 * 
 * ⚠️ 警告: このスクリプトは本番データベースに書き込みを行います。
 *    ユーザーの明示的な承認なしに実行しないでください。
 * 
 * 実行方法:
 *   PRODUCTION_DB_URL="postgresql://..." npx tsx scripts/deactivate-wrong-service-codes.ts
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { nursingServiceCodes, nursingRecords, bonusCalculationHistory } from '../shared/schema';
import { sql, like, eq } from 'drizzle-orm';

const PROD_DB_URL = process.env.PRODUCTION_DB_URL || 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function deactivateWrongServiceCodes() {
  console.log('🚀 フェーズ3: 誤ったサービスコードの無効化を実行します...\n');
  console.log('⚠️  本番データベースに接続します\n');
  
  const pool = new Pool({ connectionString: PROD_DB_URL });
  const db = drizzle(pool);

  try {
    // 1. 無効化対象の確認
    console.log('📊 1. 無効化対象の確認中...');
    const wrongCodes = await db.select().from(nursingServiceCodes)
      .where(sql`service_code LIKE '31%' AND is_active = true`);
    
    console.log(`   無効化対象のコード数: ${wrongCodes.length}件\n`);
    
    if (wrongCodes.length === 0) {
      console.log('✅ 無効化対象のコードがありません。\n');
      return;
    }

    // 無効化対象のコード一覧を表示（最初の10件）
    console.log('   無効化対象のコード一覧（最初の10件）:');
    wrongCodes.slice(0, 10).forEach((code, index) => {
      console.log(`   ${index + 1}. ${code.serviceCode} - ${code.serviceName.substring(0, 50)}...`);
    });
    if (wrongCodes.length > 10) {
      console.log(`   ... 他 ${wrongCodes.length - 10}件\n`);
    } else {
      console.log('');
    }

    // 2. 参照が残っていないか確認
    console.log('📊 2. 参照の確認中...');
    const wrongCodeIds = wrongCodes.map(c => c.id);
    
    const recordsUsingWrongCodes = await db.execute<{ count: number }>(sql`
      SELECT COUNT(*) as count
      FROM nursing_records
      WHERE service_code_id IN (${sql.join(wrongCodeIds.map(id => sql`${id}`), sql`, `)})
    `);
    
    const recordCount = Number(recordsUsingWrongCodes.rows[0]?.count || 0);
    console.log(`   訪問記録での参照: ${recordCount}件\n`);
    
    if (recordCount > 0) {
      console.error(`❌ エラー: 訪問記録で ${recordCount}件 の参照が残っています。`);
      console.error(`   先にフェーズ2（参照更新）を実行してください。\n`);
      throw new Error('参照が残っているため無効化できません');
    }

    // 加算計算履歴での参照確認
    const bonusesUsingWrongCodes = await db.execute<{ count: number }>(sql`
      SELECT COUNT(*) as count
      FROM bonus_calculation_history
      WHERE service_code_id IN (${sql.join(wrongCodeIds.map(id => sql`${id}`), sql`, `)})
    `);
    
    const bonusCount = Number(bonusesUsingWrongCodes.rows[0]?.count || 0);
    console.log(`   加算計算履歴での参照: ${bonusCount}件\n`);
    
    if (bonusCount > 0) {
      console.error(`❌ エラー: 加算計算履歴で ${bonusCount}件 の参照が残っています。`);
      console.error(`   先に参照を更新してください。\n`);
      throw new Error('参照が残っているため無効化できません');
    }

    // 3. 確認プロンプト
    console.log('⚠️  誤ったコードを無効化しますか？\n');
    
    const readline = await import('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>(resolve => {
      rl.question('続行しますか？ (yes/no): ', resolve);
    });
    rl.close();
    if (answer.toLowerCase() !== 'yes') {
      console.log('❌ 実行をキャンセルしました。');
      return;
    }
    console.log('');

    // 4. トランザクション内で無効化実行
    console.log('📊 3. 誤ったコードを無効化中...');
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const result = await client.query(
        `UPDATE nursing_service_codes
         SET is_active = false
         WHERE service_code LIKE '31%' AND is_active = true`
      );
      
      const deactivatedCount = result.rowCount || 0;
      
      await client.query('COMMIT');
      
      console.log(`\n✅ 無効化完了:`);
      console.log(`   無効化件数: ${deactivatedCount}件\n`);

      // 5. 無効化後の確認
      console.log('📊 4. 無効化後の確認中...');
      
      const wrongCodesAfter = await db.select().from(nursingServiceCodes)
        .where(sql`service_code LIKE '31%'`);
      
      const activeWrongCodes = wrongCodesAfter.filter(c => c.isActive);
      const inactiveWrongCodes = wrongCodesAfter.filter(c => !c.isActive);
      
      console.log(`   31から始まるコードの総数: ${wrongCodesAfter.length}件`);
      console.log(`   有効なコード: ${activeWrongCodes.length}件`);
      console.log(`   無効なコード: ${inactiveWrongCodes.length}件\n`);
      
      if (activeWrongCodes.length > 0) {
        console.error(`❌ エラー: まだ ${activeWrongCodes.length}件 のコードが有効です。`);
        throw new Error('無効化が不完全です');
      }
      
      console.log(`   ✅ すべての誤ったコードが無効化されました。\n`);

      console.log('✅ フェーズ3が完了しました。\n');

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

deactivateWrongServiceCodes()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

