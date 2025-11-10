/**
 * 31から始まる誤ったサービスコードを削除するスクリプト
 * 
 * 無効化されている31から始まるサービスコードを完全に削除します。
 * 参照しているnursing_recordsのserviceCodeIdをNULLに更新してから削除します。
 * 
 * 実行方法:
 *   npx tsx scripts/delete-old-service-codes.ts
 */

import { db } from '../server/db';
import { nursingServiceCodes, nursingRecords } from '../shared/schema';
import { like, eq, inArray } from 'drizzle-orm';

async function deleteOldServiceCodes() {
  console.log('🗑️  31から始まる誤ったサービスコードの削除を開始します...\n');
  
  try {
    // 31から始まるサービスコードを検索
    const codesToDelete = await db
      .select()
      .from(nursingServiceCodes)
      .where(like(nursingServiceCodes.serviceCode, '31%'));
    
    console.log(`見つかった31から始まるコード: ${codesToDelete.length}件\n`);
    
    if (codesToDelete.length === 0) {
      console.log('削除するコードが見つかりませんでした。');
      return;
    }
    
    // 削除前に一覧を表示
    console.log('削除対象のコード:');
    codesToDelete.forEach((code, i) => {
      console.log(`  ${i + 1}. ${code.serviceCode} - ${code.serviceName.substring(0, 50)}... (isActive: ${code.isActive})`);
    });
    
    // 参照しているnursing_recordsを確認
    const codeIds = codesToDelete.map(c => c.id);
    const referencingRecords = await db
      .select()
      .from(nursingRecords)
      .where(inArray(nursingRecords.serviceCodeId, codeIds));
    
    console.log(`\n参照しているnursing_records: ${referencingRecords.length}件`);
    
    if (referencingRecords.length > 0) {
      // 参照をNULLに更新
      console.log('参照をNULLに更新中...');
      await db
        .update(nursingRecords)
        .set({ serviceCodeId: null })
        .where(inArray(nursingRecords.serviceCodeId, codeIds));
      console.log(`✓ ${referencingRecords.length}件の参照をNULLに更新しました`);
    }
    
    // 削除実行
    console.log('\nサービスコードを削除中...');
    await db
      .delete(nursingServiceCodes)
      .where(like(nursingServiceCodes.serviceCode, '31%'));
    
    console.log(`✅ ${codesToDelete.length}件のコードを削除しました`);
    
    // 削除後の確認
    const remaining = await db
      .select()
      .from(nursingServiceCodes)
      .where(like(nursingServiceCodes.serviceCode, '31%'));
    
    if (remaining.length === 0) {
      console.log('✓ 31から始まるコードは全て削除されました');
    } else {
      console.log(`⚠️  まだ ${remaining.length}件のコードが残っています`);
    }
    
  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error);
    throw error;
  }
}

deleteOldServiceCodes()
  .then(() => {
    console.log('\n処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

