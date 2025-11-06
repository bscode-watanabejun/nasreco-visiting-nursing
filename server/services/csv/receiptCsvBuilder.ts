/**
 * 医療保険レセプトCSVビルダーサービス
 *
 * 厚生労働省が定める電子レセプトフォーマットに準拠したCSVファイルを生成
 */

import {
  padRight,
  padLeft,
  formatNumber,
  formatDate,
  formatJapaneseDate,
  normalizeKana,
  buildCsvLine,
  buildCsvFile,
  SequenceNumberGenerator,
  RecordType,
} from './csvUtils';
import type { ReceiptCsvData } from './types';
import { determineReceiptTypeCode, determineBurdenClassificationCode, determineInstructionTypeCode } from './receiptClassification';

/**
 * レセプトCSVを生成
 */
export class ReceiptCsvBuilder {
  private sequenceGen: SequenceNumberGenerator;
  private lines: string[];

  constructor() {
    this.sequenceGen = new SequenceNumberGenerator();
    this.lines = [];
  }

  /**
   * CSVファイル全体を生成
   */
  public async build(data: ReceiptCsvData): Promise<Buffer> {
    this.sequenceGen.reset();
    this.lines = [];

    // 1. レセプト共通レコード (RE)
    this.addRERecord(data);

    // 2. 保険者レコード (KO)
    this.addKORecord(data);

    // 3. 保険医療機関レコード (HO)
    this.addHORecord(data);

    // 4. 傷病名レコード (SY)
    this.addSYRecord(data);

    // 5. 診療行為レコード (SI) - 訪問記録ごと
    for (const record of data.nursingRecords) {
      this.addSIRecord(data, record);
    }

    // 6. 合計レコード (GO)
    this.addGORecord(data);

    // Shift_JISエンコードして返す
    return buildCsvFile(this.lines);
  }

  /**
   * 1. レセプト共通レコード (RE)
   */
  private addRERecord(data: ReceiptCsvData): void {
    // Phase 3: レセプト種別コードと負担区分を動的判定
    const receiptTypeCode = determineReceiptTypeCode(
      data.patient,
      data.insuranceCard,
      data.publicExpenses
    );

    const burdenClassificationCode = determineBurdenClassificationCode(
      data.patient,
      data.insuranceCard,
      data.publicExpenses
    );

    // レセプト種別: 保険種別(1桁) + 本人家族(1桁) + レセプト種別(2桁)
    // 例: 1111 = 医保(1) + 本人(1) + 単独(11)
    const fullReceiptType = `${data.receipt.insuranceType === 'medical' ? '1' : '2'}${burdenClassificationCode}${receiptTypeCode}`;

    // 一部負担金の計算（負担区分により異なる）
    // TODO: 正確な負担割合は別途マスタ管理が必要
    let burdenAmount = 0;
    if (burdenClassificationCode === '0') {
      // 本人: 3割負担（一般的なケース）
      burdenAmount = Math.floor(data.receipt.totalAmount * 0.3);
    } else if (burdenClassificationCode === '2') {
      // 家族: 3割負担
      burdenAmount = Math.floor(data.receipt.totalAmount * 0.3);
    } else {
      // 公費あり: 負担軽減あり（簡易計算）
      burdenAmount = Math.floor(data.receipt.totalAmount * 0.1);
    }

    const fields = [
      RecordType.RE,                                            // レコード識別
      formatNumber(this.sequenceGen.next(), 5),                 // レコード番号
      padRight(data.patient.insuranceNumber, 8),                // 保険者番号（8桁）
      padLeft(fullReceiptType, 4),                              // レセプト種別（4桁）- Phase 3: 動的判定
      padRight(normalizeKana(data.patient.kanaName), 25),      // 患者カナ氏名（全角25文字）
      padRight(`${data.patient.lastName} ${data.patient.firstName}`, 40), // 患者氏名（全角40文字）
      formatJapaneseDate(data.patient.dateOfBirth),             // 生年月日（和暦 gYYMMDD）
      data.patient.gender === 'male' ? '1' : '2',              // 性別（1=男, 2=女）
      formatNumber(data.receipt.targetYear, 4),                 // 診療年
      formatNumber(data.receipt.targetMonth, 2),                // 診療月
      formatNumber(data.receipt.totalPoints, 8),                // 合計点数
      formatNumber(burdenAmount, 7),                            // 一部負担金 - Phase 3: 負担区分により計算
    ];

    this.lines.push(buildCsvLine(fields));
  }

  /**
   * 2. 保険者レコード (KO)
   */
  private addKORecord(data: ReceiptCsvData): void {
    const fields = [
      RecordType.KO,                                            // レコード識別
      formatNumber(this.sequenceGen.next(), 5),                 // レコード番号
      padRight(data.patient.insuranceNumber, 8),                // 保険者番号
      padRight(data.patient.patientNumber, 40),                 // 被保険者証番号
    ];

    this.lines.push(buildCsvLine(fields));
  }

  /**
   * 3. 保険医療機関レコード (HO)
   */
  private addHORecord(data: ReceiptCsvData): void {
    const fields = [
      RecordType.HO,                                            // レコード識別
      formatNumber(this.sequenceGen.next(), 5),                 // レコード番号
      padLeft(data.facility.facilityCode, 7),                   // 医療機関コード（7桁）
      padLeft(data.facility.prefectureCode, 2),                 // 都道府県コード（2桁）
      padRight(data.facility.name, 40),                         // 医療機関名称（40文字）
      padRight(normalizeKana(data.facility.name), 25),         // 医療機関カナ名称（25文字）
    ];

    this.lines.push(buildCsvLine(fields));
  }

  /**
   * 4. 傷病名レコード (SY)
   */
  private addSYRecord(data: ReceiptCsvData): void {
    const fields = [
      RecordType.SY,                                            // レコード識別
      formatNumber(this.sequenceGen.next(), 5),                 // レコード番号
      padLeft(data.doctorOrder.icd10Code || '', 7),            // 傷病名コード（ICD-10, 7桁）
      padRight(data.doctorOrder.diagnosis, 80),                 // 傷病名（80文字）
      formatDate(data.doctorOrder.startDate),                   // 発症日（YYYYMMDD）
      '1',                                                      // 転帰区分（1=継続）
    ];

    this.lines.push(buildCsvLine(fields));
  }

  /**
   * 5. 診療行為レコード (SI)
   */
  private addSIRecord(data: ReceiptCsvData, record: ReceiptCsvData['nursingRecords'][0]): void {
    const fields = [
      RecordType.SI,                                            // レコード識別
      formatNumber(this.sequenceGen.next(), 5),                 // レコード番号
      formatDate(record.visitDate),                             // 実施日（YYYYMMDD）
      padLeft(record.serviceCode, 9),                           // 診療行為コード（9桁）
      formatNumber(1, 3),                                       // 回数
      formatNumber(record.calculatedPoints, 7),                 // 点数
      padLeft(record.visitLocationCode, 2),                     // 訪問場所コード（2桁）
      padLeft(record.staffQualificationCode, 2),                // 職員資格コード（2桁）
    ];

    this.lines.push(buildCsvLine(fields));

    // 加算レコードも追加
    for (const bonus of record.appliedBonuses) {
      const bonusFields = [
        RecordType.SI,                                          // レコード識別
        formatNumber(this.sequenceGen.next(), 5),               // レコード番号
        formatDate(record.visitDate),                           // 実施日
        padLeft(bonus.bonusCode, 9),                            // 加算コード
        formatNumber(1, 3),                                     // 回数
        formatNumber(bonus.points, 7),                          // 点数
        padRight('', 2),                                        // 訪問場所（空白）
        padRight('', 2),                                        // 職員資格（空白）
      ];

      this.lines.push(buildCsvLine(bonusFields));
    }
  }

  /**
   * 6. 合計レコード (GO)
   */
  private addGORecord(data: ReceiptCsvData): void {
    const fields = [
      RecordType.GO,                                            // レコード識別
      formatNumber(this.sequenceGen.next(), 5),                 // レコード番号
      formatNumber(this.sequenceGen.getCurrent(), 6),           // 総レコード数
      formatNumber(data.receipt.totalPoints, 8),                // 合計点数
      formatNumber(data.receipt.totalAmount, 9),                // 合計金額
    ];

    this.lines.push(buildCsvLine(fields));
  }
}

/**
 * レセプトCSVを生成する便利関数
 */
export async function generateReceiptCsv(data: ReceiptCsvData): Promise<Buffer> {
  const builder = new ReceiptCsvBuilder();
  return builder.build(data);
}
