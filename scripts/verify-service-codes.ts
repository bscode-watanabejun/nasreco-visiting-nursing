/**
 * サービスコードの検証スクリプト
 * 
 * データベースに正しいサービスコードが投入されているか確認します。
 * 
 * 実行方法:
 *   npx tsx scripts/verify-service-codes.ts
 */

import { db } from '../server/db';
import { nursingServiceCodes } from '../shared/schema';
import { eq, and, isNull } from 'drizzle-orm';

async function verifyServiceCodes() {
  console.log('🔍 サービスコードの検証を開始します...\n');
  
  try {
    // 1. 有効なサービスコードの総数
    const activeCodes = await db
      .select()
      .from(nursingServiceCodes)
      .where(eq(nursingServiceCodes.isActive, true));
    
    console.log(`✅ 有効なサービスコード: ${activeCodes.length}件\n`);
    
    // 2. 正しいコードの例（510000110など）が存在するか確認
    const correctExamples = ['510000110', '510000210', '510000310', '510000410', '510000510'];
    console.log('正しいコードの存在確認:');
    for (const code of correctExamples) {
      const found = activeCodes.find(c => c.serviceCode === code);
      if (found) {
        console.log(`  ✓ ${code} - ${found.serviceName.substring(0, 50)}... (${found.points}点)`);
      } else {
        console.log(`  ❌ ${code} - 見つかりません`);
      }
    }
    
    // 3. 誤ったコード（311000110など）が無効化されているか確認
    const wrongExamples = ['311000110', '311000210', '312000110'];
    console.log('\n誤ったコードの無効化確認:');
    for (const code of wrongExamples) {
      const found = await db
        .select()
        .from(nursingServiceCodes)
        .where(eq(nursingServiceCodes.serviceCode, code))
        .limit(1);
      
      if (found.length > 0) {
        if (found[0].isActive) {
          console.log(`  ⚠️  ${code} - まだ有効です（無効化が必要）`);
        } else {
          console.log(`  ✓ ${code} - 無効化されています`);
        }
      } else {
        console.log(`  ✓ ${code} - 存在しません（問題なし）`);
      }
    }
    
    // 4. サービスコードの先頭2桁別集計
    console.log('\nサービスコードの先頭2桁別集計（有効なもののみ）:');
    const prefixCounts: Record<string, number> = {};
    activeCodes.forEach(code => {
      const prefix = code.serviceCode.substring(0, 2);
      prefixCounts[prefix] = (prefixCounts[prefix] || 0) + 1;
    });
    Object.entries(prefixCounts).sort().forEach(([prefix, count]) => {
      console.log(`  ${prefix}xxxxxxx: ${count}件`);
    });
    
    // 5. 保険種別別集計
    console.log('\n保険種別別集計:');
    const medicalCount = activeCodes.filter(c => c.insuranceType === 'medical').length;
    const careCount = activeCodes.filter(c => c.insuranceType === 'care').length;
    console.log(`  医療保険: ${medicalCount}件`);
    console.log(`  介護保険: ${careCount}件`);
    
    // 6. 有効期間の確認
    const withValidTo = activeCodes.filter(c => c.validTo !== null).length;
    const withoutValidTo = activeCodes.filter(c => c.validTo === null).length;
    console.log('\n有効期間の設定:');
    console.log(`  有効期間終了日あり: ${withValidTo}件`);
    console.log(`  無期限（終了日なし）: ${withoutValidTo}件`);
    
  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error);
    throw error;
  }
}

verifyServiceCodes()
  .then(() => {
    console.log('\n✅ 検証完了');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

