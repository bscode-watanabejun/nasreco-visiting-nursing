/**
 * 介護保険サービスコード件数確認スクリプト
 */

import { db } from '../server/db';
import { nursingServiceCodes } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function countCareServiceCodes() {
  console.log('📊 介護保険サービスコードの件数を確認中...\n');

  try {
    const allCareCodes = await db.query.nursingServiceCodes.findMany({
      where: eq(nursingServiceCodes.insuranceType, 'care'),
    });

    console.log(`✅ 介護保険サービスコード: ${allCareCodes.length}件\n`);

    // コードの長さ別に集計
    const byLength: Record<number, number> = {};
    const byPrefix: Record<string, number> = {};

    for (const code of allCareCodes) {
      const length = code.serviceCode.length;
      byLength[length] = (byLength[length] || 0) + 1;

      const prefix = code.serviceCode.substring(0, 3);
      byPrefix[prefix] = (byPrefix[prefix] || 0) + 1;
    }

    console.log('【コード長別の集計】');
    Object.keys(byLength)
      .sort((a, b) => parseInt(a) - parseInt(b))
      .forEach(length => {
        console.log(`  ${length}桁: ${byLength[parseInt(length)]}件`);
      });

    console.log('\n【プレフィックス別の集計（最初の3文字）】');
    Object.keys(byPrefix)
      .sort()
      .forEach(prefix => {
        console.log(`  ${prefix}...: ${byPrefix[prefix]}件`);
      });

    console.log('\n【サンプル（最初の10件）】');
    allCareCodes.slice(0, 10).forEach((code, index) => {
      console.log(`  ${index + 1}. ${code.serviceCode} - ${code.serviceName.substring(0, 50)}...`);
    });

  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error);
    throw error;
  }
}

countCareServiceCodes()
  .then(() => {
    console.log('\n処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });


