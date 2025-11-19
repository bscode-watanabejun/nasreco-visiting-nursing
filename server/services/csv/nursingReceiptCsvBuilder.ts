/**
 * 訪問看護療養費オンライン請求CSV生成サービス
 *
 * 「オンラインによる請求に係る記録条件仕様(訪問看護用)」令和6年6月版に準拠
 */

import { buildCsvLine, buildCsvFile, toShiftJIS } from './csvUtils';
import type { ReceiptCsvData, MedicalInsuranceReceiptCsvData } from './types';
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
  private currentReceiptNumber: number = 1;  // 複数レセプト対応時のレセプト番号管理

  constructor() {
    this.lines = [];
  }

  /**
   * 可変長フィールドを生成（Shift_JISでの最大バイト数を考慮）
   * @param value - 値
   * @param maxBytes - 最大バイト数
   * @returns 最大バイト数以内に収めた文字列
   */
  private formatVariable(value: string | null | undefined, maxBytes: number): string {
    if (!value) return '';
    const shiftJisBytes = toShiftJIS(value);
    if (shiftJisBytes.length <= maxBytes) {
      return value;
    }
    // 最大バイト数を超える場合は切り詰める
    let truncated = '';
    for (let i = 0; i < value.length; i++) {
      const testStr = truncated + value[i];
      const testBytes = toShiftJIS(testStr);
      if (testBytes.length > maxBytes) {
        break;
      }
      truncated = testStr;
    }
    return truncated;
  }

  /**
   * 訪問場所変更履歴を自動検出（同一月内で異なる場所コードが使用された場合を変更とみなす）
   * @param nursingRecords - 訪問記録一覧
   * @param firstLocationCode - 最初の訪問場所コード
   * @returns 変更履歴の配列（最大2件）
   */
  private detectVisitLocationChanges(
    nursingRecords: Array<{
      visitDate: Date | string;
      visitLocationCode: string;
      visitLocationCustom?: string | null;
    }>,
    firstLocationCode: string
  ): Array<{
    changeDate: Date | string;
    locationCode: string;
    locationCustom?: string | null;
  }> {
    if (nursingRecords.length === 0) return [];

    // 訪問日でソート
    const sortedRecords = [...nursingRecords].sort((a, b) => {
      const dateA = typeof a.visitDate === 'string' ? new Date(a.visitDate) : a.visitDate;
      const dateB = typeof b.visitDate === 'string' ? new Date(b.visitDate) : b.visitDate;
      return dateA.getTime() - dateB.getTime();
    });

    const changes: Array<{
      changeDate: Date | string;
      locationCode: string;
      locationCustom?: string | null;
    }> = [];

    // 最初の訪問場所と異なる場所コードが出現した日を検出
    for (const record of sortedRecords) {
      if (record.visitLocationCode !== firstLocationCode) {
        const changeDate = record.visitDate;
        // 既に同じ変更日・場所コードの記録がないか確認
        const existing = changes.find(c => {
          const cDate = typeof c.changeDate === 'string' ? new Date(c.changeDate) : c.changeDate;
          const rDate = typeof changeDate === 'string' ? new Date(changeDate) : changeDate;
          return cDate.toDateString() === rDate.toDateString() && c.locationCode === record.visitLocationCode;
        });

        if (!existing) {
          changes.push({
            changeDate,
            locationCode: record.visitLocationCode,
            locationCustom: record.visitLocationCustom
          });

          // 最大2件まで
          if (changes.length >= 2) break;
        }
      }
    }

    return changes;
  }

  /**
   * 訪問終了情報を取得（対象月の訪問記録から集約）
   * @param nursingRecords - 訪問記録一覧
   * @param deathDate - 死亡年月日
   * @returns 訪問終了情報の配列 [訪問終了年月日, 訪問終了時刻, 訪問終了状況コード, 訪問終了状況文字データ]
   */
  private getServiceEndInfo(
    nursingRecords: Array<{
      visitDate: Date | string;
      actualEndTime: string;
      isServiceEnd?: boolean;
      serviceEndReasonCode?: string | null;
      serviceEndReasonText?: string | null;
    }>,
    deathDate: Date | string | null
  ): [string, string, string, string] {
    // 訪問終了フラグがtrueの訪問記録を取得
    const serviceEndRecords = nursingRecords.filter(r => r.isServiceEnd);
    
    if (serviceEndRecords.length === 0) {
      return ['', '', '', ''];
    }
    
    // 最初の1件を使用（複数ある場合は最初の1件のみ）
    const firstEnd = serviceEndRecords[0];
    
    // 訪問終了状況コード「04（死亡）」の場合は、死亡年月日と重複しないように空欄にする
    if (firstEnd.serviceEndReasonCode === '04' && deathDate) {
      return ['', '', '', ''];
    }
    
    // 訪問終了時刻は actualEndTime から HHMM 形式に変換
    let serviceEndTime = '';
    if (firstEnd.actualEndTime) {
      // actualEndTimeは "HH:MM" 形式または "HHMM" 形式
      const timeStr = firstEnd.actualEndTime.replace(':', '');
      if (timeStr.length >= 4) {
        serviceEndTime = timeStr.substring(0, 4);
      }
    }
    
    const serviceEndDate = formatDateToYYYYMMDD(firstEnd.visitDate);
    const serviceEndReasonCode = firstEnd.serviceEndReasonCode || '';
    const serviceEndReasonText = (firstEnd.serviceEndReasonCode === '99' && firstEnd.serviceEndReasonText)
      ? this.formatVariable(firstEnd.serviceEndReasonText, 20)
      : '';
    
    return [serviceEndDate, serviceEndTime, serviceEndReasonCode, serviceEndReasonText];
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

    // 5. SN: 資格確認レコード（複数出力対応）
    this.addSNRecords(data);

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
    // 13.1 基本訪問記録のKAレコード
    // 訪問記録を日付と時刻でソートし、同日訪問回数を計算
    const sortedRecords = this.sortRecordsByDateAndTime(data.nursingRecords);
    
    for (const record of sortedRecords) {
      const visitOrder = this.getVisitOrderForDate(sortedRecords, record);
      this.addKARecord(data, record, visitOrder);
    }

    // 13.2 加算のKAレコード（サービスコード選択済みのもののみ）
    for (const bonus of data.bonusHistory) {
      this.addBonusKARecord(data, bonus);
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
  private addRERecord(data: ReceiptCsvData, receiptNumber?: number): void {
    // レセプト番号 (6桁連番)
    const receiptNum = receiptNumber !== undefined 
      ? String(receiptNumber).padStart(6, '0')
      : String(1).padStart(6, '0');

    // Phase 3: レセプト種別コードを動的判定（4桁コードをそのまま使用）
    const receiptType = determineReceiptTypeCode(
      data.patient,
      data.insuranceCard,
      data.publicExpenses
    );

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
    // 保険者番号から国保かどうかを判定（審査支払機関コードが'2'の場合）
    const reviewOrgCode = this.determineReviewOrganizationCode(data);
    let benefitRatio = '';
    if (reviewOrgCode === '2') {
      // 国保の場合、負担割合から給付割合を計算（100 - 負担割合）
      const copaymentRate = data.insuranceCard.copaymentRate 
        ? parseInt(data.insuranceCard.copaymentRate) 
        : 30; // デフォルト3割
      const benefitRate = 100 - copaymentRate;
      benefitRatio = String(benefitRate).padStart(3, '0'); // 3桁で出力（例: 090, 080, 070）
    }

    // Phase 3: 負担区分コード（別表22）を動的判定
    this.burdenClassificationCodeCache = determineBurdenClassificationCode(
      data.patient,
      data.insuranceCard,
      data.publicExpenses
    );

    // 一部負担金区分（別表7）の実装
    // 別表7は70歳以上の低所得者（適用区分Ⅰ・Ⅱ）の場合のみ記録
    // コード '1'=適用区分Ⅱ, '3'=適用区分Ⅰ, 該当しない場合は空欄
    let partialBurdenCategory = '';
    if (data.insuranceCard.partialBurdenCategory) {
      // 年齢を計算
      const birthDate = data.patient.dateOfBirth ? new Date(data.patient.dateOfBirth) : null;
      if (birthDate) {
        const today = new Date();
        const age = today.getFullYear() - birthDate.getFullYear() - 
                    (today.getMonth() < birthDate.getMonth() || 
                     (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate()) ? 1 : 0);
        
        // 70歳以上かつ低所得者（elderlyRecipientCategory='general_low'）の場合のみ記録
        if (age >= 70 && data.insuranceCard.elderlyRecipientCategory === 'general_low') {
          partialBurdenCategory = data.insuranceCard.partialBurdenCategory;
        }
      }
    }

    const fields = [
      'RE',                                   // レコード識別
      receiptNum,                             // レセプト番号
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

    // 実日数を計算（訪問記録から集計）
    const actualDays = new Set(
      data.nursingRecords.map(r => formatDateToYYYYMMDD(r.visitDate))
    ).size;

    // 合計金額（必須）
    const totalAmount = data.receipt.totalAmount || 0;

    // 一部負担金額・減免情報を取得
    const certificateNumberForHO = data.receipt.certificateNumber || ''; // 証明書番号
    const partialBurdenAmount = data.receipt.partialBurdenAmount || null;
    const reductionCategory = data.receipt.reductionCategory || '';
    const reductionRate = data.receipt.reductionRate 
      ? String(data.receipt.reductionRate).padStart(3, '0')
      : '';
    const reductionAmount = data.receipt.reductionAmount 
      ? String(data.receipt.reductionAmount).padStart(6, '0')
      : '';

    const fields = [
      'HO',                                    // レコード識別情報
      insurerNumber.padStart(8, ' '),         // 保険者番号（8桁固定、スペース埋め）
      certificateSymbol,                       // 被保険者証記号（38バイト可変）
      certificateNumber,                       // 被保険者証番号（38バイト可変）
      String(actualDays).padStart(2, '0'),   // 実日数（2桁可変、必須）
      String(totalAmount).padStart(8, '0'),   // 合計金額（8桁可変、必須）
      '',                                      // 職務上の事由（1桁可変）
      certificateNumberForHO || '',            // 証明書番号（3桁可変）
      partialBurdenAmount ? String(partialBurdenAmount).padStart(8, '0') : '', // 一部負担金額（8桁可変）
      reductionCategory || '',                 // 減免区分（1桁可変）
      reductionRate || '',                     // 減額割合（3桁可変）
      reductionAmount || '',                   // 減額金額（6桁可変）
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

    // 公費の実日数を計算（訪問記録から集計）
    // 注意: 現在のデータ構造では訪問記録に公費IDが含まれていないため、
    // 暫定的に全訪問記録から実日数を計算（将来的には公費IDでフィルタする必要がある）
    const publicExpenseDays = new Set(
      data.nursingRecords.map(r => formatDateToYYYYMMDD(r.visitDate))
    ).size;

    // 公費の合計金額を計算（訪問記録の点数×10の合計）
    // 注意: 現在のデータ構造では訪問記録に公費IDが含まれていないため、
    // 暫定的に全訪問記録から合計金額を計算（将来的には公費IDでフィルタする必要がある）
    const publicExpenseAmount = data.nursingRecords.reduce(
      (sum, r) => sum + (r.calculatedPoints || 0) * 10,
      0
    );

    // 受給者番号を7桁で0埋め（医療観察法の場合は省略）
    const formattedRecipientNumber = recipientNumber
      ? recipientNumber.padStart(7, '0')
      : '';

    // KOレコードは8フィールド構成（仕様書PDFページ11）
    const fields = [
      'KO',                                          // レコード識別情報
      beneficiaryNumber,                             // 負担者番号（8桁固定、法別番号2桁+都道府県・実施機関番号6桁）
      formattedRecipientNumber,                      // 受給者番号（7桁可変、0埋め、医療観察法の場合は省略）
      '',                                            // 任意給付区分（国保のみ、通常は空欄）
      String(publicExpenseDays).padStart(2, '0'),  // 実日数（2桁可変、必須）
      String(publicExpenseAmount).padStart(8, '0'), // 合計金額（8桁可変、必須）
      '',                                            // 一部負担金額（8桁可変）
      '',                                            // 公費給付対象一部負担金（6桁可変）
    ];

    this.lines.push(buildCsvLine(fields));
  }

  /**
   * 5. SN: 資格確認レコード（複数出力対応）
   *
   * 保険者分（負担者種別"1"）と公費分（負担者種別"2"～"5"）のSNレコードを出力
   * 別表23: 負担者種別コードの昇順で記録
   */
  private addSNRecords(data: ReceiptCsvData): void {
    // 1. 保険者分のSNレコード（必須）
    this.addSNRecordForPayer(data, '1');

    // 2. 公費分のSNレコード（公費がある場合）
    const publicExpenseCount = data.publicExpenses.length;
    for (let i = 0; i < publicExpenseCount; i++) {
      const payerType = String(2 + i); // 2=第1公費, 3=第2公費, 4=第3公費, 5=第4公費
      this.addSNRecordForPayer(data, payerType);
    }
  }

  /**
   * 負担者種別ごとのSNレコードを生成
   */
  private addSNRecordForPayer(data: ReceiptCsvData, payerType: string): void {
    // 保険者分（負担者種別"1"）の場合のみ枝番を記録
    const branchNumber = payerType === '1' ? '01' : '';

    const fields = [
      'SN',     // レコード識別情報
      payerType, // 負担者種別（別表23: 1=保険者, 2=第1公費, 3=第2公費...）
      '01',     // 確認区分（別表24: 01=訪問時等）
      '',       // 保険者番号等（資格確認）- 一次請求では省略
      '',       // 被保険者証記号（資格確認）- 一次請求では省略
      '',       // 被保険者証番号（資格確認）- 一次請求では省略
      branchNumber, // 枝番（保険者のみ、2桁）
      '',       // 受給者番号 - 一次請求では省略
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
    // 最新の訪問記録の観察事項を取得（訪問日が最新のもの）
    // 訪問記録を訪問日で降順ソートして最新のものを取得
    const sortedRecords = [...data.nursingRecords].sort((a, b) => {
      const dateA = typeof a.visitDate === 'string' ? new Date(a.visitDate) : a.visitDate;
      const dateB = typeof b.visitDate === 'string' ? new Date(b.visitDate) : b.visitDate;
      return dateB.getTime() - dateA.getTime();
    });
    
    // 最新の訪問記録の観察事項を取得（必須フィールド）
    const mentalPhysicalState = sortedRecords[0]?.observations || '';

    const fields = [
      'JS',                    // レコード識別情報
      mentalPhysicalState,     // 心身の状態（必須、2400バイト可変）
      '',                      // 基準告示第2の1に規定する疾病等の有無（任意）
      '',                      // 該当する疾病等（任意）
      '',                      // GAF尺度により判定した値（任意）
      '',                      // GAF尺度により判定した年月日（任意）
    ];

    this.lines.push(buildCsvLine(fields));
  }

  /**
   * 11. SY: 傷病名レコード
   */
  private addSYRecord(data: ReceiptCsvData): void {
    // 未コード化傷病名の場合は"0000999"を使用（公式仕様）
    const icd10Code = data.doctorOrder.icd10Code || '0000999';
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

    // 訪問した場所1文字データ（場所コード99の場合のみ）
    const visitLocation1Text = (visitLocationCode === '99' && data.nursingRecords[0]?.visitLocationCustom)
      ? this.formatVariable(data.nursingRecords[0].visitLocationCustom, 130)
      : '';

    // 訪問場所変更履歴の自動検出（場所2・3）
    const locationChanges = this.detectVisitLocationChanges(data.nursingRecords, visitLocationCode);
    const location2 = locationChanges[0] || null;
    const location3 = locationChanges[1] || null;

    // 死亡年月日（既存のdeathDateフィールドから取得）
    const deathDate = data.patient.deathDate
      ? formatDateToYYYYMMDD(data.patient.deathDate)
      : '';

    // TODO: RJレコードの完全実装
    // - 訪問終了情報（年月日、時刻、状況コード、状況文字データ）
    //   将来的には patients.visitEndDate, visitEndTime, visitEndStatusCode, visitEndStatusText フィールドを追加
    // - 死亡詳細情報（時刻、場所コード、場所文字データ）
    //   将来的には patients.deathTime, deathPlaceCode, deathPlaceText フィールドを追加
    // - 他の訪問看護ステーション情報
    //   将来的には other_nursing_stations テーブルを追加

    const fields = [
      'RJ',                // 1. レコード識別情報
      firstVisitDate,      // 2. 訪問開始年月日 YYYYMMDD
      visitLocationCode,   // 3. 訪問した場所1コード (別表16 場所コード)
      visitLocation1Text,  // 4. 訪問した場所1文字データ（場所コード99の場合のみ）
      location2 ? formatDateToYYYYMMDD(location2.changeDate) : '',  // 5. 訪問した場所2訪問場所変更年月日
      location2 ? location2.locationCode : '',  // 6. 訪問した場所2コード
      location2 && location2.locationCode === '99' && location2.locationCustom
        ? this.formatVariable(location2.locationCustom, 130)
        : '',  // 7. 訪問した場所2文字データ
      location3 ? formatDateToYYYYMMDD(location3.changeDate) : '',  // 8. 訪問した場所3訪問場所変更年月日
      location3 ? location3.locationCode : '',  // 9. 訪問した場所3コード
      location3 && location3.locationCode === '99' && location3.locationCustom
        ? this.formatVariable(location3.locationCustom, 130)
        : '',  // 10. 訪問した場所3文字データ
      ...this.getServiceEndInfo(data.nursingRecords, deathDate),  // 11-14. 訪問終了情報
      deathDate,           // 15. 死亡年月日（既存フィールドから取得）
      // 16. 死亡時刻（HHMM形式に変換）
      data.patient.deathTime
        ? data.patient.deathTime.replace(':', '').substring(0, 4) // HH:MM → HHMM
        : '',
      // 17. 死亡場所コード（別表16）
      data.patient.deathPlaceCode || '',
      // 18. 死亡場所文字データ（場所コード99の場合のみ）
      (data.patient.deathPlaceCode === '99' && data.patient.deathPlaceText)
        ? this.formatVariable(data.patient.deathPlaceText, 130)
        : '',
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
   * 訪問記録を日付と時刻でソート
   */
  private sortRecordsByDateAndTime(records: ReceiptCsvData['nursingRecords']): ReceiptCsvData['nursingRecords'] {
    return [...records].sort((a, b) => {
      const dateA = typeof a.visitDate === 'string' ? new Date(a.visitDate) : a.visitDate;
      const dateB = typeof b.visitDate === 'string' ? new Date(b.visitDate) : b.visitDate;
      
      // 日付で比較
      const dateDiff = dateA.getTime() - dateB.getTime();
      if (dateDiff !== 0) return dateDiff;
      
      // 同じ日付の場合、時刻で比較
      const timeA = a.actualStartTime || '';
      const timeB = b.actualStartTime || '';
      return timeA.localeCompare(timeB);
    });
  }

  /**
   * 同じ日の訪問記録の中で、この訪問記録が何回目かを取得（1から開始）
   */
  private getVisitOrderForDate(
    sortedRecords: ReceiptCsvData['nursingRecords'],
    targetRecord: ReceiptCsvData['nursingRecords'][0]
  ): number {
    const targetDate = targetRecord.visitDate ? formatDateToYYYYMMDD(targetRecord.visitDate) : '';
    let order = 0;
    
    for (const record of sortedRecords) {
      const recordDate = record.visitDate ? formatDateToYYYYMMDD(record.visitDate) : '';
      if (recordDate === targetDate) {
        order++;
        if (record.id === targetRecord.id) {
          return order;
        }
      }
    }
    
    return 1; // フォールバック
  }

  /**
   * 職種等コードを訪問回数に応じて変換
   * 別表20に基づく:
   * - 1回目: 01-10, 51-60
   * - 2回目: 11-20, 61-70
   * - 3回目以降: 21-30, 71-80
   */
  private adjustStaffCodeForVisitOrder(staffCode: string, visitOrder: number): string {
    if (visitOrder === 1) {
      return staffCode; // 1回目はそのまま
    }
    
    // 職種等コードを数値として解釈
    const baseCode = parseInt(staffCode, 10);
    if (isNaN(baseCode)) {
      return staffCode; // 数値でない場合はそのまま
    }
    
    if (visitOrder === 2) {
      // 2回目: +10
      // ただし、範囲を超えないように調整
      if (baseCode >= 1 && baseCode <= 10) {
        return String(baseCode + 10).padStart(2, '0');
      } else if (baseCode >= 51 && baseCode <= 60) {
        return String(baseCode + 10).padStart(2, '0');
      }
    } else if (visitOrder >= 3) {
      // 3回目以降: +20
      if (baseCode >= 1 && baseCode <= 10) {
        return String(baseCode + 20).padStart(2, '0');
      } else if (baseCode >= 51 && baseCode <= 60) {
        return String(baseCode + 20).padStart(2, '0');
      }
    }
    
    return staffCode; // フォールバック
  }

  /**
   * 同日訪問回数コードを取得（別表19）
   * 01=1回目, 02=2回目, 03=3回目以上
   */
  private getVisitCountCode(visitOrder: number): string {
    if (visitOrder === 1) {
      return ''; // 1回目の場合は省略
    } else if (visitOrder === 2) {
      return '02';
    } else {
      return '03'; // 3回目以降
    }
  }

  /**
   * 13. KA: 訪問看護療養費レコード
   */
  private addKARecord(
    data: ReceiptCsvData,
    record: ReceiptCsvData['nursingRecords'][0],
    visitOrder: number = 1
  ): void {
    const visitDate = record.visitDate ? formatDateToYYYYMMDD(record.visitDate) : '';
    
    // サービスコードが必須（バリデーション済み）
    if (!record.serviceCode) {
      throw new Error(`訪問記録ID ${record.id} にサービスコードが設定されていません`);
    }
    const serviceCode = record.serviceCode;
    
    const points = record.calculatedPoints || 0;
    const amount = points * 10;  // 金額 = 点数 × 10
    const baseStaffCode = record.staffQualificationCode || '03';  // デフォルト: 03=看護師
    const staffCode = this.adjustStaffCodeForVisitOrder(baseStaffCode, visitOrder);
    const visitCountCode = this.getVisitCountCode(visitOrder);

    const fields = [
      'KA',                                  // レコード識別
      visitDate,                             // 算定年月日 YYYYMMDD
      this.burdenClassificationCodeCache,    // 負担区分 (別表22)
      serviceCode,                           // 訪問看護療養費コード (9桁)
      '1',                                   // 数量データ (回数)
      String(amount),                        // 金額 (点数×10)
      staffCode,                             // 職種等（訪問回数に応じて調整）
      visitCountCode,                        // 同日訪問回数 (01=1回目, 02=2回目, 03=3回目以上、1回目は省略)
      this.instructionTypeCodeCache,         // 指示区分 (HJレコードと同じ値を使用)
    ];

    this.lines.push(buildCsvLine(fields));
  }

  /**
   * 13.2 加算のKAレコード
   */
  private addBonusKARecord(data: ReceiptCsvData, bonus: ReceiptCsvData['bonusHistory'][0]): void {
    const visitDate = bonus.visitDate ? formatDateToYYYYMMDD(bonus.visitDate) : '';
    
    // サービスコードが必須
    if (!bonus.serviceCode) {
      console.warn(`加算履歴ID ${bonus.id} にサービスコードが設定されていません。スキップします。`);
      return;
    }
    
    const serviceCode = bonus.serviceCode;
    const amount = bonus.points * 10;  // 金額 = 点数 × 10

    const fields = [
      'KA',                                  // レコード識別
      visitDate,                             // 算定年月日 YYYYMMDD
      this.burdenClassificationCodeCache,    // 負担区分 (別表22)
      serviceCode,                           // 訪問看護療養費コード (9桁)
      '1',                                   // 数量データ (回数)
      String(amount),                        // 金額 (点数×10)
      '',                                    // 職種等（加算は省略）
      '',                                    // 同日訪問回数（加算は省略）
      '',                                    // 指示区分（加算は省略）
    ];

    this.lines.push(buildCsvLine(fields));
  }

  /**
   * 複数レセプトを1ファイルにまとめてCSV生成
   */
  public async buildMultiple(data: MedicalInsuranceReceiptCsvData): Promise<Buffer> {
    this.lines = [];
    this.currentReceiptNumber = 1;

    if (data.receipts.length === 0) {
      throw new Error('レセプトデータがありません');
    }

    // 1. HM: 訪問看護ステーション情報レコード（1回のみ、最初のレセプトの施設情報を使用）
    const firstReceipt = data.receipts[0];
    this.addHMRecord(firstReceipt);

    // 2. GO: 訪問看護療養費請求書レコード（1回のみ）
    this.addGORecord();

    // 3. 各レセプト（利用者）ごとに処理
    for (const receiptData of data.receipts) {
      // RE: レセプト共通レコード
      this.addRERecord(receiptData, this.currentReceiptNumber);

      // HO: 保険者レコード
      this.addHORecord(receiptData);

      // SN: 資格確認レコード（複数出力対応）
      this.addSNRecords(receiptData);

      // JD: 受診日等レコード（複数出力対応）
      this.addJDRecords(receiptData);

      // MF: 窓口負担額レコード
      this.addMFRecord(receiptData);

      // IH: 医療機関・保険医情報レコード
      this.addIHRecord(receiptData);

      // HJ: 訪問看護指示レコード
      this.addHJRecord(receiptData);

      // JS: 心身の状態レコード
      this.addJSRecord(receiptData);

      // SY: 傷病名レコード
      this.addSYRecord(receiptData);

      // RJ: 利用者情報レコード
      this.addRJRecord(receiptData);

      // KA: 訪問看護療養費レコード (複数)
      // 13.1 基本訪問記録のKAレコード
      const sortedRecords = this.sortRecordsByDateAndTime(receiptData.nursingRecords);
      
      for (const record of sortedRecords) {
        const visitOrder = this.getVisitOrderForDate(sortedRecords, record);
        this.addKARecord(receiptData, record, visitOrder);
      }

      // 13.2 加算のKAレコード（サービスコード選択済みのもののみ）
      for (const bonus of receiptData.bonusHistory) {
        this.addBonusKARecord(receiptData, bonus);
      }

      // レセプト番号をインクリメント
      this.currentReceiptNumber++;
    }

    // Shift_JISエンコードして返す
    return buildCsvFile(this.lines);
  }
}

/**
 * 訪問看護療養費CSVを生成する便利関数
 */
export async function generateNursingReceiptCsv(data: ReceiptCsvData): Promise<Buffer> {
  const builder = new NursingReceiptCsvBuilder();
  return builder.build(data);
}

/**
 * 複数の訪問看護療養費CSVを1ファイルにまとめて生成する便利関数
 */
export async function generateMultipleNursingReceiptCsv(data: MedicalInsuranceReceiptCsvData): Promise<Buffer> {
  const builder = new NursingReceiptCsvBuilder();
  return builder.buildMultiple(data);
}
