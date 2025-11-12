/**
 * 介護保険サービスコードインポートスクリプト（CSV版）
 *
 * 介護給付費単位数等サービスコード表をCSV形式に変換したファイルから
 * サービスコードを読み込んでデータベースに投入します。
 *
 * CSVファイルの形式:
 *   - ファイル名: care_service_codes.csv
 *   - 配置場所: docs/recept/
 *   - エンコーディング: Shift-JIS または UTF-8
 *   - 列: サービスコード,サービス名,単位数（カンマ区切り）
 *
 * 実行方法:
 *   npx tsx scripts/import-care-service-codes-from-csv.ts
 *
 * CSVファイルの準備:
 *   1. PDFをExcelやGoogleスプレッドシートで開く
 *   2. サービスコード、サービス名、単位数の列を抽出
 *   3. CSV形式で保存（Shift-JISエンコーディング推奨）
 *   4. docs/recept/care_service_codes.csv として配置
 */

import fs from 'fs';
import path from 'path';
import iconv from 'iconv-lite';
import { db } from '../server/db';
import { nursingServiceCodes } from '../shared/schema';
import { eq } from 'drizzle-orm';

/**
 * CSVファイルからサービスコードを読み込む
 */
async function loadServiceCodesFromCsv() {
  const csvPath = path.join(process.cwd(), 'docs/recept/care_service_codes.csv');
  
  if (!fs.existsSync(csvPath)) {
    console.error(`⚠️  CSVファイルが見つかりません: ${csvPath}`);
    console.error('');
    console.error('📝 CSVファイルの準備方法:');
    console.error('   1. PDFをExcelやGoogleスプレッドシートで開く');
    console.error('   2. サービスコード、サービス名、単位数の列を抽出');
    console.error('   3. CSV形式で保存（Shift-JISエンコーディング推奨）');
    console.error(`   4. ${csvPath} として配置`);
    return [];
  }
  
  console.log('📄 CSVファイルを読み込み中...');
  const buffer = fs.readFileSync(csvPath);
  
  // エンコーディングを自動判定（UTF-8とShift-JISを試す）
  let text: string;
  try {
    // まずUTF-8で試す
    text = buffer.toString('utf-8');
    // BOMを除去
    if (text.charCodeAt(0) === 0xFEFF) {
      text = text.slice(1);
    }
  } catch {
    // UTF-8で失敗したらShift-JISで試す
    text = iconv.decode(buffer, 'shift_jis');
  }
  
  const lines = text.split('\n').filter(l => l.trim());
  
  const serviceCodes: Array<{
    serviceCode: string;
    serviceName: string;
    points: number; // 単位を格納（表示時に「単位」と表示）
    insuranceType: 'care';
    validFrom: Date;
    validTo: Date | null;
    description: string | null;
    isActive: boolean;
  }> = [];
  
  console.log(`📊 CSV情報:`);
  console.log(`   - 行数: ${lines.length}`);
  console.log('');
  
  // CSVをパース（カンマ区切り）
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue; // 空行とコメント行をスキップ
    
    // CSVパース（ダブルクォートで囲まれた値を考慮）
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim()); // 最後の値
    
    // 最低限、サービスコードが必要
    if (values.length < 1 || !values[0]) continue;
    
    const serviceCode = values[0].trim();
    
    // サービスコードが9桁の数字であることを確認
    if (!/^\d{9}$/.test(serviceCode)) {
      // ヘッダー行の可能性があるのでスキップ
      if (i === 0) continue;
      console.log(`   ⚠️  行 ${i + 1}: サービスコードが9桁の数字ではありません: ${serviceCode}`);
      continue;
    }
    
    // サービス名（2列目、なければ空文字列）
    const serviceName = (values[1] || '').trim().replace(/^"|"$/g, '');
    
    // 単位数（3列目、なければ0）
    let units = 0;
    if (values[2]) {
      const unitsStr = values[2].trim().replace(/^"|"$/g, '').replace(/[^\d.]/g, '');
      units = Math.round(parseFloat(unitsStr) || 0);
    }
    
    // サービス名が空の場合はスキップ
    if (!serviceName) {
      console.log(`   ⚠️  行 ${i + 1}: サービス名が空です: ${serviceCode}`);
      continue;
    }
    
    serviceCodes.push({
      serviceCode,
      serviceName: serviceName.substring(0, 200), // 最大200文字
      points: units, // 単位をpointsフィールドに格納
      insuranceType: 'care',
      validFrom: new Date('2025-04-01'), // 令和7年4月施行版
      validTo: null,
      description: null,
      isActive: true,
    });
  }
  
  console.log(`✅ ${serviceCodes.length}件のサービスコードを抽出しました。\n`);
  
  // 抽出結果のサンプルを表示
  if (serviceCodes.length > 0) {
    console.log('📋 抽出結果のサンプル（最初の5件）:');
    serviceCodes.slice(0, 5).forEach((code, index) => {
      console.log(`   ${index + 1}. ${code.serviceCode} - ${code.serviceName.substring(0, 50)}... (${code.points}単位)`);
    });
    console.log('');
  }
  
  return serviceCodes;
}

/**
 * データベースにサービスコードを投入
 */
async function importServiceCodes() {
  console.log('🚀 介護保険サービスコードのインポートを開始します...\n');

  try {
    // CSVからサービスコードを読み込む
    const serviceCodesData = await loadServiceCodesFromCsv();
    
    if (serviceCodesData.length === 0) {
      console.log('⚠️  サービスコードが見つかりませんでした。');
      console.log('    CSVファイルの形式を確認してください。');
      return;
    }
    
    // データベースに投入
    console.log('💾 データベースに投入中...');
    
    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    
    for (const codeData of serviceCodesData) {
      // 既存のサービスコードを確認
      const existing = await db.query.nursingServiceCodes.findFirst({
        where: eq(nursingServiceCodes.serviceCode, codeData.serviceCode),
      });
      
      if (existing) {
        // 既に存在する場合は更新（保険種別が異なる場合など）
        if (existing.insuranceType !== 'care') {
          await db.update(nursingServiceCodes)
            .set({
              serviceName: codeData.serviceName,
              points: codeData.points,
              insuranceType: 'care',
              validFrom: codeData.validFrom,
              validTo: codeData.validTo,
              description: codeData.description,
              isActive: codeData.isActive,
              updatedAt: new Date(),
            })
            .where(eq(nursingServiceCodes.id, existing.id));
          updatedCount++;
        } else {
          skippedCount++;
        }
      } else {
        // 新規追加
        await db.insert(nursingServiceCodes).values({
          id: crypto.randomUUID(),
          serviceCode: codeData.serviceCode,
          serviceName: codeData.serviceName,
          points: codeData.points,
          insuranceType: codeData.insuranceType,
          validFrom: codeData.validFrom,
          validTo: codeData.validTo,
          description: codeData.description,
          isActive: codeData.isActive,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        insertedCount++;
      }
    }
    
    console.log('\n✅ インポートが完了しました！');
    console.log('\n【投入結果】');
    console.log(`  - 新規追加: ${insertedCount}件`);
    console.log(`  - 更新: ${updatedCount}件`);
    console.log(`  - スキップ: ${skippedCount}件`);
    console.log(`  合計処理: ${serviceCodesData.length}件`);

  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error);
    throw error;
  }
}

// スクリプト実行
importServiceCodes()
  .then(() => {
    console.log('\n処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });


