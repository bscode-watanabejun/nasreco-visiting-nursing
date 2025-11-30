/**
 * 本番環境と開発環境のnursingServiceCodesの差異確認
 * 
 * seed-master-data.ts実行時の影響を確認するためのスクリプト
 * 
 * 実行方法:
 *   npx tsx scripts/check-service-codes-diff-for-seed.ts
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import fs from 'fs';
import path from 'path';
import iconv from 'iconv-lite';

neonConfig.webSocketConstructor = ws;

// データベース接続文字列
const PROD_DB_URL = 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';
const DEV_DB_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_beoRr4gaQ5Dl@ep-polished-scene-a5twqv82.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function checkServiceCodesDiff() {
  console.log('🔍 本番環境と開発環境のnursingServiceCodesの差異を確認します...\n');
  console.log('⚠️  本番データベースに接続します（読み取り専用）\n');
  console.log('═'.repeat(80));
  
  const prodPool = new Pool({ connectionString: PROD_DB_URL });
  const devPool = new Pool({ connectionString: DEV_DB_URL });

  try {
    // 1. サービスコードの取得
    console.log('\n📊 1. サービスコードの基本情報');
    console.log('─'.repeat(80));
    
    const prodServiceCodes = await prodPool.query(`
      SELECT service_code, service_name, insurance_type, points, is_active
      FROM nursing_service_codes
      ORDER BY service_code
    `);
    
    const devServiceCodes = await devPool.query(`
      SELECT service_code, service_name, insurance_type, points, is_active
      FROM nursing_service_codes
      ORDER BY service_code
    `);
    
    console.log(`   本番環境: 総数 ${prodServiceCodes.rows.length}件`);
    console.log(`   開発環境: 総数 ${devServiceCodes.rows.length}件`);
    console.log(`   差異: ${prodServiceCodes.rows.length - devServiceCodes.rows.length}件\n`);

    // 2. 本番環境にのみ存在するサービスコード
    console.log('📊 2. 本番環境にのみ存在するサービスコード');
    console.log('─'.repeat(80));
    
    const prodServiceCodeSet = new Set(prodServiceCodes.rows.map((r: any) => r.service_code));
    const devServiceCodeSet = new Set(devServiceCodes.rows.map((r: any) => r.service_code));
    
    const onlyInProd = prodServiceCodes.rows.filter((r: any) => !devServiceCodeSet.has(r.service_code));
    
    console.log(`   本番環境にのみ存在: ${onlyInProd.length}件\n`);
    
    if (onlyInProd.length > 0) {
      console.log('   詳細:');
      onlyInProd.forEach((code: any, index: number) => {
        const status = code.is_active ? '✅有効' : '❌無効';
        console.log(`   ${index + 1}. ${code.service_code} - ${code.service_name.substring(0, 50)}... (${code.insurance_type}, ${code.points}点, ${status})`);
      });
    }

    // 3. 開発環境にのみ存在するサービスコード
    console.log('\n📊 3. 開発環境にのみ存在するサービスコード');
    console.log('─'.repeat(80));
    
    const onlyInDev = devServiceCodes.rows.filter((r: any) => !prodServiceCodeSet.has(r.service_code));
    
    console.log(`   開発環境にのみ存在: ${onlyInDev.length}件\n`);
    
    if (onlyInDev.length > 0) {
      console.log('   詳細:');
      onlyInDev.slice(0, 20).forEach((code: any, index: number) => {
        const status = code.is_active ? '✅有効' : '❌無効';
        console.log(`   ${index + 1}. ${code.service_code} - ${code.service_name.substring(0, 50)}... (${code.insurance_type}, ${code.points}点, ${status})`);
      });
      if (onlyInDev.length > 20) {
        console.log(`   ... 他 ${onlyInDev.length - 20}件`);
      }
    }

    // 4. CSVファイルに含まれるサービスコードが本番環境に存在するか確認
    console.log('\n📊 4. CSVファイルのサービスコードが本番環境に存在するか確認');
    console.log('─'.repeat(80));
    
    // CSVファイルからサービスコードを読み込む（簡易版）
    const masterDir = path.join(process.cwd(), 'docs/recept/medical-insurance/visiting nursing_care_expenses_master');
    const csvFilePath = path.join(masterDir, '訪問看護療養費マスター_基本テーブル.csv');
    
    let csvServiceCodes: string[] = [];
    
    if (fs.existsSync(csvFilePath)) {
      const buffer = fs.readFileSync(csvFilePath);
      const text = iconv.decode(buffer, 'shift_jis');
      const lines = text.split('\n').filter((l: string) => l.trim());
      
      for (const line of lines) {
        const matches = line.match(/("(?:[^"\\]|\\.)*"|[^,]+)/g);
        if (!matches || matches.length < 3) continue;
        
        const values = matches.map((v: string) => v.replace(/^"|"$/g, '').trim());
        const changeType = values[0];
        const serviceCode = values[2];
        
        if (/^\d{9}$/.test(serviceCode) && changeType !== '9') {
          csvServiceCodes.push(serviceCode);
        }
      }
      
      csvServiceCodes = [...new Set(csvServiceCodes)]; // 重複除去
      
      console.log(`   CSVファイルから読み込んだサービスコード数: ${csvServiceCodes.length}件\n`);
      
      // 本番環境に存在しないサービスコードを確認
      const missingInProd = csvServiceCodes.filter(code => !prodServiceCodeSet.has(code));
      
      if (missingInProd.length > 0) {
        console.log(`   ⚠️  本番環境に存在しないサービスコード: ${missingInProd.length}件`);
        console.log('   詳細:');
        missingInProd.slice(0, 20).forEach((code: string, index: number) => {
          console.log(`   ${index + 1}. ${code}`);
        });
        if (missingInProd.length > 20) {
          console.log(`   ... 他 ${missingInProd.length - 20}件`);
        }
        console.log('\n   ⚠️  これらのサービスコードはvisiting_nursing_master_basicに投入されません');
      } else {
        console.log('   ✅ CSVファイルのすべてのサービスコードが本番環境に存在します');
      }
      
      // 本番環境に存在するサービスコード数を確認
      const existsInProd = csvServiceCodes.filter(code => prodServiceCodeSet.has(code));
      console.log(`\n   本番環境に存在するサービスコード: ${existsInProd.length}件`);
      console.log(`   本番環境に存在しないサービスコード: ${missingInProd.length}件`);
    } else {
      console.log(`   ⚠️  CSVファイルが見つかりません: ${csvFilePath}`);
    }

    // 5. 本番環境で使用されているサービスコードの確認
    console.log('\n📊 5. 本番環境で使用されているサービスコード');
    console.log('─'.repeat(80));
    
    const prodUsedServiceCodes = await prodPool.query(`
      SELECT DISTINCT nsc.service_code, nsc.service_name, nsc.is_active
      FROM nursing_records nr
      LEFT JOIN nursing_service_codes nsc ON nr.service_code_id = nsc.id
      WHERE nr.service_code_id IS NOT NULL
      ORDER BY nsc.service_code
    `);
    
    console.log(`   使用されているサービスコード数: ${prodUsedServiceCodes.rows.length}種類\n`);
    
    // 使用されているが開発環境に存在しないサービスコード
    const usedButNotInDev = prodUsedServiceCodes.rows.filter((r: any) => 
      r.service_code && !devServiceCodeSet.has(r.service_code)
    );
    
    if (usedButNotInDev.length > 0) {
      console.log(`   ⚠️  使用されているが開発環境に存在しないサービスコード: ${usedButNotInDev.length}種類`);
      usedButNotInDev.forEach((code: any) => {
        const status = code.is_active ? '✅有効' : '❌無効';
        console.log(`     - ${code.service_code} - ${code.service_name?.substring(0, 50) || '(名称不明)'}... (${status})`);
      });
    } else {
      console.log('   ✅ 使用されているすべてのサービスコードが開発環境に存在します');
    }

    // 6. まとめと推奨事項
    console.log('\n📊 6. まとめと推奨事項');
    console.log('─'.repeat(80));
    
    console.log('\n   【seed-master-data.ts実行時の影響】');
    console.log(`   - 本番環境のnursingServiceCodesを参照: ✅ 正しい`);
    console.log(`   - CSVファイルのサービスコード数: ${csvServiceCodes.length}件`);
    console.log(`   - 本番環境に存在するサービスコード: ${csvServiceCodes.filter(code => prodServiceCodeSet.has(code)).length}件`);
    console.log(`   - 本番環境に存在しないサービスコード: ${csvServiceCodes.filter(code => !prodServiceCodeSet.has(code)).length}件`);
    
    if (csvServiceCodes.filter(code => !prodServiceCodeSet.has(code)).length > 0) {
      console.log('\n   ⚠️  注意: 本番環境に存在しないサービスコードはvisiting_nursing_master_basicに投入されません');
      console.log('      これらのサービスコードはスキップされます');
    } else {
      console.log('\n   ✅ CSVファイルのすべてのサービスコードが本番環境に存在するため、問題ありません');
    }

    console.log('\n' + '═'.repeat(80));
    console.log('✅ 確認が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prodPool.end();
    await devPool.end();
  }
}

checkServiceCodesDiff()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('処理中にエラーが発生しました:', error);
    process.exit(1);
  });

