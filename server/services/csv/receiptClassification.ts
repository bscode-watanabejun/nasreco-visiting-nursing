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
 * 1. 保険種別（医保・国保・後期高齢者）
 * 2. 公費の組み合わせ（公費①②③④の位置）
 *
 * 別表22の構造:
 * - 1者: 1, 5, 6, B, C （公費単独）
 * - 2者: 2, 3, E, G, 7, H, I, J, K, L （医保+公費1枚、または公費2枚）
 * - 3者: 4, M, N, O, P, Q, R, S, T, U （医保+公費2枚、または公費3枚）
 * - 4者: V, W, X, Y, Z （医保+公費3枚、または公費4枚）
 * - 5者: 9 （医保+公費4枚）
 *
 * 注意:
 * - 別表22には医保のみ、後期高齢者のみのパターンは存在しない
 * - 公費の優先順位（priority）により①②③④の位置が決まる前提
 * - 後期高齢者は医保・国保と同じ扱いで暫定対応
 */
export function determineBurdenClassificationCode(
  patient: PatientInfo,
  insuranceCard: InsuranceCardInfo,
  publicExpenses: PublicExpenseInfo[]
): string {
  const publicExpenseCount = publicExpenses.length;
  const { cardType } = insuranceCard;
  const insuranceType = patient.insuranceType;

  // 介護保険の場合
  if (cardType === 'long_term_care') {
    return '9'; // 介護保険（5者併用と同じコードだが別扱い）
  }

  // 医保・国保の有無を判定
  const hasInsurance = insuranceType &&
                       insuranceType !== 'none' &&
                       insuranceType !== 'medical_elderly';

  // 公費のみの場合（医保・国保なし、後期高齢者でもない）
  if (!hasInsurance && insuranceType !== 'medical_elderly') {
    if (publicExpenseCount === 0) return '1'; // エラーケース: 最小コードで暫定対応
    if (publicExpenseCount === 1) return '1'; // 公費①単独
    if (publicExpenseCount === 2) return '7'; // 公費①②併用
    if (publicExpenseCount === 3) return 'R'; // 公費①②③併用
    if (publicExpenseCount === 4) return 'Z'; // 公費①②③④併用（'9'は介護保険と重複するため'Z'を使用）
    return '1';
  }

  // 後期高齢者医療の場合
  // 注: 別表22には後期高齢者の明記がないため、医保・国保と同じ扱いで暫定対応
  if (insuranceType === 'medical_elderly') {
    if (publicExpenseCount === 0) return '1'; // 後期のみ: 別表22に存在しないため最小コードで暫定対応
    if (publicExpenseCount === 1) return '2'; // 後期+公費①: 医保+公費①と同じ扱い（2者併用）
    if (publicExpenseCount === 2) return '4'; // 後期+公費①②: 医保+公費①②と同じ扱い（3者併用）
    if (publicExpenseCount === 3) return 'V'; // 後期+公費①②③: 医保+公費①②③と同じ扱い（4者併用）
    if (publicExpenseCount === 4) return '9'; // 後期+公費①②③④: 5者併用
    return '1';
  }

  // 医保・国保の場合
  if (publicExpenseCount === 0) {
    // 医保・国保のみ: 別表22に存在しないため最小コードで暫定対応
    return '1';
  }

  if (publicExpenseCount === 1) {
    // 医保・国保 + 公費①: コード'2'（2者併用）
    return '2';
  }

  if (publicExpenseCount === 2) {
    // 医保・国保 + 公費①②: コード'4'（3者併用）
    return '4';
  }

  if (publicExpenseCount === 3) {
    // 医保・国保 + 公費①②③: コード'V'（4者併用）
    return 'V';
  }

  if (publicExpenseCount === 4) {
    // 医保・国保 + 公費①②③④: コード'9'（5者併用）
    return '9';
  }

  // デフォルト（エラーケース）
  return '1';
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
