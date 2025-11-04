/**
 * Phase 3.3: レセプト分類動的判定サービス
 *
 * 患者・保険証・公費情報から以下を動的に判定:
 * - レセプト種別コード (39パターン)
 * - 負担区分コード (26パターン)
 * - 指示区分コード (6パターン)
 *
 * 参考仕様:
 * - 別表4: レセプト種別コード
 * - 別表12: 指示区分コード
 * - 別表22: 負担区分コード
 */

interface PatientInfo {
  dateOfBirth: string | Date;
  insuranceType: string | null;
}

interface InsuranceCardInfo {
  cardType: 'medical' | 'long_term_care';
  relationshipType: 'self' | 'preschool' | 'family' | 'elderly_general' | 'elderly_70' | null;
  ageCategory: 'preschool' | 'general' | 'elderly' | null;
  elderlyRecipientCategory: 'general_low' | 'seventy' | null;
}

interface PublicExpenseInfo {
  legalCategoryNumber: string;
  priority: number;
}

interface DoctorOrderInfo {
  instructionType: 'regular' | 'special' | 'psychiatric' | 'psychiatric_special' | 'medical_observation' | 'medical_observation_special';
}

/**
 * レセプト種別コードを判定 (別表4: 39パターン)
 *
 * 判定要素:
 * 1. 保険種別 (医保/国保/後期高齢)
 * 2. 公費数 (0-4枚)
 * 3. 本人家族区分
 * 4. 年齢区分
 * 5. 高齢受給者区分
 */
export function determineReceiptTypeCode(
  patient: PatientInfo,
  insuranceCard: InsuranceCardInfo,
  publicExpenses: PublicExpenseInfo[]
): string {
  const publicExpenseCount = publicExpenses.length;
  const { cardType, relationshipType, ageCategory, elderlyRecipientCategory } = insuranceCard;

  // 介護保険は固定コード
  if (cardType === 'long_term_care') {
    return '72'; // 介護 第1号被保険者 介護予防含む
  }

  // 医療保険の判定
  const insuranceType = patient.insuranceType;

  // 公費のみのケース（医保/国保なし）
  if (!insuranceType || insuranceType === 'none') {
    if (publicExpenseCount === 1) return '10'; // 単独公費
    if (publicExpenseCount === 2) return '16'; // 二併公費
    if (publicExpenseCount === 3) return '22'; // 三併公費
    if (publicExpenseCount === 4) return '28'; // 四併公費
    throw new Error('保険種別が設定されていません');
  }

  // 後期高齢者医療の場合
  if (insuranceType === 'medical_elderly' || ageCategory === 'elderly') {
    switch (publicExpenseCount) {
      case 0: return '39'; // 後期 単独
      case 1: return '13'; // 後期 公費単独分
      case 2: return '19'; // 後期 公費二併分
      case 3: return '25'; // 後期 公費三併分
      case 4: return '31'; // 後期 公費四併分
      default: return '39';
    }
  }

  // 医保・国保の場合
  const isMedical = insuranceType === 'medical_insurance' || insuranceType === 'health_insurance';
  const isNational = insuranceType === 'national_health';

  // 未就学者の場合
  if (relationshipType === 'preschool' || ageCategory === 'preschool') {
    switch (publicExpenseCount) {
      case 0: return isMedical ? '36' : '37'; // 本・未就学
      case 1: return '11'; // 本・未就学 公費単独分
      case 2: return '17'; // 本・未就学 公費二併分
      case 3: return '23'; // 本・未就学 公費三併分
      case 4: return '29'; // 本・未就学 公費四併分
      default: return isMedical ? '36' : '37';
    }
  }

  // 高齢受給者（70-74歳）の場合
  if (elderlyRecipientCategory) {
    const isSeventyPercent = elderlyRecipientCategory === 'seventy';

    switch (publicExpenseCount) {
      case 0:
        if (isMedical) return isSeventyPercent ? '34' : '32'; // 本・高７割 or 本・高一
        return isSeventyPercent ? '35' : '33'; // 国・高７割 or 国・高一
      case 1: return '12'; // 本・高 公費単独分
      case 2: return '18'; // 本・高 公費二併分
      case 3: return '24'; // 本・高 公費三併分
      case 4: return '30'; // 本・高 公費四併分
      default:
        return isMedical ? '32' : '33';
    }
  }

  // 一般（本人・家族）の場合
  const isSelf = relationshipType === 'self' || relationshipType === null;

  switch (publicExpenseCount) {
    case 0:
      if (isMedical) return isSelf ? '01' : '03'; // 医保 本人 or 家族
      return isSelf ? '02' : '04'; // 国保 本人 or 家族
    case 1: return '14'; // 医保・国保 公費単独分
    case 2: return '20'; // 医保・国保 公費二併分
    case 3: return '26'; // 医保・国保 公費三併分
    case 4: return '38'; // 医保・国保 公費四併分
    default:
      return isMedical ? '01' : '02';
  }
}

/**
 * 負担区分コードを判定 (別表22: 26パターン)
 *
 * 判定要素:
 * 1. 保険種別
 * 2. 公費の組み合わせ
 * 3. 本人家族区分
 */
export function determineBurdenClassificationCode(
  patient: PatientInfo,
  insuranceCard: InsuranceCardInfo,
  publicExpenses: PublicExpenseInfo[]
): string {
  const publicExpenseCount = publicExpenses.length;
  const { cardType, relationshipType } = insuranceCard;
  const insuranceType = patient.insuranceType;

  // 介護保険の場合
  if (cardType === 'long_term_care') {
    return '9'; // 介護保険
  }

  // 公費のみの場合
  if (!insuranceType || insuranceType === 'none') {
    if (publicExpenseCount === 1) return '1'; // 単独公費
    if (publicExpenseCount === 2) return '7'; // 二併公費
    if (publicExpenseCount === 3) return '8'; // 三併公費
    if (publicExpenseCount === 4) return '9'; // 四併公費（※実際は9が介護と重複するため要確認）
    return '1';
  }

  // 後期高齢者医療の場合
  if (insuranceType === 'medical_elderly') {
    switch (publicExpenseCount) {
      case 0: return '0'; // 後期高齢者のみ
      case 1: return '1'; // 後期+単独公費
      case 2: return '7'; // 後期+二併公費
      case 3: return '8'; // 後期+三併公費
      case 4: return '9'; // 後期+四併公費
      default: return '0';
    }
  }

  // 医保・国保の場合
  // 未就学者も「本人」として扱う（負担区分: 本人=0）
  const isSelf = relationshipType === 'self' || relationshipType === 'preschool' || relationshipType === null;

  // 公費なし
  if (publicExpenseCount === 0) {
    return isSelf ? '0' : '2'; // 本人 or 家族
  }

  // 公費あり
  switch (publicExpenseCount) {
    case 1: return '1'; // 医保・国保 + 単独公費
    case 2: return '7'; // 医保・国保 + 二併公費
    case 3: return '8'; // 医保・国保 + 三併公費
    case 4: return '9'; // 医保・国保 + 四併公費
    default: return '0';
  }
}

/**
 * 指示区分コードを判定 (別表12: 6パターン)
 *
 * 判定要素:
 * - 医師指示の種類 (doctor_orders.instruction_type)
 */
export function determineInstructionTypeCode(
  doctorOrder: DoctorOrderInfo
): string {
  const instructionTypeMap: Record<DoctorOrderInfo['instructionType'], string> = {
    regular: '01',                          // 訪問看護指示
    special: '02',                          // 特別訪問看護指示
    psychiatric: '03',                      // 精神科訪問看護指示
    psychiatric_special: '04',              // 精神科特別訪問看護指示
    medical_observation: '05',              // 医療観察精神科訪問看護指示
    medical_observation_special: '06',      // 医療観察精神科特別訪問看護指示
  };

  return instructionTypeMap[doctorOrder.instructionType] || '01';
}

/**
 * すべての分類コードを一括で判定
 */
export function determineAllClassifications(
  patient: PatientInfo,
  insuranceCard: InsuranceCardInfo,
  publicExpenses: PublicExpenseInfo[],
  doctorOrder: DoctorOrderInfo
) {
  return {
    receiptTypeCode: determineReceiptTypeCode(patient, insuranceCard, publicExpenses),
    burdenClassificationCode: determineBurdenClassificationCode(patient, insuranceCard, publicExpenses),
    instructionTypeCode: determineInstructionTypeCode(doctorOrder),
  };
}
