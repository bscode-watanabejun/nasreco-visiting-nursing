/**
 * 退院時支援指導加算が適用されない原因を調査するスクリプト
 * 
 * 本番環境の特定の訪問記録について、退院時支援指導加算が適用されない原因を調査します。
 * 
 * ⚠️ 読み取り専用で実行します。データの変更は行いません。
 * 
 * 実行方法:
 *   PRODUCTION_DB_URL="postgresql://..." npx tsx scripts/investigate-discharge-bonus.ts
 * 
 * 環境変数:
 *   PRODUCTION_DB_URL - 本番環境のデータベース接続文字列（読み取り専用）
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
import { eq, and, or, isNull, lte, gte, sql, like } from 'drizzle-orm';

neonConfig.webSocketConstructor = ws;

async function investigateDischargeBonus() {
  // 本番DBの接続文字列（読み取り専用）
  const dbUrl = process.env.PRODUCTION_DB_URL || 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';
  
  console.log('⚠️  本番データベースに接続します（読み取り専用）\n');
  console.log('🔍 退院時支援指導加算の適用状況を調査中...\n');

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

    console.log(`✅ 訪問記録数: ${records.length}件\n`);

    // 3. 8:00-8:30の記録を特定（JST時刻で検索）
    // 注意: データベースにはUTC時刻で保存されている可能性があるため、JSTに変換して検索
    const targetRecord = records.find(record => {
      if (!record.actualStartTime || !record.actualEndTime) return false;
      const startTime = new Date(record.actualStartTime);
      const endTime = new Date(record.actualEndTime);
      // UTC時刻をJST（UTC+9）に変換
      const jstStartTime = new Date(startTime.getTime() + 9 * 60 * 60 * 1000);
      const jstEndTime = new Date(endTime.getTime() + 9 * 60 * 60 * 1000);
      const startHour = jstStartTime.getUTCHours();
      const startMin = jstStartTime.getUTCMinutes();
      const endHour = jstEndTime.getUTCHours();
      const endMin = jstEndTime.getUTCMinutes();
      return startHour === 8 && startMin === 0 && 
             endHour === 8 && endMin === 30;
    });

    if (!targetRecord) {
      console.error('❌ 8:00-8:30の訪問記録が見つかりませんでした');
      console.log('   見つかった記録:');
      records.forEach(record => {
        if (record.actualStartTime && record.actualEndTime) {
          const startTime = new Date(record.actualStartTime);
          const endTime = new Date(record.actualEndTime);
          // UTC時刻をJSTに変換
          const jstStart = new Date(startTime.getTime() + 9 * 60 * 60 * 1000);
          const jstEnd = new Date(endTime.getTime() + 9 * 60 * 60 * 1000);
          const startStr = `${jstStart.getUTCHours().toString().padStart(2, '0')}:${jstStart.getUTCMinutes().toString().padStart(2, '0')}`;
          const endStr = `${jstEnd.getUTCHours().toString().padStart(2, '0')}:${jstEnd.getUTCMinutes().toString().padStart(2, '0')}`;
          console.log(`   - ${startStr} - ${endStr} (ID: ${record.id}, isDischargeDate: ${record.isDischargeDate})`);
        } else {
          console.log(`   - 時刻未設定 (ID: ${record.id}, isDischargeDate: ${record.isDischargeDate})`);
        }
      });
      // 8:00-8:30が見つからない場合でも、isDischargeDateがtrueの記録を確認
      const dischargeRecords = records.filter(r => r.isDischargeDate);
      if (dischargeRecords.length > 0) {
        console.log('\n   ⚠️  退院日当日の訪問フラグがtrueの記録が見つかりました:');
        dischargeRecords.forEach(record => {
          console.log(`   - ID: ${record.id}, 訪問日: ${record.visitDate}`);
        });
        console.log('\n   これらの記録について調査を続けます...');
        // 最初の退院日記録を使用
        const firstDischargeRecord = dischargeRecords[0];
        // この記録について調査を続ける
        await investigateRecord(firstDischargeRecord, patient, db, visitDate);
        return;
      }
      process.exit(1);
    }

    console.log(`✅ 対象記録ID: ${targetRecord.id}`);
    console.log(`   訪問日: ${targetRecord.visitDate}`);
    console.log(`   訪問時間: ${targetRecord.actualStartTime ? new Date(targetRecord.actualStartTime).toLocaleString('ja-JP') : 'N/A'} - ${targetRecord.actualEndTime ? new Date(targetRecord.actualEndTime).toLocaleString('ja-JP') : 'N/A'}`);
    console.log(`   退院日当日の訪問: ${targetRecord.isDischargeDate ? '✅ true' : '❌ false'}`);
    console.log('');

    // 4. 加算マスタの確認
    console.log('📋 3. 退院時支援指導加算の加算マスタを確認中...');
    const visitDateObj = new Date(visitDate);
    const visitDateStr = visitDateObj.toISOString().split('T')[0];

    const bonusMasters = await db.query.bonusMaster.findMany({
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
        eq(bonusMaster.isActive, true)
      ),
    });

    const dischargeBonuses = bonusMasters.filter(b => 
      b.bonusCode === 'discharge_support_guidance_basic' || 
      b.bonusCode === 'discharge_support_guidance_long'
    );

    console.log(`✅ 適用可能な加算マスタ数: ${bonusMasters.length}件`);
    console.log(`   退院時支援指導加算マスタ数: ${dischargeBonuses.length}件`);

    if (dischargeBonuses.length === 0) {
      console.log('\n❌ 【原因1】退院時支援指導加算の加算マスタが有効になっていません');
      console.log('   確認事項:');
      console.log('   - 加算マスタが存在するか');
      console.log('   - isActive = true になっているか');
      console.log('   - validFrom <= 2025-11-06 かつ validTo >= 2025-11-06 になっているか');
      console.log('   - facilityIdが一致するか、またはnull（グローバル）か');
      console.log('   - insuranceTypeが医療保険（medical）になっているか');
    } else {
      dischargeBonuses.forEach(bonus => {
        console.log(`\n   - ${bonus.bonusCode}: ${bonus.bonusName}`);
        console.log(`     有効期間: ${bonus.validFrom} ～ ${bonus.validTo || '無期限'}`);
        console.log(`     点数タイプ: ${bonus.pointsType}`);
      });
    }
    console.log('');

    // 5. サービスコードの確認
    console.log('📋 4. 退院時支援指導加算のサービスコードを確認中...');
    const serviceCodes = await db.query.nursingServiceCodes.findMany({
      where: and(
        eq(nursingServiceCodes.insuranceType, patient.insuranceType as 'medical' | 'care'),
        eq(nursingServiceCodes.isActive, true),
        lte(nursingServiceCodes.validFrom, visitDateStr),
        or(
          isNull(nursingServiceCodes.validTo),
          gte(nursingServiceCodes.validTo, visitDateStr)
        ),
        or(
          eq(nursingServiceCodes.serviceCode, '550001170'),
          eq(nursingServiceCodes.serviceCode, '550001270')
        )
      ),
    });

    console.log(`✅ 適用可能なサービスコード数: ${serviceCodes.length}件`);

    if (serviceCodes.length === 0) {
      console.log('\n❌ 【原因2】退院時支援指導加算のサービスコードが存在しません');
      console.log('   確認事項:');
      console.log('   - サービスコード 550001170（基本）が存在するか');
      console.log('   - サービスコード 550001270（長時間）が存在するか');
      console.log('   - isActive = true になっているか');
      console.log('   - validFrom <= 2025-11-06 かつ validTo >= 2025-11-06 になっているか');
      console.log('   - insuranceTypeが医療保険（medical）になっているか');
    } else {
      serviceCodes.forEach(code => {
        console.log(`\n   - ${code.serviceCode}: ${code.serviceName}`);
        console.log(`     点数: ${code.points}点`);
        console.log(`     有効期間: ${code.validFrom} ～ ${code.validTo || '無期限'}`);
      });
    }
    console.log('');

    // 6. 加算計算履歴の確認
    console.log('📋 5. 加算計算履歴を確認中...');
    const bonusHistory = await db.query.bonusCalculationHistory.findMany({
      where: eq(bonusCalculationHistory.nursingRecordId, targetRecord.id),
    });

    console.log(`✅ 加算計算履歴数: ${bonusHistory.length}件`);

    const dischargeHistory = bonusHistory.filter(h => 
      h.bonusCode === 'discharge_support_guidance_basic' || 
      h.bonusCode === 'discharge_support_guidance_long'
    );

    if (dischargeHistory.length === 0) {
      console.log('\n❌ 【原因3】退院時支援指導加算の計算履歴が存在しません');
      console.log('   計算が実行されていないか、条件を満たしていない可能性があります');
    } else {
      console.log(`   退院時支援指導加算の履歴数: ${dischargeHistory.length}件`);
      dischargeHistory.forEach(h => {
        console.log(`\n   - ${h.bonusCode}: ${h.bonusName}`);
        console.log(`     計算点数: ${h.calculatedPoints}点`);
        console.log(`     サービスコードID: ${h.serviceCodeId || '未設定'}`);
        console.log(`     選択理由: ${h.selectionReason || 'N/A'}`);
        console.log(`     計算日時: ${h.calculatedAt ? new Date(h.calculatedAt).toLocaleString('ja-JP') : 'N/A'}`);
      });
    }
    console.log('');

    // 7. 訪問時間の確認（長時間加算用）
    if (targetRecord.actualStartTime && targetRecord.actualEndTime) {
      const startTime = new Date(targetRecord.actualStartTime);
      const endTime = new Date(targetRecord.actualEndTime);
      const durationMinutes = (endTime.getTime() - startTime.getTime()) / (1000 * 60);
      
      console.log('📋 6. 訪問時間を確認中...');
      console.log(`   訪問時間: ${durationMinutes}分`);
      console.log(`   長時間加算の条件（90分超）: ${durationMinutes > 90 ? '✅ 満たしている' : '❌ 満たしていない'}`);
      console.log('');
    }

    // 8. 総合判定
    console.log('='.repeat(80));
    console.log('【総合判定】');
    console.log('='.repeat(80));
    console.log('');

    const issues: string[] = [];

    if (!targetRecord.isDischargeDate) {
      issues.push('❌ 訪問記録の「退院日当日の訪問」フラグがfalseになっています');
    }

    if (dischargeBonuses.length === 0) {
      issues.push('❌ 退院時支援指導加算の加算マスタが有効になっていません');
    }

    if (serviceCodes.length === 0) {
      issues.push('❌ 退院時支援指導加算のサービスコードが存在しません');
    }

    if (dischargeHistory.length === 0 && targetRecord.isDischargeDate) {
      issues.push('❌ 加算計算が実行されていません（条件を満たしているのに計算履歴がない）');
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

investigateDischargeBonus().catch(console.error);

