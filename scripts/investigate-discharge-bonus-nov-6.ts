/**
 * 本番DB読み取り専用調査スクリプト
 * 祓川 チカの2025年11月6日 08:00-08:30の訪問記録で
 * 「退院時支援指導加算」が適用されない原因を調査
 */

import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq, and, like, gte, lte, or, isNull } from "drizzle-orm";
import * as schema from "../shared/schema";

neonConfig.webSocketConstructor = ws;

const PRODUCTION_DB_URL = process.env.PRODUCTION_DB_URL || 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function main() {
  console.log("🔍 本番DB読み取り専用調査を開始します...\n");
  console.log("⚠️  本番データベースに接続します（読み取り専用）");
  console.log("   データの変更は一切行いません。\n");

  const pool = new Pool({ connectionString: PRODUCTION_DB_URL });
  const db = drizzle({ client: pool, schema });

  try {
    // 1. 患者を検索
    console.log("1. 患者「祓川 チカ」を検索中...");
    const allPatients = await db.query.patients.findMany({});
    const patient = allPatients.find(p => 
      p.lastName?.includes('祓川') && p.firstName?.includes('チカ')
    );

    if (!patient) {
      console.error("❌ 患者「祓川 チカ」が見つかりませんでした");
      return;
    }

    console.log(`✅ 患者が見つかりました: ID=${patient.id}, 施設ID=${patient.facilityId}\n`);

    // 2. 2025年11月6日の訪問記録を検索
    console.log("2. 2025年11月6日の訪問記録を検索中...");
    const targetDate = "2025-11-06";
    const records = await db.query.nursingRecords.findMany({
      where: and(
        eq(schema.nursingRecords.patientId, patient.id),
        eq(schema.nursingRecords.facilityId, patient.facilityId),
        eq(schema.nursingRecords.visitDate, targetDate)
      ),
      orderBy: (nursingRecords, { asc }) => [asc(nursingRecords.actualStartTime)],
    });

    console.log(`✅ ${records.length}件の訪問記録が見つかりました\n`);

    // 3. 08:00-08:30の記録を特定
    const targetRecord = records.find((r) => {
      if (!r.actualStartTime || !r.actualEndTime) return false;
      const start = new Date(r.actualStartTime);
      const end = new Date(r.actualEndTime);
      const startHour = start.getUTCHours();
      const startMin = start.getUTCMinutes();
      const endHour = end.getUTCHours();
      const endMin = end.getUTCMinutes();

      // JSTに変換（UTC+9）
      const startHourJST = (startHour + 9) % 24;
      const endHourJST = (endHour + 9) % 24;

      return (
        startHourJST === 8 &&
        startMin === 0 &&
        endHourJST === 8 &&
        endMin === 30
      );
    });

    if (!targetRecord) {
      console.error("❌ 8:00-8:30の訪問記録が見つかりませんでした");
      console.log("\n見つかった記録:");
      records.forEach((r) => {
        const start = r.actualStartTime ? new Date(r.actualStartTime) : null;
        const end = r.actualEndTime ? new Date(r.actualEndTime) : null;
        const startStr = start
          ? `${(start.getUTCHours() + 9) % 24}:${String(start.getUTCMinutes()).padStart(2, "0")}`
          : "不明";
        const endStr = end
          ? `${(end.getUTCHours() + 9) % 24}:${String(end.getUTCMinutes()).padStart(2, "0")}`
          : "不明";
        console.log(`  - ID=${r.id}, ${startStr}-${endStr}, isDischargeDate=${r.isDischargeDate}`);
      });
      return;
    }

    console.log(`✅ 対象記録が見つかりました: ID=${targetRecord.id}\n`);

    // 4. 訪問記録の詳細を表示
    console.log("3. 訪問記録の詳細:");
    console.log(`   ID: ${targetRecord.id}`);
    console.log(`   訪問日: ${targetRecord.visitDate}`);
    console.log(`   開始時刻: ${targetRecord.actualStartTime}`);
    console.log(`   終了時刻: ${targetRecord.actualEndTime}`);
    console.log(`   isDischargeDate: ${targetRecord.isDischargeDate}`);
    console.log(`   ステータス: ${targetRecord.status}`);
    console.log(`   保険種別: ${targetRecord.insuranceType || "未設定"}`);
    console.log(`   適用加算: ${JSON.stringify(targetRecord.appliedBonuses || [])}`);
    console.log(`   計算点数: ${targetRecord.calculatedPoints || 0}\n`);

    // 5. 加算マスタを確認
    console.log("4. 退院時支援指導加算の加算マスタを確認中...");
    const visitDate = new Date(targetDate);
    const visitDateStr = visitDate.toISOString().split('T')[0];
    
    const dischargeBonuses = await db.query.bonusMaster.findMany({
      where: and(
        or(
          eq(schema.bonusMaster.facilityId, patient.facilityId),
          isNull(schema.bonusMaster.facilityId) // グローバル設定も含む
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
    const longBonus = dischargeBonuses.find(
      (b) => b.bonusCode === "discharge_support_guidance_long"
    );

    if (basicBonus) {
      console.log("\n✅ 退院時支援指導加算（基本）のマスタ:");
      console.log(`   ID: ${basicBonus.id}`);
      console.log(`   bonusCode: ${basicBonus.bonusCode}`);
      console.log(`   bonusName: ${basicBonus.bonusName}`);
      console.log(`   isActive: ${basicBonus.isActive}`);
      console.log(`   validFrom: ${basicBonus.validFrom}`);
      console.log(`   validTo: ${basicBonus.validTo}`);
      console.log(
        `   predefinedConditions: ${JSON.stringify(basicBonus.predefinedConditions, null, 2)}`
      );
    } else {
      console.error("\n❌ 退院時支援指導加算（基本）のマスタが見つかりません");
    }

    if (longBonus) {
      console.log("\n✅ 退院時支援指導加算（長時間）のマスタ:");
      console.log(`   ID: ${longBonus.id}`);
      console.log(`   bonusCode: ${longBonus.bonusCode}`);
      console.log(`   bonusName: ${longBonus.bonusName}`);
      console.log(
        `   predefinedConditions: ${JSON.stringify(longBonus.predefinedConditions, null, 2)}`
      );
    } else {
      console.error("\n❌ 退院時支援指導加算（長時間）のマスタが見つかりません");
    }

    // 6. 加算計算履歴を確認
    console.log("\n5. 加算計算履歴を確認中...");
    const bonusHistory = await db.query.bonusCalculationHistory.findMany({
      where: eq(schema.bonusCalculationHistory.nursingRecordId, targetRecord.id),
      orderBy: (history, { desc }) => [desc(history.createdAt)],
    });

    console.log(`✅ ${bonusHistory.length}件の加算計算履歴が見つかりました`);

    if (bonusHistory.length > 0) {
      console.log("\n最新の加算計算履歴:");
      const latest = bonusHistory[0];
      console.log(`   作成日時: ${latest.createdAt}`);
      console.log(`   適用加算: ${latest.appliedBonuses ? JSON.stringify(latest.appliedBonuses, null, 2) : "なし"}`);
      console.log(`   計算点数: ${latest.calculatedPoints || 0}`);
      console.log(`   計算結果: ${latest.calculationResult ? JSON.stringify(latest.calculationResult, null, 2) : "なし"}`);
    } else {
      console.log("\n⚠️ 加算計算履歴がありません");
    }

    // 7. 問題の診断
    console.log("\n6. 問題の診断:");
    if (!targetRecord.isDischargeDate) {
      console.log("❌ 問題: isDischargeDateがfalseになっています");
      console.log("   → 訪問記録の「退院日当日の訪問」チェックが保存されていない可能性があります");
    } else {
      console.log("✅ isDischargeDateはtrueです");
    }

    if (!basicBonus) {
      console.log("❌ 問題: 退院時支援指導加算（基本）のマスタが存在しません");
    } else {
      const conditions = basicBonus.predefinedConditions;
      if (!conditions) {
        console.log("❌ 問題: predefinedConditionsが設定されていません");
      } else if (Array.isArray(conditions)) {
        const hasPattern = conditions.some(
          (c: any) => c?.pattern === "is_discharge_date"
        );
        if (!hasPattern) {
          console.log("❌ 問題: predefinedConditionsにis_discharge_dateパターンが含まれていません");
          console.log(`   現在の設定: ${JSON.stringify(conditions, null, 2)}`);
        } else {
          console.log("✅ predefinedConditionsにis_discharge_dateパターンが含まれています");
        }
      } else {
        console.log("❌ 問題: predefinedConditionsが配列形式ではありません");
        console.log(`   現在の形式: ${typeof conditions}`);
        console.log(`   値: ${JSON.stringify(conditions, null, 2)}`);
      }
    }

    const appliedBonuses = targetRecord.appliedBonuses as string[] | null;
    const hasDischargeBonus = appliedBonuses?.some(
      (b) =>
        b === "discharge_support_guidance_basic" ||
        b === "discharge_support_guidance_long"
    );

    if (!hasDischargeBonus) {
      console.log("\n❌ 問題: 適用加算に退院時支援指導加算が含まれていません");
      console.log(`   現在の適用加算: ${JSON.stringify(appliedBonuses || [])}`);
    } else {
      console.log("\n✅ 適用加算に退院時支援指導加算が含まれています");
    }

  } catch (error) {
    console.error("❌ エラーが発生しました:", error);
    throw error;
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

