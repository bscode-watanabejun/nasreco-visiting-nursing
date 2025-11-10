/**
 * CSVファイルの点数値を確認するスクリプト
 * 
 * CSVファイルの「新又は現金額」と「金額識別」を確認します。
 * 
 * 使用方法:
 *   npx tsx scripts/check-csv-points.ts
 */

import fs from 'fs';
import path from 'path';
import iconv from 'iconv-lite';

async function checkCsvPoints() {
  console.log("🔍 CSVファイルの点数値を確認します...\n");

  const masterDir = path.join(process.cwd(), 'docs/recept/visiting nursing_care_expenses_master');
  // CSVファイル名を動的に検索
  const files = fs.readdirSync(masterDir);
  const csvFile = files.find(f => f.includes('基本') && !f.includes('加算対応') && f.endsWith('.csv'));
  
  if (!csvFile) {
    console.error(`❌ CSVファイルが見つかりません。利用可能なファイル:`);
    files.forEach(f => console.log(`   - ${f}`));
    process.exit(1);
  }
  
  const filePath = path.join(masterDir, csvFile);
  console.log(`📄 CSVファイル: ${csvFile}\n`);
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ CSVファイルが見つかりません: ${filePath}`);
    process.exit(1);
  }
  
  const buffer = fs.readFileSync(filePath);
  const text = iconv.decode(buffer, 'shift_jis');
  const lines = text.split('\n').filter(l => l.trim());
  
  console.log(`📄 CSVファイルを読み込みました: ${lines.length}行\n`);

  // 510002570（長時間訪問看護加算）を検索
  for (const line of lines) {
    const matches = line.match(/("(?:[^"\\]|\\.)*"|[^,]+)/g);
    if (!matches || matches.length < 16) continue;
    
    const values = matches.map(v => v.replace(/^"|"$/g, '').trim());
    const serviceCode = values[2];
    
    if (serviceCode === '510002570') {
      console.log("✅ 510002570（長時間訪問看護加算）が見つかりました:\n");
      console.log(`   列[0] 変更区分: ${values[0]}`);
      console.log(`   列[2] サービスコード: ${values[2]}`);
      console.log(`   列[6] 基本名称: ${values[6]?.substring(0, 50)}...`);
      console.log(`   列[8] 省略名称: ${values[8]?.substring(0, 50)}...`);
      console.log(`   列[14] 金額識別: ${values[14]}`);
      console.log(`   列[15] 新又は現金額: ${values[15]}`);
      console.log();
      
      const amountType = values[14]; // 金額識別
      const amountStr = values[15]; // 新又は現金額
      const amount = parseFloat(amountStr) || 0;
      
      console.log("📊 解析結果:");
      console.log(`   金額識別: ${amountType}`);
      console.log(`     1 = 金額`);
      console.log(`     3 = 点数（プラス）`);
      console.log(`     5 = ％加算`);
      console.log();
      console.log(`   新又は現金額: ${amountStr} → ${amount}`);
      console.log();
      
      if (amountType === '1') {
        console.log("💡 金額識別が「1：金額」の場合:");
        console.log(`   CSVの値: ${amount}円`);
        console.log(`   点数に変換: ${amount / 10}点`);
        console.log(`   → データベースには ${amount / 10}点 として保存すべき`);
      } else if (amountType === '3') {
        console.log("💡 金額識別が「3：点数（プラス）」の場合:");
        console.log(`   CSVの値: ${amount}点`);
        console.log(`   → データベースには ${amount}点 として保存すべき`);
      } else {
        console.log(`⚠️  金額識別が「${amountType}」の場合の処理は未定義です`);
      }
      
      console.log();
      console.log("📋 期待値との比較:");
      console.log(`   期待される金額: 5,200円`);
      console.log(`   期待される点数: 520点`);
      console.log();
      
      if (amountType === '1' && amount === 5200) {
        console.log("✅ CSVファイルの値は「5,200円」として保存されています");
        console.log("   → 10で割って「520点」として保存する必要があります");
      } else if (amountType === '3' && amount === 520) {
        console.log("✅ CSVファイルの値は「520点」として保存されています");
        console.log("   → そのまま保存すればOKです");
      } else {
        console.log("❓ CSVファイルの値と期待値が一致しません");
        console.log(`   金額識別: ${amountType}, 値: ${amount}`);
      }
      
      break;
    }
  }
  
  // 他のサービスコードも確認（基本療養費など）
  console.log("\n📋 他のサービスコードの確認（参考）:");
  const sampleCodes = ['510000110', '510002470', '510004570'];
  
  for (const targetCode of sampleCodes) {
    for (const line of lines) {
      const matches = line.match(/("(?:[^"\\]|\\.)*"|[^,]+)/g);
      if (!matches || matches.length < 16) continue;
      
      const values = matches.map(v => v.replace(/^"|"$/g, '').trim());
      const serviceCode = values[2];
      
      if (serviceCode === targetCode) {
        const amountType = values[14];
        const amount = parseFloat(values[15]) || 0;
        const name = values[8] || values[6] || '';
        console.log(`   ${targetCode}: 金額識別=${amountType}, 値=${amount}, 名称=${name.substring(0, 30)}...`);
        break;
      }
    }
  }
}

checkCsvPoints()
  .then(() => {
    console.log("\nスクリプトが正常に完了しました。");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nスクリプトの実行中にエラーが発生しました:", error);
    process.exit(1);
  });

