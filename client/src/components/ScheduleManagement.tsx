import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import {
  Plus,
  Calendar as CalendarIcon,
  Clock,
  User,
  ChevronLeft,
  ChevronRight,
  Edit,
  Trash2
} from "lucide-react"
import type { Schedule, Patient, User as UserType, PaginatedResult } from "@shared/schema"

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

export function ScheduleManagement() {
  const queryClient = useQueryClient()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<'week' | 'day'>('week')
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null)

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
    queryKey: ["schedules", currentDate],
    queryFn: async () => {
      const startDate = new Date(currentDate)
      startDate.setDate(startDate.getDate() - startDate.getDay())
      const endDate = new Date(startDate)
      endDate.setDate(startDate.getDate() + 7)

      const response = await fetch(
        `/api/schedules?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}&limit=100`
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
        throw new Error("スケジュール削除に失敗しました")
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] })
      queryClient.invalidateQueries({ queryKey: ["todaySchedules"] })
    },
  })

  const handlePrevious = () => {
    const newDate = new Date(currentDate)
    if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() - 7)
    } else {
      newDate.setDate(newDate.getDate() - 1)
    }
    setCurrentDate(newDate)
  }

  const handleNext = () => {
    const newDate = new Date(currentDate)
    if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() + 7)
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

  const weekDates = viewMode === 'week' ? getWeekDates(currentDate) : [currentDate]

  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-4 lg:p-6">
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
        <Button
          onClick={() => setIsCreateDialogOpen(true)}
          className="w-full sm:w-auto flex-shrink-0"
          data-testid="button-add-schedule"
        >
          <Plus className="mr-2 h-4 w-4" />
          新規スケジュール登録
        </Button>
      </div>

      {/* View Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handlePrevious}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={handleToday}>
                今日
              </Button>
              <Button variant="outline" size="sm" onClick={handleNext}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="text-lg font-semibold">
              {viewMode === 'week'
                ? `${formatDate(weekDates[0])} - ${formatDate(weekDates[6])}`
                : formatDate(currentDate)
              }
            </div>

            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'week' | 'day')}>
              <TabsList>
                <TabsTrigger value="week">週表示</TabsTrigger>
                <TabsTrigger value="day">日表示</TabsTrigger>
              </TabsList>
            </Tabs>
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
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">読み込み中...</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {viewMode === 'week' ? (
                // Week view - show each day
                weekDates.map((date, idx) => {
                  const daySchedules = schedules
                    .filter(s => {
                      const scheduleDate = new Date(s.scheduledDate)
                      return scheduleDate.toDateString() === date.toDateString()
                    })
                    .sort((a, b) => {
                      // Sort by start time (earliest first)
                      return new Date(a.scheduledStartTime).getTime() - new Date(b.scheduledStartTime).getTime()
                    })

                  return (
                    <div key={idx} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold">
                          {date.toLocaleDateString('ja-JP', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </h3>
                        <span className="text-sm text-muted-foreground">
                          {daySchedules.length}件の予定
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
                              <div key={schedule.id} className="flex items-center justify-between gap-2 p-2 bg-gray-50 rounded">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <Clock className="h-3 w-3 flex-shrink-0" />
                                    <span className="text-sm font-medium">
                                      {formatTime(schedule.scheduledStartTime)} - {formatTime(schedule.scheduledEndTime)}
                                    </span>
                                  </div>
                                  <div className="text-sm text-muted-foreground truncate">
                                    {patient ? getFullName(patient) : '患者不明'} / {nurse?.fullName || schedule.demoStaffName || 'スタッフ未割当'}
                                  </div>
                                  <div className="text-xs text-muted-foreground">{schedule.purpose}</div>
                                </div>
                                <div className="flex gap-1 flex-shrink-0">
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
                            </div>
                            <div className="flex gap-2 flex-shrink-0">
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
