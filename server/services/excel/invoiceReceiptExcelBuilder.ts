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
import { visitingNursingMasterBasic, nursingServiceCodes, bonusMaster } from '@shared/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
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
    const b2Cell = sheet.getCell('B2');
    b2Cell.value = targetYearMonth;
    b2Cell.fill = { type: 'pattern', pattern: 'none' };

    // L2: 「請求書」または「領収書」
    const l2Cell = sheet.getCell('L2');
    l2Cell.value = this.type === 'invoice' ? '請求書' : '領収書';
    l2Cell.fill = { type: 'pattern', pattern: 'none' };

    // U2: 出力年月日（和暦）
    const outputDateStr = formatJapaneseDateForInvoice(this.outputDate);
    const u2Cell = sheet.getCell('U2');
    u2Cell.value = outputDateStr;
    u2Cell.fill = { type: 'pattern', pattern: 'none' };

    // E4: 請求書No（10桁）
    const invoiceNumber = await generateInvoiceNumber(this.facilityId, this.outputDate);
    const e4Cell = sheet.getCell('E4');
    e4Cell.value = invoiceNumber;
    e4Cell.fill = { type: 'pattern', pattern: 'none' };
  }

  /**
   * 患者情報セル（E5-E7）への出力
   */
  private async fillPatientCells(sheet: ExcelJS.Worksheet, data: ReceiptCsvData): Promise<void> {
    // E5: 患者番号
    const e5Cell = sheet.getCell('E5');
    e5Cell.value = data.patient.patientNumber || '';
    e5Cell.fill = { type: 'pattern', pattern: 'none' };

    // E6: カナ氏名
    const e6Cell = sheet.getCell('E6');
    e6Cell.value = data.patient.kanaName || '';
    e6Cell.fill = { type: 'pattern', pattern: 'none' };

    // E7: 氏名（姓 + 名）
    const fullName = `${data.patient.lastName || ''}${data.patient.firstName || ''}`.trim();
    const e7Cell = sheet.getCell('E7');
    e7Cell.value = fullName;
    e7Cell.fill = { type: 'pattern', pattern: 'none' };
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
    const n4Cell = sheet.getCell('N4');
    n4Cell.value = facilityInfo;
    n4Cell.alignment = { vertical: 'top', wrapText: true };
    n4Cell.fill = { type: 'pattern', pattern: 'none' };
  }

  /**
   * 金額セル（C9, E11, M11）への出力
   * 注意: E11とM11は負担額の合計を出力するため、後でfillMedicalInsuranceCellsまたはfillCareInsuranceCellsで更新される
   */
  private async fillAmountCells(sheet: ExcelJS.Worksheet, data: ReceiptCsvData): Promise<void> {
    // C9: 請求書/領収書の文言
    const c9Cell = sheet.getCell('C9');
    if (this.type === 'invoice') {
      c9Cell.value = '下記の通り医療費及び介護費をご請求申し上げます';
    } else {
      c9Cell.value = '下記の通り医療費及び介護費を領収いたしました';
    }
    c9Cell.fill = { type: 'pattern', pattern: 'none' };

    // E11とM11は負担額の合計を出力するため、fillMedicalInsuranceCellsまたはfillCareInsuranceCellsで設定される
    // ここでは初期値として0を設定
    const e11Cell = sheet.getCell('E11');
    e11Cell.value = 0;
    e11Cell.fill = { type: 'pattern', pattern: 'none' };

    const m11Cell = sheet.getCell('M11');
    m11Cell.value = 0;
    m11Cell.fill = { type: 'pattern', pattern: 'none' };
  }

  /**
   * 医療保険セルへの出力
   */
  private async fillMedicalInsuranceCells(sheet: ExcelJS.Worksheet, data: ReceiptCsvData): Promise<void> {
    // W13: 負担割合（'10' | '20' | '30' を '1割' | '2割' | '3割' に変換）
    const copaymentRate = data.insuranceCard.copaymentRate;
    if (copaymentRate) {
      const rate = parseInt(copaymentRate, 10) / 10;
      const w13Cell = sheet.getCell('W13');
      w13Cell.value = `${rate}割`;
      w13Cell.fill = { type: 'pattern', pattern: 'none' };
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

      const dCell = sheet.getCell(`D${rowIndex}`);
      dCell.value = row.serviceName;
      dCell.fill = { type: 'pattern', pattern: 'none' };

      const qCell = sheet.getCell(`Q${rowIndex}`);
      qCell.value = `${row.points}点`;
      qCell.fill = { type: 'pattern', pattern: 'none' };

      const sCell = sheet.getCell(`S${rowIndex}`);
      sCell.value = row.count;
      sCell.fill = { type: 'pattern', pattern: 'none' };

      const uCell = sheet.getCell(`U${rowIndex}`);
      uCell.value = row.unitPrice;
      uCell.fill = { type: 'pattern', pattern: 'none' };

      const wCell = sheet.getCell(`W${rowIndex}`);
      wCell.value = row.burdenAmount;
      wCell.fill = { type: 'pattern', pattern: 'none' };
    }

    // D27セルも無色にする（データが10個未満の場合でもテンプレートの色をクリア）
    const d27Cell = sheet.getCell('D27');
    d27Cell.fill = { type: 'pattern', pattern: 'none' };

    // U30: 点数の合計
    const totalPoints = serviceRows.reduce((sum, row) => sum + row.points, 0);
    const u30Cell = sheet.getCell('U30');
    u30Cell.value = totalPoints;
    u30Cell.fill = { type: 'pattern', pattern: 'none' };

    // U31: 負担額の合計
    let totalBurdenAmount = serviceRows.reduce((sum, row) => sum + row.burdenAmount, 0);
    
    // 公費利用者で上限適用がある場合、上限適用後の患者負担額を使用
    if (data.receipt.publicExpenseLimitInfo && Object.keys(data.receipt.publicExpenseLimitInfo).length > 0) {
      // 上限適用情報から上限適用後の患者負担額の合計を計算
      const limitInfoMap = data.receipt.publicExpenseLimitInfo;
      const adjustedAmounts = Object.values(limitInfoMap).map(info => info.adjustedAmount);
      const totalAdjustedAmount = adjustedAmounts.reduce((sum, amount) => sum + amount, 0);
      
      // 上限適用がない公費の負担額も考慮
      // 通常の負担額計算
      const copaymentRate = data.insuranceCard.copaymentRate
        ? parseInt(data.insuranceCard.copaymentRate, 10) / 100
        : 0.1;
      const normalTotalBurdenAmount = Math.round((data.receipt.totalAmount * copaymentRate) / 10) * 10;
      
      // 上限適用がある公費の負担額の合計を計算
      const originalAmounts = Object.values(limitInfoMap).map(info => info.originalAmount);
      const totalOriginalAmount = originalAmounts.reduce((sum, amount) => sum + amount, 0);
      
      // 上限適用がない公費の負担額を計算
      const burdenAmountWithoutLimit = normalTotalBurdenAmount - totalOriginalAmount;
      
      // 上限適用後の患者負担額の合計
      totalBurdenAmount = totalAdjustedAmount + burdenAmountWithoutLimit;
    }
    
    const u31Cell = sheet.getCell('U31');
    u31Cell.value = totalBurdenAmount;
    u31Cell.fill = { type: 'pattern', pattern: 'none' };

    // U33: 負担額の合計（U31と同じ）
    const u33Cell = sheet.getCell('U33');
    u33Cell.value = totalBurdenAmount;
    u33Cell.fill = { type: 'pattern', pattern: 'none' };

    // E11: 負担額の合計（U33と同じ）
    const e11Cell = sheet.getCell('E11');
    e11Cell.value = totalBurdenAmount;
    e11Cell.fill = { type: 'pattern', pattern: 'none' };

    // M11: 領収書の場合は負担額の合計、請求書の場合は0
    const m11Cell = sheet.getCell('M11');
    if (this.type === 'receipt') {
      m11Cell.value = totalBurdenAmount;
    } else {
      m11Cell.value = 0;
    }
    m11Cell.fill = { type: 'pattern', pattern: 'none' };
  }

  /**
   * 介護保険セルへの出力
   */
  private async fillCareInsuranceCells(sheet: ExcelJS.Worksheet, data: ReceiptCsvData): Promise<void> {
    // W35: 負担割合（'10' | '20' | '30' を '1割' | '2割' | '3割' に変換）
    const copaymentRate = data.insuranceCard.copaymentRate;
    if (copaymentRate) {
      const rate = parseInt(copaymentRate, 10) / 10;
      const w35Cell = sheet.getCell('W35');
      w35Cell.value = `${rate}割`;
      w35Cell.fill = { type: 'pattern', pattern: 'none' };
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

      const dCell = sheet.getCell(`D${rowIndex}`);
      dCell.value = row.serviceName;
      dCell.fill = { type: 'pattern', pattern: 'none' };

      const qCell = sheet.getCell(`Q${rowIndex}`);
      qCell.value = `${row.points}点`;
      qCell.fill = { type: 'pattern', pattern: 'none' };

      const sCell = sheet.getCell(`S${rowIndex}`);
      sCell.value = row.count;
      sCell.fill = { type: 'pattern', pattern: 'none' };

      const uCell = sheet.getCell(`U${rowIndex}`);
      uCell.value = row.unitPrice;
      uCell.fill = { type: 'pattern', pattern: 'none' };

      const wCell = sheet.getCell(`W${rowIndex}`);
      wCell.value = row.burdenAmount;
      wCell.fill = { type: 'pattern', pattern: 'none' };
    }

    // D47セルも無色にする（データが10個未満の場合でもテンプレートの色をクリア）
    const d47Cell = sheet.getCell('D47');
    d47Cell.fill = { type: 'pattern', pattern: 'none' };

    // U51: 負担額の合計
    let totalBurdenAmount = serviceRows.reduce((sum, row) => sum + row.burdenAmount, 0);
    
    // 公費利用者で上限適用がある場合、上限適用後の患者負担額を使用
    if (data.receipt.publicExpenseLimitInfo && Object.keys(data.receipt.publicExpenseLimitInfo).length > 0) {
      // 上限適用情報から上限適用後の患者負担額の合計を計算
      const limitInfoMap = data.receipt.publicExpenseLimitInfo;
      const adjustedAmounts = Object.values(limitInfoMap).map(info => info.adjustedAmount);
      const totalAdjustedAmount = adjustedAmounts.reduce((sum, amount) => sum + amount, 0);
      
      // 上限適用がない公費の負担額も考慮
      // 通常の負担額計算
      const copaymentRate = data.insuranceCard.copaymentRate
        ? parseInt(data.insuranceCard.copaymentRate, 10) / 100
        : 0.1;
      const normalTotalBurdenAmount = Math.round((data.receipt.totalAmount * copaymentRate) / 10) * 10;
      
      // 上限適用がある公費の負担額の合計を計算
      const originalAmounts = Object.values(limitInfoMap).map(info => info.originalAmount);
      const totalOriginalAmount = originalAmounts.reduce((sum, amount) => sum + amount, 0);
      
      // 上限適用がない公費の負担額を計算
      const burdenAmountWithoutLimit = normalTotalBurdenAmount - totalOriginalAmount;
      
      // 上限適用後の患者負担額の合計
      totalBurdenAmount = totalAdjustedAmount + burdenAmountWithoutLimit;
    }
    
    const u51Cell = sheet.getCell('U51');
    u51Cell.value = totalBurdenAmount;
    u51Cell.fill = { type: 'pattern', pattern: 'none' };

    // U53: 負担額の合計（U51と同じ）
    const u53Cell = sheet.getCell('U53');
    u53Cell.value = totalBurdenAmount;
    u53Cell.fill = { type: 'pattern', pattern: 'none' };

    // E11: 負担額の合計（U53と同じ）
    const e11Cell = sheet.getCell('E11');
    e11Cell.value = totalBurdenAmount;
    e11Cell.fill = { type: 'pattern', pattern: 'none' };

    // M11: 領収書の場合は負担額の合計、請求書の場合は0
    const m11Cell = sheet.getCell('M11');
    if (this.type === 'receipt') {
      m11Cell.value = totalBurdenAmount;
    } else {
      m11Cell.value = 0;
    }
    m11Cell.fill = { type: 'pattern', pattern: 'none' };
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

    // 加算履歴を集計（frequencyLimitを考慮）
    // 加算マスタのfrequencyLimitを取得するためのキャッシュ
    const bonusMasterCache = new Map<string, { frequencyLimit: string | null }>();
    
    // 対象年月の開始日と終了日を計算（frequencyLimit判定用）
    const targetYear = data.receipt.targetYear;
    const targetMonth = data.receipt.targetMonth;
    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0);
    
    for (const bonus of data.bonusHistory) {
      if (bonus.serviceCode) {
        // 加算マスタのfrequencyLimitを取得（キャッシュから）
        let bonusMasterInfo = bonusMasterCache.get(bonus.bonusCode);
        if (!bonusMasterInfo) {
          const whereConditions = [
            eq(bonusMaster.bonusCode, bonus.bonusCode),
            eq(bonusMaster.insuranceType, data.receipt.insuranceType),
            lte(bonusMaster.validFrom, endDate.toISOString().split('T')[0]),
          ];
          
          // validToがnullでない場合は、有効期限の終了日もチェック
          const bonusMasterRecords = await db.query.bonusMaster.findMany({
            where: and(...whereConditions),
            orderBy: (bonusMaster, { desc }) => [desc(bonusMaster.validFrom)],
          });
          
          // 対象年月の期間内に有効な加算マスタを探す
          const bonusMasterRecord = bonusMasterRecords.find(record => {
            const validFromDate = new Date(record.validFrom);
            const validToDate = record.validTo ? new Date(record.validTo) : null;
            return validFromDate <= endDate && (!validToDate || validToDate >= startDate);
          });
          
          bonusMasterInfo = {
            frequencyLimit: bonusMasterRecord?.frequencyLimit || null,
          };
          bonusMasterCache.set(bonus.bonusCode, bonusMasterInfo);
        }
        
        const points = bonus.points;
        const unitPrice = points * 10;
        const key = bonus.serviceCode;
        
        // frequencyLimitが"monthly_1"の場合は、同じserviceCodeの加算を1回のみカウント
        const isMonthlyOnce = bonusMasterInfo.frequencyLimit === 'monthly_1';
        
        if (serviceCodeMap.has(key)) {
          const existing = serviceCodeMap.get(key)!;
          // frequencyLimitが"monthly_1"の場合は、点数とカウントを増やさない（既に1回カウント済み）
          if (!isMonthlyOnce) {
            existing.points += points;
            existing.count += 1;
          }
        } else {
          serviceCodeMap.set(key, {
            serviceCode: key,
            points,
            count: 1, // 最初の1回は常にカウント
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
