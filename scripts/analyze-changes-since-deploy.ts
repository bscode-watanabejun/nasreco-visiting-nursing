/**
 * 前回デプロイ時点からの変更内容分析スクリプト
 * 
 * 前回デプロイ時点（2025-11-09 06:20:19）と現在のmainブランチの差分を分析します。
 */

import { execSync } from 'child_process';

const PREVIOUS_DEPLOY_COMMIT = '62e51f8'; // 2025-11-09 06:14:08

async function analyzeChangesSinceDeploy() {
  console.log('🔍 前回デプロイ時点からの変更内容を分析します...\n');
  console.log(`前回デプロイ時点: ${PREVIOUS_DEPLOY_COMMIT} (2025-11-09 06:14:08)\n`);
  
  try {
    // 1. コミット数の確認
    console.log('📊 1. コミット数の確認:');
    console.log('─'.repeat(60));
    
    const commitCount = execSync(
      `git rev-list --count ${PREVIOUS_DEPLOY_COMMIT}..HEAD`,
      { encoding: 'utf-8', cwd: process.cwd() }
    ).trim();
    
    console.log(`   前回デプロイ以降のコミット数: ${commitCount}件\n`);

    // 2. 変更されたファイルの一覧
    console.log('📊 2. 変更されたファイルの一覧:');
    console.log('─'.repeat(60));
    
    const changedFiles = execSync(
      `git diff --name-status ${PREVIOUS_DEPLOY_COMMIT}..HEAD`,
      { encoding: 'utf-8', cwd: process.cwd() }
    ).trim().split('\n');
    
    const addedFiles: string[] = [];
    const modifiedFiles: string[] = [];
    const deletedFiles: string[] = [];
    
    changedFiles.forEach(line => {
      const [status, ...fileParts] = line.split('\t');
      const file = fileParts.join('\t');
      
      if (status.startsWith('A')) {
        addedFiles.push(file);
      } else if (status.startsWith('M')) {
        modifiedFiles.push(file);
      } else if (status.startsWith('D')) {
        deletedFiles.push(file);
      }
    });
    
    console.log(`   追加されたファイル: ${addedFiles.length}件`);
    console.log(`   変更されたファイル: ${modifiedFiles.length}件`);
    console.log(`   削除されたファイル: ${deletedFiles.length}件\n`);

    // 3. 主要な変更ファイルの分類
    console.log('📊 3. 主要な変更ファイルの分類:');
    console.log('─'.repeat(60));
    
    const clientFiles = [...addedFiles, ...modifiedFiles].filter(f => f.startsWith('client/'));
    const serverFiles = [...addedFiles, ...modifiedFiles].filter(f => f.startsWith('server/'));
    const sharedFiles = [...addedFiles, ...modifiedFiles].filter(f => f.startsWith('shared/'));
    const scriptFiles = [...addedFiles, ...modifiedFiles].filter(f => f.startsWith('scripts/'));
    const docFiles = [...addedFiles, ...modifiedFiles].filter(f => f.startsWith('docs/'));
    
    console.log(`   クライアントファイル: ${clientFiles.length}件`);
    console.log(`   サーバーファイル: ${serverFiles.length}件`);
    console.log(`   共有ファイル: ${sharedFiles.length}件`);
    console.log(`   スクリプトファイル: ${scriptFiles.length}件`);
    console.log(`   ドキュメントファイル: ${docFiles.length}件\n`);

    // 4. 重要な変更ファイルの詳細
    console.log('📊 4. 重要な変更ファイルの詳細:');
    console.log('─'.repeat(60));
    
    const importantFiles = [
      'shared/schema.ts',
      'server/routes.ts',
      'server/index.ts',
      'client/src/components/NursingRecords.tsx',
      'client/src/components/MonthlyReceiptDetail.tsx',
      'package.json',
    ];
    
    console.log('\n   重要なファイルの変更状況:');
    importantFiles.forEach(file => {
      const isModified = modifiedFiles.includes(file);
      const isAdded = addedFiles.includes(file);
      const isDeleted = deletedFiles.includes(file);
      
      if (isModified) {
        const diff = execSync(
          `git diff --stat ${PREVIOUS_DEPLOY_COMMIT}..HEAD -- ${file}`,
          { encoding: 'utf-8', cwd: process.cwd() }
        ).trim();
        console.log(`   ✅ ${file} (変更)`);
        console.log(`      ${diff.split('\n')[0]}`);
      } else if (isAdded) {
        console.log(`   ➕ ${file} (追加)`);
      } else if (isDeleted) {
        console.log(`   ❌ ${file} (削除)`);
      } else {
        console.log(`   ➖ ${file} (変更なし)`);
      }
    });
    console.log('');

    // 5. スキーマファイルの変更確認
    console.log('📊 5. スキーマファイルの変更確認:');
    console.log('─'.repeat(60));
    
    if (modifiedFiles.includes('shared/schema.ts')) {
      const schemaDiff = execSync(
        `git diff ${PREVIOUS_DEPLOY_COMMIT}..HEAD -- shared/schema.ts`,
        { encoding: 'utf-8', cwd: process.cwd() }
      );
      
      // テーブルの追加・削除・変更を検出
      const addedTables = (schemaDiff.match(/^\+export const \w+ = pgTable/gm) || []).length;
      const deletedTables = (schemaDiff.match(/^-export const \w+ = pgTable/gm) || []).length;
      const modifiedTables = (schemaDiff.match(/^[\+\-]export const \w+ = pgTable/gm) || []).length - addedTables - deletedTables;
      
      console.log(`   テーブルの追加: ${addedTables}件`);
      console.log(`   テーブルの削除: ${deletedTables}件`);
      console.log(`   テーブルの変更: ${modifiedTables}件\n`);
      
      if (addedTables > 0 || deletedTables > 0 || modifiedTables > 0) {
        console.log('   ⚠️  スキーマファイルに変更があります。');
        console.log('      db:push実行時にデータベーススキーマが変更される可能性があります。\n');
      } else {
        console.log('   ✅ スキーマファイルに大きな変更はありません。\n');
      }
    } else {
      console.log('   ✅ スキーマファイルに変更はありません。\n');
    }

    // 6. パッケージの変更確認
    console.log('📊 6. パッケージの変更確認:');
    console.log('─'.repeat(60));
    
    if (modifiedFiles.includes('package.json')) {
      const packageDiff = execSync(
        `git diff ${PREVIOUS_DEPLOY_COMMIT}..HEAD -- package.json`,
        { encoding: 'utf-8', cwd: process.cwd() }
      );
      
      const addedDeps = (packageDiff.match(/^\+.*"[\^~]?\d+\.\d+\.\d+.*":/gm) || []).length;
      const deletedDeps = (packageDiff.match(/^-.*"[\^~]?\d+\.\d+\.\d+.*":/gm) || []).length;
      
      console.log(`   追加された依存関係: ${addedDeps}件`);
      console.log(`   削除された依存関係: ${deletedDeps}件\n`);
      
      if (addedDeps > 0 || deletedDeps > 0) {
        console.log('   ⚠️  依存関係に変更があります。');
        console.log('      デプロイ時にnpm installが実行され、パッケージが更新されます。\n');
      } else {
        console.log('   ✅ 依存関係に大きな変更はありません。\n');
      }
    } else {
      console.log('   ✅ package.jsonに変更はありません。\n');
    }

    // 7. コミットの分類
    console.log('📊 7. コミットの分類:');
    console.log('─'.repeat(60));
    
    const commits = execSync(
      `git log ${PREVIOUS_DEPLOY_COMMIT}..HEAD --oneline --format="%s"`,
      { encoding: 'utf-8', cwd: process.cwd() }
    ).trim().split('\n');
    
    const featCommits = commits.filter(c => c.toLowerCase().includes('feat'));
    const fixCommits = commits.filter(c => c.toLowerCase().includes('fix'));
    const docsCommits = commits.filter(c => c.toLowerCase().includes('docs') || c.toLowerCase().includes('doc'));
    const choreCommits = commits.filter(c => c.toLowerCase().includes('chore'));
    const otherCommits = commits.filter(c => 
      !c.toLowerCase().includes('feat') &&
      !c.toLowerCase().includes('fix') &&
      !c.toLowerCase().includes('docs') &&
      !c.toLowerCase().includes('chore')
    );
    
    console.log(`   機能追加 (feat): ${featCommits.length}件`);
    console.log(`   バグ修正 (fix): ${fixCommits.length}件`);
    console.log(`   ドキュメント (docs): ${docsCommits.length}件`);
    console.log(`   その他 (chore): ${choreCommits.length}件`);
    console.log(`   その他: ${otherCommits.length}件\n`);

    // 8. 主要な変更内容のサマリー
    console.log('📊 8. 主要な変更内容のサマリー:');
    console.log('─'.repeat(60));
    
    console.log('\n【機能追加・改善】');
    featCommits.slice(0, 10).forEach((commit, index) => {
      console.log(`   ${index + 1}. ${commit}`);
    });
    if (featCommits.length > 10) {
      console.log(`   ... 他 ${featCommits.length - 10}件`);
    }
    
    console.log('\n【バグ修正】');
    fixCommits.slice(0, 10).forEach((commit, index) => {
      console.log(`   ${index + 1}. ${commit}`);
    });
    if (fixCommits.length > 10) {
      console.log(`   ... 他 ${fixCommits.length - 10}件`);
    }
    console.log('');

    // 9. デプロイ時の影響予測
    console.log('📊 9. デプロイ時の影響予測:');
    console.log('─'.repeat(60));
    
    console.log('\n【スキーマ変更の可能性】');
    if (modifiedFiles.includes('shared/schema.ts')) {
      console.log('   ⚠️  スキーマファイルに変更があります');
      console.log('      db:push実行時にデータベーススキーマが変更される可能性があります');
    } else {
      console.log('   ✅ スキーマファイルに変更はありません');
    }
    
    console.log('\n【依存関係の変更】');
    if (modifiedFiles.includes('package.json')) {
      console.log('   ⚠️  package.jsonに変更があります');
      console.log('      デプロイ時にnpm installが実行され、パッケージが更新されます');
    } else {
      console.log('   ✅ package.jsonに変更はありません');
    }
    
    console.log('\n【アプリケーションコードの変更】');
    console.log(`   クライアントファイル: ${clientFiles.length}件の変更`);
    console.log(`   サーバーファイル: ${serverFiles.length}件の変更`);
    console.log(`   これらの変更がデプロイ時に反映されます\n`);

    console.log('─'.repeat(60));
    console.log('✅ 変更内容の分析が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  }
}

analyzeChangesSinceDeploy()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

