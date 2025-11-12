/**
 * ユーザーを管理者に変更するスクリプト
 */

import { db } from '../server/db';
import { users, facilities } from '../shared/schema';
import { eq, and } from 'drizzle-orm';

async function updateUserToAdmin() {
  console.log('🔍 ユーザーを管理者に変更中...\n');

  try {
    // テストクリニックの施設IDを取得
    const testClinic = await db.query.facilities.findFirst({
      where: eq(facilities.name, 'テストクリニック'),
    });

    if (!testClinic) {
      console.log('❌ テストクリニックが見つかりません');
      return;
    }

    console.log(`✅ テストクリニックのID: ${testClinic.id}\n`);

    // 鈴木 一郎を検索
    const targetUser = await db.query.users.findFirst({
      where: and(
        eq(users.facilityId, testClinic.id),
        eq(users.fullName, '鈴木 一郎')
      ),
    });

    if (!targetUser) {
      console.log('❌ 鈴木 一郎が見つかりません');
      console.log('\nテストクリニックのユーザー一覧:');
      const allUsers = await db.query.users.findMany({
        where: eq(users.facilityId, testClinic.id),
      });
      for (const user of allUsers) {
        console.log(`   - ${user.fullName} (${user.role})`);
      }
      return;
    }

    console.log(`📋 現在のユーザー情報:`);
    console.log(`   名前: ${targetUser.fullName}`);
    console.log(`   現在の役職: ${targetUser.role}`);
    console.log(`   ユーザーID: ${targetUser.id}\n`);

    // 管理者に変更
    await db.update(users)
      .set({ role: 'admin' })
      .where(eq(users.id, targetUser.id));

    console.log('✅ 鈴木 一郎を管理者に変更しました\n');

    // 確認
    const updatedUser = await db.query.users.findFirst({
      where: eq(users.id, targetUser.id),
    });

    if (updatedUser) {
      console.log(`📋 更新後のユーザー情報:`);
      console.log(`   名前: ${updatedUser.fullName}`);
      console.log(`   役職: ${updatedUser.role}`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

updateUserToAdmin();

