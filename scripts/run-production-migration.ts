/**
 * 本番環境マスタ更新スクリプト
 *
 * 都道府県コードとレセプト種別コードを本番環境に更新します。
 *
 * ⚠️ 警告: このスクリプトは本番データベースに書き込みを行います。
 *    ユーザーの明示的な承認なしに実行しないでください。
 *
 * 実行方法:
 *   PRODUCTION_DB_URL="postgresql://..." npx tsx scripts/run-production-migration.ts
 */

import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../shared/schema';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

const PRODUCTION_DB_URL = process.env.PRODUCTION_DB_URL;
if (!PRODUCTION_DB_URL) {
  console.error('❌ PRODUCTION_DB_URL環境変数が設定されていません');
  process.exit(1);
}

async function updatePrefectureCodes(db: ReturnType<typeof drizzle>) {
  console.log('🚀 都道府県コードマイグレーションを開始します...\n');

  const updates = [
    { code: '02', name: '青森' },
    { code: '03', name: '岩手' },
    { code: '04', name: '宮城' },
    { code: '05', name: '秋田' },
    { code: '06', name: '山形' },
    { code: '07', name: '福島' },
    { code: '08', name: '茨城' },
    { code: '09', name: '栃木' },
    { code: '10', name: '群馬' },
    { code: '11', name: '埼玉' },
    { code: '12', name: '千葉' },
    { code: '13', name: '東京' },
    { code: '14', name: '神奈川' },
    { code: '15', name: '新潟' },
    { code: '16', name: '富山' },
    { code: '17', name: '石川' },
    { code: '18', name: '福井' },
    { code: '19', name: '山梨' },
    { code: '20', name: '長野' },
    { code: '21', name: '岐阜' },
    { code: '22', name: '静岡' },
    { code: '23', name: '愛知' },
    { code: '24', name: '三重' },
    { code: '25', name: '滋賀' },
    { code: '26', name: '京都' },
    { code: '27', name: '大阪' },
    { code: '28', name: '兵庫' },
    { code: '29', name: '奈良' },
    { code: '30', name: '和歌山' },
    { code: '31', name: '鳥取' },
    { code: '32', name: '島根' },
    { code: '33', name: '岡山' },
    { code: '34', name: '広島' },
    { code: '35', name: '山口' },
    { code: '36', name: '徳島' },
    { code: '37', name: '香川' },
    { code: '38', name: '愛媛' },
    { code: '39', name: '高知' },
    { code: '40', name: '福岡' },
    { code: '41', name: '佐賀' },
    { code: '42', name: '長崎' },
    { code: '43', name: '熊本' },
    { code: '44', name: '大分' },
    { code: '45', name: '宮崎' },
    { code: '46', name: '鹿児島' },
    { code: '47', name: '沖縄' },
  ];

  console.log('🔄 都道府県コードを更新中...\n');

  let updatedCount = 0;
  for (const update of updates) {
    const result = await db
      .update(schema.prefectureCodes)
      .set({
        prefectureName: update.name,
        updatedAt: new Date(),
      })
      .where(eq(schema.prefectureCodes.prefectureCode, update.code))
      .returning();

    if (result.length > 0) {
      updatedCount++;
      console.log(`✓ ${update.code}: ${update.name} に更新`);
    }
  }

  console.log(`\n✅ 都道府県コードマイグレーションが完了しました！`);
  console.log(`📊 更新された都道府県コード数: ${updatedCount}件\n`);

  if (updatedCount !== 46) {
    console.warn(`⚠️  警告: 期待される更新数は46件ですが、実際には${updatedCount}件が更新されました。`);
  } else {
    console.log('✅ すべての都道府県コードが正しく更新されました。');
  }
}

async function updateReceiptTypeCodes(pool: Pool) {
  console.log('🚀 レセプト種別コードマイグレーションを開始します...\n');

  try {
    // SQLファイルを読み込む
    const migrationPath = path.join(process.cwd(), 'server/migrations/fix-receipt-type-codes.sql');
    
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`マイグレーションファイルが見つかりません: ${migrationPath}`);
    }

    const sql = fs.readFileSync(migrationPath, 'utf-8');
    
    console.log('📄 マイグレーションSQLを読み込みました');
    console.log('🔄 データベースを更新中...\n');

    // SQLを実行（トランザクション内で実行される）
    const client = await pool.connect();
    try {
      await client.query(sql);
      
      // 確認: 登録されたコード数を確認
      const result = await client.query<{ total_codes: number }>(
        `SELECT COUNT(*) as total_codes FROM receipt_type_codes`
      );

      const count = result.rows[0]?.total_codes || 0;
      
      console.log('✅ レセプト種別コードマイグレーションが完了しました！');
      console.log(`📊 登録されたレセプト種別コード数: ${count}件\n`);

      if (count === 39) {
        console.log('✅ すべてのコードが正しく登録されました。');
      } else {
        console.warn(`⚠️  警告: 期待されるコード数は39件ですが、実際には${count}件が登録されました。`);
      }
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error);
    throw error;
  }
}

async function runProductionMigration() {
  console.log('🔧 本番環境マスタ更新を開始します...\n');
  console.log('⚠️  本番環境のデータベースに接続します\n');

  const pool = new Pool({ connectionString: PRODUCTION_DB_URL });
  const db = drizzle({ client: pool, schema });

  try {
    // 1. 都道府県コードの更新
    await updatePrefectureCodes(db);
    console.log('\n' + '─'.repeat(60) + '\n');

    // 2. レセプト種別コードの更新
    await updateReceiptTypeCodes(pool);
    console.log('\n' + '─'.repeat(60) + '\n');

    console.log('✅ すべてのマイグレーションが完了しました！\n');

  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// スクリプト実行
runProductionMigration()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

