import ExcelJS from 'exceljs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface NursingRecordIData {
  patient: {
    lastName: string;
    firstName: string;
    dateOfBirth: string;
    address: string | null;
    phone: string | null;
    emergencyContact: string | null;
    emergencyPhone: string | null;
    medicalHistory: string | null;
    careLevel: string | null;
  };
  doctorOrder: {
    diagnosis: string | null;
    orderContent: string | null;
  } | null;
  medicalInstitution: {
    name: string;
    doctorName: string | null;
    address: string | null;
    phone: string | null;
  } | null;
  careManager: {
    officeName: string;
    managerName: string;
    phone: string | null;
    address: string | null;
  } | null;
  initialVisit: {
    visitDate: string;
    actualStartTime: string | null;
    actualEndTime: string | null;
    content: string | null;
    nurseName: string;
    visitType: string;
  } | null;
  facility: {
    name: string;
  };
}

/**
 * 生年月日から年齢を計算し、「YYYY年MM月DD日（XX歳）」形式で返す
 */
function formatBirthDateWithAge(dateOfBirth: string): string {
  const birthDate = new Date(dateOfBirth);
  const today = new Date();

  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  const year = birthDate.getFullYear();
  const month = birthDate.getMonth() + 1;
  const day = birthDate.getDate();

  return `${year}年${month}月${day}日（${age}歳）`;
}

/**
 * 訪問日時を「YYYY年MM月DD日（曜日）HH時mm分～HH時mm分」形式で返す
 */
function formatVisitDateTime(visitDate: string, startTime: string | null, endTime: string | null): string {
  const date = new Date(visitDate);
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];

  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = weekdays[date.getDay()];

  let timeStr = '';
  if (startTime && endTime) {
    const start = new Date(`${visitDate}T${startTime}`);
    const end = new Date(`${visitDate}T${endTime}`);
    const startHour = start.getHours();
    const startMinute = start.getMinutes();
    const endHour = end.getHours();
    const endMinute = end.getMinutes();
    timeStr = `${startHour}時${startMinute.toString().padStart(2, '0')}分～${endHour}時${endMinute.toString().padStart(2, '0')}分`;
  }

  return `${year}年${month}月${day}日（${weekday}）${timeStr}`;
}

/**
 * 要介護度を表示用テキストに変換
 */
function formatCareLevel(careLevel: string | null): string {
  if (!careLevel) return '';

  const careLevelMap: { [key: string]: string } = {
    'independent': '自立',
    'support1': '要支援1',
    'support2': '要支援2',
    'care1': '要介護1',
    'care2': '要介護2',
    'care3': '要介護3',
    'care4': '要介護4',
    'care5': '要介護5',
  };

  return careLevelMap[careLevel] || careLevel;
}

/**
 * 訪問ステータスを日本語に変換
 */
function translateVisitStatus(status: string): string {
  const statusMap: { [key: string]: string } = {
    'pending': '未実施',
    'completed': '完了',
    'no_show': '不在',
    'refused': '拒否',
    'cancelled': 'キャンセル',
    'rescheduled': '日程変更',
  };

  return statusMap[status] || status;
}

/**
 * テキスト内の訪問ステータスを日本語に変換
 * 例: "訪問ステータス: pending" → "訪問ステータス: 未実施"
 */
function translateContentStatus(content: string): string {
  // "訪問ステータス: pending" のようなパターンを検出して変換
  return content.replace(/訪問ステータス:\s*(pending|completed|no_show|refused|cancelled|rescheduled)/g, (match, status) => {
    return `訪問ステータス: ${translateVisitStatus(status)}`;
  });
}

/**
 * 訪問看護記録書Iを生成
 */
export async function generateNursingRecordIExcel(data: NursingRecordIData): Promise<Buffer> {
  // 開発環境と本番環境でパスを切り替え
  // 本番環境: dist/index.js から dist/templates/
  // 開発環境: server/excel-generators/nursing-record-i.ts から server/templates/
  const templatePath = process.env.NODE_ENV === 'production'
    ? path.join(__dirname, 'templates/訪問看護記録書Iフォーマット.xlsx')
    : path.join(__dirname, '../templates/訪問看護記録書Iフォーマット.xlsx');

  // テンプレートを読み込み
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);

  // --- No.1シート ---
  const sheet1 = workbook.getWorksheet('訪問看護記録書I_No.1');
  if (sheet1) {
    // 利用者氏名
    sheet1.getCell('D3').value = `${data.patient.lastName} ${data.patient.firstName}`;

    // 生年月日・年齢
    sheet1.getCell('P3').value = formatBirthDateWithAge(data.patient.dateOfBirth);

    // 住所
    sheet1.getCell('D4').value = data.patient.address || '';

    // 電話番号
    sheet1.getCell('P4').value = data.patient.phone || '';

    // 看護師等氏名（初回訪問担当）
    if (data.initialVisit) {
      sheet1.getCell('D5').value = data.initialVisit.nurseName;
      sheet1.getCell('P5').value = data.initialVisit.visitType || '';

      // 初回訪問年月日
      const visitDateTime = formatVisitDateTime(
        data.initialVisit.visitDate,
        data.initialVisit.actualStartTime,
        data.initialVisit.actualEndTime
      );
      sheet1.getCell('F6').value = visitDateTime;
    }

    // 主たる傷病名
    if (data.doctorOrder) {
      sheet1.getCell('F7').value = data.doctorOrder.diagnosis || '';
    }

    // 現病歴
    sheet1.getCell('F8').value = data.patient.medicalHistory || '';

    // 既往歴（データ未保持）
    sheet1.getCell('F9').value = '';

    // 療養状況（初回記録の内容）
    if (data.initialVisit) {
      const content = data.initialVisit.content || '';
      // 訪問ステータスを日本語に変換
      sheet1.getCell('F10').value = content ? translateContentStatus(content) : '';
    }

    // 介護状況（介護者氏名・連絡先）
    const careInfo = data.patient.emergencyContact
      ? `${data.patient.emergencyContact}${data.patient.emergencyPhone ? `（${data.patient.emergencyPhone}）` : ''}`
      : '';
    sheet1.getCell('F11').value = careInfo;

    // 生活歴（データ未保持）
    sheet1.getCell('F12').value = '';

    // 家族構成（データ未保持 - テーブル形式なので空白）
    // Row 14-20: 家族情報テーブル（未実装）

    // 主な介護者
    sheet1.getCell('F21').value = data.patient.emergencyContact || '';

    // 住環境（データ未保持）
    sheet1.getCell('F22').value = '';
  }

  // --- No.2シート ---
  const sheet2 = workbook.getWorksheet('訪問看護記録書I_No.2');
  if (sheet2) {
    // 訪問看護の依頼目的
    if (data.doctorOrder) {
      sheet2.getCell('F2').value = data.doctorOrder.orderContent || '';
    }

    // 要介護認定の状況
    sheet2.getCell('F3').value = formatCareLevel(data.patient.careLevel);

    // ADLの状況（データ未保持 - チェックボックス形式なので空白）
    // Row 4-8: ADL評価（未実装）

    // 日常生活自立度（寝たきり度）（データ未保持）
    // Row 9: 未実装

    // 日常生活自立度（認知症）（データ未保持）
    // Row 10: 未実装

    // 主治医情報
    if (data.medicalInstitution) {
      sheet2.getCell('J11').value = data.medicalInstitution.doctorName || '';
      sheet2.getCell('J12').value = data.medicalInstitution.name || '';
      sheet2.getCell('J13').value = data.medicalInstitution.address || '';
      sheet2.getCell('J14').value = data.medicalInstitution.phone || '';
    }

    // 緊急連絡先（家族等）
    const emergencyInfo = data.patient.emergencyContact
      ? `${data.patient.emergencyContact} ${data.patient.emergencyPhone || ''}`
      : '';
    sheet2.getCell('A16').value = emergencyInfo;

    // 居宅介護支援事業所・ケアマネ情報
    if (data.careManager) {
      sheet2.getCell('A18').value = data.careManager.officeName || '';
      sheet2.getCell('F20').value = data.careManager.phone || '';
      sheet2.getCell('L20').value = data.careManager.managerName || '';
    }

    // 保健・福祉サービス利用状況（データ未保持）
    // Row 21以降: 未実装
  }

  // Excelファイルをバッファとして出力
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
