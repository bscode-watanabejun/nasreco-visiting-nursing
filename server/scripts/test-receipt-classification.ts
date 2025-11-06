/**
 * Phase 3.3: レセプト分類判定関数のテストスクリプト
 *
 * 実行方法:
 * npx tsx server/scripts/test-receipt-classification.ts
 */

import {
  determineReceiptTypeCode,
  determineBurdenClassificationCode,
  determineInstructionTypeCode,
  determineAllClassifications,
} from '../services/csv/receiptClassification';

interface TestCase {
  name: string;
  patient: any;
  insuranceCard: any;
  publicExpenses: any[];
  doctorOrder?: any;
  expected: {
    receiptTypeCode: string;
    burdenClassificationCode?: string;
    instructionTypeCode?: string;
  };
}

const testCases: TestCase[] = [
  // ========== 医保 単独 ==========
  {
    name: '医保 本人 公費なし',
    patient: { dateOfBirth: '1980-01-01', insuranceType: 'medical_insurance' },
    insuranceCard: {
      cardType: 'medical',
      relationshipType: 'self',
      ageCategory: 'general',
      elderlyRecipientCategory: null,
    },
    publicExpenses: [],
    expected: {
      receiptTypeCode: '01',
      burdenClassificationCode: '0',
    },
  },
  {
    name: '医保 家族 公費なし',
    patient: { dateOfBirth: '1980-01-01', insuranceType: 'medical_insurance' },
    insuranceCard: {
      cardType: 'medical',
      relationshipType: 'family',
      ageCategory: 'general',
      elderlyRecipientCategory: null,
    },
    publicExpenses: [],
    expected: {
      receiptTypeCode: '03',
      burdenClassificationCode: '2',
    },
  },

  // ========== 国保 単独 ==========
  {
    name: '国保 本人 公費なし',
    patient: { dateOfBirth: '1980-01-01', insuranceType: 'national_health' },
    insuranceCard: {
      cardType: 'medical',
      relationshipType: 'self',
      ageCategory: 'general',
      elderlyRecipientCategory: null,
    },
    publicExpenses: [],
    expected: {
      receiptTypeCode: '02',
      burdenClassificationCode: '0',
    },
  },
  {
    name: '国保 家族 公費なし',
    patient: { dateOfBirth: '1980-01-01', insuranceType: 'national_health' },
    insuranceCard: {
      cardType: 'medical',
      relationshipType: 'family',
      ageCategory: 'general',
      elderlyRecipientCategory: null,
    },
    publicExpenses: [],
    expected: {
      receiptTypeCode: '04',
      burdenClassificationCode: '2',
    },
  },

  // ========== 未就学者 ==========
  {
    name: '医保 未就学者 公費なし',
    patient: { dateOfBirth: '2020-01-01', insuranceType: 'medical_insurance' },
    insuranceCard: {
      cardType: 'medical',
      relationshipType: 'preschool',
      ageCategory: 'preschool',
      elderlyRecipientCategory: null,
    },
    publicExpenses: [],
    expected: {
      receiptTypeCode: '36',
      burdenClassificationCode: '0',
    },
  },
  {
    name: '国保 未就学者 公費なし',
    patient: { dateOfBirth: '2020-01-01', insuranceType: 'national_health' },
    insuranceCard: {
      cardType: 'medical',
      relationshipType: 'preschool',
      ageCategory: 'preschool',
      elderlyRecipientCategory: null,
    },
    publicExpenses: [],
    expected: {
      receiptTypeCode: '37',
      burdenClassificationCode: '0',
    },
  },
  {
    name: '医保 未就学者 公費1枚',
    patient: { dateOfBirth: '2020-01-01', insuranceType: 'medical_insurance' },
    insuranceCard: {
      cardType: 'medical',
      relationshipType: 'preschool',
      ageCategory: 'preschool',
      elderlyRecipientCategory: null,
    },
    publicExpenses: [{ legalCategoryNumber: '51', priority: 1 }],
    expected: {
      receiptTypeCode: '11',
      burdenClassificationCode: '1',
    },
  },

  // ========== 高齢受給者（70-74歳）==========
  {
    name: '医保 高齢受給者一般 公費なし',
    patient: { dateOfBirth: '1950-01-01', insuranceType: 'medical_insurance' },
    insuranceCard: {
      cardType: 'medical',
      relationshipType: 'self',
      ageCategory: 'general',
      elderlyRecipientCategory: 'general_low',
    },
    publicExpenses: [],
    expected: {
      receiptTypeCode: '32',
      burdenClassificationCode: '0',
    },
  },
  {
    name: '医保 高齢受給者7割 公費なし',
    patient: { dateOfBirth: '1950-01-01', insuranceType: 'medical_insurance' },
    insuranceCard: {
      cardType: 'medical',
      relationshipType: 'self',
      ageCategory: 'general',
      elderlyRecipientCategory: 'seventy',
    },
    publicExpenses: [],
    expected: {
      receiptTypeCode: '34',
      burdenClassificationCode: '0',
    },
  },
  {
    name: '国保 高齢受給者一般 公費なし',
    patient: { dateOfBirth: '1950-01-01', insuranceType: 'national_health' },
    insuranceCard: {
      cardType: 'medical',
      relationshipType: 'self',
      ageCategory: 'general',
      elderlyRecipientCategory: 'general_low',
    },
    publicExpenses: [],
    expected: {
      receiptTypeCode: '33',
      burdenClassificationCode: '0',
    },
  },
  {
    name: '医保 高齢受給者 公費1枚',
    patient: { dateOfBirth: '1950-01-01', insuranceType: 'medical_insurance' },
    insuranceCard: {
      cardType: 'medical',
      relationshipType: 'self',
      ageCategory: 'general',
      elderlyRecipientCategory: 'general_low',
    },
    publicExpenses: [{ legalCategoryNumber: '54', priority: 1 }],
    expected: {
      receiptTypeCode: '12',
      burdenClassificationCode: '1',
    },
  },

  // ========== 後期高齢者（75歳以上）==========
  {
    name: '後期高齢者 公費なし',
    patient: { dateOfBirth: '1945-01-01', insuranceType: 'medical_elderly' },
    insuranceCard: {
      cardType: 'medical',
      relationshipType: 'elderly_general',
      ageCategory: 'elderly',
      elderlyRecipientCategory: null,
    },
    publicExpenses: [],
    expected: {
      receiptTypeCode: '39',
      burdenClassificationCode: '0',
    },
  },
  {
    name: '後期高齢者 公費1枚',
    patient: { dateOfBirth: '1945-01-01', insuranceType: 'medical_elderly' },
    insuranceCard: {
      cardType: 'medical',
      relationshipType: 'elderly_general',
      ageCategory: 'elderly',
      elderlyRecipientCategory: null,
    },
    publicExpenses: [{ legalCategoryNumber: '54', priority: 1 }],
    expected: {
      receiptTypeCode: '13',
      burdenClassificationCode: '1',
    },
  },
  {
    name: '後期高齢者 公費2枚',
    patient: { dateOfBirth: '1945-01-01', insuranceType: 'medical_elderly' },
    insuranceCard: {
      cardType: 'medical',
      relationshipType: 'elderly_general',
      ageCategory: 'elderly',
      elderlyRecipientCategory: null,
    },
    publicExpenses: [
      { legalCategoryNumber: '54', priority: 1 },
      { legalCategoryNumber: '51', priority: 2 },
    ],
    expected: {
      receiptTypeCode: '19',
      burdenClassificationCode: '7',
    },
  },

  // ========== 公費のみ ==========
  {
    name: '公費単独（医保・国保なし）',
    patient: { dateOfBirth: '1980-01-01', insuranceType: 'none' },
    insuranceCard: {
      cardType: 'medical',
      relationshipType: null,
      ageCategory: 'general',
      elderlyRecipientCategory: null,
    },
    publicExpenses: [{ legalCategoryNumber: '10', priority: 1 }],
    expected: {
      receiptTypeCode: '10',
      burdenClassificationCode: '1',
    },
  },
  {
    name: '公費二併（医保・国保なし）',
    patient: { dateOfBirth: '1980-01-01', insuranceType: 'none' },
    insuranceCard: {
      cardType: 'medical',
      relationshipType: null,
      ageCategory: 'general',
      elderlyRecipientCategory: null,
    },
    publicExpenses: [
      { legalCategoryNumber: '10', priority: 1 },
      { legalCategoryNumber: '51', priority: 2 },
    ],
    expected: {
      receiptTypeCode: '16',
      burdenClassificationCode: '7',
    },
  },

  // ========== 医保・国保 + 公費 ==========
  {
    name: '医保 本人 公費1枚',
    patient: { dateOfBirth: '1980-01-01', insuranceType: 'medical_insurance' },
    insuranceCard: {
      cardType: 'medical',
      relationshipType: 'self',
      ageCategory: 'general',
      elderlyRecipientCategory: null,
    },
    publicExpenses: [{ legalCategoryNumber: '54', priority: 1 }],
    expected: {
      receiptTypeCode: '14',
      burdenClassificationCode: '1',
    },
  },
  {
    name: '医保 本人 公費2枚',
    patient: { dateOfBirth: '1980-01-01', insuranceType: 'medical_insurance' },
    insuranceCard: {
      cardType: 'medical',
      relationshipType: 'self',
      ageCategory: 'general',
      elderlyRecipientCategory: null,
    },
    publicExpenses: [
      { legalCategoryNumber: '54', priority: 1 },
      { legalCategoryNumber: '51', priority: 2 },
    ],
    expected: {
      receiptTypeCode: '20',
      burdenClassificationCode: '7',
    },
  },
  {
    name: '医保 本人 公費3枚',
    patient: { dateOfBirth: '1980-01-01', insuranceType: 'medical_insurance' },
    insuranceCard: {
      cardType: 'medical',
      relationshipType: 'self',
      ageCategory: 'general',
      elderlyRecipientCategory: null,
    },
    publicExpenses: [
      { legalCategoryNumber: '54', priority: 1 },
      { legalCategoryNumber: '51', priority: 2 },
      { legalCategoryNumber: '21', priority: 3 },
    ],
    expected: {
      receiptTypeCode: '26',
      burdenClassificationCode: '8',
    },
  },
  {
    name: '医保 本人 公費4枚',
    patient: { dateOfBirth: '1980-01-01', insuranceType: 'medical_insurance' },
    insuranceCard: {
      cardType: 'medical',
      relationshipType: 'self',
      ageCategory: 'general',
      elderlyRecipientCategory: null,
    },
    publicExpenses: [
      { legalCategoryNumber: '54', priority: 1 },
      { legalCategoryNumber: '51', priority: 2 },
      { legalCategoryNumber: '21', priority: 3 },
      { legalCategoryNumber: '10', priority: 4 },
    ],
    expected: {
      receiptTypeCode: '38',
      burdenClassificationCode: '9',
    },
  },

  // ========== 介護保険 ==========
  {
    name: '介護保険 第1号被保険者',
    patient: { dateOfBirth: '1945-01-01', insuranceType: 'long_term_care' },
    insuranceCard: {
      cardType: 'long_term_care',
      relationshipType: null,
      ageCategory: 'elderly',
      elderlyRecipientCategory: null,
    },
    publicExpenses: [],
    expected: {
      receiptTypeCode: '72',
      burdenClassificationCode: '9',
    },
  },
];

// 指示区分のテストケース
const instructionTestCases = [
  {
    name: '通常訪問看護指示',
    doctorOrder: { instructionType: 'regular' as const },
    expected: '01',
  },
  {
    name: '特別訪問看護指示',
    doctorOrder: { instructionType: 'special' as const },
    expected: '02',
  },
  {
    name: '精神科訪問看護指示',
    doctorOrder: { instructionType: 'psychiatric' as const },
    expected: '03',
  },
  {
    name: '精神科特別訪問看護指示',
    doctorOrder: { instructionType: 'psychiatric_special' as const },
    expected: '04',
  },
  {
    name: '医療観察精神科訪問看護指示',
    doctorOrder: { instructionType: 'medical_observation' as const },
    expected: '05',
  },
  {
    name: '医療観察精神科特別訪問看護指示',
    doctorOrder: { instructionType: 'medical_observation_special' as const },
    expected: '06',
  },
];

/**
 * テスト実行
 */
function runTests() {
  console.log('========================================');
  console.log('レセプト分類判定テスト開始');
  console.log('========================================\n');

  let passCount = 0;
  let failCount = 0;

  // レセプト種別・負担区分のテスト
  console.log('【レセプト種別コード & 負担区分コードのテスト】\n');

  for (const testCase of testCases) {
    const receiptType = determineReceiptTypeCode(
      testCase.patient,
      testCase.insuranceCard,
      testCase.publicExpenses
    );

    const burdenClass = determineBurdenClassificationCode(
      testCase.patient,
      testCase.insuranceCard,
      testCase.publicExpenses
    );

    const receiptOk = receiptType === testCase.expected.receiptTypeCode;
    const burdenOk = burdenClass === testCase.expected.burdenClassificationCode;
    const ok = receiptOk && burdenOk;

    if (ok) {
      console.log(`✓ ${testCase.name}`);
      console.log(`  レセプト種別: ${receiptType}, 負担区分: ${burdenClass}`);
      passCount++;
    } else {
      console.log(`✗ ${testCase.name}`);
      if (!receiptOk) {
        console.log(`  レセプト種別: 期待=${testCase.expected.receiptTypeCode}, 実際=${receiptType}`);
      }
      if (!burdenOk) {
        console.log(`  負担区分: 期待=${testCase.expected.burdenClassificationCode}, 実際=${burdenClass}`);
      }
      failCount++;
    }
    console.log('');
  }

  // 指示区分のテスト
  console.log('\n【指示区分コードのテスト】\n');

  for (const testCase of instructionTestCases) {
    const result = determineInstructionTypeCode(testCase.doctorOrder);
    const ok = result === testCase.expected;

    if (ok) {
      console.log(`✓ ${testCase.name}: ${result}`);
      passCount++;
    } else {
      console.log(`✗ ${testCase.name}: 期待=${testCase.expected}, 実際=${result}`);
      failCount++;
    }
  }

  // 結果サマリー
  console.log('\n========================================');
  console.log('テスト結果');
  console.log('========================================');
  console.log(`合計: ${passCount + failCount} 件`);
  console.log(`成功: ${passCount} 件`);
  console.log(`失敗: ${failCount} 件`);

  if (failCount === 0) {
    console.log('\n✓ すべてのテストが成功しました！');
    return 0;
  } else {
    console.log(`\n✗ ${failCount} 件のテストが失敗しました。`);
    return 1;
  }
}

// テスト実行
const exitCode = runTests();
process.exit(exitCode);
