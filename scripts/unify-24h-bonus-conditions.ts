/**
 * 24時間対応体制加算の加算マスタ設定を開発環境と同じ構造に統一するスクリプト
 * 
 * ⚠️ 本番DBへの更新操作を行います。実行前に必ず確認してください。
 * 
 * 実行方法:
 *   PRODUCTION_DB_URL="postgresql://..." npx tsx scripts/unify-24h-bonus-conditions.ts
 * 
 * このスクリプトは以下を行います:
 * 1. 本番環境の24時間対応体制加算の加算マスタのpredefinedConditionsを確認
 * 2. 開発環境と同じ構造（typeフィールドのみ、descriptionなし）に統一
 * 3. monthly_visit_limit条件が設定されていることを確認（なければ追加）
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from '../shared/schema';
import { bonusMaster } from '../shared/schema';
import { eq } from 'drizzle-orm';

neonConfig.webSocketConstructor = ws;

async function unify24hBonusConditions() {
  // 本番DBの接続文字列
  const dbUrl = process.env.PRODUCTION_DB_URL;
  
  if (!dbUrl) {
    console.error('❌ PRODUCTION_DB_URL 環境変数が設定されていません');
    console.error('   本番環境のデータベースURLを設定してください');
    process.exit(1);
  }
  
  console.log('⚠️  本番データベースに接続します');
  console.log('   24時間対応体制加算の加算マスタを更新します。\n');

  const pool = new Pool({ connectionString: dbUrl });
  const db = drizzle({ client: pool, schema });

  try {
    // 1. 24時間対応体制加算（基本）を確認・更新
    console.log('📋 1. 24時間対応体制加算（基本）を確認中...\n');
    
    const basicBonus = await db.query.bonusMaster.findFirst({
      where: eq(bonusMaster.bonusCode, '24h_response_system_basic'),
    });

    if (!basicBonus) {
      console.error('❌ 24h_response_system_basic が見つかりません');
      throw new Error('加算マスタが見つかりません');
    }

    console.log('【現在の設定】');
    console.log(JSON.stringify(basicBonus.predefinedConditions, null, 2));
    console.log('');

    // 開発環境と同じ構造に統一
    // 統一された構造を作成（開発環境と同じ構造）
    // 1. has_24h_support_system 条件（typeフィールドのみ、descriptionなし）
    // 2. monthly_visit_limit 条件（patternフィールド、value: 1）
    const unifiedBasicConditions: any[] = [
      {
        type: 'has_24h_support_system',
      },
      {
        pattern: 'monthly_visit_limit',
        value: 1,
      },
    ];

    console.log('【統一後の設定】');
    console.log(JSON.stringify(unifiedBasicConditions, null, 2));
    console.log('');

    // 更新を実行
    await db
      .update(bonusMaster)
      .set({
        predefinedConditions: unifiedBasicConditions,
      })
      .where(eq(bonusMaster.bonusCode, '24h_response_system_basic'));

    console.log('✅ 24時間対応体制加算（基本）を更新しました\n');

    // 2. 24時間対応体制加算（看護業務負担軽減）を確認・更新
    console.log('📋 2. 24時間対応体制加算（看護業務負担軽減）を確認中...\n');
    
    const enhancedBonus = await db.query.bonusMaster.findFirst({
      where: eq(bonusMaster.bonusCode, '24h_response_system_enhanced'),
    });

    if (!enhancedBonus) {
      console.error('❌ 24h_response_system_enhanced が見つかりません');
      throw new Error('加算マスタが見つかりません');
    }

    console.log('【現在の設定】');
    console.log(JSON.stringify(enhancedBonus.predefinedConditions, null, 2));
    console.log('');

    // 開発環境と同じ構造に統一
    // 統一された構造を作成（開発環境と同じ構造）
    // 1. has_24h_support_system_enhanced 条件（typeフィールドのみ、descriptionなし）
    // 2. monthly_visit_limit 条件（patternフィールド、value: 1）
    const unifiedEnhancedConditions: any[] = [
      {
        type: 'has_24h_support_system_enhanced',
      },
      {
        pattern: 'monthly_visit_limit',
        value: 1,
      },
    ];

    console.log('【統一後の設定】');
    console.log(JSON.stringify(unifiedEnhancedConditions, null, 2));
    console.log('');

    // 更新を実行
    await db
      .update(bonusMaster)
      .set({
        predefinedConditions: unifiedEnhancedConditions,
      })
      .where(eq(bonusMaster.bonusCode, '24h_response_system_enhanced'));

    console.log('✅ 24時間対応体制加算（看護業務負担軽減）を更新しました\n');

    // 3. 更新後の確認
    console.log('📋 3. 更新後の確認...\n');
    
    const updatedBasic = await db.query.bonusMaster.findFirst({
      where: eq(bonusMaster.bonusCode, '24h_response_system_basic'),
    });
    
    const updatedEnhanced = await db.query.bonusMaster.findFirst({
      where: eq(bonusMaster.bonusCode, '24h_response_system_enhanced'),
    });

    console.log('【24時間対応体制加算（基本）の最終状態】');
    console.log(JSON.stringify(updatedBasic?.predefinedConditions, null, 2));
    console.log('');
    
    console.log('【24時間対応体制加算（看護業務負担軽減）の最終状態】');
    console.log(JSON.stringify(updatedEnhanced?.predefinedConditions, null, 2));
    console.log('');

    console.log('🎉 統一処理が完了しました！');
    console.log('');
    console.log('✅ 両方の加算マスタが開発環境と同じ構造に統一されました');
    console.log('   - typeフィールドのみを使用（descriptionフィールドなし）');
    console.log('   - monthly_visit_limit条件が設定されています');
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// 実行
unify24hBonusConditions()
  .then(() => {
    console.log('\n✨ スクリプトが正常に完了しました');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ スクリプトの実行中にエラーが発生しました:', error);
    process.exit(1);
  });

