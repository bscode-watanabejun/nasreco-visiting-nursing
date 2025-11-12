/**
 * terminal_care関連のサービスコードを確認するスクリプト
 */

import { db } from '../server/db';
import { bonusMaster, nursingServiceCodes } from '../shared/schema';
import { eq, and, like, or } from 'drizzle-orm';

async function checkTerminalCareServiceCodes() {
  console.log('🔍 terminal_care関連のサービスコードを確認中...\n');

  try {
    // terminal_care_1とterminal_care_2の加算マスタを取得
    const terminalCare1 = await db.query.bonusMaster.findFirst({
      where: eq(bonusMaster.bonusCode, 'terminal_care_1'),
    });
    const terminalCare2 = await db.query.bonusMaster.findFirst({
      where: eq(bonusMaster.bonusCode, 'terminal_care_2'),
    });

    if (terminalCare1) {
      console.log(`📋 ${terminalCare1.bonusCode} - ${terminalCare1.bonusName}`);
      console.log(`   加算マスタの点数: ${terminalCare1.fixedPoints?.toLocaleString()}点\n`);

      // 580000で始まるサービスコードを検索
      const serviceCodes = await db.query.nursingServiceCodes.findMany({
        where: and(
          eq(nursingServiceCodes.insuranceType, 'medical'),
          eq(nursingServiceCodes.isActive, true),
          like(nursingServiceCodes.serviceCode, '580000%')
        ),
      });

      console.log(`   対応するサービスコード:`);
      serviceCodes.forEach(sc => {
        console.log(`     - ${sc.serviceCode}: ${sc.serviceName} (${sc.points.toLocaleString()}点)`);
      });
      console.log('');
    }

    if (terminalCare2) {
      console.log(`📋 ${terminalCare2.bonusCode} - ${terminalCare2.bonusName}`);
      console.log(`   加算マスタの点数: ${terminalCare2.fixedPoints?.toLocaleString()}点\n`);

      // 580000で始まるサービスコードを検索
      const serviceCodes = await db.query.nursingServiceCodes.findMany({
        where: and(
          eq(nursingServiceCodes.insuranceType, 'medical'),
          eq(nursingServiceCodes.isActive, true),
          like(nursingServiceCodes.serviceCode, '580000%')
        ),
      });

      console.log(`   対応するサービスコード:`);
      serviceCodes.forEach(sc => {
        console.log(`     - ${sc.serviceCode}: ${sc.serviceName} (${sc.points.toLocaleString()}点)`);
      });
      console.log('');
    }

    // 介護保険のterminal_careも確認
    const careTerminalCare = await db.query.bonusMaster.findFirst({
      where: eq(bonusMaster.bonusCode, 'care_terminal_care'),
    });

    if (careTerminalCare) {
      console.log(`📋 ${careTerminalCare.bonusCode} - ${careTerminalCare.bonusName}`);
      console.log(`   加算マスタの点数: ${careTerminalCare.fixedPoints?.toLocaleString()}点\n`);

      // 580000で始まるサービスコードを検索（介護保険）
      const serviceCodes = await db.query.nursingServiceCodes.findMany({
        where: and(
          eq(nursingServiceCodes.insuranceType, 'care'),
          eq(nursingServiceCodes.isActive, true),
          like(nursingServiceCodes.serviceCode, '580000%')
        ),
      });

      console.log(`   対応するサービスコード:`);
      serviceCodes.forEach(sc => {
        console.log(`     - ${sc.serviceCode}: ${sc.serviceName} (${sc.points.toLocaleString()}点)`);
      });
      console.log('');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

checkTerminalCareServiceCodes();
