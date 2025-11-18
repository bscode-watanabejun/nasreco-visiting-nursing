import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

const PROD_DB_URL = 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function main() {
  const pool = new Pool({ connectionString: PROD_DB_URL });

  try {
    console.log('=== 本番環境の death_location データ確認 ===\n');

    const result = await pool.query(`
      SELECT
        p.id,
        p.last_name || ' ' || p.first_name as name,
        p.death_date,
        p.death_location,
        f.name as facility_name
      FROM patients p
      JOIN facilities f ON p.facility_id = f.id
      WHERE p.death_location IS NOT NULL
      ORDER BY p.death_date DESC
    `);

    if (result.rows.length === 0) {
      console.log('✅ death_location カラムにデータはありません');
      console.log('   → マイグレーション不要、安全に npm run db:push を実行できます\n');
    } else {
      console.log(`⚠️  death_location カラムにデータが ${result.rows.length} 件あります:\n`);

      result.rows.forEach((row, index) => {
        console.log(`${index + 1}. 患者: ${row.name}`);
        console.log(`   施設: ${row.facility_name}`);
        console.log(`   死亡日: ${row.death_date}`);
        console.log(`   死亡場所: ${row.death_location}`);
        console.log('');
      });

      console.log('\n【対応が必要】');
      console.log('以下のマイグレーションスクリプトを実行してください:\n');
      console.log('```sql');
      console.log('-- death_location を death_place_code へマイグレーション');
      console.log('UPDATE patients');
      console.log('SET death_place_code = death_location');
      console.log('WHERE death_location IS NOT NULL;');
      console.log('```\n');
    }

  } finally {
    await pool.end();
  }
}

main().catch(console.error);
