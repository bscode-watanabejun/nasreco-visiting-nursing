/**
 * 開発環境と本番環境のマスタデータを比較確認するスクリプト（読み取り専用）
 * 
 * 確認項目：
 * 1. サービスコード（nursing_service_codes）
 * 2. 訪問場所コード（visit_location_codes）
 * 3. 職員資格コード（staff_qualification_codes）
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from "ws";

neonConfig.webSocketConstructor = ws;

if (!process.env.DEV_DATABASE_URL || !process.env.PROD_DATABASE_URL) {
  console.error('❌ DEV_DATABASE_URL と PROD_DATABASE_URL 環境変数が必要です');
  process.exit(1);
}

const devPool = new Pool({ connectionString: process.env.DEV_DATABASE_URL });
const prodPool = new Pool({ connectionString: process.env.PROD_DATABASE_URL });

async function checkMasterDataComparison() {
  console.log('🔍 開発環境と本番環境のマスタデータを比較確認中...\n');

  try {
    // ========== 1. サービスコード（nursing_service_codes）の確認 ==========
    console.log('📋 1. サービスコード（nursing_service_codes）の確認\n');

    // 1-1. 本番環境で選択済みの件数
    const prodServiceCodeRefs = await prodPool.query(`
      SELECT 
        COUNT(DISTINCT service_code_id) as unique_service_codes,
        COUNT(*) as total_records
      FROM nursing_records
      WHERE service_code_id IS NOT NULL;
    `);

    const prodBonusServiceCodeRefs = await prodPool.query(`
      SELECT 
        COUNT(DISTINCT service_code_id) as unique_service_codes,
        COUNT(*) as total_records
      FROM bonus_calculation_history
      WHERE service_code_id IS NOT NULL;
    `);

    console.log('  本番環境での選択状況:');
    console.log(`    nursing_records: ${prodServiceCodeRefs.rows[0].total_records}件（${prodServiceCodeRefs.rows[0].unique_service_codes}種類のサービスコード）`);
    console.log(`    bonus_calculation_history: ${prodBonusServiceCodeRefs.rows[0].total_records}件（${prodBonusServiceCodeRefs.rows[0].unique_service_codes}種類のサービスコード）\n`);

    // 1-2. 開発環境と本番環境のサービスコード比較
    const devServiceCodes = await devPool.query(`
      SELECT id, service_code, service_name, insurance_type, points, is_active
      FROM nursing_service_codes
      ORDER BY service_code;
    `);

    const prodServiceCodes = await prodPool.query(`
      SELECT id, service_code, service_name, insurance_type, points, is_active
      FROM nursing_service_codes
      ORDER BY service_code;
    `);

    console.log(`  開発環境: ${devServiceCodes.rows.length}件`);
    console.log(`  本番環境: ${prodServiceCodes.rows.length}件\n`);

    // サービスコード（9桁）でマッピング
    const devServiceCodeMap = new Map(devServiceCodes.rows.map((r: any) => [r.service_code, r]));
    const prodServiceCodeMap = new Map(prodServiceCodes.rows.map((r: any) => [r.service_code, r]));

    const commonServiceCodes = Array.from(devServiceCodeMap.keys()).filter(code => prodServiceCodeMap.has(code));
    const onlyInDev = Array.from(devServiceCodeMap.keys()).filter(code => !prodServiceCodeMap.has(code));
    const onlyInProd = Array.from(prodServiceCodeMap.keys()).filter(code => !devServiceCodeMap.has(code));

    console.log(`  共通のサービスコード: ${commonServiceCodes.length}件`);
    console.log(`  開発環境のみ: ${onlyInDev.length}件`);
    console.log(`  本番環境のみ: ${onlyInProd.length}件\n`);

    // 1-3. IDの一致状況確認（同じサービスコードでIDが異なるもの）
    const idMismatches: Array<{ serviceCode: string; devId: string; prodId: string }> = [];
    for (const code of commonServiceCodes) {
      const devCode = devServiceCodeMap.get(code)!;
      const prodCode = prodServiceCodeMap.get(code)!;
      if (devCode.id !== prodCode.id) {
        idMismatches.push({
          serviceCode: code,
          devId: devCode.id,
          prodId: prodCode.id,
        });
      }
    }

    console.log(`  ⚠️  IDが異なるサービスコード: ${idMismatches.length}件`);
    if (idMismatches.length > 0 && idMismatches.length <= 10) {
      idMismatches.forEach(m => {
        console.log(`    ${m.serviceCode}: 開発=${m.devId.substring(0, 8)}..., 本番=${m.prodId.substring(0, 8)}...`);
      });
    } else if (idMismatches.length > 10) {
      idMismatches.slice(0, 10).forEach(m => {
        console.log(`    ${m.serviceCode}: 開発=${m.devId.substring(0, 8)}..., 本番=${m.prodId.substring(0, 8)}...`);
      });
      console.log(`    ... 他 ${idMismatches.length - 10}件`);
    }
    console.log('');

    // 1-4. 本番環境で使用されているサービスコードのIDが開発環境に存在するか確認
    const prodUsedServiceCodeIds = await prodPool.query(`
      SELECT DISTINCT service_code_id
      FROM (
        SELECT service_code_id FROM nursing_records WHERE service_code_id IS NOT NULL
        UNION
        SELECT service_code_id FROM bonus_calculation_history WHERE service_code_id IS NOT NULL
      ) AS used_ids;
    `);

    const prodUsedIds = prodUsedServiceCodeIds.rows.map((r: any) => r.service_code_id);
    const devServiceCodeIdSet = new Set(devServiceCodes.rows.map((r: any) => r.id));
    
    const missingInDev = prodUsedIds.filter(id => !devServiceCodeIdSet.has(id));
    
    console.log(`  本番環境で使用されているサービスコードID: ${prodUsedIds.length}種類`);
    if (missingInDev.length > 0) {
      console.log(`  ⚠️  開発環境に存在しないID: ${missingInDev.length}種類`);
      if (missingInDev.length <= 10) {
        missingInDev.forEach(id => {
          const prodCode = prodServiceCodes.rows.find((r: any) => r.id === id);
          if (prodCode) {
            console.log(`    ID: ${id.substring(0, 8)}... → サービスコード: ${prodCode.service_code} (${prodCode.service_name.substring(0, 40)}...)`);
          } else {
            console.log(`    ID: ${id.substring(0, 8)}... → マスタに存在しません`);
          }
        });
      }
    } else {
      console.log(`  ✅ すべてのIDが開発環境に存在します`);
    }
    console.log('');

    // ========== 2. 訪問場所コード（visit_location_codes）の確認 ==========
    console.log('📋 2. 訪問場所コード（visit_location_codes）の確認\n');

    const prodVisitLocationRefs = await prodPool.query(`
      SELECT 
        COUNT(DISTINCT visit_location_code) as unique_codes,
        COUNT(*) as total_records
      FROM nursing_records
      WHERE visit_location_code IS NOT NULL;
    `);

    console.log('  本番環境での選択状況:');
    console.log(`    nursing_records: ${prodVisitLocationRefs.rows[0].total_records}件（${prodVisitLocationRefs.rows[0].unique_codes}種類のコード）\n`);

    const devVisitLocationCodes = await devPool.query(`
      SELECT location_code, location_name, is_active
      FROM visit_location_codes
      ORDER BY location_code;
    `);

    const prodVisitLocationCodes = await prodPool.query(`
      SELECT location_code, location_name, is_active
      FROM visit_location_codes
      ORDER BY location_code;
    `);

    console.log(`  開発環境: ${devVisitLocationCodes.rows.length}件`);
    console.log(`  本番環境: ${prodVisitLocationCodes.rows.length}件\n`);

    const devLocationCodeSet = new Set(devVisitLocationCodes.rows.map((r: any) => r.location_code));
    const prodLocationCodeSet = new Set(prodVisitLocationCodes.rows.map((r: any) => r.location_code));

    const commonLocationCodes = Array.from(devLocationCodeSet).filter(code => prodLocationCodeSet.has(code));
    const onlyInDevLocation = Array.from(devLocationCodeSet).filter(code => !prodLocationCodeSet.has(code));
    const onlyInProdLocation = Array.from(prodLocationCodeSet).filter(code => !devLocationCodeSet.has(code));

    console.log(`  共通の訪問場所コード: ${commonLocationCodes.length}件`);
    console.log(`  開発環境のみ: ${onlyInDevLocation.length}件`);
    console.log(`  本番環境のみ: ${onlyInProdLocation.length}件\n`);

    // 本番環境で使用されているコードが開発環境に存在するか確認
    const prodUsedLocationCodes = await prodPool.query(`
      SELECT DISTINCT visit_location_code
      FROM nursing_records
      WHERE visit_location_code IS NOT NULL;
    `);

    const prodUsedLocationCodeList = prodUsedLocationCodes.rows.map((r: any) => r.visit_location_code);
    const missingInDevLocation = prodUsedLocationCodeList.filter(code => !devLocationCodeSet.has(code));

    console.log(`  本番環境で使用されている訪問場所コード: ${prodUsedLocationCodeList.length}種類`);
    if (missingInDevLocation.length > 0) {
      console.log(`  ⚠️  開発環境に存在しないコード: ${missingInDevLocation.length}種類`);
      missingInDevLocation.forEach(code => {
        const prodCode = prodVisitLocationCodes.rows.find((r: any) => r.location_code === code);
        if (prodCode) {
          console.log(`    コード: ${code} → ${prodCode.location_name}`);
        }
      });
    } else {
      console.log(`  ✅ すべてのコードが開発環境に存在します`);
    }
    console.log('');

    // ========== 3. 職員資格コード（staff_qualification_codes）の確認 ==========
    console.log('📋 3. 職員資格コード（staff_qualification_codes）の確認\n');

    const prodStaffQualificationRefs = await prodPool.query(`
      SELECT 
        COUNT(DISTINCT staff_qualification_code) as unique_codes,
        COUNT(*) as total_records
      FROM nursing_records
      WHERE staff_qualification_code IS NOT NULL;
    `);

    console.log('  本番環境での選択状況:');
    console.log(`    nursing_records: ${prodStaffQualificationRefs.rows[0].total_records}件（${prodStaffQualificationRefs.rows[0].unique_codes}種類のコード）\n`);

    const devStaffQualificationCodes = await devPool.query(`
      SELECT qualification_code, qualification_name, is_active
      FROM staff_qualification_codes
      ORDER BY qualification_code;
    `);

    const prodStaffQualificationCodes = await prodPool.query(`
      SELECT qualification_code, qualification_name, is_active
      FROM staff_qualification_codes
      ORDER BY qualification_code;
    `);

    console.log(`  開発環境: ${devStaffQualificationCodes.rows.length}件`);
    console.log(`  本番環境: ${prodStaffQualificationCodes.rows.length}件\n`);

    const devQualificationCodeSet = new Set(devStaffQualificationCodes.rows.map((r: any) => r.qualification_code));
    const prodQualificationCodeSet = new Set(prodStaffQualificationCodes.rows.map((r: any) => r.qualification_code));

    const commonQualificationCodes = Array.from(devQualificationCodeSet).filter(code => prodQualificationCodeSet.has(code));
    const onlyInDevQualification = Array.from(devQualificationCodeSet).filter(code => !prodQualificationCodeSet.has(code));
    const onlyInProdQualification = Array.from(prodQualificationCodeSet).filter(code => !devQualificationCodeSet.has(code));

    console.log(`  共通の職員資格コード: ${commonQualificationCodes.length}件`);
    console.log(`  開発環境のみ: ${onlyInDevQualification.length}件`);
    console.log(`  本番環境のみ: ${onlyInProdQualification.length}件\n`);

    // 本番環境で使用されているコードが開発環境に存在するか確認
    const prodUsedQualificationCodes = await prodPool.query(`
      SELECT DISTINCT staff_qualification_code
      FROM nursing_records
      WHERE staff_qualification_code IS NOT NULL;
    `);

    const prodUsedQualificationCodeList = prodUsedQualificationCodes.rows.map((r: any) => r.staff_qualification_code);
    const missingInDevQualification = prodUsedQualificationCodeList.filter(code => !devQualificationCodeSet.has(code));

    console.log(`  本番環境で使用されている職員資格コード: ${prodUsedQualificationCodeList.length}種類`);
    if (missingInDevQualification.length > 0) {
      console.log(`  ⚠️  開発環境に存在しないコード: ${missingInDevQualification.length}種類`);
      missingInDevQualification.forEach(code => {
        const prodCode = prodStaffQualificationCodes.rows.find((r: any) => r.qualification_code === code);
        if (prodCode) {
          console.log(`    コード: ${code} → ${prodCode.qualification_name}`);
        }
      });
    } else {
      console.log(`  ✅ すべてのコードが開発環境に存在します`);
    }
    console.log('');

    // ========== 総合判定 ==========
    console.log('📊 総合判定\n');
    
    const hasServiceCodeIssues = idMismatches.length > 0 || missingInDev.length > 0;
    const hasLocationCodeIssues = missingInDevLocation.length > 0;
    const hasQualificationCodeIssues = missingInDevQualification.length > 0;

    if (hasServiceCodeIssues || hasLocationCodeIssues || hasQualificationCodeIssues) {
      console.log('  ⚠️  マスタデータの入れ替え時に注意が必要な項目があります:\n');
      
      if (hasServiceCodeIssues) {
        console.log('  [サービスコード]');
        if (idMismatches.length > 0) {
          console.log(`    - IDが異なるサービスコード: ${idMismatches.length}件`);
          console.log(`      → 既存の参照を新しいIDに更新する必要があります`);
        }
        if (missingInDev.length > 0) {
          console.log(`    - 開発環境に存在しないID: ${missingInDev.length}種類`);
          console.log(`      → これらのIDを参照しているレコードを更新する必要があります`);
        }
        console.log('');
      }

      if (hasLocationCodeIssues) {
        console.log('  [訪問場所コード]');
        console.log(`    - 開発環境に存在しないコード: ${missingInDevLocation.length}種類`);
        console.log(`      → これらのコードを参照しているレコードを更新する必要があります`);
        console.log('');
      }

      if (hasQualificationCodeIssues) {
        console.log('  [職員資格コード]');
        console.log(`    - 開発環境に存在しないコード: ${missingInDevQualification.length}種類`);
        console.log(`      → これらのコードを参照しているレコードを更新する必要があります`);
        console.log('');
      }
    } else {
      console.log('  ✅ マスタデータの入れ替えは安全に実施できます');
      console.log('     すべての既存参照が開発環境のマスタデータで対応可能です');
    }

  } catch (error: any) {
    console.error('❌ エラーが発生しました:', error.message);
    console.error(error);
  } finally {
    await devPool.end();
    await prodPool.end();
  }
}

checkMasterDataComparison();














