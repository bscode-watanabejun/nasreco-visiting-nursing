/**
 * マスターデータ初期投入スクリプト
 *
 * レセプトCSV出力に必要な5つのマスターテーブルにデータを投入します。
 *
 * 実行方法:
 *   npx tsx scripts/seed-master-data.ts
 */

import { db } from '../server/db';
import {
  prefectureCodes,
  staffQualificationCodes,
  visitLocationCodes,
  receiptTypeCodes,
  nursingServiceCodes
} from '../shared/schema';

async function seedMasterData() {
  console.log('🚀 マスターデータの投入を開始します...\n');

  try {
    // 1. 都道府県コード（47件）
    console.log('📍 都道府県コードを投入中...');
    await db.insert(prefectureCodes).values([
      { prefectureCode: '01', prefectureName: '北海道', displayOrder: 1, isActive: true },
      { prefectureCode: '02', prefectureName: '青森県', displayOrder: 2, isActive: true },
      { prefectureCode: '03', prefectureName: '岩手県', displayOrder: 3, isActive: true },
      { prefectureCode: '04', prefectureName: '宮城県', displayOrder: 4, isActive: true },
      { prefectureCode: '05', prefectureName: '秋田県', displayOrder: 5, isActive: true },
      { prefectureCode: '06', prefectureName: '山形県', displayOrder: 6, isActive: true },
      { prefectureCode: '07', prefectureName: '福島県', displayOrder: 7, isActive: true },
      { prefectureCode: '08', prefectureName: '茨城県', displayOrder: 8, isActive: true },
      { prefectureCode: '09', prefectureName: '栃木県', displayOrder: 9, isActive: true },
      { prefectureCode: '10', prefectureName: '群馬県', displayOrder: 10, isActive: true },
      { prefectureCode: '11', prefectureName: '埼玉県', displayOrder: 11, isActive: true },
      { prefectureCode: '12', prefectureName: '千葉県', displayOrder: 12, isActive: true },
      { prefectureCode: '13', prefectureName: '東京都', displayOrder: 13, isActive: true },
      { prefectureCode: '14', prefectureName: '神奈川県', displayOrder: 14, isActive: true },
      { prefectureCode: '15', prefectureName: '新潟県', displayOrder: 15, isActive: true },
      { prefectureCode: '16', prefectureName: '富山県', displayOrder: 16, isActive: true },
      { prefectureCode: '17', prefectureName: '石川県', displayOrder: 17, isActive: true },
      { prefectureCode: '18', prefectureName: '福井県', displayOrder: 18, isActive: true },
      { prefectureCode: '19', prefectureName: '山梨県', displayOrder: 19, isActive: true },
      { prefectureCode: '20', prefectureName: '長野県', displayOrder: 20, isActive: true },
      { prefectureCode: '21', prefectureName: '岐阜県', displayOrder: 21, isActive: true },
      { prefectureCode: '22', prefectureName: '静岡県', displayOrder: 22, isActive: true },
      { prefectureCode: '23', prefectureName: '愛知県', displayOrder: 23, isActive: true },
      { prefectureCode: '24', prefectureName: '三重県', displayOrder: 24, isActive: true },
      { prefectureCode: '25', prefectureName: '滋賀県', displayOrder: 25, isActive: true },
      { prefectureCode: '26', prefectureName: '京都府', displayOrder: 26, isActive: true },
      { prefectureCode: '27', prefectureName: '大阪府', displayOrder: 27, isActive: true },
      { prefectureCode: '28', prefectureName: '兵庫県', displayOrder: 28, isActive: true },
      { prefectureCode: '29', prefectureName: '奈良県', displayOrder: 29, isActive: true },
      { prefectureCode: '30', prefectureName: '和歌山県', displayOrder: 30, isActive: true },
      { prefectureCode: '31', prefectureName: '鳥取県', displayOrder: 31, isActive: true },
      { prefectureCode: '32', prefectureName: '島根県', displayOrder: 32, isActive: true },
      { prefectureCode: '33', prefectureName: '岡山県', displayOrder: 33, isActive: true },
      { prefectureCode: '34', prefectureName: '広島県', displayOrder: 34, isActive: true },
      { prefectureCode: '35', prefectureName: '山口県', displayOrder: 35, isActive: true },
      { prefectureCode: '36', prefectureName: '徳島県', displayOrder: 36, isActive: true },
      { prefectureCode: '37', prefectureName: '香川県', displayOrder: 37, isActive: true },
      { prefectureCode: '38', prefectureName: '愛媛県', displayOrder: 38, isActive: true },
      { prefectureCode: '39', prefectureName: '高知県', displayOrder: 39, isActive: true },
      { prefectureCode: '40', prefectureName: '福岡県', displayOrder: 40, isActive: true },
      { prefectureCode: '41', prefectureName: '佐賀県', displayOrder: 41, isActive: true },
      { prefectureCode: '42', prefectureName: '長崎県', displayOrder: 42, isActive: true },
      { prefectureCode: '43', prefectureName: '熊本県', displayOrder: 43, isActive: true },
      { prefectureCode: '44', prefectureName: '大分県', displayOrder: 44, isActive: true },
      { prefectureCode: '45', prefectureName: '宮崎県', displayOrder: 45, isActive: true },
      { prefectureCode: '46', prefectureName: '鹿児島県', displayOrder: 46, isActive: true },
      { prefectureCode: '47', prefectureName: '沖縄県', displayOrder: 47, isActive: true },
    ]).onConflictDoNothing();
    console.log('✓ 都道府県コード: 47件投入完了\n');

    // 2. 職員資格コード（別表20）
    console.log('👨‍⚕️ 職員資格コードを投入中...');
    await db.insert(staffQualificationCodes).values([
      { qualificationCode: '01', qualificationName: '保健師', description: '保健師助産師看護師法に基づく保健師', displayOrder: 1, isActive: true },
      { qualificationCode: '02', qualificationName: '助産師', description: '保健師助産師看護師法に基づく助産師', displayOrder: 2, isActive: true },
      { qualificationCode: '03', qualificationName: '看護師', description: '保健師助産師看護師法に基づく看護師', displayOrder: 3, isActive: true },
      { qualificationCode: '04', qualificationName: '理学療法士', description: '理学療法士及び作業療法士法に基づく理学療法士', displayOrder: 4, isActive: true },
      { qualificationCode: '05', qualificationName: '作業療法士', description: '理学療法士及び作業療法士法に基づく作業療法士', displayOrder: 5, isActive: true },
      { qualificationCode: '06', qualificationName: '言語聴覚士', description: '言語聴覚士法に基づく言語聴覚士', displayOrder: 6, isActive: true },
      { qualificationCode: '07', qualificationName: '准看護師', description: '保健師助産師看護師法に基づく准看護師', displayOrder: 7, isActive: true },
      { qualificationCode: '08', qualificationName: '専門研修修了看護師', description: '特定行為研修を修了した看護師', displayOrder: 8, isActive: true },
      { qualificationCode: '09', qualificationName: '看護補助者', description: '看護補助を行う者', displayOrder: 9, isActive: true },
      { qualificationCode: '10', qualificationName: '精神保健福祉士', description: '精神保健福祉士法に基づく精神保健福祉士', displayOrder: 10, isActive: true },
    ]).onConflictDoNothing();
    console.log('✓ 職員資格コード: 10件投入完了\n');

    // 3. 訪問場所コード（別表16）
    console.log('🏠 訪問場所コードを投入中...');
    await db.insert(visitLocationCodes).values([
      { locationCode: '01', locationName: '居宅', description: '利用者の自宅', displayOrder: 1, isActive: true },
      { locationCode: '02', locationName: '老人ホーム', description: '有料老人ホーム等', displayOrder: 2, isActive: true },
      { locationCode: '03', locationName: '特別養護老人ホーム', description: '特別養護老人ホーム', displayOrder: 3, isActive: true },
      { locationCode: '04', locationName: '介護老人保健施設', description: '介護老人保健施設', displayOrder: 4, isActive: true },
      { locationCode: '05', locationName: 'その他の施設', description: 'その他の施設', displayOrder: 5, isActive: true },
      { locationCode: '06', locationName: '病院', description: '病院', displayOrder: 6, isActive: true },
      { locationCode: '07', locationName: '診療所', description: '診療所', displayOrder: 7, isActive: true },
      { locationCode: '08', locationName: 'グループホーム', description: '認知症対応型共同生活介護事業所', displayOrder: 8, isActive: true },
      { locationCode: '09', locationName: 'サービス付き高齢者向け住宅', description: 'サービス付き高齢者向け住宅', displayOrder: 9, isActive: true },
      { locationCode: '99', locationName: 'その他', description: 'その他（文字データで指定）', displayOrder: 99, isActive: true },
    ]).onConflictDoNothing();
    console.log('✓ 訪問場所コード: 10件投入完了\n');

    // 4. レセプト種別コード（別表4）
    console.log('📄 レセプト種別コードを投入中...');
    await db.insert(receiptTypeCodes).values([
      { receiptTypeCode: '3110', receiptTypeName: '訪問看護療養費（健康保険）', insuranceType: 'medical', description: '健康保険法に基づく訪問看護療養費', displayOrder: 1, isActive: true },
      { receiptTypeCode: '3120', receiptTypeName: '訪問看護療養費（国民健康保険）', insuranceType: 'medical', description: '国民健康保険法に基づく訪問看護療養費', displayOrder: 2, isActive: true },
      { receiptTypeCode: '3130', receiptTypeName: '訪問看護療養費（後期高齢者医療）', insuranceType: 'medical', description: '高齢者の医療の確保に関する法律に基づく訪問看護療養費', displayOrder: 3, isActive: true },
      { receiptTypeCode: '3111', receiptTypeName: '訪問看護療養費（健康保険・公費併用）', insuranceType: 'medical', description: '健康保険と公費の併用', displayOrder: 4, isActive: true },
      { receiptTypeCode: '3121', receiptTypeName: '訪問看護療養費（国民健康保険・公費併用）', insuranceType: 'medical', description: '国民健康保険と公費の併用', displayOrder: 5, isActive: true },
      { receiptTypeCode: '3131', receiptTypeName: '訪問看護療養費（後期高齢者医療・公費併用）', insuranceType: 'medical', description: '後期高齢者医療と公費の併用', displayOrder: 6, isActive: true },
      { receiptTypeCode: '3140', receiptTypeName: '訪問看護療養費（公費単独）', insuranceType: 'medical', description: '公費負担医療のみ', displayOrder: 7, isActive: true },
    ]).onConflictDoNothing();
    console.log('✓ レセプト種別コード: 7件投入完了\n');

    // 5. 訪問看護サービスコード（主要なもの）
    console.log('💊 訪問看護サービスコードを投入中...');
    const validFrom = new Date('2024-04-01');

    await db.insert(nursingServiceCodes).values([
      // 訪問看護基本療養費
      { serviceCode: '311000110', serviceName: '訪問看護基本療養費（Ⅰ）週3日まで', points: 5550, validFrom, validTo: null, insuranceType: 'medical', isActive: true },
      { serviceCode: '311000210', serviceName: '訪問看護基本療養費（Ⅰ）週4日以降', points: 6550, validFrom, validTo: null, insuranceType: 'medical', isActive: true },
      { serviceCode: '311000310', serviceName: '訪問看護基本療養費（Ⅱ）週3日まで', points: 5050, validFrom, validTo: null, insuranceType: 'medical', isActive: true },
      { serviceCode: '311000410', serviceName: '訪問看護基本療養費（Ⅱ）週4日以降', points: 6050, validFrom, validTo: null, insuranceType: 'medical', isActive: true },
      { serviceCode: '311000510', serviceName: '訪問看護基本療養費（Ⅲ）週3日まで', points: 4550, validFrom, validTo: null, insuranceType: 'medical', isActive: true },
      { serviceCode: '311000610', serviceName: '訪問看護基本療養費（Ⅲ）週4日以降', points: 5550, validFrom, validTo: null, insuranceType: 'medical', isActive: true },

      // 精神科訪問看護基本療養費
      { serviceCode: '311001110', serviceName: '精神科訪問看護基本療養費（Ⅰ）週3日まで', points: 5750, validFrom, validTo: null, insuranceType: 'medical', isActive: true },
      { serviceCode: '311001210', serviceName: '精神科訪問看護基本療養費（Ⅰ）週4日以降', points: 6750, validFrom, validTo: null, insuranceType: 'medical', isActive: true },
      { serviceCode: '311001310', serviceName: '精神科訪問看護基本療養費（Ⅱ）', points: 3000, validFrom, validTo: null, insuranceType: 'medical', isActive: true },

      // 主要な加算
      { serviceCode: '312000110', serviceName: '特別管理加算', points: 2500, validFrom, validTo: null, insuranceType: 'medical', isActive: true },
      { serviceCode: '312000210', serviceName: '長時間訪問看護加算', points: 5200, validFrom, validTo: null, insuranceType: 'medical', isActive: true },
      { serviceCode: '312000310', serviceName: '複数名訪問看護加算（看護職員等）', points: 4500, validFrom, validTo: null, insuranceType: 'medical', isActive: true },
      { serviceCode: '312000410', serviceName: '複数名訪問看護加算（准看護師）', points: 3800, validFrom, validTo: null, insuranceType: 'medical', isActive: true },
      { serviceCode: '312000510', serviceName: '複数名訪問看護加算（看護補助者）', points: 3000, validFrom, validTo: null, insuranceType: 'medical', isActive: true },
      { serviceCode: '312000610', serviceName: '夜間・早朝訪問看護加算', points: 2100, validFrom, validTo: null, insuranceType: 'medical', isActive: true },
      { serviceCode: '312000710', serviceName: '深夜訪問看護加算', points: 4200, validFrom, validTo: null, insuranceType: 'medical', isActive: true },
      { serviceCode: '312000810', serviceName: '緊急訪問看護加算', points: 2650, validFrom, validTo: null, insuranceType: 'medical', isActive: true },
      { serviceCode: '312000910', serviceName: '24時間対応体制加算', points: 6400, validFrom, validTo: null, insuranceType: 'medical', isActive: true },
      { serviceCode: '312001010', serviceName: '特別地域訪問看護加算', points: 0, validFrom, validTo: null, insuranceType: 'medical', description: '基本療養費の15%加算', isActive: true },

      // 理学療法士・作業療法士・言語聴覚士による訪問
      { serviceCode: '313000110', serviceName: '理学療法士等による訪問看護', points: 2970, validFrom, validTo: null, insuranceType: 'medical', isActive: true },

      // ターミナルケア加算
      { serviceCode: '314000110', serviceName: 'ターミナルケア加算', points: 25000, validFrom, validTo: null, insuranceType: 'medical', isActive: true },
    ]).onConflictDoNothing();
    console.log('✓ 訪問看護サービスコード: 21件投入完了\n');

    console.log('✅ マスターデータの投入が完了しました！');
    console.log('\n【投入結果】');
    console.log('  - 都道府県コード: 47件');
    console.log('  - 職員資格コード: 10件');
    console.log('  - 訪問場所コード: 10件');
    console.log('  - レセプト種別コード: 7件');
    console.log('  - 訪問看護サービスコード: 21件');
    console.log('  合計: 95件');

  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error);
    throw error;
  }
}

// スクリプト実行
seedMasterData()
  .then(() => {
    console.log('\n処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });
