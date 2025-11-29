/**
 * Excel出力用の和暦変換ユーティリティ
 */

/**
 * 日付を和暦形式（元号名含む）に変換
 * 出力形式: 「3 昭32・2・22生」（元号コード + 元号名 + 年・月・日 + 生）
 * @param date - 日付
 * @returns 和暦形式の文字列（例: "3 昭32・2・22生"）
 */
export function formatJapaneseDateWithEraName(date: Date | string | null | undefined): string {
  if (!date) return '';

  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';

  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();

  let eraCode: string;
  let eraName: string;
  let eraYear: number;

  if (year >= 2019 && (year > 2019 || d.getMonth() >= 4)) {
    // 令和（2019年5月1日〜）
    eraCode = '5';
    eraName = '令';
    eraYear = year - 2018;
  } else if (year >= 1989) {
    // 平成（1989年1月8日〜2019年4月30日）
    eraCode = '4';
    eraName = '平';
    eraYear = year - 1988;
  } else if (year >= 1926) {
    // 昭和（1926年12月25日〜1989年1月7日）
    eraCode = '3';
    eraName = '昭';
    eraYear = year - 1925;
  } else if (year >= 1912) {
    // 大正（1912年7月30日〜1926年12月24日）
    eraCode = '2';
    eraName = '大';
    eraYear = year - 1911;
  } else if (year >= 1868) {
    // 明治（1868年1月25日〜1912年7月29日）
    eraCode = '1';
    eraName = '明';
    eraYear = year - 1867;
  } else {
    // それ以前は対応しない
    return '';
  }

  return `${eraCode} ${eraName}${eraYear}・${month}・${day}生`;
}

/**
 * 給付割合を変換
 * 変換例: "030" → "3", "035" → "3.5"
 * @param ratio - 給付割合（3桁の文字列、例: "030", "035"）
 * @returns 変換後の文字列（例: "3", "3.5"）
 */
export function formatBenefitRatio(ratio: string | null | undefined): string {
  if (!ratio) return '';

  // 3桁の数字文字列を想定
  const num = parseInt(ratio, 10);
  if (isNaN(num)) return '';

  // 10で割って小数点以下1桁まで表示
  const result = num / 10;
  
  // 小数点以下が0の場合は整数として表示
  if (result % 1 === 0) {
    return String(result);
  }

  return String(result);
}

