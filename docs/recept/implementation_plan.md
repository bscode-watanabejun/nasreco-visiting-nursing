# 医療保険レセプトCSV出力機能 実装計画書

## 概要

令和6年6月版「オンライン請求に係る記録条件仕様（訪問看護用）」に準拠した医療保険レセプトCSV出力機能の実装計画。

現在の簡易版CSV出力を完全に書き換え、18種類のレコードタイプによる階層構造のCSVファイルを生成する。

## 実装方針

### データ管理方針
1. **施設コード（7桁）**: 施設マスタに手動登録
2. **訪問看護サービスコード（9桁）**: 診療報酬点数表のコードをマスターテーブルとして作成
3. **ICD-10傷病コード**: 診断名入力時にICD-10コードも入力
4. **患者カナ氏名**: 患者登録画面にカナ氏名入力欄を追加
5. **医療機関コード（7桁）**: 医療機関マスタに手動で登録
6. **データ不足時の対応**: 警告を出してCSV出力をブロック

## Phase 1: データベーススキーマ拡張（Week 1-2）

### 1.1 既存テーブルへのフィールド追加

#### facilities テーブル
```typescript
facilityCode: varchar(7)       // 7桁の施設コード（必須）
prefectureCode: varchar(2)     // 2桁の都道府県コード（必須）
```

#### medicalInstitutions テーブル
```typescript
institutionCode: varchar(7)    // 7桁の医療機関コード（必須）
prefectureCode: varchar(2)     // 2桁の都道府県コード（必須）
```

#### patients テーブル
```typescript
kanaName: varchar(50)          // カナ氏名（全角カタカナ、必須）
```

#### doctorOrders テーブル（または diagnoses テーブル）
```typescript
icd10Code: varchar(7)          // ICD-10コード（必須）
```

#### nursingRecords テーブル
```typescript
serviceCodeId: uuid            // nursing_service_codesへの外部キー（必須）
visitLocationCode: varchar(2)  // 訪問場所コード（必須）
staffQualificationCode: varchar(2) // 職員資格コード（必須）
```

### 1.2 新規マスターテーブルの作成

#### nursing_service_codes テーブル
```typescript
id: uuid (primary key)
serviceCode: varchar(9)        // 9桁のサービスコード
serviceName: varchar(100)      // サービス名称
points: integer                // 点数
validFrom: date                // 有効開始日
validTo: date                  // 有効終了日（NULL = 無期限）
insuranceType: varchar(20)     // 'medical' 固定
isActive: boolean              // 有効フラグ
createdAt: timestamp
updatedAt: timestamp
```

#### staff_qualification_codes テーブル
```typescript
id: uuid (primary key)
qualificationCode: varchar(2)  // 職員資格コード（別表20）
qualificationName: varchar(50) // 資格名称
isActive: boolean
createdAt: timestamp
updatedAt: timestamp
```

#### visit_location_codes テーブル
```typescript
id: uuid (primary key)
locationCode: varchar(2)       // 訪問場所コード（別表16）
locationName: varchar(50)      // 場所名称
isActive: boolean
createdAt: timestamp
updatedAt: timestamp
```

#### receipt_type_codes テーブル
```typescript
id: uuid (primary key)
receiptTypeCode: varchar(4)    // レセプト種別コード（4桁）
receiptTypeName: varchar(50)   // 種別名称
insuranceType: varchar(20)     // 対応する保険種別
description: text              // 説明
isActive: boolean
createdAt: timestamp
updatedAt: timestamp
```

#### prefecture_codes テーブル
```typescript
id: uuid (primary key)
prefectureCode: varchar(2)     // 都道府県コード（01-47）
prefectureName: varchar(10)    // 都道府県名
isActive: boolean
```

### 1.3 monthlyReceipts テーブルへの追加フィールド
```typescript
csvExportReady: boolean        // CSV出力可能フラグ
csvExportWarnings: jsonb       // 不足データの警告情報
lastCsvExportCheck: timestamp  // 最終チェック日時
```

### 1.4 マイグレーション実行
```bash
npm run db:push
```

## Phase 2: マスターデータ初期投入とUI拡張（Week 2-3）

### 2.1 マスターデータ初期投入
- 都道府県コードマスタ（47都道府県）
- 訪問場所コードマスタ（別表16）
- 職員資格コードマスタ（別表20）
- レセプト種別コードマスタ（別表4）
- 主要な訪問看護サービスコードマスタ（診療報酬点数表より）

詳細は `master_data_initial.md` を参照。

### 2.2 施設管理画面の拡張
**ファイル**: `client/src/components/FacilitySettings.tsx`（または該当ファイル）

追加フィールド:
- 施設コード（7桁、数字のみ、必須）
- 都道府県コード（セレクトボックス、必須）

バリデーション:
- 施設コードは7桁の数字
- 都道府県コードは01-47の範囲

### 2.3 医療機関管理画面の拡張
**ファイル**: `client/src/components/MedicalInstitutionForm.tsx`（または該当ファイル）

追加フィールド:
- 医療機関コード（7桁、数字のみ、必須）
- 都道府県コード（セレクトボックス、必須）

### 2.4 患者登録画面の拡張
**ファイル**: `client/src/components/PatientForm.tsx`（または該当ファイル）

追加フィールド:
- カナ氏名（全角カタカナ、必須）

バリデーション:
- 全角カタカナのみ許可（ァ-ヶー・空白）
- 姓と名の間は全角スペース

### 2.5 診断名入力画面の拡張
**ファイル**: 診断名を入力する画面（doctorOrdersまたはdiagnosesの編集画面）

追加フィールド:
- ICD-10コード（7桁、英数字、必須）

入力補助機能（推奨）:
- ICD-10コード検索・サジェスト機能
- よく使われるコードのリスト表示

### 2.6 訪問記録入力画面の拡張
**ファイル**: `client/src/components/NursingRecordForm.tsx`（または該当ファイル）

追加フィールド:
- サービスコード（セレクトボックス、nursing_service_codesから選択、必須）
- 訪問場所コード（セレクトボックス、必須）
- 職員資格コード（セレクトボックス、必須）

### 2.7 マスターデータ管理画面の新規作成
**新規ファイル**:
- `client/src/components/NursingServiceCodeManagement.tsx`
- `client/src/components/StaffQualificationCodeManagement.tsx`
- `client/src/components/VisitLocationCodeManagement.tsx`

機能:
- マスターデータの一覧表示
- 追加・編集・削除
- 有効/無効の切り替え
- インポート機能（CSV）

## Phase 3: CSV出力準備チェック機能（Week 3）

### 3.1 データ充足状況チェックロジック
**新規ファイル**: `server/services/receiptCsvValidator.ts`

```typescript
interface CsvExportValidationResult {
  isReady: boolean;
  warnings: CsvExportWarning[];
  checkedAt: Date;
}

interface CsvExportWarning {
  category: 'facility' | 'patient' | 'insurance' | 'doctor_order' | 'nursing_record' | 'medical_institution';
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

// 必須データのチェック項目
// - 施設コード、都道府県コード
// - 患者カナ氏名
// - 保険証情報（保険者番号、記号番号など）
// - 医師指示書（ICD-10コード、医療機関コード）
// - 訪問記録（サービスコード、訪問場所コード、職員資格コード）
```

### 3.2 月次レセプト生成時のチェック統合
**既存ファイル**: `server/routes.ts` の月次レセプト生成処理

レセプト生成時に自動的にCSV出力可否をチェックし、結果を保存:
```typescript
const validationResult = await validateReceiptForCsvExport(receiptId);
await db.update(monthlyReceipts)
  .set({
    csvExportReady: validationResult.isReady,
    csvExportWarnings: validationResult.warnings,
    lastCsvExportCheck: new Date()
  })
  .where(eq(monthlyReceipts.id, receiptId));
```

### 3.3 月次レセプト管理画面への警告表示
**既存ファイル**: `client/src/components/MonthlyReceiptsManagement.tsx`

変更点:
- レセプト一覧に警告アイコン表示（csvExportReady === false の場合）
- 警告の詳細をツールチップまたはダイアログで表示
- 「医療保険CSV出力」ボタンのdisable制御（全レセプトがcsvExportReady === true の場合のみ有効）

## Phase 4: CSV生成エンジン開発（Week 4-5）

### 4.1 CSV生成サービスの作成
**新規ファイル**: `server/services/receiptCsvExportService.ts`

主要機能:
1. Shift_JISエンコーディング対応（`iconv-lite`ライブラリ使用）
2. CR+LF改行コード対応
3. EOF終端コード（0x1A）追加
4. 固定長・可変長フィールドフォーマッター

```typescript
import iconv from 'iconv-lite';

class ReceiptCsvExportService {
  // CSV全体を生成
  async generateCsv(facilityId: string, year: number, month: number): Promise<Buffer>

  // Shift_JISエンコーディング
  private encodeShiftJIS(content: string): Buffer

  // CR+LF改行コード追加
  private formatLine(fields: string[]): string

  // EOF終端コード追加
  private addEOF(buffer: Buffer): Buffer

  // 固定長フィールドのフォーマット（バイト数制限）
  private formatFixedField(value: string, byteLength: number): string

  // 可変長フィールドのフォーマット
  private formatVariableField(value: string): string
}
```

### 4.2 18種類のレコードジェネレーター実装
**新規ファイル**: `server/services/receiptRecordGenerators.ts`

各レコードタイプごとに関数を作成:

```typescript
// HM: 訪問看護ステーション情報
function generateHMRecord(facility: Facility, year: number, month: number): string[]

// GO: 訪問看護療養費請求書（固定で"GO"のみ）
function generateGORecord(): string[]

// RE: レセプト共通
function generateRERecord(receipt: MonthlyReceipt, patient: Patient, insurance: InsuranceCard): string[]

// HO: 保険者
function generateHORecord(insurance: InsuranceCard): string[]

// KO: 公費（任意・複数可）
function generateKORecords(publicExpenses: PublicExpense[]): string[][]

// SN: 資格確認
function generateSNRecord(insurance: InsuranceCard): string[]

// JD: 受診日等（31日分のフラグ）
function generateJDRecord(nursingRecords: NursingRecord[], year: number, month: number): string[]

// MF: 窓口負担額（任意）
function generateMFRecord(receipt: MonthlyReceipt): string[] | null

// IH: 医療機関・保険医情報
function generateIHRecord(medicalInstitution: MedicalInstitution, doctorOrder: DoctorOrder): string[]

// HJ: 訪問看護指示
function generateHJRecord(doctorOrder: DoctorOrder): string[]

// JS: 心身の状態（任意）
function generateJSRecord(doctorOrder: DoctorOrder): string[] | null

// SY: 傷病名
function generateSYRecords(diagnoses: Diagnosis[]): string[][]

// RJ: 利用者情報
function generateRJRecord(patient: Patient, nursingRecords: NursingRecord[]): string[]

// TJ: 情報提供（任意）
function generateTJRecord(): string[] | null

// TZ: 特記事項（任意）
function generateTZRecord(receipt: MonthlyReceipt): string[] | null

// KS: 専門の研修（任意）
function generateKSRecord(nursingRecords: NursingRecord[]): string[] | null

// CO: コメント（任意）
function generateCORecords(comments: Comment[]): string[][]

// KA: 訪問看護療養費（複数）
function generateKARecords(nursingRecords: NursingRecord[], bonuses: BonusCalculationHistory[]): string[][]
```

詳細なフィールド定義は `csv_record_specifications.md` を参照。

### 4.3 階層構造CSVビルダー
**新規ファイル**: `server/services/receiptCsvBuilder.ts`

```typescript
class ReceiptCsvBuilder {
  private lines: string[] = [];

  // HMレコード追加（ファイル全体で1つ）
  addHMRecord(facility: Facility, year: number, month: number): void

  // GOレコード追加（ファイル全体で1つ）
  addGORecord(): void

  // レセプト情報追加（複数）
  addReceipt(receipt: MonthlyReceipt, relatedData: ReceiptRelatedData): void

  // CSV文字列生成
  build(): string

  // 階層構造の検証
  private validateHierarchy(): void
}
```

正しいレコード順序:
1. HM（1つ）
2. GO（1つ）
3. レセプトごとに繰り返し:
   - RE（必須）
   - HO（必須）
   - KO（任意・複数可）
   - SN（必須）
   - JD（任意・複数可）
   - MF（任意）
   - IH（必須）
   - HJ（必須）
   - JS（任意）
   - SY（必須・複数可）
   - RJ（必須）
   - TJ（任意）
   - TZ（任意）
   - KS（任意）
   - CO（任意・複数可）
   - KA（必須・複数可）

## Phase 5: API実装（Week 5）

### 5.1 バックエンドAPIの書き換え
**既存ファイル**: `server/routes.ts`

`GET /api/monthly-receipts/export/medical-insurance` エンドポイントを完全に書き換え:

```typescript
app.get('/api/monthly-receipts/export/medical-insurance', async (req, res) => {
  try {
    const { facilityId, year, month } = req.query;

    // 1. レセプト取得
    const receipts = await db.query.monthlyReceipts.findMany({
      where: and(
        eq(monthlyReceipts.facilityId, facilityId),
        eq(monthlyReceipts.billingYear, year),
        eq(monthlyReceipts.billingMonth, month),
        eq(monthlyReceipts.insuranceType, 'medical')
      )
    });

    // 2. データ充足状況チェック
    for (const receipt of receipts) {
      if (!receipt.csvExportReady) {
        return res.status(400).json({
          error: 'CSV出力に必要なデータが不足しています',
          warnings: receipt.csvExportWarnings
        });
      }
    }

    // 3. CSV生成
    const csvService = new ReceiptCsvExportService();
    const csvBuffer = await csvService.generateCsv(facilityId, year, month);

    // 4. ファイルダウンロード
    res.setHeader('Content-Type', 'text/csv; charset=Shift_JIS');
    res.setHeader('Content-Disposition', `attachment; filename="receipt_${year}${month.toString().padStart(2, '0')}.csv"`);
    res.send(csvBuffer);

  } catch (error) {
    console.error('CSV export error:', error);
    res.status(500).json({ error: 'CSV出力中にエラーが発生しました' });
  }
});
```

### 5.2 データ充足状況チェックAPI
**新規エンドポイント**: `POST /api/monthly-receipts/:id/check-csv-export`

```typescript
app.post('/api/monthly-receipts/:id/check-csv-export', async (req, res) => {
  try {
    const { id } = req.params;

    const validationResult = await validateReceiptForCsvExport(id);

    await db.update(monthlyReceipts)
      .set({
        csvExportReady: validationResult.isReady,
        csvExportWarnings: validationResult.warnings,
        lastCsvExportCheck: new Date()
      })
      .where(eq(monthlyReceipts.id, id));

    res.json(validationResult);

  } catch (error) {
    console.error('CSV validation error:', error);
    res.status(500).json({ error: 'チェック中にエラーが発生しました' });
  }
});
```

### 5.3 マスターデータAPI
新規エンドポイント:
- `GET /api/master/nursing-service-codes`
- `POST /api/master/nursing-service-codes`
- `PUT /api/master/nursing-service-codes/:id`
- `DELETE /api/master/nursing-service-codes/:id`

同様に、staff-qualification-codes、visit-location-codes、receipt-type-codes、prefecture-codes用のCRUD APIを作成。

## Phase 6: テストとデバッグ（Week 6）

### 6.1 単体テスト
**新規ファイル**: `server/services/__tests__/receiptRecordGenerators.test.ts`

テスト項目:
- 各レコードジェネレーターのフィールド数チェック
- 固定長フィールドのバイト数チェック
- 日付フォーマットのチェック
- 必須フィールドの存在チェック

### 6.2 統合テスト
**新規ファイル**: `server/services/__tests__/receiptCsvExportService.test.ts`

テスト項目:
- サンプルデータでCSV全体を生成
- Shift_JISエンコーディングの検証
- CR+LF改行コードの検証
- EOF終端コードの検証
- レコード順序の検証
- 仕様書のサンプルとの照合

### 6.3 エンドツーエンドテスト
実データを使った検証:
1. テストデータの投入（全フィールドが埋まっているデータ）
2. CSV出力の実行
3. 生成されたCSVの検証
4. 厚労省提供の検証ツール（あれば）での確認

詳細は `testing_checklist.md` を参照。

## 技術的な注意点

### 1. Shift_JISエンコーディング
```typescript
import iconv from 'iconv-lite';

// UTF-8からShift_JISへの変換
const shiftJisBuffer = iconv.encode(csvContent, 'Shift_JIS');
```

### 2. CR+LF改行コード
```typescript
// 明示的に\r\nを使用
const line = fields.join(',') + '\r\n';
```

### 3. EOF終端コード
```typescript
// バッファの最後に0x1Aを追加
const eofBuffer = Buffer.from([0x1A]);
const finalBuffer = Buffer.concat([csvBuffer, eofBuffer]);
```

### 4. 固定長フィールドのバイト数制限
Shift_JISでは1文字2バイト（半角カナ・記号は1バイト）なので、バイト数でカウント:
```typescript
function formatFixedField(value: string, maxBytes: number): string {
  const buffer = iconv.encode(value, 'Shift_JIS');
  if (buffer.length > maxBytes) {
    // バイト数オーバーの場合は切り詰め
    return iconv.decode(buffer.slice(0, maxBytes), 'Shift_JIS');
  }
  return value;
}
```

### 5. 和暦変換
一部のフィールドは和暦（元号）での表記が必要:
```typescript
function toWareki(date: Date): string {
  // 令和: 2019年5月1日〜
  // 平成: 1989年1月8日〜2019年4月30日
  // ...
}
```

### 6. カンマのエスケープ
フィールド内にカンマが含まれないようバリデーション:
```typescript
function validateNoComma(value: string): void {
  if (value.includes(',')) {
    throw new Error('フィールド内にカンマを含めることはできません');
  }
}
```

## 依存ライブラリの追加

```bash
npm install iconv-lite
npm install --save-dev @types/iconv-lite
```

## 実装の優先順位

### 最優先（Week 1-2）
1. データベーススキーマ拡張
2. マスターデータ初期投入
3. UI拡張（データ入力画面）

### 高優先度（Week 3）
4. データ充足状況チェック機能
5. 月次レセプト管理画面への警告表示

### 中優先度（Week 4-5）
6. CSV生成エンジン開発
7. API実装

### 低優先度（Week 6）
8. テストとデバッグ
9. ドキュメント整備

## 次回作業開始時のチェックリスト

- [ ] `/home/runner/workspace/docs/recept/` 配下のドキュメントを確認
- [ ] `database_schema_changes.md` を参照してスキーマ変更を実施
- [ ] `master_data_initial.md` を参照してマスターデータを投入
- [ ] `ui_changes.md` を参照してUI変更を実施
- [ ] `csv_record_specifications.md` を参照してレコードジェネレーターを実装
- [ ] `api_specifications.md` を参照してAPIを実装
- [ ] `testing_checklist.md` を参照してテストを実施

## 参考資料

- `/home/runner/workspace/docs/recept/nursing_csv_spec.md` - CSV仕様書
- 令和6年6月版「オンライン請求に係る記録条件仕様（訪問看護用）」（厚生労働省）

## 変更履歴

| 日付 | 変更内容 | 担当者 |
|------|---------|--------|
| 2025-11-03 | 初版作成 | - |
