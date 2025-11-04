# データベーススキーマ変更仕様

医療保険レセプトCSV出力機能のために必要なデータベーススキーマ変更の詳細。

## 1. 既存テーブルへのフィールド追加

### 1.1 facilities テーブル

#### 追加フィールド

```typescript
// shared/schema.ts の facilities テーブル定義に追加

facilityCode: varchar("facility_code", { length: 7 }).notNull(),
prefectureCode: varchar("prefecture_code", { length: 2 }).notNull(),
```

#### フィールド詳細

| フィールド名 | 型 | 必須 | 説明 | 例 |
|------------|-----|------|------|-----|
| facilityCode | varchar(7) | ○ | 厚生局から交付される7桁の施設コード | 1234567 |
| prefectureCode | varchar(2) | ○ | 都道府県コード（01-47） | 13（東京都） |

#### バリデーション
- facilityCode: 7桁の数字のみ
- prefectureCode: 01-47の範囲

#### マイグレーション後の対応
既存の施設データに対して、手動で施設コードと都道府県コードを登録する必要がある。

---

### 1.2 medicalInstitutions テーブル

#### 追加フィールド

```typescript
// shared/schema.ts の medicalInstitutions テーブル定義に追加

institutionCode: varchar("institution_code", { length: 7 }).notNull(),
prefectureCode: varchar("prefecture_code", { length: 2 }).notNull(),
```

#### フィールド詳細

| フィールド名 | 型 | 必須 | 説明 | 例 |
|------------|-----|------|------|-----|
| institutionCode | varchar(7) | ○ | 7桁の医療機関コード | 9876543 |
| prefectureCode | varchar(2) | ○ | 都道府県コード（01-47） | 13（東京都） |

#### バリデーション
- institutionCode: 7桁の数字のみ
- prefectureCode: 01-47の範囲

---

### 1.3 patients テーブル

#### 追加フィールド

```typescript
// shared/schema.ts の patients テーブル定義に追加

kanaName: varchar("kana_name", { length: 50 }).notNull(),
```

#### フィールド詳細

| フィールド名 | 型 | 必須 | 説明 | 例 |
|------------|-----|------|------|-----|
| kanaName | varchar(50) | ○ | カナ氏名（全角カタカナ） | ヤマダ タロウ |

#### バリデーション
- 全角カタカナのみ（ァ-ヶー・空白）
- 姓と名の間は全角スペース1つ

#### 注意事項
既存の患者データにはカナ氏名が存在しないため、マイグレーション後に手動で追加するか、漢字氏名からの自動変換を検討する必要がある。

---

### 1.4 doctorOrders テーブル

#### 追加フィールド

```typescript
// shared/schema.ts の doctorOrders テーブル定義に追加

icd10Code: varchar("icd10_code", { length: 7 }),
```

#### フィールド詳細

| フィールド名 | 型 | 必須 | 説明 | 例 |
|------------|-----|------|------|-----|
| icd10Code | varchar(7) | ○ | ICD-10傷病コード | I10（本態性高血圧症） |

#### バリデーション
- 英数字、ピリオド、ハイフン
- 形式: A00-Z99の範囲（詳細はICD-10仕様参照）

#### 注意事項
- 既存の診断名フィールド（diagnosis）はテキスト形式なので、ICD-10コードを追加で入力する必要がある
- 診断名とICD-10コードの対応を検証する仕組みが必要

---

### 1.5 nursingRecords テーブル

#### 追加フィールド

```typescript
// shared/schema.ts の nursingRecords テーブル定義に追加

serviceCodeId: uuid("service_code_id").references(() => nursingServiceCodes.id),
visitLocationCode: varchar("visit_location_code", { length: 2 }).notNull(),
staffQualificationCode: varchar("staff_qualification_code", { length: 2 }).notNull(),
```

#### フィールド詳細

| フィールド名 | 型 | 必須 | 説明 | 例 |
|------------|-----|------|------|-----|
| serviceCodeId | uuid | ○ | 訪問看護サービスコードマスタへの外部キー | (UUID) |
| visitLocationCode | varchar(2) | ○ | 訪問場所コード（別表16） | 01（居宅） |
| staffQualificationCode | varchar(2) | ○ | 職員資格コード（別表20） | 01（看護師） |

#### 外部キー制約
- serviceCodeId → nursingServiceCodes.id

---

### 1.6 monthlyReceipts テーブル

#### 追加フィールド

```typescript
// shared/schema.ts の monthlyReceipts テーブル定義に追加

csvExportReady: boolean("csv_export_ready").default(false).notNull(),
csvExportWarnings: jsonb("csv_export_warnings"),
lastCsvExportCheck: timestamp("last_csv_export_check"),
```

#### フィールド詳細

| フィールド名 | 型 | 必須 | 説明 | 例 |
|------------|-----|------|------|-----|
| csvExportReady | boolean | ○ | CSV出力可能フラグ | true / false |
| csvExportWarnings | jsonb | - | 不足データの警告情報（JSON配列） | [{category: 'patient', field: 'kanaName', message: 'カナ氏名が未入力です'}] |
| lastCsvExportCheck | timestamp | - | 最終チェック日時 | 2025-11-03 10:30:00 |

#### csvExportWarnings の構造

```typescript
interface CsvExportWarning {
  category: 'facility' | 'patient' | 'insurance' | 'doctor_order' | 'nursing_record' | 'medical_institution';
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

// 例
[
  {
    "category": "patient",
    "field": "kanaName",
    "message": "カナ氏名が未入力です",
    "severity": "error"
  },
  {
    "category": "medical_institution",
    "field": "institutionCode",
    "message": "医療機関コードが未入力です",
    "severity": "error"
  }
]
```

---

## 2. 新規マスターテーブルの作成

### 2.1 nursing_service_codes テーブル

訪問看護サービスコードマスタ（診療報酬点数表のコード）

```typescript
export const nursingServiceCodes = pgTable("nursing_service_codes", {
  id: uuid("id").defaultRandom().primaryKey(),
  serviceCode: varchar("service_code", { length: 9 }).notNull().unique(),
  serviceName: varchar("service_name", { length: 100 }).notNull(),
  points: integer("points").notNull(),
  validFrom: date("valid_from").notNull(),
  validTo: date("valid_to"),
  insuranceType: varchar("insurance_type", { length: 20 }).notNull().default("medical"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

#### フィールド詳細

| フィールド名 | 型 | 必須 | 説明 | 例 |
|------------|-----|------|------|-----|
| id | uuid | ○ | プライマリキー | (UUID) |
| serviceCode | varchar(9) | ○ | 9桁のサービスコード（ユニーク） | 311000110 |
| serviceName | varchar(100) | ○ | サービス名称 | 訪問看護基本療養費（Ⅰ）週3日まで |
| points | integer | ○ | 点数 | 5550 |
| validFrom | date | ○ | 有効開始日 | 2024-04-01 |
| validTo | date | - | 有効終了日（NULL = 無期限） | 2025-03-31 |
| insuranceType | varchar(20) | ○ | 保険種別（'medical'固定） | medical |
| isActive | boolean | ○ | 有効フラグ | true |
| createdAt | timestamp | ○ | 作成日時 | 2025-11-03 10:00:00 |
| updatedAt | timestamp | ○ | 更新日時 | 2025-11-03 10:00:00 |

#### インデックス
```typescript
// serviceCodeにユニークインデックス（既に定義済み）
// isActiveとvalidFrom/validToで検索することが多いため、複合インデックス推奨
```

---

### 2.2 staff_qualification_codes テーブル

職員資格コードマスタ（別表20）

```typescript
export const staffQualificationCodes = pgTable("staff_qualification_codes", {
  id: uuid("id").defaultRandom().primaryKey(),
  qualificationCode: varchar("qualification_code", { length: 2 }).notNull().unique(),
  qualificationName: varchar("qualification_name", { length: 50 }).notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

#### フィールド詳細

| フィールド名 | 型 | 必須 | 説明 | 例 |
|------------|-----|------|------|-----|
| id | uuid | ○ | プライマリキー | (UUID) |
| qualificationCode | varchar(2) | ○ | 職員資格コード（ユニーク） | 01 |
| qualificationName | varchar(50) | ○ | 資格名称 | 看護師 |
| description | text | - | 説明 | 保健師助産師看護師法に基づく看護師 |
| isActive | boolean | ○ | 有効フラグ | true |
| createdAt | timestamp | ○ | 作成日時 | 2025-11-03 10:00:00 |
| updatedAt | timestamp | ○ | 更新日時 | 2025-11-03 10:00:00 |

#### 初期データ例

| qualificationCode | qualificationName |
|------------------|------------------|
| 01 | 看護師 |
| 02 | 准看護師 |
| 03 | 保健師 |
| 04 | 助産師 |
| 05 | 理学療法士 |
| 06 | 作業療法士 |
| 07 | 言語聴覚士 |

（詳細は `master_data_initial.md` 参照）

---

### 2.3 visit_location_codes テーブル

訪問場所コードマスタ（別表16）

```typescript
export const visitLocationCodes = pgTable("visit_location_codes", {
  id: uuid("id").defaultRandom().primaryKey(),
  locationCode: varchar("location_code", { length: 2 }).notNull().unique(),
  locationName: varchar("location_name", { length: 50 }).notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

#### フィールド詳細

| フィールド名 | 型 | 必須 | 説明 | 例 |
|------------|-----|------|------|-----|
| id | uuid | ○ | プライマリキー | (UUID) |
| locationCode | varchar(2) | ○ | 訪問場所コード（ユニーク） | 01 |
| locationName | varchar(50) | ○ | 場所名称 | 居宅 |
| description | text | - | 説明 | 利用者の自宅 |
| isActive | boolean | ○ | 有効フラグ | true |
| createdAt | timestamp | ○ | 作成日時 | 2025-11-03 10:00:00 |
| updatedAt | timestamp | ○ | 更新日時 | 2025-11-03 10:00:00 |

#### 初期データ例

| locationCode | locationName |
|-------------|-------------|
| 01 | 居宅 |
| 02 | 老人ホーム |
| 03 | 特別養護老人ホーム |
| 04 | 介護老人保健施設 |
| 05 | その他の施設 |

（詳細は `master_data_initial.md` 参照）

---

### 2.4 receipt_type_codes テーブル

レセプト種別コードマスタ（別表4）

```typescript
export const receiptTypeCodes = pgTable("receipt_type_codes", {
  id: uuid("id").defaultRandom().primaryKey(),
  receiptTypeCode: varchar("receipt_type_code", { length: 4 }).notNull().unique(),
  receiptTypeName: varchar("receipt_type_name", { length: 50 }).notNull(),
  insuranceType: varchar("insurance_type", { length: 20 }).notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

#### フィールド詳細

| フィールド名 | 型 | 必須 | 説明 | 例 |
|------------|-----|------|------|-----|
| id | uuid | ○ | プライマリキー | (UUID) |
| receiptTypeCode | varchar(4) | ○ | レセプト種別コード（ユニーク） | 3110 |
| receiptTypeName | varchar(50) | ○ | 種別名称 | 医療保険・訪問看護療養費 |
| insuranceType | varchar(20) | ○ | 対応する保険種別 | medical |
| description | text | - | 説明 | 健康保険法に基づく訪問看護療養費 |
| isActive | boolean | ○ | 有効フラグ | true |
| createdAt | timestamp | ○ | 作成日時 | 2025-11-03 10:00:00 |
| updatedAt | timestamp | ○ | 更新日時 | 2025-11-03 10:00:00 |

#### 初期データ例

| receiptTypeCode | receiptTypeName | insuranceType |
|----------------|----------------|--------------|
| 3110 | 訪問看護療養費（健康保険） | medical |
| 3120 | 訪問看護療養費（国民健康保険） | medical |
| 3130 | 訪問看護療養費（後期高齢者医療） | medical |

（詳細は `master_data_initial.md` 参照）

---

### 2.5 prefecture_codes テーブル

都道府県コードマスタ

```typescript
export const prefectureCodes = pgTable("prefecture_codes", {
  id: uuid("id").defaultRandom().primaryKey(),
  prefectureCode: varchar("prefecture_code", { length: 2 }).notNull().unique(),
  prefectureName: varchar("prefecture_name", { length: 10 }).notNull(),
  displayOrder: integer("display_order").notNull(),
  isActive: boolean("is_active").notNull().default(true),
});
```

#### フィールド詳細

| フィールド名 | 型 | 必須 | 説明 | 例 |
|------------|-----|------|------|-----|
| id | uuid | ○ | プライマリキー | (UUID) |
| prefectureCode | varchar(2) | ○ | 都道府県コード（ユニーク） | 13 |
| prefectureName | varchar(10) | ○ | 都道府県名 | 東京都 |
| displayOrder | integer | ○ | 表示順序 | 13 |
| isActive | boolean | ○ | 有効フラグ | true |

#### 初期データ例

| prefectureCode | prefectureName | displayOrder |
|---------------|---------------|--------------|
| 01 | 北海道 | 1 |
| 02 | 青森県 | 2 |
| ... | ... | ... |
| 13 | 東京都 | 13 |
| ... | ... | ... |
| 47 | 沖縄県 | 47 |

（47都道府県全て、詳細は `master_data_initial.md` 参照）

---

## 3. マイグレーション実行手順

### 3.1 スキーマファイルの更新

`/shared/schema.ts` に上記のテーブル定義を追加する。

### 3.2 型定義の生成（自動）

スキーマファイルを更新すると、TypeScriptの型定義が自動的に生成される。

### 3.3 データベースへの反映

```bash
npm run db:push
```

このコマンドで、Drizzle ORMがスキーマ変更を検出し、PostgreSQLに反映する。

### 3.4 マスターデータの投入

マイグレーション後、マスターテーブルに初期データを投入する必要がある。

#### 方法1: SQL直接実行
```bash
psql $DATABASE_URL -f scripts/insert_master_data.sql
```

#### 方法2: Nodeスクリプト実行
```bash
npx tsx scripts/insertMasterData.ts
```

詳細は `master_data_initial.md` を参照。

---

## 4. 既存データの対応

### 4.1 既存施設データ

既存の施設には `facilityCode` と `prefectureCode` が存在しないため、以下のいずれかの対応が必要:

1. **手動登録**: 管理画面で施設ごとに施設コードと都道府県コードを登録
2. **一括更新スクリプト**: CSVなどで一括インポート

### 4.2 既存医療機関データ

既存の医療機関には `institutionCode` と `prefectureCode` が存在しないため、同様に手動登録または一括更新が必要。

### 4.3 既存患者データ

既存の患者には `kanaName` が存在しないため、以下のいずれかの対応が必要:

1. **手動登録**: 患者編集画面でカナ氏名を追加入力
2. **自動変換**: 漢字氏名からカナ氏名への自動変換（完全な精度は保証できない）

漢字→カナ変換ライブラリの例:
- `kuroshiro` + `kuromoji`
- ただし、人名の読みは複数存在するため、手動確認が望ましい

### 4.4 既存診断データ

既存の診断には `icd10Code` が存在しないため、手動で追加入力が必要。

### 4.5 既存訪問記録データ

既存の訪問記録には以下のフィールドが存在しないため、データ補完が必要:
- `serviceCodeId`
- `visitLocationCode`
- `staffQualificationCode`

これらのフィールドがNULLの訪問記録は、CSV出力時にエラーとなる。

---

## 5. 制約とインデックス

### 5.1 ユニーク制約

以下のフィールドにユニーク制約を設定:
- `nursingServiceCodes.serviceCode`
- `staffQualificationCodes.qualificationCode`
- `visitLocationCodes.locationCode`
- `receiptTypeCodes.receiptTypeCode`
- `prefectureCodes.prefectureCode`

### 5.2 外部キー制約

- `nursingRecords.serviceCodeId` → `nursingServiceCodes.id`

### 5.3 推奨インデックス

パフォーマンス向上のため、以下のインデックスを推奨:

```typescript
// nursingServiceCodesテーブル
// - serviceCode（既にユニーク制約でインデックス作成済み）
// - (isActive, validFrom, validTo) の複合インデックス

// nursingRecordsテーブル
// - serviceCodeId（外部キーで自動作成）
// - visitLocationCode
// - staffQualificationCode

// monthlyReceiptsテーブル
// - csvExportReady
```

---

## 6. スキーマ変更の影響範囲

### 6.1 既存機能への影響

#### 最小限の影響
- 既存テーブルへのフィールド追加は、既存のクエリには影響しない（NULLまたはデフォルト値）
- 新規テーブルは既存機能と独立しているため影響なし

#### 注意が必要な箇所
- `nursingRecords` テーブルへの新規フィールド追加
  - 訪問記録の新規作成時に、新しいフィールドも入力する必要がある
  - 既存の訪問記録はNULLのため、CSV出力時にエラーとなる

### 6.2 アプリケーションコードへの影響

#### 必須の変更
1. **フォームコンポーネント**: 新しいフィールドの入力欄追加
2. **バリデーション**: 新しいフィールドのバリデーションロジック追加
3. **APIエンドポイント**: 新しいフィールドの保存処理追加
4. **型定義**: スキーマ変更に伴う型定義の更新（自動）

#### 推奨の変更
1. **マスターデータ管理画面**: 新規作成
2. **データ充足状況チェック**: 新規作成

---

## 7. ロールバック計画

スキーマ変更後に問題が発生した場合のロールバック手順:

### 7.1 フィールド削除（既存テーブル）

```sql
-- facilities
ALTER TABLE facilities DROP COLUMN facility_code;
ALTER TABLE facilities DROP COLUMN prefecture_code;

-- medicalInstitutions
ALTER TABLE medical_institutions DROP COLUMN institution_code;
ALTER TABLE medical_institutions DROP COLUMN prefecture_code;

-- patients
ALTER TABLE patients DROP COLUMN kana_name;

-- doctorOrders
ALTER TABLE doctor_orders DROP COLUMN icd10_code;

-- nursingRecords
ALTER TABLE nursing_records DROP COLUMN service_code_id;
ALTER TABLE nursing_records DROP COLUMN visit_location_code;
ALTER TABLE nursing_records DROP COLUMN staff_qualification_code;

-- monthlyReceipts
ALTER TABLE monthly_receipts DROP COLUMN csv_export_ready;
ALTER TABLE monthly_receipts DROP COLUMN csv_export_warnings;
ALTER TABLE monthly_receipts DROP COLUMN last_csv_export_check;
```

### 7.2 テーブル削除（新規テーブル）

```sql
DROP TABLE IF EXISTS nursing_service_codes CASCADE;
DROP TABLE IF EXISTS staff_qualification_codes CASCADE;
DROP TABLE IF EXISTS visit_location_codes CASCADE;
DROP TABLE IF EXISTS receipt_type_codes CASCADE;
DROP TABLE IF EXISTS prefecture_codes CASCADE;
```

---

## 8. テスト計画

### 8.1 スキーマ変更後のテスト

1. **マイグレーション成功確認**:
   ```bash
   npm run db:push
   # エラーが出ないことを確認
   ```

2. **テーブル存在確認**:
   ```sql
   SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public'
   AND table_name IN ('nursing_service_codes', 'staff_qualification_codes', 'visit_location_codes', 'receipt_type_codes', 'prefecture_codes');
   ```

3. **フィールド存在確認**:
   ```sql
   SELECT column_name, data_type FROM information_schema.columns
   WHERE table_name = 'facilities'
   AND column_name IN ('facility_code', 'prefecture_code');
   ```

4. **制約確認**:
   ```sql
   SELECT constraint_name, constraint_type
   FROM information_schema.table_constraints
   WHERE table_name = 'nursing_service_codes';
   ```

### 8.2 データ投入テスト

マスターデータ投入後、各テーブルのレコード数を確認:
```sql
SELECT COUNT(*) FROM nursing_service_codes;
SELECT COUNT(*) FROM staff_qualification_codes;
SELECT COUNT(*) FROM visit_location_codes;
SELECT COUNT(*) FROM receipt_type_codes;
SELECT COUNT(*) FROM prefecture_codes; -- 47件のはず
```

---

## 9. 次のステップ

1. ✅ スキーマ変更の実装（このドキュメントに基づく）
2. ⏭️ マスターデータの投入（`master_data_initial.md` 参照）
3. ⏭️ UI変更の実装（`ui_changes.md` 参照）
4. ⏭️ CSV生成ロジックの実装（`csv_record_specifications.md` 参照）

---

## 変更履歴

| 日付 | 変更内容 | 担当者 |
|------|---------|--------|
| 2025-11-03 | 初版作成 | - |
