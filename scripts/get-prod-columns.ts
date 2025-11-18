import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

const PROD_DB_URL = 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function main() {
  const pool = new Pool({ connectionString: PROD_DB_URL });

  try {
    const tables = ['users', 'patients', 'nursing_records', 'care_plans', 'monthly_receipts', 'insurance_cards', 'schedules'];

    for (const table of tables) {
      console.log(`\n【${table} テーブルのカラム一覧】`);
      const result = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position;
      `, [table]);

      result.rows.forEach(row => {
        console.log(`  - ${row.column_name} (${row.data_type})`);
      });
    }
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
