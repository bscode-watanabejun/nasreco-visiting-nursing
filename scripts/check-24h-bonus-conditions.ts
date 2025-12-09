/**
 * 24時間対応体制加算の加算マスタ設定を確認するスクリプト（読み取り専用）
 * 
 * ⚠️ 本番DBへの読み取り専用アクセスのみ。データの変更は一切行いません。
 * 
 * 実行方法:
 *   PRODUCTION_DB_URL="postgresql://..." npx tsx scripts/check-24h-bonus-conditions.ts
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from '../shared/schema';
import { bonusMaster } from '../shared/schema';
import { eq } from 'drizzle-orm';

neonConfig.webSocketConstructor = ws;

async function check24hBonusConditions() {
  // 本番DBの接続文字列（読み取り専用）
  const dbUrl = process.env.PRODUCTION_DB_URL || process.env.DATABASE_URL;
  
  if (!dbUrl) {
    console.error('❌ PRODUCTION_DB_URL または DATABASE_URL 環境変数が設定されていません');
    process.exit(1);
  }
  
  console.log('⚠️  データベースに接続します（読み取り専用）');
  console.log('   データの変更は一切行いません。\n');

  const pool = new Pool({ connectionString: dbUrl });
  const db = drizzle({ client: pool, schema });

  try {
    // 24時間対応体制加算の加算マスタを取得
    console.log('📋 24時間対応体制加算の加算マスタを確認中...\n');
    
    const bonusCodes = ['24h_response_system_basic', '24h_response_system_enhanced'];
    
    for (const bonusCode of bonusCodes) {
      const bonus = await db.query.bonusMaster.findFirst({
        where: eq(bonusMaster.bonusCode, bonusCode),
      });

      if (!bonus) {
        console.log(`❌ ${bonusCode} が見つかりません\n`);
        continue;
      }

      console.log('='.repeat(80));
      console.log(`【${bonus.bonusCode}】${bonus.bonusName}`);
      console.log('='.repeat(80));
      console.log(`施設ID: ${bonus.facilityId || 'グローバル（全施設共通）'}`);
      console.log(`有効期間: ${bonus.validFrom} ～ ${bonus.validTo || '無期限'}`);
      console.log(`点数タイプ: ${bonus.pointsType}`);
      console.log(`固定点数: ${bonus.fixedPoints || 'N/A'}`);
      console.log(`アクティブ: ${bonus.isActive}`);
      console.log('');
      
      // 事前定義条件の詳細を確認
      console.log('【事前定義条件（predefinedConditions）】');
      if (bonus.predefinedConditions) {
        const conditions = bonus.predefinedConditions;
        console.log(JSON.stringify(conditions, null, 2));
        
        // monthly_visit_limitの有無を確認
        console.log('\n【月次制限チェック】');
        const conditionsArray = Array.isArray(conditions) ? conditions : [conditions];
        const hasMonthlyLimit = conditionsArray.some(
          (c: any) => c.pattern === 'monthly_visit_limit' || c.type === 'monthly_visit_limit'
        );
        
        if (hasMonthlyLimit) {
          const monthlyLimitCondition = conditionsArray.find(
            (c: any) => c.pattern === 'monthly_visit_limit' || c.type === 'monthly_visit_limit'
          );
          console.log('✅ monthly_visit_limit が設定されています');
          console.log(`   値: ${monthlyLimitCondition?.value || 'N/A'}`);
        } else {
          console.log('❌ monthly_visit_limit が設定されていません');
          console.log('   これが原因で、同じ利用者・同じ月で複数回適用される可能性があります。');
        }
        
        // その他の条件も確認
        console.log('\n【設定されている条件一覧】');
        conditionsArray.forEach((cond: any, index: number) => {
          console.log(`  条件${index + 1}:`);
          if (cond.pattern) {
            console.log(`    - pattern: ${cond.pattern}`);
            if (cond.value !== undefined) {
              console.log(`    - value: ${cond.value}`);
            }
          } else if (cond.type) {
            console.log(`    - type: ${cond.type}`);
            if (cond.value !== undefined) {
              console.log(`    - value: ${cond.value}`);
            }
          } else {
            console.log(`    - フィールド: ${JSON.stringify(cond)}`);
          }
        });
      } else {
        console.log('❌ predefinedConditions が設定されていません');
      }
      
      console.log('\n');
    }

    console.log('✅ 確認完了');
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// 実行
check24hBonusConditions()
  .then(() => {
    console.log('\n🎉 スクリプトが正常に完了しました');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ スクリプトの実行中にエラーが発生しました:', error);
    process.exit(1);
  });

