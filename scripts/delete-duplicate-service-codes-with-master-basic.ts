/**
 * サービスコードの重複を削除するスクリプト（visiting_nursing_master_basicとの紐づきを考慮）
 * 
 * 同じserviceCodeで複数のレコードがある場合：
 * 1. visiting_nursing_master_basicと紐づいているレコードを優先的に残す
 * 2. 紐づいていない場合は、最新のもの（updatedAtが最新）を残す
 * 3. 古いものを削除する
 * 
 * 実行方法:
 *   npx tsx scripts/delete-duplicate-service-codes-with-master-basic.ts
 */

import { db } from '../server/db';
import { nursingServiceCodes, nursingRecords, visitingNursingMasterBasic, bonusCalculationHistory } from '../shared/schema';
import { like, inArray, eq, sql } from 'drizzle-orm';

async function deleteDuplicates() {
  console.log('🗑️  サービスコードの重複を削除中（visiting_nursing_master_basicとの紐づきを考慮）...\n');
  
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
    const duplicates: Array<{ 
      serviceCode: string; 
      records: typeof allCodes; 
      idsToDelete: string[];
      keepId: string;
    }> = [];
    
    // visiting_nursing_master_basicと紐づいているレコードを取得
    const masterBasicRecords = await db
      .select({ serviceCodeId: visitingNursingMasterBasic.serviceCodeId })
      .from(visitingNursingMasterBasic);
    
    const masterBasicServiceCodeIds = new Set(masterBasicRecords.map(r => r.serviceCodeId));
    
    codeGroups.forEach((records, serviceCode) => {
      if (records.length > 1) {
        // visiting_nursing_master_basicと紐づいているレコードを優先
        const linkedRecord = records.find(r => masterBasicServiceCodeIds.has(r.id));
        
        let keepId: string;
        let idsToDelete: string[];
        
        if (linkedRecord) {
          // 紐づいているレコードを残す
          keepId = linkedRecord.id;
          idsToDelete = records.filter(r => r.id !== keepId).map(r => r.id);
        } else {
          // 紐づいていない場合は、最新のもの（updatedAtが最新）を残す
          const sorted = [...records].sort((a, b) => {
            const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
            const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
            return bTime - aTime; // 降順（新しい順）
          });
          
          keepId = sorted[0].id;
          idsToDelete = sorted.slice(1).map(r => r.id);
        }
        
        duplicates.push({ serviceCode, records, idsToDelete, keepId });
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
    
    // 参照しているbonus_calculation_historyを確認
    const referencingBonusHistory = await db
      .select()
      .from(bonusCalculationHistory)
      .where(inArray(bonusCalculationHistory.serviceCodeId, allIdsToDelete));
    
    console.log(`参照しているbonus_calculation_history: ${referencingBonusHistory.length}件`);
    
    if (referencingRecords.length > 0) {
      // 参照を残すレコードのIDに更新
      console.log('nursing_recordsの参照を残すレコードのIDに更新中...');
      
      for (const dup of duplicates) {
        const keepId = dup.keepId;
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
    
    if (referencingBonusHistory.length > 0) {
      // bonus_calculation_historyの参照を残すレコードのIDに更新
      console.log('bonus_calculation_historyの参照を残すレコードのIDに更新中...');
      
      for (const dup of duplicates) {
        const keepId = dup.keepId;
        const idsToDelete = dup.idsToDelete;
        
        // この重複グループの参照を更新
        const refsToUpdate = referencingBonusHistory.filter(r => r.serviceCodeId && idsToDelete.includes(r.serviceCodeId));
        
        if (refsToUpdate.length > 0) {
          await db
            .update(bonusCalculationHistory)
            .set({ serviceCodeId: keepId })
            .where(inArray(bonusCalculationHistory.serviceCodeId, idsToDelete));
          
          console.log(`  ${dup.serviceCode}: ${refsToUpdate.length}件の参照を更新`);
        }
      }
    }
    
    // visiting_nursing_master_basicとの紐づきを確認
    const masterBasicToUpdate = await db
      .select()
      .from(visitingNursingMasterBasic)
      .where(inArray(visitingNursingMasterBasic.serviceCodeId, allIdsToDelete));
    
    if (masterBasicToUpdate.length > 0) {
      console.log(`\n⚠️  visiting_nursing_master_basicと紐づいているレコード: ${masterBasicToUpdate.length}件`);
      console.log('紐づきを残すレコードのIDに更新中...');
      
      for (const dup of duplicates) {
        const keepId = dup.keepId;
        const idsToDelete = dup.idsToDelete;
        
        // この重複グループの紐づきを更新
        const linksToUpdate = masterBasicToUpdate.filter(m => idsToDelete.includes(m.serviceCodeId));
        
        if (linksToUpdate.length > 0) {
          await db
            .update(visitingNursingMasterBasic)
            .set({ serviceCodeId: keepId })
            .where(inArray(visitingNursingMasterBasic.serviceCodeId, idsToDelete));
          
          console.log(`  ${dup.serviceCode}: ${linksToUpdate.length}件の紐づきを更新`);
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
    const remainingDuplicates = await db.execute(sql`
      SELECT service_code, COUNT(*) as count
      FROM nursing_service_codes
      WHERE service_code LIKE '5%'
      GROUP BY service_code
      HAVING COUNT(*) > 1
    `);
    
    if (remainingDuplicates.rows.length === 0) {
      console.log('✓ 重複は全て解消されました');
    } else {
      console.log(`⚠️  まだ ${remainingDuplicates.rows.length}種類のコードが重複しています`);
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

