# テストチェックリスト

CSV出力機能のテスト計画とチェックリスト。

## テストの種類

1. 単体テスト（Unit Tests）
2. 統合テスト（Integration Tests）
3. エンドツーエンドテスト（E2E Tests）
4. 仕様適合テスト（Compliance Tests）
5. 手動テスト（Manual Tests）

---

## 1. 単体テスト

### 1.1 フィールドフォーマット関数

#### ファイル
`server/services/__tests__/csvFormatter.test.ts`

#### テスト項目

```typescript
describe('formatFixed', () => {
  test('7桁の数字を正しくゼロ埋めする', () => {
    expect(formatFixed('123', 7)).toBe('0000123');
  });

  test('既に7桁の場合はそのまま返す', () => {
    expect(formatFixed('1234567', 7)).toBe('1234567');
  });

  test('桁数オーバーの場合はエラー', () => {
    expect(() => formatFixed('12345678', 7)).toThrow();
  });
});

describe('formatVariable', () => {
  test('最大バイト数以内の場合はそのまま返す', () => {
    expect(formatVariable('テスト', 20)).toBe('テスト');
  });

  test('最大バイト数を超える場合は切り詰める', () => {
    const longText = 'あ'.repeat(30); // 60バイト
    const result = formatVariable(longText, 40);
    const buffer = iconv.encode(result, 'Shift_JIS');
    expect(buffer.length).toBeLessThanOrEqual(40);
  });
});

describe('formatDate', () => {
  test('日付をYYYYMMDD形式に変換する', () => {
    expect(formatDate(new Date('2025-11-03'))).toBe('20251103');
  });

  test('undefinedの場合は空文字列を返す', () => {
    expect(formatDate(undefined)).toBe('');
  });
});
```

### 1.2 レコードジェネレーター

#### ファイル
`server/services/__tests__/recordGenerators.test.ts`

#### テスト項目

```typescript
describe('generateHMRecord', () => {
  test('HMレコードのフィールド数が正しい', () => {
    const facility = createMockFacility();
    const record = generateHMRecord(facility, 2025, 11);
    expect(record.length).toBe(8); // HMレコードは8フィールド
  });

  test('施設コードが7桁でフォーマットされる', () => {
    const facility = createMockFacility({ facilityCode: '123' });
    const record = generateHMRecord(facility, 2025, 11);
    expect(record[4]).toBe('0000123');
  });
});

describe('generateRERecord', () => {
  test('REレコードのフィールド数が正しい', () => {
    const receipt = createMockReceipt();
    const patient = createMockPatient();
    const insurance = createMockInsurance();
    const record = generateRERecord(receipt, patient, insurance);
    expect(record.length).toBe(12); // REレコードは12フィールド
  });

  test('男女区分が正しく変換される', () => {
    const patient = createMockPatient({ gender: 'male' });
    const record = generateRERecord(mockReceipt, patient, mockInsurance);
    expect(record[6]).toBe('1'); // 1:男
  });
});

// 他の16種類のレコードについても同様のテスト
```

### 1.3 データバリデーション

#### ファイル
`server/services/__tests__/receiptValidator.test.ts`

#### テスト項目

```typescript
describe('validateFacility', () => {
  test('施設コードが未入力の場合はエラー', () => {
    const facility = createMockFacility({ facilityCode: '' });
    const result = validateFacility(facility);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('施設コードが未入力です');
  });

  test('施設コードが7桁でない場合はエラー', () => {
    const facility = createMockFacility({ facilityCode: '12345' });
    const result = validateFacility(facility);
    expect(result.isValid).toBe(false);
  });
});

describe('validatePatient', () => {
  test('カナ氏名が全角カタカナでない場合はエラー', () => {
    const patient = createMockPatient({ kanaName: 'やまだ たろう' });
    const result = validatePatient(patient);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('カナ氏名は全角カタカナのみである必要があります');
  });
});
```

---

## 2. 統合テスト

### 2.1 CSV生成全体フロー

#### ファイル
`server/services/__tests__/receiptCsvExportService.test.ts`

#### テスト項目

```typescript
describe('ReceiptCsvExportService', () => {
  test('完全なCSVファイルが生成される', async () => {
    const service = new ReceiptCsvExportService();
    const csvBuffer = await service.generateCsv(facilityId, 2025, 11);

    expect(csvBuffer).toBeInstanceOf(Buffer);
    expect(csvBuffer.length).toBeGreaterThan(0);
  });

  test('Shift_JISでエンコードされている', async () => {
    const service = new ReceiptCsvExportService();
    const csvBuffer = await service.generateCsv(facilityId, 2025, 11);

    // UTF-8に再変換して確認
    const csvText = iconv.decode(csvBuffer, 'Shift_JIS');
    expect(csvText).toContain('HM');
    expect(csvText).toContain('GO');
    expect(csvText).toContain('RE');
  });

  test('CR+LFの改行コードが使用されている', async () => {
    const service = new ReceiptCsvExportService();
    const csvBuffer = await service.generateCsv(facilityId, 2025, 11);
    const csvText = iconv.decode(csvBuffer, 'Shift_JIS');

    expect(csvText).toContain('\r\n');
    expect(csvText).not.toMatch(/[^\r]\n/); // LFのみの行がないことを確認
  });

  test('EOF終端コードが追加されている', async () => {
    const service = new ReceiptCsvExportService();
    const csvBuffer = await service.generateCsv(facilityId, 2025, 11);

    // 最終バイトが0x1Aであることを確認
    expect(csvBuffer[csvBuffer.length - 1]).toBe(0x1A);
  });
});
```

### 2.2 レコード順序の検証

```typescript
describe('CSV Record Order', () => {
  test('レコードが正しい順序で出力される', async () => {
    const service = new ReceiptCsvExportService();
    const csvBuffer = await service.generateCsv(facilityId, 2025, 11);
    const csvText = iconv.decode(csvBuffer, 'Shift_JIS');
    const lines = csvText.split('\r\n');

    expect(lines[0]).toMatch(/^HM,/); // 1行目はHM
    expect(lines[1]).toMatch(/^GO$/); // 2行目はGO
    expect(lines[2]).toMatch(/^RE,/); // 3行目はRE

    // HO, KO, SN, JD, IH, HJ, SY, RJ, KAの順序を確認
    const recordTypes = lines.map(line => line.substring(0, 2));
    const expectedOrder = ['HM', 'GO', 'RE', 'HO', 'SN', 'JD', 'IH', 'HJ', 'SY', 'RJ', 'KA'];

    let prevIndex = -1;
    expectedOrder.forEach(type => {
      const index = recordTypes.indexOf(type);
      expect(index).toBeGreaterThan(prevIndex);
      prevIndex = index;
    });
  });
});
```

---

## 3. エンドツーエンドテスト

### 3.1 CSV出力APIテスト

#### ファイル
`server/__tests__/csvExport.e2e.test.ts`

#### テスト項目

```typescript
describe('CSV Export API', () => {
  test('GET /api/monthly-receipts/export/medical-insurance が正常に動作する', async () => {
    const response = await request(app)
      .get('/api/monthly-receipts/export/medical-insurance')
      .query({ facilityId, year: 2025, month: 11 });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain('attachment');
  });

  test('データ不足の場合は400エラーを返す', async () => {
    // カナ氏名が未入力の患者データを作成
    const receipt = await createIncompleteReceipt();

    const response = await request(app)
      .get('/api/monthly-receipts/export/medical-insurance')
      .query({ facilityId, year: 2025, month: 11 });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('データが不足');
    expect(response.body.warnings).toBeInstanceOf(Array);
  });
});
```

### 3.2 CSV出力可否チェックAPIテスト

```typescript
describe('CSV Export Check API', () => {
  test('POST /api/monthly-receipts/:id/check-csv-export が正常に動作する', async () => {
    const response = await request(app)
      .post(`/api/monthly-receipts/${receiptId}/check-csv-export`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('isReady');
    expect(response.body).toHaveProperty('errors');
    expect(response.body).toHaveProperty('warnings');
    expect(response.body).toHaveProperty('checkedAt');
  });

  test('チェック結果がデータベースに保存される', async () => {
    await request(app)
      .post(`/api/monthly-receipts/${receiptId}/check-csv-export`);

    const receipt = await db.query.monthlyReceipts.findFirst({
      where: eq(monthlyReceipts.id, receiptId),
    });

    expect(receipt.lastCsvExportCheck).not.toBeNull();
  });
});
```

---

## 4. 仕様適合テスト

### 4.1 サンプルデータとの照合

#### 目的
仕様書に記載されているサンプルCSVと、生成したCSVを照合する。

#### テスト項目

```typescript
describe('Compliance with Specification', () => {
  test('サンプルデータと同じフォーマットで出力される', async () => {
    // 仕様書のサンプルと同じデータを用意
    const sampleData = createSampleDataFromSpec();

    const service = new ReceiptCsvExportService();
    const csvBuffer = await service.generateCsv(facilityId, 2025, 6);
    const csvText = iconv.decode(csvBuffer, 'Shift_JIS');

    // 仕様書のサンプルCSV（抜粋）
    const expectedLines = [
      'HM,7,13,1,1234567,○○訪問看護ステーション,202506,03-1234-5678',
      'GO',
      'RE,0000001,6112,202506,ヤマダ タロウ,山田 太郎,1,19500415,,,12000,',
      // ...
    ];

    const actualLines = csvText.split('\r\n').slice(0, expectedLines.length);

    expectedLines.forEach((expected, index) => {
      expect(actualLines[index]).toBe(expected);
    });
  });
});
```

### 4.2 バイト数チェック

```typescript
describe('Field Byte Length', () => {
  test('固定長フィールドが正しいバイト数である', () => {
    const facility = createMockFacility();
    const record = generateHMRecord(facility, 2025, 11);

    // 施設コードは7バイト固定
    const facilityCodeBuffer = iconv.encode(record[4], 'Shift_JIS');
    expect(facilityCodeBuffer.length).toBe(7);

    // 都道府県コードは2バイト固定
    const prefectureCodeBuffer = iconv.encode(record[2], 'Shift_JIS');
    expect(prefectureCodeBuffer.length).toBe(2);
  });

  test('可変長フィールドが最大バイト数を超えない', () => {
    const facility = createMockFacility({ name: 'あ'.repeat(30) }); // 最大20文字=40バイト
    const record = generateHMRecord(facility, 2025, 11);

    const nameBuffer = iconv.encode(record[5], 'Shift_JIS');
    expect(nameBuffer.length).toBeLessThanOrEqual(40);
  });
});
```

---

## 5. 手動テスト

### 5.1 実データでのテスト

#### チェックリスト

- [ ] 実際の施設データでCSV出力が成功する
- [ ] 実際の患者データでCSV出力が成功する
- [ ] 実際の訪問記録データでCSV出力が成功する
- [ ] 生成されたCSVファイルをExcelで開いて文字化けしない
- [ ] 生成されたCSVファイルをテキストエディタで開いて改行コードがCR+LFである
- [ ] 生成されたCSVファイルのサイズが妥当である（レセプト1件あたり数KB程度）

### 5.2 データパターンのテスト

#### 正常系

- [ ] 保険証のみのレセプト
- [ ] 保険証+公費のレセプト
- [ ] 後期高齢者医療のレセプト
- [ ] 同日複数回訪問のレセプト
- [ ] 複数月にまたがる指示書のレセプト
- [ ] 精神科訪問看護のレセプト
- [ ] 理学療法士等による訪問のレセプト
- [ ] 加算が複数あるレセプト

#### 異常系

- [ ] カナ氏名が未入力の患者（エラー表示）
- [ ] 施設コードが未入力の施設（エラー表示）
- [ ] 医療機関コードが未入力の医療機関（エラー表示）
- [ ] ICD-10コードが未入力の診断（エラー表示）
- [ ] サービスコードが未選択の訪問記録（エラー表示）
- [ ] 訪問記録が0件のレセプト（エラー表示）

### 5.3 UIテスト

#### 月次レセプト管理画面

- [ ] CSV出力可否アイコンが正しく表示される
- [ ] CSV出力不可のレセプトにマウスオーバーすると警告が表示される
- [ ] CSV出力ボタンをクリックするとファイルがダウンロードされる
- [ ] データ不足の場合はエラーメッセージが表示される
- [ ] ローディング中はボタンがdisableされる

#### マスターデータ管理画面

- [ ] サービスコード一覧が正しく表示される
- [ ] サービスコードを新規追加できる
- [ ] サービスコードを編集できる
- [ ] サービスコードを無効化できる
- [ ] 職員資格コード一覧が正しく表示される
- [ ] 訪問場所コード一覧が正しく表示される

---

## 6. パフォーマンステスト

### 6.1 大量データでのテスト

#### テスト項目

- [ ] レセプト100件のCSV出力が30秒以内に完了する
- [ ] レセプト1000件のCSV出力が5分以内に完了する
- [ ] メモリ使用量が1GB以下である
- [ ] データベースクエリが最適化されている（N+1問題がない）

---

## 7. ブラウザ互換性テスト

### 対象ブラウザ

- [ ] Chrome（最新版）
- [ ] Firefox（最新版）
- [ ] Safari（最新版）
- [ ] Edge（最新版）

### テスト項目

- [ ] CSV出力ボタンが正常に動作する
- [ ] ファイルダウンロードが正常に動作する
- [ ] UIが正しく表示される

---

## 8. セキュリティテスト

### テスト項目

- [ ] 認証なしでCSV出力APIにアクセスできない
- [ ] 他の施設のレセプトをCSV出力できない
- [ ] SQLインジェクションの脆弱性がない
- [ ] XSSの脆弱性がない
- [ ] CSRFの脆弱性がない

---

## 9. テスト実行手順

### 単体テスト・統合テスト
```bash
npm run test
```

### エンドツーエンドテスト
```bash
npm run test:e2e
```

### カバレッジレポート
```bash
npm run test:coverage
```

### 目標カバレッジ
- ステートメントカバレッジ: 80%以上
- ブランチカバレッジ: 75%以上
- 関数カバレッジ: 80%以上

---

## 10. テスト結果の記録

### テストレポート

| テスト種別 | 実施日 | 結果 | 備考 |
|-----------|--------|------|------|
| 単体テスト | YYYY-MM-DD | ✅ / ❌ | |
| 統合テスト | YYYY-MM-DD | ✅ / ❌ | |
| E2Eテスト | YYYY-MM-DD | ✅ / ❌ | |
| 仕様適合テスト | YYYY-MM-DD | ✅ / ❌ | |
| 手動テスト | YYYY-MM-DD | ✅ / ❌ | |
| パフォーマンステスト | YYYY-MM-DD | ✅ / ❌ | |
| セキュリティテスト | YYYY-MM-DD | ✅ / ❌ | |

---

## 変更履歴

| 日付 | 変更内容 | 担当者 |
|------|---------|--------|
| 2025-11-03 | 初版作成 | - |
