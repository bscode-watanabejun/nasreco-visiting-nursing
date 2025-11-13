import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

// クライアント側のみフォントを登録（サーバー側では実行しない）
if (typeof window !== 'undefined') {
  import('@/lib/pdfFonts').then((module) => {
    module.registerPDFFont()
  }).catch(() => {
    // サーバー側では無視
  })
}


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
      visitDate: string // フォーマット済み（YYYY/MM/DD）
      actualStartTime: string | null // フォーマット済み（HH:MM）
      actualEndTime: string | null // フォーマット済み（HH:MM）
      status: string
      observations: string // フォーマット済み（40文字まで切り詰め済み）
      implementedCare: string
      nurse: {
        fullName: string
      } | null
      serviceCode: {
        code: string
        name: string
        points: number
        pointsFormatted: string // フォーマット済み（カンマ区切り）
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
    appliedServiceCodes?: Array<{
      visitDate: string // フォーマット済み（YYYY/MM/DD）
      visitDateTime: string // フォーマット済み（YYYY/MM/DD HH:MM）
      visitEndTime: string | null // フォーマット済み（HH:MM）
      serviceCode: {
        code: string
        name: string
        points: number
        pointsFormatted: string // フォーマット済み（カンマ区切り）
        unit: string
      } | null
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

  // パフォーマンス改善: フォーマット関数をメモ化（useMemoは使えないので、事前計算）
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`
  }

  const formatTime = (timeString: string | null) => {
    if (!timeString) return '-'
    // ISO文字列形式（2025-01-01T10:00:00.000Z）から時間部分を抽出
    if (timeString.includes('T')) {
      return timeString.substring(11, 16) // HH:MM形式
    }
    return timeString.substring(0, 5) // 既にHH:MM形式の場合
  }

  // パフォーマンス改善: 加算点数の合計を事前計算
  const emergency = receipt.emergencyPoints ?? 0
  const longDuration = receipt.longDurationPoints ?? 0
  const multipleVisit = receipt.multipleVisitPoints ?? 0
  const sameBuilding = receipt.sameBuildingReduction ?? 0
  const totalBonusPoints = emergency + longDuration + multipleVisit + sameBuilding
  const specialManagementPoints = receipt.specialManagementPoints ?? 0

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
              <View style={[styles.tableCol, { width: '20%' }]}>
                <Text>訪問日時</Text>
              </View>
              <View style={[styles.tableCol, { width: '30%' }]}>
                <Text>実施内容</Text>
              </View>
              <View style={[styles.tableCol, { width: '25%' }]}>
                <Text>担当看護師</Text>
              </View>
              <View style={[styles.tableCol, { width: '25%', borderRightWidth: 0 }]}>
                <Text>サービスコード（基本療養費）</Text>
              </View>
            </View>
            {receipt.relatedRecords.map((record, index) => {
              // パフォーマンス改善: サーバー側でフォーマット済みのデータを使用
              return (
                <View key={index} style={styles.tableRow}>
                  <View style={[styles.tableCol, { width: '20%' }]}>
                    <Text>{record.visitDate}</Text>
                    {record.actualStartTime && (
                      <Text style={{ fontSize: 8, color: '#666' }}>
                        {record.actualStartTime}{record.actualEndTime ? ` - ${record.actualEndTime}` : ''}
                      </Text>
                    )}
                  </View>
                  <View style={[styles.tableCol, { width: '30%' }]}>
                    <Text>{record.observations}</Text>
                  </View>
                  <View style={[styles.tableCol, { width: '25%' }]}>
                    <Text>{record.nurse?.fullName || '-'}</Text>
                  </View>
                  <View style={[styles.tableCol, { width: '25%', borderRightWidth: 0 }]}>
                    {record.serviceCode ? (
                      <>
                        <Text>{record.serviceCode.code} {record.serviceCode.name}</Text>
                        <Text style={{ fontSize: 9, color: '#666' }}>
                          {record.serviceCode.pointsFormatted}点
                        </Text>
                      </>
                    ) : (
                      <Text>-</Text>
                    )}
                  </View>
                </View>
              )
            })}
          </View>
        </View>

        {/* 適用済みサービスコード */}
        {receipt.appliedServiceCodes && receipt.appliedServiceCodes.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>適用済みサービスコード</Text>
            <View style={styles.table}>
              <View style={[styles.tableRow, styles.tableHeader]}>
                <View style={[styles.tableCol, { width: '30%' }]}>
                  <Text>訪問日時</Text>
                </View>
                <View style={[styles.tableCol, { width: '70%', borderRightWidth: 0 }]}>
                  <Text>適用済みサービスコード</Text>
                </View>
              </View>
              {receipt.appliedServiceCodes
                .filter(item => item.serviceCode !== null && item.serviceCode !== undefined)
                .map((item, index) => {
                  // パフォーマンス改善: サーバー側でフォーマット済みのデータを使用
                  const serviceCode = item.serviceCode!
                  const timePart = item.visitDateTime && item.visitDateTime.includes(' ') 
                    ? item.visitDateTime.split(' ')[1] 
                    : null
                  const endTimePart = item.visitEndTime ? ` - ${item.visitEndTime}` : ''
                  
                  return (
                    <View key={index} style={styles.tableRow}>
                      <View style={[styles.tableCol, { width: '30%' }]}>
                        <Text>{item.visitDate}</Text>
                        {timePart && (
                          <Text style={{ fontSize: 8, color: '#666' }}>
                            {timePart}{endTimePart}
                          </Text>
                        )}
                      </View>
                      <View style={[styles.tableCol, { width: '70%', borderRightWidth: 0 }]}>
                        <Text>{serviceCode.code} {serviceCode.name}</Text>
                        <Text style={{ fontSize: 9, color: '#666' }}>
                          {serviceCode.pointsFormatted}点/{serviceCode.unit}
                        </Text>
                      </View>
                    </View>
                  )
                })}
            </View>
          </View>
        )}

        {/* 請求金額 */}
        <View style={styles.totalSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>基本点数:</Text>
            <Text style={styles.totalValue}>{receipt.totalVisitPoints.toLocaleString()}点</Text>
          </View>
          {specialManagementPoints > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>特別管理加算:</Text>
              <Text style={styles.totalValue}>{specialManagementPoints.toLocaleString()}点</Text>
            </View>
          )}
          {totalBonusPoints !== 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>加算点数:</Text>
              <Text style={styles.totalValue}>{totalBonusPoints.toLocaleString()}点</Text>
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
