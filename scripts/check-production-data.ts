import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

// WebSocket設定
neonConfig.webSocketConstructor = ws;

const PROD_DB_URL = 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function main() {
  const pool = new Pool({ connectionString: PROD_DB_URL });

  try {
    console.log('=== 本番環境の既存データ詳細確認 ===\n');

    // 施設情報
    console.log('【施設情報】');
    const facilities = await pool.query('SELECT id, name FROM facilities ORDER BY id');
    facilities.rows.forEach(f => {
      console.log(`  ID: ${f.id}, 名称: ${f.name}`);
    });

    // ユーザー情報（パスワードは除外）
    console.log('\n【ユーザー情報】');
    const users = await pool.query(`
      SELECT u.id, u.username, u.role, u.full_name, f.name as facility_name
      FROM users u
      JOIN facilities f ON u.facility_id = f.id
      ORDER BY u.id
    `);
    users.rows.forEach(u => {
      console.log(`  ID: ${u.id}, ユーザー名: ${u.username}, 名前: ${u.full_name}, 役割: ${u.role}, 施設: ${u.facility_name}`);
    });

    // 患者情報（基本情報のみ）
    console.log('\n【患者情報】');
    const patients = await pool.query(`
      SELECT p.id, p.last_name || ' ' || p.first_name as name, p.is_active, f.name as facility_name
      FROM patients p
      JOIN facilities f ON p.facility_id = f.id
      ORDER BY p.id
    `);
    console.log(`  総患者数: ${patients.rows.length}名`);
    patients.rows.forEach(p => {
      console.log(`    ID: ${p.id}, 名前: ${p.name}, アクティブ: ${p.is_active ? '有効' : '無効'}, 施設: ${p.facility_name}`);
    });

    // 看護記録
    console.log('\n【看護記録】');
    const records = await pool.query(`
      SELECT
        DATE(nr.visit_date) as visit_date,
        COUNT(*) as count,
        f.name as facility_name
      FROM nursing_records nr
      JOIN facilities f ON nr.facility_id = f.id
      GROUP BY DATE(nr.visit_date), f.name
      ORDER BY visit_date DESC
      LIMIT 10
    `);
    console.log(`  最近の記録（直近10日分）:`);
    records.rows.forEach(r => {
      console.log(`    ${r.visit_date}: ${r.count}件 (施設: ${r.facility_name})`);
    });

    // 介護計画
    console.log('\n【介護計画】');
    const carePlans = await pool.query(`
      SELECT
        cp.id,
        p.last_name || ' ' || p.first_name as patient_name,
        cp.plan_period_start,
        cp.plan_period_end,
        f.name as facility_name
      FROM care_plans cp
      JOIN patients p ON cp.patient_id = p.id
      JOIN facilities f ON cp.facility_id = f.id
      ORDER BY cp.plan_period_start DESC
    `);
    console.log(`  総介護計画数: ${carePlans.rows.length}件`);
    carePlans.rows.forEach(cp => {
      console.log(`    患者: ${cp.patient_name}, 期間: ${cp.plan_period_start} 〜 ${cp.plan_period_end}, 施設: ${cp.facility_name}`);
    });

    // 月次レセプト
    console.log('\n【月次レセプト】');
    const receipts = await pool.query(`
      SELECT
        mr.target_year || '-' || LPAD(mr.target_month::text, 2, '0') as year_month,
        COUNT(*) as count,
        f.name as facility_name
      FROM monthly_receipts mr
      JOIN facilities f ON mr.facility_id = f.id
      GROUP BY mr.target_year, mr.target_month, f.name
      ORDER BY mr.target_year DESC, mr.target_month DESC
    `);
    console.log(`  月別レセプト件数:`);
    receipts.rows.forEach(r => {
      console.log(`    ${r.year_month}: ${r.count}件 (施設: ${r.facility_name})`);
    });

    // 保険証情報
    console.log('\n【保険証情報】');
    const insuranceCards = await pool.query(`
      SELECT
        ic.card_type,
        COUNT(*) as count
      FROM insurance_cards ic
      GROUP BY ic.card_type
      ORDER BY count DESC
    `);
    console.log(`  保険種別ごとの件数:`);
    insuranceCards.rows.forEach(ic => {
      console.log(`    ${ic.card_type}: ${ic.count}件`);
    });

    // スケジュール
    console.log('\n【スケジュール】');
    const schedules = await pool.query(`
      SELECT
        DATE(s.scheduled_date) as scheduled_date,
        COUNT(*) as count,
        f.name as facility_name
      FROM schedules s
      JOIN facilities f ON s.facility_id = f.id
      GROUP BY DATE(s.scheduled_date), f.name
      ORDER BY scheduled_date DESC
      LIMIT 10
    `);
    console.log(`  最近のスケジュール（直近10日分）:`);
    schedules.rows.forEach(s => {
      console.log(`    ${s.scheduled_date}: ${s.count}件 (施設: ${s.facility_name})`);
    });

    console.log('\n━'.repeat(60));
    console.log('\n✅ 本番環境データの確認完了');

  } finally {
    await pool.end();
  }
}

main().catch(console.error);
