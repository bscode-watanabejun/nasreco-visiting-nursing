/**
 * 訪問記録の加算計算履歴を確認するスクリプト（読み取り専用）
 * 
 * ⚠️ 本番DBへの読み取り専用アクセスのみ。データの変更は一切行いません。
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from '../shared/schema';
import { 
  nursingRecords, 
  patients, 
  bonusMaster, 
  bonusCalculationHistory 
} from '../shared/schema';
import { eq, and, isNull } from 'drizzle-orm';

neonConfig.webSocketConstructor = ws;

async function checkRecordBonusHistory() {
  const dbUrl = process.env.PRODUCTION_DB_URL || 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';
  
  console.log('⚠️  本番データベースに接続します（読み取り専用）\n');

  const pool = new Pool({ connectionString: dbUrl });
  const db = drizzle({ client: pool, schema });

  try {
    // 患者「祓川 チカ」を検索
    console.log('📋 患者「祓川 チカ」を検索中...');
    const allPatients = await db.query.patients.findMany({});
    const patient = allPatients.find(p => 
      p.lastName?.includes('祓川') && p.firstName?.includes('チカ')
    );

    if (!patient) {
      console.error('❌ 患者が見つかりませんでした');
      process.exit(1);
    }

    console.log(`✅ 患者ID: ${patient.id}\n`);

    // 2025年11月6日の訪問記録を検索
    console.log('📋 2025年11月6日の訪問記録を検索中...');
    const visitDate = '2025-11-06';
    const records = await db.query.nursingRecords.findMany({
      where: and(
        eq(nursingRecords.patientId, patient.id),
        eq(nursingRecords.visitDate, visitDate),
        isNull(nursingRecords.deletedAt)
      ),
      orderBy: (nursingRecords, { asc }) => [asc(nursingRecords.actualStartTime)],
    });

    console.log(`✅ 訪問記録数: ${records.length}件\n`);

    // 各訪問記録の加算計算履歴を確認
    for (const record of records) {
      console.log('='.repeat(80));
      console.log(`【訪問記録ID: ${record.id}】`);
      console.log('='.repeat(80));
      console.log(`訪問日: ${record.visitDate}`);
      console.log(`退院日当日の訪問: ${record.isDischargeDate ? '✅ true' : '❌ false'}`);
      console.log(`ステータス: ${record.status}`);
      console.log(`算定点数: ${record.calculatedPoints || 0}点`);
      console.log('');

      // 加算計算履歴を取得
      const bonusHistory = await db.query.bonusCalculationHistory.findMany({
        where: eq(bonusCalculationHistory.nursingRecordId, record.id),
      });

      console.log(`加算計算履歴数: ${bonusHistory.length}件`);

      if (bonusHistory.length === 0) {
        console.log('❌ 加算計算履歴が存在しません');
      } else {
        console.log('\n加算一覧:');
        for (const history of bonusHistory) {
          const bonus = await db.query.bonusMaster.findFirst({
            where: eq(bonusMaster.id, history.bonusMasterId),
          });

          console.log(`  - ${history.bonusCode}: ${history.bonusName}`);
          console.log(`    点数: ${history.calculatedPoints}点`);
          console.log(`    サービスコードID: ${history.serviceCodeId || '未設定'}`);
          console.log(`    選択理由: ${history.selectionReason || 'N/A'}`);
          console.log(`    計算日時: ${history.calculatedAt ? new Date(history.calculatedAt).toLocaleString('ja-JP') : 'N/A'}`);
          
          // 退院時支援指導加算かどうかを確認
          if (history.bonusCode === 'discharge_support_guidance_basic' || 
              history.bonusCode === 'discharge_support_guidance_long') {
            console.log(`    ✅ 退院時支援指導加算が見つかりました！`);
          }
          console.log('');
        }
      }

      // 退院日フラグがtrueなのに加算履歴がない場合
      if (record.isDischargeDate && bonusHistory.length === 0) {
        console.log('⚠️  問題: 退院日フラグがtrueなのに加算計算履歴がありません');
        console.log('   考えられる原因:');
        console.log('   1. 訪問記録更新時に加算計算が実行されていない');
        console.log('   2. 加算計算は実行されたが、条件を満たさなかった');
        console.log('   3. 加算計算履歴の保存に失敗した');
      } else if (record.isDischargeDate) {
        const dischargeBonus = bonusHistory.find(h => 
          h.bonusCode === 'discharge_support_guidance_basic' || 
          h.bonusCode === 'discharge_support_guidance_long'
        );
        if (!dischargeBonus) {
          console.log('⚠️  問題: 退院日フラグがtrueなのに退院時支援指導加算の履歴がありません');
        }
      }
      console.log('');
    }

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

checkRecordBonusHistory().catch(console.error);

