/**
 * 本番DBの加算マスタ設定を確認するスクリプト（読み取り専用）
 * 
 * ⚠️ 本番DBへの読み取り専用アクセスのみ。データの変更は一切行いません。
 * 
 * 実行方法:
 *   PRODUCTION_DB_URL="postgresql://..." npx tsx scripts/check-bonus-master-conditions.ts
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from '../shared/schema';
import { bonusMaster } from '../shared/schema';
import { eq, and, or, isNull, lte, gte } from 'drizzle-orm';

neonConfig.webSocketConstructor = ws;

async function checkBonusMasterConditions() {
  // 本番DBの接続文字列（読み取り専用）
  const dbUrl = process.env.PRODUCTION_DB_URL || 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';
  
  console.log('⚠️  本番データベースに接続します（読み取り専用）');
  console.log('   データの変更は一切行いません。\n');

  const pool = new Pool({ connectionString: dbUrl });
  const db = drizzle({ client: pool, schema });

  try {
    // 退院時支援指導加算の加算マスタを取得
    console.log('📋 退院時支援指導加算の加算マスタを確認中...\n');
    
    const visitDate = '2025-11-06';
    
    // 全施設の加算マスタを確認（facilityIdがnullのグローバル設定も含む）
    const allDischargeBonuses = await db.query.bonusMaster.findMany({
      where: and(
        eq(bonusMaster.insuranceType, 'medical'),
        lte(bonusMaster.validFrom, visitDate),
        or(
          isNull(bonusMaster.validTo),
          gte(bonusMaster.validTo, visitDate)
        ),
        eq(bonusMaster.isActive, true),
        or(
          eq(bonusMaster.bonusCode, 'discharge_support_guidance_basic'),
          eq(bonusMaster.bonusCode, 'discharge_support_guidance_long')
        )
      ),
    });

    console.log(`✅ 退院時支援指導加算マスタ数: ${allDischargeBonuses.length}件\n`);

    for (const bonus of allDischargeBonuses) {
      console.log('='.repeat(80));
      console.log(`【${bonus.bonusCode}】${bonus.bonusName}`);
      console.log('='.repeat(80));
      console.log(`施設ID: ${bonus.facilityId || 'グローバル（全施設共通）'}`);
      console.log(`有効期間: ${bonus.validFrom} ～ ${bonus.validTo || '無期限'}`);
      console.log(`点数タイプ: ${bonus.pointsType}`);
      console.log(`固定点数: ${bonus.fixedPoints || 'N/A'}`);
      console.log(`条件分岐パターン: ${bonus.conditionalPattern || 'N/A'}`);
      console.log('');
      
      // 事前定義条件の詳細を確認
      console.log('【事前定義条件（predefinedConditions）】');
      if (bonus.predefinedConditions) {
        const conditions = bonus.predefinedConditions;
        console.log(JSON.stringify(conditions, null, 2));
        
        // 条件の形式を分析
        console.log('\n【条件の形式分析】');
        
        if (Array.isArray(conditions)) {
          console.log('✓ 配列形式');
          let hasPatternField = false;
          let hasIsDischargeDatePattern = false;
          
          conditions.forEach((cond: any, index: number) => {
            console.log(`  条件${index + 1}:`);
            if (cond.pattern) {
              hasPatternField = true;
              console.log(`    - pattern: ${cond.pattern}`);
              if (cond.pattern === 'is_discharge_date') {
                hasIsDischargeDatePattern = true;
                console.log(`    ✅ "is_discharge_date"パターンが見つかりました`);
              }
            } else if (cond.type) {
              console.log(`    - type: ${cond.type}`);
              if (cond.type === 'is_discharge_date') {
                hasIsDischargeDatePattern = true;
                console.log(`    ✅ "is_discharge_date"タイプが見つかりました`);
              }
            } else {
              console.log(`    - pattern/typeフィールドがありません`);
              console.log(`    - フィールド一覧: ${Object.keys(cond).join(', ')}`);
            }
          });
          
          if (!hasPatternField && !hasIsDischargeDatePattern) {
            console.log('\n  ❌ 問題: "pattern"または"type"フィールドがなく、"is_discharge_date"パターンが見つかりません');
            console.log('  → この加算マスタは条件評価で失敗し、加算が適用されません');
          } else if (hasIsDischargeDatePattern) {
            console.log('\n  ✅ 正常: "is_discharge_date"パターンが設定されています');
          }
        } else {
          // オブジェクト形式
          console.log('✓ オブジェクト形式');
          if (conditions.pattern) {
            console.log(`  - pattern: ${conditions.pattern}`);
            if (conditions.pattern === 'is_discharge_date') {
              console.log(`  ✅ "is_discharge_date"パターンが見つかりました`);
            } else {
              console.log(`  ❌ 問題: patternが"is_discharge_date"ではありません`);
            }
          } else if (conditions.type) {
            console.log(`  - type: ${conditions.type}`);
            if (conditions.type === 'is_discharge_date') {
              console.log(`  ✅ "is_discharge_date"タイプが見つかりました`);
            } else {
              console.log(`  ❌ 問題: typeが"is_discharge_date"ではありません`);
            }
          } else {
            console.log(`  ❌ 問題: "pattern"または"type"フィールドがありません`);
            console.log(`  - フィールド一覧: ${Object.keys(conditions).join(', ')}`);
            console.log(`  → この加算マスタは条件評価で失敗し、加算が適用されません`);
          }
        }
      } else {
        console.log('  ⚠️  事前定義条件が設定されていません');
        console.log('  → 条件なしで評価される可能性があります（要確認）');
      }
      
      console.log('');
    }

    // 修正が必要かどうかを判定
    console.log('='.repeat(80));
    console.log('【修正の必要性判定】');
    console.log('='.repeat(80));
    console.log('');

    let needsFix = false;
    const fixTargets: Array<{ bonusCode: string; bonusName: string; facilityId: string | null; issue: string }> = [];

    for (const bonus of allDischargeBonuses) {
      if (!bonus.predefinedConditions) {
        // 事前定義条件がない場合は、is_discharge_date条件を追加する必要がある
        needsFix = true;
        fixTargets.push({
          bonusCode: bonus.bonusCode,
          bonusName: bonus.bonusName,
          facilityId: bonus.facilityId,
          issue: '事前定義条件が設定されていません。is_discharge_date条件を追加する必要があります。'
        });
        continue;
      }

      const conditions = bonus.predefinedConditions;
      let hasIsDischargeDatePattern = false;

      if (Array.isArray(conditions)) {
        hasIsDischargeDatePattern = conditions.some((cond: any) => 
          (cond.pattern === 'is_discharge_date' || cond.type === 'is_discharge_date')
        );
      } else {
        hasIsDischargeDatePattern = (
          conditions.pattern === 'is_discharge_date' || 
          conditions.type === 'is_discharge_date'
        );
      }

      if (!hasIsDischargeDatePattern) {
        needsFix = true;
        fixTargets.push({
          bonusCode: bonus.bonusCode,
          bonusName: bonus.bonusName,
          facilityId: bonus.facilityId,
          issue: '事前定義条件に"is_discharge_date"パターンが含まれていません。追加する必要があります。'
        });
      }
    }

    if (needsFix) {
      console.log('❌ 修正が必要です。以下の加算マスタに問題があります:\n');
      fixTargets.forEach((target, index) => {
        console.log(`${index + 1}. ${target.bonusCode} (${target.bonusName})`);
        console.log(`   施設ID: ${target.facilityId || 'グローバル'}`);
        console.log(`   問題: ${target.issue}`);
        console.log('');
      });

      console.log('【修正方法】');
      console.log('各加算マスタのpredefinedConditionsに以下を追加する必要があります:');
      console.log('');
      console.log('配列形式の場合:');
      console.log('  [');
      console.log('    { "pattern": "is_discharge_date" },');
      console.log('    ...既存の条件');
      console.log('  ]');
      console.log('');
      console.log('オブジェクト形式の場合:');
      console.log('  {');
      console.log('    "pattern": "is_discharge_date"');
      console.log('  }');
      console.log('');
    } else {
      console.log('✅ すべての加算マスタが正しい形式になっています。');
      console.log('   別の原因を調査する必要があります。');
    }

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

checkBonusMasterConditions().catch(console.error);

