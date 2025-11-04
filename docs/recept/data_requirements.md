# データ要件チェックリスト

CSV出力に必要な全データ項目と、その充足状況を確認するためのチェックリスト。

## チェック対象カテゴリ

1. 施設情報（Facility）
2. 患者情報（Patient）
3. 保険証情報（Insurance Card）
4. 医療機関情報（Medical Institution）
5. 医師指示書情報（Doctor Order）
6. 訪問記録情報（Nursing Record）

---

## 1. 施設情報チェック

### 必須データ

| 項目名 | フィールド | 検証ルール | エラーレベル |
|--------|-----------|-----------|------------|
| 施設コード | facilityCode | 7桁の数字 | error |
| 都道府県コード | prefectureCode | 01-47の範囲 | error |
| 施設名称 | name | 1文字以上、全角20文字以内 | error |
| 電話番号 | phone | ハイフン含む15文字以内 | warning |

### チェック関数

```typescript
interface FacilityValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

function validateFacility(facility: Facility): FacilityValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 施設コード
  if (!facility.facilityCode) {
    errors.push('施設コードが未入力です');
  } else if (!/^\d{7}$/.test(facility.facilityCode)) {
    errors.push('施設コードは7桁の数字である必要があります');
  }

  // 都道府県コード
  if (!facility.prefectureCode) {
    errors.push('都道府県コードが未入力です');
  } else {
    const code = parseInt(facility.prefectureCode);
    if (code < 1 || code > 47) {
      errors.push('都道府県コードは01-47の範囲である必要があります');
    }
  }

  // 施設名称
  if (!facility.name || facility.name.trim().length === 0) {
    errors.push('施設名称が未入力です');
  } else if (facility.name.length > 20) {
    errors.push('施設名称は全角20文字以内である必要があります');
  }

  // 電話番号
  if (!facility.phone) {
    warnings.push('電話番号が未入力です');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
```

---

## 2. 患者情報チェック

### 必須データ

| 項目名 | フィールド | 検証ルール | エラーレベル |
|--------|-----------|-----------|------------|
| カナ氏名 | kanaName | 全角カタカナ、50文字以内 | error |
| 漢字氏名 | name | 1文字以上、全角50文字以内 | error |
| 性別 | gender | 'male' または 'female' | error |
| 生年月日 | dateOfBirth | 妥当な日付 | error |
| 患者番号 | patientNumber | 1文字以上 | error |

### チェック関数

```typescript
function validatePatient(patient: Patient): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // カナ氏名
  if (!patient.kanaName) {
    errors.push('カナ氏名が未入力です');
  } else {
    // 全角カタカナのみ（ァ-ヶー・空白）
    if (!/^[ァ-ヶー\s]+$/.test(patient.kanaName)) {
      errors.push('カナ氏名は全角カタカナのみである必要があります');
    }
    if (patient.kanaName.length > 25) {
      errors.push('カナ氏名は全角25文字以内である必要があります');
    }
  }

  // 漢字氏名
  if (!patient.name || patient.name.trim().length === 0) {
    errors.push('氏名が未入力です');
  } else if (patient.name.length > 50) {
    errors.push('氏名は全角50文字以内である必要があります');
  }

  // 性別
  if (!patient.gender || !['male', 'female'].includes(patient.gender)) {
    errors.push('性別が正しく設定されていません');
  }

  // 生年月日
  if (!patient.dateOfBirth) {
    errors.push('生年月日が未入力です');
  } else {
    const birthDate = new Date(patient.dateOfBirth);
    const today = new Date();
    if (birthDate > today) {
      errors.push('生年月日が未来の日付です');
    }
    if (today.getFullYear() - birthDate.getFullYear() > 120) {
      warnings.push('生年月日が120年以上前です。正しいか確認してください');
    }
  }

  // 患者番号
  if (!patient.patientNumber) {
    errors.push('患者番号が未入力です');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
```

---

## 3. 保険証情報チェック

### 必須データ

| 項目名 | フィールド | 検証ルール | エラーレベル |
|--------|-----------|-----------|------------|
| 保険者番号 | insurerNumber | 8桁の数字 | error |
| 被保険者証番号 | cardNumber | 1文字以上、38バイト以内 | error |
| 被保険者証記号 | cardSymbol | 38バイト以内 | warning |
| 本人家族区分 | relationshipType | 'self' または 'family' | warning |
| 有効期間(開始) | validFrom | 妥当な日付 | error |
| 有効期間(終了) | validTo | 妥当な日付 | warning |
| 確認方法 | confirmationMethod | 別表24の値 | error |
| 枝番 | branchNumber | 2桁以内の数字 | warning |

### チェック関数

```typescript
function validateInsuranceCard(
  insurance: InsuranceCard,
  billingYear: number,
  billingMonth: number
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 保険者番号
  if (!insurance.insurerNumber) {
    errors.push('保険者番号が未入力です');
  } else if (!/^\d{8}$/.test(insurance.insurerNumber)) {
    errors.push('保険者番号は8桁の数字である必要があります');
  }

  // 被保険者証番号
  if (!insurance.cardNumber) {
    errors.push('被保険者証番号が未入力です');
  } else {
    const byteLength = iconv.encode(insurance.cardNumber, 'Shift_JIS').length;
    if (byteLength > 38) {
      errors.push('被保険者証番号は38バイト以内である必要があります');
    }
  }

  // 被保険者証記号
  if (insurance.cardSymbol) {
    const byteLength = iconv.encode(insurance.cardSymbol, 'Shift_JIS').length;
    if (byteLength > 38) {
      warnings.push('被保険者証記号は38バイト以内である必要があります');
    }
  }

  // 有効期間
  if (!insurance.validFrom) {
    errors.push('有効期間(開始)が未入力です');
  }

  const billingDate = new Date(billingYear, billingMonth - 1, 1);
  if (insurance.validFrom && new Date(insurance.validFrom) > billingDate) {
    errors.push('有効期間(開始)が請求年月より後です');
  }

  if (insurance.validTo && new Date(insurance.validTo) < billingDate) {
    errors.push('有効期間(終了)が請求年月より前です');
  }

  // 確認方法
  const validConfirmationMethods = ['online', 'certificate', 'notification', 'special_disease', 'limit', 'bill_to_insurer'];
  if (!insurance.confirmationMethod || !validConfirmationMethods.includes(insurance.confirmationMethod)) {
    errors.push('資格確認方法が設定されていません');
  }

  // 枝番
  if (insurance.branchNumber && !/^\d{1,2}$/.test(insurance.branchNumber.toString())) {
    warnings.push('枝番は2桁以内の数字である必要があります');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
```

---

## 4. 医療機関情報チェック

### 必須データ

| 項目名 | フィールド | 検証ルール | エラーレベル |
|--------|-----------|-----------|------------|
| 医療機関コード | institutionCode | 7桁の数字 | error |
| 都道府県コード | prefectureCode | 01-47の範囲 | error |
| 医療機関名称 | name | 1文字以上、全角20文字以内 | error |

### チェック関数

```typescript
function validateMedicalInstitution(institution: MedicalInstitution): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 医療機関コード
  if (!institution.institutionCode) {
    errors.push('医療機関コードが未入力です');
  } else if (!/^\d{7}$/.test(institution.institutionCode)) {
    errors.push('医療機関コードは7桁の数字である必要があります');
  }

  // 都道府県コード
  if (!institution.prefectureCode) {
    errors.push('都道府県コードが未入力です');
  } else {
    const code = parseInt(institution.prefectureCode);
    if (code < 1 || code > 47) {
      errors.push('都道府県コードは01-47の範囲である必要があります');
    }
  }

  // 医療機関名称
  if (!institution.name || institution.name.trim().length === 0) {
    errors.push('医療機関名称が未入力です');
  } else if (institution.name.length > 20) {
    errors.push('医療機関名称は全角20文字以内である必要があります');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
```

---

## 5. 医師指示書情報チェック

### 必須データ

| 項目名 | フィールド | 検証ルール | エラーレベル |
|--------|-----------|-----------|------------|
| ICD-10コード | icd10Code | ICD-10形式、7桁 | error |
| 診断名 | diagnosis | 1文字以上、全角40文字以内 | error |
| 医師氏名 | doctorName | 1文字以上、全角20文字以内 | error |
| 指示区分 | orderType | 別表12の値 | error |
| 指示期間(開始) | validFrom | 妥当な日付 | error |
| 指示期間(終了) | validTo | 妥当な日付 | error |
| 診療開始日 | diagnosisDate | 妥当な日付 | warning |

### チェック関数

```typescript
function validateDoctorOrder(
  order: DoctorOrder,
  billingYear: number,
  billingMonth: number
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ICD-10コード
  if (!order.icd10Code) {
    errors.push('ICD-10コードが未入力です');
  } else if (!/^[A-Z]\d{2}/.test(order.icd10Code)) {
    errors.push('ICD-10コードの形式が正しくありません');
  }

  // 診断名
  if (!order.diagnosis || order.diagnosis.trim().length === 0) {
    errors.push('診断名が未入力です');
  } else if (order.diagnosis.length > 40) {
    errors.push('診断名は全角40文字以内である必要があります');
  }

  // 医師氏名
  if (!order.doctorName || order.doctorName.trim().length === 0) {
    errors.push('医師氏名が未入力です');
  } else if (order.doctorName.length > 20) {
    errors.push('医師氏名は全角20文字以内である必要があります');
  }

  // 指示区分
  const validOrderTypes = ['regular', 'special', 'psychiatric', 'infusion'];
  if (!order.orderType || !validOrderTypes.includes(order.orderType)) {
    errors.push('指示区分が設定されていません');
  }

  // 指示期間
  if (!order.validFrom) {
    errors.push('指示期間(開始)が未入力です');
  }
  if (!order.validTo) {
    errors.push('指示期間(終了)が未入力です');
  }

  if (order.validFrom && order.validTo) {
    if (new Date(order.validFrom) > new Date(order.validTo)) {
      errors.push('指示期間(開始)が指示期間(終了)より後です');
    }

    // 請求年月が指示期間内にあるか確認
    const billingDate = new Date(billingYear, billingMonth - 1, 1);
    const billingEndDate = new Date(billingYear, billingMonth, 0); // 月末
    if (new Date(order.validTo) < billingDate || new Date(order.validFrom) > billingEndDate) {
      errors.push('指示期間が請求年月をカバーしていません');
    }
  }

  // 診療開始日
  if (!order.diagnosisDate) {
    warnings.push('診療開始日が未入力です');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
```

---

## 6. 訪問記録情報チェック

### 必須データ

| 項目名 | フィールド | 検証ルール | エラーレベル |
|--------|-----------|-----------|------------|
| 訪問日 | visitDate | 請求年月内の日付 | error |
| サービスコード | serviceCodeId | nursing_service_codesへの参照 | error |
| 訪問場所コード | visitLocationCode | 別表16の値 | error |
| 職員資格コード | staffQualificationCode | 別表20の値 | error |
| 実際の開始時刻 | actualStartTime | HH:MM:SS形式 | warning |
| 実際の終了時刻 | actualEndTime | HH:MM:SS形式 | warning |
| 同日訪問回数 | visitCountOfDay | 01, 02, 03 | warning |

### チェック関数

```typescript
function validateNursingRecord(
  record: NursingRecord,
  billingYear: number,
  billingMonth: number,
  serviceCode: NursingServiceCode
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 訪問日
  if (!record.visitDate) {
    errors.push('訪問日が未入力です');
  } else {
    const visitDate = new Date(record.visitDate);
    const year = visitDate.getFullYear();
    const month = visitDate.getMonth() + 1;
    if (year !== billingYear || month !== billingMonth) {
      errors.push('訪問日が請求年月外です');
    }
  }

  // サービスコード
  if (!record.serviceCodeId) {
    errors.push('サービスコードが未選択です');
  } else if (!serviceCode) {
    errors.push('サービスコードが存在しません');
  } else if (!serviceCode.isActive) {
    warnings.push('サービスコードが無効化されています');
  }

  // 訪問場所コード
  if (!record.visitLocationCode) {
    errors.push('訪問場所コードが未選択です');
  } else if (!/^\d{2}$/.test(record.visitLocationCode)) {
    errors.push('訪問場所コードは2桁の数字である必要があります');
  }

  // 職員資格コード
  if (!record.staffQualificationCode) {
    errors.push('職員資格コードが未選択です');
  } else if (!/^\d{2}$/.test(record.staffQualificationCode)) {
    errors.push('職員資格コードは2桁の数字である必要があります');
  }

  // 時刻
  if (!record.actualStartTime) {
    warnings.push('開始時刻が未入力です');
  }
  if (!record.actualEndTime) {
    warnings.push('終了時刻が未入力です');
  }

  if (record.actualStartTime && record.actualEndTime) {
    if (record.actualStartTime >= record.actualEndTime) {
      errors.push('開始時刻が終了時刻以降です');
    }
  }

  // 同日訪問回数
  if (record.visitCountOfDay && !['01', '02', '03'].includes(record.visitCountOfDay)) {
    warnings.push('同日訪問回数は01, 02, 03のいずれかである必要があります');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
```

---

## 7. レセプト全体のチェック

### 統合チェック

```typescript
interface ReceiptValidationResult {
  isReady: boolean;
  errors: CsvExportWarning[];
  warnings: CsvExportWarning[];
  checkedAt: Date;
}

interface CsvExportWarning {
  category: 'facility' | 'patient' | 'insurance' | 'doctor_order' | 'nursing_record' | 'medical_institution';
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

async function validateReceiptForCsvExport(
  receiptId: string
): Promise<ReceiptValidationResult> {
  const errors: CsvExportWarning[] = [];
  const warnings: CsvExportWarning[] = [];

  // データ取得
  const receipt = await fetchReceiptData(receiptId);

  if (!receipt) {
    errors.push({
      category: 'patient',
      field: 'receipt',
      message: 'レセプトが見つかりません',
      severity: 'error',
    });
    return {
      isReady: false,
      errors,
      warnings,
      checkedAt: new Date(),
    };
  }

  // 1. 施設情報チェック
  const facilityResult = validateFacility(receipt.facility);
  facilityResult.errors.forEach(msg => {
    errors.push({ category: 'facility', field: 'facility', message: msg, severity: 'error' });
  });
  facilityResult.warnings.forEach(msg => {
    warnings.push({ category: 'facility', field: 'facility', message: msg, severity: 'warning' });
  });

  // 2. 患者情報チェック
  const patientResult = validatePatient(receipt.patient);
  patientResult.errors.forEach(msg => {
    errors.push({ category: 'patient', field: 'patient', message: msg, severity: 'error' });
  });
  patientResult.warnings.forEach(msg => {
    warnings.push({ category: 'patient', field: 'patient', message: msg, severity: 'warning' });
  });

  // 3. 保険証情報チェック
  const insuranceResult = validateInsuranceCard(
    receipt.insuranceCard,
    receipt.billingYear,
    receipt.billingMonth
  );
  insuranceResult.errors.forEach(msg => {
    errors.push({ category: 'insurance', field: 'insuranceCard', message: msg, severity: 'error' });
  });
  insuranceResult.warnings.forEach(msg => {
    warnings.push({ category: 'insurance', field: 'insuranceCard', message: msg, severity: 'warning' });
  });

  // 4. 医療機関情報チェック
  receipt.doctorOrders.forEach(order => {
    const institutionResult = validateMedicalInstitution(order.medicalInstitution);
    institutionResult.errors.forEach(msg => {
      errors.push({ category: 'medical_institution', field: 'medicalInstitution', message: msg, severity: 'error' });
    });
  });

  // 5. 医師指示書情報チェック
  if (receipt.doctorOrders.length === 0) {
    errors.push({
      category: 'doctor_order',
      field: 'doctorOrders',
      message: '医師指示書が登録されていません',
      severity: 'error',
    });
  }

  receipt.doctorOrders.forEach(order => {
    const orderResult = validateDoctorOrder(order, receipt.billingYear, receipt.billingMonth);
    orderResult.errors.forEach(msg => {
      errors.push({ category: 'doctor_order', field: 'doctorOrder', message: msg, severity: 'error' });
    });
    orderResult.warnings.forEach(msg => {
      warnings.push({ category: 'doctor_order', field: 'doctorOrder', message: msg, severity: 'warning' });
    });
  });

  // 6. 訪問記録情報チェック
  if (receipt.nursingRecords.length === 0) {
    errors.push({
      category: 'nursing_record',
      field: 'nursingRecords',
      message: '訪問記録が登録されていません',
      severity: 'error',
    });
  }

  receipt.nursingRecords.forEach(record => {
    const recordResult = validateNursingRecord(
      record,
      receipt.billingYear,
      receipt.billingMonth,
      record.serviceCode
    );
    recordResult.errors.forEach(msg => {
      errors.push({ category: 'nursing_record', field: 'nursingRecord', message: msg, severity: 'error' });
    });
    recordResult.warnings.forEach(msg => {
      warnings.push({ category: 'nursing_record', field: 'nursingRecord', message: msg, severity: 'warning' });
    });
  });

  return {
    isReady: errors.length === 0,
    errors,
    warnings,
    checkedAt: new Date(),
  };
}
```

---

## 8. チェック実行タイミング

### 自動チェック
1. **月次レセプト生成時**: レセプトを新規作成した時点でチェック実行
2. **レセプト確定時**: 確定ボタン押下時に再チェック
3. **CSV出力ボタン押下時**: 出力前に最終チェック

### 手動チェック
1. **月次レセプト管理画面**: 「CSV出力可否チェック」ボタンでオンデマンドチェック
2. **レセプト詳細画面**: 詳細画面でもチェック実行可能

---

## 9. チェック結果の表示

### 月次レセプト一覧画面
```tsx
{receipt.csvExportReady ? (
  <CheckCircle className="h-5 w-5 text-green-500" />
) : (
  <Tooltip>
    <TooltipTrigger>
      <AlertCircle className="h-5 w-5 text-red-500" />
    </TooltipTrigger>
    <TooltipContent>
      <div className="space-y-1">
        <p className="font-semibold">CSV出力不可</p>
        {receipt.csvExportWarnings.map((warning, idx) => (
          <p key={idx} className="text-sm">{warning.message}</p>
        ))}
      </div>
    </TooltipContent>
  </Tooltip>
)}
```

### 警告ダイアログ
CSV出力ボタン押下時に不足データがある場合:
```tsx
<AlertDialog>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>CSV出力できません</AlertDialogTitle>
      <AlertDialogDescription>
        以下のデータが不足しています:
        <ul className="mt-2 space-y-1">
          {warnings.map((warning, idx) => (
            <li key={idx} className="text-red-600">
              • {warning.message}
            </li>
          ))}
        </ul>
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogAction>確認</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

---

## 10. 既存データの補完

### データ移行スクリプト

既存データに対して不足フィールドを補完するスクリプト:

```typescript
// scripts/補完ExistingData.ts

async function backfillMissingData() {
  // 1. 患者のカナ氏名を補完（手動入力が必要）
  const patientsWithoutKana = await db.query.patients.findMany({
    where: or(isNull(patients.kanaName), eq(patients.kanaName, '')),
  });
  console.log(`カナ氏名未入力の患者: ${patientsWithoutKana.length}件`);

  // 2. 医療機関コード未入力の医療機関
  const institutionsWithoutCode = await db.query.medicalInstitutions.findMany({
    where: or(isNull(medicalInstitutions.institutionCode), eq(medicalInstitutions.institutionCode, '')),
  });
  console.log(`医療機関コード未入力の医療機関: ${institutionsWithoutCode.length}件`);

  // 3. ICD-10コード未入力の診断
  const ordersWithoutIcd10 = await db.query.doctorOrders.findMany({
    where: or(isNull(doctorOrders.icd10Code), eq(doctorOrders.icd10Code, '')),
  });
  console.log(`ICD-10コード未入力の診断: ${ordersWithoutIcd10.length}件`);

  // 4. サービスコード未入力の訪問記録
  const recordsWithoutServiceCode = await db.query.nursingRecords.findMany({
    where: isNull(nursingRecords.serviceCodeId),
  });
  console.log(`サービスコード未入力の訪問記録: ${recordsWithoutServiceCode.length}件`);

  // CSVでエクスポートして手動補完を促す
  // ...
}
```

---

## 変更履歴

| 日付 | 変更内容 | 担当者 |
|------|---------|--------|
| 2025-11-03 | 初版作成 | - |
