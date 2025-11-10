/**
 * サービスコードの点数値を修正するスクリプト
 * 
 * CSVファイルの「金額識別」が「1：金額」の場合、値は「円」単位で保存されているため、
 * データベースに保存する際は10で割って「点」に変換する必要があります。
 * 
 * このスクリプトは、既存のデータベースの点数値を10で割って修正します。
 * 
 * 使用方法:
 *   npx tsx scripts/fix-service-code-points.ts
 */

import { db } from "../server/db";
import { nursingServiceCodes } from "../shared/schema";
import { eq } from "drizzle-orm";

async function fixServiceCodePoints() {
  console.log("🔧 サービスコードの点数値を修正します...\n");
  console.log("⚠️  このスクリプトは、すべてのサービスコードの点数を10で割ります。");
  console.log("   金額識別が「1：金額」の場合、CSVの値は「円」単位なので、");
  console.log("   10で割って「点」に変換する必要があります。\n");

  try {
    // 現在の値を確認
    const allCodes = await db.query.nursingServiceCodes.findMany({
      orderBy: (codes, { asc }) => asc(codes.serviceCode),
    });

    console.log(`📊 対象サービスコード数: ${allCodes.length}件\n`);

    // 修正前の値を表示（サンプル）
    console.log("📋 修正前の値（サンプル）:");
    const sampleCodes = ['510002570', '510000110', '510002470'];
    for (const code of allCodes.slice(0, 5)) {
      const yen = code.points * 10;
      console.log(`   ${code.serviceCode}: ${code.points}点 (¥${yen.toLocaleString()}) - ${code.serviceName.substring(0, 40)}...`);
    }
    console.log();

    // 修正を実行
    console.log("🔄 点数値を10で割って修正します...\n");

    let updatedCount = 0;
    for (const code of allCodes) {
      const oldPoints = code.points;
      const newPoints = Math.round(oldPoints / 10);
      
      if (oldPoints !== newPoints) {
        await db.update(nursingServiceCodes)
          .set({ points: newPoints })
          .where(eq(nursingServiceCodes.id, code.id));
        
        updatedCount++;
        
        if (updatedCount <= 10) {
          console.log(`   ✅ ${code.serviceCode}: ${oldPoints}点 → ${newPoints}点 (¥${(newPoints * 10).toLocaleString()})`);
        }
      }
    }

    if (updatedCount > 10) {
      console.log(`   ... 他 ${updatedCount - 10}件を更新`);
    }

    console.log(`\n✅ 修正完了: ${updatedCount}件のサービスコードを更新しました。`);

    // 修正後の値を確認
    console.log("\n📋 修正後の値（サンプル）:");
    const updatedCodes = await db.query.nursingServiceCodes.findMany({
      where: (codes, { inArray }) => inArray(codes.serviceCode, sampleCodes),
    });

    for (const code of updatedCodes) {
      const yen = code.points * 10;
      console.log(`   ${code.serviceCode}: ${code.points}点 (¥${yen.toLocaleString()}) - ${code.serviceName.substring(0, 40)}...`);
    }

    // 510002570の値を確認
    const longVisitCode = await db.query.nursingServiceCodes.findFirst({
      where: (codes, { eq }) => eq(codes.serviceCode, '510002570'),
    });

    if (longVisitCode) {
      console.log("\n✅ 長時間訪問看護加算（510002570）の確認:");
      console.log(`   点数: ${longVisitCode.points}点`);
      console.log(`   金額: ¥${(longVisitCode.points * 10).toLocaleString()}`);
      
      if (longVisitCode.points === 520) {
        console.log("   ✅ 正しい値（520点 = 5,200円）に修正されました！");
      } else {
        console.log(`   ❌ まだ間違っています（期待値: 520点、現在値: ${longVisitCode.points}点）`);
      }
    }

  } catch (error) {
    console.error("❌ エラーが発生しました:", error);
    throw error;
  }
}

// スクリプトを実行
fixServiceCodePoints()
  .then(() => {
    console.log("\nスクリプトが正常に完了しました。");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nスクリプトの実行中にエラーが発生しました:", error);
    process.exit(1);
  });

