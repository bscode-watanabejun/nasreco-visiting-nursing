# 訪問看護記録書Ⅰ Excel出力実装ドキュメント

## 実装状況（2025-10-29時点）

### 完了事項
1. ✅ サーバーサイドPDF生成実装（PDFKit）- パフォーマンス改善（20秒→1.4秒）
2. ✅ ExcelJS導入とテンプレート作成スクリプト実装
3. ✅ Excelテンプレート生成（`server/templates/訪問看護記録書Ⅰ_テンプレート.xlsx`）

### 未完了事項（次回実装）
1. ⏳ Excelテンプレートのフォーマット修正（お客様側で実施予定）
2. ⏳ 修正済みテンプレートへのデータ入力ロジック実装
3. ⏳ Excel出力APIエンドポイント作成
4. ⏳ フロントエンドからExcel出力呼び出し機能

---

## ファイル構成

### 作成済みファイル
```
server/
├── templates/
│   ├── create-nursing-record-template.ts   # テンプレート生成スクリプト
│   └── 訪問看護記録書Ⅰ_テンプレート.xlsx      # 生成されたテンプレート（お客様が修正予定）
├── pdf-generators/
│   └── nursing-record-i.ts                 # PDFKit版（使用中断）
└── routes.ts                               # APIエンドポイント

client/src/components/
└── PatientDetail.tsx                       # PDF出力ボタン実装済み
```

### 次回作成予定ファイル
```
server/
└── excel-generators/
    └── nursing-record-i.ts                 # Excelデータ入力ロジック（新規作成予定）
```

---

## データ出力可能性一覧

### ✅ 現在出力可能な項目

#### No.1シート（利用者基本情報・病歴）

| 項目 | データソース | 備考 |
|------|-------------|------|
| 利用者氏名 | `patients.lastName` + `patients.firstName` | フルネーム結合 |
| 生年月日 | `patients.birthDate` | 和暦変換可能 |
| 年齢 | `patients.birthDate`から計算 | 自動計算 |
| 要介護認定の状況 | `insurance_cards.careLevel` | 例: "要介護3" |
| 住所 | `patients.address` | - |
| 初回訪問年月日 | `nursing_records.visitDate`（最初の記録） | `is_first_visit_of_plan = true`のレコード |
| 初回訪問時間 | `nursing_records.actualStartTime`, `actualEndTime` | 時刻データ |
| 看護師等氏名 | `users.lastName` + `users.firstName` | 訪問記録の担当看護師 |
| 訪問職種 | `users.role` | "看護師"等（roleから判定） |
| 主たる傷病名 | `patients.primaryDiagnosis` | - |
| 現病歴 | `patients.medicalHistory` | テキストフィールド |
| 既往歴 | （データなし） | ❌ 未実装 |
| 療養状況 | `nursing_records.nursingContent`（初回記録） | 初回訪問記録の内容 |
| 介護状況 | `patients.caregiverRelationship`, `caregiverContact` | 介護者情報 |

#### No.2シート（訪問看護詳細情報）

| 項目 | データソース | 備考 |
|------|-------------|------|
| 訪問看護の依頼目的 | `doctor_orders.orderDetails` | 医師指示書の指示内容 |
| 要介護認定 | `insurance_cards.careLevel`, `certificationDate` | 認定日も出力可能 |
| ADL | （データなし） | ❌ 未実装 |
| 日常生活自立度 | （データなし） | ❌ 未実装 |
| 主治医等 | `doctor_orders.doctorName`, `medicalInstitution` | 医師指示書から取得 |
| 緊急連絡先 | `patients.emergencyContact`, `emergencyPhone` | - |
| 居宅介護支援事業所 | `patients.careManagerName`, `careManagerContact` | ケアマネージャー情報 |
| 福祉サービス | （データなし） | ❌ 未実装 |
| 事業所名 | `facilities.name` | ログイン中の施設情報 |
| 出力日 | システム日付 | 自動生成 |

### ❌ データ未保持で出力不可な項目

1. **既往歴** - `patients`テーブルに該当フィールドなし
2. **ADL（日常生活動作）** - ADL評価データなし
3. **日常生活自立度** - 自立度判定データなし
4. **福祉サービス** - 利用サービス情報なし

---

## 次回実装手順

### Step 1: Excelテンプレート修正（お客様作業）
お客様が `server/templates/訪問看護記録書Ⅰ_テンプレート.xlsx` を厚生労働省様式に完全一致するよう修正。

**修正時の注意点:**
- セル位置を変更した場合、データ入力ロジックで参照するセル番地も変更が必要
- シート名（"No.1", "No.2"）は変更しない
- データ入力用のセルを明確にする（例: セルに `{patient_name}` などのプレースホルダーを入れる）

### Step 2: データ入力ロジック実装

`server/excel-generators/nursing-record-i.ts` を新規作成:

```typescript
import ExcelJS from 'exceljs';
import path from 'path';
import { Response } from 'express';

interface NursingRecordIExcelData {
  patient: {
    lastName: string;
    firstName: string;
    birthDate: Date;
    address: string;
    emergencyContact: string;
    emergencyPhone: string;
    caregiverRelationship: string;
    caregiverContact: string;
    primaryDiagnosis: string;
    medicalHistory: string;
  };
  insuranceCard: {
    careLevel: string;
    certificationDate: Date;
  };
  initialRecord: {
    visitDate: Date;
    actualStartTime: Date;
    actualEndTime: Date;
    nurse: {
      lastName: string;
      firstName: string;
      role: string;
    };
    nursingContent: string;
  };
  doctorOrder: {
    doctorName: string;
    medicalInstitution: string;
    orderDetails: string;
  };
  facility: {
    name: string;
  };
}

export async function generateNursingRecordIExcel(
  data: NursingRecordIExcelData,
  res: Response
): Promise<void> {
  const templatePath = path.join(
    process.cwd(),
    'server',
    'templates',
    '訪問看護記録書Ⅰ_テンプレート.xlsx'
  );

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);

  const sheet1 = workbook.getWorksheet('No.1');
  const sheet2 = workbook.getWorksheet('No.2');

  if (!sheet1 || !sheet2) {
    throw new Error('テンプレートのシートが見つかりません');
  }

  // No.1 データ入力
  // セル位置はテンプレート修正後に調整
  sheet1.getCell('C4').value = `${data.patient.lastName} ${data.patient.firstName}`; // 利用者氏名

  // 生年月日（和暦変換）
  const birthYear = data.patient.birthDate.getFullYear();
  const birthMonth = data.patient.birthDate.getMonth() + 1;
  const birthDay = data.patient.birthDate.getDate();
  const age = new Date().getFullYear() - birthYear;

  sheet1.getCell('J5').value = birthYear; // 年
  sheet1.getCell('K5').value = birthMonth; // 月
  sheet1.getCell('L5').value = `${birthDay}日（${age}）歳`; // 日・年齢

  sheet1.getCell('D7').value = data.insuranceCard.careLevel; // 要介護認定
  sheet1.getCell('D8').value = data.patient.address; // 住所

  // 初回訪問年月日
  const visitYear = data.initialRecord.visitDate.getFullYear();
  const visitMonth = data.initialRecord.visitDate.getMonth() + 1;
  const visitDay = data.initialRecord.visitDate.getDate();
  sheet1.getCell('D11').value = visitYear;
  sheet1.getCell('E11').value = visitMonth;
  sheet1.getCell('F11').value = visitDay;

  // 初回訪問時間
  const startHour = data.initialRecord.actualStartTime.getHours();
  const startMin = data.initialRecord.actualStartTime.getMinutes();
  const endHour = data.initialRecord.actualEndTime.getHours();
  const endMin = data.initialRecord.actualEndTime.getMinutes();
  sheet1.getCell('G11').value = startHour;
  sheet1.getCell('H11').value = startMin;
  sheet1.getCell('I11').value = endHour;
  sheet1.getCell('J11').value = endMin;

  // 看護師氏名・訪問職種
  sheet1.getCell('D12').value = `${data.initialRecord.nurse.lastName} ${data.initialRecord.nurse.firstName}`;

  sheet1.getCell('B15').value = data.patient.primaryDiagnosis; // 主たる傷病名
  sheet1.getCell('B20').value = data.patient.medicalHistory; // 現病歴
  sheet1.getCell('B32').value = data.initialRecord.nursingContent; // 療養状況
  sheet1.getCell('B38').value = `介護者: ${data.patient.caregiverRelationship}\n連絡先: ${data.patient.caregiverContact}`; // 介護状況

  // No.2 データ入力
  sheet2.getCell('B5').value = data.doctorOrder.orderDetails; // 訪問看護の依頼目的
  sheet2.getCell('B11').value = `${data.insuranceCard.careLevel}（認定日: ${data.insuranceCard.certificationDate.toLocaleDateString('ja-JP')}）`; // 要介護認定
  sheet2.getCell('B25').value = `主治医: ${data.doctorOrder.doctorName}\n医療機関: ${data.doctorOrder.medicalInstitution}`; // 主治医等
  sheet2.getCell('B31').value = `${data.patient.emergencyContact}\n${data.patient.emergencyPhone}`; // 緊急連絡先
  sheet2.getCell('B35').value = `ケアマネージャー: ${data.patient.caregiverRelationship}`; // 居宅介護支援事業所

  // フッター
  sheet2.getCell('B46').value = `事業所: ${data.facility.name}`;
  sheet2.getCell('B47').value = `出力日: ${new Date().toLocaleDateString('ja-JP')}`;

  // レスポンス出力
  const filename = `訪問看護記録書Ⅰ_${data.patient.lastName}${data.patient.firstName}_${new Date().toISOString().split('T')[0]}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);

  await workbook.xlsx.write(res);
}
```

### Step 3: APIエンドポイント追加

`server/routes.ts` に追加:

```typescript
// 訪問看護記録書Ⅰ Excel出力
app.get("/api/patients/:id/nursing-record-i-excel", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const patientId = parseInt(req.params.id);

    // 患者情報取得
    const patient = await db.query.patients.findFirst({
      where: eq(patients.id, patientId)
    });

    if (!patient) {
      return res.status(404).json({ error: "患者が見つかりません" });
    }

    // 保険証情報取得
    const insuranceCard = await db.query.insuranceCards.findFirst({
      where: eq(insuranceCards.patientId, patientId),
      orderBy: desc(insuranceCards.issueDate)
    });

    // 初回訪問記録取得
    const initialRecord = await db.query.nursingRecords.findFirst({
      where: and(
        eq(nursingRecords.patientId, patientId),
        eq(nursingRecords.isFirstVisitOfPlan, true)
      ),
      with: {
        nurse: true
      },
      orderBy: asc(nursingRecords.visitDate)
    });

    // 医師指示書取得
    const doctorOrder = await db.query.doctorOrders.findFirst({
      where: eq(doctorOrders.patientId, patientId),
      orderBy: desc(doctorOrders.orderDate)
    });

    // 施設情報取得
    const facility = await db.query.facilities.findFirst({
      where: eq(facilities.id, req.user!.facilityId)
    });

    if (!initialRecord || !insuranceCard || !doctorOrder || !facility) {
      return res.status(400).json({
        error: "必要なデータが不足しています",
        details: {
          initialRecord: !!initialRecord,
          insuranceCard: !!insuranceCard,
          doctorOrder: !!doctorOrder,
          facility: !!facility
        }
      });
    }

    const { generateNursingRecordIExcel } = await import("./excel-generators/nursing-record-i");

    const excelData = {
      patient: {
        lastName: patient.lastName,
        firstName: patient.firstName,
        birthDate: patient.birthDate,
        address: patient.address || '',
        emergencyContact: patient.emergencyContact || '',
        emergencyPhone: patient.emergencyPhone || '',
        caregiverRelationship: patient.caregiverRelationship || '',
        caregiverContact: patient.caregiverContact || '',
        primaryDiagnosis: patient.primaryDiagnosis || '',
        medicalHistory: patient.medicalHistory || ''
      },
      insuranceCard: {
        careLevel: insuranceCard.careLevel,
        certificationDate: insuranceCard.certificationDate
      },
      initialRecord: {
        visitDate: initialRecord.visitDate,
        actualStartTime: initialRecord.actualStartTime!,
        actualEndTime: initialRecord.actualEndTime!,
        nurse: {
          lastName: initialRecord.nurse.lastName,
          firstName: initialRecord.nurse.firstName,
          role: initialRecord.nurse.role
        },
        nursingContent: initialRecord.nursingContent || ''
      },
      doctorOrder: {
        doctorName: doctorOrder.doctorName,
        medicalInstitution: doctorOrder.medicalInstitution,
        orderDetails: doctorOrder.orderDetails || ''
      },
      facility: {
        name: facility.name
      }
    };

    await generateNursingRecordIExcel(excelData, res);

  } catch (error) {
    console.error("記録書Ⅰ Excel生成エラー:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Excel生成中にエラーが発生しました" });
    }
  }
});
```

### Step 4: フロントエンド修正

`client/src/components/PatientDetail.tsx` の `handleExportRecordI` 関数を修正:

```typescript
const handleExportRecordI = async () => {
  try {
    setIsExportingRecordI(true)
    const startTime = performance.now()

    // Excel出力エンドポイント呼び出し
    const response = await fetch(`/api/patients/${id}/nursing-record-i-excel`)

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || "Excel生成に失敗しました")
    }

    const blob = await response.blob()
    const totalTime = performance.now() - startTime
    console.log('[Excel Export] Server-side generation time:', Math.round(totalTime), 'ms')

    // ダウンロード
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `訪問看護記録書Ⅰ_${patient.lastName}${patient.firstName}_${new Date().toISOString().split('T')[0]}.xlsx`
    a.click()
    URL.revokeObjectURL(url)

    toast({
      title: "成功",
      description: "訪問看護記録書ⅠをExcelでダウンロードしました"
    })
  } catch (error) {
    console.error('Excel export error:', error)
    toast({
      title: "エラー",
      description: error instanceof Error ? error.message : "Excelのエクスポートに失敗しました",
      variant: "destructive"
    })
  } finally {
    setIsExportingRecordI(false)
  }
}
```

---

## 技術メモ

### ExcelJSの使い方
```bash
npm install exceljs
```

**主要API:**
- `workbook.xlsx.readFile(path)` - テンプレート読み込み
- `workbook.xlsx.write(stream)` - ストリーム出力
- `worksheet.getCell('A1')` - セル取得
- `cell.value = 'text'` - 値設定
- `worksheet.mergeCells('A1:B2')` - セル結合

### 和暦変換
必要に応じて和暦変換ライブラリを導入:
```bash
npm install wareki
```

```typescript
import { Wareki } from 'wareki';
const wareki = new Wareki(new Date('2024-01-01'));
console.log(wareki.format('ggg ee年MM月dd日')); // "令和 6年01月01日"
```

---

## お客様への確認事項

1. **データ未保持項目の対応:**
   - 既往歴
   - ADL（日常生活動作）
   - 日常生活自立度
   - 福祉サービス

   → これらの項目を入力・保存する機能を追加実装する必要があるか？

2. **テンプレート修正:**
   - お客様側でテンプレートを修正する際、データ入力が必要なセルの位置をリストアップしていただく（例: C4セルに患者氏名、など）

3. **出力タイミング:**
   - 現在は「患者詳細画面」からの出力を想定
   - 他の画面からも出力する必要があるか？

4. **PDF vs Excel:**
   - 今後はExcel出力のみか、PDF出力も残すか？

---

## 参考資料

- 厚生労働省参考様式: `/home/runner/workspace/design_attachments/訪問看護計画書等の記載要領等について.pdf`
- 現在のテンプレート: `/home/runner/workspace/server/templates/訪問看護記録書Ⅰ_テンプレート.xlsx`
- ExcelJS公式ドキュメント: https://github.com/exceljs/exceljs

---

## 次回作業開始時のコマンド

```bash
# 開発サーバー起動（手動実行）
npm run dev

# 型チェック
npm run check
```

**次回のタスク:**
1. お客様がテンプレートを修正
2. 修正後のテンプレートで `server/excel-generators/nursing-record-i.ts` のセル番地を調整
3. APIエンドポイント追加
4. フロントエンド修正
5. テスト＆動作確認
