/**
 * 退院時支援指導加算の加算マスタを修正するスクリプト
 * 
 * ⚠️ 本番DBへの書き込みを行います。
 * 影響範囲: discharge_support_guidance_basic と discharge_support_guidance_long のみ
 * 
 * 実行方法:
 *   PRODUCTION_DB_URL="postgresql://..." npx tsx scripts/fix-discharge-bonus-master.ts
 * 
 * プレビューモード（実際には更新しない）:
 *   PREVIEW=true PRODUCTION_DB_URL="postgresql://..." npx tsx scripts/fix-discharge-bonus-master.ts
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from '../shared/schema';
import { bonusMaster } from '../shared/schema';
import { eq, and, or, isNull, lte, gte } from 'drizzle-orm';

neonConfig.webSocketConstructor = ws;

async function fixDischargeBonusMaster() {
  const isPreview = process.env.PREVIEW === 'true';
  const dbUrl = process.env.PRODUCTION_DB_URL || 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';
  
  if (isPreview) {
    console.log('🔍 プレビューモード: 実際には更新しません\n');
  } else {
    console.log('⚠️  本番データベースを更新します');
    console.log('   影響範囲: discharge_support_guidance_basic と discharge_support_guidance_long のみ\n');
  }

  const pool = new Pool({ connectionString: dbUrl });
  const db = drizzle({ client: pool, schema });

  try {
    // 退院時支援指導加算の加算マスタを取得
    console.log('📋 退院時支援指導加算の加算マスタを取得中...\n');
    
    const visitDate = '2025-11-06';
    
    const targetBonuses = await db.query.bonusMaster.findMany({
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

    console.log(`✅ 対象加算マスタ数: ${targetBonuses.length}件\n`);

    if (targetBonuses.length === 0) {
      console.log('❌ 修正対象の加算マスタが見つかりませんでした');
      return;
    }

    // 各加算マスタを修正
    for (const bonus of targetBonuses) {
      console.log('='.repeat(80));
      console.log(`【${bonus.bonusCode}】${bonus.bonusName}`);
      console.log('='.repeat(80));
      
      const currentConditions = bonus.predefinedConditions;
      console.log('【現在の設定】');
      console.log(JSON.stringify(currentConditions, null, 2));
      console.log('');

      // 修正後の設定を構築
      let newConditions: any;

      if (!currentConditions) {
        // 事前定義条件がない場合は、is_discharge_dateのみを設定
        newConditions = [
          { pattern: 'is_discharge_date' }
        ];
      } else if (Array.isArray(currentConditions)) {
        // 既に配列形式の場合
        const hasIsDischargeDate = currentConditions.some((cond: any) => 
          cond.pattern === 'is_discharge_date' || cond.type === 'is_discharge_date'
        );
        
        if (hasIsDischargeDate) {
          console.log('✅ 既に"is_discharge_date"パターンが含まれています。修正不要です。\n');
          continue;
        }
        
        // is_discharge_dateを先頭に追加
        newConditions = [
          { pattern: 'is_discharge_date' },
          ...currentConditions
        ];
      } else {
        // オブジェクト形式の場合
        // 既存のオブジェクトにpatternフィールドがあるか確認
        if (currentConditions.pattern === 'is_discharge_date' || currentConditions.type === 'is_discharge_date') {
          console.log('✅ 既に"is_discharge_date"パターンが含まれています。修正不要です。\n');
          continue;
        }
        
        // 配列形式に変換して、is_discharge_dateを先頭に追加
        newConditions = [
          { pattern: 'is_discharge_date' },
          currentConditions
        ];
      }

      console.log('【修正後の設定】');
      console.log(JSON.stringify(newConditions, null, 2));
      console.log('');

      if (!isPreview) {
        // 実際に更新
        await db.update(bonusMaster)
          .set({
            predefinedConditions: newConditions,
            updatedAt: new Date()
          })
          .where(eq(bonusMaster.id, bonus.id));
        
        console.log('✅ 更新完了\n');
      } else {
        console.log('🔍 プレビュー: この内容で更新されます（実際には更新していません）\n');
      }
    }

    if (isPreview) {
      console.log('='.repeat(80));
      console.log('【プレビュー完了】');
      console.log('='.repeat(80));
      console.log('');
      console.log('実際に更新するには、PREVIEW環境変数を削除して実行してください:');
      console.log('  PRODUCTION_DB_URL="..." npx tsx scripts/fix-discharge-bonus-master.ts');
    } else {
      console.log('='.repeat(80));
      console.log('【修正完了】');
      console.log('='.repeat(80));
      console.log('');
      console.log('✅ 退院時支援指導加算の加算マスタを修正しました。');
      console.log('   これで「退院日当日の訪問」フラグが正しく評価されるようになります。');
      console.log('');
      console.log('【次のステップ】');
      console.log('1. 該当の訪問記録で加算計算を再実行してください');
      console.log('2. または、該当月のレセプトを再計算してください');
    }

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

fixDischargeBonusMaster().catch(console.error);

