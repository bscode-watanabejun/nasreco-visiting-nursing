/**
 * 領収書・請求書Excel出力ビルダー
 * 
 * レセプト詳細画面から領収書・請求書のExcel帳票を生成する機能を提供
 */

import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import type { ReceiptCsvData } from '../csv/types';
import { formatJapaneseYearMonth, formatJapaneseDateForInvoice } from './japaneseDateUtils';
import { db } from '../../db';
import { visitingNursingMasterBasic, nursingServiceCodes } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { generateInvoiceNumber } from '../invoiceNumberService';

/**
 * テンプレートファイルのパスを取得
 * 本番環境ではprocess.cwd()を使用（esbuildでバンドル後も正しく動作）
 */
const getTemplatePath = (): string => {
  if (process.env.NODE_ENV === 'production') {
    // 本番環境: dist/index.jsから実行されるため、process.cwd()はプロジェクトルート
    // テンプレートファイルは dist/templates/ にコピーされている
    return path.join(process.cwd(), 'dist/templates/領収書請求書フォーマット.xlsx');
  } else {
    // 開発環境: server/services/excel/ から server/templates/
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    return path.join(__dirname, '../../templates/領収書請求書フォーマット.xlsx');
  }
};

/**
 * 領収書・請求書Excelビルダー
 */
export class InvoiceReceiptExcelBuilder {
  private type: 'invoice' | 'receipt'; // 'invoice' = 請求書, 'receipt' = 領収書
  private facilityId: string;
  private outputDate: Date;

  constructor(type: 'invoice' | 'receipt', facilityId: string, outputDate: Date = new Date()) {
    this.type = type;
    this.facilityId = facilityId;
    this.outputDate = outputDate;
  }

  /**
   * Excelファイルを生成
   */
  public async build(data: ReceiptCsvData): Promise<Buffer> {
    // テンプレートファイルのパスを取得
    const templatePath = getTemplatePath();

    // テンプレートファイルの存在確認
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Excel帳票フォーマットファイルが見つかりません: ${templatePath}`);
    }

    // テンプレートを読み込み
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);

    // 最初のワークシートを取得
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new Error('ワークシートが見つかりません');
    }

    // 各セルにデータを出力
    await this.fillHeaderCells(sheet, data);
    await this.fillPatientCells(sheet, data);
    await this.fillFacilityCells(sheet, data);
    await this.fillAmountCells(sheet, data);
    
    // 医療保険と介護保険で分岐
    if (data.receipt.insuranceType === 'medical') {
      await this.fillMedicalInsuranceCells(sheet, data);
    } else if (data.receipt.insuranceType === 'care') {
      await this.fillCareInsuranceCells(sheet, data);
    }

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

    // B2: 対象年月（和暦）
    const targetYearMonth = formatJapaneseYearMonth(year, month);
    sheet.getCell('B2').value = targetYearMonth;

    // L2: 「請求書」または「領収書」
    sheet.getCell('L2').value = this.type === 'invoice' ? '請求書' : '領収書';

    // U2: 出力年月日（和暦）
    const outputDateStr = formatJapaneseDateForInvoice(this.outputDate);
    sheet.getCell('U2').value = outputDateStr;

    // E4: 請求書No（10桁）
    const invoiceNumber = await generateInvoiceNumber(this.facilityId, this.outputDate);
    sheet.getCell('E4').value = invoiceNumber;
  }

  /**
   * 患者情報セル（E5-E7）への出力
   */
  private async fillPatientCells(sheet: ExcelJS.Worksheet, data: ReceiptCsvData): Promise<void> {
    // E5: 患者番号
    sheet.getCell('E5').value = data.patient.patientNumber || '';

    // E6: カナ氏名
    sheet.getCell('E6').value = data.patient.kanaName || '';

    // E7: 氏名（姓 + 名）
    const fullName = `${data.patient.lastName || ''}${data.patient.firstName || ''}`.trim();
    sheet.getCell('E7').value = fullName;
  }

  /**
   * 施設情報セル（N4）への出力
   */
  private async fillFacilityCells(sheet: ExcelJS.Worksheet, data: ReceiptCsvData): Promise<void> {
    // N4: 住所、施設名、電話番号（改行区切り）
    const facilityInfo = [
      data.facility.address || '',
      data.facility.name || '',
      data.facility.phone ? `TEL：${data.facility.phone}` : ''
    ].filter(Boolean).join('\n');
    sheet.getCell('N4').value = facilityInfo;
    sheet.getCell('N4').alignment = { vertical: 'top', wrapText: true };
  }

  /**
   * 金額セル（C9, E11, M11）への出力
   * 注意: E11とM11は負担額の合計を出力するため、後でfillMedicalInsuranceCellsまたはfillCareInsuranceCellsで更新される
   */
  private async fillAmountCells(sheet: ExcelJS.Worksheet, data: ReceiptCsvData): Promise<void> {
    // C9: 請求書/領収書の文言
    if (this.type === 'invoice') {
      sheet.getCell('C9').value = '下記の通り医療費及び介護費をご請求申し上げます';
    } else {
      sheet.getCell('C9').value = '下記の通り医療費及び介護費を領収いたしました';
    }

    // E11とM11は負担額の合計を出力するため、fillMedicalInsuranceCellsまたはfillCareInsuranceCellsで設定される
    // ここでは初期値として0を設定
    sheet.getCell('E11').value = 0;
    if (this.type === 'receipt') {
      sheet.getCell('M11').value = 0;
    } else {
      sheet.getCell('M11').value = 0;
    }
  }

  /**
   * 医療保険セルへの出力
   */
  private async fillMedicalInsuranceCells(sheet: ExcelJS.Worksheet, data: ReceiptCsvData): Promise<void> {
    // W13: 負担割合（'10' | '20' | '30' を '1割' | '2割' | '3割' に変換）
    const copaymentRate = data.insuranceCard.copaymentRate;
    if (copaymentRate) {
      const rate = parseInt(copaymentRate, 10) / 10;
      sheet.getCell('W13').value = `${rate}割`;
    }

    // サービス名、点数、回数、単価、負担額を集計
    const serviceRows = await this.buildServiceRows(data);

    // D18-D27: サービス名（10個まで）
    // Q18-Q27: 点数（10個まで）
    // S18-S27: 回数（10個まで）
    // U18-U27: 単価（10個まで）
    // W18-W27: 負担額（10個まで）
    const maxRows = Math.min(serviceRows.length, 10);
    for (let i = 0; i < maxRows; i++) {
      const row = serviceRows[i];
      const rowIndex = 18 + i;

      sheet.getCell(`D${rowIndex}`).value = row.serviceName;
      sheet.getCell(`Q${rowIndex}`).value = `${row.points}点`;
      sheet.getCell(`S${rowIndex}`).value = row.count;
      sheet.getCell(`U${rowIndex}`).value = row.unitPrice;
      sheet.getCell(`W${rowIndex}`).value = row.burdenAmount;
    }

    // U30: 点数の合計
    const totalPoints = serviceRows.reduce((sum, row) => sum + row.points, 0);
    sheet.getCell('U30').value = totalPoints;

    // U31: 負担額の合計
    const totalBurdenAmount = serviceRows.reduce((sum, row) => sum + row.burdenAmount, 0);
    sheet.getCell('U31').value = totalBurdenAmount;

    // U33: 負担額の合計（U31と同じ）
    sheet.getCell('U33').value = totalBurdenAmount;

    // E11: 負担額の合計（U33と同じ）
    sheet.getCell('E11').value = totalBurdenAmount;

    // M11: 領収書の場合は負担額の合計、請求書の場合は0
    if (this.type === 'receipt') {
      sheet.getCell('M11').value = totalBurdenAmount;
    } else {
      sheet.getCell('M11').value = 0;
    }
  }

  /**
   * 介護保険セルへの出力
   */
  private async fillCareInsuranceCells(sheet: ExcelJS.Worksheet, data: ReceiptCsvData): Promise<void> {
    // W35: 負担割合（'10' | '20' | '30' を '1割' | '2割' | '3割' に変換）
    const copaymentRate = data.insuranceCard.copaymentRate;
    if (copaymentRate) {
      const rate = parseInt(copaymentRate, 10) / 10;
      sheet.getCell('W35').value = `${rate}割`;
    }

    // サービス名、点数、回数、単価、負担額を集計
    const serviceRows = await this.buildServiceRows(data);

    // D38-D47: サービス名（10個まで）
    // Q38-Q47: 点数（10個まで）
    // S38-S47: 回数（10個まで）
    // U38-U47: 単価（10個まで）
    // W38-W47: 負担額（10個まで）
    const maxRows = Math.min(serviceRows.length, 10);
    for (let i = 0; i < maxRows; i++) {
      const row = serviceRows[i];
      const rowIndex = 38 + i;

      sheet.getCell(`D${rowIndex}`).value = row.serviceName;
      sheet.getCell(`Q${rowIndex}`).value = `${row.points}点`;
      sheet.getCell(`S${rowIndex}`).value = row.count;
      sheet.getCell(`U${rowIndex}`).value = row.unitPrice;
      sheet.getCell(`W${rowIndex}`).value = row.burdenAmount;
    }

    // U51: 負担額の合計
    const totalBurdenAmount = serviceRows.reduce((sum, row) => sum + row.burdenAmount, 0);
    sheet.getCell('U51').value = totalBurdenAmount;

    // U53: 負担額の合計（U51と同じ）
    sheet.getCell('U53').value = totalBurdenAmount;

    // E11: 負担額の合計（U53と同じ）
    sheet.getCell('E11').value = totalBurdenAmount;

    // M11: 領収書の場合は負担額の合計、請求書の場合は0
    if (this.type === 'receipt') {
      sheet.getCell('M11').value = totalBurdenAmount;
    } else {
      sheet.getCell('M11').value = 0;
    }
  }

  /**
   * サービス行を構築（医療保険・介護保険共通）
   * 訪問看護療養費明細書Excel出力の摘要欄の名称出力と同じ仕様
   */
  private async buildServiceRows(data: ReceiptCsvData): Promise<Array<{
    serviceName: string;
    points: number;
    count: number;
    unitPrice: number;
    burdenAmount: number;
  }>> {
    const serviceCodeMap = new Map<string, {
      serviceCode: string;
      points: number;
      count: number;
      unitPrice: number;
    }>();

    // 訪問記録から基本療養費を集計
    for (const record of data.nursingRecords) {
      if (record.serviceCode) {
        // サービスコードマスタから基本療養費の点数を取得
        const serviceCodeRecord = await db.query.nursingServiceCodes.findFirst({
          where: eq(nursingServiceCodes.serviceCode, record.serviceCode),
        });
        
        if (!serviceCodeRecord) {
          console.warn(`サービスコード ${record.serviceCode} が見つかりません。スキップします。`);
          continue;
        }
        
        const points = serviceCodeRecord.points;
        const unitPrice = points * 10; // 単価（点数 × 10円）
        const key = record.serviceCode;
        
        if (serviceCodeMap.has(key)) {
          const existing = serviceCodeMap.get(key)!;
          existing.points += points;
          existing.count += 1;
        } else {
          serviceCodeMap.set(key, {
            serviceCode: key,
            points,
            count: 1,
            unitPrice,
          });
        }
      }

      // 管理療養費を集計
      if (record.managementServiceCode) {
        const managementServiceCodeRecord = await db.query.nursingServiceCodes.findFirst({
          where: eq(nursingServiceCodes.serviceCode, record.managementServiceCode),
        });
        
        if (!managementServiceCodeRecord) {
          console.warn(`管理療養費サービスコード ${record.managementServiceCode} が見つかりません。スキップします。`);
          continue;
        }
        
        const points = managementServiceCodeRecord.points;
        const unitPrice = points * 10;
        const key = record.managementServiceCode;
        
        if (serviceCodeMap.has(key)) {
          const existing = serviceCodeMap.get(key)!;
          existing.points += points;
          existing.count += 1;
        } else {
          serviceCodeMap.set(key, {
            serviceCode: key,
            points,
            count: 1,
            unitPrice,
          });
        }
      }
    }

    // 加算履歴を集計
    for (const bonus of data.bonusHistory) {
      if (bonus.serviceCode) {
        const points = bonus.points;
        const unitPrice = points * 10;
        const key = bonus.serviceCode;
        
        if (serviceCodeMap.has(key)) {
          const existing = serviceCodeMap.get(key)!;
          existing.points += points;
          existing.count += 1;
        } else {
          serviceCodeMap.set(key, {
            serviceCode: key,
            points,
            count: 1,
            unitPrice,
          });
        }
      }
    }

    // マスタ情報を取得して行を構築
    const sortedEntries = Array.from(serviceCodeMap.entries()).sort((a, b) => {
      return a[0].localeCompare(b[0]);
    });

    const rows: Array<{
      serviceName: string;
      points: number;
      count: number;
      unitPrice: number;
      burdenAmount: number;
    }> = [];

    // 負担割合を取得（'10' | '20' | '30' を 0.1 | 0.2 | 0.3 に変換）
    // copaymentRateは文字列型（'10' | '20' | '30'）で、1割・2割・3割を表す
    // '10' = 1割 = 10% = 0.1, '20' = 2割 = 20% = 0.2, '30' = 3割 = 30% = 0.3
    let copaymentRate = 0.1; // デフォルトは1割
    if (data.insuranceCard.copaymentRate) {
      const rateValue = typeof data.insuranceCard.copaymentRate === 'string' 
        ? parseInt(data.insuranceCard.copaymentRate, 10) 
        : data.insuranceCard.copaymentRate;
      // 10% = 0.1, 20% = 0.2, 30% = 0.3 に変換
      copaymentRate = rateValue / 100;
    }

    for (const [serviceCode, info] of sortedEntries) {
      const masterInfo = await this.getNursingServiceMasterInfo(serviceCode);
      
      if (!masterInfo) {
        console.warn(`サービスコード ${serviceCode} のマスタ情報が見つかりません。スキップします。`);
        continue;
      }

      const serviceName = masterInfo.serviceName || '';
      
      // 負担額を計算（回数 × 単価 × 負担割合、10円未満は四捨五入）
      // 例: 回数×単価=4000円、負担割合=1割（0.1）の場合、4000×0.1=400円
      const totalAmount = info.count * info.unitPrice;
      // 負担額 = 合計金額 × 負担割合、その後10円単位に四捨五入
      const burdenAmountBeforeRounding = totalAmount * copaymentRate;
      const burdenAmount = Math.round(burdenAmountBeforeRounding / 10) * 10;
      
      // デバッグログ（開発環境のみ）
      if (process.env.NODE_ENV === 'development') {
        console.log(`負担額計算: 回数=${info.count}, 単価=${info.unitPrice}, 合計=${totalAmount}, 負担割合=${copaymentRate}, 負担額=${burdenAmount}`);
      }

      rows.push({
        serviceName,
        points: info.points,
        count: info.count,
        unitPrice: info.unitPrice,
        burdenAmount,
      });
    }

    return rows;
  }

  /**
   * 訪問看護療養費マスタ情報を取得
   */
  private async getNursingServiceMasterInfo(serviceCode: string): Promise<{
    serviceName: string;
  } | null> {
    try {
      const result = await db
        .select({
          serviceName: nursingServiceCodes.serviceName,
        })
        .from(visitingNursingMasterBasic)
        .innerJoin(nursingServiceCodes, eq(visitingNursingMasterBasic.serviceCodeId, nursingServiceCodes.id))
        .where(eq(nursingServiceCodes.serviceCode, serviceCode))
        .limit(1);

      return result[0] || null;
    } catch (error) {
      console.error(`Failed to get visiting nursing master for service code ${serviceCode}:`, error);
      return null;
    }
  }
}
