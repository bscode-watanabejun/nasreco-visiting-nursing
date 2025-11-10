/**
 * サービスコードの点数値を確認するスクリプト
 * 
 * 長時間訪問看護加算（510002570）のpoints値を確認します。
 * 
 * 使用方法:
 *   npx tsx scripts/check-service-code-points.ts
 */

import { db } from "../server/db";
import { nursingServiceCodes } from "../shared/schema";
import { eq } from "drizzle-orm";

async function checkServiceCodePoints() {
  console.log("🔍 サービスコードの点数値を確認します...\n");

  try {
    // 長時間訪問看護加算のサービスコードを確認
    const serviceCode = await db.query.nursingServiceCodes.findFirst({
      where: eq(nursingServiceCodes.serviceCode, '510002570'),
    });

    if (!serviceCode) {
      console.error("❌ サービスコード 510002570 が見つかりません。");
      process.exit(1);
    }

    console.log("✅ サービスコードが見つかりました:");
    console.log(`   サービスコード: ${serviceCode.serviceCode}`);
    console.log(`   サービス名: ${serviceCode.serviceName}`);
    console.log(`   点数: ${serviceCode.points}点`);
    console.log(`   保険種別: ${serviceCode.insuranceType}`);
    console.log();

    // 計算結果を表示
    const pointsInYen = serviceCode.points * 10;
    console.log("📊 計算結果:");
    console.log(`   点数: ${serviceCode.points}点`);
    console.log(`   金額: ¥${pointsInYen.toLocaleString()}`);
    console.log();

    // 期待値との比較
    const expectedPoints = 520; // 5,200円 = 520点
    const expectedYen = 5200; // 5,200円

    console.log("📋 期待値との比較:");
    console.log(`   期待される点数: ${expectedPoints}点`);
    console.log(`   期待される金額: ¥${expectedYen.toLocaleString()}`);
    console.log();

    if (serviceCode.points === expectedPoints) {
      console.log("✅ 点数値は正しいです！");
    } else {
      console.log("❌ 点数値が間違っています！");
      console.log(`   現在の値: ${serviceCode.points}点 (¥${pointsInYen.toLocaleString()})`);
      console.log(`   期待される値: ${expectedPoints}点 (¥${expectedYen.toLocaleString()})`);
      console.log(`   差: ${serviceCode.points - expectedPoints}点 (¥${(pointsInYen - expectedYen).toLocaleString()})`);
    }

    // 他の長時間訪問看護加算関連のサービスコードも確認
    console.log("\n📋 他の長時間訪問看護加算関連のサービスコード:");
    const relatedCodes = await db.query.nursingServiceCodes.findMany({
      where: (codes, { like, or }) => or(
        like(codes.serviceCode, '510002%'),
        like(codes.serviceCode, '510004%')
      ),
    });

    for (const code of relatedCodes) {
      const yen = code.points * 10;
      console.log(`   ${code.serviceCode}: ${code.points}点 (¥${yen.toLocaleString()}) - ${code.serviceName.substring(0, 40)}...`);
    }

  } catch (error) {
    console.error("❌ エラーが発生しました:", error);
    throw error;
  }
}

// スクリプトを実行
checkServiceCodePoints()
  .then(() => {
    console.log("\nスクリプトが正常に完了しました。");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nスクリプトの実行中にエラーが発生しました:", error);
    process.exit(1);
  });

