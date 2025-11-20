/**
 * 本番環境のユーザー情報を企業・施設ごとに確認するスクリプト
 * 
 * 各企業ごとに登録されているユーザー情報と権限を表示します。
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

// WebSocket設定
neonConfig.webSocketConstructor = ws;

const PROD_DB_URL = 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

// 権限の日本語名マッピング
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
    console.log('=== 本番環境のユーザー情報（企業・施設別） ===\n');
    console.log('⚠️  本番データベースに接続します（読み取り専用）\n');

    // 企業ごとにユーザー情報を取得
    const query = `
      SELECT 
        c.id as company_id,
        c.name as company_name,
        c.slug as company_slug,
        f.id as facility_id,
        f.name as facility_name,
        f.is_headquarters as is_headquarters,
        f.is_active as facility_is_active,
        u.id as user_id,
        u.username,
        u.full_name,
        u.email,
        u.role,
        u.access_level,
        u.license_number,
        u.phone,
        u.is_active as user_is_active,
        u.must_change_password,
        u.created_at as user_created_at
      FROM companies c
      LEFT JOIN facilities f ON f.company_id = c.id
      LEFT JOIN users u ON u.facility_id = f.id
      ORDER BY c.name, f.name, u.username
    `;

    const result = await pool.query(query);

    // 企業ごとにグループ化
    const companiesMap = new Map<string, {
      companyId: string;
      companyName: string;
      companySlug: string;
      facilities: Map<string, {
        facilityId: string;
        facilityName: string;
        isHeadquarters: boolean;
        facilityIsActive: boolean;
        users: Array<{
          userId: string;
          username: string;
          fullName: string;
          email: string;
          role: string;
          accessLevel: string;
          licenseNumber: string | null;
          phone: string | null;
          userIsActive: boolean;
          mustChangePassword: boolean;
          userCreatedAt: Date;
        }>;
      }>;
    }>();

    // データをグループ化
    for (const row of result.rows) {
      const companyId = row.company_id;
      const facilityId = row.facility_id;
      const userId = row.user_id;

      // 企業が存在しない場合はスキップ（データ不整合の可能性）
      if (!companyId) continue;

      // 企業を取得または作成
      if (!companiesMap.has(companyId)) {
        companiesMap.set(companyId, {
          companyId,
          companyName: row.company_name || '（未設定）',
          companySlug: row.company_slug || '',
          facilities: new Map(),
        });
      }
      const company = companiesMap.get(companyId)!;

      // 施設が存在する場合
      if (facilityId) {
        // 施設を取得または作成
        if (!company.facilities.has(facilityId)) {
          company.facilities.set(facilityId, {
            facilityId,
            facilityName: row.facility_name || '（未設定）',
            isHeadquarters: row.is_headquarters || false,
            facilityIsActive: row.facility_is_active !== false,
            users: [],
          });
        }
        const facility = company.facilities.get(facilityId)!;

        // ユーザーが存在する場合
        if (userId) {
          facility.users.push({
            userId,
            username: row.username,
            fullName: row.full_name,
            email: row.email,
            role: row.role,
            accessLevel: row.access_level,
            licenseNumber: row.license_number,
            phone: row.phone,
            userIsActive: row.user_is_active !== false,
            mustChangePassword: row.must_change_password || false,
            userCreatedAt: row.user_created_at,
          });
        }
      }
    }

    // 結果を表示
    let totalUsers = 0;
    let totalFacilities = 0;

    for (const [companyId, company] of companiesMap) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`📊 企業: ${company.companyName} (${company.companySlug || 'スラッグ未設定'})`);
      console.log(`${'='.repeat(80)}`);

      let companyUserCount = 0;
      let companyFacilityCount = 0;

      for (const [facilityId, facility] of company.facilities) {
        companyFacilityCount++;
        totalFacilities++;

        const headquartersMark = facility.isHeadquarters ? ' [本社]' : '';
        const activeMark = facility.facilityIsActive ? '' : ' [無効]';
        console.log(`\n  🏥 施設: ${facility.facilityName}${headquartersMark}${activeMark}`);

        if (facility.users.length === 0) {
          console.log(`     （ユーザーなし）`);
        } else {
          console.log(`     ユーザー数: ${facility.users.length}名`);
          console.log(`     ${'-'.repeat(76)}`);

          for (const user of facility.users) {
            companyUserCount++;
            totalUsers++;

            const activeStatus = user.userIsActive ? '✅ 有効' : '❌ 無効';
            const passwordChangeRequired = user.mustChangePassword ? ' 🔑 パスワード変更必須' : '';
            const roleDisplay = roleNames[user.role] || user.role;
            const accessLevelDisplay = accessLevelNames[user.accessLevel] || user.accessLevel;

            console.log(`     👤 ${user.fullName} (${user.username})`);
            console.log(`        - メール: ${user.email}`);
            console.log(`        - 権限: ${roleDisplay} (${user.role})`);
            console.log(`        - アクセスレベル: ${accessLevelDisplay} (${user.accessLevel})`);
            if (user.licenseNumber) {
              console.log(`        - 資格番号: ${user.licenseNumber}`);
            }
            if (user.phone) {
              console.log(`        - 電話番号: ${user.phone}`);
            }
            console.log(`        - ステータス: ${activeStatus}${passwordChangeRequired}`);
            console.log(`        - 登録日: ${user.userCreatedAt ? new Date(user.userCreatedAt).toLocaleString('ja-JP') : '（不明）'}`);
            console.log('');
          }
        }
      }

      console.log(`\n  📈 企業サマリー:`);
      console.log(`     - 施設数: ${companyFacilityCount}施設`);
      console.log(`     - ユーザー数: ${companyUserCount}名`);
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`📊 全体サマリー`);
    console.log(`${'='.repeat(80)}`);
    console.log(`  - 企業数: ${companiesMap.size}社`);
    console.log(`  - 施設数: ${totalFacilities}施設`);
    console.log(`  - ユーザー数: ${totalUsers}名`);

    // 権限別の集計
    const roleCounts = new Map<string, number>();
    for (const company of companiesMap.values()) {
      for (const facility of company.facilities.values()) {
        for (const user of facility.users) {
          const role = user.role;
          roleCounts.set(role, (roleCounts.get(role) || 0) + 1);
        }
      }
    }

    if (roleCounts.size > 0) {
      console.log(`\n  📊 権限別ユーザー数:`);
      for (const [role, count] of Array.from(roleCounts.entries()).sort()) {
        const roleDisplay = roleNames[role] || role;
        console.log(`     - ${roleDisplay} (${role}): ${count}名`);
      }
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log('✅ 本番環境ユーザー情報の確認完了');
    console.log(`${'='.repeat(80)}\n`);

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

main().catch(console.error);

