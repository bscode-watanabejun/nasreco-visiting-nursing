# API仕様書

CSV出力機能のバックエンドAPI仕様。

## API一覧

### CSV出力API
- `GET /api/monthly-receipts/export/medical-insurance` - 医療保険CSV出力（書き換え）

### データチェックAPI
- `POST /api/monthly-receipts/:id/check-csv-export` - CSV出力可否チェック（新規）

### マスターデータAPI
- `GET /api/master/nursing-service-codes` - サービスコード一覧（新規）
- `POST /api/master/nursing-service-codes` - サービスコード作成（新規）
- `PUT /api/master/nursing-service-codes/:id` - サービスコード更新（新規）
- `DELETE /api/master/nursing-service-codes/:id` - サービスコード削除（新規）
- 同様に、staff-qualification-codes、visit-location-codes、prefecture-codes用のCRUD API

---

## 1. 医療保険CSV出力API（書き換え）

### エンドポイント
```
GET /api/monthly-receipts/export/medical-insurance
```

### 説明
指定された施設・年月の医療保険レセプトをShift_JIS形式のCSVファイルとして出力する。

### リクエストパラメータ

| パラメータ名 | 型 | 必須 | 説明 |
|------------|---|------|------|
| facilityId | UUID | ○ | 施設ID |
| year | number | ○ | 請求年（YYYY） |
| month | number | ○ | 請求月（MM） |

### レスポンス

#### 成功時（200 OK）
- **Content-Type**: `text/csv; charset=Shift_JIS`
- **Content-Disposition**: `attachment; filename="receipt_YYYYMM.csv"`
- **Body**: Shift_JISエンコードされたCSVファイル

#### エラー時（400 Bad Request）
```json
{
  "error": "CSV出力に必要なデータが不足しています",
  "warnings": [
    {
      "category": "patient",
      "field": "kanaName",
      "message": "カナ氏名が未入力です",
      "severity": "error"
    }
  ]
}
```

#### エラー時（500 Internal Server Error）
```json
{
  "error": "CSV出力中にエラーが発生しました"
}
```

### 実装例

```typescript
app.get('/api/monthly-receipts/export/medical-insurance', async (req, res) => {
  try {
    const { facilityId, year, month } = req.query;

    // バリデーション
    if (!facilityId || !year || !month) {
      return res.status(400).json({ error: 'パラメータが不足しています' });
    }

    // レセプト取得
    const receipts = await db.query.monthlyReceipts.findMany({
      where: and(
        eq(monthlyReceipts.facilityId, facilityId as string),
        eq(monthlyReceipts.billingYear, parseInt(year as string)),
        eq(monthlyReceipts.billingMonth, parseInt(month as string)),
        eq(monthlyReceipts.insuranceType, 'medical')
      ),
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

    if (receipts.length === 0) {
      return res.status(404).json({ error: 'レセプトが見つかりません' });
    }

    // データ充足状況チェック
    const notReadyReceipts = receipts.filter(r => !r.csvExportReady);
    if (notReadyReceipts.length > 0) {
      const warnings = notReadyReceipts.flatMap(r => r.csvExportWarnings || []);
      return res.status(400).json({
        error: 'CSV出力に必要なデータが不足しています',
        warnings,
      });
    }

    // CSV生成
    const csvService = new ReceiptCsvExportService();
    const csvBuffer = await csvService.generateCsv(
      facilityId as string,
      parseInt(year as string),
      parseInt(month as string)
    );

    // ファイルダウンロード
    const filename = `receipt_${year}${month.toString().padStart(2, '0')}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=Shift_JIS');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvBuffer);

  } catch (error) {
    console.error('CSV export error:', error);
    res.status(500).json({ error: 'CSV出力中にエラーが発生しました' });
  }
});
```

---

## 2. CSV出力可否チェックAPI（新規）

### エンドポイント
```
POST /api/monthly-receipts/:id/check-csv-export
```

### 説明
指定されたレセプトのCSV出力可否をチェックし、不足データがあれば警告を返す。

### リクエストパラメータ

| パラメータ名 | 型 | 必須 | 説明 |
|------------|---|------|------|
| id | UUID | ○ | レセプトID（パスパラメータ） |

### レスポンス

#### 成功時（200 OK）
```json
{
  "isReady": false,
  "errors": [
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
  ],
  "warnings": [
    {
      "category": "insurance",
      "field": "branchNumber",
      "message": "枝番が未入力です",
      "severity": "warning"
    }
  ],
  "checkedAt": "2025-11-03T10:30:00Z"
}
```

### 実装例

```typescript
app.post('/api/monthly-receipts/:id/check-csv-export', async (req, res) => {
  try {
    const { id } = req.params;

    // バリデーション実行
    const validationResult = await validateReceiptForCsvExport(id);

    // 結果をデータベースに保存
    await db.update(monthlyReceipts)
      .set({
        csvExportReady: validationResult.isReady,
        csvExportWarnings: validationResult.errors,
        lastCsvExportCheck: validationResult.checkedAt,
      })
      .where(eq(monthlyReceipts.id, id));

    res.json(validationResult);

  } catch (error) {
    console.error('CSV validation error:', error);
    res.status(500).json({ error: 'チェック中にエラーが発生しました' });
  }
});
```

---

## 3. サービスコードマスタCRUD API（新規）

### 一覧取得
```
GET /api/master/nursing-service-codes
```

#### クエリパラメータ
| パラメータ名 | 型 | 必須 | 説明 |
|------------|---|------|------|
| isActive | boolean | - | 有効/無効フィルタ |

#### レスポンス（200 OK）
```json
[
  {
    "id": "uuid",
    "serviceCode": "311000110",
    "serviceName": "訪問看護基本療養費（Ⅰ）週3日まで",
    "points": 5550,
    "validFrom": "2024-04-01",
    "validTo": null,
    "insuranceType": "medical",
    "isActive": true,
    "createdAt": "2025-11-03T10:00:00Z",
    "updatedAt": "2025-11-03T10:00:00Z"
  }
]
```

### 新規作成
```
POST /api/master/nursing-service-codes
```

#### リクエストボディ
```json
{
  "serviceCode": "311000110",
  "serviceName": "訪問看護基本療養費（Ⅰ）週3日まで",
  "points": 5550,
  "validFrom": "2024-04-01",
  "validTo": null,
  "insuranceType": "medical",
  "isActive": true
}
```

#### レスポンス（201 Created）
```json
{
  "id": "uuid",
  "serviceCode": "311000110",
  "serviceName": "訪問看護基本療養費（Ⅰ）週3日まで",
  "points": 5550,
  "validFrom": "2024-04-01",
  "validTo": null,
  "insuranceType": "medical",
  "isActive": true,
  "createdAt": "2025-11-03T10:00:00Z",
  "updatedAt": "2025-11-03T10:00:00Z"
}
```

### 更新
```
PUT /api/master/nursing-service-codes/:id
```

#### リクエストボディ
```json
{
  "serviceName": "訪問看護基本療養費（Ⅰ）週3日まで（更新）",
  "points": 5600,
  "isActive": false
}
```

#### レスポンス（200 OK）
```json
{
  "id": "uuid",
  "serviceCode": "311000110",
  "serviceName": "訪問看護基本療養費（Ⅰ）週3日まで（更新）",
  "points": 5600,
  "validFrom": "2024-04-01",
  "validTo": null,
  "insuranceType": "medical",
  "isActive": false,
  "createdAt": "2025-11-03T10:00:00Z",
  "updatedAt": "2025-11-03T11:00:00Z"
}
```

### 削除
```
DELETE /api/master/nursing-service-codes/:id
```

#### レスポンス（204 No Content）
レスポンスボディなし

---

## 4. その他のマスターデータAPI

以下のマスターデータについても、サービスコードと同様のCRUD APIを実装:

### 職員資格コード
- `GET /api/master/staff-qualification-codes`
- `POST /api/master/staff-qualification-codes`
- `PUT /api/master/staff-qualification-codes/:id`
- `DELETE /api/master/staff-qualification-codes/:id`

### 訪問場所コード
- `GET /api/master/visit-location-codes`
- `POST /api/master/visit-location-codes`
- `PUT /api/master/visit-location-codes/:id`
- `DELETE /api/master/visit-location-codes/:id`

### 都道府県コード
- `GET /api/master/prefecture-codes`（取得のみ、追加・編集・削除は不要）

---

## エラーハンドリング

### 共通エラーレスポンス

#### 400 Bad Request
```json
{
  "error": "バリデーションエラー",
  "details": [
    {
      "field": "serviceCode",
      "message": "サービスコードは9桁である必要があります"
    }
  ]
}
```

#### 401 Unauthorized
```json
{
  "error": "認証が必要です"
}
```

#### 403 Forbidden
```json
{
  "error": "この操作を実行する権限がありません"
}
```

#### 404 Not Found
```json
{
  "error": "リソースが見つかりません"
}
```

#### 500 Internal Server Error
```json
{
  "error": "サーバー内部エラーが発生しました"
}
```

---

## 認証・認可

### セッションベース認証
全てのAPIエンドポイントはセッションベース認証が必要。

### 権限チェック
- CSV出力: 全ロール（admin、nurse、manager）
- マスターデータ管理: adminロールのみ

---

## 変更履歴

| 日付 | 変更内容 | 担当者 |
|------|---------|--------|
| 2025-11-03 | 初版作成 | - |
