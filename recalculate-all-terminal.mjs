/**
 * 全ターミナルケア加算の再計算
 */

import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

await client.connect();

console.log('=== 全ターミナルケア加算の再計算 ===\n');

// 対象患者リスト
const patients = [
  { number: 'CARE-TERMINAL-001', name: '佐藤 花子', type: 'care_terminal_care' },
  { number: 'MEDICAL-FACILITY-001', name: '高橋 次郎', type: 'terminal_care_1' },
];

for (const patientInfo of patients) {
  console.log(`\n【${patientInfo.name}】`);

  const patientResult = await client.query(`
    SELECT
      p.id as patient_id,
      p.death_date,
      p.death_location,
      p.insurance_type
    FROM patients p
    WHERE p.patient_number = $1
  `, [patientInfo.number]);

  if (patientResult.rows.length === 0) {
    console.log('❌ 患者が見つかりません\n');
    continue;
  }

  const patient = patientResult.rows[0];
  console.log(`患者ID: ${patient.patient_id}`);
  console.log(`死亡日: ${patient.death_date}, 場所: ${patient.death_location}, 保険: ${patient.insurance_type}`);

  // 死亡日の訪問記録を取得
  const recordResult = await client.query(`
    SELECT id, visit_date
    FROM nursing_records
    WHERE patient_id = $1
      AND visit_date = $2
      AND is_terminal_care = true
    ORDER BY visit_date DESC
    LIMIT 1
  `, [patient.patient_id, patient.death_date]);

  if (recordResult.rows.length === 0) {
    console.log('❌ 死亡日の訪問記録が見つかりません\n');
    continue;
  }

  const record = recordResult.rows[0];
  console.log(`訪問記録ID: ${record.id}`);

  // 14日以内のターミナルケア訪問数を確認
  const deathDate = new Date(patient.death_date);
  const startDate = new Date(deathDate);
  startDate.setDate(startDate.getDate() - 14);

  const visitCountResult = await client.query(`
    SELECT COUNT(*) as count
    FROM nursing_records
    WHERE patient_id = $1
      AND is_terminal_care = true
      AND visit_date >= $2
      AND visit_date <= $3
  `, [patient.patient_id, startDate.toISOString().split('T')[0], deathDate.toISOString().split('T')[0]]);

  const visitCount = parseInt(visitCountResult.rows[0].count);
  console.log(`14日以内のターミナルケア訪問: ${visitCount}回`);

  if (visitCount < 2) {
    console.log(`❌ 訪問回数不足（${visitCount}回 / 2回必要）\n`);
    continue;
  }

  // 加算マスタを取得
  const bonusResult = await client.query(`
    SELECT id, bonus_code, bonus_name, fixed_points
    FROM bonus_master
    WHERE bonus_code = $1 AND is_active = true
  `, [patientInfo.type]);

  if (bonusResult.rows.length === 0) {
    console.log(`❌ 加算マスタ（${patientInfo.type}）が見つかりません\n`);
    continue;
  }

  const bonus = bonusResult.rows[0];
  console.log(`加算: ${bonus.bonus_name} (${bonus.fixed_points.toLocaleString()}${patient.insurance_type === 'medical' ? '円' : '単位'})`);

  // 既存の加算履歴をチェック
  const existingResult = await client.query(`
    SELECT id FROM bonus_calculation_history
    WHERE nursing_record_id = $1 AND bonus_master_id = $2
  `, [record.id, bonus.id]);

  if (existingResult.rows.length > 0) {
    console.log('ℹ️  既に加算履歴が存在します\n');
    continue;
  }

  // 加算履歴を作成
  await client.query(`
    INSERT INTO bonus_calculation_history (
      nursing_record_id,
      bonus_master_id,
      calculated_points,
      applied_version,
      calculation_details,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, NOW())
  `, [
    record.id,
    bonus.id,
    bonus.fixed_points,
    'test-recalc-1.0',
    JSON.stringify({
      bonusCode: bonus.bonus_code,
      bonusName: bonus.bonus_name,
      points: bonus.fixed_points,
      reason: `ターミナルケア訪問${visitCount}回（14日以内）、死亡場所: ${patient.death_location}`,
    })
  ]);

  // nursing_recordsの点数を更新
  await client.query(`
    UPDATE nursing_records
    SET calculated_points = COALESCE(calculated_points, 0) + $1,
        updated_at = NOW()
    WHERE id = $2
  `, [bonus.fixed_points, record.id]);

  console.log(`✅ 加算履歴を作成しました (+${bonus.fixed_points.toLocaleString()}${patient.insurance_type === 'medical' ? '円' : '単位'})\n`);
}

console.log('='.repeat(70));
console.log('\n✅ 再計算完了\n');

// 結果確認
console.log('=== 結果確認 ===\n');

for (const patientInfo of patients) {
  const result = await client.query(`
    SELECT
      p.patient_number,
      p.last_name || ' ' || p.first_name as patient_name,
      p.insurance_type,
      bm.bonus_code,
      bm.bonus_name,
      bch.calculated_points
    FROM patients p
    JOIN nursing_records nr ON nr.patient_id = p.id
    LEFT JOIN bonus_calculation_history bch ON bch.nursing_record_id = nr.id
    LEFT JOIN bonus_master bm ON bch.bonus_master_id = bm.id
    WHERE p.patient_number = $1
      AND nr.visit_date = p.death_date
  `, [patientInfo.number]);

  if (result.rows.length > 0) {
    const r = result.rows[0];
    console.log(`${r.patient_name} (${r.patient_number})`);
    if (r.bonus_code) {
      console.log(`  ✅ ${r.bonus_name}: ${r.calculated_points}${r.insurance_type === 'medical' ? '円' : '単位'}`);
    } else {
      console.log(`  ❌ 加算なし`);
    }
  }
}

await client.end();
console.log('\n✅ 完了');
