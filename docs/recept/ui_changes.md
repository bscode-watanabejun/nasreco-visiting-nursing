# UI変更仕様

CSV出力機能実装に伴う、フロントエンドUIの変更仕様。

## 変更対象画面一覧

1. 施設管理画面
2. 患者登録・編集画面
3. 医療機関登録・編集画面
4. 医師指示書登録・編集画面
5. 訪問記録登録・編集画面
6. 月次レセプト管理画面
7. マスターデータ管理画面（新規）

---

## 1. 施設管理画面

### ファイル
- `client/src/components/FacilitySettings.tsx`（または該当する施設設定画面）

### 追加フィールド

```tsx
// 施設コード（7桁）
<FormField
  control={form.control}
  name="facilityCode"
  render={({ field }) => (
    <FormItem>
      <FormLabel>施設コード（7桁）<span className="text-red-500">*</span></FormLabel>
      <FormControl>
        <Input
          {...field}
          placeholder="1234567"
          maxLength={7}
          pattern="\d{7}"
        />
      </FormControl>
      <FormDescription>
        厚生局から交付された7桁の施設コードを入力してください
      </FormDescription>
      <FormMessage />
    </FormItem>
  )}
/>

// 都道府県コード（セレクト）
<FormField
  control={form.control}
  name="prefectureCode"
  render={({ field }) => (
    <FormItem>
      <FormLabel>都道府県<span className="text-red-500">*</span></FormLabel>
      <Select onValueChange={field.onChange} value={field.value}>
        <FormControl>
          <SelectTrigger>
            <SelectValue placeholder="都道府県を選択" />
          </SelectTrigger>
        </FormControl>
        <SelectContent>
          {prefectures.map((pref) => (
            <SelectItem key={pref.code} value={pref.code}>
              {pref.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FormMessage />
    </FormItem>
  )}
/>
```

### バリデーション

```typescript
const facilitySchema = z.object({
  facilityCode: z.string()
    .length(7, '施設コードは7桁である必要があります')
    .regex(/^\d+$/, '施設コードは数字のみである必要があります'),
  prefectureCode: z.string()
    .length(2, '都道府県コードは2桁である必要があります')
    .regex(/^(0[1-9]|[1-4][0-9])$/, '都道府県コードは01-47の範囲である必要があります'),
  // ...既存フィールド
});
```

---

## 2. 患者登録・編集画面

### ファイル
- `client/src/components/PatientForm.tsx`

### 追加フィールド

```tsx
// カナ氏名
<FormField
  control={form.control}
  name="kanaName"
  render={({ field }) => (
    <FormItem>
      <FormLabel>カナ氏名<span className="text-red-500">*</span></FormLabel>
      <FormControl>
        <Input
          {...field}
          placeholder="ヤマダ タロウ"
          maxLength={25}
        />
      </FormControl>
      <FormDescription>
        全角カタカナで入力してください（姓と名の間は全角スペース）
      </FormDescription>
      <FormMessage />
    </FormItem>
  )}
/>
```

### バリデーション

```typescript
const patientSchema = z.object({
  kanaName: z.string()
    .min(1, 'カナ氏名は必須です')
    .max(25, 'カナ氏名は25文字以内である必要があります')
    .regex(/^[ァ-ヶー\s]+$/, 'カナ氏名は全角カタカナのみである必要があります'),
  // ...既存フィールド
});
```

---

## 3. 医療機関登録・編集画面

### ファイル
- `client/src/components/MedicalInstitutionForm.tsx`

### 追加フィールド

```tsx
// 医療機関コード（7桁）
<FormField
  control={form.control}
  name="institutionCode"
  render={({ field }) => (
    <FormItem>
      <FormLabel>医療機関コード（7桁）<span className="text-red-500">*</span></FormLabel>
      <FormControl>
        <Input
          {...field}
          placeholder="9876543"
          maxLength={7}
          pattern="\d{7}"
        />
      </FormControl>
      <FormDescription>
        7桁の医療機関コードを入力してください
      </FormDescription>
      <FormMessage />
    </FormItem>
  )}
/>

// 都道府県コード（施設と同様）
<FormField
  control={form.control}
  name="prefectureCode"
  render={({ field }) => (
    <FormItem>
      <FormLabel>都道府県<span className="text-red-500">*</span></FormLabel>
      <Select onValueChange={field.onChange} value={field.value}>
        <FormControl>
          <SelectTrigger>
            <SelectValue placeholder="都道府県を選択" />
          </SelectTrigger>
        </FormControl>
        <SelectContent>
          {prefectures.map((pref) => (
            <SelectItem key={pref.code} value={pref.code}>
              {pref.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FormMessage />
    </FormItem>
  )}
/>
```

---

## 4. 医師指示書登録・編集画面

### ファイル
- 医師指示書を入力する画面（パスは要確認）

### 追加フィールド

```tsx
// ICD-10コード
<FormField
  control={form.control}
  name="icd10Code"
  render={({ field }) => (
    <FormItem>
      <FormLabel>ICD-10コード<span className="text-red-500">*</span></FormLabel>
      <FormControl>
        <Input
          {...field}
          placeholder="I10"
          maxLength={7}
        />
      </FormControl>
      <FormDescription>
        国際疾病分類ICD-10のコードを入力してください（例: I10）
      </FormDescription>
      <FormMessage />
    </FormItem>
  )}
/>

// 資格確認方法
<FormField
  control={form.control}
  name="confirmationMethod"
  render={({ field }) => (
    <FormItem>
      <FormLabel>資格確認方法<span className="text-red-500">*</span></FormLabel>
      <Select onValueChange={field.onChange} value={field.value}>
        <FormControl>
          <SelectTrigger>
            <SelectValue placeholder="確認方法を選択" />
          </SelectTrigger>
        </FormControl>
        <SelectContent>
          <SelectItem value="online">オンライン資格確認</SelectItem>
          <SelectItem value="certificate">被保険者証で確認</SelectItem>
          <SelectItem value="notification">資格情報のお知らせで確認</SelectItem>
          <SelectItem value="special_disease">特定疾病療養受療証で確認</SelectItem>
          <SelectItem value="limit">限度額適用認定証で確認</SelectItem>
          <SelectItem value="bill_to_insurer">レセプト記載の保険者等に請求</SelectItem>
        </SelectContent>
      </Select>
      <FormMessage />
    </FormItem>
  )}
/>
```

---

## 5. 訪問記録登録・編集画面

### ファイル
- `client/src/components/NursingRecordForm.tsx`

### 追加フィールド

```tsx
// サービスコード（セレクト）
<FormField
  control={form.control}
  name="serviceCodeId"
  render={({ field }) => (
    <FormItem>
      <FormLabel>サービスコード<span className="text-red-500">*</span></FormLabel>
      <Select onValueChange={field.onChange} value={field.value}>
        <FormControl>
          <SelectTrigger>
            <SelectValue placeholder="サービスを選択" />
          </SelectTrigger>
        </FormControl>
        <SelectContent>
          {serviceCodes.map((code) => (
            <SelectItem key={code.id} value={code.id}>
              {code.serviceCode} - {code.serviceName} ({code.points}点)
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FormMessage />
    </FormItem>
  )}
/>

// 訪問場所コード
<FormField
  control={form.control}
  name="visitLocationCode"
  render={({ field }) => (
    <FormItem>
      <FormLabel>訪問場所<span className="text-red-500">*</span></FormLabel>
      <Select onValueChange={field.onChange} value={field.value}>
        <FormControl>
          <SelectTrigger>
            <SelectValue placeholder="訪問場所を選択" />
          </SelectTrigger>
        </FormControl>
        <SelectContent>
          {visitLocations.map((location) => (
            <SelectItem key={location.locationCode} value={location.locationCode}>
              {location.locationName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FormMessage />
    </FormItem>
  )}
/>

// 職員資格コード
<FormField
  control={form.control}
  name="staffQualificationCode"
  render={({ field }) => (
    <FormItem>
      <FormLabel>職員資格<span className="text-red-500">*</span></FormLabel>
      <Select onValueChange={field.onChange} value={field.value}>
        <FormControl>
          <SelectTrigger>
            <SelectValue placeholder="職員資格を選択" />
          </SelectTrigger>
        </FormControl>
        <SelectContent>
          {staffQualifications.map((qualification) => (
            <SelectItem key={qualification.qualificationCode} value={qualification.qualificationCode}>
              {qualification.qualificationName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FormMessage />
    </FormItem>
  )}
/>
```

---

## 6. 月次レセプト管理画面

### ファイル
- `client/src/components/MonthlyReceiptsManagement.tsx`

### 変更点

#### CSV出力可否の表示

```tsx
// レセプト一覧のステータスカラムに追加
<TableCell>
  <div className="flex items-center gap-2">
    {/* 既存のステータスバッジ */}
    <Badge variant={statusVariant}>{receipt.status}</Badge>

    {/* CSV出力可否アイコン */}
    {receipt.csvExportReady ? (
      <Tooltip>
        <TooltipTrigger>
          <CheckCircle className="h-5 w-5 text-green-500" />
        </TooltipTrigger>
        <TooltipContent>CSV出力可能</TooltipContent>
      </Tooltip>
    ) : (
      <Tooltip>
        <TooltipTrigger>
          <AlertCircle className="h-5 w-5 text-red-500" />
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1">
            <p className="font-semibold">CSV出力不可</p>
            {receipt.csvExportWarnings?.slice(0, 3).map((warning, idx) => (
              <p key={idx} className="text-sm">• {warning.message}</p>
            ))}
            {receipt.csvExportWarnings?.length > 3 && (
              <p className="text-sm">他 {receipt.csvExportWarnings.length - 3} 件</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    )}
  </div>
</TableCell>
```

#### CSV出力ボタンの制御

```tsx
// 医療保険CSV出力ボタン
<Button
  onClick={() => handleMedicalCsvExport()}
  disabled={!hasReadyReceipts || isExporting}
  variant="outline"
  size="sm"
>
  <FileDown className="mr-2 h-4 w-4" />
  医療保険CSV出力
  {!hasReadyReceipts && (
    <Tooltip>
      <TooltipTrigger>
        <Info className="ml-2 h-4 w-4 text-muted-foreground" />
      </TooltipTrigger>
      <TooltipContent>
        CSV出力可能なレセプトがありません
      </TooltipContent>
    </Tooltip>
  )}
</Button>
```

#### CSV出力前の確認ダイアログ

```tsx
// CSV出力処理
const handleMedicalCsvExport = async () => {
  // 出力不可のレセプトがあるか確認
  const notReadyReceipts = receipts.filter(r => !r.csvExportReady);

  if (notReadyReceipts.length > 0) {
    toast({
      title: 'CSV出力できません',
      description: `${notReadyReceipts.length}件のレセプトでデータが不足しています`,
      variant: 'destructive',
    });
    return;
  }

  setIsExporting(true);
  try {
    const params = new URLSearchParams({
      facilityId: currentFacility.id,
      year: filters.year.toString(),
      month: filters.month.toString(),
    });

    const response = await fetch(`/api/monthly-receipts/export/medical-insurance?${params}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message);
    }

    // ファイルダウンロード
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipt_medical_${filters.year}${filters.month.toString().padStart(2, '0')}.csv`;
    a.click();

    toast({
      title: 'CSV出力完了',
      description: 'ファイルのダウンロードを開始しました',
    });
  } catch (error) {
    toast({
      title: 'CSV出力エラー',
      description: error.message,
      variant: 'destructive',
    });
  } finally {
    setIsExporting(false);
  }
};
```

---

## 7. マスターデータ管理画面（新規）

### ファイル
- `client/src/pages/MasterDataManagement.tsx`（新規作成）
- `client/src/components/NursingServiceCodeManagement.tsx`（新規作成）

### 画面構成

```tsx
// タブで各マスターデータを切り替え
<Tabs defaultValue="service_codes">
  <TabsList>
    <TabsTrigger value="service_codes">サービスコード</TabsTrigger>
    <TabsTrigger value="staff_qualifications">職員資格</TabsTrigger>
    <TabsTrigger value="visit_locations">訪問場所</TabsTrigger>
    <TabsTrigger value="prefectures">都道府県</TabsTrigger>
  </TabsList>

  <TabsContent value="service_codes">
    <NursingServiceCodeManagement />
  </TabsContent>

  <TabsContent value="staff_qualifications">
    <StaffQualificationManagement />
  </TabsContent>

  <TabsContent value="visit_locations">
    <VisitLocationManagement />
  </TabsContent>

  <TabsContent value="prefectures">
    <PrefectureManagement />
  </TabsContent>
</Tabs>
```

### サービスコード管理画面の例

```tsx
function NursingServiceCodeManagement() {
  const [serviceCodes, setServiceCodes] = useState<NursingServiceCode[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">訪問看護サービスコード管理</h2>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          新規追加
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>サービスコード</TableHead>
            <TableHead>サービス名称</TableHead>
            <TableHead>点数</TableHead>
            <TableHead>有効期間</TableHead>
            <TableHead>状態</TableHead>
            <TableHead>操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {serviceCodes.map((code) => (
            <TableRow key={code.id}>
              <TableCell className="font-mono">{code.serviceCode}</TableCell>
              <TableCell>{code.serviceName}</TableCell>
              <TableCell>{code.points}点</TableCell>
              <TableCell>
                {formatDate(code.validFrom)} 〜 {code.validTo ? formatDate(code.validTo) : '無期限'}
              </TableCell>
              <TableCell>
                <Badge variant={code.isActive ? 'success' : 'secondary'}>
                  {code.isActive ? '有効' : '無効'}
                </Badge>
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="sm" onClick={() => handleEdit(code)}>
                  編集
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* 新規追加/編集ダイアログ */}
      <ServiceCodeDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSave={handleSave}
      />
    </div>
  );
}
```

---

## 共通コンポーネント

### 都道府県セレクトコンポーネント

```tsx
// client/src/components/PrefectureSelect.tsx
export function PrefectureSelect({ value, onChange }: PrefectureSelectProps) {
  const { data: prefectures } = useQuery({
    queryKey: ['/api/master/prefecture-codes'],
  });

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="都道府県を選択" />
      </SelectTrigger>
      <SelectContent>
        {prefectures?.map((pref) => (
          <SelectItem key={pref.prefectureCode} value={pref.prefectureCode}>
            {pref.prefectureName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

---

## ルーティング追加

```typescript
// client/src/App.tsx または該当するルーティングファイル

<Route path="/master-data" component={MasterDataManagement} />
```

---

## 変更履歴

| 日付 | 変更内容 | 担当者 |
|------|---------|--------|
| 2025-11-03 | 初版作成 | - |
