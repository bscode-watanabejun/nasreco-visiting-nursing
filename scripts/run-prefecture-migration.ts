/**
 * 都道府県コードマイグレーション実行スクリプト
 *
 * 都道府県コードの名称を公式の別表2に準拠した形式に更新します。
 * 「県」「府」「都」を削除します。
 *
 * 実行方法:
 *   npx tsx scripts/run-prefecture-migration.ts
 */

import { db, pool } from '../server/db';
import { prefectureCodes } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function runMigration() {
  console.log('🚀 都道府県コードマイグレーションを開始します...\n');

  try {
    // 都道府県コードの更新マッピング（公式の別表2に準拠）
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
        .update(prefectureCodes)
        .set({
          prefectureName: update.name,
          updatedAt: new Date(),
        })
        .where(eq(prefectureCodes.prefectureCode, update.code))
        .returning();

      if (result.length > 0) {
        updatedCount++;
        console.log(`✓ ${update.code}: ${update.name} に更新`);
      }
    }

    console.log(`\n✅ マイグレーションが完了しました！`);
    console.log(`📊 更新された都道府県コード数: ${updatedCount}件\n`);

    if (updatedCount !== 46) {
      console.warn(`⚠️  警告: 期待される更新数は46件ですが、実際には${updatedCount}件が更新されました。`);
    } else {
      console.log('✅ すべての都道府県コードが正しく更新されました。');
    }

  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error);
    throw error;
  } finally {
    // 接続を閉じる
    await pool.end();
  }
}

// スクリプト実行
runMigration()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

