/**
 * 本番環境「訪問看護ステーションソレア春日部」の特別管理マスタ確認スクリプト
 * 
 * ⚠️ 本番DBへの読み取り専用アクセスのみ。データの変更は一切行いません。
 */

import { Pool } from 'pg';

const PROD_DB_URL = 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function checkSoleraSpecialManagement() {
  console.log('🔍 本番環境「訪問看護ステーションソレア春日部」の特別管理マスタ確認\n');
  console.log('⚠️  本番データベースに接続します（読み取り専用）\n');
  
  const prodPool = new Pool({ connectionString: PROD_DB_URL });

  try {
    // 1. 施設情報の確認
    console.log('📊 1. 施設情報:');
    console.log('─'.repeat(60));
    
    const facility = await prodPool.query(`
      SELECT id, name, facility_code
      FROM facilities
      WHERE name LIKE '%ソレア%' OR name LIKE '%春日部%'
      LIMIT 1
    `);
    
    if (facility.rows.length === 0) {
      console.log('   ❌ 「訪問看護ステーションソレア春日部」が見つかりませんでした。');
      await prodPool.end();
      return;
    }
    
    const soleraFacility = facility.rows[0];
    const facilityId = soleraFacility.id;
    
    console.log(`   ID: ${facilityId}`);
    console.log(`   名称: ${soleraFacility.name}`);
    console.log(`   施設コード: ${soleraFacility.facility_code || '未設定'}\n`);

    // 2. 特別管理マスタの確認（isActiveの条件なしで全件取得）
    console.log('📊 2. 特別管理マスタ（全データ、isActive条件なし）:');
    console.log('─'.repeat(60));
    
    const allDefinitions = await prodPool.query({
      text: `
        SELECT 
          smd.id,
          smd.category,
          smd.display_name,
          smd.insurance_type,
          smd.monthly_points,
          smd.is_active,
          smd.display_order,
          smd.description,
          smd.facility_id,
          COUNT(smf.id) as field_count
        FROM special_management_definitions smd
        LEFT JOIN special_management_fields smf ON smd.id = smf.definition_id
        WHERE smd.facility_id = $1
        GROUP BY smd.id, smd.category, smd.display_name, smd.insurance_type, 
                 smd.monthly_points, smd.is_active, smd.display_order, smd.description, smd.facility_id
        ORDER BY smd.display_order
      `,
      values: [facilityId]
    });
    
    console.log(`   総件数: ${allDefinitions.rows.length}件\n`);
    
    if (allDefinitions.rows.length === 0) {
      console.log('   ❌ 特別管理マスタのデータが1件も見つかりませんでした。\n');
      console.log('   💡 データが存在しない可能性が高いです。');
      console.log('   データを投入するには、以下のコマンドを実行してください:');
      console.log(`      tsx server/seed-special-management.ts ${facilityId}\n`);
    } else {
      console.log('   データ一覧:');
      allDefinitions.rows.forEach((row: any) => {
        console.log(`   ${row.is_active ? '✅' : '❌'} ${row.display_name} (${row.category})`);
        console.log(`      保険種別: ${row.insurance_type}`);
        console.log(`      月額加算: ${row.monthly_points}円`);
        console.log(`      状態: ${row.is_active ? '有効' : '無効'}`);
        console.log(`      フィールド数: ${row.field_count}個`);
        console.log(`      facility_id: ${row.facility_id}`);
        if (row.description) {
          console.log(`      説明: ${row.description}`);
        }
        console.log('');
      });

      // 3. APIエンドポイントと同じ条件で確認（isActive = trueのみ）
      console.log('📊 3. APIエンドポイントと同じ条件（isActive = true）:');
      console.log('─'.repeat(60));
      
      const activeDefinitions = await prodPool.query({
        text: `
          SELECT 
            smd.id,
            smd.category,
            smd.display_name,
            smd.insurance_type,
            smd.monthly_points,
            smd.is_active,
            smd.display_order
          FROM special_management_definitions smd
          WHERE smd.facility_id = $1
            AND smd.is_active = true
          ORDER BY smd.display_order
        `,
        values: [facilityId]
      });
      
      console.log(`   有効なマスタ: ${activeDefinitions.rows.length}件\n`);
      if (activeDefinitions.rows.length === 0) {
        console.log('   ⚠️  isActive = true のデータが0件です。');
        console.log('   これが画面に表示されない原因です。\n');
      } else {
        activeDefinitions.rows.forEach((row: any) => {
          console.log(`   - ${row.display_name} (${row.category})`);
        });
      }
    }

    // 4. 他の施設のデータも確認（比較用）
    console.log('\n📊 4. 他の施設の特別管理マスタ（比較用）:');
    console.log('─'.repeat(60));
    
    const otherFacilities = await prodPool.query(`
      SELECT 
        f.id,
        f.name,
        COUNT(smd.id) as definition_count,
        COUNT(smd.id) FILTER (WHERE smd.is_active = true) as active_count
      FROM facilities f
      LEFT JOIN special_management_definitions smd ON f.id = smd.facility_id
      GROUP BY f.id, f.name
      ORDER BY definition_count DESC
      LIMIT 5
    `);
    
    otherFacilities.rows.forEach((row: any) => {
      console.log(`   ${row.name}: 総数 ${row.definition_count}件、有効 ${row.active_count}件`);
    });

    // 5. テーブル構造の確認
    console.log('\n📊 5. テーブル構造の確認:');
    console.log('─'.repeat(60));
    
    const tableExists = await prodPool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'special_management_definitions'
      )
    `);
    
    console.log(`   special_management_definitionsテーブル: ${tableExists.rows[0].exists ? '✅ 存在する' : '❌ 存在しない'}`);
    
    const columns = await prodPool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = 'special_management_definitions'
      ORDER BY ordinal_position
    `);
    
    console.log(`   カラム数: ${columns.rows.length}個`);
    columns.rows.forEach((col: any) => {
      console.log(`   - ${col.column_name} (${col.data_type}, NULL許可: ${col.is_nullable})`);
    });

    console.log('\n─'.repeat(60));
    console.log('✅ 確認が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prodPool.end();
  }
}

checkSoleraSpecialManagement()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('処理中にエラーが発生しました:', error);
    process.exit(1);
  });

