import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer'

// 日本語フォント設定（Noto Sans JPを使用）
Font.register({
  family: 'NotoSansJP',
  src: '/fonts/NotoSansJP-Regular.ttf'
})

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 10,
    fontFamily: 'NotoSansJP',
  },
  header: {
    marginBottom: 20,
    borderBottom: 1,
    paddingBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 5,
  },
  section: {
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 5,
    backgroundColor: '#f0f0f0',
    padding: 5,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  label: {
    width: 120,
    fontWeight: 'bold',
  },
  value: {
    flex: 1,
  },
  table: {
    display: 'flex',
    width: 'auto',
    marginBottom: 10,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    minHeight: 25,
    alignItems: 'center',
  },
  tableHeader: {
    backgroundColor: '#f5f5f5',
    fontWeight: 'bold',
  },
  tableCol: {
    padding: 5,
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
  },
  tableCol1: { width: '20%' },
  tableCol2: { width: '15%' },
  tableCol3: { width: '15%' },
  tableCol4: { width: '35%' },
  tableCol5: { width: '15%', borderRightWidth: 0 },
  totalSection: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  totalValue: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 30,
    right: 30,
    textAlign: 'center',
    fontSize: 8,
    color: '#666',
    borderTop: 1,
    paddingTop: 10,
  },
})

interface ReceiptPDFProps {
  receipt: {
    id: string
    targetYear: number
    targetMonth: number
    insuranceType: 'medical' | 'care'
    visitCount: number
    totalVisitPoints: number
    specialManagementPoints: number | null
    emergencyPoints: number | null
    longDurationPoints: number | null
    multipleVisitPoints: number | null
    sameBuildingReduction: number | null
    totalPoints: number
    totalAmount: number
    patient: {
      patientNumber: string
      lastName: string
      firstName: string
      dateOfBirth: string
      gender: string
      address: string | null
    }
    insuranceCard: {
      cardType: string
      insurerNumber: string
      insuredNumber: string
      validFrom: string
      validUntil: string | null
      copaymentRate: string | null
    } | null
    doctorOrder: {
      order: {
        orderDate: string
        diagnosis: string
        orderContent: string
      }
      medicalInstitution: {
        name: string
        doctorName: string
      }
    } | null
    relatedRecords: Array<{
      visitDate: string
      actualStartTime: string | null
      actualEndTime: string | null
      status: string
      observations: string
      implementedCare: string
      nurse: {
        fullName: string
      } | null
    }>
    bonusHistory: Array<{
      bonus: {
        bonusCode: string
        bonusName: string
        bonusCategory: string
      } | null
      history: {
        calculatedPoints: number
        appliedAt: string
      }
    }>
  }
  facilityInfo?: {
    name: string
    address: string
    phone: string
    fax: string
  }
}

export const ReceiptPDF = ({ receipt, facilityInfo }: ReceiptPDFProps) => {
  const insuranceTypeLabel = receipt.insuranceType === 'medical' ? '医療保険' : '介護保険'
  const targetDate = `${receipt.targetYear}年${receipt.targetMonth}月`

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`
  }

  const formatTime = (timeString: string | null) => {
    if (!timeString) return '-'
    return timeString.substring(0, 5) // HH:MM形式
  }

  const defaultFacilityInfo = facilityInfo || {
    name: '訪問看護ステーション',
    address: '住所未設定',
    phone: 'TEL: 未設定',
    fax: 'FAX: 未設定',
  }

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ヘッダー */}
        <View style={styles.header}>
          <Text style={styles.title}>訪問看護療養費明細書</Text>
          <Text style={styles.subtitle}>{insuranceTypeLabel} / {targetDate}分</Text>
        </View>

        {/* 事業所情報 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>事業所情報</Text>
          <View style={styles.row}>
            <Text style={styles.label}>事業所名:</Text>
            <Text style={styles.value}>{defaultFacilityInfo.name}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>住所:</Text>
            <Text style={styles.value}>{defaultFacilityInfo.address}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>電話番号:</Text>
            <Text style={styles.value}>{defaultFacilityInfo.phone}</Text>
          </View>
        </View>

        {/* 利用者情報 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>利用者情報</Text>
          <View style={styles.row}>
            <Text style={styles.label}>利用者番号:</Text>
            <Text style={styles.value}>{receipt.patient.patientNumber}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>氏名:</Text>
            <Text style={styles.value}>{receipt.patient.lastName} {receipt.patient.firstName}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>生年月日:</Text>
            <Text style={styles.value}>{formatDate(receipt.patient.dateOfBirth)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>性別:</Text>
            <Text style={styles.value}>{receipt.patient.gender === 'male' ? '男性' : '女性'}</Text>
          </View>
          {receipt.patient.address && (
            <View style={styles.row}>
              <Text style={styles.label}>住所:</Text>
              <Text style={styles.value}>{receipt.patient.address}</Text>
            </View>
          )}
        </View>

        {/* 保険証情報 */}
        {receipt.insuranceCard && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>保険証情報</Text>
            <View style={styles.row}>
              <Text style={styles.label}>保険者番号:</Text>
              <Text style={styles.value}>{receipt.insuranceCard.insurerNumber}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>被保険者番号:</Text>
              <Text style={styles.value}>{receipt.insuranceCard.insuredNumber}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>有効期間:</Text>
              <Text style={styles.value}>
                {formatDate(receipt.insuranceCard.validFrom)} 〜
                {receipt.insuranceCard.validUntil ? formatDate(receipt.insuranceCard.validUntil) : '期限なし'}
              </Text>
            </View>
          </View>
        )}

        {/* 訪問看護指示書情報 */}
        {receipt.doctorOrder && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>訪問看護指示書情報</Text>
            <View style={styles.row}>
              <Text style={styles.label}>医療機関:</Text>
              <Text style={styles.value}>{receipt.doctorOrder.medicalInstitution.name}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>主治医:</Text>
              <Text style={styles.value}>{receipt.doctorOrder.medicalInstitution.doctorName}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>診断名:</Text>
              <Text style={styles.value}>{receipt.doctorOrder.order.diagnosis}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>指示日:</Text>
              <Text style={styles.value}>{formatDate(receipt.doctorOrder.order.orderDate)}</Text>
            </View>
          </View>
        )}

        {/* 訪問実績一覧 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>訪問実績 (訪問回数: {receipt.visitCount}回)</Text>
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <View style={[styles.tableCol, styles.tableCol1]}>
                <Text>訪問日</Text>
              </View>
              <View style={[styles.tableCol, styles.tableCol2]}>
                <Text>開始時刻</Text>
              </View>
              <View style={[styles.tableCol, styles.tableCol2]}>
                <Text>終了時刻</Text>
              </View>
              <View style={[styles.tableCol, styles.tableCol4]}>
                <Text>実施内容</Text>
              </View>
              <View style={[styles.tableCol, styles.tableCol5]}>
                <Text>担当看護師</Text>
              </View>
            </View>
            {receipt.relatedRecords.slice(0, 10).map((record, index) => (
              <View key={index} style={styles.tableRow}>
                <View style={[styles.tableCol, styles.tableCol1]}>
                  <Text>{formatDate(record.visitDate)}</Text>
                </View>
                <View style={[styles.tableCol, styles.tableCol2]}>
                  <Text>{formatTime(record.actualStartTime)}</Text>
                </View>
                <View style={[styles.tableCol, styles.tableCol2]}>
                  <Text>{formatTime(record.actualEndTime)}</Text>
                </View>
                <View style={[styles.tableCol, styles.tableCol4]}>
                  <Text>{record.implementedCare.substring(0, 40)}{record.implementedCare.length > 40 ? '...' : ''}</Text>
                </View>
                <View style={[styles.tableCol, styles.tableCol5]}>
                  <Text>{record.nurse?.fullName || '-'}</Text>
                </View>
              </View>
            ))}
            {receipt.relatedRecords.length > 10 && (
              <View style={styles.tableRow}>
                <View style={[styles.tableCol, { width: '100%', borderRightWidth: 0 }]}>
                  <Text>※ 他 {receipt.relatedRecords.length - 10} 件（詳細は別紙参照）</Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* 加算項目 */}
        {receipt.bonusHistory.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>加算項目</Text>
            <View style={styles.table}>
              <View style={[styles.tableRow, styles.tableHeader]}>
                <View style={[styles.tableCol, { width: '20%' }]}>
                  <Text>加算コード</Text>
                </View>
                <View style={[styles.tableCol, { width: '50%' }]}>
                  <Text>加算名</Text>
                </View>
                <View style={[styles.tableCol, { width: '30%', borderRightWidth: 0 }]}>
                  <Text>加算点数</Text>
                </View>
              </View>
              {receipt.bonusHistory.map((item, index) => (
                item.bonus && (
                  <View key={index} style={styles.tableRow}>
                    <View style={[styles.tableCol, { width: '20%' }]}>
                      <Text>{item.bonus.bonusCode}</Text>
                    </View>
                    <View style={[styles.tableCol, { width: '50%' }]}>
                      <Text>{item.bonus.bonusName}</Text>
                    </View>
                    <View style={[styles.tableCol, { width: '30%', borderRightWidth: 0 }]}>
                      <Text>{item.history.calculatedPoints}点</Text>
                    </View>
                  </View>
                )
              ))}
            </View>
          </View>
        )}

        {/* 請求金額 */}
        <View style={styles.totalSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>訪問看護基本点数:</Text>
            <Text style={styles.totalValue}>{receipt.totalVisitPoints.toLocaleString()}点</Text>
          </View>
          {receipt.specialManagementPoints && receipt.specialManagementPoints > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>特別管理加算:</Text>
              <Text style={styles.totalValue}>{receipt.specialManagementPoints.toLocaleString()}点</Text>
            </View>
          )}
          {receipt.emergencyPoints && receipt.emergencyPoints > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>緊急訪問加算:</Text>
              <Text style={styles.totalValue}>{receipt.emergencyPoints.toLocaleString()}点</Text>
            </View>
          )}
          {receipt.longDurationPoints && receipt.longDurationPoints > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>長時間訪問加算:</Text>
              <Text style={styles.totalValue}>{receipt.longDurationPoints.toLocaleString()}点</Text>
            </View>
          )}
          {receipt.multipleVisitPoints && receipt.multipleVisitPoints > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>複数名訪問加算:</Text>
              <Text style={styles.totalValue}>{receipt.multipleVisitPoints.toLocaleString()}点</Text>
            </View>
          )}
          {receipt.sameBuildingReduction && receipt.sameBuildingReduction < 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>同一建物減算:</Text>
              <Text style={styles.totalValue}>{receipt.sameBuildingReduction.toLocaleString()}点</Text>
            </View>
          )}
          <View style={[styles.totalRow, { borderTop: 2, borderTopColor: '#333', paddingTop: 5, marginTop: 5 }]}>
            <Text style={[styles.totalLabel, { fontSize: 14 }]}>合計点数:</Text>
            <Text style={[styles.totalValue, { fontSize: 14 }]}>
              {receipt.totalPoints.toLocaleString()}点
            </Text>
          </View>
          <View style={[styles.totalRow, { marginTop: 5 }]}>
            <Text style={[styles.totalLabel, { fontSize: 14 }]}>請求金額:</Text>
            <Text style={[styles.totalValue, { fontSize: 14 }]}>
              {receipt.totalAmount.toLocaleString()}円
            </Text>
          </View>
        </View>

        {/* フッター */}
        <View style={styles.footer}>
          <Text>この明細書は {new Date().toLocaleDateString('ja-JP')} に出力されました</Text>
          <Text>※ この書類は請求用の参考資料です。正式な請求には別途所定の様式を使用してください。</Text>
        </View>
      </Page>
    </Document>
  )
}
