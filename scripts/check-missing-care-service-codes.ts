/**
 * 不足分Excelファイルの内容確認スクリプト
 * 
 * 実行方法:
 *   npx tsx scripts/check-missing-care-service-codes.ts
 */

import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';

async function checkMissingServiceCodes() {
  // ディレクトリからファイルを検索
  const receptDir = path.join(process.cwd(), 'docs/recept');
  const files = fs.readdirSync(receptDir);
  const targetFile = files.find(f => f.includes('不足分') && f.endsWith('.xlsx'));
  
  if (!targetFile) {
    console.error(`⚠️  不足分のExcelファイルが見つかりません`);
    console.log(`検索ディレクトリ: ${receptDir}`);
    console.log(`見つかったファイル:`, files.filter(f => f.includes('不足') || f.includes('介護')).slice(0, 5));
    return;
  }
  
  const excelPath = path.join(receptDir, targetFile);
  console.log(`✅ ファイルを発見: ${targetFile}`);
  console.log(`📁 フルパス: ${excelPath}\n`);
  
  await checkFile(excelPath);
}

async function checkFile(excelPath: string) {
  
  console.log('📄 Excelファイルを読み込み中...');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(excelPath);
  
  // ワークシート一覧を表示
  console.log('\n📊 ワークシート一覧:');
  workbook.worksheets.forEach((ws, index) => {
    console.log(`   ${index + 1}. ${ws.name} (${ws.rowCount}行)`);
  });
  
  // 「不足分」シートを取得
  const worksheet = workbook.getWorksheet('不足分');
  if (!worksheet) {
    console.error('\n⚠️  「不足分」シートが見つかりません');
    console.log('利用可能なシート名:');
    workbook.worksheets.forEach(ws => console.log(`   - ${ws.name}`));
    return;
  }
  
  console.log(`\n✅ 「不足分」シートを発見しました`);
  console.log(`   - 行数: ${worksheet.rowCount}`);
  console.log(`   - 列数: ${worksheet.columnCount}`);
  console.log('');
  
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
  
  // 最初の15行を表示して構造を確認
  console.log('📋 最初の15行の内容:');
  console.log('='.repeat(120));
  
  for (let rowNumber = 1; rowNumber <= Math.min(15, worksheet.rowCount); rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const values: string[] = [];
    
    // 最初の15列を取得
    for (let col = 1; col <= Math.min(15, worksheet.columnCount); col++) {
      const cellValue = getCellValue(row.getCell(col));
      values.push(cellValue || '(空)');
    }
    
    console.log(`行 ${String(rowNumber).padStart(3, ' ')}: ${values.join(' | ')}`);
  }
  
  console.log('='.repeat(120));
  console.log('');
  
  // 全データを抽出
  const serviceCodes: Array<{
    serviceCode: string;
    serviceName: string;
    points: number;
    rowNumber: number;
  }> = [];
  
  console.log('📊 データ抽出中...');
  
  // 行1から開始（ヘッダー行の可能性があるが、データ行の可能性もある）
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
        // デバッグ: 最初の10件で抽出できなかったものを表示
        if (rowNumber <= 10) {
          console.log(`   ⚠️  行 ${rowNumber}: サービスコードが見つかりません (A列="${colA}", B列="${colB}", 結合="${combined}")`);
        }
        continue;
      }
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
      serviceCodes.push({
        serviceCode,
        serviceName: serviceName || serviceCode,
        points: units,
        rowNumber,
      });
    }
  }
  
  console.log(`✅ ${serviceCodes.length}件のサービスコードを抽出しました。\n`);
  
  // 抽出結果を表示
  if (serviceCodes.length > 0) {
    console.log('📋 抽出されたサービスコード一覧:');
    console.log('='.repeat(120));
    serviceCodes.forEach((code, index) => {
      console.log(`${String(index + 1).padStart(4, ' ')}. ${code.serviceCode} - ${code.serviceName.substring(0, 60)}... (${code.points}単位) [行${code.rowNumber}]`);
    });
    console.log('='.repeat(120));
    console.log(`\n合計: ${serviceCodes.length}件`);
  } else {
    console.log('⚠️  サービスコードが抽出されませんでした。');
    console.log('Excelファイルの構造を確認してください。');
  }
}

checkMissingServiceCodes()
  .then(() => {
    console.log('\n処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

