/**
 * Week 3: 専門管理加算の自動テストスクリプト
 */
import { drizzle } from 'drizzle-orm/neon-serverless';
import { neonConfig, Pool } from '@neondatabase/serverless';
import ws from 'ws';
import * as schema from './shared/schema.ts';
import { eq, and, gte, lte, isNull } from 'drizzle-orm';

// Setup WebSocket for Neon
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

// Import bonus engine
const bonusEngine = await import('./server/bonus-engine.ts');

/**
 * テストケースを実行
 */
async function runTest(testName, recordData, expectedBonus, expectedPoints) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📋 ${testName}`);
  console.log(`${'='.repeat(70)}`);

  try {
    // Get patient
    const patient = await db.query.patients.findFirst({
      where: eq(schema.patients.id, recordData.patientId)
    });

    if (!patient) {
      console.log(`❌ 患者が見つかりません: ${recordData.patientId}`);
      return false;
    }

    // Get nurse
    const nurse = await db.query.users.findFirst({
      where: eq(schema.users.id, recordData.nurseId)
    });

    if (!nurse) {
      console.log(`❌ 看護師が見つかりません: ${recordData.nurseId}`);
      return false;
    }

    // Get facility
    const facility = await db.query.facilities.findFirst({
      where: eq(schema.facilities.id, recordData.facilityId)
    });

    console.log(`\n📊 テストデータ:`);
    console.log(`   患者: ${patient.lastName} ${patient.firstName} (${patient.insuranceType || 'medical'}保険)`);
    console.log(`   看護師: ${nurse.fullName}`);
    console.log(`   専門資格: ${nurse.specialistCertifications ? JSON.stringify(nurse.specialistCertifications) : 'なし'}`);
    console.log(`   専門的ケア: ${recordData.specialistCareType || 'なし'}`);
    console.log(`   訪問日: ${recordData.visitDate}`);

    // Build context
    const visitDate = new Date(recordData.visitDate);
    const context = {
      patientId: recordData.patientId,
      nursingRecordId: 'test-id',
      facilityId: recordData.facilityId,
      visitDate: visitDate,
      visitStartTime: recordData.actualStartTime,
      visitEndTime: recordData.actualEndTime,
      actualStartTime: recordData.actualStartTime,
      actualEndTime: recordData.actualEndTime,
      isSecondVisit: false,
      serviceMinutes: 60,
      insuranceType: patient.insuranceType || 'medical',
      careLevel: patient.careLevel,
      specialManagementTypes: patient.specialManagementTypes || [],
      isDischargeDate: false,
      hasCollaborationRecord: false,
      isFirstVisitOfPlan: false,
      isTerminalCare: false,
      terminalCareDeathDate: null,
      multipleVisitReason: null,
      emergencyVisitReason: null,
      longVisitReason: null,
      facilityHas24hSupport: facility?.has24hSupportSystem || false,
      facilityHas24hSupportEnhanced: facility?.has24hSupportSystemEnhanced || false,
      facilityHasEmergencySupport: facility?.hasEmergencySupportSystem || false,
      facilityHasEmergencySupportSystemEnhanced: facility?.hasEmergencySupportSystemEnhanced || false,
      facilityBurdenReductionMeasures: facility?.burdenReductionMeasures || [],
      assignedNurse: {
        id: nurse.id,
        fullName: nurse.fullName,
        specialistCertifications: nurse.specialistCertifications || []
      },
      specialistCareType: recordData.specialistCareType,
      patientAge: 80,
      buildingId: null,
      dailyVisitCount: 1,
    };

    // Calculate bonuses
    console.log(`\n🔄 加算計算を実行中...`);
    const bonusResults = await bonusEngine.calculateBonuses(context);

    console.log(`\n✅ 加算計算結果:`);
    if (bonusResults.length === 0) {
      console.log(`   適用加算なし`);
    } else {
      let totalPoints = 500; // 基本点
      for (const bonus of bonusResults) {
        console.log(`   - ${bonus.bonusName}: ${bonus.calculatedPoints}点`);
        totalPoints += bonus.calculatedPoints;
      }
      console.log(`   合計: ${totalPoints}点`);
    }

    // Verify expected result
    let testPassed = true;
    if (expectedBonus) {
      const foundBonus = bonusResults.find(b => b.bonusCode === expectedBonus);
      if (foundBonus) {
        if (foundBonus.calculatedPoints === expectedPoints) {
          console.log(`\n✅ テスト成功: ${expectedBonus} が ${expectedPoints}点で適用されました`);
        } else {
          console.log(`\n❌ テスト失敗: 期待点数 ${expectedPoints}点 !== 実際 ${foundBonus.calculatedPoints}点`);
          testPassed = false;
        }
      } else {
        console.log(`\n❌ テスト失敗: ${expectedBonus} が適用されませんでした`);
        testPassed = false;
      }
    } else {
      const hasSpecialistBonus = bonusResults.some(b =>
        b.bonusCode === 'specialist_management' || b.bonusCode === 'care_specialist_management'
      );
      if (!hasSpecialistBonus) {
        console.log(`\n✅ テスト成功: 専門管理加算が適用されませんでした（期待通り）`);
      } else {
        console.log(`\n❌ テスト失敗: 専門管理加算が誤って適用されました`);
        testPassed = false;
      }
    }

    return testPassed;

  } catch (error) {
    console.log(`\n❌ エラー: ${error.message}`);
    console.error(error.stack);
    return false;
  }
}

/**
 * メイン処理
 */
async function main() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║         Week 3: 専門管理加算 自動テスト                              ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  const results = [];

  // テストケース1: 医療保険 + 緩和ケア（専門資格あり）
  results.push(await runTest(
    'テストケース1: 医療保険 + 緩和ケア（専門資格あり）',
    {
      patientId: '5df7433b-a4a7-47f2-9763-1a5cc1e9bfc2', // 鈴木太郎（医療保険）
      facilityId: 'fac-osaka-branch',
      nurseId: '2fb29990-4ae7-44bf-b757-200831cefce9', // テストユーザー1（専門資格あり）
      visitDate: '2025-11-02',
      actualStartTime: new Date('2025-11-02T10:00:00'),
      actualEndTime: new Date('2025-11-02T11:00:00'),
      specialistCareType: 'palliative_care',
    },
    'specialist_management',
    2500
  ));

  // テストケース2: 介護保険 + 褥瘡ケア（専門資格あり）
  results.push(await runTest(
    'テストケース2: 介護保険 + 褥瘡ケア（専門資格あり）',
    {
      patientId: 'efa1f003-0b53-45f3-a002-4406d61a9d0f', // 佐藤花子（介護保険）
      facilityId: 'fac-osaka-branch',
      nurseId: '2fb29990-4ae7-44bf-b757-200831cefce9', // テストユーザー1（専門資格あり）
      visitDate: '2025-11-02',
      actualStartTime: new Date('2025-11-02T14:00:00'),
      actualEndTime: new Date('2025-11-02T15:00:00'),
      specialistCareType: 'pressure_ulcer',
    },
    'care_specialist_management',
    250
  ));

  // テストケース3: 専門資格なし
  results.push(await runTest(
    'テストケース3: 専門資格なし（加算適用されないはず）',
    {
      patientId: '5df7433b-a4a7-47f2-9763-1a5cc1e9bfc2', // 鈴木太郎（医療保険）
      facilityId: 'fac-osaka-branch',
      nurseId: '4f9a1e1b-7415-4798-9383-1b471a25cfb8', // 佐藤次郎（専門資格なし）
      visitDate: '2025-11-02',
      actualStartTime: new Date('2025-11-02T16:00:00'),
      actualEndTime: new Date('2025-11-02T17:00:00'),
      specialistCareType: 'palliative_care',
    },
    null, // 加算適用されないことを期待
    0
  ));

  // 結果サマリー
  console.log(`\n\n`);
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║                        テスト結果サマリー                            ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  const passedCount = results.filter(r => r).length;
  const totalCount = results.length;

  console.log(`\n総テスト数: ${totalCount}`);
  console.log(`成功: ${passedCount}`);
  console.log(`失敗: ${totalCount - passedCount}`);

  if (passedCount === totalCount) {
    console.log(`\n✅ 全てのテストが成功しました！ 🎉`);
  } else {
    console.log(`\n❌ 一部のテストが失敗しました`);
  }

  await pool.end();
  process.exit(passedCount === totalCount ? 0 : 1);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
