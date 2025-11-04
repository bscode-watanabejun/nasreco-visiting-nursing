/**
 * 訪問看護療養費オンライン請求CSV生成サービス
 *
 * 「オンラインによる請求に係る記録条件仕様(訪問看護用)」令和6年6月版に準拠
 */

import { buildCsvLine, buildCsvFile } from './csvUtils';
import type { ReceiptCsvData } from './types';

/**
 * 日付をYYYYMMDD形式の文字列に変換
 */
function formatDateToYYYYMMDD(date: Date | string): string {
  if (typeof date === 'string') {
    return date.replace(/-/g, '');
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * 訪問看護療養費CSVビルダー
 */
export class NursingReceiptCsvBuilder {
  private lines: string[];

  constructor() {
    this.lines = [];
  }

  /**
   * CSVファイル全体を生成
   */
  public async build(data: ReceiptCsvData): Promise<Buffer> {
    this.lines = [];

    // 1. HM: 訪問看護ステーション情報レコード
    this.addHMRecord(data);

    // 2. GO: 訪問看護療養費請求書レコード
    this.addGORecord();

    // 3. RE: レセプト共通レコード
    this.addRERecord(data);

    // 4. HO: 保険者レコード
    this.addHORecord(data);

    // 5. SN: 資格確認レコード
    this.addSNRecord(data);

    // 6. JD: 受診日等レコード
    this.addJDRecord(data);

    // 7. MF: 窓口負担額レコード
    this.addMFRecord(data);

    // 8. IH: 医療機関・保険医情報レコード
    this.addIHRecord(data);

    // 9. HJ: 訪問看護指示レコード
    this.addHJRecord(data);

    // 10. JS: 心身の状態レコード
    this.addJSRecord(data);

    // 11. SY: 傷病名レコード
    this.addSYRecord(data);

    // 12. RJ: 利用者情報レコード
    this.addRJRecord(data);

    // 13. KA: 訪問看護療養費レコード (複数)
    for (const record of data.nursingRecords) {
      this.addKARecord(data, record);
    }

    // Shift_JISエンコードして返す
    return buildCsvFile(this.lines);
  }

  /**
   * 1. HM: 訪問看護ステーション情報レコード
   */
  private addHMRecord(data: ReceiptCsvData): void {
    // TODO: 審査支払機関コードは将来的に保険種別に応じて動的に判定すべき
    // 別表1: 1=社保, 2=国保 (現在は社保固定)
    const fields = [
      'HM',                                                    // レコード識別
      '1',                                                     // 審査支払機関 (1=社保)
      data.facility.prefectureCode || '',                     // 都道府県コード
      '6',                                                     // 点数表 (6=訪問看護)
      data.facility.facilityCode || '',                       // 訪問看護ステーションコード (7桁)
      data.facility.name || '',                               // 訪問看護ステーション名称
      `${data.receipt.targetYear}${String(data.receipt.targetMonth).padStart(2, '0')}`, // 請求年月 YYYYMM
      data.facility.phone || '',                              // 電話番号
    ];

    this.lines.push(buildCsvLine(fields));
  }

  /**
   * 2. GO: 訪問看護療養費請求書レコード
   */
  private addGORecord(): void {
    this.lines.push(buildCsvLine(['GO']));
  }

  /**
   * 3. RE: レセプト共通レコード
   */
  private addRERecord(data: ReceiptCsvData): void {
    // レセプト番号 (6桁連番)
    const receiptNumber = String(1).padStart(6, '0');

    // レセプト種別コード (4桁) - 例: 6112=医保・本人・訪看I
    const receiptType = '6112';

    // 請求年月 YYYYMM
    const billingYearMonth = `${data.receipt.targetYear}${String(data.receipt.targetMonth).padStart(2, '0')}`;

    // カナ氏名
    const kanaName = data.patient.kanaName || '';

    // 漢字氏名
    const kanjiName = `${data.patient.lastName || ''} ${data.patient.firstName || ''}`.trim();

    // 性別 (1=男, 2=女)
    const gender = data.patient.gender === 'male' ? '1' : '2';

    // 生年月日 YYYYMMDD
    const birthDate = data.patient.dateOfBirth ? formatDateToYYYYMMDD(data.patient.dateOfBirth) : '';

    // 合計点数
    const totalPoints = data.receipt.totalPoints || 0;

    const fields = [
      'RE',                  // レコード識別
      receiptNumber,         // レセプト番号
      receiptType,           // レセプト種別
      billingYearMonth,      // 請求年月
      kanaName,              // 氏名(カナ)
      kanjiName,             // 氏名(漢字)
      gender,                // 男女区分
      birthDate,             // 生年月日
      '',                    // 予備
      '',                    // 予備
      String(totalPoints),   // 合計点数
      '',                    // 予備
    ];

    this.lines.push(buildCsvLine(fields));
  }

  /**
   * 4. HO: 保険者レコード
   */
  private addHORecord(data: ReceiptCsvData): void {
    const insuranceNumber = data.patient.insuranceNumber || '';
    const insuranceSymbol = '';  // 被保険者証記号
    const patientNumber = data.patient.patientNumber || '';  // 被保険者証番号
    const relationshipType = '1';  // 本人家族区分 (1=本人)
    const claimPoints = String(data.receipt.totalPoints || 0);  // 請求点数

    const fields = [
      'HO',                  // レコード識別
      insuranceNumber,       // 保険者番号
      insuranceSymbol,       // 被保険者証記号
      patientNumber,         // 被保険者証番号
      relationshipType,      // 本人家族区分
      claimPoints,           // 請求点数
      '', '', '', '', '', '', '', '', '', '', '', '', '', '',  // その他給付情報 (15項目)
    ];

    this.lines.push(buildCsvLine(fields));
  }

  /**
   * 5. SN: 資格確認レコード
   */
  private addSNRecord(data: ReceiptCsvData): void {
    const fields = [
      'SN',     // レコード識別
      '1',      // 負担者種別 (1=保険者)
      '01',     // 確認区分 (01=オンライン資格確認)
      '',       // 保険者番号等
      '',       // 被保険者証記号
      '01',     // 枝番
      '',       // 受給者番号
      '',       // 予備
    ];

    this.lines.push(buildCsvLine(fields));
  }

  /**
   * 6. JD: 受診日等レコード
   */
  private addJDRecord(data: ReceiptCsvData): void {
    // 訪問記録から受診日情報を作成 (31日分)
    const visitDays: string[] = new Array(31).fill('');

    for (const record of data.nursingRecords) {
      const visitDate = typeof record.visitDate === 'string'
        ? new Date(record.visitDate)
        : record.visitDate;
      const day = visitDate.getDate();
      if (day >= 1 && day <= 31) {
        visitDays[day - 1] = '1';  // 1=受診あり
      }
    }

    const fields = [
      'JD',     // レコード識別
      '1',      // 負担者種別 (1=保険者)
      ...visitDays,  // 受診日情報 (1~31日)
    ];

    this.lines.push(buildCsvLine(fields));
  }

  /**
   * 7. MF: 窓口負担額レコード
   */
  private addMFRecord(data: ReceiptCsvData): void {
    const fields = [
      'MF',     // レコード識別
      '',       // 窓口負担額区分
      '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',  // 予備 1-15
      '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',  // 予備 16-30
      '',       // 予備 31
    ];

    this.lines.push(buildCsvLine(fields));
  }

  /**
   * 8. IH: 医療機関・保険医情報レコード
   */
  private addIHRecord(data: ReceiptCsvData): void {
    const medicalInstitution = data.medicalInstitution;

    const fields = [
      'IH',                                               // レコード識別
      medicalInstitution.prefectureCode || '',           // 医療機関都道府県
      '1',                                                // 医療機関点数表 (1=医科)
      medicalInstitution.institutionCode || '',          // 医療機関コード (7桁)
      medicalInstitution.name || '',                     // 医療機関名称
      medicalInstitution.doctorName || '',               // 主治医氏名
      '',                                                 // 主治医への直近報告年月日
    ];

    this.lines.push(buildCsvLine(fields));
  }

  /**
   * 9. HJ: 訪問看護指示レコード
   */
  private addHJRecord(data: ReceiptCsvData): void {
    const startDate = data.doctorOrder.startDate ? formatDateToYYYYMMDD(data.doctorOrder.startDate) : '';
    const endDate = data.doctorOrder.endDate ? formatDateToYYYYMMDD(data.doctorOrder.endDate) : '';

    const fields = [
      'HJ',     // レコード識別
      '01',     // 指示区分 (01=訪問看護指示書)
      startDate,  // 指示期間自 YYYYMMDD
      endDate,    // 指示期間至 YYYYMMDD
    ];

    this.lines.push(buildCsvLine(fields));
  }

  /**
   * 10. JS: 心身の状態レコード
   */
  private addJSRecord(data: ReceiptCsvData): void {
    const fields = [
      'JS',     // レコード識別
      '',       // 該当する疾病等
      '',       // GAF尺度判定値
      '',       // GAF尺度判定年月日
    ];

    this.lines.push(buildCsvLine(fields));
  }

  /**
   * 11. SY: 傷病名レコード
   */
  private addSYRecord(data: ReceiptCsvData): void {
    const icd10Code = data.doctorOrder.icd10Code || '0000000';
    const diagnosis = data.doctorOrder.diagnosis || '';
    const startDate = data.doctorOrder.startDate ? formatDateToYYYYMMDD(data.doctorOrder.startDate) : '';

    const fields = [
      'SY',         // レコード識別
      icd10Code,    // 傷病名コード (ICD-10, 7桁)
      startDate,    // 診療開始日 YYYYMMDD
      '',           // 転帰区分 (空白=継続)
      '',           // 修飾語コード
      '',           // 予備
      diagnosis,    // 傷病名称
      '01',         // 主傷病 (01=主傷病)
    ];

    this.lines.push(buildCsvLine(fields));
  }

  /**
   * 12. RJ: 利用者情報レコード
   */
  private addRJRecord(data: ReceiptCsvData): void {
    // 訪問開始年月日 (最初の訪問記録の日付)
    const firstVisitDate = data.nursingRecords[0]?.visitDate
      ? formatDateToYYYYMMDD(data.nursingRecords[0].visitDate)
      : '';

    const fields = [
      'RJ',           // レコード識別
      firstVisitDate, // 訪問開始年月日 YYYYMMDD
      '01',           // 訪問した場所1コード (01=居宅)
      '', '', '', '', '', '', '', '', '', '', '', '', '',
      '', '', '', '', '', '', '', '', '', '', '', '', '',  // その他利用者情報 (27項目)
    ];

    this.lines.push(buildCsvLine(fields));
  }

  /**
   * 13. KA: 訪問看護療養費レコード
   */
  private addKARecord(data: ReceiptCsvData, record: ReceiptCsvData['nursingRecords'][0]): void {
    const visitDate = record.visitDate ? formatDateToYYYYMMDD(record.visitDate) : '';
    const serviceCode = record.serviceCode || '000000000';
    const points = record.calculatedPoints || 0;
    const amount = points * 10;  // 金額 = 点数 × 10
    const staffCode = record.staffQualificationCode || '03';  // デフォルト: 03=看護師

    const fields = [
      'KA',                // レコード識別
      visitDate,           // 算定年月日 YYYYMMDD
      '1',                 // 負担区分 (1=医保単独)
      serviceCode,         // 訪問看護療養費コード (9桁)
      '1',                 // 数量データ (回数)
      String(amount),      // 金額 (点数×10)
      staffCode,           // 職種等
      '01',                // 同日訪問回数 (01=1回目)
      '01',                // 指示区分 (01=訪問看護指示書)
    ];

    this.lines.push(buildCsvLine(fields));
  }
}

/**
 * 訪問看護療養費CSVを生成する便利関数
 */
export async function generateNursingReceiptCsv(data: ReceiptCsvData): Promise<Buffer> {
  const builder = new NursingReceiptCsvBuilder();
  return builder.build(data);
}
