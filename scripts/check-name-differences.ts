/**
 * CSVファイルの基本名称と省略名称の違いを確認するスクリプト
 */

import fs from 'fs';
import path from 'path';
import iconv from 'iconv-lite';
import { db } from '../server/db';
import { nursingServiceCodes } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function checkNameDifferences() {
  console.log('🔍 基本名称と省略名称の違いを確認中...\n');
  
  const masterDir = path.join(process.cwd(), 'docs/recept/visiting nursing_care_expenses_master');
  const filePath = path.join(masterDir, '訪問看護療養費マスター_基本テーブル.csv');
  
  const buffer = fs.readFileSync(filePath);
  const text = iconv.decode(buffer, 'shift_jis');
  const lines = text.split('\n').filter(l => l.trim());
  
  let sameCount = 0;
  let diffCount = 0;
  const differences: Array<{ code: string; basic: string; short: string }> = [];
  
  for (const line of lines) {
    const matches = line.match(/("(?:[^"\\]|\\.)*"|[^,]+)/g);
    if (!matches || matches.length < 72) continue;
    
    const values = matches.map(v => v.replace(/^"|"$/g, '').trim());
    
    const changeType = values[0];
    const serviceCode = values[2];
    
    if (!/^\d{9}$/.test(serviceCode)) continue;
    if (changeType === '9') continue;
    
    const basicName = values[6];
    const shortName = values[8];
    
    if (basicName === shortName) {
      sameCount++;
    } else {
      diffCount++;
      if (differences.length < 10) {
        differences.push({ code: serviceCode, basic: basicName, short: shortName });
      }
    }
  }
  
  console.log(`基本名称と省略名称が同じ: ${sameCount}件`);
  console.log(`基本名称と省略名称が異なる: ${diffCount}件\n`);
  
  if (differences.length > 0) {
    console.log('異なる例（最初の10件）:');
    differences.forEach((diff, i) => {
      console.log(`\n${i + 1}. ${diff.code}:`);
      console.log(`   基本: ${diff.basic.substring(0, 70)}...`);
      console.log(`   省略: ${diff.short.substring(0, 70)}...`);
    });
  }
  
  // データベースの現在の状態を確認
  console.log('\n\n📊 データベースの現在の状態:');
  const dbCodes = await db
    .select()
    .from(nursingServiceCodes)
    .where(eq(nursingServiceCodes.isActive, true));
  
  console.log(`有効なサービスコード数: ${dbCodes.length}件`);
  
  // CSVの省略名称とデータベースの名称を比較
  const csvMap = new Map<string, string>();
  for (const line of lines) {
    const matches = line.match(/("(?:[^"\\]|\\.)*"|[^,]+)/g);
    if (!matches || matches.length < 72) continue;
    const values = matches.map(v => v.replace(/^"|"$/g, '').trim());
    const serviceCode = values[2];
    if (!/^\d{9}$/.test(serviceCode)) continue;
    const changeType = values[0];
    if (changeType === '9') continue;
    const shortName = values[8];
    if (shortName && shortName.trim()) {
      csvMap.set(serviceCode, shortName);
    }
  }
  
  let dbMatchesCsv = 0;
  let dbDiffersFromCsv = 0;
  
  for (const dbCode of dbCodes) {
    const csvShortName = csvMap.get(dbCode.serviceCode);
    if (csvShortName) {
      if (dbCode.serviceName === csvShortName) {
        dbMatchesCsv++;
      } else {
        dbDiffersFromCsv++;
        if (dbDiffersFromCsv <= 5) {
          console.log(`\n異なる: ${dbCode.serviceCode}`);
          console.log(`  DB: ${dbCode.serviceName.substring(0, 60)}...`);
          console.log(`  CSV省略: ${csvShortName.substring(0, 60)}...`);
        }
      }
    }
  }
  
  console.log(`\nデータベースの名称がCSVの省略名称と一致: ${dbMatchesCsv}件`);
  console.log(`データベースの名称がCSVの省略名称と異なる: ${dbDiffersFromCsv}件`);
}

checkNameDifferences()
  .then(() => {
    console.log('\n処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

