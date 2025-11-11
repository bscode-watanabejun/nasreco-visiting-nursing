/**
 * 介護保険サービスコードインポートスクリプト（Excel版）
 *
 * 介護給付費単位数等サービスコード表（Excel）からサービスコードを読み込んで
 * データベースに投入します。
 *
 * Excelファイルの形式:
 *   - A列・B列: サービスコード（9桁の数字）
 *   - C列: サービス内容省略
 *   - P列: 単位数
 *
 * 実行方法:
 *   npx tsx scripts/import-care-service-codes-from-excel.ts
 */

import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { db } from '../server/db';
import { nursingServiceCodes } from '../shared/schema';
import { eq } from 'drizzle-orm';

/**
 * Excelファイルからサービスコードを読み込む
 */
async function loadServiceCodesFromExcel() {
  const excelPath = path.join(process.cwd(), 'docs/recept/介護給付費単位数等サービスコード表（令和７年４月施行版）.xlsx');
  
  if (!fs.existsSync(excelPath)) {
    console.error(`⚠️  Excelファイルが見つかりません: ${excelPath}`);
    return [];
  }
  
  console.log('📄 Excelファイルを読み込み中...');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(excelPath);
  
  // 最初のワークシートを取得
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    console.error('⚠️  ワークシートが見つかりません');
    return [];
  }
  
  console.log(`📊 Excel情報:`);
  console.log(`   - ワークシート名: ${worksheet.name}`);
  console.log(`   - 行数: ${worksheet.rowCount}`);
  console.log('');
  
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
  
  // 各行を処理（1行目はヘッダーの可能性があるので、2行目から開始）
  let processedCount = 0;
  let skippedCount = 0;
  
  // セルの値を文字列として取得するヘルパー関数
  const getCellValue = (cell: ExcelJS.Cell): string => {
    if (!cell || !cell.value) return '';
    if (typeof cell.value === 'string') return cell.value.trim();
    if (typeof cell.value === 'number') return cell.value.toString().trim();
    if (cell.value.richText) {
      return cell.value.richText.map(rt => rt.text).join('').trim();
    }
    return cell.value.toString().trim();
  };
  
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    
    // A列とB列からサービスコードを取得
    const colA = getCellValue(row.getCell(1));
    const colB = getCellValue(row.getCell(2));
    
    // A列とB列を結合
    const combined = (colA + colB).trim();
    
    // サービスコードが空の場合はスキップ
    if (!combined || combined.length === 0) {
      skippedCount++;
      continue;
    }
    
    // ヘッダー行をスキップ（「種類」「項目」などの文字列が含まれる場合）
    if (combined.includes('種類') || combined.includes('項目') || 
        colA === '種類' || colB === '項目' || colA === '' || colB === '') {
      if (rowNumber <= 5) {
        console.log(`   📋 ヘッダー行 ${rowNumber}: A列="${colA}", B列="${colB}", 結合="${combined}"`);
      }
      skippedCount++;
      continue;
    }
    
    // 介護保険のサービスコードは6桁で「13」から始まる
    // A列+B列から「13」で始まる6桁の数字を抽出
    // 例: "111131010" -> "131010"
    let serviceCode = '';
    
    // 「13」で始まる6桁の数字を検索
    const match = combined.match(/13\d{4}/);
    if (match) {
      serviceCode = match[0];
    } else {
      // 見つからない場合は、B列が6桁で「13」から始まるか確認
      if (colB && /^13\d{4}$/.test(colB)) {
        serviceCode = colB;
      } else {
        // それでも見つからない場合はスキップ
        if (rowNumber <= 15) {
          console.log(`   ⚠️  行 ${rowNumber}: サービスコードが見つかりません (A列="${colA}", B列="${colB}", 結合="${combined}")`);
        }
        skippedCount++;
        continue;
      }
    }
    
    // C列からサービス名を取得
    const serviceName = getCellValue(row.getCell(3));
    
    // P列から単位数を取得
    const colPCell = row.getCell(16); // P列は16番目
    let units = 0;
    
    if (colPCell && colPCell.value !== null && colPCell.value !== undefined) {
      const colPValue = colPCell.value;
      // 数値型の場合はそのまま使用
      if (typeof colPValue === 'number') {
        units = Math.round(colPValue);
      } else {
        // 文字列の場合は数値に変換
        const unitsStr = colPValue.toString().trim().replace(/[^\d.]/g, '');
        units = Math.round(parseFloat(unitsStr) || 0);
      }
    }
    
    // サービス名が空の場合でも、サービスコードがあれば登録（サービス名は空文字列またはサービスコードを使用）
    const finalServiceName = serviceName || serviceCode;
    
    serviceCodes.push({
      serviceCode,
      serviceName: finalServiceName.substring(0, 200), // 最大200文字
      points: units, // 単位をpointsフィールドに格納
      insuranceType: 'care',
      validFrom: new Date('2025-04-01'), // 令和7年4月施行版
      validTo: null,
      description: null,
      isActive: true,
    });
    
    processedCount++;
    
    // 最初の20件と最後の20件をデバッグ出力
    if (processedCount <= 20 || processedCount > serviceCodes.length - 20) {
      console.log(`   ✅ 行 ${rowNumber}: ${serviceCode} - ${finalServiceName.substring(0, 40)}... (${units}単位)`);
    }
  }
  
  console.log(`✅ ${serviceCodes.length}件のサービスコードを抽出しました。`);
  console.log(`   - 処理行数: ${processedCount}件`);
  console.log(`   - スキップ行数: ${skippedCount}件`);
  console.log('');
  
  // 抽出結果のサンプルを表示
  if (serviceCodes.length > 0) {
    console.log('📋 抽出結果のサンプル（最初の10件）:');
    serviceCodes.slice(0, 10).forEach((code, index) => {
      console.log(`   ${index + 1}. ${code.serviceCode} - ${code.serviceName.substring(0, 60)}... (${code.points}単位)`);
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
    // Excelからサービスコードを読み込む
    const serviceCodesData = await loadServiceCodesFromExcel();
    
    if (serviceCodesData.length === 0) {
      console.log('⚠️  サービスコードが見つかりませんでした。');
      console.log('    Excelファイルの形式を確認してください。');
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
          // 同じ保険種別の場合はスキップ（既に存在）
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
    console.log(`  - スキップ（既存）: ${skippedCount}件`);
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

