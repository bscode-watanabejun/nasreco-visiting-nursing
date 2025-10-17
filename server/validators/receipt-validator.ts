/**
 * Receipt Validation Engine
 * レセプト算定要件チェックエンジン
 */

interface ValidationError {
  code: string;
  message: string;
  severity: 'error' | 'warning';
  field?: string;
}

interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

interface NursingRecord {
  id: string;
  visitDate: string;
  actualStartTime?: Date | null;
  actualEndTime?: Date | null;
  emergencyVisitReason?: string | null;
  multipleVisitReason?: string | null;
  isSecondVisit: boolean;
}

interface Patient {
  id: string;
  buildingId?: string | null;
  careLevel?: string | null;
}

interface DoctorOrder {
  id: string;
  patientId: string;
  startDate: string;
  endDate: string;
}

interface InsuranceCard {
  id: string;
  patientId: string;
  cardType: 'medical' | 'long_term_care';
  validFrom: string;
  validTo?: string | null;
}

interface BonusCalculation {
  bonusMasterId: string;
  bonusCode: string;
  bonusName: string;
  calculatedPoints: number;
}

interface ReceiptValidationInput {
  patientId: string;
  targetYear: number;
  targetMonth: number;
  insuranceType: 'medical' | 'care';
  nursingRecords: NursingRecord[];
  patient: Patient;
  doctorOrders: DoctorOrder[];
  insuranceCards: InsuranceCard[];
  bonusCalculations: BonusCalculation[];
}

/**
 * Validate monthly receipt for errors and warnings
 */
export function validateReceipt(input: ReceiptValidationInput): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // 1. Check doctor order validity (指示書期限チェック)
  const doctorOrderCheck = checkDoctorOrderValidity(
    input.doctorOrders,
    input.targetYear,
    input.targetMonth,
    input.nursingRecords
  );
  errors.push(...doctorOrderCheck.errors);
  warnings.push(...doctorOrderCheck.warnings);

  // 2. Check insurance card validity (保険証有効期限チェック)
  const insuranceCardCheck = checkInsuranceCardValidity(
    input.insuranceCards,
    input.insuranceType,
    input.targetYear,
    input.targetMonth,
    input.nursingRecords
  );
  errors.push(...insuranceCardCheck.errors);
  warnings.push(...insuranceCardCheck.warnings);

  // 3. Check bonus frequency limits (回数制限チェック)
  const frequencyCheck = checkBonusFrequencyLimits(
    input.bonusCalculations,
    input.nursingRecords
  );
  errors.push(...frequencyCheck.errors);
  warnings.push(...frequencyCheck.warnings);

  // 4. Check concurrent bonus restrictions (併算定制御チェック)
  const concurrentCheck = checkConcurrentBonusRestrictions(
    input.bonusCalculations
  );
  errors.push(...concurrentCheck.errors);
  warnings.push(...concurrentCheck.warnings);

  // 5. Check building classification consistency (建物区分整合性チェック)
  const buildingCheck = checkBuildingClassification(
    input.patient,
    input.bonusCalculations
  );
  errors.push(...buildingCheck.errors);
  warnings.push(...buildingCheck.warnings);

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check if doctor orders are valid for the target month
 * Enhanced: Check each nursing record's visit date against doctor order validity
 */
function checkDoctorOrderValidity(
  doctorOrders: DoctorOrder[],
  targetYear: number,
  targetMonth: number,
  nursingRecords?: NursingRecord[]
): Pick<ValidationResult, 'errors' | 'warnings'> {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (doctorOrders.length === 0) {
    errors.push({
      code: 'NO_DOCTOR_ORDER',
      message: '訪問看護指示書が登録されていません',
      severity: 'error',
      field: 'doctorOrder',
    });
    return { errors, warnings };
  }

  const targetDate = new Date(targetYear, targetMonth - 1, 15); // 月の中旬で判定

  const validOrders = doctorOrders.filter((order) => {
    const startDate = new Date(order.startDate);
    const endDate = new Date(order.endDate);
    return startDate <= targetDate && endDate >= targetDate;
  });

  if (validOrders.length === 0) {
    errors.push({
      code: 'EXPIRED_DOCTOR_ORDER',
      message: `${targetYear}年${targetMonth}月に有効な訪問看護指示書がありません`,
      severity: 'error',
      field: 'doctorOrder',
    });
  }

  // Enhanced: Check each visit date against doctor order validity
  if (nursingRecords && nursingRecords.length > 0) {
    const invalidVisits: string[] = [];

    nursingRecords.forEach((record) => {
      const visitDate = new Date(record.visitDate);
      const hasValidOrder = doctorOrders.some((order) => {
        const startDate = new Date(order.startDate);
        const endDate = new Date(order.endDate);
        return startDate <= visitDate && endDate >= visitDate;
      });

      if (!hasValidOrder) {
        invalidVisits.push(record.visitDate);
      }
    });

    if (invalidVisits.length > 0) {
      errors.push({
        code: 'VISIT_WITHOUT_VALID_ORDER',
        message: `以下の訪問日に有効な指示書がありません: ${invalidVisits.join(', ')}`,
        severity: 'error',
        field: 'doctorOrder',
      });
    }
  }

  // Check for expiring orders (1 month before expiration)
  const oneMonthLater = new Date(targetYear, targetMonth, 15);
  const expiringOrders = doctorOrders.filter((order) => {
    const endDate = new Date(order.endDate);
    return endDate >= targetDate && endDate <= oneMonthLater;
  });

  if (expiringOrders.length > 0) {
    warnings.push({
      code: 'EXPIRING_DOCTOR_ORDER',
      message: '訪問看護指示書の有効期限が近づいています（1ヶ月以内）',
      severity: 'warning',
      field: 'doctorOrder',
    });
  }

  return { errors, warnings };
}

/**
 * Check if insurance cards are valid for the target month
 * Enhanced: Check each nursing record's visit date against insurance card validity
 */
function checkInsuranceCardValidity(
  insuranceCards: InsuranceCard[],
  insuranceType: 'medical' | 'care',
  targetYear: number,
  targetMonth: number,
  nursingRecords?: NursingRecord[]
): Pick<ValidationResult, 'errors' | 'warnings'> {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  const relevantCards = insuranceCards.filter((card) => {
    if (insuranceType === 'medical') {
      return card.cardType === 'medical';
    } else {
      return card.cardType === 'long_term_care';
    }
  });

  if (relevantCards.length === 0) {
    errors.push({
      code: 'NO_INSURANCE_CARD',
      message: `${insuranceType === 'medical' ? '医療保険証' : '介護保険証'}が登録されていません`,
      severity: 'error',
      field: 'insuranceCard',
    });
    return { errors, warnings };
  }

  const targetDate = new Date(targetYear, targetMonth - 1, 15);

  const validCards = relevantCards.filter((card) => {
    const validFrom = new Date(card.validFrom);
    if (validFrom > targetDate) return false;
    if (card.validTo) {
      const validTo = new Date(card.validTo);
      return validTo >= targetDate;
    }
    return true;
  });

  if (validCards.length === 0) {
    errors.push({
      code: 'EXPIRED_INSURANCE_CARD',
      message: `${targetYear}年${targetMonth}月に有効な保険証がありません`,
      severity: 'error',
      field: 'insuranceCard',
    });
  }

  // Enhanced: Check each visit date against insurance card validity
  if (nursingRecords && nursingRecords.length > 0) {
    const invalidVisits: string[] = [];

    nursingRecords.forEach((record) => {
      const visitDate = new Date(record.visitDate);
      const hasValidCard = relevantCards.some((card) => {
        const validFrom = new Date(card.validFrom);
        if (validFrom > visitDate) return false;
        if (card.validTo) {
          const validTo = new Date(card.validTo);
          return validTo >= visitDate;
        }
        return true;
      });

      if (!hasValidCard) {
        invalidVisits.push(record.visitDate);
      }
    });

    if (invalidVisits.length > 0) {
      errors.push({
        code: 'VISIT_WITHOUT_VALID_CARD',
        message: `以下の訪問日に有効な保険証がありません: ${invalidVisits.join(', ')}`,
        severity: 'error',
        field: 'insuranceCard',
      });
    }
  }

  // Check for expiring cards (30 days before expiration)
  const thirtyDaysLater = new Date(targetYear, targetMonth - 1, targetDate.getDate() + 30);
  const expiringCards = relevantCards.filter((card) => {
    if (!card.validTo) return false;
    const validTo = new Date(card.validTo);
    return validTo >= targetDate && validTo <= thirtyDaysLater;
  });

  if (expiringCards.length > 0) {
    warnings.push({
      code: 'EXPIRING_INSURANCE_CARD',
      message: '保険証の有効期限が近づいています（30日以内）',
      severity: 'warning',
      field: 'insuranceCard',
    });
  }

  return { errors, warnings };
}

/**
 * Check bonus frequency limits (e.g., long visit bonus limited to once per week)
 */
function checkBonusFrequencyLimits(
  bonusCalculations: BonusCalculation[],
  nursingRecords: NursingRecord[]
): Pick<ValidationResult, 'errors' | 'warnings'> {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Count bonus occurrences by code
  const bonusCounts = new Map<string, number>();
  bonusCalculations.forEach((bonus) => {
    bonusCounts.set(bonus.bonusCode, (bonusCounts.get(bonus.bonusCode) || 0) + 1);
  });

  // Check long visit bonus (週1回限定)
  const longVisitCount = bonusCounts.get('long_visit_care') || bonusCounts.get('long_visit_medical') || 0;
  const weeksInMonth = Math.ceil(nursingRecords.length / 7); // Approximate

  if (longVisitCount > weeksInMonth) {
    warnings.push({
      code: 'LONG_VISIT_FREQUENCY_EXCEEDED',
      message: `長時間訪問看護加算が週1回の制限を超えている可能性があります（${longVisitCount}回）`,
      severity: 'warning',
      field: 'bonusCalculations',
    });
  }

  // Check terminal care bonus (月1回限定)
  const terminalCareCount = bonusCounts.get('terminal_care') || 0;
  if (terminalCareCount > 1) {
    errors.push({
      code: 'TERMINAL_CARE_FREQUENCY_EXCEEDED',
      message: 'ターミナルケア加算は月1回のみ算定可能です',
      severity: 'error',
      field: 'bonusCalculations',
    });
  }

  // Check home liaison guidance (月1回限定)
  const homeLiaisonCount = bonusCounts.get('home_liaison_guidance') || 0;
  if (homeLiaisonCount > 1) {
    errors.push({
      code: 'HOME_LIAISON_FREQUENCY_EXCEEDED',
      message: '在宅連携指導加算は月1回のみ算定可能です',
      severity: 'error',
      field: 'bonusCalculations',
    });
  }

  // Check emergency conference (月2回限定)
  const emergencyConferenceCount = bonusCounts.get('emergency_conference') || 0;
  if (emergencyConferenceCount > 2) {
    warnings.push({
      code: 'EMERGENCY_CONFERENCE_FREQUENCY_EXCEEDED',
      message: '在宅患者緊急時等カンファレンスは月2回が上限です',
      severity: 'warning',
      field: 'bonusCalculations',
    });
  }

  return { errors, warnings };
}

/**
 * Check concurrent bonus restrictions (bonuses that cannot be claimed together)
 */
function checkConcurrentBonusRestrictions(
  bonusCalculations: BonusCalculation[]
): Pick<ValidationResult, 'errors' | 'warnings'> {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  const bonusCodes = new Set(bonusCalculations.map((b) => b.bonusCode));

  // Define mutually exclusive bonus pairs
  const mutuallyExclusivePairs: [string, string, string][] = [
    ['special_management_1', 'special_management_2', '特別管理加算Ⅰと特別管理加算Ⅱは併算定できません'],
    ['nursing_care_strengthening_1', 'nursing_care_strengthening_2', '看護体制強化加算ⅠとⅡは併算定できません'],
    ['initial_bonus_1', 'initial_bonus_2', '初回加算ⅠとⅡは併算定できません'],
  ];

  mutuallyExclusivePairs.forEach(([code1, code2, message]) => {
    if (bonusCodes.has(code1) && bonusCodes.has(code2)) {
      errors.push({
        code: 'CONCURRENT_BONUS_VIOLATION',
        message,
        severity: 'error',
        field: 'bonusCalculations',
      });
    }
  });

  return { errors, warnings };
}

/**
 * Check building classification consistency
 */
function checkBuildingClassification(
  patient: Patient,
  bonusCalculations: BonusCalculation[]
): Pick<ValidationResult, 'errors' | 'warnings'> {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  const hasBuildingReduction = bonusCalculations.some((b) =>
    b.bonusCode.includes('same_building_reduction')
  );

  if (hasBuildingReduction && !patient.buildingId) {
    warnings.push({
      code: 'BUILDING_REDUCTION_WITHOUT_BUILDING',
      message: '同一建物減算が適用されていますが、建物情報が登録されていません',
      severity: 'warning',
      field: 'building',
    });
  }

  if (!hasBuildingReduction && patient.buildingId) {
    warnings.push({
      code: 'BUILDING_WITHOUT_REDUCTION',
      message: '建物情報が登録されていますが、同一建物減算が適用されていません',
      severity: 'warning',
      field: 'building',
    });
  }

  return { errors, warnings };
}

/**
 * Detect missing bonuses based on nursing record data
 */
export function detectMissingBonuses(
  nursingRecords: NursingRecord[],
  patient: Patient,
  appliedBonuses: BonusCalculation[]
): ValidationError[] {
  const suggestions: ValidationError[] = [];
  const appliedBonusCodes = new Set(appliedBonuses.map((b) => b.bonusCode));

  nursingRecords.forEach((record) => {
    // Check for long visit bonus (90 minutes or more)
    if (record.actualStartTime && record.actualEndTime) {
      const durationMinutes =
        (new Date(record.actualEndTime).getTime() - new Date(record.actualStartTime).getTime()) / 1000 / 60;

      if (durationMinutes >= 90 && !appliedBonusCodes.has('long_visit_care') && !appliedBonusCodes.has('long_visit_medical')) {
        suggestions.push({
          code: 'MISSING_LONG_VISIT_BONUS',
          message: `訪問日 ${record.visitDate}: 訪問時間が90分以上ですが、長時間訪問看護加算が未算定です`,
          severity: 'warning',
          field: 'bonusCalculations',
        });
      }
    }

    // Check for emergency visit bonus
    if (record.emergencyVisitReason && record.emergencyVisitReason.trim().length > 0) {
      if (!appliedBonusCodes.has('emergency_visit')) {
        suggestions.push({
          code: 'MISSING_EMERGENCY_VISIT_BONUS',
          message: `訪問日 ${record.visitDate}: 緊急訪問理由が記載されていますが、緊急訪問看護加算が未算定です`,
          severity: 'warning',
          field: 'bonusCalculations',
        });
      }
    }

    // Check for multiple visit bonus
    if (record.isSecondVisit && record.multipleVisitReason && record.multipleVisitReason.trim().length > 0) {
      if (!appliedBonusCodes.has('multiple_visit_1') && !appliedBonusCodes.has('multiple_visit_2')) {
        suggestions.push({
          code: 'MISSING_MULTIPLE_VISIT_BONUS',
          message: `訪問日 ${record.visitDate}: 複数回訪問理由が記載されていますが、複数回訪問加算が未算定です`,
          severity: 'warning',
          field: 'bonusCalculations',
        });
      }
    }
  });

  // Check for special management bonus based on care level
  if (patient.careLevel && (patient.careLevel === 'care4' || patient.careLevel === 'care5')) {
    if (!appliedBonusCodes.has('special_management_1') && !appliedBonusCodes.has('special_management_2')) {
      suggestions.push({
        code: 'MISSING_SPECIAL_MANAGEMENT_BONUS',
        message: '要介護4または5の患者ですが、特別管理加算が未算定の可能性があります',
        severity: 'warning',
        field: 'bonusCalculations',
      });
    }
  }

  return suggestions;
}
