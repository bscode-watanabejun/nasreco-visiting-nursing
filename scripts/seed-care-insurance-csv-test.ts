/**
 * 介護保険レセプトCSV出力テストデータ作成スクリプト
 * 
 * データマッピング分析ドキュメントに基づき、実装済みの項目を全て確認するためのテストデータを作成
 * 
 * 実行方法:
 *   npx tsx scripts/seed-care-insurance-csv-test.ts
 */

import { db } from '../server/db';
import {
  facilities,
  patients,
  insuranceCards,
  publicExpenseCards,
  serviceCarePlans,
  nursingRecords,
  monthlyReceipts,
  nursingServiceCodes,
  users,
} from '../shared/schema';
import { eq, and, isNotNull, inArray, gte, lte } from 'drizzle-orm';

const TARGET_YEAR = 2025;
const TARGET_MONTH = 11;

async function seedCareInsuranceCsvTest() {
  console.log('🌱 介護保険レセプトCSV出力テストデータ作成を開始します...\n');

  try {
    // ===== 1. 施設情報の取得 =====
    console.log('🏢 施設情報を取得中...');
    const existingFacilities = await db.select()
      .from(facilities)
      .where(eq(facilities.slug, 'test-clinic'));

    if (existingFacilities.length === 0) {
      console.error('❌ テストクリニック (test-clinic) が見つかりません。');
      process.exit(1);
    }

    const facility = existingFacilities[0];
    console.log(`  ✅ 施設: ${facility.name} (ID: ${facility.id})`);
    console.log(`  ✅ 事業所番号: ${facility.facilityCode || '未設定'}`);
    console.log(`  ✅ 都道府県コード: ${facility.prefectureCode || '未設定'}\n`);

    // ===== 2. 介護保険サービスコードの取得 =====
    console.log('📋 介護保険サービスコードを取得中...');
    const careServiceCodes = await db.select()
      .from(nursingServiceCodes)
      .where(and(
        eq(nursingServiceCodes.insuranceType, 'care'),
        eq(nursingServiceCodes.isActive, true)
      ));

    if (careServiceCodes.length === 0) {
      console.error('❌ 介護保険のサービスコードが見つかりません。');
      process.exit(1);
    }

    console.log(`  ✅ 介護保険サービスコード: ${careServiceCodes.length}件`);
    
    // サービスコードを6桁に変換（先頭2桁がサービス種類コード、後4桁がサービス項目コード）
    const serviceCodeMap = new Map<string, typeof careServiceCodes[0]>();
    for (const code of careServiceCodes) {
      // 9桁の場合は先頭6桁を使用、6桁の場合はそのまま
      const sixDigitCode = code.serviceCode.length >= 6 
        ? code.serviceCode.substring(0, 6)
        : code.serviceCode.padStart(6, '0');
      serviceCodeMap.set(sixDigitCode, code);
    }

    // 代表的なサービスコードを選択（130001, 130002, 160001など）
    const selectedServiceCodes = Array.from(serviceCodeMap.values()).slice(0, 3);
    console.log(`  ✅ 使用するサービスコード: ${selectedServiceCodes.map(c => c.serviceCode).join(', ')}\n`);

    // ===== 3. 既存患者の取得 =====
    console.log('👥 既存患者を取得中...');
    const existingPatients = await db.select()
      .from(patients)
      .where(and(
        eq(patients.facilityId, facility.id),
        isNotNull(patients.careLevel)
      ))
      .limit(4);

    if (existingPatients.length === 0) {
      console.error('❌ 要介護状態区分が設定されている患者が見つかりません。');
      process.exit(1);
    }

    console.log(`  ✅ 利用可能な患者: ${existingPatients.length}名`);
    for (const patient of existingPatients) {
      console.log(`    - ${patient.lastName} ${patient.firstName} (要介護状態区分: ${patient.careLevel})`);
    }
    console.log('');

    // ===== 4. ユーザーの取得（訪問記録作成用） =====
    console.log('👤 ユーザーを取得中...');
    const existingUsers = await db.select()
      .from(users)
      .where(and(
        eq(users.facilityId, facility.id),
        eq(users.isActive, true)
      ))
      .limit(1);

    if (existingUsers.length === 0) {
      console.error('❌ アクティブなユーザーが見つかりません。');
      process.exit(1);
    }

    const nurseUser = existingUsers[0];
    console.log(`  ✅ ユーザー: ${nurseUser.fullName}\n`);

    // ===== 5. 介護保険証データの作成 =====
    console.log('💳 介護保険証データを作成中...');
    const insuranceCardDataList = [];
    
    for (let i = 0; i < existingPatients.length; i++) {
      const patient = existingPatients[i];
      
      // 既存の介護保険証を確認
      const existingCards = await db.select()
        .from(insuranceCards)
        .where(and(
          eq(insuranceCards.facilityId, facility.id),
          eq(insuranceCards.patientId, patient.id),
          eq(insuranceCards.cardType, 'long_term_care'),
          eq(insuranceCards.isActive, true)
        ));

      if (existingCards.length > 0) {
        console.log(`  ⚠️  患者 ${patient.lastName} ${patient.firstName} には既に介護保険証が存在します。スキップします。`);
        continue;
      }

      // 負担割合を設定（10%, 20%, 30%のパターン）
      const copaymentRates: Array<'10' | '20' | '30'> = ['10', '20', '10', '30'];
      const copaymentRate = copaymentRates[i] || '10';

      // 保険者番号8桁、被保険者番号10桁を生成
      const insurerNumber = `1312345${i}`.padStart(8, '0');
      const insuredNumber = `20240000${i}`.padStart(10, '0');

      const insuranceCardData = {
        facilityId: facility.id,
        patientId: patient.id,
        cardType: 'long_term_care' as const,
        insurerNumber: insurerNumber,
        insuredNumber: insuredNumber,
        copaymentRate: copaymentRate as '10' | '20' | '30',
        validFrom: '2024-01-01',
        validUntil: '2026-12-31',
        certificationDate: '2023-12-01',
        isActive: true,
      };

      insuranceCardDataList.push(insuranceCardData);
    }

    if (insuranceCardDataList.length > 0) {
      await db.insert(insuranceCards).values(insuranceCardDataList);
      console.log(`  ✅ 介護保険証 ${insuranceCardDataList.length}件を作成しました\n`);
    } else {
      console.log(`  ✅ 既存の介護保険証を使用します\n`);
    }

    // ===== 6. 公費情報データの作成 =====
    console.log('💰 公費情報データを作成中...');
    const publicExpenseDataList = [];

    // 患者2, 3, 4に公費情報を追加
    const publicExpensePatterns = [
      null, // 患者1: 公費なし
      [{ priority: 1, legalCategoryNumber: '10', beneficiaryNumber: '12345678', recipientNumber: '1234567' }], // 患者2: 公費1（生活保護）
      [
        { priority: 1, legalCategoryNumber: '51', beneficiaryNumber: '23456789', recipientNumber: '2345678' }, // 公費1（特定疾患）
        { priority: 2, legalCategoryNumber: '54', beneficiaryNumber: '34567890', recipientNumber: '3456789' }, // 公費2（指定難病）
      ],
      [
        { priority: 1, legalCategoryNumber: '30', beneficiaryNumber: '45678901', recipientNumber: null }, // 公費1（医療観察法、受給者番号なし）
        { priority: 2, legalCategoryNumber: '21', beneficiaryNumber: '56789012', recipientNumber: '4567890' }, // 公費2（精神通院医療）
        { priority: 3, legalCategoryNumber: '28', beneficiaryNumber: '67890123', recipientNumber: '5678901' }, // 公費3（小児慢性特定疾病）
      ],
    ];

    for (let i = 1; i < existingPatients.length && i < publicExpensePatterns.length; i++) {
      const patient = existingPatients[i];
      const pattern = publicExpensePatterns[i];

      if (!pattern) continue;

      // 既存の公費情報を確認
      const existingPublicExpenses = await db.select()
        .from(publicExpenseCards)
        .where(and(
          eq(publicExpenseCards.facilityId, facility.id),
          eq(publicExpenseCards.patientId, patient.id),
          eq(publicExpenseCards.isActive, true)
        ));

      if (existingPublicExpenses.length > 0) {
        console.log(`  ⚠️  患者 ${patient.lastName} ${patient.firstName} には既に公費情報が存在します。スキップします。`);
        continue;
      }

      for (const pe of pattern) {
        publicExpenseDataList.push({
          facilityId: facility.id,
          patientId: patient.id,
          beneficiaryNumber: pe.beneficiaryNumber,
          recipientNumber: pe.recipientNumber,
          legalCategoryNumber: pe.legalCategoryNumber,
          priority: pe.priority,
          validFrom: '2024-01-01',
          validUntil: '2026-12-31',
          isActive: true,
        });
      }
    }

    if (publicExpenseDataList.length > 0) {
      await db.insert(publicExpenseCards).values(publicExpenseDataList);
      console.log(`  ✅ 公費情報 ${publicExpenseDataList.length}件を作成しました\n`);
    } else {
      console.log(`  ✅ 既存の公費情報を使用します\n`);
    }

    // ===== 7. 居宅サービス計画データの作成 =====
    console.log('📝 居宅サービス計画データを作成中...');
    const serviceCarePlanDataList = [];

    for (const patient of existingPatients) {
      // 既存の居宅サービス計画を確認
      const existingPlans = await db.select()
        .from(serviceCarePlans)
        .where(and(
          eq(serviceCarePlans.facilityId, facility.id),
          eq(serviceCarePlans.patientId, patient.id),
          eq(serviceCarePlans.isActive, true)
        ));

      if (existingPlans.length > 0) {
        console.log(`  ⚠️  患者 ${patient.lastName} ${patient.firstName} には既に居宅サービス計画が存在します。スキップします。`);
        continue;
      }

      serviceCarePlanDataList.push({
        facilityId: facility.id,
        patientId: patient.id,
        planType: 'initial' as const,
        planNumber: `SCP-${patient.patientNumber}-202510`,
        planDate: '2025-10-01',
        initialPlanDate: '2025-10-01',
        certificationDate: '2023-12-01',
        certificationPeriodStart: '2024-01-01',
        certificationPeriodEnd: '2026-12-31',
        isActive: true,
      });
    }

    if (serviceCarePlanDataList.length > 0) {
      await db.insert(serviceCarePlans).values(serviceCarePlanDataList);
      console.log(`  ✅ 居宅サービス計画 ${serviceCarePlanDataList.length}件を作成しました\n`);
    } else {
      console.log(`  ✅ 既存の居宅サービス計画を使用します\n`);
    }

    // ===== 8. 訪問記録データの作成 =====
    console.log('📋 訪問記録データを作成中（2025年11月、介護保険）...');
    
    // 2025年11月の既存訪問記録を確認（介護保険のサービスコードのみ）
    const startDate = `${TARGET_YEAR}-${String(TARGET_MONTH).padStart(2, '0')}-01`;
    const endDate = `${TARGET_YEAR}-${String(TARGET_MONTH).padStart(2, '0')}-30`;

    const existingRecords = await db.select({
      record: nursingRecords,
      serviceCode: nursingServiceCodes,
    })
      .from(nursingRecords)
      .leftJoin(nursingServiceCodes, eq(nursingRecords.serviceCodeId, nursingServiceCodes.id))
      .where(and(
        eq(nursingRecords.facilityId, facility.id),
        inArray(nursingRecords.patientId, existingPatients.map(p => p.id)),
        gte(nursingRecords.visitDate, startDate),
        lte(nursingRecords.visitDate, endDate),
        eq(nursingServiceCodes.insuranceType, 'care') // 介護保険のサービスコードのみ
      ));

    // 既存の介護保険訪問記録がある患者IDを取得
    const existingRecordPatientIds = new Set(existingRecords.map(r => r.record.patientId));
    const patientsNeedingRecords = existingPatients.filter(p => !existingRecordPatientIds.has(p.id));

    if (patientsNeedingRecords.length === 0) {
      console.log(`  ✅ 全患者の介護保険訪問記録が既に存在します（${existingRecords.length}件）。既存データを使用します。\n`);
    } else {
      console.log(`  ⚠️  ${patientsNeedingRecords.length}名の患者に介護保険訪問記録がありません。作成します。`);
      
      const nursingRecordDataList = [];
      const visitPatterns = [
        { serviceCode: selectedServiceCodes[0]?.serviceCode || '130001', visitsPerWeek: 2 }, // 患者1: 週2回
        { serviceCode: selectedServiceCodes[0]?.serviceCode || '130001', visitsPerWeek: 3 }, // 患者2: 週3回
        { serviceCode: selectedServiceCodes[2]?.serviceCode || '160001', visitsPerWeek: 1 }, // 患者3: 週1回
        { serviceCode: selectedServiceCodes[1]?.serviceCode || '130002', visitsPerWeek: 4 }, // 患者4: 週4回
      ];

      for (let i = 0; i < patientsNeedingRecords.length; i++) {
        const patient = patientsNeedingRecords[i];
        const originalIndex = existingPatients.findIndex(p => p.id === patient.id);
        const pattern = visitPatterns[originalIndex] || visitPatterns[0];
        
        // サービスコードを取得（介護保険のサービスコードのみ）
        const serviceCode = selectedServiceCodes.find(c => 
          c.insuranceType === 'care' && c.serviceCode.startsWith(pattern.serviceCode.substring(0, 6))
        ) || selectedServiceCodes.find(c => c.insuranceType === 'care') || selectedServiceCodes[0];

        if (!serviceCode || serviceCode.insuranceType !== 'care') {
          console.log(`  ⚠️  患者 ${patient.lastName} ${patient.firstName} に適切な介護保険サービスコードが見つかりません。スキップします。`);
          continue;
        }

        // 2025年11月の訪問日を生成
        const totalVisits = pattern.visitsPerWeek * 4; // 4週間分
        const visitDates: string[] = [];
        
        for (let week = 0; week < 4; week++) {
          for (let day = 0; day < pattern.visitsPerWeek; day++) {
            const dayOfMonth = week * 7 + day * 2 + 1; // 週2回の場合は1, 3, 8, 10...のように分散
            if (dayOfMonth <= 30) {
              visitDates.push(`${TARGET_YEAR}-${String(TARGET_MONTH).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`);
            }
          }
        }

        // 訪問記録を作成
        for (const visitDate of visitDates.slice(0, totalVisits)) {
          nursingRecordDataList.push({
            facilityId: facility.id,
            patientId: patient.id,
            nurseId: nurseUser.id,
            title: '訪問看護記録', // タイトル（必須）
            recordDate: new Date(`${visitDate}T10:00:00`), // 記録日時（必須）
            visitDate: visitDate,
            serviceCodeId: serviceCode.id,
            visitLocationCode: '01',
            staffQualificationCode: '01',
            status: 'completed' as const,
            recordType: 'general_care' as const,
            recordStatus: 'completed' as const,
            visitStatus: 'completed' as const,
            visitStartTime: '10:00',
            visitEndTime: '11:00',
            content: 'バイタルサイン測定、療養指導',
            isActive: true,
          });
        }
      }

      if (nursingRecordDataList.length > 0) {
        await db.insert(nursingRecords).values(nursingRecordDataList);
        console.log(`  ✅ 訪問記録 ${nursingRecordDataList.length}件を作成しました\n`);
      }
    }

    // ===== 9. 月次レセプトデータの作成 =====
    console.log('📊 月次レセプトデータを作成中（2025年11月、介護保険）...');
    
    // 既存の介護保険月次レセプトを確認
    const existingCareReceipts = await db.select()
      .from(monthlyReceipts)
      .where(and(
        eq(monthlyReceipts.facilityId, facility.id),
        eq(monthlyReceipts.targetYear, TARGET_YEAR),
        eq(monthlyReceipts.targetMonth, TARGET_MONTH),
        eq(monthlyReceipts.insuranceType, 'care'),
        inArray(monthlyReceipts.patientId, existingPatients.map(p => p.id))
      ));

    const existingCareReceiptPatientIds = new Set(existingCareReceipts.map(r => r.patientId));
    const patientsNeedingCareReceipts = existingPatients.filter(p => !existingCareReceiptPatientIds.has(p.id));

    if (patientsNeedingCareReceipts.length === 0) {
      console.log(`  ✅ 全患者の介護保険月次レセプトが既に存在します（${existingCareReceipts.length}件）。既存データを使用します。\n`);
    } else {
      console.log(`  ⚠️  ${patientsNeedingCareReceipts.length}名の患者に介護保険月次レセプトがありません。作成します。`);
      
      // 訪問記録から集計して月次レセプトを作成
      const monthlyReceiptDataList = [];

      for (const patient of patientsNeedingCareReceipts) {
        // 2025年11月の訪問記録を取得（介護保険のサービスコードのみ）
        const patientRecords = await db.select({
          record: nursingRecords,
          serviceCode: nursingServiceCodes,
        })
          .from(nursingRecords)
          .leftJoin(nursingServiceCodes, eq(nursingRecords.serviceCodeId, nursingServiceCodes.id))
          .where(and(
            eq(nursingRecords.facilityId, facility.id),
            eq(nursingRecords.patientId, patient.id),
            eq(nursingRecords.status, 'completed'),
            eq(nursingServiceCodes.insuranceType, 'care') // 介護保険のサービスコードのみ
          ));

        const novemberRecords = patientRecords.filter(r => {
          const recordDate = r.record.visitDate;
          return recordDate >= startDate && recordDate <= endDate && recordDate !== null && r.serviceCode !== null;
        });

        if (novemberRecords.length === 0) {
          console.log(`  ⚠️  患者 ${patient.lastName} ${patient.firstName} の2025年11月の介護保険訪問記録が見つかりません。スキップします。`);
          continue;
        }

        // 訪問回数、単位数、金額を計算
        const visitCount = novemberRecords.length;
        let totalPoints = 0;
        
        for (const record of novemberRecords) {
          if (record.serviceCode) {
            totalPoints += record.serviceCode.points || 0;
          }
        }

        // 金額計算（1単位=10円）
        const totalAmount = totalPoints * 10;

        monthlyReceiptDataList.push({
          facilityId: facility.id,
          patientId: patient.id,
          targetYear: TARGET_YEAR,
          targetMonth: TARGET_MONTH,
          insuranceType: 'care' as const,
          visitCount: visitCount,
          totalVisitPoints: totalPoints,
          totalPoints: totalPoints,
          totalAmount: totalAmount,
          isConfirmed: false,
          isSent: false,
        });
      }

      if (monthlyReceiptDataList.length > 0) {
        await db.insert(monthlyReceipts).values(monthlyReceiptDataList);
        console.log(`  ✅ 介護保険月次レセプト ${monthlyReceiptDataList.length}件を作成しました\n`);
      } else {
        console.log(`  ⚠️  作成可能な介護保険月次レセプトがありませんでした\n`);
      }
    }

    console.log('✅ テストデータ作成が完了しました！\n');
    console.log('📋 次のステップ:');
    console.log('   1. 月次レセプト管理画面で2025年11月の介護保険レセプトを確認');
    console.log('   2. 「介護保険レセプトCSV出力」ボタンをクリック');
    console.log('   3. 出力されたCSVファイルを確認して、データマッピング分析ドキュメントの実装済み項目を検証\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

// スクリプト実行
seedCareInsuranceCsvTest()
  .then(() => {
    console.log('✅ スクリプト実行完了');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ スクリプト実行エラー:', error);
    process.exit(1);
  });

