/**
 * 開発環境の加算マスタを本番環境に反映する移行スクリプト
 * 
 * 1. 開発環境で無効だが本番環境で有効な加算マスタを無効化
 * 2. 内容が異なる加算マスタを開発環境の値に更新
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql, eq } from 'drizzle-orm';
import { bonusMaster } from '../shared/schema';

const PROD_DB_URL = process.env.PRODUCTION_DB_URL || 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';
const DEV_DB_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_beoRr4gaQ5Dl@ep-polished-scene-a5twqv82.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function migrateBonusMaster() {
  console.log('🔄 開発環境の加算マスタを本番環境に反映します...\n');
  
  const prodPool = new Pool({ connectionString: PROD_DB_URL });
  const devPool = new Pool({ connectionString: DEV_DB_URL });
  const prodDb = drizzle(prodPool);
  const devDb = drizzle(devPool);

  try {
    // 確認プロンプト
    console.log('⚠️  このスクリプトは本番環境の加算マスタを変更します。');
    console.log('   ソレア春日部への影響はありませんが、他のテナント（テスト環境）への影響があります。\n');
    
    // 1. 開発環境の有効な加算マスタを取得
    console.log('📊 1. 開発環境の有効な加算マスタを取得中...');
    const devActiveMasters = await devDb.select().from(bonusMaster)
      .where(sql`is_active = true`);
    console.log(`   開発環境の有効な加算マスタ数: ${devActiveMasters.length}件\n`);

    // 2. 本番環境の有効な加算マスタを取得
    console.log('📊 2. 本番環境の有効な加算マスタを取得中...');
    const prodActiveMasters = await prodDb.select().from(bonusMaster)
      .where(sql`is_active = true`);
    console.log(`   本番環境の有効な加算マスタ数: ${prodActiveMasters.length}件\n`);

    // 3. 開発環境で無効だが本番環境で有効な加算マスタを特定
    console.log('📊 3. 開発環境で無効だが本番環境で有効な加算マスタを特定中...');
    const devInactiveMasters = await devDb.select().from(bonusMaster)
      .where(sql`is_active = false`);
    const devInactiveCodes = new Set(devInactiveMasters.map(m => m.bonusCode));
    
    const prodOnlyActiveMasters = prodActiveMasters.filter(m => devInactiveCodes.has(m.bonusCode));
    console.log(`   該当する加算マスタ数: ${prodOnlyActiveMasters.length}件\n`);
    
    if (prodOnlyActiveMasters.length > 0) {
      console.log('   無効化対象の加算マスタ:');
      prodOnlyActiveMasters.forEach((master, index) => {
        console.log(`   ${index + 1}. ${master.bonusCode} - ${master.bonusName}`);
      });
      console.log('');
    }

    // 4. 内容が異なる加算マスタを特定
    console.log('📊 4. 内容が異なる加算マスタを特定中...');
    const devMasterMap = new Map(devActiveMasters.map(m => [m.bonusCode, m]));
    const prodMasterMap = new Map(prodActiveMasters.map(m => [m.bonusCode, m]));
    
    const mastersToUpdate: Array<{
      prodMaster: typeof bonusMaster.$inferSelect;
      devMaster: typeof bonusMaster.$inferSelect;
      differences: Array<{ field: string; devValue: any; prodValue: any }>;
    }> = [];
    
    for (const [code, devMaster] of devMasterMap) {
      const prodMaster = prodMasterMap.get(code);
      if (!prodMaster) continue;
      
      const differences: Array<{ field: string; devValue: any; prodValue: any }> = [];
      
      // fixedPointsの比較
      if (devMaster.fixedPoints !== prodMaster.fixedPoints) {
        differences.push({
          field: 'fixedPoints',
          devValue: devMaster.fixedPoints,
          prodValue: prodMaster.fixedPoints,
        });
      }
      
      // pointsTypeの比較
      if (devMaster.pointsType !== prodMaster.pointsType) {
        differences.push({
          field: 'pointsType',
          devValue: devMaster.pointsType,
          prodValue: prodMaster.pointsType,
        });
      }
      
      // conditionalPatternの比較
      if (devMaster.conditionalPattern !== prodMaster.conditionalPattern) {
        differences.push({
          field: 'conditionalPattern',
          devValue: devMaster.conditionalPattern,
          prodValue: prodMaster.conditionalPattern,
        });
      }
      
      // pointsConfigの比較（JSON）
      const devPointsConfig = devMaster.pointsConfig ? JSON.stringify(devMaster.pointsConfig) : null;
      const prodPointsConfig = prodMaster.pointsConfig ? JSON.stringify(prodMaster.pointsConfig) : null;
      if (devPointsConfig !== prodPointsConfig) {
        differences.push({
          field: 'pointsConfig',
          devValue: devPointsConfig,
          prodValue: prodPointsConfig,
        });
      }
      
      if (differences.length > 0) {
        mastersToUpdate.push({
          prodMaster,
          devMaster,
          differences,
        });
      }
    }
    
    console.log(`   更新対象の加算マスタ数: ${mastersToUpdate.length}件\n`);
    
    if (mastersToUpdate.length > 0) {
      console.log('   更新対象の加算マスタ（最初の10件）:');
      mastersToUpdate.slice(0, 10).forEach((item, index) => {
        console.log(`   ${index + 1}. ${item.prodMaster.bonusCode} - ${item.prodMaster.bonusName}`);
        item.differences.forEach(diff => {
          console.log(`      差分: ${diff.field} - 開発: ${diff.devValue}, 本番: ${diff.prodValue}`);
        });
      });
      if (mastersToUpdate.length > 10) {
        console.log(`   ... 他 ${mastersToUpdate.length - 10}件\n`);
      } else {
        console.log('');
      }
    }

    // 5. 実行確認
    console.log('─'.repeat(60));
    console.log('📋 実行内容のサマリー:');
    console.log(`   - 無効化する加算マスタ: ${prodOnlyActiveMasters.length}件`);
    console.log(`   - 更新する加算マスタ: ${mastersToUpdate.length}件`);
    console.log('─'.repeat(60));
    console.log('');
    
    if (prodOnlyActiveMasters.length === 0 && mastersToUpdate.length === 0) {
      console.log('✅ 更新対象の加算マスタはありません。');
      return;
    }

    // 確認プロンプト
    console.log('⚠️  本番環境の加算マスタを更新しますか？\n');
    
    const readline = await import('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>(resolve => {
      rl.question('続行しますか？ (yes/no): ', resolve);
    });
    rl.close();
    if (answer.toLowerCase() !== 'yes') {
      console.log('❌ 実行をキャンセルしました。');
      return;
    }
    console.log('');

    // 実際の更新処理
    console.log('🔄 加算マスタの更新を開始します...\n');

    // フェーズ1: 無効化
    if (prodOnlyActiveMasters.length > 0) {
      console.log('📊 フェーズ1: 開発環境で無効な加算マスタを無効化中...');
      let deactivatedCount = 0;
      
      for (const master of prodOnlyActiveMasters) {
        await prodDb.update(bonusMaster)
          .set({ 
            isActive: false,
            updatedAt: new Date(),
          })
          .where(eq(bonusMaster.id, master.id));
        deactivatedCount++;
      }
      
      console.log(`   ✅ ${deactivatedCount}件の加算マスタを無効化しました。\n`);
    }

    // フェーズ2: 内容の更新
    if (mastersToUpdate.length > 0) {
      console.log('📊 フェーズ2: 加算マスタの内容を開発環境の値に更新中...');
      let updatedCount = 0;
      
      for (const item of mastersToUpdate) {
        const updateData: Partial<typeof bonusMaster.$inferInsert> = {
          updatedAt: new Date(),
        };
        
        // fixedPointsの更新
        if (item.devMaster.fixedPoints !== item.prodMaster.fixedPoints) {
          updateData.fixedPoints = item.devMaster.fixedPoints;
        }
        
        // pointsTypeの更新
        if (item.devMaster.pointsType !== item.prodMaster.pointsType) {
          updateData.pointsType = item.devMaster.pointsType;
        }
        
        // conditionalPatternの更新
        if (item.devMaster.conditionalPattern !== item.prodMaster.conditionalPattern) {
          updateData.conditionalPattern = item.devMaster.conditionalPattern;
        }
        
        // pointsConfigの更新
        const devPointsConfig = item.devMaster.pointsConfig ? JSON.stringify(item.devMaster.pointsConfig) : null;
        const prodPointsConfig = item.prodMaster.pointsConfig ? JSON.stringify(item.prodMaster.pointsConfig) : null;
        if (devPointsConfig !== prodPointsConfig) {
          updateData.pointsConfig = item.devMaster.pointsConfig;
        }
        
        await prodDb.update(bonusMaster)
          .set(updateData)
          .where(eq(bonusMaster.id, item.prodMaster.id));
        updatedCount++;
      }
      
      console.log(`   ✅ ${updatedCount}件の加算マスタを更新しました。\n`);
    }

    // 6. 検証
    console.log('📊 6. 更新後の検証:');
    console.log('─'.repeat(60));
    
    const prodActiveMastersAfter = await prodDb.select().from(bonusMaster)
      .where(sql`is_active = true`);
    
    console.log(`   更新後の有効な加算マスタ数: ${prodActiveMastersAfter.length}件`);
    console.log(`   開発環境の有効な加算マスタ数: ${devActiveMasters.length}件`);
    
    if (prodActiveMastersAfter.length === devActiveMasters.length) {
      console.log('   ✅ 有効な加算マスタ数が一致しました。\n');
    } else {
      console.log(`   ⚠️  有効な加算マスタ数が一致しません（差分: ${prodActiveMastersAfter.length - devActiveMasters.length}件）。\n`);
    }

    console.log('─'.repeat(60));
    console.log('✅ 加算マスタの移行が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prodPool.end();
    await devPool.end();
  }
}

migrateBonusMaster()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

