/**
 * 開発環境のサービスコードマスタ確認スクリプト
 * 
 * 開発環境のサービスコードマスタを確認し、本番環境の誤ったコードに対応する
 * 正しいコードを特定します。
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { nursingServiceCodes } from '../shared/schema';

const DEV_DB_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_beoRr4gaQ5Dl@ep-polished-scene-a5twqv82.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function checkDevServiceCodes() {
  console.log('🔍 開発環境のサービスコードマスタを確認します...\n');
  console.log('⚠️  開発データベースに接続します\n');
  
  const pool = new Pool({ connectionString: DEV_DB_URL });
  const db = drizzle(pool);

  try {
    // サービスコードマスタの現状確認
    console.log('📊 サービスコードマスタの現状');
    console.log('─'.repeat(60));
    const allServiceCodes = await db.select().from(nursingServiceCodes);
    const activeServiceCodes = allServiceCodes.filter(code => code.isActive);
    const inactiveServiceCodes = allServiceCodes.filter(code => !code.isActive);
    
    console.log(`総サービスコード数: ${allServiceCodes.length}件`);
    console.log(`有効なサービスコード: ${activeServiceCodes.length}件`);
    console.log(`無効なサービスコード: ${inactiveServiceCodes.length}件`);
    
    // サービスコードの先頭2桁別集計
    const codePrefixCounts: Record<string, number> = {};
    allServiceCodes.forEach(code => {
      const prefix = code.serviceCode.substring(0, 2);
      codePrefixCounts[prefix] = (codePrefixCounts[prefix] || 0) + 1;
    });
    
    console.log('\nサービスコードの先頭2桁別集計:');
    Object.entries(codePrefixCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([prefix, count]) => {
        console.log(`  ${prefix}xx: ${count}件`);
      });
    
    // 31から始まるコード（誤ったコード）の確認
    const wrongCodes = allServiceCodes.filter(code => code.serviceCode.startsWith('31'));
    if (wrongCodes.length > 0) {
      console.log(`\n⚠️  31から始まる誤ったコード: ${wrongCodes.length}件`);
      wrongCodes.forEach(code => {
        console.log(`     ${code.serviceCode} - ${code.serviceName} (isActive: ${code.isActive})`);
      });
    }
    
    // 51から始まるコード（正しいコード）の確認
    const correctCodes = allServiceCodes.filter(code => code.serviceCode.startsWith('51'));
    console.log(`\n✅ 51から始まる正しいコード: ${correctCodes.length}件`);
    
    // 本番環境で使用されている誤ったコード（311000110）に対応する正しいコードを探す
    console.log('\n📋 本番環境で使用されている誤ったコード（311000110）に対応する正しいコード:');
    console.log('─'.repeat(60));
    
    // 311000110は「訪問看護基本療養費（Ⅰ）週3日まで」なので、対応する51から始まるコードを探す
    // 医療保険の基本療養費（Ⅰ）週3日までに対応するコード
    const correspondingCodes = correctCodes.filter(code => {
      // サービス名称から判断
      const name = code.serviceName;
      // 「基本療養費（Ⅰ）」または「基本療養費（1）」を含み、「週3日」または「週3」を含む
      return (name.includes('基本療養費（Ⅰ）') || name.includes('基本療養費（1）') || name.includes('基本療養費(I)')) &&
             (name.includes('週3日') || name.includes('週3') || name.includes('3日')) &&
             code.insuranceType === 'medical';
    });
    
    if (correspondingCodes.length > 0) {
      console.log('見つかった対応コード:');
      correspondingCodes.forEach(code => {
        console.log(`  ✅ ${code.serviceCode} - ${code.serviceName}`);
        console.log(`     点数: ${code.points}点, 保険種別: ${code.insuranceType}, ID: ${code.id.substring(0, 8)}...`);
      });
    } else {
      console.log('⚠️  直接対応するコードが見つかりませんでした。');
      console.log('   医療保険の基本療養費（Ⅰ）週3日までのコードを確認します...');
      
      // より広範囲に検索
      const medicalBasicCodes = correctCodes.filter(code => 
        code.insuranceType === 'medical' && 
        (code.serviceName.includes('基本療養費') || code.serviceName.includes('基本'))
      );
      
      console.log(`\n医療保険の基本療養費関連コード: ${medicalBasicCodes.length}件`);
      medicalBasicCodes.slice(0, 10).forEach(code => {
        console.log(`  ${code.serviceCode} - ${code.serviceName}`);
      });
      if (medicalBasicCodes.length > 10) {
        console.log(`  ... 他 ${medicalBasicCodes.length - 10}件`);
      }
    }
    
    // すべての51から始まるコードを一覧表示（参考用）
    console.log('\n📋 51から始まる正しいコード一覧（参考）:');
    console.log('─'.repeat(60));
    const sortedCodes = correctCodes.sort((a, b) => a.serviceCode.localeCompare(b.serviceCode));
    
    // 医療保険と介護保険で分けて表示
    const medicalCodes = sortedCodes.filter(code => code.insuranceType === 'medical');
    const careCodes = sortedCodes.filter(code => code.insuranceType === 'care');
    
    console.log(`\n【医療保険】${medicalCodes.length}件:`);
    medicalCodes.forEach(code => {
      console.log(`  ${code.serviceCode} - ${code.serviceName} (${code.points}点)`);
    });
    
    console.log(`\n【介護保険】${careCodes.length}件:`);
    careCodes.forEach(code => {
      console.log(`  ${code.serviceCode} - ${code.serviceName} (${code.points}単位)`);
    });

    console.log('\n' + '─'.repeat(60));
    console.log('✅ 開発環境のサービスコードマスタ確認が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

checkDevServiceCodes()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

