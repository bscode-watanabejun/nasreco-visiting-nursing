import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useLocation } from "wouter"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Users,
  Calendar,
  ClipboardList,
  AlertTriangle,
  Plus,
  Clock,
  CheckCircle,
  User,
  Bell
} from "lucide-react"
import type { Schedule, Patient, User as UserType, PaginatedResult } from "@shared/schema"

interface PatientVisit {
  id: string
  patientName: string
  time: string
  type: string
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
  nurse: string
}

// Helper function to get full name
const getFullName = (patient: Patient): string => {
  return `${patient.lastName} ${patient.firstName}`
}

// Helper function to format time
const formatTime = (date: Date | string): string => {
  const d = new Date(date)
  return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'completed': return 'bg-green-100 text-green-800 border-green-200'
    case 'in_progress': return 'bg-orange-100 text-orange-800 border-orange-200'
    case 'scheduled': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
    case 'cancelled': return 'bg-gray-100 text-gray-800 border-gray-200'
    default: return 'bg-gray-100 text-gray-800 border-gray-200'
  }
}

const getCardStatusColor = (status: string) => {
  switch (status) {
    case 'completed': return 'bg-green-50 border-green-200 hover:bg-green-100'
    case 'in_progress': return 'bg-orange-50 border-orange-200 hover:bg-orange-100'
    case 'scheduled': return 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100'
    case 'cancelled': return 'bg-gray-50 border-gray-200 hover:bg-gray-100'
    default: return 'bg-gray-50 border-gray-200 hover:bg-gray-100'
  }
}

const getStatusText = (status: string) => {
  switch (status) {
    case 'completed': return '完了'
    case 'in_progress': return '実施中'
    case 'scheduled': return '予定'
    case 'cancelled': return 'キャンセル'
    default: return status
  }
}

export function Dashboard() {
  const queryClient = useQueryClient()
  const [, setLocation] = useLocation()
  const today = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  })

  // Fetch today's schedules
  const { data: schedulesData, isLoading: schedulesLoading } = useQuery<PaginatedResult<Schedule>>({
    queryKey: ["todaySchedules"],
    queryFn: async () => {
      const today = new Date()
      const startOfDay = new Date(today.setHours(0, 0, 0, 0))
      const endOfDay = new Date(today.setHours(23, 59, 59, 999))

      const response = await fetch(
        `/api/schedules?startDate=${startOfDay.toISOString()}&endDate=${endOfDay.toISOString()}&limit=100`
      )
      if (!response.ok) throw new Error("スケジュールデータの取得に失敗しました")
      return response.json()
    },
    staleTime: 0, // Always fetch fresh data on mount
    refetchOnMount: true, // Refetch when component mounts
  })

  // Fetch patients
  const { data: patientsData } = useQuery<PaginatedResult<Patient>>({
    queryKey: ["patients"],
    queryFn: async () => {
      const response = await fetch("/api/patients")
      if (!response.ok) throw new Error("患者データの取得に失敗しました")
      return response.json()
    },
  })

  // Fetch users (nurses)
  const { data: usersData } = useQuery<PaginatedResult<UserType>>({
    queryKey: ["users"],
    queryFn: async () => {
      const response = await fetch("/api/users")
      if (!response.ok) throw new Error("ユーザーデータの取得に失敗しました")
      return response.json()
    },
  })

  // Fetch schedules without records (last 7 days)
  const { data: schedulesWithoutRecords } = useQuery<any[]>({
    queryKey: ["/api/schedules/without-records"],
    queryFn: async () => {
      const today = new Date();
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(today.getDate() - 7);

      const params = new URLSearchParams({
        startDate: sevenDaysAgo.toISOString().split('T')[0],
        endDate: today.toISOString().split('T')[0]
      });

      const response = await fetch(`/api/schedules/without-records?${params}`)
      if (!response.ok) throw new Error("記録未作成スケジュールの取得に失敗しました")
      return response.json()
    },
  })

  // Fetch contracts expiring soon
  const { data: contractsData } = useQuery<any[]>({
    queryKey: ["/api/contracts"],
    queryFn: async () => {
      const response = await fetch("/api/contracts")
      if (!response.ok) throw new Error("契約書データの取得に失敗しました")
      return response.json()
    },
  })

  // Fetch expiring doctor orders (within 30 days)
  const { data: expiringDoctorOrders } = useQuery<any[]>({
    queryKey: ["/api/doctor-orders/expiring"],
    queryFn: async () => {
      const response = await fetch("/api/doctor-orders/expiring")
      if (!response.ok) throw new Error("期限切れ間近の訪問看護指示書の取得に失敗しました")
      return response.json()
    },
  })

  // Fetch expiring insurance cards (within 30 days)
  const { data: expiringInsuranceCards } = useQuery<any[]>({
    queryKey: ["/api/insurance-cards/expiring"],
    queryFn: async () => {
      const response = await fetch("/api/insurance-cards/expiring")
      if (!response.ok) throw new Error("期限切れ間近の保険証の取得に失敗しました")
      return response.json()
    },
  })

  // Fetch recent nursing records
  const { data: recentRecordsData } = useQuery<any[]>({
    queryKey: ["/api/nursing-records/recent"],
    queryFn: async () => {
      const response = await fetch("/api/nursing-records?limit=5&sortBy=recordDate&sortOrder=desc")
      if (!response.ok) throw new Error("最近の記録の取得に失敗しました")
      const result = await response.json()
      return result.data || []
    },
  })

  // Fetch critical patients
  const { data: criticalPatientsData } = useQuery<Patient[]>({
    queryKey: ["/api/patients/critical"],
    queryFn: async () => {
      const response = await fetch("/api/patients?isCritical=true")
      if (!response.ok) throw new Error("要注意患者の取得に失敗しました")
      const result = await response.json()
      return result.data || []
    },
  })

  const schedules = schedulesData?.data || []
  const patients = patientsData?.data || []
  const users = usersData?.data || []
  const pendingRecordsCount = schedulesWithoutRecords?.length || 0
  const recentRecords = recentRecordsData || []
  const criticalPatients = criticalPatientsData || []

  // Calculate expiring contracts (within 30 days or already expired)
  const nowDate = new Date()
  const thirtyDaysLater = new Date(nowDate)
  thirtyDaysLater.setDate(nowDate.getDate() + 30)

  const expiringContracts = (contractsData || []).filter((contract: any) => {
    if (!contract.endDate) return false
    const endDate = new Date(contract.endDate)
    return endDate <= thirtyDaysLater
  })

  const expiredContracts = (contractsData || []).filter((contract: any) => {
    if (!contract.endDate) return false
    const endDate = new Date(contract.endDate)
    return endDate < nowDate
  })

  // Mutation for updating schedule status
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await fetch(`/api/schedules/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      if (!response.ok) {
        throw new Error("ステータス更新に失敗しました")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todaySchedules"] })
      queryClient.invalidateQueries({ queryKey: ["schedules"] })
    },
  })

  // Convert schedules to PatientVisit format
  const visits: PatientVisit[] = schedules
    .sort((a, b) => new Date(a.scheduledStartTime).getTime() - new Date(b.scheduledStartTime).getTime())
    .map((schedule) => {
      const patient = patients.find(p => p.id === schedule.patientId)
      const nurse = users.find(u => u.id === schedule.nurseId)

      return {
        id: schedule.id,
        patientName: patient ? getFullName(patient) : '患者不明',
        time: formatTime(schedule.scheduledStartTime),
        type: schedule.visitType || schedule.purpose,
        status: schedule.status || 'scheduled',
        nurse: nurse?.fullName || schedule.demoStaffName || 'スタッフ未割当',
      }
    })

  // Handler functions
  const handleStartVisit = (scheduleId: string) => {
    updateStatusMutation.mutate({ id: scheduleId, status: "in_progress" })
  }

  const handleCompleteVisit = (scheduleId: string) => {
    // Navigate to nursing records page with schedule ID
    setLocation(`/records?mode=create&scheduleId=${scheduleId}`)
  }

  const handleCreateNewRecord = () => {
    // Navigate to nursing records page for new record
    setLocation('/records?mode=create')
  }

  const completedVisits = visits.filter(v => v.status === 'completed').length
  const totalVisits = visits.length

  return (
    <div className="w-full max-w-full space-y-4 p-4 overflow-x-hidden">
      {/* Header */}
      <div className="space-y-3 sm:space-y-0">
        <div className="sm:flex sm:items-center sm:justify-between sm:gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">
              ダッシュボード
            </h1>
            <p className="text-sm text-muted-foreground mt-1">本日は{today}です。</p>
          </div>

          {/* Desktop buttons */}
          <div className="hidden sm:flex flex-col sm:flex-row gap-2 sm:gap-2 flex-shrink-0">
            <Button
              className="w-full sm:w-auto bg-orange-500 hover:bg-orange-600 text-white border-orange-600"
              data-testid="button-new-record"
              onClick={handleCreateNewRecord}
            >
              <Plus className="mr-2 h-4 w-4" />
              新規記録登録
            </Button>
          </div>
        </div>

        {/* Action buttons row - Mobile only */}
        <div className="flex items-center gap-3 sm:hidden">
          <Button
            variant="ghost"
            size="sm"
            className="flex items-center gap-1 px-3 py-1.5"
            data-testid="button-notifications"
          >
            <Bell className="h-4 w-4" />
            <span className="text-sm">通知</span>
            <Badge className="ml-1 bg-orange-500 text-white px-1.5 py-0 h-5 rounded-full text-xs">3</Badge>
          </Button>
          <Button
            size="sm"
            className="ml-auto bg-orange-500 hover:bg-orange-600 text-white px-4 py-1.5"
            data-testid="button-new-record"
            onClick={handleCreateNewRecord}
          >
            <Plus className="mr-1 h-4 w-4" />
            新規記録登録
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-2 sm:gap-3 grid-cols-2 sm:grid-cols-4">
        <Card className="p-3 sm:p-auto">
          <div className="flex flex-col sm:block">
            <div className="flex items-center justify-between mb-2 sm:hidden">
              <span className="text-xs text-muted-foreground">本日の訪問予定</span>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardHeader className="hidden sm:flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">本日の訪問</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="sm:pt-0">
              <div className="text-2xl font-bold">{totalVisits}件</div>
              <p className="text-xs text-muted-foreground mt-1 sm:mt-0">
                <span className="sm:hidden">残り {totalVisits - completedVisits} 件</span>
                <span className="hidden sm:inline">完了: {completedVisits}件</span>
              </p>
            </CardContent>
          </div>
        </Card>

        <Card className="p-3 sm:p-auto">
          <div className="flex flex-col sm:block">
            <div className="flex items-center justify-between mb-2 sm:hidden">
              <span className="text-xs text-muted-foreground">担当患者数</span>
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardHeader className="hidden sm:flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">担当患者</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="sm:pt-0">
              <div className="text-xl sm:text-2xl font-bold">
                <span className="sm:hidden">12名</span>
                <span className="hidden sm:inline">28名</span>
              </div>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 sm:mt-0">
                <span className="sm:hidden">+2名</span>
                <span className="hidden sm:inline">先月比 +3名</span>
              </p>
            </CardContent>
          </div>
        </Card>

        <Card className="p-3 sm:p-auto">
          <div className="flex flex-col sm:block">
            <div className="flex items-center justify-between mb-2 sm:hidden">
              <span className="text-xs text-muted-foreground">未完了の記録</span>
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardHeader className="hidden sm:flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">未完了記録</CardTitle>
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="sm:pt-0">
              <div className="text-xl sm:text-2xl font-bold">{pendingRecordsCount}件</div>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 sm:mt-0">
                <span className="sm:hidden">7日間</span>
                <span className="hidden sm:inline">過去7日間の記録未作成</span>
              </p>
            </CardContent>
          </div>
        </Card>

        <Card className="p-3 sm:p-auto">
          <div className="flex flex-col sm:block">
            <div className="flex items-center justify-between mb-2 sm:hidden">
              <span className="text-xs text-muted-foreground">要注意アラート</span>
              <AlertTriangle className="h-4 w-4 text-orange-500" />
            </div>
            <CardHeader className="hidden sm:flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">重要アラート</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent className="sm:pt-0">
              <div className="text-xl sm:text-2xl font-bold text-orange-500 sm:text-destructive">
                {(pendingRecordsCount + expiredContracts.length + (expiringDoctorOrders?.length || 0) + (expiringInsuranceCards?.length || 0))}件
              </div>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 sm:mt-0 line-clamp-2 sm:line-clamp-none">
                記録: {pendingRecordsCount} / 契約: {expiredContracts.length}
                {(expiringDoctorOrders?.length || 0) > 0 && <span> / 指示書: {expiringDoctorOrders?.length}</span>}
                {(expiringInsuranceCards?.length || 0) > 0 && <span className="hidden sm:inline"> / 保険証: {expiringInsuranceCards?.length}</span>}
              </p>
            </CardContent>
          </div>
        </Card>
      </div>

      {/* Expiring Doctor Orders Alert */}
      {(expiringDoctorOrders?.length || 0) > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader className="pb-3 sm:pb-6">
            <CardTitle className="text-sm sm:text-base text-red-900 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
              <span className="line-clamp-1">訪問看護指示書有効期限アラート</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs sm:text-sm text-red-800">
              30日以内に有効期限が切れる訪問看護指示書があります。医師に更新依頼をお願いします。
            </p>
            <div className="space-y-2">
              {(expiringDoctorOrders || []).slice(0, 5).map((order: any) => {
                const endDate = new Date(order.endDate)
                const isExpired = endDate < nowDate
                const daysUntilExpiry = Math.ceil((endDate.getTime() - nowDate.getTime()) / (1000 * 60 * 60 * 24))
                const patient = order.patient || patients.find((p: Patient) => p.id === order.patientId)
                const patientName = patient ? getFullName(patient) : '患者不明'

                return (
                  <div
                    key={order.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-2 sm:p-3 bg-white rounded border border-red-200 hover:bg-red-50 cursor-pointer transition-colors"
                    onClick={() => setLocation(`/patients/${order.patientId}`)}
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-xs sm:text-sm truncate">利用者: {patientName}</p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                        医師: {order.medicalInstitution?.doctorName || '不明'}
                      </p>
                    </div>
                    <div className="text-left sm:text-right flex-shrink-0">
                      <p className={`text-xs sm:text-sm font-medium ${isExpired ? 'text-red-600' : 'text-red-700'}`}>
                        {isExpired ? '期限切れ' : `残り${daysUntilExpiry}日`}
                      </p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground">
                        {endDate.toLocaleDateString('ja-JP')}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
            {(expiringDoctorOrders?.length || 0) > 5 && (
              <p className="text-[10px] sm:text-xs text-red-700">
                他 {(expiringDoctorOrders?.length || 0) - 5}件の指示書が期限間近です
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Expiring Insurance Cards Alert */}
      {(expiringInsuranceCards?.length || 0) > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader className="pb-3 sm:pb-6">
            <CardTitle className="text-sm sm:text-base text-orange-900 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
              <span className="line-clamp-1">保険証有効期限アラート</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs sm:text-sm text-orange-800">
              30日以内に有効期限が切れる保険証があります。利用者・ご家族に更新確認をお願いします。
            </p>
            <div className="space-y-2">
              {(expiringInsuranceCards || []).slice(0, 5).map((card: any) => {
                const validUntil = new Date(card.validUntil)
                const isExpired = validUntil < nowDate
                const daysUntilExpiry = Math.ceil((validUntil.getTime() - nowDate.getTime()) / (1000 * 60 * 60 * 24))
                const patient = card.patient || patients.find((p: Patient) => p.id === card.patientId)
                const patientName = patient ? getFullName(patient) : '患者不明'
                const cardTypeName = card.cardType === 'medical' ? '医療保険証' : '介護保険証'

                return (
                  <div
                    key={card.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-2 sm:p-3 bg-white rounded border border-orange-200 hover:bg-orange-50 cursor-pointer transition-colors"
                    onClick={() => setLocation(`/patients/${card.patientId}`)}
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-xs sm:text-sm truncate">利用者: {patientName}</p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                        {cardTypeName} (保険者番号: {card.insurerNumber})
                      </p>
                    </div>
                    <div className="text-left sm:text-right flex-shrink-0">
                      <p className={`text-xs sm:text-sm font-medium ${isExpired ? 'text-red-600' : 'text-orange-700'}`}>
                        {isExpired ? '期限切れ' : `残り${daysUntilExpiry}日`}
                      </p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground">
                        {validUntil.toLocaleDateString('ja-JP')}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
            {(expiringInsuranceCards?.length || 0) > 5 && (
              <p className="text-[10px] sm:text-xs text-orange-700">
                他 {(expiringInsuranceCards?.length || 0) - 5}件の保険証が期限間近です
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Expiring Contracts Alert */}
      {expiringContracts.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader className="pb-3 sm:pb-6">
            <CardTitle className="text-sm sm:text-base text-yellow-900 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
              <span className="line-clamp-1">契約書有効期限アラート</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs sm:text-sm text-yellow-800">
              30日以内に有効期限が切れる契約書があります。更新手続きをご確認ください。
            </p>
            <div className="space-y-2">
              {expiringContracts.slice(0, 5).map((contract: any) => {
                const endDate = new Date(contract.endDate)
                const isExpired = endDate < nowDate
                const daysUntilExpiry = Math.ceil((endDate.getTime() - nowDate.getTime()) / (1000 * 60 * 60 * 24))
                const patient = contract.patient || patients.find((p: Patient) => p.id === contract.patientId)
                const patientName = patient ? getFullName(patient) : '患者不明'

                return (
                  <div
                    key={contract.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-2 sm:p-3 bg-white rounded border border-yellow-200 hover:bg-yellow-50 cursor-pointer transition-colors"
                    onClick={() => setLocation(`/contracts?patientId=${contract.patientId}`)}
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-xs sm:text-sm truncate">{contract.title}</p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground truncate">利用者: {patientName}</p>
                    </div>
                    <div className="text-left sm:text-right flex-shrink-0">
                      <p className={`text-xs sm:text-sm font-medium ${isExpired ? 'text-red-600' : 'text-yellow-700'}`}>
                        {isExpired ? '期限切れ' : `残り${daysUntilExpiry}日`}
                      </p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground">
                        {endDate.toLocaleDateString('ja-JP')}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
            {expiringContracts.length > 5 && (
              <p className="text-[10px] sm:text-xs text-yellow-700">
                他 {expiringContracts.length - 5}件の契約書が期限間近です
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quick Navigation Tabs - Mobile */}
      <div className="flex justify-center gap-6 py-2 sm:hidden">
        <button className="text-sm text-muted-foreground hover:text-primary">訪問スケジュール</button>
        <button className="text-sm text-muted-foreground hover:text-primary">要注意患者</button>
        <button className="text-sm text-muted-foreground hover:text-primary">最近の記録</button>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="visits" className="space-y-4">
        <TabsList className="hidden sm:grid w-full grid-cols-3 h-10">
          <TabsTrigger value="visits" data-testid="tab-visits">本日の訪問</TabsTrigger>
          <TabsTrigger value="alerts" data-testid="tab-alerts">要注意患者</TabsTrigger>
          <TabsTrigger value="recent" data-testid="tab-recent">最近の記録</TabsTrigger>
        </TabsList>

        <TabsContent value="visits" className="space-y-3">
          <div>
            <h2 className="text-lg font-bold mb-1">本日の訪問スケジュール</h2>
            <p className="text-xs text-muted-foreground mb-3">{today}の訪問予定です</p>
          </div>
          {schedulesLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600 mx-auto mb-4"></div>
              <p className="text-muted-foreground">読み込み中...</p>
            </div>
          ) : visits.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>本日の訪問予定はありません</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visits.map((visit) => (
              <div key={visit.id} className={`p-3 sm:p-4 rounded-lg transition-colors ${getCardStatusColor(visit.status)}`}>
                {/* Mobile layout */}
                <div className="sm:hidden">
                  <Card className={`p-4 ${visit.status === 'in_progress' ? 'border-orange-200 bg-orange-50' : ''}`}>
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg font-bold">{visit.time}</span>
                            <span className="text-sm font-medium">{visit.patientName}</span>
                            <span className="text-xs px-2 py-0.5 bg-gray-100 rounded text-muted-foreground">
                              {visit.id === '1' ? '68歳' : visit.id === '2' ? '75歳' : visit.id === '3' ? '82歳' : '73歳'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{visit.id === '1' || visit.id === '3' ? '60分' : '45分'}</span>
                            <span>·</span>
                            <span>{visit.type}</span>
                          </div>
                        </div>
                        {visit.status === 'completed' && (
                          <span className="text-xs text-green-600 font-medium">完了</span>
                        )}
                        {visit.status === 'in_progress' && (
                          <span className="text-xs text-orange-600 font-medium">実施中</span>
                        )}
                        {visit.status === 'scheduled' && (
                          <span className="text-xs text-yellow-600 font-medium">予定</span>
                        )}
                      </div>

                      {visit.status === 'scheduled' && (
                        <Button
                          size="sm"
                          className="w-full bg-yellow-500 hover:bg-yellow-600 text-white"
                          data-testid={`button-start-visit-${visit.id}`}
                          onClick={() => handleStartVisit(visit.id)}
                        >
                          <Clock className="mr-1 h-3 w-3" />
                          開始
                        </Button>
                      )}
                      {visit.status === 'in_progress' && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            data-testid={`button-detail-visit-${visit.id}`}
                          >
                            詳細
                          </Button>
                          <Button
                            size="sm"
                            className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
                            data-testid={`button-complete-visit-${visit.id}`}
                            onClick={() => handleCompleteVisit(visit.id)}
                          >
                            記録
                          </Button>
                        </div>
                      )}

                      {(visit.status === 'scheduled' || visit.status === 'in_progress') && (
                        <div className="text-xs text-muted-foreground">
                          備考: {visit.id === '1' ? '定期訪問 - バイタルチェックと服薬確認' :
                                 visit.id === '2' ? 'アセスメント訪問 - 状態評価と計画見直し' :
                                 visit.id === '3' ? '定期訪問 - 創傷処置' :
                                 '定期訪問 - バイタルチェックと服薬確認'}
                        </div>
                      )}
                    </div>
                  </Card>
                </div>

                {/* Desktop layout */}
                <div className="hidden sm:flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="text-center min-w-[4rem]">
                      <div className="font-semibold">{visit.time}</div>
                      <div className="text-xs text-muted-foreground">{visit.type}</div>
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-semibold">{visit.patientName}</h4>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <User className="h-3 w-3" />
                        {visit.nurse}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge className={getStatusColor(visit.status)}>
                      {getStatusText(visit.status)}
                    </Badge>
                    {visit.status === 'scheduled' && (
                      <Button
                        size="sm"
                        className="bg-yellow-500 hover:bg-yellow-600 text-white border-yellow-600"
                        data-testid={`button-start-visit-${visit.id}`}
                        onClick={() => handleStartVisit(visit.id)}
                      >
                        <Clock className="mr-1 h-3 w-3" />
                        開始
                      </Button>
                    )}
                    {visit.status === 'in_progress' && (
                      <Button
                        size="sm"
                        className="bg-orange-500 hover:bg-orange-600 text-white border-orange-600"
                        data-testid={`button-complete-visit-${visit.id}`}
                        onClick={() => handleCompleteVisit(visit.id)}
                      >
                        <CheckCircle className="mr-1 h-3 w-3" />
                        記録
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="alerts">
          <Card>
            <CardHeader>
              <CardTitle>要注意患者</CardTitle>
              <CardDescription>重点的な観察が必要な利用者</CardDescription>
            </CardHeader>
            <CardContent>
              {criticalPatients.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertTriangle className="mx-auto h-12 w-12 mb-4 opacity-50" />
                  <p>現在、要注意患者はいません</p>
                </div>
              ) : (
                <div className="space-y-3 sm:space-y-4">
                  {criticalPatients.map((patient) => (
                    <div
                      key={patient.id}
                      className="flex items-start gap-3 p-3 border rounded-lg border-destructive/20 bg-destructive/5 hover:bg-destructive/10 cursor-pointer transition-colors"
                      onClick={() => setLocation(`/patients/${patient.id}`)}
                    >
                      <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm sm:text-base truncate">
                          {getFullName(patient)}
                        </p>
                        <p className="text-xs sm:text-sm text-muted-foreground">
                          {patient.careNotes || '重点的な観察が必要な利用者です'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recent">
          <Card>
            <CardHeader>
              <CardTitle>最近の記録</CardTitle>
              <CardDescription>直近の訪問記録一覧</CardDescription>
            </CardHeader>
            <CardContent>
              {recentRecords.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <ClipboardList className="mx-auto h-12 w-12 mb-4 opacity-50" />
                  <p>記録がありません</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentRecords.map((record: any) => {
                    const patient = patients.find((p: Patient) => p.id === record.patientId)
                    const patientName = patient ? getFullName(patient) : '患者不明'
                    const recordDate = new Date(record.recordDate)
                    const formattedDate = recordDate.toLocaleString('ja-JP', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    })
                    const statusText = getStatusText(record.status)

                    return (
                      <div
                        key={record.id}
                        className="flex items-center justify-between gap-3 p-3 border rounded-lg hover:bg-accent cursor-pointer transition-colors"
                        onClick={() => setLocation(`/records?id=${record.id}`)}
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-sm sm:text-base truncate">{patientName}</p>
                          <p className="text-xs sm:text-sm text-muted-foreground">
                            {formattedDate} - {record.title || '訪問記録'}
                          </p>
                        </div>
                        <Badge className={`${getStatusColor(record.status)} flex-shrink-0 text-xs`}>
                          {statusText}
                        </Badge>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}