/**
 * 5から始まるサービスコードの重複を削除するスクリプト
 * 
 * 同じserviceCodeで複数のレコードがある場合、最新のもの（updatedAtが最新）を残して
 * 古いものを削除します。
 * 
 * 実行方法:
 *   npx tsx scripts/delete-duplicate-service-codes.ts
 */

import { db } from '../server/db';
import { nursingServiceCodes, nursingRecords } from '../shared/schema';
import { like, inArray, eq, sql } from 'drizzle-orm';

async function deleteDuplicates() {
  console.log('🗑️  5から始まるサービスコードの重複を削除中...\n');
  
  try {
    // 5から始まるコードを全て取得
    const allCodes = await db
      .select()
      .from(nursingServiceCodes)
      .where(like(nursingServiceCodes.serviceCode, '5%'))
      .orderBy(nursingServiceCodes.serviceCode, nursingServiceCodes.createdAt);
    
    console.log(`5から始まるコードの総数: ${allCodes.length}件\n`);
    
    // serviceCodeでグループ化
    const codeGroups = new Map<string, typeof allCodes>();
    
    allCodes.forEach(code => {
      if (!codeGroups.has(code.serviceCode)) {
        codeGroups.set(code.serviceCode, []);
      }
      codeGroups.get(code.serviceCode)!.push(code);
    });
    
    // 重複があるコードを抽出
    const duplicates: Array<{ serviceCode: string; records: typeof allCodes; idsToDelete: string[] }> = [];
    
    codeGroups.forEach((records, serviceCode) => {
      if (records.length > 1) {
        // 最新のもの（updatedAtが最新）を残す
        const sorted = [...records].sort((a, b) => {
          const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return bTime - aTime; // 降順（新しい順）
        });
        
        const keepId = sorted[0].id;
        const idsToDelete = sorted.slice(1).map(r => r.id);
        
        duplicates.push({ serviceCode, records, idsToDelete });
      }
    });
    
    if (duplicates.length === 0) {
      console.log('✅ 重複は見つかりませんでした。');
      return;
    }
    
    console.log(`⚠️  ${duplicates.length}種類のコードが重複しています\n`);
    
    // 削除対象のIDを集計
    const allIdsToDelete: string[] = [];
    duplicates.forEach(dup => {
      allIdsToDelete.push(...dup.idsToDelete);
    });
    
    console.log(`削除対象: ${allIdsToDelete.length}件のレコード\n`);
    
    // 参照しているnursing_recordsを確認
    const referencingRecords = await db
      .select()
      .from(nursingRecords)
      .where(inArray(nursingRecords.serviceCodeId, allIdsToDelete));
    
    console.log(`参照しているnursing_records: ${referencingRecords.length}件`);
    
    if (referencingRecords.length > 0) {
      // 参照を残すレコードのIDに更新
      console.log('参照を残すレコードのIDに更新中...');
      
      for (const dup of duplicates) {
        const keepId = dup.records[0].id; // 最新のもの
        const idsToDelete = dup.idsToDelete;
        
        // この重複グループの参照を更新
        const refsToUpdate = referencingRecords.filter(r => idsToDelete.includes(r.serviceCodeId!));
        
        if (refsToUpdate.length > 0) {
          await db
            .update(nursingRecords)
            .set({ serviceCodeId: keepId })
            .where(inArray(nursingRecords.serviceCodeId, idsToDelete));
          
          console.log(`  ${dup.serviceCode}: ${refsToUpdate.length}件の参照を更新`);
        }
      }
    }
    
    // 重複レコードを削除
    console.log('\n重複レコードを削除中...');
    await db
      .delete(nursingServiceCodes)
      .where(inArray(nursingServiceCodes.id, allIdsToDelete));
    
    console.log(`✅ ${allIdsToDelete.length}件の重複レコードを削除しました`);
    
    // 削除後の確認
    const remaining = await db
      .select()
      .from(nursingServiceCodes)
      .where(like(nursingServiceCodes.serviceCode, '5%'));
    
    console.log(`\n削除後の5から始まるコード数: ${remaining.length}件`);
    
    // 重複が残っていないか確認
    const remainingGroups = new Map<string, number>();
    remaining.forEach(code => {
      remainingGroups.set(code.serviceCode, (remainingGroups.get(code.serviceCode) || 0) + 1);
    });
    
    const stillDuplicated = Array.from(remainingGroups.entries()).filter(([_, count]) => count > 1);
    
    if (stillDuplicated.length === 0) {
      console.log('✓ 重複は全て解消されました');
    } else {
      console.log(`⚠️  まだ ${stillDuplicated.length}種類のコードが重複しています`);
    }
    
  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error);
    throw error;
  }
}

deleteDuplicates()
  .then(() => {
    console.log('\n処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

