/**
 * 介護保険サービスコード一覧表示スクリプト
 * 
 * 実際に登録されている介護保険のサービスコードとサービス名を全て表示して、
 * 基本療養費と加算の判別方法を検討するためのデータを提供します。
 * 
 * 実行方法:
 *   npx tsx scripts/list-care-service-codes.ts
 */

import { db } from '../server/db';
import { nursingServiceCodes } from '../shared/schema';
import { eq, and } from 'drizzle-orm';

async function listCareServiceCodes() {
  console.log('📊 介護保険サービスコード一覧を取得中...\n');

  try {
    // 有効な介護保険サービスコードを全て取得
    const careCodes = await db.query.nursingServiceCodes.findMany({
      where: and(
        eq(nursingServiceCodes.insuranceType, 'care'),
        eq(nursingServiceCodes.isActive, true)
      ),
      orderBy: (nursingServiceCodes, { asc }) => [asc(nursingServiceCodes.serviceCode)],
    });

    console.log(`✅ 介護保険サービスコード: ${careCodes.length}件\n`);
    console.log('=' .repeat(80));
    console.log('【全サービスコード一覧】');
    console.log('=' .repeat(80));
    console.log('');

    // サービスコードとサービス名を全て表示
    careCodes.forEach((code, index) => {
      console.log(`${String(index + 1).padStart(3, ' ')}. ${code.serviceCode} - ${code.serviceName} (${code.points}単位)`);
    });

    console.log('');
    console.log('=' .repeat(80));
    console.log('【サービス名のパターン分析】');
    console.log('=' .repeat(80));
    console.log('');

    // サービス名のパターンを分析
    const patterns: Record<string, number> = {};
    const containsDot: string[] = [];
    const containsKeywords: Record<string, string[]> = {};

    // よく使われそうなキーワードをチェック
    const keywordChecks = [
      '夜', '早', '深', '複', '緊', '24', 'タ', '特', '専', '退', '乳',
      '・', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', '訪看'
    ];

    careCodes.forEach(code => {
      const name = code.serviceName;
      
      // 「・」を含むかチェック
      if (name.includes('・')) {
        containsDot.push(`${code.serviceCode} - ${name}`);
      }

      // キーワードチェック
      keywordChecks.forEach(keyword => {
        if (name.includes(keyword)) {
          if (!containsKeywords[keyword]) {
            containsKeywords[keyword] = [];
          }
          containsKeywords[keyword].push(`${code.serviceCode} - ${name}`);
        }
      });

      // パターン分析（「訪看」で始まるかなど）
      if (name.startsWith('訪看')) {
        patterns['訪看で始まる'] = (patterns['訪看で始まる'] || 0) + 1;
      }
      if (name.includes('・')) {
        patterns['「・」を含む'] = (patterns['「・」を含む'] || 0) + 1;
      }
    });

    console.log('【パターン別の件数】');
    Object.keys(patterns).forEach(pattern => {
      console.log(`  ${pattern}: ${patterns[pattern]}件`);
    });

    console.log('');
    console.log('【「・」を含むサービスコード】');
    if (containsDot.length > 0) {
      containsDot.forEach(item => {
        console.log(`  - ${item}`);
      });
    } else {
      console.log('  （該当なし）');
    }

    console.log('');
    console.log('【キーワード別のサービスコード】');
    Object.keys(containsKeywords).sort().forEach(keyword => {
      console.log(`\n  【「${keyword}」を含む】 (${containsKeywords[keyword].length}件)`);
      containsKeywords[keyword].forEach(item => {
        console.log(`    - ${item}`);
      });
    });

    // 基本療養費の候補を推測
    console.log('');
    console.log('=' .repeat(80));
    console.log('【基本療養費の候補（推測）】');
    console.log('=' .repeat(80));
    console.log('');

    // 「訪看」で始まり、「・」を含まないものを基本療養費の候補とする
    const basicCandidates = careCodes.filter(code => {
      const name = code.serviceName;
      return name.startsWith('訪看') && !name.includes('・');
    });

    console.log(`候補数: ${basicCandidates.length}件\n`);
    basicCandidates.forEach((code, index) => {
      console.log(`${String(index + 1).padStart(3, ' ')}. ${code.serviceCode} - ${code.serviceName} (${code.points}単位)`);
    });

    // 加算の候補を推測
    console.log('');
    console.log('=' .repeat(80));
    console.log('【加算の候補（推測）】');
    console.log('=' .repeat(80));
    console.log('');

    // 「・」を含むものを加算の候補とする
    const bonusCandidates = careCodes.filter(code => {
      return code.serviceName.includes('・');
    });

    console.log(`候補数: ${bonusCandidates.length}件\n`);
    bonusCandidates.forEach((code, index) => {
      console.log(`${String(index + 1).padStart(3, ' ')}. ${code.serviceCode} - ${code.serviceName} (${code.points}単位)`);
    });

  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error);
    throw error;
  }
}

listCareServiceCodes()
  .then(() => {
    console.log('\n処理を終了します。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nスクリプトが失敗しました:', error);
    process.exit(1);
  });

