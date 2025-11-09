/**
 * CSV生成ユーティリティ
 *
 * 医療保険レセプトCSV出力に必要な共通機能を提供
 */

import iconv from 'iconv-lite';

/**
 * 文字列をShift_JISバイト列に変換
 */
export function toShiftJIS(str: string): Buffer {
  return iconv.encode(str, 'Shift_JIS');
}

/**
 * 固定長フィールドを生成（右パディング）
 * @param value - 値
 * @param length - フィールド長
 * @param padChar - パディング文字（デフォルト: 半角スペース）
 */
export function padRight(value: string | number | null | undefined, length: number, padChar: string = ' '): string {
  const str = String(value ?? '');
  return str.padEnd(length, padChar).substring(0, length);
}

/**
 * 固定長フィールドを生成（左パディング）
 * @param value - 値
 * @param length - フィールド長
 * @param padChar - パディング文字（デフォルト: 0）
 */
export function padLeft(value: string | number | null | undefined, length: number, padChar: string = '0'): string {
  const str = String(value ?? '');
  return str.padStart(length, padChar).substring(0, length);
}

/**
 * 数値を固定長の文字列に変換（0埋め）
 * @param value - 数値
 * @param length - フィールド長
 */
export function formatNumber(value: number | null | undefined, length: number): string {
  return padLeft(value ?? 0, length, '0');
}

/**
 * 日付を YYYYMMDD 形式の文字列に変換
 * @param date - 日付（Date型、ISO文字列、またはYYYY-MM-DD形式）
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '00000000';

  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '00000000';

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  return `${year}${month}${day}`;
}

/**
 * 日付を和暦 gYYMMDD 形式に変換
 * @param date - 日付
 * @returns 和暦形式の文字列（例: "5250401" = 令和5年4月1日）
 */
export function formatJapaneseDate(date: Date | string | null | undefined): string {
  if (!date) return '0000000';

  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '0000000';

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  let eraCode: string;
  let eraYear: number;

  if (year >= 2019 && (year > 2019 || d.getMonth() >= 4)) {
    // 令和（2019年5月1日〜）
    eraCode = '5';
    eraYear = year - 2018;
  } else if (year >= 1989) {
    // 平成（1989年1月8日〜2019年4月30日）
    eraCode = '4';
    eraYear = year - 1988;
  } else if (year >= 1926) {
    // 昭和（1926年12月25日〜1989年1月7日）
    eraCode = '3';
    eraYear = year - 1925;
  } else {
    // 大正以前は対応しない
    eraCode = '0';
    eraYear = 0;
  }

  return `${eraCode}${String(eraYear).padStart(2, '0')}${month}${day}`;
}

/**
 * カナ文字を全角カタカナに統一
 * @param str - 入力文字列
 */
export function normalizeKana(str: string | null | undefined): string {
  if (!str) return '';

  // 半角カタカナを全角カタカナに変換
  const halfToFull: { [key: string]: string } = {
    'ｱ': 'ア', 'ｲ': 'イ', 'ｳ': 'ウ', 'ｴ': 'エ', 'ｵ': 'オ',
    'ｶ': 'カ', 'ｷ': 'キ', 'ｸ': 'ク', 'ｹ': 'ケ', 'ｺ': 'コ',
    'ｻ': 'サ', 'ｼ': 'シ', 'ｽ': 'ス', 'ｾ': 'セ', 'ｿ': 'ソ',
    'ﾀ': 'タ', 'ﾁ': 'チ', 'ﾂ': 'ツ', 'ﾃ': 'テ', 'ﾄ': 'ト',
    'ﾅ': 'ナ', 'ﾆ': 'ニ', 'ﾇ': 'ヌ', 'ﾈ': 'ネ', 'ﾉ': 'ノ',
    'ﾊ': 'ハ', 'ﾋ': 'ヒ', 'ﾌ': 'フ', 'ﾍ': 'ヘ', 'ﾎ': 'ホ',
    'ﾏ': 'マ', 'ﾐ': 'ミ', 'ﾑ': 'ム', 'ﾒ': 'メ', 'ﾓ': 'モ',
    'ﾔ': 'ヤ', 'ﾕ': 'ユ', 'ﾖ': 'ヨ',
    'ﾗ': 'ラ', 'ﾘ': 'リ', 'ﾙ': 'ル', 'ﾚ': 'レ', 'ﾛ': 'ロ',
    'ﾜ': 'ワ', 'ｦ': 'ヲ', 'ﾝ': 'ン',
    'ｧ': 'ァ', 'ｨ': 'ィ', 'ｩ': 'ゥ', 'ｪ': 'ェ', 'ｫ': 'ォ',
    'ｬ': 'ャ', 'ｭ': 'ュ', 'ｮ': 'ョ', 'ｯ': 'ッ',
    'ｰ': 'ー', '｡': '。', '｢': '「', '｣': '」', '､': '、', '･': '・',
  };

  let result = str;
  for (const [half, full] of Object.entries(halfToFull)) {
    result = result.replace(new RegExp(half, 'g'), full);
  }

  // ひらがなをカタカナに変換
  result = result.replace(/[\u3041-\u3096]/g, (match) => {
    return String.fromCharCode(match.charCodeAt(0) + 0x60);
  });

  return result;
}

/**
 * CSVレコードの行を生成
 * @param fields - フィールド配列
 * @returns CSV行文字列（改行コード付き）
 */
export function buildCsvLine(fields: string[]): string {
  return fields.join(',') + '\r\n';
}

/**
 * CSVファイル全体を生成してShift_JISバイト列に変換
 * @param lines - CSV行の配列
 * @returns Shift_JISエンコードされたBuffer（EOFコード0x1A付き）
 */
export function buildCsvFile(lines: string[]): Buffer {
  const csvContent = lines.join('');
  const shiftJisBuffer = toShiftJIS(csvContent);
  // ファイル終端にEOFコード（0x1A）を1バイト追加（公式仕様）
  return Buffer.concat([shiftJisBuffer, Buffer.from([0x1A])]);
}

/**
 * レコード識別番号を生成
 * 各レコードの先頭に付与される識別番号
 */
export enum RecordType {
  RE = '1',   // レセプト共通レコード
  KO = '11',  // 保険者レコード
  HO = '12',  // 保険医療機関レコード
  KH = '20',  // 公費レコード
  SY = '21',  // 傷病名レコード
  SI = '22',  // 診療行為レコード
  IY = '23',  // 医薬品レコード
  TO = '24',  // 特定器材レコード
  CO = '25',  // コメントレコード
  SN = '28',  // 診療実日数レコード
  NI = '30',  // 入院レコード
  MS = '40',  // 摘要欄レコード
  GZ = '80',  // 外来管理加算レコード
  KK = '90',  // 確認欄レコード
  GO = '99',  // 合計レコード
}

/**
 * レコードの共通フィールドを含むベースインターフェース
 */
export interface BaseRecord {
  recordType: string;
  sequenceNumber: number;
}

/**
 * シーケンス番号を管理するクラス
 */
export class SequenceNumberGenerator {
  private current: number = 0;

  next(): number {
    this.current++;
    return this.current;
  }

  reset(): void {
    this.current = 0;
  }

  getCurrent(): number {
    return this.current;
  }
}
