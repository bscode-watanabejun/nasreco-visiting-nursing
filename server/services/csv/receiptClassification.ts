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
 * レセプト種別コードを判定 (別表4: 訪問看護用4桁コード)
 *
 * 判定要素:
 * 1. 保険種別 (医保/国保/後期高齢)
 * 2. 公費数 (0-4枚)
 * 3. 本人家族区分
 * 4. 年齢区分
 * 5. 高齢受給者区分
 *
 * 戻り値: 4桁コード（例: 6112, 6114, 6116）
 */
export function determineReceiptTypeCode(
  patient: PatientInfo,
  insuranceCard: InsuranceCardInfo,
  publicExpenses: PublicExpenseInfo[]
): string {
  const publicExpenseCount = publicExpenses.length;
  const { cardType, relationshipType, ageCategory, elderlyRecipientCategory } = insuranceCard;

  // 介護保険は固定コード（訪問看護用ではないため、ここでは使用しない）
  if (cardType === 'long_term_care') {
    throw new Error('介護保険は訪問看護レセプトには使用できません');
  }

  // 医療保険の判定
  const insuranceType = patient.insuranceType;

  // 公費のみのケース（医保/国保なし）
  if (!insuranceType || insuranceType === 'none') {
    if (publicExpenseCount === 1) return '6212'; // 訪問看護・公費単独
    if (publicExpenseCount === 2) return '6222'; // 訪問看護・２種の公費併用
    if (publicExpenseCount === 3) return '6232'; // 訪問看護・３種の公費併用
    if (publicExpenseCount === 4) return '6242'; // 訪問看護・４種の公費併用
    throw new Error('保険種別が設定されていません');
  }

  // 後期高齢者医療の場合
  if (insuranceType === 'medical_elderly' || ageCategory === 'elderly') {
    const isSeventyPercent = elderlyRecipientCategory === 'seventy';
    
    switch (publicExpenseCount) {
      case 0:
        return isSeventyPercent ? '6310' : '6318'; // 後期高齢者単独・7割 or 一般・低所得者
      case 1:
        return isSeventyPercent ? '6320' : '6328'; // 後期高齢者と１種の公費併用・7割 or 一般・低所得者
      case 2:
        return isSeventyPercent ? '6330' : '6338'; // 後期高齢者と２種の公費併用・7割 or 一般・低所得者
      case 3:
        return isSeventyPercent ? '6340' : '6348'; // 後期高齢者と３種の公費併用・7割 or 一般・低所得者
      case 4:
        return isSeventyPercent ? '6350' : '6358'; // 後期高齢者と４種の公費併用・7割 or 一般・低所得者
      default:
        return isSeventyPercent ? '6310' : '6318';
    }
  }

  // 医保・国保の場合
  const isMedical = insuranceType === 'medical_insurance' || insuranceType === 'health_insurance';
  const isNational = insuranceType === 'national_health';

  // 未就学者の場合
  if (relationshipType === 'preschool' || ageCategory === 'preschool') {
    switch (publicExpenseCount) {
      case 0: return '6114'; // 訪問看護・医保単独/国保単独・未就学者
      case 1: return '6124'; // 訪問看護・医保/国保と１種の公費併用・未就学者
      case 2: return '6134'; // 訪問看護・医保/国保と２種の公費併用・未就学者
      case 3: return '6144'; // 訪問看護・医保/国保と３種の公費併用・未就学者
      case 4: return '6154'; // 訪問看護・医保/国保と４種の公費併用・未就学者
      default: return '6114';
    }
  }

  // 高齢受給者（70-74歳）の場合
  if (elderlyRecipientCategory) {
    const isSeventyPercent = elderlyRecipientCategory === 'seventy';

    switch (publicExpenseCount) {
      case 0:
        return isSeventyPercent ? '6110' : '6118'; // 高齢受給者７割 or 高齢受給者一般・低所得者
      case 1:
        return isSeventyPercent ? '6120' : '6128'; // 医保/国保と１種の公費併用・高齢受給者７割 or 一般・低所得者
      case 2:
        return isSeventyPercent ? '6130' : '6138'; // 医保/国保と２種の公費併用・高齢受給者７割 or 一般・低所得者
      case 3:
        return isSeventyPercent ? '6140' : '6148'; // 医保/国保と３種の公費併用・高齢受給者７割 or 一般・低所得者
      case 4:
        return isSeventyPercent ? '6150' : '6158'; // 医保/国保と４種の公費併用・高齢受給者７割 or 一般・低所得者
      default:
        return isSeventyPercent ? '6110' : '6118';
    }
  }

  // 一般（本人・家族）の場合
  const isSelf = relationshipType === 'self' || relationshipType === null;
  const isFamily = relationshipType === 'family';

  switch (publicExpenseCount) {
    case 0:
      if (isFamily) return '6116'; // 訪問看護・医保単独/国保単独・家族/その他
      return '6112'; // 訪問看護・医保単独/国保単独・本人/世帯主
    case 1:
      if (isFamily) return '6126'; // 訪問看護・医保/国保と１種の公費併用・家族/その他
      return '6122'; // 訪問看護・医保/国保と１種の公費併用・本人/世帯主
    case 2:
      if (isFamily) return '6136'; // 訪問看護・医保/国保と２種の公費併用・家族/その他
      return '6132'; // 訪問看護・医保/国保と２種の公費併用・本人/世帯主
    case 3:
      if (isFamily) return '6146'; // 訪問看護・医保/国保と３種の公費併用・家族/その他
      return '6142'; // 訪問看護・医保/国保と３種の公費併用・本人/世帯主
    case 4:
      if (isFamily) return '6156'; // 訪問看護・医保/国保と４種の公費併用・家族/その他
      return '6152'; // 訪問看護・医保/国保と４種の公費併用・本人/世帯主
    default:
      return isFamily ? '6116' : '6112';
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
