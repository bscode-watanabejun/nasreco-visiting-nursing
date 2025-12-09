/**
 * 退院時支援指導加算の加算マスタ設定を修正するスクリプト
 * 
 * 問題: predefinedConditionsにpatternフィールドがない条件オブジェクトが含まれている
 * 修正: 評価可能な条件（patternフィールドあり）のみを残す
 * 
 * ⚠️ 本番DBへの書き込みを行います。実行前に必ず確認してください。
 */

import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq, and, or, isNull, lte, gte } from "drizzle-orm";
import * as schema from "../shared/schema";

neonConfig.webSocketConstructor = ws;

const PRODUCTION_DB_URL = process.env.PRODUCTION_DB_URL || 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function main() {
  console.log("🔧 退院時支援指導加算の加算マスタ設定を修正します...\n");
  console.log("⚠️  本番データベースに接続します");
  console.log("⚠️  データベースへの書き込みを行います\n");

  const pool = new Pool({ connectionString: PRODUCTION_DB_URL });
  const db = drizzle({ client: pool, schema });

  try {
    const visitDateStr = "2025-11-06";
    
    // 修正対象の加算マスタを取得
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

    console.log(`✅ 修正対象: ${dischargeBonuses.length}件の加算マスタ\n`);

    for (const bonus of dischargeBonuses) {
      console.log(`\n${"=".repeat(80)}`);
      console.log(`加算コード: ${bonus.bonusCode}`);
      console.log(`加算名: ${bonus.bonusName}`);
      console.log(`ID: ${bonus.id}`);
      
      if (!bonus.predefinedConditions) {
        console.log(`⚠️  predefinedConditionsが設定されていません。スキップします。`);
        continue;
      }

      const conditions = Array.isArray(bonus.predefinedConditions)
        ? bonus.predefinedConditions
        : [bonus.predefinedConditions];

      console.log(`\n修正前の条件数: ${conditions.length}`);

      // 評価可能な条件のみをフィルタリング（patternまたはtypeフィールドがあるもの）
      const validConditions = conditions.filter((c: any) => c.pattern || c.type);
      const removedConditions = conditions.filter((c: any) => !c.pattern && !c.type);

      console.log(`評価可能な条件: ${validConditions.length}件`);
      console.log(`削除する条件: ${removedConditions.length}件`);

      if (removedConditions.length > 0) {
        console.log(`\n削除される条件の内容:`);
        removedConditions.forEach((c: any, index: number) => {
          console.log(`  ${index + 1}. ${c.description || JSON.stringify(c)}`);
        });
      }

      if (validConditions.length === 0) {
        console.log(`\n⚠️  評価可能な条件がありません。スキップします。`);
        continue;
      }

      // 修正後のpredefinedConditions（評価可能な条件のみ）
      const fixedConditions = validConditions.length === 1 
        ? validConditions[0] 
        : validConditions;

      console.log(`\n修正後のpredefinedConditions:`);
      console.log(JSON.stringify(fixedConditions, null, 2));

      // データベースを更新
      await db
        .update(schema.bonusMaster)
        .set({
          predefinedConditions: fixedConditions,
          updatedAt: new Date(),
        })
        .where(eq(schema.bonusMaster.id, bonus.id));

      console.log(`\n✅ 加算マスタを更新しました`);
    }

    console.log(`\n${"=".repeat(80)}`);
    console.log(`✅ 修正完了`);

  } catch (error) {
    console.error("\n❌ エラーが発生しました:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

main()
  .then(() => {
    console.log("\n✅ 処理完了");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ 処理中にエラーが発生しました:", error);
    process.exit(1);
  });

