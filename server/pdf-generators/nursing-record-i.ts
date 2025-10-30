import PDFDocument from "pdfkit";
import type { Response } from "express";

// 厚労省参考様式1に完全準拠した訪問看護記録書Ⅰ PDF生成

interface NursingRecordIData {
  patient: {
    lastName: string;
    firstName: string;
    dateOfBirth: string | Date | null;
    gender: string;
    address: string | null;
    phone: string | null;
    emergencyContact: string | null;
    emergencyPhone: string | null;
    medicalHistory: string | null;
    careLevel: string | null;
  };
  initialRecord: {
    recordDate: string | Date;
    actualStartTime: string | Date | null;
    actualEndTime: string | Date | null;
    nurse: any;
  } | null;
  latestRecord: {
    observations: string | null;
  } | null;
  medicalInstitution: any;
  careManager: any;
  insuranceCard: any;
  facility: any;
}

// 日付フォーマット関数
function formatDate(dateStr: string | Date | null | undefined): { year: string; month: string; day: string } {
  if (!dateStr) return { year: '', month: '', day: '' };
  try {
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    return {
      year: String(date.getFullYear()),
      month: String(date.getMonth() + 1),
      day: String(date.getDate())
    };
  } catch {
    return { year: '', month: '', day: '' };
  }
}

// 年齢計算
function calculateAge(birthDate: string | Date | null): number {
  if (!birthDate) return 0;
  const birth = typeof birthDate === 'string' ? new Date(birthDate) : birthDate;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

export async function generateNursingRecordIPDF(
  data: NursingRecordIData,
  res: Response,
  fontPath: string
): Promise<void> {
  const doc = new PDFDocument({ margin: 30, size: 'A4' });

  // 日本語フォント登録
  doc.registerFont('NotoSans', fontPath);
  doc.font('NotoSans');

  // PDFをレスポンスにストリーミング
  doc.pipe(res);

  const pageWidth = 535;
  const startX = 30;

  // ========== Page 1 (No.1) - 厚労省参考様式1完全準拠 ==========
  let currentY = 30;

  // タイトル
  doc.fontSize(16).text('訪問看護記録書Ⅰ （No.1）', { align: 'center' });
  currentY = 55;

  // 年齢と生年月日
  const age = calculateAge(data.patient.dateOfBirth);
  const birth = formatDate(data.patient.dateOfBirth);

  // 利用者氏名セクション - ふりがな行
  doc.rect(startX, currentY, 350, 12).stroke();
  doc.fontSize(7).text('ふりがな', startX + 2, currentY + 2);

  doc.rect(startX + 350, currentY, 90, 12).stroke();
  doc.fontSize(7).text('生年月日', startX + 352, currentY + 2);

  doc.rect(startX + 440, currentY, 95, 12).stroke();
  doc.fontSize(7).text('年 月 日（  ）歳', startX + 442, currentY + 2);
  currentY += 12;

  // 利用者氏名 - 本欄
  doc.rect(startX, currentY, 80, 20).stroke();
  doc.fontSize(9).text('利用者氏名', startX + 8, currentY + 6);

  doc.rect(startX + 80, currentY, 270, 20).stroke();
  doc.fontSize(10).text(`${data.patient.lastName} ${data.patient.firstName}`, startX + 85, currentY + 5);

  // 生年月日の各フィールド
  doc.rect(startX + 350, currentY, 30, 20).stroke();
  doc.fontSize(9).text(birth.year, startX + 355, currentY + 6);

  doc.rect(startX + 380, currentY, 20, 20).stroke();
  doc.fontSize(9).text('年', startX + 385, currentY + 6);

  doc.rect(startX + 400, currentY, 20, 20).stroke();
  doc.fontSize(9).text(birth.month, startX + 405, currentY + 6);

  doc.rect(startX + 420, currentY, 20, 20).stroke();
  doc.fontSize(9).text('月', startX + 425, currentY + 6);

  doc.rect(startX + 440, currentY, 20, 20).stroke();
  doc.fontSize(9).text(birth.day, startX + 445, currentY + 6);

  doc.rect(startX + 460, currentY, 20, 20).stroke();
  doc.fontSize(9).text('日（', startX + 463, currentY + 6);

  doc.rect(startX + 480, currentY, 30, 20).stroke();
  doc.fontSize(9).text(String(age), startX + 490, currentY + 6);

  doc.rect(startX + 510, currentY, 25, 20).stroke();
  doc.fontSize(9).text('）歳', startX + 513, currentY + 6);
  currentY += 20;

  // 要介護認定の状況
  doc.rect(startX, currentY, 100, 18).stroke();
  doc.fontSize(8).text('要介護認定の\n状況', startX + 10, currentY + 2, { lineGap: -3 });

  doc.rect(startX + 100, currentY, 435, 18).stroke();
  doc.fontSize(9).text('自立    要支援（ 1  2 ）    要介護（ 1  2  3  4  5 ）', startX + 105, currentY + 4);
  currentY += 18;

  // 住所
  doc.rect(startX, currentY, 50, 18).stroke();
  doc.fontSize(9).text('住  所', startX + 10, currentY + 4);

  doc.rect(startX + 50, currentY, pageWidth - 50, 18).stroke();
  doc.fontSize(9).text(data.patient.address || '', startX + 55, currentY + 4);
  currentY += 23;

  // 初回訪問年月日セクションヘッダー
  doc.rect(startX, currentY, pageWidth, 15).fillAndStroke('#f0f0f0', '#000000');
  doc.fillColor('#000000').fontSize(9).text('□ 初回訪問年月日・訪問職種', startX + 2, currentY + 3);
  currentY += 15;

  // 初回訪問年月日
  const initialDate = formatDate(data.initialRecord?.recordDate);

  doc.rect(startX, currentY, 100, 18).stroke();
  doc.fontSize(8).text('初回訪問年月日', startX + 10, currentY + 5);

  doc.rect(startX + 100, currentY, 40, 18).stroke();
  doc.fontSize(9).text(initialDate.year, startX + 105, currentY + 5);

  doc.rect(startX + 140, currentY, 20, 18).stroke();
  doc.fontSize(9).text('年', startX + 143, currentY + 5);

  doc.rect(startX + 160, currentY, 30, 18).stroke();
  doc.fontSize(9).text(initialDate.month, startX + 165, currentY + 5);

  doc.rect(startX + 190, currentY, 20, 18).stroke();
  doc.fontSize(9).text('月', startX + 193, currentY + 5);

  doc.rect(startX + 210, currentY, 30, 18).stroke();
  doc.fontSize(9).text(initialDate.day, startX + 215, currentY + 5);

  doc.rect(startX + 240, currentY, 20, 18).stroke();
  doc.fontSize(9).text('日（', startX + 243, currentY + 5);

  doc.rect(startX + 260, currentY, 20, 18).stroke();
  doc.fontSize(9).text('）', startX + 265, currentY + 5);

  // 時刻欄
  doc.rect(startX + 280, currentY, 30, 18).stroke();
  doc.fontSize(9).text('時', startX + 285, currentY + 5);

  doc.rect(startX + 310, currentY, 30, 18).stroke();
  doc.fontSize(9).text('分～', startX + 313, currentY + 5);

  doc.rect(startX + 340, currentY, 30, 18).stroke();
  doc.fontSize(9).text('時', startX + 345, currentY + 5);

  doc.rect(startX + 370, currentY, 30, 18).stroke();
  doc.fontSize(9).text('分', startX + 375, currentY + 5);
  currentY += 18;

  // 看護師等氏名・訪問職種
  doc.rect(startX, currentY, 80, 18).stroke();
  doc.fontSize(8).text('看護師等\n氏名', startX + 15, currentY + 2, { lineGap: -3 });

  doc.rect(startX + 80, currentY, 220, 18).stroke();
  doc.fontSize(9).text(data.initialRecord?.nurse?.fullName || '', startX + 85, currentY + 5);

  doc.rect(startX + 300, currentY, 60, 18).stroke();
  doc.fontSize(8).text('訪問職種', startX + 310, currentY + 5);

  doc.rect(startX + 360, currentY, 175, 18).stroke();
  doc.fontSize(7).text('保健師・助産師・看護師・准看護師\n理学療法士・作業療法士・言語聴覚士', startX + 362, currentY + 2, { lineGap: -2 });
  currentY += 23;

  // 主たる傷病名
  doc.rect(startX, currentY, pageWidth, 15).fillAndStroke('#f0f0f0', '#000000');
  doc.fillColor('#000000').fontSize(9).text('□ 主たる傷病名', startX + 2, currentY + 3);
  currentY += 15;

  doc.rect(startX, currentY, pageWidth, 35).stroke();
  currentY += 40;

  // 現病歴
  doc.rect(startX, currentY, pageWidth, 15).fillAndStroke('#f0f0f0', '#000000');
  doc.fillColor('#000000').fontSize(9).text('□ 現病歴', startX + 2, currentY + 3);
  currentY += 15;

  doc.rect(startX, currentY, pageWidth, 50).stroke();
  const observations = data.latestRecord?.observations || '';
  doc.fontSize(8).text(observations, startX + 3, currentY + 3, { width: pageWidth - 6, height: 44 });
  currentY += 55;

  // 既往歴
  doc.rect(startX, currentY, pageWidth, 15).fillAndStroke('#f0f0f0', '#000000');
  doc.fillColor('#000000').fontSize(9).text('□ 既往歴', startX + 2, currentY + 3);
  currentY += 15;

  doc.rect(startX, currentY, pageWidth, 45).stroke();
  const medicalHistory = data.patient.medicalHistory || '';
  doc.fontSize(8).text(medicalHistory, startX + 3, currentY + 3, { width: pageWidth - 6, height: 39 });
  currentY += 50;

  // 療養状況
  doc.rect(startX, currentY, pageWidth, 15).fillAndStroke('#f0f0f0', '#000000');
  doc.fillColor('#000000').fontSize(9).text('□ 療養状況', startX + 2, currentY + 3);
  currentY += 15;

  doc.rect(startX, currentY, pageWidth, 45).stroke();
  currentY += 50;

  // 介護状況
  doc.rect(startX, currentY, pageWidth, 15).fillAndStroke('#f0f0f0', '#000000');
  doc.fillColor('#000000').fontSize(9).text('□ 介護状況', startX + 2, currentY + 3);
  currentY += 15;

  doc.rect(startX, currentY, pageWidth, 45).stroke();

  // ========== Page 2 (No.2) - 厚労省参考様式1完全準拠 ==========
  doc.addPage({ margin: 30, size: 'A4' });
  currentY = 30;

  doc.fontSize(16).text('訪問看護記録書Ⅰ （No.2）', { align: 'center' });
  currentY = 55;

  // 訪問看護の依頼目的
  doc.rect(startX, currentY, pageWidth, 15).fillAndStroke('#f0f0f0', '#000000');
  doc.fillColor('#000000').fontSize(9).text('□ 訪問看護の依頼目的', startX + 2, currentY + 3);
  currentY += 15;

  doc.rect(startX, currentY, pageWidth, 40).stroke();
  currentY += 45;

  // 要介護認定
  doc.rect(startX, currentY, pageWidth, 15).fillAndStroke('#f0f0f0', '#000000');
  doc.fillColor('#000000').fontSize(9).text('□ 要介護認定', startX + 2, currentY + 3);
  currentY += 15;

  const careInfo = data.insuranceCard ? `${data.insuranceCard.cardType} / 保険者番号: ${data.insuranceCard.insurerNumber || ''}` : '';
  doc.rect(startX, currentY, pageWidth, 25).stroke();
  doc.fontSize(9).text(careInfo, startX + 3, currentY + 8);
  currentY += 30;

  // ADL（日常生活動作）
  doc.rect(startX, currentY, pageWidth, 15).fillAndStroke('#f0f0f0', '#000000');
  doc.fillColor('#000000').fontSize(9).text('□ ADL（日常生活動作）', startX + 2, currentY + 3);
  currentY += 15;

  doc.rect(startX, currentY, pageWidth, 50).stroke();
  currentY += 55;

  // 日常生活自立度
  doc.rect(startX, currentY, pageWidth, 15).fillAndStroke('#f0f0f0', '#000000');
  doc.fillColor('#000000').fontSize(9).text('□ 日常生活自立度', startX + 2, currentY + 3);
  currentY += 15;

  doc.rect(startX, currentY, pageWidth, 25).stroke();
  currentY += 30;

  // 主治医等
  doc.rect(startX, currentY, pageWidth, 15).fillAndStroke('#f0f0f0', '#000000');
  doc.fillColor('#000000').fontSize(9).text('□ 主治医等', startX + 2, currentY + 3);
  currentY += 15;

  const medicalInfo = data.medicalInstitution
    ? `医療機関名: ${data.medicalInstitution.name}\n医師名: ${data.medicalInstitution.doctorName || ''}\n電話: ${data.medicalInstitution.phone || ''}`
    : '';
  doc.rect(startX, currentY, pageWidth, 50).stroke();
  doc.fontSize(8).text(medicalInfo, startX + 3, currentY + 3, { width: pageWidth - 6 });
  currentY += 55;

  // 緊急連絡先
  doc.rect(startX, currentY, pageWidth, 15).fillAndStroke('#f0f0f0', '#000000');
  doc.fillColor('#000000').fontSize(9).text('□ 緊急連絡先', startX + 2, currentY + 3);
  currentY += 15;

  const emergencyInfo = data.patient.emergencyContact
    ? `連絡先: ${data.patient.emergencyContact} / 電話: ${data.patient.emergencyPhone || ''}`
    : '';
  doc.rect(startX, currentY, pageWidth, 25).stroke();
  doc.fontSize(9).text(emergencyInfo, startX + 3, currentY + 8);
  currentY += 30;

  // 居宅介護支援事業所
  doc.rect(startX, currentY, pageWidth, 15).fillAndStroke('#f0f0f0', '#000000');
  doc.fillColor('#000000').fontSize(9).text('□ 居宅介護支援事業所', startX + 2, currentY + 3);
  currentY += 15;

  const careManagerInfo = data.careManager
    ? `事業所名: ${data.careManager.officeName}\nケアマネージャー: ${data.careManager.managerName || ''}\n電話: ${data.careManager.phone || ''}`
    : '';
  doc.rect(startX, currentY, pageWidth, 50).stroke();
  doc.fontSize(8).text(careManagerInfo, startX + 3, currentY + 3, { width: pageWidth - 6 });
  currentY += 55;

  // 福祉サービス
  doc.rect(startX, currentY, pageWidth, 15).fillAndStroke('#f0f0f0', '#000000');
  doc.fillColor('#000000').fontSize(9).text('□ 福祉サービス', startX + 2, currentY + 3);
  currentY += 15;

  doc.rect(startX, currentY, pageWidth, 40).stroke();
  currentY += 45;

  // フッター
  doc.fontSize(8).fillColor('#000000').text(`事業所: ${data.facility?.name || ''}`, startX, 780);
  doc.text(`出力日: ${new Date().toLocaleDateString('ja-JP')}`, startX, 795);

  // PDF終了
  doc.end();
}
