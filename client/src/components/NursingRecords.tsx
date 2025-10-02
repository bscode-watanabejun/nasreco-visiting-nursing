import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
  ChevronDown
} from "lucide-react"

import type { Patient, NursingRecord, PaginatedResult } from "@shared/schema"

// Display-specific interface for nursing records with patient/nurse names
interface NursingRecordDisplay extends NursingRecord {
  patientName?: string
  nurseName?: string
}

interface FormData {
  patientId: string
  date: string
  time: string
  visitType: string
  vitalSigns: {
    temperature: string
    pulse: string
    systolicBP: string
    diastolicBP: string
    spo2: string
    respiration: string
  }
  observations: string
  careProvided: string
  patientFamilyResponse: string
}

// Helper function to get full name
const getFullName = (patient: Patient): string => {
  return `${patient.lastName} ${patient.firstName}`
}

// Helper function to convert FormData to API format (corrected for Zod validation)
const convertFormDataToApiFormat = (formData: FormData, status: 'draft' | 'completed') => {
  const currentDateTime = new Date()
  const visitDateTime = new Date(`${formData.date}T${formData.time}`)

  const apiData: any = {
    patientId: formData.patientId,
    recordType: 'general_care' as const,
    recordDate: currentDateTime.toISOString(), // ISO string for API

    // NEW: Status field (now supported)
    status,

    // Core required fields
    title: `${formData.visitType || '訪問記録'} - ${formData.date}`,
    content: `訪問日時: ${formData.date} ${formData.time}\n訪問種別: ${formData.visitType || '未選択'}\nステータス: ${status === 'draft' ? '下書き' : '完成'}\n\n観察事項:\n${formData.observations || '未入力'}\n\n実施したケア:\n${formData.careProvided || '未入力'}\n\n患者・家族の反応:\n${formData.patientFamilyResponse || '特になし'}`,

    // Structured fields
    observations: formData.observations || '',
    interventions: formData.careProvided || '',
    evaluation: `記録ステータス: ${status === 'draft' ? '下書き' : '完成'}`,
  }

  // Add optional fields only if they have values
  if (formData.visitType) {
    apiData.visitTypeCategory = formData.visitType
  }

  if (formData.date && formData.time) {
    apiData.visitTime = visitDateTime.toISOString()
  }

  if (formData.patientFamilyResponse) {
    apiData.patientFamilyResponse = formData.patientFamilyResponse
  }

  // Add vital signs only if they have values
  if (formData.vitalSigns.systolicBP && formData.vitalSigns.systolicBP.trim()) {
    apiData.bloodPressureSystolic = parseInt(formData.vitalSigns.systolicBP)
  }

  if (formData.vitalSigns.diastolicBP && formData.vitalSigns.diastolicBP.trim()) {
    apiData.bloodPressureDiastolic = parseInt(formData.vitalSigns.diastolicBP)
  }

  if (formData.vitalSigns.pulse && formData.vitalSigns.pulse.trim()) {
    apiData.heartRate = parseInt(formData.vitalSigns.pulse)
  }

  if (formData.vitalSigns.temperature && formData.vitalSigns.temperature.trim()) {
    apiData.temperature = formData.vitalSigns.temperature // Keep as string for decimal schema
  }

  if (formData.vitalSigns.respiration && formData.vitalSigns.respiration.trim()) {
    apiData.respiratoryRate = parseInt(formData.vitalSigns.respiration)
  }

  if (formData.vitalSigns.spo2 && formData.vitalSigns.spo2.trim()) {
    apiData.oxygenSaturation = parseInt(formData.vitalSigns.spo2)
  }

  return apiData
}

// Helper function to validate required fields
const validateFormData = (formData: FormData, isComplete: boolean) => {
  const errors: string[] = []

  if (!formData.patientId) {
    errors.push('患者を選択してください')
  }

  if (!formData.date) {
    errors.push('訪問日を入力してください')
  }

  if (!formData.time) {
    errors.push('訪問時間を入力してください')
  }

  // Complete record requires additional validation
  if (isComplete) {
    if (!formData.visitType) {
      errors.push('訪問理由を選択してください')
    }

    if (!formData.observations.trim()) {
      errors.push('観察事項を入力してください')
    }

    if (!formData.careProvided.trim()) {
      errors.push('実施したケアを入力してください')
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

// Helper function to get initial form data
const getInitialFormData = (): FormData => ({
  patientId: '',
  date: new Date().toISOString().split('T')[0],
  time: new Date().toTimeString().slice(0, 5),
  visitType: '',
  vitalSigns: {
    temperature: '',
    pulse: '',
    systolicBP: '',
    diastolicBP: '',
    spo2: '',
    respiration: ''
  },
  observations: '',
  careProvided: '',
  patientFamilyResponse: ''
})

export function NursingRecords() {
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'completed' | 'reviewed'>('all')
  const [selectedRecord, setSelectedRecord] = useState<NursingRecordDisplay | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [activeTab, setActiveTab] = useState<'form' | 'preview'>('form')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(getInitialFormData())

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

  const patients = patientsData?.data || []
  const rawRecords = recordsData?.data || []

  // Transform records to include patient and nurse names
  const records: NursingRecordDisplay[] = rawRecords.map(record => {
    const patient = patients.find(p => p.id === record.patientId)
    const patientName = patient ? `${patient.lastName} ${patient.firstName}` : '不明'

    return {
      ...record,
      patientName,
      nurseName: '看護師名' // TODO: Fetch nurse names from users API
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
    setSaveError(null) // Clear any previous errors

    // Load record data for view-only display
    const visitDate = record.visitTime ? new Date(record.visitTime) : new Date()
    setFormData({
      patientId: record.patientId,
      date: visitDate.toISOString().split('T')[0],
      time: visitDate.toTimeString().slice(0, 5),
      visitType: record.visitTypeCategory || '',
      vitalSigns: {
        temperature: record.temperature?.toString() || '',
        pulse: record.heartRate?.toString() || '',
        systolicBP: record.bloodPressureSystolic?.toString() || '',
        diastolicBP: record.bloodPressureDiastolic?.toString() || '',
        spo2: record.oxygenSaturation?.toString() || '',
        respiration: record.respiratoryRate?.toString() || ''
      },
      observations: record.observations || '',
      careProvided: record.interventions || '',
      patientFamilyResponse: record.patientFamilyResponse || ''
    })

    console.log('記録表示:', record.id)
  }

  const handleEditRecord = (record: NursingRecordDisplay) => {
    setSelectedRecord(record)
    setIsCreating(false)
    setIsEditing(true)
    setSaveError(null) // Clear any previous errors

    // Load existing record data into form
    const visitDate = record.visitTime ? new Date(record.visitTime) : new Date()
    setFormData({
      patientId: record.patientId,
      date: visitDate.toISOString().split('T')[0],
      time: visitDate.toTimeString().slice(0, 5),
      visitType: record.visitTypeCategory || '',
      vitalSigns: {
        temperature: record.temperature?.toString() || '',
        pulse: record.heartRate?.toString() || '',
        systolicBP: record.bloodPressureSystolic?.toString() || '',
        diastolicBP: record.bloodPressureDiastolic?.toString() || '',
        spo2: record.oxygenSaturation?.toString() || '',
        respiration: record.respiratoryRate?.toString() || ''
      },
      observations: record.observations || '',
      careProvided: record.interventions || '',
      patientFamilyResponse: record.patientFamilyResponse || ''
    })
    console.log('記録編集モード:', record.id)
  }

  // Save as draft function
  const handleSaveDraft = async () => {
    setSaveError(null)
    setIsSaving(true)

    try {
      const validationErrors = validateFormData(formData, false)
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
      const validationErrors = validateFormData(formData, true)
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
      const validationErrors = validateFormData(formData, status === 'completed' || status === 'reviewed')
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
              {isCreating ? '新規訪問記録' : '訪問記録詳細'}
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              {isCreating ? '新しい訪問記録を作成' : `${selectedRecord?.patientName}さんの記録`}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setIsCreating(false)
              setIsEditing(false)
              setSelectedRecord(null)
              setSaveError(null)
            }}
            className="w-full sm:w-auto flex-shrink-0"
          >
            一覧に戻る
          </Button>
        </div>

        {/* Patient Selection */}
        {(isCreating || isEditing) && (
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <Label htmlFor="patient-select">患者を選択 *</Label>
                <Select
                  value={formData.patientId}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, patientId: value }))}
                  disabled={isEditing}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="患者を選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    {patients.map((patient) => (
                      <SelectItem key={patient.id} value={patient.id}>
                        <div className="flex items-center justify-between w-full">
                          <span>{getFullName(patient)}</span>
                          {patient.isCritical && (
                            <Badge className="ml-2 bg-red-100 text-red-800 border-red-200 text-xs">
                              重要
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Form/Preview Tabs */}
        {(isCreating || isEditing) ? (
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'form' | 'preview')} className="w-full">
            <div className="border-b border-gray-200 mb-4">
              <TabsList className="grid w-full grid-cols-2 bg-gray-50">
                <TabsTrigger value="form" className="text-sm sm:text-base">フォーム</TabsTrigger>
                <TabsTrigger value="preview" className="text-sm sm:text-base">プレビュー</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="form" className="space-y-6">
              {renderFormContent(selectedRecord, formData, setFormData)}
            </TabsContent>

            <TabsContent value="preview" className="space-y-6">
              {renderPreviewContent(formData, selectedPatient)}
            </TabsContent>
          </Tabs>
        ) : (
          // View-only mode
          <div className="space-y-6">
            {renderPreviewContent(formData, selectedPatient)}
          </div>
        )}

        {/* Error Display */}
        {saveError && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <AlertCircle className="h-5 w-5 text-red-400" />
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">エラー</h3>
                <div className="mt-2 text-sm text-red-700">
                  {saveError.split('\n').map((error, index) => (
                    <p key={index}>{error}</p>
                  ))}
                </div>
              </div>
            </div>
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
          新規記録作成
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
    </div>
  )
}

// Helper function to render form content
function renderFormContent(
  selectedRecord: NursingRecord | null,
  formData: FormData,
  setFormData: React.Dispatch<React.SetStateAction<FormData>>
) {
  return (
    <div className="space-y-6">
      {/* Basic Information Section */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold">基本情報</CardTitle>
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Visit Date and Time - Responsive Layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="visit-date">訪問日 *</Label>
              <Input
                id="visit-date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="visit-time">訪問時間 *</Label>
              <Input
                id="visit-time"
                type="time"
                value={formData.time}
                onChange={(e) => setFormData(prev => ({ ...prev, time: e.target.value }))}
                className="w-full"
              />
            </div>
          </div>

          {/* Visit Type */}
          <div className="space-y-2">
            <Label htmlFor="visit-type">訪問理由</Label>
            <Select
              value={formData.visitType}
              onValueChange={(value) => setFormData(prev => ({ ...prev, visitType: value }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="選択してください" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="定期訪問">定期訪問</SelectItem>
                <SelectItem value="緊急訪問">緊急訪問</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Vital Signs Section */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold">バイタルサイン</CardTitle>
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          {/* Responsive Vital Signs Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="temperature">体温</Label>
              <div className="relative">
                <Input
                  id="temperature"
                  type="number"
                  step="0.1"
                  placeholder="36.5"
                  value={formData.vitalSigns.temperature}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    vitalSigns: { ...prev.vitalSigns, temperature: e.target.value }
                  }))}
                  className="pr-8 placeholder:text-gray-400"
                />
                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-muted-foreground">
                  ℃
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pulse">脈拍</Label>
              <div className="relative">
                <Input
                  id="pulse"
                  type="number"
                  placeholder="72"
                  value={formData.vitalSigns.pulse}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    vitalSigns: { ...prev.vitalSigns, pulse: e.target.value }
                  }))}
                  className="pr-12 placeholder:text-gray-400"
                />
                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-muted-foreground">
                  回/分
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="systolic-bp">血圧（収縮期）</Label>
              <div className="relative">
                <Input
                  id="systolic-bp"
                  type="number"
                  placeholder="120"
                  value={formData.vitalSigns.systolicBP}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    vitalSigns: { ...prev.vitalSigns, systolicBP: e.target.value }
                  }))}
                  className="pr-12 placeholder:text-gray-400"
                />
                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-muted-foreground">
                  mmHg
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="diastolic-bp">血圧（拡張期）</Label>
              <div className="relative">
                <Input
                  id="diastolic-bp"
                  type="number"
                  placeholder="80"
                  value={formData.vitalSigns.diastolicBP}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    vitalSigns: { ...prev.vitalSigns, diastolicBP: e.target.value }
                  }))}
                  className="pr-12 placeholder:text-gray-400"
                />
                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-muted-foreground">
                  mmHg
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="spo2">SpO2</Label>
              <div className="relative">
                <Input
                  id="spo2"
                  type="number"
                  placeholder="98"
                  value={formData.vitalSigns.spo2}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    vitalSigns: { ...prev.vitalSigns, spo2: e.target.value }
                  }))}
                  className="pr-8 placeholder:text-gray-400"
                />
                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-muted-foreground">
                  %
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="respiration">呼吸数</Label>
              <div className="relative">
                <Input
                  id="respiration"
                  type="number"
                  placeholder="18"
                  value={formData.vitalSigns.respiration}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    vitalSigns: { ...prev.vitalSigns, respiration: e.target.value }
                  }))}
                  className="pr-12 placeholder:text-gray-400"
                />
                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-muted-foreground">
                  回/分
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Nursing Records Section */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold">訪問記録</CardTitle>
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="observations">観察事項 *</Label>
            <Textarea
              id="observations"
              placeholder="患者の状態、症状、外観などを記載してください"
              value={formData.observations}
              onChange={(e) => setFormData(prev => ({ ...prev, observations: e.target.value }))}
              className="min-h-[120px] resize-none placeholder:text-gray-400"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="care-provided">実施したケア *</Label>
            <Textarea
              id="care-provided"
              placeholder="実施した看護ケア、処置などを記載してください"
              value={formData.careProvided}
              onChange={(e) => setFormData(prev => ({ ...prev, careProvided: e.target.value }))}
              className="min-h-[120px] resize-none placeholder:text-gray-400"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="patient-family-response">患者・家族の反応</Label>
            <Textarea
              id="patient-family-response"
              placeholder="患者や家族の反応、コメントなどを記載してください"
              value={formData.patientFamilyResponse}
              onChange={(e) => setFormData(prev => ({ ...prev, patientFamilyResponse: e.target.value }))}
              className="min-h-[100px] resize-none placeholder:text-gray-400"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Helper function to render preview content
function renderPreviewContent(formData: FormData, selectedPatient: Patient | undefined) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl font-bold">記録プレビュー</CardTitle>
        <CardDescription>作成した記録のプレビューです</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Patient Information */}
        <div className="space-y-2">
          <h3 className="font-semibold text-base">患者情報</h3>
          <p className="text-muted-foreground">
            {selectedPatient ? getFullName(selectedPatient) : '患者未選択'}
          </p>
        </div>

        {/* Basic Information */}
        <div className="space-y-3">
          <h3 className="font-semibold text-base">基本情報</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <span className="font-medium">訪問日:</span>
              <span className="ml-2">{formData.date || '未入力'}</span>
            </div>
            <div>
              <span className="font-medium">訪問時間:</span>
              <span className="ml-2">{formData.time || '未入力'}</span>
            </div>
            <div className="sm:col-span-2">
              <span className="font-medium">訪問理由:</span>
              <span className="ml-2">{formData.visitType || '未入力'}</span>
            </div>
          </div>
        </div>

        {/* Vital Signs */}
        <div className="space-y-3">
          <h3 className="font-semibold text-base">バイタルサイン</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
            <div>
              <span className="font-medium">体温:</span>
              <span className="ml-2">{formData.vitalSigns.temperature || '未入力'}</span>
            </div>
            <div>
              <span className="font-medium">脈拍:</span>
              <span className="ml-2">{formData.vitalSigns.pulse || '未入力'}</span>
            </div>
            <div>
              <span className="font-medium">血圧（収縮期）:</span>
              <span className="ml-2">{formData.vitalSigns.systolicBP || '未入力'}</span>
            </div>
            <div>
              <span className="font-medium">血圧（拡張期）:</span>
              <span className="ml-2">{formData.vitalSigns.diastolicBP || '未入力'}</span>
            </div>
            <div>
              <span className="font-medium">SpO2:</span>
              <span className="ml-2">{formData.vitalSigns.spo2 || '未入力'}</span>
            </div>
            <div>
              <span className="font-medium">呼吸数:</span>
              <span className="ml-2">{formData.vitalSigns.respiration || '未入力'}</span>
            </div>
          </div>
        </div>

        {/* Nursing Records */}
        <div className="space-y-3">
          <h3 className="font-semibold text-base">看護記録</h3>
          <div className="space-y-4">
            <div>
              <span className="font-medium block mb-1">観察事項:</span>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap border-l-2 border-gray-200 pl-3">
                {formData.observations || '未入力'}
              </p>
            </div>
            <div>
              <span className="font-medium block mb-1">実施したケア:</span>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap border-l-2 border-gray-200 pl-3">
                {formData.careProvided || '未入力'}
              </p>
            </div>
            <div>
              <span className="font-medium block mb-1">患者・家族の反応:</span>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap border-l-2 border-gray-200 pl-3">
                {formData.patientFamilyResponse || '未入力'}
              </p>
            </div>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="text-xs text-muted-foreground pt-4 border-t">
          <p>※ このプレビューは作成中の記録です。「記録完成」ボタンを押して保存してください。</p>
        </div>
      </CardContent>
    </Card>
  )
}