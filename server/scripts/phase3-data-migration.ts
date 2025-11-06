/**
 * Phase 3.2: データ移行スクリプト
 *
 * 既存の insurance_cards レコードに対して、患者の年齢と保険種別に基づいて
 * 適切なデフォルト値を設定します。
 *
 * 実行方法:
 * npx tsx server/scripts/phase3-data-migration.ts
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';

interface PatientWithInsurance {
  patientId: string;
  dateOfBirth: Date;
  insuranceCardId: string;
  insuranceType: string;
}

/**
 * 生年月日から年齢を計算
 */
function calculateAge(dateOfBirth: Date): number {
  const today = new Date();
  let age = today.getFullYear() - dateOfBirth.getFullYear();
  const monthDiff = today.getMonth() - dateOfBirth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dateOfBirth.getDate())) {
    age--;
  }

  return age;
}

/**
 * 年齢と保険種別に基づいて適切なデフォルト値を決定
 */
function determineDefaultValues(age: number, insuranceType: string) {
  // 年齢区分を判定
  let ageCategory: 'preschool' | 'general' | 'elderly';
  if (age < 6) {
    ageCategory = 'preschool';
  } else if (age >= 75) {
    ageCategory = 'elderly';
  } else {
    ageCategory = 'general';
  }

  // 本人家族区分を判定（デフォルトは本人）
  // 実際の運用では未就学者は「未就学者」、それ以外は「本人」が基本
  let relationshipType: 'self' | 'preschool' | 'family' | 'elderly_general' | 'elderly_70';
  if (age < 6) {
    relationshipType = 'preschool';
  } else if (age >= 75) {
    // 後期高齢者の場合、デフォルトは一般（3割負担）
    relationshipType = 'elderly_general';
  } else {
    relationshipType = 'self';
  }

  // 高齢受給者区分（70-74歳の場合のみ）
  let elderlyRecipientCategory: 'general_low' | 'seventy' | null = null;
  if (age >= 70 && age < 75) {
    // 70-74歳の高齢受給者: デフォルトは一般（2割負担）
    elderlyRecipientCategory = 'general_low';
  }

  return {
    relationshipType,
    ageCategory,
    elderlyRecipientCategory,
  };
}

/**
 * メイン処理
 */
async function migrate() {
  console.log('=== Phase 3.2: データ移行開始 ===\n');

  try {
    // 1. NULL値を持つ insurance_cards レコードを取得（生SQLを使用）
    const result = await db.execute<{
      insurance_card_id: string;
      patient_id: string;
      insurance_type: string;
      date_of_birth: Date;
    }>(sql`
      SELECT
        ic.id as insurance_card_id,
        ic.patient_id,
        p.insurance_type,
        p.date_of_birth
      FROM insurance_cards ic
      JOIN patients p ON ic.patient_id = p.id
      WHERE ic.relationship_type IS NULL
         OR ic.age_category IS NULL
    `);

    const cardsToMigrate = result.rows;
    console.log(`移行対象の保険証: ${cardsToMigrate.length} 件\n`);

    if (cardsToMigrate.length === 0) {
      console.log('移行が必要なレコードはありません。');
      return;
    }

    // 2. 各保険証について患者情報を取得し、デフォルト値を設定
    let successCount = 0;
    let errorCount = 0;

    for (const card of cardsToMigrate) {
      try {
        if (!card.date_of_birth) {
          console.warn(`⚠️  保険証 ${card.insurance_card_id}: 生年月日が見つかりません`);
          errorCount++;
          continue;
        }

        // 年齢を計算
        const age = calculateAge(new Date(card.date_of_birth));

        // デフォルト値を決定
        const defaults = determineDefaultValues(age, card.insurance_type);

        // データベースを更新（生SQLを使用）
        await db.execute(sql`
          UPDATE insurance_cards
          SET
            relationship_type = ${defaults.relationshipType},
            age_category = ${defaults.ageCategory},
            elderly_recipient_category = ${defaults.elderlyRecipientCategory}
          WHERE id = ${card.insurance_card_id}
        `);

        console.log(
          `✓ 保険証 ${card.insurance_card_id}: ` +
          `年齢=${age}歳, ` +
          `本人家族区分=${defaults.relationshipType}, ` +
          `年齢区分=${defaults.ageCategory}` +
          (defaults.elderlyRecipientCategory ? `, 高齢受給者区分=${defaults.elderlyRecipientCategory}` : '')
        );

        successCount++;
      } catch (error) {
        console.error(`✗ 保険証 ${card.insurance_card_id} の更新中にエラー:`, error);
        errorCount++;
      }
    }

    console.log(`\n=== 移行完了 ===`);
    console.log(`成功: ${successCount} 件`);
    console.log(`失敗: ${errorCount} 件`);

    // 3. 移行結果を検証（生SQLを使用）
    console.log(`\n=== 移行結果の検証 ===`);
    const validationResult = await db.execute<{ count: number }>(sql`
      SELECT COUNT(*) as count
      FROM insurance_cards
      WHERE relationship_type IS NULL
         OR age_category IS NULL
    `);

    const nullCount = Number(validationResult.rows[0]?.count || 0);

    if (nullCount === 0) {
      console.log('✓ すべての保険証に適切な値が設定されました');
    } else {
      console.warn(`⚠️  まだ ${nullCount} 件の保険証にNULL値があります`);
    }

  } catch (error) {
    console.error('移行処理中に致命的エラーが発生しました:', error);
    process.exit(1);
  }
}

// スクリプト実行
migrate()
  .then(() => {
    console.log('\n移行スクリプトが正常に完了しました。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n移行スクリプトが失敗しました:', error);
    process.exit(1);
  });
