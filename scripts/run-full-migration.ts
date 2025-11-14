/**
 * 統合移行スクリプト
 * 
 * すべてのフェーズを順番に実行します。
 * 
 * ⚠️ 警告: このスクリプトは本番データベースに書き込みを行います。
 *    ユーザーの明示的な承認なしに実行しないでください。
 * 
 * 実行方法:
 *   PRODUCTION_DB_URL="postgresql://..." npx tsx scripts/run-full-migration.ts
 */

import { execSync } from 'child_process';

const PROD_DB_URL = process.env.PRODUCTION_DB_URL || 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function runFullMigration() {
  console.log('🚀 統合移行スクリプトを開始します...\n');
  console.log('⚠️  本番データベースに接続します\n');
  console.log('─'.repeat(60));
  console.log('');

  const phases = [
    {
      name: 'フェーズ1: 正しいサービスコードマスタの追加',
      script: 'scripts/migrate-service-codes-to-production.ts',
    },
    {
      name: 'フェーズ2: 訪問記録の参照更新',
      script: 'scripts/update-service-code-references.ts',
    },
    {
      name: 'フェーズ3: 誤ったコードの無効化',
      script: 'scripts/deactivate-wrong-service-codes.ts',
    },
    {
      name: '検証: 移行後の検証',
      script: 'scripts/verify-migration.ts',
    },
  ];

  try {
    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i];
      console.log(`\n${'='.repeat(60)}`);
      console.log(`ステップ ${i + 1}/${phases.length}: ${phase.name}`);
      console.log('='.repeat(60));
      console.log('');

      try {
        execSync(`PRODUCTION_DB_URL="${PROD_DB_URL}" npx tsx ${phase.script}`, {
          stdio: 'inherit',
          cwd: process.cwd(),
        });
        
        console.log(`\n✅ ${phase.name} が完了しました。\n`);
      } catch (error) {
        console.error(`\n❌ ${phase.name} でエラーが発生しました。`);
        console.error('移行を中断します。\n');
        throw error;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ すべてのフェーズが完了しました！');
    console.log('='.repeat(60));
    console.log('');

  } catch (error) {
    console.error('\n❌ 移行が失敗しました。');
    console.error('ロールバック手順を確認してください。\n');
    process.exit(1);
  }
}

runFullMigration()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

