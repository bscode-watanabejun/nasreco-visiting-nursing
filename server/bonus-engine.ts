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
  nursingServiceCodes,
  facilities,
  users,
  specialManagementDefinitions,
  BonusMaster,
  InsertBonusCalculationHistory,
} from "@shared/schema";
import { eq, and, lte, or, isNull, gte, isNotNull, ne, like, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";

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
  deathPlaceCode?: string | null; // 死亡場所コード（別表16）: '01'(自宅), '16'(施設)等
  specialManagementTypes?: string[] | null; // 特別管理項目（配列）

  // Week 3: 専門管理加算用コンテキスト
  specialistCareType?: string | null; // 専門的ケアの種類
  assignedNurse?: {
    id: string;
    fullName: string;
    specialistCertifications?: string[] | null; // 専門資格配列
  };

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

    case "daily_visit_count_gte":
      result = evaluateDailyVisitCountGte(condition.value, context);
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

    case "terminal_care_requirement":
      // ターミナルケア要件は非同期評価が必要なので、ここでは評価しない
      // evaluateCondition関数の呼び出し元で個別に処理
      result = { passed: false, reason: "terminal_care_requirementは非同期評価が必要" };
      return result;

    case "patient_has_special_management":
      result = evaluatePatientHasSpecialManagement(context);
      break;

    // Week 3: 専門管理加算条件
    case "requires_specialized_nurse":
      result = evaluateRequiresSpecializedNurse(context);
      break;

    case "specialties_match":
      if (!condition.value || !Array.isArray(condition.value)) {
        result = { passed: false, reason: "専門分野リストが未設定" };
      } else {
        result = evaluateSpecialtiesMatch(condition.value, context);
      }
      // specialties_matchは独自の評価を持つので、後続のoperatorチェックをスキップ
      return result;

    case "monthly_visit_limit":
      // monthly_visit_limitは非同期関数なので、ここでは呼び出さない
      // calculateBonuses内で専用の処理を実装する必要がある
      // 暫定的にtrueを返す（後でcalculateBonuses内で再チェック）
      result = { passed: true, reason: "月次訪問制限チェックは後続処理で実施" };
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

    // Phase 2-A: 医療保険の時間帯条件
    case "medical_early_morning_time":
      result = evaluateMedicalEarlyMorningTime(context);
      break;

    case "medical_night_time":
      result = evaluateMedicalNightTime(context);
      break;

    case "medical_late_night_time":
      result = evaluateMedicalLateNightTime(context);
      break;

    case "care_visit_duration_90plus":
      result = evaluateCareVisitDuration90Plus(context);
      break;

    case "time_based":
      // time_basedパターンの場合、evaluateTimeBased関数を使用して評価
      // ただし、この関数はpointsConfigが必要なので、conditionから取得できない場合は評価できない
      // 実際の評価はconditionalPatternとして行われるため、ここでは常にtrueを返す
      // （conditionalPatternで評価される）
      if (!context.visitStartTime) {
        return { passed: false, reason: "訪問開始時刻が未設定" };
      }
      // time_basedパターンはconditionalPatternとして評価されるため、ここでは常にtrueを返す
      // 実際の時間帯判定はevaluateTimeBased関数で行われる
      return { passed: true, reason: "時間帯別パターン（conditionalPatternで評価）" };

    default:
      return { passed: false, reason: `Unknown condition type: ${type}` };
  }

  // Phase 2-A: operator と value のチェック
  // 条件に value フィールドがある場合、結果の passed 値と比較
  // field_equalsパターンの場合は、evaluateFieldEqualsが既に値の比較を行っているためスキップ
  if (type !== "field_equals" && condition.operator === "equals" && condition.value !== undefined) {
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

function evaluateDailyVisitCountGte(minCount: number, context: BonusCalculationContext): ConditionEvaluationResult {
  const visitCount = context.dailyVisitCount || 1;
  const passed = visitCount >= minCount;
  return {
    passed,
    reason: passed
      ? `1日の訪問回数 ${visitCount}回 >= ${minCount}回`
      : `1日の訪問回数 ${visitCount}回 < ${minCount}回`,
    metadata: { visitCount, minCount },
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
 * ターミナルケア要件の評価（非同期）
 *
 * 死亡日及び死亡日前14日以内にターミナルケア訪問が規定回数以上あるかチェック
 *
 * @param context - 計算コンテキスト
 * @param bonusCode - 加算コード（medical or care で判定回数が異なる）
 * @returns 評価結果
 */
async function evaluateTerminalCareRequirement(
  context: BonusCalculationContext,
  bonusCode: string
): Promise<ConditionEvaluationResult> {
  // 1. 患者の死亡日チェック
  if (!context.deathDate) {
    return {
      passed: false,
      reason: "患者の死亡日が設定されていない",
    };
  }

  // 2. 現在の訪問が死亡日かチェック
  const visitDate = new Date(context.visitDate);
  const deathDate = new Date(context.deathDate);

  if (visitDate.toDateString() !== deathDate.toDateString()) {
    return {
      passed: false,
      reason: "ターミナルケア加算は死亡日の訪問にのみ算定可能",
    };
  }

  // 3. 死亡場所の確認（加算種別による）
  const deathPlaceCode = context.deathPlaceCode;

  if (bonusCode === 'terminal_care_1') {
    // 医療保険1: 在宅または特養等
    if (!deathPlaceCode || !['01', '16'].includes(deathPlaceCode)) {
      return {
        passed: false,
        reason: "death_place_codeが未設定または不正な値（'01'または'16'が必要）",
      };
    }
  } else if (bonusCode === 'terminal_care_2') {
    // 医療保険2: 特養等のみ
    if (deathPlaceCode !== '16') {
      return {
        passed: false,
        reason: "特養等での死亡が必要（death_place_code='16'）",
      };
    }
  } else if (bonusCode === 'care_terminal_care') {
    // 介護保険: 在宅のみ
    if (deathPlaceCode !== '01') {
      return {
        passed: false,
        reason: "在宅での死亡が必要（death_place_code='01'）",
      };
    }
  }

  // 4. 死亡日前14日間の開始日を計算
  const startDate = new Date(deathDate);
  startDate.setDate(startDate.getDate() - 14);

  // 5. 該当期間内のターミナルケア訪問記録を取得
  const terminalCareVisits = await db
    .select()
    .from(nursingRecords)
    .where(
      and(
        eq(nursingRecords.patientId, context.patientId),
        eq(nursingRecords.isTerminalCare, true),
        gte(nursingRecords.visitDate, startDate.toISOString().split('T')[0]),
        lte(nursingRecords.visitDate, deathDate.toISOString().split('T')[0])
      )
    );

  // 6. 訪問回数のチェック
  const visitCount = terminalCareVisits.length;
  const requiredVisits = context.insuranceType === 'care' ? 2 : 2; // 介護保険: 2日以上、医療保険: 2回以上

  if (visitCount < requiredVisits) {
    return {
      passed: false,
      reason: `死亡日前14日以内のターミナルケア訪問が不足（${visitCount}回/${requiredVisits}回必要）`,
    };
  }

  return {
    passed: true,
    reason: `ターミナルケア要件を満たす（${visitCount}回のターミナルケア訪問）`,
    metadata: {
      visitCount,
      requiredVisits,
      period: `${startDate.toISOString().split('T')[0]} 〜 ${deathDate.toISOString().split('T')[0]}`,
    },
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
 * Phase 4: 特別管理項目のinsuranceTypeに基づいて適切な加算コードを判定
 * 
 * @param context 計算コンテキスト
 * @returns 適用すべき加算コード ('special_management_1' | 'special_management_2' | null)
 */
async function evaluateSpecialManagementBonusType(
  context: BonusCalculationContext
): Promise<'special_management_1' | 'special_management_2' | null> {
  const specialManagementTypes = context.specialManagementTypes || [];
  
  if (specialManagementTypes.length === 0) {
    return null;
  }

  // 患者の特別管理項目のカテゴリから、対応する特別管理定義を取得
  const definitions = await db.query.specialManagementDefinitions.findMany({
    where: and(
      inArray(specialManagementDefinitions.category, specialManagementTypes),
      eq(specialManagementDefinitions.isActive, true),
      or(
        eq(specialManagementDefinitions.facilityId, context.facilityId),
        isNull(specialManagementDefinitions.facilityId)
      )
    ),
  });

  if (definitions.length === 0) {
    // 定義が見つからない場合は、デフォルトでspecial_management_2を返す
    return 'special_management_2';
  }

  // 保険種別に応じた適切な加算コードを判定
  if (context.insuranceType === 'medical') {
    // 医療保険の場合: medical_5000があればspecial_management_1、なければspecial_management_2
    const hasMedical5000 = definitions.some(def => def.insuranceType === 'medical_5000');
    return hasMedical5000 ? 'special_management_1' : 'special_management_2';
  } else if (context.insuranceType === 'care') {
    // 介護保険の場合: care_500があればspecial_management_1、なければspecial_management_2
    const hasCare500 = definitions.some(def => def.insuranceType === 'care_500');
    return hasCare500 ? 'special_management_1' : 'special_management_2';
  }

  return null;
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
 * Week 3: 専門研修を受けた看護師が訪問しているかチェック
 */
function evaluateRequiresSpecializedNurse(context: BonusCalculationContext): ConditionEvaluationResult {
  const nurse = context.assignedNurse;
  if (!nurse) {
    return {
      passed: false,
      reason: "看護師情報が未設定",
    };
  }

  const certifications = nurse.specialistCertifications || [];
  if (certifications.length > 0) {
    return {
      passed: true,
      reason: `専門資格保有: ${certifications.join(', ')}`,
    };
  }

  return {
    passed: false,
    reason: "専門研修未受講",
  };
}

/**
 * Week 3: 専門分野のケアが実施されているかチェック
 */
function evaluateSpecialtiesMatch(
  specialties: string[],
  context: BonusCalculationContext
): ConditionEvaluationResult {
  const careType = context.specialistCareType;
  if (!careType) {
    return {
      passed: false,
      reason: "専門的ケアの記録がない",
    };
  }

  const nurse = context.assignedNurse;
  if (!nurse) {
    return {
      passed: false,
      reason: "看護師情報が未設定",
    };
  }

  const nurseSpecialties = nurse.specialistCertifications || [];
  if (nurseSpecialties.length === 0) {
    return {
      passed: false,
      reason: "看護師に専門資格がない",
    };
  }

  // 専門分野名とcareTypeのマッピング
  const specialtyMapping: Record<string, string> = {
    '緩和ケア': 'palliative_care',
    '褥瘡ケア': 'pressure_ulcer',
    '人工肛門・人工膀胱ケア': 'stoma_care',
    '特定行為研修': 'specific_procedures',
  };

  // 看護師の資格と実施したケアが一致するかチェック
  for (const specialty of specialties) {
    const mappedCareType = specialtyMapping[specialty];
    if (mappedCareType === careType && nurseSpecialties.includes(specialty)) {
      return {
        passed: true,
        reason: `専門分野一致: ${specialty}`,
      };
    }
  }

  return {
    passed: false,
    reason: `専門分野不一致（ケア: ${careType}, 資格: ${nurseSpecialties.join(', ')}）`,
  };
}

/**
 * Week 3: 月次訪問回数制限のチェック
 * 注: この評価関数は非同期処理が必要なため、calculateBonuses() 内で特別に処理される
 */
async function evaluateMonthlyVisitLimit(
  bonusCode: string,
  monthlyLimit: number,
  context: BonusCalculationContext
): Promise<ConditionEvaluationResult> {
  try {
    const visitDate = new Date(context.visitDate);
    const thisMonthStart = new Date(visitDate.getFullYear(), visitDate.getMonth(), 1);
    const thisMonthEnd = new Date(visitDate.getFullYear(), visitDate.getMonth() + 1, 0, 23, 59, 59);

    // 今月のこの加算の算定回数を取得（bonusCalculationHistoryとnursingRecordsをJOIN）
    // 現在の訪問記録に紐づく既存の加算履歴も除外（更新時に古い履歴がカウントされないようにする）
    const whereConditions = [
      eq(nursingRecords.patientId, context.patientId),
      eq(bonusMaster.bonusCode, bonusCode),
      gte(nursingRecords.visitDate, thisMonthStart.toISOString().split('T')[0]),
      lte(nursingRecords.visitDate, thisMonthEnd.toISOString().split('T')[0]),
      // ステータスが「完了」または「確認済み」のみを対象
      inArray(nursingRecords.status, ['completed', 'reviewed']),
      // 削除フラグが設定されていない（削除されていない）記録のみを対象
      isNull(nursingRecords.deletedAt),
    ];

    // 現在の訪問記録が指定されている場合、その記録に紐づく加算履歴を除外
    // これにより、訪問記録更新時に古い加算履歴が月次制限チェックに含まれないようになる
    if (context.nursingRecordId && context.nursingRecordId !== "") {
      whereConditions.push(ne(bonusCalculationHistory.nursingRecordId, context.nursingRecordId));
    }

    const existingRecords = await db
      .select({
        id: bonusCalculationHistory.id,
        bonusMasterId: bonusCalculationHistory.bonusMasterId,
        calculationDetails: bonusCalculationHistory.calculationDetails,
      })
      .from(bonusCalculationHistory)
      .innerJoin(nursingRecords, eq(bonusCalculationHistory.nursingRecordId, nursingRecords.id))
      .innerJoin(bonusMaster, eq(bonusCalculationHistory.bonusMasterId, bonusMaster.id))
      .where(and(...whereConditions));

    const currentCount = existingRecords.length;

    if (currentCount >= monthlyLimit) {
      return {
        passed: false,
        reason: `月${monthlyLimit}回まで（既に${currentCount}回算定済み）`,
      };
    }

    return {
      passed: true,
      reason: `月${monthlyLimit}回以内（${currentCount}/${monthlyLimit}回）`,
    };
  } catch (error) {
    console.error('[evaluateMonthlyVisitLimit] エラー:', error);
    return {
      passed: false,
      reason: "月次制限の確認中にエラーが発生",
    };
  }
}

/**
 * Phase 2-A: 介護保険の時間帯判定（早朝：6:00-8:00）
 */
function evaluateCareEarlyMorningTime(context: BonusCalculationContext): ConditionEvaluationResult {
  if (!context.visitStartTime) {
    return { passed: false, reason: "訪問開始時刻が未設定" };
  }

  // UTC時刻をJST（日本標準時）に変換して時刻を取得
  const jstDate = new Date(context.visitStartTime.getTime() + 9 * 60 * 60 * 1000);
  const hours = jstDate.getUTCHours();
  const minutes = jstDate.getUTCMinutes();
  const passed = hours >= 6 && hours < 8;

  return {
    passed,
    reason: passed
      ? `早朝時間帯（6:00-8:00）の訪問（開始時刻: ${hours}:${minutes.toString().padStart(2, '0')}）`
      : `早朝時間帯外（開始時刻: ${hours}:${minutes.toString().padStart(2, '0')}）`,
  };
}

/**
 * Phase 2-A: 介護保険の時間帯判定（夜間：18:00-22:00）
 */
function evaluateCareNightTime(context: BonusCalculationContext): ConditionEvaluationResult {
  if (!context.visitStartTime) {
    return { passed: false, reason: "訪問開始時刻が未設定" };
  }

  // UTC時刻をJST（日本標準時）に変換して時刻を取得
  const jstDate = new Date(context.visitStartTime.getTime() + 9 * 60 * 60 * 1000);
  const hours = jstDate.getUTCHours();
  const minutes = jstDate.getUTCMinutes();
  const passed = hours >= 18 && hours < 22;

  return {
    passed,
    reason: passed
      ? `夜間時間帯（18:00-22:00）の訪問（開始時刻: ${hours}:${minutes.toString().padStart(2, '0')}）`
      : `夜間時間帯外（開始時刻: ${hours}:${minutes.toString().padStart(2, '0')}）`,
  };
}

/**
 * Phase 2-A: 医療保険の時間帯判定（早朝：6:00-8:00）
 */
function evaluateMedicalEarlyMorningTime(context: BonusCalculationContext): ConditionEvaluationResult {
  if (!context.visitStartTime) {
    return { passed: false, reason: "訪問開始時刻が未設定" };
  }

  // UTC時刻をJST（日本標準時）に変換して時刻を取得
  const jstDate = new Date(context.visitStartTime.getTime() + 9 * 60 * 60 * 1000);
  const hours = jstDate.getUTCHours();
  const minutes = jstDate.getUTCMinutes();
  const passed = hours >= 6 && hours < 8;

  return {
    passed,
    reason: passed
      ? `早朝時間帯（6:00-8:00）の訪問（開始時刻: ${hours}:${minutes.toString().padStart(2, '0')}）`
      : `早朝時間帯外（開始時刻: ${hours}:${minutes.toString().padStart(2, '0')}）`,
  };
}

/**
 * Phase 2-A: 医療保険の時間帯判定（夜間：18:00-22:00）
 */
function evaluateMedicalNightTime(context: BonusCalculationContext): ConditionEvaluationResult {
  if (!context.visitStartTime) {
    return { passed: false, reason: "訪問開始時刻が未設定" };
  }

  // UTC時刻をJST（日本標準時）に変換して時刻を取得
  const jstDate = new Date(context.visitStartTime.getTime() + 9 * 60 * 60 * 1000);
  const hours = jstDate.getUTCHours();
  const minutes = jstDate.getUTCMinutes();
  const passed = hours >= 18 && hours < 22;

  return {
    passed,
    reason: passed
      ? `夜間時間帯（18:00-22:00）の訪問（開始時刻: ${hours}:${minutes.toString().padStart(2, '0')}）`
      : `夜間時間帯外（開始時刻: ${hours}:${minutes.toString().padStart(2, '0')}）`,
  };
}

/**
 * Phase 2-A: 医療保険の時間帯判定（深夜：22:00-6:00）
 */
function evaluateMedicalLateNightTime(context: BonusCalculationContext): ConditionEvaluationResult {
  if (!context.visitStartTime) {
    return { passed: false, reason: "訪問開始時刻が未設定" };
  }

  // UTC時刻をJST（日本標準時）に変換して時刻を取得
  const jstDate = new Date(context.visitStartTime.getTime() + 9 * 60 * 60 * 1000);
  const hours = jstDate.getUTCHours();
  const minutes = jstDate.getUTCMinutes();
  const passed = hours >= 22 || hours < 6;

  return {
    passed,
    reason: passed
      ? `深夜時間帯（22:00-6:00）の訪問（開始時刻: ${hours}:${minutes.toString().padStart(2, '0')}）`
      : `深夜時間帯外（開始時刻: ${hours}:${minutes.toString().padStart(2, '0')}）`,
  };
}

/**
 * Phase 2-A: 介護保険の時間帯判定（深夜：22:00-6:00）
 */
function evaluateCareLateNightTime(context: BonusCalculationContext): ConditionEvaluationResult {
  if (!context.visitStartTime) {
    return { passed: false, reason: "訪問開始時刻が未設定" };
  }

  // UTC時刻をJST（日本標準時）に変換して時刻を取得
  const jstDate = new Date(context.visitStartTime.getTime() + 9 * 60 * 60 * 1000);
  const hours = jstDate.getUTCHours();
  const minutes = jstDate.getUTCMinutes();
  const passed = hours >= 22 || hours < 6;

  return {
    passed,
    reason: passed
      ? `深夜時間帯（22:00-6:00）の訪問（開始時刻: ${hours}:${minutes.toString().padStart(2, '0')}）`
      : `深夜時間帯外（開始時刻: ${hours}:${minutes.toString().padStart(2, '0')}）`,
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
  // buildingIdが未設定の場合は、デフォルトで1-2人として扱う
  // （同一建物情報が未設定の場合は、最も一般的なケースとして1-2人を適用）
  if (!context.buildingId) {
    console.warn(`[evaluateBuildingOccupancy] Building ID not set for patient ${context.patientId}, defaulting to occupancy_1_2`);
    return {
      points: pointsConfig.occupancy_1_2 || 0,
      matchedCondition: "occupancy_1_2",
      metadata: { occupancy: 1, buildingId: null, note: "Building ID not set, defaulting to 1-2 occupancy" },
    };
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

  console.log('[calculateBonuses] Applicable bonuses count:', applicableBonuses.length);
  console.log('[calculateBonuses] Bonus codes:', applicableBonuses.map(b => b.bonusCode));
  console.log('[calculateBonuses] Insurance type:', context.insuranceType);

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

  // 特別管理加算の判定: 患者の特別管理項目のinsuranceTypeに基づいて適切な加算コードを決定
  const specialManagementBonusType = await evaluateSpecialManagementBonusType(context);
  
  const phase1Bonuses = applicableBonuses.filter(
    bonus => bonus.bonusCode !== 'discharge_special_management_guidance'
  );

  const phase2Bonuses = applicableBonuses.filter(
    bonus => bonus.bonusCode === 'discharge_special_management_guidance'
  );

  // 2. Phase 1: 通常の加算を評価
  for (const bonus of phase1Bonuses) {
    try {
      console.log(`[calculateBonuses] Evaluating bonus: ${bonus.bonusCode}`);

      // 2.0 特別管理加算の特別処理: 患者の特別管理項目に基づいて適切な加算コードのみを評価
      if (bonus.bonusCode === 'special_management_1' || bonus.bonusCode === 'special_management_2') {
        if (!specialManagementBonusType) {
          console.log(`Skipping ${bonus.bonusCode}: 特別管理項目が設定されていません`);
          continue;
        }
        if (bonus.bonusCode !== specialManagementBonusType) {
          console.log(`Skipping ${bonus.bonusCode}: 患者の特別管理項目に基づき、${specialManagementBonusType}が適用されます`);
          continue;
        }
      }

      // 2.1 併算定チェック
      const combinationCheck = checkCombination(bonus.bonusCode, bonus, appliedBonusCodes);
      if (!combinationCheck.allowed) {
        console.log(`Skipping ${bonus.bonusCode}: ${combinationCheck.reason}`);
        continue;
      }

      // 2.2 事前定義条件のチェック
      const conditionsPassed: string[] = [];
      if (bonus.predefinedConditions) {
        console.log(`[calculateBonuses] ${bonus.bonusCode} has predefined conditions, evaluating...`);
        const conditions = Array.isArray(bonus.predefinedConditions)
          ? bonus.predefinedConditions
          : [bonus.predefinedConditions];

        let allConditionsPassed = true;
        for (const condition of conditions) {
          console.log(`[calculateBonuses] Evaluating condition pattern: ${condition.pattern}`);

          // terminal_care_requirement パターンは非同期評価
          let result: ConditionEvaluationResult;
          if (condition.pattern === "terminal_care_requirement") {
            result = await evaluateTerminalCareRequirement(context, bonus.bonusCode);
          } else {
            result = evaluatePredefinedCondition(condition, context);
          }

          console.log(`[calculateBonuses] Condition result:`, { pattern: condition.pattern, passed: result.passed, reason: result.reason });
          if (result.passed) {
            conditionsPassed.push(result.reason || "condition passed");
          } else {
            allConditionsPassed = false;
            console.log(`[calculateBonuses] Condition failed, skipping ${bonus.bonusCode}`);
            break;
          }
        }

        if (!allConditionsPassed) {
          continue; // 条件を満たさない場合はスキップ
        }

        // Week 3: 月次制限チェック（専門管理加算用）
        const monthlyLimitCondition = conditions.find(
          (c: any) => c.pattern === "monthly_visit_limit"
        );

        if (monthlyLimitCondition && monthlyLimitCondition.value) {
          const limitCheckResult = await evaluateMonthlyVisitLimit(
            bonus.bonusCode,
            monthlyLimitCondition.value,
            context
          );

          if (!limitCheckResult.passed) {
            console.log(`Skipping ${bonus.bonusCode}: ${limitCheckResult.reason}`);
            continue; // 月次制限超過の場合はスキップ
          }
          conditionsPassed.push(limitCheckResult.reason || "月次制限内");
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

          // terminal_care_requirement パターンは非同期評価
          if (condition.pattern === "terminal_care_requirement") {
            result = await evaluateTerminalCareRequirement(context, bonus.bonusCode);
          }
          // has_discharge_joint_guidance_in_same_record は特別処理
          else if (condition.pattern === 'has_discharge_joint_guidance_in_same_record') {
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
 * 加算に対応するサービスコードを自動選択
 * Phase 1: 完全自動選択可能な加算のみ実装
 */
export async function selectServiceCodeForBonus(
  bonusCode: string,
  bonusMaster: BonusMaster,
  context: BonusCalculationContext
): Promise<string | null> {
  const visitDate = context.visitDate;
  const visitDateStr = visitDate.toISOString().split('T')[0];
  const insuranceType = context.insuranceType;

  try {
    // 保険種別と有効期間でフィルタ
    const baseConditions = [
      eq(nursingServiceCodes.insuranceType, insuranceType),
      eq(nursingServiceCodes.isActive, true),
      lte(nursingServiceCodes.validFrom, visitDateStr),
      or(
        isNull(nursingServiceCodes.validTo),
        gte(nursingServiceCodes.validTo, visitDateStr)
      ),
    ];

    // Phase 1: 完全自動選択可能な加算
    switch (bonusCode) {
      case 'medical_emergency_visit': {
        // 緊急訪問看護加算: 月14日目まで/以降で判定
        const dayOfMonth = visitDate.getDate();
        const serviceCode = dayOfMonth <= 14 ? '510002470' : '510004570';
        
        const codes = await db
          .select()
          .from(nursingServiceCodes)
          .where(and(...baseConditions, eq(nursingServiceCodes.serviceCode, serviceCode)));
        
        return codes.length > 0 ? codes[0].id : null;
      }

      case 'medical_night_early_morning':
      case 'medical_late_night': {
        // 時間帯別加算: 訪問開始時刻から判定
        if (!context.visitStartTime) return null;
        
        // UTC時刻をJST（日本標準時）に変換して時刻を取得
        const jstDate = new Date(context.visitStartTime.getTime() + 9 * 60 * 60 * 1000);
        const hour = jstDate.getUTCHours();
        let serviceCode: string;
        
        if (bonusCode === 'medical_late_night') {
          // 深夜（22:00-6:00）
          serviceCode = '510004070';
        } else {
          // 夜間・早朝（18:00-22:00 または 6:00-8:00）
          serviceCode = '510003970';
        }
        
        const codes = await db
          .select()
          .from(nursingServiceCodes)
          .where(and(...baseConditions, eq(nursingServiceCodes.serviceCode, serviceCode)));
        
        return codes.length > 0 ? codes[0].id : null;
      }

      case 'discharge_support_guidance_basic':
      case 'discharge_support_guidance_long': {
        // 退院支援加算: 退院日フラグと訪問時間から判定
        if (!context.isDischargeDate) return null;
        
        let serviceCode: string;
        if (bonusCode === 'discharge_support_guidance_long') {
          // 長時間（90分超）
          if (!context.visitStartTime || !context.visitEndTime) return null;
          const durationMinutes = (context.visitEndTime.getTime() - context.visitStartTime.getTime()) / (1000 * 60);
          if (durationMinutes <= 90) return null;
          serviceCode = '550001270';
        } else {
          serviceCode = '550001170';
        }
        
        const codes = await db
          .select()
          .from(nursingServiceCodes)
          .where(and(...baseConditions, eq(nursingServiceCodes.serviceCode, serviceCode)));
        
        return codes.length > 0 ? codes[0].id : null;
      }

      case '24h_response_system_basic':
      case '24h_response_system_enhanced': {
        // 24時間対応体制加算: 施設の体制フラグから判定
        // 注意: 施設情報が必要だが、現状はcontextに含まれていない
        // 暫定的にサービスコード名から判定
        let serviceCode: string;
        if (bonusCode === '24h_response_system_enhanced') {
          serviceCode = '550002170';
        } else {
          serviceCode = '550000670';
        }
        
        const codes = await db
          .select()
          .from(nursingServiceCodes)
          .where(and(...baseConditions, eq(nursingServiceCodes.serviceCode, serviceCode)));
        
        return codes.length > 0 ? codes[0].id : null;
      }

      case 'medical_multiple_visit_2times_1-2':
      case 'medical_multiple_visit_3times': {
        // 複数回訪問加算: 同一建物内人数を判定
        let isLowOccupancy = true; // デフォルトは1-2人
        
        if (!context.buildingId) {
          // buildingId未設定時はデフォルトで1-2人として扱う
          console.warn(`[selectServiceCodeForBonus] Building ID not set for patient ${context.patientId}, defaulting to occupancy_1_2`);
        } else {
          // 同一建物の同日訪問患者数を取得
          const sameBuildingVisits = await db
            .select()
            .from(nursingRecords)
            .innerJoin(patients, eq(nursingRecords.patientId, patients.id))
            .where(
              and(
                eq(patients.buildingId, context.buildingId),
                eq(nursingRecords.visitDate, visitDateStr),
                eq(nursingRecords.facilityId, context.facilityId),
                // 現在の訪問記録を除外（編集時）
                ne(nursingRecords.id, context.nursingRecordId)
              )
            );
          
          const occupancy = sameBuildingVisits.length + 1; // +1 for current visit
          isLowOccupancy = occupancy <= 2;
        }
        
        // サービスコードを選択
        let serviceCode: string;
        if (bonusCode === 'medical_multiple_visit_2times_1-2') {
          serviceCode = isLowOccupancy ? '510001970' : '510002070';
        } else { // medical_multiple_visit_3times
          serviceCode = isLowOccupancy ? '510002170' : '510002270';
        }
        
        const codes = await db
          .select()
          .from(nursingServiceCodes)
          .where(and(...baseConditions, eq(nursingServiceCodes.serviceCode, serviceCode)));
        
        return codes.length > 0 ? codes[0].id : null;
      }

      default:
        // Phase 1以外の加算は自動選択しない
        return null;
    }
  } catch (error) {
    console.error(`[selectServiceCodeForBonus] Error selecting service code for ${bonusCode}:`, error);
    return null;
  }
}

/**
 * 加算計算結果をデータベースに保存
 * 既存の加算履歴を削除してから新しい履歴を保存（重複を防ぐ）
 */
export async function saveBonusCalculationHistory(
  nursingRecordId: string,
  results: BonusCalculationResult[],
  userId?: string
): Promise<void> {
  // トランザクションで処理
  await db.transaction(async (tx) => {
    // 既存の加算履歴を取得（削除前にserviceCodeIdを保存）
    const existingHistory = await tx.query.bonusCalculationHistory.findMany({
      where: eq(bonusCalculationHistory.nursingRecordId, nursingRecordId),
    });

    // bonusMasterId -> serviceCodeId のマッピングを作成（手動選択したサービスコードを保持）
    const existingServiceCodes = new Map<string, string>();
    // クリアされた加算（isManuallyAdjusted: true かつ serviceCodeId: null）を記録
    const clearedBonusMasterIds = new Set<string>();
    existingHistory.forEach(h => {
      if (h.serviceCodeId) {
        existingServiceCodes.set(h.bonusMasterId, h.serviceCodeId);
      } else if (h.isManuallyAdjusted && !h.serviceCodeId) {
        // クリアされた加算を記録（再計算時に自動選択をスキップするため）
        clearedBonusMasterIds.add(h.bonusMasterId);
      }
    });

    // 既存の加算履歴を削除（該当のnursingRecordIdに紐づくもののみ）
    await tx.delete(bonusCalculationHistory)
      .where(eq(bonusCalculationHistory.nursingRecordId, nursingRecordId));

    // 訪問記録情報を取得してコンテキストを構築
    const nursingRecord = await tx.query.nursingRecords.findFirst({
      where: eq(nursingRecords.id, nursingRecordId),
    });

    if (!nursingRecord) {
      console.error(`[saveBonusCalculationHistory] Nursing record not found: ${nursingRecordId}`);
      return;
    }

    // 患者情報を取得して保険種別を判定
    const patient = await tx.query.patients.findFirst({
      where: eq(patients.id, nursingRecord.patientId),
    });

    const insuranceType = (patient?.insuranceType as "medical" | "care") || "medical";

    // 同じbonusMasterIdの重複を防ぐためのMap
    const processedBonusMasterIds = new Set<string>();

    // 日付型の変換（string | Date の可能性があるため）
    const visitDate = typeof nursingRecord.visitDate === 'string'
      ? new Date(nursingRecord.visitDate)
      : nursingRecord.visitDate;
    
    const visitStartTime = nursingRecord.actualStartTime 
      ? (typeof nursingRecord.actualStartTime === 'string'
        ? new Date(nursingRecord.actualStartTime)
        : nursingRecord.actualStartTime)
      : null;
    
    const visitEndTime = nursingRecord.actualEndTime 
      ? (typeof nursingRecord.actualEndTime === 'string'
        ? new Date(nursingRecord.actualEndTime)
        : nursingRecord.actualEndTime)
      : null;

    const terminalCareDeathDate = nursingRecord.terminalCareDeathDate 
      ? (typeof nursingRecord.terminalCareDeathDate === 'string'
        ? new Date(nursingRecord.terminalCareDeathDate)
        : nursingRecord.terminalCareDeathDate)
      : null;

    const context: BonusCalculationContext = {
      nursingRecordId,
      patientId: nursingRecord.patientId,
      facilityId: nursingRecord.facilityId,
      visitDate,
      visitStartTime,
      visitEndTime,
      isSecondVisit: nursingRecord.isSecondVisit,
      emergencyVisitReason: nursingRecord.emergencyVisitReason || null,
      multipleVisitReason: nursingRecord.multipleVisitReason || null,
      longVisitReason: nursingRecord.longVisitReason || null,
      isDischargeDate: nursingRecord.isDischargeDate || false,
      isFirstVisitOfPlan: nursingRecord.isFirstVisitOfPlan || false,
      hasCollaborationRecord: nursingRecord.hasCollaborationRecord || false,
      isTerminalCare: nursingRecord.isTerminalCare || false,
      terminalCareDeathDate,
      specialistCareType: nursingRecord.specialistCareType || null,
      insuranceType,
    };

    for (const result of results) {
      // 同じbonusMasterIdの重複をチェック
      if (processedBonusMasterIds.has(result.bonusMasterId)) {
        console.warn(`[saveBonusCalculationHistory] Duplicate bonusMasterId detected: ${result.bonusMasterId}, skipping`);
        continue;
      }
      processedBonusMasterIds.add(result.bonusMasterId);

      // 既存のserviceCodeIdがあれば使用（手動選択したサービスコードを保持）
      let serviceCodeId: string | null = null;
      let isManuallyAdjusted = false;
      
      if (existingServiceCodes.has(result.bonusMasterId)) {
        serviceCodeId = existingServiceCodes.get(result.bonusMasterId)!;
        console.log(`[saveBonusCalculationHistory] Preserving manual service code for bonus: ${result.bonusMasterId}`);
      } else if (clearedBonusMasterIds.has(result.bonusMasterId)) {
        // クリアされた加算は自動選択をスキップして未選択状態を維持
        serviceCodeId = null;
        isManuallyAdjusted = true;
        console.log(`[saveBonusCalculationHistory] Skipping auto-selection for cleared bonus: ${result.bonusMasterId}`);
      } else {
        // 既存のserviceCodeIdがない場合のみ自動選択を試みる
        // 加算マスタを取得してサービスコードを自動選択
        const bonusMasterRecord = await tx.query.bonusMaster.findFirst({
          where: eq(bonusMaster.id, result.bonusMasterId),
        });

        if (bonusMasterRecord) {
          serviceCodeId = await selectServiceCodeForBonus(
            bonusMasterRecord.bonusCode,
            bonusMasterRecord,
            context
          );

          if (!serviceCodeId) {
            console.log(`[saveBonusCalculationHistory] Service code not selected for bonus: ${bonusMasterRecord.bonusCode}`);
          }
        }
      }

      const historyRecord: InsertBonusCalculationHistory = {
        nursingRecordId,
        bonusMasterId: result.bonusMasterId,
        calculatedPoints: result.calculatedPoints,
        appliedVersion: result.appliedVersion,
        calculationDetails: result.calculationDetails,
        serviceCodeId,
        isManuallyAdjusted,
      };

      await tx.insert(bonusCalculationHistory).values(historyRecord);
    }
  });
}

/**
 * 月次レセプトに紐づく訪問記録の加算を一括再計算
 */
export async function recalculateBonusesForReceipt(
  receipt: {
    id: string
    patientId: string
    facilityId: string
    targetYear: number
    targetMonth: number
    insuranceType: 'medical' | 'care'
  }
): Promise<void> {
  // 対象月の訪問記録を取得（completedのみ）
  const startDate = new Date(receipt.targetYear, receipt.targetMonth - 1, 1);
  const endDate = new Date(receipt.targetYear, receipt.targetMonth, 0);

  const targetRecords = await db.query.nursingRecords.findMany({
    where: and(
      eq(nursingRecords.patientId, receipt.patientId),
      eq(nursingRecords.facilityId, receipt.facilityId),
      gte(nursingRecords.visitDate, startDate.toISOString().split('T')[0]),
      lte(nursingRecords.visitDate, endDate.toISOString().split('T')[0]),
      eq(nursingRecords.status, 'completed')
    ),
  });

  // 患者情報を取得して保険種別を判定
  const patient = await db.query.patients.findFirst({
    where: eq(patients.id, receipt.patientId),
  });

  if (!patient) {
    console.error(`[recalculateBonusesForReceipt] Patient not found: ${receipt.patientId}`);
    return;
  }

  const insuranceType = (patient.insuranceType as "medical" | "care") || receipt.insuranceType;

  // 施設情報を取得
  const facility = await db.query.facilities.findFirst({
    where: eq(facilities.id, receipt.facilityId),
  });

  // 担当看護師情報を一括取得（N+1クエリ問題を解消）
  const nurseIds = targetRecords
    .map(r => r.nurseId)
    .filter((id): id is string => id !== null);

  const nurses = nurseIds.length > 0
    ? await db.query.users.findMany({
        where: inArray(users.id, nurseIds),
        columns: {
          id: true,
          fullName: true,
          specialistCertifications: true,
        },
      })
    : [];

  // Mapに変換して高速検索可能にする
  const nurseMap = new Map(nurses.map(n => [n.id, n]));

  // 各訪問記録の加算を再計算
  for (const record of targetRecords) {
    // 日付型の変換
    const visitDate = typeof record.visitDate === 'string'
      ? new Date(record.visitDate)
      : record.visitDate;
    
    const visitStartTime = record.actualStartTime 
      ? (typeof record.actualStartTime === 'string'
        ? new Date(record.actualStartTime)
        : record.actualStartTime)
      : null;
    
    const visitEndTime = record.actualEndTime 
      ? (typeof record.actualEndTime === 'string'
        ? new Date(record.actualEndTime)
        : record.actualEndTime)
      : null;

    const terminalCareDeathDate = record.terminalCareDeathDate 
      ? (typeof record.terminalCareDeathDate === 'string'
        ? new Date(record.terminalCareDeathDate)
        : record.terminalCareDeathDate)
      : null;

    // 患者年齢を計算
    let patientAge: number | undefined;
    if (patient.dateOfBirth) {
      const birthDate = new Date(patient.dateOfBirth);
      const visitDateObj = visitDate instanceof Date ? visitDate : new Date(visitDate);
      patientAge = visitDateObj.getFullYear() - birthDate.getFullYear();
      const monthDiff = visitDateObj.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && visitDateObj.getDate() < birthDate.getDate())) {
        patientAge--;
      }
    }

    // 同日訪問回数を計算（時間順での順番を考慮）
    const visitDateStr = visitDate instanceof Date 
      ? visitDate.toISOString().split('T')[0]
      : typeof visitDate === 'string' 
        ? visitDate 
        : new Date(visitDate).toISOString().split('T')[0];
    
    const sameDayVisits = await db.query.nursingRecords.findMany({
      where: and(
        eq(nursingRecords.facilityId, receipt.facilityId),
        eq(nursingRecords.patientId, receipt.patientId),
        eq(nursingRecords.visitDate, visitDateStr),
        isNull(nursingRecords.deletedAt)
      )
    });

    // 訪問開始時刻でソート
    sameDayVisits.sort((a, b) => {
      const timeA = a.actualStartTime ? new Date(a.actualStartTime).getTime() : Infinity;
      const timeB = b.actualStartTime ? new Date(b.actualStartTime).getTime() : Infinity;
      return timeA - timeB;
    });

    // 現在の訪問記録が時間順で何番目かを判定
    const currentVisitStartTime = visitStartTime ? visitStartTime.getTime() : null;
    let dailyVisitCount = 1;
    if (currentVisitStartTime !== null) {
      const currentIndex = sameDayVisits.findIndex(v => {
        if (v.id === record.id) return true;
        const visitTime = v.actualStartTime ? new Date(v.actualStartTime).getTime() : Infinity;
        return visitTime === currentVisitStartTime;
      });
      dailyVisitCount = currentIndex >= 0 ? currentIndex + 1 : sameDayVisits.length;
    } else {
      // 開始時刻が未設定の場合は、既存の訪問数
      dailyVisitCount = sameDayVisits.length;
    }

    // 担当看護師情報を取得（専門管理加算用）- Mapから取得（一括取得済み）
    const assignedNurse = record.nurseId ? nurseMap.get(record.nurseId) : undefined;

    const context: BonusCalculationContext = {
      nursingRecordId: record.id,
      patientId: record.patientId,
      facilityId: record.facilityId,
      visitDate: visitDate instanceof Date ? visitDate : new Date(visitDate),
      visitStartTime,
      visitEndTime,
      isSecondVisit: record.isSecondVisit,
      emergencyVisitReason: record.emergencyVisitReason || null,
      multipleVisitReason: record.multipleVisitReason || null,
      longVisitReason: record.longVisitReason || null,
      isDischargeDate: record.isDischargeDate || false,
      isFirstVisitOfPlan: record.isFirstVisitOfPlan || false,
      hasCollaborationRecord: record.hasCollaborationRecord || false,
      isTerminalCare: record.isTerminalCare || false,
      terminalCareDeathDate,
      specialistCareType: record.specialistCareType || null,
      patientAge,
      buildingId: patient.buildingId || null,
      insuranceType,
      dailyVisitCount,
      // Phase2-1: 施設体制フラグ
      has24hSupportSystem: facility?.has24hSupportSystem || false,
      has24hSupportSystemEnhanced: facility?.has24hSupportSystemEnhanced || false,
      hasEmergencySupportSystem: facility?.hasEmergencySupportSystem || false,
      hasEmergencySupportSystemEnhanced: facility?.hasEmergencySupportSystemEnhanced || false,
      burdenReductionMeasures: facility?.burdenReductionMeasures || [],
      // Phase 2-A: 患者情報（日付フィールド）
      lastDischargeDate: patient.lastDischargeDate ? new Date(patient.lastDischargeDate) : null,
      lastPlanCreatedDate: patient.lastPlanCreatedDate ? new Date(patient.lastPlanCreatedDate) : null,
      deathDate: patient.deathDate ? new Date(patient.deathDate) : null,
      deathPlaceCode: (patient as any).deathPlaceCode || null,
      // Phase 4: 特別管理情報
      specialManagementTypes: patient.specialManagementTypes || [],
      // Week 3: 専門管理加算用フィールド
      assignedNurse: assignedNurse ? {
        id: assignedNurse.id,
        fullName: assignedNurse.fullName,
        specialistCertifications: assignedNurse.specialistCertifications as string[] | null,
      } : undefined,
    };

    // 加算を計算
    const results = await calculateBonuses(context);

    // 加算履歴を保存（既存の履歴は削除される）
    await saveBonusCalculationHistory(record.id, results);
  }
}
