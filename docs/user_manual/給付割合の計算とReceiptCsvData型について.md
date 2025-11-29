# 給付割合の計算とReceiptCsvData型について

## 概要

「K14: 給付割合のCSVビルダーでは計算しているが、ReceiptCsvData型に含まれていない」という状況について、わかりやすく説明します。

---

## 現在の状況

### CSVビルダーでの処理

CSVビルダー（`server/services/csv/nursingReceiptCsvBuilder.ts`）では、**メソッド内で給付割合を計算**しています。

```typescript
// CSVビルダーの addRERecord メソッド内
private addRERecord(data: ReceiptCsvData, receiptNumber?: number): void {
  // ... 他の処理 ...
  
  // 給付割合を計算（ここで計算している）
  const reviewOrgCode = this.determineReviewOrganizationCode(data);
  let benefitRatio = '';  // ← ローカル変数として計算
  if (reviewOrgCode === '2') {
    // 国保の場合、負担割合から給付割合を計算
    const copaymentRate = data.insuranceCard.copaymentRate 
      ? parseInt(data.insuranceCard.copaymentRate) 
      : 30; // デフォルト3割
    const benefitRate = 100 - copaymentRate;
    benefitRatio = String(benefitRate).padStart(3, '0'); // 例: "070", "080", "090"
  }
  
  // CSVの1行に出力
  const fields = [
    'RE',
    receiptNum,
    // ... 他のフィールド ...
    benefitRatio,  // ← CSVに出力
    // ...
  ];
  
  this.lines.push(buildCsvLine(fields));
}
```

**重要なポイント**:
- `benefitRatio`は**メソッド内のローカル変数**として計算されています
- CSVファイルには出力されますが、**`ReceiptCsvData`型のフィールドには含まれていません**

### ReceiptCsvData型の定義

`ReceiptCsvData`型（`server/services/csv/types.ts`）には、給付割合のフィールドが**定義されていません**。

```typescript
export interface ReceiptCsvData {
  receipt: {
    id: string;
    targetYear: number;
    targetMonth: number;
    // ... 他のフィールド ...
    // ❌ benefitRatio というフィールドがない
  };
  
  insuranceCard: {
    copaymentRate?: '10' | '20' | '30' | null;  // 負担割合はある
    // ❌ benefitRatio というフィールドがない
  };
}
```

---

## なぜExcel出力で使えないのか？

### データの流れ

1. **APIエンドポイント**（`server/routes.ts`）で`ReceiptCsvData`型のデータを作成
   ```typescript
   const csvData: ReceiptCsvData = {
     receipt: { /* ... */ },
     insuranceCard: { /* ... */ },
     // benefitRatio は含まれていない
   };
   ```

2. **CSVビルダー**に`ReceiptCsvData`を渡す
   - CSVビルダーは、受け取ったデータから給付割合を**計算**してCSVに出力
   - しかし、計算結果を`ReceiptCsvData`に保存しない

3. **Excelビルダー**にも同じ`ReceiptCsvData`を渡す
   - Excelビルダーは、受け取ったデータから給付割合を取得しようとする
   - しかし、`ReceiptCsvData`に給付割合のフィールドがないため、**取得できない**

### 図解

```
┌─────────────────────────────────────────┐
│ APIエンドポイント                        │
│ ReceiptCsvData を作成                    │
│ {                                        │
│   receipt: { ... },                     │
│   insuranceCard: {                      │
│     copaymentRate: '30'  ← 負担割合のみ │
│   }                                      │
│ }                                        │
└──────────────┬──────────────────────────┘
               │
               ├─────────────────┬─────────────────┐
               │                 │                 │
               ▼                 ▼                 ▼
    ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
    │ CSVビルダー      │  │ Excelビルダー    │  │ 他のビルダー     │
    │                  │  │                  │  │                  │
    │ benefitRatioを   │  │ benefitRatioを   │  │                  │
    │ 計算してCSVに    │  │ 取得しようとする │  │                  │
    │ 出力 ✅          │  │ ❌ 取得できない  │  │                  │
    └──────────────────┘  └──────────────────┘  └──────────────────┘
```

---

## 解決方法

### 方法1: ReceiptCsvData型にフィールドを追加（推奨）

**ステップ1**: 型定義に追加

```typescript
// server/services/csv/types.ts
export interface ReceiptCsvData {
  receipt: {
    // ... 既存のフィールド ...
    benefitRatio?: string | null;  // ← 追加: 給付割合（3桁、例: "070", "080", "090"）
  };
}
```

**ステップ2**: APIエンドポイントで計算して含める

```typescript
// server/routes.ts
const csvData: ReceiptCsvData = {
  receipt: {
    // ... 既存のフィールド ...
    // 給付割合を計算
    benefitRatio: calculateBenefitRatio(insuranceCard) || null,
  },
  // ...
};

// 計算関数を追加
function calculateBenefitRatio(insuranceCard: any): string | null {
  const reviewOrgCode = determineReviewOrganizationCode(insuranceCard);
  if (reviewOrgCode === '2') {
    // 国保の場合
    const copaymentRate = insuranceCard.copaymentRate 
      ? parseInt(insuranceCard.copaymentRate) 
      : 30;
    const benefitRate = 100 - copaymentRate;
    return String(benefitRate).padStart(3, '0');
  }
  return null;
}
```

**ステップ3**: CSVビルダーで使用

```typescript
// CSVビルダーでは、計算せずにデータから取得
private addRERecord(data: ReceiptCsvData): void {
  // 計算するのではなく、データから取得
  const benefitRatio = data.receipt.benefitRatio || '';
  // ...
}
```

**ステップ4**: Excelビルダーで使用

```typescript
// Excelビルダーでも、データから取得
private async fillSpecialNoteCells(sheet: ExcelJS.Worksheet, data: ReceiptCsvData): Promise<void> {
  // K14: 給付割合
  if (data.receipt.benefitRatio) {
    const formattedRatio = formatBenefitRatio(data.receipt.benefitRatio);
    sheet.getCell('K14').value = formattedRatio;
  }
}
```

### 方法2: Excelビルダーで計算する（簡易的な方法）

CSVビルダーと同じロジックをExcelビルダーにも実装する方法です。ただし、**ロジックの重複**が発生するため、推奨しません。

```typescript
// Excelビルダーで計算
private async fillSpecialNoteCells(sheet: ExcelJS.Worksheet, data: ReceiptCsvData): Promise<void> {
  // CSVビルダーと同じロジックで計算
  const reviewOrgCode = this.determineReviewOrganizationCode(data);
  let benefitRatio = '';
  if (reviewOrgCode === '2') {
    const copaymentRate = data.insuranceCard.copaymentRate 
      ? parseInt(data.insuranceCard.copaymentRate) 
      : 30;
    const benefitRate = 100 - copaymentRate;
    benefitRatio = String(benefitRate).padStart(3, '0');
  }
  
  if (benefitRatio) {
    const formattedRatio = formatBenefitRatio(benefitRatio);
    sheet.getCell('K14').value = formattedRatio;
  }
}
```

---

## まとめ

### 現在の問題

- ✅ CSVビルダーでは給付割合を**計算**してCSVに出力している
- ❌ しかし、計算結果を`ReceiptCsvData`型に**保存していない**
- ❌ そのため、Excelビルダーでは給付割合を**取得できない**

### 解決策

1. **`ReceiptCsvData`型に`benefitRatio`フィールドを追加**
2. **APIエンドポイントで給付割合を計算して`ReceiptCsvData`に含める**
3. **CSVビルダーとExcelビルダーの両方で、データから取得する**

これにより、CSV出力とExcel出力の両方で同じ給付割合を使用できるようになります。

---

## 補足: 給付割合の計算ロジック

### 計算式

```
給付割合 = 100 - 負担割合
```

### 例

- **負担割合が3割（30%）の場合**: 給付割合 = 100 - 30 = 70% → "070"
- **負担割合が2割（20%）の場合**: 給付割合 = 100 - 20 = 80% → "080"
- **負担割合が1割（10%）の場合**: 給付割合 = 100 - 10 = 90% → "090"

### 出力形式

- **CSV**: 3桁の文字列（例: "070", "080", "090"）
- **Excel**: 変換後の形式（例: "7", "8", "9" または "7.0", "8.0", "9.0"）

### 適用条件

- **国民健康保険（国保）の場合のみ**給付割合を記録
- **社会保険（社保）の場合は空欄**

判定方法: 審査支払機関コードが`'2'`の場合が国保

