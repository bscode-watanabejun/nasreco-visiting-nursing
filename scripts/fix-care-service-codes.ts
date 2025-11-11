/**
 * 介護保険サービスコード修正スクリプト
 *
 * 既存の介護保険サービスコードで、9桁以上や「13」から始まらないコードを
 * 正しい6桁のコード（「13」から始まる）に修正します。
 *
 * 実行方法:
 *   npx tsx scripts/fix-care-service-codes.ts
 */

import { db } from '../server/db';
import { nursingServiceCodes } from '../shared/schema';
import { eq, and, like } from 'drizzle-orm';

/**
 * 介護保険サービスコードを修正
 */
async function fixCareServiceCodes() {
  console.log('🔧 介護保険サービスコードの修正を開始します...\n');

  try {
    // 介護保険のサービスコードを全て取得
    const allCareCodes = await db.query.nursingServiceCodes.findMany({
      where: eq(nursingServiceCodes.insuranceType, 'care'),
    });

    console.log(`📊 介護保険サービスコード: ${allCareCodes.length}件を確認中...\n`);

    let fixedCount = 0;
    let errorCount = 0;
    const fixedCodes: Array<{ old: string; new: string; name: string }> = [];

    for (const code of allCareCodes) {
      const currentCode = code.serviceCode;
      
      // 既に6桁で「13」から始まる場合はスキップ
      if (/^13\d{4}$/.test(currentCode)) {
        continue;
      }

      // 「13」で始まる6桁の数字を抽出
      const match = currentCode.match(/13\d{4}/);
      if (match) {
        const newCode = match[0];
        
        // 同じコードが既に存在するか確認
        const existing = await db.query.nursingServiceCodes.findFirst({
          where: and(
            eq(nursingServiceCodes.serviceCode, newCode),
            eq(nursingServiceCodes.insuranceType, 'care')
          ),
        });

        if (existing && existing.id !== code.id) {
          // 既に正しいコードが存在する場合、間違ったコード（9桁）を削除
          console.log(`   🗑️  コード ${currentCode} は既に正しいコード ${newCode} が存在するため削除します`);
          console.log(`      削除するコード: ${code.serviceName.substring(0, 50)}...`);
          console.log(`      既存のコード: ${existing.serviceName.substring(0, 50)}...`);
          
          await db.delete(nursingServiceCodes)
            .where(eq(nursingServiceCodes.id, code.id));
          
          fixedCodes.push({
            old: currentCode,
            new: `削除（${newCode}が既存）`,
            name: code.serviceName,
          });
          fixedCount++;
          continue;
        }

        // サービスコードを更新
        await db.update(nursingServiceCodes)
          .set({
            serviceCode: newCode,
            updatedAt: new Date(),
          })
          .where(eq(nursingServiceCodes.id, code.id));

        fixedCodes.push({
          old: currentCode,
          new: newCode,
          name: code.serviceName,
        });
        fixedCount++;

        console.log(`   ✅ ${currentCode} -> ${newCode}: ${code.serviceName.substring(0, 50)}...`);
      } else {
        // 「13A」で始まるコードなど、アルファベットを含む場合はそのまま保持
        if (/^13[A-Z]/.test(currentCode)) {
          console.log(`   ℹ️  コード ${currentCode} はアルファベットを含むためそのまま保持: ${code.serviceName.substring(0, 50)}...`);
          continue;
        }
        console.log(`   ❌ コード ${currentCode} から「13」で始まる6桁のコードが見つかりません: ${code.serviceName.substring(0, 50)}...`);
        errorCount++;
      }
    }

    console.log('\n✅ 修正が完了しました！');
    console.log('\n【修正結果】');
    console.log(`  - 修正: ${fixedCount}件`);
    console.log(`  - エラー: ${errorCount}件`);
    console.log(`  合計確認: ${allCareCodes.length}件`);

    if (fixedCodes.length > 0) {
      console.log('\n【修正されたコード一覧（最初の20件）】');
      fixedCodes.slice(0, 20).forEach((item, index) => {
        console.log(`   ${index + 1}. ${item.old} -> ${item.new}: ${item.name.substring(0, 60)}...`);
      });
      if (fixedCodes.length > 20) {
        console.log(`   ... 他 ${fixedCodes.length - 20}件`);
      }
    }

  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error);
    throw error;
  }
}

// スクリプト実行
fixCareServiceCodes()
  .then(() => {
    console.log('\n処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

