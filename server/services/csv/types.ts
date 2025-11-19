/**
 * CSV生成で使用する型定義
 */

/**
 * レセプトCSV生成に必要なデータ
 */
export interface ReceiptCsvData {
  // レセプト基本情報
  receipt: {
    id: string;
    targetYear: number;
    targetMonth: number;
    insuranceType: 'medical' | 'care';
    visitCount: number;
    totalPoints: number;
    totalAmount: number;
    // 一部負担金額・減免情報（HOレコード用）
    partialBurdenAmount?: number | null;
    reductionCategory?: '1' | '2' | '3' | null; // 別表9: 1=減額, 2=免除, 3=支払猶予
    reductionRate?: number | null; // 減額割合（0-100）
    reductionAmount?: number | null; // 減額金額
    certificateNumber?: string | null; // 証明書番号（3桁）
    // ⭐ 追加: 公費一部負担情報（KOレコード用）
    publicExpenseBurdenInfo?: {
      [publicExpenseCardId: string]: {
        partialBurdenAmount?: number | null;        // 一部負担金額（8桁可変、単位: 円）
        publicExpenseBurdenAmount?: number | null;  // 公費給付対象一部負担金（6桁可変、単位: 円）
      };
    } | null;
  };

  // 施設情報
  facility: {
    facilityCode: string; // 7桁
    prefectureCode: string; // 2桁
    name: string;
    address: string;
    phone: string;
  };

  // 患者情報
  patient: {
    id: string;
    patientNumber: string;
    lastName: string;
    firstName: string;
    kanaName: string; // 全角カタカナ
    dateOfBirth: Date | string;
    gender: 'male' | 'female' | 'other';
    insuranceNumber: string;
    insuranceType: string | null; // Phase 3: 保険種別（動的判定用）
    deathDate?: Date | string | null; // 死亡日（RJレコード用）
    deathTime?: string | null; // 死亡時刻（HHMM形式）
    deathPlaceCode?: string | null; // 死亡場所コード（別表16）
    deathPlaceText?: string | null; // 死亡場所文字データ
  };

  // 医療機関情報（訪問看護指示書発行元）
  medicalInstitution: {
    institutionCode: string; // 7桁
    prefectureCode: string; // 2桁
    name: string;
    doctorName: string;
  };

  // 保険証情報（Phase 3: 動的判定用）
  insuranceCard: {
    cardType: 'medical' | 'long_term_care';
    relationshipType: 'self' | 'preschool' | 'family' | 'elderly_general' | 'elderly_70' | null;
    ageCategory: 'preschool' | 'general' | 'elderly' | null;
    elderlyRecipientCategory: 'general_low' | 'seventy' | null;
    // HO/KOレコード出力用フィールド（仕様書PDFページ10-11準拠）
    insurerNumber: string;        // 保険者番号（8桁固定）
    certificateSymbol: string;    // 被保険者証記号
    certificateNumber: string;    // 被保険者証番号
    reviewOrganizationCode?: string | null;  // 審査支払機関コード ('1'=社保, '2'=国保連)
    copaymentRate?: '10' | '20' | '30' | null;  // 負担割合（1割・2割・3割、給付割合計算用）
    partialBurdenCategory?: '1' | '3' | null;  // 一部負担金区分（別表7: '1'=適用区分II, '3'=適用区分I）
  };

  // 公費負担医療情報（Phase 3: 動的判定用）
  publicExpenses: Array<{
    id: string; // ⭐ 追加: 公費ID（publicExpenseBurdenInfoのキーとして使用）
    legalCategoryNumber: string;
    beneficiaryNumber: string;
    recipientNumber: string | null;
    priority: number;
  }>;

  // 訪問看護指示書
  doctorOrder: {
    id: string;
    startDate: Date | string;
    endDate: Date | string;
    diagnosis: string;
    icd10Code: string; // 7桁以内
    instructionType: 'regular' | 'special' | 'psychiatric' | 'psychiatric_special' | 'medical_observation' | 'medical_observation_special'; // Phase 3: 指示区分
  };

  // 訪問記録一覧
  nursingRecords: Array<{
    id: string;
    visitDate: Date | string;
    actualStartTime: string;
    actualEndTime: string;
    serviceCode: string; // 9桁
    visitLocationCode: string; // 2桁
    visitLocationCustom?: string | null; // 訪問場所詳細（場所コード99の場合のみ、RJレコード用）
    staffQualificationCode: string; // 2桁
    calculatedPoints: number;
    observations: string; // 観察事項（必須、JSレコードの心身の状態用）
    isServiceEnd?: boolean; // 今回で訪問終了フラグ
    serviceEndReasonCode?: string | null; // 訪問終了状況コード（別表15）
    serviceEndReasonText?: string | null; // 訪問終了状況文字データ（コード99の場合のみ）
    appliedBonuses: Array<{
      bonusCode: string;
      bonusName: string;
      points: number;
    }>;
  }>;

  // 加算集計
  bonusBreakdown: Array<{
    bonusCode: string;
    bonusName: string;
    count: number;
    points: number;
  }>;

  // 加算履歴（サービスコード選択済みのもののみ）
  bonusHistory: Array<{
    id: string;
    nursingRecordId: string;
    visitDate: Date | string;
    bonusCode: string;
    bonusName: string;
    serviceCode: string; // 9桁のサービスコード
    points: number; // サービスコードの点数
  }>;
}

/**
 * レセプト共通レコード(RE)のデータ
 */
export interface RERecordData {
  recordType: '1';
  sequenceNumber: number;
  insurerNumber: string; // 保険者番号（8桁）
  receiptClass: string; // レセプト種別（4桁）
  patientName: string; // 患者氏名（全角40文字）
  patientKana: string; // 患者カナ氏名（全角25文字）
  birthDate: string; // 生年月日（和暦 gYYMMDD）
  gender: string; // 性別（1桁: 1=男, 2=女）
  treatmentYear: number; // 診療年（西暦4桁）
  treatmentMonth: number; // 診療月（1-12）
  totalPoints: number; // 合計点数
  burdenAmount: number; // 一部負担金額
}

/**
 * 保険者レコード(KO)のデータ
 */
export interface KORecordData {
  recordType: '11';
  sequenceNumber: number;
  insurerNumber: string; // 保険者番号（8桁）
  insuranceCertificateNumber: string; // 被保険者証番号（40文字）
}

/**
 * 保険医療機関レコード(HO)のデータ
 */
export interface HORecordData {
  recordType: '12';
  sequenceNumber: number;
  institutionCode: string; // 医療機関コード（7桁）
  prefectureCode: string; // 都道府県コード（2桁）
  institutionName: string; // 医療機関名称（40文字）
  institutionKana: string; // 医療機関カナ名称（25文字）
}

/**
 * 傷病名レコード(SY)のデータ
 */
export interface SYRecordData {
  recordType: '21';
  sequenceNumber: number;
  diseaseCode: string; // 傷病名コード（ICD-10, 7桁）
  diseaseName: string; // 傷病名（80文字）
  startDate: string; // 発症日（YYYYMMDD）
  outcomeCode: string; // 転帰区分（1桁）
}

/**
 * 診療行為レコード(SI)のデータ
 */
export interface SIRecordData {
  recordType: '22';
  sequenceNumber: number;
  serviceDate: string; // 実施日（YYYYMMDD）
  serviceCode: string; // 診療行為コード（9桁）
  quantity: number; // 回数
  points: number; // 点数
}

/**
 * 特定器材レコード(TO)のデータ
 */
export interface TORecordData {
  recordType: '24';
  sequenceNumber: number;
  materialCode: string; // 特定器材コード（9桁）
  quantity: number; // 数量
  unitPrice: number; // 単価
}

/**
 * 合計レコード(GO)のデータ
 */
export interface GORecordData {
  recordType: '99';
  sequenceNumber: number;
  totalRecords: number; // 総レコード数
  totalPoints: number; // 合計点数
  totalAmount: number; // 合計金額
}

/**
 * 利用者1人分のデータ
 */
export interface CareInsurancePatientData {
  // レセプト基本情報
  receipt: {
    id: string;
    targetYear: number;
    targetMonth: number;
    visitCount: number;
    totalPoints: number;
    totalAmount: number;
  };

  // 患者情報
  patient: {
    id: string;
    patientNumber: string;
    lastName: string;
    firstName: string;
    kanaName: string | null; // 全角カタカナ
    dateOfBirth: Date | string;
    gender: 'male' | 'female' | 'other';
    careLevel: 'support1' | 'support2' | 'care1' | 'care2' | 'care3' | 'care4' | 'care5' | null;
  };

  // 保険証情報
  insuranceCard: {
    insurerNumber: string; // 保険者番号（8桁）
    insuredNumber: string; // 被保険者番号（10桁）
    copaymentRate: '10' | '20' | '30' | null; // 負担割合
    certificationDate: Date | string | null; // 認定日
    validFrom: Date | string;
    validUntil: Date | string | null;
  };

  // 公費情報（優先順位1-3）
  publicExpenses: Array<{
    priority: number; // 1=第一公費, 2=第二公費, 3=第三公費
    legalCategoryNumber: string; // 法別番号
    beneficiaryNumber: string; // 負担者番号（8桁）
    recipientNumber: string | null; // 受給者番号（7桁、医療観察法は不要）
    validFrom: Date | string;
    validUntil: Date | string | null;
  }>;

  // 居宅サービス計画情報
  serviceCarePlan: {
    planDate: Date | string;
    certificationPeriodStart: Date | string | null; // 認定有効期間開始
    certificationPeriodEnd: Date | string | null; // 認定有効期間終了
    planPeriodStart: Date | string | null; // サービス開始年月日
    planPeriodEnd: Date | string | null; // サービス終了年月日
    creatorType: '1' | '2' | '3' | null; // 作成区分コード（1=居宅介護支援事業所, 2=自己作成, 3=介護予防支援事業所）
    careManagerOfficeNumber: string | null; // 居宅介護支援事業所番号（10桁、仮値）
  };

  // 訪問記録一覧（サービス項目ごとにグループ化）
  nursingRecords: Array<{
    id: string;
    visitDate: Date | string;
    serviceCode: string; // 6桁のサービスコード（介護保険）
    serviceTypeCode: string; // サービス種類コード（2桁、先頭2桁）
    serviceItemCode: string; // サービス項目コード（4桁、後4桁）
    points: number; // 単位数
    visitCount: number; // 回数
    totalPoints: number; // サービス単位数（単位数 × 回数）
  }>;

  // 加算履歴（サービスコード選択済みのもののみ）
  bonusHistory: Array<{
    id: string;
    nursingRecordId: string;
    visitDate: Date | string;
    bonusCode: string;
    bonusName: string;
    serviceCode: string; // 6桁のサービスコード
    serviceTypeCode: string; // サービス種類コード（2桁）
    serviceItemCode: string; // サービス項目コード（4桁）
    points: number; // 単位数
    visitCount: number; // 回数
    totalPoints: number; // サービス単位数
  }>;
}

/**
 * 介護保険レセプトCSV生成に必要なデータ（複数利用者対応）
 */
export interface CareInsuranceReceiptCsvData {
  // 施設情報
  facility: {
    facilityCode: string; // 10桁の事業所番号（現在は7桁のfacilityCodeを10桁に拡張）
    prefectureCode: string; // 2桁
    name: string;
  };

  // 対象期間
  targetYear: number;
  targetMonth: number;

  // 利用者データ（複数）
  patients: CareInsurancePatientData[];
}

/**
 * 医療保険レセプトCSV生成に必要なデータ（複数利用者対応）
 */
export interface MedicalInsuranceReceiptCsvData {
  // 施設情報
  facility: {
    facilityCode: string; // 7桁
    prefectureCode: string; // 2桁
    name: string;
    address: string;
    phone: string;
  };

  // 対象期間
  targetYear: number;
  targetMonth: number;

  // レセプトデータ（複数）
  receipts: ReceiptCsvData[];
}
