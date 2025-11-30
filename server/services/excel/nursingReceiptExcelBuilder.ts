/**
 * 訪問看護療養費明細書Excel出力ビルダー
 * 
 * 医療保険レセプトCSV出力とは別に、訪問看護療養費明細書Excel帳票フォーマットへの出力機能を提供
 */

import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import type { ReceiptCsvData } from '../csv/types';
import { formatJapaneseDateWithEraName, formatBenefitRatio } from './japaneseDateUtils';
import { calculateVisitDateSymbols } from './visitDateSymbolCalculator';
import { getReceiptSpecialNoteNames, getWorkRelatedReasonName, getVisitLocationName } from './codeMasterUtils';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 訪問看護療養費明細書Excelビルダー
 */
export class NursingReceiptExcelBuilder {
  /**
   * Excelファイルを生成
   */
  public async build(data: ReceiptCsvData): Promise<Buffer> {
    // テンプレートファイルのパスを取得
    // 開発環境: server/services/excel/ から server/templates/
    // 本番環境: dist/services/excel/ から dist/templates/
    const templatePath = process.env.NODE_ENV === 'production'
      ? path.join(__dirname, '../templates/訪問看護療養費明細書フォーマット.xlsx')
      : path.join(__dirname, '../../templates/訪問看護療養費明細書フォーマット.xlsx');

    // テンプレートファイルの存在確認
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Excel帳票フォーマットファイルが見つかりません: ${templatePath}`);
    }

    // テンプレートを読み込み
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);

    // 最初のワークシートを取得（シート名は要確認）
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new Error('ワークシートが見つかりません');
    }

    // 各セルにデータを出力
    await this.fillHeaderCells(sheet, data);
    await this.fillInsuranceCells(sheet, data);
    await this.fillPublicExpenseCells(sheet, data);
    await this.fillSpecialNoteCells(sheet, data);
    await this.fillMedicalInstitutionCells(sheet, data);
    await this.fillPatientCells(sheet, data);
    await this.fillVisitDateSymbols(sheet, data);

    // Excelファイルをバッファに変換
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * ヘッダーセル（2行目）への出力
   */
  private async fillHeaderCells(sheet: ExcelJS.Worksheet, data: ReceiptCsvData): Promise<void> {
    const year = data.receipt.targetYear;
    const month = data.receipt.targetMonth;

    // I2: 請求年月の年
    sheet.getCell('I2').value = year;

    // L2: 請求年月の月
    sheet.getCell('L2').value = month;

    // Q2: HMレコードの都道府県コード
    sheet.getCell('Q2').value = data.facility.prefectureCode || '';

    // U2: HMレコードの訪問看護ステーションコード
    sheet.getCell('U2').value = data.facility.facilityCode || '';

    // AE2, AH2, AK2: 不明（後で確認）
    // 現時点では空欄のまま
  }

  /**
   * 保険者情報セル（7-8行目）への出力
   */
  private async fillInsuranceCells(sheet: ExcelJS.Worksheet, data: ReceiptCsvData): Promise<void> {
    // C7: HOレコードの保険者番号
    sheet.getCell('C7').value = data.insuranceCard.insurerNumber || '';

    // F7: HOレコードの被保険者証記号または番号
    // 記号があれば記号、なければ番号を出力
    const certificateSymbolOrNumber = data.insuranceCard.certificateSymbol || data.insuranceCard.certificateNumber || '';
    sheet.getCell('F7').value = certificateSymbolOrNumber;

    // G8: SNレコードの枝番（保険者分のSNレコードの枝番、通常は"01"）
    sheet.getCell('G8').value = '01';

    // I7: HOレコードの実日数
    const actualDays = new Set(
      data.nursingRecords.map(r => {
        const visitDate = typeof r.visitDate === 'string' ? new Date(r.visitDate) : r.visitDate;
        return visitDate.toISOString().split('T')[0];
      })
    ).size;
    sheet.getCell('I7').value = actualDays;

    // K7: HOレコードの合計金額
    sheet.getCell('K7').value = data.receipt.totalAmount || 0;

    // U7: 第1公費のKOレコードの一部負担金額（カッコ付き）
    if (data.publicExpenses.length > 0) {
      const firstPublicExpense = data.publicExpenses[0];
      const burdenInfo = data.receipt.publicExpenseBurdenInfo?.[firstPublicExpense.id];
      if (burdenInfo?.partialBurdenAmount) {
        sheet.getCell('U7').value = `(${burdenInfo.partialBurdenAmount})`;
      }
    }

    // U8: HOレコードの一部負担金額（減免情報含む）
    const partialBurdenAmount = data.receipt.partialBurdenAmount;
    if (partialBurdenAmount !== null && partialBurdenAmount !== undefined) {
      let displayValue: string | number = partialBurdenAmount;
      
      // 減免情報がある場合の表示
      const reductionCategory = data.receipt.reductionCategory;
      if (reductionCategory === '1') {
        // 減額
        const reductionRate = data.receipt.reductionRate;
        const reductionAmount = data.receipt.reductionAmount;
        
        if (reductionRate !== null && reductionRate !== undefined) {
          // 減額割合（例: 030 → 3割）
          const rateStr = String(reductionRate).padStart(3, '0');
          const rate = parseInt(rateStr, 10) / 10;
          displayValue = `減額\n${rate}割`;
        } else if (reductionAmount !== null && reductionAmount !== undefined) {
          // 減額金額
          displayValue = `減額\n${reductionAmount}円`;
        }
      } else if (reductionCategory === '2') {
        // 免除
        displayValue = '免除';
      } else if (reductionCategory === '3') {
        // 支払猶予
        displayValue = '猶予';
      }
      
      sheet.getCell('U8').value = displayValue;
    }
  }

  /**
   * 公費情報セル（9-12行目）への出力
   */
  private async fillPublicExpenseCells(sheet: ExcelJS.Worksheet, data: ReceiptCsvData): Promise<void> {
    // 最大4つの公費まで対応
    const maxPublicExpenses = Math.min(data.publicExpenses.length, 4);
    
    for (let i = 0; i < maxPublicExpenses; i++) {
      const publicExpense = data.publicExpenses[i];
      const row = 9 + i; // C9, F9, I9, K9, U9 など
      
      // 公費の実日数を計算（公費IDでフィルタ）
      const filteredRecords = data.nursingRecords.filter(r => r.publicExpenseId === publicExpense.id);
      const publicExpenseDays = new Set(
        filteredRecords.map(r => {
          const visitDate = typeof r.visitDate === 'string' ? new Date(r.visitDate) : r.visitDate;
          return visitDate.toISOString().split('T')[0];
        })
      ).size;
      
      // 公費の合計金額を計算
      const publicExpenseAmount = filteredRecords.reduce(
        (sum, r) => sum + (r.calculatedPoints || 0) * 10,
        0
      );
      
      // 一部負担情報を取得
      const burdenInfo = data.receipt.publicExpenseBurdenInfo?.[publicExpense.id];
      
      // C9-C12: 負担者番号
      sheet.getCell(`C${row}`).value = publicExpense.beneficiaryNumber || '';
      
      // F9-F12: 受給者番号
      sheet.getCell(`F${row}`).value = publicExpense.recipientNumber || '';
      
      // I9-I12: 実日数
      sheet.getCell(`I${row}`).value = publicExpenseDays;
      
      // K9-K12: 合計金額
      sheet.getCell(`K${row}`).value = publicExpenseAmount;
      
      // U9-U12: 一部負担金額
      if (burdenInfo?.partialBurdenAmount) {
        sheet.getCell(`U${row}`).value = burdenInfo.partialBurdenAmount;
      }
    }
  }

  /**
   * 特記事項セル（14行目）への出力
   */
  private async fillSpecialNoteCells(sheet: ExcelJS.Worksheet, data: ReceiptCsvData): Promise<void> {
    // A14: REレコードのレセプト特記（別表6参照）
    // CSVビルダーでは空欄だが、Excel出力時にはコードがあれば名称を表示
    // 現時点ではREレコードにレセプト特記フィールドがないため、空欄のまま
    // 将来の拡張: レセプト特記コードが追加された場合、getReceiptSpecialNoteNames()を使用
    
    // F14: HOレコードの職務上の事由（別表8参照）
    // CSVビルダーでは空欄だが、Excel出力時にはコードがあれば名称を表示
    // 現時点ではHOレコードに職務上の事由フィールドがないため、空欄のまま
    // 将来の拡張: 職務上の事由コードが追加された場合、getWorkRelatedReasonName()を使用
    
    // K14: REレコードの給付割合（変換後）
    if (data.receipt.benefitRatio) {
      const formattedRatio = formatBenefitRatio(data.receipt.benefitRatio);
      sheet.getCell('K14').value = formattedRatio;
    }
    
    // K16: REレコードの一部負担金区分（1→低2、3→低1）
    const partialBurdenCategory = data.insuranceCard.partialBurdenCategory;
    if (partialBurdenCategory === '1') {
      sheet.getCell('K16').value = '低２';
    } else if (partialBurdenCategory === '3') {
      sheet.getCell('K16').value = '低１';
    }
  }

  /**
   * 医療機関情報セル（5, 9, 12, 14, 16行目）への出力
   */
  private async fillMedicalInstitutionCells(sheet: ExcelJS.Worksheet, data: ReceiptCsvData): Promise<void> {
    // AD5: 施設管理の住所 + HMレコードの訪問看護ステーション名称 + 電話番号（改行区切り）
    const facilityInfo = [
      data.facility.address || '',
      data.facility.name || '',
      data.facility.phone || ''
    ].filter(Boolean).join('\n');
    sheet.getCell('AD5').value = facilityInfo;

    // AD9: IHレコードの医療機関名称
    sheet.getCell('AD9').value = data.medicalInstitution.name || '';

    // AD12: IHレコードの医療機関都道府県
    sheet.getCell('AD12').value = data.medicalInstitution.prefectureCode || '';

    // AF12: IHレコードの医療機関点数表
    sheet.getCell('AF12').value = '6'; // 6=訪問看護

    // AH12: IHレコードの医療機関コード
    sheet.getCell('AH12').value = data.medicalInstitution.institutionCode || '';

    // AC14: IHレコードの主治医氏名
    sheet.getCell('AC14').value = data.medicalInstitution.doctorName || '';

    // AF16: IHレコードの主治医への直近報告年月日（和暦変換）
    if (data.medicalInstitution.lastReportDate) {
      const lastReportDate = formatJapaneseDateWithEraName(data.medicalInstitution.lastReportDate);
      sheet.getCell('AF16').value = lastReportDate;
    }
  }

  /**
   * 患者情報セル（18-22行目）への出力
   */
  private async fillPatientCells(sheet: ExcelJS.Worksheet, data: ReceiptCsvData): Promise<void> {
    // B18: REレコードの氏名(カナ)
    sheet.getCell('B18').value = data.patient.kanaName || '';

    // B19: REレコードの氏名(漢字)
    const kanjiName = `${data.patient.lastName || ''} ${data.patient.firstName || ''}`.trim();
    sheet.getCell('B19').value = kanjiName;

    // I20: REレコードの男女区分（1→「1 男」、2→「2 女」）
    const gender = data.patient.gender === 'male' ? '1 男' : '2 女';
    sheet.getCell('I20').value = gender;

    // K20: REレコードの生年月日（和暦変換、元号名含む）
    if (data.patient.dateOfBirth) {
      const birthDate = formatJapaneseDateWithEraName(data.patient.dateOfBirth);
      sheet.getCell('K20').value = birthDate;
    }

    // S18: RJレコードの訪問した場所1コード（別表16参照、99の場合は2行目に文字データ）
    // 最初の訪問記録の訪問場所コードを使用（訪問日でソート）
    if (data.nursingRecords.length > 0) {
      // 訪問記録を訪問日でソート
      const sortedRecords = [...data.nursingRecords].sort((a, b) => {
        const dateA = typeof a.visitDate === 'string' ? new Date(a.visitDate) : a.visitDate;
        const dateB = typeof b.visitDate === 'string' ? new Date(b.visitDate) : b.visitDate;
        return dateA.getTime() - dateB.getTime();
      });
      
      const firstRecord = sortedRecords[0];
      const locationCode = firstRecord.visitLocationCode || '';
      
      if (locationCode === '99') {
        // 場所コード99の場合は、コード名称を1行目、文字データを2行目に表示
        const locationName = await getVisitLocationName(locationCode);
        sheet.getCell('S18').value = locationName;
        if (firstRecord.visitLocationCustom) {
          sheet.getCell('S19').value = firstRecord.visitLocationCustom;
        }
      } else {
        const locationName = await getVisitLocationName(locationCode);
        sheet.getCell('S18').value = locationName;
      }
    }

    // B22: 情報欄（Phase 1実装: エ、オ、ウ、コのみ）
    const infoField = await this.buildInfoField(data);
    sheet.getCell('B22').value = infoField;
  }

  /**
   * 情報欄(B22セル)の内容を構築
   * 
   * Phase 1実装: 以下の項目のみ実装
   * - エ: 訪問開始年月日・訪問終了年月日・訪問終了時刻・訪問終了の状況
   * - オ: 死亡年月日・死亡時刻・死亡した場所
   * - ウ: 指示期間
   * - コ: 訪問した場所２・３
   * 
   * Phase 2以降（将来実装予定）:
   * - ア: 主たる傷病名（修飾語コード・補足コメントフィールド追加後）
   * - イ: 心身の状態（JSレコード拡張フィールド追加後）
   * - カ: 情報提供先（TJレコード実装後）
   * - キ: 特記事項（TZレコード実装後）
   * - ク: 専門の研修（KSレコード実装後）
   * - ケ: 他の訪問看護ステーション（RJレコード拡張後）
   * - サ: その他（COレコード実装後）
   */
  private async buildInfoField(data: ReceiptCsvData): Promise<string> {
    const sections: string[] = [];

    // ========== Phase 1実装: エ 訪問開始年月日・訪問終了年月日・訪問終了時刻・訪問終了の状況 ==========
    if (data.nursingRecords.length > 0) {
      // 訪問記録を訪問日でソート
      const sortedRecords = [...data.nursingRecords].sort((a, b) => {
        const dateA = typeof a.visitDate === 'string' ? new Date(a.visitDate) : a.visitDate;
        const dateB = typeof b.visitDate === 'string' ? new Date(b.visitDate) : b.visitDate;
        return dateA.getTime() - dateB.getTime();
      });

      // 訪問開始年月日（最初の訪問記録の日付）
      const firstRecord = sortedRecords[0];
      if (firstRecord.visitDate) {
        const startDate = this.formatDateForInfoField(firstRecord.visitDate);
        sections.push('<訪問開始年月日>');
        sections.push(startDate);
      }

      // 訪問終了年月日・訪問終了時刻・訪問終了の状況
      const serviceEndRecord = sortedRecords.find(r => r.isServiceEnd);
      if (serviceEndRecord) {
        // 訪問終了年月日
        if (serviceEndRecord.visitDate) {
          const endDate = this.formatDateForInfoField(serviceEndRecord.visitDate);
          sections.push('<訪問終了年月日>');
          sections.push(endDate);
        }

        // 訪問終了時刻
        if (serviceEndRecord.actualEndTime) {
          const endTime = this.formatTimeForInfoField(serviceEndRecord.actualEndTime);
          sections.push('<訪問終了時刻>');
          sections.push(endTime);
        }

        // 訪問終了の状況
        if (serviceEndRecord.serviceEndReasonCode) {
          const reasonText = await this.getServiceEndReasonText(serviceEndRecord.serviceEndReasonCode, serviceEndRecord.serviceEndReasonText);
          sections.push('<訪問終了の状況>');
          sections.push(reasonText);
        }
      }
    }

    // ========== Phase 1実装: オ 死亡年月日・死亡時刻・死亡した場所 ==========
    if (data.patient.deathDate) {
      // 死亡年月日
      const deathDate = this.formatDateForInfoField(data.patient.deathDate);
      sections.push('<死亡年月日>');
      sections.push(deathDate);

      // 死亡時刻
      if (data.patient.deathTime) {
        const deathTime = this.formatTimeForInfoField(data.patient.deathTime);
        sections.push('<死亡時刻>');
        sections.push(deathTime);
      }

      // 死亡した場所
      if (data.patient.deathPlaceCode) {
        const deathPlaceText = await this.getDeathPlaceText(data.patient.deathPlaceCode, data.patient.deathPlaceText);
        sections.push('<死亡した場所>');
        sections.push(deathPlaceText);
      }
    }

    // ========== Phase 1実装: ウ 指示期間 ==========
    if (data.doctorOrder.startDate && data.doctorOrder.endDate) {
      const instructionTypeTitle = this.getInstructionTypeTitle(data.doctorOrder.instructionType);
      const startDate = this.formatDateForInfoField(data.doctorOrder.startDate);
      const endDate = this.formatDateForInfoField(data.doctorOrder.endDate);
      
      sections.push(instructionTypeTitle);
      sections.push(`${startDate}　～　${endDate}`);
    }

    // ========== Phase 1実装: コ 訪問した場所２・３ ==========
    if (data.nursingRecords.length > 0) {
      const locationChanges = this.detectVisitLocationChanges(data.nursingRecords);
      
      // 訪問した場所２
      if (locationChanges[0]) {
        const location2 = locationChanges[0];
        const changeDate = this.formatDateForInfoField(location2.changeDate);
        const locationName = await this.getVisitLocation2Or3Text(location2.locationCode, location2.locationCustom);
        
        sections.push('<訪問した場所２>');
        sections.push(`訪問場所変更年月日；${changeDate}`);
        sections.push(locationName);
      }

      // 訪問した場所３
      if (locationChanges[1]) {
        const location3 = locationChanges[1];
        const changeDate = this.formatDateForInfoField(location3.changeDate);
        const locationName = await this.getVisitLocation2Or3Text(location3.locationCode, location3.locationCustom);
        
        sections.push('<訪問した場所３>');
        sections.push(`訪問場所変更年月日；${changeDate}`);
        sections.push(locationName);
      }
    }

    // ========== Phase 2以降（将来実装予定） ==========
    // ア: 主たる傷病名
    // イ: 心身の状態
    // カ: 情報提供先
    // キ: 特記事項
    // ク: 専門の研修
    // ケ: 他の訪問看護ステーション
    // サ: その他

    // 各セクションを改行で区切って結合
    return sections.join('\n');
  }

  /**
   * 日付を情報欄用の和暦形式に変換
   * 形式: 「令和　６年　６月　１日」
   */
  private formatDateForInfoField(date: Date | string): string {
    if (!date) return '';
    
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '';

    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();

    let eraName: string;
    let eraYear: number;

    if (year >= 2019 && (year > 2019 || d.getMonth() >= 4)) {
      eraName = '令和';
      eraYear = year - 2018;
    } else if (year >= 1989) {
      eraName = '平成';
      eraYear = year - 1988;
    } else if (year >= 1926) {
      eraName = '昭和';
      eraYear = year - 1925;
    } else if (year >= 1912) {
      eraName = '大正';
      eraYear = year - 1911;
    } else if (year >= 1868) {
      eraName = '明治';
      eraYear = year - 1867;
    } else {
      return '';
    }

    // 全角数字に変換
    const eraYearStr = this.toFullWidthNumber(eraYear);
    const monthStr = this.toFullWidthNumber(month);
    const dayStr = this.toFullWidthNumber(day);

    return `${eraName}　${eraYearStr}年　${monthStr}月　${dayStr}日`;
  }

  /**
   * 時刻を情報欄用の形式に変換
   * 入力形式: "HH:MM" または "HHMM"
   * 出力形式: 「１５時　５分」
   */
  private formatTimeForInfoField(time: string): string {
    if (!time) return '';

    // HH:MM形式をHHMM形式に変換
    const timeStr = time.replace(':', '');
    if (timeStr.length < 4) return '';

    const hour = parseInt(timeStr.substring(0, 2), 10);
    const minute = parseInt(timeStr.substring(2, 4), 10);

    if (isNaN(hour) || isNaN(minute)) return '';

    const hourStr = this.toFullWidthNumber(hour);
    const minuteStr = this.toFullWidthNumber(minute);

    return `${hourStr}時　${minuteStr}分`;
  }

  /**
   * 数字を全角に変換
   */
  private toFullWidthNumber(num: number): string {
    const fullWidthMap: { [key: string]: string } = {
      '0': '０', '1': '１', '2': '２', '3': '３', '4': '４',
      '5': '５', '6': '６', '7': '７', '8': '８', '9': '９'
    };

    return String(num).split('').map(char => fullWidthMap[char] || char).join('');
  }

  /**
   * 指示区分コードからタイトル行を取得
   */
  private getInstructionTypeTitle(instructionType: string | undefined): string {
    if (!instructionType) return '<指示期間>';

    const typeMap: { [key: string]: string } = {
      'regular': '<指示期間>',
      'special': '<特別指示期間>',
      'psychiatric': '<精神指示期間>',
      'psychiatric_special': '<精神特別指示期間>',
      'medical_observation': '<医療観察精神指示期間>',
      'medical_observation_special': '<医療観察精神特別指示期間>'
    };

    return typeMap[instructionType] || '<指示期間>';
  }

  /**
   * 訪問終了の状況コードから表示テキストを取得（別表15）
   */
  private async getServiceEndReasonText(code: string, customText: string | null | undefined): Promise<string> {
    const reasonMap: { [key: string]: string } = {
      '01': '１　軽快',
      '02': '２　施設',
      '03': '３　医療機関',
      '04': '４　死亡',
      '99': '５　その他'
    };

    const baseText = reasonMap[code] || '';
    
    // コード99（その他）の場合は、セミコロンに続けて文字データを表示
    if (code === '99' && customText) {
      return `${baseText}；${customText}`;
    }

    return baseText;
  }

  /**
   * 死亡場所コードから表示テキストを取得（別表16）
   */
  private async getDeathPlaceText(code: string, customText: string | null | undefined): Promise<string> {
    const locationName = await getVisitLocationName(code);
    
    if (!locationName) {
      return '';
    }

    // コード99（その他）の場合は、セミコロンに続けて文字データを表示
    if (code === '99' && customText) {
      return `５　その他；${customText}`;
    }

    // 場所コードから番号を取得（01→1、11→2、12→3...）
    const codeToNumber: { [key: string]: string } = {
      '01': '１',
      '11': '２',
      '12': '３',
      '13': '４',
      '14': '５',
      '15': '６',
      '16': '７',
      '31': '８',
      '32': '９',
      '99': '５' // その他は常に5
    };

    const number = codeToNumber[code] || '';
    return `${number}　${locationName}`;
  }

  /**
   * 訪問した場所２・３の表示テキストを取得（別表16）
   */
  private async getVisitLocation2Or3Text(code: string, customText: string | null | undefined): Promise<string> {
    const locationName = await getVisitLocationName(code);
    
    if (!locationName) {
      return '';
    }

    // コード99（その他）の場合は、セミコロンに続けて文字データを表示
    if (code === '99' && customText) {
      return `５　その他；${customText}`;
    }

    // 場所コードから番号を取得
    const codeToNumber: { [key: string]: string } = {
      '01': '１',
      '11': '２',
      '12': '３',
      '13': '４',
      '14': '５',
      '15': '６',
      '16': '７',
      '31': '８',
      '32': '９'
    };

    const number = codeToNumber[code] || '';
    return `${number}　${locationName}`;
  }

  /**
   * 訪問場所変更履歴を検出（CSVビルダーと同じロジック）
   */
  private detectVisitLocationChanges(records: ReceiptCsvData['nursingRecords']): Array<{
    changeDate: Date | string;
    locationCode: string;
    locationCustom?: string | null;
  }> {
    if (records.length === 0) return [];

    // 訪問記録を訪問日でソート
    const sortedRecords = [...records].sort((a, b) => {
      const dateA = typeof a.visitDate === 'string' ? new Date(a.visitDate) : a.visitDate;
      const dateB = typeof b.visitDate === 'string' ? new Date(b.visitDate) : b.visitDate;
      return dateA.getTime() - dateB.getTime();
    });

    const changes: Array<{
      changeDate: Date | string;
      locationCode: string;
      locationCustom?: string | null;
    }> = [];

    let previousLocationCode = sortedRecords[0]?.visitLocationCode || '';

    for (let i = 1; i < sortedRecords.length; i++) {
      const currentRecord = sortedRecords[i];
      const currentLocationCode = currentRecord.visitLocationCode || '';

      // 場所コードが変更された場合
      if (currentLocationCode !== previousLocationCode && currentLocationCode) {
        changes.push({
          changeDate: currentRecord.visitDate,
          locationCode: currentLocationCode,
          locationCustom: currentRecord.visitLocationCustom
        });

        // 最大2件まで
        if (changes.length >= 2) break;

        previousLocationCode = currentLocationCode;
      }
    }

    return changes;
  }

  /**
   * 訪問日の記号表示（22-38行目）への出力
   */
  private async fillVisitDateSymbols(sheet: ExcelJS.Worksheet, data: ReceiptCsvData): Promise<void> {
    // 訪問日の記号を計算
    const symbolMap = await calculateVisitDateSymbols(data);

    // セル配置マッピング（日付 → セル）
    const dateToCellMap: { [day: number]: string } = {
      1: 'S22', 2: 'V22', 3: 'Y22', 4: 'AB22', 5: 'AE22', 6: 'AH22', 7: 'AK22',
      8: 'S26', 9: 'V26', 10: 'Y26', 11: 'AB26', 12: 'AE26', 13: 'AH26', 14: 'AK26',
      15: 'S30', 16: 'V30', 17: 'Y30', 18: 'AB30', 19: 'AE30', 20: 'AH30', 21: 'AK30',
      22: 'S34', 23: 'V34', 24: 'Y34', 25: 'AB34', 26: 'AE34', 27: 'AH34', 28: 'AK34',
      29: 'S38', 30: 'V38', 31: 'Y38',
    };

    // 各日付の記号をセルに出力
    for (const [dateStr, symbols] of Array.from(symbolMap.entries())) {
      // YYYYMMDD形式から日付を抽出
      const day = parseInt(dateStr.substring(6, 8), 10);
      
      if (day >= 1 && day <= 31) {
        const cellAddress = dateToCellMap[day];
        if (cellAddress) {
          // 記号を結合して出力（例: "○☆"）
          sheet.getCell(cellAddress).value = symbols.join('');
        }
      }
    }
  }
}

