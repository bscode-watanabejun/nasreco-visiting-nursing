/**
 * フェーズ1: 正しいサービスコードマスタを本番環境に追加
 * 
 * 開発環境から正しいサービスコード（51から始まる）を本番環境に追加します。
 * 既存のコード（31から始まる）は保持します。
 * 
 * ⚠️ 警告: このスクリプトは本番データベースに書き込みを行います。
 *    ユーザーの明示的な承認なしに実行しないでください。
 * 
 * 実行方法:
 *   PRODUCTION_DB_URL="postgresql://..." npx tsx scripts/migrate-service-codes-to-production.ts
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { nursingServiceCodes } from '../shared/schema';
import { sql, eq, and } from 'drizzle-orm';

const PROD_DB_URL = process.env.PRODUCTION_DB_URL || 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';
const DEV_DB_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_beoRr4gaQ5Dl@ep-polished-scene-a5twqv82.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function migrateServiceCodesToProduction() {
  console.log('🚀 フェーズ1: 正しいサービスコードマスタを本番環境に追加します...\n');
  console.log('⚠️  本番データベースに接続します\n');
  
  const prodPool = new Pool({ connectionString: PROD_DB_URL });
  const devPool = new Pool({ connectionString: DEV_DB_URL });
  const prodDb = drizzle(prodPool);
  const devDb = drizzle(devPool);

  try {
    // 1. 開発環境から正しいコード（51から始まる）を取得
    console.log('📊 1. 開発環境から正しいサービスコードを取得中...');
    const devCodes = await devDb.select().from(nursingServiceCodes)
      .where(and(
        sql`service_code LIKE '51%'`,
        eq(nursingServiceCodes.isActive, true)
      ));
    
    console.log(`   開発環境の正しいコード数: ${devCodes.length}件\n`);

    // 2. 本番環境の既存コードを確認
    console.log('📊 2. 本番環境の既存コードを確認中...');
    const prodCodes = await prodDb.select().from(nursingServiceCodes);
    const prodExistingCodes = new Set(prodCodes.map(c => c.serviceCode));
    
    console.log(`   本番環境の既存コード数: ${prodCodes.length}件`);
    console.log(`   31から始まる誤ったコード: ${prodCodes.filter(c => c.serviceCode.startsWith('31')).length}件\n`);

    // 3. 追加対象のコードを特定（重複チェック）
    console.log('📊 3. 追加対象のコードを特定中...');
    const codesToAdd = devCodes.filter(code => !prodExistingCodes.has(code.serviceCode));
    
    console.log(`   追加対象のコード数: ${codesToAdd.length}件`);
    console.log(`   スキップするコード数: ${devCodes.length - codesToAdd.length}件（既に存在）\n`);

    if (codesToAdd.length === 0) {
      console.log('✅ 追加するコードがありません。既にすべてのコードが存在します。\n');
      return;
    }

    // 4. 追加対象のコードの一覧を表示（最初の10件）
    console.log('📊 4. 追加対象のコード一覧（最初の10件）:');
    codesToAdd.slice(0, 10).forEach((code, index) => {
      console.log(`   ${index + 1}. ${code.serviceCode} - ${code.serviceName.substring(0, 50)}...`);
    });
    if (codesToAdd.length > 10) {
      console.log(`   ... 他 ${codesToAdd.length - 10}件\n`);
    } else {
      console.log('');
    }

    // 5. 確認プロンプト（実際の実行時はコメントアウト）
    console.log('⚠️  本番環境に追加しますか？');
    console.log('   実行する場合は、スクリプト内の確認プロンプトを有効化してください。\n');
    
    // 実際の実行時は以下のコメントを外す
    // const readline = require('readline');
    // const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    // const answer = await new Promise<string>(resolve => {
    //   rl.question('続行しますか？ (yes/no): ', resolve);
    // });
    // rl.close();
    // if (answer.toLowerCase() !== 'yes') {
    //   console.log('❌ 実行をキャンセルしました。');
    //   return;
    // }

    // 6. トランザクション内で追加実行
    console.log('📊 5. サービスコードマスタを追加中...');
    const client = await prodPool.connect();
    
    try {
      await client.query('BEGIN');
      
      let addedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;

      for (const code of codesToAdd) {
        try {
          await client.query(
            `INSERT INTO nursing_service_codes (
              id, service_code, service_name, points, insurance_type, 
              valid_from, valid_to, description, is_active, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              code.id,
              code.serviceCode,
              code.serviceName,
              code.points,
              code.insuranceType,
              code.validFrom,
              code.validTo,
              code.description,
              code.isActive,
              code.createdAt,
              code.updatedAt,
            ]
          );
          addedCount++;
        } catch (error: any) {
          if (error.code === '23505') { // 重複エラー
            skippedCount++;
            console.log(`   ⚠️  スキップ: ${code.serviceCode} (既に存在)`);
          } else {
            errorCount++;
            console.error(`   ❌ エラー: ${code.serviceCode} - ${error.message}`);
          }
        }
      }

      await client.query('COMMIT');
      
      console.log(`\n✅ 追加完了:`);
      console.log(`   追加成功: ${addedCount}件`);
      console.log(`   スキップ: ${skippedCount}件`);
      console.log(`   エラー: ${errorCount}件\n`);

      // 7. 追加後の確認
      console.log('📊 6. 追加後の確認中...');
      const prodCodesAfter = await prodDb.select().from(nursingServiceCodes);
      const prodCorrectCodesAfter = prodCodesAfter.filter(c => c.serviceCode.startsWith('51') && c.isActive);
      
      console.log(`   本番環境の総コード数: ${prodCodesAfter.length}件`);
      console.log(`   51から始まる正しいコード: ${prodCorrectCodesAfter.length}件`);
      console.log(`   31から始まる誤ったコード: ${prodCodesAfter.filter(c => c.serviceCode.startsWith('31')).length}件\n`);

      console.log('✅ フェーズ1が完了しました。\n');

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
    await prodPool.end();
    await devPool.end();
  }
}

migrateServiceCodesToProduction()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

