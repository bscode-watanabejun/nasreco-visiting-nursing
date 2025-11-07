/**
 * 訪問看護療養費オンライン請求CSV生成サービス
 *
 * 「オンラインによる請求に係る記録条件仕様(訪問看護用)」令和6年6月版に準拠
 */

import { buildCsvLine, buildCsvFile } from './csvUtils';
import type { ReceiptCsvData } from './types';
import { determineReceiptTypeCode, determineBurdenClassificationCode, determineInstructionTypeCode } from './receiptClassification';

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
  private instructionTypeCodeCache: string = '01';  // HJレコードで設定した指示区分をKAレコードで再利用
  private burdenClassificationCodeCache: string = '0';  // REレコードで設定した負担区分（別表22）

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

    // 6. JD: 受診日等レコード（複数出力対応）
    this.addJDRecords(data);

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
    // 審査支払機関コードを動的に判定
    const reviewOrgCode = this.determineReviewOrganizationCode(data);

    const fields = [
      'HM',                                                    // レコード識別
      reviewOrgCode,                                           // 審査支払機関 (1=社保, 2=国保連)
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
   * 保険者番号から審査支払機関コードを判定
   *
   * 別表1（審査支払機関コード）:
   * - '1' = 社会保険診療報酬支払基金
   * - '2' = 国民健康保険団体連合会（国保・後期高齢者医療）
   */
  private determineReviewOrganizationCode(data: ReceiptCsvData): string {
    const insuranceCard = data.insuranceCard;

    // 保険証に設定されている審査支払機関コードを優先使用
    if (insuranceCard?.reviewOrganizationCode) {
      return insuranceCard.reviewOrganizationCode;
    }

    // 保険者番号から動的判定（フォールバック）
    const insurerNumber = insuranceCard?.insurerNumber;
    if (!insurerNumber) {
      throw new Error('保険者番号が設定されていません');
    }

    const length = insurerNumber.trim().length;
    const prefix = insurerNumber.substring(0, 2);

    // 6桁 → 国保連 ('2')
    if (length === 6) {
      return '2';
    }

    // 8桁の場合
    if (length === 8) {
      // 後期高齢者医療（39で始まる） → 国保連 ('2')
      if (prefix === '39') {
        return '2';
      }
      // その他の8桁 → 社保 ('1')
      return '1';
    }

    throw new Error(`保険者番号の形式が不正です: ${insurerNumber}`);
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

    // Phase 3: レセプト種別コードを動的判定
    const receiptTypeCode = determineReceiptTypeCode(
      data.patient,
      data.insuranceCard,
      data.publicExpenses
    );

    // レセプト種別 (4桁): 点数表(1桁=6) + 保険種別(1桁) + レセプト種別コード(2桁)
    // 例: 6112 = 訪問看護(6) + 医保(1) + 本人・訪看I(12)
    const insuranceTypeDigit = data.receipt.insuranceType === 'medical' ? '1' : '2';
    const receiptType = `6${insuranceTypeDigit}${receiptTypeCode}`;

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

    // 給付割合（国民健康保険の場合は記録、その他は省略）
    // TODO: 将来的に国民健康保険の給付割合データを保持する場合は実装
    const benefitRatio = '';

    // Phase 3: 負担区分コード（別表22）を動的判定
    this.burdenClassificationCodeCache = determineBurdenClassificationCode(
      data.patient,
      data.insuranceCard,
      data.publicExpenses
    );

    // TODO: 一部負担金区分（別表7）の実装
    // 別表7は70歳以上の低所得者（適用区分Ⅰ・Ⅱ）の場合のみ記録
    // コード '1'=適用区分Ⅱ, '3'=適用区分Ⅰ, 該当しない場合は空欄
    // 現在はデータソースがないため空欄出力（暫定対応）
    // 将来的には insuranceCards.partialBurdenCategory フィールドを追加して対応
    const partialBurdenCategory = '';  // 別表7: 一部負担金区分（暫定: 空欄）

    const fields = [
      'RE',                                   // レコード識別
      receiptNumber,                          // レセプト番号
      receiptType,                            // レセプト種別 (Phase 3: 動的判定)
      billingYearMonth,                       // 請求年月
      kanjiName,                              // 氏名(漢字)
      kanaName,                               // 氏名(カナ)
      gender,                                 // 男女区分
      birthDate,                              // 生年月日
      '',                                     // 予備
      '',                                     // 予備
      benefitRatio,                           // 給付割合（国保のみ、現在は空欄）
      '',                                     // レセプト特記
      partialBurdenCategory,                  // 一部負担金区分（別表7: 該当者のみ、現在は空欄）
      '',                                     // 訪問看護記録番号等
      '',                                     // 検索番号
    ];

    this.lines.push(buildCsvLine(fields));
  }

  /**
   * 4. HO: 保険者レコード
   */
  private addHORecord(data: ReceiptCsvData): void {
    // 保険証情報から取得（仕様書PDFページ10準拠）
    const insurerNumber = data.insuranceCard.insurerNumber || '';           // 保険者番号（8桁）
    const certificateSymbol = data.insuranceCard.certificateSymbol || '';   // 被保険者証記号
    const certificateNumber = data.insuranceCard.certificateNumber || '';   // 被保険者証番号

    // Phase 3: 本人家族区分を保険証情報から取得
    const relationshipType = data.insuranceCard.relationshipType === 'family' ? '2' : '1';

    const claimPoints = String(data.receipt.totalPoints || 0);  // 請求点数

    const fields = [
      'HO',                  // レコード識別
      insurerNumber,         // 保険者番号（8桁固定）
      certificateSymbol,     // 被保険者証記号
      certificateNumber,     // 被保険者証番号
      relationshipType,      // 本人家族区分 (Phase 3: 動的判定)
      claimPoints,           // 請求点数
      '', '', '', '', '', '', '', '', '', '', '', '', '', '',  // その他給付情報 (15項目)
    ];

    this.lines.push(buildCsvLine(fields));

    // Phase 3: 公費負担医療情報がある場合、各公費ごとにKOレコードを追加
    for (const publicExpense of data.publicExpenses) {
      this.addKORecord(data, publicExpense);
    }
  }

  /**
   * 4-2. KO: 公費レコード（仕様書PDFページ11準拠）
   */
  private addKORecord(data: ReceiptCsvData, publicExpense: ReceiptCsvData['publicExpenses'][0]): void {
    // 公費情報（仕様書PDFページ11準拠）
    const beneficiaryNumber = publicExpense.beneficiaryNumber || '';  // 負担者番号（8桁固定）
    const recipientNumber = publicExpense.recipientNumber || '';      // 受給者番号（7桁可変）

    // KOレコードは8フィールド構成（仕様書PDFページ11）
    const fields = [
      'KO',                  // レコード識別
      beneficiaryNumber,     // 負担者番号（8桁固定、法別番号2桁+都道府県・実施機関番号6桁）
      recipientNumber,       // 受給者番号（7桁可変）
      '',                    // 任意給付区分（国保のみ、通常は空欄）
      '',                    // 実日数（省略可）
      '',                    // 合計金額（省略可）
      '',                    // 一部負担金額（省略可）
      '',                    // 公費給付対象一部負担金（省略可）
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
      '',       // 保険者番号等（資格確認）
      '',       // 被保険者証記号（資格確認）
      '',       // 被保険者証番号（資格確認）
      '01',     // 枝番
      '',       // 受給者番号
      '',       // 予備
    ];

    this.lines.push(buildCsvLine(fields));
  }

  /**
   * 6. JD: 受診日等レコード（複数出力対応）
   *
   * 公費併用時は、保険者分と各公費分のJDレコードを出力する
   * 別表23: 負担者種別コード（1=保険者, 2=第1公費, 3=第2公費, 4=第3公費, 5=第4公費）
   */
  private addJDRecords(data: ReceiptCsvData): void {
    // 1. 保険者分のJDレコード（必須）
    this.addJDRecordForPayer(data, '1'); // 1=保険者

    // 2. 公費分のJDレコード（公費がある場合）
    const publicExpenseCount = data.publicExpenses.length;
    for (let i = 0; i < publicExpenseCount; i++) {
      const payerType = String(2 + i); // 2=第1公費, 3=第2公費, 4=第3公費, 5=第4公費
      this.addJDRecordForPayer(data, payerType);
    }
  }

  /**
   * 負担者種別ごとのJDレコードを生成
   */
  private addJDRecordForPayer(data: ReceiptCsvData, payerType: string): void {
    // 訪問記録から受診日情報を作成 (31日分)
    const visitDays: string[] = new Array(31).fill('');

    for (const record of data.nursingRecords) {
      const visitDate = typeof record.visitDate === 'string'
        ? new Date(record.visitDate)
        : record.visitDate;
      const day = visitDate.getDate();
      if (day >= 1 && day <= 31) {
        visitDays[day - 1] = '1';  // 1=実日数に計上する訪問看護（別表25）
      }
    }

    const fields = [
      'JD',       // レコード識別
      payerType,  // 負担者種別（別表23: 1=保険者, 2=第1公費, 3=第2公費...）
      ...visitDays,  // 1~31日の受診情報
    ];

    this.lines.push(buildCsvLine(fields));
  }

  /**
   * 7. MF: 窓口負担額レコード
   */
  private addMFRecord(data: ReceiptCsvData): void {
    // TODO: 窓口負担額区分（別表26）の完全実装
    // 別表26: 窓口負担額区分コード
    // 00: 高額療養費の現物給付なし（現在はこれで固定、暫定対応）
    // 01: 高額療養費現物給付あり（多数回該当を除く）
    // 02: 高額療養費現物給付あり（多数回該当）
    // 将来的には monthlyReceipts.highCostBenefitApplied, highCostBenefitMultiple フィールドを追加して対応
    const windowBurdenCategory = '00';  // 暫定: 00固定（高額療養費制度未対応）

    const fields = [
      'MF',                  // レコード識別
      windowBurdenCategory,  // 窓口負担額区分（別表26: 暫定'00'固定）
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
      '6',                                                // 医療機関点数表 (6=訪問看護)
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

    // Phase 3: 指示区分コードを動的判定し、KAレコードでも使用できるようキャッシュに保存
    this.instructionTypeCodeCache = determineInstructionTypeCode({
      instructionType: data.doctorOrder.instructionType
    });

    const fields = [
      'HJ',                           // レコード識別
      this.instructionTypeCodeCache,  // 指示区分 (Phase 3: 動的判定 01-06)
      startDate,                      // 指示期間自 YYYYMMDD
      endDate,                        // 指示期間至 YYYYMMDD
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

    const fields = [
      'SY',         // レコード識別情報
      icd10Code,    // 傷病名コード (ICD-10, 7桁)
      '',           // 修飾語コード (部位等修飾語コード、40バイト可変)
      diagnosis,    // 傷病名称 (最大40文字、80バイト可変)
      '',           // 補足コメント (40バイト可変)
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

    // 訪問した場所1コード (最初の訪問記録の訪問場所、別表16)
    const visitLocationCode = data.nursingRecords[0]?.visitLocationCode || '01';

    // 死亡年月日（既存のdeathDateフィールドから取得）
    const deathDate = data.patient.deathDate
      ? formatDateToYYYYMMDD(data.patient.deathDate)
      : '';

    // TODO: RJレコードの完全実装
    // - 訪問終了情報（年月日、時刻、状況コード、状況文字データ）
    //   将来的には patients.visitEndDate, visitEndTime, visitEndStatusCode, visitEndStatusText フィールドを追加
    // - 死亡詳細情報（時刻、場所コード、場所文字データ）
    //   将来的には patients.deathTime, deathPlaceCode, deathPlaceText フィールドを追加
    // - 訪問場所変更履歴（訪問した場所2・3）
    //   将来的には visit_location_history テーブルを追加
    // - 他の訪問看護ステーション情報
    //   将来的には other_nursing_stations テーブルを追加

    const fields = [
      'RJ',                // 1. レコード識別情報
      firstVisitDate,      // 2. 訪問開始年月日 YYYYMMDD
      visitLocationCode,   // 3. 訪問した場所1コード (別表16 場所コード)
      '',                  // 4. 訪問した場所1文字データ
      '',                  // 5. 訪問した場所2訪問場所変更年月日
      '',                  // 6. 訪問した場所2コード
      '',                  // 7. 訪問した場所2文字データ
      '',                  // 8. 訪問した場所3訪問場所変更年月日
      '',                  // 9. 訪問した場所3コード
      '',                  // 10. 訪問した場所3文字データ
      '',                  // 11. 訪問終了年月日（TODO: 暫定空欄）
      '',                  // 12. 訪問終了時刻（TODO: 暫定空欄）
      '',                  // 13. 訪問終了状況コード（TODO: 暫定空欄、別表15）
      '',                  // 14. 訪問終了状況文字データ（TODO: 暫定空欄）
      deathDate,           // 15. 死亡年月日（既存フィールドから取得）
      '',                  // 16. 死亡時刻（TODO: 暫定空欄）
      '',                  // 17. 死亡場所コード（TODO: 暫定空欄、別表16）
      '',                  // 18. 死亡場所文字データ（TODO: 暫定空欄）
      '',                  // 19. 利用者情報コード
      '',                  // 20. 他の訪問看護ステーション1都道府県
      '',                  // 21. 他の訪問看護ステーション1点数表
      '',                  // 22. 他の訪問看護ステーション1コード
      '',                  // 23. 他の訪問看護ステーション1所在地
      '',                  // 24. 他の訪問看護ステーション1名称
      '',                  // 25. 他の訪問看護ステーション2都道府県
      '',                  // 26. 他の訪問看護ステーション2点数表
      '',                  // 27. 他の訪問看護ステーション2コード
      '',                  // 28. 他の訪問看護ステーション2所在地
      '',                  // 29. 他の訪問看護ステーション2名称
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
      'KA',                                  // レコード識別
      visitDate,                             // 算定年月日 YYYYMMDD
      this.burdenClassificationCodeCache,    // 負担区分 (別表22)
      serviceCode,                           // 訪問看護療養費コード (9桁)
      '1',                                   // 数量データ (回数)
      String(amount),                        // 金額 (点数×10)
      staffCode,                             // 職種等
      '01',                                  // 同日訪問回数 (01=1回目)
      this.instructionTypeCodeCache,         // 指示区分 (HJレコードと同じ値を使用)
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
