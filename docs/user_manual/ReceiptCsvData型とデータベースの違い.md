# ReceiptCsvData型とデータベースの違い

## 質問

「ReceiptCsvData型にbenefitRatioフィールドを追加」とは、データベースのことですか？それともプログラム内部のことですか？

## 答え

**プログラム内部の型定義**です。**データベースの変更は不要**です。

---

## 詳細説明

### ReceiptCsvData型とは？

`ReceiptCsvData`は、**TypeScriptの型定義（インターフェース）**です。

```typescript
// server/services/csv/types.ts
export interface ReceiptCsvData {
  receipt: {
    id: string;
    targetYear: number;
    // ... 他のフィールド ...
  };
  // ...
}
```

**特徴**:
- ✅ **プログラム内部**で使用される型定義
- ✅ データベースのテーブルではない
- ✅ メモリ上でデータをやり取りするための構造
- ✅ CSVやExcelを生成する際に、データをまとめるための「入れ物」

### データベースとの関係

#### データベース（PostgreSQL）

データベースには、以下のようなテーブルが存在します：

```sql
-- データベースのテーブル（例）
CREATE TABLE monthly_receipts (
  id VARCHAR PRIMARY KEY,
  target_year INTEGER,
  target_month INTEGER,
  total_amount INTEGER,
  -- ...
);

CREATE TABLE insurance_cards (
  id VARCHAR PRIMARY KEY,
  copayment_rate VARCHAR,  -- 負担割合（10, 20, 30）
  -- ...
);
```

**特徴**:
- ✅ データを**永続的に保存**する場所
- ✅ ディスクに保存される
- ✅ テーブル構造を変更するには、マイグレーションが必要

#### ReceiptCsvData型（プログラム内部）

プログラム内で、データベースから取得したデータをまとめるための型：

```typescript
// プログラム内で使用
const csvData: ReceiptCsvData = {
  receipt: {
    id: receipt.id,                    // データベースから取得
    targetYear: receipt.targetYear,    // データベースから取得
    // benefitRatio: 計算で求める（データベースには保存しない）
  },
  insuranceCard: {
    copaymentRate: insuranceCard.copaymentRate,  // データベースから取得
  },
};
```

**特徴**:
- ✅ プログラム実行時に**メモリ上**に作成される
- ✅ データベースから取得したデータと、**計算で求めたデータ**をまとめる
- ✅ CSVやExcelを生成する際に使用
- ✅ プログラム終了時に消える（保存されない）

---

## 給付割合の例

### データベースに保存されているもの

```sql
-- insurance_cards テーブル
copayment_rate: '30'  -- 負担割合（3割）
```

### プログラム内で計算するもの

```typescript
// ReceiptCsvData型に追加するフィールド
benefitRatio: '070'  // 給付割合（7割）= 100 - 30
```

**計算式**: `給付割合 = 100 - 負担割合`

### なぜデータベースに保存しないのか？

1. **計算で求めることができる**
   - 負担割合から給付割合を計算できるため、保存する必要がない

2. **データの整合性**
   - 負担割合と給付割合が矛盾しないように、計算で求める方が安全

3. **ストレージの節約**
   - 不要なデータを保存しない

---

## 実装の流れ

### ステップ1: 型定義に追加（プログラム内部）

```typescript
// server/services/csv/types.ts
export interface ReceiptCsvData {
  receipt: {
    // ... 既存のフィールド ...
    benefitRatio?: string | null;  // ← 追加（プログラム内部の型定義）
  };
}
```

**これは**:
- ✅ TypeScriptの型定義ファイルを編集するだけ
- ✅ データベースの変更は不要
- ✅ マイグレーションは不要

### ステップ2: APIエンドポイントで計算して含める（プログラム内部）

```typescript
// server/routes.ts
const csvData: ReceiptCsvData = {
  receipt: {
    // ... データベースから取得したデータ ...
    // 給付割合を計算（データベースから取得した負担割合から計算）
    benefitRatio: calculateBenefitRatio(insuranceCard) || null,
  },
};

// 計算関数（プログラム内部）
function calculateBenefitRatio(insuranceCard: any): string | null {
  const reviewOrgCode = determineReviewOrganizationCode(insuranceCard);
  if (reviewOrgCode === '2') {
    const copaymentRate = insuranceCard.copaymentRate 
      ? parseInt(insuranceCard.copaymentRate) 
      : 30;
    const benefitRate = 100 - copaymentRate;
    return String(benefitRate).padStart(3, '0');
  }
  return null;
}
```

**これは**:
- ✅ プログラム内で計算するだけ
- ✅ データベースに保存しない
- ✅ メモリ上で一時的に使用

---

## 図解

```
┌─────────────────────────────────────────┐
│ データベース（PostgreSQL）              │
│                                         │
│ monthly_receipts テーブル               │
│ - id                                   │
│ - target_year                          │
│ - target_month                         │
│ - total_amount                         │
│                                         │
│ insurance_cards テーブル                │
│ - id                                   │
│ - copayment_rate  ← 負担割合（保存済み）│
│                                         │
│ ❌ benefit_ratio は保存しない          │
└──────────────┬──────────────────────────┘
               │
               │ データを取得
               ▼
┌─────────────────────────────────────────┐
│ APIエンドポイント（プログラム）         │
│                                         │
│ 1. データベースからデータを取得         │
│ 2. 給付割合を計算（100 - 負担割合）     │
│ 3. ReceiptCsvData型のデータを作成     │
│                                         │
│ const csvData: ReceiptCsvData = {      │
│   receipt: {                           │
│     id: receipt.id,                    │
│     benefitRatio: '070'  ← 計算結果    │
│   }                                     │
│ }                                       │
└──────────────┬──────────────────────────┘
               │
               │ ReceiptCsvDataを渡す
               ▼
┌─────────────────────────────────────────┐
│ CSVビルダー / Excelビルダー             │
│                                         │
│ csvData.receipt.benefitRatio を使用    │
│ CSVやExcelに出力                        │
└─────────────────────────────────────────┘
```

---

## まとめ

### ReceiptCsvData型への追加

- ✅ **プログラム内部**の型定義を変更するだけ
- ✅ **データベースの変更は不要**
- ✅ **マイグレーションは不要**

### データベースとの関係

- データベースには**負担割合（copayment_rate）**が保存されている
- プログラム内で**給付割合（benefitRatio）**を計算する
- 計算結果は**メモリ上**で使用し、データベースには保存しない

### 実装作業

1. **型定義ファイル**（`server/services/csv/types.ts`）を編集
2. **APIエンドポイント**（`server/routes.ts`）で計算ロジックを追加
3. **CSVビルダー**と**Excelビルダー**で使用

**データベースの変更は一切不要**です。

