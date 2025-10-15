/**
 * Bonus Engine Test Script
 * 加算計算エンジンのテストスクリプト
 */

import { calculateBonuses, BonusCalculationContext } from "./server/bonus-engine";

async function runTests() {
  console.log("🧪 Bonus Engine Test Suite\n");
  console.log("=" . repeat(60));

  // Test 1: 緊急訪問（夜間）- 2つの加算が適用されるはず
  console.log("\n📋 Test 1: Emergency Visit at Night (19:00)");
  console.log("-".repeat(60));

  const test1Context: BonusCalculationContext = {
    nursingRecordId: "test-record-001",
    patientId: "5df7433b-a4a7-47f2-9763-1a5cc1e9bfc2",
    facilityId: "fac-tokyo-main",
    visitDate: new Date("2025-10-15"),
    visitStartTime: new Date("2025-10-15T19:00:00"),
    visitEndTime: new Date("2025-10-15T20:00:00"),
    isSecondVisit: false,
    emergencyVisitReason: "呼吸困難のため緊急訪問",
    multipleVisitReason: null,
    longVisitReason: null,
    patientAge: 80,
    buildingId: null,
    insuranceType: "medical",
    dailyVisitCount: 1,
  };

  try {
    const results1 = await calculateBonuses(test1Context);
    console.log(`✅ Bonuses calculated: ${results1.length} bonus(es) applied`);
    for (const result of results1) {
      console.log(`   - ${result.bonusName}: ${result.calculatedPoints}点 (version ${result.appliedVersion})`);
      console.log(`     Matched condition: ${result.calculationDetails.matchedCondition}`);
    }
    const totalPoints1 = results1.reduce((sum, r) => sum + r.calculatedPoints, 0);
    console.log(`   Total: ${totalPoints1}点`);
  } catch (error) {
    console.error("❌ Test 1 failed:", error);
  }

  // Test 2: 長時間訪問（90分以上）
  console.log("\n📋 Test 2: Long Visit (90+ minutes)");
  console.log("-".repeat(60));

  const test2Context: BonusCalculationContext = {
    nursingRecordId: "test-record-002",
    patientId: "5df7433b-a4a7-47f2-9763-1a5cc1e9bfc2",
    facilityId: "fac-tokyo-main",
    visitDate: new Date("2025-10-15"),
    visitStartTime: new Date("2025-10-15T10:00:00"),
    visitEndTime: new Date("2025-10-15T11:35:00"), // 95分
    isSecondVisit: false,
    emergencyVisitReason: null,
    multipleVisitReason: null,
    longVisitReason: "褥瘡処置のため長時間訪問",
    patientAge: 80,
    buildingId: null,
    insuranceType: "medical",
    dailyVisitCount: 1,
  };

  try {
    const results2 = await calculateBonuses(test2Context);
    console.log(`✅ Bonuses calculated: ${results2.length} bonus(es) applied`);
    for (const result of results2) {
      console.log(`   - ${result.bonusName}: ${result.calculatedPoints}点 (version ${result.appliedVersion})`);
      console.log(`     Matched condition: ${result.calculationDetails.matchedCondition}`);
    }
    const totalPoints2 = results2.reduce((sum, r) => sum + r.calculatedPoints, 0);
    console.log(`   Total: ${totalPoints2}点`);
  } catch (error) {
    console.error("❌ Test 2 failed:", error);
  }

  // Test 3: 乳幼児訪問（5歳）
  console.log("\n📋 Test 3: Infant Visit (Age 5)");
  console.log("-".repeat(60));

  const test3Context: BonusCalculationContext = {
    nursingRecordId: "test-record-003",
    patientId: "test-infant-001",
    facilityId: "fac-tokyo-main",
    visitDate: new Date("2025-10-15"),
    visitStartTime: new Date("2025-10-15T14:00:00"),
    visitEndTime: new Date("2025-10-15T15:00:00"),
    isSecondVisit: false,
    emergencyVisitReason: null,
    multipleVisitReason: null,
    longVisitReason: null,
    patientAge: 5,
    buildingId: null,
    insuranceType: "medical",
    dailyVisitCount: 1,
  };

  try {
    const results3 = await calculateBonuses(test3Context);
    console.log(`✅ Bonuses calculated: ${results3.length} bonus(es) applied`);
    for (const result of results3) {
      console.log(`   - ${result.bonusName}: ${result.calculatedPoints}点 (version ${result.appliedVersion})`);
      console.log(`     Matched condition: ${result.calculationDetails.matchedCondition}`);
    }
    const totalPoints3 = results3.reduce((sum, r) => sum + r.calculatedPoints, 0);
    console.log(`   Total: ${totalPoints3}点`);
  } catch (error) {
    console.error("❌ Test 3 failed:", error);
  }

  // Test 4: 深夜訪問（23:00）
  console.log("\n📋 Test 4: Late Night Visit (23:00)");
  console.log("-".repeat(60));

  const test4Context: BonusCalculationContext = {
    nursingRecordId: "test-record-004",
    patientId: "5df7433b-a4a7-47f2-9763-1a5cc1e9bfc2",
    facilityId: "fac-tokyo-main",
    visitDate: new Date("2025-10-15"),
    visitStartTime: new Date("2025-10-15T23:00:00"),
    visitEndTime: new Date("2025-10-15T23:45:00"),
    isSecondVisit: false,
    emergencyVisitReason: null,
    multipleVisitReason: null,
    longVisitReason: null,
    patientAge: 80,
    buildingId: null,
    insuranceType: "medical",
    dailyVisitCount: 1,
  };

  try {
    const results4 = await calculateBonuses(test4Context);
    console.log(`✅ Bonuses calculated: ${results4.length} bonus(es) applied`);
    for (const result of results4) {
      console.log(`   - ${result.bonusName}: ${result.calculatedPoints}点 (version ${result.appliedVersion})`);
      console.log(`     Matched condition: ${result.calculationDetails.matchedCondition}`);
    }
    const totalPoints4 = results4.reduce((sum, r) => sum + r.calculatedPoints, 0);
    console.log(`   Total: ${totalPoints4}点`);
  } catch (error) {
    console.error("❌ Test 4 failed:", error);
  }

  // Test 5: 複数名訪問
  console.log("\n📋 Test 5: Multiple Staff Visit");
  console.log("-".repeat(60));

  const test5Context: BonusCalculationContext = {
    nursingRecordId: "test-record-005",
    patientId: "5df7433b-a4a7-47f2-9763-1a5cc1e9bfc2",
    facilityId: "fac-tokyo-main",
    visitDate: new Date("2025-10-15"),
    visitStartTime: new Date("2025-10-15T10:00:00"),
    visitEndTime: new Date("2025-10-15T11:00:00"),
    isSecondVisit: false,
    emergencyVisitReason: null,
    multipleVisitReason: "体位変換のため看護師2名で訪問",
    longVisitReason: null,
    patientAge: 80,
    buildingId: null,
    insuranceType: "medical",
    dailyVisitCount: 1,
  };

  try {
    const results5 = await calculateBonuses(test5Context);
    console.log(`✅ Bonuses calculated: ${results5.length} bonus(es) applied`);
    for (const result of results5) {
      console.log(`   - ${result.bonusName}: ${result.calculatedPoints}点 (version ${result.appliedVersion})`);
      console.log(`     Matched condition: ${result.calculationDetails.matchedCondition}`);
    }
    const totalPoints5 = results5.reduce((sum, r) => sum + r.calculatedPoints, 0);
    console.log(`   Total: ${totalPoints5}点`);
  } catch (error) {
    console.error("❌ Test 5 failed:", error);
  }

  console.log("\n" + "=".repeat(60));
  console.log("✅ All tests completed!\n");

  process.exit(0);
}

runTests().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
