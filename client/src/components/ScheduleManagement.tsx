import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useLocation } from "wouter"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import {
  Plus,
  Calendar as CalendarIcon,
  Clock,
  User,
  ChevronLeft,
  ChevronRight,
  Edit,
  Trash2,
  CheckCircle,
  Play,
  XCircle,
  Repeat,
  AlertCircle,
  FileText,
  Search,
  Eye
} from "lucide-react"
import type { Schedule, Patient, User as UserType, PaginatedResult, NursingRecord } from "@shared/schema"

// Helper function to get full name
const getFullName = (patient: Patient): string => {
  return `${patient.lastName} ${patient.firstName}`
}

// Helper function to format time
const formatTime = (date: Date | string): string => {
  const d = new Date(date)
  return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
}

// Helper function to format date
const formatDate = (date: Date | string): string => {
  const d = new Date(date)
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
}

// Helper function to get week dates
const getWeekDates = (currentDate: Date): Date[] => {
  const dates: Date[] = []
  const startOfWeek = new Date(currentDate)
  startOfWeek.setDate(currentDate.getDate() - currentDate.getDay()) // Start from Sunday

  for (let i = 0; i < 7; i++) {
    const date = new Date(startOfWeek)
    date.setDate(startOfWeek.getDate() + i)
    dates.push(date)
  }

  return dates
}

// Helper function to get month dates (calendar grid)
const getMonthDates = (currentDate: Date): Date[] => {
  const dates: Date[] = []
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  // First day of the month
  const firstDay = new Date(year, month, 1)
  // Last day of the month
  const lastDay = new Date(year, month + 1, 0)

  // Start from the Sunday of the week containing the first day
  const startDate = new Date(firstDay)
  startDate.setDate(firstDay.getDate() - firstDay.getDay())

  // End at the Saturday of the week containing the last day
  const endDate = new Date(lastDay)
  endDate.setDate(lastDay.getDate() + (6 - lastDay.getDay()))

  // Generate all dates
  const current = new Date(startDate)
  while (current <= endDate) {
    dates.push(new Date(current))
    current.setDate(current.getDate() + 1)
  }

  return dates
}

// Record Action Button Component - shows different button based on record existence
interface RecordActionButtonProps {
  schedule: Schedule
  variant?: "default" | "ghost"
  size?: "sm" | "default"
  showLabel?: boolean
  className?: string
}

function RecordActionButton({ schedule, variant = "default", size = "sm", showLabel = false, className = "" }: RecordActionButtonProps) {
  const [, setLocation] = useLocation()

  // Fetch nursing record for this schedule
  const { data: recordData, isLoading } = useQuery<{ hasRecord: boolean; record?: NursingRecord }>({
    queryKey: ["nursing-record-by-schedule", schedule.id],
    queryFn: async () => {
      const response = await fetch(`/api/schedules/${schedule.id}/nursing-record`)
      if (!response.ok) {
        return { hasRecord: false }
      }
      return response.json()
    },
    staleTime: 5000, // Cache for 5 seconds (reduced from 30s for faster updates)
  })

  const hasRecord = recordData?.hasRecord ?? false
  const recordId = recordData?.record?.id

  const handleClick = () => {
    if (hasRecord && recordId) {
      // Navigate to view/edit existing record
      setLocation(`/records?recordId=${recordId}`)
    } else {
      // Navigate to create new record
      setLocation(`/records?mode=create&scheduleId=${schedule.id}&patientId=${schedule.patientId}`)
    }
  }

  if (isLoading) {
    return (
      <Button size={size} variant={variant} disabled className={className}>
        <FileText className={showLabel ? "mr-1 h-3 w-3" : "h-3 w-3"} />
        {showLabel && "..."}
      </Button>
    )
  }

  return (
    <Button
      size={size}
      variant={variant}
      onClick={handleClick}
      title={hasRecord ? "訪問記録を確認" : "訪問記録を作成"}
      className={className}
    >
      {hasRecord ? (
        <>
          <Eye className={showLabel ? "mr-1 h-3 w-3" : "h-3 w-3"} />
          {showLabel && "記録確認"}
        </>
      ) : (
        <>
          <FileText className={showLabel ? "mr-1 h-3 w-3" : "h-3 w-3"} />
          {showLabel && "記録"}
        </>
      )}
    </Button>
  )
}

export function ScheduleManagement() {
  const queryClient = useQueryClient()
  const [, setLocation] = useLocation()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<'week' | 'day' | 'month'>('week')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedMonthDate, setSelectedMonthDate] = useState<Date | null>(null)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isRecurringDialogOpen, setIsRecurringDialogOpen] = useState(false)
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null)
  const [deleteRecurringDialogOpen, setDeleteRecurringDialogOpen] = useState(false)
  const [selectedParentScheduleId, setSelectedParentScheduleId] = useState<string | null>(null)

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

  // Fetch schedules
  const { data: schedulesData, isLoading } = useQuery<PaginatedResult<Schedule>>({
    queryKey: ["schedules", currentDate, viewMode],
    queryFn: async () => {
      let startDate: Date
      let endDate: Date

      if (viewMode === 'month') {
        // Get the entire month including surrounding weeks for calendar grid
        const monthDates = getMonthDates(currentDate)
        startDate = new Date(monthDates[0])
        startDate.setHours(0, 0, 0, 0)
        endDate = new Date(monthDates[monthDates.length - 1])
        endDate.setHours(23, 59, 59, 999)
      } else {
        // Week or day view
        startDate = new Date(currentDate)
        startDate.setHours(0, 0, 0, 0)
        startDate.setDate(startDate.getDate() - startDate.getDay())
        endDate = new Date(startDate)
        endDate.setDate(startDate.getDate() + 7)
        endDate.setHours(23, 59, 59, 999)
      }

      const response = await fetch(
        `/api/schedules?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}&limit=200`
      )
      if (!response.ok) throw new Error("スケジュールデータの取得に失敗しました")
      return response.json()
    },
  })

  const patients = patientsData?.data || []
  const users = usersData?.data || []
  const schedules = schedulesData?.data || []

  // Create schedule mutation
  const createScheduleMutation = useMutation({
    mutationFn: async (newSchedule: any) => {
      console.log("送信データ:", newSchedule) // デバッグ用
      const response = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSchedule),
      })
      if (!response.ok) {
        const error = await response.json()
        console.error("サーバーエラー:", error) // デバッグ用
        throw new Error(error.error || "スケジュール作成に失敗しました")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] })
      queryClient.invalidateQueries({ queryKey: ["todaySchedules"] })
      setIsCreateDialogOpen(false)
    },
    onError: (error) => {
      console.error("登録エラー:", error) // デバッグ用
      alert(`エラー: ${error.message}`)
    },
  })

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await fetch(`/api/schedules/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      if (!response.ok) throw new Error("ステータス更新に失敗しました")
      return response.json()
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] })
      queryClient.invalidateQueries({ queryKey: ["todaySchedules"] })
      // Invalidate nursing record cache for this schedule
      queryClient.invalidateQueries({ queryKey: ["nursing-record-by-schedule", variables.id] })
    },
  })

  // Update schedule mutation
  const updateScheduleMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      console.log("更新データ:", data) // デバッグ用
      const response = await fetch(`/api/schedules/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json()
        console.error("サーバーエラー:", error) // デバッグ用
        throw new Error(error.error || "スケジュール更新に失敗しました")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] })
      queryClient.invalidateQueries({ queryKey: ["todaySchedules"] })
      setSelectedSchedule(null)
    },
    onError: (error) => {
      console.error("更新エラー:", error) // デバッグ用
      alert(`エラー: ${error.message}`)
    },
  })

  // Delete schedule mutation
  const deleteScheduleMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/schedules/${id}`, {
        method: "DELETE",
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "スケジュール削除に失敗しました")
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] })
      queryClient.invalidateQueries({ queryKey: ["todaySchedules"] })
    },
    onError: (error) => {
      alert(`削除エラー: ${error.message}`)
    },
  })

  // Bulk delete recurring schedules mutation
  const deleteRecurringMutation = useMutation({
    mutationFn: async (parentId: string) => {
      const response = await fetch(`/api/schedules/recurring/${parentId}`, {
        method: "DELETE",
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "繰り返しスケジュールの削除に失敗しました")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] })
      queryClient.invalidateQueries({ queryKey: ["todaySchedules"] })
      setDeleteRecurringDialogOpen(false)
      setSelectedParentScheduleId(null)
    },
  })

  const handlePrevious = () => {
    const newDate = new Date(currentDate)
    if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() - 7)
    } else if (viewMode === 'month') {
      newDate.setMonth(newDate.getMonth() - 1)
    } else {
      newDate.setDate(newDate.getDate() - 1)
    }
    setCurrentDate(newDate)
  }

  const handleNext = () => {
    const newDate = new Date(currentDate)
    if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() + 7)
    } else if (viewMode === 'month') {
      newDate.setMonth(newDate.getMonth() + 1)
    } else {
      newDate.setDate(newDate.getDate() + 1)
    }
    setCurrentDate(newDate)
  }

  const handleToday = () => {
    setCurrentDate(new Date())
  }

  const handleDeleteSchedule = async (schedule: Schedule) => {
    if (confirm(`${formatDate(schedule.scheduledDate)}のスケジュールを削除しますか?`)) {
      deleteScheduleMutation.mutate(schedule.id)
    }
  }

  const handleDeleteRecurringSeries = (parentId: string) => {
    setSelectedParentScheduleId(parentId)
    setDeleteRecurringDialogOpen(true)
  }

  const weekDates = viewMode === 'week' ? getWeekDates(currentDate) : [currentDate]

  return (
    <div className="w-full max-w-full space-y-4 sm:space-y-6 p-3 sm:p-4 lg:p-6 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight truncate">
            訪問スケジュール管理
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            訪問予定の登録と管理
          </p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button
            onClick={() => setIsCreateDialogOpen(true)}
            className="flex-1 sm:flex-none"
            data-testid="button-add-schedule"
          >
            <Plus className="mr-2 h-4 w-4" />
            新規登録
          </Button>
          <Button
            onClick={() => setIsRecurringDialogOpen(true)}
            variant="outline"
            className="flex-1 sm:flex-none"
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            繰り返し作成
          </Button>
        </div>
      </div>

      {/* View Controls */}
      <Card>
        <CardContent className="pt-4 sm:pt-6">
          <div className="flex flex-col gap-3 sm:gap-4">
            {/* Mobile: Stacked Layout */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
              <div className="flex items-center justify-between sm:justify-start gap-2">
                <Button variant="outline" size="sm" onClick={handlePrevious} className="h-8 sm:h-9">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={handleToday} className="h-8 sm:h-9 text-xs sm:text-sm">
                  今日
                </Button>
                <Button variant="outline" size="sm" onClick={handleNext} className="h-8 sm:h-9">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="text-sm sm:text-lg font-semibold text-center sm:text-left">
                {viewMode === 'week'
                  ? `${formatDate(weekDates[0])} - ${formatDate(weekDates[6])}`
                  : viewMode === 'month'
                  ? currentDate.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' })
                  : formatDate(currentDate)
                }
              </div>

              <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'week' | 'day' | 'month')} className="w-full sm:w-auto">
                <TabsList className="grid grid-cols-3 w-full sm:w-auto">
                  <TabsTrigger value="day" className="text-xs sm:text-sm">日</TabsTrigger>
                  <TabsTrigger value="week" className="text-xs sm:text-sm">週</TabsTrigger>
                  <TabsTrigger value="month" className="text-xs sm:text-sm">月</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Calendar View */}
      <Card>
        <CardHeader>
          <CardTitle>スケジュール一覧</CardTitle>
          <CardDescription>
            登録されている訪問予定
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="患者名または看護師名で検索..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 placeholder:text-gray-400"
            />
          </div>
          {isLoading ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">読み込み中...</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {viewMode === 'month' ? (
                // Month view - calendar grid for PC, list for mobile
                <>
                  {/* PC Calendar Grid (hidden on mobile) */}
                  <div className="hidden sm:block">
                    <div className="grid grid-cols-7 gap-2">
                      {/* Day headers */}
                      {['日', '月', '火', '水', '木', '金', '土'].map((day, idx) => (
                        <div key={idx} className="text-center font-semibold py-2 text-sm">
                          {day}
                        </div>
                      ))}
                      {/* Calendar cells */}
                      {getMonthDates(currentDate).map((date, idx) => {
                        const isCurrentMonth = date.getMonth() === currentDate.getMonth()
                        const isToday = date.toDateString() === new Date().toDateString()
                        const daySchedules = schedules
                          .filter(s => new Date(s.scheduledDate).toDateString() === date.toDateString())
                          .filter(s => {
                            const patient = patients.find(p => p.id === s.patientId)
                            const nurse = users.find(u => u.id === s.nurseId)
                            const patientName = patient ? getFullName(patient) : ''
                            const nurseName = nurse?.fullName || s.demoStaffName || ''
                            return patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                   nurseName.toLowerCase().includes(searchTerm.toLowerCase())
                          })
                          .sort((a, b) => new Date(a.scheduledStartTime).getTime() - new Date(b.scheduledStartTime).getTime())

                        return (
                          <div
                            key={idx}
                            className={`
                              min-h-[80px] border rounded-lg p-2 cursor-pointer transition-colors
                              ${isCurrentMonth ? 'bg-white' : 'bg-gray-50'}
                              ${isToday ? 'border-blue-500 border-2' : 'border-gray-200'}
                              ${daySchedules.length > 0 ? 'hover:bg-blue-50' : 'hover:bg-gray-100'}
                            `}
                            onClick={() => setSelectedMonthDate(date)}
                          >
                            <div className={`text-sm font-medium mb-1 ${isToday ? 'text-blue-600' : isCurrentMonth ? '' : 'text-gray-400'}`}>
                              {date.getDate()}
                            </div>
                            {daySchedules.length > 0 && (
                              <div className="space-y-1">
                                {daySchedules.slice(0, 2).map(schedule => {
                                  const statusColors = {
                                    completed: 'bg-green-100 text-green-800',
                                    in_progress: 'bg-orange-100 text-orange-800',
                                    scheduled: 'bg-yellow-100 text-yellow-800',
                                    cancelled: 'bg-gray-100 text-gray-800'
                                  }
                                  return (
                                    <div key={schedule.id} className={`text-xs truncate px-1 rounded ${statusColors[schedule.status]}`}>
                                      {formatTime(schedule.scheduledStartTime)} {patients.find(p => p.id === schedule.patientId)?.lastName || ''}
                                    </div>
                                  )
                                })}
                                {daySchedules.length > 2 && (
                                  <div className="text-xs text-gray-500">
                                    他{daySchedules.length - 2}件
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {/* Selected date details */}
                    {selectedMonthDate && (
                      <div className="mt-4 border rounded-lg p-4 bg-gray-50">
                        <div className="flex justify-between items-center mb-3">
                          <h3 className="font-semibold">
                            {selectedMonthDate.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
                          </h3>
                          <Button variant="ghost" size="sm" onClick={() => setSelectedMonthDate(null)}>
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </div>
                        {schedules
                          .filter(s => new Date(s.scheduledDate).toDateString() === selectedMonthDate.toDateString())
                          .sort((a, b) => new Date(a.scheduledStartTime).getTime() - new Date(b.scheduledStartTime).getTime())
                          .map(schedule => {
                            const patient = patients.find(p => p.id === schedule.patientId)
                            const nurse = users.find(u => u.id === schedule.nurseId)
                            return (
                              <div key={schedule.id} className="mb-2 p-2 bg-white rounded border">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-sm font-medium">
                                        {formatTime(schedule.scheduledStartTime)} - {formatTime(schedule.scheduledEndTime)}
                                      </span>
                                      {schedule.status === 'completed' && (
                                        <span className="text-xs px-2 py-0.5 bg-green-100 text-green-800 rounded">完了</span>
                                      )}
                                      {schedule.status === 'in_progress' && (
                                        <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-800 rounded">実施中</span>
                                      )}
                                      {schedule.status === 'scheduled' && (
                                        <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded">予定</span>
                                      )}
                                      {schedule.status === 'cancelled' && (
                                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-800 rounded">キャンセル</span>
                                      )}
                                    </div>
                                    <div className="text-sm text-muted-foreground truncate">
                                      {patient ? getFullName(patient) : '不明'} / {nurse?.fullName || schedule.demoStaffName || '未割当'}
                                    </div>
                                    <div className="text-xs text-muted-foreground">{schedule.purpose}</div>
                                  </div>
                                  <div className="flex gap-1">
                                    <RecordActionButton schedule={schedule} variant="ghost" />
                                    <Button size="sm" variant="ghost" onClick={() => setSelectedSchedule(schedule)}>
                                      <Edit className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        {schedules.filter(s => new Date(s.scheduledDate).toDateString() === selectedMonthDate.toDateString()).length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-4">予定なし</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Mobile List View (shown only on mobile) */}
                  <div className="sm:hidden space-y-2">
                    {getMonthDates(currentDate)
                      .filter(date => date.getMonth() === currentDate.getMonth())
                      .map((date, idx) => {
                        const daySchedules = schedules
                          .filter(s => new Date(s.scheduledDate).toDateString() === date.toDateString())
                          .filter(s => {
                            const patient = patients.find(p => p.id === s.patientId)
                            const nurse = users.find(u => u.id === s.nurseId)
                            const patientName = patient ? getFullName(patient) : ''
                            const nurseName = nurse?.fullName || s.demoStaffName || ''
                            return patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                   nurseName.toLowerCase().includes(searchTerm.toLowerCase())
                          })
                          .sort((a, b) => new Date(a.scheduledStartTime).getTime() - new Date(b.scheduledStartTime).getTime())

                        const isToday = date.toDateString() === new Date().toDateString()

                        return (
                          <details key={idx} className={`border rounded-lg ${isToday ? 'border-blue-500' : ''}`}>
                            <summary className="p-3 cursor-pointer hover:bg-gray-50 flex justify-between items-center">
                              <div className="flex items-center gap-2">
                                <span className={`font-medium ${isToday ? 'text-blue-600' : ''}`}>
                                  {date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', weekday: 'short' })}
                                </span>
                                {daySchedules.length > 0 && (
                                  <Badge variant="secondary" className="text-xs">
                                    {daySchedules.length}件
                                  </Badge>
                                )}
                              </div>
                            </summary>
                            <div className="border-t p-3 space-y-2">
                              {daySchedules.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-2">予定なし</p>
                              ) : (
                                daySchedules.map(schedule => {
                                  const patient = patients.find(p => p.id === schedule.patientId)
                                  const nurse = users.find(u => u.id === schedule.nurseId)
                                  return (
                                    <div key={schedule.id} className="p-2 bg-gray-50 rounded">
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-medium">
                                              {formatTime(schedule.scheduledStartTime)} - {formatTime(schedule.scheduledEndTime)}
                                            </span>
                                            {schedule.status === 'completed' && (
                                              <span className="text-xs px-2 py-0.5 bg-green-100 text-green-800 rounded">完了</span>
                                            )}
                                            {schedule.status === 'in_progress' && (
                                              <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-800 rounded">実施中</span>
                                            )}
                                            {schedule.status === 'scheduled' && (
                                              <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded">予定</span>
                                            )}
                                            {schedule.status === 'cancelled' && (
                                              <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-800 rounded">キャンセル</span>
                                            )}
                                          </div>
                                          <div className="text-sm text-muted-foreground truncate">
                                            {patient ? getFullName(patient) : '不明'} / {nurse?.fullName || schedule.demoStaffName || '未割当'}
                                          </div>
                                          <div className="text-xs text-muted-foreground">{schedule.purpose}</div>
                                        </div>
                                        <div className="flex gap-1">
                                          <RecordActionButton schedule={schedule} variant="ghost" />
                                          <Button size="sm" variant="ghost" onClick={() => setSelectedSchedule(schedule)}>
                                            <Edit className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  )
                                })
                              )}
                            </div>
                          </details>
                        )
                      })}
                  </div>
                </>
              ) : viewMode === 'week' ? (
                // Week view - show each day
                weekDates.map((date, idx) => {
                  const daySchedules = schedules
                    .filter(s => {
                      const scheduleDate = new Date(s.scheduledDate)
                      return scheduleDate.toDateString() === date.toDateString()
                    })
                    .filter(s => {
                      const patient = patients.find(p => p.id === s.patientId)
                      const nurse = users.find(u => u.id === s.nurseId)
                      const patientName = patient ? getFullName(patient) : ''
                      const nurseName = nurse?.fullName || s.demoStaffName || ''
                      const matchesSearch = patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                          nurseName.toLowerCase().includes(searchTerm.toLowerCase())
                      return matchesSearch
                    })
                    .sort((a, b) => {
                      // Sort by start time (earliest first)
                      return new Date(a.scheduledStartTime).getTime() - new Date(b.scheduledStartTime).getTime()
                    })

                  return (
                    <div key={idx} className="border rounded-lg p-3 sm:p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-sm sm:text-base">
                          {date.toLocaleDateString('ja-JP', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </h3>
                        <span className="text-xs sm:text-sm text-muted-foreground">
                          {daySchedules.length}件
                        </span>
                      </div>
                      {daySchedules.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-2">予定なし</p>
                      ) : (
                        <div className="space-y-2">
                          {daySchedules.map((schedule) => {
                            const patient = patients.find(p => p.id === schedule.patientId)
                            const nurse = users.find(u => u.id === schedule.nurseId)

                            return (
                              <div key={schedule.id} className="border rounded p-2 bg-white sm:bg-gray-50">
                                {/* Mobile Layout */}
                                <div className="sm:hidden space-y-2">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1 space-y-1">
                                      <div className="flex items-center gap-1 text-xs">
                                        <Clock className="h-3 w-3 flex-shrink-0" />
                                        <span className="font-medium">
                                          {formatTime(schedule.scheduledStartTime)}-{formatTime(schedule.scheduledEndTime)}
                                        </span>
                                        {schedule.status === 'completed' && (
                                          <span className="px-1.5 py-0.5 bg-green-100 text-green-800 rounded text-[10px]">完了</span>
                                        )}
                                        {schedule.status === 'in_progress' && (
                                          <span className="px-1.5 py-0.5 bg-orange-100 text-orange-800 rounded text-[10px]">実施中</span>
                                        )}
                                        {schedule.status === 'scheduled' && (
                                          <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-800 rounded text-[10px]">予定</span>
                                        )}
                                      </div>
                                      <div className="text-sm font-medium truncate">
                                        {patient ? getFullName(patient) : '患者不明'}
                                      </div>
                                      <div className="text-xs text-muted-foreground truncate">
                                        {nurse?.fullName || schedule.demoStaffName || 'スタッフ未割当'}
                                      </div>
                                      <div className="text-xs text-muted-foreground line-clamp-1">{schedule.purpose}</div>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-1">
                                    <RecordActionButton schedule={schedule} showLabel className="text-xs h-8" />
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setSelectedSchedule(schedule)}
                                      className="text-xs h-8"
                                    >
                                      <Edit className="h-3 w-3 mr-1" />
                                      編集
                                    </Button>
                                  </div>
                                </div>

                                {/* Desktop Layout */}
                                <div className="hidden sm:flex items-center justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <Clock className="h-3 w-3 flex-shrink-0" />
                                      <span className="text-sm font-medium">
                                        {formatTime(schedule.scheduledStartTime)} - {formatTime(schedule.scheduledEndTime)}
                                      </span>
                                      {schedule.isRecurring && schedule.parentScheduleId && (
                                        <Badge variant="outline" className="text-xs">
                                          <Repeat className="h-3 w-3 mr-1" />
                                          繰り返し
                                        </Badge>
                                      )}
                                      {schedule.status === 'completed' && (
                                        <span className="text-xs px-2 py-0.5 bg-green-100 text-green-800 rounded">完了</span>
                                      )}
                                      {schedule.status === 'in_progress' && (
                                        <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-800 rounded">実施中</span>
                                      )}
                                      {schedule.status === 'scheduled' && (
                                        <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded">予定</span>
                                      )}
                                      {schedule.status === 'cancelled' && (
                                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-800 rounded">キャンセル</span>
                                      )}
                                    </div>
                                    <div className="text-sm text-muted-foreground truncate">
                                      {patient ? getFullName(patient) : '患者不明'} / {nurse?.fullName || schedule.demoStaffName || 'スタッフ未割当'}
                                    </div>
                                    <div className="text-xs text-muted-foreground">{schedule.purpose}</div>
                                  </div>
                                  <div className="flex gap-1 flex-shrink-0">
                                    <RecordActionButton schedule={schedule} />
                                    {schedule.isRecurring && schedule.parentScheduleId && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => handleDeleteRecurringSeries(schedule.parentScheduleId!)}
                                        title="シリーズ全体を削除"
                                      >
                                        <Repeat className="h-3 w-3 mr-1" />
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    )}
                                    <Button size="sm" variant="ghost" onClick={() => setSelectedSchedule(schedule)}>
                                      <Edit className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleDeleteSchedule(schedule)}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })
              ) : (
                // Day view - show all schedules for the day
                <div className="space-y-3">
                  {schedules
                    .filter(s => {
                      const scheduleDate = new Date(s.scheduledDate)
                      return scheduleDate.toDateString() === currentDate.toDateString()
                    })
                    .filter(s => {
                      const patient = patients.find(p => p.id === s.patientId)
                      const nurse = users.find(u => u.id === s.nurseId)
                      const patientName = patient ? getFullName(patient) : ''
                      const nurseName = nurse?.fullName || s.demoStaffName || ''
                      const matchesSearch = patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                          nurseName.toLowerCase().includes(searchTerm.toLowerCase())
                      return matchesSearch
                    })
                    .sort((a, b) => {
                      // Sort by start time (earliest first)
                      return new Date(a.scheduledStartTime).getTime() - new Date(b.scheduledStartTime).getTime()
                    })
                    .map((schedule) => {
                      const patient = patients.find(p => p.id === schedule.patientId)
                      const nurse = users.find(u => u.id === schedule.nurseId)

                      return (
                        <div key={schedule.id} className="border rounded-lg p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4" />
                                <span className="font-semibold">
                                  {formatTime(schedule.scheduledStartTime)} - {formatTime(schedule.scheduledEndTime)}
                                </span>
                                <span className="text-sm text-muted-foreground">({schedule.duration}分)</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4" />
                                <span>患者: {patient ? getFullName(patient) : '不明'}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4" />
                                <span>担当: {nurse?.fullName || schedule.demoStaffName || '未割当'}</span>
                              </div>
                              <div className="text-sm text-muted-foreground">目的: {schedule.purpose}</div>
                              {schedule.notes && (
                                <div className="text-sm text-muted-foreground">備考: {schedule.notes}</div>
                              )}
                              <div className="flex items-center gap-2 mt-2">
                                <span className="text-xs font-medium">ステータス:</span>
                                {schedule.status === 'completed' && (
                                  <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded">完了</span>
                                )}
                                {schedule.status === 'in_progress' && (
                                  <span className="text-xs px-2 py-1 bg-orange-100 text-orange-800 rounded">実施中</span>
                                )}
                                {schedule.status === 'scheduled' && (
                                  <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded">予定</span>
                                )}
                                {schedule.status === 'cancelled' && (
                                  <span className="text-xs px-2 py-1 bg-gray-100 text-gray-800 rounded">キャンセル</span>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col gap-2 flex-shrink-0">
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => updateStatusMutation.mutate({ id: schedule.id, status: 'in_progress' })}
                                  disabled={schedule.status === 'in_progress'}
                                  title="開始"
                                >
                                  <Play className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-green-600 hover:text-green-700"
                                  onClick={() => updateStatusMutation.mutate({ id: schedule.id, status: 'completed' })}
                                  disabled={schedule.status === 'completed'}
                                  title="完了"
                                >
                                  <CheckCircle className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600 hover:text-red-700"
                                  onClick={() => updateStatusMutation.mutate({ id: schedule.id, status: 'cancelled' })}
                                  disabled={schedule.status === 'cancelled'}
                                  title="キャンセル"
                                >
                                  <XCircle className="h-3 w-3" />
                                </Button>
                              </div>
                              <div className="flex gap-1">
                                <RecordActionButton schedule={schedule} showLabel />
                              </div>
                              <div className="flex gap-1">
                                <Button size="sm" variant="outline" onClick={() => setSelectedSchedule(schedule)}>
                                  <Edit className="mr-1 h-3 w-3" />
                                  編集
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDeleteSchedule(schedule)}
                                >
                                  <Trash2 className="mr-1 h-3 w-3" />
                                  削除
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  {schedules.filter(s => new Date(s.scheduledDate).toDateString() === currentDate.toDateString()).length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <CalendarIcon className="mx-auto h-12 w-12 mb-4 opacity-50" />
                      <p>本日の予定はありません</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <ScheduleDialog
        open={isCreateDialogOpen || selectedSchedule !== null}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateDialogOpen(false)
            setSelectedSchedule(null)
          }
        }}
        schedule={selectedSchedule}
        patients={patients}
        users={users}
        onSave={(data) => {
          if (selectedSchedule) {
            updateScheduleMutation.mutate({ id: selectedSchedule.id, data })
          } else {
            createScheduleMutation.mutate(data)
          }
        }}
      />

      {/* Recurring Schedule Dialog */}
      <RecurringScheduleDialog
        open={isRecurringDialogOpen}
        onOpenChange={setIsRecurringDialogOpen}
        patients={patients}
        nurses={users}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['schedules'] })
        }}
      />

      {/* Delete Recurring Series Confirmation Dialog */}
      <AlertDialog open={deleteRecurringDialogOpen} onOpenChange={setDeleteRecurringDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>繰り返しスケジュールを全て削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              このシリーズに含まれる全てのスケジュールが削除されます。この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedParentScheduleId) {
                  deleteRecurringMutation.mutate(selectedParentScheduleId)
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              全て削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}

// Schedule Dialog Component
interface ScheduleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  schedule: Schedule | null
  patients: Patient[]
  users: UserType[]
  onSave: (data: any) => void
}

function ScheduleDialog({ open, onOpenChange, schedule, patients, users, onSave }: ScheduleDialogProps) {
  const [formData, setFormData] = useState({
    patientId: "",
    nurseId: "",
    demoStaffName: "",
    date: new Date().toISOString().split('T')[0],
    startTime: "09:00",
    endTime: "10:00",
    duration: 60,
    purpose: "",
    visitType: "定期訪問",
    notes: "",
    isRecurring: false,
  })

  // Reset form when schedule prop changes
  useEffect(() => {
    if (schedule) {
      // Editing existing schedule
      setFormData({
        patientId: schedule.patientId || "",
        nurseId: schedule.nurseId || "",
        demoStaffName: schedule.demoStaffName || "",
        date: new Date(schedule.scheduledDate).toISOString().split('T')[0],
        startTime: formatTime(schedule.scheduledStartTime),
        endTime: formatTime(schedule.scheduledEndTime),
        duration: schedule.duration || 60,
        purpose: schedule.purpose || "",
        visitType: schedule.visitType || "定期訪問",
        notes: schedule.notes || "",
        isRecurring: schedule.isRecurring || false,
      })
    } else {
      // Creating new schedule - reset to defaults
      setFormData({
        patientId: "",
        nurseId: "",
        demoStaffName: "",
        date: new Date().toISOString().split('T')[0],
        startTime: "09:00",
        endTime: "10:00",
        duration: 60,
        purpose: "",
        visitType: "定期訪問",
        notes: "",
        isRecurring: false,
      })
    }
  }, [schedule])

  // Calculate duration from start and end time
  const calculateDuration = (startTime: string, endTime: string): number => {
    if (!startTime || !endTime) return 60

    const [startHour, startMin] = startTime.split(':').map(Number)
    const [endHour, endMin] = endTime.split(':').map(Number)

    const startMinutes = startHour * 60 + startMin
    const endMinutes = endHour * 60 + endMin

    const duration = endMinutes - startMinutes
    return duration > 0 ? duration : 60
  }

  // Handle start time change with auto-calculation
  const handleStartTimeChange = (newStartTime: string) => {
    const newDuration = calculateDuration(newStartTime, formData.endTime)
    setFormData({ ...formData, startTime: newStartTime, duration: newDuration })
  }

  // Handle end time change with auto-calculation
  const handleEndTimeChange = (newEndTime: string) => {
    const newDuration = calculateDuration(formData.startTime, newEndTime)
    setFormData({ ...formData, endTime: newEndTime, duration: newDuration })
  }

  const handleSubmit = () => {
    const startDateTime = new Date(`${formData.date}T${formData.startTime}`)
    const endDateTime = new Date(`${formData.date}T${formData.endTime}`)

    const scheduleData = {
      patientId: formData.patientId,
      nurseId: formData.nurseId || undefined,
      demoStaffName: formData.demoStaffName || undefined,
      scheduledDate: startDateTime.toISOString(),
      scheduledStartTime: startDateTime.toISOString(),
      scheduledEndTime: endDateTime.toISOString(),
      duration: formData.duration,
      purpose: formData.purpose,
      visitType: formData.visitType,
      notes: formData.notes,
      isRecurring: formData.isRecurring,
      recurrencePattern: "none", // TODO: Add recurrence UI
    }

    onSave(scheduleData)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{schedule ? 'スケジュール編集' : '新規スケジュール登録'}</DialogTitle>
          <DialogDescription>訪問予定を登録してください</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="patient">患者 *</Label>
            <Select value={formData.patientId} onValueChange={(v) => setFormData({ ...formData, patientId: v })}>
              <SelectTrigger>
                <SelectValue placeholder="患者を選択" />
              </SelectTrigger>
              <SelectContent>
                {patients.map((patient) => (
                  <SelectItem key={patient.id} value={patient.id}>
                    {getFullName(patient)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="nurse">担当スタッフ</Label>
            <Select value={formData.nurseId || "unassigned"} onValueChange={(v) => setFormData({ ...formData, nurseId: v === "unassigned" ? "" : v })}>
              <SelectTrigger>
                <SelectValue placeholder="スタッフを選択（任意）" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">未割当</SelectItem>
                {users.filter(u => u.role === 'nurse' || u.role === 'manager').map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!formData.nurseId && (
            <div className="grid gap-2">
              <Label htmlFor="demoStaff">デモスタッフ名（非担当制の場合）</Label>
              <Input
                id="demoStaff"
                value={formData.demoStaffName}
                onChange={(e) => setFormData({ ...formData, demoStaffName: e.target.value })}
                placeholder="例: スタッフA"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="date">訪問日 *</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="visitType">訪問種別</Label>
              <Select value={formData.visitType} onValueChange={(v) => setFormData({ ...formData, visitType: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="定期訪問">定期訪問</SelectItem>
                  <SelectItem value="緊急訪問">緊急訪問</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="startTime">開始時刻 *</Label>
              <Input
                id="startTime"
                type="time"
                value={formData.startTime}
                onChange={(e) => handleStartTimeChange(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="endTime">終了時刻 *</Label>
              <Input
                id="endTime"
                type="time"
                value={formData.endTime}
                onChange={(e) => handleEndTimeChange(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="duration">所要時間（分）</Label>
              <Input
                id="duration"
                type="number"
                value={formData.duration}
                onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="purpose">訪問目的 *</Label>
            <Input
              id="purpose"
              value={formData.purpose}
              onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
              placeholder="例: バイタルチェック、服薬確認"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="notes">備考</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="特記事項があれば記入してください"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!formData.patientId || !formData.purpose}
          >
            {schedule ? '更新' : '登録'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Recurring Schedule Dialog Component
function RecurringScheduleDialog({
  open,
  onOpenChange,
  patients,
  nurses,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  patients: Patient[]
  nurses: UserType[]
  onSuccess: () => void
}) {
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState({
    patientId: '',
    nurseId: '',
    demoStaffName: '',
    startTime: '09:00',
    endTime: '10:00',
    duration: 60,
    purpose: '',
    recurrencePattern: 'weekly',
    recurrenceDays: [] as number[],
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    visitType: '',
    notes: '',
  })

  const [previewCount, setPreviewCount] = useState(0)
  const selectedPatient = patients.find(p => p.id === formData.patientId)

  // Calculate preview count when form changes
  useEffect(() => {
    if (!formData.startDate || !formData.endDate || formData.recurrenceDays.length === 0) {
      setPreviewCount(0)
      return
    }

    const start = new Date(formData.startDate)
    const end = new Date(formData.endDate)
    if (start > end) {
      setPreviewCount(0)
      return
    }

    let count = 0
    const currentDate = new Date(start)

    while (currentDate <= end) {
      if (formData.recurrenceDays.includes(currentDate.getDay())) {
        count++
      }
      currentDate.setDate(currentDate.getDate() + 1)
    }

    if (formData.recurrencePattern === 'biweekly') {
      count = Math.floor(count / 2)
    }

    setPreviewCount(count)
  }, [formData.startDate, formData.endDate, formData.recurrenceDays, formData.recurrencePattern])

  const createRecurringMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await fetch('/api/schedules/generate-recurring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'スケジュールの作成に失敗しました')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] })
      onSuccess()
      onOpenChange(false)
      // Reset form
      setFormData({
        patientId: '',
        nurseId: '',
        demoStaffName: '',
        startTime: '09:00',
        endTime: '10:00',
        duration: 60,
        purpose: '',
        recurrencePattern: 'weekly',
        recurrenceDays: [],
        startDate: new Date().toISOString().split('T')[0],
        endDate: '',
        visitType: '',
        notes: '',
      })
    },
  })

  const handleSubmit = () => {
    if (!formData.patientId || !formData.purpose || formData.recurrenceDays.length === 0 || !formData.endDate) {
      alert('必須項目を入力してください')
      return
    }

    if (previewCount > 100) {
      alert('生成されるスケジュール数が多すぎます（最大100件）。期間を短縮してください。')
      return
    }

    createRecurringMutation.mutate(formData)
  }

  const toggleDay = (day: number) => {
    if (formData.recurrenceDays.includes(day)) {
      setFormData({
        ...formData,
        recurrenceDays: formData.recurrenceDays.filter(d => d !== day)
      })
    } else {
      setFormData({
        ...formData,
        recurrenceDays: [...formData.recurrenceDays, day].sort()
      })
    }
  }

  const dayNames = ['日', '月', '火', '水', '木', '金', '土']

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>繰り返しスケジュール作成</DialogTitle>
          <DialogDescription>定期的な訪問スケジュールを一括で作成します</DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          {/* Patient Selection */}
          <div className="grid gap-2">
            <Label>患者 <span className="text-red-500">*</span></Label>
            <Select value={formData.patientId} onValueChange={(value) => setFormData({ ...formData, patientId: value })}>
              <SelectTrigger>
                <SelectValue placeholder="患者を選択してください" />
              </SelectTrigger>
              <SelectContent>
                {patients.map((patient) => (
                  <SelectItem key={patient.id} value={patient.id}>
                    {getFullName(patient)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Patient Status Warning */}
          {selectedPatient && (selectedPatient.isInHospital || selectedPatient.isInShortStay) && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-yellow-900">患者ステータス注意</p>
                  <p className="text-yellow-800 mt-1">
                    {selectedPatient.isInHospital && '現在入院中です。'}
                    {selectedPatient.isInShortStay && '現在ショートステイ中です。'}
                    訪問予定の登録に問題がないか確認してください。
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Nurse Selection */}
          <div className="grid gap-2">
            <Label>担当看護師</Label>
            <Select value={formData.nurseId} onValueChange={(value) => setFormData({ ...formData, nurseId: value })}>
              <SelectTrigger>
                <SelectValue placeholder="担当看護師を選択（任意）" />
              </SelectTrigger>
              <SelectContent>
                {nurses.map((nurse) => (
                  <SelectItem key={nurse.id} value={nurse.id}>
                    {nurse.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Time and Duration */}
          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-2">
              <Label>開始時間</Label>
              <Input
                type="time"
                value={formData.startTime}
                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>終了時間</Label>
              <Input
                type="time"
                value={formData.endTime}
                onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>所要時間（分）</Label>
              <Input
                type="number"
                value={formData.duration}
                onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
                min="15"
                step="15"
              />
            </div>
          </div>

          {/* Purpose */}
          <div className="grid gap-2">
            <Label>訪問目的 <span className="text-red-500">*</span></Label>
            <Input
              value={formData.purpose}
              onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
              placeholder="訪問の目的を入力してください"
            />
          </div>

          {/* Recurrence Pattern */}
          <div className="grid gap-2">
            <Label>繰り返しパターン <span className="text-red-500">*</span></Label>
            <Select value={formData.recurrencePattern} onValueChange={(value) => setFormData({ ...formData, recurrencePattern: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">毎週</SelectItem>
                <SelectItem value="biweekly">隔週</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Recurrence Days */}
          <div className="grid gap-2">
            <Label>曜日 <span className="text-red-500">*</span></Label>
            <div className="flex gap-2">
              {dayNames.map((day, index) => (
                <Button
                  key={index}
                  type="button"
                  variant={formData.recurrenceDays.includes(index) ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => toggleDay(index)}
                >
                  {day}
                </Button>
              ))}
            </div>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>開始日 <span className="text-red-500">*</span></Label>
              <Input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>終了日 <span className="text-red-500">*</span></Label>
              <Input
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
              />
            </div>
          </div>

          {/* Preview */}
          {previewCount > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <p className="text-sm font-medium text-blue-900">
                作成されるスケジュール数: <span className="text-lg font-bold">{previewCount}件</span>
              </p>
              {previewCount > 100 && (
                <p className="text-sm text-red-600 mt-1">
                  ⚠ 最大100件までです。期間を短縮してください。
                </p>
              )}
            </div>
          )}

          {/* Notes */}
          <div className="grid gap-2">
            <Label>備考</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="特記事項があれば記入してください"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!formData.patientId || !formData.purpose || formData.recurrenceDays.length === 0 || !formData.endDate || previewCount > 100 || createRecurringMutation.isPending}
          >
            {createRecurringMutation.isPending ? '作成中...' : `${previewCount}件のスケジュールを作成`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
