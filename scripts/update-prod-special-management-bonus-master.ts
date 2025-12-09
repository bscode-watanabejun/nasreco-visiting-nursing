/**
 * 本番環境の特別管理加算マスタのpredefined_conditionsを更新するスクリプト
 * 
 * 古い形式から新しい形式に更新します。
 */

import { Pool } from 'pg';

const PROD_DB_URL = 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

// 新しい形式のpredefined_conditions
const NEW_CONDITIONS = {
  special_management_1: [
    {
      value: true,
      pattern: "patient_has_special_management",
      operator: "equals",
      description: "患者が特別管理の対象"
    }
  ],
  special_management_2: [
    {
      value: true,
      pattern: "patient_has_special_management",
      operator: "equals",
      description: "患者が特別管理の対象"
    }
  ],
  care_special_management_1: [
    {
      value: true,
      pattern: "patient_has_special_management",
      operator: "equals",
      description: "患者が特別管理の対象"
    }
  ],
  care_special_management_2: [
    {
      value: true,
      pattern: "patient_has_special_management",
      operator: "equals",
      description: "患者が特別管理の対象"
    }
  ]
};

async function updateProdBonusMaster() {
  console.log('🔧 本番環境の特別管理加算マスタを更新します\n');
  console.log('⚠️  本番データベースに接続します\n');
  
  const pool = new Pool({ connectionString: PROD_DB_URL });

  try {
    // 現在のマスタを確認
    console.log('📊 現在のマスタを確認中...\n');
    const currentBonuses = await pool.query(`
      SELECT 
        id,
        bonus_code,
        bonus_name,
        insurance_type,
        predefined_conditions,
        is_active
      FROM bonus_master
      WHERE bonus_code IN ('special_management_1', 'special_management_2', 'care_special_management_1', 'care_special_management_2')
        AND is_active = true
      ORDER BY insurance_type, bonus_code
    `);
    
    console.log(`   現在のマスタ: ${currentBonuses.rows.length}件\n`);
    
    // 更新を実行
    for (const bonus of currentBonuses.rows) {
      const bonusCode = bonus.bonus_code;
      const newConditions = NEW_CONDITIONS[bonusCode as keyof typeof NEW_CONDITIONS];
      
      if (!newConditions) {
        console.log(`   ⚠️  ${bonusCode} の新しい条件定義が見つかりません。スキップします。`);
        continue;
      }
      
      console.log(`   📝 ${bonus.bonus_name} (${bonusCode}) を更新中...`);
      
      // 現在の条件を確認
      const currentConditions = bonus.predefined_conditions;
      const isOldFormat = currentConditions && typeof currentConditions === 'object' && 'targetConditions' in currentConditions;
      
      if (!isOldFormat) {
        console.log(`      ⚠️  すでに新しい形式です。スキップします。`);
        continue;
      }
      
      // 更新を実行
      await pool.query({
        text: `
          UPDATE bonus_master
          SET predefined_conditions = $1,
              updated_at = NOW()
          WHERE id = $2
        `,
        values: [JSON.stringify(newConditions), bonus.id]
      });
      
      console.log(`      ✅ 更新完了`);
      console.log(`         新しい条件: ${JSON.stringify(newConditions, null, 2)}`);
    }
    
    console.log('\n─'.repeat(60));
    console.log('✅ 更新が完了しました\n');
    
    // 更新後のマスタを確認
    console.log('📊 更新後のマスタを確認中...\n');
    const updatedBonuses = await pool.query(`
      SELECT 
        bonus_code,
        bonus_name,
        insurance_type,
        predefined_conditions,
        updated_at
      FROM bonus_master
      WHERE bonus_code IN ('special_management_1', 'special_management_2', 'care_special_management_1', 'care_special_management_2')
        AND is_active = true
      ORDER BY insurance_type, bonus_code
    `);
    
    updatedBonuses.rows.forEach((bonus: any) => {
      console.log(`   - ${bonus.bonus_name} (${bonus.bonus_code})`);
      console.log(`     保険種別: ${bonus.insurance_type}`);
      console.log(`     更新日時: ${bonus.updated_at}`);
      console.log(`     predefined_conditions: ${JSON.stringify(bonus.predefined_conditions, null, 2)}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

updateProdBonusMaster()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('処理中にエラーが発生しました:', error);
    process.exit(1);
  });

