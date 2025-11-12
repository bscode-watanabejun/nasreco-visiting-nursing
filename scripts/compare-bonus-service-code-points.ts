/**
 * 加算マスタの点数と対応するサービスコードの点数を比較するスクリプト
 */

import { db } from '../server/db';
import { bonusMaster, nursingServiceCodes } from '../shared/schema';
import { eq, and, or, like } from 'drizzle-orm';

async function compareBonusServiceCodePoints() {
  console.log('🔍 加算マスタの点数と対応するサービスコードの点数を比較中...\n');

  try {
    // 固定点数の加算マスタのみを取得
    const bonuses = await db.query.bonusMaster.findMany({
      where: and(
        eq(bonusMaster.pointsType, 'fixed'),
        eq(bonusMaster.isActive, true)
      ),
      orderBy: [bonusMaster.insuranceType, bonusMaster.bonusCode],
    });

    console.log(`📊 固定点数のアクティブな加算マスタ: ${bonuses.length}件\n`);

    for (const bonus of bonuses) {
      if (!bonus.fixedPoints) continue;

      // 対応するサービスコードを検索
      let serviceCodePatterns: string[] = [];
      
      if (bonus.bonusCode === 'medical_emergency_visit') {
        serviceCodePatterns = ['510002470', '510004570'];
      } else if (bonus.bonusCode === 'medical_night_early_morning') {
        serviceCodePatterns = ['510003970'];
      } else if (bonus.bonusCode === 'medical_late_night') {
        serviceCodePatterns = ['510004070'];
      } else if (bonus.bonusCode.startsWith('discharge_support_guidance')) {
        if (bonus.bonusCode === 'discharge_support_guidance_basic') {
          serviceCodePatterns = ['550001170'];
        } else if (bonus.bonusCode === 'discharge_support_guidance_long') {
          serviceCodePatterns = ['550001270'];
        }
      } else if (bonus.bonusCode === 'discharge_special_management_guidance') {
        serviceCodePatterns = ['550001070'];
      } else if (bonus.bonusCode === '24h_response_system_basic') {
        serviceCodePatterns = ['550000670'];
      } else if (bonus.bonusCode === '24h_response_system_enhanced') {
        serviceCodePatterns = ['550002170'];
      } else if (bonus.bonusCode.startsWith('terminal_care')) {
        if (bonus.bonusCode === 'terminal_care_1') {
          serviceCodePatterns = ['580000170'];
        } else if (bonus.bonusCode === 'terminal_care_2') {
          serviceCodePatterns = ['580000270'];
        }
      } else if (bonus.bonusCode === 'special_management_1') {
        serviceCodePatterns = ['550000870'];
      } else if (bonus.bonusCode === 'special_management_2') {
        serviceCodePatterns = ['550000770'];
      } else if (bonus.bonusCode === 'specialist_management') {
        serviceCodePatterns = ['550001'];
      } else if (bonus.bonusCode === 'medical_discharge_joint_guidance') {
        serviceCodePatterns = ['550000970'];
      } else if (bonus.bonusCode === 'care_terminal_care') {
        serviceCodePatterns = ['580000'];
      } else if (bonus.bonusCode === 'care_special_management_1') {
        serviceCodePatterns = ['550000870'];
      } else if (bonus.bonusCode === 'care_special_management_2') {
        serviceCodePatterns = ['550000770'];
      } else if (bonus.bonusCode === 'care_specialist_management') {
        serviceCodePatterns = ['550001'];
      } else if (bonus.bonusCode === 'care_discharge_joint_guidance') {
        serviceCodePatterns = ['550000970'];
      } else if (bonus.bonusCode === 'care_emergency_system' || bonus.bonusCode === 'care_emergency_system_2') {
        serviceCodePatterns = ['510002', '510004'];
      } else if (bonus.bonusCode === 'care_initial_visit_1') {
        serviceCodePatterns = ['510001'];
      } else if (bonus.bonusCode === 'care_initial_visit_2') {
        serviceCodePatterns = ['510001'];
      } else if (bonus.bonusCode === 'care_late_night') {
        serviceCodePatterns = ['510004'];
      } else if (bonus.bonusCode === 'care_long_visit') {
        serviceCodePatterns = ['510002', '510004'];
      }

      if (serviceCodePatterns.length === 0) {
        continue; // パターンが特定できない場合はスキップ
      }

      // サービスコードを検索
      const conditions: any[] = [
        eq(nursingServiceCodes.insuranceType, bonus.insuranceType),
        eq(nursingServiceCodes.isActive, true),
      ];

      const patternConditions = serviceCodePatterns.map(pattern => 
        like(nursingServiceCodes.serviceCode, `${pattern}%`)
      );
      conditions.push(or(...patternConditions));

      const serviceCodes = await db.query.nursingServiceCodes.findMany({
        where: and(...conditions),
      });

      // 基本療養費を除外
      const filteredServiceCodes = serviceCodes.filter(sc => 
        !sc.serviceName.includes('基本療養費')
      );

      if (filteredServiceCodes.length > 0) {
        const serviceCodePoints = filteredServiceCodes.map(sc => sc.points);
        const minPoints = Math.min(...serviceCodePoints);
        const maxPoints = Math.max(...serviceCodePoints);
        const uniquePoints = [...new Set(serviceCodePoints)].sort((a, b) => a - b);

        // 加算マスタの点数とサービスコードの点数を比較
        const match = uniquePoints.includes(bonus.fixedPoints);
        const ratio = bonus.fixedPoints / minPoints;

        console.log(`📋 ${bonus.bonusCode} - ${bonus.bonusName}`);
        console.log(`   加算マスタの点数: ${bonus.fixedPoints.toLocaleString()}点`);
        console.log(`   対応するサービスコード:`);
        filteredServiceCodes.forEach(sc => {
          console.log(`     - ${sc.serviceCode}: ${sc.serviceName} (${sc.points.toLocaleString()}点)`);
        });
        
        if (!match) {
          if (ratio === 10) {
            console.log(`   ⚠️  加算マスタの点数がサービスコードの10倍（金額の可能性）`);
          } else if (ratio > 1) {
            console.log(`   ⚠️  加算マスタの点数がサービスコードの${ratio}倍`);
          } else {
            console.log(`   ⚠️  加算マスタの点数がサービスコードより小さい`);
          }
        } else {
          console.log(`   ✅ 加算マスタの点数とサービスコードの点数が一致`);
        }
        console.log('');
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

compareBonusServiceCodePoints();
