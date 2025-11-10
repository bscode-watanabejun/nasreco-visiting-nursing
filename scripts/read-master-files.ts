/**
 * マスターファイル読み取りスクリプト
 * 
 * CSVファイルとPDFファイルを読み取り、現在のシードデータと比較します。
 */

import fs from 'fs';
import path from 'path';
import iconv from 'iconv-lite';

const masterDir = path.join(process.cwd(), 'docs/recept/visiting nursing_care_expenses_master');

interface CsvRow {
  serviceCode: string;
  serviceName: string;
  points: number;
  insuranceType: 'medical' | 'care';
  validFrom: string;
  validTo: string | null;
  [key: string]: any;
}

async function readCsvFile(filename: string): Promise<CsvRow[]> {
  const filePath = path.join(masterDir, filename);
  const buffer = fs.readFileSync(filePath);
  const text = iconv.decode(buffer, 'shift_jis');
  const lines = text.split('\n').filter(l => l.trim());
  
  const rows: CsvRow[] = [];
  
  for (const line of lines) {
    // CSVパース（簡易版、ダブルクォートで囲まれた値を抽出）
    const matches = line.match(/("(?:[^"\\]|\\.)*"|[^,]+)/g);
    if (!matches || matches.length < 12) continue;
    
    const values = matches.map(v => v.replace(/^"|"$/g, '').trim());
    
    // 列[2]: サービスコード（例: "510000110"）
    // 列[6]: サービス名称
    // 列[15]: 点数（例: "5550.00"）
    // 列[70]: 有効期間開始日（例: "20240601"）
    // 列[71]: 有効期間終了日（例: "99999999"）
    const serviceCode = values[2];
    const serviceName = values[6];
    const pointsStr = values[15];
    
    // 保険種別の判定（サービスコードの先頭で判定）
    // 51xxxxxxx, 53xxxxxxx = 医療保険、52xxxxxxx = 介護保険（推測）
    const insuranceType = serviceCode.startsWith('51') || serviceCode.startsWith('53') ? 'medical' : 'care';
    
    // 有効期間（最後の2列から取得）
    const validFrom = values[70] || '20240601';
    const validTo = values[71] === '99999999' ? null : values[71];
    
    const points = parseFloat(pointsStr) || 0;
    
    rows.push({
      serviceCode,
      serviceName,
      points,
      insuranceType,
      validFrom: formatDate(validFrom),
      validTo: validTo ? formatDate(validTo) : null,
      raw: values,
    });
  }
  
  return rows;
}

function formatDate(dateStr: string): string {
  // YYYYMMDD形式をYYYY-MM-DD形式に変換
  if (dateStr.length === 8) {
    return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
  }
  return dateStr;
}

async function readPdfFile(filename: string): Promise<string> {
  const filePath = path.join(masterDir, filename);
  const buffer = fs.readFileSync(filePath);
  
  // CommonJS形式でpdf-parseを使用
  try {
    // @ts-ignore
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buffer);
    return data.text;
  } catch (error) {
    console.error('PDF読み取りエラー:', error);
    return 'PDF読み取りに失敗しました';
  }
}

async function main() {
  console.log('📖 マスターファイルの読み取りを開始します...\n');
  
  // 1. CSVファイルを読み取り
  console.log('📄 CSVファイルを読み取り中...');
  const csvFiles = [
    '訪問看護療養費マスター_基本テーブル.csv',
    '訪問看護療養費マスター_基本・基本加算対応テーブル.csv',
    '訪問看護療養費マスター_併算定背反テーブルcsv.csv',
    '訪問看護療養費マスター_施設基準テーブル.csv',
    '訪問看護療養費マスター_算定回数限度テーブル.csv',
  ];
  
  const allCsvData: CsvRow[] = [];
  
  for (const csvFile of csvFiles) {
    try {
      const rows = await readCsvFile(csvFile);
      console.log(`  ✓ ${csvFile}: ${rows.length}件`);
      allCsvData.push(...rows);
    } catch (error) {
      console.error(`  ✗ ${csvFile}: エラー`, error);
    }
  }
  
  console.log(`\n合計: ${allCsvData.length}件のレコードを読み取りました\n`);
  
  // 2. 基本テーブルの最初の10件を表示
  const basicRows = allCsvData.filter(r => r.serviceCode.startsWith('51000'));
  console.log('基本テーブルの最初の10件:');
  basicRows.slice(0, 10).forEach((row, i) => {
    console.log(`  ${i + 1}. ${row.serviceCode} - ${row.serviceName.substring(0, 50)}... (${row.points}点)`);
  });
  
  // 3. PDFファイルを読み取り
  console.log('\n📑 PDFファイルを読み取り中...');
  try {
    const pdfText = await readPdfFile('マスターファイル仕様説明書_訪看のみ.pdf');
    console.log(`  ✓ PDF読み取り完了 (${pdfText.length}文字)`);
    console.log('\nPDFの最初の1000文字:');
    console.log(pdfText.substring(0, 1000));
  } catch (error) {
    console.error('  ✗ PDF読み取りエラー:', error);
  }
  
  // 4. 現在のシードデータと比較
  console.log('\n\n🔍 現在のシードデータとの比較:');
  console.log('現在のシードデータのサービスコード例:');
  console.log('  - 311000110 (訪問看護基本療養費（Ⅰ）週3日まで)');
  console.log('  - 311000210 (訪問看護基本療養費（Ⅰ）週4日以降)');
  console.log('\nCSVファイルのサービスコード例:');
  console.log('  - 510000110 (訪問看護基本療養費１（保健師、助産師又は看護師による場合（ハを除く。））（週３日目まで）)');
  console.log('  - 510000210 (訪問看護基本療養費１（保健師、助産師又は看護師による場合（ハを除く。））（週４日目以降）)');
  
  // 5. ユニークなサービスコードのリスト
  const uniqueCodes = [...new Set(allCsvData.map(r => r.serviceCode))];
  console.log(`\nユニークなサービスコード数: ${uniqueCodes.length}`);
  console.log('\nサービスコードの先頭文字別集計:');
  const codePrefixes: Record<string, number> = {};
  uniqueCodes.forEach(code => {
    const prefix = code.substring(0, 2);
    codePrefixes[prefix] = (codePrefixes[prefix] || 0) + 1;
  });
  Object.entries(codePrefixes).sort().forEach(([prefix, count]) => {
    console.log(`  ${prefix}xxxxxxx: ${count}件`);
  });
}

main().catch(console.error);

