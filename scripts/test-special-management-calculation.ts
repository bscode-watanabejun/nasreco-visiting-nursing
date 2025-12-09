/**
 * 本番環境で特別管理加算の計算ロジックを検証するスクリプト
 * 
 * 実際の患者データと訪問記録を使って、加算計算が正しく実行されるか確認します。
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from '../shared/schema';
import { eq, and } from 'drizzle-orm';
import { calculateBonuses } from '../server/bonus-engine';

neonConfig.webSocketConstructor = ws;

const PROD_DB_URL = 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function testSpecialManagementCalculation() {
  console.log('🔍 本番環境で特別管理加算の計算ロジックを検証\n');
  console.log('⚠️  本番データベースに接続します（読み取り専用）\n');
  
  const pool = new Pool({ connectionString: PROD_DB_URL });
  const db = drizzle({ client: pool, schema });

  try {
    // 1. テストクリニックの施設IDを取得
    const facility = await db.query.facilities.findFirst({
      where: eq(schema.facilities.name, 'テストクリニック')
    });
    
    if (!facility) {
      console.log('❌ テストクリニックが見つかりませんでした。');
      await pool.end();
      return;
    }
    
    console.log(`📊 施設: ${facility.name} (ID: ${facility.id})\n`);

    // 2. 特別管理加算設定がある患者を取得
    const patient = await db.query.patients.findFirst({
      where: and(
        eq(schema.patients.facilityId, facility.id),
        eq(schema.patients.specialManagementTypes, ['oxygen'])
      )
    });
    
    if (!patient) {
      console.log('❌ 特別管理加算設定がある患者が見つかりませんでした。');
      await pool.end();
      return;
    }
    
    console.log(`📊 患者: ${patient.lastName} ${patient.firstName}`);
    console.log(`   特別管理項目: ${JSON.stringify(patient.specialManagementTypes)}`);
    console.log(`   開始日: ${patient.specialManagementStartDate || '未設定'}`);
    console.log(`   終了日: ${patient.specialManagementEndDate || '未設定'}`);
    console.log(`   保険種別: ${patient.insuranceType}\n`);

    // 3. 該当患者の訪問記録を取得（最新の1件）
    const record = await db.query.nursingRecords.findFirst({
      where: and(
        eq(schema.nursingRecords.patientId, patient.id),
        eq(schema.nursingRecords.status, 'completed')
      ),
      orderBy: (records, { desc }) => [desc(records.visitDate)]
    });
    
    if (!record) {
      console.log('❌ 訪問記録が見つかりませんでした。');
      await pool.end();
      return;
    }
    
    console.log(`📊 訪問記録: ${record.id}`);
    console.log(`   訪問日: ${record.visitDate}`);
    console.log(`   訪問開始時刻: ${record.actualStartTime || '未設定'}`);
    console.log(`   訪問終了時刻: ${record.actualEndTime || '未設定'}`);
    console.log(`   ステータス: ${record.status}\n`);

    // 4. 施設情報を取得
    const facilityInfo = await db.query.facilities.findFirst({
      where: eq(schema.facilities.id, facility.id)
    });

    // 5. 担当看護師情報を取得
    const nurse = record.nurseId ? await db.query.users.findFirst({
      where: eq(schema.users.id, record.nurseId),
      columns: {
        id: true,
        fullName: true,
        specialistCertifications: true,
      }
    }) : undefined;

    // 6. 患者年齢を計算
    let patientAge: number | undefined;
    if (patient.dateOfBirth) {
      const birthDate = new Date(patient.dateOfBirth);
      const visitDate = new Date(record.visitDate);
      patientAge = visitDate.getFullYear() - birthDate.getFullYear();
      const monthDiff = visitDate.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && visitDate.getDate() < birthDate.getDate())) {
        patientAge--;
      }
    }

    // 7. BonusCalculationContextを構築
    const visitDate = new Date(record.visitDate);
    const visitStartTime = record.actualStartTime ? new Date(record.actualStartTime) : null;
    const visitEndTime = record.actualEndTime ? new Date(record.actualEndTime) : null;

    const context = {
      nursingRecordId: record.id,
      patientId: patient.id,
      facilityId: facility.id,
      visitDate: visitDate,
      visitStartTime: visitStartTime,
      visitEndTime: visitEndTime,
      isSecondVisit: record.isSecondVisit || false,
      emergencyVisitReason: record.emergencyVisitReason || null,
      multipleVisitReason: record.multipleVisitReason || null,
      longVisitReason: record.longVisitReason || null,
      patientAge,
      buildingId: patient.buildingId || null,
      insuranceType: (patient.insuranceType || 'medical') as 'medical' | 'care',
      isDischargeDate: record.isDischargeDate || false,
      isFirstVisitOfPlan: record.isFirstVisitOfPlan || false,
      hasCollaborationRecord: record.hasCollaborationRecord || false,
      isTerminalCare: record.isTerminalCare || false,
      lastDischargeDate: patient.lastDischargeDate ? new Date(patient.lastDischargeDate) : null,
      lastPlanCreatedDate: patient.lastPlanCreatedDate ? new Date(patient.lastPlanCreatedDate) : null,
      deathDate: patient.deathDate ? new Date(patient.deathDate) : null,
      specialManagementTypes: patient.specialManagementTypes || [],
      specialManagementStartDate: patient.specialManagementStartDate ? new Date(patient.specialManagementStartDate) : null,
      specialManagementEndDate: patient.specialManagementEndDate ? new Date(patient.specialManagementEndDate) : null,
      specialistCareType: (record as any).specialistCareType || null,
      assignedNurse: nurse ? {
        id: nurse.id,
        fullName: nurse.fullName,
        specialistCertifications: nurse.specialistCertifications as string[] | null,
      } : undefined,
      has24hSupportSystem: facilityInfo?.has24hSupportSystem || false,
      has24hSupportSystemEnhanced: facilityInfo?.has24hSupportSystemEnhanced || false,
      hasEmergencySupportSystem: facilityInfo?.hasEmergencySupportSystem || false,
      hasEmergencySupportSystemEnhanced: facilityInfo?.hasEmergencySupportSystemEnhanced || false,
      burdenReductionMeasures: facilityInfo?.burdenReductionMeasures || [],
      isReceiptRecalculation: false,
    };

    console.log('📊 BonusCalculationContext:');
    console.log(`   訪問日: ${context.visitDate.toLocaleDateString('ja-JP')}`);
    console.log(`   特別管理項目: ${JSON.stringify(context.specialManagementTypes)}`);
    console.log(`   開始日: ${context.specialManagementStartDate ? context.specialManagementStartDate.toLocaleDateString('ja-JP') : '未設定'}`);
    console.log(`   終了日: ${context.specialManagementEndDate ? context.specialManagementEndDate.toLocaleDateString('ja-JP') : '未設定'}`);
    console.log(`   保険種別: ${context.insuranceType}\n`);

    // 8. 加算計算を実行
    console.log('📊 加算計算を実行中...\n');
    const bonusResults = await calculateBonuses(context);

    console.log(`📊 加算計算結果: ${bonusResults.length}件\n`);
    bonusResults.forEach((result) => {
      console.log(`   - ${result.bonusName} (${result.bonusCode}): ${result.calculatedPoints}点`);
      if (result.calculationDetails) {
        console.log(`     詳細: ${JSON.stringify(result.calculationDetails, null, 2)}`);
      }
    });

    // 9. 特別管理加算が含まれているか確認
    const specialManagementBonuses = bonusResults.filter(r => 
      r.bonusCode === 'special_management_1' || r.bonusCode === 'special_management_2'
    );

    console.log('\n📊 特別管理加算の適用状況:');
    if (specialManagementBonuses.length === 0) {
      console.log('   ❌ 特別管理加算が適用されていません');
      
      // 理由を調査
      console.log('\n📊 調査:');
      
      // 開始日・終了日の範囲チェック
      if (context.specialManagementStartDate) {
        const startDateOnly = new Date(context.specialManagementStartDate.getFullYear(), context.specialManagementStartDate.getMonth(), context.specialManagementStartDate.getDate());
        const visitDateOnly = new Date(context.visitDate.getFullYear(), context.visitDate.getMonth(), context.visitDate.getDate());
        
        if (visitDateOnly < startDateOnly) {
          console.log(`   ⚠️  訪問日（${visitDateOnly.toLocaleDateString('ja-JP')}）が開始日（${startDateOnly.toLocaleDateString('ja-JP')}）より前です`);
        } else {
          console.log(`   ✅ 訪問日は開始日以降です`);
        }
      } else {
        console.log(`   ⚠️  開始日が未設定です`);
      }
      
      if (context.specialManagementEndDate) {
        const endDateOnly = new Date(context.specialManagementEndDate.getFullYear(), context.specialManagementEndDate.getMonth(), context.specialManagementEndDate.getDate());
        const visitDateOnly = new Date(context.visitDate.getFullYear(), context.visitDate.getMonth(), context.visitDate.getDate());
        
        if (visitDateOnly > endDateOnly) {
          console.log(`   ⚠️  訪問日（${visitDateOnly.toLocaleDateString('ja-JP')}）が終了日（${endDateOnly.toLocaleDateString('ja-JP')}）より後です`);
        } else {
          console.log(`   ✅ 訪問日は終了日以前です`);
        }
      } else {
        console.log(`   ✅ 終了日が未設定（継続中）のため、開始日以降は有効`);
      }
      
      // 特別管理項目の確認
      if (!context.specialManagementTypes || context.specialManagementTypes.length === 0) {
        console.log(`   ⚠️  特別管理項目が設定されていません`);
      } else {
        console.log(`   ✅ 特別管理項目が設定されています: ${JSON.stringify(context.specialManagementTypes)}`);
      }
    } else {
      console.log(`   ✅ 特別管理加算が適用されています: ${specialManagementBonuses.map(b => b.bonusName).join(', ')}`);
    }

    console.log('\n─'.repeat(60));
    console.log('✅ 検証が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

testSpecialManagementCalculation()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('処理中にエラーが発生しました:', error);
    process.exit(1);
  });

