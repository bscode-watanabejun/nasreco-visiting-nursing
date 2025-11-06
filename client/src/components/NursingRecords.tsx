import { useState, useEffect, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useSearch, useLocation } from "wouter"
import { useBasePath } from "@/hooks/useBasePath"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
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
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Trash2,
  Camera,
  Upload,
  X,
  Image as ImageIcon,
  Loader2,
  Download,
  ZoomIn,
  ExternalLink,
  CheckCircle,
  Filter,
  Info,
  Sliders,
  RotateCcw,
  CalendarDays,
  Activity
} from "lucide-react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useToast } from "@/hooks/use-toast"
import { masterDataApi } from "@/lib/api"

import type { Patient, NursingRecord, PaginatedResult, NursingRecordAttachment, DoctorOrder, ServiceCarePlan, NursingRecordSearchResult } from "@shared/schema"

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
  demoStaffName?: string | null
  purpose?: string | null
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
  hasEmergencyVisit: boolean
  multipleVisitReason: string
  emergencyVisitReason: string
  longVisitReason: string
  // Phase 2-A: 記録フラグ（加算判定用）
  isDischargeDate: boolean
  isFirstVisitOfPlan: boolean
  hasCollaborationRecord: boolean
  isTerminalCare: boolean
  // Week 3: 専門管理加算用フィールド
  specialistCareType: string
  // Selected schedule ID (for multiple schedules)
  selectedScheduleId: string
  // Special management record data
  specialManagementData: Record<string, any>
  // Schedule override fields (for non-scheduled records)
  demoStaffNameOverride: string
  purposeOverride: string
  // Phase 3: レセプトCSV対応
  nursingServiceCode: string // 訪問看護サービスコード
  visitLocation: string // 訪問場所コード
  staffQualification: string // 職員資格コード
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

    // Phase 2-A: 記録フラグ（加算判定用）
    isDischargeDate: formData.isDischargeDate,
    isFirstVisitOfPlan: formData.isFirstVisitOfPlan,
    hasCollaborationRecord: formData.hasCollaborationRecord,
    isTerminalCare: formData.isTerminalCare,

    // Week 3: 専門管理加算用フィールド
    ...(formData.specialistCareType && formData.specialistCareType !== '' && {
      specialistCareType: formData.specialistCareType
    }),

    // 特別管理記録データ
    ...(Object.keys(formData.specialManagementData).length > 0 && {
      specialManagementData: formData.specialManagementData
    }),

    // スケジュール未連携時の手動入力フィールド
    ...(formData.demoStaffNameOverride && { demoStaffNameOverride: formData.demoStaffNameOverride }),
    ...(formData.purposeOverride && { purposeOverride: formData.purposeOverride }),

    // Phase 3: レセプトCSV対応フィールド
    ...(formData.nursingServiceCode && { nursingServiceCode: formData.nursingServiceCode }),
    ...(formData.visitLocation && { visitLocation: formData.visitLocation }),
    ...(formData.staffQualification && { staffQualification: formData.staffQualification }),
  }

  // スケジュールIDの紐付け - always include for proper tracking
  // Include scheduleId if it has a value (not 'none' and not empty string)
  if (formData.selectedScheduleId && formData.selectedScheduleId !== 'none') {
    apiData.scheduleId = formData.selectedScheduleId;
  }

  // DEBUG: Log scheduleId in API data
  console.log('🔍 DEBUG - convertFormDataToApiFormat');
  console.log('  - formData.selectedScheduleId:', formData.selectedScheduleId);
  console.log('  - apiData.scheduleId:', apiData.scheduleId);

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
    if (formData.hasEmergencyVisit && !formData.emergencyVisitReason?.trim()) {
      errors.push('緊急訪問看護加算の理由を入力してください')
    }

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
const getInitialFormData = (): FormData => {
  const now = new Date()
  const startTime = now.toTimeString().slice(0, 5)

  // Calculate end time as 1 hour after start time
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000)
  const endTime = oneHourLater.toTimeString().slice(0, 5)

  return {
    patientId: '',
    recordType: 'general_care',
    visitDate: now.toISOString().split('T')[0], // Default to today
    visitStatusRecord: 'pending',
    actualStartTime: startTime,
    actualEndTime: endTime,
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
    hasEmergencyVisit: false,
    multipleVisitReason: '',
    emergencyVisitReason: '',
    longVisitReason: '',
    isDischargeDate: false,
    isFirstVisitOfPlan: false,
    hasCollaborationRecord: false,
    isTerminalCare: false,
    specialistCareType: '',
    selectedScheduleId: '',
    specialManagementData: {},
    demoStaffNameOverride: '',
    purposeOverride: '',
    // Phase 3: レセプトCSV対応
    nursingServiceCode: '',
    visitLocation: '',
    staffQualification: ''
  }
}

export function NursingRecords() {
  const queryClient = useQueryClient()
  const searchParams = useSearch()
  const basePath = useBasePath()
  const [, setLocation] = useLocation()
  const { data: currentUser } = useCurrentUser()
  const { toast } = useToast()

  // Phase 3: 編集権限判定関数
  const canEditRecord = (record: NursingRecordDisplay | null): boolean => {
    if (!currentUser || !record) return false

    const isAdmin = currentUser.role === 'admin' || currentUser.role === 'manager'
    const isOwner = record.nurseId === currentUser.id

    if (record.status === 'reviewed') {
      // 確認済み記録は管理者のみ編集可能
      return isAdmin
    } else if (record.status === 'completed' || record.status === 'draft') {
      // 完了/下書き記録は作成者または管理者のみ編集可能
      return isOwner || isAdmin
    }

    return false
  }

  // Check URL parameters for initial state
  const urlParams = new URLSearchParams(searchParams)
  const modeFromUrl = urlParams.get('mode')
  const initialIsCreating = modeFromUrl === 'create'

  const [selectedRecord, setSelectedRecord] = useState<NursingRecordDisplay | null>(null)
  const [isCreating, setIsCreating] = useState(initialIsCreating)
  const [isEditing, setIsEditing] = useState(false)
  const [activeTab, setActiveTab] = useState<'basic' | 'vitals-care' | 'special' | 'receipt' | 'photos'>('basic')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(getInitialFormData())
  const [recordToDelete, setRecordToDelete] = useState<NursingRecordDisplay | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [cameFromUrl, setCameFromUrl] = useState(false)
  const processedRecordIdRef = useRef<string | null>(null)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(20)

  // Advanced search/filter state
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false)
  const [filterStatus, setFilterStatus] = useState<'all' | 'draft' | 'completed' | 'reviewed'>('all')
  const [filterPatientId, setFilterPatientId] = useState<string>('all')
  const [filterNurseId, setFilterNurseId] = useState<string>('all')
  const [filterDateFrom, setFilterDateFrom] = useState<string>('')
  const [filterDateTo, setFilterDateTo] = useState<string>('')
  const [sortBy, setSortBy] = useState<'visitDate' | 'recordDate'>('visitDate')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

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

  // Set default date range to last 1 month
  useEffect(() => {
    const today = new Date()
    const oneMonthAgo = new Date(today)
    oneMonthAgo.setMonth(today.getMonth() - 1)

    // Use local date to avoid timezone issues
    const formatLocalDate = (date: Date) => {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }

    setFilterDateFrom(formatLocalDate(oneMonthAgo))
    setFilterDateTo(formatLocalDate(today))
  }, [])

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

  // Phase 3: レセプトCSV対応 - マスターデータフェッチ
  const { data: nursingServiceCodes = [] } = useQuery({
    queryKey: ["nursing-service-codes"],
    queryFn: () => masterDataApi.getNursingServiceCodes(),
  })

  const { data: visitLocationCodes = [] } = useQuery({
    queryKey: ["visit-location-codes"],
    queryFn: () => masterDataApi.getVisitLocationCodes(),
  })

  const { data: staffQualificationCodes = [] } = useQuery({
    queryKey: ["staff-qualification-codes"],
    queryFn: () => masterDataApi.getStaffQualificationCodes(),
  })

  // Fetch nursing records from API with search filters
  const { data: recordsData, isLoading: isRecordsLoading } = useQuery<NursingRecordSearchResult>({
    queryKey: ["nursing-records", currentPage, itemsPerPage, filterStatus, filterPatientId, filterNurseId, filterDateFrom, filterDateTo, sortBy, sortOrder],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: itemsPerPage.toString(),
      })

      // Add filters if set
      if (filterStatus !== 'all') {
        params.append('status', filterStatus)
      }
      if (filterPatientId !== 'all') {
        params.append('patientId', filterPatientId)
      }
      if (filterNurseId !== 'all') {
        params.append('nurseId', filterNurseId)
      }
      if (filterDateFrom) {
        params.append('dateFrom', filterDateFrom)
      }
      if (filterDateTo) {
        params.append('dateTo', filterDateTo)
      }
      params.append('sortBy', sortBy)
      params.append('sortOrder', sortOrder)

      const response = await fetch(`/api/nursing-records/search?${params}`)
      if (!response.ok) {
        throw new Error("看護記録の取得に失敗しました")
      }
      return response.json()
    },
    refetchOnMount: 'always',  // マウント時に常に最新データを取得
    staleTime: 0,              // データを常に古いものとして扱い、再取得を促す
    enabled: !!filterDateFrom && !!filterDateTo, // 日付範囲が設定されている場合のみクエリ実行
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

  // Get additional URL parameters
  const scheduleIdFromUrl = urlParams.get('scheduleId')
  const patientIdFromUrl = urlParams.get('patientId')
  const recordIdFromUrl = urlParams.get('recordId')
  const returnTo = urlParams.get('returnTo')

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

  // Fetch specific nursing record from URL
  const { data: recordFromUrl } = useQuery({
    queryKey: ["nursing-record", recordIdFromUrl],
    queryFn: async () => {
      if (!recordIdFromUrl) return null
      const response = await fetch(`/api/nursing-records/${recordIdFromUrl}`)
      if (!response.ok) return null
      return response.json()
    },
    enabled: !!recordIdFromUrl,
  })

  // Fetch schedules for the selected patient on the visit date
  const { data: patientSchedulesData } = useQuery({
    queryKey: ["patientSchedules", formData.patientId, formData.visitDate],
    queryFn: async () => {
      if (!formData.patientId || !formData.visitDate) return { data: [] }

      // Create Date objects for start and end of day in JST
      // formData.visitDate is in format "2025-10-09" (local date)
      const localDate = new Date(formData.visitDate + 'T00:00:00')
      const startOfDay = new Date(localDate.getFullYear(), localDate.getMonth(), localDate.getDate(), 0, 0, 0, 0)
      const endOfDay = new Date(localDate.getFullYear(), localDate.getMonth(), localDate.getDate(), 23, 59, 59, 999)

      const url = `/api/schedules?patientId=${formData.patientId}&startDate=${encodeURIComponent(startOfDay.toISOString())}&endDate=${encodeURIComponent(endOfDay.toISOString())}`
      const response = await fetch(url)
      if (!response.ok) return { data: [] }
      return response.json()
    },
    enabled: !!formData.patientId && !!formData.visitDate && (isCreating || isEditing), // Fetch if patient and visit date are selected
  })

  const patientSchedules = (patientSchedulesData?.data || []) as any[]

  // Fetch the selected schedule if it exists and validate its date
  const { data: selectedScheduleData } = useQuery({
    queryKey: ["selectedSchedule", formData.selectedScheduleId, formData.visitDate],
    queryFn: async () => {
      if (!formData.selectedScheduleId) return null
      const response = await fetch(`/api/schedules/${formData.selectedScheduleId}`)
      if (!response.ok) return null
      const schedule = await response.json()

      // Validate that the schedule date matches the current visit date
      if (formData.visitDate) {
        const scheduleDate = new Date(schedule.scheduledDate)
        const visitDateLocal = `${scheduleDate.getFullYear()}-${String(scheduleDate.getMonth() + 1).padStart(2, '0')}-${String(scheduleDate.getDate()).padStart(2, '0')}`
        if (visitDateLocal !== formData.visitDate) {
          return null // Don't use schedule if date doesn't match
        }
      }

      return schedule
    },
    enabled: !!formData.selectedScheduleId,
  })

  // Combine schedules: if we have selectedScheduleData and it's not in patientSchedules, add it
  const allSchedules = selectedScheduleData && !patientSchedules.find((s: any) => s.id === selectedScheduleData.id)
    ? [selectedScheduleData, ...patientSchedules]
    : patientSchedules

  const selectedSchedule = allSchedules.find((s: any) => s.id === formData.selectedScheduleId)

  // Track previous values to detect actual user changes (not initial load)
  const prevVisitDateRef = useRef('')
  const prevPatientIdRef = useRef('')

  // Reset schedule selection when visit date or patient changes
  useEffect(() => {
    // Check if visit date or patient actually changed (not initial load from URL)
    const visitDateChanged = prevVisitDateRef.current !== formData.visitDate && prevVisitDateRef.current !== ''
    const patientIdChanged = prevPatientIdRef.current !== formData.patientId && prevPatientIdRef.current !== ''

    if ((visitDateChanged || patientIdChanged) && formData.selectedScheduleId) {
      // Clear all selected schedule query caches
      queryClient.removeQueries({ queryKey: ["selectedSchedule"] })

      setFormData(prev => ({
        ...prev,
        selectedScheduleId: ''
      }))
    }

    // Update refs for next comparison
    prevVisitDateRef.current = formData.visitDate
    prevPatientIdRef.current = formData.patientId
  }, [formData.visitDate, formData.patientId, formData.selectedScheduleId, queryClient])

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
      // Get local date from UTC timestamp to avoid timezone offset issues
      const scheduleDate = schedule.scheduledDate ? new Date(schedule.scheduledDate) : new Date()
      const visitDate = `${scheduleDate.getFullYear()}-${String(scheduleDate.getMonth() + 1).padStart(2, '0')}-${String(scheduleDate.getDate()).padStart(2, '0')}`

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

      // Don't clear URL parameters - keep mode=create to maintain state
      // The history will be cleaned up when user saves or cancels
    } else if (modeFromUrl === 'create' && !scheduleIdFromUrl) {
      // Create new record without schedule (from Dashboard new record button)
      setCameFromUrl(true) // Mark that we came from URL
      setIsCreating(true)
      setSelectedRecord(null)
      setFormData(getInitialFormData())
      setSaveError(null)

      // Don't clear URL parameters - keep mode=create to maintain state
      // The history will be cleaned up when user saves or cancels
    }
  }, [scheduleIdFromUrl, scheduleFromUrl, modeFromUrl, patientIdFromUrl, basePath])

  // Handle recordId from URL to open record detail view
  useEffect(() => {
    if (recordIdFromUrl && recordFromUrl && !isCreating && processedRecordIdRef.current !== recordIdFromUrl) {
      // Mark this recordId as processed to prevent re-processing
      processedRecordIdRef.current = recordIdFromUrl

      // Use the fetched record from URL
      const targetRecord = recordFromUrl

      // Transform to display format and open detail view
      const patient = patients.find(p => p.id === targetRecord.patientId)
      const patientName = patient ? `${patient.lastName} ${patient.firstName}` : '不明'
      const nurse = users.find(u => u.id === targetRecord.nurseId)

      const recordToView: NursingRecordDisplay = {
        ...targetRecord,
        patientName,
        nurseName: nurse?.fullName || '担当者不明'
      }

      // Mark that we came from URL to enable history back
      setCameFromUrl(true)

      // Open the record detail view
      handleViewRecord(recordToView)

      // Clear recordId from URL only if there's no returnTo parameter
      // When returnTo exists, we keep the full URL intact to allow page refresh
      if (!returnTo) {
        const newUrl = `${basePath}/records`
        window.history.replaceState({}, '', newUrl)
      }
    }
  }, [recordIdFromUrl, recordFromUrl, patients, users, isCreating, returnTo, basePath])

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

  // All filtering is now done server-side, so just use the records as-is
  const filteredRecords = records

  // Use stats from API response instead of filtering client-side
  const draftRecords = recordsData?.stats?.draft || 0
  const completedRecords = recordsData?.stats?.completed || 0
  const reviewedRecords = recordsData?.stats?.reviewed || 0

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
      hasEmergencyVisit: !!record.emergencyVisitReason,
      multipleVisitReason: record.multipleVisitReason || '',
      emergencyVisitReason: record.emergencyVisitReason || '',
      longVisitReason: record.longVisitReason || '',
      isDischargeDate: record.isDischargeDate || false,
      isFirstVisitOfPlan: record.isFirstVisitOfPlan || false,
      hasCollaborationRecord: record.hasCollaborationRecord || false,
      isTerminalCare: record.isTerminalCare || false,
      specialistCareType: (record as any).specialistCareType || '',
      selectedScheduleId: record.scheduleId || '',
      specialManagementData: (record.specialManagementData as Record<string, any>) || {},
      demoStaffNameOverride: record.demoStaffNameOverride || '',
      purposeOverride: record.purposeOverride || '',
      // Phase 3: レセプトCSV対応
      nursingServiceCode: (record as any).nursingServiceCode || '',
      visitLocation: (record as any).visitLocation || '',
      staffQualification: (record as any).staffQualification || ''
    })

  }

  const handleEditRecord = (record: NursingRecordDisplay) => {
    // Phase 3: 編集権限チェック
    if (!canEditRecord(record)) {
      toast({
        title: "編集権限がありません",
        description: record.status === 'reviewed'
          ? "確認済みの記録は管理者のみ編集できます"
          : "この記録を編集する権限がありません",
        variant: "destructive"
      })
      return
    }

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
      hasEmergencyVisit: !!record.emergencyVisitReason,
      multipleVisitReason: record.multipleVisitReason || '',
      emergencyVisitReason: record.emergencyVisitReason || '',
      longVisitReason: record.longVisitReason || '',
      isDischargeDate: record.isDischargeDate || false,
      isFirstVisitOfPlan: record.isFirstVisitOfPlan || false,
      hasCollaborationRecord: record.hasCollaborationRecord || false,
      isTerminalCare: record.isTerminalCare || false,
      specialistCareType: (record as any).specialistCareType || '',
      selectedScheduleId: record.scheduleId || '',
      specialManagementData: (record.specialManagementData as Record<string, any>) || {},
      demoStaffNameOverride: record.demoStaffNameOverride || '',
      purposeOverride: record.purposeOverride || '',
      // Phase 3: レセプトCSV対応
      nursingServiceCode: (record as any).nursingServiceCode || '',
      visitLocation: (record as any).visitLocation || '',
      staffQualification: (record as any).staffQualification || ''
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
      await queryClient.invalidateQueries({ queryKey: ["nursing-records"] })
      await queryClient.invalidateQueries({ queryKey: ["/api/schedules/without-records"] })
      await queryClient.invalidateQueries({ queryKey: ["schedules"] })
      await queryClient.invalidateQueries({ queryKey: ["/api/notifications/count"] })
      await queryClient.invalidateQueries({ queryKey: ["/api/notifications/list"] })
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
      console.log('🔍 DEBUG - Creating draft record, API payload:', JSON.stringify({ scheduleId: apiData.scheduleId }, null, 2));
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
      await queryClient.invalidateQueries({ queryKey: ["/api/schedules/without-records"] })
      await queryClient.invalidateQueries({ queryKey: ["schedules"] })
      await queryClient.invalidateQueries({ queryKey: ["/api/notifications/count"] })
      await queryClient.invalidateQueries({ queryKey: ["/api/notifications/list"] })
      toast({
        title: "保存完了",
        description: "下書きとして保存しました",
      })
      setFormData(getInitialFormData()) // Reset form after successful save
      setSelectedFiles([])
      setFilePreviews([])
      setFileCaptions({})
      setIsCreating(false)
      // Show the created record details instead of going back to list
      setSelectedRecord(savedRecord)
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
      await queryClient.invalidateQueries({ queryKey: ["/api/schedules/without-records"] })
      await queryClient.invalidateQueries({ queryKey: ["todaySchedules"] })
      await queryClient.invalidateQueries({ queryKey: ["schedules"] })
      await queryClient.invalidateQueries({ queryKey: ["/api/notifications/count"] })
      await queryClient.invalidateQueries({ queryKey: ["/api/notifications/list"] })
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
      // Show the created/updated record details instead of going back to list
      setSelectedRecord(savedRecord)
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

      console.log('🔍 DEBUG - Updating record, API payload:', JSON.stringify({ id: selectedRecord.id, scheduleId: apiData.scheduleId, status }, null, 2));
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
      await queryClient.invalidateQueries({ queryKey: ["/api/schedules/without-records"] })
      await queryClient.invalidateQueries({ queryKey: ["schedules"] })
      await queryClient.invalidateQueries({ queryKey: ["nursing-record-attachments", selectedRecord.id] })
      await queryClient.invalidateQueries({ queryKey: ["/api/notifications/count"] })
      await queryClient.invalidateQueries({ queryKey: ["/api/notifications/list"] })
      toast({
        title: "更新完了",
        description: "記録を更新しました",
      })
      setFormData(getInitialFormData())
      setSelectedFiles([])
      setFilePreviews([])
      setFileCaptions({})
      setIsEditing(false)
      // Show the updated record details instead of going back to list
      setSelectedRecord(updatedRecord)
    } catch (error) {
      console.error('Update record error:', error)
      setSaveError(error instanceof Error ? error.message : '更新中にエラーが発生しました')
    } finally {
      setIsSaving(false)
    }
  }

  // Mark record as reviewed (admin only)
  const handleMarkAsReviewed = async () => {
    if (!selectedRecord) return
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'manager')) {
      toast({
        title: "権限エラー",
        description: "管理者のみが記録を確認済みにできます",
        variant: "destructive"
      })
      return
    }

    setIsSaving(true)
    try {
      const response = await fetch(`/api/nursing-records/${selectedRecord.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'reviewed' })
      })

      if (!response.ok) {
        throw new Error('確認済みステータスへの変更に失敗しました')
      }

      // Invalidate queries to refresh data
      await queryClient.invalidateQueries({ queryKey: ["nursing-records"] })
      await queryClient.invalidateQueries({ queryKey: ["/api/notifications/count"] })
      await queryClient.invalidateQueries({ queryKey: ["/api/notifications/list"] })

      toast({
        title: "確認完了",
        description: "記録を確認済みにしました",
      })

      // Close the detail view
      setSelectedRecord(null)
      setIsCreating(false)
      setIsEditing(false)
    } catch (error) {
      console.error('Mark as reviewed error:', error)
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : '確認済み処理中にエラーが発生しました',
        variant: "destructive"
      })
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
            <div className="text-sm sm:text-base text-muted-foreground">
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
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              if (returnTo) {
                // Return to the specified page (e.g., monthly receipt detail)
                setLocation(decodeURIComponent(returnTo))
              } else if (cameFromUrl) {
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

              {/* その他スタッフ名 */}
              <div className="space-y-2">
                <Label htmlFor="demoStaffName">その他スタッフ名（非担当制の場合）</Label>
                {scheduleFromUrl && formData.selectedScheduleId ? (
                  // スケジュール連携時: 読み取り専用
                  <div className="flex items-center h-10 px-3 border rounded-md bg-gray-100">
                    <span className="text-sm">{scheduleFromUrl.demoStaffName || '-'}</span>
                  </div>
                ) : (
                  // スケジュール未連携時: 入力可能
                  <Input
                    id="demoStaffName"
                    value={formData.demoStaffNameOverride}
                    onChange={(e) => setFormData(prev => ({ ...prev, demoStaffNameOverride: e.target.value }))}
                    placeholder="例: スタッフA"
                  />
                )}
              </div>

              {/* 訪問目的 */}
              <div className="space-y-2">
                <Label htmlFor="purpose">訪問目的</Label>
                {scheduleFromUrl && formData.selectedScheduleId ? (
                  // スケジュール連携時: 読み取り専用
                  <div className="flex items-center h-10 px-3 border rounded-md bg-gray-100">
                    <span className="text-sm">{scheduleFromUrl.purpose || '-'}</span>
                  </div>
                ) : (
                  // スケジュール未連携時: 入力可能
                  <Input
                    id="purpose"
                    value={formData.purposeOverride}
                    onChange={(e) => setFormData(prev => ({ ...prev, purposeOverride: e.target.value }))}
                    placeholder="例: バイタル測定、処置"
                  />
                )}
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
                ) : allSchedules.length === 0 || !formData.selectedScheduleId ? (
                  <div className="flex items-center h-10 px-3 border rounded-md bg-gray-100">
                    <span className="text-sm text-muted-foreground">予定なし（予定外訪問）</span>
                  </div>
                ) : allSchedules.length === 1 ? (
                  <div className="flex items-center h-10 px-3 border rounded-md bg-gray-100">
                    <span className="text-sm">
                      {selectedSchedule?.scheduledStartTime && selectedSchedule?.scheduledEndTime
                        ? `${new Date(selectedSchedule.scheduledStartTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} - ${new Date(selectedSchedule.scheduledEndTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`
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
            {selectedPatient?.specialManagementTypes && selectedPatient.specialManagementTypes.length > 0 && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm text-yellow-900">特別管理加算対象患者</p>
                    <div className="text-xs text-yellow-800 mt-1">
                      <p>対象項目:</p>
                      <ul className="list-disc list-inside ml-2 mt-1">
                        {selectedPatient.specialManagementTypes.map((typeCode, index) => {
                          const definition = specialManagementDefinitions.find(d => d.category === typeCode)
                          return (
                            <li key={index}>{definition?.displayName || typeCode}</li>
                          )
                        })}
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
                  {(selectedRecord.demoStaffName || selectedRecord.demoStaffNameOverride) && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">その他スタッフ名</p>
                      <p className="text-lg">{selectedRecord.demoStaffName || selectedRecord.demoStaffNameOverride}</p>
                    </div>
                  )}
                  {(selectedRecord.purpose || selectedRecord.purposeOverride) && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">訪問目的</p>
                      <p className="text-lg">{selectedRecord.purpose || selectedRecord.purposeOverride}</p>
                    </div>
                  )}
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
                    <Badge className={`text-sm ${getStatusColor(selectedRecord.status)}`}>
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

                              // Use bonusName from server (already in Japanese), fallback to bonusCode
                              const name = bonus.bonusName || bonus.bonusCode || bonus.type || '不明な加算';
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
                  {selectedRecord.specialistCareType && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-2">専門的ケアの種類</p>
                      <div className="bg-purple-50 border border-purple-200 rounded-md p-3">
                        <p className="text-sm">
                          {selectedRecord.specialistCareType === 'palliative_care' && '緩和ケア'}
                          {selectedRecord.specialistCareType === 'pressure_ulcer' && '褥瘡ケア'}
                          {selectedRecord.specialistCareType === 'stoma_care' && '人工肛門・人工膀胱ケア'}
                          {selectedRecord.specialistCareType === 'specific_procedures' && '特定行為'}
                          {!['palliative_care', 'pressure_ulcer', 'stoma_care', 'specific_procedures'].includes(selectedRecord.specialistCareType) && selectedRecord.specialistCareType}
                        </p>
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
              {/* Phase 3: 権限に基づいた編集ボタン */}
              <Button
                onClick={() => handleEditRecord(selectedRecord)}
                disabled={!canEditRecord(selectedRecord)}
                title={!canEditRecord(selectedRecord)
                  ? (selectedRecord.status === 'reviewed'
                    ? '確認済みの記録は管理者のみ編集できます'
                    : 'この記録を編集する権限がありません')
                  : undefined
                }
              >
                <Edit className="mr-1 h-4 w-4" />
                編集
              </Button>
              {selectedRecord.status === 'completed' &&
               currentUser &&
               (currentUser.role === 'admin' || currentUser.role === 'manager') && (
                <Button
                  variant="default"
                  onClick={handleMarkAsReviewed}
                  disabled={isSaving}
                >
                  <CheckCircle className="mr-1 h-4 w-4" />
                  {isSaving ? '処理中...' : '確認済みにする'}
                </Button>
              )}
              <Button variant="outline" onClick={() => {
                if (cameFromUrl) {
                  // Came from URL (Schedule list or other page) - use browser history
                  window.history.back()
                } else {
                  // Came from within this page (record list) - reset state to show list
                  setIsCreating(false)
                  setIsEditing(false)
                  setSelectedRecord(null)
                  setSaveError(null)
                  setCameFromUrl(false)
                }
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
              <AccordionTrigger className="pointer-events-none hover:no-underline">
                <div className="flex items-center gap-2 pointer-events-auto cursor-pointer hover:underline w-fit">
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
                                  src={`/api/doctor-orders/${order.id}/attachment/download`}
                                  className="w-full h-[600px]"
                                  title="指示書PDF"
                                />
                              ) : (
                                <img
                                  src={`/api/doctor-orders/${order.id}/attachment/download`}
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
              <AccordionTrigger className="pointer-events-none hover:no-underline">
                <div className="flex items-center gap-2 pointer-events-auto cursor-pointer hover:underline w-fit">
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
                              src={`/api/service-care-plans/${latestCarePlan.id}/attachment/download`}
                              className="w-full h-[600px]"
                              title="ケアプランPDF"
                            />
                          ) : (
                            <img
                              src={`/api/service-care-plans/${latestCarePlan.id}/attachment/download`}
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
            <TabsList className="grid w-full grid-cols-5 h-auto gap-0.5 sm:gap-1">
              <TabsTrigger value="basic" className="text-xs sm:text-sm py-1.5 sm:py-2 px-1 sm:px-3">
                <span className="hidden sm:inline">基本記録</span>
                <span className="sm:hidden">基本</span>
                <span className="ml-0.5 sm:ml-1 text-red-500">●</span>
              </TabsTrigger>
              <TabsTrigger value="vitals-care" className="text-xs sm:text-sm py-1.5 sm:py-2 px-1 sm:px-3">
                <span className="hidden sm:inline">バイタル・ケア</span>
                <span className="sm:hidden">バイタル</span>
              </TabsTrigger>
              <TabsTrigger value="special" className="text-xs sm:text-sm py-1.5 sm:py-2 px-1 sm:px-3">
                <span className="hidden sm:inline">特管記録</span>
                <span className="sm:hidden">特管</span>
              </TabsTrigger>
              <TabsTrigger value="receipt" className="text-xs sm:text-sm py-1.5 sm:py-2 px-1 sm:px-3">
                <span className="hidden sm:inline">レセプト・加算</span>
                <span className="sm:hidden">レセプト</span>
              </TabsTrigger>
              <TabsTrigger value="photos" className="text-xs sm:text-sm py-1.5 sm:py-2 px-1 sm:px-3">
                <span className="hidden sm:inline">写真・メモ</span>
                <span className="sm:hidden">写真</span>
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
                    onChange={(e) => {
                      const startTime = e.target.value
                      setFormData(prev => {
                        // Calculate end time as 1 hour after start time
                        let endTime = prev.actualEndTime
                        if (startTime) {
                          const [hours, minutes] = startTime.split(':').map(Number)
                          const endHours = (hours + 1) % 24
                          endTime = `${String(endHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
                        }
                        return { ...prev, actualStartTime: startTime, actualEndTime: endTime }
                      })
                    }}
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

              {/* 90分超の警告 */}
              {(() => {
                const startTime = formData.actualStartTime ? new Date(`2000-01-01T${formData.actualStartTime}`) : null
                const endTime = formData.actualEndTime ? new Date(`2000-01-01T${formData.actualEndTime}`) : null
                const duration = startTime && endTime ? (endTime.getTime() - startTime.getTime()) / 1000 / 60 : 0
                return duration > 90 ? (
                  <Alert className="border-amber-300 bg-amber-50">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <AlertTitle className="text-amber-900">長時間訪問（90分超）</AlertTitle>
                    <AlertDescription className="text-amber-700">
                      訪問時間が90分を超えています（{Math.floor(duration)}分）。「レセプト・加算」タブで長時間訪問の理由を記載してください。
                    </AlertDescription>
                  </Alert>
                ) : null
              })()}

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
            </TabsContent>

            {/* バイタル・ケアタブ */}
            <TabsContent value="vitals-care" className="space-y-4 mt-4">
              {/* バイタルサインセクション */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold flex items-center">
                  <Activity className="mr-2 h-4 w-4" />
                  バイタルサイン
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="bp">血圧 (mmHg)</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="bp-systolic"
                        type="number"
                        placeholder="収縮期"
                        value={formData.bloodPressureSystolic || ''}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          bloodPressureSystolic: e.target.value
                        }))}
                      />
                      <span>/</span>
                      <Input
                        id="bp-diastolic"
                        type="number"
                        placeholder="拡張期"
                        value={formData.bloodPressureDiastolic || ''}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          bloodPressureDiastolic: e.target.value
                        }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="heart-rate">脈拍 (bpm)</Label>
                    <Input
                      id="heart-rate"
                      type="number"
                      placeholder="脈拍"
                      value={formData.heartRate || ''}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        heartRate: e.target.value
                      }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="temperature">体温 (°C)</Label>
                    <Input
                      id="temperature"
                      type="number"
                      step="0.1"
                      placeholder="体温"
                      value={formData.temperature || ''}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        temperature: e.target.value
                      }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="respiratory-rate">呼吸数 (回/分)</Label>
                    <Input
                      id="respiratory-rate"
                      type="number"
                      placeholder="呼吸数"
                      value={formData.respiratoryRate || ''}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        respiratoryRate: e.target.value
                      }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="oxygen-saturation">酸素飽和度 (%)</Label>
                    <Input
                      id="oxygen-saturation"
                      type="number"
                      placeholder="SpO2"
                      value={formData.oxygenSaturation || ''}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        oxygenSaturation: e.target.value
                      }))}
                    />
                  </div>
                </div>
              </div>

              <Separator className="my-6" />

              {/* ケア内容セクション */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold flex items-center">
                  <FileText className="mr-2 h-4 w-4" />
                  ケア内容
                </h3>
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
              </div>
            </TabsContent>

            {/* 特管記録タブ */}
            <TabsContent value="special" className="mt-4">
              {(() => {
                const selectedPatient = patientsData?.data.find(p => p.id === formData.patientId)
                const specialTypes = selectedPatient?.specialManagementTypes || []

                if (specialTypes.length === 0) {
                  return (
                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertTitle>特別管理加算の設定がありません</AlertTitle>
                      <AlertDescription>
                        この患者には特別管理加算の設定がありません。患者情報画面から特別管理加算を設定してください。
                      </AlertDescription>
                    </Alert>
                  )
                }

                return (
                  <div className="space-y-4">
                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertTitle>特別管理加算記録</AlertTitle>
                      <AlertDescription>
                        この患者には以下の特別管理加算が設定されています：{specialTypes.join('、')}
                      </AlertDescription>
                    </Alert>

                    {specialTypes.map((type, index) => {
                      const dataKey = `special_${type.replace(/\s+/g, '_')}`
                      const currentData = formData.specialManagementData?.[dataKey] || {}

                      return (
                        <Card key={index}>
                          <CardHeader>
                            <CardTitle className="text-base">{type}</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div className="space-y-2">
                              <Label htmlFor={`${dataKey}-care`}>実施した管理・ケア内容</Label>
                              <Textarea
                                id={`${dataKey}-care`}
                                placeholder="実施した特別管理の内容を記録してください"
                                value={currentData.care || ''}
                                onChange={(e) => {
                                  setFormData(prev => ({
                                    ...prev,
                                    specialManagementData: {
                                      ...prev.specialManagementData,
                                      [dataKey]: {
                                        ...currentData,
                                        care: e.target.value
                                      }
                                    }
                                  }))
                                }}
                                className="min-h-[100px] resize-none"
                              />
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor={`${dataKey}-observation`}>観察事項</Label>
                              <Textarea
                                id={`${dataKey}-observation`}
                                placeholder="特別管理に関連する観察事項を記録してください"
                                value={currentData.observation || ''}
                                onChange={(e) => {
                                  setFormData(prev => ({
                                    ...prev,
                                    specialManagementData: {
                                      ...prev.specialManagementData,
                                      [dataKey]: {
                                        ...currentData,
                                        observation: e.target.value
                                      }
                                    }
                                  }))
                                }}
                                className="min-h-[80px] resize-none"
                              />
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                )
              })()}
            </TabsContent>

            {/* レセプト・加算タブ（新規） */}
            <TabsContent value="receipt" className="space-y-4 mt-4">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>レセプト・加算情報</AlertTitle>
                <AlertDescription>
                  レセプト請求に必要な情報です。訪問時に入力できなかった場合は、後から事務担当者が入力できます。
                </AlertDescription>
              </Alert>

              {/* Phase 3: レセプトCSV対応フィールド */}
              <div className="border rounded-lg p-4">
                <h3 className="text-sm font-semibold mb-3">レセプトCSV出力項目</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* 訪問看護サービスコード */}
                  <div className="space-y-2">
                    <Label htmlFor="nursing-service-code">サービスコード</Label>
                    <Select
                      value={formData.nursingServiceCode || "none"}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, nursingServiceCode: value === "none" ? "" : value }))}
                    >
                      <SelectTrigger id="nursing-service-code">
                        <SelectValue placeholder="選択してください" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">未選択</SelectItem>
                        {nursingServiceCodes.map((code) => (
                          <SelectItem key={code.serviceCode} value={code.serviceCode}>
                            {code.serviceCode} - {code.serviceName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      訪問看護サービスの種類
                    </p>
                  </div>

                  {/* 訪問場所コード */}
                  <div className="space-y-2">
                    <Label htmlFor="visit-location">訪問場所</Label>
                    <Select
                      value={formData.visitLocation || "none"}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, visitLocation: value === "none" ? "" : value }))}
                    >
                      <SelectTrigger id="visit-location">
                        <SelectValue placeholder="選択してください" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">未選択</SelectItem>
                        {visitLocationCodes.map((code) => (
                          <SelectItem key={code.locationCode} value={code.locationCode}>
                            {code.locationCode} - {code.locationName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      訪問を実施した場所
                    </p>
                  </div>

                  {/* 職員資格コード */}
                  <div className="space-y-2">
                    <Label htmlFor="staff-qualification">職員資格</Label>
                    <Select
                      value={formData.staffQualification || "none"}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, staffQualification: value === "none" ? "" : value }))}
                    >
                      <SelectTrigger id="staff-qualification">
                        <SelectValue placeholder="選択してください" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">未選択</SelectItem>
                        {staffQualificationCodes.map((code) => (
                          <SelectItem key={code.qualificationCode} value={code.qualificationCode}>
                            {code.qualificationCode} - {code.qualificationName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      訪問職員の資格
                    </p>
                  </div>
                </div>
              </div>

              {/* 加算管理セクション */}
              <div className="border-t pt-4 mt-4">
                <h3 className="text-sm font-semibold mb-3">加算管理</h3>
                <div className="space-y-3">
                  {/* 緊急訪問看護加算 */}
                  <div className="border rounded-lg">
                    <div className="flex items-start space-x-3 p-3">
                      <Checkbox
                        id="emergency-visit"
                        checked={formData.hasEmergencyVisit}
                        onCheckedChange={(checked) =>
                          setFormData(prev => ({ ...prev, hasEmergencyVisit: checked === true }))
                        }
                      />
                      <div className="flex-1">
                        <Label htmlFor="emergency-visit" className="cursor-pointer font-medium">
                          緊急訪問看護加算
                        </Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          緊急訪問が必要な場合にチェック
                        </p>
                      </div>
                    </div>
                    {formData.hasEmergencyVisit && (
                      <div className="px-3 pb-3 pt-0">
                        <Label htmlFor="emergency-visit-reason" className="text-sm">
                          理由 <span className="text-red-500">*</span>
                        </Label>
                        <Textarea
                          id="emergency-visit-reason"
                          placeholder="緊急訪問が必要な理由を記載してください（例：呼吸困難のため緊急訪問）"
                          value={formData.emergencyVisitReason}
                          onChange={(e) => setFormData(prev => ({ ...prev, emergencyVisitReason: e.target.value }))}
                          className="min-h-[80px] resize-none mt-2"
                        />
                        <p className="text-xs text-muted-foreground mt-2">
                          ※ 緊急訪問看護加算を算定する場合は必ず記載してください
                        </p>
                      </div>
                    )}
                  </div>

                  {/* 複数回訪問加算 */}
                  <div className="border rounded-lg">
                    <div className="flex items-start space-x-3 p-3">
                      <Checkbox
                        id="second-visit"
                        checked={formData.isSecondVisit}
                        onCheckedChange={(checked) =>
                          setFormData(prev => ({ ...prev, isSecondVisit: checked === true }))
                        }
                      />
                      <div className="flex-1">
                        <Label htmlFor="second-visit" className="cursor-pointer font-medium">
                          本日2回目以降の訪問
                        </Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          同日に複数回訪問する場合にチェック
                        </p>
                      </div>
                    </div>
                    {formData.isSecondVisit && (
                      <div className="px-3 pb-3 pt-0">
                        <Label htmlFor="multiple-visit-reason" className="text-sm">
                          理由 <span className="text-red-500">*</span>
                        </Label>
                        <Textarea
                          id="multiple-visit-reason"
                          placeholder="複数回訪問が必要な理由を記載してください"
                          value={formData.multipleVisitReason}
                          onChange={(e) => setFormData(prev => ({ ...prev, multipleVisitReason: e.target.value }))}
                          className="min-h-[80px] resize-none mt-2"
                        />
                      </div>
                    )}
                  </div>

                  {/* 長時間訪問（90分超の場合のみ表示） */}
                  {(() => {
                    const startTime = formData.actualStartTime ? new Date(`2000-01-01T${formData.actualStartTime}`) : null
                    const endTime = formData.actualEndTime ? new Date(`2000-01-01T${formData.actualEndTime}`) : null
                    const duration = startTime && endTime ? (endTime.getTime() - startTime.getTime()) / 1000 / 60 : 0
                    return duration > 90 ? (
                      <div className="border rounded-lg border-amber-300 bg-amber-50">
                        <div className="p-3">
                          <div className="flex items-center space-x-2 mb-2">
                            <AlertCircle className="h-4 w-4 text-amber-600" />
                            <Label className="font-medium text-amber-900">
                              長時間訪問（90分超）
                            </Label>
                          </div>
                          <p className="text-xs text-amber-700 mb-3">
                            訪問時間: {Math.floor(duration)}分 - 理由の記載が必要です
                          </p>
                          <Label htmlFor="long-visit-reason" className="text-sm">
                            理由 <span className="text-red-500">*</span>
                          </Label>
                          <Textarea
                            id="long-visit-reason"
                            placeholder="90分を超える訪問が必要な理由を記載してください"
                            value={formData.longVisitReason}
                            onChange={(e) => setFormData(prev => ({ ...prev, longVisitReason: e.target.value }))}
                            className="min-h-[80px] resize-none mt-2"
                          />
                        </div>
                      </div>
                    ) : null
                  })()}

                  {/* Phase 2-A: 記録フラグ（加算判定用） */}
                  <div className="border-t pt-4 mt-4">
                    <h4 className="text-sm font-medium mb-3">記録フラグ（加算判定用）</h4>
                    <div className="space-y-3">
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="is-discharge-date"
                          checked={formData.isDischargeDate}
                          onChange={(e) => setFormData(prev => ({ ...prev, isDischargeDate: e.target.checked }))}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        <Label htmlFor="is-discharge-date" className="cursor-pointer font-normal">
                          退院日当日の訪問
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="is-first-visit-of-plan"
                          checked={formData.isFirstVisitOfPlan}
                          onChange={(e) => setFormData(prev => ({ ...prev, isFirstVisitOfPlan: e.target.checked }))}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        <Label htmlFor="is-first-visit-of-plan" className="cursor-pointer font-normal">
                          新規計画書作成後の初回訪問
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="has-collaboration-record"
                          checked={formData.hasCollaborationRecord}
                          onChange={(e) => setFormData(prev => ({ ...prev, hasCollaborationRecord: e.target.checked }))}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        <Label htmlFor="has-collaboration-record" className="cursor-pointer font-normal">
                          多職種連携記録あり
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="is-terminal-care"
                          checked={formData.isTerminalCare}
                          onChange={(e) => setFormData(prev => ({ ...prev, isTerminalCare: e.target.checked }))}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        <Label htmlFor="is-terminal-care" className="cursor-pointer font-normal">
                          ターミナルケア実施
                        </Label>
                      </div>
                    </div>

                    {/* Week 3: 専門管理加算用フィールド */}
                    <div className="space-y-2 mt-4">
                      <Label htmlFor="specialist-care-type">専門的ケアの実施</Label>
                      <Select
                        value={formData.specialistCareType}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, specialistCareType: value }))}
                      >
                        <SelectTrigger id="specialist-care-type">
                          <SelectValue placeholder="専門的ケアを選択（該当する場合）" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">なし</SelectItem>
                          <SelectItem value="palliative_care">緩和ケア</SelectItem>
                          <SelectItem value="pressure_ulcer">褥瘡ケア</SelectItem>
                          <SelectItem value="stoma_care">人工肛門・人工膀胱ケア</SelectItem>
                          <SelectItem value="specific_procedures">特定行為</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        専門管理加算の対象となるケアを実施した場合に選択してください（月1回まで算定可能）
                      </p>

                      {/* Week 3: 専門資格警告・推奨 */}
                      {(() => {
                        const userCerts = currentUser?.specialistCertifications || [];
                        const hasSpecialistCert = userCerts.length > 0;
                        const hasCareType = formData.specialistCareType && formData.specialistCareType !== 'none' && formData.specialistCareType !== '';

                        // 専門的ケアの種類に対応する資格名のマッピング
                        const careTypeToSpecialty: Record<string, string> = {
                          'palliative_care': '緩和ケア',
                          'pressure_ulcer': '褥瘡ケア',
                          'stoma_care': '人工肛門・人工膀胱ケア',
                          'specific_procedures': '特定行為研修',
                        };

                        // 選択されたケアに対応する資格を持っているかチェック
                        const selectedCareSpecialty = formData.specialistCareType ? careTypeToSpecialty[formData.specialistCareType] : null;
                        const hasMatchingCert = selectedCareSpecialty ? userCerts.includes(selectedCareSpecialty) : false;

                        // 警告1: 専門的ケアを選択しているが、対応する資格がない
                        if (hasCareType && !hasMatchingCert) {
                          return (
                            <Alert variant="destructive" className="mt-3">
                              <AlertCircle className="h-4 w-4" />
                              <AlertTitle>専門資格未保有</AlertTitle>
                              <AlertDescription>
                                {selectedCareSpecialty ? `「${selectedCareSpecialty}」の専門資格が登録されていません。` : '選択された専門的ケアに対応する資格が登録されていません。'}
                                専門管理加算は適用されません。
                              </AlertDescription>
                            </Alert>
                          );
                        }

                        // 推奨: 専門資格ありで専門的ケア未選択
                        if (!hasCareType && hasSpecialistCert) {
                          return (
                            <Alert className="mt-3 bg-blue-50 border-blue-200">
                              <Info className="h-4 w-4 text-blue-600" />
                              <AlertTitle className="text-blue-900">専門的ケアの記録</AlertTitle>
                              <AlertDescription className="text-blue-800">
                                あなたは専門資格（{userCerts.join('、')}）を保有しています。専門的ケアを実施した場合は選択してください。
                              </AlertDescription>
                            </Alert>
                          );
                        }

                        return null;
                      })()}
                    </div>
                  </div>
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

      {/* Advanced Search Panel */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
              <CardTitle className="text-sm sm:text-base md:text-lg">検索・フィルタ</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs sm:text-sm"
              onClick={() => setShowAdvancedSearch(!showAdvancedSearch)}
            >
              <Sliders className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">{showAdvancedSearch ? '詳細検索を閉じる' : '詳細検索を開く'}</span>
              <span className="sm:hidden">{showAdvancedSearch ? '閉じる' : '詳細'}</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Quick Filters */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:flex md:flex-wrap gap-2 mb-4">
            <Button
              variant="outline"
              size="sm"
              className="w-full md:w-auto"
              onClick={() => {
                const today = new Date().toISOString().split('T')[0]
                setFilterDateFrom(today)
                setFilterDateTo(today)
                setCurrentPage(1)
              }}
            >
              <CalendarDays className="mr-1 h-4 w-4 md:mr-2" />
              <span className="text-xs sm:text-sm">今日</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full md:w-auto"
              onClick={() => {
                const today = new Date()
                const weekAgo = new Date(today)
                weekAgo.setDate(today.getDate() - 7)
                setFilterDateFrom(weekAgo.toISOString().split('T')[0])
                setFilterDateTo(today.toISOString().split('T')[0])
                setCurrentPage(1)
              }}
            >
              <CalendarDays className="mr-1 h-4 w-4 md:mr-2" />
              <span className="text-xs sm:text-sm">今週</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full md:w-auto"
              onClick={() => {
                const today = new Date()
                const monthAgo = new Date(today)
                monthAgo.setMonth(today.getMonth() - 1)
                setFilterDateFrom(monthAgo.toISOString().split('T')[0])
                setFilterDateTo(today.toISOString().split('T')[0])
                setCurrentPage(1)
              }}
            >
              <CalendarDays className="mr-1 h-4 w-4 md:mr-2" />
              <span className="text-xs sm:text-sm">今月</span>
            </Button>
            {currentUser && (
              <Button
                variant="outline"
                size="sm"
                className="w-full md:w-auto"
                onClick={() => {
                  setFilterNurseId(currentUser.id)
                  setCurrentPage(1)
                }}
              >
                <User className="mr-1 h-4 w-4 md:mr-2" />
                <span className="text-xs sm:text-sm">自分の記録</span>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="w-full md:w-auto"
              onClick={() => {
                setFilterStatus('draft')
                setCurrentPage(1)
              }}
            >
              <AlertCircle className="mr-1 h-4 w-4 md:mr-2" />
              <span className="text-xs sm:text-sm">下書きのみ</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full md:w-auto col-span-2 sm:col-span-1"
              onClick={() => {
                // Reset all filters
                setFilterStatus('all')
                setFilterPatientId('all')
                setFilterNurseId('all')
                const today = new Date()
                const monthAgo = new Date(today)
                monthAgo.setMonth(today.getMonth() - 1)
                setFilterDateFrom(monthAgo.toISOString().split('T')[0])
                setFilterDateTo(today.toISOString().split('T')[0])
                setSortBy('visitDate')
                setSortOrder('desc')
                setCurrentPage(1)
              }}
            >
              <RotateCcw className="mr-1 h-4 w-4 md:mr-2" />
              <span className="text-xs sm:text-sm">リセット</span>
            </Button>
          </div>

          {/* Active Filters Display */}
          {(filterStatus !== 'all' || filterPatientId !== 'all' || filterNurseId !== 'all' || filterDateFrom || filterDateTo) && (
            <div className="flex flex-wrap gap-2 mb-4 p-2 sm:p-3 bg-muted rounded-md">
              <span className="text-xs sm:text-sm font-medium">フィルタ中:</span>
              {(filterDateFrom || filterDateTo) && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <span className="hidden sm:inline">期間: </span>
                  {filterDateFrom ? new Date(filterDateFrom).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' }) : '開始日未設定'} ～ {filterDateTo ? new Date(filterDateTo).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' }) : '終了日未設定'}
                  <X
                    className="h-3 w-3 cursor-pointer flex-shrink-0"
                    onClick={() => {
                      // Reset to default (last 1 month)
                      const today = new Date()
                      const monthAgo = new Date(today)
                      monthAgo.setMonth(today.getMonth() - 1)
                      setFilterDateFrom(monthAgo.toISOString().split('T')[0])
                      setFilterDateTo(today.toISOString().split('T')[0])
                    }}
                  />
                </Badge>
              )}
              {filterStatus !== 'all' && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  {filterStatus === 'draft' ? '下書き' : filterStatus === 'completed' ? '完成' : '確認済み'}
                  <X
                    className="h-3 w-3 cursor-pointer flex-shrink-0"
                    onClick={() => setFilterStatus('all')}
                  />
                </Badge>
              )}
              {filterPatientId !== 'all' && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <span className="hidden sm:inline">患者: </span>
                  {patients.find(p => p.id === filterPatientId)?.lastName} {patients.find(p => p.id === filterPatientId)?.firstName}
                  <X
                    className="h-3 w-3 cursor-pointer flex-shrink-0"
                    onClick={() => setFilterPatientId('all')}
                  />
                </Badge>
              )}
              {filterNurseId !== 'all' && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <span className="hidden sm:inline">担当: </span>
                  {users.find(u => u.id === filterNurseId)?.fullName}
                  <X
                    className="h-3 w-3 cursor-pointer flex-shrink-0"
                    onClick={() => setFilterNurseId('all')}
                  />
                </Badge>
              )}
            </div>
          )}

          {/* Advanced Search Form */}
          {showAdvancedSearch && (
            <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 pt-4 border-t">
              <div className="space-y-2">
                <Label className="text-xs sm:text-sm">期間指定</Label>
                <div className="space-y-2 sm:space-y-0 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:gap-2 sm:items-center">
                  <Input
                    type="date"
                    value={filterDateFrom}
                    onChange={(e) => setFilterDateFrom(e.target.value)}
                    className="text-xs sm:text-sm h-9"
                    placeholder="開始日"
                  />
                  <span className="hidden sm:inline text-xs">～</span>
                  <Input
                    type="date"
                    value={filterDateTo}
                    onChange={(e) => setFilterDateTo(e.target.value)}
                    className="text-xs sm:text-sm h-9"
                    placeholder="終了日"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs sm:text-sm">ステータス</Label>
                <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
                  <SelectTrigger className="text-xs sm:text-sm h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべて</SelectItem>
                    <SelectItem value="draft">下書き</SelectItem>
                    <SelectItem value="completed">完成</SelectItem>
                    <SelectItem value="reviewed">確認済み</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 col-span-1 sm:col-span-2 lg:col-span-1">
                <Label className="text-xs sm:text-sm">患者</Label>
                <Select value={filterPatientId} onValueChange={setFilterPatientId}>
                  <SelectTrigger className="text-xs sm:text-sm h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべて</SelectItem>
                    {patients.map((patient) => (
                      <SelectItem key={patient.id} value={patient.id}>
                        {patient.lastName} {patient.firstName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 col-span-1 sm:col-span-2 lg:col-span-1">
                <Label className="text-xs sm:text-sm">担当者</Label>
                <Select value={filterNurseId} onValueChange={setFilterNurseId}>
                  <SelectTrigger className="text-xs sm:text-sm h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべて</SelectItem>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 col-span-1 sm:col-span-2 lg:col-span-1">
                <Label className="text-xs sm:text-sm">並び替え項目</Label>
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                  <SelectTrigger className="text-xs sm:text-sm h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="visitDate">訪問日</SelectItem>
                    <SelectItem value="recordDate">記録日</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 col-span-1 sm:col-span-2 lg:col-span-1">
                <Label className="text-xs sm:text-sm">並び順</Label>
                <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as any)}>
                  <SelectTrigger className="text-xs sm:text-sm h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">降順</SelectItem>
                    <SelectItem value="asc">昇順</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

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
          {/* Records */}
          <div className="space-y-3 sm:space-y-4">
            {filteredRecords.map((record) => (
              <div key={record.id} className="border rounded-lg p-3 sm:p-4 hover-elevate">
                {/* Mobile layout (stacked) */}
                <div className="sm:hidden space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-base">{record.patientName}</h3>
                      <Badge className={`text-xs ${getStatusColor(record.status)}`}>
                        {getStatusText(record.status)}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 flex-shrink-0" />
                        <span className="font-medium">訪問日:</span>
                        <span>{record.visitDate ? new Date(record.visitDate).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' }) : new Date(record.recordDate).toLocaleDateString('ja-JP')}</span>
                      </div>
                      {record.actualStartTime && record.actualEndTime && (
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 flex-shrink-0" />
                          <span className="font-medium">訪問時間:</span>
                          <span>{new Date(record.actualStartTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} - {new Date(record.actualEndTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3 flex-shrink-0" />
                        <span className="font-medium">担当:</span>
                        <span>{record.nurseName}</span>
                      </div>
                      {record.observations && <p className="line-clamp-2 text-xs">📋 {record.observations}</p>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {/* Phase 3: 権限チェック統合 */}
                    <Button
                      size="sm"
                      className="text-xs h-8 flex-1"
                      onClick={() => handleEditRecord(record)}
                      disabled={!canEditRecord(record)}
                      data-testid={`button-edit-${record.id}`}
                      title={!canEditRecord(record)
                        ? (record.status === 'reviewed'
                          ? '確認済みの記録は管理者のみ編集できます'
                          : 'この記録を編集する権限がありません')
                        : undefined
                      }
                    >
                      <Edit className="mr-1 h-3 w-3" />
                      編集
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-8 flex-1"
                      onClick={() => handleViewRecord(record)}
                      data-testid={`button-view-${record.id}`}
                    >
                      <Eye className="mr-1 h-3 w-3" />
                      詳細
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="text-xs h-8 flex-1"
                      onClick={() => setRecordToDelete(record)}
                      data-testid={`button-delete-${record.id}`}
                    >
                      <Trash2 className="mr-1 h-3 w-3" />
                      削除
                    </Button>
                  </div>
                </div>

                {/* Desktop layout (horizontal) */}
                <div className="hidden sm:flex flex-col md:flex-row md:items-center justify-between gap-4">
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

                  <div className="flex gap-2 flex-shrink-0">
                    {/* Phase 3: 権限チェック統合 */}
                    <Button
                      size="sm"
                      onClick={() => handleEditRecord(record)}
                      disabled={!canEditRecord(record)}
                      data-testid={`button-edit-${record.id}`}
                      title={!canEditRecord(record)
                        ? (record.status === 'reviewed'
                          ? '確認済みの記録は管理者のみ編集できます'
                          : 'この記録を編集する権限がありません')
                        : undefined
                      }
                    >
                      <Edit className="mr-1 h-3 w-3" />
                      編集
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleViewRecord(record)}
                      data-testid={`button-view-${record.id}`}
                    >
                      <Eye className="mr-1 h-3 w-3" />
                      詳細
                    </Button>
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

          {/* Pagination Controls */}
          {recordsData && recordsData.pagination.totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t">
              <div className="text-xs sm:text-sm text-muted-foreground text-center sm:text-left">
                全 {recordsData.pagination.total} 件中 {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, recordsData.pagination.total)} 件を表示
              </div>
              <div className="flex items-center gap-1 sm:gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  aria-label="最初のページ"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  aria-label="前のページ"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs sm:text-sm px-2 min-w-[4rem] text-center">
                  {currentPage} / {recordsData.pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setCurrentPage(p => Math.min(recordsData.pagination.totalPages, p + 1))}
                  disabled={currentPage === recordsData.pagination.totalPages}
                  aria-label="次のページ"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setCurrentPage(recordsData.pagination.totalPages)}
                  disabled={currentPage === recordsData.pagination.totalPages}
                  aria-label="最後のページ"
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
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
