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

