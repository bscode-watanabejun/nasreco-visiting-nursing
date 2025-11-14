/**
 * 正確なサービスコードマッピング作成スクリプト
 * 
 * 本番環境の誤ったコード（31から始まる）と開発環境の正しいコード（51から始まる）
 * の対応関係を、サービス名称から正確にマッピングします。
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { nursingServiceCodes } from '../shared/schema';

const PROD_DB_URL = 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';
const DEV_DB_URL = 'postgresql://neondb_owner:npg_beoRr4gaQ5Dl@ep-polished-scene-a5twqv82.us-east-2.aws.neon.tech/neondb?sslmode=require';

interface ServiceCodeMapping {
  wrongCode: string;
  wrongName: string;
  correctCode: string;
  correctName: string;
  correctId: string;
}

function findMatchingCode(
  wrongName: string,
  wrongCode: string,
  devCodes: Array<{ serviceCode: string; serviceName: string; id: string; insuranceType: string }>
): { serviceCode: string; serviceName: string; id: string } | null {
  // 311000110: 訪問看護基本療養費（Ⅰ）週3日まで → 510000110: 訪問看護基本療養費１（保健師、助産師又は看護師による場合（ハを除く。））（週３日目まで）
  // 311000210: 訪問看護基本療養費（Ⅰ）週4日以降 → 510000210: 訪問看護基本療養費１（保健師、助産師又は看護師による場合（ハを除く。））（週４日目以降）
  // 311000310: 訪問看護基本療養費（Ⅱ）週3日まで → 510000710: 訪問看護基本療養費２（保健師、助産師又は看護師による場合（ハを除く。））（同一日に２人）（週３日目まで）
  // 311000410: 訪問看護基本療養費（Ⅱ）週4日以降 → 510000810: 訪問看護基本療養費２（保健師、助産師又は看護師による場合（ハを除く。））（同一日に２人）（週４日目以降）
  // 311000510: 訪問看護基本療養費（Ⅲ）週3日まで → 510000910: 訪問看護基本療養費２（保健師、助産師又は看護師による場合（ハを除く。））（同一日に３人以上）（週３日目まで）
  // 311000610: 訪問看護基本療養費（Ⅲ）週4日以降 → 510001010: 訪問看護基本療養費２（保健師、助産師又は看護師による場合（ハを除く。））（同一日に３人以上）（週４日目以降）
  
  // 直接的なコードマッピング（末尾6桁が一致する場合）
  const suffix = wrongCode.substring(2);
  const directMatch = devCodes.find(code => code.serviceCode === '51' + suffix);
  if (directMatch) {
    return directMatch;
  }
  
  // サービス名称から判断（全角文字を含むため、toLowerCase()は使わない）
  const name = wrongName;
  
  // 基本療養費（Ⅰ）週3日まで → 基本療養費１（保健師、助産師又は看護師による場合（ハを除く。））（週３日目まで）
  if (name.includes('基本療養費（Ⅰ）') && name.includes('週3日まで')) {
    return devCodes.find(code => 
      code.serviceCode === '510000110' && code.insuranceType === 'medical'
    ) || null;
  }
  
  // 基本療養費（Ⅰ）週4日以降 → 基本療養費１（保健師、助産師又は看護師による場合（ハを除く。））（週４日目以降）
  if (name.includes('基本療養費（Ⅰ）') && name.includes('週4日以降')) {
    return devCodes.find(code => 
      code.serviceCode === '510000210' && code.insuranceType === 'medical'
    ) || null;
  }
  
  // 基本療養費（Ⅱ）週3日まで → 基本療養費２（保健師、助産師又は看護師による場合（ハを除く。））（同一日に２人）（週３日目まで）
  if (name.includes('基本療養費（Ⅱ）') && name.includes('週3日まで')) {
    return devCodes.find(code => 
      code.serviceCode === '510000710' && code.insuranceType === 'medical'
    ) || null;
  }
  
  // 基本療養費（Ⅱ）週4日以降 → 基本療養費２（保健師、助産師又は看護師による場合（ハを除く。））（同一日に２人）（週４日目以降）
  if (name.includes('基本療養費（Ⅱ）') && name.includes('週4日以降')) {
    return devCodes.find(code => 
      code.serviceCode === '510000810' && code.insuranceType === 'medical'
    ) || null;
  }
  
  // 基本療養費（Ⅲ）週3日まで → 基本療養費２（保健師、助産師又は看護師による場合（ハを除く。））（同一日に３人以上）（週３日目まで）
  if (name.includes('基本療養費（Ⅲ）') && name.includes('週3日まで')) {
    return devCodes.find(code => 
      code.serviceCode === '510000910' && code.insuranceType === 'medical'
    ) || null;
  }
  
  // 基本療養費（Ⅲ）週4日以降 → 基本療養費２（保健師、助産師又は看護師による場合（ハを除く。））（同一日に３人以上）（週４日目以降）
  if (name.includes('基本療養費（Ⅲ）') && name.includes('週4日以降')) {
    return devCodes.find(code => 
      code.serviceCode === '510001010' && code.insuranceType === 'medical'
    ) || null;
  }
  
  // 精神科訪問看護基本療養費（Ⅰ）週3日まで → 510000110（同じ基本療養費１）
  if (name.includes('精神科') && name.includes('基本療養費（Ⅰ）') && name.includes('週3日まで')) {
    return devCodes.find(code => 
      code.serviceCode === '510000110' && code.insuranceType === 'medical'
    ) || null;
  }
  
  // 精神科訪問看護基本療養費（Ⅰ）週4日以降 → 510000210
  if (name.includes('精神科') && name.includes('基本療養費（Ⅰ）') && name.includes('週4日以降')) {
    return devCodes.find(code => 
      code.serviceCode === '510000210' && code.insuranceType === 'medical'
    ) || null;
  }
  
  // 精神科訪問看護基本療養費（Ⅱ） → 510000710（基本療養費２）
  if (name.includes('精神科') && name.includes('基本療養費（Ⅱ）')) {
    return devCodes.find(code => 
      code.serviceCode === '510000710' && code.insuranceType === 'medical'
    ) || null;
  }
  
  // 特別管理加算 → 該当する加算コード（特管は別のコード体系）
  if (name.includes('特別管理加算')) {
    // 特管は別のマスタで管理されているため、基本療養費にマッピングしない
    return null;
  }
  
  // 長時間訪問看護加算 → 510002570
  if (name.includes('長時間訪問看護加算')) {
    return devCodes.find(code => 
      code.serviceCode === '510002570' && code.insuranceType === 'medical'
    ) || null;
  }
  
  // 複数名訪問看護加算（看護職員等） → 510002770
  if (name.includes('複数名訪問看護加算') && name.includes('看護職員')) {
    return devCodes.find(code => 
      code.serviceCode === '510002770' && code.insuranceType === 'medical'
    ) || null;
  }
  
  // 複数名訪問看護加算（准看護師） → 510002970
  if (name.includes('複数名訪問看護加算') && name.includes('准看護師')) {
    return devCodes.find(code => 
      code.serviceCode === '510002970' && code.insuranceType === 'medical'
    ) || null;
  }
  
  // 複数名訪問看護加算（看護補助者） → 510003170
  if (name.includes('複数名訪問看護加算') && name.includes('看護補助者')) {
    return devCodes.find(code => 
      code.serviceCode === '510003170' && code.insuranceType === 'medical'
    ) || null;
  }
  
  // 夜間・早朝訪問看護加算 → 510003970
  if (name.includes('夜間') && name.includes('早朝')) {
    return devCodes.find(code => 
      code.serviceCode === '510003970' && code.insuranceType === 'medical'
    ) || null;
  }
  
  // 深夜訪問看護加算 → 510004070
  if (name.includes('深夜')) {
    return devCodes.find(code => 
      code.serviceCode === '510004070' && code.insuranceType === 'medical'
    ) || null;
  }
  
  // 緊急訪問看護加算 → 510002470（月14日目まで）
  if (name.includes('緊急訪問看護加算')) {
    return devCodes.find(code => 
      code.serviceCode === '510002470' && code.insuranceType === 'medical'
    ) || null;
  }
  
  // 24時間対応体制加算 → 該当する加算コード（施設マスタで管理）
  if (name.includes('24時間対応体制加算')) {
    return null;
  }
  
  // 特別地域訪問看護加算 → 510002370
  if (name.includes('特別地域訪問看護加算')) {
    return devCodes.find(code => 
      code.serviceCode === '510002370' && code.insuranceType === 'medical'
    ) || null;
  }
  
  // 理学療法士等による訪問看護 → 510000610
  if (name.includes('理学療法士') || name.includes('作業療法士') || name.includes('言語聴覚士')) {
    return devCodes.find(code => 
      code.serviceCode === '510000610' && code.insuranceType === 'medical'
    ) || null;
  }
  
  // ターミナルケア加算 → 該当する加算コード（別のコード体系）
  if (name.includes('ターミナルケア加算')) {
    return null;
  }
  
  return null;
}

async function createAccurateMapping() {
  console.log('🔍 正確なサービスコードマッピングを作成します...\n');
  
  const prodPool = new Pool({ connectionString: PROD_DB_URL });
  const devPool = new Pool({ connectionString: DEV_DB_URL });
  const prodDb = drizzle(prodPool);
  const devDb = drizzle(devPool);

  try {
    // 本番環境のサービスコード（31から始まる誤ったコード）
    const prodCodes = await prodDb.select().from(nursingServiceCodes);
    const prodWrongCodes = prodCodes.filter(code => code.serviceCode.startsWith('31'));
    
    // 開発環境のサービスコード（51から始まる正しいコード）
    const devCodes = await devDb.select().from(nursingServiceCodes);
    const devCorrectCodes = devCodes.filter(code => code.serviceCode.startsWith('51') && code.isActive);
    
    console.log(`本番環境の誤ったコード数: ${prodWrongCodes.length}件`);
    console.log(`開発環境の正しいコード数: ${devCorrectCodes.length}件\n`);
    
    // マッピングの作成
    const mapping: ServiceCodeMapping[] = [];
    const unmapped: Array<{ code: string; name: string }> = [];
    
    for (const wrongCode of prodWrongCodes) {
      const match = findMatchingCode(
        wrongCode.serviceName,
        wrongCode.serviceCode,
        devCorrectCodes.map(c => ({
          serviceCode: c.serviceCode,
          serviceName: c.serviceName,
          id: c.id,
          insuranceType: c.insuranceType,
        }))
      );
      
      if (match) {
        mapping.push({
          wrongCode: wrongCode.serviceCode,
          wrongName: wrongCode.serviceName,
          correctCode: match.serviceCode,
          correctName: match.serviceName,
          correctId: match.id,
        });
      } else {
        unmapped.push({
          code: wrongCode.serviceCode,
          name: wrongCode.serviceName,
        });
      }
    }
    
    console.log('📋 サービスコードマッピング結果');
    console.log('─'.repeat(60));
    console.log(`マッピング成功: ${mapping.length}件`);
    console.log(`マッピング失敗: ${unmapped.length}件\n`);
    
    // マッピング結果を表示
    mapping.forEach((map, index) => {
      console.log(`${index + 1}. ${map.wrongCode} → ${map.correctCode}`);
      console.log(`   誤: ${map.wrongName}`);
      console.log(`   正: ${map.correctName.substring(0, 70)}...`);
      console.log(`   ID: ${map.correctId}`);
      console.log('');
    });
    
    if (unmapped.length > 0) {
      console.log('\n⚠️  マッピングできなかったコード:');
      unmapped.forEach(item => {
        console.log(`   ${item.code} - ${item.name}`);
      });
    }
    
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
    console.log('✅ サービスコードマッピング作成が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prodPool.end();
    await devPool.end();
  }
}

createAccurateMapping()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

