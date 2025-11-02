/**
 * テスト患者のターミナルケア加算を再計算
 */

import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

await client.connect();

console.log('=== ターミナルケア加算の再計算 ===\n');

// テスト患者の訪問記録を取得
const recordsResult = await client.query(`
  SELECT
    nr.id,
    nr.patient_id,
    nr.facility_id,
    nr.nurse_id,
    nr.visit_date,
    nr.actual_start_time,
    nr.actual_end_time,
    nr.is_terminal_care,
    p.death_date,
    p.death_location
  FROM nursing_records nr
  JOIN patients p ON nr.patient_id = p.id
  WHERE p.patient_number = 'TERMINAL-TEST-001'
  ORDER BY nr.visit_date
`);

console.log(`訪問記録: ${recordsResult.rows.length}件\n`);

for (const record of recordsResult.rows) {
  console.log(`\n訪問日: ${record.visit_date}`);
  console.log(`訪問記録ID: ${record.id}`);
  console.log(`is_terminal_care: ${record.is_terminal_care}`);

  // ターミナルケア加算の条件をチェック
  const visitDate = new Date(record.visit_date);
  const deathDate = new Date(record.death_date);
  const visitDateStr = visitDate.toISOString().split('T')[0];
  const deathDateStr = deathDate.toISOString().split('T')[0];
  const isDeathDate = visitDateStr === deathDateStr;

  console.log(`死亡日との照合: ${visitDateStr} === ${deathDateStr} => ${isDeathDate}`);

  if (isDeathDate) {
    console.log('✅ この訪問はターミナルケア加算の対象になる可能性があります');

    // 14日以内のターミナルケア訪問数を確認
    const startDate = new Date(deathDate);
    startDate.setDate(startDate.getDate() - 14);

    const terminalVisitsResult = await client.query(`
      SELECT COUNT(*) as count
      FROM nursing_records
      WHERE patient_id = $1
        AND is_terminal_care = true
        AND visit_date >= $2
        AND visit_date <= $3
    `, [record.patient_id, startDate.toISOString().split('T')[0], deathDateStr]);

    const visitCount = parseInt(terminalVisitsResult.rows[0].count);
    console.log(`14日以内のターミナルケア訪問: ${visitCount}回`);

    if (visitCount >= 2) {
      console.log('✅ 訪問回数の条件を満たしています（2回以上）');

      // terminal_care_1の加算マスタを取得
      const bonusResult = await client.query(`
        SELECT id, bonus_code, bonus_name, fixed_points
        FROM bonus_master
        WHERE bonus_code = 'terminal_care_1' AND is_active = true
      `);

      if (bonusResult.rows.length > 0) {
        const bonus = bonusResult.rows[0];
        console.log(`\n加算マスタ: ${bonus.bonus_name} (${bonus.fixed_points.toLocaleString()}円)`);

        // 既存の加算履歴を確認
        const existingHistoryResult = await client.query(`
          SELECT id FROM bonus_calculation_history
          WHERE nursing_record_id = $1 AND bonus_master_id = $2
        `, [record.id, bonus.id]);

        if (existingHistoryResult.rows.length > 0) {
          console.log('ℹ️  既に加算履歴が存在します');
        } else {
          // 加算履歴を作成
          const insertResult = await client.query(`
            INSERT INTO bonus_calculation_history (
              nursing_record_id,
              bonus_master_id,
              calculated_points,
              applied_version,
              calculation_details,
              created_at
            ) VALUES ($1, $2, $3, $4, $5, NOW())
            RETURNING id
          `, [
            record.id,
            bonus.id,
            bonus.fixed_points,
            'manual-recalc-1.0', // applied_version
            JSON.stringify({
              bonusCode: bonus.bonus_code,
              bonusName: bonus.bonus_name,
              points: bonus.fixed_points,
              reason: `ターミナルケア訪問${visitCount}回（14日以内）、死亡場所: ${record.death_location}`,
            })
          ]);

          console.log(`✅ 加算履歴を作成しました (ID: ${insertResult.rows[0].id})`);

          // nursing_recordsのcalculated_pointsを更新
          await client.query(`
            UPDATE nursing_records
            SET calculated_points = COALESCE(calculated_points, 0) + $1,
                updated_at = NOW()
            WHERE id = $2
          `, [bonus.fixed_points, record.id]);

          console.log(`✅ 訪問記録の点数を更新しました (+${bonus.fixed_points.toLocaleString()}円)`);
        }
      } else {
        console.log('❌ terminal_care_1の加算マスタが見つかりません');
      }
    } else {
      console.log(`❌ 訪問回数不足（${visitCount}回 / 2回必要）`);
    }
  }

  console.log('─'.repeat(60));
}

await client.end();
console.log('\n✅ 再計算完了');
console.log('\n次のステップ: 月次レセプト管理画面で2025年2月の医療保険レセプトを生成してください。');
