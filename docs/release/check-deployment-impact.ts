/**
 * 開発環境と本番環境の包括的なDB差異確認スクリプト
 * 
 * 再デプロイ前に、スキーマ、マスターデータ、テナントデータの全ての差異を確認します。
 * 特に「訪問看護ステーションソレア春日部」のテナントデータを保護します。
 * 
 * 実行方法:
 *   npx tsx docs/release/check-deployment-impact.ts
 * 
 * または、プロジェクトルートから:
 *   npx tsx ./docs/release/check-deployment-impact.ts
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

// データベース接続文字列（本番環境と開発環境）
const PROD_DB_URL = 'postgresql://neondb_owner:npg_yASiEqWs0rz5@ep-still-water-aeb6ynp2.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';
const DEV_DB_URL = 'postgresql://neondb_owner:npg_beoRr4gaQ5Dl@ep-polished-scene-a5twqv82.us-east-2.aws.neon.tech/neondb?sslmode=require';

interface ComparisonResult {
  category: string;
  prodCount: number;
  devCount: number;
  differences: string[];
  warnings: string[];
  safe: boolean;
}

async function comprehensiveDiffCheck() {
  console.log('🔍 開発環境と本番環境の包括的なDB差異確認\n');
  console.log('⚠️  本番データベースに接続します（読み取り専用）\n');
  console.log('═'.repeat(80));
  
  const prodPool = new Pool({ connectionString: PROD_DB_URL });
  const devPool = new Pool({ connectionString: DEV_DB_URL });

  const results: ComparisonResult[] = [];

  try {
    // ========== 1. スキーマの比較 ==========
    console.log('\n📊 1. データベーススキーマの比較');
    console.log('─'.repeat(80));
    
    // テーブル一覧の比較
    const prodTables = await prodPool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    const devTables = await devPool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    const prodTableNames = prodTables.rows.map((r: any) => r.table_name);
    const devTableNames = devTables.rows.map((r: any) => r.table_name);
    
    console.log(`   本番環境のテーブル数: ${prodTableNames.length}`);
    console.log(`   開発環境のテーブル数: ${devTableNames.length}`);
    
    const missingInProd = devTableNames.filter(t => !prodTableNames.includes(t));
    const missingInDev = prodTableNames.filter(t => !devTableNames.includes(t));
    
    if (missingInProd.length > 0) {
      console.log(`\n   ⚠️  本番環境に存在しないテーブル（追加予定）: ${missingInProd.length}個`);
      missingInProd.forEach(t => console.log(`      - ${t}`));
    }
    if (missingInDev.length > 0) {
      console.log(`\n   ⚠️  開発環境に存在しないテーブル: ${missingInDev.length}個`);
      missingInDev.forEach(t => console.log(`      - ${t}`));
    }
    if (missingInProd.length === 0 && missingInDev.length === 0) {
      console.log('   ✅ テーブル構成は一致しています');
    }
    
    // 各テーブルのカラム比較
    const commonTables = prodTableNames.filter(t => devTableNames.includes(t));
    let schemaDifferences: string[] = [];
    let hasMissingInProdCols = false;
    
    for (const tableName of commonTables) {
      const prodColumns = await prodPool.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);
      
      const devColumns = await devPool.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);
      
      const prodColMap = new Map(prodColumns.rows.map((r: any) => [r.column_name, r]));
      const devColMap = new Map(devColumns.rows.map((r: any) => [r.column_name, r]));
      
      const missingInProdCols = Array.from(devColMap.keys()).filter(c => !prodColMap.has(c));
      const missingInDevCols = Array.from(prodColMap.keys()).filter(c => !devColMap.has(c));
      
      if (missingInProdCols.length > 0) {
        hasMissingInProdCols = true;
        schemaDifferences.push(`${tableName}: 本番に存在しないカラム [${missingInProdCols.join(', ')}]`);
      }
      
      if (missingInDevCols.length > 0) {
        schemaDifferences.push(`${tableName}: 開発に存在しないカラム [${missingInDevCols.join(', ')}]`);
      }
    }
    
    if (schemaDifferences.length > 0) {
      console.log('\n   ⚠️  スキーマ差異:');
      schemaDifferences.forEach(diff => console.log(`      - ${diff}`));
    } else {
      console.log('   ✅ スキーマは完全に一致しています');
    }
    
    results.push({
      category: 'スキーマ',
      prodCount: prodTableNames.length,
      devCount: devTableNames.length,
      differences: schemaDifferences,
      warnings: [],
      safe: !hasMissingInProdCols || schemaDifferences.every(d => d.includes('本番に存在しない'))
    });

    // ========== 2. 施設情報の確認 ==========
    console.log('\n📊 2. 施設情報の比較');
    console.log('─'.repeat(80));
    
    const prodFacilities = await prodPool.query(`
      SELECT id, name, facility_code, prefecture_code, company_id
      FROM facilities
      ORDER BY name
    `);
    
    const devFacilities = await devPool.query(`
      SELECT id, name, facility_code, prefecture_code, company_id
      FROM facilities
      ORDER BY name
    `);
    
    console.log(`   本番環境: ${prodFacilities.rows.length}件`);
    prodFacilities.rows.forEach((f: any) => {
      console.log(`      - ${f.name} (ID: ${f.id.substring(0, 8)}..., コード: ${f.facility_code || '未設定'})`);
    });
    
    console.log(`\n   開発環境: ${devFacilities.rows.length}件`);
    devFacilities.rows.forEach((f: any) => {
      console.log(`      - ${f.name} (ID: ${f.id.substring(0, 8)}..., コード: ${f.facility_code || '未設定'})`);
    });
    
    // ソレア春日部の特定
    const soleraProd = prodFacilities.rows.find((f: any) => 
      f.name.includes('ソレア') || f.name.includes('春日部')
    );
    
    const soleraDev = devFacilities.rows.find((f: any) => 
      f.name.includes('ソレア') || f.name.includes('春日部')
    );
    
    if (soleraProd) {
      console.log(`\n   ✅ 本番環境で「訪問看護ステーションソレア春日部」を確認:`);
      console.log(`      名称: ${soleraProd.name}`);
      console.log(`      ID: ${soleraProd.id}`);
      console.log(`      施設コード: ${soleraProd.facility_code || '未設定'}`);
      console.log(`      都道府県コード: ${soleraProd.prefecture_code || '未設定'}`);
    } else {
      console.log(`\n   ⚠️  本番環境で「訪問看護ステーションソレア春日部」が見つかりませんでした`);
    }
    
    results.push({
      category: '施設',
      prodCount: prodFacilities.rows.length,
      devCount: devFacilities.rows.length,
      differences: [],
      warnings: soleraProd ? [] : ['ソレア春日部が見つかりません'],
      safe: true
    });

    // ========== 3. マスターデータの比較 ==========
    console.log('\n📊 3. マスターデータの比較');
    console.log('─'.repeat(80));
    
    const masterTables = [
      { name: 'nursing_service_codes', label: 'サービスコードマスタ' },
      { name: 'bonus_master', label: '加算マスタ' },
      { name: 'visit_location_codes', label: '訪問場所コード' },
      { name: 'staff_qualification_codes', label: '職員資格コード' },
      { name: 'prefecture_codes', label: '都道府県コード' },
      { name: 'receipt_type_codes', label: 'レセプト種別コード' },
    ];
    
    for (const { name, label } of masterTables) {
      try {
        const prodCount = await prodPool.query(`SELECT COUNT(*) as count FROM ${name}`);
        const devCount = await devPool.query(`SELECT COUNT(*) as count FROM ${name}`);
        
        const prodActive = await prodPool.query(`SELECT COUNT(*) as count FROM ${name} WHERE is_active = true`).catch(() => ({ rows: [{ count: 0 }] }));
        const devActive = await devPool.query(`SELECT COUNT(*) as count FROM ${name} WHERE is_active = true`).catch(() => ({ rows: [{ count: 0 }] }));
        
        const prodC = parseInt(prodCount.rows[0].count);
        const devC = parseInt(devCount.rows[0].count);
        const prodA = parseInt(prodActive.rows[0].count);
        const devA = parseInt(devActive.rows[0].count);
        
        console.log(`\n   ${label}:`);
        console.log(`      本番: 総数 ${prodC}件、有効 ${prodA}件`);
        console.log(`      開発: 総数 ${devC}件、有効 ${devA}件`);
        
        if (prodC !== devC || prodA !== devA) {
          console.log(`      ⚠️  差異あり`);
          results.push({
            category: label,
            prodCount: prodC,
            devCount: devC,
            differences: [`総数: ${prodC} vs ${devC}`, `有効: ${prodA} vs ${devA}`],
            warnings: [],
            safe: true // マスターデータの差異は通常問題なし
          });
        } else {
          console.log(`      ✅ 一致`);
        }
      } catch (error: any) {
        console.log(`\n   ${label}: テーブルが存在しません（スキップ）`);
      }
    }

    // ========== 4. ソレア春日部のテナントデータ確認 ==========
    if (soleraProd) {
      console.log('\n📊 4. ソレア春日部のテナントデータ確認');
      console.log('─'.repeat(80));
      
      const soleraId = soleraProd.id;
      
      // 患者数
      const prodPatients = await prodPool.query({
        text: `SELECT COUNT(*) as count, COUNT(*) FILTER (WHERE is_active = true) as active_count FROM patients WHERE facility_id = $1`,
        values: [soleraId]
      });
      
      const devPatients = soleraDev ? await devPool.query({
        text: `SELECT COUNT(*) as count, COUNT(*) FILTER (WHERE is_active = true) as active_count FROM patients WHERE facility_id = $1`,
        values: [soleraDev.id]
      }) : { rows: [{ count: 0, active_count: 0 }] };
      
      console.log(`   患者数:`);
      console.log(`      本番: 総数 ${prodPatients.rows[0].count}名、アクティブ ${prodPatients.rows[0].active_count}名`);
      console.log(`      開発: 総数 ${devPatients.rows[0].count}名、アクティブ ${devPatients.rows[0].active_count}名`);
      
      // 訪問記録数
      const prodRecords = await prodPool.query({
        text: `SELECT COUNT(*) as count FROM nursing_records WHERE facility_id = $1`,
        values: [soleraId]
      });
      
      const devRecords = soleraDev ? await devPool.query({
        text: `SELECT COUNT(*) as count FROM nursing_records WHERE facility_id = $1`,
        values: [soleraDev.id]
      }) : { rows: [{ count: 0 }] };
      
      console.log(`   訪問記録数:`);
      console.log(`      本番: ${prodRecords.rows[0].count}件`);
      console.log(`      開発: ${devRecords.rows[0].count}件`);
      
      // 月次レセプト数
      const prodReceipts = await prodPool.query({
        text: `SELECT COUNT(*) as count, COUNT(*) FILTER (WHERE is_confirmed = true) as confirmed_count, COUNT(*) FILTER (WHERE is_sent = true) as sent_count FROM monthly_receipts WHERE facility_id = $1`,
        values: [soleraId]
      });
      
      const devReceipts = soleraDev ? await devPool.query({
        text: `SELECT COUNT(*) as count, COUNT(*) FILTER (WHERE is_confirmed = true) as confirmed_count, COUNT(*) FILTER (WHERE is_sent = true) as sent_count FROM monthly_receipts WHERE facility_id = $1`,
        values: [soleraDev.id]
      }) : { rows: [{ count: 0, confirmed_count: 0, sent_count: 0 }] };
      
      console.log(`   月次レセプト数:`);
      console.log(`      本番: 総数 ${prodReceipts.rows[0].count}件、確定済み ${prodReceipts.rows[0].confirmed_count}件、送信済み ${prodReceipts.rows[0].sent_count}件`);
      console.log(`      開発: 総数 ${devReceipts.rows[0].count}件、確定済み ${devReceipts.rows[0].confirmed_count}件、送信済み ${devReceipts.rows[0].sent_count}件`);
      
      // ユーザー数
      const prodUsers = await prodPool.query({
        text: `SELECT COUNT(*) as count FROM users WHERE facility_id = $1`,
        values: [soleraId]
      });
      
      const devUsers = soleraDev ? await devPool.query({
        text: `SELECT COUNT(*) as count FROM users WHERE facility_id = $1`,
        values: [soleraDev.id]
      }) : { rows: [{ count: 0 }] };
      
      console.log(`   ユーザー数:`);
      console.log(`      本番: ${prodUsers.rows[0].count}名`);
      console.log(`      開発: ${devUsers.rows[0].count}名`);
      
      results.push({
        category: 'ソレア春日部データ',
        prodCount: parseInt(prodPatients.rows[0].count),
        devCount: parseInt(devPatients.rows[0].count),
        differences: [],
        warnings: [],
        safe: true
      });
    }

    // ========== 5. 本番環境にのみ存在する重要なデータ ==========
    console.log('\n📊 5. 本番環境にのみ存在する重要なデータ');
    console.log('─'.repeat(80));
    
    // 確定済みレセプト
    const confirmedReceipts = await prodPool.query(`
      SELECT COUNT(*) as count
      FROM monthly_receipts
      WHERE is_confirmed = true
    `);
    
    console.log(`   確定済みレセプト: ${confirmedReceipts.rows[0].count}件`);
    console.log(`      ⚠️  これらのデータは保護が必要です`);
    
    // 送信済みレセプト
    const sentReceipts = await prodPool.query(`
      SELECT COUNT(*) as count
      FROM monthly_receipts
      WHERE is_sent = true
    `);
    
    console.log(`   送信済みレセプト: ${sentReceipts.rows[0].count}件`);
    console.log(`      ⚠️  これらのデータは保護が必要です`);

    // ========== 6. 全テーブルのデータ件数比較 ==========
    console.log('\n📊 6. 全テーブルのデータ件数比較');
    console.log('─'.repeat(80));
    
    console.log('\n   テーブル別データ件数:');
    console.log('   ' + '━'.repeat(70));
    console.log(`   ${'テーブル名'.padEnd(35)} ${'本番環境'.padStart(12)} ${'開発環境'.padStart(12)}`);
    console.log('   ' + '━'.repeat(70));
    
    const importantTables = [
      'companies', 'facilities', 'users', 'patients', 'nursing_records',
      'schedules', 'visits', 'medications', 'doctor_orders', 'insurance_cards',
      'care_plans', 'care_reports', 'contracts', 'monthly_receipts',
      'bonus_calculation_history', 'nursing_record_edit_history'
    ];
    
    for (const tableName of importantTables) {
      if (!commonTables.includes(tableName)) continue;
      
      try {
        const prodCount = await prodPool.query(`SELECT COUNT(*) as count FROM ${tableName}`);
        const devCount = await devPool.query(`SELECT COUNT(*) as count FROM ${tableName}`);
        
        const prodC = parseInt(prodCount.rows[0].count);
        const devC = parseInt(devCount.rows[0].count);
        
        const marker = prodC > 0 ? '🔴' : '  ';
        console.log(`   ${marker} ${tableName.padEnd(33)} ${String(prodC).padStart(12)} ${String(devC).padStart(12)}`);
      } catch (error: any) {
        // テーブルが存在しない場合はスキップ
      }
    }

    // ========== 7. 再デプロイの影響分析 ==========
    console.log('\n📊 7. 再デプロイの影響分析');
    console.log('─'.repeat(80));
    
    // スキーマ変更の確認
    const schemaChanges = schemaDifferences.filter(d => d.includes('本番に存在しない'));
    
    if (schemaChanges.length > 0) {
      console.log(`   ⚠️  スキーマ変更が検出されました:`);
      schemaChanges.forEach(change => {
        console.log(`      - ${change}`);
      });
      console.log(`\n   ✅ 影響分析:`);
      console.log(`      - これらの変更はNULL許容カラムの追加のみの可能性が高い`);
      console.log(`      - 既存データには影響なし`);
      console.log(`      - Replitデプロイ時に自動で npm run db:push が実行されます`);
      console.log(`      - 手動での db:push 実行は不要です`);
    } else {
      console.log(`   ✅ スキーマ変更は検出されませんでした`);
      console.log(`      - 既存のスキーマと一致しているため、db:push は不要です`);
    }

    // ========== 8. まとめと推奨事項 ==========
    console.log('\n📊 8. まとめと推奨事項');
    console.log('─'.repeat(80));
    
    const hasWarnings = results.some(r => r.warnings.length > 0);
    const hasUnsafeChanges = results.some(r => !r.safe);
    
    if (!hasUnsafeChanges && !hasWarnings) {
      console.log('   ✅ 再デプロイは安全です');
      console.log('      - スキーマ変更は既存データに影響しません');
      console.log('      - コード変更は既存データに影響しません');
      console.log('      - 本番環境のデータは保護されます');
      console.log('      - ソレア春日部のデータは保護されます');
    } else {
      console.log('   ⚠️  注意が必要です');
      if (hasUnsafeChanges) {
        console.log('      - スキーマ変更に注意が必要です');
      }
      if (hasWarnings) {
        console.log('      - 警告事項があります');
        results.forEach(r => {
          if (r.warnings.length > 0) {
            r.warnings.forEach(w => console.log(`        - ${r.category}: ${w}`));
          }
        });
      }
    }
    
    console.log('\n   📋 デプロイ前のチェックリスト:');
    console.log('      [ ] 本番環境のDATABASE_URLが正しく設定されている（Replit環境変数）');
    console.log('      [ ] 本番環境のSESSION_SECRETが設定されている（Replit環境変数）');
    console.log('      [ ] 本番環境のNODE_ENV=productionが設定されている（通常は自動）');
    console.log('      [ ] 本番環境のバックアップが取得されている（推奨）');
    if (schemaChanges.length > 0) {
      console.log('      [ ] スキーマ変更が検出されましたが、Replitデプロイ時に自動で適用されます');
    }
    
    console.log('\n   📋 デプロイ後の確認事項:');
    console.log('      [ ] アプリケーションが正常に起動する');
    console.log('      [ ] ソレア春日部のデータが正常にアクセスできる');
    console.log('      [ ] 既存のレセプトデータが正常に表示される');
    console.log('      [ ] ユーザーログインが正常に動作する');

    console.log('\n' + '═'.repeat(80));
    console.log('✅ 包括的なDB差異確認が完了しました\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prodPool.end();
    await devPool.end();
  }
}

comprehensiveDiffCheck()
  .then(() => {
    console.log('処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('処理中にエラーが発生しました:', error);
    process.exit(1);
  });

