/**
 * 不足しているサービスコードを本番環境に追加
 * 
 * 開発環境のすべての有効なコードを本番環境に追加します。
 * フェーズ1で追加されなかったコード（介護保険や51以外の医療保険コード）を追加します。
 * 
 * ⚠️ 警告: このスクリプトは本番データベースに書き込みを行います。
 *    ユーザーの明示的な承認なしに実行しないでください。
 * 
 * 実行方法:
 *   PRODUCTION_DB_URL="postgresql://..." DATABASE_URL="postgresql://..." npx tsx scripts/add-all-missing-service-codes.ts
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { nursingServiceCodes } from '../shared/schema';
import { sql, eq, and } from 'drizzle-orm';

const PROD_DB_URL = process.env.PRODUCTION_DB_URL || 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';
const DEV_DB_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_beoRr4gaQ5Dl@ep-polished-scene-a5twqv82.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function addAllMissingServiceCodes() {
  console.log('🚀 不足しているサービスコードを本番環境に追加します...\n');
  console.log('⚠️  本番データベースに接続します\n');
  
  const prodPool = new Pool({ connectionString: PROD_DB_URL });
  const devPool = new Pool({ connectionString: DEV_DB_URL });
  const prodDb = drizzle(prodPool);
  const devDb = drizzle(devPool);

  try {
    // 1. 開発環境からすべての有効なコードを取得
    console.log('📊 1. 開発環境からすべての有効なコードを取得中...');
    const devCodes = await devDb.select().from(nursingServiceCodes)
      .where(eq(nursingServiceCodes.isActive, true));
    
    console.log(`   開発環境の有効なコード数: ${devCodes.length}件\n`);

    // 2. 本番環境の既存コードを確認
    console.log('📊 2. 本番環境の既存コードを確認中...');
    const prodCodes = await prodDb.select().from(nursingServiceCodes);
    const prodExistingCodes = new Set(prodCodes.map(c => c.serviceCode));
    
    console.log(`   本番環境の既存コード数: ${prodCodes.length}件`);
    
    // 保険種別で分類
    const prodMedical = prodCodes.filter(c => c.insuranceType === 'medical' && c.isActive);
    const prodCare = prodCodes.filter(c => c.insuranceType === 'care' && c.isActive);
    
    console.log(`   医療保険（有効）: ${prodMedical.length}件`);
    console.log(`   介護保険（有効）: ${prodCare.length}件\n`);

    // 3. 追加対象のコードを特定（重複チェック）
    console.log('📊 3. 追加対象のコードを特定中...');
    const codesToAdd = devCodes.filter(code => !prodExistingCodes.has(code.serviceCode));
    
    console.log(`   追加対象のコード数: ${codesToAdd.length}件`);
    console.log(`   スキップするコード数: ${devCodes.length - codesToAdd.length}件（既に存在）\n`);
    
    if (codesToAdd.length === 0) {
      console.log('✅ 追加するコードがありません。既にすべてのコードが存在します。\n');
      return;
    }

    // 保険種別で分類
    const codesToAddMedical = codesToAdd.filter(c => c.insuranceType === 'medical');
    const codesToAddCare = codesToAdd.filter(c => c.insuranceType === 'care');
    
    console.log(`   追加対象のコードの内訳:`);
    console.log(`     医療保険: ${codesToAddMedical.length}件`);
    console.log(`     介護保険: ${codesToAddCare.length}件\n`);

    // 4. 追加対象のコードの一覧を表示（最初の20件）
    console.log('📊 4. 追加対象のコード一覧（最初の20件）:');
    codesToAdd.slice(0, 20).forEach((code, index) => {
      console.log(`   ${index + 1}. ${code.serviceCode} - ${code.serviceName.substring(0, 50)}... (${code.insuranceType})`);
    });
    if (codesToAdd.length > 20) {
      console.log(`   ... 他 ${codesToAdd.length - 20}件\n`);
    } else {
      console.log('');
    }

    // 5. 確認プロンプト
    console.log('⚠️  本番環境に追加しますか？\n');
    
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
          
          if (addedCount % 100 === 0) {
            console.log(`   ... ${addedCount}件追加済み`);
          }
        } catch (error: any) {
          if (error.code === '23505') { // 重複エラー
            skippedCount++;
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
      const prodActiveAfter = prodCodesAfter.filter(c => c.isActive);
      const prodMedicalAfter = prodCodesAfter.filter(c => c.insuranceType === 'medical' && c.isActive);
      const prodCareAfter = prodCodesAfter.filter(c => c.insuranceType === 'care' && c.isActive);
      
      console.log(`   本番環境の総コード数: ${prodCodesAfter.length}件`);
      console.log(`   有効なコード数: ${prodActiveAfter.length}件`);
      console.log(`   医療保険（有効）: ${prodMedicalAfter.length}件`);
      console.log(`   介護保険（有効）: ${prodCareAfter.length}件\n`);

      console.log('✅ 不足しているサービスコードの追加が完了しました。\n');

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

addAllMissingServiceCodes()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

