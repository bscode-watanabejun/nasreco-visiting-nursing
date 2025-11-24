/**
 * 特別管理加算の加算マスタから不要な条件を削除するスクリプト
 * 
 * 使用方法:
 *   DATABASE_URL=your_db_url tsx scripts/fix-special-management-bonus-conditions.ts [facility_id]
 * 
 * 修正内容:
 *   - special_management_1とspecial_management_2のpredefinedConditionsから
 *     nurse_has_specialist_qualification条件を削除
 *   - patient_has_special_management条件のみを残す
 */

import { db } from '../server/db'
import { bonusMaster } from '@shared/schema'
import { eq, or } from 'drizzle-orm'

async function fixSpecialManagementBonusConditions(facilityId?: string) {
  console.log('=== 特別管理加算の加算マスタ条件修正 ===\n')

  try {
    // 特別管理加算のマスタを取得
    const specialManagementBonuses = await db.query.bonusMaster.findMany({
      where: or(
        eq(bonusMaster.bonusCode, 'special_management_1'),
        eq(bonusMaster.bonusCode, 'special_management_2')
      ),
    })

    if (specialManagementBonuses.length === 0) {
      console.log('❌ 特別管理加算のマスタが見つかりませんでした')
      console.log('   加算コード: special_management_1 または special_management_2 が存在しません')
      return
    }

    console.log(`✅ 特別管理加算のマスタが見つかりました: ${specialManagementBonuses.length}件\n`)

    for (const bonus of specialManagementBonuses) {
      console.log(`\n加算コード: ${bonus.bonusCode}`)
      console.log(`加算名: ${bonus.bonusName}`)
      
      const conditions = bonus.predefinedConditions as any
      
      if (!conditions || !Array.isArray(conditions) || conditions.length === 0) {
        console.log('  ⚠️  適用条件が設定されていません')
        continue
      }

      // nurse_has_specialist_qualification条件を削除
      const filteredConditions = conditions.filter((cond: any) => {
        const pattern = cond.pattern || cond.type
        return pattern !== 'nurse_has_specialist_qualification'
      })

      // 変更があるかチェック
      if (filteredConditions.length === conditions.length) {
        console.log('  ✅ nurse_has_specialist_qualification条件は存在しません（修正不要）')
        continue
      }

      // patient_has_special_management条件が残っているか確認
      const hasPatientCondition = filteredConditions.some((cond: any) => {
        const pattern = cond.pattern || cond.type
        return pattern === 'patient_has_special_management'
      })

      if (!hasPatientCondition) {
        // patient_has_special_management条件がない場合は追加
        filteredConditions.push({
          pattern: 'patient_has_special_management',
          operator: 'equals',
          value: true
        })
        console.log('  📝 patient_has_special_management条件を追加しました')
      }

      // データベースを更新
      await db
        .update(bonusMaster)
        .set({
          predefinedConditions: filteredConditions,
          updatedAt: new Date(),
        })
        .where(eq(bonusMaster.id, bonus.id))

      console.log('  ✅ 修正完了')
      console.log('  修正前の条件数:', conditions.length)
      console.log('  修正後の条件数:', filteredConditions.length)
      console.log('  修正後の条件:')
      filteredConditions.forEach((cond: any, index: number) => {
        console.log(`    [${index + 1}] ${JSON.stringify(cond)}`)
      })
    }

    console.log('\n✅ すべての修正が完了しました！')

  } catch (error) {
    console.error('❌ エラーが発生しました:', error)
    process.exit(1)
  }
}

// コマンドライン引数から施設IDを取得（現在は使用していないが、将来の拡張用）
const facilityId = process.argv[2]

fixSpecialManagementBonusConditions(facilityId)
  .then(() => {
    console.log('\n=== スクリプト実行完了 ===')
    process.exit(0)
  })
  .catch((error) => {
    console.error('エラー:', error)
    process.exit(1)
  })

