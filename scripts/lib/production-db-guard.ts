/**
 * 本番DBアクセス制限ガード
 * 
 * 本番DBへのアクセスを制限し、ユーザーの明示的な承認が必要な操作を防止します。
 */

/**
 * 本番DBの接続文字列パターン
 */
const PRODUCTION_DB_PATTERNS = [
  /ep-still-water-aeb6ynp2\.c-2\.us-east-2\.aws\.neon\.tech/i, // 現在の本番DB
  /PRODUCTION/i,
  /production/i,
];

/**
 * 本番DBへの接続文字列かどうかを判定
 */
export function isProductionDatabase(connectionString: string | undefined): boolean {
  if (!connectionString) return false;
  
  return PRODUCTION_DB_PATTERNS.some(pattern => pattern.test(connectionString));
}

/**
 * 本番DBへのアクセスを試みた場合にエラーをスロー
 * 
 * @param operation 操作の種類（'read' | 'write'）
 * @param connectionString 接続文字列
 */
export function guardProductionDatabaseAccess(
  operation: 'read' | 'write',
  connectionString: string | undefined
): void {
  if (!isProductionDatabase(connectionString)) {
    return; // 本番DBではない場合は許可
  }

  if (operation === 'write') {
    throw new Error(
      '🚨 本番データベースへの書き込み操作は禁止されています。\n' +
      '   本番DBへの更新を実行するには、ユーザーの明示的な承認が必要です。\n' +
      '   ユーザーに確認してから実行してください。'
    );
  }

  // 読み取り操作の場合も警告を表示（ただし実行は許可）
  console.warn(
    '⚠️  警告: 本番データベースへの読み取りアクセスを検出しました。\n' +
    '   本番DBへのアクセスは、ユーザーの承認が必要です。\n'
  );
}

/**
 * 本番DBへのアクセスを確認するプロンプト（開発用）
 * 
 * 実際の実装では、ユーザーとの対話が必要な場合は
 * この関数を拡張して使用できます。
 */
export function requireProductionAccessConfirmation(
  operation: 'read' | 'write',
  connectionString: string | undefined
): boolean {
  if (!isProductionDatabase(connectionString)) {
    return true; // 本番DBではない場合は常に許可
  }

  // 本番DBの場合、この関数が呼ばれた時点で
  // ユーザーが明示的に承認していることを前提とする
  // （実際の対話型確認は、CLAUDE.mdのルールに従って手動で行う）
  
  if (operation === 'write') {
    console.error(
      '🚨 本番データベースへの書き込み操作は実行できません。\n' +
      '   ユーザーの明示的な承認が必要です。\n'
    );
    return false;
  }

  return true; // 読み取りは警告のみで許可
}

