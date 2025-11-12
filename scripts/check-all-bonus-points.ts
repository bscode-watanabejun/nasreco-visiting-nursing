/**
 * 全ての加算マスタの点数と対応するサービスコードの点数を確認するスクリプト
 */

import { db } from '../server/db';
import { bonusMaster, nursingServiceCodes } from '../shared/schema';
import { eq, and, or, like } from 'drizzle-orm';

async function checkAllBonusPoints() {
  console.log('🔍 全ての加算マスタの点数を確認中...\n');

  try {
    // 全てのアクティブな加算マスタを取得
    const bonuses = await db.query.bonusMaster.findMany({
      where: eq(bonusMaster.isActive, true),
      orderBy: [bonusMaster.insuranceType, bonusMaster.bonusCode],
    });

    console.log(`📊 アクティブな加算マスタ: ${bonuses.length}件\n`);

    const issues: Array<{
      bonusCode: string;
      bonusName: string;
      fixedPoints: number | null;
      serviceCodes: Array<{ code: string; name: string; points: number }>;
    }> = [];

    for (const bonus of bonuses) {
      if (bonus.pointsType !== 'fixed' || !bonus.fixedPoints) {
        continue; // 固定点数でない場合はスキップ
      }

      // 対応するサービスコードを検索（加算コードから推測）
      let serviceCodePatterns: string[] = [];
      
      if (bonus.bonusCode === 'medical_emergency_visit') {
        serviceCodePatterns = ['510002', '510004'];
      } else if (bonus.bonusCode === 'medical_night_early_morning' || bonus.bonusCode === 'medical_late_night') {
        serviceCodePatterns = ['510003', '510004'];
      } else if (bonus.bonusCode.startsWith('discharge_support_guidance')) {
        serviceCodePatterns = ['550001'];
      } else if (bonus.bonusCode.startsWith('24h_response_system')) {
        serviceCodePatterns = ['550000', '550002'];
      } else if (bonus.bonusCode.startsWith('terminal_care')) {
        serviceCodePatterns = ['580000'];
      } else if (bonus.bonusCode.startsWith('special_management')) {
        serviceCodePatterns = ['550000'];
      } else if (bonus.bonusCode === 'specialist_management') {
        serviceCodePatterns = ['550001'];
      } else if (bonus.bonusCode === 'medical_long_visit') {
        serviceCodePatterns = ['510002', '510004'];
      } else {
        // その他の加算は全てのサービスコードを確認
        serviceCodePatterns = [];
      }

      // サービスコードを検索
      const conditions: any[] = [
        eq(nursingServiceCodes.insuranceType, bonus.insuranceType),
        eq(nursingServiceCodes.isActive, true),
      ];

      if (serviceCodePatterns.length > 0) {
        const patternConditions = serviceCodePatterns.map(pattern => 
          like(nursingServiceCodes.serviceCode, `${pattern}%`)
        );
        conditions.push(or(...patternConditions));
      }

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

        // 加算マスタの点数がサービスコードの点数と一致しない場合
        if (bonus.fixedPoints !== minPoints && bonus.fixedPoints !== maxPoints) {
          issues.push({
            bonusCode: bonus.bonusCode,
            bonusName: bonus.bonusName,
            fixedPoints: bonus.fixedPoints,
            serviceCodes: filteredServiceCodes.map(sc => ({
              code: sc.serviceCode,
              name: sc.serviceName,
              points: sc.points,
            })),
          });
        }
      }
    }

    if (issues.length === 0) {
      console.log('✅ 全ての加算マスタの点数はサービスコードの点数と一致しています\n');
    } else {
      console.log(`⚠️  点数が一致しない加算マスタ: ${issues.length}件\n`);
      
      for (const issue of issues) {
        console.log(`📋 ${issue.bonusCode} - ${issue.bonusName}`);
        console.log(`   加算マスタの点数: ${issue.fixedPoints?.toLocaleString() || 'なし'}点`);
        console.log(`   対応するサービスコード:`);
        issue.serviceCodes.forEach(sc => {
          console.log(`     - ${sc.code}: ${sc.name} (${sc.points.toLocaleString()}点)`);
        });
        console.log('');
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

checkAllBonusPoints();
