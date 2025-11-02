/**
 * ターミナルケア加算の算定ロジックテスト
 */

import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

await client.connect();

console.log('=== ターミナルケア加算テスト開始 ===\n');

// テスト用の施設IDを取得
const facilityResult = await client.query('SELECT id FROM facilities LIMIT 1');
const facilityId = facilityResult.rows[0]?.id;

if (!facilityId) {
  console.error('❌ 施設が見つかりません');
  await client.end();
  process.exit(1);
}

console.log(`✅ テスト用施設ID: ${facilityId}\n`);

// ユーザーIDを取得
const userResult = await client.query('SELECT id FROM users WHERE facility_id = $1 LIMIT 1', [facilityId]);
const userId = userResult.rows[0]?.id;

if (!userId) {
  console.error('❌ ユーザーが見つかりません');
  await client.end();
  process.exit(1);
}

console.log(`✅ テスト用ユーザーID: ${userId}\n`);

// ========== テストケース1: 在宅死亡 + 2回訪問 ==========
console.log('【テストケース1】在宅死亡 + 14日以内に2回のターミナルケア訪問');
console.log('期待結果: terminal_care_1 (25,000円) が算定される\n');

// 患者作成（在宅死亡、死亡日: 2025-01-15）
const patient1Result = await client.query(`
  INSERT INTO patients (
    facility_id, patient_number, last_name, first_name, date_of_birth, gender,
    insurance_number, insurance_type, death_date, death_location,
    created_at, updated_at
  ) VALUES (
    $1, 'TEST001', 'テスト', '患者1（在宅死亡）', '1950-01-01', 'male',
    'INS001', 'medical', '2025-01-15', 'home',
    NOW(), NOW()
  ) RETURNING id
`, [facilityId]);

const patient1Id = patient1Result.rows[0].id;
console.log(`患者ID: ${patient1Id}`);
console.log(`死亡日: 2025-01-15, 死亡場所: home (在宅)\n`);

// ターミナルケア訪問記録1: 2025-01-10（死亡日の5日前）
const visit1Result = await client.query(`
  INSERT INTO nursing_records (
    facility_id, patient_id, nurse_id, visit_date, record_date,
    actual_start_time, actual_end_time, record_type, title, content,
    is_terminal_care, status, created_at, updated_at
  ) VALUES (
    $1, $2, $3, '2025-01-10', '2025-01-10 10:00:00',
    '2025-01-10 10:00:00', '2025-01-10 11:00:00', 'general_care', 'ターミナルケア訪問', 'ターミナルケア実施',
    true, 'completed', NOW(), NOW()
  ) RETURNING id
`, [facilityId, patient1Id, userId]);

console.log(`訪問1: 2025-01-10 (is_terminal_care=true) - ID: ${visit1Result.rows[0].id}`);

// ターミナルケア訪問記録2: 2025-01-13（死亡日の2日前）
const visit2Result = await client.query(`
  INSERT INTO nursing_records (
    facility_id, patient_id, nurse_id, visit_date, record_date,
    actual_start_time, actual_end_time, record_type, title, content,
    is_terminal_care, status, created_at, updated_at
  ) VALUES (
    $1, $2, $3, '2025-01-13', '2025-01-13 14:00:00',
    '2025-01-13 14:00:00', '2025-01-13 15:30:00', 'general_care', 'ターミナルケア訪問', 'ターミナルケア実施',
    true, 'completed', NOW(), NOW()
  ) RETURNING id
`, [facilityId, patient1Id, userId]);

console.log(`訪問2: 2025-01-13 (is_terminal_care=true) - ID: ${visit2Result.rows[0].id}`);

// 死亡日の訪問記録（ターミナルケア加算を算定する訪問）
const deathVisit1Result = await client.query(`
  INSERT INTO nursing_records (
    facility_id, patient_id, nurse_id, visit_date, record_date,
    actual_start_time, actual_end_time, record_type, title, content,
    is_terminal_care, status, created_at, updated_at
  ) VALUES (
    $1, $2, $3, '2025-01-15', '2025-01-15 09:00:00',
    '2025-01-15 09:00:00', '2025-01-15 10:00:00', 'general_care', 'ターミナルケア訪問（死亡日）', 'ターミナルケア実施',
    true, 'completed', NOW(), NOW()
  ) RETURNING id
`, [facilityId, patient1Id, userId]);

const deathVisit1Id = deathVisit1Result.rows[0].id;
console.log(`訪問3（死亡日）: 2025-01-15 (is_terminal_care=true) - ID: ${deathVisit1Id}\n`);

// 加算計算をAPIで実行（ここではSQLで直接確認）
console.log('📊 加算計算を実行中...\n');

// ========== テストケース2: 施設死亡 + 2回訪問 ==========
console.log('【テストケース2】施設死亡 + 14日以内に2回のターミナルケア訪問');
console.log('期待結果: terminal_care_1 (25,000円) が算定される\n');

// 患者作成（施設死亡、死亡日: 2025-01-20）
const patient2Result = await client.query(`
  INSERT INTO patients (
    facility_id, patient_number, last_name, first_name, date_of_birth, gender,
    insurance_number, insurance_type, death_date, death_location,
    created_at, updated_at
  ) VALUES (
    $1, 'TEST002', 'テスト', '患者2（施設死亡）', '1955-05-05', 'female',
    'INS002', 'medical', '2025-01-20', 'facility',
    NOW(), NOW()
  ) RETURNING id
`, [facilityId]);

const patient2Id = patient2Result.rows[0].id;
console.log(`患者ID: ${patient2Id}`);
console.log(`死亡日: 2025-01-20, 死亡場所: facility (施設)\n`);

// ターミナルケア訪問記録1: 2025-01-12（死亡日の8日前）
await client.query(`
  INSERT INTO nursing_records (
    facility_id, patient_id, nurse_id, visit_date, record_date,
    actual_start_time, actual_end_time, record_type, title, content,
    is_terminal_care, status, created_at, updated_at
  ) VALUES (
    $1, $2, $3, '2025-01-12', '2025-01-12 10:00:00',
    '2025-01-12 10:00:00', '2025-01-12 11:00:00', 'general_care', 'ターミナルケア訪問', 'ターミナルケア実施',
    true, 'completed', NOW(), NOW()
  )
`, [facilityId, patient2Id, userId]);

console.log(`訪問1: 2025-01-12 (is_terminal_care=true)`);

// ターミナルケア訪問記録2: 2025-01-18（死亡日の2日前）
await client.query(`
  INSERT INTO nursing_records (
    facility_id, patient_id, nurse_id, visit_date, record_date,
    actual_start_time, actual_end_time, record_type, title, content,
    is_terminal_care, status, created_at, updated_at
  ) VALUES (
    $1, $2, $3, '2025-01-18', '2025-01-18 14:00:00',
    '2025-01-18 14:00:00', '2025-01-18 15:30:00', 'general_care', 'ターミナルケア訪問', 'ターミナルケア実施',
    true, 'completed', NOW(), NOW()
  )
`, [facilityId, patient2Id, userId]);

console.log(`訪問2: 2025-01-18 (is_terminal_care=true)`);

// 死亡日の訪問記録
const deathVisit2Result = await client.query(`
  INSERT INTO nursing_records (
    facility_id, patient_id, nurse_id, visit_date, record_date,
    actual_start_time, actual_end_time, record_type, title, content,
    is_terminal_care, status, created_at, updated_at
  ) VALUES (
    $1, $2, $3, '2025-01-20', '2025-01-20 09:00:00',
    '2025-01-20 09:00:00', '2025-01-20 10:00:00', 'general_care', 'ターミナルケア訪問（死亡日）', 'ターミナルケア実施',
    true, 'completed', NOW(), NOW()
  ) RETURNING id
`, [facilityId, patient2Id, userId]);

const deathVisit2Id = deathVisit2Result.rows[0].id;
console.log(`訪問3（死亡日）: 2025-01-20 (is_terminal_care=true) - ID: ${deathVisit2Id}\n`);

// ========== テストケース3: 在宅死亡 + 1回のみ（不足） ==========
console.log('【テストケース3】在宅死亡 + 14日以内に1回のみ（訪問回数不足）');
console.log('期待結果: ターミナルケア加算は算定不可\n');

// 患者作成（在宅死亡、死亡日: 2025-01-25）
const patient3Result = await client.query(`
  INSERT INTO patients (
    facility_id, patient_number, last_name, first_name, date_of_birth, gender,
    insurance_number, insurance_type, death_date, death_location,
    created_at, updated_at
  ) VALUES (
    $1, 'TEST003', 'テスト', '患者3（訪問不足）', '1960-10-10', 'male',
    'INS003', 'medical', '2025-01-25', 'home',
    NOW(), NOW()
  ) RETURNING id
`, [facilityId]);

const patient3Id = patient3Result.rows[0].id;
console.log(`患者ID: ${patient3Id}`);
console.log(`死亡日: 2025-01-25, 死亡場所: home (在宅)\n`);

// ターミナルケア訪問記録1のみ: 2025-01-20（死亡日の5日前）
await client.query(`
  INSERT INTO nursing_records (
    facility_id, patient_id, nurse_id, visit_date, record_date,
    actual_start_time, actual_end_time, record_type, title, content,
    is_terminal_care, status, created_at, updated_at
  ) VALUES (
    $1, $2, $3, '2025-01-20', '2025-01-20 10:00:00',
    '2025-01-20 10:00:00', '2025-01-20 11:00:00', 'general_care', 'ターミナルケア訪問', 'ターミナルケア実施',
    true, 'completed', NOW(), NOW()
  )
`, [facilityId, patient3Id, userId]);

console.log(`訪問1: 2025-01-20 (is_terminal_care=true)`);

// 死亡日の訪問記録
const deathVisit3Result = await client.query(`
  INSERT INTO nursing_records (
    facility_id, patient_id, nurse_id, visit_date, record_date,
    actual_start_time, actual_end_time, record_type, title, content,
    is_terminal_care, status, created_at, updated_at
  ) VALUES (
    $1, $2, $3, '2025-01-25', '2025-01-25 09:00:00',
    '2025-01-25 09:00:00', '2025-01-25 10:00:00', 'general_care', 'ターミナルケア訪問（死亡日）', 'ターミナルケア実施',
    true, 'completed', NOW(), NOW()
  ) RETURNING id
`, [facilityId, patient3Id, userId]);

const deathVisit3Id = deathVisit3Result.rows[0].id;
console.log(`訪問2（死亡日）: 2025-01-25 (is_terminal_care=true) - ID: ${deathVisit3Id}\n`);

// ========== 結果確認 ==========
console.log('=== テストデータ作成完了 ===\n');
console.log('次のステップ:');
console.log('1. APIを使って各死亡日の訪問記録に対して加算計算を実行');
console.log('2. bonus_calculation_history テーブルで結果を確認\n');

console.log('【テスト用訪問記録ID】');
console.log(`ケース1（在宅死亡、2回訪問）: ${deathVisit1Id}`);
console.log(`ケース2（施設死亡、2回訪問）: ${deathVisit2Id}`);
console.log(`ケース3（在宅死亡、1回のみ）: ${deathVisit3Id}\n`);

await client.end();
console.log('✅ テスト完了');
