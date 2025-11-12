/**
 * 介護保険サービスコードインポートスクリプト
 *
 * 介護給付費単位数等サービスコード表（PDF）からサービスコードを読み込んで
 * データベースに投入します。
 *
 * 実行方法:
 *   npx tsx scripts/import-care-service-codes.ts
 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { db } from '../server/db';
import { nursingServiceCodes } from '../shared/schema';
import { eq } from 'drizzle-orm';

const require = createRequire(import.meta.url);

/**
 * PDFからサービスコードを読み込む
 */
async function loadServiceCodesFromPdf() {
  // pdf-parseをCommonJS形式でrequire
  const pdfParseModule = require('pdf-parse');
  const PDFParse = pdfParseModule.PDFParse || pdfParseModule;
  
  const pdfPath = path.join(process.cwd(), 'docs/recept/介護給付費単位数等サービスコード表（令和７年４月施行版）.pdf');
  
  if (!fs.existsSync(pdfPath)) {
    console.error(`⚠️  PDFファイルが見つかりません: ${pdfPath}`);
    return [];
  }
  
  console.log('📄 PDFファイルを読み込み中...');
  const dataBuffer = fs.readFileSync(pdfPath);
  
  // PDFParseクラスを使用してパース
  const parser = new PDFParse({ data: dataBuffer });
  
  // テーブル抽出を試す
  console.log('📊 テーブル抽出を試行中...');
  let tables: any[] = [];
  try {
    const tableData = await parser.getTable();
    console.log(`   - テーブル数: ${tableData.pages.length}`);
    for (const page of tableData.pages) {
      console.log(`   - ページ ${page.num}: ${page.tables.length}個のテーブル`);
      tables.push(...page.tables);
    }
  } catch (error) {
    console.log(`   ⚠️ テーブル抽出に失敗: ${error}`);
  }
  
  // テキスト抽出も試す
  console.log('📊 テキスト抽出を試行中...');
  const textData = await parser.getText({ pageJoiner: '' });
  console.log(`   - ページ数: ${textData.total}`);
  console.log(`   - テキスト行数: ${textData.text.split('\n').length}`);
  console.log('');
  
  // テキストを行に分割
  let lines = textData.text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  // ページ区切りを除去
  lines = lines.filter(line => !line.match(/^--\s*\d+\s+of\s+\d+\s*--$/));
  
  // テーブルデータからも行を生成
  if (tables.length > 0) {
    console.log('📋 テーブルデータから行を生成中...');
    for (const table of tables) {
      for (const row of table) {
        const rowText = row.join(' ').trim();
        if (rowText.length > 0) {
          lines.push(rowText);
        }
      }
    }
  }
  
  // デバッグ: 最初の100行を表示して構造を確認
  console.log('📋 抽出されたテキストのサンプル（最初の100行）:');
  lines.slice(0, 100).forEach((line, index) => {
    if (line.length > 0) {
      console.log(`   ${index + 1}: ${line.substring(0, 150)}`);
    }
  });
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
  
  console.log('🔍 サービスコードを抽出中...');
  
  // PDFのテキストからサービスコードを抽出
  // 介護保険のサービスコードは通常、特定のパターンで記載されている
  // 例: "111111470" のような9桁の数字コード
  
  // サービスコードのパターン（9桁の数字）
  const serviceCodePattern = /\b(\d{9})\b/g;
  
  // 各行を処理
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // サービスコードを検索
    const codeMatches = line.match(serviceCodePattern);
    if (!codeMatches) continue;
    
    for (const serviceCode of codeMatches) {
      // 既に追加済みのコードはスキップ
      if (serviceCodes.find(sc => sc.serviceCode === serviceCode)) continue;
      
      // サービスコードの前後の行からサービス名を取得
      let serviceName = '';
      
      // 現在の行からサービス名を抽出を試みる
      // サービスコードの後ろのテキストを取得
      const codeIndex = line.indexOf(serviceCode);
      if (codeIndex !== -1) {
        const afterCode = line.substring(codeIndex + serviceCode.length).trim();
        // 数字や記号を除いたテキストをサービス名として使用
        const nameMatch = afterCode.match(/[^\d\s\-\(\)]+/);
        if (nameMatch) {
          serviceName = nameMatch[0].trim();
        }
      }
      
      // サービス名が見つからない場合、次の行を確認
      if (!serviceName && i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        // 数字で始まらない行をサービス名として使用
        if (!/^\d/.test(nextLine)) {
          serviceName = nextLine.substring(0, 100).trim(); // 最初の100文字
        }
      }
      
      // 単位を抽出（サービスコードの近くにある数値を探す）
      let units = 0;
      
      // 現在の行と前後の行から単位を探す
      const searchLines = [
        i > 0 ? lines[i - 1] : '',
        line,
        i + 1 < lines.length ? lines[i + 1] : ''
      ];
      
      for (const searchLine of searchLines) {
        // 単位のパターンを探す（例: "123.45単位" や "123単位"）
        const unitMatch = searchLine.match(/(\d+(?:\.\d+)?)\s*単位/);
        if (unitMatch) {
          units = Math.round(parseFloat(unitMatch[1]));
          break;
        }
        
        // 数値のみのパターンも試す（サービスコードの近くの数値）
        const numberMatch = searchLine.match(/\b(\d{3,6})\b/);
        if (numberMatch && numberMatch[1] !== serviceCode) {
          const num = parseInt(numberMatch[1]);
          // 妥当な範囲の単位値（10〜10000程度）を想定
          if (num >= 10 && num <= 10000) {
            units = num;
            break;
          }
        }
      }
      
      // サービス名が取得できた場合のみ追加
      if (serviceName && serviceName.length > 0) {
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
    }
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
    // PDFからサービスコードを読み込む
    const serviceCodesData = await loadServiceCodesFromPdf();
    
    if (serviceCodesData.length === 0) {
      console.log('⚠️  サービスコードが見つかりませんでした。');
      console.log('    PDFの構造が想定と異なる可能性があります。');
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

