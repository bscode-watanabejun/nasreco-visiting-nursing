/**
 * 医療保険の夜間・早朝加算マスタ確認スクリプト
 */

import { db } from '../server/db';
import { bonusMaster } from '../shared/schema';
import { eq, or } from 'drizzle-orm';

async function checkMedicalNightBonus() {
  console.log('🔍 医療保険の夜間・早朝加算マスタを確認中...\n');

  try {
    // 医療保険の時間帯別加算を検索
    const bonuses = await db.query.bonusMaster.findMany({
      where: or(
        eq(bonusMaster.bonusCode, 'medical_night_early_morning'),
        eq(bonusMaster.bonusCode, 'medical_late_night'),
        eq(bonusMaster.bonusCode, 'medical_night_time'),
        eq(bonusMaster.bonusCode, 'medical_early_morning_time')
      ),
    });

    if (bonuses.length === 0) {
      console.log('❌ 医療保険の夜間・早朝加算マスタが見つかりません\n');
      console.log('医療保険の加算マスタ一覧（時間帯関連）:');
      const allMedicalBonuses = await db.query.bonusMaster.findMany({
        where: eq(bonusMaster.insuranceType, 'medical'),
      });
      const timeRelated = allMedicalBonuses.filter(b => 
        b.bonusCode.includes('night') || 
        b.bonusCode.includes('morning') || 
        b.bonusCode.includes('early') ||
        b.bonusCode.includes('late')
      );
      if (timeRelated.length > 0) {
        for (const bonus of timeRelated) {
          console.log(`   - ${bonus.bonusCode}: ${bonus.bonusName} (アクティブ: ${bonus.isActive})`);
        }
      } else {
        console.log('   時間帯関連の加算が見つかりません');
      }
    } else {
      console.log(`✅ ${bonuses.length}件の加算マスタが見つかりました:\n`);
      for (const bonus of bonuses) {
        console.log(`📋 ${bonus.bonusCode}`);
        console.log(`   加算名: ${bonus.bonusName}`);
        console.log(`   保険種別: ${bonus.insuranceType}`);
        console.log(`   点数タイプ: ${bonus.pointsType}`);
        console.log(`   固定点数: ${bonus.fixedPoints || 'なし'}`);
        console.log(`   条件パターン: ${bonus.conditionalPattern || 'なし'}`);
        console.log(`   点数設定: ${JSON.stringify(bonus.pointsConfig || {})}`);
        console.log(`   事前定義条件: ${JSON.stringify(bonus.predefinedConditions || [])}`);
        console.log(`   アクティブ: ${bonus.isActive}`);
        console.log('');
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

checkMedicalNightBonus();

