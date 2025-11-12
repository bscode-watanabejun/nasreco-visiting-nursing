/**
 * 不足分介護保険サービスコードインポートスクリプト
 *
 * 不足分Excelファイルからサービスコードを読み込んでデータベースに投入します。
 * 重複は自動的に除外されます。
 *
 * 実行方法:
 *   npx tsx scripts/import-missing-care-service-codes.ts
 */

import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { db } from '../server/db';
import { nursingServiceCodes } from '../shared/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

/**
 * Excelファイルからサービスコードを読み込む
 */
async function loadMissingServiceCodesFromExcel() {
  // ディレクトリからファイルを検索
  const receptDir = path.join(process.cwd(), 'docs/recept');
  const files = fs.readdirSync(receptDir);
  const targetFile = files.find(f => f.includes('不足分') && f.endsWith('.xlsx'));
  
  if (!targetFile) {
    console.error(`⚠️  不足分のExcelファイルが見つかりません`);
    console.log(`検索ディレクトリ: ${receptDir}`);
    return [];
  }
  
  const excelPath = path.join(receptDir, targetFile);
  console.log(`✅ ファイルを発見: ${targetFile}`);
  console.log(`📁 フルパス: ${excelPath}\n`);
  
  console.log('📄 Excelファイルを読み込み中...');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(excelPath);
  
  // 「不足分」シートを取得
  const worksheet = workbook.getWorksheet('不足分');
  if (!worksheet) {
    console.error('⚠️  「不足分」シートが見つかりません');
    return [];
  }
  
  console.log(`✅ 「不足分」シートを発見しました`);
  console.log(`   - 行数: ${worksheet.rowCount}`);
  console.log(`   - 列数: ${worksheet.columnCount}\n`);
  
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
  
  const serviceCodesMap = new Map<string, {
    serviceCode: string;
    serviceName: string;
    points: number;
    rowNumber: number;
  }>();
  
  console.log('📊 データ抽出中...');
  
  // 行1から開始
  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    
    // A列とB列からサービスコードを取得
    const colA = getCellValue(row.getCell(1));
    const colB = getCellValue(row.getCell(2));
    const combined = (colA + colB).trim();
    
    // サービスコードが空の場合はスキップ
    if (!combined || combined.length === 0) {
      continue;
    }
    
    // ヘッダー行をスキップ
    if (combined.includes('種類') || combined.includes('項目') || 
        colA === '種類' || colB === '項目' || 
        (colA === '13' && (colB === '' || colB === '種類'))) {
      continue;
    }
    
    let serviceCode = '';
    
    // パターン1: 「13」で始まる6桁の数字（例: 131111）
    const match6 = combined.match(/13\d{4}/);
    if (match6) {
      serviceCode = match6[0];
    }
    // パターン2: B列が6桁で「13」から始まる（例: 131111）
    else if (colB && /^13\d{4}$/.test(colB)) {
      serviceCode = colB;
    }
    // パターン3: 「13」+ アルファベット + 数字（例: 13A037）
    else if (combined.match(/^13[A-Z]\d{3}$/)) {
      serviceCode = combined;
    }
    // パターン4: A列が「13」でB列がアルファベット+数字（例: 13 + A037）
    else if (colA === '13' && colB && /^[A-Z]\d{3}$/.test(colB)) {
      serviceCode = colA + colB;
    }
    // パターン5: 9桁の数字（例: 131111111）
    else {
      const match9 = combined.match(/13\d{7}/);
      if (match9) {
        serviceCode = match9[0];
      } else {
        continue;
      }
    }
    
    // 既に同じサービスコードが抽出されている場合はスキップ（重複除去）
    if (serviceCodesMap.has(serviceCode)) {
      continue;
    }
    
    // C列からサービス名を取得
    const serviceName = getCellValue(row.getCell(3));
    
    // 単位数を取得（14列目=N列から取得）
    let units = 0;
    const colNCell = row.getCell(14); // N列は14番目
    
    if (colNCell && colNCell.value !== null && colNCell.value !== undefined) {
      const colNValue = colNCell.value;
      if (typeof colNValue === 'number') {
        units = Math.round(colNValue);
      } else {
        // 文字列の場合は数値に抽出
        const cellText = getCellValue(colNCell);
        const numMatch = cellText.match(/\d+/);
        if (numMatch) {
          units = parseInt(numMatch[0]);
        } else {
          const unitsStr = colNValue.toString().trim().replace(/[^\d.]/g, '');
          units = Math.round(parseFloat(unitsStr) || 0);
        }
      }
    }
    
    if (serviceCode) {
      serviceCodesMap.set(serviceCode, {
        serviceCode,
        serviceName: serviceName || serviceCode,
        points: units,
        rowNumber,
      });
    }
  }
  
  const serviceCodes = Array.from(serviceCodesMap.values());
  
  console.log(`✅ ${serviceCodes.length}件のサービスコードを抽出しました（重複除去済み）。\n`);
  
  // 抽出結果のサンプルを表示
  if (serviceCodes.length > 0) {
    console.log('📋 抽出結果のサンプル（最初の10件）:');
    serviceCodes.slice(0, 10).forEach((code, index) => {
      console.log(`   ${index + 1}. ${code.serviceCode} - ${code.serviceName.substring(0, 50)}... (${code.points}単位)`);
    });
    console.log('');
  }
  
  return serviceCodes.map(code => ({
    serviceCode: code.serviceCode,
    serviceName: code.serviceName,
    points: code.points,
    insuranceType: 'care' as const,
    validFrom: new Date('2025-04-01'), // 令和7年4月施行版
    validTo: null,
    description: null,
    isActive: true,
  }));
}

/**
 * データベースにサービスコードを投入
 */
async function importMissingServiceCodes() {
  console.log('🚀 不足分介護保険サービスコードのインポートを開始します...\n');

  try {
    // Excelからサービスコードを読み込む
    const serviceCodesData = await loadMissingServiceCodesFromExcel();
    
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
    let errorCount = 0;
    
    for (const codeData of serviceCodesData) {
      try {
        // 既存のサービスコードを確認
        const existing = await db.query.nursingServiceCodes.findFirst({
          where: eq(nursingServiceCodes.serviceCode, codeData.serviceCode),
        });
        
        if (existing) {
          // 既に存在する場合は更新（保険種別が異なる場合や、単位数が更新されている場合）
          if (existing.insuranceType !== 'care' || existing.points !== codeData.points) {
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
            console.log(`   ✅ 更新: ${codeData.serviceCode} - ${codeData.serviceName.substring(0, 40)}... (${codeData.points}単位)`);
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
          console.log(`   ✅ 追加: ${codeData.serviceCode} - ${codeData.serviceName.substring(0, 40)}... (${codeData.points}単位)`);
        }
      } catch (error) {
        errorCount++;
        console.error(`   ❌ エラー: ${codeData.serviceCode} - ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    console.log('\n✅ インポートが完了しました！');
    console.log('\n【投入結果】');
    console.log(`  - 新規追加: ${insertedCount}件`);
    console.log(`  - 更新: ${updatedCount}件`);
    console.log(`  - スキップ（既存）: ${skippedCount}件`);
    console.log(`  - エラー: ${errorCount}件`);
    console.log(`  合計処理: ${serviceCodesData.length}件`);

  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error);
    throw error;
  }
}

// スクリプト実行
importMissingServiceCodes()
  .then(() => {
    console.log('\n処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

