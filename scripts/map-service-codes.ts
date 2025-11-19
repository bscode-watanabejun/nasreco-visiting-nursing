/**
 * 本番環境と開発環境のサービスコードマッピング確認スクリプト
 * 
 * 本番環境の誤ったコード（31から始まる）と開発環境の正しいコード（51から始まる）
 * の対応関係を確認します。
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { nursingServiceCodes } from '../shared/schema';

const PROD_DB_URL = 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';
const DEV_DB_URL = 'postgresql://neondb_owner:npg_beoRr4gaQ5Dl@ep-polished-scene-a5twqv82.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function mapServiceCodes() {
  console.log('🔍 本番環境と開発環境のサービスコードマッピングを確認します...\n');
  
  const prodPool = new Pool({ connectionString: PROD_DB_URL });
  const devPool = new Pool({ connectionString: DEV_DB_URL });
  const prodDb = drizzle(prodPool);
  const devDb = drizzle(devPool);

  try {
    // 本番環境のサービスコード（31から始まる誤ったコード）
    console.log('📊 本番環境のサービスコード（31から始まる誤ったコード）');
    console.log('─'.repeat(60));
    const prodCodes = await prodDb.select().from(nursingServiceCodes);
    const prodWrongCodes = prodCodes.filter(code => code.serviceCode.startsWith('31'));
    
    console.log(`本番環境の誤ったコード数: ${prodWrongCodes.length}件\n`);
    
    // 開発環境のサービスコード（51から始まる正しいコード）
    console.log('📊 開発環境のサービスコード（51から始まる正しいコード）');
    console.log('─'.repeat(60));
    const devCodes = await devDb.select().from(nursingServiceCodes);
    const devCorrectCodes = devCodes.filter(code => code.serviceCode.startsWith('51') && code.isActive);
    
    console.log(`開発環境の正しいコード数: ${devCorrectCodes.length}件\n`);
    
    // マッピングの作成
    console.log('📋 サービスコードマッピング');
    console.log('─'.repeat(60));
    
    // 本番環境の誤ったコードと開発環境の正しいコードの対応関係を推測
    // 311000110 → 510000110 のような対応関係
    const mapping: Array<{
      wrongCode: string;
      wrongName: string;
      correctCode: string;
      correctName: string;
      correctId: string;
    }> = [];
    
    for (const wrongCode of prodWrongCodes) {
      // 誤ったコードの末尾6桁を取得（例: 311000110 → 1000110）
      const suffix = wrongCode.serviceCode.substring(2); // "1000110"
      
      // 開発環境で対応する正しいコードを探す（51 + 末尾6桁）
      const correctCodeStr = '51' + suffix; // "511000110"
      const correctCode = devCorrectCodes.find(code => code.serviceCode === correctCodeStr);
      
      if (correctCode) {
        mapping.push({
          wrongCode: wrongCode.serviceCode,
          wrongName: wrongCode.serviceName,
          correctCode: correctCode.serviceCode,
          correctName: correctCode.serviceName,
          correctId: correctCode.id,
        });
      } else {
        // 完全一致しない場合、サービス名称から推測
        // 311000110は「訪問看護基本療養費（Ⅰ）週3日まで」なので
        // 510000110「訪問看護基本療養費１（保健師、助産師又は看護師による場合（ハを除く。））（週３日目まで）」に対応
        const nameMatch = devCorrectCodes.find(code => {
          const name = code.serviceName;
          // 基本療養費（Ⅰ）→ 基本療養費１
          // 週3日まで → 週３日目まで
          return (name.startsWith('訪問看護基本療養費') || name.startsWith('精神科訪問看護基本療養費')) && 
                 (name.includes('週３日') || name.includes('週3日')) &&
                 code.insuranceType === wrongCode.insuranceType;
        });
        
        if (nameMatch) {
          mapping.push({
            wrongCode: wrongCode.serviceCode,
            wrongName: wrongCode.serviceName,
            correctCode: nameMatch.serviceCode,
            correctName: nameMatch.serviceName,
            correctId: nameMatch.id,
          });
        } else {
          console.log(`⚠️  対応する正しいコードが見つかりません: ${wrongCode.serviceCode} - ${wrongCode.serviceName}`);
        }
      }
    }
    
    console.log(`\nマッピング数: ${mapping.length}件\n`);
    
    // マッピング結果を表示
    mapping.forEach((map, index) => {
      console.log(`${index + 1}. ${map.wrongCode} → ${map.correctCode}`);
      console.log(`   誤: ${map.wrongName.substring(0, 60)}...`);
      console.log(`   正: ${map.correctName.substring(0, 60)}...`);
      console.log(`   ID: ${map.correctId.substring(0, 8)}...`);
      console.log('');
    });
    
    // 本番環境で実際に使用されているコード（311000110）のマッピングを確認
    console.log('\n📋 本番環境で実際に使用されているコード（311000110）のマッピング:');
    console.log('─'.repeat(60));
    const usedWrongCode = mapping.find(m => m.wrongCode === '311000110');
    if (usedWrongCode) {
      console.log(`✅ マッピングが見つかりました:`);
      console.log(`   誤ったコード: ${usedWrongCode.wrongCode} - ${usedWrongCode.wrongName}`);
      console.log(`   正しいコード: ${usedWrongCode.correctCode} - ${usedWrongCode.correctName}`);
      console.log(`   正しいコードID: ${usedWrongCode.correctId}`);
    } else {
      console.log('❌ マッピングが見つかりませんでした');
    }

    console.log('\n' + '─'.repeat(60));
    console.log('✅ サービスコードマッピング確認が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prodPool.end();
    await devPool.end();
  }
}

mapServiceCodes()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

