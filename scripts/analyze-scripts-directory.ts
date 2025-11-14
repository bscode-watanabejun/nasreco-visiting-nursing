/**
 * scriptsディレクトリのファイル分析スクリプト
 * 
 * どのファイルが不要かを分析します。
 */

import * as fs from 'fs';
import * as path from 'path';

const scriptsDir = path.join(process.cwd(), 'scripts');

interface ScriptInfo {
  name: string;
  category: string;
  status: 'keep' | 'temporary' | 'duplicate' | 'obsolete';
  reason: string;
}

function analyzeScriptsDirectory() {
  console.log('🔍 scriptsディレクトリのファイルを分析します...\n');
  
  const files = fs.readdirSync(scriptsDir)
    .filter(file => file.endsWith('.ts') || file.endsWith('.sql'))
    .sort();
  
  const scriptInfos: ScriptInfo[] = [];
  
  files.forEach(file => {
    const filePath = path.join(scriptsDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    
    let category = 'other';
    let status: 'keep' | 'temporary' | 'duplicate' | 'obsolete' = 'keep';
    let reason = '';
    
    // カテゴリ分類
    if (file.includes('migrate') || file.includes('run-full-migration') || file.includes('add-all-missing')) {
      category = 'migration';
      if (file === 'migrate-service-codes-to-production.ts' || 
          file === 'update-service-code-references.ts' ||
          file === 'deactivate-wrong-service-codes.ts' ||
          file === 'verify-migration.ts' ||
          file === 'run-full-migration.ts' ||
          file === 'add-all-missing-service-codes.ts') {
        status = 'keep';
        reason = '移行スクリプト（完了済みだが履歴として保持）';
      }
    } else if (file.startsWith('check-') || file.startsWith('compare-') || file.startsWith('analyze-')) {
      category = 'inspection';
      // 完了済みの確認スクリプトは一時的と判断
      if (file.includes('production') || file.includes('dev') || file.includes('schema') || 
          file.includes('duplicate') || file.includes('service-code') || file.includes('changes')) {
        status = 'temporary';
        reason = '一時的な確認・調査用スクリプト（完了済み）';
      } else {
        status = 'keep';
        reason = '確認用スクリプト（今後も使用可能）';
      }
    } else if (file.startsWith('cleanup-')) {
      category = 'cleanup';
      if (file === 'cleanup-duplicate-bonus-history-for-unique-index.ts') {
        status = 'keep';
        reason = '重複データ解消スクリプト（完了済みだが履歴として保持）';
      } else if (file === 'cleanup-duplicate-bonus-history.ts') {
        status = 'duplicate';
        reason = 'cleanup-duplicate-bonus-history-for-unique-index.tsと重複';
      } else {
        status = 'keep';
        reason = 'クリーンアップスクリプト';
      }
    } else if (file.startsWith('fix-') || file.startsWith('import-') || file.startsWith('delete-')) {
      category = 'maintenance';
      status = 'keep';
      reason = 'メンテナンス用スクリプト';
    } else if (file.startsWith('create-') || file.startsWith('get-') || file.startsWith('list-') || 
               file.startsWith('count-') || file.startsWith('extract-') || file.startsWith('read-') ||
               file.startsWith('map-') || file.startsWith('update-') || file.startsWith('seed-')) {
      category = 'utility';
      status = 'keep';
      reason = 'ユーティリティスクリプト';
    } else if (file.includes('comprehensive') || file.includes('verify')) {
      category = 'verification';
      status = 'keep';
      reason = '検証用スクリプト';
    } else {
      category = 'other';
      status = 'keep';
      reason = 'その他';
    }
    
    scriptInfos.push({ name: file, category, status, reason });
  });
  
  // 結果を表示
  console.log('📊 ファイル分析結果:');
  console.log('─'.repeat(60));
  console.log(`   総ファイル数: ${files.length}件\n`);
  
  const byStatus = {
    keep: scriptInfos.filter(s => s.status === 'keep'),
    temporary: scriptInfos.filter(s => s.status === 'temporary'),
    duplicate: scriptInfos.filter(s => s.status === 'duplicate'),
    obsolete: scriptInfos.filter(s => s.status === 'obsolete'),
  };
  
  console.log('【保持推奨】');
  console.log(`   ${byStatus.keep.length}件`);
  console.log('   移行スクリプト、メンテナンス用スクリプト、検証用スクリプトなど\n');
  
  console.log('【一時的（削除検討）】');
  console.log(`   ${byStatus.temporary.length}件`);
  byStatus.temporary.forEach(script => {
    console.log(`   - ${script.name}`);
    console.log(`     ${script.reason}`);
  });
  console.log('');
  
  if (byStatus.duplicate.length > 0) {
    console.log('【重複（削除検討）】');
    console.log(`   ${byStatus.duplicate.length}件`);
    byStatus.duplicate.forEach(script => {
      console.log(`   - ${script.name}`);
      console.log(`     ${script.reason}`);
    });
    console.log('');
  }
  
  if (byStatus.obsolete.length > 0) {
    console.log('【廃止（削除検討）】');
    console.log(`   ${byStatus.obsolete.length}件`);
    byStatus.obsolete.forEach(script => {
      console.log(`   - ${script.name}`);
      console.log(`     ${script.reason}`);
    });
    console.log('');
  }
  
  // カテゴリ別の集計
  console.log('【カテゴリ別の集計】');
  const byCategory: Record<string, ScriptInfo[]> = {};
  scriptInfos.forEach(script => {
    if (!byCategory[script.category]) {
      byCategory[script.category] = [];
    }
    byCategory[script.category].push(script);
  });
  
  Object.entries(byCategory).sort().forEach(([category, scripts]) => {
    console.log(`   ${category}: ${scripts.length}件`);
  });
  console.log('');
  
  console.log('─'.repeat(60));
  console.log('✅ ファイル分析が完了しました\n');
  
  console.log('【推奨事項】');
  console.log('   一時的な確認・調査用スクリプトは、作業完了後は削除しても問題ありません。');
  console.log('   ただし、履歴として残しておきたい場合は保持してください。\n');
}

analyzeScriptsDirectory();

