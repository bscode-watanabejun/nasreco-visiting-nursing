import { useState, useEffect, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, CheckCircle, XCircle, Camera, Upload, X, Image as ImageIcon, FileText, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import type { Patient, Schedule, PaginatedResult, NursingRecordAttachment } from "@shared/schema"

interface VisitRecordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  schedule?: Schedule | null
}

interface FormData {
  patientId: string
  visitStatusRecord: "completed" | "cancelled" | "rescheduled"
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

const getInitialFormData = (schedule?: Schedule | null): FormData => ({
  patientId: schedule?.patientId || '',
  visitStatusRecord: 'completed',
  actualStartTime: schedule?.actualStartTime
    ? new Date(schedule.actualStartTime).toTimeString().slice(0, 5)
    : new Date().toTimeString().slice(0, 5),
  actualEndTime: schedule?.actualEndTime
    ? new Date(schedule.actualEndTime).toTimeString().slice(0, 5)
    : new Date().toTimeString().slice(0, 5),
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
  emergencyVisitReason: schedule?.visitType === '緊急訪問' ? '緊急訪問のため' : '',
  longVisitReason: '',
  selectedScheduleId: schedule?.id || ''
})

export function VisitRecordDialog({ open, onOpenChange, schedule }: VisitRecordDialogProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState("basic")
  const [formData, setFormData] = useState<FormData>(getInitialFormData(schedule))
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<string[]>([])

  // File attachments state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [filePreviews, setFilePreviews] = useState<string[]>([])
  const [fileCaptions, setFileCaptions] = useState<{ [key: number]: string }>({})
  const [isUploading, setIsUploading] = useState(false)
  const [savedRecordId, setSavedRecordId] = useState<string | null>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Reset form data when dialog opens or schedule changes
  useEffect(() => {
    if (open) {
      setFormData(getInitialFormData(schedule))
      setSaveError(null)
      setValidationErrors([])
      setActiveTab("basic")
      setSelectedFiles([])
      setFilePreviews([])
      setFileCaptions({})
      setSavedRecordId(null)
    }
  }, [open, schedule])

  // Fetch patients
  const { data: patientsData } = useQuery<PaginatedResult<Patient>>({
    queryKey: ["patients"],
    queryFn: async () => {
      const response = await fetch("/api/patients")
      if (!response.ok) throw new Error("患者データの取得に失敗しました")
      return response.json()
    },
  })

  // Fetch current user
  const { data: userData } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const response = await fetch("/api/auth/me")
      if (!response.ok) throw new Error("ユーザー情報の取得に失敗しました")
      return response.json()
    },
  })

  const patients = patientsData?.data || []
  const currentUser = userData?.user
  const selectedPatient = patients.find(p => p.id === formData.patientId)

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
    enabled: !!formData.patientId && !schedule, // Only fetch if patient is selected and not from schedule
  })

  const patientSchedules = (patientSchedulesData?.data || []) as Schedule[]
  const selectedSchedule = patientSchedules.find(s => s.id === formData.selectedScheduleId)

  const validateForm = (isComplete: boolean): string[] => {
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

    // 完了時のみ追加のバリデーションを実施
    if (isComplete) {
      if (!formData.observations.trim()) {
        errors.push('「観察事項」を入力してください')
      }

      // 加算管理のバリデーション
      if (formData.isSecondVisit && !formData.multipleVisitReason.trim()) {
        errors.push('複数回訪問の理由を入力してください')
      }
      if (schedule?.visitType === '緊急訪問' && !formData.emergencyVisitReason.trim()) {
        errors.push('緊急訪問の理由を入力してください')
      }

      // 長時間訪問チェック
      const startTime = formData.actualStartTime ? new Date(`2000-01-01T${formData.actualStartTime}`) : null
      const endTime = formData.actualEndTime ? new Date(`2000-01-01T${formData.actualEndTime}`) : null
      const duration = startTime && endTime ? (endTime.getTime() - startTime.getTime()) / 1000 / 60 : 0
      if (duration > 90 && !formData.longVisitReason.trim()) {
        errors.push('長時間訪問（90分超）の理由を入力してください')
      }

      // 特別管理加算の検証（該当項目がある場合）
      if (selectedPatient?.isCritical) {
        // 将来的な検証ロジック
      }
    }

    return errors
  }

  const handleSaveDraft = async () => {
    setSaveError(null)
    setValidationErrors([])

    const errors = validateForm(false)
    if (errors.length > 0) {
      setValidationErrors(errors)
      return
    }

    setIsSaving(true)

    try {
      const currentDateTime = new Date()
      const today = currentDateTime.toISOString().split('T')[0]

      // 時間をISO文字列に変換
      const startDateTime = new Date(`${today}T${formData.actualStartTime}:00`)
      const endDateTime = new Date(`${today}T${formData.actualEndTime}:00`)

      const apiData = {
        patientId: formData.patientId,
        recordType: 'general_care' as const,
        recordDate: currentDateTime.toISOString(),
        status: 'draft' as const,
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

      const response = await fetch('/api/nursing-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiData),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown server error' }))
        throw new Error(error.error || `サーバーエラー (${response.status})`)
      }

      await queryClient.invalidateQueries({ queryKey: ["nursing-records"] })
      await queryClient.invalidateQueries({ queryKey: ["todaySchedules"] })
      await queryClient.invalidateQueries({ queryKey: ["schedules"] })
      toast({
        title: "保存完了",
        description: "下書きとして保存しました",
      })
      setFormData(getInitialFormData())
      onOpenChange(false)

    } catch (error) {
      console.error('Save draft error:', error)
      setSaveError(error instanceof Error ? error.message : '保存中にエラーが発生しました')
    } finally {
      setIsSaving(false)
    }
  }

  // File handling functions
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    await addFiles(files)
  }

  const addFiles = async (files: File[]) => {
    // Validate file types
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf']
    const invalidFiles = files.filter(f => !validTypes.includes(f.type))

    if (invalidFiles.length > 0) {
      toast({
        title: "エラー",
        description: "画像（JPEG、PNG）またはPDFファイルのみアップロード可能です",
        variant: "destructive"
      })
      return
    }

    // Validate file sizes (10MB max)
    const oversizedFiles = files.filter(f => f.size > 10 * 1024 * 1024)
    if (oversizedFiles.length > 0) {
      toast({
        title: "エラー",
        description: "ファイルサイズは10MB以下にしてください",
        variant: "destructive"
      })
      return
    }

    // Check total file count
    if (selectedFiles.length + files.length > 10) {
      toast({
        title: "エラー",
        description: "ファイルは最大10個までアップロード可能です",
        variant: "destructive"
      })
      return
    }

    // Generate previews for images
    const newPreviews: string[] = []
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        // Compress image before preview
        const compressed = await compressImage(file)
        const preview = URL.createObjectURL(compressed)
        newPreviews.push(preview)
      } else {
        newPreviews.push('') // PDF doesn't need preview
      }
    }

    setSelectedFiles(prev => [...prev, ...files])
    setFilePreviews(prev => [...prev, ...newPreviews])
  }

  const compressImage = async (file: File): Promise<File> => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')!

          // Max dimensions
          const maxWidth = 1920
          const maxHeight = 1920
          let width = img.width
          let height = img.height

          // Calculate new dimensions
          if (width > height) {
            if (width > maxWidth) {
              height *= maxWidth / width
              width = maxWidth
            }
          } else {
            if (height > maxHeight) {
              width *= maxHeight / height
              height = maxHeight
            }
          }

          canvas.width = width
          canvas.height = height
          ctx.drawImage(img, 0, 0, width, height)

          canvas.toBlob((blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now()
              })
              resolve(compressedFile)
            } else {
              resolve(file)
            }
          }, 'image/jpeg', 0.85)
        }
        img.src = e.target?.result as string
      }
      reader.readAsDataURL(file)
    })
  }

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
    setFilePreviews(prev => {
      // Revoke object URL to prevent memory leak
      if (prev[index]) URL.revokeObjectURL(prev[index])
      return prev.filter((_, i) => i !== index)
    })
    setFileCaptions(prev => {
      const newCaptions = { ...prev }
      delete newCaptions[index]
      // Reindex captions
      const reindexed: { [key: number]: string } = {}
      Object.keys(newCaptions).forEach(key => {
        const oldIndex = parseInt(key)
        if (oldIndex > index) {
          reindexed[oldIndex - 1] = newCaptions[oldIndex]
        } else {
          reindexed[oldIndex] = newCaptions[oldIndex]
        }
      })
      return reindexed
    })
  }

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

  const handleSave = async () => {
    setSaveError(null)
    setValidationErrors([])

    const errors = validateForm(true)
    if (errors.length > 0) {
      setValidationErrors(errors)
      return
    }

    setIsSaving(true)

    try {
      const currentDateTime = new Date()
      const today = currentDateTime.toISOString().split('T')[0]

      // 時間をISO文字列に変換
      const startDateTime = new Date(`${today}T${formData.actualStartTime}:00`)
      const endDateTime = new Date(`${today}T${formData.actualEndTime}:00`)

      const apiData = {
        patientId: formData.patientId,
        recordType: 'general_care' as const,
        recordDate: currentDateTime.toISOString(),
        status: 'completed' as const,
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

      const response = await fetch('/api/nursing-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiData),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown server error' }))
        throw new Error(error.error || `サーバーエラー (${response.status})`)
      }

      const savedRecord = await response.json()

      // Upload attachments if any files are selected
      if (selectedFiles.length > 0 && savedRecord.id) {
        await uploadAttachments(savedRecord.id)
      }

      // 訪問ステータスが「完了」の場合、スケジュールのステータスも更新
      if (formData.visitStatusRecord === 'completed') {
        const scheduleId = schedule?.id || formData.selectedScheduleId
        if (scheduleId && scheduleId !== 'none') {
          try {
            const statusResponse = await fetch(`/api/schedules/${scheduleId}/status`, {
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
      }

      await queryClient.invalidateQueries({ queryKey: ["nursing-records"] })
      await queryClient.invalidateQueries({ queryKey: ["todaySchedules"] })
      await queryClient.invalidateQueries({ queryKey: ["schedules"] })
      toast({
        title: "保存完了",
        description: "訪問記録を保存しました",
      })
      setFormData(getInitialFormData())
      onOpenChange(false)

    } catch (error) {
      console.error('Save error:', error)
      setSaveError(error instanceof Error ? error.message : '保存中にエラーが発生しました')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl sm:text-2xl">
            訪問記録の作成
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })} の訪問記録を作成します
          </p>
        </DialogHeader>

        {/* 基本情報セクション */}
        <div className="space-y-4 p-4 bg-gray-50 rounded-lg border">
          <h3 className="font-semibold text-base">基本情報</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 患者名 */}
            <div className="space-y-2">
              <Label htmlFor="patient">患者名</Label>
              <Select
                value={formData.patientId}
                onValueChange={(value) => setFormData(prev => ({ ...prev, patientId: value }))}
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
              ) : schedule ? (
                <div className="flex items-center h-10 px-3 border rounded-md bg-gray-100">
                  <span className="text-sm">
                    {schedule.scheduledStartTime && schedule.scheduledEndTime
                      ? `${new Date(schedule.scheduledStartTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} - ${new Date(schedule.scheduledEndTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`
                      : '予定時間未設定'}
                  </span>
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
                    {patientSchedules.map((sched) => (
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
                onValueChange={(value: "completed" | "cancelled" | "rescheduled") =>
                  setFormData(prev => ({ ...prev, visitStatusRecord: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="completed">完了</SelectItem>
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

          {/* メッセージ表示エリア */}
          {validationErrors.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <div className="flex items-start gap-2">
                <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-sm text-red-900">未入力の必須項目があります</p>
                  <ul className="list-disc list-inside text-xs text-red-800 mt-1">
                    {validationErrors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* タブ */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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
              <span className="ml-1 text-red-500">●</span>
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

                {schedule?.visitType === '緊急訪問' && (
                  <div className="space-y-2">
                    <Label htmlFor="emergency-visit-reason">
                      緊急訪問の理由 <span className="text-red-500">*</span>
                    </Label>
                    <Textarea
                      id="emergency-visit-reason"
                      placeholder="緊急訪問が必要となった理由を記載してください"
                      value={formData.emergencyVisitReason}
                      onChange={(e) => setFormData(prev => ({ ...prev, emergencyVisitReason: e.target.value }))}
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
              onChange={handleFileSelect}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              onChange={handleFileSelect}
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

            {/* File list */}
            {selectedFiles.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">選択中のファイル ({selectedFiles.length}/10)</p>
                </div>

                <div className="space-y-3">
                  {selectedFiles.map((file, index) => (
                    <div key={index} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-start gap-3">
                        {/* Preview */}
                        <div className="flex-shrink-0">
                          {file.type.startsWith('image/') ? (
                            filePreviews[index] ? (
                              <img
                                src={filePreviews[index]}
                                alt={file.name}
                                className="w-20 h-20 object-cover rounded border"
                              />
                            ) : (
                              <div className="w-20 h-20 bg-gray-100 rounded border flex items-center justify-center">
                                <ImageIcon className="h-8 w-8 text-gray-400" />
                              </div>
                            )
                          ) : (
                            <div className="w-20 h-20 bg-gray-100 rounded border flex items-center justify-center">
                              <FileText className="h-8 w-8 text-gray-400" />
                            </div>
                          )}
                        </div>

                        {/* File info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{file.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {(file.size / 1024).toFixed(1)} KB
                          </p>

                          {/* Caption input */}
                          <div className="mt-2">
                            <Input
                              placeholder="メモ・説明を入力"
                              value={fileCaptions[index] || ''}
                              onChange={(e) => setFileCaptions(prev => ({
                                ...prev,
                                [index]: e.target.value
                              }))}
                              className="text-sm"
                            />
                          </div>
                        </div>

                        {/* Delete button */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeFile(index)}
                          className="flex-shrink-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upload status */}
            {isUploading && (
              <div className="flex items-center justify-center gap-2 p-4 bg-blue-50 rounded-lg">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">アップロード中...</span>
              </div>
            )}

            {/* Info text */}
            <div className="text-xs text-muted-foreground space-y-1 p-3 bg-gray-50 rounded">
              <p>• 画像（JPEG、PNG）またはPDFファイルをアップロードできます</p>
              <p>• ファイルサイズは1ファイルあたり10MBまで</p>
              <p>• 最大10個のファイルをアップロード可能</p>
              <p>• 画像は自動的に圧縮されます</p>
            </div>
          </TabsContent>
        </Tabs>

        {/* エラー表示 */}
        {saveError && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex items-start gap-2">
              <XCircle className="h-5 w-5 text-red-400 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-medium text-red-800">エラー</h3>
                <p className="text-sm text-red-700 mt-1">{saveError}</p>
              </div>
            </div>
          </div>
        )}

        {/* アクションボタン */}
        <div className="flex flex-col sm:flex-row justify-end gap-2 pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
            className="w-full sm:w-auto"
          >
            キャンセル
          </Button>
          <Button
            variant="outline"
            onClick={handleSaveDraft}
            disabled={isSaving}
            className="w-full sm:w-auto"
          >
            {isSaving ? '保存中...' : '下書き保存'}
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full sm:w-auto bg-orange-500 hover:bg-orange-600"
          >
            {isSaving ? '保存中...' : '記録を保存'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
