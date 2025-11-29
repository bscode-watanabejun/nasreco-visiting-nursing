/**
 * 訪問日の記号表示ロジック
 * 
 * 訪問看護療養費明細書Excelの訪問日欄に表示する記号を計算
 */

import type { ReceiptCsvData } from '../csv/types';
import { db } from '../../db';
import { visitingNursingMasterBasic, nursingServiceCodes } from '@shared/schema';
import { eq } from 'drizzle-orm';

/**
 * 訪問日の記号を計算
 * @param data - レセプトCSVデータ
 * @returns 日付（YYYYMMDD形式）をキー、記号の配列を値とするMap
 */
export async function calculateVisitDateSymbols(
  data: ReceiptCsvData
): Promise<Map<string, string[]>> {
  const symbolMap = new Map<string, string[]>();

  // 訪問記録を日付ごとにグループ化
  const recordsByDate = new Map<string, typeof data.nursingRecords>();
  
  for (const record of data.nursingRecords) {
    const visitDate = typeof record.visitDate === 'string' 
      ? record.visitDate.replace(/-/g, '')
      : formatDateToYYYYMMDD(record.visitDate);
    
    if (!recordsByDate.has(visitDate)) {
      recordsByDate.set(visitDate, []);
    }
    recordsByDate.get(visitDate)!.push(record);
  }

  // 同月内の専門管理加算の有無を確認
  const hasSpecialManagementBonus = await checkSpecialManagementBonus(data);

    // 各日付について記号を計算
    for (const [date, records] of Array.from(recordsByDate.entries())) {
      const symbols: string[] = [];
      
      // 同日訪問回数を計算
      const visitCount = records.length;
      
      // 訪問看護基本療養費の有無を確認（当該日の訪問記録から）
      let hasBasicService = false;
      
      // まず、当該日の訪問記録から訪問看護基本療養費の有無を確認
      for (const record of records) {
        const master = await getVisitingNursingMaster(record.serviceCode);
        if (master && (master.instructionType === '1' || master.instructionType === '3' || master.instructionType === '5')) {
          hasBasicService = true;
          break;
        }
      }
      
      // 各訪問記録について記号を判定
      for (const record of records) {
        // 訪問看護療養費マスタを取得
        const master = await getVisitingNursingMaster(record.serviceCode);
        if (!master) continue;

      // 記号①: ○（1日に1回）
      if (master.receiptSymbol1 === '1' && visitCount === 1) {
        if (!symbols.includes('○')) {
          symbols.push('○');
        }
      }

      // 記号③: ◎（1日に2回）
      if (master.receiptSymbol3 === '1' && visitCount === 2) {
        if (!symbols.includes('◎')) {
          symbols.push('◎');
        }
      }

      // 記号④: ◇（1日に3回以上）
      if (master.receiptSymbol4 === '1' && visitCount >= 3) {
        if (!symbols.includes('◇')) {
          symbols.push('◇');
        }
      }

      // 記号⑦: ☆
      // 条件1: 記号⑦=1
      if (master.receiptSymbol7 === '1') {
        if (!symbols.includes('☆')) {
          symbols.push('☆');
        }
      }
      // 条件2: 記号⑦=2 かつ 専門管理加算あり かつ 職種08/18/28/58/68/78
      else if (master.receiptSymbol7 === '2' && hasSpecialManagementBonus) {
        const staffQualificationCode = record.staffQualificationCode;
        if (['08', '18', '28', '58', '68', '78'].includes(staffQualificationCode)) {
          if (!symbols.includes('☆')) {
            symbols.push('☆');
          }
        }
      }

      // 記号②: △（特別訪問看護指示）
      if (master.receiptSymbol2 === '1') {
        const instructionType = data.doctorOrder.instructionType;
        if (instructionType === 'special' || instructionType === 'psychiatric_special' || instructionType === 'medical_observation_special') {
          if (!symbols.includes('△')) {
            symbols.push('△');
          }
        }
      }

      // 記号⑤: □
      if (master.receiptSymbol5 === '1') {
        if (!symbols.includes('□')) {
          symbols.push('□');
        }
      }

      // 記号⑥: ▽
      if (master.receiptSymbol6 === '1') {
        if (!symbols.includes('▽')) {
          symbols.push('▽');
        }
      }

      // 記号⑧: ▲
      if (master.receiptSymbol8 === '1') {
        if (!symbols.includes('▲')) {
          symbols.push('▲');
        }
      }

      // 記号⑨: ▼（訪問看護基本療養費なしの場合）
      if (master.receiptSymbol9 === '1' && !hasBasicService) {
        if (!symbols.includes('▼')) {
          symbols.push('▼');
        }
      }
    }

    // 優先順位に従って記号を整理
    // ◇ > ◎ > ○ の優先順位
    const finalSymbols = applyPriority(symbols, visitCount);
    
    if (finalSymbols.length > 0) {
      symbolMap.set(date, finalSymbols);
    }
  }

  return symbolMap;
}

/**
 * 同月内の専門管理加算の有無を確認
 * 専門管理加算イ（serviceType=21）またはロ（serviceType=17）の算定があるか
 */
async function checkSpecialManagementBonus(data: ReceiptCsvData): Promise<boolean> {
  // 加算履歴から専門管理加算を確認
  for (const bonus of data.bonusHistory) {
    const master = await getVisitingNursingMaster(bonus.serviceCode);
    if (master && (master.serviceType === '21' || master.serviceType === '17')) {
      return true;
    }
  }
  
  // 訪問記録からも確認
  for (const record of data.nursingRecords) {
    const master = await getVisitingNursingMaster(record.serviceCode);
    if (master && (master.serviceType === '21' || master.serviceType === '17')) {
      return true;
    }
  }

  return false;
}

/**
 * 訪問看護療養費マスタを取得
 */
async function getVisitingNursingMaster(serviceCode: string) {
  try {
    const result = await db
      .select({
        instructionType: visitingNursingMasterBasic.instructionType,
        receiptSymbol1: visitingNursingMasterBasic.receiptSymbol1,
        receiptSymbol2: visitingNursingMasterBasic.receiptSymbol2,
        receiptSymbol3: visitingNursingMasterBasic.receiptSymbol3,
        receiptSymbol4: visitingNursingMasterBasic.receiptSymbol4,
        receiptSymbol5: visitingNursingMasterBasic.receiptSymbol5,
        receiptSymbol6: visitingNursingMasterBasic.receiptSymbol6,
        receiptSymbol7: visitingNursingMasterBasic.receiptSymbol7,
        receiptSymbol8: visitingNursingMasterBasic.receiptSymbol8,
        receiptSymbol9: visitingNursingMasterBasic.receiptSymbol9,
        serviceType: visitingNursingMasterBasic.serviceType,
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

/**
 * 優先順位に従って記号を整理
 * ◇ > ◎ > ○ の優先順位（同一日で複数条件を満たす場合）
 */
function applyPriority(symbols: string[], visitCount: number): string[] {
  const prioritySymbols: string[] = [];
  const otherSymbols: string[] = [];

  // 優先順位の高い記号を先に処理
  if (symbols.includes('◇') && visitCount >= 3) {
    prioritySymbols.push('◇');
  } else if (symbols.includes('◎') && visitCount === 2) {
    prioritySymbols.push('◎');
  } else if (symbols.includes('○') && visitCount === 1) {
    prioritySymbols.push('○');
  }

  // その他の記号は重複表示可能
  for (const symbol of symbols) {
    if (!['○', '◎', '◇'].includes(symbol) || !prioritySymbols.includes(symbol)) {
      if (!otherSymbols.includes(symbol)) {
        otherSymbols.push(symbol);
      }
    }
  }

  return [...prioritySymbols, ...otherSymbols];
}

/**
 * 日付をYYYYMMDD形式に変換
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

