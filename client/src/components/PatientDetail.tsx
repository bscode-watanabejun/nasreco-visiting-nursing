import { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { useParams, useLocation } from "wouter"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer } from "recharts"
import {
  ArrowLeft,
  User,
  Phone,
  MapPin,
  Calendar,
  Heart,
  Activity,
  FileText,
  ClipboardList,
  FilePlus,
  AlertCircle,
  CreditCard,
  Edit,
  Trash2
} from "lucide-react"
import type { Patient, NursingRecord, PaginatedResult, DoctorOrder, InsuranceCard, Building, MedicalInstitution, CareManager } from "@shared/schema"
import { DoctorOrderDialog } from "./DoctorOrderDialog"
import { InsuranceCardDialog } from "./InsuranceCardDialog"
import { useToast } from "@/hooks/use-toast"

type PatientWithRelations = Patient & {
  building?: Building | null;
  medicalInstitution?: MedicalInstitution | null;
  careManager?: CareManager | null;
}

// Helper function to calculate age
const calculateAge = (birthDate: Date | string | null): number => {
  if (!birthDate) return 0
  const birth = new Date(birthDate)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--
  }
  return age
}

type PeriodFilter = '1week' | '1month' | '3months' | '6months' | 'all'

export function PatientDetail() {
  const { id } = useParams()
  const [, setLocation] = useLocation()
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<string>("basic")
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('1month')
  const [orderDialogOpen, setOrderDialogOpen] = useState(false)
  const [editingOrder, setEditingOrder] = useState<DoctorOrder | null>(null)
  const [cardDialogOpen, setCardDialogOpen] = useState(false)
  const [editingCard, setEditingCard] = useState<InsuranceCard | null>(null)

  // Fetch patient data
  const { data: patientData, isLoading: isPatientLoading } = useQuery<PatientWithRelations>({
    queryKey: ["patient", id],
    queryFn: async () => {
      const response = await fetch(`/api/patients/${id}`)
      if (!response.ok) {
        throw new Error("患者データの取得に失敗しました")
      }
      return response.json()
    },
    enabled: !!id,
  })

  // Fetch nursing records for this patient
  const { data: recordsData, isLoading: isRecordsLoading } = useQuery<PaginatedResult<NursingRecord>>({
    queryKey: ["nursing-records", id],
    queryFn: async () => {
      const response = await fetch(`/api/nursing-records?patientId=${id}`)
      if (!response.ok) {
        throw new Error("訪問記録の取得に失敗しました")
      }
      return response.json()
    },
    enabled: !!id,
  })

  // Fetch doctor orders for this patient
  const { data: doctorOrders = [], isLoading: isOrdersLoading } = useQuery<DoctorOrder[]>({
    queryKey: ["doctor-orders", id],
    queryFn: async () => {
      const response = await fetch(`/api/doctor-orders?patientId=${id}`)
      if (!response.ok) {
        throw new Error("訪問看護指示書の取得に失敗しました")
      }
      return response.json()
    },
    enabled: !!id,
  })

  // Fetch insurance cards for this patient
  const { data: insuranceCards = [], isLoading: isCardsLoading } = useQuery<InsuranceCard[]>({
    queryKey: ["insurance-cards", id],
    queryFn: async () => {
      const response = await fetch(`/api/insurance-cards?patientId=${id}`)
      if (!response.ok) {
        throw new Error("保険証の取得に失敗しました")
      }
      return response.json()
    },
    enabled: !!id,
  })

  const records = recordsData?.data || []

  // Filter records by period (must be before early returns to maintain hook order)
  const filteredRecords = useMemo(() => {
    const now = new Date()
    const cutoffDate = new Date()

    switch (periodFilter) {
      case '1week':
        cutoffDate.setDate(now.getDate() - 7)
        break
      case '1month':
        cutoffDate.setMonth(now.getMonth() - 1)
        break
      case '3months':
        cutoffDate.setMonth(now.getMonth() - 3)
        break
      case '6months':
        cutoffDate.setMonth(now.getMonth() - 6)
        break
      case 'all':
        return records
    }

    return records.filter(record => new Date(record.recordDate) >= cutoffDate)
  }, [records, periodFilter])

  // Prepare chart data
  const chartData = useMemo(() => {
    return filteredRecords
      .filter(record => record.actualStartTime) // Only records with actual start time
      .sort((a, b) => new Date(a.actualStartTime!).getTime() - new Date(b.actualStartTime!).getTime())
      .map(record => ({
        date: new Date(record.actualStartTime!).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' }),
        fullDate: record.actualStartTime,
        temperature: record.temperature ? parseFloat(record.temperature) : null,
        systolic: record.bloodPressureSystolic || null,
        diastolic: record.bloodPressureDiastolic || null,
        heartRate: record.heartRate || null,
        spo2: record.oxygenSaturation || null,
      }))
  }, [filteredRecords])

  // Calculate statistics
  const stats = useMemo(() => {
    const temps = chartData.map(d => d.temperature).filter((v): v is number => v !== null)
    const systolics = chartData.map(d => d.systolic).filter((v): v is number => v !== null)
    const diastolics = chartData.map(d => d.diastolic).filter((v): v is number => v !== null)
    const heartRates = chartData.map(d => d.heartRate).filter((v): v is number => v !== null)
    const spo2s = chartData.map(d => d.spo2).filter((v): v is number => v !== null)

    const avg = (arr: number[]) => arr.length > 0 ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : '-'
    const last = (arr: number[]) => arr.length > 0 ? arr[arr.length - 1] : null

    return {
      temperature: { avg: avg(temps), last: last(temps) },
      systolic: { avg: avg(systolics), last: last(systolics) },
      diastolic: { avg: avg(diastolics), last: last(diastolics) },
      heartRate: { avg: avg(heartRates), last: last(heartRates) },
      spo2: { avg: avg(spo2s), last: last(spo2s) },
    }
  }, [chartData])

  // Early returns after all hooks to maintain hook order
  if (isPatientLoading || isRecordsLoading || isOrdersLoading || isCardsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">読み込み中...</p>
        </div>
      </div>
    )
  }

  if (!patientData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-muted-foreground">患者データが見つかりません</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => setLocation("/patients")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            一覧に戻る
          </Button>
        </div>
      </div>
    )
  }

  // At this point, patientData is guaranteed to exist
  const patient = patientData

  return (
    <div className="space-y-4 px-2 py-3 md:space-y-6 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation("/patients")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            一覧に戻る
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight">
                {patient.lastName} {patient.firstName}
              </h1>
              {patient.isCritical && (
                <Badge className="bg-red-100 text-red-800 border-red-200">
                  重要
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              {calculateAge(patient.dateOfBirth)}歳 / 患者番号: {patient.patientNumber}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="basic">
            <User className="mr-2 h-4 w-4" />
            基本情報
          </TabsTrigger>
          <TabsTrigger value="history">
            <ClipboardList className="mr-2 h-4 w-4" />
            訪問履歴
          </TabsTrigger>
          <TabsTrigger value="vitals">
            <Activity className="mr-2 h-4 w-4" />
            バイタル推移
          </TabsTrigger>
          <TabsTrigger value="care">
            <FileText className="mr-2 h-4 w-4" />
            ケアプラン
          </TabsTrigger>
        </TabsList>

        {/* Basic Information Tab */}
        <TabsContent value="basic" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>基本情報</CardTitle>
              <CardDescription>患者の基本的な情報</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Personal Information */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <User className="h-5 w-5" />
                    個人情報
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-muted-foreground">生年月日</p>
                      <p className="font-medium">
                        {patient.dateOfBirth ? new Date(patient.dateOfBirth).toLocaleDateString('ja-JP') : '未登録'}
                        {patient.dateOfBirth && `（${calculateAge(patient.dateOfBirth)}歳）`}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">性別</p>
                      <p className="font-medium">{patient.gender === 'male' ? '男性' : patient.gender === 'female' ? '女性' : 'その他'}</p>
                    </div>
                  </div>
                </div>

                {/* Contact Information */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Phone className="h-5 w-5" />
                    連絡先情報
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-muted-foreground">電話番号</p>
                      <p className="font-medium">{patient.phone || '未登録'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">住所</p>
                      <p className="font-medium">{patient.address || '未登録'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">建物</p>
                      <p className="font-medium">{patient.building?.name || '未登録'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">緊急連絡先</p>
                      <p className="font-medium">{patient.emergencyContact || '未登録'}</p>
                    </div>
                  </div>
                </div>

                {/* Medical Information */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Heart className="h-5 w-5" />
                    医療情報
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-muted-foreground">介護度</p>
                      <p className="font-medium">{patient.careLevel || '未登録'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">保険種別</p>
                      <p className="font-medium">{patient.insuranceType || '未登録'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">既往歴</p>
                      <p className="font-medium whitespace-pre-wrap">{patient.medicalHistory || '未登録'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">アレルギー情報</p>
                      <p className="font-medium whitespace-pre-wrap">{patient.allergies || 'なし'}</p>
                    </div>
                  </div>
                </div>

                {/* Care Notes */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">ケアノート</h3>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-muted-foreground">ケアに関する注意事項</p>
                      <p className="font-medium whitespace-pre-wrap">{patient.careNotes || 'なし'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Doctor Orders Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    訪問看護指示書
                  </CardTitle>
                  <CardDescription>主治医からの訪問看護指示書</CardDescription>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingOrder(null)
                    setOrderDialogOpen(true)
                  }}
                >
                  <FilePlus className="mr-2 h-4 w-4" />
                  新規登録
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isOrdersLoading ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">指示書を読み込んでいます...</p>
                </div>
              ) : doctorOrders.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="mx-auto h-12 w-12 text-muted-foreground opacity-50 mb-4" />
                  <p className="text-muted-foreground">訪問看護指示書が登録されていません</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {doctorOrders
                    .sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime())
                    .map((order) => {
                      const isActive = new Date(order.endDate) >= new Date()
                      const daysUntilExpiry = Math.ceil(
                        (new Date(order.endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
                      )
                      const isExpiringSoon = isActive && daysUntilExpiry <= 14

                      return (
                        <div
                          key={order.id}
                          className={`border rounded-lg p-4 ${
                            isActive ? 'bg-background' : 'bg-muted/50 opacity-75'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="space-y-3 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant={isActive ? 'default' : 'secondary'}>
                                  {isActive ? '有効' : '期限切れ'}
                                </Badge>
                                {isExpiringSoon && (
                                  <Badge variant="destructive" className="flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3" />
                                    期限間近（残り{daysUntilExpiry}日）
                                  </Badge>
                                )}
                              </div>
                              {(order as any).medicalInstitution && (
                                <div>
                                  <p className="text-sm text-muted-foreground">医療機関</p>
                                  <p className="font-medium">
                                    {(order as any).medicalInstitution.name} - {(order as any).medicalInstitution.doctorName}
                                  </p>
                                </div>
                              )}

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <p className="text-sm text-muted-foreground">指示日</p>
                                  <p className="font-medium">
                                    {new Date(order.orderDate).toLocaleDateString('ja-JP')}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-sm text-muted-foreground">指示期間</p>
                                  <p className="font-medium">
                                    {new Date(order.startDate).toLocaleDateString('ja-JP')} 〜 {new Date(order.endDate).toLocaleDateString('ja-JP')}
                                  </p>
                                </div>
                                {order.diagnosis && (
                                  <div className="md:col-span-2">
                                    <p className="text-sm text-muted-foreground">病名・主たる傷病名</p>
                                    <p className="font-medium whitespace-pre-wrap">{order.diagnosis}</p>
                                  </div>
                                )}
                                {order.orderContent && (
                                  <div className="md:col-span-2">
                                    <p className="text-sm text-muted-foreground">指示内容</p>
                                    <p className="font-medium whitespace-pre-wrap">{order.orderContent}</p>
                                  </div>
                                )}
                                {order.weeklyVisitLimit && (
                                  <div>
                                    <p className="text-sm text-muted-foreground">週の訪問回数上限</p>
                                    <p className="font-medium">{order.weeklyVisitLimit}回/週</p>
                                  </div>
                                )}
                                {order.notes && (
                                  <div className="md:col-span-2">
                                    <p className="text-sm text-muted-foreground">備考</p>
                                    <p className="font-medium whitespace-pre-wrap">{order.notes}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setEditingOrder(order)
                                  setOrderDialogOpen(true)
                                }}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={async () => {
                                  if (!confirm('この訪問看護指示書を削除してもよろしいですか？')) return

                                  try {
                                    const response = await fetch(`/api/doctor-orders/${order.id}`, {
                                      method: 'DELETE'
                                    })
                                    if (!response.ok) throw new Error('削除に失敗しました')

                                    toast({
                                      title: "削除完了",
                                      description: "訪問看護指示書を削除しました"
                                    })

                                    // Refresh data
                                    window.location.reload()
                                  } catch (error) {
                                    toast({
                                      title: "エラー",
                                      description: "削除中にエラーが発生しました",
                                      variant: "destructive"
                                    })
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Insurance Cards Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    保険証情報
                  </CardTitle>
                  <CardDescription>医療保険・介護保険証の情報</CardDescription>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingCard(null)
                    setCardDialogOpen(true)
                  }}
                >
                  <FilePlus className="mr-2 h-4 w-4" />
                  新規登録
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isCardsLoading ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">保険証を読み込んでいます...</p>
                </div>
              ) : insuranceCards.length === 0 ? (
                <div className="text-center py-8">
                  <CreditCard className="mx-auto h-12 w-12 text-muted-foreground opacity-50 mb-4" />
                  <p className="text-muted-foreground">保険証が登録されていません</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {insuranceCards
                    .sort((a, b) => {
                      // Active cards first
                      const aValid = !a.validUntil || new Date(a.validUntil) >= new Date();
                      const bValid = !b.validUntil || new Date(b.validUntil) >= new Date();
                      if (aValid && !bValid) return -1;
                      if (!aValid && bValid) return 1;
                      // Then by card type (medical first)
                      if (a.cardType === 'medical' && b.cardType !== 'medical') return -1;
                      if (a.cardType !== 'medical' && b.cardType === 'medical') return 1;
                      return 0;
                    })
                    .map((card) => {
                      const isValid = !card.validUntil || new Date(card.validUntil) >= new Date();

                      return (
                        <div
                          key={card.id}
                          className={`border rounded-lg p-4 ${
                            isValid ? 'bg-background' : 'bg-muted/50 opacity-75'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="space-y-3 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant={card.cardType === 'medical' ? 'default' : 'secondary'}>
                                  {card.cardType === 'medical' ? '医療保険' : '介護保険'}
                                </Badge>
                                {!isValid && (
                                  <Badge variant="destructive">期限切れ</Badge>
                                )}
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <p className="text-sm text-muted-foreground">保険者番号</p>
                                  <p className="font-medium">{card.insurerNumber}</p>
                                </div>
                                <div>
                                  <p className="text-sm text-muted-foreground">被保険者番号</p>
                                  <p className="font-medium">{card.insuredNumber}</p>
                                </div>
                                {card.insuredSymbol && (
                                  <div>
                                    <p className="text-sm text-muted-foreground">記号</p>
                                    <p className="font-medium">{card.insuredSymbol}</p>
                                  </div>
                                )}
                                {card.insuredCardNumber && (
                                  <div>
                                    <p className="text-sm text-muted-foreground">番号</p>
                                    <p className="font-medium">{card.insuredCardNumber}</p>
                                  </div>
                                )}
                                {card.copaymentRate && (
                                  <div>
                                    <p className="text-sm text-muted-foreground">負担割合</p>
                                    <p className="font-medium">{card.copaymentRate}割</p>
                                  </div>
                                )}
                                <div>
                                  <p className="text-sm text-muted-foreground">有効期間</p>
                                  <p className="font-medium">
                                    {new Date(card.validFrom).toLocaleDateString('ja-JP')}
                                    {' 〜 '}
                                    {card.validUntil ? new Date(card.validUntil).toLocaleDateString('ja-JP') : '無期限'}
                                  </p>
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-col gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setEditingCard(card)
                                  setCardDialogOpen(true)
                                }}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={async () => {
                                  if (!confirm('この保険証情報を削除してもよろしいですか？')) return
                                  try {
                                    const response = await fetch(`/api/insurance-cards/${card.id}`, {
                                      method: 'DELETE',
                                    })
                                    if (!response.ok) throw new Error('削除に失敗しました')
                                    toast({
                                      title: "削除完了",
                                      description: "保険証情報を削除しました",
                                    })
                                    window.location.reload()
                                  } catch (error) {
                                    toast({
                                      title: "エラー",
                                      description: "削除中にエラーが発生しました",
                                      variant: "destructive",
                                    })
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Visit History Tab */}
        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>訪問履歴</CardTitle>
              <CardDescription>過去の訪問記録一覧</CardDescription>
            </CardHeader>
            <CardContent>
              {isRecordsLoading ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">訪問記録を読み込んでいます...</p>
                </div>
              ) : records.length === 0 ? (
                <div className="text-center py-8">
                  <ClipboardList className="mx-auto h-12 w-12 text-muted-foreground opacity-50 mb-4" />
                  <p className="text-muted-foreground">訪問記録がありません</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {records
                    .sort((a, b) => new Date(b.recordDate).getTime() - new Date(a.recordDate).getTime())
                    .map((record) => (
                      <div
                        key={record.id}
                        className="border rounded-lg p-4 hover:bg-accent transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="space-y-2 flex-1">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              <p className="font-medium">
                                {new Date(record.recordDate).toLocaleDateString('ja-JP', {
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric',
                                  weekday: 'short'
                                })}
                              </p>
                              {record.actualStartTime && (
                                <span className="text-sm text-muted-foreground">
                                  {new Date(record.actualStartTime).toLocaleTimeString('ja-JP', {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={
                                record.status === 'completed' ? 'default' :
                                record.status === 'reviewed' ? 'secondary' :
                                'outline'
                              }>
                                {record.status === 'completed' ? '完成' :
                                 record.status === 'reviewed' ? '確認済み' :
                                 record.status === 'draft' ? '下書き' : record.status}
                              </Badge>
                            </div>
                            {record.observations && (
                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {record.observations}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Vitals Tab */}
        <TabsContent value="vitals" className="space-y-3 md:space-y-6">
          {/* Period Filter */}
          <Card>
            <CardContent className="pt-3 px-2 pb-3 md:pt-6 md:px-6 md:pb-6">
              <div className="flex gap-1.5 md:gap-2 flex-wrap">
                <Button
                  variant={periodFilter === '1week' ? 'default' : 'outline'}
                  size="sm"
                  className="text-xs px-2.5 md:px-3"
                  onClick={() => setPeriodFilter('1week')}
                >
                  1週間
                </Button>
                <Button
                  variant={periodFilter === '1month' ? 'default' : 'outline'}
                  size="sm"
                  className="text-xs px-2.5 md:px-3"
                  onClick={() => setPeriodFilter('1month')}
                >
                  1ヶ月
                </Button>
                <Button
                  variant={periodFilter === '3months' ? 'default' : 'outline'}
                  size="sm"
                  className="text-xs px-2.5 md:px-3"
                  onClick={() => setPeriodFilter('3months')}
                >
                  3ヶ月
                </Button>
                <Button
                  variant={periodFilter === '6months' ? 'default' : 'outline'}
                  size="sm"
                  className="text-xs px-2.5 md:px-3"
                  onClick={() => setPeriodFilter('6months')}
                >
                  6ヶ月
                </Button>
                <Button
                  variant={periodFilter === 'all' ? 'default' : 'outline'}
                  size="sm"
                  className="text-xs px-2.5 md:px-3"
                  onClick={() => setPeriodFilter('all')}
                >
                  全期間
                </Button>
              </div>
            </CardContent>
          </Card>

          {chartData.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-8">
                  <Activity className="mx-auto h-12 w-12 text-muted-foreground opacity-50 mb-4" />
                  <p className="text-muted-foreground">選択期間にデータがありません</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Temperature Chart */}
              <Card className="overflow-hidden">
                <CardHeader className="px-2 py-3 md:p-6 md:pb-4">
                  <CardTitle className="flex flex-col gap-1.5 md:flex-row md:items-center md:justify-between">
                    <span className="text-base md:text-lg">体温推移</span>
                    <div className="text-xs md:text-sm font-normal text-muted-foreground">
                      平均: {stats.temperature.avg}℃ / 前回: {stats.temperature.last || '-'}℃
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 md:px-6 md:pb-6">
                  <ChartContainer
                    config={{
                      temperature: {
                        label: "体温 (℃)",
                        color: "hsl(var(--chart-1))",
                      },
                    }}
                    className="h-[250px] md:h-[300px] w-full"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ left: 0, right: 0, top: 5, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="date"
                          angle={-45}
                          textAnchor="end"
                          height={60}
                          tick={{ fontSize: 10 }}
                        />
                        <YAxis domain={[35, 39]} tick={{ fontSize: 10 }} width={28} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Line
                          type="monotone"
                          dataKey="temperature"
                          stroke="hsl(var(--chart-1))"
                          strokeWidth={2}
                          dot={{ r: 4 }}
                          name="体温 (℃)"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </CardContent>
              </Card>

              {/* Blood Pressure Chart */}
              <Card className="overflow-hidden">
                <CardHeader className="px-2 py-3 md:p-6 md:pb-4">
                  <CardTitle className="flex flex-col gap-1.5 md:flex-row md:items-center md:justify-between">
                    <span className="text-base md:text-lg">血圧推移</span>
                    <div className="text-xs md:text-sm font-normal text-muted-foreground">
                      平均: {stats.systolic.avg}/{stats.diastolic.avg} mmHg / 前回: {stats.systolic.last || '-'}/{stats.diastolic.last || '-'} mmHg
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 md:px-6 md:pb-6">
                  <ChartContainer
                    config={{
                      systolic: {
                        label: "収縮期血圧 (mmHg)",
                        color: "hsl(var(--chart-2))",
                      },
                      diastolic: {
                        label: "拡張期血圧 (mmHg)",
                        color: "hsl(var(--chart-3))",
                      },
                    }}
                    className="h-[250px] md:h-[300px] w-full"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ left: 0, right: 0, top: 5, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="date"
                          angle={-45}
                          textAnchor="end"
                          height={60}
                          tick={{ fontSize: 10 }}
                        />
                        <YAxis domain={[60, 180]} tick={{ fontSize: 10 }} width={28} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Legend
                          wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }}
                          iconType="line"
                        />
                        <Line
                          type="monotone"
                          dataKey="systolic"
                          stroke="hsl(var(--chart-2))"
                          strokeWidth={2}
                          dot={{ r: 4 }}
                          name="収縮期血圧 (mmHg)"
                        />
                        <Line
                          type="monotone"
                          dataKey="diastolic"
                          stroke="hsl(var(--chart-3))"
                          strokeWidth={2}
                          dot={{ r: 4 }}
                          name="拡張期血圧 (mmHg)"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </CardContent>
              </Card>

              {/* Heart Rate Chart */}
              <Card className="overflow-hidden">
                <CardHeader className="px-2 py-3 md:p-6 md:pb-4">
                  <CardTitle className="flex flex-col gap-1.5 md:flex-row md:items-center md:justify-between">
                    <span className="text-base md:text-lg">脈拍推移</span>
                    <div className="text-xs md:text-sm font-normal text-muted-foreground">
                      平均: {stats.heartRate.avg} bpm / 前回: {stats.heartRate.last || '-'} bpm
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 md:px-6 md:pb-6">
                  <ChartContainer
                    config={{
                      heartRate: {
                        label: "脈拍 (bpm)",
                        color: "hsl(var(--chart-4))",
                      },
                    }}
                    className="h-[250px] md:h-[300px] w-full"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ left: 0, right: 0, top: 5, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="date"
                          angle={-45}
                          textAnchor="end"
                          height={60}
                          tick={{ fontSize: 10 }}
                        />
                        <YAxis domain={[40, 120]} tick={{ fontSize: 10 }} width={28} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Line
                          type="monotone"
                          dataKey="heartRate"
                          stroke="hsl(var(--chart-4))"
                          strokeWidth={2}
                          dot={{ r: 4 }}
                          name="脈拍 (bpm)"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </CardContent>
              </Card>

              {/* SpO2 Chart */}
              <Card className="overflow-hidden">
                <CardHeader className="px-2 py-3 md:p-6 md:pb-4">
                  <CardTitle className="flex flex-col gap-1.5 md:flex-row md:items-center md:justify-between">
                    <span className="text-base md:text-lg">SpO2推移</span>
                    <div className="text-xs md:text-sm font-normal text-muted-foreground">
                      平均: {stats.spo2.avg}% / 前回: {stats.spo2.last || '-'}%
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 md:px-6 md:pb-6">
                  <ChartContainer
                    config={{
                      spo2: {
                        label: "SpO2 (%)",
                        color: "hsl(var(--chart-5))",
                      },
                    }}
                    className="h-[250px] md:h-[300px] w-full"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ left: 0, right: 0, top: 5, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="date"
                          angle={-45}
                          textAnchor="end"
                          height={60}
                          tick={{ fontSize: 10 }}
                        />
                        <YAxis domain={[90, 100]} tick={{ fontSize: 10 }} width={28} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Line
                          type="monotone"
                          dataKey="spo2"
                          stroke="hsl(var(--chart-5))"
                          strokeWidth={2}
                          dot={{ r: 4 }}
                          name="SpO2 (%)"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Care Plan Tab */}
        <TabsContent value="care" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>ケアプラン</CardTitle>
              <CardDescription>看護計画とケアプラン</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <FileText className="mx-auto h-12 w-12 text-muted-foreground opacity-50 mb-4" />
                <p className="text-muted-foreground">ケアプラン機能は次のフェーズで実装予定です</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Doctor Order Dialog */}
      <DoctorOrderDialog
        open={orderDialogOpen}
        onOpenChange={setOrderDialogOpen}
        patientId={id!}
        order={editingOrder}
      />

      {/* Insurance Card Dialog */}
      <InsuranceCardDialog
        open={cardDialogOpen}
        onOpenChange={setCardDialogOpen}
        patientId={id!}
        card={editingCard}
      />
    </div>
  )
}
