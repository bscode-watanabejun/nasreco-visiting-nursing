/**
 * 24時間対応体制加算の重複適用を確認するスクリプト（読み取り専用）
 * 
 * ⚠️ 本番DBへの読み取り専用アクセスのみ。データの変更は一切行いません。
 * 
 * 実行方法:
 *   PRODUCTION_DB_URL="postgresql://..." npx tsx scripts/check-24h-bonus-duplicates.ts
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from '../shared/schema';
import { bonusMaster, bonusCalculationHistory, nursingRecords, patients } from '../shared/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';

neonConfig.webSocketConstructor = ws;

async function check24hBonusDuplicates() {
  // 本番DBの接続文字列（読み取り専用）
  const dbUrl = process.env.PRODUCTION_DB_URL || process.env.DATABASE_URL;
  
  if (!dbUrl) {
    console.error('❌ PRODUCTION_DB_URL または DATABASE_URL 環境変数が設定されていません');
    process.exit(1);
  }
  
  console.log('⚠️  データベースに接続します（読み取り専用）');
  console.log('   データの変更は一切行いません。\n');

  const pool = new Pool({ connectionString: dbUrl });
  const db = drizzle({ client: pool, schema });

  try {
    // 24時間対応体制加算の加算マスタIDを取得
    const basicBonus = await db.query.bonusMaster.findFirst({
      where: eq(bonusMaster.bonusCode, '24h_response_system_basic'),
    });
    
    const enhancedBonus = await db.query.bonusMaster.findFirst({
      where: eq(bonusMaster.bonusCode, '24h_response_system_enhanced'),
    });

    if (!basicBonus || !enhancedBonus) {
      console.error('❌ 24時間対応体制加算の加算マスタが見つかりません');
      return;
    }

    console.log('📋 24時間対応体制加算の重複適用を確認中...\n');
    
    // 同じ患者・同じ月で複数回適用されている加算履歴を検索
    const duplicateQuery = await db.execute(sql`
      SELECT 
        p.id as patient_id,
        p.patient_number,
        p.last_name || ' ' || p.first_name as patient_name,
        DATE_TRUNC('month', nr.visit_date)::date as month,
        bm.bonus_code,
        bm.bonus_name,
        COUNT(*) as count,
        array_agg(nr.id ORDER BY nr.visit_date) as nursing_record_ids,
        array_agg(nr.visit_date ORDER BY nr.visit_date) as visit_dates,
        array_agg(nr.status ORDER BY nr.visit_date) as statuses
      FROM bonus_calculation_history bch
      INNER JOIN nursing_records nr ON bch.nursing_record_id = nr.id
      INNER JOIN patients p ON nr.patient_id = p.id
      INNER JOIN bonus_master bm ON bch.bonus_master_id = bm.id
      WHERE bm.bonus_code IN ('24h_response_system_basic', '24h_response_system_enhanced')
        AND nr.deleted_at IS NULL
        AND nr.status IN ('completed', 'reviewed')
      GROUP BY p.id, p.patient_number, p.last_name, p.first_name, DATE_TRUNC('month', nr.visit_date), bm.bonus_code, bm.bonus_name
      HAVING COUNT(*) > 1
      ORDER BY p.patient_number, month, bm.bonus_code
    `);

    const duplicates = duplicateQuery.rows;

    if (duplicates.length === 0) {
      console.log('✅ 重複適用は見つかりませんでした。\n');
    } else {
      console.log(`❌ 重複適用が ${duplicates.length} 件見つかりました:\n`);
      
      for (const dup of duplicates) {
        console.log('='.repeat(80));
        console.log(`患者: ${dup.patient_name} (${dup.patient_number})`);
        console.log(`加算: ${dup.bonus_name} (${dup.bonus_code})`);
        console.log(`月: ${dup.month}`);
        console.log(`適用回数: ${dup.count}回（月1回まで）`);
        console.log(`訪問記録ID: ${Array.isArray(dup.nursing_record_ids) ? dup.nursing_record_ids.join(', ') : dup.nursing_record_ids}`);
        console.log(`訪問日: ${Array.isArray(dup.visit_dates) ? dup.visit_dates.join(', ') : dup.visit_dates}`);
        console.log(`ステータス: ${Array.isArray(dup.statuses) ? dup.statuses.join(', ') : dup.statuses}`);
        console.log('');
      }
    }

    // 詳細な加算履歴を確認
    console.log('\n📊 詳細な加算履歴を確認中...\n');
    
    if (duplicates.length > 0) {
      const firstDup = duplicates[0];
      const recordIds = Array.isArray(firstDup.nursing_record_ids) 
        ? firstDup.nursing_record_ids as string[]
        : [firstDup.nursing_record_ids as string];
      
      console.log(`最初の重複ケースの詳細（患者: ${firstDup.patient_name}）:\n`);
      
      for (const recordId of recordIds) {
        const history = await db.query.bonusCalculationHistory.findMany({
          where: eq(bonusCalculationHistory.nursingRecordId, recordId),
          with: {
            bonusMaster: true,
            nursingRecord: {
              columns: {
                id: true,
                visitDate: true,
                status: true,
                patientId: true,
              },
            },
          },
        });

        const record = await db.query.nursingRecords.findFirst({
          where: eq(nursingRecords.id, recordId),
        });

        if (record) {
          console.log(`訪問記録ID: ${recordId}`);
          console.log(`訪問日: ${record.visitDate}`);
          console.log(`ステータス: ${record.status}`);
          console.log(`加算履歴:`);
          
          for (const h of history) {
            if (h.bonusMaster.bonusCode.startsWith('24h_response_system')) {
              console.log(`  - ${h.bonusMaster.bonusName} (${h.bonusMaster.bonusCode})`);
              console.log(`    点数: ${h.calculatedPoints}`);
              console.log(`    作成日時: ${h.createdAt}`);
            }
          }
          console.log('');
        }
      }
    }

    console.log('✅ 確認完了');
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// 実行
check24hBonusDuplicates()
  .then(() => {
    console.log('\n🎉 スクリプトが正常に完了しました');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ スクリプトの実行中にエラーが発生しました:', error);
    process.exit(1);
  });

