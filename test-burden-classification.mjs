import { determineBurdenClassificationCode } from './server/services/csv/receiptClassification.ts';

console.log('=== 負担区分コード判定テスト ===\n');

// テストケース1: 公費のみ（各枚数）
console.log('【ケース1: 公費のみ】');
console.log('公費0枚:', determineBurdenClassificationCode(
  { dateOfBirth: '1950-01-01', insuranceType: 'none' },
  { cardType: 'medical', relationshipType: null, ageCategory: null, elderlyRecipientCategory: null },
  []
));
console.log('公費1枚:', determineBurdenClassificationCode(
  { dateOfBirth: '1950-01-01', insuranceType: 'none' },
  { cardType: 'medical', relationshipType: null, ageCategory: null, elderlyRecipientCategory: null },
  [{ legalCategoryNumber: '12', priority: 1 }]
));
console.log('公費2枚:', determineBurdenClassificationCode(
  { dateOfBirth: '1950-01-01', insuranceType: 'none' },
  { cardType: 'medical', relationshipType: null, ageCategory: null, elderlyRecipientCategory: null },
  [
    { legalCategoryNumber: '12', priority: 1 },
    { legalCategoryNumber: '15', priority: 2 }
  ]
));
console.log('公費3枚:', determineBurdenClassificationCode(
  { dateOfBirth: '1950-01-01', insuranceType: 'none' },
  { cardType: 'medical', relationshipType: null, ageCategory: null, elderlyRecipientCategory: null },
  [
    { legalCategoryNumber: '12', priority: 1 },
    { legalCategoryNumber: '15', priority: 2 },
    { legalCategoryNumber: '19', priority: 3 }
  ]
));
console.log('公費4枚:', determineBurdenClassificationCode(
  { dateOfBirth: '1950-01-01', insuranceType: 'none' },
  { cardType: 'medical', relationshipType: null, ageCategory: null, elderlyRecipientCategory: null },
  [
    { legalCategoryNumber: '12', priority: 1 },
    { legalCategoryNumber: '15', priority: 2 },
    { legalCategoryNumber: '19', priority: 3 },
    { legalCategoryNumber: '21', priority: 4 }
  ]
));

// テストケース2: 後期高齢者医療
console.log('\n【ケース2: 後期高齢者医療】');
console.log('後期のみ:', determineBurdenClassificationCode(
  { dateOfBirth: '1950-01-01', insuranceType: 'medical_elderly' },
  { cardType: 'medical', relationshipType: 'self', ageCategory: 'elderly', elderlyRecipientCategory: null },
  []
));
console.log('後期+公費1枚:', determineBurdenClassificationCode(
  { dateOfBirth: '1950-01-01', insuranceType: 'medical_elderly' },
  { cardType: 'medical', relationshipType: 'self', ageCategory: 'elderly', elderlyRecipientCategory: null },
  [{ legalCategoryNumber: '12', priority: 1 }]
));
console.log('後期+公費2枚:', determineBurdenClassificationCode(
  { dateOfBirth: '1950-01-01', insuranceType: 'medical_elderly' },
  { cardType: 'medical', relationshipType: 'self', ageCategory: 'elderly', elderlyRecipientCategory: null },
  [
    { legalCategoryNumber: '12', priority: 1 },
    { legalCategoryNumber: '15', priority: 2 }
  ]
));
console.log('後期+公費3枚:', determineBurdenClassificationCode(
  { dateOfBirth: '1950-01-01', insuranceType: 'medical_elderly' },
  { cardType: 'medical', relationshipType: 'self', ageCategory: 'elderly', elderlyRecipientCategory: null },
  [
    { legalCategoryNumber: '12', priority: 1 },
    { legalCategoryNumber: '15', priority: 2 },
    { legalCategoryNumber: '19', priority: 3 }
  ]
));
console.log('後期+公費4枚:', determineBurdenClassificationCode(
  { dateOfBirth: '1950-01-01', insuranceType: 'medical_elderly' },
  { cardType: 'medical', relationshipType: 'self', ageCategory: 'elderly', elderlyRecipientCategory: null },
  [
    { legalCategoryNumber: '12', priority: 1 },
    { legalCategoryNumber: '15', priority: 2 },
    { legalCategoryNumber: '19', priority: 3 },
    { legalCategoryNumber: '21', priority: 4 }
  ]
));

// テストケース3: 医保・国保
console.log('\n【ケース3: 医保・国保】');
console.log('医保のみ:', determineBurdenClassificationCode(
  { dateOfBirth: '1980-01-01', insuranceType: 'medical_insurance' },
  { cardType: 'medical', relationshipType: 'self', ageCategory: 'general', elderlyRecipientCategory: null },
  []
));
console.log('医保+公費1枚:', determineBurdenClassificationCode(
  { dateOfBirth: '1980-01-01', insuranceType: 'medical_insurance' },
  { cardType: 'medical', relationshipType: 'self', ageCategory: 'general', elderlyRecipientCategory: null },
  [{ legalCategoryNumber: '12', priority: 1 }]
));
console.log('医保+公費2枚:', determineBurdenClassificationCode(
  { dateOfBirth: '1980-01-01', insuranceType: 'medical_insurance' },
  { cardType: 'medical', relationshipType: 'self', ageCategory: 'general', elderlyRecipientCategory: null },
  [
    { legalCategoryNumber: '12', priority: 1 },
    { legalCategoryNumber: '15', priority: 2 }
  ]
));
console.log('医保+公費3枚:', determineBurdenClassificationCode(
  { dateOfBirth: '1980-01-01', insuranceType: 'medical_insurance' },
  { cardType: 'medical', relationshipType: 'self', ageCategory: 'general', elderlyRecipientCategory: null },
  [
    { legalCategoryNumber: '12', priority: 1 },
    { legalCategoryNumber: '15', priority: 2 },
    { legalCategoryNumber: '19', priority: 3 }
  ]
));
console.log('医保+公費4枚:', determineBurdenClassificationCode(
  { dateOfBirth: '1980-01-01', insuranceType: 'medical_insurance' },
  { cardType: 'medical', relationshipType: 'self', ageCategory: 'general', elderlyRecipientCategory: null },
  [
    { legalCategoryNumber: '12', priority: 1 },
    { legalCategoryNumber: '15', priority: 2 },
    { legalCategoryNumber: '19', priority: 3 },
    { legalCategoryNumber: '21', priority: 4 }
  ]
));

// テストケース4: 介護保険
console.log('\n【ケース4: 介護保険】');
console.log('介護保険:', determineBurdenClassificationCode(
  { dateOfBirth: '1950-01-01', insuranceType: 'care' },
  { cardType: 'long_term_care', relationshipType: null, ageCategory: null, elderlyRecipientCategory: null },
  []
));

console.log('\n=== 期待される結果 ===');
console.log('公費0枚: 1 (暫定)');
console.log('公費1枚: 1');
console.log('公費2枚: 7');
console.log('公費3枚: R (修正済み)');
console.log('公費4枚: Z (修正済み)');
console.log('後期のみ: 1 (暫定)');
console.log('後期+公費1枚: 2 (修正済み)');
console.log('後期+公費2枚: 4 (修正済み)');
console.log('後期+公費3枚: V (修正済み)');
console.log('後期+公費4枚: 9');
console.log('医保のみ: 1 (暫定)');
console.log('医保+公費1枚: 2 (修正済み)');
console.log('医保+公費2枚: 4 (修正済み)');
console.log('医保+公費3枚: V (修正済み)');
console.log('医保+公費4枚: 9');
console.log('介護保険: 9');
