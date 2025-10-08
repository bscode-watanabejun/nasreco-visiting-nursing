import { useState, useEffect, useRef } from "react"
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
  Trash2,
  Camera,
  Upload,
  X,
  Image as ImageIcon,
  Loader2,
  Download,
  ZoomIn,
  ExternalLink
} from "lucide-react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useToast } from "@/hooks/use-toast"

import type { Patient, NursingRecord, PaginatedResult, NursingRecordAttachment, DoctorOrder, ServiceCarePlan } from "@shared/schema"

// Type definitions for special management (API response)
type SpecialManagementField = {
  id: string
  definitionId: string
  fieldName: string
  fieldLabel: string
  fieldType: "text" | "number" | "select" | "textarea"
  fieldOptions: { options?: string[] } | null
  isRequired: boolean
  displayOrder: number
}

type SpecialManagementDefinition = {
  id: string
  category: string
  displayName: string
  insuranceType: "medical_5000" | "medical_2500" | "care_500" | "care_250"
  monthlyPoints: number
  description: string | null
  displayOrder: number
  isActive: boolean
  fields?: SpecialManagementField[]
}

// Display-specific interface for nursing records with patient/nurse names
interface NursingRecordDisplay extends NursingRecord {
  patientName?: string
  nurseName?: string
}

interface FormData {
  patientId: string
  recordType: "vital_signs" | "medication" | "wound_care" | "general_care" | "assessment"
  visitDate: string // 訪問日 (YYYY-MM-DD format)
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
  // Special management record data
  specialManagementData: Record<string, any>
}

// Helper function to get full name
const getFullName = (patient: Patient): string => {
  return `${patient.lastName} ${patient.firstName}`
}

// Helper function to convert FormData to API format (unified with VisitRecordDialog)
const convertFormDataToApiFormat = (formData: FormData, status: 'draft' | 'completed') => {
  const currentDateTime = new Date()
  const visitDate = formData.visitDate // Use the visit date from form

  // 時間をISO文字列に変換
  const startDateTime = new Date(`${visitDate}T${formData.actualStartTime}:00`)
  const endDateTime = new Date(`${visitDate}T${formData.actualEndTime}:00`)

  const apiData: any = {
    patientId: formData.patientId,
    recordType: formData.recordType,
    recordDate: currentDateTime.toISOString(),
    visitDate: visitDate, // Add visit date
    status,
    title: `訪問記録 - ${visitDate}`,
    content: `訪問日時: ${visitDate}\n開始時間: ${formData.actualStartTime}\n終了時間: ${formData.actualEndTime}\n訪問ステータス: ${formData.visitStatusRecord}\n\n観察事項:\n${formData.observations}\n\n実施したケア:\n${formData.careProvided}\n\n次回訪問時の申し送り:\n${formData.nextVisitNotes}`,

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

    // 特別管理記録データ
    ...(Object.keys(formData.specialManagementData).length > 0 && {
      specialManagementData: formData.specialManagementData
    }),

    // スケジュールIDの紐付け
    ...(formData.selectedScheduleId && formData.selectedScheduleId !== 'none' ? { scheduleId: formData.selectedScheduleId } : {})
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
  recordType: 'general_care',
  visitDate: new Date().toISOString().split('T')[0], // Default to today
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
  selectedScheduleId: '',
  specialManagementData: {}
})

export function NursingRecords() {
  const queryClient = useQueryClient()
  const searchParams = useSearch()
  const { data: currentUser } = useCurrentUser()
  const { toast } = useToast()
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

  // File attachments state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [filePreviews, setFilePreviews] = useState<string[]>([])
  const [fileCaptions, setFileCaptions] = useState<{ [key: number]: string }>({})
  const [isUploading, setIsUploading] = useState(false)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxImage, setLightboxImage] = useState<NursingRecordAttachment | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState(0)

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

  // Fetch doctor orders for selected patient
  const { data: doctorOrders = [] } = useQuery<DoctorOrder[]>({
    queryKey: ["doctor-orders", formData.patientId],
    queryFn: async () => {
      if (!formData.patientId) return []
      const response = await fetch(`/api/doctor-orders?patientId=${formData.patientId}`)
      if (!response.ok) return []
      return response.json()
    },
    enabled: !!formData.patientId && (isCreating || isEditing),
  })

  // Fetch service care plans for selected patient
  const { data: serviceCarePlans = [] } = useQuery<ServiceCarePlan[]>({
    queryKey: ["/api/service-care-plans", formData.patientId],
    queryFn: async () => {
      if (!formData.patientId) return []
      const response = await fetch(`/api/service-care-plans?patientId=${formData.patientId}`)
      if (!response.ok) return []
      return response.json()
    },
    enabled: !!formData.patientId && (isCreating || isEditing),
  })

  // Fetch special management definitions
  const { data: specialManagementDefinitions = [] } = useQuery<SpecialManagementDefinition[]>({
    queryKey: ["/api/special-management-definitions"],
    queryFn: async () => {
      const response = await fetch("/api/special-management-definitions")
      if (!response.ok) return []
      return response.json()
    },
    enabled: isCreating || isEditing,
  })

  // Filter active doctor orders (not expired)
  const activeDoctorOrders = doctorOrders.filter(order =>
    new Date(order.endDate) >= new Date()
  ).sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime())

  // Get latest service care plan
  const latestCarePlan = serviceCarePlans.length > 0
    ? serviceCarePlans.sort((a, b) => new Date(b.planDate).getTime() - new Date(a.planDate).getTime())[0]
    : null

  // Fetch schedule data if scheduleId is in URL
  const urlParams = new URLSearchParams(searchParams)
  const scheduleIdFromUrl = urlParams.get('scheduleId')
  const patientIdFromUrl = urlParams.get('patientId')
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

  // Fetch schedules for the selected patient on the visit date
  const { data: patientSchedulesData } = useQuery({
    queryKey: ["patientSchedules", formData.patientId, formData.visitDate],
    queryFn: async () => {
      if (!formData.patientId || !formData.visitDate) return { data: [] }

      // Get the visit date range in ISO format
      const visitDate = new Date(formData.visitDate)
      visitDate.setHours(0, 0, 0, 0)
      const nextDay = new Date(visitDate)
      nextDay.setDate(nextDay.getDate() + 1)

      const startOfDay = visitDate.toISOString()
      const endOfDay = nextDay.toISOString()

      const url = `/api/schedules?patientId=${formData.patientId}&startDate=${startOfDay}&endDate=${endOfDay}`
      const response = await fetch(url)
      if (!response.ok) return { data: [] }
      return response.json()
    },
    enabled: !!formData.patientId && !!formData.visitDate && (isCreating || isEditing), // Fetch if patient and visit date are selected
  })

  const patientSchedules = (patientSchedulesData?.data || []) as any[]

  // Fetch the selected schedule if it exists and is not in patientSchedules
  const { data: selectedScheduleData } = useQuery({
    queryKey: ["selectedSchedule", formData.selectedScheduleId],
    queryFn: async () => {
      if (!formData.selectedScheduleId) return null
      const response = await fetch(`/api/schedules/${formData.selectedScheduleId}`)
      if (!response.ok) return null
      return response.json()
    },
    enabled: !!formData.selectedScheduleId && !patientSchedules.find((s: any) => s.id === formData.selectedScheduleId),
  })

  // Combine schedules: if we have selectedScheduleData and it's not in patientSchedules, add it
  const allSchedules = selectedScheduleData && !patientSchedules.find((s: any) => s.id === selectedScheduleData.id)
    ? [selectedScheduleData, ...patientSchedules]
    : patientSchedules

  const selectedSchedule = allSchedules.find((s: any) => s.id === formData.selectedScheduleId)

  // Reset schedule selection when visit date or patient changes
  useEffect(() => {
    if ((isCreating || isEditing) && formData.selectedScheduleId) {
      // Check if the currently selected schedule is still in the list
      const isStillValid = allSchedules.some((s: any) => s.id === formData.selectedScheduleId)
      if (!isStillValid) {
        setFormData(prev => ({
          ...prev,
          selectedScheduleId: ''
        }))
      }
    }
  }, [formData.visitDate, formData.patientId])

  // Auto-select schedule when only one is available
  useEffect(() => {
    if (allSchedules.length === 1 && !formData.selectedScheduleId && (isCreating || isEditing)) {
      setFormData(prev => ({
        ...prev,
        selectedScheduleId: allSchedules[0].id
      }))
    }
  }, [allSchedules, formData.selectedScheduleId, isCreating, isEditing])

  // Fetch attachments for selected record
  const { data: attachments = [], isLoading: isLoadingAttachments } = useQuery<NursingRecordAttachment[]>({
    queryKey: ["nursing-record-attachments", selectedRecord?.id],
    queryFn: async () => {
      if (!selectedRecord?.id) return []
      const response = await fetch(`/api/nursing-records/${selectedRecord.id}/attachments`)
      if (!response.ok) return []
      return response.json()
    },
    enabled: !!selectedRecord?.id && !isCreating,
  })

  // Handle URL parameters for creating/editing from Dashboard
  useEffect(() => {
    if (scheduleIdFromUrl && scheduleFromUrl && modeFromUrl === 'create') {
      // Create new record from schedule (with schedule data)
      const schedule = scheduleFromUrl
      const startTime = schedule.scheduledStartTime ? new Date(schedule.scheduledStartTime) : new Date()
      const endTime = schedule.scheduledEndTime ? new Date(schedule.scheduledEndTime) : new Date()
      const visitDate = schedule.scheduledDate ? new Date(schedule.scheduledDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]

      setCameFromUrl(true) // Mark that we came from URL
      setIsCreating(true)
      setSelectedRecord(null)
      setFormData({
        ...getInitialFormData(),
        patientId: patientIdFromUrl || schedule.patientId || '',
        visitDate: visitDate, // Set visit date from schedule
        actualStartTime: startTime.toTimeString().slice(0, 5),
        actualEndTime: endTime.toTimeString().slice(0, 5),
        emergencyVisitReason: schedule.visitType === '緊急訪問' ? '緊急訪問のため' : '',
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
  }, [scheduleIdFromUrl, scheduleFromUrl, modeFromUrl, patientIdFromUrl])

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
    setSelectedFiles([])
    setFilePreviews([])
    setFileCaptions({})
  }

  const handleViewRecord = (record: NursingRecordDisplay) => {
    setSelectedRecord(record)
    setIsCreating(false)
    setIsEditing(false)
    setSaveError(null)
    setSelectedFiles([])
    setFilePreviews([])
    setFileCaptions({})

    // Load record data for view-only display (unified with new format)
    const startTime = record.actualStartTime ? new Date(record.actualStartTime) : new Date()
    const endTime = record.actualEndTime ? new Date(record.actualEndTime) : new Date()

    setFormData({
      patientId: record.patientId,
      recordType: (record.recordType as 'vital_signs' | 'medication' | 'wound_care' | 'general_care' | 'assessment') || 'general_care',
      visitDate: record.visitDate || new Date().toISOString().split('T')[0],
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
      selectedScheduleId: '',
      specialManagementData: (record.specialManagementData as Record<string, any>) || {}
    })

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
      recordType: (record.recordType as 'vital_signs' | 'medication' | 'wound_care' | 'general_care' | 'assessment') || 'general_care',
      visitDate: record.visitDate || new Date().toISOString().split('T')[0],
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
      selectedScheduleId: '',
      specialManagementData: (record.specialManagementData as Record<string, any>) || {}
    })
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
      toast({
        title: "削除完了",
        description: "記録を削除しました",
      })
      setRecordToDelete(null)
    } catch (error) {
      console.error('Delete error:', error)
      toast({
        title: "エラー",
        description: "削除中にエラーが発生しました",
        variant: "destructive",
      })
    } finally {
      setIsDeleting(false)
    }
  }

  // Upload attachments function
  const uploadAttachments = async (recordId: string) => {
    if (selectedFiles.length === 0) return

    setIsUploading(true)
    try {
      const formData = new FormData()
      selectedFiles.forEach(file => {
        formData.append('files', file)
      })

      // Add captions as JSON
      const captionsArray = selectedFiles.map((_, index) => fileCaptions[index] || '')
      formData.append('captions', JSON.stringify(captionsArray))

      const response = await fetch(`/api/nursing-records/${recordId}/attachments`, {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error('ファイルのアップロードに失敗しました')
      }

      toast({
        title: "アップロード完了",
        description: `${selectedFiles.length}件のファイルをアップロードしました`
      })

    } catch (error) {
      console.error('Upload error:', error)
      toast({
        title: "エラー",
        description: "ファイルのアップロードに失敗しました",
        variant: "destructive"
      })
    } finally {
      setIsUploading(false)
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

      const savedRecord = await response.json()

      // Upload attachments if any files are selected
      if (selectedFiles.length > 0 && savedRecord.id) {
        await uploadAttachments(savedRecord.id)
      }

      // Success - invalidate queries and show notification
      await queryClient.invalidateQueries({ queryKey: ["nursing-records"] })
      toast({
        title: "保存完了",
        description: "下書きとして保存しました",
      })
      setFormData(getInitialFormData()) // Reset form after successful save
      setSelectedFiles([])
      setFilePreviews([])
      setFileCaptions({})
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

      const savedRecord = await response.json()

      // Upload attachments if any files are selected
      if (selectedFiles.length > 0 && savedRecord.id) {
        await uploadAttachments(savedRecord.id)
      }

      // 訪問ステータスが「完了」の場合、スケジュールのステータスも更新
      if (formData.visitStatusRecord === 'completed' && formData.selectedScheduleId && formData.selectedScheduleId !== 'none') {
        try {
          const statusResponse = await fetch(`/api/schedules/${formData.selectedScheduleId}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "completed" }),
          })
          if (!statusResponse.ok) {
            console.error('スケジュールステータスの更新に失敗しました')
          }
        } catch (error) {
          console.error('スケジュールステータス更新エラー:', error)
        }
      }

      // Success - invalidate queries and show notification
      await queryClient.invalidateQueries({ queryKey: ["nursing-records"] })
      await queryClient.invalidateQueries({ queryKey: ["todaySchedules"] })
      await queryClient.invalidateQueries({ queryKey: ["schedules"] })
      toast({
        title: "保存完了",
        description: isEditing ? '記録を更新しました' : '記録を完成しました',
      })
      setFormData(getInitialFormData()) // Reset form after successful save
      setSelectedFiles([])
      setFilePreviews([])
      setFileCaptions({})
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

      const updatedRecord = await response.json()

      // Upload attachments if any files are selected
      if (selectedFiles.length > 0 && updatedRecord.id) {
        await uploadAttachments(updatedRecord.id)
      }

      // Success - invalidate queries and show notification
      await queryClient.invalidateQueries({ queryKey: ["nursing-records"] })
      await queryClient.invalidateQueries({ queryKey: ["nursing-record-attachments", selectedRecord.id] })
      toast({
        title: "更新完了",
        description: "記録を更新しました",
      })
      setFormData(getInitialFormData())
      setSelectedFiles([])
      setFilePreviews([])
      setFileCaptions({})
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
      <>
      <div className="space-y-4 sm:space-y-6 p-3 sm:p-4 lg:p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight truncate">
              {isCreating ? '新規訪問記録登録' : isEditing ? '訪問記録編集' : '訪問記録詳細'}
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              {isCreating ? (
                formData.selectedScheduleId ? (
                  <span className="flex items-center gap-2">
                    新しい訪問記録を登録
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                      スケジュール連携
                    </Badge>
                  </span>
                ) : (
                  '新しい訪問記録を登録'
                )
              ) : (
                `${selectedRecord?.patientName}さんの記録`
              )}
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

              {/* 訪問日 */}
              <div className="space-y-2">
                <Label htmlFor="visitDate">訪問日 <span className="text-red-500">*</span></Label>
                <Input
                  id="visitDate"
                  type="date"
                  value={formData.visitDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, visitDate: e.target.value }))}
                  disabled={!isCreating && !isEditing}
                />
              </div>

              {/* 予定時間 */}
              <div className="space-y-2">
                <Label>予定時間</Label>
                {!formData.patientId ? (
                  <div className="flex items-center h-10 px-3 border rounded-md bg-gray-100">
                    <span className="text-sm text-muted-foreground">患者を選択してください</span>
                  </div>
                ) : allSchedules.length === 0 ? (
                  <div className="flex items-center h-10 px-3 border rounded-md bg-gray-100">
                    <span className="text-sm text-muted-foreground">予定なし（予定外訪問）</span>
                  </div>
                ) : allSchedules.length === 1 ? (
                  <div className="space-y-1">
                    <div className="flex items-center h-10 px-3 border rounded-md bg-gray-100">
                      <span className="text-sm">
                        {allSchedules[0].scheduledStartTime && allSchedules[0].scheduledEndTime
                          ? `${new Date(allSchedules[0].scheduledStartTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} - ${new Date(allSchedules[0].scheduledEndTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`
                          : '予定時間未設定'}
                      </span>
                    </div>
                    {formData.selectedScheduleId && (
                      <p className="text-xs text-blue-600">
                        ✓ スケジュールID: {formData.selectedScheduleId}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Select
                      value={formData.selectedScheduleId}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, selectedScheduleId: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="予定を選択してください" />
                      </SelectTrigger>
                      <SelectContent>
                        {allSchedules.map((sched: any) => (
                          <SelectItem key={sched.id} value={sched.id}>
                            {sched.scheduledStartTime && sched.scheduledEndTime
                              ? `${new Date(sched.scheduledStartTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} - ${new Date(sched.scheduledEndTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`
                              : '予定時間未設定'}
                          </SelectItem>
                        ))}
                        <SelectItem value="none">予定なし（予定外訪問）</SelectItem>
                      </SelectContent>
                    </Select>
                    {formData.selectedScheduleId && formData.selectedScheduleId !== 'none' && (
                      <p className="text-xs text-blue-600">
                        ✓ スケジュールID: {formData.selectedScheduleId}
                      </p>
                    )}
                  </div>
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

              {/* 記録タイプ */}
              <div className="space-y-2">
                <Label htmlFor="recordType">記録タイプ <span className="text-red-500">*</span></Label>
                <Select
                  value={formData.recordType}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, recordType: value as any }))}
                  disabled={!isCreating && !isEditing}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="記録タイプを選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general_care">一般ケア</SelectItem>
                    <SelectItem value="vital_signs">バイタルサイン測定</SelectItem>
                    <SelectItem value="medication">服薬管理</SelectItem>
                    <SelectItem value="wound_care">創傷処置</SelectItem>
                    <SelectItem value="assessment">アセスメント</SelectItem>
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

        {/* Detail View (Read-only) */}
        {!isCreating && !isEditing && selectedRecord && (
          <div className="space-y-6">
            {/* Basic Information Card */}
            <Card>
              <CardHeader>
                <CardTitle>基本情報</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">患者名</p>
                    <p className="text-lg font-semibold">{selectedRecord.patientName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">担当看護師</p>
                    <p className="text-lg font-semibold">{selectedRecord.nurseName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">訪問日</p>
                    <p className="text-2xl font-bold text-blue-600">
                      {selectedRecord.visitDate ? new Date(selectedRecord.visitDate).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }) : new Date(selectedRecord.recordDate).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">訪問ステータス</p>
                    <Badge className="text-sm">
                      {selectedRecord.visitStatusRecord === 'completed' ? '完了' :
                       selectedRecord.visitStatusRecord === 'no_show' ? '不在' :
                       selectedRecord.visitStatusRecord === 'refused' ? '拒否' :
                       selectedRecord.visitStatusRecord === 'cancelled' ? 'キャンセル' :
                       selectedRecord.visitStatusRecord === 'rescheduled' ? '日程変更' :
                       '保留中'}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">記録タイプ</p>
                    <p className="text-base">
                      {selectedRecord.recordType === 'vital_signs' ? 'バイタルサイン' :
                       selectedRecord.recordType === 'medication' ? '服薬管理' :
                       selectedRecord.recordType === 'wound_care' ? '創傷ケア' :
                       selectedRecord.recordType === 'assessment' ? 'アセスメント' :
                       '一般ケア'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">記録ステータス</p>
                    <Badge className={getStatusColor(selectedRecord.status)}>
                      {getStatusText(selectedRecord.status)}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">記録作成日時</p>
                    <p className="text-base">{new Date(selectedRecord.recordDate).toLocaleString('ja-JP')}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">最終更新日時</p>
                    <p className="text-base">{selectedRecord.updatedAt ? new Date(selectedRecord.updatedAt).toLocaleString('ja-JP') : '―'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Visit Time Card */}
            <Card>
              <CardHeader>
                <CardTitle>訪問時間</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {selectedRecord.scheduleId && (
                    <div className="md:col-span-2">
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className="h-4 w-4 text-blue-600" />
                        <p className="text-sm font-medium text-blue-600">予定時間（スケジュール連携）</p>
                      </div>
                      <p className="text-lg text-muted-foreground">
                        {/* Schedule time will be fetched if needed */}
                        スケジュール連携あり
                      </p>
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="h-4 w-4 text-green-600" />
                      <p className="text-sm font-medium text-green-600">実際の訪問開始時間</p>
                    </div>
                    <p className="text-2xl font-bold">
                      {selectedRecord.actualStartTime ? new Date(selectedRecord.actualStartTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '未設定'}
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="h-4 w-4 text-orange-600" />
                      <p className="text-sm font-medium text-orange-600">実際の訪問終了時間</p>
                    </div>
                    <p className="text-2xl font-bold">
                      {selectedRecord.actualEndTime ? new Date(selectedRecord.actualEndTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '未設定'}
                    </p>
                  </div>
                  {selectedRecord.isSecondVisit && (
                    <div className="md:col-span-2">
                      <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                        本日2回目以降の訪問
                      </Badge>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Vital Signs Card */}
            {(selectedRecord.bloodPressureSystolic || selectedRecord.heartRate || (selectedRecord.temperature as any)) && (
              <Card>
                <CardHeader>
                  <CardTitle>バイタルサイン</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {selectedRecord.bloodPressureSystolic && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">血圧</p>
                        <p className="text-lg font-semibold">{selectedRecord.bloodPressureSystolic}/{selectedRecord.bloodPressureDiastolic} mmHg</p>
                      </div>
                    )}
                    {selectedRecord.heartRate && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">心拍数</p>
                        <p className="text-lg font-semibold">{selectedRecord.heartRate} bpm</p>
                      </div>
                    )}
                    {selectedRecord.temperature && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">体温</p>
                        <p className="text-lg font-semibold">{String(selectedRecord.temperature)} ℃</p>
                      </div>
                    )}
                    {selectedRecord.respiratoryRate && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">呼吸数</p>
                        <p className="text-lg font-semibold">{selectedRecord.respiratoryRate} /分</p>
                      </div>
                    )}
                    {selectedRecord.oxygenSaturation && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">SpO2</p>
                        <p className="text-lg font-semibold">{selectedRecord.oxygenSaturation} %</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Record Content Card */}
            <Card>
              <CardHeader>
                <CardTitle>記録内容</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedRecord.observations && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">観察事項</p>
                    <p className="text-base whitespace-pre-wrap">{selectedRecord.observations}</p>
                  </div>
                )}
                {selectedRecord.interventions && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">実施したケア</p>
                    <p className="text-base whitespace-pre-wrap">{selectedRecord.interventions}</p>
                  </div>
                )}
                {selectedRecord.evaluation && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">評価</p>
                    <p className="text-base whitespace-pre-wrap">{selectedRecord.evaluation}</p>
                  </div>
                )}
                {selectedRecord.patientFamilyResponse && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">次回訪問時の申し送り</p>
                    <p className="text-base whitespace-pre-wrap">{selectedRecord.patientFamilyResponse}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Billing and Points Information Card */}
            {(selectedRecord.multipleVisitReason || selectedRecord.emergencyVisitReason || selectedRecord.longVisitReason || selectedRecord.calculatedPoints || selectedRecord.appliedBonuses) && (
              <Card>
                <CardHeader>
                  <CardTitle>加算・算定情報</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedRecord.calculatedPoints && (
                    <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                      <p className="text-sm font-medium text-blue-900 mb-1">算定点数</p>
                      <p className="text-2xl font-bold text-blue-700">{selectedRecord.calculatedPoints} 点</p>
                    </div>
                  )}
                  {(selectedRecord.appliedBonuses as any) && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-2">適用加算</p>
                      <div className="bg-gray-50 rounded-md p-3">
                        {typeof selectedRecord.appliedBonuses === 'string' ? (
                          <p className="text-sm">{selectedRecord.appliedBonuses}</p>
                        ) : Array.isArray(selectedRecord.appliedBonuses) ? (
                          <ul className="list-disc list-inside space-y-1">
                            {(selectedRecord.appliedBonuses as any[]).map((bonus: any, index: number) => {
                              if (typeof bonus === 'string') {
                                return <li key={index} className="text-sm">{bonus}</li>
                              }

                              // Format bonus information
                              const getBonusName = (type: string): string => {
                                const names: Record<string, string> = {
                                  'multiple_visit': '複数回訪問加算',
                                  'emergency_visit': '緊急訪問加算',
                                  'long_visit': '長時間訪問加算',
                                  'same_building_discount': '同一建物減算',
                                };
                                return names[type] || type;
                              };

                              const name = getBonusName(bonus.type);
                              const points = bonus.points > 0 ? `+${bonus.points}点` : `${bonus.points}点`;
                              const details = [];

                              if (bonus.reason) details.push(bonus.reason);
                              if (bonus.duration) details.push(`${bonus.duration}分`);
                              if (bonus.visitNumber) details.push(`${bonus.visitNumber}回目`);
                              if (bonus.visitCount) details.push(`${bonus.visitCount}件`);

                              return (
                                <li key={index} className="text-sm">
                                  <span className="font-medium">{name}</span>: {points}
                                  {details.length > 0 && <span className="text-muted-foreground"> ({details.join(', ')})</span>}
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(selectedRecord.appliedBonuses, null, 2)}</pre>
                        )}
                      </div>
                    </div>
                  )}
                  {selectedRecord.multipleVisitReason && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-2">複数回訪問加算の理由</p>
                      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                        <p className="text-sm whitespace-pre-wrap">{selectedRecord.multipleVisitReason}</p>
                      </div>
                    </div>
                  )}
                  {selectedRecord.emergencyVisitReason && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-2">緊急訪問看護加算の理由</p>
                      <div className="bg-red-50 border border-red-200 rounded-md p-3">
                        <p className="text-sm whitespace-pre-wrap">{selectedRecord.emergencyVisitReason}</p>
                      </div>
                    </div>
                  )}
                  {selectedRecord.longVisitReason && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-2">長時間訪問看護加算の理由</p>
                      <div className="bg-orange-50 border border-orange-200 rounded-md p-3">
                        <p className="text-sm whitespace-pre-wrap">{selectedRecord.longVisitReason}</p>
                      </div>
                    </div>
                  )}
                  {selectedRecord.hasAdditionalPaymentAlert && (
                    <div className="bg-amber-50 border border-amber-300 rounded-md p-3 flex items-start gap-2">
                      <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-amber-900">加算未入力アラート</p>
                        <p className="text-xs text-amber-700 mt-1">この記録には未入力の加算情報がある可能性があります</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Attachments Card */}
            {attachments.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>添付ファイル</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {attachments.map((attachment) => (
                      <div key={attachment.id} className="relative border rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                        {attachment.fileType?.startsWith('image/') ? (
                          <img
                            src={`/api/attachments/${attachment.id}`}
                            alt={attachment.caption || 'Attachment'}
                            className="w-full h-40 object-cover cursor-pointer"
                            onClick={() => window.open(`/api/attachments/${attachment.id}`, '_blank')}
                          />
                        ) : (
                          <div className="w-full h-40 flex items-center justify-center bg-gray-100 cursor-pointer"
                            onClick={() => window.open(`/api/attachments/${attachment.id}`, '_blank')}
                          >
                            <FileText className="h-12 w-12 text-gray-400" />
                          </div>
                        )}
                        {attachment.caption && (
                          <div className="p-2 bg-white">
                            <p className="text-xs text-gray-600 truncate">{attachment.caption}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 justify-end">
              {selectedRecord.status === 'draft' && (
                <Button onClick={() => handleEditRecord(selectedRecord)}>
                  <Edit className="mr-1 h-4 w-4" />
                  編集
                </Button>
              )}
              <Button variant="outline" onClick={() => {
                setSelectedRecord(null)
                setIsCreating(false)
                setIsEditing(false)
              }}>
                閉じる
              </Button>
            </div>
          </div>
        )}

        {/* Document Reference Accordion */}
        {formData.patientId && (isCreating || isEditing) && (
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="doctor-orders">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  <span>訪問看護指示書</span>
                  {activeDoctorOrders.length > 0 && (
                    <Badge variant="secondary">{activeDoctorOrders.length}件</Badge>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent>
                {activeDoctorOrders.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="mx-auto h-12 w-12 text-muted-foreground opacity-50 mb-4" />
                    <p className="text-muted-foreground">有効な訪問看護指示書がありません</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {activeDoctorOrders.map((order) => (
                      <div key={order.id} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="default">有効</Badge>
                          {(() => {
                            const daysUntilExpiry = Math.ceil(
                              (new Date(order.endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
                            )
                            return daysUntilExpiry <= 14 ? (
                              <Badge variant="destructive" className="flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                期限間近（残り{daysUntilExpiry}日）
                              </Badge>
                            ) : null
                          })()}
                        </div>

                        {(order as any).medicalInstitution && (
                          <div>
                            <p className="text-xs text-muted-foreground">医療機関</p>
                            <p className="text-sm font-medium">
                              {(order as any).medicalInstitution.name} - {(order as any).medicalInstitution.doctorName}
                            </p>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-xs text-muted-foreground">指示日</p>
                            <p className="text-sm">{new Date(order.orderDate).toLocaleDateString('ja-JP')}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">有効期限</p>
                            <p className="text-sm">{new Date(order.endDate).toLocaleDateString('ja-JP')}</p>
                          </div>
                        </div>

                        {order.diagnosis && (
                          <div>
                            <p className="text-xs text-muted-foreground">病名</p>
                            <p className="text-sm whitespace-pre-wrap">{order.diagnosis}</p>
                          </div>
                        )}

                        {order.orderContent && (
                          <div>
                            <p className="text-xs text-muted-foreground">指示内容</p>
                            <p className="text-sm whitespace-pre-wrap">{order.orderContent}</p>
                          </div>
                        )}

                        {order.weeklyVisitLimit && (
                          <div>
                            <p className="text-xs text-muted-foreground">週の訪問回数上限</p>
                            <p className="text-sm">{order.weeklyVisitLimit}回/週</p>
                          </div>
                        )}

                        {order.filePath && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-2">添付ファイル</p>
                            <div className="border rounded-md overflow-hidden">
                              {order.filePath.toLowerCase().endsWith('.pdf') ? (
                                <iframe
                                  src={order.filePath}
                                  className="w-full h-[600px]"
                                  title="指示書PDF"
                                />
                              ) : (
                                <img
                                  src={order.filePath}
                                  alt="指示書"
                                  className="w-full h-auto"
                                />
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="care-plan">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  <span>ケアプラン（居宅サービス計画書）</span>
                  {latestCarePlan && <Badge variant="secondary">1件</Badge>}
                </div>
              </AccordionTrigger>
              <AccordionContent>
                {!latestCarePlan ? (
                  <div className="text-center py-8">
                    <FileText className="mx-auto h-12 w-12 text-muted-foreground opacity-50 mb-4" />
                    <p className="text-muted-foreground">居宅サービス計画書がありません</p>
                  </div>
                ) : (
                  <div className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {latestCarePlan.planType === 'initial' ? '初回' :
                         latestCarePlan.planType === 'update' ? '更新' : '変更'}
                      </Badge>
                      {latestCarePlan.planNumber && (
                        <span className="text-sm font-medium">計画書番号: {latestCarePlan.planNumber}</span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">作成日</p>
                        <p className="text-sm">{latestCarePlan.planDate}</p>
                      </div>
                      {latestCarePlan.certificationPeriodStart && latestCarePlan.certificationPeriodEnd && (
                        <div>
                          <p className="text-xs text-muted-foreground">認定期間</p>
                          <p className="text-sm">
                            {latestCarePlan.certificationPeriodStart} 〜 {latestCarePlan.certificationPeriodEnd}
                          </p>
                        </div>
                      )}
                    </div>

                    {latestCarePlan.userIntention && (
                      <div>
                        <p className="text-xs text-muted-foreground">利用者の意向</p>
                        <p className="text-sm whitespace-pre-wrap">{latestCarePlan.userIntention}</p>
                      </div>
                    )}

                    {latestCarePlan.familyIntention && (
                      <div>
                        <p className="text-xs text-muted-foreground">家族の意向</p>
                        <p className="text-sm whitespace-pre-wrap">{latestCarePlan.familyIntention}</p>
                      </div>
                    )}

                    {latestCarePlan.comprehensivePolicy && (
                      <div>
                        <p className="text-xs text-muted-foreground">総合的な援助の方針</p>
                        <p className="text-sm whitespace-pre-wrap">{latestCarePlan.comprehensivePolicy}</p>
                      </div>
                    )}

                    {latestCarePlan.remarks && (
                      <div>
                        <p className="text-xs text-muted-foreground">備考</p>
                        <p className="text-sm whitespace-pre-wrap">{latestCarePlan.remarks}</p>
                      </div>
                    )}

                    {latestCarePlan.filePath && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">添付ファイル</p>
                        <div className="border rounded-md overflow-hidden">
                          {latestCarePlan.filePath.toLowerCase().endsWith('.pdf') ? (
                            <iframe
                              src={latestCarePlan.filePath}
                              className="w-full h-[600px]"
                              title="ケアプランPDF"
                            />
                          ) : (
                            <img
                              src={latestCarePlan.filePath}
                              alt="ケアプラン"
                              className="w-full h-auto"
                            />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
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
              {(() => {
                const selectedPatient = patientsData?.data.find(p => p.id === formData.patientId)
                const specialTypes = selectedPatient?.specialManagementTypes || []

                if (specialTypes.length === 0) {
                  return (
                    <div className="p-8 text-center text-muted-foreground border-2 border-dashed rounded-lg">
                      <p className="text-sm">この患者には特別管理加算の設定がありません</p>
                    </div>
                  )
                }

                return (
                  <div className="space-y-6">
                    {specialTypes.map(typeValue => {
                      const typeConfig = specialManagementDefinitions.find(t => t.category === typeValue)
                      if (!typeConfig || !typeConfig.fields) return null

                      return (
                        <div key={typeValue} className="border rounded-lg p-4">
                          <h3 className="font-semibold mb-4">{typeConfig.displayName}</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {typeConfig.fields.map(field => {
                              const fieldKey = `${typeValue}_${field.fieldName}`
                              const value = formData.specialManagementData[fieldKey] || ''

                              if (field.fieldType === 'select' && field.fieldOptions?.options) {
                                return (
                                  <div key={fieldKey} className="space-y-2">
                                    <Label htmlFor={fieldKey}>{field.fieldLabel}</Label>
                                    <Select
                                      value={value}
                                      onValueChange={(val) => {
                                        setFormData(prev => ({
                                          ...prev,
                                          specialManagementData: {
                                            ...prev.specialManagementData,
                                            [fieldKey]: val
                                          }
                                        }))
                                      }}
                                    >
                                      <SelectTrigger id={fieldKey}>
                                        <SelectValue placeholder="選択してください" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {field.fieldOptions.options.map(opt => (
                                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )
                              }

                              if (field.fieldType === 'number') {
                                return (
                                  <div key={fieldKey} className="space-y-2">
                                    <Label htmlFor={fieldKey}>{field.fieldLabel}</Label>
                                    <Input
                                      id={fieldKey}
                                      type="number"
                                      value={value}
                                      onChange={(e) => {
                                        setFormData(prev => ({
                                          ...prev,
                                          specialManagementData: {
                                            ...prev.specialManagementData,
                                            [fieldKey]: e.target.value
                                          }
                                        }))
                                      }}
                                    />
                                  </div>
                                )
                              }

                              if (field.fieldType === 'textarea') {
                                return (
                                  <div key={fieldKey} className="space-y-2">
                                    <Label htmlFor={fieldKey}>{field.fieldLabel}</Label>
                                    <Textarea
                                      id={fieldKey}
                                      value={value}
                                      onChange={(e) => {
                                        setFormData(prev => ({
                                          ...prev,
                                          specialManagementData: {
                                            ...prev.specialManagementData,
                                            [fieldKey]: e.target.value
                                          }
                                        }))
                                      }}
                                    />
                                  </div>
                                )
                              }

                              return (
                                <div key={fieldKey} className="space-y-2">
                                  <Label htmlFor={fieldKey}>{field.fieldLabel}</Label>
                                  <Input
                                    id={fieldKey}
                                    type="text"
                                    value={value}
                                    onChange={(e) => {
                                      setFormData(prev => ({
                                        ...prev,
                                        specialManagementData: {
                                          ...prev.specialManagementData,
                                          [fieldKey]: e.target.value
                                        }
                                      }))
                                    }}
                                  />
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </TabsContent>

            {/* 写真・メモタブ */}
            <TabsContent value="photos" className="mt-4 space-y-4">
              {/* File input (hidden) */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const files = Array.from(e.target.files || [])
                  if (files.length === 0) return

                  // Validate
                  const validTypes = ['image/jpeg', 'image/jpg', 'image/png']
                  const invalidFiles = files.filter(f => !validTypes.includes(f.type))
                  if (invalidFiles.length > 0) {
                    toast({ title: "エラー", description: "画像ファイルのみアップロード可能です", variant: "destructive" })
                    return
                  }

                  if (attachments.length + selectedFiles.length + files.length > 10) {
                    toast({ title: "エラー", description: "ファイルは最大10個までです", variant: "destructive" })
                    return
                  }

                  // Generate previews
                  const newPreviews: string[] = []
                  for (const file of files) {
                    const preview = URL.createObjectURL(file)
                    newPreviews.push(preview)
                  }

                  setSelectedFiles(prev => [...prev, ...files])
                  setFilePreviews(prev => [...prev, ...newPreviews])
                }}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const files = Array.from(e.target.files || [])
                  if (files.length === 0) return

                  // Validate
                  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf']
                  const invalidFiles = files.filter(f => !validTypes.includes(f.type))
                  if (invalidFiles.length > 0) {
                    toast({ title: "エラー", description: "画像またはPDFのみアップロード可能です", variant: "destructive" })
                    return
                  }

                  const oversized = files.filter(f => f.size > 10 * 1024 * 1024)
                  if (oversized.length > 0) {
                    toast({ title: "エラー", description: "ファイルサイズは10MB以下にしてください", variant: "destructive" })
                    return
                  }

                  if (attachments.length + selectedFiles.length + files.length > 10) {
                    toast({ title: "エラー", description: "ファイルは最大10個までです", variant: "destructive" })
                    return
                  }

                  // Generate previews
                  const newPreviews: string[] = []
                  for (const file of files) {
                    if (file.type.startsWith('image/')) {
                      const preview = URL.createObjectURL(file)
                      newPreviews.push(preview)
                    } else {
                      newPreviews.push('')
                    }
                  }

                  setSelectedFiles(prev => [...prev, ...files])
                  setFilePreviews(prev => [...prev, ...newPreviews])
                }}
              />

              {/* Upload buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="h-20 flex flex-col gap-2"
                  onClick={() => cameraInputRef.current?.click()}
                >
                  <Camera className="h-6 w-6" />
                  <span>カメラで撮影</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-20 flex flex-col gap-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-6 w-6" />
                  <span>ファイルを選択</span>
                </Button>
              </div>

              {/* All attachments (existing + new) */}
              {(attachments.length > 0 || selectedFiles.length > 0) && (
                <div className="space-y-3">
                  <p className="text-sm font-medium">
                    添付ファイル ({attachments.length + selectedFiles.length}/10)
                  </p>
                  <div className="space-y-3">
                    {/* Existing attachments */}
                    {attachments.map((attachment) => (
                      <div key={attachment.id} className="border rounded-lg p-3">
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0">
                            {attachment.fileType.startsWith('image/') ? (
                              <img
                                src={`/api/attachments/${attachment.id}`}
                                alt={attachment.originalFileName}
                                className="w-20 h-20 object-cover rounded border"
                              />
                            ) : (
                              <div className="w-20 h-20 bg-gray-100 rounded border flex items-center justify-center">
                                <FileText className="h-8 w-8 text-gray-400" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{attachment.originalFileName}</p>
                            <p className="text-xs text-muted-foreground">
                              {(attachment.fileSize / 1024).toFixed(1)} KB
                            </p>
                            {attachment.caption && (
                              <div className="text-sm mt-2 p-2 bg-gray-50 rounded">
                                {attachment.caption}
                              </div>
                            )}
                          </div>
                          {isEditing && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={async () => {
                                if (!confirm(`${attachment.originalFileName} を削除しますか？`)) return

                                try {
                                  const response = await fetch(`/api/attachments/${attachment.id}`, {
                                    method: 'DELETE'
                                  })

                                  if (!response.ok) {
                                    throw new Error('削除に失敗しました')
                                  }

                                  // Refresh attachments list
                                  await queryClient.invalidateQueries({
                                    queryKey: ["nursing-record-attachments", selectedRecord?.id]
                                  })

                                  toast({
                                    title: "削除完了",
                                    description: "ファイルを削除しました"
                                  })
                                } catch (error) {
                                  toast({
                                    title: "エラー",
                                    description: "ファイルの削除に失敗しました",
                                    variant: "destructive"
                                  })
                                }
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* New files to upload */}
                    {selectedFiles.map((file, index) => (
                      <div key={index} className="border rounded-lg p-3">
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0">
                            {file.type.startsWith('image/') && filePreviews[index] ? (
                              <img src={filePreviews[index]} alt={file.name} className="w-20 h-20 object-cover rounded border" />
                            ) : (
                              <div className="w-20 h-20 bg-gray-100 rounded border flex items-center justify-center">
                                <ImageIcon className="h-8 w-8 text-gray-400" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{file.name}</p>
                            <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                            <Input
                              placeholder="メモ・説明を入力"
                              value={fileCaptions[index] || ''}
                              onChange={(e) => setFileCaptions(prev => ({ ...prev, [index]: e.target.value }))}
                              className="text-sm mt-2"
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedFiles(prev => prev.filter((_, i) => i !== index))
                              setFilePreviews(prev => {
                                if (prev[index]) URL.revokeObjectURL(prev[index])
                                return prev.filter((_, i) => i !== index)
                              })
                              setFileCaptions(prev => {
                                const newCaptions = { ...prev }
                                delete newCaptions[index]
                                return newCaptions
                              })
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {isUploading && (
                <div className="flex items-center justify-center gap-2 p-4 bg-blue-50 rounded-lg">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">アップロード中...</span>
                </div>
              )}

              <div className="text-xs text-muted-foreground space-y-1 p-3 bg-gray-50 rounded">
                <p>• 画像（JPEG、PNG）またはPDFファイルをアップロードできます</p>
                <p>• ファイルサイズは1ファイルあたり10MBまで</p>
                <p>• 最大10個のファイルをアップロード可能</p>
              </div>
            </TabsContent>
          </Tabs>
        ) : null}

        {/* Action Buttons */}
        {(isCreating || isEditing) && (
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
            ) : (
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
            )}
          </div>
        )}

        {/* Image Lightbox - Custom Modal */}
        {lightboxOpen && lightboxImage && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center">
            {/* Overlay */}
            <div
              className="absolute inset-0 bg-black/80"
              onClick={() => {
                setLightboxOpen(false)
                setLightboxImage(null)
              }}
            />
            {/* Modal Content */}
            <div className="relative bg-background rounded-lg shadow-lg max-w-4xl w-full mx-4 max-h-[90vh] overflow-auto">
              {/* Close Button */}
              <button
                onClick={() => {
                  setLightboxOpen(false)
                  setLightboxImage(null)
                }}
                className="absolute right-4 top-4 z-10 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 bg-white/90 p-2"
              >
                <X className="h-4 w-4" />
              </button>

              {/* Header */}
              <div className="p-6 pb-4 border-b">
                <div className="flex items-center justify-between pr-8">
                  <h2 className="text-lg font-semibold truncate">{lightboxImage.originalFileName}</h2>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const link = document.createElement('a')
                      link.href = `/api/attachments/${lightboxImage.id}`
                      link.download = lightboxImage.originalFileName
                      link.click()
                    }}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    ダウンロード
                  </Button>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 space-y-4">
                <div className="relative bg-black rounded-lg overflow-hidden">
                  <img
                    src={`/api/attachments/${lightboxImage.id}`}
                    alt={lightboxImage.originalFileName}
                    className="w-full max-h-[60vh] object-contain"
                  />
                </div>
                {lightboxImage.caption && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm font-medium text-muted-foreground mb-1">メモ</p>
                    <p className="text-sm whitespace-pre-wrap">{lightboxImage.caption}</p>
                  </div>
                )}
                {attachments.filter(a => a.fileType.startsWith('image/')).length > 1 && (
                  <div className="flex items-center justify-between">
                    <Button
                      variant="outline"
                      onClick={() => {
                        const imageAttachments = attachments.filter(a => a.fileType.startsWith('image/'))
                        const newIndex = lightboxIndex > 0 ? lightboxIndex - 1 : imageAttachments.length - 1
                        setLightboxIndex(newIndex)
                        setLightboxImage(imageAttachments[newIndex])
                      }}
                      disabled={attachments.filter(a => a.fileType.startsWith('image/')).length <= 1}
                    >
                      ← 前へ
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      {lightboxIndex + 1} / {attachments.filter(a => a.fileType.startsWith('image/')).length}
                    </span>
                    <Button
                      variant="outline"
                      onClick={() => {
                        const imageAttachments = attachments.filter(a => a.fileType.startsWith('image/'))
                        const newIndex = lightboxIndex < imageAttachments.length - 1 ? lightboxIndex + 1 : 0
                        setLightboxIndex(newIndex)
                        setLightboxImage(imageAttachments[newIndex])
                      }}
                      disabled={attachments.filter(a => a.fileType.startsWith('image/')).length <= 1}
                    >
                      次へ →
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      </>
    )
  }

  return (
    <>
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
                      <div className="flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span className="font-medium">訪問日:</span>
                          {record.visitDate ? new Date(record.visitDate).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' }) : new Date(record.recordDate).toLocaleDateString('ja-JP')}
                        </div>
                        {record.actualStartTime && record.actualEndTime && (
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span className="font-medium">訪問時間:</span>
                            {new Date(record.actualStartTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} - {new Date(record.actualEndTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          <span className="font-medium">担当:</span>
                          {record.nurseName}
                        </div>
                      </div>
                      {record.observations && <p className="truncate max-w-md">📋 {record.observations}</p>}
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
                    <p><span className="font-medium">記録日:</span> {new Date(recordToDelete.recordDate).toLocaleString('ja-JP')}</p>
                    {recordToDelete.actualStartTime && (
                      <p><span className="font-medium">訪問開始:</span> {new Date(recordToDelete.actualStartTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</p>
                    )}
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

    </>
  )
}
