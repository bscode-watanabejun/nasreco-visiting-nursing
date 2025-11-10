/**
 * CSVファイルから正しいサービスコードを抽出するスクリプト
 * 
 * 基本テーブルCSVからサービスコード、名称、点数、有効期間を抽出し、
 * 現在のシードデータと比較します。
 */

import fs from 'fs';
import path from 'path';
import iconv from 'iconv-lite';

const masterDir = path.join(process.cwd(), 'docs/recept/visiting nursing_care_expenses_master');

interface ServiceCodeData {
  serviceCode: string;
  serviceName: string;
  points: number;
  insuranceType: 'medical' | 'care';
  validFrom: string;
  validTo: string | null;
  changeType: string; // 変更区分
  masterType: string; // マスター種別
}

function parseCsvLine(line: string): string[] {
  const matches = line.match(/("(?:[^"\\]|\\.)*"|[^,]+)/g);
  if (!matches) return [];
  return matches.map(v => v.replace(/^"|"$/g, '').trim());
}

function formatDate(dateStr: string): string {
  // YYYYMMDD形式をYYYY-MM-DD形式に変換
  if (dateStr.length === 8 && /^\d{8}$/.test(dateStr)) {
    return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
  }
  return dateStr;
}

function determineInsuranceType(serviceCode: string): 'medical' | 'care' {
  // サービスコードの先頭2桁で判定
  // 51, 53 = 医療保険、52 = 介護保険（推測）
  if (serviceCode.startsWith('51') || serviceCode.startsWith('53')) {
    return 'medical';
  }
  // その他は医療保険として扱う（要確認）
  return 'medical';
}

async function extractServiceCodesFromBasicTable(): Promise<ServiceCodeData[]> {
  const filePath = path.join(masterDir, '訪問看護療養費マスター_基本テーブル.csv');
  const buffer = fs.readFileSync(filePath);
  const text = iconv.decode(buffer, 'shift_jis');
  const lines = text.split('\n').filter(l => l.trim());
  
  const serviceCodes: ServiceCodeData[] = [];
  
  for (const line of lines) {
    const values = parseCsvLine(line);
    if (values.length < 72) continue;
    
    const serviceCode = values[2];
    // サービスコードが9桁の数字であることを確認
    if (!/^\d{9}$/.test(serviceCode)) continue;
    
    const changeType = values[0]; // 変更区分
    const masterType = values[1]; // マスター種別
    
    // 廃止されたコードは除外（変更区分が9）
    if (changeType === '9') continue;
    
    const serviceName = values[6]; // 基本名称
    const pointsStr = values[15]; // 新又は現金額
    const validFrom = values[70]; // 変更年月日
    const validTo = values[71]; // 廃止年月日
    
    const points = parseFloat(pointsStr) || 0;
    const insuranceType = determineInsuranceType(serviceCode);
    
    serviceCodes.push({
      serviceCode,
      serviceName,
      points,
      insuranceType,
      validFrom: formatDate(validFrom),
      validTo: validTo === '99999999' ? null : formatDate(validTo),
      changeType,
      masterType,
    });
  }
  
  return serviceCodes;
}

async function main() {
  console.log('📊 CSVファイルからサービスコードを抽出中...\n');
  
  const serviceCodes = await extractServiceCodesFromBasicTable();
  
  console.log(`✅ ${serviceCodes.length}件のサービスコードを抽出しました\n`);
  
  // 医療保険と介護保険に分類
  const medicalCodes = serviceCodes.filter(c => c.insuranceType === 'medical');
  const careCodes = serviceCodes.filter(c => c.insuranceType === 'care');
  
  console.log(`医療保険: ${medicalCodes.length}件`);
  console.log(`介護保険: ${careCodes.length}件\n`);
  
  // 最初の10件を表示
  console.log('最初の10件:');
  serviceCodes.slice(0, 10).forEach((code, i) => {
    console.log(`  ${i + 1}. ${code.serviceCode} - ${code.serviceName.substring(0, 60)}... (${code.points}点, ${code.insuranceType})`);
  });
  
  // サービスコードの先頭2桁別集計
  console.log('\nサービスコードの先頭2桁別集計:');
  const prefixCounts: Record<string, number> = {};
  serviceCodes.forEach(code => {
    const prefix = code.serviceCode.substring(0, 2);
    prefixCounts[prefix] = (prefixCounts[prefix] || 0) + 1;
  });
  Object.entries(prefixCounts).sort().forEach(([prefix, count]) => {
    console.log(`  ${prefix}xxxxxxx: ${count}件`);
  });
  
  // JSONファイルに出力（次のステップで使用）
  const outputPath = path.join(process.cwd(), 'docs/recept/visiting nursing_care_expenses_master', 'extracted-service-codes.json');
  fs.writeFileSync(outputPath, JSON.stringify(serviceCodes, null, 2), 'utf8');
  console.log(`\n✅ 抽出データを保存しました: ${outputPath}`);
  
  // 現在のシードデータと比較
  console.log('\n🔍 現在のシードデータとの比較:');
  const currentSeedCodes = [
    '311000110', '311000210', '311000310', '311000410', '311000510', '311000610',
    '311001110', '311001210', '311001310',
    '312000110', '312000210', '312000310', '312000410', '312000510', '312000610',
    '312000710', '312000810', '312000910', '312001010',
    '313000110',
    '314000110',
  ];
  
  console.log('\n現在のシードデータのコード（誤り）:');
  currentSeedCodes.forEach(code => {
    const found = serviceCodes.find(c => c.serviceCode === code);
    if (!found) {
      console.log(`  ❌ ${code} - 見つかりません`);
    } else {
      console.log(`  ✓ ${code} - ${found.serviceName.substring(0, 50)}...`);
    }
  });
  
  console.log('\n正しいコードの例:');
  const correctExamples = serviceCodes.filter(c => 
    c.serviceCode.startsWith('51000') || c.serviceCode.startsWith('53000')
  ).slice(0, 10);
  correctExamples.forEach(code => {
    console.log(`  ${code.serviceCode} - ${code.serviceName.substring(0, 50)}... (${code.points}点)`);
  });
  
  return serviceCodes;
}

main().catch(console.error);

