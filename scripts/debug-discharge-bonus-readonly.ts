/**
 * 退院時支援指導加算が適用されない原因を詳細調査するスクリプト（読み取り専用）
 * 
 * ⚠️ 本番DBへの読み取り専用アクセスのみ。データの変更は一切行いません。
 * 
 * 実行方法:
 *   PRODUCTION_DB_URL="postgresql://..." npx tsx scripts/debug-discharge-bonus-readonly.ts
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from '../shared/schema';
import { 
  nursingRecords, 
  patients, 
  bonusMaster, 
  nursingServiceCodes,
  bonusCalculationHistory 
} from '../shared/schema';
import { eq, and, or, isNull, lte, gte } from 'drizzle-orm';

neonConfig.webSocketConstructor = ws;

async function debugDischargeBonus() {
  // 本番DBの接続文字列（読み取り専用）
  const dbUrl = process.env.PRODUCTION_DB_URL || 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';
  
  console.log('⚠️  本番データベースに接続します（読み取り専用）');
  console.log('   データの変更は一切行いません。\n');

  const pool = new Pool({ connectionString: dbUrl });
  const db = drizzle({ client: pool, schema });

  try {
    // 1. 患者「祓川 チカ」を検索
    console.log('📋 1. 患者「祓川 チカ」を検索中...');
    const allPatients = await db.query.patients.findMany({});
    const patient = allPatients.find(p => 
      p.lastName?.includes('祓川') && p.firstName?.includes('チカ')
    );

    if (!patient) {
      console.error('❌ 患者「祓川 チカ」が見つかりませんでした');
      process.exit(1);
    }

    console.log(`✅ 患者ID: ${patient.id}`);
    console.log(`   氏名: ${patient.lastName} ${patient.firstName}`);
    console.log(`   保険種別: ${patient.insuranceType}`);
    console.log('');

    // 2. 2025年11月6日の訪問記録を検索
    console.log('📋 2. 2025年11月6日の訪問記録を検索中...');
    const visitDate = '2025-11-06';
    const records = await db.query.nursingRecords.findMany({
      where: and(
        eq(nursingRecords.patientId, patient.id),
        eq(nursingRecords.visitDate, visitDate),
        isNull(nursingRecords.deletedAt)
      ),
      orderBy: (nursingRecords, { asc }) => [asc(nursingRecords.actualStartTime)],
    });

    if (records.length === 0) {
      console.error(`❌ 2025年11月6日の訪問記録が見つかりませんでした`);
      process.exit(1);
    }

    // 8:00-8:30の記録を特定（JST時刻で検索）
    let targetRecord = records.find(record => {
      if (!record.actualStartTime || !record.actualEndTime) return false;
      const startTime = new Date(record.actualStartTime);
      const endTime = new Date(record.actualEndTime);
      const jstStartTime = new Date(startTime.getTime() + 9 * 60 * 60 * 1000);
      const jstEndTime = new Date(endTime.getTime() + 9 * 60 * 60 * 1000);
      const startHour = jstStartTime.getUTCHours();
      const startMin = jstStartTime.getUTCMinutes();
      const endHour = jstEndTime.getUTCHours();
      const endMin = jstEndTime.getUTCMinutes();
      return startHour === 8 && startMin === 0 && 
             endHour === 8 && endMin === 30;
    });

    // 見つからない場合は退院日フラグがtrueの記録を使用
    if (!targetRecord) {
      const dischargeRecords = records.filter(r => r.isDischargeDate);
      if (dischargeRecords.length > 0) {
        console.log('   ⚠️  8:00-8:30の記録が見つかりませんが、退院日フラグがtrueの記録を使用します');
        targetRecord = dischargeRecords[0];
      } else {
        targetRecord = records[0];
      }
    }

    console.log(`✅ 対象記録ID: ${targetRecord.id}`);
    console.log(`   訪問日: ${targetRecord.visitDate}`);
    console.log(`   退院日当日の訪問: ${targetRecord.isDischargeDate ? '✅ true' : '❌ false'}`);
    console.log('');

    // 3. 加算マスタの詳細を確認
    console.log('📋 3. 退院時支援指導加算の加算マスタ詳細を確認中...');
    const visitDateStr = visitDate;

    const dischargeBonusMasters = await db.query.bonusMaster.findMany({
      where: and(
        or(
          eq(bonusMaster.facilityId, targetRecord.facilityId),
          isNull(bonusMaster.facilityId)
        ),
        eq(bonusMaster.insuranceType, patient.insuranceType as 'medical' | 'care'),
        lte(bonusMaster.validFrom, visitDateStr),
        or(
          isNull(bonusMaster.validTo),
          gte(bonusMaster.validTo, visitDateStr)
        ),
        eq(bonusMaster.isActive, true),
        or(
          eq(bonusMaster.bonusCode, 'discharge_support_guidance_basic'),
          eq(bonusMaster.bonusCode, 'discharge_support_guidance_long')
        )
      ),
    });

    console.log(`✅ 退院時支援指導加算マスタ数: ${dischargeBonusMasters.length}件\n`);

    for (const bonus of dischargeBonusMasters) {
      console.log(`【${bonus.bonusCode}】`);
      console.log(`  名前: ${bonus.bonusName}`);
      console.log(`  点数タイプ: ${bonus.pointsType}`);
      console.log(`  固定点数: ${bonus.fixedPoints || 'N/A'}`);
      console.log(`  条件分岐パターン: ${bonus.conditionalPattern || 'N/A'}`);
      console.log(`  点数設定: ${JSON.stringify(bonus.pointsConfig, null, 2)}`);
      console.log(`  事前定義条件: ${JSON.stringify(bonus.predefinedConditions, null, 2)}`);
      console.log(`  表示順序: ${bonus.displayOrder}`);
      console.log('');
    }

    // 4. 加算計算履歴の詳細を確認
    console.log('📋 4. 加算計算履歴の詳細を確認中...');
    const bonusHistory = await db.query.bonusCalculationHistory.findMany({
      where: eq(bonusCalculationHistory.nursingRecordId, targetRecord.id),
    });

    console.log(`✅ 加算計算履歴数: ${bonusHistory.length}件`);

    if (bonusHistory.length > 0) {
      console.log('\n   計算された加算一覧:');
      bonusHistory.forEach(h => {
        console.log(`   - ${h.bonusCode}: ${h.bonusName} (${h.calculatedPoints}点)`);
        console.log(`     サービスコードID: ${h.serviceCodeId || '未設定'}`);
        console.log(`     選択理由: ${h.selectionReason || 'N/A'}`);
      });
    } else {
      console.log('\n   ❌ 加算計算履歴が存在しません');
    }
    console.log('');

    // 5. 加算計算の条件を手動で評価
    console.log('📋 5. 加算計算の条件を手動で評価中...\n');

    // コンテキスト情報を構築
    const visitDateObj = new Date(visitDate);
    const visitStartTime = targetRecord.actualStartTime 
      ? (typeof targetRecord.actualStartTime === 'string'
        ? new Date(targetRecord.actualStartTime)
        : targetRecord.actualStartTime)
      : null;
    const visitEndTime = targetRecord.actualEndTime 
      ? (typeof targetRecord.actualEndTime === 'string'
        ? new Date(targetRecord.actualEndTime)
        : targetRecord.actualEndTime)
      : null;

    console.log('【コンテキスト情報】');
    console.log(`  isDischargeDate: ${targetRecord.isDischargeDate}`);
    console.log(`  visitStartTime: ${visitStartTime ? visitStartTime.toISOString() : 'N/A'}`);
    console.log(`  visitEndTime: ${visitEndTime ? visitEndTime.toISOString() : 'N/A'}`);
    if (visitStartTime && visitEndTime) {
      const durationMinutes = (visitEndTime.getTime() - visitStartTime.getTime()) / (1000 * 60);
      console.log(`  訪問時間: ${durationMinutes}分`);
    }
    console.log('');

    // 各加算マスタの条件を評価
    for (const bonus of dischargeBonusMasters) {
      console.log(`【${bonus.bonusCode} の条件評価】`);
      
      // 事前定義条件の確認
      if (bonus.predefinedConditions) {
        const conditions = Array.isArray(bonus.predefinedConditions)
          ? bonus.predefinedConditions
          : [bonus.predefinedConditions];
        
        console.log(`  事前定義条件数: ${conditions.length}件`);
        conditions.forEach((cond: any, index: number) => {
          console.log(`  条件${index + 1}: ${JSON.stringify(cond)}`);
          
          // is_discharge_date条件の評価
          if (cond.pattern === 'is_discharge_date' || cond.type === 'is_discharge_date') {
            const passed = targetRecord.isDischargeDate === true;
            console.log(`    → 評価結果: ${passed ? '✅ 通過' : '❌ 不通過'}`);
            if (!passed) {
              console.log(`    → 理由: isDischargeDateが${targetRecord.isDischargeDate}のため`);
            }
          }
        });
      } else {
        console.log(`  ⚠️  事前定義条件が設定されていません`);
      }

      // サービスコード選択の確認
      console.log(`  サービスコード選択ロジック:`);
      if (bonus.bonusCode === 'discharge_support_guidance_basic') {
        console.log(`    → サービスコード: 550001170`);
        if (!targetRecord.isDischargeDate) {
          console.log(`    → ❌ isDischargeDateがfalseのため、サービスコード選択をスキップ`);
        }
      } else if (bonus.bonusCode === 'discharge_support_guidance_long') {
        console.log(`    → サービスコード: 550001270`);
        if (!targetRecord.isDischargeDate) {
          console.log(`    → ❌ isDischargeDateがfalseのため、サービスコード選択をスキップ`);
        } else if (!visitStartTime || !visitEndTime) {
          console.log(`    → ❌ 訪問時間が設定されていないため、サービスコード選択をスキップ`);
        } else {
          const durationMinutes = (visitEndTime.getTime() - visitStartTime.getTime()) / (1000 * 60);
          if (durationMinutes <= 90) {
            console.log(`    → ❌ 訪問時間が${durationMinutes}分（90分以下）のため、サービスコード選択をスキップ`);
          } else {
            console.log(`    → ✅ 訪問時間が${durationMinutes}分（90分超）のため、サービスコード選択可能`);
          }
        }
      }
      console.log('');
    }

    // 6. 総合判定
    console.log('='.repeat(80));
    console.log('【原因分析】');
    console.log('='.repeat(80));
    console.log('');

    const issues: string[] = [];

    if (!targetRecord.isDischargeDate) {
      issues.push('❌ 訪問記録の「退院日当日の訪問」フラグがfalseになっています');
    }

    if (dischargeBonusMasters.length === 0) {
      issues.push('❌ 退院時支援指導加算の加算マスタが有効になっていません');
    }

    // 事前定義条件の確認
    const basicBonus = dischargeBonusMasters.find(b => b.bonusCode === 'discharge_support_guidance_basic');
    if (basicBonus) {
      if (!basicBonus.predefinedConditions) {
        issues.push('⚠️  discharge_support_guidance_basicに事前定義条件が設定されていません（条件なしで評価される可能性）');
      } else {
        const hasDischargeCondition = Array.isArray(basicBonus.predefinedConditions)
          ? basicBonus.predefinedConditions.some((c: any) => c.pattern === 'is_discharge_date' || c.type === 'is_discharge_date')
          : (basicBonus.predefinedConditions as any).pattern === 'is_discharge_date' || (basicBonus.predefinedConditions as any).type === 'is_discharge_date';
        
        if (!hasDischargeCondition) {
          issues.push('⚠️  discharge_support_guidance_basicの事前定義条件に「is_discharge_date」が含まれていません');
        }
      }
    }

    if (bonusHistory.length === 0 && targetRecord.isDischargeDate) {
      issues.push('❌ 加算計算が実行されていません（条件を満たしているのに計算履歴がない）');
      issues.push('   考えられる原因:');
      issues.push('   1. 加算計算が実行されていない（訪問記録保存時に計算されていない）');
      issues.push('   2. 事前定義条件の評価で失敗している');
      issues.push('   3. サービスコード選択で失敗している');
      issues.push('   4. 併算定チェックで除外されている');
    }

    if (issues.length === 0) {
      console.log('✅ すべての条件を満たしているようです。');
      console.log('   それでも加算が適用されない場合は、加算計算の再実行が必要かもしれません。');
    } else {
      console.log('以下の問題が確認されました:\n');
      issues.forEach((issue, index) => {
        console.log(`${index + 1}. ${issue}`);
      });
    }

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

debugDischargeBonus().catch(console.error);

