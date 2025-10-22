/**
 * Phase 2-1 加算マスタシードデータ
 *
 * 施設体制フラグ系の4項目を更新:
 * 1. 24時間対応体制加算（医療保険）
 * 2. 24時間対応体制加算（看護業務負担軽減）（医療保険）
 * 3. 緊急時訪問看護加算（I）（介護保険）
 * 4. 緊急時訪問看護加算（II）（介護保険）
 */

import { db } from "./db";
import { bonusMaster } from "@shared/schema";
import { eq } from "drizzle-orm";

async function seedPhase2_1BonusMaster() {
  console.log("🌱 Phase 2-1 加算マスタシードデータを更新中...");
  console.log("");

  try {
    // 1. 24時間対応体制加算（医療保険）
    await db
      .update(bonusMaster)
      .set({
        predefinedConditions: [
          {
            type: "has_24h_support_system",
          },
        ],
      })
      .where(eq(bonusMaster.bonusCode, "24h_response_system_basic"));

    console.log("✅ 24時間対応体制加算（医療保険）を更新しました");

    // 2. 24時間対応体制加算（看護業務負担軽減）（医療保険）
    await db
      .update(bonusMaster)
      .set({
        predefinedConditions: [
          {
            type: "has_24h_support_system_enhanced",
          },
        ],
      })
      .where(eq(bonusMaster.bonusCode, "24h_response_system_enhanced"));

    console.log("✅ 24時間対応体制加算（看護業務負担軽減）を更新しました");

    // 3. 緊急時訪問看護加算（I）（介護保険） - 重複データを確認して更新
    const careEmergencySystem = await db
      .select()
      .from(bonusMaster)
      .where(eq(bonusMaster.bonusCode, "care_emergency_system"));

    if (careEmergencySystem.length > 1) {
      console.log(`⚠️  care_emergency_system が${careEmergencySystem.length}件存在します`);

      // display_order が 100 のレコードを更新（Phase1で使用中のもの）
      await db
        .update(bonusMaster)
        .set({
          bonusName: "緊急時訪問看護加算（I）（介護保険）",
          predefinedConditions: [
            {
              type: "has_emergency_support_system",
            },
          ],
        })
        .where(
          eq(bonusMaster.bonusCode, "care_emergency_system")
        );

      console.log("✅ 緊急時訪問看護加算（I）を更新しました（重複分も含む）");
    } else {
      await db
        .update(bonusMaster)
        .set({
          bonusName: "緊急時訪問看護加算（I）（介護保険）",
          predefinedConditions: [
            {
              type: "has_emergency_support_system",
            },
          ],
        })
        .where(eq(bonusMaster.bonusCode, "care_emergency_system"));

      console.log("✅ 緊急時訪問看護加算（I）を更新しました");
    }

    // 4. 緊急時訪問看護加算（II）（介護保険）
    await db
      .update(bonusMaster)
      .set({
        predefinedConditions: [
          {
            type: "has_emergency_support_system_enhanced",
          },
        ],
      })
      .where(eq(bonusMaster.bonusCode, "care_emergency_system_2"));

    console.log("✅ 緊急時訪問看護加算（II）を更新しました");
    console.log("");

    // 更新後の加算マスタを確認
    const updatedBonuses = await db
      .select({
        bonusCode: bonusMaster.bonusCode,
        bonusName: bonusMaster.bonusName,
        insuranceType: bonusMaster.insuranceType,
        fixedPoints: bonusMaster.fixedPoints,
        isActive: bonusMaster.isActive,
        predefinedConditions: bonusMaster.predefinedConditions,
      })
      .from(bonusMaster)
      .where(
        eq(bonusMaster.bonusCode, "24h_response_system_basic")
      );

    console.log("📋 更新後の加算マスタ（Phase 2-1）:");
    console.log("");

    for (const bonus of [
      "24h_response_system_basic",
      "24h_response_system_enhanced",
      "care_emergency_system",
      "care_emergency_system_2",
    ]) {
      const result = await db
        .select({
          bonusCode: bonusMaster.bonusCode,
          bonusName: bonusMaster.bonusName,
          insuranceType: bonusMaster.insuranceType,
          fixedPoints: bonusMaster.fixedPoints,
          isActive: bonusMaster.isActive,
        })
        .from(bonusMaster)
        .where(eq(bonusMaster.bonusCode, bonus));

      if (result.length > 0) {
        const b = result[0];
        console.log(`  ✓ [${b.bonusCode}] ${b.bonusName}`);
        console.log(`    保険種別: ${b.insuranceType}, 点数: ${b.fixedPoints}, アクティブ: ${b.isActive}`);
        console.log("");
      }
    }

    console.log("🎉 Phase 2-1 加算マスタシードデータの更新が完了しました！");
  } catch (error) {
    console.error("❌ エラーが発生しました:", error);
    throw error;
  }
}

// 実行
seedPhase2_1BonusMaster()
  .then(() => {
    console.log("✨ スクリプトが正常に完了しました");
    process.exit(0);
  })
  .catch((error) => {
    console.error("エラーが発生しました:", error);
    process.exit(1);
  });
