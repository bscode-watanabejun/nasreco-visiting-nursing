import { useState, useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useSearch } from "wouter"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Plus,
  Search,
  Edit,
  Eye,
  Calendar,
  Clock,
  User,
  FileText,
  AlertCircle,
  ChevronUp,
  ChevronDown,
  Trash2
} from "lucide-react"
import { useCurrentUser } from '@/hooks/useCurrentUser'

import type { Patient, NursingRecord, PaginatedResult } from "@shared/schema"

// Display-specific interface for nursing records with patient/nurse names
interface NursingRecordDisplay extends NursingRecord {
  patientName?: string
  nurseName?: string
}

interface FormData {
  patientId: string
  visitStatusRecord: "pending" | "completed" | "no_show" | "refused" | "cancelled" | "rescheduled"
  actualStartTime: string
  actualEndTime: string
  observations: string
  isSecondVisit: boolean
  bloodPressureSystolic: string
  bloodPressureDiastolic: string
  heartRate: string
  temperature: string
  respiratoryRate: string
  oxygenSaturation: string
  careProvided: string
  nextVisitNotes: string
  // Additional payment fields
  multipleVisitReason: string
  emergencyVisitReason: string
  longVisitReason: string
  // Selected schedule ID (for multiple schedules)
  selectedScheduleId: string
}

// Helper function to get full name
const getFullName = (patient: Patient): string => {
  return `${patient.lastName} ${patient.firstName}`
}

// Helper function to convert FormData to API format (unified with VisitRecordDialog)
const convertFormDataToApiFormat = (formData: FormData, status: 'draft' | 'completed') => {
  const currentDateTime = new Date()
  const today = currentDateTime.toISOString().split('T')[0]

  // 時間をISO文字列に変換
  const startDateTime = new Date(`${today}T${formData.actualStartTime}:00`)
  const endDateTime = new Date(`${today}T${formData.actualEndTime}:00`)

  const apiData: any = {
    patientId: formData.patientId,
    recordType: 'general_care' as const,
    recordDate: currentDateTime.toISOString(),
    status,
    title: `訪問記録 - ${today}`,
    content: `訪問日時: ${today}\n開始時間: ${formData.actualStartTime}\n終了時間: ${formData.actualEndTime}\n訪問ステータス: ${formData.visitStatusRecord}\n\n観察事項:\n${formData.observations}\n\n実施したケア:\n${formData.careProvided}\n\n次回訪問時の申し送り:\n${formData.nextVisitNotes}`,

    // 新規フィールド
    visitStatusRecord: formData.visitStatusRecord,
    actualStartTime: startDateTime.toISOString(),
    actualEndTime: endDateTime.toISOString(),
    isSecondVisit: formData.isSecondVisit,

    // 既存フィールド
    observations: formData.observations,
    interventions: formData.careProvided,
    patientFamilyResponse: formData.nextVisitNotes,

    // バイタルサイン
    ...(formData.bloodPressureSystolic && { bloodPressureSystolic: parseInt(formData.bloodPressureSystolic) }),
    ...(formData.bloodPressureDiastolic && { bloodPressureDiastolic: parseInt(formData.bloodPressureDiastolic) }),
    ...(formData.heartRate && { heartRate: parseInt(formData.heartRate) }),
    ...(formData.temperature && { temperature: formData.temperature }),
    ...(formData.respiratoryRate && { respiratoryRate: parseInt(formData.respiratoryRate) }),
    ...(formData.oxygenSaturation && { oxygenSaturation: parseInt(formData.oxygenSaturation) }),

    // 加算管理フィールド
    ...(formData.multipleVisitReason && { multipleVisitReason: formData.multipleVisitReason }),
    ...(formData.emergencyVisitReason && { emergencyVisitReason: formData.emergencyVisitReason }),
    ...(formData.longVisitReason && { longVisitReason: formData.longVisitReason }),
  }

  return apiData
}

// Helper function to validate required fields (unified with VisitRecordDialog)
const validateFormData = (formData: FormData, isComplete: boolean, selectedPatient?: Patient) => {
  const errors: string[] = []

  if (!formData.patientId) {
    errors.push('患者を選択してください')
  }

  if (!formData.actualStartTime) {
    errors.push('「実際の開始時間」を入力してください')
  }

  if (!formData.actualEndTime) {
    errors.push('「実際の終了時間」を入力してください')
  }

  // Complete record requires additional validation
  if (isComplete) {
    if (!formData.observations.trim()) {
      errors.push('観察事項を入力してください')
    }

    // 加算管理のバリデーション
    if (formData.isSecondVisit && !formData.multipleVisitReason.trim()) {
      errors.push('複数回訪問の理由を入力してください')
    }

    // 長時間訪問チェック
    const startTime = formData.actualStartTime ? new Date(`2000-01-01T${formData.actualStartTime}`) : null
    const endTime = formData.actualEndTime ? new Date(`2000-01-01T${formData.actualEndTime}`) : null
    const duration = startTime && endTime ? (endTime.getTime() - startTime.getTime()) / 1000 / 60 : 0
    if (duration > 90 && !formData.longVisitReason.trim()) {
      errors.push('長時間訪問（90分超）の理由を入力してください')
    }
  }

  return errors
}


const getStatusColor = (status: string) => {
  switch (status) {
    case 'completed': return 'bg-green-100 text-green-800 border-green-200'
    case 'reviewed': return 'bg-blue-100 text-blue-800 border-blue-200'
    case 'draft': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
    default: return 'bg-gray-100 text-gray-800 border-gray-200'
  }
}

const getStatusText = (status: string) => {
  switch (status) {
    case 'completed': return '完成'
    case 'reviewed': return '確認済み'
    case 'draft': return '下書き'
    default: return status
  }
}

// Helper function to get initial form data (unified with VisitRecordDialog)
const getInitialFormData = (): FormData => ({
  patientId: '',
  visitStatusRecord: 'pending',
  actualStartTime: new Date().toTimeString().slice(0, 5),
  actualEndTime: new Date().toTimeString().slice(0, 5),
  observations: '',
  isSecondVisit: false,
  bloodPressureSystolic: '',
  bloodPressureDiastolic: '',
  heartRate: '',
  temperature: '',
  respiratoryRate: '',
  oxygenSaturation: '',
  careProvided: '',
  nextVisitNotes: '',
  multipleVisitReason: '',
  emergencyVisitReason: '',
  longVisitReason: '',
  selectedScheduleId: ''
})

export function NursingRecords() {
  const queryClient = useQueryClient()
  const searchParams = useSearch()
  const { data: currentUser } = useCurrentUser()
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'completed' | 'reviewed'>('all')
  const [selectedRecord, setSelectedRecord] = useState<NursingRecordDisplay | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [activeTab, setActiveTab] = useState<'basic' | 'vitals' | 'care' | 'special' | 'photos'>('basic')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(getInitialFormData())
  const [recordToDelete, setRecordToDelete] = useState<NursingRecordDisplay | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [cameFromUrl, setCameFromUrl] = useState(false)

  // Fetch patients from API
  const { data: patientsData, isLoading: isPatientsLoading } = useQuery<PaginatedResult<Patient>>({
    queryKey: ["patients"],
    queryFn: async () => {
      const response = await fetch("/api/patients")
      if (!response.ok) {
        throw new Error("患者データの取得に失敗しました")
      }
      return response.json()
    },
  })

  // Fetch nursing records from API
  const { data: recordsData, isLoading: isRecordsLoading } = useQuery<PaginatedResult<NursingRecord>>({
    queryKey: ["nursing-records"],
    queryFn: async () => {
      const response = await fetch("/api/nursing-records")
      if (!response.ok) {
        throw new Error("看護記録の取得に失敗しました")
      }
      return response.json()
    },
  })

  // Fetch users data for nurse names
  const { data: usersData } = useQuery<PaginatedResult<any>>({
    queryKey: ["users"],
    queryFn: async () => {
      const response = await fetch("/api/users")
      if (!response.ok) {
        throw new Error("ユーザーデータの取得に失敗しました")
      }
      return response.json()
    },
  })

  const patients = patientsData?.data || []
  const rawRecords = recordsData?.data || []
  const users = usersData?.data || []

  // Fetch today's schedules for the selected patient
  const { data: patientSchedulesData } = useQuery({
    queryKey: ["patientSchedules", formData.patientId],
    queryFn: async () => {
      if (!formData.patientId) return { data: [] }

      // Get today's date range in ISO format (will be interpreted as UTC by server)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)

      const startOfDay = today.toISOString()
      const endOfDay = tomorrow.toISOString()

      const url = `/api/schedules?patientId=${formData.patientId}&startDate=${startOfDay}&endDate=${endOfDay}`
      const response = await fetch(url)
      if (!response.ok) return { data: [] }
      return response.json()
    },
    enabled: !!formData.patientId && (isCreating || isEditing), // Fetch if patient is selected and creating OR editing
  })

  const patientSchedules = (patientSchedulesData?.data || []) as any[]
  const selectedSchedule = patientSchedules.find((s: any) => s.id === formData.selectedScheduleId)

  // Fetch schedule data if scheduleId is in URL
  const urlParams = new URLSearchParams(searchParams)
  const scheduleIdFromUrl = urlParams.get('scheduleId')
  const modeFromUrl = urlParams.get('mode')

  const { data: scheduleFromUrl } = useQuery({
    queryKey: ["schedule", scheduleIdFromUrl],
    queryFn: async () => {
      if (!scheduleIdFromUrl) return null
      const response = await fetch(`/api/schedules/${scheduleIdFromUrl}`)
      if (!response.ok) return null
      return response.json()
    },
    enabled: !!scheduleIdFromUrl,
  })

  // Handle URL parameters for creating/editing from Dashboard
  useEffect(() => {
    if (scheduleIdFromUrl && scheduleFromUrl && modeFromUrl === 'create') {
      // Create new record from schedule (with schedule data)
      const schedule = scheduleFromUrl
      const startTime = schedule.scheduledStartTime ? new Date(schedule.scheduledStartTime) : new Date()
      const endTime = schedule.scheduledEndTime ? new Date(schedule.scheduledEndTime) : new Date()

      setCameFromUrl(true) // Mark that we came from URL
      setIsCreating(true)
      setSelectedRecord(null)
      setFormData({
        ...getInitialFormData(),
        patientId: schedule.patientId || '',
        actualStartTime: startTime.toTimeString().slice(0, 5),
        actualEndTime: endTime.toTimeString().slice(0, 5),
        selectedScheduleId: scheduleIdFromUrl
      })
      setSaveError(null)

      // Clear URL parameters by replacing current history entry
      window.history.replaceState({}, '', '/records')
    } else if (modeFromUrl === 'create' && !scheduleIdFromUrl) {
      // Create new record without schedule (from Dashboard new record button)
      setCameFromUrl(true) // Mark that we came from URL
      setIsCreating(true)
      setSelectedRecord(null)
      setFormData(getInitialFormData())
      setSaveError(null)

      // Clear URL parameters by replacing current history entry
      window.history.replaceState({}, '', '/records')
    }
  }, [scheduleIdFromUrl, scheduleFromUrl, modeFromUrl])

  // Transform records to include patient and nurse names
  const records: NursingRecordDisplay[] = rawRecords.map(record => {
    const patient = patients.find(p => p.id === record.patientId)
    const patientName = patient ? `${patient.lastName} ${patient.firstName}` : '不明'
    const nurse = users.find(u => u.id === record.nurseId)

    return {
      ...record,
      patientName,
      nurseName: nurse?.fullName || '担当者不明'
    }
  })

  const filteredRecords = records.filter(record => {
    const matchesSearch = (record.patientName?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
                         (record.nurseName?.toLowerCase().includes(searchTerm.toLowerCase()) || false)
    const matchesStatus = statusFilter === 'all' || record.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const draftRecords = records.filter(r => r.status === 'draft').length
  const completedRecords = records.filter(r => r.status === 'completed').length
  const reviewedRecords = records.filter(r => r.status === 'reviewed').length

  const handleCreateNew = () => {
    setIsCreating(true)
    setSelectedRecord(null)
    setFormData(getInitialFormData()) // Reset form to initial state
    setSaveError(null) // Clear any previous errors
    console.log('新規記録作成モード')
  }

  const handleViewRecord = (record: NursingRecordDisplay) => {
    setSelectedRecord(record)
    setIsCreating(false)
    setIsEditing(false)
    setSaveError(null)

    // Load record data for view-only display (unified with new format)
    const startTime = record.actualStartTime ? new Date(record.actualStartTime) : new Date()
    const endTime = record.actualEndTime ? new Date(record.actualEndTime) : new Date()

    setFormData({
      patientId: record.patientId,
      visitStatusRecord: (record.visitStatusRecord as 'completed' | 'cancelled' | 'rescheduled') || 'completed',
      actualStartTime: startTime.toTimeString().slice(0, 5),
      actualEndTime: endTime.toTimeString().slice(0, 5),
      observations: record.observations || '',
      isSecondVisit: record.isSecondVisit || false,
      bloodPressureSystolic: record.bloodPressureSystolic?.toString() || '',
      bloodPressureDiastolic: record.bloodPressureDiastolic?.toString() || '',
      heartRate: record.heartRate?.toString() || '',
      temperature: record.temperature?.toString() || '',
      respiratoryRate: record.respiratoryRate?.toString() || '',
      oxygenSaturation: record.oxygenSaturation?.toString() || '',
      careProvided: record.interventions || '',
      nextVisitNotes: record.patientFamilyResponse || '',
      multipleVisitReason: record.multipleVisitReason || '',
      emergencyVisitReason: record.emergencyVisitReason || '',
      longVisitReason: record.longVisitReason || '',
      selectedScheduleId: ''
    })

    console.log('記録表示:', record.id)
  }

  const handleEditRecord = (record: NursingRecordDisplay) => {
    setSelectedRecord(record)
    setIsCreating(false)
    setIsEditing(true)
    setSaveError(null)

    // Load existing record data into form (unified with new format)
    const startTime = record.actualStartTime ? new Date(record.actualStartTime) : new Date()
    const endTime = record.actualEndTime ? new Date(record.actualEndTime) : new Date()

    setFormData({
      patientId: record.patientId,
      visitStatusRecord: (record.visitStatusRecord as 'completed' | 'cancelled' | 'rescheduled') || 'completed',
      actualStartTime: startTime.toTimeString().slice(0, 5),
      actualEndTime: endTime.toTimeString().slice(0, 5),
      observations: record.observations || '',
      isSecondVisit: record.isSecondVisit || false,
      bloodPressureSystolic: record.bloodPressureSystolic?.toString() || '',
      bloodPressureDiastolic: record.bloodPressureDiastolic?.toString() || '',
      heartRate: record.heartRate?.toString() || '',
      temperature: record.temperature?.toString() || '',
      respiratoryRate: record.respiratoryRate?.toString() || '',
      oxygenSaturation: record.oxygenSaturation?.toString() || '',
      careProvided: record.interventions || '',
      nextVisitNotes: record.patientFamilyResponse || '',
      multipleVisitReason: record.multipleVisitReason || '',
      emergencyVisitReason: record.emergencyVisitReason || '',
      longVisitReason: record.longVisitReason || '',
      selectedScheduleId: ''
    })
    console.log('記録編集モード:', record.id)
  }

  // Delete record function
  const handleDeleteRecord = async () => {
    if (!recordToDelete) return

    setIsDeleting(true)
    try {
      const response = await fetch(`/api/nursing-records/${recordToDelete.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error('削除に失敗しました')
      }

      // Refresh the records list
      queryClient.invalidateQueries({ queryKey: ["nursing-records"] })
      alert('記録を削除しました')
      setRecordToDelete(null)
    } catch (error) {
      console.error('Delete error:', error)
      alert('削除中にエラーが発生しました')
    } finally {
      setIsDeleting(false)
    }
  }

  // Save as draft function
  const handleSaveDraft = async () => {
    setSaveError(null)
    setIsSaving(true)

    try {
      const selectedPatient = patients.find(p => p.id === formData.patientId)
      const validationErrors = validateFormData(formData, false, selectedPatient)
      if (validationErrors.length > 0) {
        setSaveError(validationErrors.join('\n'))
        return
      }

      const apiData = convertFormDataToApiFormat(formData, 'draft')
      const response = await fetch('/api/nursing-records', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(apiData),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown server error' }))
        console.error('API Error Details:', error)
        const errorMessage = error.error || error.message || `サーバーエラー (${response.status}): ${response.statusText}`
        throw new Error(errorMessage)
      }

      // Success - invalidate queries and show notification
      await queryClient.invalidateQueries({ queryKey: ["nursing-records"] })
      alert('下書きとして保存しました')
      setFormData(getInitialFormData()) // Reset form after successful save
      setIsCreating(false)
      setSelectedRecord(null)
    } catch (error) {
      console.error('Save draft error:', error)
      console.error('Form data being sent:', convertFormDataToApiFormat(formData, 'draft'))
      setSaveError(error instanceof Error ? error.message : '保存中にエラーが発生しました')
    } finally {
      setIsSaving(false)
    }
  }

  // Complete record function
  const handleCompleteRecord = async () => {
    setSaveError(null)
    setIsSaving(true)

    try {
      const selectedPatient = patients.find(p => p.id === formData.patientId)
      const validationErrors = validateFormData(formData, true, selectedPatient)
      if (validationErrors.length > 0) {
        setSaveError(validationErrors.join('\n'))
        return
      }

      const apiData = convertFormDataToApiFormat(formData, 'completed')

      // If editing, use PUT; if creating, use POST
      const url = isEditing && selectedRecord ? `/api/nursing-records/${selectedRecord.id}` : '/api/nursing-records'
      const method = isEditing && selectedRecord ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(apiData),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown server error' }))
        console.error('API Error Details:', error)
        const errorMessage = error.error || error.message || `サーバーエラー (${response.status}): ${response.statusText}`
        throw new Error(errorMessage)
      }

      // Success - invalidate queries and show notification
      await queryClient.invalidateQueries({ queryKey: ["nursing-records"] })
      alert(isEditing ? '記録を更新しました' : '記録を完成しました')
      setFormData(getInitialFormData()) // Reset form after successful save
      setIsCreating(false)
      setIsEditing(false)
      setSelectedRecord(null)
    } catch (error) {
      console.error('Complete record error:', error)
      console.error('Form data being sent:', convertFormDataToApiFormat(formData, 'completed'))
      setSaveError(error instanceof Error ? error.message : '保存中にエラーが発生しました')
    } finally {
      setIsSaving(false)
    }
  }

  // Update existing record
  const handleUpdateRecord = async (status: 'draft' | 'completed' | 'reviewed') => {
    if (!selectedRecord) return

    setSaveError(null)
    setIsSaving(true)

    try {
      const selectedPatient = patients.find(p => p.id === formData.patientId)
      const validationErrors = validateFormData(formData, status === 'completed' || status === 'reviewed', selectedPatient)
      if (validationErrors.length > 0) {
        setSaveError(validationErrors.join('\n'))
        return
      }

      const apiData = convertFormDataToApiFormat(formData, status as 'draft' | 'completed')

      const response = await fetch(`/api/nursing-records/${selectedRecord.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...apiData, status }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown server error' }))
        console.error('API Error Details:', error)
        const errorMessage = error.error || error.message || `サーバーエラー (${response.status}): ${response.statusText}`
        throw new Error(errorMessage)
      }

      // Success - invalidate queries and show notification
      await queryClient.invalidateQueries({ queryKey: ["nursing-records"] })
      alert('記録を更新しました')
      setFormData(getInitialFormData())
      setIsEditing(false)
      setSelectedRecord(null)
    } catch (error) {
      console.error('Update record error:', error)
      setSaveError(error instanceof Error ? error.message : '更新中にエラーが発生しました')
    } finally {
      setIsSaving(false)
    }
  }

  if (isCreating || selectedRecord) {
    const selectedPatient = patients.find(p => p.id === formData.patientId)

    return (
      <div className="space-y-4 sm:space-y-6 p-3 sm:p-4 lg:p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight truncate">
              {isCreating ? '新規訪問記録登録' : isEditing ? '訪問記録編集' : '訪問記録詳細'}
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              {isCreating ? '新しい訪問記録を登録' : `${selectedRecord?.patientName}さんの記録`}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              if (cameFromUrl) {
                // Came from URL (Dashboard or other page) - use browser history
                window.history.back()
              } else {
                // Came from within this page - reset state to show list
                setIsCreating(false)
                setIsEditing(false)
                setSelectedRecord(null)
                setSaveError(null)
                setCameFromUrl(false)
              }
            }}
            className="w-full sm:w-auto flex-shrink-0"
          >
            戻る
          </Button>
        </div>

        {/* Basic Information Section (unified with VisitRecordDialog) */}
        {(isCreating || isEditing) && (
          <div className="space-y-4 p-4 bg-gray-50 rounded-lg border">
            <h3 className="font-semibold text-base">基本情報</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 患者名 */}
              <div className="space-y-2">
                <Label htmlFor="patient">患者名</Label>
                <Select
                  value={formData.patientId}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, patientId: value }))}
                  disabled={isEditing}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="患者を選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    {patients.map((patient) => (
                      <SelectItem key={patient.id} value={patient.id}>
                        <div className="flex items-center gap-2">
                          <span>{patient.lastName} {patient.firstName}</span>
                          {patient.isCritical && (
                            <Badge className="ml-2 bg-yellow-100 text-yellow-800 text-xs">
                              重要
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 担当者 */}
              <div className="space-y-2">
                <Label>担当者</Label>
                <div className="flex items-center h-10 px-3 border rounded-md bg-gray-100">
                  <span className="text-sm">{currentUser?.fullName || 'ログインユーザー'}</span>
                </div>
              </div>

              {/* 予定時間 */}
              <div className="space-y-2">
                <Label>予定時間</Label>
                {!formData.patientId ? (
                  <div className="flex items-center h-10 px-3 border rounded-md bg-gray-100">
                    <span className="text-sm text-muted-foreground">患者を選択してください</span>
                  </div>
                ) : patientSchedules.length === 0 ? (
                  <div className="flex items-center h-10 px-3 border rounded-md bg-gray-100">
                    <span className="text-sm text-muted-foreground">予定なし（予定外訪問）</span>
                  </div>
                ) : patientSchedules.length === 1 ? (
                  <div className="flex items-center h-10 px-3 border rounded-md bg-gray-100">
                    <span className="text-sm">
                      {patientSchedules[0].scheduledStartTime && patientSchedules[0].scheduledEndTime
                        ? `${new Date(patientSchedules[0].scheduledStartTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} - ${new Date(patientSchedules[0].scheduledEndTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`
                        : '予定時間未設定'}
                    </span>
                  </div>
                ) : (
                  <Select
                    value={formData.selectedScheduleId}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, selectedScheduleId: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="予定を選択してください" />
                    </SelectTrigger>
                    <SelectContent>
                      {patientSchedules.map((sched: any) => (
                        <SelectItem key={sched.id} value={sched.id}>
                          {sched.scheduledStartTime && sched.scheduledEndTime
                            ? `${new Date(sched.scheduledStartTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} - ${new Date(sched.scheduledEndTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`
                            : '予定時間未設定'}
                        </SelectItem>
                      ))}
                      <SelectItem value="none">予定なし（予定外訪問）</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* 訪問ステータス */}
              <div className="space-y-2">
                <Label htmlFor="visit-status">訪問ステータス</Label>
                <Select
                  value={formData.visitStatusRecord}
                  onValueChange={(value: "pending" | "completed" | "no_show" | "refused" | "cancelled" | "rescheduled") =>
                    setFormData(prev => ({ ...prev, visitStatusRecord: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">未実施</SelectItem>
                    <SelectItem value="completed">完了</SelectItem>
                    <SelectItem value="no_show">不在（患者不在）</SelectItem>
                    <SelectItem value="refused">拒否（患者拒否）</SelectItem>
                    <SelectItem value="cancelled">キャンセル</SelectItem>
                    <SelectItem value="rescheduled">日程変更</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 特別管理加算対象患者エリア */}
            {selectedPatient?.isCritical && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm text-yellow-900">特別管理加算対象患者</p>
                    <div className="text-xs text-yellow-800 mt-1">
                      <p>対象項目:</p>
                      <ul className="list-disc list-inside ml-2 mt-1">
                        <li>在宅悪性腫瘍法</li>
                        <li>点滴注射(週3日以上)</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* バリデーションエラー表示 */}
            {saveError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-sm text-red-900">未入力の必須項目があります</p>
                    <ul className="list-disc list-inside text-xs text-red-800 mt-1">
                      {saveError.split('\n').map((error, index) => (
                        <li key={index}>{error}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 5 Tabs */}
        {(isCreating || isEditing) ? (
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)} className="w-full">
            <TabsList className="grid w-full grid-cols-5 h-auto">
              <TabsTrigger value="basic" className="text-xs sm:text-sm py-2">
                基本記録
                <span className="ml-1 text-red-500">●</span>
              </TabsTrigger>
              <TabsTrigger value="vitals" className="text-xs sm:text-sm py-2">
                バイタル
              </TabsTrigger>
              <TabsTrigger value="care" className="text-xs sm:text-sm py-2">
                ケア内容
              </TabsTrigger>
              <TabsTrigger value="special" className="text-xs sm:text-sm py-2">
                特管記録
              </TabsTrigger>
              <TabsTrigger value="photos" className="text-xs sm:text-sm py-2">
                写真・メモ
              </TabsTrigger>
            </TabsList>

            {/* 基本記録タブ */}
            <TabsContent value="basic" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start-time">
                    実際の開始時間 <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="start-time"
                    type="time"
                    value={formData.actualStartTime}
                    onChange={(e) => setFormData(prev => ({ ...prev, actualStartTime: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="end-time">
                    実際の終了時間 <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="end-time"
                    type="time"
                    value={formData.actualEndTime}
                    onChange={(e) => setFormData(prev => ({ ...prev, actualEndTime: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="observations">
                  観察事項 <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="observations"
                  placeholder="患者の状態、変化、気づいた点などを記録してください"
                  value={formData.observations}
                  onChange={(e) => setFormData(prev => ({ ...prev, observations: e.target.value }))}
                  className="min-h-[120px] resize-none"
                />
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="second-visit"
                  checked={formData.isSecondVisit}
                  onChange={(e) => setFormData(prev => ({ ...prev, isSecondVisit: e.target.checked }))}
                  className="w-4 h-4"
                />
                <Label htmlFor="second-visit" className="cursor-pointer">
                  本日2回目以降の訪問
                </Label>
              </div>

              {/* 加算管理セクション */}
              <div className="border-t pt-4 mt-4">
                <h3 className="text-sm font-semibold mb-3">加算管理</h3>
                <div className="space-y-4">
                  {formData.isSecondVisit && (
                    <div className="space-y-2">
                      <Label htmlFor="multiple-visit-reason">
                        複数回訪問の理由 <span className="text-red-500">*</span>
                      </Label>
                      <Textarea
                        id="multiple-visit-reason"
                        placeholder="複数回訪問が必要な理由を記載してください"
                        value={formData.multipleVisitReason}
                        onChange={(e) => setFormData(prev => ({ ...prev, multipleVisitReason: e.target.value }))}
                        className="min-h-[80px] resize-none"
                      />
                    </div>
                  )}

                  {(() => {
                    const startTime = formData.actualStartTime ? new Date(`2000-01-01T${formData.actualStartTime}`) : null
                    const endTime = formData.actualEndTime ? new Date(`2000-01-01T${formData.actualEndTime}`) : null
                    const duration = startTime && endTime ? (endTime.getTime() - startTime.getTime()) / 1000 / 60 : 0
                    return duration > 90 ? (
                      <div className="space-y-2">
                        <Label htmlFor="long-visit-reason">
                          長時間訪問の理由 <span className="text-red-500">*</span>
                        </Label>
                        <Textarea
                          id="long-visit-reason"
                          placeholder="90分を超える訪問が必要な理由を記載してください"
                          value={formData.longVisitReason}
                          onChange={(e) => setFormData(prev => ({ ...prev, longVisitReason: e.target.value }))}
                          className="min-h-[80px] resize-none"
                        />
                        <p className="text-xs text-muted-foreground">
                          訪問時間: {Math.floor(duration)}分
                        </p>
                      </div>
                    ) : null
                  })()}
                </div>
              </div>
            </TabsContent>

            {/* バイタルタブ */}
            <TabsContent value="vitals" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bp">血圧 (mmHg)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="bp-systolic"
                      type="number"
                      placeholder="収縮期"
                      value={formData.bloodPressureSystolic}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        bloodPressureSystolic: e.target.value
                      }))}
                    />
                    <span className="text-muted-foreground">/</span>
                    <Input
                      id="bp-diastolic"
                      type="number"
                      placeholder="拡張期"
                      value={formData.bloodPressureDiastolic}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        bloodPressureDiastolic: e.target.value
                      }))}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="heart-rate">脈拍 (回/分)</Label>
                  <Input
                    id="heart-rate"
                    type="number"
                    placeholder="例: 72"
                    value={formData.heartRate}
                    onChange={(e) => setFormData(prev => ({ ...prev, heartRate: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="temperature">体温 (°C)</Label>
                  <Input
                    id="temperature"
                    type="number"
                    step="0.1"
                    placeholder="例: 36.5"
                    value={formData.temperature}
                    onChange={(e) => setFormData(prev => ({ ...prev, temperature: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="respiratory-rate">呼吸数 (回/分)</Label>
                  <Input
                    id="respiratory-rate"
                    type="number"
                    placeholder="例: 18"
                    value={formData.respiratoryRate}
                    onChange={(e) => setFormData(prev => ({ ...prev, respiratoryRate: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="spo2">酸素飽和度 (%)</Label>
                  <Input
                    id="spo2"
                    type="number"
                    placeholder="例: 98"
                    value={formData.oxygenSaturation}
                    onChange={(e) => setFormData(prev => ({ ...prev, oxygenSaturation: e.target.value }))}
                  />
                </div>
              </div>
            </TabsContent>

            {/* ケア内容タブ */}
            <TabsContent value="care" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="care-provided">実施したケア内容</Label>
                <Textarea
                  id="care-provided"
                  placeholder="実施した看護ケア、処置、指導内容などを記録してください"
                  value={formData.careProvided}
                  onChange={(e) => setFormData(prev => ({ ...prev, careProvided: e.target.value }))}
                  className="min-h-[120px] resize-none"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="next-visit-notes">次回訪問時の申し送り</Label>
                <Textarea
                  id="next-visit-notes"
                  placeholder="次回訪問時に注意すべき点、継続すべきケアなどを記録してください"
                  value={formData.nextVisitNotes}
                  onChange={(e) => setFormData(prev => ({ ...prev, nextVisitNotes: e.target.value }))}
                  className="min-h-[120px] resize-none"
                />
              </div>
            </TabsContent>

            {/* 特管記録タブ（保留） */}
            <TabsContent value="special" className="mt-4">
              <div className="p-8 text-center text-muted-foreground border-2 border-dashed rounded-lg">
                <p className="text-sm">特別管理加算記録機能は準備中です</p>
              </div>
            </TabsContent>

            {/* 写真・メモタブ（保留） */}
            <TabsContent value="photos" className="mt-4">
              <div className="p-8 text-center text-muted-foreground border-2 border-dashed rounded-lg">
                <p className="text-sm">写真・メモ機能は準備中です</p>
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          // View-only mode
          <div className="space-y-6">
            {renderDetailContent(selectedRecord, formData, selectedPatient, users, currentUser)}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row justify-end gap-2 pt-6 border-t">
          {isCreating ? (
            <>
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={handleSaveDraft}
                disabled={isSaving}
              >
                {isSaving ? '保存中...' : '下書き保存'}
              </Button>
              <Button
                className="w-full sm:w-auto"
                onClick={handleCompleteRecord}
                disabled={isSaving}
              >
                {isSaving ? '保存中...' : '記録完成'}
              </Button>
            </>
          ) : isEditing ? (
            <>
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => handleUpdateRecord('draft')}
                disabled={isSaving}
              >
                {isSaving ? '保存中...' : '下書きとして保存'}
              </Button>
              <Button
                className="w-full sm:w-auto"
                onClick={() => handleUpdateRecord('completed')}
                disabled={isSaving}
              >
                {isSaving ? '保存中...' : '完成として保存'}
              </Button>
            </>
          ) : (
            <>
              {selectedRecord?.status === 'draft' && (
                <Button
                  className="w-full sm:w-auto"
                  onClick={() => handleEditRecord(selectedRecord)}
                >
                  編集
                </Button>
              )}
              {selectedRecord?.status === 'completed' && (
                <Button
                  className="w-full sm:w-auto"
                  onClick={() => handleUpdateRecord('reviewed')}
                  disabled={isSaving}
                >
                  {isSaving ? '処理中...' : '確認済みにする'}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">訪問記録</h1>
          <p className="text-muted-foreground">訪問看護記録の管理と作成</p>
        </div>
        <Button onClick={handleCreateNew} data-testid="button-create-record">
          <Plus className="mr-2 h-4 w-4" />
          新規記録登録
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">下書き</CardTitle>
            <FileText className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{draftRecords}件</div>
            <p className="text-xs text-muted-foreground">
              作成中の記録
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">完成</CardTitle>
            <FileText className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{completedRecords}件</div>
            <p className="text-xs text-muted-foreground">
              作成完了済み
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">確認済み</CardTitle>
            <FileText className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{reviewedRecords}件</div>
            <p className="text-xs text-muted-foreground">
              管理者確認済み
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Records List */}
      <Card>
        <CardHeader>
          <CardTitle>記録一覧</CardTitle>
          <CardDescription>作成済みの訪問看護記録</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="患者名または看護師名で検索..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 placeholder:text-gray-400"
                data-testid="input-record-search"
              />
            </div>
            <div className="flex gap-2">
              <Button 
                variant={statusFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('all')}
              >
                全て
              </Button>
              <Button 
                variant={statusFilter === 'draft' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('draft')}
              >
                下書き
              </Button>
              <Button 
                variant={statusFilter === 'completed' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('completed')}
              >
                完成
              </Button>
              <Button 
                variant={statusFilter === 'reviewed' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('reviewed')}
              >
                確認済み
              </Button>
            </div>
          </div>
          
          {/* Records */}
          <div className="space-y-4">
            {filteredRecords.map((record) => (
              <div key={record.id} className="border rounded-lg p-4 hover-elevate">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-lg">{record.patientName}</h3>
                      <Badge className={getStatusColor(record.status)}>
                        {getStatusText(record.status)}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(record.recordDate).toLocaleDateString('ja-JP')}
                        </div>
                        {record.visitTime && (
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(record.visitTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {record.nurseName}
                        </div>
                      </div>
                      {record.visitTypeCategory && <p>訪問種別: {record.visitTypeCategory}</p>}
                      {record.observations && <p className="truncate max-w-md">観察: {record.observations}</p>}
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleViewRecord(record)}
                      data-testid={`button-view-${record.id}`}
                    >
                      <Eye className="mr-1 h-3 w-3" />
                      詳細
                    </Button>
                    {record.status === 'draft' && (
                      <Button
                        size="sm"
                        onClick={() => handleEditRecord(record)}
                        data-testid={`button-edit-${record.id}`}
                      >
                        <Edit className="mr-1 h-3 w-3" />
                        編集
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setRecordToDelete(record)}
                      data-testid={`button-delete-${record.id}`}
                    >
                      <Trash2 className="mr-1 h-3 w-3" />
                      削除
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {isRecordsLoading && (
            <div className="text-center py-8 text-muted-foreground">
              <p>記録を読み込み中...</p>
            </div>
          )}

          {!isRecordsLoading && filteredRecords.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>条件に一致する記録が見つかりません</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!recordToDelete} onOpenChange={(open) => !open && setRecordToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>訪問記録を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              {recordToDelete && (
                <div className="space-y-2">
                  <p>以下の記録を削除します。この操作は取り消せません。</p>
                  <div className="bg-muted p-3 rounded-md text-sm space-y-1">
                    <p><span className="font-medium">患者名:</span> {recordToDelete.patientName}</p>
                    <p><span className="font-medium">訪問日時:</span> {recordToDelete.visitTime ? new Date(recordToDelete.visitTime).toLocaleString('ja-JP') : '未設定'}</p>
                    <p><span className="font-medium">訪問理由:</span> {recordToDelete.visitTypeCategory || '未設定'}</p>
                  </div>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteRecord}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? '削除中...' : '削除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// Helper function to render preview content
function renderDetailContent(
  record: NursingRecordDisplay | null,
  formData: FormData,
  selectedPatient: Patient | undefined,
  users: any[],
  currentUser: any
) {
  const nurse = record ? users.find(u => u.id === record.nurseId) : null
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft': return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">下書き</Badge>
      case 'completed': return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">完成</Badge>
      case 'reviewed': return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">承認済み</Badge>
      default: return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="space-y-4">
      {/* Status Header */}
      {record && (
        <div className="flex items-center justify-between pb-4 border-b">
          <div className="flex items-center gap-3">
            {getStatusBadge(record.status)}
            <span className="text-sm text-muted-foreground">
              作成日時: {record.createdAt ? new Date(record.createdAt).toLocaleString('ja-JP') : '不明'}
            </span>
          </div>
        </div>
      )}

      {/* Basic Information Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">基本情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium text-muted-foreground">患者名:</span>
              <p className="mt-1">{selectedPatient ? getFullName(selectedPatient) : '患者未選択'}</p>
            </div>
            <div>
              <span className="font-medium text-muted-foreground">担当看護師:</span>
              <p className="mt-1">{nurse?.fullName || currentUser?.fullName || '不明'}</p>
            </div>
            <div>
              <span className="font-medium text-muted-foreground">訪問ステータス:</span>
              <p className="mt-1">
                {formData.visitStatusRecord === 'pending' ? '未実施' :
                 formData.visitStatusRecord === 'completed' ? '完了' :
                 formData.visitStatusRecord === 'no_show' ? '不在（患者不在）' :
                 formData.visitStatusRecord === 'refused' ? '拒否（患者拒否）' :
                 formData.visitStatusRecord === 'cancelled' ? 'キャンセル' : '日程変更'}
              </p>
            </div>
            <div>
              <span className="font-medium text-muted-foreground">2回目以降の訪問:</span>
              <p className="mt-1">{formData.isSecondVisit ? 'はい' : 'いいえ'}</p>
            </div>
            <div>
              <span className="font-medium text-muted-foreground">訪問開始時間:</span>
              <p className="mt-1">{formData.actualStartTime || '未入力'}</p>
            </div>
            <div>
              <span className="font-medium text-muted-foreground">訪問終了時間:</span>
              <p className="mt-1">{formData.actualEndTime || '未入力'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Vital Signs Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">バイタルサイン</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-sm">
            <div>
              <span className="font-medium text-muted-foreground block mb-1">体温</span>
              <p className="text-lg">{formData.temperature ? `${formData.temperature}°C` : '―'}</p>
            </div>
            <div>
              <span className="font-medium text-muted-foreground block mb-1">脈拍</span>
              <p className="text-lg">{formData.heartRate ? `${formData.heartRate}回/分` : '―'}</p>
            </div>
            <div>
              <span className="font-medium text-muted-foreground block mb-1">収縮期血圧</span>
              <p className="text-lg">{formData.bloodPressureSystolic ? `${formData.bloodPressureSystolic}mmHg` : '―'}</p>
            </div>
            <div>
              <span className="font-medium text-muted-foreground block mb-1">拡張期血圧</span>
              <p className="text-lg">{formData.bloodPressureDiastolic ? `${formData.bloodPressureDiastolic}mmHg` : '―'}</p>
            </div>
            <div>
              <span className="font-medium text-muted-foreground block mb-1">SpO2</span>
              <p className="text-lg">{formData.oxygenSaturation ? `${formData.oxygenSaturation}%` : '―'}</p>
            </div>
            <div>
              <span className="font-medium text-muted-foreground block mb-1">呼吸数</span>
              <p className="text-lg">{formData.respiratoryRate ? `${formData.respiratoryRate}回/分` : '―'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Nursing Records Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">看護記録</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <span className="font-medium text-muted-foreground block mb-2">観察事項</span>
            <div className="bg-gray-50 rounded-md p-3 min-h-[60px]">
              <p className="text-sm whitespace-pre-wrap">{formData.observations || '記載なし'}</p>
            </div>
          </div>
          <div>
            <span className="font-medium text-muted-foreground block mb-2">実施したケア内容</span>
            <div className="bg-gray-50 rounded-md p-3 min-h-[60px]">
              <p className="text-sm whitespace-pre-wrap">{formData.careProvided || '記載なし'}</p>
            </div>
          </div>
          <div>
            <span className="font-medium text-muted-foreground block mb-2">次回訪問時の申し送り</span>
            <div className="bg-gray-50 rounded-md p-3 min-h-[60px]">
              <p className="text-sm whitespace-pre-wrap">{formData.nextVisitNotes || '記載なし'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Special Management Records Card */}
      {(formData.multipleVisitReason || formData.emergencyVisitReason || formData.longVisitReason) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">特別管理加算記録</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {formData.multipleVisitReason && (
              <div>
                <span className="font-medium text-muted-foreground block mb-2">複数回訪問加算の理由</span>
                <div className="bg-gray-50 rounded-md p-3">
                  <p className="text-sm whitespace-pre-wrap">{formData.multipleVisitReason}</p>
                </div>
              </div>
            )}
            {formData.emergencyVisitReason && (
              <div>
                <span className="font-medium text-muted-foreground block mb-2">緊急訪問看護加算の理由</span>
                <div className="bg-gray-50 rounded-md p-3">
                  <p className="text-sm whitespace-pre-wrap">{formData.emergencyVisitReason}</p>
                </div>
              </div>
            )}
            {formData.longVisitReason && (
              <div>
                <span className="font-medium text-muted-foreground block mb-2">長時間訪問看護加算の理由</span>
                <div className="bg-gray-50 rounded-md p-3">
                  <p className="text-sm whitespace-pre-wrap">{formData.longVisitReason}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}