/**
 * 介護保険レセプトCSV生成サービス
 *
 * 「介護保険レセプト IF仕様書 共通編 令和7年8月」および
 * 「介護保険_IF仕様書_サービス事業所編_令和6年4月」に準拠
 */

import { buildCsvLine, buildCsvFile, formatDate, formatNumber, padLeft, padRight } from './csvUtils';
import type { CareInsuranceReceiptCsvData, CareInsurancePatientData } from './types';

/**
 * 介護保険レセプトCSVビルダー
 */
export class CareInsuranceReceiptCsvBuilder {
  private lines: string[];
  private recordNumber: number; // レコード番号（ファイル内の連番）

  constructor() {
    this.lines = [];
    this.recordNumber = 0;
  }

  /**
   * CSVファイル全体を生成
   */
  public async build(data: CareInsuranceReceiptCsvData): Promise<Buffer> {
    this.lines = [];
    this.recordNumber = 0;

    // バリデーション
    this.validateData(data);

    // データレコードの総件数を事前計算
    const dataRecordCount = this.calculateDataRecordCount(data);

    // 1. コントロールレコード（種別:1）
    this.addControlRecord(data, dataRecordCount);

    // 2. 7111（介護給付費請求書情報）- 法別番号ごとに複数レコード
    this.add7111Records(data);

    // 3. 7131（介護給付費請求明細書情報）- 利用者ごと
    // 基本情報レコード（01）、明細情報レコード（02）、集計情報レコード（10）を出力
    this.add7131Records(data);

    // 4. エンドレコード（種別:3）
    this.addEndRecord();

    // Shift_JISエンコードして返す
    return buildCsvFile(this.lines);
  }

  /**
   * データのバリデーション
   */
  private validateData(data: CareInsuranceReceiptCsvData): void {
    const errors: string[] = [];

    // 必須項目チェック
    if (!data.facility.facilityCode || data.facility.facilityCode.length !== 10) {
      errors.push('事業所番号は10桁である必要があります');
    }

    if (data.patients.length === 0) {
      errors.push('利用者データが1件以上必要です');
    }

    // 各利用者ごとにバリデーション
    for (let i = 0; i < data.patients.length; i++) {
      const patientData = data.patients[i];
      const prefix = `利用者${i + 1}`;

      if (!patientData.patient.dateOfBirth) {
        errors.push(`${prefix}: 患者の生年月日が設定されていません`);
      }

      // 要介護状態区分のチェック（データ取得時にスキップしているため、ここでは警告のみ）
      if (!patientData.patient.careLevel) {
        errors.push(`${prefix}: 要介護状態区分が設定されていません（データ取得時にスキップされるはずです）`);
      }

      if (!patientData.insuranceCard.insurerNumber || patientData.insuranceCard.insurerNumber.length !== 8) {
        errors.push(`${prefix}: 保険者番号は8桁である必要があります`);
      }

      if (!patientData.insuranceCard.insuredNumber || patientData.insuranceCard.insuredNumber.length !== 10) {
        errors.push(`${prefix}: 被保険者番号は10桁である必要があります`);
      }

      // サービスコードのチェック
      for (const record of patientData.nursingRecords) {
        if (!record.serviceCode || (record.serviceCode.length !== 6 && record.serviceCode.length !== 9)) {
          errors.push(`${prefix}: 無効なサービスコード: ${record.serviceCode}`);
        }
        if (!record.serviceTypeCode || record.serviceTypeCode.length !== 2) {
          errors.push(`${prefix}: 無効なサービス種類コード: ${record.serviceTypeCode}`);
        }
        if (!record.serviceItemCode || record.serviceItemCode.length !== 4) {
          errors.push(`${prefix}: 無効なサービス項目コード: ${record.serviceItemCode}`);
        }
      }

      // データ整合性チェック
      if (patientData.receipt.totalAmount !== patientData.receipt.totalPoints * 10) {
        errors.push(`${prefix}: 金額の整合性エラー: 総金額(${patientData.receipt.totalAmount}) ≠ 総点数(${patientData.receipt.totalPoints}) × 10`);
      }
    }

    if (errors.length > 0) {
      throw new Error(`CSV生成エラー:\n${errors.join('\n')}`);
    }
  }

  /**
   * レコード番号を取得（インクリメント）
   */
  private getNextRecordNumber(): number {
    this.recordNumber++;
    return this.recordNumber;
  }

  /**
   * 1. コントロールレコード（種別:1）
   */
  private addControlRecord(data: CareInsuranceReceiptCsvData, dataRecordCount: number): void {
    const fields = [
      '1', // レコード種別（固定値「1」）
      padLeft(this.getNextRecordNumber(), 9), // レコード番号
      '0', // ボリューム通番（単独ファイルの場合は「0」）
      padLeft(dataRecordCount, 9), // レコード件数（データレコードの総件数）
      '711', // データ種別（固定値「711」）
      '0', // 福祉事務所特定番号（福祉事務所以外は「0」）
      '0', // 保険者番号（事業所の場合は「0」）
      padRight(data.facility.facilityCode, 10), // 事業所番号（10桁）
      padLeft(data.facility.prefectureCode || '0', 2), // 都道府県番号
      '4', // 媒体区分（4=FDまたはCD-R）
      `${data.targetYear}${String(data.targetMonth).padStart(2, '0')}`, // 処理対象年月（YYYYMM）
      '0', // ファイル管理番号（通常は「0」または「1」）
      '', // ブランク（改行）
    ];

    this.lines.push(buildCsvLine(fields));
  }

  /**
   * 2. 7111（介護給付費請求書情報）- 法別番号ごとに複数レコードを出力
   */
  private add7111Records(data: CareInsuranceReceiptCsvData): void {
    // 法別番号ごとに患者をグループ化
    const patientsByLegalCategory = new Map<string, CareInsurancePatientData[]>();
    
    for (const patientData of data.patients) {
      // 公費がない場合は法別番号「0」
      const legalCategoryNumber = patientData.publicExpenses.length > 0
        ? patientData.publicExpenses[0].legalCategoryNumber // 優先順位1の公費の法別番号
        : '0';
      
      if (!patientsByLegalCategory.has(legalCategoryNumber)) {
        patientsByLegalCategory.set(legalCategoryNumber, []);
      }
      patientsByLegalCategory.get(legalCategoryNumber)!.push(patientData);
    }

    // 各法別番号ごとに7111レコードを生成
    Array.from(patientsByLegalCategory.entries()).forEach(([legalCategoryNumber, patients]) => {
      this.addSingle7111Record(data, legalCategoryNumber, patients);
    });
  }

  /**
   * 単一の7111レコードを生成
   */
  private addSingle7111Record(
    data: CareInsuranceReceiptCsvData,
    legalCategoryNumber: string,
    patients: CareInsurancePatientData[]
  ): void {
    // 該当法別番号の患者の合計を計算
    let totalServiceFeeCount = 0;
    let totalServiceFeeUnits = 0;
    let totalServiceFeeTotal = 0;
    let totalServiceFeeInsuranceClaim = 0;
    let totalServiceFeePublicExpenseClaim = 0;
    let totalServiceFeeUserBurden = 0;

    for (const patientData of patients) {
      totalServiceFeeCount++;
      totalServiceFeeUnits += patientData.receipt.totalPoints;
      totalServiceFeeTotal += patientData.receipt.totalAmount;

      // 給付率を計算（保険証の負担割合から）
      const copaymentRate = patientData.insuranceCard.copaymentRate 
        ? parseInt(patientData.insuranceCard.copaymentRate) 
        : 10;
      const benefitRate = 100 - copaymentRate;

      const insuranceClaim = Math.floor(patientData.receipt.totalAmount * benefitRate / 100);
      const publicExpenseClaim = 0; // 簡易実装では0（公費が存在する場合は計算が必要）
      const userBurden = patientData.receipt.totalAmount - insuranceClaim - publicExpenseClaim;

      totalServiceFeeInsuranceClaim += insuranceClaim;
      totalServiceFeePublicExpenseClaim += publicExpenseClaim;
      totalServiceFeeUserBurden += userBurden;
    }

    // 保険・公費等区分コードを判定
    // 法別番号が「0」の場合は1（保険請求）、それ以外は2（公費請求）
    const insurancePublicExpenseCode = legalCategoryNumber === '0' ? '1' : '2';
    
    // 法別番号（2桁にパディング）
    const legalCategoryNumberPadded = padLeft(legalCategoryNumber, 2);

    // 請求情報区分コード（保険請求:0、生活保護:12）
    const requestInfoCode = legalCategoryNumber === '10' ? '12' : '0';

    const fields = [
      '2', // レコード種別（固定値「2」）
      padLeft(this.getNextRecordNumber(), 9), // レコード番号
      '7111', // 交換情報識別番号（固定値「7111」）
      `${data.targetYear}${String(data.targetMonth).padStart(2, '0')}`, // サービス提供年月（YYYYMM）
      padRight(data.facility.facilityCode, 10), // 事業所番号（10桁）
      insurancePublicExpenseCode, // 保険・公費等区分コード
      legalCategoryNumberPadded, // 法別番号
      requestInfoCode, // 請求情報区分コード
      padLeft(totalServiceFeeCount, 6), // サービス費用_件数（利用者数）
      padLeft(Math.floor(totalServiceFeeUnits), 11), // サービス費用_単位数（小数点以下切捨）
      padLeft(totalServiceFeeTotal, 12), // サービス費用_費用合計
      padLeft(totalServiceFeeInsuranceClaim, 12), // サービス費用_保険請求額
      padLeft(totalServiceFeePublicExpenseClaim, 12), // サービス費用_公費請求額
      padLeft(totalServiceFeeUserBurden, 12), // サービス費用_利用者負担
      '0', // 特定入所者介護サービス費等_件数（訪問看護では0）
      '', // 特定入所者介護サービス費等_延べ日数（訪問看護では空欄）
      '0', // 特定入所者介護サービス費等_費用合計（訪問看護では0）
      '0', // 特定入所者介護サービス費等_利用者負担（訪問看護では0）
      '0', // 特定入所者介護サービス費等_公費請求額（訪問看護では0）
      '0', // 特定入所者介護サービス費等_保険請求額（訪問看護では0）
    ];

    this.lines.push(buildCsvLine(fields));
  }

  /**
   * 3. 7131（介護給付費請求明細書情報）- 利用者ごとに出力
   */
  private add7131Records(data: CareInsuranceReceiptCsvData): void {
    // 各利用者ごとに7131レコードを出力
    for (const patientData of data.patients) {
      // 3.1 基本情報レコード（01）
      this.add7131BasicRecord(patientData, data.targetYear, data.targetMonth, data.facility);

      // 3.2 明細情報レコード（02）- サービス項目ごとに1レコード
      this.add7131DetailRecords(patientData, data.targetYear, data.targetMonth, data.facility);

      // 3.3 集計情報レコード（10）- サービス種類ごとに1レコード
      this.add7131SummaryRecords(patientData, data.targetYear, data.targetMonth, data.facility);
    }
  }

  /**
   * 3.1 基本情報レコード（01）- 全56項目
   */
  private add7131BasicRecord(
    patientData: CareInsurancePatientData,
    targetYear: number,
    targetMonth: number,
    facility: { facilityCode: string; prefectureCode: string | null }
  ): void {
    // 要介護状態区分コードの変換
    const careLevelCode = this.convertCareLevelCode(patientData.patient.careLevel);

    // 性別コードの変換
    const genderCode = patientData.patient.gender === 'male' ? '1' : patientData.patient.gender === 'female' ? '2' : '';

    // 給付率の計算
    const copaymentRate = patientData.insuranceCard.copaymentRate 
      ? parseInt(patientData.insuranceCard.copaymentRate) 
      : 10;
    const benefitRate = padLeft(100 - copaymentRate, 3); // 給付率（90, 80, 70）

    // 公費給付率（簡易実装では0）
    const publicExpense1Rate = '0';
    const publicExpense2Rate = '0';
    const publicExpense3Rate = '0';

    // 認定有効期間（保険証情報の有効期間開始日、有効期限）
    const certificationStart = patientData.insuranceCard.validFrom
      ? formatDate(patientData.insuranceCard.validFrom)
      : '';
    const certificationEnd = patientData.insuranceCard.validUntil
      ? formatDate(patientData.insuranceCard.validUntil)
      : '';

    // サービス開始年月日（訪問記録の最初の日付、または居宅サービス計画の開始日）
    const serviceStartDate = patientData.serviceCarePlan.planPeriodStart
      ? formatDate(patientData.serviceCarePlan.planPeriodStart)
      : (patientData.nursingRecords.length > 0 && patientData.nursingRecords[0].visitDate
          ? formatDate(patientData.nursingRecords[0].visitDate)
          : '');

    // 居宅サービス計画作成区分コード（デフォルト値「1」）
    const servicePlanCreatorCode = patientData.serviceCarePlan.creatorType || '1';

    // 居宅介護支援事業所番号（仮値10桁）
    const careManagerOfficeNumber = patientData.serviceCarePlan.careManagerOfficeNumber || '0000000000';

    // 公費情報（優先順位1-3）
    const publicExpense1 = patientData.publicExpenses.find(pe => pe.priority === 1);
    const publicExpense2 = patientData.publicExpenses.find(pe => pe.priority === 2);
    const publicExpense3 = patientData.publicExpenses.find(pe => pe.priority === 3);

    // 合計情報の計算
    const totalUnits = patientData.receipt.totalPoints;
    const totalClaimAmount = Math.floor(patientData.receipt.totalAmount * (100 - copaymentRate) / 100);
    const totalUserBurden = patientData.receipt.totalAmount - totalClaimAmount;

    const fields = [
      '2', // レコード種別（固定値「2」）
      padLeft(this.getNextRecordNumber(), 9), // レコード番号
      '7131', // 交換情報識別番号（固定値「7131」）
      '01', // レコード種別コード（基本情報レコード）
      `${targetYear}${String(targetMonth).padStart(2, '0')}`, // サービス提供年月（YYYYMM）
      padRight(facility.facilityCode, 10), // 事業所番号（10桁）
      padLeft(patientData.insuranceCard.insurerNumber, 8), // 証記載保険者番号（8桁）
      padRight(patientData.insuranceCard.insuredNumber, 10), // 被保険者番号（10桁）
      publicExpense1 ? padLeft(publicExpense1.beneficiaryNumber, 8) : '', // 公費1 負担者番号（8桁）
      publicExpense1 && publicExpense1.recipientNumber ? padLeft(publicExpense1.recipientNumber, 7) : '', // 公費1 受給者番号（7桁）
      publicExpense2 ? padLeft(publicExpense2.beneficiaryNumber, 8) : '', // 公費2 負担者番号（8桁）
      publicExpense2 && publicExpense2.recipientNumber ? padLeft(publicExpense2.recipientNumber, 7) : '', // 公費2 受給者番号（7桁）
      publicExpense3 ? padLeft(publicExpense3.beneficiaryNumber, 8) : '', // 公費3 負担者番号（8桁）
      publicExpense3 && publicExpense3.recipientNumber ? padLeft(publicExpense3.recipientNumber, 7) : '', // 公費3 受給者番号（7桁）
      formatDate(patientData.patient.dateOfBirth), // 生年月日（YYYYMMDD）
      genderCode, // 性別コード
      padLeft(careLevelCode, 2), // 要介護状態区分コード
      '1', // 旧措置入所者特例コード（1:無し）
      certificationStart, // 認定有効期間 開始年月日（YYYYMMDD）
      certificationEnd, // 認定有効期間 終了年月日（YYYYMMDD）
      servicePlanCreatorCode, // 居宅サービス計画作成区分コード
      padRight(careManagerOfficeNumber, 10), // 居宅介護支援事業所番号（10桁）
      serviceStartDate, // 開始年月日（YYYYMMDD）
      '', // 中止年月日（空欄）
      '', // 中止理由・入所(院)前の状況コード（空欄）
      '', // 入所(院)年月日（訪問看護では空欄）
      '', // 退所(院)年月日（訪問看護では空欄）
      '0', // 入所(院)実日数（訪問看護では0）
      '0', // 外泊日数（訪問看護では0）
      '', // 退所(院)後の状態コード（空欄）
      benefitRate, // 保険給付率
      publicExpense1Rate, // 公費1給付率
      publicExpense2Rate, // 公費2給付率
      publicExpense3Rate, // 公費3給付率
      padLeft(totalUnits, 8), // 合計情報 サービス単位数
      padLeft(totalClaimAmount, 9), // 合計情報 請求額
      padLeft(totalUserBurden, 8), // 合計情報 利用者負担額
      '0', // 保険 緊急時施設療養費請求額（訪問看護では0）
      '0', // 保険 特定診療費費請求額（訪問看護では0）
      '0', // 保険 特定入所者介護サービス費等請求額（訪問看護では0）
      '0', // 公費1 サービス単位数（簡易実装では0）
      '0', // 公費1 請求額（簡易実装では0）
      '0', // 公費1 本人負担額（簡易実装では0）
      '0', // 公費1 緊急時施設療養費請求額（訪問看護では0）
      '0', // 公費1 特定診療費費請求額（訪問看護では0）
      '0', // 公費1 特定入所者介護サービス費等請求額（訪問看護では0）
      '0', // 公費2 サービス単位数（簡易実装では0）
      '0', // 公費2 請求額（簡易実装では0）
      '0', // 公費2 本人負担額（簡易実装では0）
      '0', // 公費2 緊急時施設療養費請求額（訪問看護では0）
      '0', // 公費2 特定診療費費請求額（訪問看護では0）
      '0', // 公費2 特定入所者介護サービス費等請求額（訪問看護では0）
      '0', // 公費3 サービス単位数（簡易実装では0）
      '0', // 公費3 請求額（簡易実装では0）
      '0', // 公費3 本人負担額（簡易実装では0）
      '0', // 公費3 緊急時施設療養費請求額（訪問看護では0）
      '0', // 公費3 特定診療費費請求額（訪問看護では0）
      '0', // 公費3 特定入所者介護サービス費等請求額（訪問看護では0）
    ];

    this.lines.push(buildCsvLine(fields));
  }

  /**
   * 3.2 明細情報レコード（02）- サービス項目ごとに1レコード
   */
  private add7131DetailRecords(
    patientData: CareInsurancePatientData,
    targetYear: number,
    targetMonth: number,
    facility: { facilityCode: string }
  ): void {
    // 訪問記録をサービス項目コードごとにグループ化して出力
    for (const record of patientData.nursingRecords) {
      const fields = [
        '2', // レコード種別（固定値「2」）
        padLeft(this.getNextRecordNumber(), 9), // レコード番号
        '7131', // 交換情報識別番号（固定値「7131」）
        '02', // レコード種別コード（明細情報レコード）
        `${targetYear}${String(targetMonth).padStart(2, '0')}`, // サービス提供年月（YYYYMM）
        padRight(facility.facilityCode, 10), // 事業所番号（10桁）
        padLeft(patientData.insuranceCard.insurerNumber, 8), // 証記載保険者番号（8桁）
        padRight(patientData.insuranceCard.insuredNumber, 10), // 被保険者番号（10桁）
        padRight(record.serviceTypeCode, 2), // サービス種類コード（2桁）
        padRight(record.serviceItemCode, 4), // サービス項目コード（4桁）
        padLeft(record.points, 4), // 単位数
        padLeft(record.visitCount, 2), // 日数・回数
        '', // 公費1対象日数・回数（空欄）
        '', // 公費2対象日数・回数（空欄）
        '', // 公費3対象日数・回数（空欄）
        padLeft(record.totalPoints, 6), // サービス単位数（単位数 × 回数）
        '', // 公費1対象サービス単位数（空欄）
        '', // 公費2対象サービス単位数（空欄）
        '', // 公費3対象サービス単位数（空欄）
        '', // 摘要（空欄）
      ];

      this.lines.push(buildCsvLine(fields));
    }

    // 加算の明細情報レコードも出力
    for (const bonus of patientData.bonusHistory) {
      const fields = [
        '2', // レコード種別（固定値「2」）
        padLeft(this.getNextRecordNumber(), 9), // レコード番号
        '7131', // 交換情報識別番号（固定値「7131」）
        '02', // レコード種別コード（明細情報レコード）
        `${targetYear}${String(targetMonth).padStart(2, '0')}`, // サービス提供年月（YYYYMM）
        padRight(facility.facilityCode, 10), // 事業所番号（10桁）
        padLeft(patientData.insuranceCard.insurerNumber, 8), // 証記載保険者番号（8桁）
        padRight(patientData.insuranceCard.insuredNumber, 10), // 被保険者番号（10桁）
        padRight(bonus.serviceTypeCode, 2), // サービス種類コード（2桁）
        padRight(bonus.serviceItemCode, 4), // サービス項目コード（4桁）
        padLeft(bonus.points, 4), // 単位数
        padLeft(bonus.visitCount, 2), // 日数・回数
        '', // 公費1対象日数・回数（空欄）
        '', // 公費2対象日数・回数（空欄）
        '', // 公費3対象日数・回数（空欄）
        padLeft(bonus.totalPoints, 6), // サービス単位数（単位数 × 回数）
        '', // 公費1対象サービス単位数（空欄）
        '', // 公費2対象サービス単位数（空欄）
        '', // 公費3対象サービス単位数（空欄）
        '', // 摘要（空欄）
      ];

      this.lines.push(buildCsvLine(fields));
    }
  }

  /**
   * 3.3 集計情報レコード（10）- サービス種類ごとに1レコード
   */
  private add7131SummaryRecords(
    patientData: CareInsurancePatientData,
    targetYear: number,
    targetMonth: number,
    facility: { facilityCode: string }
  ): void {
    // サービス種類コードごとにグループ化
    const serviceTypeGroups = new Map<string, {
      records: typeof patientData.nursingRecords;
      bonuses: typeof patientData.bonusHistory;
    }>();

    // 訪問記録をサービス種類コードでグループ化
    for (const record of patientData.nursingRecords) {
      const serviceTypeCode = record.serviceTypeCode;
      if (!serviceTypeGroups.has(serviceTypeCode)) {
        serviceTypeGroups.set(serviceTypeCode, { records: [], bonuses: [] });
      }
      serviceTypeGroups.get(serviceTypeCode)!.records.push(record);
    }

    // 加算もサービス種類コードでグループ化
    for (const bonus of patientData.bonusHistory) {
      const serviceTypeCode = bonus.serviceTypeCode;
      if (!serviceTypeGroups.has(serviceTypeCode)) {
        serviceTypeGroups.set(serviceTypeCode, { records: [], bonuses: [] });
      }
      serviceTypeGroups.get(serviceTypeCode)!.bonuses.push(bonus);
    }

    // サービス種類コードごとに集計情報レコードを出力
    const serviceTypeEntries = Array.from(serviceTypeGroups.entries());
    for (const [serviceTypeCode, group] of serviceTypeEntries) {
      // サービス実日数（訪問回数と同一の可能性）
      const serviceActualDays = group.records.reduce((sum: number, r) => sum + r.visitCount, 0) +
                                 group.bonuses.reduce((sum: number, b) => sum + b.visitCount, 0);

      // 単位数合計
      const totalUnits = group.records.reduce((sum: number, r) => sum + r.totalPoints, 0) +
                         group.bonuses.reduce((sum: number, b) => sum + b.totalPoints, 0);

      // 単位数単価（固定値1000、1単位=10円）
      const unitPrice = 1000;

      // 給付率の計算
      const copaymentRate = patientData.insuranceCard.copaymentRate 
        ? parseInt(patientData.insuranceCard.copaymentRate) 
        : 10;
      const benefitRate = 100 - copaymentRate;

      // 請求額と利用者負担額
      const totalAmount = totalUnits * 10; // 単位数 × 10円
      const claimAmount = Math.floor(totalAmount * benefitRate / 100);
      const userBurdenAmount = totalAmount - claimAmount;

      const fields = [
        '2', // レコード種別（固定値「2」）
        padLeft(this.getNextRecordNumber(), 9), // レコード番号
        '7131', // 交換情報識別番号（固定値「7131」）
        '10', // レコード種別コード（集計情報レコード）
        `${targetYear}${String(targetMonth).padStart(2, '0')}`, // サービス提供年月（YYYYMM）
        padRight(facility.facilityCode, 10), // 事業所番号（10桁）
        padLeft(patientData.insuranceCard.insurerNumber, 8), // 証記載保険者番号（8桁）
        padRight(patientData.insuranceCard.insuredNumber, 10), // 被保険者番号（10桁）
        padRight(serviceTypeCode, 2), // サービス種類コード（2桁）
        padLeft(serviceActualDays, 2), // サービス実日数
        '', // 計画単位数（データなしのため空欄）
        '', // 限度額管理対象単位数（データなしのため空欄）
        '', // 限度額管理対象外単位数（データなしのため空欄）
        '0', // 短期入所計画日数（訪問看護では0）
        '0', // 短期入所実日数（訪問看護では0）
        padLeft(totalUnits, 8), // 保険 単位数合計
        padLeft(unitPrice, 4), // 保険 単位数単価
        padLeft(claimAmount, 9), // 保険 請求額
        padLeft(userBurdenAmount, 8), // 保険 利用者負担額
        '0', // 公費1 単位数合計（簡易実装では0）
        '0', // 公費1 請求額（簡易実装では0）
        '0', // 公費1 本人負担額（簡易実装では0）
        '0', // 公費2 単位数合計（簡易実装では0）
        '0', // 公費2 請求額（簡易実装では0）
        '0', // 公費2 本人負担額（簡易実装では0）
        '0', // 公費3 単位数合計（簡易実装では0）
        '0', // 公費3 請求額（簡易実装では0）
        '0', // 公費3 本人負担額（簡易実装では0）
        '0', // 保険分の出来高医療費 単位数合計（訪問看護では0）
        '0', // 保険分の出来高医療費 請求額（訪問看護では0）
        '0', // 保険分の出来高医療費 出来高医療費利用者負担額（訪問看護では0）
        '0', // 公費1分の出来高医療費 単位数合計（訪問看護では0）
        '0', // 公費1分の出来高医療費 請求額（訪問看護では0）
        '0', // 公費1分の出来高医療費 出来高医療費本人負担額（訪問看護では0）
        '0', // 公費2分の出来高医療費 単位数合計（訪問看護では0）
        '0', // 公費2分の出来高医療費 請求額（訪問看護では0）
        '0', // 公費2分の出来高医療費 出来高医療費本人負担額（訪問看護では0）
        '0', // 公費3分の出来高医療費 単位数合計（訪問看護では0）
        '0', // 公費3分の出来高医療費 請求額（訪問看護では0）
        '0', // 公費3分の出来高医療費 出来高医療費本人負担額（訪問看護では0）
      ];

      this.lines.push(buildCsvLine(fields));
    }
  }

  /**
   * 4. エンドレコード（種別:3）
   */
  private addEndRecord(): void {
    const fields = [
      '3', // レコード種別（固定値「3」）
      padLeft(this.getNextRecordNumber(), 9), // レコード番号（最終番号）
      '', // ブランク（改行）
    ];

    this.lines.push(buildCsvLine(fields));
  }

  /**
   * データレコードの総件数を計算（7111 + 7131の全レコード）
   */
  private calculateDataRecordCount(data: CareInsuranceReceiptCsvData): number {
    // 7111レコード数: 法別番号ごとに1レコード
    const legalCategoryNumbers = new Set<string>();
    for (const patientData of data.patients) {
      const legalCategoryNumber = patientData.publicExpenses.length > 0
        ? patientData.publicExpenses[0].legalCategoryNumber
        : '0';
      legalCategoryNumbers.add(legalCategoryNumber);
    }
    const count7111 = legalCategoryNumbers.size;

    // 各利用者ごとに7131レコード数を計算
    let total7131Records = 0;
    for (const patientData of data.patients) {
      // 7131基本情報レコード: 1
      total7131Records += 1;

      // 7131明細情報レコード: 訪問記録数 + 加算数
      total7131Records += patientData.nursingRecords.length + patientData.bonusHistory.length;

      // 7131集計情報レコード: サービス種類コードの種類数
      const serviceTypeCodes = new Set([
        ...patientData.nursingRecords.map(r => r.serviceTypeCode),
        ...patientData.bonusHistory.map(b => b.serviceTypeCode),
      ]);
      total7131Records += serviceTypeCodes.size;
    }

    return count7111 + total7131Records; // 7111 + 全利用者の7131レコード
  }

  /**
   * 要介護状態区分コードの変換
   */
  private convertCareLevelCode(careLevel: string | null): string {
    if (!careLevel) return '';
    
    const mapping: Record<string, string> = {
      'support1': '11', // 要支援1
      'support2': '12', // 要支援2(経過的要介護含む)
      'care1': '21',    // 要介護1
      'care2': '22',    // 要介護2
      'care3': '23',    // 要介護3
      'care4': '24',    // 要介護4
      'care5': '25',    // 要介護5
    };

    return mapping[careLevel] || '';
  }
}

