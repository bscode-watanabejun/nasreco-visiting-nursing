/**
 * 既存の誤ったサービスコードを無効化または削除するスクリプト
 * 
 * 現在のシードデータに含まれている誤ったサービスコード（311000110など）を
 * 無効化または削除します。
 * 
 * 実行方法:
 *   npx tsx scripts/cleanup-old-service-codes.ts
 */

import { db } from '../server/db';
import { nursingServiceCodes } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function cleanupOldServiceCodes() {
  console.log('🧹 誤ったサービスコードのクリーンアップを開始します...\n');
  
  // 誤ったサービスコードのリスト（現在のシードデータに含まれていたもの）
  const wrongCodes = [
    '311000110', '311000210', '311000310', '311000410', '311000510', '311000610',
    '311001110', '311001210', '311001310',
    '312000110', '312000210', '312000310', '312000410', '312000510', '312000610',
    '312000710', '312000810', '312000910', '312001010',
    '313000110',
    '314000110',
  ];
  
  try {
    // 各コードを無効化（削除ではなく無効化を推奨）
    let updatedCount = 0;
    for (const code of wrongCodes) {
      const result = await db
        .update(nursingServiceCodes)
        .set({ isActive: false })
        .where(eq(nursingServiceCodes.serviceCode, code));
      
      // drizzle-ormのupdateは影響を受けた行数を返さないため、存在確認
      const existing = await db
        .select()
        .from(nursingServiceCodes)
        .where(eq(nursingServiceCodes.serviceCode, code))
        .limit(1);
      
      if (existing.length > 0) {
        updatedCount++;
        console.log(`  ✓ ${code} を無効化しました`);
      }
    }
    
    if (updatedCount === 0) {
      console.log('  ℹ️  無効化するコードが見つかりませんでした（既に存在しないか、既に無効化されています）');
    } else {
      console.log(`\n✅ ${updatedCount}件のコードを無効化しました`);
    }
    
    // または削除する場合（コメントアウト）
    // await db.delete(nursingServiceCodes).where(
    //   sql`${nursingServiceCodes.serviceCode} IN (${sql.join(wrongCodes.map(c => sql`${c}`), sql`, `)})`
    // );
    
  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error);
    throw error;
  }
}

cleanupOldServiceCodes()
  .then(() => {
    console.log('\n処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

