/**
 * 加算マスタの実装状況確認スクリプト
 * 
 * 有効な加算マスタのbonus_codeが実装されているか確認します。
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import { bonusMaster } from '../shared/schema';
import * as fs from 'fs';
import * as path from 'path';

const PROD_DB_URL = process.env.PRODUCTION_DB_URL || 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';
const DEV_DB_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_beoRr4gaQ5Dl@ep-polished-scene-a5twqv82.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function checkBonusImplementationStatus() {
  console.log('🔍 加算マスタの実装状況を確認します...\n');
  
  const prodPool = new Pool({ connectionString: PROD_DB_URL });
  const devPool = new Pool({ connectionString: DEV_DB_URL });
  const prodDb = drizzle(prodPool);
  const devDb = drizzle(devPool);

  try {
    // 1. 開発環境の有効な加算マスタを取得
    console.log('📊 1. 開発環境の有効な加算マスタを取得中...');
    const devActiveMasters = await devDb.select().from(bonusMaster)
      .where(sql`is_active = true`)
      .orderBy(bonusMaster.bonusCode);
    
    console.log(`   有効な加算マスタ数: ${devActiveMasters.length}件\n`);

    // 2. 実装コードを検索
    console.log('📊 2. 実装コードを検索中...');
    
    const serverDir = path.join(process.cwd(), 'server');
    const routesFile = path.join(serverDir, 'routes.ts');
    
    let routesContent = '';
    if (fs.existsSync(routesFile)) {
      routesContent = fs.readFileSync(routesFile, 'utf-8');
    }
    
    // serverディレクトリ内のすべての.tsファイルを検索
    const serverFiles: string[] = [];
    function findTsFiles(dir: string) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory() && !filePath.includes('node_modules')) {
          findTsFiles(filePath);
        } else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
          serverFiles.push(filePath);
        }
      }
    }
    findTsFiles(serverDir);
    
    // すべてのファイルの内容を読み込む
    const allCodeContent: Array<{ file: string; content: string }> = [];
    for (const file of serverFiles) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        allCodeContent.push({ file, content });
      } catch (error) {
        // 読み込みエラーは無視
      }
    }
    
    const allCode = allCodeContent.map(f => f.content).join('\n');
    
    console.log(`   検索対象ファイル数: ${serverFiles.length}件\n`);

    // 3. 各加算マスタの実装状況を確認
    console.log('📊 3. 各加算マスタの実装状況:');
    console.log('─'.repeat(60));
    
    const implemented: Array<typeof bonusMaster.$inferSelect> = [];
    const notImplemented: Array<typeof bonusMaster.$inferSelect> = [];
    
    for (const master of devActiveMasters) {
      // bonus_codeを直接検索
      const codeRegex = new RegExp(`['"]${master.bonusCode}['"]`, 'i');
      const foundInCode = codeRegex.test(allCode);
      
      if (foundInCode) {
        implemented.push(master);
      } else {
        notImplemented.push(master);
      }
    }
    
    console.log(`   実装済み: ${implemented.length}件`);
    console.log(`   未実装: ${notImplemented.length}件\n`);
    
    if (implemented.length > 0) {
      console.log('   実装済みの加算マスタ:');
      implemented.forEach((master, index) => {
        console.log(`   ${index + 1}. ${master.bonusCode} - ${master.bonusName} (${master.insuranceType})`);
      });
      console.log('');
    }
    
    if (notImplemented.length > 0) {
      console.log('   ⚠️  未実装の加算マスタ:');
      notImplemented.forEach((master, index) => {
        console.log(`   ${index + 1}. ${master.bonusCode} - ${master.bonusName} (${master.insuranceType})`);
      });
      console.log('');
    }

    // 4. 保険種別ごとの実装状況
    console.log('📊 4. 保険種別ごとの実装状況:');
    console.log('─'.repeat(60));
    
    const medicalImplemented = implemented.filter(m => m.insuranceType === 'medical').length;
    const medicalNotImplemented = notImplemented.filter(m => m.insuranceType === 'medical').length;
    const careImplemented = implemented.filter(m => m.insuranceType === 'care').length;
    const careNotImplemented = notImplemented.filter(m => m.insuranceType === 'care').length;
    
    console.log(`   医療保険 - 実装済み: ${medicalImplemented}件 / 未実装: ${medicalNotImplemented}件`);
    console.log(`   介護保険 - 実装済み: ${careImplemented}件 / 未実装: ${careNotImplemented}件\n`);

    // 5. サマリー
    console.log('📊 5. サマリー:');
    console.log('─'.repeat(60));
    
    if (notImplemented.length === 0) {
      console.log('   ✅ すべての有効な加算マスタが実装されています。\n');
    } else {
      console.log(`   ⚠️  ${notImplemented.length}件の加算マスタが未実装です。\n`);
      console.log('   未実装の加算マスタの詳細:');
      notImplemented.forEach((master, index) => {
        console.log(`   ${index + 1}. ${master.bonusCode} - ${master.bonusName}`);
        console.log(`      保険種別: ${master.insuranceType}`);
        console.log(`      点数タイプ: ${master.pointsType}`);
        console.log(`      固定点数: ${master.fixedPoints || '(条件分岐)'}`);
      });
      console.log('');
    }

    console.log('─'.repeat(60));
    console.log('✅ 実装状況の確認が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prodPool.end();
    await devPool.end();
  }
}

checkBonusImplementationStatus()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });


