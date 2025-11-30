import { useState, useMemo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useParams, useLocation } from "wouter"
import { useBasePath } from "@/hooks/useBasePath"
import { useIsHeadquarters } from "@/contexts/TenantContext"
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
  Trash2,
  ExternalLink,
  Download
} from "lucide-react"
import type { Patient, NursingRecord, PaginatedResult, DoctorOrder, InsuranceCard, ServiceCarePlan, CarePlan, Contract, Building, MedicalInstitution, CareManager } from "@shared/schema"
import { DoctorOrderDialog } from "./DoctorOrderDialog"
import { InsuranceCardDialog } from "./InsuranceCardDialog"
import { PublicExpenseCardDialog } from "./PublicExpenseCardDialog"
import { ServiceCarePlanDialog } from "./ServiceCarePlanDialog"
import { CarePlanDialog } from "./CarePlanDialog"
import { ContractDialog } from "./ContractDialog"
import { PatientForm } from "./PatientForm"
import { useToast } from "@/hooks/use-toast"

// Phase 3: 公費負担医療情報の型定義
interface PublicExpenseCard {
  id: string
  patientId: string
  facilityId: string
  beneficiaryNumber: string
  recipientNumber: string | null
  legalCategoryNumber: string
  priority: number
  benefitRate: number | null
  validFrom: string
  validUntil: string | null
  notes: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

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
  const basePath = useBasePath()
  const isHeadquarters = useIsHeadquarters()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<string>("basic")
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('1month')
  const [orderDialogOpen, setOrderDialogOpen] = useState(false)
  const [editingOrder, setEditingOrder] = useState<DoctorOrder | null>(null)
  const [cardDialogOpen, setCardDialogOpen] = useState(false)
  const [editingCard, setEditingCard] = useState<InsuranceCard | null>(null)
  const [publicExpenseDialogOpen, setPublicExpenseDialogOpen] = useState(false)
  const [editingPublicExpense, setEditingPublicExpense] = useState<PublicExpenseCard | null>(null)
  const [serviceCarePlanDialogOpen, setServiceCarePlanDialogOpen] = useState(false)
  const [editingServiceCarePlan, setEditingServiceCarePlan] = useState<ServiceCarePlan | null>(null)
  const [carePlanDialogOpen, setCarePlanDialogOpen] = useState(false)
  const [editingCarePlan, setEditingCarePlan] = useState<CarePlan | null>(null)
  const [contractDialogOpen, setContractDialogOpen] = useState(false)
  const [editingContract, setEditingContract] = useState<Contract | null>(null)
  const [isPatientFormOpen, setIsPatientFormOpen] = useState(false)
  const [isExportingRecordI, setIsExportingRecordI] = useState(false)

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
    queryKey: ["/api/insurance-cards", id],
    queryFn: async () => {
      const response = await fetch(`/api/insurance-cards?patientId=${id}`)
      if (!response.ok) {
        throw new Error("保険証の取得に失敗しました")
      }
      return response.json()
    },
    enabled: !!id,
  })

  // Phase 3: Fetch public expense cards for this patient
  const { data: publicExpenseCards = [], isLoading: isPublicExpenseLoading } = useQuery<PublicExpenseCard[]>({
    queryKey: ["public-expense-cards", id],
    queryFn: async () => {
      const response = await fetch(`/api/public-expense-cards?patientId=${id}`)
      if (!response.ok) {
        throw new Error("公費情報の取得に失敗しました")
      }
      return response.json()
    },
    enabled: !!id,
  })

  // Fetch service care plans for this patient
  const { data: serviceCarePlans = [], isLoading: isServiceCarePlansLoading } = useQuery<ServiceCarePlan[]>({
    queryKey: ["/api/service-care-plans", id],
    queryFn: async () => {
      const response = await fetch(`/api/service-care-plans?patientId=${id}`)
      if (!response.ok) {
        throw new Error("居宅サービス計画書の取得に失敗しました")
      }
      return response.json()
    },
    enabled: !!id,
  })

  // Fetch nursing care plans for this patient
  const { data: nursingCarePlans = [], isLoading: isNursingCarePlansLoading } = useQuery<CarePlan[]>({
    queryKey: ["/api/care-plans", id],
    queryFn: async () => {
      const response = await fetch(`/api/care-plans?patientId=${id}`)
      if (!response.ok) {
        throw new Error("訪問看護計画書の取得に失敗しました")
      }
      return response.json()
    },
    enabled: !!id,
  })

  // Fetch contracts for this patient
  const { data: contracts = [], isLoading: isContractsLoading } = useQuery<Contract[]>({
    queryKey: ["/api/contracts", id],
    queryFn: async () => {
      const response = await fetch(`/api/contracts?patientId=${id}`)
      if (!response.ok) {
        throw new Error("契約書・同意書の取得に失敗しました")
      }
      return response.json()
    },
    enabled: !!id,
  })

  // Fetch users for contract witness selection
  const { data: usersResponse } = useQuery<{ data: any[]; total: number }>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const response = await fetch("/api/users?limit=100")
      if (!response.ok) throw new Error("スタッフの取得に失敗しました")
      return response.json()
    },
  })

  const users = usersResponse?.data || []

  // Fetch special management definitions for display
  const { data: specialManagementDefinitions = [] } = useQuery<any[]>({
    queryKey: ["/api/special-management-definitions"],
    queryFn: async () => {
      const response = await fetch("/api/special-management-definitions")
      if (!response.ok) {
        throw new Error("特別管理加算定義の取得に失敗しました")
      }
      return response.json()
    },
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
            onClick={() => setLocation(`${basePath}/patients`)}
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

  // Handler for exporting Nursing Record I Excel
  const handleExportRecordI = async () => {
    try {
      setIsExportingRecordI(true)
      const startTime = performance.now()

      // Call server-side Excel generation endpoint
      const response = await fetch(`/api/patients/${id}/nursing-record-i-excel`)
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Excel生成に失敗しました")
      }

      // Get Excel blob from response
      const blob = await response.blob()
      const totalTime = performance.now()
      console.log('[Excel Export] Server-side generation time:', Math.round(totalTime - startTime), 'ms')

      // Download
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `訪問看護記録書I_${patient.lastName}${patient.firstName}_${new Date().toISOString().split('T')[0]}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast({
        title: "成功",
        description: "訪問看護記録書Iをダウンロードしました",
      })
    } catch (error) {
      console.error("Excel export error:", error)
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "Excelのエクスポートに失敗しました",
        variant: "destructive",
      })
    } finally {
      setIsExportingRecordI(false)
    }
  }

  return (
    <div className="space-y-4 px-2 py-3 md:space-y-6 md:p-6">
      {/* Header */}
      <div className="space-y-3">
        {/* Back button and Export button row */}
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation(`${basePath}/patients`)}
            className="flex-shrink-0"
          >
            <ArrowLeft className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">一覧に戻る</span>
          </Button>
          {!isHeadquarters && (
            <Button
              size="sm"
              onClick={handleExportRecordI}
              disabled={isExportingRecordI}
              className="gap-1 md:gap-2 flex-shrink-0"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">{isExportingRecordI ? "出力中..." : "記録書Ⅰ（Excel）出力"}</span>
              <span className="sm:hidden">{isExportingRecordI ? "出力中..." : "Excel出力"}</span>
            </Button>
          )}
        </div>

        {/* Patient name and info */}
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl md:text-3xl font-bold tracking-tight">
              {patient.lastName} {patient.firstName}
            </h1>
            {patient.isCritical && (
              <Badge className="bg-red-100 text-red-800 border-red-200">
                重要
              </Badge>
            )}
          </div>
          <p className="text-sm md:text-base text-muted-foreground mt-1">
            {calculateAge(patient.dateOfBirth)}歳 / 患者番号: {patient.patientNumber}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="basic" className="text-xs sm:text-sm">
            <User className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">基本情報</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs sm:text-sm">
            <ClipboardList className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">訪問履歴</span>
          </TabsTrigger>
          <TabsTrigger value="vitals" className="text-xs sm:text-sm">
            <Activity className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">バイタル推移</span>
          </TabsTrigger>
          <TabsTrigger value="care" className="text-xs sm:text-sm">
            <FileText className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">計画書・契約書</span>
          </TabsTrigger>
        </TabsList>

        {/* Basic Information Tab */}
        <TabsContent value="basic" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>基本情報</CardTitle>
                  <CardDescription>患者の基本的な情報</CardDescription>
                </div>
                {!isHeadquarters && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsPatientFormOpen(true)}
                  >
                    <Edit className="mr-2 h-4 w-4" />
                    編集
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 1. 基本情報 */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <User className="h-5 w-5" />
                    基本情報
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-muted-foreground">患者番号</p>
                      <p className="font-medium">{patient.patientNumber || '未登録'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">氏名</p>
                      <p className="font-medium">{patient.lastName} {patient.firstName}</p>
                    </div>
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

                {/* 2. 連絡先情報 */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Phone className="h-5 w-5" />
                    連絡先情報
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-muted-foreground">住所</p>
                      <p className="font-medium whitespace-pre-wrap">{patient.address || '未登録'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">電話番号</p>
                      <p className="font-medium">{patient.phone || '未登録'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">緊急連絡先（氏名）</p>
                      <p className="font-medium">{patient.emergencyContact || '未登録'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">緊急連絡先（電話番号）</p>
                      <p className="font-medium">{patient.emergencyPhone || '未登録'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">保険番号</p>
                      <p className="font-medium">{patient.insuranceNumber || '未登録'}</p>
                    </div>
                  </div>
                </div>

                {/* 3. 医療情報 */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Heart className="h-5 w-5" />
                    医療情報
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-muted-foreground">既往歴</p>
                      <p className="font-medium whitespace-pre-wrap">{patient.medicalHistory || '未登録'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">アレルギー情報</p>
                      <p className="font-medium whitespace-pre-wrap">{patient.allergies || 'なし'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">現在の服薬</p>
                      <p className="font-medium whitespace-pre-wrap">{patient.currentMedications || '未登録'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">ケアノート</p>
                      <p className="font-medium whitespace-pre-wrap">{patient.careNotes || 'なし'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">重要患者設定</p>
                      <p className="font-medium">
                        {patient.isCritical ? (
                          <Badge className="bg-red-100 text-red-800 border-red-200">重要患者</Badge>
                        ) : (
                          '通常'
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 4. 保険・介護情報 */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    保険・介護情報
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-muted-foreground">保険種別</p>
                      <p className="font-medium">
                        {patient.insuranceType === 'medical' ? '医療保険' :
                         patient.insuranceType === 'care' ? '介護保険' : '未登録'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">介護度</p>
                      <p className="font-medium">
                        {patient.careLevel === 'support1' ? '要支援1' :
                         patient.careLevel === 'support2' ? '要支援2' :
                         patient.careLevel === 'care1' ? '要介護1' :
                         patient.careLevel === 'care2' ? '要介護2' :
                         patient.careLevel === 'care3' ? '要介護3' :
                         patient.careLevel === 'care4' ? '要介護4' :
                         patient.careLevel === 'care5' ? '要介護5' : '未登録'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">特別訪問看護</p>
                      <p className="font-medium">
                        {patient.specialCareType === 'bedsore' ? '褥瘡ケア' :
                         patient.specialCareType === 'rare_disease' ? '難病等' :
                         patient.specialCareType === 'mental' ? '精神科訪問看護' : 'なし'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">入院中</p>
                      <p className="font-medium">
                        {patient.isInHospital ? (
                          <Badge className="bg-blue-100 text-blue-800 border-blue-200">入院中</Badge>
                        ) : (
                          'なし'
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">ショートステイ中</p>
                      <p className="font-medium">
                        {patient.isInShortStay ? (
                          <Badge className="bg-blue-100 text-blue-800 border-blue-200">ショートステイ中</Badge>
                        ) : (
                          'なし'
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">直近の退院日</p>
                      <p className="font-medium">
                        {patient.lastDischargeDate
                          ? new Date(patient.lastDischargeDate).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
                          : '未登録'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">直近の訪問看護計画作成日</p>
                      <p className="font-medium">
                        {patient.lastPlanCreatedDate
                          ? new Date(patient.lastPlanCreatedDate).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
                          : '未登録'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">死亡日</p>
                      <p className="font-medium">
                        {patient.deathDate
                          ? new Date(patient.deathDate).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
                          : '未登録'}
                      </p>
                    </div>
                    {(patient as any).deathPlaceCode && (
                      <div>
                        <p className="text-sm text-muted-foreground">死亡場所</p>
                        <p className="font-medium">
                          {(patient as any).deathPlaceCode} - {(() => {
                            // 訪問場所コードマスタから名称を取得（簡易表示）
                            // 実際の実装ではマスタデータを取得して表示する方が良い
                            return (patient as any).deathPlaceCode === '01' ? '自宅' :
                                   (patient as any).deathPlaceCode === '16' ? '施設（地域密着型介護老人福祉施設及び介護老人福祉施設）' :
                                   (patient as any).deathPlaceCode === '99' ? 'その他' :
                                   (patient as any).deathPlaceCode;
                          })()}
                        </p>
                        {(patient as any).deathPlaceCode === '99' && (patient as any).deathPlaceText && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {(patient as any).deathPlaceText}
                          </p>
                        )}
                      </div>
                    )}
                    {(patient as any).deathTime && (
                      <div>
                        <p className="text-sm text-muted-foreground">死亡時刻</p>
                        <p className="font-medium">
                          {/* HHMM形式をHH:MM形式に変換して表示 */}
                          {(patient as any).deathTime.length === 4
                            ? `${(patient as any).deathTime.substring(0, 2)}:${(patient as any).deathTime.substring(2, 4)}`
                            : (patient as any).deathTime}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* 5. 特別管理加算 */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <AlertCircle className="h-5 w-5" />
                    特別管理加算
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-muted-foreground">管理内容</p>
                      <div className="font-medium">
                        {patient.specialManagementTypes && patient.specialManagementTypes.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {patient.specialManagementTypes.map((category: string) => {
                              const definition = specialManagementDefinitions.find(
                                (def: any) => def.category === category
                              )
                              return (
                                <Badge key={category} variant="outline">
                                  {definition?.displayName || category}
                                </Badge>
                              )
                            })}
                          </div>
                        ) : (
                          '設定なし'
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">開始日</p>
                      <p className="font-medium">
                        {patient.specialManagementStartDate
                          ? new Date(patient.specialManagementStartDate).toLocaleDateString('ja-JP')
                          : '未設定'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">終了日</p>
                      <p className="font-medium">
                        {patient.specialManagementEndDate
                          ? new Date(patient.specialManagementEndDate).toLocaleDateString('ja-JP')
                          : '継続中'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 6. 関連情報 */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    関連情報
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-muted-foreground">主治医・医療機関</p>
                      <p className="font-medium">
                        {patient.medicalInstitution
                          ? `${patient.medicalInstitution.name} - ${patient.medicalInstitution.doctorName}`
                          : '未登録'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">ケアマネージャー</p>
                      <p className="font-medium">
                        {patient.careManager
                          ? `${patient.careManager.officeName} - ${patient.careManager.managerName}`
                          : '未登録'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">建物</p>
                      <p className="font-medium">{patient.building?.name || '未登録'}</p>
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
                {!isHeadquarters && (
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
                )}
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
                                {order.filePath && (
                                  <div className="md:col-span-2">
                                    <p className="text-sm text-muted-foreground">添付ファイル</p>
                                    <p className="text-sm font-medium mt-1">{order.originalFileName || order.filePath.split('/').pop()}</p>
                                    <div className="flex gap-2 mt-1">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => window.open(`/api/doctor-orders/${order.id}/attachment/download`, '_blank')}
                                      >
                                        <ExternalLink className="mr-2 h-4 w-4" />
                                        プレビュー
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          window.location.href = `/api/doctor-orders/${order.id}/attachment/download?download=true`;
                                        }}
                                      >
                                        <Download className="mr-2 h-4 w-4" />
                                        ダウンロード
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={async () => {
                                          if (!confirm('添付ファイルを削除してもよろしいですか？')) return

                                          try {
                                            const response = await fetch(`/api/doctor-orders/${order.id}/attachment`, {
                                              method: 'DELETE'
                                            })
                                            if (!response.ok) throw new Error('削除に失敗しました')

                                            toast({
                                              title: "削除完了",
                                              description: "添付ファイルを削除しました"
                                            })

                                            queryClient.invalidateQueries({ queryKey: ["doctor-orders", id] })
                                          } catch (error) {
                                            toast({
                                              title: "エラー",
                                              description: "削除中にエラーが発生しました",
                                              variant: "destructive"
                                            })
                                          }
                                        }}
                                      >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        削除
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                            {!isHeadquarters && (
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
                            )}
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
                {!isHeadquarters && (
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
                )}
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
                                <Badge variant={card.cardType === 'medical' ? 'medical' : 'care'}>
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
                                {(card as any).insuranceType && (
                                  <div>
                                    <p className="text-sm text-muted-foreground">保険種別</p>
                                    <p className="font-medium">
                                      {(card as any).insuranceType === 'medical' ? '医療保険' :
                                       (card as any).insuranceType === 'care' ? '介護保険' : '未設定'}
                                    </p>
                                  </div>
                                )}
                                {(card as any).relationshipType && (
                                  <div>
                                    <p className="text-sm text-muted-foreground">本人家族区分</p>
                                    <p className="font-medium">
                                      {(card as any).relationshipType === 'self' ? '本人' :
                                       (card as any).relationshipType === 'preschool' ? '未就学者' :
                                       (card as any).relationshipType === 'family' ? '家族' :
                                       (card as any).relationshipType === 'elderly_general' ? '高齢受給者一般・低所得者' :
                                       (card as any).relationshipType === 'elderly_70' ? '高齢受給者7割' : '未設定'}
                                    </p>
                                  </div>
                                )}
                                {(card as any).ageCategory && (
                                  <div>
                                    <p className="text-sm text-muted-foreground">年齢区分</p>
                                    <p className="font-medium">
                                      {(card as any).ageCategory === 'preschool' ? '未就学者（6歳未満）' :
                                       (card as any).ageCategory === 'general' ? '一般' :
                                       (card as any).ageCategory === 'elderly' ? '高齢者（75歳以上）' : '未設定'}
                                    </p>
                                  </div>
                                )}
                                {(card as any).elderlyRecipientCategory && (
                                  <div>
                                    <p className="text-sm text-muted-foreground">高齢受給者区分</p>
                                    <p className="font-medium">
                                      {(card as any).elderlyRecipientCategory === 'general_low' ? '一般・低所得者（2割負担）' :
                                       (card as any).elderlyRecipientCategory === 'seventy' ? '7割負担（現役並み所得者）' : '未設定'}
                                    </p>
                                  </div>
                                )}
                                {card.copaymentRate && (
                                  <div>
                                    <p className="text-sm text-muted-foreground">負担割合</p>
                                    <p className="font-medium">{parseInt(card.copaymentRate) / 10}割</p>
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
                                {card.filePath && (
                                  <div className="md:col-span-2">
                                    <p className="text-sm text-muted-foreground">添付ファイル</p>
                                    <p className="text-sm font-medium mt-1">{card.originalFileName || card.filePath.split('/').pop()}</p>
                                    <div className="flex gap-2 mt-1">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => window.open(`/api/insurance-cards/${card.id}/attachment/download`, '_blank')}
                                      >
                                        <ExternalLink className="mr-2 h-4 w-4" />
                                        プレビュー
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          window.location.href = `/api/insurance-cards/${card.id}/attachment/download?download=true`;
                                        }}
                                      >
                                        <Download className="mr-2 h-4 w-4" />
                                        ダウンロード
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={async () => {
                                          if (!confirm('添付ファイルを削除してもよろしいですか？')) return

                                          try {
                                            const response = await fetch(`/api/insurance-cards/${card.id}/attachment`, {
                                              method: 'DELETE'
                                            })
                                            if (!response.ok) throw new Error('削除に失敗しました')

                                            toast({
                                              title: "削除完了",
                                              description: "添付ファイルを削除しました"
                                            })

                                            queryClient.invalidateQueries({ queryKey: ["/api/insurance-cards", id] })
                                          } catch (error) {
                                            toast({
                                              title: "エラー",
                                              description: "削除中にエラーが発生しました",
                                              variant: "destructive"
                                            })
                                          }
                                        }}
                                      >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        削除
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                            {!isHeadquarters && (
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
                            )}
                          </div>
                        </div>
                      )
                    })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Phase 3: 公費負担医療情報セクション */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    公費負担医療情報
                  </CardTitle>
                  <CardDescription>生活保護・難病医療費助成などの公費情報（最大4件）</CardDescription>
                </div>
                {!isHeadquarters && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingPublicExpense(null)
                      setPublicExpenseDialogOpen(true)
                    }}
                  >
                    <FilePlus className="mr-2 h-4 w-4" />
                    新規登録
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isPublicExpenseLoading ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">公費情報を読み込んでいます...</p>
                </div>
              ) : publicExpenseCards.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="mx-auto h-12 w-12 text-muted-foreground opacity-50 mb-4" />
                  <p className="text-muted-foreground">公費負担医療が登録されていません</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {publicExpenseCards.map((card) => {
                    const isValid = !card.validUntil || new Date(card.validUntil) >= new Date();
                    const priorityLabel = ['第一公費', '第二公費', '第三公費', '第四公費'][card.priority - 1];

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
                              <Badge variant="default">
                                {priorityLabel}（優先順位{card.priority}）
                              </Badge>
                              <Badge variant="secondary">
                                法別{card.legalCategoryNumber}
                              </Badge>
                              {!isValid && (
                                <Badge variant="destructive">期限切れ</Badge>
                              )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <p className="text-sm text-muted-foreground">負担者番号</p>
                                <p className="font-medium">{card.beneficiaryNumber}</p>
                              </div>
                              {card.recipientNumber && (
                                <div>
                                  <p className="text-sm text-muted-foreground">受給者番号</p>
                                  <p className="font-medium">{card.recipientNumber}</p>
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
                              {card.notes && (
                                <div className="md:col-span-2">
                                  <p className="text-sm text-muted-foreground">備考</p>
                                  <p className="text-sm">{card.notes}</p>
                                </div>
                              )}
                            </div>
                          </div>
                          {!isHeadquarters && (
                            <div className="flex flex-col gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setEditingPublicExpense(card)
                                  setPublicExpenseDialogOpen(true)
                                }}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={async () => {
                                  if (!confirm('この公費情報を削除してもよろしいですか？')) return
                                  try {
                                    const response = await fetch(`/api/public-expense-cards/${card.id}`, {
                                      method: 'DELETE',
                                    })
                                    if (!response.ok) throw new Error('削除に失敗しました')
                                    toast({
                                      title: "削除完了",
                                      description: "公費情報を削除しました",
                                    })
                                    queryClient.invalidateQueries({ queryKey: ["public-expense-cards", id] })
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
                          )}
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
                    .sort((a, b) => {
                      const aDate = new Date((a as any).visitDate || a.actualStartTime || a.recordDate)
                      const bDate = new Date((b as any).visitDate || b.actualStartTime || b.recordDate)
                      return bDate.getTime() - aDate.getTime()
                    })
                    .map((record) => (
                      <div
                        key={record.id}
                        onClick={() => {
                          const currentPath = `${basePath}/patients/${id}`
                          setLocation(`${basePath}/records?recordId=${record.id}&returnTo=${encodeURIComponent(currentPath)}`)
                        }}
                        className="border rounded-lg p-4 hover:bg-accent transition-colors cursor-pointer"
                      >
                        <div className="flex items-start justify-between">
                          <div className="space-y-2 flex-1">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              <p className="font-medium">
                                {new Date((record as any).visitDate || record.actualStartTime || record.recordDate).toLocaleDateString('ja-JP', {
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
          {/* Service Care Plans (居宅サービス計画書) */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>居宅サービス計画書（ケアプラン）</CardTitle>
                  <CardDescription>ケアマネージャーが作成する総合的な介護計画</CardDescription>
                </div>
                {!isHeadquarters && (
                  <Button
                    onClick={() => {
                      setEditingServiceCarePlan(null)
                      setServiceCarePlanDialogOpen(true)
                    }}
                    size="sm"
                  >
                    <FilePlus className="mr-2 h-4 w-4" />
                    新規作成
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isServiceCarePlansLoading ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">読み込み中...</p>
                </div>
              ) : serviceCarePlans.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="mx-auto h-12 w-12 text-muted-foreground opacity-50 mb-4" />
                  <p className="text-muted-foreground">居宅サービス計画書が登録されていません</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {serviceCarePlans.map((plan) => (
                    <div key={plan.id} className="border rounded-lg p-4 hover:bg-accent transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">
                              {plan.planType === 'initial' ? '初回' : plan.planType === 'update' ? '更新' : '変更'}
                            </Badge>
                            {plan.planNumber && (
                              <span className="text-sm font-medium">計画書番号: {plan.planNumber}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span>作成日: {plan.planDate}</span>
                            {plan.certificationPeriodStart && plan.certificationPeriodEnd && (
                              <span>認定期間: {plan.certificationPeriodStart} 〜 {plan.certificationPeriodEnd}</span>
                            )}
                          </div>
                          {plan.userIntention && (
                            <div className="mt-2">
                              <p className="text-xs text-muted-foreground">利用者の意向</p>
                              <p className="text-sm">{plan.userIntention}</p>
                            </div>
                          )}
                          {plan.filePath && (
                            <div className="mt-2 flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => window.open(`/api/service-care-plans/${plan.id}/attachment/download`, '_blank')}
                              >
                                <ExternalLink className="mr-1 h-3 w-3" />
                                プレビュー
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  window.location.href = `/api/service-care-plans/${plan.id}/attachment/download?download=true`
                                }}
                              >
                                <Download className="mr-1 h-3 w-3" />
                                ダウンロード
                              </Button>
                            </div>
                          )}
                        </div>
                        {!isHeadquarters && (
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setEditingServiceCarePlan(plan)
                                setServiceCarePlanDialogOpen(true)
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={async () => {
                                if (!confirm('この居宅サービス計画書を削除してもよろしいですか？')) return
                                try {
                                  const response = await fetch(`/api/service-care-plans/${plan.id}`, {
                                    method: 'DELETE',
                                  })
                                  if (!response.ok) throw new Error('削除に失敗しました')
                                  toast({ description: "居宅サービス計画書を削除しました" })
                                  queryClient.invalidateQueries({ queryKey: ["/api/service-care-plans", id] })
                                } catch (error) {
                                  toast({ variant: "destructive", description: "削除に失敗しました" })
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Nursing Care Plans (訪問看護計画書) */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>訪問看護計画書</CardTitle>
                  <CardDescription>訪問看護ステーションが作成する看護計画</CardDescription>
                </div>
                {!isHeadquarters && (
                  <Button
                    onClick={() => {
                      setEditingCarePlan(null)
                      setCarePlanDialogOpen(true)
                    }}
                    size="sm"
                  >
                    <FilePlus className="mr-2 h-4 w-4" />
                    新規作成
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isNursingCarePlansLoading ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">読み込み中...</p>
                </div>
              ) : nursingCarePlans.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="mx-auto h-12 w-12 text-muted-foreground opacity-50 mb-4" />
                  <p className="text-muted-foreground">訪問看護計画書が登録されていません</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {nursingCarePlans.map((plan) => (
                    <div key={plan.id} className="border rounded-lg p-4 hover:bg-accent transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-2">
                            {plan.planNumber && (
                              <span className="text-sm font-medium">計画書番号: {plan.planNumber}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span>計画日: {plan.planDate}</span>
                            <span>期間: {plan.planPeriodStart} 〜 {plan.planPeriodEnd}</span>
                          </div>
                          {plan.nursingGoals && (
                            <div className="mt-2">
                              <p className="text-xs text-muted-foreground">看護目標</p>
                              <p className="text-sm">{plan.nursingGoals}</p>
                            </div>
                          )}
                          {plan.filePath && (
                            <div className="mt-2 flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => window.open(`/api/care-plans/${plan.id}/attachment/download`, '_blank')}
                              >
                                <ExternalLink className="mr-1 h-3 w-3" />
                                プレビュー
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  window.location.href = `/api/care-plans/${plan.id}/attachment/download?download=true`
                                }}
                              >
                                <Download className="mr-1 h-3 w-3" />
                                ダウンロード
                              </Button>
                            </div>
                          )}
                        </div>
                        {!isHeadquarters && (
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setEditingCarePlan(plan)
                                setCarePlanDialogOpen(true)
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={async () => {
                                if (!confirm('この訪問看護計画書を削除してもよろしいですか？')) return
                                try {
                                  const response = await fetch(`/api/care-plans/${plan.id}`, {
                                    method: 'DELETE',
                                  })
                                  if (!response.ok) throw new Error('削除に失敗しました')
                                  toast({ description: "訪問看護計画書を削除しました" })
                                  queryClient.invalidateQueries({ queryKey: ["/api/care-plans", id] })
                                } catch (error) {
                                  toast({ variant: "destructive", description: "削除に失敗しました" })
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Contracts (契約書・同意書) */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>契約書・同意書</CardTitle>
                  <CardDescription>サービス利用契約書、重要事項説明書、同意書等</CardDescription>
                </div>
                {!isHeadquarters && (
                  <Button
                    onClick={() => {
                      setEditingContract(null)
                      setContractDialogOpen(true)
                    }}
                    size="sm"
                  >
                    <FilePlus className="mr-2 h-4 w-4" />
                    新規作成
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isContractsLoading ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">読み込み中...</p>
                </div>
              ) : contracts.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="mx-auto h-12 w-12 text-muted-foreground opacity-50 mb-4" />
                  <p className="text-muted-foreground">契約書・同意書が登録されていません</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {contracts.map((contract) => {
                    const contractTypeLabels: Record<string, string> = {
                      service_agreement: "サービス利用契約書",
                      important_matters: "重要事項説明書",
                      personal_info_consent: "個人情報利用同意書",
                      medical_consent: "医療行為同意書",
                      other: "その他"
                    }
                    const witnessUser = users.find((u: any) => u.id === contract.witnessedBy)
                    return (
                      <div key={contract.id} className="border rounded-lg p-4 hover:bg-accent transition-colors">
                        <div className="flex items-start justify-between">
                          <div className="space-y-2 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{contractTypeLabels[contract.contractType] || contract.contractType}</span>
                              <span className="text-sm text-muted-foreground">-</span>
                              <span className="text-sm font-medium">{contract.title}</span>
                            </div>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <span>契約日: {contract.contractDate}</span>
                              <span>有効期間: {contract.startDate} 〜 {contract.endDate || "無期限"}</span>
                            </div>
                            {contract.signedBy && (
                              <div className="mt-2">
                                <p className="text-xs text-muted-foreground">署名者</p>
                                <p className="text-sm">{contract.signedBy}</p>
                              </div>
                            )}
                            {witnessUser && (
                              <div className="mt-2">
                                <p className="text-xs text-muted-foreground">立会人</p>
                                <p className="text-sm">{witnessUser.fullName}</p>
                              </div>
                            )}
                            {contract.description && (
                              <div className="mt-2">
                                <p className="text-xs text-muted-foreground">説明・備考</p>
                                <p className="text-sm whitespace-pre-wrap">{contract.description}</p>
                              </div>
                            )}
                            {contract.filePath && (
                              <div className="mt-2 flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => window.open(`/api/contracts/${contract.id}/attachment/download`, '_blank')}
                                >
                                  <ExternalLink className="mr-1 h-3 w-3" />
                                  プレビュー
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    window.location.href = `/api/contracts/${contract.id}/attachment/download?download=true`
                                  }}
                                >
                                  <Download className="mr-1 h-3 w-3" />
                                  ダウンロード
                                </Button>
                              </div>
                            )}
                          </div>
                          {!isHeadquarters && (
                            <div className="flex gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setEditingContract(contract)
                                  setContractDialogOpen(true)
                                }}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={async () => {
                                  if (!confirm('この契約書・同意書を削除してもよろしいですか？')) return
                                  try {
                                    const response = await fetch(`/api/contracts/${contract.id}`, {
                                      method: 'DELETE',
                                    })
                                    if (!response.ok) throw new Error('削除に失敗しました')
                                    toast({ description: "契約書・同意書を削除しました" })
                                    queryClient.invalidateQueries({ queryKey: ["/api/contracts", id] })
                                  } catch (error) {
                                    toast({ variant: "destructive", description: "削除に失敗しました" })
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
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

      {/* Phase 3: Public Expense Card Dialog */}
      <PublicExpenseCardDialog
        open={publicExpenseDialogOpen}
        onOpenChange={setPublicExpenseDialogOpen}
        patientId={id!}
        facilityId={patientData?.facilityId || ''}
        editingCard={editingPublicExpense}
        existingCards={publicExpenseCards}
      />

      {/* Service Care Plan Dialog */}
      <ServiceCarePlanDialog
        open={serviceCarePlanDialogOpen}
        onOpenChange={setServiceCarePlanDialogOpen}
        patientId={id!}
        plan={editingServiceCarePlan}
      />

      {/* Care Plan Dialog */}
      <CarePlanDialog
        open={carePlanDialogOpen}
        onOpenChange={setCarePlanDialogOpen}
        patientId={id!}
        plan={editingCarePlan}
      />

      {/* Contract Dialog */}
      <ContractDialog
        open={contractDialogOpen}
        onOpenChange={setContractDialogOpen}
        patientId={id!}
        contract={editingContract}
      />

      {/* Patient Form Dialog */}
      <PatientForm
        isOpen={isPatientFormOpen}
        onClose={() => setIsPatientFormOpen(false)}
        patient={patient}
        mode="edit"
      />
    </div>
  )
}
