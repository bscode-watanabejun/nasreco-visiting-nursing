/**
 * 高橋 次郎の12月分レセプトで24時間対応体制加算が適用されない問題を調査するスクリプト
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from '../shared/schema';
import { eq, and, gte, lte, inArray, isNull } from 'drizzle-orm';

neonConfig.webSocketConstructor = ws;

async function debug24hBonusTakahashi() {
  const dbUrl = process.env.DATABASE_URL;
  
  if (!dbUrl) {
    console.error('❌ DATABASE_URL環境変数が設定されていません');
    process.exit(1);
  }
  
  console.log('🔍 高橋 次郎の12月分レセプトで24時間対応体制加算が適用されない問題を調査中...\n');

  const pool = new Pool({ connectionString: dbUrl });
  const db = drizzle({ client: pool, schema });

  try {
    // 1. 高橋 次郎の患者情報を取得
    const patient = await db.query.patients.findFirst({
      where: eq(schema.patients.lastName, '高橋'),
    });

    if (!patient) {
      console.error('❌ 高橋 次郎の患者情報が見つかりません');
      return;
    }

    console.log('📋 患者情報:');
    console.log(`  患者番号: ${patient.patientNumber}`);
    console.log(`  氏名: ${patient.lastName} ${patient.firstName}`);
    console.log(`  保険種別: ${patient.insuranceType}`);
    console.log('');

    // 2. 12月分のレセプトを取得（2024年または2025年）
    let receipt = await db.query.monthlyReceipts.findFirst({
      where: and(
        eq(schema.monthlyReceipts.patientId, patient.id),
        eq(schema.monthlyReceipts.targetYear, 2024),
        eq(schema.monthlyReceipts.targetMonth, 12)
      ),
    });

    if (!receipt) {
      receipt = await db.query.monthlyReceipts.findFirst({
        where: and(
          eq(schema.monthlyReceipts.patientId, patient.id),
          eq(schema.monthlyReceipts.targetYear, 2025),
          eq(schema.monthlyReceipts.targetMonth, 12)
        ),
      });
    }

    if (!receipt) {
      console.error('❌ 12月分のレセプトが見つかりません');
      return;
    }

    console.log('📋 レセプト情報:');
    console.log(`  レセプトID: ${receipt.id}`);
    console.log(`  対象年月: ${receipt.targetYear}年${receipt.targetMonth}月`);
    console.log(`  保険種別: ${receipt.insuranceType}`);
    console.log('');

    // 3. 施設情報を取得して24時間対応体制加算の設定を確認
    const facility = await db.query.facilities.findFirst({
      where: eq(schema.facilities.id, receipt.facilityId),
    });

    if (!facility) {
      console.error('❌ 施設情報が見つかりません');
      return;
    }

    console.log('📋 施設情報:');
    console.log(`  施設名: ${facility.name}`);
    console.log(`  24時間対応体制加算（基本）: ${facility.has24hSupportSystem ? '有効' : '無効'}`);
    console.log(`  24時間対応体制加算（看護業務負担軽減）: ${facility.has24hSupportSystemEnhanced ? '有効' : '無効'}`);
    if (facility.has24hSupportSystemEnhanced) {
      console.log(`  看護業務負担軽減の取り組み: ${JSON.stringify(facility.burdenReductionMeasures)}`);
    }
    console.log('');

    // 4. 12月分の訪問記録を取得
    const targetYear = receipt.targetYear;
    const startDate = new Date(targetYear, 11, 1); // 12月1日
    const endDate = new Date(targetYear, 11, 31); // 12月31日

    const records = await db.query.nursingRecords.findMany({
      where: and(
        eq(schema.nursingRecords.patientId, patient.id),
        eq(schema.nursingRecords.facilityId, receipt.facilityId),
        gte(schema.nursingRecords.visitDate, startDate.toISOString().split('T')[0]),
        lte(schema.nursingRecords.visitDate, endDate.toISOString().split('T')[0]),
        eq(schema.nursingRecords.status, 'completed')
      ),
      orderBy: [schema.nursingRecords.visitDate, schema.nursingRecords.actualStartTime],
    });

    console.log(`📋 12月分の訪問記録: ${records.length}件`);
    console.log('');

    // 5. 訪問記録をソート（実装と同じロジック）
    const sortedRecords = [...records].sort((a, b) => {
      // 1. 訪問日で比較
      const dateA = typeof a.visitDate === 'string' ? new Date(a.visitDate) : a.visitDate;
      const dateB = typeof b.visitDate === 'string' ? new Date(b.visitDate) : b.visitDate;
      const dateDiff = dateA.getTime() - dateB.getTime();
      if (dateDiff !== 0) return dateDiff;
      
      // 2. 同じ日付の場合、訪問開始時刻で比較
      const timeA = a.actualStartTime ? (typeof a.actualStartTime === 'string' ? new Date(a.actualStartTime).getTime() : a.actualStartTime.getTime()) : Infinity;
      const timeB = b.actualStartTime ? (typeof b.actualStartTime === 'string' ? new Date(b.actualStartTime).getTime() : b.actualStartTime.getTime()) : Infinity;
      return timeA - timeB;
    });

    console.log('📋 ソート後の訪問記録:');
    sortedRecords.forEach((record, index) => {
      const visitDate = typeof record.visitDate === 'string' ? record.visitDate : record.visitDate.toISOString().split('T')[0];
      const startTime = record.actualStartTime 
        ? (typeof record.actualStartTime === 'string' ? new Date(record.actualStartTime).toLocaleString('ja-JP') : record.actualStartTime.toLocaleString('ja-JP'))
        : '未設定';
      console.log(`  ${index + 1}. ID: ${record.id}, 訪問日: ${visitDate}, 開始時刻: ${startTime}${index === 0 ? ' ← 最初の訪問記録' : ''}`);
    });
    console.log('');

    const firstRecordId = sortedRecords.length > 0 ? sortedRecords[0].id : null;
    console.log(`📋 最初の訪問記録ID: ${firstRecordId}`);
    console.log('');

    // 6. 24時間対応体制加算の加算マスタを取得
    const bonusMasters = await db.query.bonusMaster.findMany({
      where: inArray(schema.bonusMaster.bonusCode, ['24h_response_system_basic', '24h_response_system_enhanced']),
    });

    console.log('📋 24時間対応体制加算の加算マスタ:');
    bonusMasters.forEach(bonus => {
      console.log(`  ${bonus.bonusCode}: ${bonus.bonusName} (${bonus.fixedPoints}点, アクティブ: ${bonus.isActive})`);
      console.log(`    適用条件: ${JSON.stringify(bonus.predefinedConditions, null, 2)}`);
    });
    console.log('');

    // 7. 各訪問記録の加算履歴を確認
    console.log('📋 各訪問記録の加算履歴:');
    for (const record of sortedRecords) {
      const visitDate = typeof record.visitDate === 'string' ? record.visitDate : record.visitDate.toISOString().split('T')[0];
      const isFirst = record.id === firstRecordId;
      
      const bonusHistory = await db.select({
        history: schema.bonusCalculationHistory,
        bonus: schema.bonusMaster,
      })
        .from(schema.bonusCalculationHistory)
        .leftJoin(schema.bonusMaster, eq(schema.bonusCalculationHistory.bonusMasterId, schema.bonusMaster.id))
        .where(eq(schema.bonusCalculationHistory.nursingRecordId, record.id));

      const has24hBonus = bonusHistory.some(h => 
        h.bonus && (h.bonus.bonusCode === '24h_response_system_basic' || 
        h.bonus.bonusCode === '24h_response_system_enhanced')
      );

      console.log(`  訪問記録ID: ${record.id} (訪問日: ${visitDate}${isFirst ? ', 最初の訪問記録' : ''})`);
      console.log(`    24時間対応体制加算: ${has24hBonus ? '✅ 適用済み' : '❌ 未適用'}`);
      
      if (has24hBonus) {
        const bonus24h = bonusHistory.find(h => 
          h.bonus && (h.bonus.bonusCode === '24h_response_system_basic' || 
          h.bonus.bonusCode === '24h_response_system_enhanced')
        );
        if (bonus24h && bonus24h.bonus) {
          console.log(`      加算コード: ${bonus24h.bonus.bonusCode}`);
          console.log(`      加算名: ${bonus24h.bonus.bonusName}`);
          console.log(`      点数: ${bonus24h.history.calculatedPoints}`);
        }
      }
      console.log(`    全加算履歴数: ${bonusHistory.length}件`);
      if (bonusHistory.length > 0) {
        bonusHistory.forEach((h, idx) => {
          if (h.bonus) {
            console.log(`      ${idx + 1}. ${h.bonus.bonusCode}: ${h.bonus.bonusName} (${h.history.calculatedPoints}点)`);
          }
        });
      }
      console.log('');
    }

    // 8. 月次制限のチェック（12月分で既に適用されているか）
    console.log('📋 月次制限のチェック:');
    const decemberStart = new Date(targetYear, 11, 1);
    const decemberEnd = new Date(targetYear, 11, 31, 23, 59, 59);

    for (const bonusMaster of bonusMasters) {
      const existingHistory = await db.select({
        history: schema.bonusCalculationHistory,
        nursingRecord: schema.nursingRecords,
      })
        .from(schema.bonusCalculationHistory)
        .innerJoin(schema.nursingRecords, eq(schema.bonusCalculationHistory.nursingRecordId, schema.nursingRecords.id))
        .where(and(
          eq(schema.bonusCalculationHistory.bonusMasterId, bonusMaster.id),
          inArray(schema.bonusCalculationHistory.nursingRecordId, records.map(r => r.id)),
          inArray(schema.nursingRecords.status, ['completed', 'reviewed'])
        ));

      console.log(`  ${bonusMaster.bonusCode}: ${existingHistory.length}件の履歴が存在`);
      if (existingHistory.length > 0) {
        existingHistory.forEach(h => {
          const visitDate = typeof h.nursingRecord.visitDate === 'string' 
            ? h.nursingRecord.visitDate 
            : h.nursingRecord.visitDate.toISOString().split('T')[0];
          console.log(`    訪問記録ID: ${h.history.nursingRecordId}, 訪問日: ${visitDate}`);
        });
      }
    }
    console.log('');

    // 9. 実際にrecalculateBonusesForReceiptを実行してログを確認
    console.log('📋 実際にrecalculateBonusesForReceiptを実行してログを確認:');
    console.log('   (このスクリプトでは実行しませんが、サーバーログを確認してください)');
    console.log('');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// 実行
debug24hBonusTakahashi()
  .then(() => {
    console.log('\n✨ スクリプトが正常に完了しました');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ スクリプトの実行中にエラーが発生しました:', error);
    process.exit(1);
  });

