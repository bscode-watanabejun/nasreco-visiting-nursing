/**
 * ターミナルケア加算の計算テスト
 * 先ほど作成したテストデータを使って加算計算をテスト
 */

import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

await client.connect();

console.log('=== ターミナルケア加算計算テスト ===\n');

// テストケースの訪問記録ID
const testCases = [
  {
    id: 'f307b56a-c112-4f55-832d-2a34ad97b337',
    name: 'ケース1: 在宅死亡 + 2回訪問',
    expected: 'terminal_care_1 (25,000円) が算定される',
  },
  {
    id: 'a43e1724-123f-4056-9d33-fda6829be62f',
    name: 'ケース2: 施設死亡 + 2回訪問',
    expected: 'terminal_care_1 (25,000円) が算定される',
  },
  {
    id: '81dc58dc-d2ea-48f0-9c13-193932a1138b',
    name: 'ケース3: 在宅死亡 + 1回のみ',
    expected: 'ターミナルケア加算は算定されない',
  },
];

// 各テストケースを実行
for (const testCase of testCases) {
  console.log(`\n【${testCase.name}】`);
  console.log(`訪問記録ID: ${testCase.id}`);
  console.log(`期待結果: ${testCase.expected}\n`);

  // 訪問記録の詳細を確認
  const recordResult = await client.query(`
    SELECT
      nr.id,
      nr.visit_date,
      nr.is_terminal_care,
      p.death_date,
      p.death_location,
      p.insurance_type
    FROM nursing_records nr
    JOIN patients p ON nr.patient_id = p.id
    WHERE nr.id = $1
  `, [testCase.id]);

  const record = recordResult.rows[0];
  console.log('訪問記録情報:');
  console.log(`  訪問日: ${record.visit_date}`);
  console.log(`  ターミナルケア: ${record.is_terminal_care}`);
  console.log(`  患者死亡日: ${record.death_date}`);
  console.log(`  死亡場所: ${record.death_location}`);
  console.log(`  保険種別: ${record.insurance_type}\n`);

  // bonus-engineの条件評価をSQLで直接テスト
  // 死亡日前14日間の開始日を計算
  const deathDate = new Date(record.death_date);
  const startDate = new Date(deathDate);
  startDate.setDate(startDate.getDate() - 14);

  // 該当期間内のターミナルケア訪問記録を取得
  const terminalVisitsResult = await client.query(`
    SELECT
      id,
      visit_date,
      is_terminal_care
    FROM nursing_records
    WHERE patient_id = (SELECT patient_id FROM nursing_records WHERE id = $1)
      AND is_terminal_care = true
      AND visit_date >= $2
      AND visit_date <= $3
    ORDER BY visit_date
  `, [testCase.id, startDate.toISOString().split('T')[0], deathDate.toISOString().split('T')[0]]);

  console.log(`14日間（${startDate.toISOString().split('T')[0]} 〜 ${deathDate.toISOString().split('T')[0]}）のターミナルケア訪問:`);
  console.log(`  訪問回数: ${terminalVisitsResult.rows.length}回`);
  terminalVisitsResult.rows.forEach((visit, index) => {
    console.log(`  ${index + 1}. ${visit.visit_date}`);
  });
  console.log();

  // ターミナルケア加算の算定可否を判定
  const visitCount = terminalVisitsResult.rows.length;
  const requiredVisits = 2;
  const visitDateStr = new Date(record.visit_date).toISOString().split('T')[0];
  const deathDateStr = new Date(record.death_date).toISOString().split('T')[0];
  const isDeathDate = visitDateStr === deathDateStr;

  let canCalculate = false;
  let bonusCode = '';

  if (isDeathDate && visitCount >= requiredVisits) {
    if (record.death_location === 'home' && record.insurance_type === 'medical') {
      canCalculate = true;
      bonusCode = 'terminal_care_1';
    } else if (record.death_location === 'facility' && record.insurance_type === 'medical') {
      canCalculate = true;
      bonusCode = 'terminal_care_1';
    } else if (record.death_location === 'home' && record.insurance_type === 'care') {
      canCalculate = true;
      bonusCode = 'care_terminal_care';
    }
  }

  console.log('📊 算定判定:');
  if (canCalculate) {
    console.log(`  ✅ ${bonusCode} が算定可能`);

    // bonus_masterから加算情報を取得
    const bonusResult = await client.query(`
      SELECT bonus_name, fixed_points
      FROM bonus_master
      WHERE bonus_code = $1
    `, [bonusCode]);

    if (bonusResult.rows.length > 0) {
      const bonus = bonusResult.rows[0];
      console.log(`  加算名: ${bonus.bonus_name}`);
      console.log(`  点数: ${bonus.fixed_points.toLocaleString()}${record.insurance_type === 'medical' ? '円' : '単位'}`);
    }
  } else {
    console.log(`  ❌ ターミナルケア加算は算定不可`);
    if (!isDeathDate) {
      console.log(`     理由: 訪問日が死亡日ではない`);
    } else if (visitCount < requiredVisits) {
      console.log(`     理由: 訪問回数不足（${visitCount}回 / ${requiredVisits}回必要）`);
    }
  }

  console.log('\n' + '='.repeat(60));
}

await client.end();
console.log('\n✅ テスト完了');
