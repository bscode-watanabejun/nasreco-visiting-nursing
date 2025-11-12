/**
 * 全ての加算マスタの名前と点数を一覧表示するスクリプト
 */

import { db } from '../server/db';
import { bonusMaster } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function listAllBonusMasterPoints() {
  console.log('🔍 全ての加算マスタの名前と点数を一覧表示中...\n');

  try {
    // 全ての加算マスタを取得（アクティブ/非アクティブ両方）
    const bonuses = await db.query.bonusMaster.findMany({
      orderBy: [bonusMaster.insuranceType, bonusMaster.bonusCode],
    });

    console.log(`📊 加算マスタ総数: ${bonuses.length}件\n`);

    // 保険種別ごとにグループ化
    const medicalBonuses = bonuses.filter(b => b.insuranceType === 'medical');
    const careBonuses = bonuses.filter(b => b.insuranceType === 'care');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 医療保険の加算マスタ');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    for (const bonus of medicalBonuses) {
      const pointsType = bonus.pointsType === 'fixed' ? '固定' : '条件分岐';
      const points = bonus.pointsType === 'fixed' 
        ? (bonus.fixedPoints ? `${bonus.fixedPoints.toLocaleString()}点` : 'なし')
        : (bonus.pointsConfig ? '条件により変動' : 'なし');
      const status = bonus.isActive ? '✅ 有効' : '❌ 無効';
      
      console.log(`${status} | ${bonus.bonusCode.padEnd(40)} | ${bonus.bonusName.padEnd(50)} | ${pointsType.padEnd(6)} | ${points}`);
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 介護保険の加算マスタ');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    for (const bonus of careBonuses) {
      const pointsType = bonus.pointsType === 'fixed' ? '固定' : '条件分岐';
      const points = bonus.pointsType === 'fixed' 
        ? (bonus.fixedPoints ? `${bonus.fixedPoints.toLocaleString()}点` : 'なし')
        : (bonus.pointsConfig ? '条件により変動' : 'なし');
      const status = bonus.isActive ? '✅ 有効' : '❌ 無効';
      
      console.log(`${status} | ${bonus.bonusCode.padEnd(40)} | ${bonus.bonusName.padEnd(50)} | ${pointsType.padEnd(6)} | ${points}`);
    }

    // 固定点数が0またはnullのものを確認
    const zeroOrNullPoints = bonuses.filter(b => 
      b.pointsType === 'fixed' && (!b.fixedPoints || b.fixedPoints === 0)
    );

    if (zeroOrNullPoints.length > 0) {
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('⚠️  固定点数が0またはnullの加算マスタ');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      
      for (const bonus of zeroOrNullPoints) {
        const status = bonus.isActive ? '✅ 有効' : '❌ 無効';
        console.log(`${status} | ${bonus.bonusCode.padEnd(40)} | ${bonus.bonusName.padEnd(50)} | 固定点数: ${bonus.fixedPoints || 'null'}`);
      }
    }

    // 大きな点数（1000点以上）を確認
    const largePoints = bonuses.filter(b => 
      b.pointsType === 'fixed' && b.fixedPoints && b.fixedPoints >= 1000
    );

    if (largePoints.length > 0) {
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('⚠️  固定点数が1000点以上の加算マスタ（金額の可能性あり）');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      
      for (const bonus of largePoints) {
        const status = bonus.isActive ? '✅ 有効' : '❌ 無効';
        console.log(`${status} | ${bonus.bonusCode.padEnd(40)} | ${bonus.bonusName.padEnd(50)} | ${bonus.fixedPoints?.toLocaleString()}点`);
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

listAllBonusMasterPoints();
