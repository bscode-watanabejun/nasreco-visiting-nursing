/**
 * 【選択肢A】最小限の修正の検証テスト
 *
 * 以下の修正内容を検証:
 * 1. JDレコード: 公費併用時の複数レコード出力
 * 2. REレコード: 一部負担金区分を空欄に修正
 * 3. MFレコード: 窓口負担額区分を'00'固定
 * 4. RJレコード: 既存deathDateフィールドを使用
 */

import { NursingReceiptCsvBuilder } from './server/services/csv/nursingReceiptCsvBuilder.ts';

console.log('=== 【選択肢A】最小限の修正の検証テスト ===\n');

// テストデータ作成
const testData = {
  receipt: {
    id: 'test-receipt-1',
    targetYear: 2025,
    targetMonth: 11,
    insuranceType: 'medical',
    visitCount: 3,
    totalPoints: 1200,
    totalAmount: 12000,
  },
  facility: {
    facilityCode: '1234567',
    prefectureCode: '13',
    name: 'テスト訪問看護ステーション',
    address: '東京都千代田区1-1-1',
    phone: '03-1234-5678',
  },
  patient: {
    id: 'patient-1',
    patientNumber: 'P001',
    lastName: '山田',
    firstName: '太郎',
    kanaName: 'ヤマダタロウ',
    dateOfBirth: '1950-01-15',
    gender: 'male',
    insuranceNumber: '12345678',
    insuranceType: 'medical',
    deathDate: '2025-11-10', // 死亡日（RJレコードで使用）
  },
  medicalInstitution: {
    institutionCode: '9876543',
    prefectureCode: '13',
    name: 'テスト病院',
    doctorName: '田中医師',
  },
  insuranceCard: {
    cardType: 'medical',
    relationshipType: 'self',
    ageCategory: 'elderly',
    elderlyRecipientCategory: 'seventy',
    insurerNumber: '12345678',
    certificateSymbol: 'ABC',
    certificateNumber: '123456',
  },
  publicExpenses: [
    {
      legalCategoryNumber: '12',
      beneficiaryNumber: '13000001',
      recipientNumber: '1234567',
      priority: 1,
    },
    {
      legalCategoryNumber: '54',
      beneficiaryNumber: '13000002',
      recipientNumber: '7654321',
      priority: 2,
    },
  ],
  doctorOrder: {
    id: 'order-1',
    startDate: '2025-10-01',
    endDate: '2025-12-31',
    diagnosis: '心不全',
    icd10Code: 'I500000',
    instructionType: 'regular',
  },
  nursingRecords: [
    {
      id: 'record-1',
      visitDate: '2025-11-05',
      actualStartTime: '10:00',
      actualEndTime: '11:00',
      serviceCode: '800000110',
      visitLocationCode: '01',
      staffQualificationCode: '03',
      calculatedPoints: 400,
      appliedBonuses: [],
    },
    {
      id: 'record-2',
      visitDate: '2025-11-10',
      actualStartTime: '14:00',
      actualEndTime: '15:00',
      serviceCode: '800000110',
      visitLocationCode: '01',
      staffQualificationCode: '03',
      calculatedPoints: 400,
      appliedBonuses: [],
    },
    {
      id: 'record-3',
      visitDate: '2025-11-15',
      actualStartTime: '10:00',
      actualEndTime: '11:00',
      serviceCode: '800000110',
      visitLocationCode: '01',
      staffQualificationCode: '03',
      calculatedPoints: 400,
      appliedBonuses: [],
    },
  ],
  bonusBreakdown: [],
};

console.log('【テストケース1】公費2枚併用の場合\n');

const builder = new NursingReceiptCsvBuilder();
const csvBuffer = await builder.build(testData);

// Shift_JISではなくUTF-8で一時的に読み取り（テスト目的）
const csvText = csvBuffer.toString('utf-8');
const lines = csvText.split('\n').filter(line => line.trim());

console.log(`生成されたCSV行数: ${lines.length}`);
console.log('');

// 各レコードを検証
let lineIndex = 0;

// HMレコード
console.log('✓ HMレコード: ' + lines[lineIndex]);
lineIndex++;

// GOレコード
console.log('✓ GOレコード: ' + lines[lineIndex]);
lineIndex++;

// REレコード
const reRecord = lines[lineIndex];
const reFields = reRecord.split(',');
console.log('✓ REレコード: ' + reRecord);
console.log(`  - フィールド13（一部負担金区分）: "${reFields[12]}" ${reFields[12] === '' ? '✅ 空欄（正しい）' : '❌ 空欄でない'}`);
lineIndex++;

// HOレコード
console.log('✓ HOレコード: ' + lines[lineIndex]);
lineIndex++;

// KOレコード（公費2枚分）
console.log('✓ KOレコード1（第1公費）: ' + lines[lineIndex]);
lineIndex++;
console.log('✓ KOレコード2（第2公費）: ' + lines[lineIndex]);
lineIndex++;

// SNレコード
console.log('✓ SNレコード: ' + lines[lineIndex]);
lineIndex++;

// JDレコード（公費併用時は複数出力）
console.log('\n【JDレコード検証】公費2枚の場合、保険者分+第1公費+第2公費の計3レコード出力');
const jdRecord1 = lines[lineIndex];
const jdFields1 = jdRecord1.split(',');
console.log(`✓ JDレコード1: 負担者種別="${jdFields1[1]}" ${jdFields1[1] === '1' ? '✅ 保険者（正しい）' : '❌'}`);
lineIndex++;

const jdRecord2 = lines[lineIndex];
const jdFields2 = jdRecord2.split(',');
console.log(`✓ JDレコード2: 負担者種別="${jdFields2[1]}" ${jdFields2[1] === '2' ? '✅ 第1公費（正しい）' : '❌'}`);
lineIndex++;

const jdRecord3 = lines[lineIndex];
const jdFields3 = jdRecord3.split(',');
console.log(`✓ JDレコード3: 負担者種別="${jdFields3[1]}" ${jdFields3[1] === '3' ? '✅ 第2公費（正しい）' : '❌'}`);
lineIndex++;

// MFレコード
const mfRecord = lines[lineIndex];
const mfFields = mfRecord.split(',');
console.log(`\n✓ MFレコード: ${mfRecord.substring(0, 50)}...`);
console.log(`  - フィールド2（窓口負担額区分）: "${mfFields[1]}" ${mfFields[1] === '00' ? '✅ "00"（正しい）' : '❌ "00"でない'}`);
lineIndex++;

// IHレコード
console.log('✓ IHレコード: ' + lines[lineIndex]);
lineIndex++;

// HJレコード
console.log('✓ HJレコード: ' + lines[lineIndex]);
lineIndex++;

// JSレコード
console.log('✓ JSレコード: ' + lines[lineIndex]);
lineIndex++;

// SYレコード
console.log('✓ SYレコード: ' + lines[lineIndex]);
lineIndex++;

// RJレコード
const rjRecord = lines[lineIndex];
const rjFields = rjRecord.split(',');
console.log(`\n✓ RJレコード: ${rjRecord.substring(0, 100)}...`);
console.log(`  - フィールド15（死亡年月日）: "${rjFields[14]}" ${rjFields[14] === '20251110' ? '✅ 既存deathDateから取得（正しい）' : '❌'}`);
lineIndex++;

// KAレコード（訪問記録3件分）
console.log('\n✓ KAレコード1: ' + lines[lineIndex]);
lineIndex++;
console.log('✓ KAレコード2: ' + lines[lineIndex]);
lineIndex++;
console.log('✓ KAレコード3: ' + lines[lineIndex]);

console.log('\n=== 検証結果サマリー ===\n');

const results = [
  {
    item: 'REレコード: 一部負担金区分',
    expected: '空欄',
    actual: reFields[12] === '' ? '空欄' : `"${reFields[12]}"`,
    status: reFields[12] === '' ? '✅ PASS' : '❌ FAIL'
  },
  {
    item: 'JDレコード: 負担者種別（保険者）',
    expected: '1',
    actual: jdFields1[1],
    status: jdFields1[1] === '1' ? '✅ PASS' : '❌ FAIL'
  },
  {
    item: 'JDレコード: 負担者種別（第1公費）',
    expected: '2',
    actual: jdFields2[1],
    status: jdFields2[1] === '2' ? '✅ PASS' : '❌ FAIL'
  },
  {
    item: 'JDレコード: 負担者種別（第2公費）',
    expected: '3',
    actual: jdFields3[1],
    status: jdFields3[1] === '3' ? '✅ PASS' : '❌ FAIL'
  },
  {
    item: 'MFレコード: 窓口負担額区分',
    expected: '00',
    actual: mfFields[1],
    status: mfFields[1] === '00' ? '✅ PASS' : '❌ FAIL'
  },
  {
    item: 'RJレコード: 死亡年月日',
    expected: '20251110',
    actual: rjFields[14],
    status: rjFields[14] === '20251110' ? '✅ PASS' : '❌ FAIL'
  },
];

console.table(results);

const allPassed = results.every(r => r.status.includes('PASS'));
console.log(`\n${allPassed ? '✅ すべてのテストに合格しました！' : '❌ 一部のテストが失敗しました'}`);

// 修正内容のまとめ
console.log('\n=== 修正内容まとめ ===\n');
console.log('1. ✅ JDレコード: 公費併用時に複数レコードを出力（保険者+各公費分）');
console.log('2. ✅ REレコード: 一部負担金区分を空欄に修正（別表7は該当者のみ記録）');
console.log('3. ✅ MFレコード: 窓口負担額区分を"00"固定（高額療養費制度未対応の暫定対応）');
console.log('4. ✅ RJレコード: 既存のdeathDateフィールドを使用して死亡年月日を出力');
console.log('');
console.log('【TODOコメント追加箇所】');
console.log('- REレコード: 将来的に insuranceCards.partialBurdenCategory フィールドを追加');
console.log('- MFレコード: 将来的に monthlyReceipts.highCostBenefitApplied/Multiple フィールドを追加');
console.log('- RJレコード: 将来的に patients テーブルに訪問終了・死亡詳細情報フィールドを追加');
