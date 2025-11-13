/**
 * 本番環境の訪問場所コード更新影響範囲確認スクリプト
 * 
 * 確認内容:
 * 1. 訪問場所コードマスタの現状
 * 2. nursing_recordsテーブルで使用されている訪問場所コード
 * 3. 更新後のマスタに存在しないコードが使用されているか
 *
 * ⚠️ 注意: このスクリプトは本番データベースに読み取りアクセスを行います。
 *    ユーザーの承認がある場合のみ実行してください。
 */

import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../shared/schema';
import { sql } from 'drizzle-orm';

const PRODUCTION_DB_URL = process.env.PRODUCTION_DB_URL || 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

// 更新後の正しい訪問場所コード（別表16準拠）
const EXPECTED_LOCATION_CODES = [
  '01', // 自宅
  '11', // 施設（社会福祉施設及び身体障害者施設）
  '12', // 施設（小規模多機能型居宅介護）
  '13', // 施設（複合型サービス）
  '14', // 施設（認知症対応型グループホーム）
  '15', // 施設（特定施設）
  '16', // 施設（地域密着型介護老人福祉施設及び介護老人福祉施設）
  '31', // 病院
  '32', // 診療所
  '99', // その他
];

async function checkVisitLocationImpact() {
  console.log('🔍 本番環境の訪問場所コード更新影響範囲を確認します...\n');
  
  const pool = new Pool({ connectionString: PRODUCTION_DB_URL });
  const db = drizzle({ client: pool, schema });

  try {
    // 1. 訪問場所コードマスタの現状確認
    console.log('📊 1. 訪問場所コードマスタの現状');
    console.log('─'.repeat(60));
    const currentLocationCodes = await db.select().from(schema.visitLocationCodes).orderBy(schema.visitLocationCodes.displayOrder);
    console.log(`現在の訪問場所コード数: ${currentLocationCodes.length}件`);
    console.log('\n現在のコード一覧:');
    currentLocationCodes.forEach(code => {
      console.log(`  ${code.locationCode}: ${code.locationName}`);
    });
    console.log('');

    // 2. nursing_recordsテーブルで使用されている訪問場所コード
    console.log('📊 2. nursing_recordsテーブルで使用されている訪問場所コード');
    console.log('─'.repeat(60));
    const recordLocationUsage = await db.execute<{
      visit_location_code: string | null;
      count: number;
    }>(sql`
      SELECT visit_location_code, COUNT(*) as count
      FROM nursing_records
      WHERE visit_location_code IS NOT NULL
      GROUP BY visit_location_code
      ORDER BY count DESC
    `);
    
    const totalRecordsWithLocation = recordLocationUsage.rows.reduce((sum, row) => sum + Number(row.count), 0);
    console.log(`訪問場所コードが設定されている記録数: ${totalRecordsWithLocation}件`);
    
    if (recordLocationUsage.rows.length > 0) {
      console.log('\n使用されている訪問場所コード:');
      recordLocationUsage.rows.forEach(row => {
        const code = currentLocationCodes.find(c => c.locationCode === row.visit_location_code);
        const name = code ? code.locationName : '(マスタに存在しない)';
        console.log(`  ${row.visit_location_code}: ${name} (${row.count}件)`);
      });
    } else {
      console.log('\n使用されている訪問場所コードはありません。');
    }
    
    const recordsWithNullLocation = await db.execute<{ count: string }>(sql`
      SELECT COUNT(*) as count
      FROM nursing_records
      WHERE visit_location_code IS NULL
    `);
    console.log(`\n訪問場所コードが未設定の記録: ${recordsWithNullLocation.rows[0]?.count || 0}件`);
    console.log('');

    // 3. 影響範囲の分析
    console.log('📊 3. 影響範囲の分析');
    console.log('─'.repeat(60));
    
    // 使用されているコードを取得
    const allUsedLocationCodes = new Set<string>();
    recordLocationUsage.rows.forEach(row => {
      if (row.visit_location_code) allUsedLocationCodes.add(row.visit_location_code);
    });
    
    const expectedLocationCodeSet = new Set(EXPECTED_LOCATION_CODES);
    
    // 更新後のマスタに存在しないコード
    const missingCodes = Array.from(allUsedLocationCodes).filter(code => !expectedLocationCodeSet.has(code));
    
    // 現在のマスタに存在するが、更新後に削除されるコード
    const currentCodeSet = new Set(currentLocationCodes.map(c => c.locationCode));
    const codesToBeRemoved = Array.from(currentCodeSet).filter(code => !expectedLocationCodeSet.has(code));
    
    // 更新後に追加されるコード
    const codesToBeAdded = EXPECTED_LOCATION_CODES.filter(code => !currentCodeSet.has(code));
    
    console.log('\n【訪問場所コード】');
    console.log(`現在のマスタコード数: ${currentLocationCodes.length}件`);
    console.log(`更新後のマスタコード数: ${EXPECTED_LOCATION_CODES.length}件`);
    console.log(`使用されているコード数: ${allUsedLocationCodes.size}件`);
    
    if (missingCodes.length > 0) {
      console.log(`\n⚠️  重大な問題: 更新後のマスタに存在しないコードが使用されています:`);
      missingCodes.forEach(code => {
        const usageCount = recordLocationUsage.rows.find(r => r.visit_location_code === code)?.count || 0;
        const currentName = currentLocationCodes.find(c => c.locationCode === code)?.locationName || '(不明)';
        console.log(`  ${code}: ${currentName} (${usageCount}件の記録で使用)`);
      });
      console.log('\n   → これらのコードを使用している記録は、マスタ更新後に参照できなくなります');
      console.log('   → CSV出力時にエラーが発生する可能性があります');
    } else {
      console.log('\n✅ 使用されているすべてのコードが更新後のマスタに存在します');
    }
    
    if (codesToBeRemoved.length > 0) {
      console.log(`\n📝 更新時に削除されるコード（未使用）: ${codesToBeRemoved.length}件`);
      codesToBeRemoved.forEach(code => {
        const name = currentLocationCodes.find(c => c.locationCode === code)?.locationName || '(不明)';
        console.log(`  ${code}: ${name}`);
      });
    }
    
    if (codesToBeAdded.length > 0) {
      console.log(`\n➕ 更新後に追加されるコード: ${codesToBeAdded.length}件`);
      codesToBeAdded.forEach(code => {
        console.log(`  ${code}: (新規追加)`);
      });
    }

    // 4. 詳細な影響範囲
    if (missingCodes.length > 0) {
      console.log('\n📊 4. 詳細な影響範囲');
      console.log('─'.repeat(60));
      
      for (const code of missingCodes) {
        const usageCount = recordLocationUsage.rows.find(r => r.visit_location_code === code)?.count || 0;
        console.log(`\nコード ${code} の影響:`);
        console.log(`  使用されている記録数: ${usageCount}件`);
        
        // 最新の5件の記録IDを取得
        const recentRecords = await db.execute<{
          id: string;
          visit_date: Date;
          patient_id: string;
        }>(sql`
          SELECT id, visit_date, patient_id
          FROM nursing_records
          WHERE visit_location_code = ${code}
          ORDER BY visit_date DESC
          LIMIT 5
        `);
        
        if (recentRecords.rows.length > 0) {
          console.log(`  最新の記録例:`);
          recentRecords.rows.forEach(record => {
            console.log(`    - 記録ID: ${record.id}, 訪問日: ${record.visit_date}, 患者ID: ${record.patient_id}`);
          });
        }
      }
    }

    console.log('\n' + '─'.repeat(60));
    console.log('✅ 影響範囲の確認が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

checkVisitLocationImpact()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

