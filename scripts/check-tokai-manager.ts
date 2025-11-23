/**
 * 本番環境の「tokai」施設管理者アカウント確認スクリプト
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

const PROD_DB_URL = 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function checkTokaiManager() {
  console.log('🔍 本番環境「tokai」施設管理者アカウント確認\n');
  console.log('⚠️  本番データベースに接続します（読み取り専用）\n');
  console.log('─'.repeat(80));
  
  const prodPool = new Pool({ connectionString: PROD_DB_URL });

  try {
    // 1. tokaiの会社情報を取得
    console.log('📊 1. tokaiの会社情報を確認中...\n');
    
    const companies = await prodPool.query(`
      SELECT id, name, slug
      FROM companies
      WHERE slug = 'tokai' OR name LIKE '%東海%'
      ORDER BY name
    `);
    
    if (companies.rows.length === 0) {
      console.log('   ❌ 「tokai」の会社が見つかりませんでした。');
      await prodPool.end();
      return;
    }
    
    const tokaiCompany = companies.rows[0];
    console.log(`   ✅ 会社を確認:`);
    console.log(`      名称: ${tokaiCompany.name}`);
    console.log(`      Slug: ${tokaiCompany.slug}`);
    console.log(`      ID: ${tokaiCompany.id}\n`);

    // 2. tokaiの施設一覧を取得
    console.log('📊 2. tokaiの施設一覧を確認中...\n');
    
    const facilities = await prodPool.query({
      text: `
        SELECT id, name, facility_code, is_headquarters, is_active
        FROM facilities
        WHERE company_id = $1
        ORDER BY is_headquarters DESC, name
      `,
      values: [tokaiCompany.id]
    });
    
    console.log(`   施設数: ${facilities.rows.length}件\n`);
    facilities.rows.forEach((f: any, index: number) => {
      console.log(`   ${index + 1}. ${f.name}`);
      console.log(`      ID: ${f.id}`);
      console.log(`      施設コード: ${f.facility_code || '未設定'}`);
      console.log(`      本社: ${f.is_headquarters ? 'はい' : 'いいえ'}`);
      console.log(`      アクティブ: ${f.is_active ? 'はい' : 'いいえ'}`);
      console.log('');
    });

    // 3. 各施設の管理者アカウントを取得
    console.log('📊 3. 管理者アカウントを確認中...\n');
    
    for (const facility of facilities.rows) {
      const managers = await prodPool.query({
        text: `
          SELECT 
            id,
            username,
            email,
            full_name,
            role,
            access_level,
            is_active,
            created_at
          FROM users
          WHERE facility_id = $1
            AND (role = 'manager' OR role = 'admin')
            AND is_active = true
          ORDER BY role DESC, username
        `,
        values: [facility.id]
      });
      
      if (managers.rows.length > 0) {
        console.log(`   📍 ${facility.name} の管理者:`);
        managers.rows.forEach((m: any) => {
          console.log(`      - ユーザー名: ${m.username}`);
          console.log(`        メール: ${m.email}`);
          console.log(`        氏名: ${m.full_name || '未設定'}`);
          console.log(`        役割: ${m.role}`);
          console.log(`        アクセスレベル: ${m.access_level}`);
          console.log(`        作成日: ${m.created_at}`);
          console.log('');
        });
      } else {
        console.log(`   📍 ${facility.name}: 管理者アカウントが見つかりませんでした\n`);
      }
    }

    // 4. まとめ
    console.log('─'.repeat(80));
    console.log('✅ 確認完了\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prodPool.end();
  }
}

checkTokaiManager()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('処理中にエラーが発生しました:', error);
    process.exit(1);
  });







