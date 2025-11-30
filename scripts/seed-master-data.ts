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
import { eq, sql } from 'drizzle-orm';
import { db } from '../server/db';
import {
  prefectureCodes,
  staffQualificationCodes,
  visitLocationCodes,
  receiptTypeCodes,
  nursingServiceCodes,
  visitingNursingMasterBasic
} from '../shared/schema';

/**
 * CSVファイルからサービスコードを読み込む
 */
async function loadServiceCodesFromCsv() {
  const masterDir = path.join(process.cwd(), 'docs/recept/medical-insurance/visiting nursing_care_expenses_master');
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
    // 訪問看護療養費マスター基本テーブル用の追加データ
    instructionType: string | null; // 訪問看護指示区分（項番45）
    receiptSymbol1: string | null; // レセプト表示用記号①（項番56）
    receiptSymbol2: string | null; // レセプト表示用記号②（項番57）
    receiptSymbol3: string | null; // レセプト表示用記号③（項番58）
    receiptSymbol4: string | null; // レセプト表示用記号④（項番59）
    receiptSymbol5: string | null; // レセプト表示用記号⑤（項番60）
    receiptSymbol6: string | null; // レセプト表示用記号⑥（項番61）
    receiptSymbol7: string | null; // レセプト表示用記号⑦（項番62）
    receiptSymbol8: string | null; // レセプト表示用記号⑧（項番63）
    receiptSymbol9: string | null; // レセプト表示用記号⑨（項番64）
    serviceType: string | null; // 訪問看護療養費種類（項番67）
    // 摘要欄実装用フィールド
    receiptDisplayColumn: string | null; // レセプト表示欄（項番53、CSV列[52]）
    receiptDisplayItem: string | null; // レセプト表示項（項番54、CSV列[53]）
    amountType: string | null; // 金額識別（項番15、CSV列[14]）
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
    
    // 訪問看護療養費マスター基本テーブル用の追加データを抽出
    const instructionType = values[44] || null; // 訪問看護指示区分（項番45）
    const receiptSymbol1 = values[55] || null; // レセプト表示用記号①（項番56）
    const receiptSymbol2 = values[56] || null; // レセプト表示用記号②（項番57）
    const receiptSymbol3 = values[57] || null; // レセプト表示用記号③（項番58）
    const receiptSymbol4 = values[58] || null; // レセプト表示用記号④（項番59）
    const receiptSymbol5 = values[59] || null; // レセプト表示用記号⑤（項番60）
    const receiptSymbol6 = values[60] || null; // レセプト表示用記号⑥（項番61）
    const receiptSymbol7 = values[61] || null; // レセプト表示用記号⑦（項番62）
    const receiptSymbol8 = values[62] || null; // レセプト表示用記号⑧（項番63）
    const receiptSymbol9 = values[63] || null; // レセプト表示用記号⑨（項番64）
    const serviceType = values[66] || null; // 訪問看護療養費種類（項番67）
    
    // 摘要欄実装用フィールド
    const receiptDisplayColumn = values[52] || null; // レセプト表示欄（項番53、CSV列[52]）
    const receiptDisplayItem = values[53] || null; // レセプト表示項（項番54、CSV列[53]）
    const amountType = values[14] || null; // 金額識別（項番15、CSV列[14]）
    
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
      // 訪問看護療養費マスター基本テーブル用の追加データ
      instructionType,
      receiptSymbol1,
      receiptSymbol2,
      receiptSymbol3,
      receiptSymbol4,
      receiptSymbol5,
      receiptSymbol6,
      receiptSymbol7,
      receiptSymbol8,
      receiptSymbol9,
      serviceType,
      // 摘要欄実装用フィールド
      receiptDisplayColumn,
      receiptDisplayItem,
      amountType,
    });
  }
  
  return serviceCodes;
}

async function seedMasterData() {
  console.log('🚀 マスターデータの投入を開始します...\n');

  try {
    // 1. 都道府県コード（別表2、47件）
    console.log('📍 都道府県コードを投入中...');
    await db.insert(prefectureCodes).values([
      { prefectureCode: '01', prefectureName: '北海道', displayOrder: 1, isActive: true },
      { prefectureCode: '02', prefectureName: '青森', displayOrder: 2, isActive: true },
      { prefectureCode: '03', prefectureName: '岩手', displayOrder: 3, isActive: true },
      { prefectureCode: '04', prefectureName: '宮城', displayOrder: 4, isActive: true },
      { prefectureCode: '05', prefectureName: '秋田', displayOrder: 5, isActive: true },
      { prefectureCode: '06', prefectureName: '山形', displayOrder: 6, isActive: true },
      { prefectureCode: '07', prefectureName: '福島', displayOrder: 7, isActive: true },
      { prefectureCode: '08', prefectureName: '茨城', displayOrder: 8, isActive: true },
      { prefectureCode: '09', prefectureName: '栃木', displayOrder: 9, isActive: true },
      { prefectureCode: '10', prefectureName: '群馬', displayOrder: 10, isActive: true },
      { prefectureCode: '11', prefectureName: '埼玉', displayOrder: 11, isActive: true },
      { prefectureCode: '12', prefectureName: '千葉', displayOrder: 12, isActive: true },
      { prefectureCode: '13', prefectureName: '東京', displayOrder: 13, isActive: true },
      { prefectureCode: '14', prefectureName: '神奈川', displayOrder: 14, isActive: true },
      { prefectureCode: '15', prefectureName: '新潟', displayOrder: 15, isActive: true },
      { prefectureCode: '16', prefectureName: '富山', displayOrder: 16, isActive: true },
      { prefectureCode: '17', prefectureName: '石川', displayOrder: 17, isActive: true },
      { prefectureCode: '18', prefectureName: '福井', displayOrder: 18, isActive: true },
      { prefectureCode: '19', prefectureName: '山梨', displayOrder: 19, isActive: true },
      { prefectureCode: '20', prefectureName: '長野', displayOrder: 20, isActive: true },
      { prefectureCode: '21', prefectureName: '岐阜', displayOrder: 21, isActive: true },
      { prefectureCode: '22', prefectureName: '静岡', displayOrder: 22, isActive: true },
      { prefectureCode: '23', prefectureName: '愛知', displayOrder: 23, isActive: true },
      { prefectureCode: '24', prefectureName: '三重', displayOrder: 24, isActive: true },
      { prefectureCode: '25', prefectureName: '滋賀', displayOrder: 25, isActive: true },
      { prefectureCode: '26', prefectureName: '京都', displayOrder: 26, isActive: true },
      { prefectureCode: '27', prefectureName: '大阪', displayOrder: 27, isActive: true },
      { prefectureCode: '28', prefectureName: '兵庫', displayOrder: 28, isActive: true },
      { prefectureCode: '29', prefectureName: '奈良', displayOrder: 29, isActive: true },
      { prefectureCode: '30', prefectureName: '和歌山', displayOrder: 30, isActive: true },
      { prefectureCode: '31', prefectureName: '鳥取', displayOrder: 31, isActive: true },
      { prefectureCode: '32', prefectureName: '島根', displayOrder: 32, isActive: true },
      { prefectureCode: '33', prefectureName: '岡山', displayOrder: 33, isActive: true },
      { prefectureCode: '34', prefectureName: '広島', displayOrder: 34, isActive: true },
      { prefectureCode: '35', prefectureName: '山口', displayOrder: 35, isActive: true },
      { prefectureCode: '36', prefectureName: '徳島', displayOrder: 36, isActive: true },
      { prefectureCode: '37', prefectureName: '香川', displayOrder: 37, isActive: true },
      { prefectureCode: '38', prefectureName: '愛媛', displayOrder: 38, isActive: true },
      { prefectureCode: '39', prefectureName: '高知', displayOrder: 39, isActive: true },
      { prefectureCode: '40', prefectureName: '福岡', displayOrder: 40, isActive: true },
      { prefectureCode: '41', prefectureName: '佐賀', displayOrder: 41, isActive: true },
      { prefectureCode: '42', prefectureName: '長崎', displayOrder: 42, isActive: true },
      { prefectureCode: '43', prefectureName: '熊本', displayOrder: 43, isActive: true },
      { prefectureCode: '44', prefectureName: '大分', displayOrder: 44, isActive: true },
      { prefectureCode: '45', prefectureName: '宮崎', displayOrder: 45, isActive: true },
      { prefectureCode: '46', prefectureName: '鹿児島', displayOrder: 46, isActive: true },
      { prefectureCode: '47', prefectureName: '沖縄', displayOrder: 47, isActive: true },
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
      { locationCode: '01', locationName: '自宅', description: '利用者の自宅', displayOrder: 10, isActive: true },
      { locationCode: '11', locationName: '施設（社会福祉施設及び身体障害者施設）', description: '社会福祉施設及び身体障害者施設', displayOrder: 20, isActive: true },
      { locationCode: '12', locationName: '施設（小規模多機能型居宅介護）', description: '小規模多機能型居宅介護', displayOrder: 30, isActive: true },
      { locationCode: '13', locationName: '施設（複合型サービス）', description: '複合型サービス', displayOrder: 40, isActive: true },
      { locationCode: '14', locationName: '施設（認知症対応型グループホーム）', description: '認知症対応型グループホーム', displayOrder: 50, isActive: true },
      { locationCode: '15', locationName: '施設（特定施設）', description: '特定施設', displayOrder: 60, isActive: true },
      { locationCode: '16', locationName: '施設（地域密着型介護老人福祉施設及び介護老人福祉施設）', description: '地域密着型介護老人福祉施設及び介護老人福祉施設', displayOrder: 70, isActive: true },
      { locationCode: '31', locationName: '病院', description: '医療機関（病院）', displayOrder: 80, isActive: true },
      { locationCode: '32', locationName: '診療所', description: '医療機関（診療所）', displayOrder: 90, isActive: true },
      { locationCode: '99', locationName: 'その他', description: 'その他の場所', displayOrder: 100, isActive: true },
    ]).onConflictDoNothing();
    console.log('✓ 訪問場所コード: 10件投入完了\n');

    // 4. レセプト種別コード（別表4）
    console.log('📄 レセプト種別コードを投入中...');
    await db.insert(receiptTypeCodes).values([
      // 訪問看護・医保単独/国保単独（5種類）
      { receiptTypeCode: '6112', receiptTypeName: '訪問看護・医保単独/国保単独・本人/世帯主', insuranceType: 'medical', description: '医療保険単独、本人または世帯主', displayOrder: 10, isActive: true },
      { receiptTypeCode: '6114', receiptTypeName: '訪問看護・医保単独/国保単独・未就学者', insuranceType: 'medical', description: '医療保険単独、未就学者', displayOrder: 20, isActive: true },
      { receiptTypeCode: '6116', receiptTypeName: '訪問看護・医保単独/国保単独・家族/その他', insuranceType: 'medical', description: '医療保険単独、家族またはその他', displayOrder: 30, isActive: true },
      { receiptTypeCode: '6118', receiptTypeName: '訪問看護・医保単独/国保単独・高齢受給者一般・低所得者', insuranceType: 'medical', description: '医療保険単独、高齢受給者一般・低所得者', displayOrder: 40, isActive: true },
      { receiptTypeCode: '6110', receiptTypeName: '訪問看護・医保単独/国保単独・高齢受給者7割', insuranceType: 'medical', description: '医療保険単独、高齢受給者7割', displayOrder: 50, isActive: true },
      // 訪問看護・医保/国保と1種の公費併用（5種類）
      { receiptTypeCode: '6122', receiptTypeName: '訪問看護・医保/国保と1種の公費併用・本人/世帯主', insuranceType: 'medical', description: '医療保険と1種の公費併用、本人または世帯主', displayOrder: 110, isActive: true },
      { receiptTypeCode: '6124', receiptTypeName: '訪問看護・医保/国保と1種の公費併用・未就学者', insuranceType: 'medical', description: '医療保険と1種の公費併用、未就学者', displayOrder: 120, isActive: true },
      { receiptTypeCode: '6126', receiptTypeName: '訪問看護・医保/国保と1種の公費併用・家族/その他', insuranceType: 'medical', description: '医療保険と1種の公費併用、家族またはその他', displayOrder: 130, isActive: true },
      { receiptTypeCode: '6128', receiptTypeName: '訪問看護・医保/国保と1種の公費併用・高齢受給者一般・低所得者', insuranceType: 'medical', description: '医療保険と1種の公費併用、高齢受給者一般・低所得者', displayOrder: 140, isActive: true },
      { receiptTypeCode: '6120', receiptTypeName: '訪問看護・医保/国保と1種の公費併用・高齢受給者7割', insuranceType: 'medical', description: '医療保険と1種の公費併用、高齢受給者7割', displayOrder: 150, isActive: true },
      // 訪問看護・医保/国保と2種の公費併用（5種類）
      { receiptTypeCode: '6132', receiptTypeName: '訪問看護・医保/国保と2種の公費併用・本人/世帯主', insuranceType: 'medical', description: '医療保険と2種の公費併用、本人または世帯主', displayOrder: 210, isActive: true },
      { receiptTypeCode: '6134', receiptTypeName: '訪問看護・医保/国保と2種の公費併用・未就学者', insuranceType: 'medical', description: '医療保険と2種の公費併用、未就学者', displayOrder: 220, isActive: true },
      { receiptTypeCode: '6136', receiptTypeName: '訪問看護・医保/国保と2種の公費併用・家族/その他', insuranceType: 'medical', description: '医療保険と2種の公費併用、家族またはその他', displayOrder: 230, isActive: true },
      { receiptTypeCode: '6138', receiptTypeName: '訪問看護・医保/国保と2種の公費併用・高齢受給者一般・低所得者', insuranceType: 'medical', description: '医療保険と2種の公費併用、高齢受給者一般・低所得者', displayOrder: 240, isActive: true },
      { receiptTypeCode: '6130', receiptTypeName: '訪問看護・医保/国保と2種の公費併用・高齢受給者7割', insuranceType: 'medical', description: '医療保険と2種の公費併用、高齢受給者7割', displayOrder: 250, isActive: true },
      // 訪問看護・医保/国保と3種の公費併用（5種類）
      { receiptTypeCode: '6142', receiptTypeName: '訪問看護・医保/国保と3種の公費併用・本人/世帯主', insuranceType: 'medical', description: '医療保険と3種の公費併用、本人または世帯主', displayOrder: 310, isActive: true },
      { receiptTypeCode: '6144', receiptTypeName: '訪問看護・医保/国保と3種の公費併用・未就学者', insuranceType: 'medical', description: '医療保険と3種の公費併用、未就学者', displayOrder: 320, isActive: true },
      { receiptTypeCode: '6146', receiptTypeName: '訪問看護・医保/国保と3種の公費併用・家族/その他', insuranceType: 'medical', description: '医療保険と3種の公費併用、家族またはその他', displayOrder: 330, isActive: true },
      { receiptTypeCode: '6148', receiptTypeName: '訪問看護・医保/国保と3種の公費併用・高齢受給者一般・低所得者', insuranceType: 'medical', description: '医療保険と3種の公費併用、高齢受給者一般・低所得者', displayOrder: 340, isActive: true },
      { receiptTypeCode: '6140', receiptTypeName: '訪問看護・医保/国保と3種の公費併用・高齢受給者7割', insuranceType: 'medical', description: '医療保険と3種の公費併用、高齢受給者7割', displayOrder: 350, isActive: true },
      // 訪問看護・医保/国保と4種の公費併用（5種類）
      { receiptTypeCode: '6152', receiptTypeName: '訪問看護・医保/国保と4種の公費併用・本人/世帯主', insuranceType: 'medical', description: '医療保険と4種の公費併用、本人または世帯主', displayOrder: 410, isActive: true },
      { receiptTypeCode: '6154', receiptTypeName: '訪問看護・医保/国保と4種の公費併用・未就学者', insuranceType: 'medical', description: '医療保険と4種の公費併用、未就学者', displayOrder: 420, isActive: true },
      { receiptTypeCode: '6156', receiptTypeName: '訪問看護・医保/国保と4種の公費併用・家族/その他', insuranceType: 'medical', description: '医療保険と4種の公費併用、家族またはその他', displayOrder: 430, isActive: true },
      { receiptTypeCode: '6158', receiptTypeName: '訪問看護・医保/国保と4種の公費併用・高齢受給者一般・低所得者', insuranceType: 'medical', description: '医療保険と4種の公費併用、高齢受給者一般・低所得者', displayOrder: 440, isActive: true },
      { receiptTypeCode: '6150', receiptTypeName: '訪問看護・医保/国保と4種の公費併用・高齢受給者7割', insuranceType: 'medical', description: '医療保険と4種の公費併用、高齢受給者7割', displayOrder: 450, isActive: true },
      // 訪問看護・公費単独（4種類）
      { receiptTypeCode: '6212', receiptTypeName: '訪問看護・公費単独', insuranceType: 'medical', description: '公費負担医療単独', displayOrder: 510, isActive: true },
      { receiptTypeCode: '6222', receiptTypeName: '訪問看護・2種の公費併用', insuranceType: 'medical', description: '2種の公費負担医療併用', displayOrder: 520, isActive: true },
      { receiptTypeCode: '6232', receiptTypeName: '訪問看護・3種の公費併用', insuranceType: 'medical', description: '3種の公費負担医療併用', displayOrder: 530, isActive: true },
      { receiptTypeCode: '6242', receiptTypeName: '訪問看護・4種の公費併用', insuranceType: 'medical', description: '4種の公費負担医療併用', displayOrder: 540, isActive: true },
      // 訪問看護・後期高齢者単独（2種類）
      { receiptTypeCode: '6318', receiptTypeName: '訪問看護・後期高齢者単独・一般・低所得者', insuranceType: 'medical', description: '後期高齢者医療単独、一般・低所得者', displayOrder: 610, isActive: true },
      { receiptTypeCode: '6310', receiptTypeName: '訪問看護・後期高齢者単独・7割', insuranceType: 'medical', description: '後期高齢者医療単独、7割', displayOrder: 620, isActive: true },
      // 訪問看護・後期高齢者と1種の公費併用（2種類）
      { receiptTypeCode: '6328', receiptTypeName: '訪問看護・後期高齢者と1種の公費併用・一般・低所得者', insuranceType: 'medical', description: '後期高齢者医療と1種の公費併用、一般・低所得者', displayOrder: 710, isActive: true },
      { receiptTypeCode: '6320', receiptTypeName: '訪問看護・後期高齢者と1種の公費併用・7割', insuranceType: 'medical', description: '後期高齢者医療と1種の公費併用、7割', displayOrder: 720, isActive: true },
      // 訪問看護・後期高齢者と2種の公費併用（2種類）
      { receiptTypeCode: '6338', receiptTypeName: '訪問看護・後期高齢者と2種の公費併用・一般・低所得者', insuranceType: 'medical', description: '後期高齢者医療と2種の公費併用、一般・低所得者', displayOrder: 810, isActive: true },
      { receiptTypeCode: '6330', receiptTypeName: '訪問看護・後期高齢者と2種の公費併用・7割', insuranceType: 'medical', description: '後期高齢者医療と2種の公費併用、7割', displayOrder: 820, isActive: true },
      // 訪問看護・後期高齢者と3種の公費併用（2種類）
      { receiptTypeCode: '6348', receiptTypeName: '訪問看護・後期高齢者と3種の公費併用・一般・低所得者', insuranceType: 'medical', description: '後期高齢者医療と3種の公費併用、一般・低所得者', displayOrder: 910, isActive: true },
      { receiptTypeCode: '6340', receiptTypeName: '訪問看護・後期高齢者と3種の公費併用・7割', insuranceType: 'medical', description: '後期高齢者医療と3種の公費併用、7割', displayOrder: 920, isActive: true },
      // 訪問看護・後期高齢者と4種の公費併用（2種類）
      { receiptTypeCode: '6358', receiptTypeName: '訪問看護・後期高齢者と4種の公費併用・一般・低所得者', insuranceType: 'medical', description: '後期高齢者医療と4種の公費併用、一般・低所得者', displayOrder: 1010, isActive: true },
      { receiptTypeCode: '6350', receiptTypeName: '訪問看護・後期高齢者と4種の公費併用・7割', insuranceType: 'medical', description: '後期高齢者医療と4種の公費併用、7割', displayOrder: 1020, isActive: true },
    ]).onConflictDoNothing();
    console.log('✓ レセプト種別コード: 39件投入完了\n');

    // 5. 訪問看護療養費マスター基本テーブル（CSVファイルから読み込んだ追加データを投入）
    // 注意: nursingServiceCodesテーブルへの投入は行わず、既存のレコードを参照します
    console.log('📋 訪問看護療養費マスター基本テーブルを投入中...');
    
    // CSVファイルからサービスコードと追加データを読み込む
    const serviceCodesData = await loadServiceCodesFromCsv();
    
    // masterBasicDataをブロック外で定義
    let masterBasicData: Array<{
      serviceCodeId: string;
      instructionType: string | null;
      receiptSymbol1: string | null;
      receiptSymbol2: string | null;
      receiptSymbol3: string | null;
      receiptSymbol4: string | null;
      receiptSymbol5: string | null;
      receiptSymbol6: string | null;
      receiptSymbol7: string | null;
      receiptSymbol8: string | null;
      receiptSymbol9: string | null;
      serviceType: string | null;
      receiptDisplayColumn: string | null;
      receiptDisplayItem: string | null;
      amountType: string | null;
    }> = [];
    
    if (serviceCodesData.length === 0) {
      console.log('⚠️  CSVファイルからサービスコードを読み込めませんでした。\n');
    } else {
      let foundCount = 0;
      let notFoundCount = 0;
      
      // 各サービスコードに対して、既存のnursingServiceCodesテーブルからserviceCodeIdを取得
      for (const serviceData of serviceCodesData) {
        // serviceCodeから既存のレコードを検索
        const serviceCodeRecord = await db.query.nursingServiceCodes.findFirst({
          where: eq(nursingServiceCodes.serviceCode, serviceData.serviceCode),
        });
        
        if (serviceCodeRecord) {
          masterBasicData.push({
            serviceCodeId: serviceCodeRecord.id,
            instructionType: serviceData.instructionType,
            receiptSymbol1: serviceData.receiptSymbol1,
            receiptSymbol2: serviceData.receiptSymbol2,
            receiptSymbol3: serviceData.receiptSymbol3,
            receiptSymbol4: serviceData.receiptSymbol4,
            receiptSymbol5: serviceData.receiptSymbol5,
            receiptSymbol6: serviceData.receiptSymbol6,
            receiptSymbol7: serviceData.receiptSymbol7,
            receiptSymbol8: serviceData.receiptSymbol8,
            receiptSymbol9: serviceData.receiptSymbol9,
            serviceType: serviceData.serviceType,
            receiptDisplayColumn: serviceData.receiptDisplayColumn,
            receiptDisplayItem: serviceData.receiptDisplayItem,
            amountType: serviceData.amountType,
          });
          foundCount++;
        } else {
          notFoundCount++;
          console.log(`  ⚠️  サービスコード ${serviceData.serviceCode} が見つかりませんでした（スキップ）`);
        }
      }
      
      if (masterBasicData.length > 0) {
        // 既存レコードも更新するため、onConflictDoUpdateを使用
        await db.insert(visitingNursingMasterBasic)
          .values(masterBasicData)
          .onConflictDoUpdate({
            target: visitingNursingMasterBasic.serviceCodeId,
            set: {
              instructionType: sql`EXCLUDED.instruction_type`,
              receiptSymbol1: sql`EXCLUDED.receipt_symbol_1`,
              receiptSymbol2: sql`EXCLUDED.receipt_symbol_2`,
              receiptSymbol3: sql`EXCLUDED.receipt_symbol_3`,
              receiptSymbol4: sql`EXCLUDED.receipt_symbol_4`,
              receiptSymbol5: sql`EXCLUDED.receipt_symbol_5`,
              receiptSymbol6: sql`EXCLUDED.receipt_symbol_6`,
              receiptSymbol7: sql`EXCLUDED.receipt_symbol_7`,
              receiptSymbol8: sql`EXCLUDED.receipt_symbol_8`,
              receiptSymbol9: sql`EXCLUDED.receipt_symbol_9`,
              serviceType: sql`EXCLUDED.service_type`,
              receiptDisplayColumn: sql`EXCLUDED.receipt_display_column`,
              receiptDisplayItem: sql`EXCLUDED.receipt_display_item`,
              amountType: sql`EXCLUDED.amount_type`,
              updatedAt: sql`CURRENT_TIMESTAMP`,
            },
          });
        console.log(`✓ 訪問看護療養費マスター基本テーブル: ${masterBasicData.length}件投入/更新完了`);
        if (notFoundCount > 0) {
          console.log(`  ⚠️  ${notFoundCount}件のサービスコードが既存テーブルに見つかりませんでした\n`);
        } else {
          console.log('');
        }
      } else {
        console.log('⚠️  マスターデータの投入対象がありませんでした。\n');
      }
    }

    // 投入件数をカウント
    const masterBasicCount = serviceCodesData.length > 0 ? serviceCodesData.filter((_, index) => {
      // 実際に投入された件数をカウント（簡易版）
      return true;
    }).length : 0;
    const totalCount = 47 + 10 + 10 + 39 + (serviceCodesData.length > 0 ? masterBasicData.length : 0);
    
    console.log('✅ マスターデータの投入が完了しました！');
    console.log('\n【投入結果】');
    console.log('  - 都道府県コード: 47件');
    console.log('  - 職員資格コード: 10件');
    console.log('  - 訪問場所コード: 10件');
    console.log('  - レセプト種別コード: 39件');
    console.log(`  - 訪問看護療養費マスター基本テーブル: ${serviceCodesData.length > 0 ? masterBasicData.length : 0}件`);
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
