/**
 * マスターファイル構造分析スクリプト
 * 
 * CSVファイルとPDFファイルの構造を詳しく分析します。
 */

import fs from 'fs';
import path from 'path';
import iconv from 'iconv-lite';

const masterDir = path.join(process.cwd(), 'docs/recept/visiting nursing_care_expenses_master');

interface ColumnInfo {
  index: number;
  sampleValues: string[];
  description?: string;
}

async function analyzeCsvStructure(filename: string): Promise<void> {
  console.log(`\n📄 ${filename} の構造分析`);
  console.log('=' .repeat(80));
  
  const filePath = path.join(masterDir, filename);
  const buffer = fs.readFileSync(filePath);
  const text = iconv.decode(buffer, 'shift_jis');
  const lines = text.split('\n').filter(l => l.trim());
  
  console.log(`総行数: ${lines.length}`);
  
  if (lines.length === 0) {
    console.log('ファイルが空です。');
    return;
  }
  
  // 最初の5行を解析
  const sampleRows: string[][] = [];
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const matches = lines[i].match(/("(?:[^"\\]|\\.)*"|[^,]+)/g);
    if (matches) {
      sampleRows.push(matches.map(v => v.replace(/^"|"$/g, '').trim()));
    }
  }
  
  if (sampleRows.length === 0) {
    console.log('データ行が見つかりません。');
    return;
  }
  
  const columnCount = sampleRows[0].length;
  console.log(`列数: ${columnCount}`);
  
  // 各列の情報を収集
  const columns: ColumnInfo[] = [];
  for (let col = 0; col < columnCount; col++) {
    const sampleValues: string[] = [];
    for (let row = 0; row < sampleRows.length; row++) {
      if (sampleRows[row][col]) {
        const val = sampleRows[row][col];
        // 長すぎる場合は切り詰め
        const displayVal = val.length > 60 ? val.substring(0, 60) + '...' : val;
        if (!sampleValues.includes(displayVal)) {
          sampleValues.push(displayVal);
        }
      }
    }
    columns.push({
      index: col,
      sampleValues,
    });
  }
  
  // 列の情報を表示
  console.log('\n各列のサンプル値:');
  columns.forEach((col, idx) => {
    console.log(`\n[${String(idx).padStart(2, '0')}] (${col.sampleValues.length}種類の値)`);
    col.sampleValues.slice(0, 3).forEach((val, i) => {
      console.log(`    例${i + 1}: ${val}`);
    });
    if (col.sampleValues.length > 3) {
      console.log(`    ... 他 ${col.sampleValues.length - 3}種類`);
    }
  });
  
  // 数値のサービスコードを抽出（列[2]がサービスコードの可能性）
  if (columns[2]) {
    const serviceCodes = new Set<string>();
    sampleRows.forEach(row => {
      if (row[2] && /^\d{9}$/.test(row[2])) {
        serviceCodes.add(row[2]);
      }
    });
    console.log(`\n数値のサービスコード（列[2]）: ${serviceCodes.size}種類`);
    if (serviceCodes.size > 0) {
      console.log('  例:', Array.from(serviceCodes).slice(0, 5).join(', '));
    }
  }
}

async function readPdfFile(filename: string): Promise<string> {
  const filePath = path.join(masterDir, filename);
  const buffer = fs.readFileSync(filePath);
  
  try {
    // pdf-parse v2の使用方法
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return result.text;
  } catch (error) {
    console.error('PDF読み取りエラー:', error);
    throw error;
  }
}

async function analyzePdfStructure(): Promise<void> {
  console.log(`\n📑 PDF仕様説明書の読み取り`);
  console.log('='.repeat(80));
  
  try {
    const pdfText = await readPdfFile('マスターファイル仕様説明書_訪看のみ.pdf');
    console.log(`総文字数: ${pdfText.length}`);
    
    // PDFの内容をファイルに保存して確認しやすくする
    const outputPath = path.join(process.cwd(), 'docs/recept/visiting nursing_care_expenses_master', 'pdf-extracted-text.txt');
    fs.writeFileSync(outputPath, pdfText, 'utf8');
    console.log(`\nPDFテキストを保存しました: ${outputPath}`);
    
    // 重要な部分を抽出
    console.log('\nPDFの最初の2000文字:');
    console.log('-'.repeat(80));
    console.log(pdfText.substring(0, 2000));
    console.log('-'.repeat(80));
    
    // 列の説明が含まれている可能性のある部分を検索
    const columnKeywords = ['列', '項目', 'フィールド', 'カラム', '項目名', 'データ項目'];
    console.log('\n列に関する記述を検索:');
    const lines = pdfText.split('\n');
    let foundLines: string[] = [];
    lines.forEach((line, idx) => {
      if (columnKeywords.some(keyword => line.includes(keyword))) {
        foundLines.push(`行${idx + 1}: ${line.trim()}`);
        if (foundLines.length >= 20) return; // 最初の20件のみ
      }
    });
    
    if (foundLines.length > 0) {
      console.log('見つかった関連行:');
      foundLines.forEach(line => console.log(`  ${line}`));
    } else {
      console.log('列に関する記述が見つかりませんでした。');
    }
    
  } catch (error) {
    console.error('PDF分析エラー:', error);
  }
}

async function main() {
  console.log('🔍 マスターファイル構造分析を開始します...');
  
  // 1. 各CSVファイルの構造を分析
  const csvFiles = [
    '訪問看護療養費マスター_基本テーブル.csv',
    '訪問看護療養費マスター_基本・基本加算対応テーブル.csv',
    '訪問看護療養費マスター_併算定背反テーブルcsv.csv',
    '訪問看護療養費マスター_施設基準テーブル.csv',
    '訪問看護療養費マスター_算定回数限度テーブル.csv',
  ];
  
  for (const csvFile of csvFiles) {
    try {
      await analyzeCsvStructure(csvFile);
    } catch (error) {
      console.error(`  ✗ ${csvFile}: エラー`, error);
    }
  }
  
  // 2. PDF仕様説明書を読み取り
  await analyzePdfStructure();
  
  console.log('\n✅ 分析完了');
}

main().catch(console.error);

