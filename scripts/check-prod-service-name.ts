import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { nursingServiceCodes } from '../shared/schema';

const PROD_DB_URL = 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function checkServiceName() {
  const pool = new Pool({ connectionString: PROD_DB_URL });
  const db = drizzle(pool);

  try {
    const codes = await db.select().from(nursingServiceCodes);
    const code311000110 = codes.find(c => c.serviceCode === '311000110');
    console.log('311000110のサービス名称:', code311000110?.serviceName);
    console.log('文字列の長さ:', code311000110?.serviceName.length);
    console.log('文字列の内容（JSON）:', JSON.stringify(code311000110?.serviceName));
    console.log('\nすべての31から始まるコード:');
    codes.filter(c => c.serviceCode.startsWith('31')).forEach(c => {
      console.log(`  ${c.serviceCode}: ${c.serviceName}`);
    });
  } finally {
    await pool.end();
  }
}

checkServiceName()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

