import { db } from '../server/db';
import {
  companies,
  facilities,
  users,
  patients,
  medicalInstitutions,
  careManagers,
  buildings,
  doctorOrders,
  insuranceCards,
  carePlans,
  schedules,
  nursingRecords,
  medications,
  additionalPayments,
  contracts,
  careReports,
} from '../shared/schema';
import { eq, and } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

/**
 * テストクリニック向けサンプルデータ投入スクリプト
 * 訪問看護業務に基づいた包括的なテストデータを作成
 */

async function seedTestClinic() {
  console.log('🌱 テストクリニックのサンプルデータ投入を開始します...\n');

  try {
    // ===== 1. 既存施設の取得 =====
    console.log('🏢 既存施設を取得中...');

    const existingFacilities = await db.select()
      .from(facilities)
      .where(eq(facilities.slug, 'test-clinic'));

    if (existingFacilities.length === 0) {
      console.error('❌ テストクリニック (test-clinic) が見つかりません。');
      console.log('利用可能な施設を確認してください。');
      process.exit(1);
    }

    const facility = existingFacilities[0];
    console.log(`  ✅ 施設: ${facility.name} (ID: ${facility.id})\n`);

    // ===== 2. ユーザーの作成（既存ユーザーをスキップ） =====
    console.log('👤 ユーザーを作成中...');
    const hashedPassword = await bcrypt.hash('password123', 10);

    // 既存のユーザーを取得
    const existingUsers = await db.select()
      .from(users)
      .where(eq(users.facilityId, facility.id));

    console.log(`  既存ユーザー: ${existingUsers.length}名`);

    const usersData = [
      {
        facilityId: facility.id,
        username: 'nurse1',
        password: hashedPassword,
        email: 'yamada@test-clinic.example.com',
        fullName: '山田 花子',
        role: 'nurse' as const,
        accessLevel: 'facility' as const,
        licenseNumber: 'NS-12345',
        phone: '090-2222-2222',
        isActive: true,
      },
      {
        facilityId: facility.id,
        username: 'nurse2',
        password: hashedPassword,
        email: 'sato@test-clinic.example.com',
        fullName: '佐藤 次郎',
        role: 'nurse' as const,
        accessLevel: 'facility' as const,
        licenseNumber: 'NS-23456',
        phone: '090-3333-3333',
        isActive: true,
      },
      {
        facilityId: facility.id,
        username: 'nurse3',
        password: hashedPassword,
        email: 'tanaka@test-clinic.example.com',
        fullName: '田中 美咲',
        role: 'nurse' as const,
        accessLevel: 'facility' as const,
        licenseNumber: 'NS-34567',
        phone: '090-4444-4444',
        isActive: true,
      },
      {
        facilityId: facility.id,
        username: 'manager',
        password: hashedPassword,
        email: 'suzuki@test-clinic.example.com',
        fullName: '鈴木 一郎',
        role: 'manager' as const,
        accessLevel: 'facility' as const,
        phone: '090-5555-5555',
        isActive: true,
      },
    ];

    // 既存ユーザーのusernameを取得
    const existingUsernames = new Set(existingUsers.map(u => u.username));

    // 既存ユーザーと重複しないユーザーのみ作成
    const newUsersData = usersData.filter(u => !existingUsernames.has(u.username));

    const createdUsers = newUsersData.length > 0
      ? await db.insert(users).values(newUsersData).returning()
      : [];

    console.log(`  ✅ 新規ユーザー ${createdUsers.length}名を作成しました`);
    createdUsers.forEach(user => console.log(`     - ${user.fullName} (${user.username})`));

    // 全ユーザーリストを取得（既存+新規）
    const allUsers = await db.select()
      .from(users)
      .where(eq(users.facilityId, facility.id));

    const nurse1 = allUsers.find(u => u.username === 'nurse1') || allUsers.find(u => u.role === 'nurse') || allUsers[0];
    const nurse2 = allUsers.find(u => u.username === 'nurse2') || allUsers.find(u => u.role === 'nurse') || allUsers[0];
    const nurse3 = allUsers.find(u => u.username === 'nurse3') || allUsers.find(u => u.role === 'nurse') || allUsers[0];
    const manager = allUsers.find(u => u.username === 'manager') || allUsers.find(u => u.role === 'manager') || allUsers[0];

    console.log();

    // ===== 3. 医療機関マスタの作成（重複チェック） =====
    console.log('🏥 医療機関マスタを作成中...');

    // 既存の医療機関を取得
    const existingMedicalInstitutions = await db.select()
      .from(medicalInstitutions)
      .where(eq(medicalInstitutions.facilityId, facility.id));

    const existingMedicalInstitutionNames = new Set(existingMedicalInstitutions.map(m => m.name));
    console.log(`  既存医療機関: ${existingMedicalInstitutions.length}件`);

    const medicalInstitutionsData = [
      {
        facilityId: facility.id,
        name: '新宿総合病院',
        department: '内科',
        doctorName: '高橋 健一',
        postalCode: '160-0023',
        address: '東京都新宿区西新宿2-1-1',
        phone: '03-1111-2222',
        fax: '03-1111-2223',
        notes: '主に呼吸器疾患の患者を紹介',
        isActive: true,
      },
      {
        facilityId: facility.id,
        name: '中野クリニック',
        department: '整形外科',
        doctorName: '中村 美智子',
        postalCode: '164-0001',
        address: '東京都中野区中野3-2-1',
        phone: '03-2222-3333',
        fax: '03-2222-3334',
        notes: '術後リハビリテーション',
        isActive: true,
      },
      {
        facilityId: facility.id,
        name: '渋谷メディカルセンター',
        department: '循環器内科',
        doctorName: '伊藤 太郎',
        postalCode: '150-0002',
        address: '東京都渋谷区渋谷1-1-1',
        phone: '03-3333-4444',
        fax: '03-3333-4445',
        notes: '心疾患患者の在宅管理',
        isActive: true,
      },
    ];

    // 既存と重複しないデータのみフィルター
    const newMedicalInstitutionsData = medicalInstitutionsData.filter(m =>
      !existingMedicalInstitutionNames.has(m.name)
    );

    const createdMedicalInstitutions = newMedicalInstitutionsData.length > 0
      ? await db.insert(medicalInstitutions).values(newMedicalInstitutionsData).returning()
      : [];

    console.log(`  ✅ 新規医療機関 ${createdMedicalInstitutions.length}件を作成しました`);

    // 全医療機関リストを取得（既存+新規）
    const allMedicalInstitutions = await db.select()
      .from(medicalInstitutions)
      .where(eq(medicalInstitutions.facilityId, facility.id));
    console.log();

    // ===== 4. ケアマネージャーマスタの作成（重複チェック） =====
    console.log('👔 ケアマネージャーマスタを作成中...');

    // 既存のケアマネージャーを取得
    const existingCareManagers = await db.select()
      .from(careManagers)
      .where(eq(careManagers.facilityId, facility.id));

    const existingCareManagerOfficeNames = new Set(existingCareManagers.map(c => c.officeName));
    console.log(`  既存ケアマネージャー: ${existingCareManagers.length}件`);

    const careManagersData = [
      {
        facilityId: facility.id,
        officeName: '新宿居宅介護支援センター',
        managerName: '加藤 由美',
        postalCode: '160-0022',
        address: '東京都新宿区新宿3-3-3',
        phone: '03-4444-5555',
        fax: '03-4444-5556',
        email: 'kato@shinjuku-kaigo.jp',
        notes: '対応エリア：新宿区全域',
        isActive: true,
      },
      {
        facilityId: facility.id,
        officeName: '中野ケアプランセンター',
        managerName: '木村 健二',
        postalCode: '164-0011',
        address: '東京都中野区中央4-4-4',
        phone: '03-5555-6666',
        fax: '03-5555-6667',
        email: 'kimura@nakano-care.jp',
        notes: '土日祝日も対応可能',
        isActive: true,
      },
      {
        facilityId: facility.id,
        officeName: '渋谷ケアマネジメント',
        managerName: '小林 恵子',
        postalCode: '150-0001',
        address: '東京都渋谷区神宮前5-5-5',
        phone: '03-6666-7777',
        fax: '03-6666-7778',
        email: 'kobayashi@shibuya-cm.jp',
        notes: '24時間連絡可能',
        isActive: true,
      },
    ];

    // 既存と重複しないデータのみフィルター
    const newCareManagersData = careManagersData.filter(c =>
      !existingCareManagerOfficeNames.has(c.officeName)
    );

    const createdCareManagers = newCareManagersData.length > 0
      ? await db.insert(careManagers).values(newCareManagersData).returning()
      : [];

    console.log(`  ✅ 新規ケアマネージャー ${createdCareManagers.length}件を作成しました`);

    // 全ケアマネージャーリストを取得（既存+新規）
    const allCareManagers = await db.select()
      .from(careManagers)
      .where(eq(careManagers.facilityId, facility.id));
    console.log();

    // ===== 5. 同一建物の作成（重複チェック） =====
    console.log('🏠 同一建物を作成中...');

    // 既存の建物を取得
    const existingBuildings = await db.select()
      .from(buildings)
      .where(eq(buildings.facilityId, facility.id));

    console.log(`  既存建物: ${existingBuildings.length}件`);

    const buildingData = {
      facilityId: facility.id,
      name: 'グリーンハイツ新宿',
      address: '東京都新宿区西新宿3-10-1',
      postalCode: '160-0023',
      notes: 'サービス付き高齢者向け住宅',
    };

    // 同名の建物が既に存在するかチェック
    let building;
    const existingBuilding = existingBuildings.find(b => b.name === buildingData.name);

    if (existingBuilding) {
      building = existingBuilding;
      console.log(`  ⚠️  建物「${building.name}」は既に存在します`);
    } else {
      [building] = await db.insert(buildings).values(buildingData).returning();
      console.log(`  ✅ 新規建物: ${building.name}`);
    }
    console.log();

    // ===== 6. 利用者（患者）の作成 =====
    console.log('🧑 利用者を作成中...');
    const patientsData = [
      {
        facilityId: facility.id,
        patientNumber: 'P2024-001',
        lastName: '山本',
        firstName: '太郎',
        dateOfBirth: '1945-03-15',
        gender: 'male' as const,
        address: '東京都新宿区西新宿3-10-1-201',
        phone: '03-1234-0001',
        emergencyContact: '山本 次郎（長男）',
        emergencyPhone: '090-1111-0001',
        insuranceNumber: '13012345',
        medicalHistory: '慢性閉塞性肺疾患(COPD)、高血圧症',
        allergies: 'ペニシリン系抗生物質',
        currentMedications: 'テオフィリン、アムロジピン',
        careNotes: '在宅酸素療法実施中（24時間）',
        careLevel: 'care3' as const,
        insuranceType: 'medical' as const,
        specialCareType: 'none' as const,
        buildingId: building.id,
        medicalInstitutionId: allMedicalInstitutions[0]?.id,
        careManagerId: allCareManagers[0]?.id,
        isCritical: true,
        isActive: true,
      },
      {
        facilityId: facility.id,
        patientNumber: 'P2024-002',
        lastName: '佐々木',
        firstName: '花子',
        dateOfBirth: '1950-07-20',
        gender: 'female' as const,
        address: '東京都新宿区西新宿3-10-1-305',
        phone: '03-1234-0002',
        emergencyContact: '佐々木 美咲（娘）',
        emergencyPhone: '090-2222-0002',
        insuranceNumber: '13023456',
        medicalHistory: '脳梗塞後遺症、糖尿病',
        allergies: 'なし',
        currentMedications: 'メトホルミン、クロピドグレル',
        careNotes: '右片麻痺あり、歩行介助必要',
        careLevel: 'care4' as const,
        insuranceType: 'care' as const,
        specialCareType: 'none' as const,
        buildingId: building.id,
        medicalInstitutionId: allMedicalInstitutions[1]?.id,
        careManagerId: allCareManagers[0]?.id,
        isCritical: false,
        isActive: true,
      },
      {
        facilityId: facility.id,
        patientNumber: 'P2024-003',
        lastName: '田村',
        firstName: '一郎',
        dateOfBirth: '1942-11-05',
        gender: 'male' as const,
        address: '東京都中野区中野5-1-1',
        phone: '03-1234-0003',
        emergencyContact: '田村 恵子（妻）',
        emergencyPhone: '03-1234-0003',
        insuranceNumber: '13034567',
        medicalHistory: '心不全、不整脈、慢性腎臓病',
        allergies: 'なし',
        currentMedications: 'フロセミド、ビソプロロール、ワーファリン',
        careNotes: '体重・浮腫の観察重要',
        careLevel: 'care3' as const,
        insuranceType: 'medical' as const,
        specialCareType: 'none' as const,
        medicalInstitutionId: allMedicalInstitutions[2]?.id,
        careManagerId: allCareManagers[1]?.id,
        isCritical: true,
        isActive: true,
      },
      {
        facilityId: facility.id,
        patientNumber: 'P2024-004',
        lastName: '中島',
        firstName: '春子',
        dateOfBirth: '1948-04-12',
        gender: 'female' as const,
        address: '東京都渋谷区神宮前2-2-2',
        phone: '03-1234-0004',
        emergencyContact: '中島 健太（長男）',
        emergencyPhone: '090-3333-0004',
        insuranceNumber: '13045678',
        medicalHistory: '認知症（アルツハイマー型）、高血圧',
        allergies: 'なし',
        currentMedications: 'ドネペジル、アムロジピン',
        careNotes: '見当識障害あり、服薬管理必要',
        careLevel: 'care2' as const,
        insuranceType: 'care' as const,
        specialCareType: 'mental' as const,
        medicalInstitutionId: allMedicalInstitutions[0]?.id,
        careManagerId: allCareManagers[2]?.id,
        isCritical: false,
        isActive: true,
      },
      {
        facilityId: facility.id,
        patientNumber: 'P2024-005',
        lastName: '吉田',
        firstName: '次郎',
        dateOfBirth: '1943-09-30',
        gender: 'male' as const,
        address: '東京都新宿区西新宿4-5-6',
        phone: '03-1234-0005',
        emergencyContact: '吉田 明子（娘）',
        emergencyPhone: '090-4444-0005',
        insuranceNumber: '13056789',
        medicalHistory: '気管切開後、誤嚥性肺炎既往',
        allergies: 'なし',
        currentMedications: 'レボフロキサシン吸入',
        careNotes: '気管カニューレ管理、吸引必要',
        careLevel: 'care5' as const,
        insuranceType: 'medical' as const,
        specialCareType: 'none' as const,
        medicalInstitutionId: allMedicalInstitutions[0]?.id,
        careManagerId: allCareManagers[0]?.id,
        isCritical: true,
        isActive: true,
      },
      {
        facilityId: facility.id,
        patientNumber: 'P2024-006',
        lastName: '伊藤',
        firstName: '美智子',
        dateOfBirth: '1952-01-25',
        gender: 'female' as const,
        address: '東京都新宿区西新宿3-10-1-102',
        phone: '03-1234-0006',
        emergencyContact: '伊藤 大輔（夫）',
        emergencyPhone: '03-1234-0006',
        insuranceNumber: '13067890',
        medicalHistory: '大腸がん術後、人工肛門造設',
        allergies: 'なし',
        currentMedications: 'なし',
        careNotes: 'ストーマケア指導継続中',
        careLevel: 'care1' as const,
        insuranceType: 'medical' as const,
        specialCareType: 'none' as const,
        buildingId: building.id,
        medicalInstitutionId: allMedicalInstitutions[1]?.id,
        careManagerId: allCareManagers[0]?.id,
        isCritical: false,
        isActive: true,
      },
      {
        facilityId: facility.id,
        patientNumber: 'P2024-007',
        lastName: '松本',
        firstName: '清',
        dateOfBirth: '1947-06-18',
        gender: 'male' as const,
        address: '東京都中野区中央1-1-1',
        phone: '03-1234-0007',
        emergencyContact: '松本 裕子（妻）',
        emergencyPhone: '03-1234-0007',
        insuranceNumber: '13078901',
        medicalHistory: 'パーキンソン病、起立性低血圧',
        allergies: 'なし',
        currentMedications: 'レボドパ・カルビドパ配合剤',
        careNotes: '転倒リスク高い、環境整備重要',
        careLevel: 'care2' as const,
        insuranceType: 'care' as const,
        specialCareType: 'none' as const,
        medicalInstitutionId: allMedicalInstitutions[0]?.id,
        careManagerId: allCareManagers[1]?.id,
        isCritical: false,
        isActive: true,
      },
      {
        facilityId: facility.id,
        patientNumber: 'P2024-008',
        lastName: '木下',
        firstName: '和子',
        dateOfBirth: '1949-12-03',
        gender: 'female' as const,
        address: '東京都渋谷区渋谷3-3-3',
        phone: '03-1234-0008',
        emergencyContact: '木下 健一（長男）',
        emergencyPhone: '090-5555-0008',
        insuranceNumber: '13089012',
        medicalHistory: '仙骨部褥瘡(D4)、低栄養',
        allergies: 'なし',
        currentMedications: 'アルブミン製剤点滴',
        careNotes: '褥瘡処置週3回、栄養管理重要',
        careLevel: 'care4' as const,
        insuranceType: 'medical' as const,
        specialCareType: 'bedsore' as const,
        medicalInstitutionId: allMedicalInstitutions[1]?.id,
        careManagerId: allCareManagers[2]?.id,
        isCritical: true,
        isActive: true,
      },
      {
        facilityId: facility.id,
        patientNumber: 'P2024-009',
        lastName: '小川',
        firstName: '健太',
        dateOfBirth: '1944-08-22',
        gender: 'male' as const,
        address: '東京都新宿区新宿6-6-6',
        phone: '03-1234-0009',
        emergencyContact: '小川 由美（妻）',
        emergencyPhone: '03-1234-0009',
        insuranceNumber: '13090123',
        medicalHistory: '中心静脈栄養実施中、消化管閉塞',
        allergies: 'なし',
        currentMedications: 'TPN（中心静脈栄養）',
        careNotes: 'CVカテーテル管理、感染予防重要',
        careLevel: 'care5' as const,
        insuranceType: 'medical' as const,
        specialCareType: 'none' as const,
        medicalInstitutionId: allMedicalInstitutions[2]?.id,
        careManagerId: allCareManagers[0]?.id,
        isCritical: true,
        isActive: true,
      },
      {
        facilityId: facility.id,
        patientNumber: 'P2024-010',
        lastName: '高橋',
        firstName: '久子',
        dateOfBirth: '1951-02-14',
        gender: 'female' as const,
        address: '東京都中野区中野2-2-2',
        phone: '03-1234-0010',
        emergencyContact: '高橋 雄一（長男）',
        emergencyPhone: '090-6666-0010',
        insuranceNumber: '13001234',
        medicalHistory: '関節リウマチ、変形性膝関節症',
        allergies: 'なし',
        currentMedications: 'メトトレキサート、プレドニゾロン',
        careNotes: 'ADL低下予防のためリハビリ継続',
        careLevel: 'support2' as const,
        insuranceType: 'care' as const,
        specialCareType: 'none' as const,
        medicalInstitutionId: allMedicalInstitutions[1]?.id,
        careManagerId: allCareManagers[1]?.id,
        isCritical: false,
        isActive: true,
      },
    ];

    const createdPatients = await db.insert(patients).values(patientsData).returning();
    console.log(`  ✅ 利用者 ${createdPatients.length}名を作成しました\n`);

    // ===== 7. 保険証情報の作成 =====
    console.log('💳 保険証情報を作成中...');
    const insuranceCardsData = createdPatients.flatMap((patient, index) => {
      const cards = [];

      // 医療保険証
      if (patient.insuranceType === 'medical' || index % 3 === 0) {
        cards.push({
          facilityId: facility.id,
          patientId: patient.id,
          cardType: 'medical' as const,
          insurerNumber: `13${String(index + 1).padStart(6, '0')}`,
          insuredNumber: String(12345000 + index),
          insuredSymbol: `記号${index + 1}`,
          insuredCardNumber: String(100 + index),
          copaymentRate: index % 3 === 0 ? '10' as const : index % 3 === 1 ? '20' as const : '30' as const,
          validFrom: '2024-04-01',
          validUntil: '2025-03-31',
          isActive: true,
        });
      }

      // 介護保険証
      if (patient.insuranceType === 'care' || index % 2 === 0) {
        cards.push({
          facilityId: facility.id,
          patientId: patient.id,
          cardType: 'long_term_care' as const,
          insurerNumber: `131234`,
          insuredNumber: String(20240000 + index),
          copaymentRate: index % 5 === 0 ? '10' as const : index % 5 === 1 ? '20' as const : '10' as const,
          validFrom: '2024-01-01',
          validUntil: '2026-12-31',
          certificationDate: '2023-12-01',
          isActive: true,
        });
      }

      return cards;
    });

    await db.insert(insuranceCards).values(insuranceCardsData);
    console.log(`  ✅ 保険証情報 ${insuranceCardsData.length}件を作成しました\n`);

    // ===== 8. 訪問看護指示書の作成 =====
    console.log('📋 訪問看護指示書を作成中...');
    const doctorOrdersData = createdPatients.map((patient, index) => ({
      facilityId: facility.id,
      patientId: patient.id,
      medicalInstitutionId: patient.medicalInstitutionId!,
      orderDate: '2024-09-01',
      startDate: '2024-10-01',
      endDate: '2025-03-31',
      diagnosis: patient.medicalHistory || '主病名記載',
      orderContent: `訪問看護を実施し、病状観察・療養指導を行うこと。週${index % 3 + 1}回程度の訪問を推奨。`,
      weeklyVisitLimit: index % 3 + 2,
      notes: '緊急時は連絡のこと',
      isActive: true,
    }));

    await db.insert(doctorOrders).values(doctorOrdersData);
    console.log(`  ✅ 訪問看護指示書 ${doctorOrdersData.length}件を作成しました\n`);

    // ===== 9. 訪問看護計画書の作成 =====
    console.log('📝 訪問看護計画書を作成中...');
    const carePlansData = createdPatients.map((patient, index) => ({
      facilityId: facility.id,
      patientId: patient.id,
      planNumber: `CP-${patient.patientNumber}-202410`,
      planDate: '2024-10-01',
      planPeriodStart: '2024-10-01',
      planPeriodEnd: '2025-03-31',
      nursingGoals: `${patient.lastName}様の在宅療養生活の安定と、ADLの維持・向上を図る`,
      nursingPlan: `1. バイタルサインの観察\n2. 病状の観察と異常の早期発見\n3. 内服管理・療養指導\n4. 家族支援`,
      weeklyVisitPlan: index % 3 === 0 ? '月・木' : index % 3 === 1 ? '火・金' : '水',
      createdBy: nurse1.id,
      isActive: true,
    }));

    await db.insert(carePlans).values(carePlansData);
    console.log(`  ✅ 訪問看護計画書 ${carePlansData.length}件を作成しました\n`);

    // ===== 10. 投薬情報の作成 =====
    console.log('💊 投薬情報を作成中...');
    const medicationsData = createdPatients.flatMap((patient, patientIndex) => {
      if (!patient.currentMedications || patientIndex % 3 === 0) return [];

      return [{
        facilityId: facility.id,
        patientId: patient.id,
        nurseId: nurse1.id,
        medicationName: patient.currentMedications.split('、')[0] || '処方薬',
        dosage: '1錠',
        frequency: '1日1回',
        route: 'oral',
        startDate: '2024-09-01',
        instructions: '朝食後に服用',
        isActive: true,
      }];
    });

    if (medicationsData.length > 0) {
      await db.insert(medications).values(medicationsData);
      console.log(`  ✅ 投薬情報 ${medicationsData.length}件を作成しました\n`);
    }

    // ===== 11. スケジュールの作成（過去1週間 + 今週〜来週） =====
    console.log('📅 訪問スケジュールを作成中...');

    const today = new Date();
    const schedulesData = [];
    const nurses = [nurse1, nurse2, nurse3];

    // 過去1週間分（完了済み）
    for (let daysAgo = 7; daysAgo >= 1; daysAgo--) {
      const date = new Date(today);
      date.setDate(date.getDate() - daysAgo);

      // 平日のみ
      if (date.getDay() !== 0 && date.getDay() !== 6) {
        createdPatients.forEach((patient, index) => {
          // 各患者、週2-3回の頻度でスケジュール
          if (daysAgo % (index % 3 + 2) === 0) {
            const assignedNurse = nurses[index % 3];
            const startTime = new Date(date);
            startTime.setHours(9 + (index % 4) * 2, 0, 0, 0);
            const endTime = new Date(startTime);
            endTime.setHours(startTime.getHours() + 1);

            schedulesData.push({
              facilityId: facility.id,
              patientId: patient.id,
              nurseId: assignedNurse.id,
              scheduledDate: date,
              scheduledStartTime: startTime,
              scheduledEndTime: endTime,
              duration: 60,
              purpose: 'バイタルサイン測定・療養指導',
              status: 'completed' as const,
              actualStartTime: startTime,
              actualEndTime: endTime,
            });
          }
        });
      }
    }

    // 今週〜来週分（予定）
    for (let daysAhead = 0; daysAhead <= 14; daysAhead++) {
      const date = new Date(today);
      date.setDate(date.getDate() + daysAhead);

      // 平日のみ
      if (date.getDay() !== 0 && date.getDay() !== 6) {
        createdPatients.forEach((patient, index) => {
          // 各患者、週2-3回の頻度でスケジュール
          if (daysAhead % (index % 3 + 2) === 0) {
            const assignedNurse = nurses[index % 3];
            const startTime = new Date(date);
            startTime.setHours(9 + (index % 4) * 2, 0, 0, 0);
            const endTime = new Date(startTime);
            endTime.setHours(startTime.getHours() + 1);

            schedulesData.push({
              facilityId: facility.id,
              patientId: patient.id,
              nurseId: assignedNurse.id,
              scheduledDate: date,
              scheduledStartTime: startTime,
              scheduledEndTime: endTime,
              duration: 60,
              purpose: 'バイタルサイン測定・療養指導',
              status: 'scheduled' as const,
            });
          }
        });
      }
    }

    await db.insert(schedules).values(schedulesData);
    console.log(`  ✅ 訪問スケジュール ${schedulesData.length}件を作成しました`);
    console.log(`     - 完了済み: ${schedulesData.filter(s => s.status === 'completed').length}件`);
    console.log(`     - 予定: ${schedulesData.filter(s => s.status === 'scheduled').length}件\n`);

    // ===== 12. 看護記録の作成（過去1週間分） =====
    console.log('📖 看護記録を作成中...');

    const completedSchedules = schedulesData.filter(s => s.status === 'completed');
    const nursingRecordsData = completedSchedules.map((schedule, index) => {
      const patient = createdPatients.find(p => p.id === schedule.patientId);
      const recordTypes = ['vital_signs', 'general_care', 'assessment'] as const;
      const recordType = recordTypes[index % 3];

      return {
        facilityId: facility.id,
        patientId: schedule.patientId,
        nurseId: schedule.nurseId!,
        scheduleId: undefined, // scheduleIdは実際のscheduleレコードのIDが必要なため、一旦undefined
        recordType,
        recordDate: new Date(schedule.scheduledDate),
        visitDate: new Date(schedule.scheduledDate).toISOString().split('T')[0],
        status: 'completed' as const,
        visitStatusRecord: 'completed' as const,
        actualStartTime: schedule.actualStartTime ? new Date(schedule.actualStartTime) : undefined,
        actualEndTime: schedule.actualEndTime ? new Date(schedule.actualEndTime) : undefined,
        bloodPressureSystolic: recordType === 'vital_signs' ? 120 + (index % 40) : null,
        bloodPressureDiastolic: recordType === 'vital_signs' ? 70 + (index % 20) : null,
        heartRate: recordType === 'vital_signs' ? 60 + (index % 40) : null,
        temperature: recordType === 'vital_signs' ? '36.5' : null,
        respiratoryRate: recordType === 'vital_signs' ? 16 + (index % 8) : null,
        oxygenSaturation: recordType === 'vital_signs' ? 95 + (index % 5) : null,
        title: recordType === 'vital_signs' ? 'バイタルサイン測定' :
               recordType === 'general_care' ? '療養指導・日常生活支援' :
               '全身状態の評価',
        content: `${patient?.lastName}様宅訪問。${
          recordType === 'vital_signs' ? 'バイタルサイン測定を実施。' :
          recordType === 'general_care' ? '日常生活の様子を観察し、必要な支援を実施。' :
          '全身状態の評価を行い、今後の看護計画を検討。'
        }`,
        observations: patient?.isCritical ? '要注意所見あり。継続的な観察が必要。' : '特記すべき変化なし。',
        interventions: '療養指導、家族への説明を実施。',
        evaluation: '現在の看護計画を継続する。',
        patientFamilyResponse: '理解良好。協力的。',
      };
    });

    if (nursingRecordsData.length > 0) {
      await db.insert(nursingRecords).values(nursingRecordsData);
      console.log(`  ✅ 看護記録 ${nursingRecordsData.length}件を作成しました\n`);
    }

    // ===== 13. 加算管理データの作成 =====
    console.log('💰 加算管理データを作成中...');

    // 特管加算対象の患者に対して加算データを作成
    const specialManagementPatients = createdPatients.filter(p =>
      ['山本', '吉田', '伊藤', '木下', '小川'].includes(p.lastName)
    );

    const additionalPaymentsData = specialManagementPatients.map(patient => ({
      facilityId: facility.id,
      patientId: patient.id,
      type: 'special_management',
      startDate: '2024-10-01',
      reason: '特別管理加算対象',
      isActive: true,
    }));

    if (additionalPaymentsData.length > 0) {
      await db.insert(additionalPayments).values(additionalPaymentsData);
      console.log(`  ✅ 加算管理データ ${additionalPaymentsData.length}件を作成しました\n`);
    }

    // ===== 14. 契約書・同意書の作成（重複チェック） =====
    console.log('📄 契約書・同意書を作成中...');

    // 既存の契約書を取得
    const existingContracts = await db.select()
      .from(contracts)
      .where(eq(contracts.facilityId, facility.id));

    console.log(`  既存契約書: ${existingContracts.length}件`);

    // 重複チェック用のキーセット作成（患者ID + 契約タイプ）
    const existingContractKeys = new Set(
      existingContracts.map(c => `${c.patientId}_${c.contractType}`)
    );

    // 契約日は各患者の最初のdoctorOrderのorderDateと同じにする（契約締結 → 指示書受領の順序）
    const contractDate = '2024-09-01';

    const contractsData = createdPatients.flatMap((patient, index) => {
      const patientContracts = [];

      // サービス利用契約書
      const serviceAgreementKey = `${patient.id}_service_agreement`;
      if (!existingContractKeys.has(serviceAgreementKey)) {
        patientContracts.push({
          facilityId: facility.id,
          patientId: patient.id,
          contractType: 'service_agreement' as const,
          contractDate,
          startDate: contractDate,
          title: '訪問看護サービス利用契約書',
          description: '訪問看護サービスの提供に関する契約',
          signedBy: `${patient.lastName} ${patient.firstName}`,
          witnessedBy: manager.id,
          isActive: true,
        });
      }

      // 重要事項説明書
      const importantMattersKey = `${patient.id}_important_matters`;
      if (!existingContractKeys.has(importantMattersKey)) {
        patientContracts.push({
          facilityId: facility.id,
          patientId: patient.id,
          contractType: 'important_matters' as const,
          contractDate,
          startDate: contractDate,
          title: '重要事項説明書',
          description: 'サービス提供における重要事項の説明と同意',
          signedBy: `${patient.lastName} ${patient.firstName}`,
          witnessedBy: manager.id,
          isActive: true,
        });
      }

      // 個人情報利用同意書
      const personalInfoKey = `${patient.id}_personal_info_consent`;
      if (!existingContractKeys.has(personalInfoKey)) {
        patientContracts.push({
          facilityId: facility.id,
          patientId: patient.id,
          contractType: 'personal_info_consent' as const,
          contractDate,
          startDate: contractDate,
          title: '個人情報の利用に関する同意書',
          description: '個人情報の取り扱いおよび第三者提供に関する同意',
          signedBy: `${patient.lastName} ${patient.firstName}`,
          witnessedBy: nurse1.id,
          isActive: true,
        });
      }

      return patientContracts;
    });

    let createdContractsCount = 0;
    if (contractsData.length > 0) {
      const insertedContracts = await db.insert(contracts).values(contractsData).returning();
      createdContractsCount = insertedContracts.length;
      console.log(`  ✅ 新規契約書・同意書 ${createdContractsCount}件を作成しました\n`);
    } else {
      console.log(`  ⚠️  新規作成する契約書はありませんでした（既に存在）\n`);
    }

    // ===== 15. 訪問看護報告書の作成（重複チェック） =====
    console.log('📑 訪問看護報告書を作成中...');

    // 既存の報告書を取得
    const existingCareReports = await db.select()
      .from(careReports)
      .where(eq(careReports.facilityId, facility.id));

    console.log(`  既存報告書: ${existingCareReports.length}件`);

    // 重複チェック用のキーセット作成（患者ID + 報告期間開始日）
    const existingReportKeys = new Set(
      existingCareReports.map(r => `${r.patientId}_${r.reportPeriodStart}`)
    );

    // 各患者に対して1-2件の月次報告書を作成
    // 報告期間: 先々月（8月）と先月（9月）
    const careReportsData = createdPatients.flatMap((patient, index) => {
      const reports = [];

      // 先々月の報告書（8月分：8/1-8/31）
      const augustReportKey = `${patient.id}_2024-08-01`;
      if (!existingReportKeys.has(augustReportKey)) {
        reports.push({
          facilityId: facility.id,
          patientId: patient.id,
          carePlanId: null, // carePlanIdは実際の計画書IDが必要だが、簡易的にnull
          reportNumber: `R-${patient.patientNumber}-202408`,
          reportDate: '2024-09-05',
          reportPeriodStart: '2024-08-01',
          reportPeriodEnd: '2024-08-31',
          visitCount: 8 + (index % 5),
          patientCondition: `${patient.lastName}様の全身状態は概ね安定しています。バイタルサインに大きな変動はなく、日常生活動作も維持されています。`,
          nursingOutcomes: `定期的なバイタルサイン測定、服薬確認、療養指導を実施しました。${patient.isCritical ? '特別な管理を要する状態であり、慎重な観察を継続しています。' : ''}`,
          problemsAndActions: '今後も継続的な観察と療養指導が必要です。特に季節の変わり目には体調変化に注意が必要です。',
          familySupport: 'ご家族は協力的で、療養環境は良好です。',
          communicationWithDoctor: '主治医と定期的に情報共有を行い、必要な指示を受けています。',
          communicationWithCareManager: 'ケアマネージャーと連携し、サービス調整を行っています。',
          remarks: null,
          createdBy: nurse1.id,
          isActive: true,
        });
      }

      // 先月の報告書（9月分：9/1-9/30）- 偶数インデックスの患者のみ
      if (index % 2 === 0) {
        const septemberReportKey = `${patient.id}_2024-09-01`;
        if (!existingReportKeys.has(septemberReportKey)) {
          reports.push({
            facilityId: facility.id,
            patientId: patient.id,
            carePlanId: null,
            reportNumber: `R-${patient.patientNumber}-202409`,
            reportDate: '2024-10-05',
            reportPeriodStart: '2024-09-01',
            reportPeriodEnd: '2024-09-30',
            visitCount: 9 + (index % 4),
            patientCondition: `${patient.lastName}様の療養状況は良好です。前月と比較して特に大きな変化はありません。`,
            nursingOutcomes: `計画に基づいた訪問看護を実施し、健康状態の維持・向上に努めました。${patient.medicalHistory ? `${patient.medicalHistory}に対する管理を継続しています。` : ''}`,
            problemsAndActions: '現在の看護計画を継続し、引き続き状態観察を行います。',
            familySupport: 'ご家族との連携も良好で、在宅療養が順調に進んでいます。',
            communicationWithDoctor: '主治医へ定期報告を行い、必要な医学的管理について指示を受けています。',
            communicationWithCareManager: 'サービス担当者会議にて情報共有を行いました。',
            remarks: null,
            createdBy: index % 3 === 0 ? nurse1.id : index % 3 === 1 ? nurse2.id : nurse3.id,
            isActive: true,
          });
        }
      }

      return reports;
    });

    let createdCareReportsCount = 0;
    if (careReportsData.length > 0) {
      const insertedReports = await db.insert(careReports).values(careReportsData).returning();
      createdCareReportsCount = insertedReports.length;
      console.log(`  ✅ 新規訪問看護報告書 ${createdCareReportsCount}件を作成しました\n`);
    } else {
      console.log(`  ⚠️  新規作成する報告書はありませんでした（既に存在）\n`);
    }

    // ===== 完了 =====
    console.log('🎉 テストクリニックのサンプルデータ投入が完了しました！\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 作成されたデータサマリー:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  👤 ユーザー: ${createdUsers.length}名`);
    console.log(`  🧑 利用者: ${createdPatients.length}名`);
    console.log(`  🏥 医療機関: ${createdMedicalInstitutions.length}件`);
    console.log(`  👔 ケアマネージャー: ${createdCareManagers.length}件`);
    console.log(`  💳 保険証: ${insuranceCardsData.length}件`);
    console.log(`  📋 訪問看護指示書: ${doctorOrdersData.length}件`);
    console.log(`  📝 訪問看護計画書: ${carePlansData.length}件`);
    console.log(`  📅 スケジュール: ${schedulesData.length}件`);
    console.log(`  📖 看護記録: ${nursingRecordsData.length}件`);
    console.log(`  💊 投薬情報: ${medicationsData.length}件`);
    console.log(`  💰 加算管理: ${additionalPaymentsData.length}件`);
    console.log(`  📄 契約書・同意書: ${createdContractsCount}件`);
    console.log(`  📑 訪問看護報告書: ${createdCareReportsCount}件`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('🔐 テストアカウント情報:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  既存の管理者アカウントでログインしてください');
    console.log('');
    if (createdUsers.length > 0) {
      console.log('  追加されたアカウント:');
      createdUsers.forEach(user => {
        console.log(`    - ${user.fullName} (${user.username})`);
      });
      console.log('    パスワード: password123');
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('🌐 アクセスURL:');
    console.log(`  http://${facility.slug}.localhost:5000`);
    console.log('  または');
    console.log('  http://localhost:5000\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

// スクリプト実行
seedTestClinic();
