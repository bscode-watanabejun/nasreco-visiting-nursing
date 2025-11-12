/**
 * 医療保険の夜間・早朝加算マスタの事前定義条件を修正するスクリプト
 */

import { db } from '../server/db';
import { bonusMaster } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function fixMedicalNightBonusConditions() {
  console.log('🔧 医療保険の夜間・早朝加算マスタの事前定義条件を修正中...\n');

  try {
    // medical_night_early_morningの事前定義条件を修正
    // time_basedパターンを使用（conditionalPatternで評価される）
    // 事前定義条件は訪問開始時刻が設定されていることを確認するだけ
    await db
      .update(bonusMaster)
      .set({
        predefinedConditions: [
          {
            pattern: "time_based",
            description: "訪問時刻が夜間（18:00-22:00）または早朝（6:00-8:00）"
          }
        ],
      })
      .where(eq(bonusMaster.bonusCode, "medical_night_early_morning"));

    console.log('✅ medical_night_early_morningの事前定義条件を修正しました\n');

    // medical_late_nightの事前定義条件を修正
    // 介護保険用の条件（care_late_night_time）を医療保険用（medical_late_night_time）に変更
    await db
      .update(bonusMaster)
      .set({
        predefinedConditions: [
          {
            pattern: "medical_late_night_time",
            operator: "equals",
            value: true,
            description: "訪問時刻が深夜（22:00-6:00）"
          }
        ],
      })
      .where(eq(bonusMaster.bonusCode, "medical_late_night"));

    console.log('✅ medical_late_nightの事前定義条件を修正しました\n');

    // 確認
    const bonuses = await db.query.bonusMaster.findMany({
      where: eq(bonusMaster.bonusCode, "medical_night_early_morning"),
    });

    if (bonuses.length > 0) {
      console.log('📋 修正後の加算マスタ:');
      for (const bonus of bonuses) {
        console.log(`   ${bonus.bonusCode}: ${bonus.bonusName}`);
        console.log(`   事前定義条件: ${JSON.stringify(bonus.predefinedConditions, null, 2)}`);
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

fixMedicalNightBonusConditions();

