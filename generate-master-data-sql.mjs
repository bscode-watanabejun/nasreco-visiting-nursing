#!/usr/bin/env node
/**
 * マスタデータCSVからINSERT文を生成するスクリプト
 * Phase 4: 本番環境投入用
 */

import fs from 'fs';
import path from 'path';

const CSV_DIR = '/tmp';
const OUTPUT_FILE = '/home/runner/workspace/insert_master_data.sql';

const tables = [
  { name: 'nursing_service_codes', file: 'nursing_service_codes.csv' },
  { name: 'visit_location_codes', file: 'visit_location_codes.csv' },
  { name: 'staff_qualification_codes', file: 'staff_qualification_codes.csv' },
  { name: 'prefecture_codes', file: 'prefecture_codes.csv' },
  { name: 'public_expense_cards', file: 'public_expense_cards.csv' },
  { name: 'receipt_type_codes', file: 'receipt_type_codes.csv' },
];

function escapeValue(value) {
  if (value === '' || value === null || value === undefined) {
    return 'NULL';
  }
  // Boolean値
  if (value === 'true' || value === 't') return 'true';
  if (value === 'false' || value === 'f') return 'false';

  // 数値（整数のみ）
  if (/^-?\d+$/.test(value)) {
    return value;
  }

  // 文字列（シングルクォートをエスケープ）
  return `'${value.replace(/'/g, "''")}'`;
}

function parseCSV(content) {
  const lines = content.split('\n').filter(line => line.trim());
  const headers = lines[0].split(',');
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let j = 0; j < lines[i].length; j++) {
      const char = lines[i][j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current);

    if (values.length === headers.length) {
      rows.push(values);
    }
  }

  return { headers, rows };
}

async function generateSQL() {
  let sql = `-- マスタデータ投入SQL
-- Phase 4: 訪問看護記録UI改善
-- Generated: ${new Date().toISOString()}

`;

  for (const table of tables) {
    const filePath = path.join(CSV_DIR, table.file);

    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️  ${table.file} not found, skipping...`);
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const { headers, rows } = parseCSV(content);

    sql += `-- ========== ${table.name} (${rows.length} records) ==========\n`;
    sql += `INSERT INTO ${table.name} (${headers.join(', ')}) VALUES\n`;

    rows.forEach((row, index) => {
      const values = row.map(escapeValue).join(', ');
      sql += `  (${values})`;
      sql += index < rows.length - 1 ? ',\n' : ';\n';
    });

    sql += '\n';
    console.log(`✓ ${table.name}: ${rows.length} records`);
  }

  sql += `-- Total: ${tables.length} tables exported\n`;

  fs.writeFileSync(OUTPUT_FILE, sql);
  console.log(`\n✅ SQL file generated: ${OUTPUT_FILE}`);
}

generateSQL().catch(console.error);
