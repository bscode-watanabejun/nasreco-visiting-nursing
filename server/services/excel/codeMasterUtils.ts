/**
 * Excel出力用のコードマスタ参照ユーティリティ
 */

import { db } from '../../db';
import { receiptSpecialNoteCodes, workRelatedReasonCodes, visitLocationCodes } from '@shared/schema';
import { eq } from 'drizzle-orm';

/**
 * レセプト特記コードの名称を取得（別表6）
 */
export async function getReceiptSpecialNoteName(code: string): Promise<string> {
  if (!code) return '';
  
  try {
    const result = await db
      .select({ name: receiptSpecialNoteCodes.name })
      .from(receiptSpecialNoteCodes)
      .where(eq(receiptSpecialNoteCodes.code, code))
      .limit(1);
    
    return result[0]?.name || '';
  } catch (error) {
    console.error(`Failed to get receipt special note name for code ${code}:`, error);
    return '';
  }
}

/**
 * 職務上の事由コードの名称を取得（別表8）
 */
export async function getWorkRelatedReasonName(code: string): Promise<string> {
  if (!code) return '';
  
  try {
    const result = await db
      .select({ name: workRelatedReasonCodes.name })
      .from(workRelatedReasonCodes)
      .where(eq(workRelatedReasonCodes.code, code))
      .limit(1);
    
    return result[0]?.name || '';
  } catch (error) {
    console.error(`Failed to get work related reason name for code ${code}:`, error);
    return '';
  }
}

/**
 * 訪問場所コードの名称を取得（別表16）
 */
export async function getVisitLocationName(code: string): Promise<string> {
  if (!code) return '';
  
  try {
    const result = await db
      .select({ name: visitLocationCodes.locationName })
      .from(visitLocationCodes)
      .where(eq(visitLocationCodes.locationCode, code))
      .limit(1);
    
    return result[0]?.name || '';
  } catch (error) {
    console.error(`Failed to get visit location name for code ${code}:`, error);
    return '';
  }
}

/**
 * レセプト特記コードの名称を取得（複数コード対応）
 * 複数のコードを連続して記録された場合は、すべてのコードについて表示
 */
export async function getReceiptSpecialNoteNames(codes: string): Promise<string> {
  if (!codes) return '';
  
  // コードを2桁ずつ分割（例: "010204" → ["01", "02", "04"]）
  const codeArray: string[] = [];
  for (let i = 0; i < codes.length; i += 2) {
    const code = codes.substring(i, i + 2);
    if (code) {
      codeArray.push(code);
    }
  }
  
  const names = await Promise.all(codeArray.map(code => getReceiptSpecialNoteName(code)));
  return names.filter(name => name).join(' ');
}

/**
 * 基準告示第2の1に規定する疾病等の有無コードの名称を取得（別表13）
 * '01'=別表7, '02'=別表8, '03'=無
 */
export function getDiseasePresenceName(code: string): string {
  const mapping: Record<string, string> = {
    '01': '別表７',
    '02': '別表８',
    '03': '無',
  };
  return mapping[code] || '';
}

/**
 * 疾病等コードの名称を取得（別表14）
 * 現時点では簡易実装（コードをそのまま表示）
 * 将来的にマスターテーブルが追加された場合は、DBから取得するように変更
 */
export function getApplicableDiseaseName(code: string): string {
  // 別表14のマスターデータは現時点では未実装のため、コードをそのまま返す
  // 将来的にマスターテーブルが追加された場合は、DBから取得するように変更
  return code || '';
}

/**
 * GAF尺度により判定した値コードの名称を取得（別表28）
 */
export function getGafScaleName(code: string): string {
  const mapping: Record<string, string> = {
    '01': 'GAF尺度100-91',
    '02': 'GAF尺度90-81',
    '03': 'GAF尺度80-71',
    '04': 'GAF尺度70-61',
    '05': 'GAF尺度60-51',
    '06': 'GAF尺度50-41',
    '07': 'GAF尺度40-31',
    '08': 'GAF尺度30-21',
    '09': 'GAF尺度20-11',
    '10': 'GAF尺度10-1',
    '11': 'GAF尺度0',
    '20': '家族への訪問看護でありGAF尺度による判定が行えなかった(当該月に利用者本人への訪問看護を行わなかった)',
  };
  return mapping[code] || '';
}

