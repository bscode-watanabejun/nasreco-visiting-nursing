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
  };

  // 公費負担医療情報（Phase 3: 動的判定用）
  publicExpenses: Array<{
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
    staffQualificationCode: string; // 2桁
    calculatedPoints: number;
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
