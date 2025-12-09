/**
 * 本番環境の特別管理加算が適用されない原因調査スクリプト
 * 
 * ⚠️ 本番DBへの読み取り専用アクセスのみ。データの変更は一切行いません。
 */

import { Pool } from 'pg';

const PROD_DB_URL = 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function investigateSpecialManagement() {
  console.log('🔍 本番環境の特別管理加算が適用されない原因調査\n');
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
    console.log(`   名称: ${soleraFacility.name}\n`);

    // 2. 患者「矢ヶ部 恭子」の情報確認
    console.log('📊 2. 患者「矢ヶ部 恭子」の情報:');
    console.log('─'.repeat(60));
    
    const patient = await prodPool.query({
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
          AND (last_name LIKE '%矢ヶ部%' OR first_name LIKE '%恭子%')
        LIMIT 1
      `,
      values: [facilityId]
    });
    
    if (patient.rows.length === 0) {
      console.log('   ❌ 患者「矢ヶ部 恭子」が見つかりませんでした。');
      await prodPool.end();
      return;
    }
    
    const patientData = patient.rows[0];
    const patientId = patientData.id;
    
    console.log(`   ID: ${patientData.id}`);
    console.log(`   患者番号: ${patientData.patient_number}`);
    console.log(`   氏名: ${patientData.name}`);
    console.log(`   保険種別: ${patientData.insurance_type}`);
    console.log(`   特別管理項目: ${JSON.stringify(patientData.special_management_types)}`);
    console.log(`   開始日: ${patientData.special_management_start_date || '未設定'}`);
    console.log(`   終了日: ${patientData.special_management_end_date || '未設定（継続中）'}\n`);

    // 3. 2025年11月29日の訪問記録を確認
    console.log('📊 3. 2025年11月29日の訪問記録:');
    console.log('─'.repeat(60));
    
    const record = await prodPool.query({
      text: `
        SELECT 
          id,
          visit_date,
          actual_start_time,
          actual_end_time,
          special_management_data,
          status,
          created_at,
          updated_at
        FROM nursing_records
        WHERE patient_id = $1
          AND visit_date = '2025-11-29'
          AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `,
      values: [patientId]
    });
    
    if (record.rows.length === 0) {
      console.log('   ❌ 2025年11月29日の訪問記録が見つかりませんでした。');
      await prodPool.end();
      return;
    }
    
    const recordData = record.rows[0];
    console.log(`   訪問記録ID: ${recordData.id}`);
    console.log(`   訪問日: ${recordData.visit_date}`);
    console.log(`   訪問開始時刻: ${recordData.actual_start_time || '未設定'}`);
    console.log(`   訪問終了時刻: ${recordData.actual_end_time || '未設定'}`);
    console.log(`   ステータス: ${recordData.status}`);
    console.log(`   特管記録データ: ${JSON.stringify(recordData.special_management_data || {}, null, 2)}`);
    console.log(`   作成日時: ${recordData.created_at}`);
    console.log(`   更新日時: ${recordData.updated_at}\n`);

    // 4. 加算計算履歴を確認
    console.log('📊 4. 加算計算履歴:');
    console.log('─'.repeat(60));
    
    const bonusHistory = await prodPool.query({
      text: `
        SELECT 
          bch.id,
          bch.bonus_master_id,
          bch.calculated_points,
          bch.calculation_details,
          bm.bonus_code,
          bm.bonus_name,
          bch.created_at
        FROM bonus_calculation_history bch
        LEFT JOIN bonus_master bm ON bch.bonus_master_id = bm.id
        WHERE bch.nursing_record_id = $1
        ORDER BY bch.created_at DESC
      `,
      values: [recordData.id]
    });
    
    console.log(`   加算計算履歴: ${bonusHistory.rows.length}件\n`);
    if (bonusHistory.rows.length === 0) {
      console.log('   ⚠️  加算計算履歴がありません。加算が計算されていない可能性があります。\n');
    } else {
      bonusHistory.rows.forEach((history: any) => {
        console.log(`   - ${history.bonus_name} (${history.bonus_code}): ${history.calculated_points}点`);
        if (history.calculation_details) {
          console.log(`     詳細: ${JSON.stringify(history.calculation_details, null, 2)}`);
        }
      });
      console.log('');
    }

    // 5. 特別管理加算マスタの確認
    console.log('📊 5. 特別管理加算マスタ:');
    console.log('─'.repeat(60));
    
    const specialManagementBonuses = await prodPool.query({
      text: `
        SELECT 
          id,
          bonus_code,
          bonus_name,
          insurance_type,
          fixed_points,
          is_active,
          created_at,
          updated_at
        FROM bonus_master
        WHERE (facility_id IS NULL OR facility_id = $1)
          AND bonus_code IN ('special_management_1', 'special_management_2')
          AND is_active = true
        ORDER BY bonus_code
      `,
      values: [facilityId]
    });
    
    console.log(`   特別管理加算マスタ: ${specialManagementBonuses.rows.length}件\n`);
    specialManagementBonuses.rows.forEach((bonus: any) => {
      console.log(`   - ${bonus.bonus_name} (${bonus.bonus_code})`);
      console.log(`     保険種別: ${bonus.insurance_type}, 点数: ${bonus.fixed_points}点`);
      console.log(`     作成日時: ${bonus.created_at}`);
      console.log(`     更新日時: ${bonus.updated_at}`);
    });
    console.log('');

    // 6. 日付範囲チェックの検証
    console.log('📊 6. 日付範囲チェックの検証:');
    console.log('─'.repeat(60));
    
    const visitDate = new Date(recordData.visit_date);
    const startDate = patientData.special_management_start_date ? new Date(patientData.special_management_start_date) : null;
    const endDate = patientData.special_management_end_date ? new Date(patientData.special_management_end_date) : null;
    
    console.log(`   訪問日: ${visitDate.toLocaleDateString('ja-JP')}`);
    console.log(`   開始日: ${startDate ? startDate.toLocaleDateString('ja-JP') : '未設定'}`);
    console.log(`   終了日: ${endDate ? endDate.toLocaleDateString('ja-JP') : '未設定（継続中）'}`);
    
    if (startDate) {
      const startDateOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
      const visitDateOnly = new Date(visitDate.getFullYear(), visitDate.getMonth(), visitDate.getDate());
      
      if (visitDateOnly < startDateOnly) {
        console.log(`   ❌ 訪問日が開始日より前です（範囲外）`);
      } else {
        console.log(`   ✅ 訪問日は開始日以降です`);
      }
    } else {
      console.log(`   ⚠️  開始日が未設定です`);
    }
    
    if (endDate) {
      const endDateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
      const visitDateOnly = new Date(visitDate.getFullYear(), visitDate.getMonth(), visitDate.getDate());
      
      if (visitDateOnly > endDateOnly) {
        console.log(`   ❌ 訪問日が終了日より後です（範囲外）`);
      } else {
        console.log(`   ✅ 訪問日は終了日以前です`);
      }
    } else {
      console.log(`   ✅ 終了日が未設定（継続中）のため、開始日以降は有効`);
    }
    console.log('');

    // 7. 特別管理定義マスタの確認
    console.log('📊 7. 特別管理定義マスタ:');
    console.log('─'.repeat(60));
    
    if (patientData.special_management_types && patientData.special_management_types.length > 0) {
      const definitions = await prodPool.query({
        text: `
          SELECT 
            id,
            category,
            display_name,
            insurance_type,
            monthly_points,
            is_active
          FROM special_management_definitions
          WHERE facility_id = $1
            AND category = ANY($2)
            AND is_active = true
        `,
        values: [facilityId, patientData.special_management_types]
      });
      
      console.log(`   特別管理定義: ${definitions.rows.length}件\n`);
      definitions.rows.forEach((def: any) => {
        console.log(`   - ${def.display_name} (${def.category})`);
        console.log(`     保険種別: ${def.insurance_type}, 月額: ${def.monthly_points}円`);
      });
      
      if (definitions.rows.length === 0) {
        console.log('   ⚠️  患者の特別管理項目に対応する定義が見つかりませんでした。');
      }
    } else {
      console.log('   ⚠️  患者に特別管理項目が設定されていません。');
    }
    console.log('');

    // 8. 訪問記録の更新履歴を確認（最近の更新かどうか）
    console.log('📊 8. 訪問記録の更新履歴:');
    console.log('─'.repeat(60));
    console.log(`   作成日時: ${recordData.created_at}`);
    console.log(`   更新日時: ${recordData.updated_at}`);
    
    const now = new Date();
    const updatedAt = new Date(recordData.updated_at);
    const timeDiff = now.getTime() - updatedAt.getTime();
    const hoursDiff = Math.floor(timeDiff / (1000 * 60 * 60));
    
    console.log(`   最終更新からの経過時間: ${hoursDiff}時間`);
    if (hoursDiff > 24) {
      console.log('   ⚠️  訪問記録が24時間以上更新されていません。最新のコードで再計算が必要かもしれません。');
    }
    console.log('');

    console.log('─'.repeat(60));
    console.log('✅ 調査が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prodPool.end();
  }
}

investigateSpecialManagement()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('処理中にエラーが発生しました:', error);
    process.exit(1);
  });

