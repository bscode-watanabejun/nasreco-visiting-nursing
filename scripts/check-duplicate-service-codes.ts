/**
 * 5から始まるサービスコードの重複を確認するスクリプト
 * 
 * 実行方法:
 *   npx tsx scripts/check-duplicate-service-codes.ts
 */

import { db } from '../server/db';
import { nursingServiceCodes } from '../shared/schema';
import { like, sql } from 'drizzle-orm';

async function checkDuplicates() {
  console.log('🔍 5から始まるサービスコードの重複を確認中...\n');
  
  try {
    // 5から始まるコードを全て取得
    const allCodes = await db
      .select()
      .from(nursingServiceCodes)
      .where(like(nursingServiceCodes.serviceCode, '5%'));
    
    console.log(`5から始まるコードの総数: ${allCodes.length}件\n`);
    
    // serviceCodeでグループ化して重複を確認
    const codeGroups = new Map<string, typeof allCodes>();
    
    allCodes.forEach(code => {
      if (!codeGroups.has(code.serviceCode)) {
        codeGroups.set(code.serviceCode, []);
      }
      codeGroups.get(code.serviceCode)!.push(code);
    });
    
    // 重複があるコードを抽出
    const duplicates: Array<{ serviceCode: string; count: number; records: typeof allCodes }> = [];
    
    codeGroups.forEach((records, serviceCode) => {
      if (records.length > 1) {
        duplicates.push({ serviceCode, count: records.length, records });
      }
    });
    
    if (duplicates.length === 0) {
      console.log('✅ 重複は見つかりませんでした。');
      return;
    }
    
    console.log(`⚠️  重複が見つかりました: ${duplicates.length}種類のコードが重複しています\n`);
    
    // 重複の詳細を表示
    duplicates.forEach((dup, i) => {
      console.log(`${i + 1}. ${dup.serviceCode} - ${dup.count}件の重複:`);
      dup.records.forEach((record, j) => {
        console.log(`   [${j + 1}] id: ${record.id}, isActive: ${record.isActive}, createdAt: ${record.createdAt}, updatedAt: ${record.updatedAt}`);
        console.log(`       名称: ${record.serviceName.substring(0, 50)}...`);
        console.log(`       点数: ${record.points}点`);
      });
      console.log('');
    });
    
    console.log(`\n重複の合計: ${duplicates.reduce((sum, d) => sum + d.count, 0)}件のレコード`);
    console.log(`削除対象: ${duplicates.reduce((sum, d) => sum + (d.count - 1), 0)}件のレコード`);
    
  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error);
    throw error;
  }
}

checkDuplicates()
  .then(() => {
    console.log('\n処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

