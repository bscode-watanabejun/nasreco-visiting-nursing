/**
 * 既存のサービスコードの名称を省略名称に更新するスクリプト
 * 
 * CSVファイルから省略名称を読み込んで、既存のデータベースのサービス名称を更新します。
 * 
 * 実行方法:
 *   npx tsx scripts/update-service-names.ts
 */

import fs from 'fs';
import path from 'path';
import iconv from 'iconv-lite';
import { db } from '../server/db';
import { nursingServiceCodes } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function updateServiceNames() {
  console.log('📝 サービス名称を省略名称に更新中...\n');
  
  const masterDir = path.join(process.cwd(), 'docs/recept/visiting nursing_care_expenses_master');
  const filePath = path.join(masterDir, '訪問看護療養費マスター_基本テーブル.csv');
  
  if (!fs.existsSync(filePath)) {
    console.error(`⚠️  CSVファイルが見つかりません: ${filePath}`);
    return;
  }
  
  const buffer = fs.readFileSync(filePath);
  const text = iconv.decode(buffer, 'shift_jis');
  const lines = text.split('\n').filter(l => l.trim());
  
  // CSVからサービスコードと省略名称のマッピングを作成
  const codeToShortName = new Map<string, string>();
  
  for (const line of lines) {
    const matches = line.match(/("(?:[^"\\]|\\.)*"|[^,]+)/g);
    if (!matches || matches.length < 72) continue;
    
    const values = matches.map(v => v.replace(/^"|"$/g, '').trim());
    
    const changeType = values[0];
    const serviceCode = values[2];
    
    if (!/^\d{9}$/.test(serviceCode)) continue;
    if (changeType === '9') continue; // 廃止されたコードは除外
    
    const shortName = values[8]; // 省略名称
    if (shortName && shortName.trim()) {
      codeToShortName.set(serviceCode, shortName);
    }
  }
  
  console.log(`CSVから読み込んだサービスコード数: ${codeToShortName.size}件\n`);
  
  // データベースのサービスコードを更新
  let updatedCount = 0;
  let notFoundCount = 0;
  
  for (const [serviceCode, shortName] of codeToShortName.entries()) {
    const existing = await db
      .select()
      .from(nursingServiceCodes)
      .where(eq(nursingServiceCodes.serviceCode, serviceCode))
      .limit(1);
    
    if (existing.length === 0) {
      notFoundCount++;
      continue;
    }
    
    const current = existing[0];
    
    // 既に省略名称と同じ場合はスキップ
    if (current.serviceName === shortName) {
      continue;
    }
    
    // 更新
    await db
      .update(nursingServiceCodes)
      .set({ serviceName: shortName })
      .where(eq(nursingServiceCodes.serviceCode, serviceCode));
    
    updatedCount++;
    
    if (updatedCount <= 10) {
      console.log(`  ✓ ${serviceCode}: "${current.serviceName.substring(0, 40)}..." → "${shortName.substring(0, 40)}..."`);
    }
  }
  
  if (updatedCount > 10) {
    console.log(`  ... 他 ${updatedCount - 10}件を更新`);
  }
  
  console.log(`\n✅ ${updatedCount}件のサービス名称を更新しました`);
  if (notFoundCount > 0) {
    console.log(`⚠️  ${notFoundCount}件のコードがデータベースに見つかりませんでした`);
  }
}

updateServiceNames()
  .then(() => {
    console.log('\n処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

