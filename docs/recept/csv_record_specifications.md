# CSVレコード仕様詳細 - データソースマッピング

このドキュメントは、18種類のCSVレコードタイプごとに、どのデータベーステーブルからどのフィールドを取得するかを明確に定義します。

## データ取得の全体像

```
monthly_receipts (月次レセプト)
├─ facility (施設情報) → HM
├─ patient (患者情報) → RE, RJ
├─ insurance_card (保険証情報) → HO, SN
├─ public_expense (公費情報) → KO, SN
├─ doctor_order (医師指示書) → HJ, JS, SY
├─ medical_institution (医療機関) → IH
├─ nursing_records (訪問記録) → JD, KA
├─ bonus_calculation_history (加算計算履歴) → KA
└─ その他のマスターテーブル
```

---

## 1. HM - 訪問看護ステーション情報レコード

### 目的
ファイル全体のヘッダー。施設情報と請求年月を記録。

### フィールドとデータソース

| 項目名 | データソース | テーブル | フィールド | 変換 | 必須 |
|--------|------------|---------|-----------|------|-----|
| レコード識別情報 | 固定値 | - | - | "HM" | ○ |
| 審査支払機関 | 固定値 | - | - | "7" (社会保険診療報酬支払基金) | ○ |
| 都道府県 | facilities | prefectureCode | 2桁 | ○ |
| 点数表 | 固定値 | - | - | "1" (医科) | ○ |
| 訪問看護ステーションコード | facilities | facilityCode | 7桁 | ○ |
| 訪問看護ステーション名称 | facilities | name | 全角最大20文字 | ○ |
| 請求年月 | パラメータ | year, month | YYYYMM | ○ |
| 電話番号 | facilities | phone | ハイフン含む | △ |

### 実装例

```typescript
function generateHMRecord(
  facility: Facility,
  year: number,
  month: number
): string[] {
  return [
    'HM',
    '7', // 審査支払機関（固定）
    formatFixed(facility.prefectureCode, 2), // 都道府県
    '1', // 点数表（固定: 医科）
    formatFixed(facility.facilityCode, 7), // 施設コード
    formatVariable(facility.name, 40), // 施設名称（漢字最大20文字=40バイト）
    `${year}${month.toString().padStart(2, '0')}`, // 請求年月
    formatVariable(facility.phone || '', 15), // 電話番号（任意）
  ];
}
```

### バリデーション

- [ ] `facility.prefectureCode` が2桁の数字
- [ ] `facility.facilityCode` が7桁の数字
- [ ] `facility.name` が存在
- [ ] `year` と `month` が妥当な値

---

## 2. GO - 訪問看護療養費請求書レコード

### 目的
請求書の開始を示すマーカー。

### フィールドとデータソース

| 項目名 | データソース | テーブル | フィールド | 変換 | 必須 |
|--------|------------|---------|-----------|------|-----|
| レコード識別情報 | 固定値 | - | - | "GO" | ○ |

### 実装例

```typescript
function generateGORecord(): string[] {
  return ['GO'];
}
```

---

## 3. RE - レセプト共通レコード

### 目的
個別レセプトの基本情報（患者情報、合計点数）。

### フィールドとデータソース

| 項目名 | データソース | テーブル | フィールド | 変換 | 必須 |
|--------|------------|---------|-----------|------|-----|
| レコード識別情報 | 固定値 | - | - | "RE" | ○ |
| レセプト番号 | monthlyReceipts | receiptNumber | 7桁ゼロ埋め | ○ |
| レセプト種別 | 計算 | insuranceType等 | 別表4コード | ○ |
| 請求年月 | monthlyReceipts | billingYear, billingMonth | YYYYMM | ○ |
| 氏名(カナ) | patients | kanaName | 全角カナ最大25文字 | ○ |
| 氏名(漢字) | patients | name | 全角漢字最大50文字 | ○ |
| 男女区分 | patients | gender | 1:男, 2:女 | ○ |
| 生年月日 | patients | dateOfBirth | YYYYMMDD | ○ |
| 予備(旧:再入院等区分) | - | - | 省略 | × |
| 予備(旧:再入院等年月日) | - | - | 省略 | × |
| 合計点数 | monthlyReceipts | totalPoints | 数字 | △ |
| 予備 | - | - | 省略 | × |

### レセプト種別の判定ロジック

```typescript
function determineReceiptType(receipt: MonthlyReceipt, insurance: InsuranceCard): string {
  // 別表4に基づく判定
  if (receipt.insuranceType === 'medical') {
    if (insurance.insuranceType === 'health_insurance') {
      return '3110'; // 訪問看護療養費（健康保険）
    } else if (insurance.insuranceType === 'national_health_insurance') {
      return '3120'; // 訪問看護療養費（国民健康保険）
    } else if (insurance.insuranceType === 'late_stage_elderly') {
      return '3130'; // 訪問看護療養費（後期高齢者医療）
    }
  }
  throw new Error('Unknown receipt type');
}
```

### 実装例

```typescript
function generateRERecord(
  receipt: MonthlyReceipt,
  patient: Patient,
  insurance: InsuranceCard
): string[] {
  return [
    'RE',
    formatFixed(receipt.receiptNumber?.toString() || '1', 7), // レセプト番号
    determineReceiptType(receipt, insurance), // レセプト種別
    `${receipt.billingYear}${receipt.billingMonth.toString().padStart(2, '0')}`, // 請求年月
    formatVariable(patient.kanaName, 50), // カナ氏名
    formatVariable(patient.name, 100), // 漢字氏名
    patient.gender === 'male' ? '1' : '2', // 男女区分
    formatDate(patient.dateOfBirth), // 生年月日(YYYYMMDD)
    '', // 予備(旧:再入院等区分)
    '', // 予備(旧:再入院等年月日)
    formatVariable(receipt.totalPoints?.toString() || '', 7), // 合計点数
    '', // 予備
  ];
}
```

### バリデーション

- [ ] `patient.kanaName` が存在し、全角カタカナのみ
- [ ] `patient.name` が存在
- [ ] `patient.gender` が 'male' または 'female'
- [ ] `patient.dateOfBirth` が妥当な日付
- [ ] `receipt.totalPoints` が計算済み

---

## 4. HO - 保険者レコード

### 目的
保険証情報を記録。

### フィールドとデータソース

| 項目名 | データソース | テーブル | フィールド | 変換 | 必須 |
|--------|------------|---------|-----------|------|-----|
| レコード識別情報 | 固定値 | - | - | "HO" | ○ |
| 保険者番号 | insuranceCards | insurerNumber | 8桁 | ○ |
| 被保険者証記号 | insuranceCards | cardSymbol | 英数漢字最大38バイト | △ |
| 被保険者証番号 | insuranceCards | cardNumber | 英数漢字最大38バイト | ○ |
| 本人家族区分 | insuranceCards | relationshipType | 1:本人, 2:家族 | △ |
| 請求点数 | monthlyReceipts | totalPoints | 数字 | △ |
| 以降15項目 | - | - | 省略（一旦） | △ |

### 実装例

```typescript
function generateHORecord(
  insurance: InsuranceCard,
  receipt: MonthlyReceipt
): string[] {
  const relationshipTypeMap: Record<string, string> = {
    'self': '1',
    'family': '2',
  };

  return [
    'HO',
    formatVariable(insurance.insurerNumber, 8), // 保険者番号
    formatVariable(insurance.cardSymbol || '', 38), // 記号
    formatVariable(insurance.cardNumber, 38), // 番号
    relationshipTypeMap[insurance.relationshipType] || '', // 本人家族区分
    formatVariable(receipt.totalPoints?.toString() || '', 7), // 請求点数
    // 以降15項目は省略（一旦空文字列）
    ...Array(15).fill(''),
  ];
}
```

### バリデーション

- [ ] `insurance.insurerNumber` が8桁の数字
- [ ] `insurance.cardNumber` が存在
- [ ] 保険証の有効期間が請求年月をカバーしている

---

## 5. KO - 公費レコード

### 目的
公費負担医療の情報を記録（該当する場合のみ）。

### フィールドとデータソース

| 項目名 | データソース | テーブル | フィールド | 変換 | 必須 |
|--------|------------|---------|-----------|------|-----|
| レコード識別情報 | 固定値 | - | - | "KO" | ○ |
| 負担者番号 | publicExpenses | payerNumber | 8桁 | ○ |
| 受給者番号 | publicExpenses | recipientNumber | 7桁 | ○ |
| 請求点数 | 計算 | - | 公費請求点数 | △ |
| 以降18項目 | - | - | 省略（一旦） | △ |

### 実装例

```typescript
function generateKORecords(
  publicExpenses: PublicExpense[]
): string[][] {
  return publicExpenses.map(expense => [
    'KO',
    formatVariable(expense.payerNumber, 8), // 負担者番号
    formatVariable(expense.recipientNumber, 7), // 受給者番号
    '', // 請求点数（一旦省略）
    ...Array(18).fill(''), // 以降18項目
  ]);
}
```

### バリデーション

- [ ] `publicExpense.payerNumber` が8桁で、"12"で始まる
- [ ] `publicExpense.recipientNumber` が7桁以内
- [ ] 公費の有効期間が請求年月をカバーしている

---

## 6. SN - 資格確認レコード

### 目的
オンライン資格確認または被保険者証での確認方法を記録。

### フィールドとデータソース

| 項目名 | データソース | テーブル | フィールド | 変換 | 必須 |
|--------|------------|---------|-----------|------|-----|
| レコード識別情報 | 固定値 | - | - | "SN" | ○ |
| 負担者種別 | 判定 | - | 1:保険, 2-5:公費 | ○ |
| 確認区分 | insuranceCards | confirmationMethod | 別表24コード | ○ |
| 保険者番号等(資格確認) | - | - | 省略（一次請求時） | × |
| 被保険者証記号(資格確認) | - | - | 省略（一次請求時） | × |
| 被保険者証番号(資格確認) | - | - | 省略（一次請求時） | × |
| 枝番 | insuranceCards | branchNumber | 2桁ゼロ埋め | △ |
| 受給者番号 | - | - | 省略（一次請求時） | × |
| 予備 | - | - | 省略 | × |

### 確認区分のマッピング

```typescript
const confirmationMethodMap: Record<string, string> = {
  'online': '01', // オンライン資格確認等システムで確認
  'certificate': '02', // 被保険者証等で確認
  'notification': '03', // 資格情報のお知らせで確認
  'special_disease': '04', // 特定疾病療養受療証で確認
  'limit': '05', // 限度額適用認定証で確認
  'bill_to_insurer': '06', // レセプト記載の保険者等に請求
};
```

### 実装例

```typescript
function generateSNRecords(
  insurance: InsuranceCard,
  publicExpenses: PublicExpense[]
): string[][] {
  const records: string[][] = [];

  // 保険者レコード用（負担者種別"1"）
  records.push([
    'SN',
    '1', // 負担者種別: 保険
    confirmationMethodMap[insurance.confirmationMethod] || '02', // 確認区分
    '', '', '', // 資格確認時の情報は省略
    formatVariable(insurance.branchNumber?.toString().padStart(2, '0') || '', 2), // 枝番
    '', // 受給者番号
    '', // 予備
  ]);

  // 公費レコード用（負担者種別"2"~"5"）
  publicExpenses.forEach((expense, index) => {
    records.push([
      'SN',
      (index + 2).toString(), // 負担者種別: 2~5
      confirmationMethodMap[expense.confirmationMethod] || '02', // 確認区分
      '', '', '', '', '', '', // 以降省略
    ]);
  });

  return records;
}
```

### バリデーション

- [ ] `insurance.confirmationMethod` が定義されている
- [ ] 枝番は2桁以内の数字
- [ ] 負担者種別が昇順に並んでいる

---

## 7. JD - 受診日等レコード

### 目的
その月の各日ごとに訪問があったかを記録（31日分のフラグ）。

### フィールドとデータソース

| 項目名 | データソース | テーブル | フィールド | 変換 | 必須 |
|--------|------------|---------|-----------|------|-----|
| レコード識別情報 | 固定値 | - | - | "JD" | ○ |
| 負担者種別 | 判定 | - | 1:保険, 2-5:公費 | ○ |
| 初診料算定年月日 | 計算 | nursingRecords | 初回訪問日="1" | △ |
| 受診日情報(1日目) | nursingRecords | visitDate | 訪問あり="1" | △ |
| 受診日情報(2日目) | nursingRecords | visitDate | 訪問あり="1" | △ |
| ... | ... | ... | ... | ... |
| 受診日情報(31日目) | nursingRecords | visitDate | 訪問あり="1" | △ |

### 実装例

```typescript
function generateJDRecord(
  nursingRecords: NursingRecord[],
  year: number,
  month: number
): string[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const visitDays = Array(31).fill('');

  nursingRecords.forEach(record => {
    const visitDate = new Date(record.visitDate);
    if (visitDate.getFullYear() === year && visitDate.getMonth() + 1 === month) {
      const day = visitDate.getDate();
      visitDays[day - 1] = '1'; // 訪問あり
    }
  });

  // 初診料算定年月日（月の最初の訪問日）
  const firstVisitDay = visitDays.findIndex(d => d === '1');
  const hasFirstVisit = firstVisitDay !== -1 ? '1' : '';

  return [
    'JD',
    '1', // 負担者種別: 保険（公費がある場合は追加レコード）
    hasFirstVisit, // 初診料算定年月日
    ...visitDays, // 31日分
  ];
}
```

### バリデーション

- [ ] 訪問日が請求年月内に存在する
- [ ] 31日分のフィールドが正しく生成されている

---

## 8. MF - 窓口負担額レコード

### 目的
高額療養費の現物給付情報を記録（該当する場合のみ）。

### フィールドとデータソース

| 項目名 | データソース | テーブル | フィールド | 変換 | 必須 |
|--------|------------|---------|-----------|------|-----|
| レコード識別情報 | 固定値 | - | - | "MF" | ○ |
| 窓口負担額区分 | monthlyReceipts | highCostCategory | 01または02 | △ |
| 以降28項目 | - | - | 省略（一旦） | △ |

### 実装例

```typescript
function generateMFRecord(
  receipt: MonthlyReceipt
): string[] | null {
  if (!receipt.highCostCategory) {
    return null; // 高額療養費該当なしの場合はレコード不要
  }

  const categoryMap: Record<string, string> = {
    'high_cost': '01', // 高額現物給付（多数回除く）
    'high_cost_multiple': '02', // 高額現物給付（多数回）
  };

  return [
    'MF',
    categoryMap[receipt.highCostCategory] || '',
    ...Array(28).fill(''), // 以降28項目は省略
  ];
}
```

---

## 9. IH - 医療機関・保険医情報レコード

### 目的
訪問看護指示書を交付した医療機関と主治医の情報を記録。

### フィールドとデータソース

| 項目名 | データソース | テーブル | フィールド | 変換 | 必須 |
|--------|------------|---------|-----------|------|-----|
| レコード識別情報 | 固定値 | - | - | "IH" | ○ |
| 医療機関都道府県 | medicalInstitutions | prefectureCode | 2桁 | ○ |
| 医療機関点数表 | 固定値 | - | "1" (医科) | ○ |
| 医療機関コード | medicalInstitutions | institutionCode | 7桁 | ○ |
| 主治医の属する医療機関等の名称 | medicalInstitutions | name | 全角最大20文字 | ○ |
| 主治医の氏名 | doctorOrders | doctorName | 姓と名の間に1文字スペース | ○ |
| 主治医への直近報告年月日 | doctorOrders | lastReportDate | YYYYMMDD | △ |

### 実装例

```typescript
function generateIHRecord(
  medicalInstitution: MedicalInstitution,
  doctorOrder: DoctorOrder
): string[] {
  return [
    'IH',
    formatFixed(medicalInstitution.prefectureCode, 2), // 都道府県
    '1', // 点数表（医科）
    formatFixed(medicalInstitution.institutionCode, 7), // 医療機関コード
    formatVariable(medicalInstitution.name, 40), // 医療機関名称
    formatVariable(doctorOrder.doctorName, 40), // 主治医氏名
    formatDate(doctorOrder.lastReportDate), // 直近報告年月日
  ];
}
```

### バリデーション

- [ ] `medicalInstitution.institutionCode` が7桁の数字
- [ ] `medicalInstitution.prefectureCode` が2桁の数字
- [ ] `doctorOrder.doctorName` が存在

---

## 10. HJ - 訪問看護指示レコード

### 目的
訪問看護指示書の種別と有効期間を記録。

### フィールドとデータソース

| 項目名 | データソース | テーブル | フィールド | 変換 | 必須 |
|--------|------------|---------|-----------|------|-----|
| レコード識別情報 | 固定値 | - | - | "HJ" | ○ |
| 指示区分 | doctorOrders | orderType | 別表12コード | ○ |
| 指示期間自 | doctorOrders | validFrom | YYYYMMDD | ○ |
| 指示期間至 | doctorOrders | validTo | YYYYMMDD | ○ |

### 指示区分のマッピング

```typescript
const orderTypeMap: Record<string, string> = {
  'regular': '01', // 訪問看護指示書
  'special': '02', // 特別訪問看護指示書
  'psychiatric': '03', // 精神科特別訪問看護指示書
  'infusion': '04', // 在宅患者訪問点滴注射指示書
};
```

### 実装例

```typescript
function generateHJRecord(
  doctorOrder: DoctorOrder
): string[] {
  return [
    'HJ',
    orderTypeMap[doctorOrder.orderType] || '01', // 指示区分
    formatDate(doctorOrder.validFrom), // 指示期間自
    formatDate(doctorOrder.validTo), // 指示期間至
  ];
}
```

### バリデーション

- [ ] `doctorOrder.validFrom` < `doctorOrder.validTo`
- [ ] 指示期間が請求年月をカバーしている
- [ ] 指示区分が有効な値

---

## 11. JS - 心身の状態レコード

### 目的
精神科訪問看護の場合、該当疾病やGAF尺度を記録（該当する場合のみ）。

### フィールドとデータソース

| 項目名 | データソース | テーブル | フィールド | 変換 | 必須 |
|--------|------------|---------|-----------|------|-----|
| レコード識別情報 | 固定値 | - | - | "JS" | ○ |
| 該当する疾病等 | doctorOrders | applicableDiseases | 別表13コード(2桁×複数) | △ |
| GAF尺度判定した値 | doctorOrders | gafScore | 別表29コード | △ |
| GAF尺度判定した年月日 | doctorOrders | gafAssessmentDate | YYYYMMDD | △ |

### 実装例

```typescript
function generateJSRecord(
  doctorOrder: DoctorOrder
): string[] | null {
  // 精神科訪問看護でない場合はレコード不要
  if (doctorOrder.orderType !== 'psychiatric') {
    return null;
  }

  return [
    'JS',
    formatVariable(doctorOrder.applicableDiseases || '', 20), // 該当疾病等
    formatVariable(doctorOrder.gafScore?.toString() || '', 2), // GAF尺度
    formatDate(doctorOrder.gafAssessmentDate), // GAF判定日
  ];
}
```

---

## 12. SY - 傷病名レコード

### 目的
診断名とICD-10コードを記録（複数可）。

### フィールドとデータソース

| 項目名 | データソース | テーブル | フィールド | 変換 | 必須 |
|--------|------------|---------|-----------|------|-----|
| レコード識別情報 | 固定値 | - | - | "SY" | ○ |
| 傷病名コード | doctorOrders | icd10Code | ICD-10コード7桁 | ○ |
| 診療開始日 | doctorOrders | diagnosisDate | YYYYMMDD | ○ |
| 転帰区分 | doctorOrders | outcome | 1:治癒, 2:死亡, 3:中止 | △ |
| 修飾語コード | - | - | 省略 | △ |
| 傷病名称 | doctorOrders | diagnosis | 全角最大40文字 | ○ |
| 主傷病 | doctorOrders | isPrimary | 01:主傷病 | △ |

### 実装例

```typescript
function generateSYRecords(
  doctorOrders: DoctorOrder[]
): string[][] {
  return doctorOrders.map(order => [
    'SY',
    formatFixed(order.icd10Code, 7), // 傷病名コード
    formatDate(order.diagnosisDate || order.validFrom), // 診療開始日
    order.outcome ? outcomeMap[order.outcome] : '', // 転帰区分
    '', '', // 修飾語コード（省略）
    formatVariable(order.diagnosis, 80), // 傷病名称
    order.isPrimary ? '01' : '', // 主傷病
  ]);
}
```

### バリデーション

- [ ] `doctorOrder.icd10Code` が7桁のICD-10形式
- [ ] `doctorOrder.diagnosis` が存在
- [ ] 主傷病が1つだけ設定されている

---

## 13. RJ - 利用者情報レコード

### 目的
訪問開始日、訪問場所、訪問終了情報を記録。

### フィールドとデータソース

| 項目名 | データソース | テーブル | フィールド | 変換 | 必須 |
|--------|------------|---------|-----------|------|-----|
| レコード識別情報 | 固定値 | - | - | "RJ" | ○ |
| 訪問開始年月日 | nursingRecords | MIN(visitDate) | YYYYMMDD | ○ |
| 訪問した場所1コード | nursingRecords | visitLocationCode | 別表16コード | ○ |
| 訪問した場所1文字データ | nursingRecords | visitLocationCustom | 場所コード99の場合 | △ |
| 訪問した場所2訪問場所変更年月日 | - | - | 省略（一旦） | △ |
| ... | ... | ... | ... | ... |
| 訪問終了年月日 | patients | serviceEndDate | YYYYMMDD | △ |
| 訪問終了時刻 | patients | serviceEndTime | HHMM | △ |
| 訪問終了状況コード | patients | serviceEndReason | 別表15コード | △ |
| 死亡年月日 | patients | deathDate | YYYYMMDD | △ |
| 死亡時刻 | patients | deathTime | HHMM | △ |
| 死亡場所コード | patients | deathLocation | 別表16コード | △ |
| 利用者情報コード | patients | userInfoCodes | 別表17コード(2桁×複数) | △ |
| 他の訪問看護ステーション1都道府県 | - | - | 省略（一旦） | △ |
| ... | ... | ... | ... | ... |

### 実装例

```typescript
function generateRJRecord(
  patient: Patient,
  nursingRecords: NursingRecord[]
): string[] {
  const firstVisitDate = nursingRecords.reduce((min, record) =>
    new Date(record.visitDate) < new Date(min) ? record.visitDate : min,
    nursingRecords[0].visitDate
  );

  // 最も頻繁に使われる訪問場所を場所1とする
  const locationCounts = nursingRecords.reduce((acc, record) => {
    acc[record.visitLocationCode] = (acc[record.visitLocationCode] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const mostFrequentLocation = Object.keys(locationCounts).reduce((a, b) =>
    locationCounts[a] > locationCounts[b] ? a : b
  );

  return [
    'RJ',
    formatDate(firstVisitDate), // 訪問開始年月日
    formatFixed(mostFrequentLocation, 2), // 訪問した場所1コード
    '', // 訪問した場所1文字データ（99以外は不要）
    ...Array(6).fill(''), // 場所2, 場所3（省略）
    formatDate(patient.serviceEndDate), // 訪問終了年月日
    formatTime(patient.serviceEndTime), // 訪問終了時刻
    formatVariable(patient.serviceEndReason || '', 2), // 訪問終了状況コード
    '', // 訪問終了状況文字データ
    formatDate(patient.deathDate), // 死亡年月日
    formatTime(patient.deathTime), // 死亡時刻
    formatVariable(patient.deathLocation || '', 2), // 死亡場所コード
    '', // 死亡場所文字データ
    formatVariable(patient.userInfoCodes || '', 20), // 利用者情報コード
    ...Array(10).fill(''), // 他の訪問看護ステーション（省略）
  ];
}
```

---

## 14. TJ - 情報提供レコード

### 目的
医療機関等への情報提供を記録（該当する場合のみ）。

### 実装例

```typescript
function generateTJRecord(): string[] | null {
  // 一旦省略（情報提供加算を算定していない場合はレコード不要）
  return null;
}
```

---

## 15. TZ - 特記事項レコード

### 目的
特別な事項やコメントを記録（該当する場合のみ）。

### 実装例

```typescript
function generateTZRecord(receipt: MonthlyReceipt): string[] | null {
  if (!receipt.specialNotes) {
    return null;
  }

  return [
    'TZ',
    '01', // 特記事項コード（仮）
    '', // コメントコード
    formatVariable(receipt.specialNotes, 400), // 文字データ
  ];
}
```

---

## 16. KS - 専門の研修レコード

### 目的
専門研修を受けた看護師による訪問の場合に記録（該当する場合のみ）。

### 実装例

```typescript
function generateKSRecord(nursingRecords: NursingRecord[]): string[] | null {
  // 専門研修修了看護師が訪問した記録があるか確認
  const hasSpecialist = nursingRecords.some(
    record => record.staffQualificationCode === '08'
  );

  if (!hasSpecialist) {
    return null;
  }

  return [
    'KS',
    '01', // 専門の研修コード（仮）
    '', // 予備
    '', // 手順書交付年月日（一旦省略）
    '', // 直近見直し年月日（一旦省略）
  ];
}
```

---

## 17. CO - コメントレコード

### 目的
補足コメントを記録（該当する場合のみ）。

### 実装例

```typescript
function generateCORecords(comments: Comment[]): string[][] {
  return comments.map(comment => [
    'CO',
    formatFixed(comment.commentCode, 9), // コメントコード
    formatVariable(comment.commentText, 400), // 文字データ
    '', // 予備
  ]);
}
```

---

## 18. KA - 訪問看護療養費レコード

### 目的
個別の訪問記録と加算を記録（複数必須）。

### フィールドとデータソース

| 項目名 | データソース | テーブル | フィールド | 変換 | 必須 |
|--------|------------|---------|-----------|------|-----|
| レコード識別情報 | 固定値 | - | - | "KA" | ○ |
| 算定年月日 | nursingRecords | visitDate | YYYYMMDD | ○ |
| 負担区分 | monthlyReceipts | insuranceType | 別表22コード | ○ |
| 訪問看護療養費コード | nursingServiceCodes | serviceCode | 9桁 | ○ |
| 数量データ | nursingRecords | quantity | 回数・時間等 | △ |
| 金額 | nursingServiceCodes | points * 10 | 点数×10 | △ |
| 職種等 | nursingRecords | staffQualificationCode | 別表20コード | △ |
| 同日訪問回数 | nursingRecords | visitCountOfDay | 別表19コード | △ |
| 指示区分 | doctorOrders | orderType | 別表12コード | △ |

### 実装例

```typescript
function generateKARecords(
  nursingRecords: NursingRecord[],
  bonuses: BonusCalculationHistory[],
  receipt: MonthlyReceipt
): string[][] {
  const records: string[][] = [];

  // 基本訪問記録
  nursingRecords.forEach(record => {
    const serviceCode = record.serviceCode; // nursing_service_codesから取得
    const負担区分 = receipt.insuranceType === 'medical' ? '1' : '3';

    records.push([
      'KA',
      formatDate(record.visitDate), // 算定年月日
      負担区分, // 負担区分
      formatFixed(serviceCode.serviceCode, 9), // 訪問看護療養費コード
      formatVariable(record.quantity?.toString() || '1', 8), // 数量データ
      formatVariable((serviceCode.points * 10).toString(), 6), // 金額
      formatVariable(record.staffQualificationCode, 20), // 職種等
      formatVariable(record.visitCountOfDay?.toString() || '01', 2), // 同日訪問回数
      formatVariable(record.orderType || '', 2), // 指示区分
    ]);
  });

  // 加算記録
  bonuses.forEach(bonus => {
    records.push([
      'KA',
      formatDate(bonus.calculatedDate || bonus.nursingRecord.visitDate), // 算定年月日
      負担区分, // 負担区分
      formatFixed(bonus.serviceCode, 9), // 加算のサービスコード
      '', // 数量データ（加算は通常省略）
      formatVariable((bonus.calculatedPoints * 10).toString(), 6), // 金額
      '', // 職種等（加算は省略）
      '', // 同日訪問回数（加算は省略）
      '', // 指示区分（加算は省略）
    ]);
  });

  return records;
}
```

### バリデーション

- [ ] `nursingRecord.visitDate` が請求年月内
- [ ] `serviceCode.serviceCode` が9桁
- [ ] `staffQualificationCode` が有効な値
- [ ] 同日訪問回数が正しく設定されている

---

## データ取得の最適化

### JOIN戦略

1つのレセプトに対して必要な全データを一度に取得:

```typescript
async function fetchReceiptData(receiptId: string) {
  const receipt = await db.query.monthlyReceipts.findFirst({
    where: eq(monthlyReceipts.id, receiptId),
    with: {
      patient: true,
      facility: true,
      insuranceCard: {
        with: {
          publicExpenses: true,
        },
      },
      doctorOrders: {
        with: {
          medicalInstitution: true,
        },
      },
      nursingRecords: {
        with: {
          serviceCode: true,
          bonuses: true,
        },
        orderBy: asc(nursingRecords.visitDate),
      },
    },
  });

  return receipt;
}
```

---

## フィールドフォーマット関数

### 共通ユーティリティ

```typescript
// 固定長フィールド（バイト数を厳密に守る）
function formatFixed(value: string, byteLength: number): string {
  const buffer = iconv.encode(value, 'Shift_JIS');
  if (buffer.length > byteLength) {
    throw new Error(`Field exceeds maximum byte length: ${byteLength}`);
  }
  return value.padStart(byteLength, '0'); // 数字の場合はゼロ埋め
}

// 可変長フィールド（最大バイト数チェック）
function formatVariable(value: string, maxBytes: number): string {
  const buffer = iconv.encode(value, 'Shift_JIS');
  if (buffer.length > maxBytes) {
    // バイト数オーバーの場合は切り詰め
    return iconv.decode(buffer.slice(0, maxBytes), 'Shift_JIS');
  }
  return value;
}

// 日付フォーマット（YYYYMMDD）
function formatDate(date?: Date | string): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${year}${month}${day}`;
}

// 時刻フォーマット（HHMM）
function formatTime(time?: string): string {
  if (!time) return '';
  // "14:30:00" → "1430"
  return time.replace(/:/g, '').slice(0, 4);
}
```

---

## 変更履歴

| 日付 | 変更内容 | 担当者 |
|------|---------|--------|
| 2025-11-03 | 初版作成 | - |
