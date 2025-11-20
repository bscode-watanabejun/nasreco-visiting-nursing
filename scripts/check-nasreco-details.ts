/**
 * NASRECO訪問看護ステーションの詳細情報を確認するスクリプト
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

const PROD_DB_URL = 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

const roleNames: Record<string, string> = {
  admin: '管理者',
  nurse: '看護師',
  manager: 'マネージャー',
  corporate_admin: '企業管理者',
  system_admin: 'システム管理者',
};

const accessLevelNames: Record<string, string> = {
  facility: '施設',
  corporate: '企業',
};

async function main() {
  const pool = new Pool({ connectionString: PROD_DB_URL });

  try {
    console.log('=== NASRECO訪問看護ステーション 詳細情報 ===\n');
    console.log('⚠️  本番データベースに接続します（読み取り専用）\n');

    // 企業情報を取得
    const companyQuery = `
      SELECT id, name, slug, address, phone, email, created_at, updated_at
      FROM companies
      WHERE slug = 'nasreco'
    `;
    const companyResult = await pool.query(companyQuery);
    
    if (companyResult.rows.length === 0) {
      console.log('❌ NASRECO訪問看護ステーションが見つかりませんでした。');
      return;
    }

    const company = companyResult.rows[0];
    console.log(`${'='.repeat(80)}`);
    console.log(`📊 企業情報`);
    console.log(`${'='.repeat(80)}`);
    console.log(`  企業名: ${company.name}`);
    console.log(`  スラッグ: ${company.slug}`);
    if (company.address) console.log(`  住所: ${company.address}`);
    if (company.phone) console.log(`  電話番号: ${company.phone}`);
    if (company.email) console.log(`  メール: ${company.email}`);
    console.log(`  登録日: ${new Date(company.created_at).toLocaleString('ja-JP')}`);
    console.log(`  更新日: ${new Date(company.updated_at).toLocaleString('ja-JP')}`);

    // 施設情報を取得
    const facilitiesQuery = `
      SELECT 
        f.id,
        f.name,
        f.slug,
        f.is_headquarters,
        f.is_active,
        f.address,
        f.phone,
        f.email,
        f.facility_code,
        f.prefecture_code,
        f.created_at,
        f.updated_at
      FROM facilities f
      WHERE f.company_id = $1
      ORDER BY f.is_headquarters DESC, f.name
    `;
    const facilitiesResult = await pool.query(facilitiesQuery, [company.id]);

    console.log(`\n${'='.repeat(80)}`);
    console.log(`🏥 施設情報 (${facilitiesResult.rows.length}施設)`);
    console.log(`${'='.repeat(80)}`);

    for (const facility of facilitiesResult.rows) {
      const hqMark = facility.is_headquarters ? ' [本社]' : '';
      const activeMark = facility.is_active ? '✅ 有効' : '❌ 無効';
      
      console.log(`\n  📍 ${facility.name}${hqMark} (${activeMark})`);
      console.log(`     施設ID: ${facility.id}`);
      console.log(`     スラッグ: ${facility.slug}`);
      if (facility.address) console.log(`     住所: ${facility.address}`);
      if (facility.phone) console.log(`     電話番号: ${facility.phone}`);
      if (facility.email) console.log(`     メール: ${facility.email}`);
      if (facility.facility_code) console.log(`     施設コード: ${facility.facility_code}`);
      if (facility.prefecture_code) console.log(`     都道府県コード: ${facility.prefecture_code}`);
      console.log(`     登録日: ${new Date(facility.created_at).toLocaleString('ja-JP')}`);

      // 各施設のユーザー情報を取得
      const usersQuery = `
        SELECT 
          u.id,
          u.username,
          u.full_name,
          u.email,
          u.role,
          u.access_level,
          u.license_number,
          u.phone,
          u.is_active,
          u.must_change_password,
          u.specialist_certifications,
          u.created_at,
          u.updated_at
        FROM users u
        WHERE u.facility_id = $1
        ORDER BY u.role, u.full_name
      `;
      const usersResult = await pool.query(usersQuery, [facility.id]);

      if (usersResult.rows.length === 0) {
        console.log(`     👥 ユーザー: なし`);
      } else {
        console.log(`     👥 ユーザー: ${usersResult.rows.length}名`);
        console.log(`     ${'-'.repeat(76)}`);
        
        for (const user of usersResult.rows) {
          const activeStatus = user.is_active ? '✅ 有効' : '❌ 無効';
          const passwordChangeRequired = user.must_change_password ? ' 🔑 パスワード変更必須' : '';
          const roleDisplay = roleNames[user.role] || user.role;
          const accessLevelDisplay = accessLevelNames[user.access_level] || user.access_level;

          console.log(`\n     👤 ${user.full_name}`);
          console.log(`        ログインID: ${user.username}`);
          console.log(`        メールアドレス: ${user.email}`);
          console.log(`        権限: ${roleDisplay} (${user.role})`);
          console.log(`        アクセスレベル: ${accessLevelDisplay} (${user.access_level})`);
          if (user.license_number) {
            console.log(`        資格番号: ${user.license_number}`);
          }
          if (user.phone) {
            console.log(`        電話番号: ${user.phone}`);
          }
          if (user.specialist_certifications) {
            const certs = Array.isArray(user.specialist_certifications) 
              ? user.specialist_certifications 
              : JSON.parse(user.specialist_certifications);
            if (certs && certs.length > 0) {
              console.log(`        専門資格: ${certs.join(', ')}`);
            }
          }
          console.log(`        ステータス: ${activeStatus}${passwordChangeRequired}`);
          console.log(`        登録日: ${new Date(user.created_at).toLocaleString('ja-JP')}`);
          console.log(`        更新日: ${new Date(user.updated_at).toLocaleString('ja-JP')}`);
        }
      }
    }

    // 統計情報
    const statsQuery = `
      SELECT 
        COUNT(DISTINCT f.id) as facility_count,
        COUNT(DISTINCT u.id) as user_count,
        COUNT(DISTINCT CASE WHEN u.is_active THEN u.id END) as active_user_count,
        COUNT(DISTINCT p.id) as patient_count,
        COUNT(DISTINCT CASE WHEN p.is_active THEN p.id END) as active_patient_count
      FROM facilities f
      LEFT JOIN users u ON u.facility_id = f.id
      LEFT JOIN patients p ON p.facility_id = f.id
      WHERE f.company_id = $1
    `;
    const statsResult = await pool.query(statsQuery, [company.id]);
    const stats = statsResult.rows[0];

    console.log(`\n${'='.repeat(80)}`);
    console.log(`📈 統計情報`);
    console.log(`${'='.repeat(80)}`);
    console.log(`  施設数: ${stats.facility_count}施設`);
    console.log(`  ユーザー数: ${stats.user_count}名（うち有効: ${stats.active_user_count}名）`);
    console.log(`  患者数: ${stats.patient_count}名（うち有効: ${stats.active_patient_count}名）`);

    // 権限別の集計
    const roleStatsQuery = `
      SELECT 
        u.role,
        COUNT(*) as count
      FROM users u
      JOIN facilities f ON u.facility_id = f.id
      WHERE f.company_id = $1
      GROUP BY u.role
      ORDER BY u.role
    `;
    const roleStatsResult = await pool.query(roleStatsQuery, [company.id]);

    if (roleStatsResult.rows.length > 0) {
      console.log(`\n  権限別ユーザー数:`);
      for (const row of roleStatsResult.rows) {
        const roleDisplay = roleNames[row.role] || row.role;
        console.log(`    - ${roleDisplay} (${row.role}): ${row.count}名`);
      }
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log('✅ NASRECO訪問看護ステーションの詳細情報確認完了');
    console.log(`${'='.repeat(80)}\n`);

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

main().catch(console.error);

