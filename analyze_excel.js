const ExcelJS = require('exceljs');
const fs = require('fs');
const workbook = new ExcelJS.Workbook();

workbook.xlsx.readFile('./server/templates/訪問看護記録書Iフォーマット.xlsx')
  .then(() => {
    const sheet1 = workbook.getWorksheet('訪問看護記録書I_No.1');
    const sheet2 = workbook.getWorksheet('訪問看護記録書I_No.2');
    
    const analysis = {
      sheet1: analyzeSheet(sheet1, 'No.1'),
      sheet2: analyzeSheet(sheet2, 'No.2')
    };
    
    console.log(JSON.stringify(analysis, null, 2));
    
    function analyzeSheet(sheet, name) {
      const result = {
        name: name,
        rowCount: sheet.rowCount,
        columnCount: sheet.columnCount,
        columns: [],
        rows: [],
        merges: [],
        keyFields: []
      };
      
      // 列幅情報
      sheet.columns.forEach((col, idx) => {
        if (col.width) {
          result.columns.push({
            index: idx,
            letter: String.fromCharCode(65 + idx),
            width: col.width
          });
        }
      });
      
      // 行高情報（最初の60行のみ）
      for (let i = 1; i <= Math.min(60, sheet.rowCount); i++) {
        const row = sheet.getRow(i);
        if (row.height) {
          result.rows.push({
            index: i,
            height: row.height
          });
        }
      }
      
      // マージセル情報
      const mergeKeys = Object.keys(sheet._merges);
      mergeKeys.forEach(key => {
        const cell = sheet.getCell(key.split(':')[0]);
        const value = cell.value ? (typeof cell.value === 'object' && cell.value.richText 
          ? cell.value.richText.map(t => t.text).join('')
          : String(cell.value)) : '';
        
        result.merges.push({
          range: key,
          value: value,
          font: cell.font ? {
            name: cell.font.name,
            size: cell.font.size,
            bold: cell.font.bold
          } : null,
          alignment: cell.alignment ? {
            horizontal: cell.alignment.horizontal,
            vertical: cell.alignment.vertical
          } : null
        });
      });
      
      // 主要フィールドの位置を特定（最初の60行）
      for (let row = 1; row <= Math.min(60, sheet.rowCount); row++) {
        for (let col = 1; col <= 24; col++) {
          const colLetter = String.fromCharCode(64 + col);
          const cell = sheet.getCell(colLetter + row);
          if (cell.value && typeof cell.value === 'string') {
            const val = cell.value;
            if (val.includes('氏名') || val.includes('生年月日') || val.includes('住所') || 
                val.includes('電話') || val.includes('傷病') || val.includes('現病歴') ||
                val.includes('既往歴') || val.includes('療養') || val.includes('介護') ||
                val.includes('訪問') || val.includes('主治医') || val.includes('依頼目的')) {
              result.keyFields.push({
                cell: colLetter + row,
                value: val.substring(0, 20),
                isMerged: cell.isMerged
              });
            }
          }
        }
      }
      
      return result;
    }
  })
  .catch(err => {
    console.error(JSON.stringify({ error: err.message }));
  });
