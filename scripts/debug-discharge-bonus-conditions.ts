/**
 * 退院時支援指導加算の条件評価を詳細に調査するスクリプト（読み取り専用）
 */

import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq, and, or, isNull, lte, gte } from "drizzle-orm";
import * as schema from "../shared/schema";

neonConfig.webSocketConstructor = ws;

const PRODUCTION_DB_URL = process.env.PRODUCTION_DB_URL || 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function main() {
  console.log("🔍 退院時支援指導加算の条件評価を詳細調査中...\n");
  console.log("⚠️  本番データベースに接続します（読み取り専用）\n");

  const pool = new Pool({ connectionString: PRODUCTION_DB_URL });
  const db = drizzle({ client: pool, schema });

  try {
    // 1. 患者を検索
    const allPatients = await db.query.patients.findMany({});
    const patient = allPatients.find(p => 
      p.lastName?.includes('祓川') && p.firstName?.includes('チカ')
    );

    if (!patient) {
      console.error("❌ 患者「祓川 チカ」が見つかりませんでした");
      return;
    }

    console.log(`✅ 患者ID: ${patient.id}`);
    console.log(`   氏名: ${patient.lastName} ${patient.firstName}`);
    console.log(`   保険種別: ${patient.insuranceType || "未設定"}\n`);

    // 2. 訪問記録を検索
    const targetDate = "2025-11-06";
    const records = await db.query.nursingRecords.findMany({
      where: and(
        eq(schema.nursingRecords.patientId, patient.id),
        eq(schema.nursingRecords.visitDate, targetDate)
      ),
      orderBy: (nursingRecords, { asc }) => [asc(nursingRecords.actualStartTime)],
    });

    const targetRecord = records.find((r) => {
      if (!r.actualStartTime || !r.actualEndTime) return false;
      const start = new Date(r.actualStartTime);
      const end = new Date(r.actualEndTime);
      const startHour = (start.getUTCHours() + 9) % 24;
      const endHour = (end.getUTCHours() + 9) % 24;
      return startHour === 8 && start.getUTCMinutes() === 0 && 
             endHour === 8 && end.getUTCMinutes() === 30;
    });

    if (!targetRecord) {
      console.error("❌ 対象記録が見つかりませんでした");
      return;
    }

    console.log(`✅ 訪問記録ID: ${targetRecord.id}`);
    console.log(`   isDischargeDate: ${targetRecord.isDischargeDate}`);
    console.log(`   保険種別: ${targetRecord.insuranceType || "未設定"}\n`);

    // 3. 加算マスタを取得
    const visitDateStr = targetDate;
    const dischargeBonuses = await db.query.bonusMaster.findMany({
      where: and(
        or(
          eq(schema.bonusMaster.facilityId, patient.facilityId),
          isNull(schema.bonusMaster.facilityId)
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

    const basicBonus = dischargeBonuses.find(
      (b) => b.bonusCode === "discharge_support_guidance_basic"
    );

    if (!basicBonus) {
      console.error("❌ 加算マスタが見つかりませんでした");
      return;
    }

    console.log("📋 加算マスタのpredefinedConditions:");
    console.log(JSON.stringify(basicBonus.predefinedConditions, null, 2));
    console.log("\n");

    // 4. 条件評価のシミュレーション
    console.log("🔍 条件評価のシミュレーション:");
    const conditions = Array.isArray(basicBonus.predefinedConditions)
      ? basicBonus.predefinedConditions
      : [basicBonus.predefinedConditions];

    conditions.forEach((condition: any, index: number) => {
      console.log(`\n条件 ${index + 1}:`);
      console.log(JSON.stringify(condition, null, 2));
      
      if (condition.pattern) {
        console.log(`  ✅ patternフィールドあり: ${condition.pattern}`);
        if (condition.pattern === "is_discharge_date") {
          console.log(`  ✅ isDischargeDate=${targetRecord.isDischargeDate} → 評価結果: ${targetRecord.isDischargeDate ? "通過" : "不通過"}`);
        }
      } else {
        console.log(`  ❌ patternフィールドなし`);
        console.log(`  ⚠️  この条件オブジェクトは評価できません（Unknown condition typeエラーになる可能性）`);
      }
    });

    // 5. 看護師情報を確認
    if (targetRecord.nurseId) {
      const nurse = await db.query.users.findFirst({
        where: eq(schema.users.id, targetRecord.nurseId),
      });
      
      if (nurse) {
        console.log(`\n📋 担当看護師情報:`);
        console.log(`   氏名: ${nurse.fullName}`);
        console.log(`   資格: ${nurse.role}`);
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
    console.log("\n✅ 調査完了");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ 調査中にエラーが発生しました:", error);
    process.exit(1);
  });

