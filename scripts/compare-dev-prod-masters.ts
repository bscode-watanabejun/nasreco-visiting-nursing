/**
 * 開発環境と本番環境のマスタデータ比較スクリプト
 * 
 * 特別管理加算が適用されない原因を調査するため、マスタデータの差異を確認します。
 */

import { Pool } from 'pg';

const PROD_DB_URL = 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';
const DEV_DB_URL = 'postgresql://neondb_owner:npg_beoRr4gaQ5Dl@ep-polished-scene-a5twqv82.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function compareMasters() {
  console.log('🔍 開発環境と本番環境のマスタデータ比較\n');
  console.log('⚠️  データベースに接続します（読み取り専用）\n');
  
  const prodPool = new Pool({ connectionString: PROD_DB_URL });
  const devPool = new Pool({ connectionString: DEV_DB_URL });

  try {
    // 1. 施設情報の確認
    console.log('📊 1. 施設情報:');
    console.log('─'.repeat(60));
    
    const prodFacilities = await prodPool.query(`
      SELECT id, name, facility_code
      FROM facilities
      WHERE name LIKE '%テストクリニック%' OR name LIKE '%ソレア%'
      ORDER BY name
    `);
    
    const devFacilities = await devPool.query(`
      SELECT id, name, facility_code
      FROM facilities
      WHERE name LIKE '%テストクリニック%' OR name LIKE '%ソレア%'
      ORDER BY name
    `);
    
    console.log(`   本番環境: ${prodFacilities.rows.length}件`);
    prodFacilities.rows.forEach((f: any) => {
      console.log(`   - ${f.name} (ID: ${f.id})`);
    });
    console.log(`\n   開発環境: ${devFacilities.rows.length}件`);
    devFacilities.rows.forEach((f: any) => {
      console.log(`   - ${f.name} (ID: ${f.id})`);
    });
    console.log('');

    // テストクリニックの施設IDを取得
    const testClinicProd = prodFacilities.rows.find((f: any) => f.name.includes('テストクリニック'));
    const testClinicDev = devFacilities.rows.find((f: any) => f.name.includes('テストクリニック'));
    
    if (!testClinicProd || !testClinicDev) {
      console.log('   ⚠️  テストクリニックが見つかりませんでした。');
      await prodPool.end();
      await devPool.end();
      return;
    }

    const testClinicProdId = testClinicProd.id;
    const testClinicDevId = testClinicDev.id;

    // 2. 特別管理定義マスタの比較
    console.log('📊 2. 特別管理定義マスタ（special_management_definitions）:');
    console.log('─'.repeat(60));
    
    const prodDefinitions = await prodPool.query({
      text: `
        SELECT 
          id,
          facility_id,
          category,
          display_name,
          insurance_type,
          monthly_points,
          is_active,
          display_order
        FROM special_management_definitions
        WHERE facility_id = $1
        ORDER BY display_order
      `,
      values: [testClinicProdId]
    });
    
    const devDefinitions = await devPool.query({
      text: `
        SELECT 
          id,
          facility_id,
          category,
          display_name,
          insurance_type,
          monthly_points,
          is_active,
          display_order
        FROM special_management_definitions
        WHERE facility_id = $1
        ORDER BY display_order
      `,
      values: [testClinicDevId]
    });
    
    console.log(`   本番環境: ${prodDefinitions.rows.length}件`);
    prodDefinitions.rows.forEach((def: any) => {
      console.log(`   - ${def.display_name} (${def.category})`);
      console.log(`     保険種別: ${def.insurance_type}, 月額: ${def.monthly_points}円, 有効: ${def.is_active}`);
    });
    console.log(`\n   開発環境: ${devDefinitions.rows.length}件`);
    devDefinitions.rows.forEach((def: any) => {
      console.log(`   - ${def.display_name} (${def.category})`);
      console.log(`     保険種別: ${def.insurance_type}, 月額: ${def.monthly_points}円, 有効: ${def.is_active}`);
    });
    console.log('');

    // 3. 特別管理加算マスタの比較
    console.log('📊 3. 特別管理加算マスタ（bonus_master）:');
    console.log('─'.repeat(60));
    
    const prodBonuses = await prodPool.query({
      text: `
        SELECT 
          id,
          facility_id,
          bonus_code,
          bonus_name,
          insurance_type,
          fixed_points,
          is_active,
          display_order
        FROM bonus_master
        WHERE (facility_id IS NULL OR facility_id = $1)
          AND bonus_code IN ('special_management_1', 'special_management_2')
        ORDER BY bonus_code
      `,
      values: [testClinicProdId]
    });
    
    const devBonuses = await devPool.query({
      text: `
        SELECT 
          id,
          facility_id,
          bonus_code,
          bonus_name,
          insurance_type,
          fixed_points,
          is_active,
          display_order
        FROM bonus_master
        WHERE (facility_id IS NULL OR facility_id = $1)
          AND bonus_code IN ('special_management_1', 'special_management_2')
        ORDER BY bonus_code
      `,
      values: [testClinicDevId]
    });
    
    console.log(`   本番環境: ${prodBonuses.rows.length}件`);
    prodBonuses.rows.forEach((bonus: any) => {
      console.log(`   - ${bonus.bonus_name} (${bonus.bonus_code})`);
      console.log(`     保険種別: ${bonus.insurance_type}, 点数: ${bonus.fixed_points}点, 有効: ${bonus.is_active}`);
      console.log(`     施設ID: ${bonus.facility_id || 'NULL（全施設共通）'}`);
    });
    console.log(`\n   開発環境: ${devBonuses.rows.length}件`);
    devBonuses.rows.forEach((bonus: any) => {
      console.log(`   - ${bonus.bonus_name} (${bonus.bonus_code})`);
      console.log(`     保険種別: ${bonus.insurance_type}, 点数: ${bonus.fixed_points}点, 有効: ${bonus.is_active}`);
      console.log(`     施設ID: ${bonus.facility_id || 'NULL（全施設共通）'}`);
    });
    console.log('');

    // 4. 差異の詳細比較
    console.log('📊 4. 差異の詳細比較:');
    console.log('─'.repeat(60));
    
    // 特別管理定義の差異
    const prodDefMap = new Map(prodDefinitions.rows.map((d: any) => [d.category, d]));
    const devDefMap = new Map(devDefinitions.rows.map((d: any) => [d.category, d]));
    
    console.log('   特別管理定義マスタ:');
    const allCategories = new Set([...prodDefMap.keys(), ...devDefMap.keys()]);
    let hasDefDiff = false;
    for (const category of allCategories) {
      const prodDef = prodDefMap.get(category);
      const devDef = devDefMap.get(category);
      
      if (!prodDef) {
        console.log(`   ❌ 本番環境に存在しない: ${category} (${devDef?.display_name})`);
        hasDefDiff = true;
      } else if (!devDef) {
        console.log(`   ❌ 開発環境に存在しない: ${category} (${prodDef.display_name})`);
        hasDefDiff = true;
      } else {
        if (prodDef.insurance_type !== devDef.insurance_type) {
          console.log(`   ⚠️  保険種別が異なる: ${category}`);
          console.log(`      本番: ${prodDef.insurance_type}, 開発: ${devDef.insurance_type}`);
          hasDefDiff = true;
        }
        if (prodDef.monthly_points !== devDef.monthly_points) {
          console.log(`   ⚠️  月額が異なる: ${category}`);
          console.log(`      本番: ${prodDef.monthly_points}円, 開発: ${devDef.monthly_points}円`);
          hasDefDiff = true;
        }
        if (prodDef.is_active !== devDef.is_active) {
          console.log(`   ⚠️  有効フラグが異なる: ${category}`);
          console.log(`      本番: ${prodDef.is_active}, 開発: ${devDef.is_active}`);
          hasDefDiff = true;
        }
      }
    }
    if (!hasDefDiff) {
      console.log('   ✅ 差異なし');
    }
    console.log('');

    // 特別管理加算マスタの差異
    const prodBonusMap = new Map(prodBonuses.rows.map((b: any) => [b.bonus_code, b]));
    const devBonusMap = new Map(devBonuses.rows.map((b: any) => [b.bonus_code, b]));
    
    console.log('   特別管理加算マスタ:');
    const allBonusCodes = new Set([...prodBonusMap.keys(), ...devBonusMap.keys()]);
    let hasBonusDiff = false;
    for (const bonusCode of allBonusCodes) {
      const prodBonus = prodBonusMap.get(bonusCode);
      const devBonus = devBonusMap.get(bonusCode);
      
      if (!prodBonus) {
        console.log(`   ❌ 本番環境に存在しない: ${bonusCode}`);
        hasBonusDiff = true;
      } else if (!devBonus) {
        console.log(`   ❌ 開発環境に存在しない: ${bonusCode}`);
        hasBonusDiff = true;
      } else {
        if (prodBonus.fixed_points !== devBonus.fixed_points) {
          console.log(`   ⚠️  点数が異なる: ${bonusCode}`);
          console.log(`      本番: ${prodBonus.fixed_points}点, 開発: ${devBonus.fixed_points}点`);
          hasBonusDiff = true;
        }
        if (prodBonus.is_active !== devBonus.is_active) {
          console.log(`   ⚠️  有効フラグが異なる: ${bonusCode}`);
          console.log(`      本番: ${prodBonus.is_active}, 開発: ${devBonus.is_active}`);
          hasBonusDiff = true;
        }
        if (prodBonus.insurance_type !== devBonus.insurance_type) {
          console.log(`   ⚠️  保険種別が異なる: ${bonusCode}`);
          console.log(`      本番: ${prodBonus.insurance_type}, 開発: ${devBonus.insurance_type}`);
          hasBonusDiff = true;
        }
      }
    }
    if (!hasBonusDiff) {
      console.log('   ✅ 差異なし');
    }
    console.log('');

    // 5. 患者データの確認（テストクリニック）
    console.log('📊 5. テストクリニックの患者データ（特別管理加算設定あり）:');
    console.log('─'.repeat(60));
    
    const prodPatients = await prodPool.query({
      text: `
        SELECT 
          id,
          patient_number,
          last_name || ' ' || first_name as name,
          special_management_types,
          special_management_start_date,
          special_management_end_date,
          insurance_type
        FROM patients
        WHERE facility_id = $1
          AND special_management_types IS NOT NULL
          AND array_length(special_management_types, 1) > 0
        ORDER BY created_at DESC
        LIMIT 5
      `,
      values: [testClinicProdId]
    });
    
    const devPatients = await devPool.query({
      text: `
        SELECT 
          id,
          patient_number,
          last_name || ' ' || first_name as name,
          special_management_types,
          special_management_start_date,
          special_management_end_date,
          insurance_type
        FROM patients
        WHERE facility_id = $1
          AND special_management_types IS NOT NULL
          AND array_length(special_management_types, 1) > 0
        ORDER BY created_at DESC
        LIMIT 5
      `,
      values: [testClinicDevId]
    });
    
    console.log(`   本番環境: ${prodPatients.rows.length}件`);
    prodPatients.rows.forEach((p: any) => {
      console.log(`   - ${p.name} (番号: ${p.patient_number})`);
      console.log(`     特別管理項目: ${JSON.stringify(p.special_management_types)}`);
      console.log(`     開始日: ${p.special_management_start_date || '未設定'}`);
      console.log(`     終了日: ${p.special_management_end_date || '未設定'}`);
      console.log(`     保険種別: ${p.insurance_type}`);
    });
    console.log(`\n   開発環境: ${devPatients.rows.length}件`);
    devPatients.rows.forEach((p: any) => {
      console.log(`   - ${p.name} (番号: ${p.patient_number})`);
      console.log(`     特別管理項目: ${JSON.stringify(p.special_management_types)}`);
      console.log(`     開始日: ${p.special_management_start_date || '未設定'}`);
      console.log(`     終了日: ${p.special_management_end_date || '未設定'}`);
      console.log(`     保険種別: ${p.insurance_type}`);
    });
    console.log('');

    console.log('─'.repeat(60));
    console.log('✅ 比較が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prodPool.end();
    await devPool.end();
  }
}

compareMasters()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('処理中にエラーが発生しました:', error);
    process.exit(1);
  });

