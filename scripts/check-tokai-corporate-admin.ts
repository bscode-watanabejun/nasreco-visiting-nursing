/**
 * 本番環境の「tokai」corporate_admin権限を持つアカウント確認スクリプト
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

const PROD_DB_URL = 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function checkTokaiCorporateAdmin() {
  console.log('🔍 本番環境「tokai」corporate_admin権限アカウント確認\n');
  console.log('⚠️  本番データベースに接続します（読み取り専用）\n');
  console.log('─'.repeat(80));
  
  const prodPool = new Pool({ connectionString: PROD_DB_URL });

  try {
    // 1. tokaiの会社情報を取得
    const companies = await prodPool.query(`
      SELECT id, name, slug
      FROM companies
      WHERE slug = 'tokai' OR name LIKE '%東海%'
      LIMIT 1
    `);
    
    if (companies.rows.length === 0) {
      console.log('   ❌ 「tokai」の会社が見つかりませんでした。');
      await prodPool.end();
      return;
    }
    
    const tokaiCompany = companies.rows[0];
    console.log(`   ✅ 会社: ${tokaiCompany.name} (${tokaiCompany.slug})\n`);

    // 2. tokaiの全施設を取得
    const facilities = await prodPool.query({
      text: `
        SELECT id, name, is_headquarters
        FROM facilities
        WHERE company_id = $1
        ORDER BY is_headquarters DESC, name
      `,
      values: [tokaiCompany.id]
    });

    // 3. corporate_admin権限を持つユーザーを検索
    console.log('📊 corporate_admin権限を持つユーザーを検索中...\n');
    
    const corporateAdmins = await prodPool.query({
      text: `
        SELECT 
          u.id,
          u.username,
          u.email,
          u.full_name,
          u.role,
          u.access_level,
          u.is_active,
          f.name as facility_name,
          f.is_headquarters,
          u.created_at
        FROM users u
        JOIN facilities f ON u.facility_id = f.id
        WHERE f.company_id = $1
          AND u.access_level = 'corporate'
          AND u.is_active = true
        ORDER BY f.is_headquarters DESC, u.role DESC, u.username
      `,
      values: [tokaiCompany.id]
    });
    
    if (corporateAdmins.rows.length === 0) {
      console.log('   ⚠️  corporate_admin権限を持つユーザーが見つかりませんでした。\n');
      console.log('   📝 施設情報を更新するには、以下のいずれかの権限が必要です：');
      console.log('      1. corporate_admin権限（会社全体の管理）');
      console.log('      2. 本社（is_headquarters=true）のadminまたはmanager権限\n');
      
      // 本社のadmin/managerを確認
      const hqFacilities = facilities.rows.filter((f: any) => f.is_headquarters);
      if (hqFacilities.length > 0) {
        console.log('   📍 本社のadmin/managerアカウントを確認中...\n');
        for (const hqFacility of hqFacilities) {
          const hqManagers = await prodPool.query({
            text: `
              SELECT 
                username,
                email,
                full_name,
                role,
                access_level,
                is_active
              FROM users
              WHERE facility_id = $1
                AND role IN ('admin', 'manager')
                AND is_active = true
              ORDER BY role DESC, username
            `,
            values: [hqFacility.id]
          });
          
          if (hqManagers.rows.length > 0) {
            console.log(`   ✅ ${hqFacility.name} のadmin/manager:`);
            hqManagers.rows.forEach((m: any) => {
              console.log(`      - ${m.username} (${m.email})`);
              console.log(`        役割: ${m.role}, アクセスレベル: ${m.access_level}`);
            });
            console.log('');
          }
        }
      }
    } else {
      console.log(`   ✅ corporate_admin権限を持つユーザー: ${corporateAdmins.rows.length}名\n`);
      corporateAdmins.rows.forEach((u: any, index: number) => {
        console.log(`   ${index + 1}. ${u.username}`);
        console.log(`      メール: ${u.email}`);
        console.log(`      氏名: ${u.full_name || '未設定'}`);
        console.log(`      役割: ${u.role}`);
        console.log(`      アクセスレベル: ${u.access_level}`);
        console.log(`      所属施設: ${u.facility_name}${u.is_headquarters ? ' (本社)' : ''}`);
        console.log(`      作成日: ${u.created_at}`);
        console.log('');
      });
    }

    // 4. 施設更新権限の説明
    console.log('─'.repeat(80));
    console.log('📝 施設情報更新権限について\n');
    console.log('「訪問看護ステーションソレア春日部」の事業所番号を更新するには、');
    console.log('以下のいずれかの権限が必要です：\n');
    console.log('1. corporate_admin権限（会社全体の管理）');
    console.log('   - access_level = "corporate" のユーザー');
    console.log('   - tokaiグループ全体の施設を更新可能\n');
    console.log('2. 本社のadminまたはmanager権限');
    console.log('   - 所属施設が is_headquarters = true');
    console.log('   - role = "admin" または "manager"');
    console.log('   - 同じ会社の施設を更新可能\n');
    console.log('─'.repeat(80));
    console.log('✅ 確認完了\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prodPool.end();
  }
}

checkTokaiCorporateAdmin()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('処理中にエラーが発生しました:', error);
    process.exit(1);
  });







