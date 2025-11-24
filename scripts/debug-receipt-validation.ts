/**
 * レセプト検証のデバッグスクリプト
 * 
 * 使用方法:
 *   DATABASE_URL=your_db_url tsx scripts/debug-receipt-validation.ts [receipt_id]
 */

import { db } from '../server/db'
import { insuranceCards, monthlyReceipts, patients } from '@shared/schema'
import { eq, and, desc } from 'drizzle-orm'

async function debugReceiptValidation(receiptId: string) {
  console.log('=== レセプト検証デバッグ ===\n')

  try {
    // レセプト情報を取得
    const receipt = await db.query.monthlyReceipts.findFirst({
      where: eq(monthlyReceipts.id, receiptId),
    })

    if (!receipt) {
      console.log('レセプトが見つかりませんでした')
      return
    }

    console.log(`レセプトID: ${receipt.id}`)
    console.log(`患者ID: ${receipt.patientId}`)
    console.log(`施設ID: ${receipt.facilityId}`)
    console.log(`保険種別: ${receipt.insuranceType}`)
    console.log(`対象年月: ${receipt.targetYear}年${receipt.targetMonth}月\n`)

    // 患者情報を取得
    const patient = await db.query.patients.findFirst({
      where: eq(patients.id, receipt.patientId),
    })

    if (patient) {
      console.log(`患者名: ${patient.lastName} ${patient.firstName}`)
      console.log(`生年月日: ${patient.dateOfBirth || '未設定'}\n`)
    }

    // レセプト詳細APIと同じ条件で保険証を取得
    const insuranceCardData = await db.query.insuranceCards.findMany({
      where: and(
        eq(insuranceCards.patientId, receipt.patientId),
        eq(insuranceCards.facilityId, receipt.facilityId),
        eq(insuranceCards.isActive, true),
        eq(insuranceCards.cardType, receipt.insuranceType === 'medical' ? 'medical' : 'long_term_care')
      ),
      orderBy: desc(insuranceCards.validFrom),
    })

    console.log(`\n=== レセプト詳細APIが返す保険証 ===`)
    if (insuranceCardData.length > 0) {
      const card = insuranceCardData[0]
      console.log(`保険証ID: ${card.id}`)
      console.log(`カード種別: ${card.cardType}`)
      console.log(`年齢区分: ${card.ageCategory || 'null'}`)
      console.log(`本人家族区分: ${card.relationshipType || 'null'}`)
      console.log(`有効期限: ${card.validFrom} ～ ${card.validUntil || '無期限'}`)
      console.log(`isActive: ${card.isActive}`)
      console.log(`facilityId: ${card.facilityId}`)
    } else {
      console.log('保険証が見つかりませんでした')
    }

    // 検証APIが参照する保険証を確認（validateInsuranceCardと同じロジック）
    console.log(`\n=== 検証APIが参照する保険証（validateInsuranceCardと同じロジック） ===`)
    const cardType = receipt.insuranceType === 'medical' ? 'medical' : 'long_term_care'
    const validationCardData2 = await db.query.insuranceCards.findMany({
      where: and(
        eq(insuranceCards.patientId, receipt.patientId),
        eq(insuranceCards.isActive, true),
        eq(insuranceCards.facilityId, receipt.facilityId),
        eq(insuranceCards.cardType, cardType)
      ),
      orderBy: desc(insuranceCards.validFrom),
    })

    if (validationCardData2.length > 0) {
      const card = validationCardData2[0]
      console.log(`保険証ID: ${card.id}`)
      console.log(`カード種別: ${card.cardType}`)
      console.log(`年齢区分: ${card.ageCategory || 'null'}`)
      console.log(`本人家族区分: ${card.relationshipType || 'null'}`)
      console.log(`有効期限: ${card.validFrom} ～ ${card.validUntil || '無期限'}`)
      console.log(`isActive: ${card.isActive}`)
      console.log(`facilityId: ${card.facilityId}`)
      
      // 年齢区分のチェック
      if (!card.ageCategory) {
        console.log(`\n⚠️  警告: この保険証の年齢区分が未設定です`)
      } else {
        console.log(`\n✅ 年齢区分は設定されています: ${card.ageCategory}`)
      }
    } else {
      console.log('保険証が見つかりませんでした')
    }


    // レセプトに保存されている警告メッセージを確認
    console.log(`\n=== レセプトに保存されている警告メッセージ ===`)
    if (receipt.warningMessages && receipt.warningMessages.length > 0) {
      receipt.warningMessages.forEach((msg, index) => {
        console.log(`警告${index + 1}: ${msg}`)
      })
    } else {
      console.log('警告メッセージなし')
    }

  } catch (error) {
    console.error('エラーが発生しました:', error)
    process.exit(1)
  }
}

// コマンドライン引数からレセプトIDを取得
const receiptId = process.argv[2]

if (!receiptId) {
  console.error('使用方法: tsx scripts/debug-receipt-validation.ts [receipt_id]')
  process.exit(1)
}

debugReceiptValidation(receiptId)
  .then(() => {
    console.log('\n=== デバッグ完了 ===')
    process.exit(0)
  })
  .catch((error) => {
    console.error('エラー:', error)
    process.exit(1)
  })

