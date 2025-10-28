/**
 * Bonus Calculation Engine (Phase 4)
 *
 * 加算計算ルールエンジン
 * - 事前定義パターンの評価
 * - バージョン自動選択
 * - 併算定制御
 * - 計算履歴の記録
 */

import { db } from "./db";
import {
  bonusMaster,
  bonusCalculationHistory,
  nursingRecords,
  patients,
  BonusMaster,
  InsertBonusCalculationHistory,
} from "@shared/schema";
import { eq, and, lte, or, isNull, gte, isNotNull, ne } from "drizzle-orm";

// ========== Type Definitions ==========

/**
 * 計算コンテキスト
 * 加算計算に必要な全ての情報を含む
 */
export interface BonusCalculationContext {
  // 訪問記録情報
  nursingRecordId: string;
  patientId: string;
  facilityId: string;
  visitDate: Date;
  visitStartTime?: Date | null;
  visitEndTime?: Date | null;

  // 訪問情報
  isSecondVisit: boolean; // 同日2回目以降
  emergencyVisitReason?: string | null;
  multipleVisitReason?: string | null;
  longVisitReason?: string | null;

  // Phase 2-A: 記録フラグ（加算判定用）
  isDischargeDate?: boolean; // 退院日当日訪問
  isFirstVisitOfPlan?: boolean; // 新規計画初回訪問
  hasCollaborationRecord?: boolean; // 多職種連携記録あり
  isTerminalCare?: boolean; // ターミナルケア実施
  terminalCareDeathDate?: Date | null; // ターミナルケア対象患者の死亡日

  // 患者情報
  patientAge?: number;
  buildingId?: string | null;
  insuranceType: "medical" | "care";
  lastDischargeDate?: Date | null; // 直近の退院日
  lastPlanCreatedDate?: Date | null; // 直近の訪問看護計画作成日
  deathDate?: Date | null; // 死亡日
  specialManagementTypes?: string[] | null; // 特別管理項目（配列）

  // 追加コンテキスト（必要に応じて拡張）
  [key: string]: any;
}

/**
 * 条件評価結果
 */
export interface ConditionEvaluationResult {
  passed: boolean;
  reason?: string;
  metadata?: Record<string, any>;
}

/**
 * パターン評価結果
 */
export interface PatternEvaluationResult {
  points: number;
  matchedCondition: string;
  metadata?: Record<string, any>;
}

/**
 * 加算計算結果
 */
export interface BonusCalculationResult {
  bonusCode: string;
  bonusName: string;
  bonusMasterId: string;
  calculatedPoints: number;
  appliedVersion: string;
  conditionsPassed: string[];
  calculationDetails: any;
}

// ========== Predefined Conditions Evaluator ==========

/**
 * 事前定義条件の評価
 */
export function evaluatePredefinedCondition(
  condition: any,
  context: BonusCalculationContext
): ConditionEvaluationResult {
  // Phase 2-A: 'pattern' フィールドをサポート（後方互換性のため 'type' も維持）
  const type = condition.pattern || condition.type;

  // Phase 2-A: パターン評価を実行
  let result: ConditionEvaluationResult;

  switch (type) {
    case "field_not_empty":
      result = evaluateFieldNotEmpty(condition.field, context);
      break;

    case "field_equals":
      result = evaluateFieldEquals(condition.field, condition.value, context);
      break;

    case "visit_duration_gte":
      result = evaluateVisitDurationGte(condition.value, context);
      break;

    case "visit_duration_lt":
      result = evaluateVisitDurationLt(condition.value, context);
      break;

    case "age_lt":
      result = evaluateAgeLt(condition.value, context);
      break;

    case "age_gte":
      result = evaluateAgeGte(condition.value, context);
      break;

    case "is_second_visit":
      result = evaluateIsSecondVisit(context);
      break;

    case "has_building":
      result = evaluateHasBuilding(context);
      break;

    // Phase2-1: 施設体制フラグ条件
    case "has_24h_support_system":
      result = evaluateHas24hSupportSystem(context);
      break;

    case "has_24h_support_system_enhanced":
      result = evaluateHas24hSupportSystemEnhanced(context);
      break;

    case "has_emergency_support_system":
      result = evaluateHasEmergencySupportSystem(context);
      break;

    case "has_emergency_support_system_enhanced":
      result = evaluateHasEmergencySupportSystemEnhanced(context);
      break;

    // Phase 2-A: 記録フラグ条件
    case "is_discharge_date":
      result = evaluateIsDischargeDate(context);
      break;

    case "is_first_visit_of_plan":
      result = evaluateIsFirstVisitOfPlan(context);
      break;

    case "has_collaboration_record":
      result = evaluateHasCollaborationRecord(context);
      break;

    case "is_terminal_care":
      result = evaluateIsTerminalCare(context);
      break;

    case "patient_has_special_management":
      result = evaluatePatientHasSpecialManagement(context);
      break;

    // Phase 2-A: 介護保険の時間帯・時間長条件
    case "care_early_morning_time":
      result = evaluateCareEarlyMorningTime(context);
      break;

    case "care_night_time":
      result = evaluateCareNightTime(context);
      break;

    case "care_late_night_time":
      result = evaluateCareLateNightTime(context);
      break;

    case "care_visit_duration_90plus":
      result = evaluateCareVisitDuration90Plus(context);
      break;

    default:
      return { passed: false, reason: `Unknown condition type: ${type}` };
  }

  // Phase 2-A: operator と value のチェック
  // 条件に value フィールドがある場合、結果の passed 値と比較
  if (condition.operator === "equals" && condition.value !== undefined) {
    const expectedValue = condition.value;

    if (result.passed !== expectedValue) {
      // 期待値と一致しない場合は条件不成立
      return {
        passed: false,
        reason: `条件不一致: 期待値=${expectedValue}, 実際=${result.passed} (${result.reason})`,
      };
    }

    // 期待値と一致した場合は条件成立
    return {
      passed: true,
      reason: `${result.reason} (期待値: ${expectedValue})`,
    };
  }

  return result;
}

// ========== Individual Condition Evaluators ==========

function evaluateFieldNotEmpty(field: string, context: BonusCalculationContext): ConditionEvaluationResult {
  const value = context[field];
  const passed = value !== null && value !== undefined && value !== "";
  return {
    passed,
    reason: passed ? `${field} is not empty` : `${field} is empty`,
  };
}

function evaluateFieldEquals(field: string, expectedValue: any, context: BonusCalculationContext): ConditionEvaluationResult {
  const value = context[field];
  const passed = value === expectedValue;
  return {
    passed,
    reason: passed ? `${field} equals ${expectedValue}` : `${field} (${value}) does not equal ${expectedValue}`,
  };
}

function evaluateVisitDurationGte(minutes: number, context: BonusCalculationContext): ConditionEvaluationResult {
  if (!context.visitStartTime || !context.visitEndTime) {
    return { passed: false, reason: "Visit start/end time not recorded" };
  }

  const durationMs = context.visitEndTime.getTime() - context.visitStartTime.getTime();
  const durationMinutes = Math.floor(durationMs / 60000);
  const passed = durationMinutes >= minutes;

  return {
    passed,
    reason: passed
      ? `Visit duration ${durationMinutes}min >= ${minutes}min`
      : `Visit duration ${durationMinutes}min < ${minutes}min`,
    metadata: { durationMinutes },
  };
}

function evaluateVisitDurationLt(minutes: number, context: BonusCalculationContext): ConditionEvaluationResult {
  if (!context.visitStartTime || !context.visitEndTime) {
    return { passed: false, reason: "Visit start/end time not recorded" };
  }

  const durationMs = context.visitEndTime.getTime() - context.visitStartTime.getTime();
  const durationMinutes = Math.floor(durationMs / 60000);
  const passed = durationMinutes < minutes;

  return {
    passed,
    reason: passed
      ? `Visit duration ${durationMinutes}min < ${minutes}min`
      : `Visit duration ${durationMinutes}min >= ${minutes}min`,
    metadata: { durationMinutes },
  };
}

function evaluateAgeLt(ageThreshold: number, context: BonusCalculationContext): ConditionEvaluationResult {
  if (context.patientAge === undefined) {
    return { passed: false, reason: "Patient age not available" };
  }

  const passed = context.patientAge < ageThreshold;
  return {
    passed,
    reason: passed
      ? `Patient age ${context.patientAge} < ${ageThreshold}`
      : `Patient age ${context.patientAge} >= ${ageThreshold}`,
  };
}

function evaluateAgeGte(ageThreshold: number, context: BonusCalculationContext): ConditionEvaluationResult {
  if (context.patientAge === undefined) {
    return { passed: false, reason: "Patient age not available" };
  }

  const passed = context.patientAge >= ageThreshold;
  return {
    passed,
    reason: passed
      ? `Patient age ${context.patientAge} >= ${ageThreshold}`
      : `Patient age ${context.patientAge} < ${ageThreshold}`,
  };
}

function evaluateIsSecondVisit(context: BonusCalculationContext): ConditionEvaluationResult {
  return {
    passed: context.isSecondVisit,
    reason: context.isSecondVisit ? "Is second visit of the day" : "Is first visit of the day",
  };
}

function evaluateHasBuilding(context: BonusCalculationContext): ConditionEvaluationResult {
  const passed = !!context.buildingId;
  return {
    passed,
    reason: passed ? "Patient has building assignment" : "Patient has no building assignment",
  };
}

// ========== Phase2-1: Facility System Flags Evaluators ==========

/**
 * 24時間対応体制加算（医療保険）の条件評価
 */
function evaluateHas24hSupportSystem(context: BonusCalculationContext): ConditionEvaluationResult {
  const passed = context.has24hSupportSystem === true;
  return {
    passed,
    reason: passed ? "24時間対応体制あり" : "24時間対応体制なし",
  };
}

/**
 * 24時間対応体制加算（看護業務負担軽減）の条件評価
 */
function evaluateHas24hSupportSystemEnhanced(context: BonusCalculationContext): ConditionEvaluationResult {
  const passed = context.has24hSupportSystemEnhanced === true;

  // 看護業務負担軽減の取り組みが2項目以上あるかチェック
  const measures = context.burdenReductionMeasures || [];
  const hasSufficientMeasures = Array.isArray(measures) && measures.length >= 2;

  const finalPassed = passed && hasSufficientMeasures;

  return {
    passed: finalPassed,
    reason: finalPassed
      ? `24時間対応体制（看護業務負担軽減）あり（取り組み${measures.length}項目）`
      : passed
        ? `24時間対応体制はあるが、負担軽減の取り組みが不足（${measures.length}項目/2項目以上必要）`
        : "24時間対応体制（看護業務負担軽減）なし",
  };
}

/**
 * 緊急時訪問看護加算（I）（介護保険）の条件評価
 */
function evaluateHasEmergencySupportSystem(context: BonusCalculationContext): ConditionEvaluationResult {
  const passed = context.hasEmergencySupportSystem === true;
  return {
    passed,
    reason: passed ? "緊急時訪問看護加算（I）体制あり" : "緊急時訪問看護加算（I）体制なし",
  };
}

/**
 * 緊急時訪問看護加算（II）（介護保険）の条件評価
 */
function evaluateHasEmergencySupportSystemEnhanced(context: BonusCalculationContext): ConditionEvaluationResult {
  const passed = context.hasEmergencySupportSystemEnhanced === true;
  return {
    passed,
    reason: passed ? "緊急時訪問看護加算（II）体制あり" : "緊急時訪問看護加算（II）体制なし",
  };
}

/**
 * Phase 2-A: 退院日当日訪問の条件評価
 */
function evaluateIsDischargeDate(context: BonusCalculationContext): ConditionEvaluationResult {
  const passed = context.isDischargeDate === true;
  return {
    passed,
    reason: passed ? "退院日当日の訪問" : "退院日当日ではない",
  };
}

/**
 * Phase 2-A: 新規計画初回訪問の条件評価
 */
function evaluateIsFirstVisitOfPlan(context: BonusCalculationContext): ConditionEvaluationResult {
  const passed = context.isFirstVisitOfPlan === true;
  return {
    passed,
    reason: passed ? "新規計画初回訪問" : "新規計画初回訪問ではない",
  };
}

/**
 * Phase 2-A: 多職種連携記録ありの条件評価
 */
function evaluateHasCollaborationRecord(context: BonusCalculationContext): ConditionEvaluationResult {
  const passed = context.hasCollaborationRecord === true;
  return {
    passed,
    reason: passed ? "多職種連携記録あり" : "多職種連携記録なし",
  };
}

/**
 * Phase 2-A: ターミナルケア実施の条件評価
 */
function evaluateIsTerminalCare(context: BonusCalculationContext): ConditionEvaluationResult {
  const passed = context.isTerminalCare === true;
  return {
    passed,
    reason: passed ? "ターミナルケア実施" : "ターミナルケア未実施",
  };
}

/**
 * Phase 4: 患者が特別管理の対象かチェック
 */
function evaluatePatientHasSpecialManagement(context: BonusCalculationContext): ConditionEvaluationResult {
  const specialManagementTypes = context.specialManagementTypes || [];

  if (specialManagementTypes.length > 0) {
    return {
      passed: true,
      reason: `特別管理項目: ${specialManagementTypes.join(', ')}`,
    };
  }

  return {
    passed: false,
    reason: "特別管理対象外",
  };
}

/**
 * Phase 4: 同じ訪問記録で退院時共同指導加算が算定されているかチェック
 * 注: この評価関数は appliedBonusCodes を参照するため、calculateBonuses() 内で特別に処理される
 */
function evaluateHasDischargeJointGuidanceInSameRecord(
  context: BonusCalculationContext,
  appliedBonusCodes?: string[]
): ConditionEvaluationResult {
  if (!appliedBonusCodes) {
    return {
      passed: false,
      reason: "加算コードリストが未提供",
    };
  }

  const hasDischargeJointGuidance = appliedBonusCodes.includes('medical_discharge_joint_guidance');

  return {
    passed: hasDischargeJointGuidance,
    reason: hasDischargeJointGuidance
      ? "退院時共同指導加算が算定されている"
      : "退院時共同指導加算が算定されていない",
  };
}

/**
 * Phase 2-A: 介護保険の時間帯判定（早朝：6:00-8:00）
 */
function evaluateCareEarlyMorningTime(context: BonusCalculationContext): ConditionEvaluationResult {
  if (!context.visitStartTime) {
    return { passed: false, reason: "訪問開始時刻が未設定" };
  }

  const startTime = new Date(context.visitStartTime);
  const hours = startTime.getHours();
  const passed = hours >= 6 && hours < 8;

  return {
    passed,
    reason: passed
      ? `早朝時間帯（6:00-8:00）の訪問（開始時刻: ${hours}:${startTime.getMinutes().toString().padStart(2, '0')}）`
      : `早朝時間帯外（開始時刻: ${hours}:${startTime.getMinutes().toString().padStart(2, '0')}）`,
  };
}

/**
 * Phase 2-A: 介護保険の時間帯判定（夜間：18:00-22:00）
 */
function evaluateCareNightTime(context: BonusCalculationContext): ConditionEvaluationResult {
  if (!context.visitStartTime) {
    return { passed: false, reason: "訪問開始時刻が未設定" };
  }

  const startTime = new Date(context.visitStartTime);
  const hours = startTime.getHours();
  const passed = hours >= 18 && hours < 22;

  return {
    passed,
    reason: passed
      ? `夜間時間帯（18:00-22:00）の訪問（開始時刻: ${hours}:${startTime.getMinutes().toString().padStart(2, '0')}）`
      : `夜間時間帯外（開始時刻: ${hours}:${startTime.getMinutes().toString().padStart(2, '0')}）`,
  };
}

/**
 * Phase 2-A: 介護保険の時間帯判定（深夜：22:00-6:00）
 */
function evaluateCareLateNightTime(context: BonusCalculationContext): ConditionEvaluationResult {
  if (!context.visitStartTime) {
    return { passed: false, reason: "訪問開始時刻が未設定" };
  }

  const startTime = new Date(context.visitStartTime);
  const hours = startTime.getHours();
  const passed = hours >= 22 || hours < 6;

  return {
    passed,
    reason: passed
      ? `深夜時間帯（22:00-6:00）の訪問（開始時刻: ${hours}:${startTime.getMinutes().toString().padStart(2, '0')}）`
      : `深夜時間帯外（開始時刻: ${hours}:${startTime.getMinutes().toString().padStart(2, '0')}）`,
  };
}

/**
 * Phase 2-A: 介護保険の訪問時間長判定（90分以上）
 */
function evaluateCareVisitDuration90Plus(context: BonusCalculationContext): ConditionEvaluationResult {
  if (!context.visitStartTime || !context.visitEndTime) {
    return { passed: false, reason: "訪問開始時刻または終了時刻が未設定" };
  }

  const startTime = new Date(context.visitStartTime);
  const endTime = new Date(context.visitEndTime);
  const durationMinutes = Math.floor((endTime.getTime() - startTime.getTime()) / (1000 * 60));
  const passed = durationMinutes >= 90;

  return {
    passed,
    reason: passed
      ? `訪問時間90分以上（${durationMinutes}分）`
      : `訪問時間90分未満（${durationMinutes}分）`,
  };
}

// ========== Pattern Evaluators ==========

/**
 * 月14日目までと以降で変動パターン
 * 例: 緊急訪問看護加算 (月14日目まで2650点、以降2000点)
 * 注: 月の緊急訪問回数でカウントする（全訪問回数ではない）
 */
export async function evaluateMonthly14DayThreshold(
  pointsConfig: any,
  context: BonusCalculationContext
): Promise<PatternEvaluationResult> {
  // 当月の緊急訪問回数を取得
  const visitDate = context.visitDate;
  const monthStart = new Date(visitDate.getFullYear(), visitDate.getMonth(), 1);
  const monthEnd = new Date(visitDate.getFullYear(), visitDate.getMonth() + 1, 0, 23, 59, 59);

  const monthlyEmergencyVisits = await db
    .select()
    .from(nursingRecords)
    .where(
      and(
        eq(nursingRecords.patientId, context.patientId),
        gte(nursingRecords.visitDate, monthStart.toISOString().split('T')[0]),
        lte(nursingRecords.visitDate, monthEnd.toISOString().split('T')[0]),
        // 緊急訪問のみをカウント（emergency_visit_reasonが空でない記録）
        isNotNull(nursingRecords.emergencyVisitReason),
        ne(nursingRecords.emergencyVisitReason, '')
      )
    );

  const emergencyVisitCount = monthlyEmergencyVisits.length;
  const upTo14 = emergencyVisitCount <= 14;

  const points = upTo14 ? pointsConfig.up_to_14 : pointsConfig.after_14;

  return {
    points,
    matchedCondition: upTo14 ? "up_to_14_days" : "after_14_days",
    metadata: { emergencyVisitCount, monthStart, monthEnd },
  };
}

/**
 * 同一建物入居者数パターン
 * 例: 同一建物1-2人 4500点、3人以上 4000点
 */
export async function evaluateBuildingOccupancy(
  pointsConfig: any,
  context: BonusCalculationContext
): Promise<PatternEvaluationResult> {
  if (!context.buildingId) {
    throw new Error("Building ID required for building_occupancy pattern");
  }

  // 同一建物の同日訪問患者数を取得
  const visitDate = context.visitDate.toISOString().split('T')[0];

  const sameBuildingVisits = await db
    .select()
    .from(nursingRecords)
    .innerJoin(patients, eq(nursingRecords.patientId, patients.id))
    .where(
      and(
        eq(patients.buildingId, context.buildingId),
        eq(nursingRecords.visitDate, visitDate),
        eq(nursingRecords.facilityId, context.facilityId)
      )
    );

  const occupancy = sameBuildingVisits.length;
  const isLowOccupancy = occupancy <= 2;

  const points = isLowOccupancy ? pointsConfig.occupancy_1_2 : pointsConfig.occupancy_3_plus;

  return {
    points,
    matchedCondition: isLowOccupancy ? "occupancy_1_2" : "occupancy_3_plus",
    metadata: { occupancy, buildingId: context.buildingId },
  };
}

/**
 * 時間帯別パターン
 * 例: 夜間(18:00-22:00) 210点、深夜(22:00-6:00) 420点
 */
export function evaluateTimeBased(
  pointsConfig: any,
  context: BonusCalculationContext
): PatternEvaluationResult {
  if (!context.visitStartTime) {
    throw new Error("Visit start time required for time_based pattern");
  }

  // UTC時刻をJST（日本標準時）に変換して時刻を取得
  // データベースにはUTCで保存されているが、時間帯判定は日本時間で行う
  const jstDate = new Date(context.visitStartTime.getTime() + 9 * 60 * 60 * 1000);
  const hour = jstDate.getUTCHours();

  // 深夜 (22:00-6:00)
  if (hour >= 22 || hour < 6) {
    return {
      points: pointsConfig.late_night || 0,
      matchedCondition: "late_night",
      metadata: { hour },
    };
  }

  // 夜間 (18:00-22:00)
  if (hour >= 18 && hour < 22) {
    return {
      points: pointsConfig.night || 0,
      matchedCondition: "night",
      metadata: { hour },
    };
  }

  // 早朝 (6:00-8:00)
  if (hour >= 6 && hour < 8) {
    return {
      points: pointsConfig.early_morning || 0,
      matchedCondition: "early_morning",
      metadata: { hour },
    };
  }

  // 日中
  return {
    points: pointsConfig.daytime || 0,
    matchedCondition: "daytime",
    metadata: { hour },
  };
}

/**
 * 訪問時間長パターン
 * 例: 90分以上 5200点、90分未満 0点
 *
 * 新形式（conditions配列）と旧形式（duration_90キー）の両方に対応
 */
export function evaluateDurationBased(
  pointsConfig: any,
  context: BonusCalculationContext
): PatternEvaluationResult {
  if (!context.visitStartTime || !context.visitEndTime) {
    throw new Error("Visit start/end time required for duration_based pattern");
  }

  const durationMs = context.visitEndTime.getTime() - context.visitStartTime.getTime();
  const durationMinutes = Math.floor(durationMs / 60000);

  // 新形式: conditions配列を使用
  if (pointsConfig.conditions && Array.isArray(pointsConfig.conditions)) {
    // 条件を降順にソート（長い時間から評価）
    const sortedConditions = [...pointsConfig.conditions].sort(
      (a, b) => (b.durationMinutes || 0) - (a.durationMinutes || 0)
    );

    for (const condition of sortedConditions) {
      const threshold = condition.durationMinutes || 0;
      const operator = condition.operator || "greater_than_or_equal";

      let matched = false;
      if (operator === "greater_than") {
        matched = durationMinutes > threshold;
      } else if (operator === "greater_than_or_equal") {
        matched = durationMinutes >= threshold;
      }

      if (matched) {
        return {
          points: condition.points,
          matchedCondition: condition.description || `duration_${threshold}`,
          metadata: { durationMinutes, threshold, operator },
        };
      }
    }

    // どの条件にもマッチしない場合はdefaultPointsを返す
    return {
      points: pointsConfig.defaultPoints || 0,
      matchedCondition: "below_threshold",
      metadata: { durationMinutes },
    };
  }

  // 旧形式: duration_90のようなキーを使用
  const thresholds = Object.keys(pointsConfig)
    .filter(key => key.startsWith('duration_'))
    .map(key => ({
      minutes: parseInt(key.replace('duration_', '')),
      points: pointsConfig[key],
      key,
    }))
    .sort((a, b) => b.minutes - a.minutes); // 降順ソート

  // マッチする閾値を探す
  for (const threshold of thresholds) {
    if (durationMinutes >= threshold.minutes) {
      return {
        points: threshold.points,
        matchedCondition: threshold.key,
        metadata: { durationMinutes },
      };
    }
  }

  return {
    points: 0,
    matchedCondition: "below_threshold",
    metadata: { durationMinutes },
  };
}

/**
 * 年齢区分パターン
 * 例: 6歳未満 800点、6歳以上 0点
 */
export function evaluateAgeBased(
  pointsConfig: any,
  context: BonusCalculationContext
): PatternEvaluationResult {
  if (context.patientAge === undefined) {
    throw new Error("Patient age required for age_based pattern");
  }

  const age = context.patientAge;

  // 設定から年齢区分を取得
  const ageRanges = Object.keys(pointsConfig)
    .filter(key => key.startsWith('age_'))
    .map(key => {
      const match = key.match(/age_(\d+)(?:_(\d+))?/);
      if (!match) return null;
      return {
        min: parseInt(match[1]),
        max: match[2] ? parseInt(match[2]) : Infinity,
        points: pointsConfig[key],
        key,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a!.min - b!.min);

  // マッチする年齢区分を探す
  for (const range of ageRanges) {
    if (!range) continue;
    if (age >= range.min && age < range.max) {
      return {
        points: range.points,
        matchedCondition: range.key,
        metadata: { patientAge: age },
      };
    }
  }

  return {
    points: 0,
    matchedCondition: "no_match",
    metadata: { patientAge: age },
  };
}

/**
 * 訪問回数パターン
 * 例: 1日2回目 4500点、1日3回目以降 8000点
 */
export function evaluateVisitCount(
  pointsConfig: any,
  context: BonusCalculationContext
): PatternEvaluationResult {
  // visitCountはcontextに含まれていることを想定（事前に計算）
  const visitCount = context.dailyVisitCount || 1;

  // 設定から訪問回数区分を取得
  if (visitCount === 1) {
    return {
      points: pointsConfig.visit_1 || 0,
      matchedCondition: "visit_1",
      metadata: { visitCount },
    };
  } else if (visitCount === 2) {
    return {
      points: pointsConfig.visit_2 || 0,
      matchedCondition: "visit_2",
      metadata: { visitCount },
    };
  } else {
    return {
      points: pointsConfig.visit_3_plus || 0,
      matchedCondition: "visit_3_plus",
      metadata: { visitCount },
    };
  }
}

/**
 * パターン評価のディスパッチャー
 */
export async function evaluateConditionalPattern(
  pattern: string,
  pointsConfig: any,
  context: BonusCalculationContext
): Promise<PatternEvaluationResult> {
  switch (pattern) {
    case "monthly_14day_threshold":
      return await evaluateMonthly14DayThreshold(pointsConfig, context);

    case "building_occupancy":
      return await evaluateBuildingOccupancy(pointsConfig, context);

    case "time_based":
      return evaluateTimeBased(pointsConfig, context);

    case "duration_based":
      return evaluateDurationBased(pointsConfig, context);

    case "age_based":
      return evaluateAgeBased(pointsConfig, context);

    case "visit_count":
      return evaluateVisitCount(pointsConfig, context);

    default:
      throw new Error(`Unknown conditional pattern: ${pattern}`);
  }
}

// ========== Version Selection ==========

/**
 * 訪問日に基づいて適切なバージョンの加算マスタを取得
 */
export async function getApplicableBonusMasters(
  visitDate: Date,
  facilityId: string,
  insuranceType: "medical" | "care"
): Promise<BonusMaster[]> {
  const visitDateStr = visitDate.toISOString().split('T')[0];

  const bonuses = await db
    .select()
    .from(bonusMaster)
    .where(
      and(
        // 施設IDマッチ（null = グローバル）
        or(
          eq(bonusMaster.facilityId, facilityId),
          isNull(bonusMaster.facilityId)
        ),
        // 保険種別マッチ
        eq(bonusMaster.insuranceType, insuranceType),
        // 有効期間チェック
        lte(bonusMaster.validFrom, visitDateStr),
        or(
          isNull(bonusMaster.validTo),
          gte(bonusMaster.validTo, visitDateStr)
        ),
        // アクティブな加算のみ
        eq(bonusMaster.isActive, true)
      )
    );

  return bonuses;
}

// ========== Combination Control ==========

/**
 * 併算定チェック
 */
export function checkCombination(
  bonusCode: string,
  bonusMaster: BonusMaster,
  appliedBonuses: string[]
): { allowed: boolean; reason?: string } {
  // canCombineWith が設定されている場合、そのリストにある加算とのみ併算定可能
  if (bonusMaster.canCombineWith && bonusMaster.canCombineWith.length > 0) {
    const hasNonCombinableBonus = appliedBonuses.some(
      code => !bonusMaster.canCombineWith!.includes(code)
    );

    if (hasNonCombinableBonus) {
      return {
        allowed: false,
        reason: `${bonusCode} can only be combined with: ${bonusMaster.canCombineWith.join(', ')}`,
      };
    }
  }

  // cannotCombineWith が設定されている場合、そのリストの加算とは併算定不可
  if (bonusMaster.cannotCombineWith && bonusMaster.cannotCombineWith.length > 0) {
    const hasConflictingBonus = appliedBonuses.some(
      code => bonusMaster.cannotCombineWith!.includes(code)
    );

    if (hasConflictingBonus) {
      return {
        allowed: false,
        reason: `${bonusCode} cannot be combined with: ${bonusMaster.cannotCombineWith.join(', ')}`,
      };
    }
  }

  return { allowed: true };
}

// ========== Main Calculation Engine ==========

/**
 * メイン加算計算エンジン
 */
export async function calculateBonuses(
  context: BonusCalculationContext
): Promise<BonusCalculationResult[]> {
  const results: BonusCalculationResult[] = [];
  const appliedBonusCodes: string[] = [];

  // 1. 適用可能な加算マスタを取得
  const applicableBonuses = await getApplicableBonusMasters(
    context.visitDate,
    context.facilityId,
    context.insuranceType
  );

  // 1.5. Phase2-1: display_orderの昇順にソート（小さい方が優先）
  // display_orderで評価順序を制御する（固定点数ではなく）
  applicableBonuses.sort((a, b) => {
    const orderA = a.displayOrder || 999;
    const orderB = b.displayOrder || 999;
    return orderA - orderB; // 昇順
  });

  // Phase 4: 2フェーズ評価方式
  // 第1フェーズ: 他の加算に依存しない加算を評価
  // 第2フェーズ: 他の加算の算定結果に依存する加算を評価（例: 特別管理指導加算）

  const phase1Bonuses = applicableBonuses.filter(
    bonus => bonus.bonusCode !== 'discharge_special_management_guidance'
  );

  const phase2Bonuses = applicableBonuses.filter(
    bonus => bonus.bonusCode === 'discharge_special_management_guidance'
  );

  // 2. Phase 1: 通常の加算を評価
  for (const bonus of phase1Bonuses) {
    try {
      // 2.1 併算定チェック
      const combinationCheck = checkCombination(bonus.bonusCode, bonus, appliedBonusCodes);
      if (!combinationCheck.allowed) {
        console.log(`Skipping ${bonus.bonusCode}: ${combinationCheck.reason}`);
        continue;
      }

      // 2.2 事前定義条件のチェック
      const conditionsPassed: string[] = [];
      if (bonus.predefinedConditions) {
        const conditions = Array.isArray(bonus.predefinedConditions)
          ? bonus.predefinedConditions
          : [bonus.predefinedConditions];

        let allConditionsPassed = true;
        for (const condition of conditions) {
          const result = evaluatePredefinedCondition(condition, context);
          if (result.passed) {
            conditionsPassed.push(result.reason || "condition passed");
          } else {
            allConditionsPassed = false;
            break;
          }
        }

        if (!allConditionsPassed) {
          continue; // 条件を満たさない場合はスキップ
        }
      }

      // 2.3 点数計算
      let calculatedPoints = 0;
      let matchedCondition = "";
      let patternMetadata = {};

      if (bonus.pointsType === "fixed") {
        // 固定点数
        calculatedPoints = bonus.fixedPoints || 0;
        matchedCondition = "fixed_points";
      } else if (bonus.pointsType === "conditional" && bonus.conditionalPattern && bonus.pointsConfig) {
        // 条件分岐パターン
        const patternResult = await evaluateConditionalPattern(
          bonus.conditionalPattern,
          bonus.pointsConfig,
          context
        );
        calculatedPoints = patternResult.points;
        matchedCondition = patternResult.matchedCondition;
        patternMetadata = patternResult.metadata || {};
      }

      // 2.4 結果を記録
      if (calculatedPoints > 0) {
        results.push({
          bonusCode: bonus.bonusCode,
          bonusName: bonus.bonusName,
          bonusMasterId: bonus.id,
          calculatedPoints,
          appliedVersion: bonus.version,
          conditionsPassed,
          calculationDetails: {
            bonusCode: bonus.bonusCode,
            bonusName: bonus.bonusName,
            pointsType: bonus.pointsType,
            conditionalPattern: bonus.conditionalPattern,
            matchedCondition,
            points: calculatedPoints,
            conditionsPassed,
            patternMetadata,
            timestamp: new Date().toISOString(),
          },
        });

        appliedBonusCodes.push(bonus.bonusCode);
      }
    } catch (error) {
      console.error(`Error calculating bonus ${bonus.bonusCode}:`, error);
    }
  }

  // 3. Phase 2: 他の加算に依存する加算を評価
  for (const bonus of phase2Bonuses) {
    try {
      // 2.1 併算定チェック
      const combinationCheck = checkCombination(bonus.bonusCode, bonus, appliedBonusCodes);
      if (!combinationCheck.allowed) {
        console.log(`Skipping ${bonus.bonusCode}: ${combinationCheck.reason}`);
        continue;
      }

      // 2.2 事前定義条件のチェック (appliedBonusCodesを利用)
      const conditionsPassed: string[] = [];
      if (bonus.predefinedConditions) {
        const conditions = Array.isArray(bonus.predefinedConditions)
          ? bonus.predefinedConditions
          : [bonus.predefinedConditions];

        let allConditionsPassed = true;
        for (const condition of conditions) {
          let result: ConditionEvaluationResult;

          // has_discharge_joint_guidance_in_same_record は特別処理
          if (condition.pattern === 'has_discharge_joint_guidance_in_same_record') {
            result = evaluateHasDischargeJointGuidanceInSameRecord(context, appliedBonusCodes);
          } else {
            result = evaluatePredefinedCondition(condition, context);
          }

          if (result.passed) {
            conditionsPassed.push(result.reason || "condition passed");
          } else {
            allConditionsPassed = false;
            break;
          }
        }

        if (!allConditionsPassed) {
          continue; // 条件を満たさない場合はスキップ
        }
      }

      // 2.3 点数計算
      let calculatedPoints = 0;
      let matchedCondition = "";
      let patternMetadata = {};

      if (bonus.pointsType === "fixed") {
        // 固定点数
        calculatedPoints = bonus.fixedPoints || 0;
        matchedCondition = "fixed_points";
      } else if (bonus.pointsType === "conditional" && bonus.conditionalPattern && bonus.pointsConfig) {
        // 条件分岐パターン
        const patternResult = await evaluateConditionalPattern(
          bonus.conditionalPattern,
          bonus.pointsConfig,
          context
        );
        calculatedPoints = patternResult.points;
        matchedCondition = patternResult.matchedCondition;
        patternMetadata = patternResult.metadata || {};
      }

      // 2.4 結果を記録
      if (calculatedPoints > 0) {
        results.push({
          bonusCode: bonus.bonusCode,
          bonusName: bonus.bonusName,
          bonusMasterId: bonus.id,
          calculatedPoints,
          appliedVersion: bonus.version,
          conditionsPassed,
          calculationDetails: {
            bonusCode: bonus.bonusCode,
            bonusName: bonus.bonusName,
            pointsType: bonus.pointsType,
            conditionalPattern: bonus.conditionalPattern,
            matchedCondition,
            points: calculatedPoints,
            conditionsPassed,
            patternMetadata,
            timestamp: new Date().toISOString(),
          },
        });

        appliedBonusCodes.push(bonus.bonusCode);
      }
    } catch (error) {
      console.error(`[Phase 2] Error calculating bonus ${bonus.bonusCode}:`, error);
    }
  }

  return results;
}

/**
 * 加算計算結果をデータベースに保存
 */
export async function saveBonusCalculationHistory(
  nursingRecordId: string,
  results: BonusCalculationResult[],
  userId?: string
): Promise<void> {
  for (const result of results) {
    const historyRecord: InsertBonusCalculationHistory = {
      nursingRecordId,
      bonusMasterId: result.bonusMasterId,
      calculatedPoints: result.calculatedPoints,
      appliedVersion: result.appliedVersion,
      calculationDetails: result.calculationDetails,
      isManuallyAdjusted: false,
    };

    await db.insert(bonusCalculationHistory).values(historyRecord);
  }
}
