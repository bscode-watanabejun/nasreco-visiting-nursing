/**
 * サービスコード削除スクリプト
 * 
 * 指定されたサービスコードをデータベースから削除します。
 * 
 * 実行方法:
 *   npx tsx scripts/delete-service-code.ts <serviceCode>
 */

import { db } from '../server/db';
import { nursingServiceCodes } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function deleteServiceCode(serviceCode: string) {
  console.log(`🔍 サービスコード "${serviceCode}" を検索中...\n`);

  try {
    // 既存のサービスコードを確認
    const existing = await db.query.nursingServiceCodes.findFirst({
      where: eq(nursingServiceCodes.serviceCode, serviceCode),
    });

    if (!existing) {
      console.log(`⚠️  サービスコード "${serviceCode}" が見つかりませんでした。`);
      return;
    }

    console.log(`✅ サービスコードを発見:`);
    console.log(`   - ID: ${existing.id}`);
    console.log(`   - サービスコード: ${existing.serviceCode}`);
    console.log(`   - サービス名: ${existing.serviceName}`);
    console.log(`   - 点数/単位: ${existing.points}`);
    console.log(`   - 保険種別: ${existing.insuranceType}`);
    console.log(`   - 有効: ${existing.isActive ? 'はい' : 'いいえ'}`);
    console.log('');

    // 削除実行
    await db.delete(nursingServiceCodes)
      .where(eq(nursingServiceCodes.serviceCode, serviceCode));

    console.log(`✅ サービスコード "${serviceCode}" を削除しました。`);

  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error);
    throw error;
  }
}

// コマンドライン引数からサービスコードを取得
const serviceCode = process.argv[2];

if (!serviceCode) {
  console.error('⚠️  サービスコードを指定してください。');
  console.error('   使用例: npx tsx scripts/delete-service-code.ts 131561');
  process.exit(1);
}

deleteServiceCode(serviceCode)
  .then(() => {
    console.log('\n処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

