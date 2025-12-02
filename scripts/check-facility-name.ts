/**
 * 施設IDから施設名を確認するスクリプト
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { eq } from 'drizzle-orm';
import { facilities } from '../shared/schema';

const PROD_DB_URL = 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function checkFacilityName() {
  console.log('🔍 施設IDから施設名を確認します...\n');
  console.log('⚠️  本番DBへの読み取り専用アクセスです。更新操作は行いません。\n');
  
  const prodPool = new Pool({ connectionString: PROD_DB_URL });
  const prodDb = drizzle(prodPool);

  try {
    const facilityId = '2d4562ce-1aae-4d79-80ec-0b128654e466';
    
    const facilityList = await prodDb.select().from(facilities).where(
      eq(facilities.id, facilityId)
    );
    
    const facility = facilityList[0];

    if (!facility) {
      console.log(`❌ 施設ID ${facilityId} が見つかりませんでした。`);
      return;
    }

    console.log(`✅ 施設情報:`);
    console.log(`   施設ID: ${facility.id}`);
    console.log(`   施設名: ${facility.name}`);
    console.log(`   施設コード: ${facility.facilityCode || '未設定'}`);
    console.log(`   都道府県コード: ${facility.prefectureCode || '未設定'}`);
    console.log(`   住所: ${facility.address || '未設定'}`);
    console.log(`   電話番号: ${facility.phone || '未設定'}`);
    
    // 「訪問看護ステーションソレア春日部」かどうかを確認
    if (facility.name.includes('ソレア') && facility.name.includes('春日部')) {
      console.log(`\n✅ この施設は「訪問看護ステーションソレア春日部」です。`);
    } else {
      console.log(`\n⚠️  この施設は「訪問看護ステーションソレア春日部」ではありません。`);
      console.log(`   実際の施設名: ${facility.name}`);
    }

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prodPool.end();
  }
}

checkFacilityName()
  .then(() => {
    console.log('\n✅ 確認完了');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 確認中にエラーが発生しました:', error);
    process.exit(1);
  });

