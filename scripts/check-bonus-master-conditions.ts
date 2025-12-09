/**
 * 本番環境の特別管理加算マスタのpredefined_conditionsを確認するスクリプト
 */

import { Pool } from 'pg';

const PROD_DB_URL = 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function checkBonusMasterConditions() {
  console.log('🔍 本番環境の特別管理加算マスタのpredefined_conditions確認\n');
  
  const pool = new Pool({ connectionString: PROD_DB_URL });

  try {
    const bonuses = await pool.query(`
      SELECT 
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
    
    console.log(`📊 特別管理加算マスタ: ${bonuses.rows.length}件\n`);
    
    bonuses.rows.forEach((bonus: any) => {
      console.log(`─ ${bonus.bonus_name} (${bonus.bonus_code})`);
      console.log(`  保険種別: ${bonus.insurance_type}`);
      console.log(`  有効: ${bonus.is_active}`);
      console.log(`  predefined_conditions:`);
      console.log(JSON.stringify(bonus.predefined_conditions, null, 2));
      console.log('');
    });

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

checkBonusMasterConditions()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('処理中にエラーが発生しました:', error);
    process.exit(1);
  });
