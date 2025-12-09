/**
 * 24時間対応体制加算に月次制限を追加
 *
 * 24時間対応体制加算（基本）および24時間対応体制加算（看護業務負担軽減）に
 * 利用者1名につき月1回までの制限を追加します。
 *
 * ⚠️ 警告: このスクリプトは本番データベースに書き込みを行います。
 *    ユーザーの明示的な承認なしに実行しないでください。
 *
 * 実行方法（開発環境）:
 *   npx tsx server/scripts/add-monthly-limit-to-24h-bonus.ts
 *
 * 実行方法（本番環境）:
 *   PRODUCTION_DB_URL="postgresql://..." npx tsx server/scripts/add-monthly-limit-to-24h-bonus.ts
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";
import { bonusMaster } from "@shared/schema";
import { eq } from "drizzle-orm";

// 本番環境用のDB接続を設定
const PRODUCTION_DB_URL = process.env.PRODUCTION_DB_URL;
const DATABASE_URL = process.env.DATABASE_URL;

// 本番環境の場合は警告を表示
if (PRODUCTION_DB_URL) {
  console.log("⚠️  本番環境のデータベースに接続します");
  console.log("");
}

// 使用するDB接続文字列を決定
const dbUrl = PRODUCTION_DB_URL || DATABASE_URL;

if (!dbUrl) {
  console.error("❌ DATABASE_URL または PRODUCTION_DB_URL 環境変数が設定されていません");
  process.exit(1);
}

// Neon用の設定
neonConfig.webSocketConstructor = ws;

// DB接続を作成
const pool = new Pool({ connectionString: dbUrl });
const db = drizzle({ client: pool, schema });

async function addMonthlyLimitTo24hBonus() {
  console.log("🌱 24時間対応体制加算に月次制限を追加中...");
  console.log("");

  try {
    // 1. 24時間対応体制加算（基本）の現在の設定を確認
    const basicBonus = await db
      .select({
        bonusCode: bonusMaster.bonusCode,
        bonusName: bonusMaster.bonusName,
        predefinedConditions: bonusMaster.predefinedConditions,
      })
      .from(bonusMaster)
      .where(eq(bonusMaster.bonusCode, "24h_response_system_basic"))
      .limit(1);

    if (basicBonus.length === 0) {
      console.error("❌ 24h_response_system_basic が見つかりません");
      throw new Error("加算マスタが見つかりません");
    }

    console.log("📋 現在の設定（24h_response_system_basic）:");
    console.log(JSON.stringify(basicBonus[0].predefinedConditions, null, 2));
    console.log("");

    // 2. 24時間対応体制加算（基本）を更新
    const basicConditions = Array.isArray(basicBonus[0].predefinedConditions)
      ? basicBonus[0].predefinedConditions
      : basicBonus[0].predefinedConditions
        ? [basicBonus[0].predefinedConditions]
        : [];

    // 既存の条件を保持し、monthly_visit_limit を追加
    const hasMonthlyLimit = basicConditions.some(
      (c: any) => c.pattern === "monthly_visit_limit" || c.type === "monthly_visit_limit"
    );

    if (!hasMonthlyLimit) {
      const updatedBasicConditions = [
        ...basicConditions,
        {
          pattern: "monthly_visit_limit",
          value: 1,
        },
      ];

      await db
        .update(bonusMaster)
        .set({
          predefinedConditions: updatedBasicConditions,
        })
        .where(eq(bonusMaster.bonusCode, "24h_response_system_basic"));

      console.log("✅ 24時間対応体制加算（基本）に月次制限を追加しました");
      console.log("   更新後の条件:");
      console.log(JSON.stringify(updatedBasicConditions, null, 2));
    } else {
      console.log("⚠️  24時間対応体制加算（基本）には既に月次制限が設定されています");
    }

    console.log("");

    // 3. 24時間対応体制加算（看護業務負担軽減）の現在の設定を確認
    const enhancedBonus = await db
      .select({
        bonusCode: bonusMaster.bonusCode,
        bonusName: bonusMaster.bonusName,
        predefinedConditions: bonusMaster.predefinedConditions,
      })
      .from(bonusMaster)
      .where(eq(bonusMaster.bonusCode, "24h_response_system_enhanced"))
      .limit(1);

    if (enhancedBonus.length === 0) {
      console.error("❌ 24h_response_system_enhanced が見つかりません");
      throw new Error("加算マスタが見つかりません");
    }

    console.log("📋 現在の設定（24h_response_system_enhanced）:");
    console.log(JSON.stringify(enhancedBonus[0].predefinedConditions, null, 2));
    console.log("");

    // 4. 24時間対応体制加算（看護業務負担軽減）を更新
    const enhancedConditions = Array.isArray(enhancedBonus[0].predefinedConditions)
      ? enhancedBonus[0].predefinedConditions
      : enhancedBonus[0].predefinedConditions
        ? [enhancedBonus[0].predefinedConditions]
        : [];

    const hasMonthlyLimitEnhanced = enhancedConditions.some(
      (c: any) => c.pattern === "monthly_visit_limit" || c.type === "monthly_visit_limit"
    );

    if (!hasMonthlyLimitEnhanced) {
      const updatedEnhancedConditions = [
        ...enhancedConditions,
        {
          pattern: "monthly_visit_limit",
          value: 1,
        },
      ];

      await db
        .update(bonusMaster)
        .set({
          predefinedConditions: updatedEnhancedConditions,
        })
        .where(eq(bonusMaster.bonusCode, "24h_response_system_enhanced"));

      console.log("✅ 24時間対応体制加算（看護業務負担軽減）に月次制限を追加しました");
      console.log("   更新後の条件:");
      console.log(JSON.stringify(updatedEnhancedConditions, null, 2));
    } else {
      console.log("⚠️  24時間対応体制加算（看護業務負担軽減）には既に月次制限が設定されています");
    }

    console.log("");

    // 5. 更新後の加算マスタを確認
    console.log("📋 更新後の加算マスタ:");
    console.log("");

    for (const bonusCode of [
      "24h_response_system_basic",
      "24h_response_system_enhanced",
    ]) {
      const result = await db
        .select({
          bonusCode: bonusMaster.bonusCode,
          bonusName: bonusMaster.bonusName,
          insuranceType: bonusMaster.insuranceType,
          fixedPoints: bonusMaster.fixedPoints,
          isActive: bonusMaster.isActive,
          predefinedConditions: bonusMaster.predefinedConditions,
        })
        .from(bonusMaster)
        .where(eq(bonusMaster.bonusCode, bonusCode))
        .limit(1);

      if (result.length > 0) {
        const b = result[0];
        console.log(`  ✓ [${b.bonusCode}] ${b.bonusName}`);
        console.log(`    保険種別: ${b.insuranceType}, 点数: ${b.fixedPoints}, アクティブ: ${b.isActive}`);
        console.log(`    適用条件:`);
        const conditions = Array.isArray(b.predefinedConditions)
          ? b.predefinedConditions
          : b.predefinedConditions
            ? [b.predefinedConditions]
            : [];
        conditions.forEach((c: any, index: number) => {
          const pattern = c.pattern || c.type;
          if (pattern === "monthly_visit_limit") {
            console.log(`      ${index + 1}. 月次算定制限: 月${c.value}回まで`);
          } else if (pattern === "has_24h_support_system") {
            console.log(`      ${index + 1}. 24時間対応体制（基本）が有効`);
          } else if (pattern === "has_24h_support_system_enhanced") {
            console.log(`      ${index + 1}. 24時間対応体制（看護業務負担軽減）が有効`);
          } else {
            console.log(`      ${index + 1}. ${JSON.stringify(c)}`);
          }
        });
        console.log("");
      }
    }

    console.log("🎉 24時間対応体制加算の月次制限追加が完了しました！");
  } catch (error) {
    console.error("❌ エラーが発生しました:", error);
    throw error;
  }
}

// 実行
addMonthlyLimitTo24hBonus()
  .then(() => {
    console.log("✨ スクリプトが正常に完了しました");
    process.exit(0);
  })
  .catch((error) => {
    console.error("エラーが発生しました:", error);
    process.exit(1);
  });

