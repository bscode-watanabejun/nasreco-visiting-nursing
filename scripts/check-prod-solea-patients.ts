/**
 * 本番環境の「訪問看護ステーションソレア春日部」テナントの患者データ確認
 * death_locationフィールドの有無と値の確認
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';

const PROD_DB_URL = 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function checkSoleaPatients() {
  console.log('🔍 本番環境の「訪問看護ステーションソレア春日部」テナントの患者データを確認します...\n');
  
  const prodPool = new Pool({ connectionString: PROD_DB_URL });
  const prodDb = drizzle(prodPool);

  try {
    // 1. 施設情報を取得
    console.log('📊 1. 施設情報の確認:');
    console.log('─'.repeat(60));
    
    const facilityResult = await prodDb.execute(sql`
      SELECT id, name, slug
      FROM facilities
      WHERE name LIKE '%ソレア春日部%' OR name LIKE '%春日部%'
      ORDER BY name
    `);
    
    if (facilityResult.rows.length === 0) {
      console.log('   ⚠️  「訪問看護ステーションソレア春日部」が見つかりませんでした。');
      console.log('   全施設一覧を表示します：\n');
      
      const allFacilities = await prodDb.execute(sql`
        SELECT id, name, slug
        FROM facilities
        ORDER BY name
      `);
      
      allFacilities.rows.forEach((f: any) => {
        console.log(`   - ${f.name} (ID: ${f.id})`);
      });
      
      await prodPool.end();
      return;
    }
    
    const facility = facilityResult.rows[0] as any;
    console.log(`   施設名: ${facility.name}`);
    console.log(`   施設ID: ${facility.id}`);
    console.log(`   Slug: ${facility.slug}\n`);

    // 2. patientsテーブルのスキーマを確認（death_locationフィールドの有無）
    console.log('📊 2. patientsテーブルのスキーマ確認:');
    console.log('─'.repeat(60));
    
    const columnCheck = await prodDb.execute(sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = 'patients'
        AND column_name IN ('death_location', 'death_time', 'death_place_code', 'death_place_text')
      ORDER BY column_name
    `);
    
    const existingColumns = columnCheck.rows.map((r: any) => r.column_name);
    console.log(`   確認対象カラムの存在状況:`);
    console.log(`   - death_location: ${existingColumns.includes('death_location') ? '✅ 存在' : '❌ 不存在'}`);
    console.log(`   - death_time: ${existingColumns.includes('death_time') ? '✅ 存在' : '❌ 不存在'}`);
    console.log(`   - death_place_code: ${existingColumns.includes('death_place_code') ? '✅ 存在' : '❌ 不存在'}`);
    console.log(`   - death_place_text: ${existingColumns.includes('death_place_text') ? '✅ 存在' : '❌ 不存在'}\n`);

    // 3. 該当施設の患者データを確認
    console.log('📊 3. 患者データの確認:');
    console.log('─'.repeat(60));
    
    // 存在するカラムのみを動的に構築
    const selectColumns = ['id', 'patient_number', 'last_name', 'first_name', 'death_date'];
    if (existingColumns.includes('death_location')) {
      selectColumns.push('death_location');
    }
    if (existingColumns.includes('death_time')) {
      selectColumns.push('death_time');
    }
    if (existingColumns.includes('death_place_code')) {
      selectColumns.push('death_place_code');
    }
    if (existingColumns.includes('death_place_text')) {
      selectColumns.push('death_place_text');
    }
    
    const patientQuery = sql.raw(`
      SELECT ${selectColumns.join(', ')}
      FROM patients
      WHERE facility_id = '${facility.id}'
      ORDER BY patient_number
    `);
    
    const patientsResult = await prodDb.execute(patientQuery);
    
    console.log(`   患者数: ${patientsResult.rows.length}名\n`);
    
    if (patientsResult.rows.length === 0) {
      console.log('   ⚠️  患者データが見つかりませんでした。\n');
    } else {
      patientsResult.rows.forEach((p: any, index: number) => {
        console.log(`   【患者 ${index + 1}】`);
        console.log(`   患者番号: ${p.patient_number}`);
        console.log(`   氏名: ${p.last_name} ${p.first_name}`);
        console.log(`   死亡日: ${p.death_date || 'null'}`);
        if (existingColumns.includes('death_location')) {
          console.log(`   death_location: ${p.death_location || 'null'}`);
        }
        if (existingColumns.includes('death_time')) {
          console.log(`   death_time: ${p.death_time || 'null'}`);
        }
        if (existingColumns.includes('death_place_code')) {
          console.log(`   death_place_code: ${p.death_place_code || 'null'}`);
        }
        if (existingColumns.includes('death_place_text')) {
          console.log(`   death_place_text: ${p.death_place_text || 'null'}`);
        }
        console.log('');
      });
      
      // death_locationの値の集計
      if (existingColumns.includes('death_location')) {
        const deathLocationStats = await prodDb.execute(sql`
          SELECT 
            death_location,
            COUNT(*) as count
          FROM patients
          WHERE facility_id = ${facility.id}
          GROUP BY death_location
        `);
        
        console.log('   📊 death_locationの値の集計:');
        deathLocationStats.rows.forEach((stat: any) => {
          console.log(`   - ${stat.death_location || 'null'}: ${stat.count}名`);
        });
        console.log('');
      }
    }

    // 4. マイグレーションの必要性判定
    console.log('📊 4. マイグレーションの必要性判定:');
    console.log('─'.repeat(60));
    
    const hasDeathLocation = existingColumns.includes('death_location');
    const hasNewFields = existingColumns.includes('death_time') && 
                         existingColumns.includes('death_place_code') && 
                         existingColumns.includes('death_place_text');
    
    if (!hasDeathLocation && hasNewFields) {
      console.log('   ✅ death_locationフィールドが存在せず、新規フィールドが追加済みのため、マイグレーションは不要です。');
      console.log('   （既にマイグレーション済み）\n');
    } else if (hasDeathLocation && !hasNewFields) {
      // death_locationがnullの患者数を確認
      const nullCountResult = await prodDb.execute(sql`
        SELECT COUNT(*) as count
        FROM patients
        WHERE facility_id = ${facility.id}
          AND death_location IS NULL
      `);
      
      const nullCount = parseInt((nullCountResult.rows[0] as any).count);
      const totalCount = patientsResult.rows.length;
      
      console.log(`   death_locationがnullの患者数: ${nullCount}名 / ${totalCount}名`);
      
      if (nullCount === totalCount) {
        console.log('   ✅ 全患者のdeath_locationがnullのため、データ移行は不要です。');
        console.log('   ⚠️  ただし、スキーマ変更（カラム追加・削除）は必要です。');
        console.log('   → マイグレーションスクリプトのStep 2（データ移行）はスキップ可能');
        console.log('   → Step 1（カラム追加）とStep 3（カラム削除）は実行が必要\n');
      } else {
        console.log('   ⚠️  death_locationに値が設定されている患者が存在します。');
        console.log('   → マイグレーションスクリプトの全ステップを実行してください。\n');
      }
    } else {
      console.log('   ⚠️  予期しないスキーマ状態です。詳細を確認してください。\n');
    }

    console.log('─'.repeat(60));
    console.log('✅ 確認が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prodPool.end();
  }
}

checkSoleaPatients()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('処理中にエラーが発生しました:', error);
    process.exit(1);
  });

