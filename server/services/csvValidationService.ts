/**
 * CSV出力バリデーションサービス
 *
 * 医療保険レセプトCSV出力に必要なデータが揃っているかを検証し、
 * 不足データの警告を生成する
 */

import { db } from '../db';
import { eq, and } from 'drizzle-orm';
import {
  facilities,
  patients,
  nursingRecords,
  doctorOrders,
  medicalInstitutions,
  monthlyReceipts,
  insuranceCards,
  publicExpenseCards,
} from '@shared/schema';

export interface ValidationWarning {
  field: string;
  message: string;
  severity: 'error' | 'warning';
  recordType: 'facility' | 'patient' | 'nursingRecord' | 'doctorOrder' | 'medicalInstitution' | 'insuranceCard' | 'publicExpenseCard';
  recordId?: string;
}

export interface ValidationResult {
  isValid: boolean;
  canExportCsv: boolean;
  warnings: ValidationWarning[];
  errors: ValidationWarning[];
}

/**
 * 施設データの検証
 */
async function validateFacility(facilityId: string): Promise<ValidationWarning[]> {
  const warnings: ValidationWarning[] = [];

  const facility = await db.query.facilities.findFirst({
    where: eq(facilities.id, facilityId),
  });

  if (!facility) {
    warnings.push({
      field: 'facility',
      message: '施設情報が見つかりません',
      severity: 'error',
      recordType: 'facility',
    });
    return warnings;
  }

  // 施設コード（7桁）のチェック
  if (!facility.facilityCode) {
    warnings.push({
      field: 'facilityCode',
      message: '施設コードが未設定です（レセプトCSV出力に必要）',
      severity: 'error',
      recordType: 'facility',
      recordId: facilityId,
    });
  } else if (facility.facilityCode.length !== 7) {
    warnings.push({
      field: 'facilityCode',
      message: `施設コードは7桁である必要があります（現在: ${facility.facilityCode.length}桁）`,
      severity: 'error',
      recordType: 'facility',
      recordId: facilityId,
    });
  }

  // 都道府県コードのチェック
  if (!facility.prefectureCode) {
    warnings.push({
      field: 'prefectureCode',
      message: '都道府県コードが未設定です（レセプトCSV出力に必要）',
      severity: 'error',
      recordType: 'facility',
      recordId: facilityId,
    });
  }

  return warnings;
}

/**
 * 患者データの検証
 */
async function validatePatient(patientId: string): Promise<ValidationWarning[]> {
  const warnings: ValidationWarning[] = [];

  const patient = await db.query.patients.findFirst({
    where: eq(patients.id, patientId),
  });

  if (!patient) {
    warnings.push({
      field: 'patient',
      message: '患者情報が見つかりません',
      severity: 'error',
      recordType: 'patient',
    });
    return warnings;
  }

  // カナ氏名のチェック
  if (!patient.kanaName) {
    warnings.push({
      field: 'kanaName',
      message: `患者「${patient.lastName} ${patient.firstName}」のカナ氏名が未設定です`,
      severity: 'warning',
      recordType: 'patient',
      recordId: patientId,
    });
  }

  // 保険番号のチェック
  if (!patient.insuranceNumber) {
    warnings.push({
      field: 'insuranceNumber',
      message: `患者「${patient.lastName} ${patient.firstName}」の保険番号が未設定です`,
      severity: 'error',
      recordType: 'patient',
      recordId: patientId,
    });
  }

  // Phase 3: 保険種別のチェック
  if (!patient.insuranceType) {
    warnings.push({
      field: 'insuranceType',
      message: `患者「${patient.lastName} ${patient.firstName}」の保険種別が未設定です`,
      severity: 'error',
      recordType: 'patient',
      recordId: patientId,
    });
  }

  return warnings;
}

/**
 * 医療機関データの検証
 */
async function validateMedicalInstitution(institutionId: string): Promise<ValidationWarning[]> {
  const warnings: ValidationWarning[] = [];

  const institution = await db.query.medicalInstitutions.findFirst({
    where: eq(medicalInstitutions.id, institutionId),
  });

  if (!institution) {
    warnings.push({
      field: 'medicalInstitution',
      message: '医療機関情報が見つかりません',
      severity: 'error',
      recordType: 'medicalInstitution',
    });
    return warnings;
  }

  // 医療機関コード（7桁）のチェック
  if (!institution.institutionCode) {
    warnings.push({
      field: 'institutionCode',
      message: `医療機関「${institution.name}」の医療機関コードが未設定です`,
      severity: 'error',
      recordType: 'medicalInstitution',
      recordId: institutionId,
    });
  } else if (institution.institutionCode.length !== 7) {
    warnings.push({
      field: 'institutionCode',
      message: `医療機関「${institution.name}」の医療機関コードは7桁である必要があります`,
      severity: 'error',
      recordType: 'medicalInstitution',
      recordId: institutionId,
    });
  }

  // 都道府県コードのチェック
  if (!institution.prefectureCode) {
    warnings.push({
      field: 'prefectureCode',
      message: `医療機関「${institution.name}」の都道府県コードが未設定です`,
      severity: 'error',
      recordType: 'medicalInstitution',
      recordId: institutionId,
    });
  }

  return warnings;
}

/**
 * Phase 3: 保険証情報の検証
 */
async function validateInsuranceCard(patientId: string): Promise<ValidationWarning[]> {
  const warnings: ValidationWarning[] = [];

  const cards = await db.query.insuranceCards.findMany({
    where: and(
      eq(insuranceCards.patientId, patientId),
      eq(insuranceCards.isActive, true)
    ),
  });

  if (cards.length === 0) {
    warnings.push({
      field: 'insuranceCard',
      message: '有効な保険証情報がありません',
      severity: 'error',
      recordType: 'insuranceCard',
    });
    return warnings;
  }

  const card = cards[0]; // 最初の有効な保険証を検証

  // 医療保険の場合、本人家族区分が必須
  if (card.cardType === 'medical' && !card.relationshipType) {
    warnings.push({
      field: 'relationshipType',
      message: '保険証の本人家族区分が未設定です（医療保険の場合は必須）',
      severity: 'error',
      recordType: 'insuranceCard',
      recordId: card.id,
    });
  }

  // 年齢区分のチェック（自動計算されているはずだが、念のため）
  if (!card.ageCategory) {
    warnings.push({
      field: 'ageCategory',
      message: '保険証の年齢区分が未設定です',
      severity: 'warning',
      recordType: 'insuranceCard',
      recordId: card.id,
    });
  }

  return warnings;
}

/**
 * Phase 3: 公費負担医療情報の検証
 */
async function validatePublicExpenseCards(patientId: string): Promise<ValidationWarning[]> {
  const warnings: ValidationWarning[] = [];

  const cards = await db.query.publicExpenseCards.findMany({
    where: and(
      eq(publicExpenseCards.patientId, patientId),
      eq(publicExpenseCards.isActive, true)
    ),
  });

  // 公費は任意なので、0枚でもOK
  for (const card of cards) {
    // 法別番号のチェック（2桁）
    if (!card.legalCategoryNumber) {
      warnings.push({
        field: 'legalCategoryNumber',
        message: `公費負担医療カード（優先順位${card.priority}）の法別番号が未設定です`,
        severity: 'error',
        recordType: 'publicExpenseCard',
        recordId: card.id,
      });
    } else if (card.legalCategoryNumber.length !== 2 || !/^\d{2}$/.test(card.legalCategoryNumber)) {
      warnings.push({
        field: 'legalCategoryNumber',
        message: `公費負担医療カード（優先順位${card.priority}）の法別番号は2桁の数字である必要があります`,
        severity: 'error',
        recordType: 'publicExpenseCard',
        recordId: card.id,
      });
    }

    // 負担者番号のチェック
    if (!card.beneficiaryNumber) {
      warnings.push({
        field: 'beneficiaryNumber',
        message: `公費負担医療カード（優先順位${card.priority}）の負担者番号が未設定です`,
        severity: 'error',
        recordType: 'publicExpenseCard',
        recordId: card.id,
      });
    }

    // 受給者番号のチェック
    if (!card.recipientNumber) {
      warnings.push({
        field: 'recipientNumber',
        message: `公費負担医療カード（優先順位${card.priority}）の受給者番号が未設定です`,
        severity: 'error',
        recordType: 'publicExpenseCard',
        recordId: card.id,
      });
    }

    // 優先順位のチェック
    if (card.priority < 1 || card.priority > 4) {
      warnings.push({
        field: 'priority',
        message: `公費負担医療カードの優先順位は1-4の範囲内である必要があります（現在: ${card.priority}）`,
        severity: 'error',
        recordType: 'publicExpenseCard',
        recordId: card.id,
      });
    }
  }

  return warnings;
}

/**
 * 訪問看護指示書データの検証
 */
async function validateDoctorOrder(patientId: string, targetMonth: Date): Promise<ValidationWarning[]> {
  const warnings: ValidationWarning[] = [];

  // 対象月の訪問看護指示書を取得
  const orders = await db.query.doctorOrders.findMany({
    where: and(
      eq(doctorOrders.patientId, patientId),
      eq(doctorOrders.isActive, true)
    ),
  });

  // 対象月をカバーする有効な指示書があるかチェック
  const validOrders = orders.filter(order => {
    const startDate = new Date(order.startDate);
    const endDate = new Date(order.endDate);
    return startDate <= targetMonth && endDate >= targetMonth;
  });

  if (validOrders.length === 0) {
    warnings.push({
      field: 'doctorOrder',
      message: '対象月の有効な訪問看護指示書がありません',
      severity: 'error',
      recordType: 'doctorOrder',
    });
    return warnings;
  }

  // Phase 3: 指示書の必須フィールドチェック
  for (const order of validOrders) {
    // ICD-10コードのチェック
    if (!order.icd10Code) {
      warnings.push({
        field: 'icd10Code',
        message: '訪問看護指示書にICD-10コードが未設定です',
        severity: 'warning',
        recordType: 'doctorOrder',
        recordId: order.id,
      });
    } else if (order.icd10Code.length > 7 || !/^[A-Z0-9]+$/.test(order.icd10Code)) {
      warnings.push({
        field: 'icd10Code',
        message: `ICD-10コードの形式が正しくありません（7桁以内の英数字: ${order.icd10Code}）`,
        severity: 'error',
        recordType: 'doctorOrder',
        recordId: order.id,
      });
    }

    // 保険種別のチェック
    if (!order.insuranceType) {
      warnings.push({
        field: 'insuranceType',
        message: '訪問看護指示書の保険種別が未設定です',
        severity: 'error',
        recordType: 'doctorOrder',
        recordId: order.id,
      });
    }

    // 指示区分のチェック
    if (!order.instructionType) {
      warnings.push({
        field: 'instructionType',
        message: '訪問看護指示書の指示区分が未設定です',
        severity: 'error',
        recordType: 'doctorOrder',
        recordId: order.id,
      });
    }
  }

  return warnings;
}

/**
 * 訪問記録データの検証
 */
async function validateNursingRecords(
  patientId: string,
  startDate: Date,
  endDate: Date
): Promise<ValidationWarning[]> {
  const warnings: ValidationWarning[] = [];

  // 対象期間の訪問記録を取得
  const records = await db.query.nursingRecords.findMany({
    where: eq(nursingRecords.patientId, patientId),
  });

  const targetRecords = records.filter(record => {
    const visitDate = new Date(record.visitDate);
    return visitDate >= startDate && visitDate <= endDate;
  });

  if (targetRecords.length === 0) {
    warnings.push({
      field: 'nursingRecords',
      message: '対象期間の訪問記録がありません',
      severity: 'warning',
      recordType: 'nursingRecord',
    });
    return warnings;
  }

  // 各訪問記録のチェック
  for (const record of targetRecords) {
    const recordWarnings: string[] = [];

    // サービスコードのチェック
    if (!record.serviceCodeId) {
      recordWarnings.push('サービスコード');
    }

    // 訪問場所コードのチェック
    if (!record.visitLocationCode) {
      recordWarnings.push('訪問場所コード');
    }

    // 職員資格コードのチェック
    if (!record.staffQualificationCode) {
      recordWarnings.push('職員資格コード');
    }

    if (recordWarnings.length > 0) {
      warnings.push({
        field: 'nursingRecord',
        message: `訪問記録（${record.visitDate}）に未設定項目があります: ${recordWarnings.join('、')}`,
        severity: 'warning',
        recordType: 'nursingRecord',
        recordId: record.id,
      });
    }
  }

  return warnings;
}

/**
 * 月次レセプトのデータ検証
 */
export async function validateMonthlyReceiptData(
  facilityId: string,
  patientId: string,
  targetYear: number,
  targetMonth: number
): Promise<ValidationResult> {
  const warnings: ValidationWarning[] = [];

  // 対象月の開始日と終了日
  const startDate = new Date(targetYear, targetMonth - 1, 1);
  const endDate = new Date(targetYear, targetMonth, 0);

  // 各データの検証 (Phase 3: 保険証・公費情報の検証を追加)
  const [
    facilityWarnings,
    patientWarnings,
    insuranceCardWarnings,
    publicExpenseWarnings,
    doctorOrderWarnings,
    nursingRecordWarnings,
  ] = await Promise.all([
    validateFacility(facilityId),
    validatePatient(patientId),
    validateInsuranceCard(patientId),
    validatePublicExpenseCards(patientId),
    validateDoctorOrder(patientId, startDate),
    validateNursingRecords(patientId, startDate, endDate),
  ]);

  warnings.push(
    ...facilityWarnings,
    ...patientWarnings,
    ...insuranceCardWarnings,
    ...publicExpenseWarnings,
    ...doctorOrderWarnings,
    ...nursingRecordWarnings
  );

  // 医療機関の検証（訪問看護指示書から取得）
  const orders = await db.query.doctorOrders.findMany({
    where: and(
      eq(doctorOrders.patientId, patientId),
      eq(doctorOrders.isActive, true)
    ),
  });

  for (const order of orders) {
    const institutionWarnings = await validateMedicalInstitution(order.medicalInstitutionId);
    warnings.push(...institutionWarnings);
  }

  // エラーと警告を分類
  const errors = warnings.filter(w => w.severity === 'error');
  const warningsOnly = warnings.filter(w => w.severity === 'warning');

  return {
    isValid: errors.length === 0,
    canExportCsv: errors.length === 0,
    warnings: warningsOnly,
    errors,
  };
}

/**
 * 複数の月次レセプトをバッチ検証
 */
export async function validateMultipleReceipts(
  receiptIds: string[]
): Promise<Map<string, ValidationResult>> {
  const results = new Map<string, ValidationResult>();

  for (const receiptId of receiptIds) {
    const receipt = await db.query.monthlyReceipts.findFirst({
      where: eq(monthlyReceipts.id, receiptId),
    });

    if (!receipt) {
      results.set(receiptId, {
        isValid: false,
        canExportCsv: false,
        warnings: [],
        errors: [{
          field: 'receipt',
          message: 'レセプト情報が見つかりません',
          severity: 'error',
          recordType: 'facility',
        }],
      });
      continue;
    }

    const result = await validateMonthlyReceiptData(
      receipt.facilityId,
      receipt.patientId,
      receipt.targetYear,
      receipt.targetMonth
    );

    results.set(receiptId, result);
  }

  return results;
}
