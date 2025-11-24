/**
 * 保険証の年齢区分を確認するスクリプト
 * 
 * 使用方法:
 *   DATABASE_URL=your_db_url tsx scripts/check-insurance-card-age-category.ts [patient_name]
 */

import { db } from '../server/db'
import { insuranceCards, patients, monthlyReceipts } from '@shared/schema'
import { eq, and, like, desc } from 'drizzle-orm'

async function checkInsuranceCardAgeCategory(patientName?: string) {
  console.log('=== 保険証の年齢区分確認 ===\n')

  try {
    // 患者を検索
    let patientQuery = db.query.patients.findMany({
      where: patientName 
        ? like(patients.lastName, `%${patientName}%`)
        : undefined,
      orderBy: [patients.lastName, patients.firstName],
    })

    const patientsList = await patientQuery

    if (patientsList.length === 0) {
      console.log('患者が見つかりませんでした')
      return
    }

    for (const patient of patientsList) {
      console.log(`\n患者: ${patient.lastName} ${patient.firstName} (ID: ${patient.id})`)
      console.log(`生年月日: ${patient.dateOfBirth || '未設定'}`)

      // 医療保険証を取得
      const medicalCards = await db.query.insuranceCards.findMany({
        where: and(
          eq(insuranceCards.patientId, patient.id),
          eq(insuranceCards.cardType, 'medical'),
          eq(insuranceCards.isActive, true)
        ),
        orderBy: desc(insuranceCards.validFrom),
      })

      // 介護保険証を取得
      const careCards = await db.query.insuranceCards.findMany({
        where: and(
          eq(insuranceCards.patientId, patient.id),
          eq(insuranceCards.cardType, 'long_term_care'),
          eq(insuranceCards.isActive, true)
        ),
        orderBy: desc(insuranceCards.validFrom),
      })

      console.log(`\n医療保険証: ${medicalCards.length}件`)
      for (const card of medicalCards) {
        console.log(`  ID: ${card.id}`)
        console.log(`  有効期限: ${card.validFrom} ～ ${card.validUntil || '無期限'}`)
        console.log(`  年齢区分: ${card.ageCategory || '未設定'}`)
        console.log(`  本人家族区分: ${card.relationshipType || '未設定'}`)
        console.log(`  isActive: ${card.isActive}`)
        console.log(`  facilityId: ${card.facilityId}`)
      }

      console.log(`\n介護保険証: ${careCards.length}件`)
      for (const card of careCards) {
        console.log(`  ID: ${card.id}`)
        console.log(`  有効期限: ${card.validFrom} ～ ${card.validUntil || '無期限'}`)
        console.log(`  年齢区分: ${card.ageCategory || '未設定'}`)
        console.log(`  isActive: ${card.isActive}`)
        console.log(`  facilityId: ${card.facilityId}`)
      }

      // 2025年11月のレセプトを確認
      const receipts = await db.query.monthlyReceipts.findMany({
        where: and(
          eq(monthlyReceipts.patientId, patient.id),
          eq(monthlyReceipts.targetYear, 2025),
          eq(monthlyReceipts.targetMonth, 11)
        ),
      })

      if (receipts.length > 0) {
        console.log(`\n2025年11月のレセプト: ${receipts.length}件`)
        for (const receipt of receipts) {
          console.log(`  レセプトID: ${receipt.id}`)
          console.log(`  保険種別: ${receipt.insuranceType}`)
          console.log(`  警告メッセージ: ${receipt.warningMessages?.join(', ') || 'なし'}`)
          console.log(`  エラーメッセージ: ${receipt.errorMessages?.join(', ') || 'なし'}`)
        }
      }
    }

  } catch (error) {
    console.error('エラーが発生しました:', error)
    process.exit(1)
  }
}

// コマンドライン引数から患者名を取得
const patientName = process.argv[2]

checkInsuranceCardAgeCategory(patientName)
  .then(() => {
    console.log('\n=== 確認完了 ===')
    process.exit(0)
  })
  .catch((error) => {
    console.error('エラー:', error)
    process.exit(1)
  })

