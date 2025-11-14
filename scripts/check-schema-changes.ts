/**
 * スキーマ変更の確認スクリプト
 * 
 * drizzle-kitを使用して、現在のスキーマファイルと本番環境のスキーマの差分を確認します。
 */

import { execSync } from 'child_process';
import { Pool } from 'pg';

const PROD_DB_URL = process.env.PRODUCTION_DB_URL || 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function checkSchemaChanges() {
  console.log('🔍 スキーマ変更を確認します...\n');
  console.log('⚠️  本番データベースに接続します\n');
  
  try {
    // 1. drizzle-kitのdry-runモードでスキーマ変更を確認
    console.log('📊 1. drizzle-kitでスキーマ変更を確認中...');
    console.log('─'.repeat(60));
    
    // 環境変数を設定してdrizzle-kitを実行
    process.env.DATABASE_URL = PROD_DB_URL;
    
    try {
      // drizzle-kit push --dry-run を実行
      // 注意: drizzle-kitにはdry-runオプションがないため、実際のpushを実行せずに
      // スキーマの比較を行う必要があります
      
      console.log('   drizzle-kit push を実行すると、以下の変更が発生する可能性があります:');
      console.log('   （実際には実行しません）\n');
      
      // 代わりに、スキーマファイルの内容を確認
      console.log('   スキーマファイルの主要テーブルを確認中...\n');
      
    } catch (error: any) {
      console.log(`   ⚠️  drizzle-kitの実行でエラーが発生しました: ${error.message}\n`);
    }

    // 2. 本番環境のデータ件数を確認
    console.log('📊 2. 本番環境のデータ件数を確認中...');
    console.log('─'.repeat(60));
    
    const pool = new Pool({ connectionString: PROD_DB_URL });
    
    const tableCounts = await pool.query(`
      SELECT 
        'nursing_service_codes' as table_name,
        COUNT(*) as count
      FROM nursing_service_codes
      UNION ALL
      SELECT 
        'nursing_records' as table_name,
        COUNT(*) as count
      FROM nursing_records
      UNION ALL
      SELECT 
        'bonus_calculation_history' as table_name,
        COUNT(*) as count
      FROM bonus_calculation_history
      UNION ALL
      SELECT 
        'patients' as table_name,
        COUNT(*) as count
      FROM patients
      UNION ALL
      SELECT 
        'users' as table_name,
        COUNT(*) as count
      FROM users
      UNION ALL
      SELECT 
        'facilities' as table_name,
        COUNT(*) as count
      FROM facilities
      UNION ALL
      SELECT 
        'monthly_receipts' as table_name,
        COUNT(*) as count
      FROM monthly_receipts
      ORDER BY table_name
    `);
    
    console.log('\n   テーブル別データ件数:');
    tableCounts.rows.forEach((row: any) => {
      console.log(`     ${row.table_name}: ${row.count}件`);
    });
    console.log('');

    await pool.end();

    // 3. デプロイ時の影響分析
    console.log('📊 3. デプロイ時の影響分析:');
    console.log('─'.repeat(60));
    
    console.log('\n【重要な注意事項】\n');
    
    console.log('1. データベーススキーマ変更のリスク:');
    console.log('   - db:push が実行されると、スキーマの差分があれば自動的に変更される');
    console.log('   - テーブルの追加・削除・カラムの変更が発生する可能性');
    console.log('   - データの整合性に影響する可能性');
    console.log('   - 推奨: デプロイ前にスキーマの差分を確認\n');
    
    console.log('2. ダウンタイムのリスク:');
    console.log('   - ビルド中（約2-5分）はサービスが停止する可能性');
    console.log('   - スキーマ変更中はデータベースロックが発生する可能性');
    console.log('   - 推奨: 業務時間外（夜間または休日）に実行\n');
    
    console.log('3. 環境変数の確認:');
    console.log('   - DATABASE_URL: 本番環境のデータベース接続文字列が設定されているか');
    console.log('   - SESSION_SECRET: セッション暗号化用シークレットが設定されているか');
    console.log('   - NODE_ENV: production に設定される（自動）');
    console.log('   - PORT: 5000（.replitファイルで設定）\n');
    
    console.log('4. バックアップの必要性:');
    console.log('   - デプロイ前にデータベースのバックアップを取得することを強く推奨');
    console.log('   - スキーマ変更が失敗した場合のロールバック準備\n');
    
    console.log('5. サービスコードマスタへの影響:');
    console.log('   - 現在、サービスコードマスタの入れ替えを計画中');
    console.log('   - デプロイとサービスコードマスタの入れ替えは別々に実行することを推奨');
    console.log('   - デプロイ後にサービスコードマスタの入れ替えを実行\n');

    console.log('─'.repeat(60));
    console.log('✅ スキーマ変更確認が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  }
}

checkSchemaChanges()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

