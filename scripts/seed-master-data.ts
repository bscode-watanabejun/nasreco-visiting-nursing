/**
 * マスターデータ初期投入スクリプト
 *
 * レセプトCSV出力に必要な5つのマスターテーブルにデータを投入します。
 *
 * 実行方法:
 *   npx tsx scripts/seed-master-data.ts
 */

import fs from 'fs';
import path from 'path';
import iconv from 'iconv-lite';
import { db } from '../server/db';
import {
  prefectureCodes,
  staffQualificationCodes,
  visitLocationCodes,
  receiptTypeCodes,
  nursingServiceCodes
} from '../shared/schema';

/**
 * CSVファイルからサービスコードを読み込む
 */
async function loadServiceCodesFromCsv() {
  const masterDir = path.join(process.cwd(), 'docs/recept/visiting nursing_care_expenses_master');
  const filePath = path.join(masterDir, '訪問看護療養費マスター_基本テーブル.csv');
  
  if (!fs.existsSync(filePath)) {
    console.error(`⚠️  CSVファイルが見つかりません: ${filePath}`);
    return [];
  }
  
  const buffer = fs.readFileSync(filePath);
  const text = iconv.decode(buffer, 'shift_jis');
  const lines = text.split('\n').filter(l => l.trim());
  
  const serviceCodes: Array<{
    serviceCode: string;
    serviceName: string;
    points: number;
    insuranceType: 'medical' | 'care';
    validFrom: Date;
    validTo: Date | null;
    description: string | null;
    isActive: boolean;
  }> = [];
  
  for (const line of lines) {
    // CSVパース
    const matches = line.match(/("(?:[^"\\]|\\.)*"|[^,]+)/g);
    if (!matches || matches.length < 72) continue;
    
    const values = matches.map(v => v.replace(/^"|"$/g, '').trim());
    
    const changeType = values[0]; // 変更区分
    const serviceCode = values[2]; // 訪問看護療養費コード
    
    // サービスコードが9桁の数字であることを確認
    if (!/^\d{9}$/.test(serviceCode)) continue;
    
    // 廃止されたコードは除外（変更区分が9）
    if (changeType === '9') continue;
    
    // 省略名称を使用（列[8]）。省略名称が空の場合は基本名称（列[6]）を使用
    // 注意: PDF仕様書では列[9]が省略名称だが、実際のCSVでは列[8]が省略名称
    const serviceName = (values[8] && values[8].trim()) ? values[8] : values[6]; // 省略名称（なければ基本名称）
    const amountTypeStr = values[14]; // 金額識別（項番15）
    const pointsStr = values[15]; // 新又は現金額（項番16）
    const validFromStr = values[70]; // 変更年月日
    const validToStr = values[71]; // 廃止年月日
    
    // 金額識別に応じて点数を計算
    // 1：金額 → 10で割って点数に変換（1点 = 10円）
    // 3：点数（プラス） → そのまま使用
    // 5：％加算 → そのまま使用（現状は未対応）
    let points = parseFloat(pointsStr) || 0;
    if (amountTypeStr === '1') {
      // 金額識別が「1：金額」の場合、円単位なので10で割って点数に変換
      points = Math.round(points / 10);
    }
    // 金額識別が「3：点数（プラス）」の場合はそのまま使用
    
    // 保険種別の判定（サービスコードの先頭2桁で判定）
    const insuranceType: 'medical' | 'care' = 
      (serviceCode.startsWith('51') || serviceCode.startsWith('53')) ? 'medical' : 'medical';
    
    // 日付の変換（YYYYMMDD形式をDateオブジェクトに）
    let validFrom: Date;
    if (validFromStr && /^\d{8}$/.test(validFromStr)) {
      const year = parseInt(validFromStr.substring(0, 4));
      const month = parseInt(validFromStr.substring(4, 6)) - 1; // 月は0ベース
      const day = parseInt(validFromStr.substring(6, 8));
      validFrom = new Date(year, month, day);
    } else {
      validFrom = new Date('2024-04-01'); // デフォルト値
    }
    
    let validTo: Date | null = null;
    if (validToStr && validToStr !== '99999999' && /^\d{8}$/.test(validToStr)) {
      const year = parseInt(validToStr.substring(0, 4));
      const month = parseInt(validToStr.substring(4, 6)) - 1;
      const day = parseInt(validToStr.substring(6, 8));
      validTo = new Date(year, month, day);
    }
    
    serviceCodes.push({
      serviceCode,
      serviceName,
      points,
      insuranceType,
      validFrom,
      validTo,
      description: null,
      isActive: true,
    });
  }
  
  return serviceCodes;
}

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

    // 5. 訪問看護サービスコード（CSVファイルから読み込み）
    console.log('💊 訪問看護サービスコードを投入中...');
    
    // CSVファイルからサービスコードを読み込む
    const serviceCodesData = await loadServiceCodesFromCsv();
    
    if (serviceCodesData.length === 0) {
      console.log('⚠️  CSVファイルからサービスコードを読み込めませんでした。');
    } else {
      // データベースに投入
      await db.insert(nursingServiceCodes).values(serviceCodesData).onConflictDoNothing();
      console.log(`✓ 訪問看護サービスコード: ${serviceCodesData.length}件投入完了\n`);
    }

    // 投入件数をカウント
    const serviceCodesCount = serviceCodesData.length;
    const totalCount = 47 + 10 + 10 + 7 + serviceCodesCount;
    
    console.log('✅ マスターデータの投入が完了しました！');
    console.log('\n【投入結果】');
    console.log('  - 都道府県コード: 47件');
    console.log('  - 職員資格コード: 10件');
    console.log('  - 訪問場所コード: 10件');
    console.log('  - レセプト種別コード: 7件');
    console.log(`  - 訪問看護サービスコード: ${serviceCodesCount}件`);
    console.log(`  合計: ${totalCount}件`);

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
