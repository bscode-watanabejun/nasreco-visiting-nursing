# CSVレコード仕様詳細 - データソースマッピング

このドキュメントは、18種類のCSVレコードタイプごとに、どのデータベーステーブルからどのフィールドを取得するかを明確に定義します。

**注意**: 本ドキュメントは公式設計書PDF（`R06bt1_5_kiroku_nursing.pdf`）に基づいています。
公式設計書PDFが唯一の正規仕様です。

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
| 審査支払機関 | 固定値/動的判定 | - | - | 1=社保, 2=国保連 | ○ |
| 都道府県 | facilities | prefectureCode | 2桁 | ○ |
| 点数表 | 固定値 | - | - | "6" (訪問看護) | ○ |
| 訪問看護ステーションコード | facilities | facilityCode | 7桁 | ○ |
| 訪問看護ステーション名称 | facilities | name | 全角最大20文字 | ○ |
| 請求年月 | パラメータ | year, month | YYYYMM | ○ |
| 電話番号 | facilities | phone | ハイフン含む | △ |

### 実装例

```typescript
function generateHMRecord(
  facility: Facility,
  year: number,
  month: number,
  reviewOrgCode: string
): string[] {
  return [
    'HM',
    reviewOrgCode, // 審査支払機関（動的判定: 1=社保, 2=国保連）
    formatFixed(facility.prefectureCode, 2), // 都道府県
    '6', // 点数表（固定: 訪問看護）
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
| レセプト番号 | 計算 | - | 6桁可変 | レセプト通し番号 | ○ |
| レセプト種別 | 計算 | insuranceType等 | 別表4コード | ○ |
| 指定訪問看護年月 | monthlyReceipts | targetYear, targetMonth | YYYYMM | ○ |
| 氏名 | patients | lastName, firstName | 英数または漢字40バイト可変。姓と名の間に1文字スペース。英数モードと漢字モードの文字を混在しない。モードごとの文字数の上限は、英数：40、漢字：20 | ○ |
| カタカナ（氏名） | patients | kanaName | 全角カタカナ80バイト可変。姓と名の間にスペースを記録しない。記録は任意とする。 | △ |
| 男女区分 | patients | gender | 1:男, 2:女 | ○ |
| 生年月日 | patients | dateOfBirth | YYYYMMDD | ○ |
| 予備 | - | - | 記録を省略する | × |
| 予備 | - | - | 記録を省略する | × |
| 給付割合 | - | - | 国民健康保険の場合は、給付割合を百分率（％）で記録する。その他の場合は、記録を省略する。 | △ |
| レセプト特記 | - | - | 特記が必要な場合は、別表6 レセプト特記コードを記録する。ただし、最大5個までの記録とする。記録するバイト数は、2の倍数とする。その他の場合は、記録を省略する。 | △ |
| 一部負担金区分 | - | - | 一部負担金額について、限度額適用・標準負担額減額認定証等が提示された場合は、別表7 一部負担金区分コードを記録する。その他の場合は、記録を省略する。 | △ |
| 訪問看護記録番号等 | - | - | 訪問看護記録番号又は患者ID番号等を記録する。記録は任意とする。 | △ |
| 検索番号 | - | - | 検索番号を記録する（17～30桁で構成する）。審査支払機関から返戻される返戻ファイルの請求データと履歴請求データに記録する。その他の場合は、記録を省略する。 | △ |

### レセプト種別の判定ロジック

```typescript
function determineReceiptType(
  receipt: MonthlyReceipt,
  insurance: InsuranceCard,
  publicExpenses: PublicExpense[]
): string {
  // 別表4に基づく判定
  // 保険種別、公費併用の有無、本人/家族区分、高齢受給者区分から判定
  const hasPublicExpense = publicExpenses.length > 0;
  const publicExpenseCount = publicExpenses.length;
  const isLateStageElderly = insurance.insuranceType === 'late_stage_elderly';
  const isElderlyRecipient = receipt.recipientType === 'elderly';
  const isElderlyRecipient70 = receipt.recipientType === 'elderly_70';
  const isUnschooled = receipt.recipientType === 'unschooled';
  const isFamily = insurance.relationshipType === 'family';
  
  // 後期高齢者医療の場合
  if (isLateStageElderly) {
    if (hasPublicExpense) {
      if (isElderlyRecipient70) {
        return `63${publicExpenseCount}0`; // 後期高齢者と公費併用・7割
      } else {
        return `63${publicExpenseCount}8`; // 後期高齢者と公費併用・一般・低所得者
      }
    } else {
      if (isElderlyRecipient70) {
        return '6310'; // 後期高齢者単独・7割
      } else {
        return '6318'; // 後期高齢者単独・一般・低所得者
      }
    }
  }
  
  // 公費単独の場合
  if (!insurance && hasPublicExpense) {
    if (publicExpenseCount === 1) {
      return '6212'; // 公費単独
    } else {
      return `62${publicExpenseCount}2`; // 2-4種の公費併用
    }
  }
  
  // 医療保険/国保と公費併用の場合
  if (hasPublicExpense) {
    if (isUnschooled) {
      return `61${publicExpenseCount}4`; // 未就学者
    } else if (isFamily) {
      return `61${publicExpenseCount}6`; // 家族/その他
    } else if (isElderlyRecipient70) {
      return `61${publicExpenseCount}0`; // 高齢受給者7割
    } else if (isElderlyRecipient) {
      return `61${publicExpenseCount}8`; // 高齢受給者一般・低所得者
    } else {
      return `61${publicExpenseCount}2`; // 本人/世帯主
    }
  }
  
  // 医療保険/国保単独の場合
  if (isUnschooled) {
    return '6114'; // 未就学者
  } else if (isFamily) {
    return '6116'; // 家族/その他
  } else if (isElderlyRecipient70) {
    return '6110'; // 高齢受給者7割
  } else if (isElderlyRecipient) {
    return '6118'; // 高齢受給者一般・低所得者
  } else {
    return '6112'; // 本人/世帯主
  }
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
    String(1).padStart(6, '0'), // レセプト番号（6桁可変）
    determineReceiptType(receipt, insurance), // レセプト種別
    `${receipt.targetYear}${receipt.targetMonth.toString().padStart(2, '0')}`, // 指定訪問看護年月
    formatVariable(`${patient.lastName} ${patient.firstName}`.trim(), 40), // 氏名（英数または漢字40バイト可変）
    formatVariable(patient.kanaName || '', 80), // カタカナ（氏名）（全角カタカナ80バイト可変、任意）
    patient.gender === 'male' ? '1' : '2', // 男女区分
    formatDate(patient.dateOfBirth), // 生年月日(YYYYMMDD)
    '', // 予備（記録を省略する）
    '', // 予備（記録を省略する）
    '', // 給付割合（国民健康保険の場合のみ、現在は空欄）
    '', // レセプト特記（特記が必要な場合のみ、現在は空欄）
    '', // 一部負担金区分（別表7: 該当者のみ、現在は空欄）
    '', // 訪問看護記録番号等（任意、現在は空欄）
    '', // 検索番号（該当者のみ、現在は空欄）
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
| 保険者番号 | insuranceCards | insurerNumber | 8桁固定（8桁未満は先頭スペース埋め） | ○ |
| 被保険者証(手帳)等の記号 | insuranceCards | cardSymbol | 英数または漢字38バイト可変 | △ |
| 被保険者証(手帳)等の番号 | insuranceCards | cardNumber | 英数または漢字38バイト可変 | ○ |
| 実日数 | 計算 | nursingRecords | 実日数 | ○ |
| 合計金額 | monthlyReceipts | totalAmount | 合計金額 | ○ |
| 職務上の事由 | insuranceCards | workRelatedReason | 別表8コード | △ |
| 証明書番号 | insuranceCards | certificateNumber | 3桁 | △ |
| 一部負担金額 | monthlyReceipts | copaymentAmount | 8桁 | △ |
| 減免区分 | insuranceCards | reductionCategory | 別表9コード | △ |
| 減額割合 | insuranceCards | reductionRate | 3桁（百分率） | △ |
| 減額金額 | insuranceCards | reductionAmount | 6桁 | △ |

### 実装例

```typescript
function generateHORecord(
  insurance: InsuranceCard,
  receipt: MonthlyReceipt,
  nursingRecords: NursingRecord[]
): string[] {
  // 実日数を計算（訪問記録から集計）
  const actualDays = new Set(
    nursingRecords.map(r => formatDate(r.visitDate))
  ).size;

  return [
    'HO',
    formatFixed(insurance.insurerNumber.padStart(8, ' '), 8), // 保険者番号（8桁固定、スペース埋め）
    formatVariable(insurance.cardSymbol || '', 38), // 被保険者証記号
    formatVariable(insurance.cardNumber, 38), // 被保険者証番号
    formatVariable(actualDays.toString(), 2), // 実日数
    formatVariable(receipt.totalAmount?.toString() || '0', 8), // 合計金額
    formatVariable(insurance.workRelatedReason || '', 1), // 職務上の事由（別表8）
    formatVariable(insurance.certificateNumber || '', 3), // 証明書番号
    formatVariable(receipt.copaymentAmount?.toString() || '', 8), // 一部負担金額
    formatVariable(insurance.reductionCategory || '', 1), // 減免区分（別表9）
    formatVariable(insurance.reductionRate?.toString() || '', 3), // 減額割合
    formatVariable(insurance.reductionAmount?.toString() || '', 6), // 減額金額
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
| 負担者番号 | publicExpenses | payerNumber | 8桁固定 | ○ |
| 受給者番号 | publicExpenses | recipientNumber | 7桁可変（7桁未満は先頭0埋め、医療観察法の場合は省略） | △ |
| 任意給付区分 | publicExpenses | optionalBenefitFlag | 1（国保で任意給付あり） | △ |
| 実日数 | 計算 | nursingRecords | 公費実日数 | ○ |
| 合計金額 | 計算 | - | 公費合計金額 | ○ |
| 一部負担金額 | publicExpenses | copaymentAmount | 8桁 | △ |
| 公費給付対象一部負担金 | publicExpenses | publicExpenseCopayment | 6桁 | △ |

### 実装例

```typescript
function generateKORecords(
  publicExpenses: PublicExpense[],
  nursingRecords: NursingRecord[],
  receipt: MonthlyReceipt
): string[][] {
  return publicExpenses.map(expense => {
    // 公費の実日数を計算
    const publicExpenseDays = new Set(
      nursingRecords
        .filter(r => r.publicExpenseId === expense.id)
        .map(r => formatDate(r.visitDate))
    ).size;

    // 公費の合計金額を計算
    const publicExpenseAmount = nursingRecords
      .filter(r => r.publicExpenseId === expense.id)
      .reduce((sum, r) => sum + (r.points || 0) * 10, 0);

    return [
      'KO',
      formatFixed(expense.payerNumber, 8), // 負担者番号（8桁固定）
      expense.recipientNumber 
        ? formatFixed(expense.recipientNumber.padStart(7, '0'), 7) // 受給者番号（7桁、0埋め）
        : '', // 医療観察法の場合は省略
      expense.optionalBenefitFlag ? '1' : '', // 任意給付区分
      formatVariable(publicExpenseDays.toString(), 2), // 実日数
      formatVariable(publicExpenseAmount.toString(), 8), // 合計金額
      formatVariable(expense.copaymentAmount?.toString() || '', 8), // 一部負担金額
      formatVariable(expense.publicExpenseCopayment?.toString() || '', 6), // 公費給付対象一部負担金
    ];
  });
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
  'visit_time': '01', // 訪問時等
  'no_change_after_request': '02', // 審査支払機関に請求後変更なし
  'unconfirmed': '03', // 確認不能
  'transfer': '04', // 振替（一次請求では使用しない）
  'split': '05', // 分割（一次請求では使用しない）
  'bill_to_insurer': '06', // レセプト記載の保険者等に請求
  'qualification_lost': '07', // 資格喪失（証回収後）（一次請求では使用しない）
  'reserved': '08', // 予備
  'branch_specified': '09', // 枝番特定（一次請求では使用しない）
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
その月の各日ごとに訪問があったかを記録（31日分の受診等区分コード）。

### フィールドとデータソース

| 項目名 | データソース | テーブル | フィールド | 変換 | 必須 |
|--------|------------|---------|-----------|------|-----|
| レコード識別情報 | 固定値 | - | - | "JD" | ○ |
| 負担者種別 | 判定 | - | 別表23コード（1:保険, 2-5:公費） | ○ |
| 1日の情報 | nursingRecords | visitDate | 別表25受診等区分コード（訪問あり="1"） | △ |
| 2日の情報 | nursingRecords | visitDate | 別表25受診等区分コード | △ |
| ... | ... | ... | ... | ... |
| 31日の情報 | nursingRecords | visitDate | 別表25受診等区分コード | △ |

### 受診等区分コード（別表25）

```typescript
const visitCategoryMap: Record<string, string> = {
  'counted': '1', // 実日数に計上する訪問看護
  'not_counted': '2', // 実日数に計上しない訪問看護
  'mismatch': '9', // 訪問看護療養費レコードの算定年月日と不一致（一次請求では使用しない）
};
```

### 実装例

```typescript
function generateJDRecord(
  nursingRecords: NursingRecord[],
  year: number,
  month: number,
  burdenType: string // '1'=保険, '2'~'5'=公費
): string[] {
  const visitDays = Array(31).fill('');

  nursingRecords.forEach(record => {
    const visitDate = new Date(record.visitDate);
    if (visitDate.getFullYear() === year && visitDate.getMonth() + 1 === month) {
      const day = visitDate.getDate();
      // 訪問看護療養費レコードの算定年月日と一致する場合は"1"を記録
      // 実日数に計上しない訪問看護の場合は"2"を記録
      visitDays[day - 1] = record.countedInActualDays ? '1' : '2';
    }
  });

  return [
    'JD',
    burdenType, // 負担者種別: 1=保険, 2-5=公費
    ...visitDays, // 31日分の受診等区分コード
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
| 窓口負担額区分 | monthlyReceipts | highCostCategory | 別表26コード（01または02） | ○ |
| 予備1～31 | - | - | 記録を省略する | × |

### 窓口負担額区分コード（別表26）

```typescript
const highCostCategoryMap: Record<string, string> = {
  'none': '00', // 一部負担金額 高額療養費の現物給付なし（使用しない）
  'high_cost': '01', // 高額療養費現物給付あり（多数回該当を除く）
  'high_cost_multiple': '02', // 高額療養費現物給付あり（多数回該当）
  'meal_standard': '03', // 食事療養費及び生活療養費の標準負担額（使用しない）
  'special_fee': '04', // 特別の費用の額（使用しない）
};
```

### 実装例

```typescript
function generateMFRecord(
  receipt: MonthlyReceipt
): string[] | null {
  if (!receipt.highCostCategory) {
    return null; // 高額療養費該当なしの場合はレコード不要
  }

  return [
    'MF',
    highCostCategoryMap[receipt.highCostCategory] || '01', // 窓口負担額区分
    ...Array(31).fill(''), // 予備1～31（記録を省略）
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
| 医療機関点数表 | 固定値 | - | "6" (訪問看護) | ○ |
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
    '6', // 点数表（訪問看護）
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

### 指示区分のマッピング（別表12）

```typescript
const orderTypeMap: Record<string, string> = {
  'regular': '01', // 訪問看護指示
  'special': '02', // 特別訪問看護指示
  'psychiatric': '03', // 精神科訪問看護指示
  'psychiatric_special': '04', // 精神科特別訪問看護指示
  'medical_observation': '05', // 医療観察精神科訪問看護指示
  'medical_observation_special': '06', // 医療観察精神科特別訪問看護指示
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
利用者の心身の状態や日常生活動作の状態等を記録。精神科訪問看護の場合、該当疾病やGAF尺度も記録。

### フィールドとデータソース

| 項目名 | データソース | テーブル | フィールド | 変換 | 必須 |
|--------|------------|---------|-----------|------|-----|
| レコード識別情報 | 固定値 | - | - | "JS" | ○ |
| 心身の状態 | doctorOrders | physicalMentalCondition | 漢字2400バイト可変 | ○ |
| 基準告示第2の1に規定する疾病等の有無 | doctorOrders | diseasePresenceCodes | 別表13コード（2の倍数） | △ |
| 該当する疾病等 | doctorOrders | applicableDiseases | 別表14コード（3の倍数） | △ |
| GAF尺度により判定した値 | doctorOrders | gafScore | 別表28コード | △ |
| GAF尺度により判定した年月日 | doctorOrders | gafAssessmentDate | YYYYMMDD | △ |

### 実装例

```typescript
function generateJSRecord(
  doctorOrder: DoctorOrder
): string[] {
  return [
    'JS',
    formatVariable(doctorOrder.physicalMentalCondition || '', 2400), // 心身の状態（必須）
    formatVariable(doctorOrder.diseasePresenceCodes || '', 10), // 基準告示第2の1に規定する疾病等の有無（2の倍数）
    formatVariable(doctorOrder.applicableDiseases || '', 300), // 該当する疾病等（3の倍数）
    formatVariable(doctorOrder.gafScore?.toString().padStart(2, '0') || '', 2), // GAF尺度（別表28）
    formatDate(doctorOrder.gafAssessmentDate), // GAF判定年月日
  ];
}
```

---

## 12. SY - 傷病名レコード

### 目的
診断名と傷病名コードを記録（複数可）。

### フィールドとデータソース

| 項目名 | データソース | テーブル | フィールド | 変換 | 必須 |
|--------|------------|---------|-----------|------|-----|
| レコード識別情報 | 固定値 | - | - | "SY" | ○ |
| 傷病名コード | doctorOrders | diseaseCode | 7桁固定（未コード化は"0000999"） | ○ |
| 修飾語コード | doctorOrders | modifierCodes | 英数80バイト可変（最大20個、4の倍数） | △ |
| 傷病名称 | doctorOrders | diagnosis | 漢字40バイト可変（未コード化傷病名のみ） | △ |
| 補足コメント | doctorOrders | supplementaryComment | 漢字40バイト可変 | △ |

### 実装例

```typescript
function generateSYRecords(
  doctorOrders: DoctorOrder[]
): string[][] {
  return doctorOrders.map(order => [
    'SY',
    formatFixed(order.diseaseCode || '0000999', 7), // 傷病名コード（未コード化は"0000999"）
    formatVariable(order.modifierCodes || '', 80), // 修飾語コード（4の倍数、最大20個）
    formatVariable(order.diseaseCode === '0000999' ? (order.diagnosis || '') : '', 40), // 傷病名称（未コード化のみ）
    formatVariable(order.supplementaryComment || '', 40), // 補足コメント
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
| 金額 | nursingServiceCodes | points * 10 | 点数×10 | ○ |
| 職種等 | nursingRecords | staffQualificationCode | 別表20コード（2の倍数） | △ |
| 同日訪問回数 | nursingRecords | visitCountOfDay | 別表19コード（01=1回目, 02=2回目, 03=3回目以上） | △ |
| 指示区分 | doctorOrders | orderType | 別表12コード（HJレコードと異なる場合のみ） | △ |

### 負担区分コード（別表22）の判定

負担区分は、保険種別と公費併用の有無から判定します。別表22に基づき、医保・国保と公費の組み合わせに応じたコードを設定します。

### 訪問看護回数コード（別表19）

```typescript
const visitCountMap: Record<number, string> = {
  1: '01', // １日に１回
  2: '02', // １日に２回
  3: '03', // １日に３回以上
};
```

### 実装例

```typescript
function generateKARecords(
  nursingRecords: NursingRecord[],
  bonuses: BonusCalculationHistory[],
  receipt: MonthlyReceipt,
  publicExpenses: PublicExpense[],
  instructionTypeCode: string // HJレコードの指示区分コード
): string[][] {
  const records: string[][] = [];
  
  // 負担区分を判定（別表22に基づく）
  const burdenClassification = determineBurdenClassification(
    receipt.insuranceType,
    publicExpenses
  );

  // 基本訪問記録
  nursingRecords.forEach(record => {
    const serviceCode = record.serviceCode; // nursing_service_codesから取得
    const amount = (serviceCode.points || 0) * 10; // 金額 = 点数 × 10
    
    // 職種等コード（別表20）
    // 同日訪問回数に応じて適切なコード列を使用
    const visitCount = record.visitCountOfDay || 1;
    const staffCode = determineStaffCode(
      record.staffQualificationCode,
      visitCount,
      record.isSubsidiaryFacility
    );
    
    // 指示区分（HJレコードと異なる場合のみ記録）
    const instructionType = record.orderType !== instructionTypeCode 
      ? orderTypeMap[record.orderType] || '' 
      : '';

    records.push([
      'KA',
      formatDate(record.visitDate), // 算定年月日
      burdenClassification, // 負担区分（別表22）
      formatFixed(serviceCode.serviceCode, 9), // 訪問看護療養費コード
      formatVariable(record.quantity?.toString() || '', 8), // 数量データ
      formatVariable(amount.toString(), 6), // 金額
      formatVariable(staffCode, 20), // 職種等（2の倍数）
      visitCount > 1 ? visitCountMap[Math.min(visitCount, 3)] || '03' : '', // 同日訪問回数
      instructionType, // 指示区分（HJと異なる場合のみ）
    ]);
  });

  // 加算記録
  bonuses.forEach(bonus => {
    const amount = (bonus.calculatedPoints || 0) * 10;
    
    records.push([
      'KA',
      formatDate(bonus.calculatedDate || bonus.nursingRecord.visitDate), // 算定年月日
      burdenClassification, // 負担区分
      formatFixed(bonus.serviceCode, 9), // 加算のサービスコード
      '', // 数量データ（加算は通常省略）
      formatVariable(amount.toString(), 6), // 金額
      '', // 職種等（加算は省略）
      '', // 同日訪問回数（加算は省略）
      '', // 指示区分（加算は省略）
    ]);
  });

  return records;
}

// 負担区分を判定する関数
function determineBurdenClassification(
  insuranceType: string,
  publicExpenses: PublicExpense[]
): string {
  const publicExpenseCount = publicExpenses.length;
  
  if (insuranceType === 'late_stage_elderly') {
    // 後期高齢者医療
    if (publicExpenseCount === 0) return '1';
    // 公費併用の場合は別表22に基づく複雑な判定が必要
    // ここでは簡略化
    return '1'; // 実際の実装では別表22の表に基づいて判定
  }
  
  if (publicExpenseCount === 0) {
    return '1'; // 医療保険単独
  }
  
  // 公費併用の場合、別表22に基づく判定
  // 実際の実装では、保険種別と公費の組み合わせから適切なコードを返す
  return '2'; // 例: 医保と1種の公費併用
}

// 職種等コードを判定する関数
function determineStaffCode(
  qualificationCode: string,
  visitCount: number,
  isSubsidiary: boolean
): string {
  const baseCode = parseInt(qualificationCode);
  if (isNaN(baseCode)) return '';
  
  if (isSubsidiary) {
    // 従たる事業所の場合: 51-80
    if (visitCount === 1) return String(baseCode + 50).padStart(2, '0');
    if (visitCount === 2) return String(baseCode + 60).padStart(2, '0');
    return String(baseCode + 70).padStart(2, '0'); // 3回目以降
  } else {
    // 主たる事業所の場合: 01-30
    if (visitCount === 1) return String(baseCode).padStart(2, '0');
    if (visitCount === 2) return String(baseCode + 10).padStart(2, '0');
    return String(baseCode + 20).padStart(2, '0'); // 3回目以降
  }
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
| 2025-01-XX | 公式設計書PDFに基づき修正（REレコードのレセプト番号6桁、フィールド順序修正、HM/IHレコードの点数表コード修正、SYレコードのフィールド順序修正） | - |
| 2025-01-XX | `nursing_csv_spec.md`の主要コード表修正に合わせて更新（別表1-28のコード定義を反映、HO/KO/JD/JS/SY/KAレコードのフィールド定義を修正、確認区分コード・指示区分コード・訪問看護回数コード・負担区分コードの更新） | - |
