/**
 * 全ターミナルケア加算の統合テスト
 * APIを直接呼び出して加算計算をテスト
 */

import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

await client.connect();

console.log('=== 全ターミナルケア加算テスト ===\n');

// テスト1: ターミナルケア加算（介護保険） - care_terminal_care
console.log('【テスト1】ターミナルケア加算（介護保険）');
console.log('期待: 2,500単位\n');

const carePatientResult = await client.query(`
  SELECT id FROM patients WHERE patient_number = 'CARE-TERMINAL-001'
`);

if (carePatientResult.rows.length > 0) {
  const carePatientId = carePatientResult.rows[0].id;

  // 死亡日の訪問記録を取得
  const careRecordResult = await client.query(`
    SELECT
      nr.id,
      nr.visit_date,
      nr.calculated_points,
      p.death_date
    FROM nursing_records nr
    JOIN patients p ON nr.patient_id = p.id
    WHERE nr.patient_id = $1
      AND nr.visit_date = p.death_date
    ORDER BY nr.visit_date DESC
    LIMIT 1
  `, [carePatientId]);

  if (careRecordResult.rows.length > 0) {
    const record = careRecordResult.rows[0];
    console.log(`訪問記録ID: ${record.id}`);
    console.log(`訪問日: ${record.visit_date}`);
    console.log(`死亡日: ${record.death_date}`);
    console.log(`計算点数: ${record.calculated_points || 'NULL'}\n`);

    // 加算履歴を確認
    const historyResult = await client.query(`
      SELECT
        bm.bonus_code,
        bm.bonus_name,
        bch.calculated_points,
        bch.calculation_details
      FROM bonus_calculation_history bch
      JOIN bonus_master bm ON bch.bonus_master_id = bm.id
      WHERE bch.nursing_record_id = $1
    `, [record.id]);

    if (historyResult.rows.length > 0) {
      console.log('✅ 加算が計算されています:');
      historyResult.rows.forEach(h => {
        console.log(`  - ${h.bonus_name}: ${h.calculated_points}単位`);
        console.log(`    詳細: ${JSON.stringify(h.calculation_details, null, 2)}`);
      });
    } else {
      console.log('❌ 加算履歴が見つかりません');
    }
  } else {
    console.log('❌ 死亡日の訪問記録が見つかりません');
  }
} else {
  console.log('❌ テスト患者が見つかりません');
}

console.log('\n' + '='.repeat(70) + '\n');

// テスト2: 訪問看護ターミナルケア療養費1（医療保険・施設死亡）
console.log('【テスト2】訪問看護ターミナルケア療養費1（医療保険・施設死亡）');
console.log('期待: 25,000円\n');

// 施設死亡のテスト患者を作成
const facilityResult = await client.query('SELECT id FROM facilities WHERE id = $1', ['fac-osaka-branch']);
const facilityId = facilityResult.rows[0].id;

const userResult = await client.query('SELECT id FROM users WHERE facility_id = $1 LIMIT 1', [facilityId]);
const userId = userResult.rows[0].id;

// 既存のテスト患者をチェック
const existingPatient = await client.query(`
  SELECT id FROM patients WHERE patient_number = 'MEDICAL-FACILITY-001'
`);

let medicalFacilityPatientId;

if (existingPatient.rows.length > 0) {
  medicalFacilityPatientId = existingPatient.rows[0].id;
  // 既存の訪問記録を削除
  await client.query('DELETE FROM bonus_calculation_history WHERE nursing_record_id IN (SELECT id FROM nursing_records WHERE patient_id = $1)', [medicalFacilityPatientId]);
  await client.query('DELETE FROM nursing_records WHERE patient_id = $1', [medicalFacilityPatientId]);
} else {
  // 新規患者作成
  const newPatientResult = await client.query(`
    INSERT INTO patients (
      facility_id, patient_number, last_name, first_name, date_of_birth, gender,
      insurance_number, insurance_type, death_date, death_location,
      created_at, updated_at
    ) VALUES (
      $1, 'MEDICAL-FACILITY-001', '高橋', '次郎', '1940-01-01', 'male',
      'MED-FAC-001', 'medical', '2025-04-15', 'facility',
      NOW(), NOW()
    ) RETURNING id
  `, [facilityId]);

  medicalFacilityPatientId = newPatientResult.rows[0].id;

  // 保険証を追加
  await client.query(`
    INSERT INTO insurance_cards (
      facility_id, patient_id, card_type, insurer_number, insured_number,
      valid_from, valid_until, created_at, updated_at
    ) VALUES (
      $1, $2, 'medical', '12345678', 'MED-FAC-001',
      '2025-01-01', '2025-12-31', NOW(), NOW()
    )
  `, [facilityId, medicalFacilityPatientId]);
}

console.log(`患者ID: ${medicalFacilityPatientId}`);
console.log(`死亡日: 2025-04-15, 死亡場所: facility（施設）\n`);

// 訪問記録を作成（API経由ではなく直接挿入）
await client.query(`
  INSERT INTO nursing_records (
    facility_id, patient_id, nurse_id, visit_date, record_date,
    actual_start_time, actual_end_time, record_type, title, content,
    is_terminal_care, status, created_at, updated_at
  ) VALUES
    ($1, $2, $3, '2025-04-05', '2025-04-05 10:00:00',
     '2025-04-05 10:00:00', '2025-04-05 11:00:00',
     'general_care', 'ターミナルケア訪問1', 'ターミナルケア実施',
     true, 'completed', NOW(), NOW()),
    ($1, $2, $3, '2025-04-10', '2025-04-10 14:00:00',
     '2025-04-10 14:00:00', '2025-04-10 15:30:00',
     'general_care', 'ターミナルケア訪問2', 'ターミナルケア実施',
     true, 'completed', NOW(), NOW()),
    ($1, $2, $3, '2025-04-15', '2025-04-15 09:00:00',
     '2025-04-15 09:00:00', '2025-04-15 10:00:00',
     'general_care', 'ターミナルケア訪問（死亡日）', 'ターミナルケア実施',
     true, 'completed', NOW(), NOW())
`, [facilityId, medicalFacilityPatientId, userId]);

console.log('✅ 訪問記録を3件作成しました\n');
console.log('⚠️  注意: 直接SQL挿入のため、加算計算は手動で実行する必要があります\n');

console.log('='.repeat(70) + '\n');

await client.end();
console.log('✅ テスト準備完了');
console.log('\n次のステップ: 加算再計算スクリプトを実行してください');
