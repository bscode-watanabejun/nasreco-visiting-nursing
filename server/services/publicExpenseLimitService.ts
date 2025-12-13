/**
 * 公費月額上限適用サービス
 * 
 * 公費利用者の月額上限を適用して患者負担額を調整する機能を提供
 */

import { db } from "../db";
import { eq, and, lte } from "drizzle-orm";
import { nursingServiceCodes, bonusMaster } from "@shared/schema";

export interface MonthlyLimitInfo {
  originalAmount: number;      // 上限適用前の金額
  adjustedAmount: number;       // 上限適用後の金額
  limitAmount: number;          // 適用された上限額
}

export interface PublicExpenseLimitInfo {
  [publicExpenseId: string]: MonthlyLimitInfo;
}

/**
 * 月額上限を適用して患者負担額を調整
 * 
 * @param totalAmount 総医療費（円）
 * @param copaymentRate 負担割合（0.1 = 1割, 0.2 = 2割, 0.3 = 3割）
 * @param monthlyLimit 月額上限（円、nullの場合は上限なし）
 * @returns 調整後の患者負担額と上限適用情報
 */
export function applyMonthlyLimit(
  totalAmount: number,
  copaymentRate: number,
  monthlyLimit: number | null
): {
  adjustedAmount: number;
  limitInfo: MonthlyLimitInfo | null;
} {
  // 通常の負担額を計算（10円未満は四捨五入）
  const normalBurdenAmount = Math.round((totalAmount * copaymentRate) / 10) * 10;
  
  // 月額上限がない場合は通常の負担額を返す
  if (!monthlyLimit) {
    return { adjustedAmount: normalBurdenAmount, limitInfo: null };
  }
  
  // 月額上限を適用
  if (normalBurdenAmount > monthlyLimit) {
    const limitInfo: MonthlyLimitInfo = {
      originalAmount: normalBurdenAmount,
      adjustedAmount: monthlyLimit,
      limitAmount: monthlyLimit,
    };
    return {
      adjustedAmount: monthlyLimit,
      limitInfo,
    };
  }
  
  // 上限額を超えていない場合は通常の負担額を返す
  return { adjustedAmount: normalBurdenAmount, limitInfo: null };
}

/**
 * 複数公費併用時の月額上限を適用
 * 請求書の計算ロジックと同じように、サービスコードごとに負担額を計算（四捨五入）してから合計する
 * 
 * @param copaymentRate 負担割合（0.1 = 1割, 0.2 = 2割, 0.3 = 3割）
 * @param publicExpenses 公費情報の配列（id, monthlyLimitを含む）
 * @param nursingRecords 訪問記録の配列（publicExpenseId、serviceCode、managementServiceCode、bonusHistoryを含む）
 * @returns 調整後の患者負担額合計と各公費ごとの上限適用情報
 */
export async function applyPublicExpenseLimits(
  copaymentRate: number,
  publicExpenses: Array<{ id: string; monthlyLimit: number | null }>,
  nursingRecords: Array<{
    publicExpenseId?: string | null;
    serviceCode?: string;
    managementServiceCode?: string;
    bonusHistory?: Array<{ bonusCode: string; serviceCode: string; points: number }>;
  }>,
  insuranceType: 'medical' | 'care',
  targetYear: number,
  targetMonth: number
): Promise<{
  adjustedTotalAmount: number;
  limitInfoMap: PublicExpenseLimitInfo;
}> {
  const limitInfoMap: PublicExpenseLimitInfo = {};
  let adjustedTotalAmount = 0;

  // 公費がない場合は空の結果を返す
  if (publicExpenses.length === 0) {
    return {
      adjustedTotalAmount: 0,
      limitInfoMap: {},
    };
  }

  // 訪問記録を公費IDでグループ化
  // 注意: publicExpenseIdがnullの訪問記録は、全訪問記録がnullの場合のみ第一公費に割り当て
  const recordsByPublicExpense = new Map<string, Array<{
    serviceCode?: string;
    managementServiceCode?: string;
    bonusHistory?: Array<{ bonusCode: string; serviceCode: string; points: number }>;
  }>>();
  
  // publicExpenseIdがnullの訪問記録をカウント
  const recordsWithNullPublicExpenseId = nursingRecords.filter(r => !r.publicExpenseId);
  const allRecordsHaveNullPublicExpenseId = recordsWithNullPublicExpenseId.length === nursingRecords.length;
  
  for (const record of nursingRecords) {
    const publicExpenseId = record.publicExpenseId;
    if (!publicExpenseId) {
      // publicExpenseIdがnullの場合は、上限が設定されている公費に割り当て（上限適用前の金額を請求書と一致させるため）
      // 上限が設定されている公費がない場合は、第一公費に割り当て
      if (publicExpenses.length > 0) {
        // 上限が設定されている公費を探す
        const publicExpenseWithLimit = publicExpenses.find(pe => pe.monthlyLimit !== null);
        const targetPublicExpenseId = publicExpenseWithLimit?.id || publicExpenses[0].id;
        
        if (!recordsByPublicExpense.has(targetPublicExpenseId)) {
          recordsByPublicExpense.set(targetPublicExpenseId, []);
        }
        const recordToAdd = {
          serviceCode: record.serviceCode,
          managementServiceCode: record.managementServiceCode,
          bonusHistory: record.bonusHistory,
        };
        recordsByPublicExpense.get(targetPublicExpenseId)!.push(recordToAdd);
        
        // デバッグログ（開発環境のみ）
        if (process.env.NODE_ENV === 'development') {
          console.log(`[公費上限適用] publicExpenseIdがnullの訪問記録を公費(${targetPublicExpenseId}${publicExpenseWithLimit ? '（上限設定あり）' : '（第一公費）'})に追加 - 基本療養費: ${record.serviceCode || 'なし'}, 管理療養費: ${record.managementServiceCode || 'なし'}, 加算数: ${record.bonusHistory?.length || 0}`);
        }
      }
      continue;
    }

    if (!recordsByPublicExpense.has(publicExpenseId)) {
      recordsByPublicExpense.set(publicExpenseId, []);
    }
    recordsByPublicExpense.get(publicExpenseId)!.push({
      serviceCode: record.serviceCode,
      managementServiceCode: record.managementServiceCode,
      bonusHistory: record.bonusHistory,
    });
  }
  
  // デバッグログ（開発環境のみ）
  if (process.env.NODE_ENV === 'development') {
    console.log(`[公費上限適用] 全訪問記録数: ${nursingRecords.length}, 公費IDがnullの訪問記録数: ${recordsWithNullPublicExpenseId.length}`);
    for (const [publicExpenseId, records] of Array.from(recordsByPublicExpense.entries())) {
      console.log(`[公費上限適用] 公費ID: ${publicExpenseId}, 紐付く訪問記録数: ${records.length}`);
    }
  }

  // 各公費ごとに上限を適用
  for (const publicExpense of publicExpenses) {
    const records = recordsByPublicExpense.get(publicExpense.id) || [];
    
    // デバッグログ（開発環境のみ）
    if (process.env.NODE_ENV === 'development') {
      console.log(`[公費上限適用] 公費ID: ${publicExpense.id}, 処理する訪問記録数: ${records.length}`);
      for (const record of records) {
        console.log(`[公費上限適用] 訪問記録 - 基本療養費: ${record.serviceCode || 'なし'}, 管理療養費: ${record.managementServiceCode || 'なし'}, 加算数: ${record.bonusHistory?.length || 0}`);
        if (record.bonusHistory && record.bonusHistory.length > 0) {
          for (const bonus of record.bonusHistory) {
            console.log(`[公費上限適用] 加算 - サービスコード: ${bonus.serviceCode}, 点数: ${bonus.points}`);
          }
        }
      }
    }
    
    // サービスコードごとに負担額を計算（請求書と同じロジック）
    const serviceCodeMap = new Map<string, {
      points: number;
      count: number;
      unitPrice: number;
    }>();

    // 訪問記録から基本療養費と管理療養費を集計
    for (const record of records) {
      if (record.serviceCode) {
        // サービスコードマスタから点数を取得
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
    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0);
    
    for (const record of records) {
      if (record.bonusHistory) {
        for (const bonus of record.bonusHistory) {
          if (bonus.serviceCode && bonus.bonusCode) {
            // 加算マスタのfrequencyLimitを取得（キャッシュから）
            let bonusMasterInfo = bonusMasterCache.get(bonus.bonusCode);
            if (!bonusMasterInfo) {
              const whereConditions = [
                eq(bonusMaster.bonusCode, bonus.bonusCode),
                eq(bonusMaster.insuranceType, insuranceType),
                lte(bonusMaster.validFrom, endDate.toISOString().split('T')[0]),
              ];
              
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
            const isMonthlyOnce = bonusMasterInfo?.frequencyLimit === 'monthly_1';
            
            if (serviceCodeMap.has(key)) {
              const existing = serviceCodeMap.get(key)!;
              // frequencyLimitが"monthly_1"の場合は、点数とカウントを増やさない（既に1回カウント済み）
              if (!isMonthlyOnce) {
                existing.points += points;
                existing.count += 1;
              }
            } else {
              serviceCodeMap.set(key, {
                points,
                count: 1, // 最初の1回は常にカウント
                unitPrice,
              });
            }
          }
        }
      }
    }

    // 各サービスコードごとに負担額を計算（請求書と同じロジック）
    let publicExpenseBurdenAmount = 0;
    for (const [serviceCode, info] of Array.from(serviceCodeMap.entries())) {
      const totalAmount = info.count * info.unitPrice;
      // 負担額 = 合計金額 × 負担割合、その後10円単位に四捨五入
      const burdenAmountBeforeRounding = totalAmount * copaymentRate;
      const burdenAmount = Math.round(burdenAmountBeforeRounding / 10) * 10;
      publicExpenseBurdenAmount += burdenAmount;
      
      // デバッグログ（開発環境のみ）
      if (process.env.NODE_ENV === 'development') {
        console.log(`[公費上限適用] 公費ID: ${publicExpense.id}, サービスコード: ${serviceCode}, 回数: ${info.count}, 単価: ${info.unitPrice}, 合計: ${totalAmount}, 負担額: ${burdenAmount}`);
      }
    }
    
    // デバッグログ（開発環境のみ）
    if (process.env.NODE_ENV === 'development') {
      console.log(`[公費上限適用] 公費ID: ${publicExpense.id}, 上限適用前の負担額合計: ${publicExpenseBurdenAmount}, 上限額: ${publicExpense.monthlyLimit}`);
    }

    // 該当公費の上限を適用
    // 上限適用前の負担額（publicExpenseBurdenAmount）を直接使用して上限を適用
    let adjustedAmount = publicExpenseBurdenAmount;
    let limitInfo: MonthlyLimitInfo | null = null;

    if (publicExpense.monthlyLimit) {
      if (publicExpenseBurdenAmount > publicExpense.monthlyLimit) {
        adjustedAmount = publicExpense.monthlyLimit;
        limitInfo = {
          originalAmount: publicExpenseBurdenAmount, // サービスコードごとに計算した負担額の合計
          adjustedAmount: publicExpense.monthlyLimit,
          limitAmount: publicExpense.monthlyLimit,
        };
      }
    }

    adjustedTotalAmount += adjustedAmount;

    // 上限適用情報を保存
    if (limitInfo) {
      limitInfoMap[publicExpense.id] = limitInfo;
    }
  }

  return {
    adjustedTotalAmount,
    limitInfoMap,
  };
}
