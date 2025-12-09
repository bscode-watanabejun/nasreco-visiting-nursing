/**
 * 退院時支援指導加算の加算マスタ設定を確認するスクリプト（読み取り専用）
 */

import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq, and, or, isNull, lte, gte } from "drizzle-orm";
import * as schema from "../shared/schema";

neonConfig.webSocketConstructor = ws;

const PRODUCTION_DB_URL = process.env.PRODUCTION_DB_URL || 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function main() {
  console.log("🔍 退院時支援指導加算の加算マスタ設定を確認中...\n");
  console.log("⚠️  本番データベースに接続します（読み取り専用）\n");

  const pool = new Pool({ connectionString: PRODUCTION_DB_URL });
  const db = drizzle({ client: pool, schema });

  try {
    // 全施設の加算マスタを確認
    const visitDateStr = "2025-11-06";
    
    const dischargeBonuses = await db.query.bonusMaster.findMany({
      where: and(
        or(
          isNull(schema.bonusMaster.facilityId) // グローバル設定
        ),
        eq(schema.bonusMaster.insuranceType, "medical"),
        eq(schema.bonusMaster.isActive, true),
        lte(schema.bonusMaster.validFrom, visitDateStr),
        or(
          isNull(schema.bonusMaster.validTo),
          gte(schema.bonusMaster.validTo, visitDateStr)
        ),
        or(
          eq(schema.bonusMaster.bonusCode, "discharge_support_guidance_basic"),
          eq(schema.bonusMaster.bonusCode, "discharge_support_guidance_long")
        )
      ),
    });

    console.log(`✅ 退院時支援指導加算マスタ: ${dischargeBonuses.length}件\n`);

    for (const bonus of dischargeBonuses) {
      console.log(`\n${"=".repeat(80)}`);
      console.log(`加算コード: ${bonus.bonusCode}`);
      console.log(`加算名: ${bonus.bonusName}`);
      console.log(`ID: ${bonus.id}`);
      console.log(`施設ID: ${bonus.facilityId || "グローバル"}`);
      console.log(`有効期間: ${bonus.validFrom} ～ ${bonus.validTo || "無期限"}`);
      console.log(`\npredefinedConditions:`);
      console.log(JSON.stringify(bonus.predefinedConditions, null, 2));
      
      // 条件の分析
      if (bonus.predefinedConditions) {
        const conditions = Array.isArray(bonus.predefinedConditions)
          ? bonus.predefinedConditions
          : [bonus.predefinedConditions];
        
        console.log(`\n📋 条件分析:`);
        conditions.forEach((condition: any, index: number) => {
          console.log(`\n  条件 ${index + 1}:`);
          if (condition.pattern) {
            console.log(`    ✅ patternフィールドあり: "${condition.pattern}"`);
            console.log(`    → 評価可能`);
          } else if (condition.type) {
            console.log(`    ✅ typeフィールドあり: "${condition.type}"`);
            console.log(`    → 評価可能（後方互換性）`);
          } else {
            console.log(`    ❌ pattern/typeフィールドなし`);
            console.log(`    → 評価不可（エラーになる）`);
            console.log(`    フィールド: ${Object.keys(condition).join(", ")}`);
          }
        });
        
        // 問題のある条件を特定
        const problematicConditions = conditions.filter((c: any) => !c.pattern && !c.type);
        if (problematicConditions.length > 0) {
          console.log(`\n⚠️  問題: ${problematicConditions.length}個の評価不可な条件が見つかりました`);
          console.log(`   これらは削除するか、別のフィールド（notes等）に移動する必要があります`);
        } else {
          console.log(`\n✅ すべての条件が評価可能です`);
        }
      }
    }

  } catch (error) {
    console.error("❌ エラーが発生しました:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

main()
  .then(() => {
    console.log("\n✅ 確認完了");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ 確認中にエラーが発生しました:", error);
    process.exit(1);
  });

