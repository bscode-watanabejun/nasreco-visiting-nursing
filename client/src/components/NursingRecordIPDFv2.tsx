import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { registerPDFFont } from '@/lib/pdfFonts'

// フォントを事前登録（初回のみ実行される）
registerPDFFont()


const styles = StyleSheet.create({
  page: {
    padding: 20,
    fontSize: 9,
    fontFamily: 'NotoSansJP',
  },
  // ヘッダー部分
  title: {
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 3,
  },
  facilityName: {
    fontSize: 9,
    textAlign: 'center',
    marginBottom: 1,
  },
  facilityAddress: {
    fontSize: 8,
    textAlign: 'center',
    marginBottom: 1,
  },
  facilityPhone: {
    fontSize: 8,
    textAlign: 'center',
    marginBottom: 10,
  },
  // テーブルスタイル
  table: {
    width: '100%',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#000',
    marginBottom: 5,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: '#000',
  },
  tableRowLast: {
    flexDirection: 'row',
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    padding: 5,
    backgroundColor: '#e0e0e0',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: '#000',
  },
  cellLabel: {
    fontSize: 8,
    fontWeight: 'bold',
    padding: 4,
    borderRightWidth: 1,
    borderRightStyle: 'solid',
    borderRightColor: '#000',
  },
  cellValue: {
    fontSize: 8,
    padding: 4,
  },
  cellValueWithBorder: {
    fontSize: 8,
    padding: 4,
    borderRightWidth: 1,
    borderRightStyle: 'solid',
    borderRightColor: '#000',
  },
  multilineContent: {
    fontSize: 8,
    padding: 6,
    minHeight: 35,
  },
  unavailable: {
    fontSize: 7,
    color: '#666',
  },
  footer: {
    fontSize: 7,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
  },
})

interface NursingRecordIPDFProps {
  data: {
    patient: {
      patientNumber: string
      lastName: string
      firstName: string
      dateOfBirth: string
      gender: string
      address: string
      phone: string
      emergencyContact: string
      emergencyPhone: string
      medicalHistory: string
      careLevel: string | null
    }
    initialRecord: {
      recordDate: string
      actualStartTime: string | null
      actualEndTime: string | null
      nurse: {
        fullName: string
        role: string
      } | null
    } | null
    medicalInstitution: {
      name: string
      doctorName: string
      address: string
      phone: string
    } | null
    careManager: {
      officeName: string
      managerName: string
      address: string
      phone: string
    } | null
    facility: {
      name: string
      address: string
      phone: string
    } | null
  }
}

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '未記録'
  const date = new Date(dateStr)
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

const formatTime = (dateStr: string | null) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
}

const formatCareLevel = (careLevel: string | null) => {
  const labels: Record<string, string> = {
    support1: '要支援1',
    support2: '要支援2',
    care1: '要介護1',
    care2: '要介護2',
    care3: '要介護3',
    care4: '要介護4',
    care5: '要介護5',
  }
  return careLevel ? labels[careLevel] || careLevel : '未登録'
}

const calculateAge = (birthDate: string) => {
  const birth = new Date(birthDate)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--
  }
  return age
}

const formatRole = (role: string) => {
  const roles: Record<string, string> = {
    nurse: '看護師',
    pt: '理学療法士',
    ot: '作業療法士',
    st: '言語聴覚士',
  }
  return roles[role] || '未記録'
}

export function NursingRecordIPDFv2({ data }: NursingRecordIPDFProps) {
  const { patient, initialRecord, medicalInstitution, careManager, facility } = data

  return (
    <Document>
      {/* ========== No.1 ========== */}
      <Page size="A4" style={styles.page}>
        {/* ヘッダー */}
        <Text style={styles.title}>訪問看護記録書Ⅰ（No.1）</Text>
        <Text style={styles.facilityName}>{facility?.name || ''}</Text>
        <Text style={styles.facilityAddress}>〒{facility?.address || ''}</Text>
        <Text style={styles.facilityPhone}>TEL: {facility?.phone || ''}</Text>

        {/* 利用者基本情報 */}
        <View style={styles.table}>
          <View style={styles.sectionTitle}>
            <Text>利用者基本情報</Text>
          </View>
          <View style={styles.tableRow}>
            <View style={[styles.cellLabel, { width: '18%' }]}>
              <Text>利用者氏名</Text>
            </View>
            <View style={[styles.cellValueWithBorder, { width: '52%' }]}>
              <Text>{patient.lastName} {patient.firstName}</Text>
            </View>
            <View style={[styles.cellValue, { width: '30%' }]}>
              <Text>患者番号: {patient.patientNumber}</Text>
            </View>
          </View>
          <View style={styles.tableRow}>
            <View style={[styles.cellLabel, { width: '18%' }]}>
              <Text>生年月日</Text>
            </View>
            <View style={[styles.cellValueWithBorder, { width: '52%' }]}>
              <Text>{formatDate(patient.dateOfBirth)}（{calculateAge(patient.dateOfBirth)}歳）</Text>
            </View>
            <View style={[styles.cellValue, { width: '30%' }]}>
              <Text>性別: {patient.gender === 'male' ? '男性' : patient.gender === 'female' ? '女性' : 'その他'}</Text>
            </View>
          </View>
          <View style={styles.tableRow}>
            <View style={[styles.cellLabel, { width: '18%' }]}>
              <Text>住所</Text>
            </View>
            <View style={[styles.cellValue, { width: '82%' }]}>
              <Text>{patient.address || '未登録'}</Text>
            </View>
          </View>
          <View style={styles.tableRowLast}>
            <View style={[styles.cellLabel, { width: '18%' }]}>
              <Text>電話番号</Text>
            </View>
            <View style={[styles.cellValue, { width: '82%' }]}>
              <Text>{patient.phone || '未登録'}</Text>
            </View>
          </View>
        </View>

        {/* 初回訪問情報 */}
        <View style={styles.table}>
          <View style={styles.sectionTitle}>
            <Text>初回訪問情報</Text>
          </View>
          <View style={styles.tableRow}>
            <View style={[styles.cellLabel, { width: '25%' }]}>
              <Text>初回訪問年月日</Text>
            </View>
            <View style={[styles.cellValueWithBorder, { width: '45%' }]}>
              <Text>{initialRecord ? formatDate(initialRecord.recordDate) : '未記録'}</Text>
            </View>
            <View style={[styles.cellValue, { width: '30%' }]}>
              <Text>時刻: {initialRecord ? `${formatTime(initialRecord.actualStartTime)}～${formatTime(initialRecord.actualEndTime)}` : '未記録'}</Text>
            </View>
          </View>
          <View style={styles.tableRowLast}>
            <View style={[styles.cellLabel, { width: '25%' }]}>
              <Text>看護師等氏名</Text>
            </View>
            <View style={[styles.cellValueWithBorder, { width: '45%' }]}>
              <Text>{initialRecord?.nurse?.fullName || '未記録'}</Text>
            </View>
            <View style={[styles.cellValue, { width: '30%' }]}>
              <Text>職種: {initialRecord?.nurse?.role ? formatRole(initialRecord.nurse.role) : '未記録'}</Text>
            </View>
          </View>
        </View>

        {/* 主たる傷病名 */}
        <View style={styles.table}>
          <View style={styles.sectionTitle}>
            <Text>主たる傷病名</Text>
          </View>
          <View style={styles.tableRowLast}>
            <View style={[styles.multilineContent, { width: '100%' }]}>
              <Text>{patient.medicalHistory || '未登録'}</Text>
            </View>
          </View>
        </View>

        {/* 現病歴 */}
        <View style={styles.table}>
          <View style={styles.sectionTitle}>
            <Text>現病歴</Text>
          </View>
          <View style={styles.tableRowLast}>
            <View style={[styles.multilineContent, { width: '100%' }]}>
              <Text style={styles.unavailable}>※データ未入力（現病歴と既往歴は医療履歴フィールドに混在しています）</Text>
            </View>
          </View>
        </View>

        {/* 既往歴 */}
        <View style={styles.table}>
          <View style={styles.sectionTitle}>
            <Text>既往歴</Text>
          </View>
          <View style={styles.tableRowLast}>
            <View style={[styles.multilineContent, { width: '100%' }]}>
              <Text style={styles.unavailable}>※データ未入力（現病歴と既往歴は医療履歴フィールドに混在しています）</Text>
            </View>
          </View>
        </View>

        {/* 療養状況 */}
        <View style={styles.table}>
          <View style={styles.sectionTitle}>
            <Text>療養状況</Text>
          </View>
          <View style={styles.tableRowLast}>
            <View style={[styles.multilineContent, { width: '100%' }]}>
              <Text style={styles.unavailable}>※データ未入力（患者登録時に追加入力が必要です）</Text>
            </View>
          </View>
        </View>

        {/* 介護状況 */}
        <View style={styles.table}>
          <View style={styles.sectionTitle}>
            <Text>介護状況</Text>
          </View>
          <View style={styles.tableRowLast}>
            <View style={[styles.multilineContent, { width: '100%' }]}>
              <Text style={styles.unavailable}>※データ未入力（患者登録時に追加入力が必要です）</Text>
            </View>
          </View>
        </View>

        <Text style={styles.footer}>※不足項目は手書きで補完してください</Text>
      </Page>

      {/* ========== No.2 ========== */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>訪問看護記録書Ⅰ（No.2）</Text>

        {/* 訪問看護の依頼目的 */}
        <View style={styles.table}>
          <View style={styles.sectionTitle}>
            <Text>訪問看護の依頼目的</Text>
          </View>
          <View style={styles.tableRowLast}>
            <View style={[styles.multilineContent, { width: '100%' }]}>
              <Text style={styles.unavailable}>※データ未入力（患者登録時に追加入力が必要です）</Text>
            </View>
          </View>
        </View>

        {/* 要介護認定の状況 */}
        <View style={styles.table}>
          <View style={styles.sectionTitle}>
            <Text>要介護認定の状況</Text>
          </View>
          <View style={styles.tableRowLast}>
            <View style={[styles.cellLabel, { width: '20%' }]}>
              <Text>認定状況</Text>
            </View>
            <View style={[styles.cellValue, { width: '80%' }]}>
              <Text>{formatCareLevel(patient.careLevel)}</Text>
            </View>
          </View>
        </View>

        {/* ADL（日常生活動作）の状況 */}
        <View style={styles.table}>
          <View style={styles.sectionTitle}>
            <Text>ADL（日常生活動作）の状況</Text>
          </View>
          <View style={styles.tableRowLast}>
            <View style={[styles.multilineContent, { width: '100%' }]}>
              <Text style={styles.unavailable}>※データ未入力（移動、食事、排泄、入浴、着替、整容、意思疎通の評価が必要です）</Text>
            </View>
          </View>
        </View>

        {/* 日常生活自立度 */}
        <View style={styles.table}>
          <View style={styles.sectionTitle}>
            <Text>日常生活自立度</Text>
          </View>
          <View style={styles.tableRowLast}>
            <View style={[styles.multilineContent, { width: '100%' }]}>
              <Text style={styles.unavailable}>※データ未入力（寝たきり度・認知症の状況の評価が必要です）</Text>
            </View>
          </View>
        </View>

        {/* 主治医等 */}
        <View style={styles.table}>
          <View style={styles.sectionTitle}>
            <Text>主治医等</Text>
          </View>
          <View style={styles.tableRow}>
            <View style={[styles.cellLabel, { width: '20%' }]}>
              <Text>氏名</Text>
            </View>
            <View style={[styles.cellValue, { width: '80%' }]}>
              <Text>{medicalInstitution?.doctorName || '未登録'}</Text>
            </View>
          </View>
          <View style={styles.tableRow}>
            <View style={[styles.cellLabel, { width: '20%' }]}>
              <Text>医療機関名</Text>
            </View>
            <View style={[styles.cellValue, { width: '80%' }]}>
              <Text>{medicalInstitution?.name || '未登録'}</Text>
            </View>
          </View>
          <View style={styles.tableRow}>
            <View style={[styles.cellLabel, { width: '20%' }]}>
              <Text>所在地</Text>
            </View>
            <View style={[styles.cellValue, { width: '80%' }]}>
              <Text>{medicalInstitution?.address || '未登録'}</Text>
            </View>
          </View>
          <View style={styles.tableRowLast}>
            <View style={[styles.cellLabel, { width: '20%' }]}>
              <Text>電話番号</Text>
            </View>
            <View style={[styles.cellValue, { width: '80%' }]}>
              <Text>{medicalInstitution?.phone || '未登録'}</Text>
            </View>
          </View>
        </View>

        {/* 緊急時の主治医・家族等の連絡先 */}
        <View style={styles.table}>
          <View style={styles.sectionTitle}>
            <Text>緊急時の主治医・家族等の連絡先</Text>
          </View>
          <View style={styles.tableRowLast}>
            <View style={[styles.cellValue, { width: '100%', padding: 8 }]}>
              <Text>主治医: {medicalInstitution?.name || '未登録'} / {medicalInstitution?.phone || '未登録'}</Text>
              <Text style={{ marginTop: 4 }}>家族: {patient.emergencyContact || '未登録'} / {patient.emergencyPhone || '未登録'}</Text>
            </View>
          </View>
        </View>

        {/* 指定居宅介護支援事業所等の連絡先 */}
        <View style={styles.table}>
          <View style={styles.sectionTitle}>
            <Text>指定居宅介護支援事業所等の連絡先</Text>
          </View>
          <View style={styles.tableRow}>
            <View style={[styles.cellLabel, { width: '20%' }]}>
              <Text>事業所名</Text>
            </View>
            <View style={[styles.cellValue, { width: '80%' }]}>
              <Text>{careManager?.officeName || '未登録'}</Text>
            </View>
          </View>
          <View style={styles.tableRow}>
            <View style={[styles.cellLabel, { width: '20%' }]}>
              <Text>担当者</Text>
            </View>
            <View style={[styles.cellValue, { width: '80%' }]}>
              <Text>{careManager?.managerName || '未登録'}</Text>
            </View>
          </View>
          <View style={styles.tableRowLast}>
            <View style={[styles.cellLabel, { width: '20%' }]}>
              <Text>連絡先</Text>
            </View>
            <View style={[styles.cellValue, { width: '80%' }]}>
              <Text>{careManager?.phone || '未登録'}</Text>
            </View>
          </View>
        </View>

        {/* 保健・福祉サービス等の利用状況 */}
        <View style={styles.table}>
          <View style={styles.sectionTitle}>
            <Text>保健・福祉サービス等の利用状況</Text>
          </View>
          <View style={styles.tableRowLast}>
            <View style={[styles.multilineContent, { width: '100%' }]}>
              <Text style={styles.unavailable}>※データ未入力（患者登録時に追加入力が必要です）</Text>
            </View>
          </View>
        </View>

        <Text style={styles.footer}>出力日: {new Date().toLocaleDateString('ja-JP')} | ※不足項目は手書きで補完してください</Text>
      </Page>
    </Document>
  )
}
