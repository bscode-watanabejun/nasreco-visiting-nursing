import ExcelJS from 'exceljs';
import path from 'path';

// 厚労省参考様式1「訪問看護記録書Ⅰ」のExcelテンプレート作成

async function createNursingRecordTemplate() {
  const workbook = new ExcelJS.Workbook();

  // ========== No.1 シート ==========
  const sheet1 = workbook.addWorksheet('No.1');

  // ページ設定
  sheet1.pageSetup = {
    paperSize: 9, // A4
    orientation: 'portrait',
    margins: {
      left: 0.7, right: 0.7,
      top: 0.75, bottom: 0.75,
      header: 0.3, footer: 0.3
    }
  };

  // 列幅設定（参考様式に合わせて調整）
  sheet1.columns = [
    { width: 2 },   // A
    { width: 8 },   // B
    { width: 8 },   // C
    { width: 8 },   // D
    { width: 8 },   // E
    { width: 8 },   // F
    { width: 8 },   // G
    { width: 8 },   // H
    { width: 8 },   // I
    { width: 8 },   // J
    { width: 8 },   // K
    { width: 8 },   // L
    { width: 2 },   // M
  ];

  // タイトル
  sheet1.mergeCells('B2:L2');
  const titleCell = sheet1.getCell('B2');
  titleCell.value = '訪問看護記録書Ⅰ （No.1）';
  titleCell.font = { name: 'MS Gothic', size: 16, bold: true };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet1.getRow(2).height = 25;

  // 利用者氏名セクション
  sheet1.mergeCells('B4:B5');
  sheet1.getCell('B4').value = '利用者氏名';
  sheet1.getCell('B4').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  sheet1.getCell('B4').font = { name: 'MS Gothic', size: 10 };
  sheet1.getCell('B4').border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

  sheet1.mergeCells('C4:H5');
  sheet1.getCell('C4').value = ''; // データ入力欄
  sheet1.getCell('C4').font = { name: 'MS Gothic', size: 11 };
  sheet1.getCell('C4').alignment = { vertical: 'middle' };
  sheet1.getCell('C4').border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

  // 生年月日
  sheet1.mergeCells('I4:I5');
  sheet1.getCell('I4').value = '生年月日';
  sheet1.getCell('I4').alignment = { horizontal: 'center', vertical: 'middle' };
  sheet1.getCell('I4').font = { name: 'MS Gothic', size: 9 };
  sheet1.getCell('I4').border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

  sheet1.getCell('J4').value = '年';
  sheet1.getCell('K4').value = '月';
  sheet1.getCell('L4').value = '日（  ）歳';
  ['J4', 'K4', 'L4'].forEach(cell => {
    sheet1.getCell(cell).alignment = { horizontal: 'center', vertical: 'top' };
    sheet1.getCell(cell).font = { name: 'MS Gothic', size: 8 };
    sheet1.getCell(cell).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  });

  sheet1.getCell('J5').value = ''; // 年データ
  sheet1.getCell('K5').value = ''; // 月データ
  sheet1.getCell('L5').value = ''; // 日・年齢データ
  ['J5', 'K5', 'L5'].forEach(cell => {
    sheet1.getCell(cell).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  });

  sheet1.getRow(4).height = 12;
  sheet1.getRow(5).height = 18;

  // 要介護認定の状況
  sheet1.mergeCells('B7:C7');
  sheet1.getCell('B7').value = '要介護認定の\n状況';
  sheet1.getCell('B7').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  sheet1.getCell('B7').font = { name: 'MS Gothic', size: 9 };
  sheet1.getCell('B7').border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

  sheet1.mergeCells('D7:L7');
  sheet1.getCell('D7').value = '自立    要支援（ 1  2 ）    要介護（ 1  2  3  4  5 ）';
  sheet1.getCell('D7').alignment = { horizontal: 'left', vertical: 'middle' };
  sheet1.getCell('D7').font = { name: 'MS Gothic', size: 9 };
  sheet1.getCell('D7').border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  sheet1.getRow(7).height = 18;

  // 住所
  sheet1.mergeCells('B8:C8');
  sheet1.getCell('B8').value = '住  所';
  sheet1.getCell('B8').alignment = { horizontal: 'center', vertical: 'middle' };
  sheet1.getCell('B8').font = { name: 'MS Gothic', size: 10 };
  sheet1.getCell('B8').border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

  sheet1.mergeCells('D8:L8');
  sheet1.getCell('D8').value = '';
  sheet1.getCell('D8').alignment = { horizontal: 'left', vertical: 'middle' };
  sheet1.getCell('D8').border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  sheet1.getRow(8).height = 18;

  // 初回訪問年月日・訪問職種セクションヘッダー
  sheet1.mergeCells('B10:L10');
  const headerCell1 = sheet1.getCell('B10');
  headerCell1.value = '□ 初回訪問年月日・訪問職種';
  headerCell1.font = { name: 'MS Gothic', size: 10 };
  headerCell1.alignment = { horizontal: 'left', vertical: 'middle' };
  headerCell1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
  headerCell1.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  sheet1.getRow(10).height = 15;

  // 初回訪問年月日
  sheet1.mergeCells('B11:C11');
  sheet1.getCell('B11').value = '初回訪問年月日';
  sheet1.getCell('B11').alignment = { horizontal: 'center', vertical: 'middle' };
  sheet1.getCell('B11').font = { name: 'MS Gothic', size: 9 };
  sheet1.getCell('B11').border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

  sheet1.getCell('D11').value = '年';
  sheet1.getCell('E11').value = '月';
  sheet1.getCell('F11').value = '日（ ）';
  sheet1.getCell('G11').value = '時';
  sheet1.getCell('H11').value = '分～';
  sheet1.getCell('I11').value = '時';
  sheet1.getCell('J11').value = '分';
  ['D11', 'E11', 'F11', 'G11', 'H11', 'I11', 'J11'].forEach(cell => {
    sheet1.getCell(cell).alignment = { horizontal: 'center', vertical: 'middle' };
    sheet1.getCell(cell).font = { name: 'MS Gothic', size: 9 };
    sheet1.getCell(cell).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  });
  sheet1.getRow(11).height = 18;

  // 看護師等氏名・訪問職種
  sheet1.mergeCells('B12:C12');
  sheet1.getCell('B12').value = '看護師等\n氏名';
  sheet1.getCell('B12').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  sheet1.getCell('B12').font = { name: 'MS Gothic', size: 9 };
  sheet1.getCell('B12').border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

  sheet1.mergeCells('D12:G12');
  sheet1.getCell('D12').value = '';
  sheet1.getCell('D12').border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

  sheet1.getCell('H12').value = '訪問職種';
  sheet1.getCell('H12').alignment = { horizontal: 'center', vertical: 'middle' };
  sheet1.getCell('H12').font = { name: 'MS Gothic', size: 9 };
  sheet1.getCell('H12').border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

  sheet1.mergeCells('I12:L12');
  sheet1.getCell('I12').value = '保健師・助産師・看護師・准看護師\n理学療法士・作業療法士・言語聴覚士';
  sheet1.getCell('I12').alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  sheet1.getCell('I12').font = { name: 'MS Gothic', size: 7 };
  sheet1.getCell('I12').border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  sheet1.getRow(12).height = 24;

  // 主たる傷病名
  sheet1.mergeCells('B14:L14');
  const headerCell2 = sheet1.getCell('B14');
  headerCell2.value = '□ 主たる傷病名';
  headerCell2.font = { name: 'MS Gothic', size: 10 };
  headerCell2.alignment = { horizontal: 'left', vertical: 'middle' };
  headerCell2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
  headerCell2.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  sheet1.getRow(14).height = 15;

  sheet1.mergeCells('B15:L17');
  sheet1.getCell('B15').value = '';
  sheet1.getCell('B15').alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
  sheet1.getCell('B15').border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  sheet1.getRow(15).height = 20;
  sheet1.getRow(16).height = 20;
  sheet1.getRow(17).height = 20;

  // 現病歴
  sheet1.mergeCells('B19:L19');
  const headerCell3 = sheet1.getCell('B19');
  headerCell3.value = '□ 現病歴';
  headerCell3.font = { name: 'MS Gothic', size: 10 };
  headerCell3.alignment = { horizontal: 'left', vertical: 'middle' };
  headerCell3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
  headerCell3.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  sheet1.getRow(19).height = 15;

  sheet1.mergeCells('B20:L23');
  sheet1.getCell('B20').value = '';
  sheet1.getCell('B20').alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
  sheet1.getCell('B20').border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  [20, 21, 22, 23].forEach(row => sheet1.getRow(row).height = 20);

  // 既往歴
  sheet1.mergeCells('B25:L25');
  const headerCell4 = sheet1.getCell('B25');
  headerCell4.value = '□ 既往歴';
  headerCell4.font = { name: 'MS Gothic', size: 10 };
  headerCell4.alignment = { horizontal: 'left', vertical: 'middle' };
  headerCell4.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
  headerCell4.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  sheet1.getRow(25).height = 15;

  sheet1.mergeCells('B26:L29');
  sheet1.getCell('B26').value = '';
  sheet1.getCell('B26').alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
  sheet1.getCell('B26').border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  [26, 27, 28, 29].forEach(row => sheet1.getRow(row).height = 18);

  // 療養状況
  sheet1.mergeCells('B31:L31');
  const headerCell5 = sheet1.getCell('B31');
  headerCell5.value = '□ 療養状況';
  headerCell5.font = { name: 'MS Gothic', size: 10 };
  headerCell5.alignment = { horizontal: 'left', vertical: 'middle' };
  headerCell5.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
  headerCell5.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  sheet1.getRow(31).height = 15;

  sheet1.mergeCells('B32:L35');
  sheet1.getCell('B32').value = '';
  sheet1.getCell('B32').alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
  sheet1.getCell('B32').border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  [32, 33, 34, 35].forEach(row => sheet1.getRow(row).height = 18);

  // 介護状況
  sheet1.mergeCells('B37:L37');
  const headerCell6 = sheet1.getCell('B37');
  headerCell6.value = '□ 介護状況';
  headerCell6.font = { name: 'MS Gothic', size: 10 };
  headerCell6.alignment = { horizontal: 'left', vertical: 'middle' };
  headerCell6.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
  headerCell6.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  sheet1.getRow(37).height = 15;

  sheet1.mergeCells('B38:L41');
  sheet1.getCell('B38').value = '';
  sheet1.getCell('B38').alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
  sheet1.getCell('B38').border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  [38, 39, 40, 41].forEach(row => sheet1.getRow(row).height = 18);

  // ========== No.2 シート ==========
  const sheet2 = workbook.addWorksheet('No.2');

  sheet2.pageSetup = {
    paperSize: 9,
    orientation: 'portrait',
    margins: {
      left: 0.7, right: 0.7,
      top: 0.75, bottom: 0.75,
      header: 0.3, footer: 0.3
    }
  };

  sheet2.columns = [
    { width: 2 },   // A
    { width: 8 },   // B
    { width: 8 },   // C
    { width: 8 },   // D
    { width: 8 },   // E
    { width: 8 },   // F
    { width: 8 },   // G
    { width: 8 },   // H
    { width: 8 },   // I
    { width: 8 },   // J
    { width: 8 },   // K
    { width: 8 },   // L
    { width: 2 },   // M
  ];

  // タイトル
  sheet2.mergeCells('B2:L2');
  const titleCell2 = sheet2.getCell('B2');
  titleCell2.value = '訪問看護記録書Ⅰ （No.2）';
  titleCell2.font = { name: 'MS Gothic', size: 16, bold: true };
  titleCell2.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet2.getRow(2).height = 25;

  // 訪問看護の依頼目的
  sheet2.mergeCells('B4:L4');
  const header2_1 = sheet2.getCell('B4');
  header2_1.value = '□ 訪問看護の依頼目的';
  header2_1.font = { name: 'MS Gothic', size: 10 };
  header2_1.alignment = { horizontal: 'left', vertical: 'middle' };
  header2_1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
  header2_1.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  sheet2.getRow(4).height = 15;

  sheet2.mergeCells('B5:L8');
  sheet2.getCell('B5').value = '';
  sheet2.getCell('B5').alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
  sheet2.getCell('B5').border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  [5, 6, 7, 8].forEach(row => sheet2.getRow(row).height = 18);

  // 要介護認定
  sheet2.mergeCells('B10:L10');
  const header2_2 = sheet2.getCell('B10');
  header2_2.value = '□ 要介護認定';
  header2_2.font = { name: 'MS Gothic', size: 10 };
  header2_2.alignment = { horizontal: 'left', vertical: 'middle' };
  header2_2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
  header2_2.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  sheet2.getRow(10).height = 15;

  sheet2.mergeCells('B11:L12');
  sheet2.getCell('B11').value = '';
  sheet2.getCell('B11').alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  sheet2.getCell('B11').border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  [11, 12].forEach(row => sheet2.getRow(row).height = 18);

  // ADL（日常生活動作）
  sheet2.mergeCells('B14:L14');
  const header2_3 = sheet2.getCell('B14');
  header2_3.value = '□ ADL（日常生活動作）';
  header2_3.font = { name: 'MS Gothic', size: 10 };
  header2_3.alignment = { horizontal: 'left', vertical: 'middle' };
  header2_3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
  header2_3.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  sheet2.getRow(14).height = 15;

  sheet2.mergeCells('B15:L18');
  sheet2.getCell('B15').value = '';
  sheet2.getCell('B15').alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
  sheet2.getCell('B15').border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  [15, 16, 17, 18].forEach(row => sheet2.getRow(row).height = 18);

  // 日常生活自立度
  sheet2.mergeCells('B20:L20');
  const header2_4 = sheet2.getCell('B20');
  header2_4.value = '□ 日常生活自立度';
  header2_4.font = { name: 'MS Gothic', size: 10 };
  header2_4.alignment = { horizontal: 'left', vertical: 'middle' };
  header2_4.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
  header2_4.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  sheet2.getRow(20).height = 15;

  sheet2.mergeCells('B21:L22');
  sheet2.getCell('B21').value = '';
  sheet2.getCell('B21').alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  sheet2.getCell('B21').border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  [21, 22].forEach(row => sheet2.getRow(row).height = 18);

  // 主治医等
  sheet2.mergeCells('B24:L24');
  const header2_5 = sheet2.getCell('B24');
  header2_5.value = '□ 主治医等';
  header2_5.font = { name: 'MS Gothic', size: 10 };
  header2_5.alignment = { horizontal: 'left', vertical: 'middle' };
  header2_5.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
  header2_5.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  sheet2.getRow(24).height = 15;

  sheet2.mergeCells('B25:L28');
  sheet2.getCell('B25').value = '';
  sheet2.getCell('B25').alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
  sheet2.getCell('B25').border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  [25, 26, 27, 28].forEach(row => sheet2.getRow(row).height = 18);

  // 緊急連絡先
  sheet2.mergeCells('B30:L30');
  const header2_6 = sheet2.getCell('B30');
  header2_6.value = '□ 緊急連絡先';
  header2_6.font = { name: 'MS Gothic', size: 10 };
  header2_6.alignment = { horizontal: 'left', vertical: 'middle' };
  header2_6.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
  header2_6.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  sheet2.getRow(30).height = 15;

  sheet2.mergeCells('B31:L32');
  sheet2.getCell('B31').value = '';
  sheet2.getCell('B31').alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  sheet2.getCell('B31').border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  [31, 32].forEach(row => sheet2.getRow(row).height = 18);

  // 居宅介護支援事業所
  sheet2.mergeCells('B34:L34');
  const header2_7 = sheet2.getCell('B34');
  header2_7.value = '□ 居宅介護支援事業所';
  header2_7.font = { name: 'MS Gothic', size: 10 };
  header2_7.alignment = { horizontal: 'left', vertical: 'middle' };
  header2_7.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
  header2_7.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  sheet2.getRow(34).height = 15;

  sheet2.mergeCells('B35:L38');
  sheet2.getCell('B35').value = '';
  sheet2.getCell('B35').alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
  sheet2.getCell('B35').border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  [35, 36, 37, 38].forEach(row => sheet2.getRow(row).height = 18);

  // 福祉サービス
  sheet2.mergeCells('B40:L40');
  const header2_8 = sheet2.getCell('B40');
  header2_8.value = '□ 福祉サービス';
  header2_8.font = { name: 'MS Gothic', size: 10 };
  header2_8.alignment = { horizontal: 'left', vertical: 'middle' };
  header2_8.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
  header2_8.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  sheet2.getRow(40).height = 15;

  sheet2.mergeCells('B41:L44');
  sheet2.getCell('B41').value = '';
  sheet2.getCell('B41').alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
  sheet2.getCell('B41').border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  [41, 42, 43, 44].forEach(row => sheet2.getRow(row).height = 18);

  // フッター
  sheet2.getCell('B46').value = '事業所:';
  sheet2.getCell('B46').font = { name: 'MS Gothic', size: 9 };
  sheet2.getCell('B47').value = '出力日:';
  sheet2.getCell('B47').font = { name: 'MS Gothic', size: 9 };

  // 保存
  const templatePath = path.join(process.cwd(), 'server', 'templates', '訪問看護記録書Ⅰ_テンプレート.xlsx');
  await workbook.xlsx.writeFile(templatePath);
  console.log(`テンプレートを作成しました: ${templatePath}`);
}

// 実行
createNursingRecordTemplate().catch(console.error);
