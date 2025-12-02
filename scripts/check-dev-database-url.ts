/**
 * 開発環境のDATABASE_URLを確認するスクリプト
 */

const DEV_DB_HOST = 'ep-polished-scene-a5twqv82';
const PROD_DB_HOST = 'ep-still-water-aeb6ynp2';

function checkDatabaseUrl() {
  const dbUrl = process.env.DATABASE_URL || '';
  
  console.log('🔍 DATABASE_URLの確認\n');
  console.log('─'.repeat(80));
  
  if (!dbUrl) {
    console.error('❌ DATABASE_URL環境変数が設定されていません。');
    console.log('開発環境のDATABASE_URLを設定してください。');
    return false;
  }
  
  console.log(`DATABASE_URL: ${dbUrl.substring(0, 50)}...`);
  console.log('');
  
  if (dbUrl.includes(PROD_DB_HOST)) {
    console.error('❌ 警告: 本番環境のデータベースURLが検出されました！');
    console.log(`   検出されたホスト: ${PROD_DB_HOST}`);
    console.log('');
    console.log('⚠️  本番環境のデータベースに接続しようとしています。');
    console.log('   開発環境のDATABASE_URLを設定してください。');
    return false;
  }
  
  if (dbUrl.includes(DEV_DB_HOST)) {
    console.log('✅ 開発環境のデータベースURLが検出されました。');
    console.log(`   検出されたホスト: ${DEV_DB_HOST}`);
    return true;
  }
  
  console.log('⚠️  開発環境または本番環境のデータベースURLを特定できませんでした。');
  console.log(`   検出されたURL: ${dbUrl.substring(0, 100)}...`);
  console.log('');
  console.log('開発環境のホスト: ep-polished-scene-a5twqv82');
  console.log('本番環境のホスト: ep-still-water-aeb6ynp2');
  return false;
}

const isValid = checkDatabaseUrl();
process.exit(isValid ? 0 : 1);

