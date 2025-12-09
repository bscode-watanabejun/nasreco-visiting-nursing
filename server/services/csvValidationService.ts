/**
 * CSV出力バリデーションサービス
 *
 * 医療保険レセプトCSV出力に必要なデータが揃っているかを検証し、
 * 不足データの警告を生成する
 */

import { db } from '../db';
import { eq, and, desc, inArray, gte, lte, isNull } from 'drizzle-orm';
import {
  facilities,
  patients,
  nursingRecords,
  doctorOrders,
  medicalInstitutions,
  monthlyReceipts,
  insuranceCards,
  publicExpenseCards,
  bonusCalculationHistory,
} from '@shared/schema';

export interface ValidationWarning {
  field: string;
  message: string;
  severity: 'error' | 'warning';
  recordType: 'facility' | 'patient' | 'nursingRecord' | 'doctorOrder' | 'medicalInstitution' | 'insuranceCard' | 'publicExpenseCard' | 'receipt';
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

  // 保険番号のチェックは削除（任意フィールドのため）

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
async function validateInsuranceCard(
  patientId: string,
  insuranceType?: 'medical' | 'care',
  facilityId?: string
): Promise<ValidationWarning[]> {
  const warnings: ValidationWarning[] = [];

  // 保険種別に基づいてcardTypeを決定（レセプト詳細APIと同じロジック）
  const cardType = insuranceType === 'medical' ? 'medical' : 'long_term_care';

  // 条件を構築（レセプト詳細APIと同じ条件で保険証を取得）
  const whereConditions = [
    eq(insuranceCards.patientId, patientId),
    eq(insuranceCards.isActive, true),
  ];
  
  // facilityIdが指定されている場合は追加（レセプト詳細APIと同じ条件にするため）
  if (facilityId) {
    whereConditions.push(eq(insuranceCards.facilityId, facilityId));
  }
  
  if (insuranceType) {
    whereConditions.push(eq(insuranceCards.cardType, cardType));
  }

  const cards = await db.query.insuranceCards.findMany({
    where: and(...whereConditions),
    // 最新の保険証を取得（レセプト詳細APIと同じロジック）
    orderBy: desc(insuranceCards.validFrom),
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

  const card = cards[0]; // 最新の有効な保険証を検証

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
 * 
 * @param patientId - 患者ID
 * @param targetMonth - 対象月の1日
 * @param nursingRecords - 訪問記録の配列（オプション）
 * @param skipVisitDateCheck - 訪問日のチェックをスキップするかどうか（validateReceiptで既にチェック済みの場合にtrue）
 */
async function validateDoctorOrder(
  patientId: string,
  targetMonth: Date,
  nursingRecords?: Array<{ visitDate: string | Date }>,
  skipVisitDateCheck: boolean = false
): Promise<ValidationWarning[]> {
  const warnings: ValidationWarning[] = [];

  // 対象月の訪問看護指示書を取得
  const orders = await db.query.doctorOrders.findMany({
    where: and(
      eq(doctorOrders.patientId, patientId),
      eq(doctorOrders.isActive, true)
    ),
  });

  // 訪問記録がある場合で、訪問日のチェックをスキップしない場合のみ、各訪問日が指示書の有効期限内かチェック
  if (nursingRecords && nursingRecords.length > 0 && !skipVisitDateCheck) {
    const invalidVisits: string[] = [];

    nursingRecords.forEach((record) => {
      const visitDate = new Date(record.visitDate);
      const hasValidOrder = orders.some((order) => {
        const startDate = new Date(order.startDate);
        const endDate = new Date(order.endDate);
        return startDate <= visitDate && endDate >= visitDate;
      });

      if (!hasValidOrder) {
        // 訪問日を文字列形式で保存（YYYY-MM-DD形式）
        const dateStr = visitDate.toISOString().split('T')[0];
        invalidVisits.push(dateStr);
      }
    });

    if (invalidVisits.length > 0) {
      warnings.push({
        field: 'doctorOrder',
        message: `以下の訪問日に有効な指示書がありません: ${invalidVisits.join(', ')}`,
        severity: 'error',
        recordType: 'doctorOrder',
      });
      // 訪問記録のチェックでエラーがある場合は、指示書の必須フィールドチェックはスキップ
      return warnings;
    }

    // 訪問記録が全て有効期限内の場合、有効な指示書を取得（必須フィールドチェック用）
    const validOrders = orders.filter(order => {
      // 少なくとも1つの訪問記録が有効期限内である指示書を取得
      return nursingRecords.some(record => {
        const visitDate = new Date(record.visitDate);
        const startDate = new Date(order.startDate);
        const endDate = new Date(order.endDate);
        return startDate <= visitDate && endDate >= visitDate;
      });
    });

    // 指示書の必須フィールドチェック（後続の処理で使用）
    for (const order of validOrders) {
      // Phase 3: 指示書の必須フィールドチェック
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

  // 訪問記録がない場合、または訪問日のチェックをスキップする場合：対象月の期間と重複する指示書を選択
  // レセプト詳細画面と統一: 重複チェック（orderStart <= endDate && orderEnd >= startDate）
  const targetMonthStart = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1);
  const targetMonthEnd = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0);
  
  const validOrders = orders.filter(order => {
    const orderStart = new Date(order.startDate);
    const orderEnd = new Date(order.endDate);
    // 対象月の期間と指示書の有効期間が重複しているかチェック
    return orderStart <= targetMonthEnd && orderEnd >= targetMonthStart;
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

  // Phase 3: 指示書の必須フィールドチェック（訪問記録がない場合、または訪問日のチェックをスキップする場合）
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

  // 対象期間の訪問記録を取得（サービスコードリレーションを含める）
  // 下書きは対象外（完了または確認済みのみ）
  const records = await db.query.nursingRecords.findMany({
    where: and(
      eq(nursingRecords.patientId, patientId),
      inArray(nursingRecords.status, ['completed', 'reviewed']),
      isNull(nursingRecords.deletedAt) // 削除フラグが設定されていない記録のみ取得
    ),
    with: {
      serviceCode: true, // サービスコードリレーションを含める
    },
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

  // 対象期間の訪問記録IDを取得して、加算計算履歴を一括取得
  const recordIds = targetRecords.map(r => r.id);
  const bonusHistories = recordIds.length > 0
    ? await db.query.bonusCalculationHistory.findMany({
        where: inArray(bonusCalculationHistory.nursingRecordId, recordIds),
      })
    : [];
  
  // 訪問記録IDごとの加算計算履歴の有無をMapで管理
  const hasBonusHistoryMap = new Map<string, boolean>();
  for (const history of bonusHistories) {
    hasBonusHistoryMap.set(history.nursingRecordId, true);
  }

  // 同日の訪問記録をグループ化して訪問回数を計算
  const recordsByDate = new Map<string, typeof targetRecords>();
  for (const record of targetRecords) {
    const dateStr = typeof record.visitDate === 'string' 
      ? record.visitDate 
      : String(record.visitDate);
    if (!recordsByDate.has(dateStr)) {
      recordsByDate.set(dateStr, []);
    }
    recordsByDate.get(dateStr)!.push(record);
  }

  // 各訪問記録のチェック
  for (const record of targetRecords) {
    const recordWarnings: string[] = [];

    // 同日の訪問回数を計算
    const dateStr = typeof record.visitDate === 'string' 
      ? record.visitDate 
      : String(record.visitDate);
    const sameDayRecords = recordsByDate.get(dateStr) || [];
    // 訪問日時でソートして順序を決定
    const sortedSameDayRecords = [...sameDayRecords].sort((a, b) => {
      const timeA = a.actualStartTime ? new Date(a.actualStartTime).getTime() : 0;
      const timeB = b.actualStartTime ? new Date(b.actualStartTime).getTime() : 0;
      return timeA - timeB;
    });
    const visitOrder = sortedSameDayRecords.findIndex(r => r.id === record.id) + 1;

    // サービスコードのチェック
    // 同日2回目以降の訪問では基本療養費のサービスコードは適用されないため、未設定でもエラーにしない
    // また、加算が適用されている場合は基本療養費のサービスコードが未設定でもエラーにしない
    if (!record.serviceCodeId) {
      // 1回目の訪問ではサービスコードが必須（ただし、加算が適用されている場合は例外）
      if (visitOrder === 1) {
        // 加算計算履歴がある場合は基本療養費のサービスコードが未設定でもエラーにしない
        const hasBonusHistory = hasBonusHistoryMap.get(record.id) || false;
        if (!hasBonusHistory) {
          recordWarnings.push('サービスコードが設定されていません');
        }
      }
      // 2回目以降の訪問では基本療養費のサービスコードは不要（加算のサービスコードは別途チェック）
    } else if (!record.serviceCode) {
      // サービスコードIDは設定されているが、サービスコードマスタに存在しない
      recordWarnings.push(`サービスコード（ID: ${record.serviceCodeId}）がサービスコードマスタに存在しません`);
    } else if (!record.serviceCode.serviceCode) {
      // サービスコードマスタに存在するが、実際のサービスコードが空
      recordWarnings.push('サービスコードマスタのサービスコードが空です');
    } else if (visitOrder > 1) {
      // 2回目以降の訪問で基本療養費のサービスコードが設定されている場合は警告
      const serviceName = record.serviceCode.serviceName || '';
      if (serviceName.startsWith('訪問看護基本療養費') || 
          serviceName.startsWith('精神科訪問看護基本療養費')) {
        recordWarnings.push('同日2回目以降の訪問では基本療養費のサービスコードは適用されません');
      }
    }

    // 訪問場所コードのチェック
    if (!record.visitLocationCode) {
      recordWarnings.push('訪問場所コードが設定されていません');
    }

    // 職員資格コードのチェック
    if (!record.staffQualificationCode) {
      recordWarnings.push('職員資格コードが設定されていません');
    }

    if (recordWarnings.length > 0) {
      // 日付と時間をフォーマット
      let dateTimeStr: string;
      try {
        // visitDateはdate型なので文字列として扱う
        const dateStr = typeof record.visitDate === 'string' 
          ? record.visitDate 
          : String(record.visitDate);
        
        // 開始時間と終了時間をフォーマット
        const formatTime = (time: Date | string | null): string | null => {
          if (!time) return null;
          
          let date: Date;
          if (time instanceof Date) {
            date = time;
          } else if (typeof time === 'string') {
            date = new Date(time);
          } else {
            date = new Date(String(time));
          }
          
          if (isNaN(date.getTime())) return null;
          
          // 日本時間（JST）で時刻をフォーマット（HH:MM形式）
          return date.toLocaleTimeString('ja-JP', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Tokyo'
          });
        };
        
        const startTime = formatTime(record.actualStartTime);
        const endTime = formatTime(record.actualEndTime);
        
        if (startTime && endTime) {
          dateTimeStr = `${dateStr} ${startTime}～${endTime}`;
        } else if (startTime) {
          dateTimeStr = `${dateStr} ${startTime}`;
        } else {
          dateTimeStr = dateStr;
        }
      } catch (error) {
        // エラーが発生した場合は日付のみを返す
        dateTimeStr = typeof record.visitDate === 'string' 
          ? record.visitDate 
          : String(record.visitDate);
      }

      // 「が設定されていません」で終わるメッセージをまとめる
      const notSetMessages: string[] = [];
      const otherMessages: string[] = [];
      
      for (const warning of recordWarnings) {
        if (warning.endsWith('が設定されていません')) {
          // 「が設定されていません」を除いた項目名を抽出
          const fieldName = warning.replace('が設定されていません', '');
          notSetMessages.push(fieldName);
        } else {
          otherMessages.push(warning);
        }
      }
      
      // メッセージを構築
      const messageParts: string[] = [];
      if (notSetMessages.length > 0) {
        messageParts.push(`${notSetMessages.join('、')}が設定されていません`);
      }
      messageParts.push(...otherMessages);
      
      const finalMessage = messageParts.join('、');

      // 基本療養費のサービスコードに関する警告はwarning、その他はerror
      const hasBasicServiceWarning = recordWarnings.some(w => 
        w.includes('基本療養費のサービスコードは適用されません')
      );
      const severity = hasBasicServiceWarning ? 'warning' : 'error';

      warnings.push({
        field: 'nursingRecord',
        message: `訪問記録（${dateTimeStr}）: ${finalMessage}`,
        severity,
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
  targetMonth: number,
  insuranceType?: 'medical' | 'care' // レセプトIDから取得できない場合のフォールバック
): Promise<ValidationResult> {
  const warnings: ValidationWarning[] = [];

  // 対象月の開始日と終了日
  const startDate = new Date(targetYear, targetMonth - 1, 1);
  const endDate = new Date(targetYear, targetMonth, 0);

  // レセプト情報からinsuranceTypeを取得（レセプト詳細APIと同じ保険証を検証するため）
  // 注意: 複数のレセプトが存在する可能性があるため、最新のレセプトを取得
  const receipt = await db.query.monthlyReceipts.findFirst({
    where: and(
      eq(monthlyReceipts.facilityId, facilityId),
      eq(monthlyReceipts.patientId, patientId),
      eq(monthlyReceipts.targetYear, targetYear),
      eq(monthlyReceipts.targetMonth, targetMonth)
    ),
    orderBy: desc(monthlyReceipts.createdAt), // 最新のレセプトを取得
  });

  // レセプトから取得したinsuranceTypeを使用、取得できない場合は引数で渡されたinsuranceTypeを使用
  const finalInsuranceType = receipt?.insuranceType || insuranceType;

  // 訪問記録を先に取得（指示書のバリデーションで使用するため）
  const nursingRecordWarnings = await validateNursingRecords(patientId, startDate, endDate);
  
  // 対象期間の訪問記録を取得（指示書のバリデーション用）
  const targetNursingRecords = await db.query.nursingRecords.findMany({
    where: and(
      eq(nursingRecords.patientId, patientId),
      gte(nursingRecords.visitDate, startDate.toISOString().split('T')[0]),
      lte(nursingRecords.visitDate, endDate.toISOString().split('T')[0]),
      inArray(nursingRecords.status, ['completed', 'reviewed']),
      isNull(nursingRecords.deletedAt) // 削除フラグが設定されていない記録のみ取得
    ),
  });

  // 各データの検証 (Phase 3: 保険証・公費情報の検証を追加)
  // 注意: validateReceiptで既に訪問日のチェックが行われているため、validateDoctorOrderでは訪問日のチェックをスキップ
  const [
    facilityWarnings,
    patientWarnings,
    insuranceCardWarnings,
    publicExpenseWarnings,
    doctorOrderWarnings,
  ] = await Promise.all([
    validateFacility(facilityId),
    validatePatient(patientId),
    validateInsuranceCard(patientId, finalInsuranceType, facilityId), // facilityIdを追加、finalInsuranceTypeを使用
    validatePublicExpenseCards(patientId),
    validateDoctorOrder(patientId, startDate, targetNursingRecords, true), // skipVisitDateCheck = true
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

  // 医療保険レセプトの場合、心身の状態（JSレコード用）の必須チェック
  if (receipt && finalInsuranceType === 'medical') {
    if (!receipt.mentalPhysicalState || receipt.mentalPhysicalState.trim() === '') {
      warnings.push({
        field: 'mentalPhysicalState',
        message: '心身の状態（JSレコード用）が入力されていません',
        severity: 'error',
        recordType: 'receipt',
      });
    }
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
