import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useLocation } from "wouter"
import { useBasePath } from "@/hooks/useBasePath"
import { useIsHeadquarters } from "@/contexts/TenantContext"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PatientForm } from "@/components/PatientForm"
import {
  Plus,
  Search,
  Edit,
  FileText,
  Calendar,
  Phone,
  MapPin,
  User,
  Filter,
  Eye,
  Building2
} from "lucide-react"

import type { Patient, PaginatedResult } from "@shared/schema"

// Helper function to calculate age from date of birth
const calculateAge = (dateOfBirth: string): number => {
  const today = new Date()
  const birthDate = new Date(dateOfBirth)
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--
  }

  return age
}

// Helper function to get full name
const getFullName = (patient: Patient): string => {
  return `${patient.lastName} ${patient.firstName}`
}

// Helper function to get patient status
const getPatientStatus = (patient: Patient): 'active' | 'inactive' | 'critical' => {
  if (!patient.isActive) return 'inactive'
  if (patient.isCritical) return 'critical'
  return 'active'
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'active': return 'bg-green-100 text-green-800 border-green-200'
    case 'critical': return 'bg-red-100 text-red-800 border-red-200'
    case 'inactive': return 'bg-gray-100 text-gray-800 border-gray-200'
    default: return 'bg-gray-100 text-gray-800 border-gray-200'
  }
}

const getStatusText = (status: string) => {
  switch (status) {
    case 'active': return 'アクティブ'
    case 'critical': return '重要'
    case 'inactive': return '非アクティブ'
    default: return status
  }
}

export function PatientManagement() {
  const [, setLocation] = useLocation()
  const basePath = useBasePath()
  const isHeadquarters = useIsHeadquarters()
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'critical' | 'inactive'>('all')
  const [facilityFilter, setFacilityFilter] = useState<string>('all')
  const [isPatientFormOpen, setIsPatientFormOpen] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create')

  // Fetch patients from API
  const { data: patientsData, isLoading, error } = useQuery<PaginatedResult<Patient>>({
    queryKey: ["patients"],
    queryFn: async () => {
      const response = await fetch("/api/patients")
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error || "患者データの取得に失敗しました"
        throw new Error(errorMessage)
      }
      return response.json()
    },
  })

  const patients = patientsData?.data || []

  // Get unique facilities from patients data
  const facilities = Array.from(
    new Set(
      patients
        .map((p: any) => p.facility)
        .filter((f: any) => f != null)
        .map((f: any) => JSON.stringify(f))
    )
  ).map((f: string) => JSON.parse(f))

  const filteredPatients = patients.filter(patient => {
    const fullName = getFullName(patient)
    const medicalHistory = patient.medicalHistory || ''
    const matchesSearch = fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         medicalHistory.toLowerCase().includes(searchTerm.toLowerCase())
    const patientStatus = getPatientStatus(patient)
    const matchesStatus = statusFilter === 'all' || patientStatus === statusFilter
    const matchesFacility = facilityFilter === 'all' || (patient as any).facility?.id === facilityFilter
    return matchesSearch && matchesStatus && matchesFacility
  })

  const activePatients = patients.filter(p => getPatientStatus(p) === 'active').length
  const criticalPatients = patients.filter(p => getPatientStatus(p) === 'critical').length
  const inactivePatients = patients.filter(p => getPatientStatus(p) === 'inactive').length

  const handleAddPatient = () => {
    setSelectedPatient(null)
    setFormMode('create')
    setIsPatientFormOpen(true)
  }

  const handleEditPatient = (patient: Patient) => {
    setSelectedPatient(patient)
    setFormMode('edit')
    setIsPatientFormOpen(true)
  }

  const handleCloseForm = () => {
    setIsPatientFormOpen(false)
    setSelectedPatient(null)
  }

  const handleViewDetail = (patient: Patient) => {
    setLocation(`${basePath}/patients/${patient.id}`)
  }

  const handleViewRecords = (patient: Patient) => {
    const fullName = getFullName(patient)
    console.log('看護記録クリック:', fullName)
    alert(`${fullName}さんの看護記録を表示します`)
  }

  const handleViewSchedule = (patient: Patient) => {
    const fullName = getFullName(patient)
    console.log('スケジュールクリック:', fullName)
    alert(`${fullName}さんのスケジュールを表示します`)
  }

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6 p-3 sm:p-4 lg:p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600 mx-auto mb-4"></div>
            <p className="text-muted-foreground">患者データを読み込んでいます...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4 sm:space-y-6 p-3 sm:p-4 lg:p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center max-w-md">
            <User className="mx-auto h-12 w-12 mb-4 opacity-50 text-red-500" />
            <p className="text-muted-foreground mb-2">患者データの取得に失敗しました</p>
            <p className="text-sm text-red-500">{error.message}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight truncate">
            利用者管理
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            {isHeadquarters ? '全施設の患者情報の閲覧' : '患者情報の管理と編集'}
          </p>
        </div>
        {!isHeadquarters && (
          <Button
            onClick={handleAddPatient}
            className="w-full sm:w-auto flex-shrink-0"
            data-testid="button-add-patient"
          >
            <Plus className="mr-2 h-4 w-4" />
            新規患者登録
          </Button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">アクティブ患者</CardTitle>
            <User className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{activePatients}名</div>
            <p className="text-xs text-muted-foreground">
              定期フォロー中
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">重要患者</CardTitle>
            <User className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{criticalPatients}名</div>
            <p className="text-xs text-muted-foreground">
              特別注意が必要
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">非アクティブ</CardTitle>
            <User className="h-4 w-4 text-gray-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-600">{inactivePatients}名</div>
            <p className="text-xs text-muted-foreground">
              一時休止中
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <CardTitle>患者一覧</CardTitle>
          <CardDescription>登録済みの全患者情報</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:gap-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="患者名または病名で検索..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-patient-search"
                />
              </div>
              {facilities.length > 0 && (
                <Select value={facilityFilter} onValueChange={setFacilityFilter}>
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <SelectValue placeholder="所属施設" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全施設</SelectItem>
                    {facilities.map((facility: any) => (
                      <SelectItem key={facility.id} value={facility.id}>
                        {facility.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="grid grid-cols-2 sm:flex gap-2">
              <Button
                variant={statusFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('all')}
                className="text-xs sm:text-sm h-8 sm:h-9"
                data-testid="filter-all"
              >
                全て
              </Button>
              <Button
                variant={statusFilter === 'active' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('active')}
                className="text-xs sm:text-sm h-8 sm:h-9"
                data-testid="filter-active"
              >
                アクティブ
              </Button>
              <Button
                variant={statusFilter === 'critical' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('critical')}
                className="text-xs sm:text-sm h-8 sm:h-9"
                data-testid="filter-critical"
              >
                重要
              </Button>
              <Button
                variant={statusFilter === 'inactive' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('inactive')}
                className="text-xs sm:text-sm h-8 sm:h-9"
                data-testid="filter-inactive"
              >
                非アクティブ
              </Button>
            </div>
          </div>
          
          {/* Patient List */}
          <div className="space-y-3 sm:space-y-4">
            {filteredPatients.map((patient) => (
              <div key={patient.id} className="border rounded-lg p-3 sm:p-4 hover-elevate">
                {/* Mobile layout (stacked) */}
                <div className="sm:hidden space-y-3">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-10 w-10 flex-shrink-0">
                      <AvatarFallback className="text-sm">{getFullName(patient).charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="font-semibold text-base truncate">{getFullName(patient)}</h3>
                        <Badge className={`${getStatusColor(getPatientStatus(patient))} text-xs flex-shrink-0`}>
                          {getStatusText(getPatientStatus(patient))}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3 flex-shrink-0" />
                          <span>{calculateAge(patient.dateOfBirth)}歳・{patient.gender === 'male' ? '男性' : patient.gender === 'female' ? '女性' : 'その他'}</span>
                        </div>
                        {(patient as any).facility && (
                          <div className="flex items-center gap-1">
                            <Building2 className="h-3 w-3 flex-shrink-0" />
                            <span>所属: {(patient as any).facility.name}</span>
                          </div>
                        )}
                        <div className="flex items-start gap-1">
                          <MapPin className="h-3 w-3 flex-shrink-0 mt-0.5" />
                          <span className="line-clamp-1">{patient.address || '住所未登録'}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Phone className="h-3 w-3 flex-shrink-0" />
                          <span>{patient.phone || '電話番号未登録'}</span>
                        </div>
                        <p className="line-clamp-1">既往歴: {patient.medicalHistory || '未記録'}</p>
                        <p className="line-clamp-1">患者番号: {patient.patientNumber}</p>
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground px-1">
                    <p>登録日: {patient.createdAt ? new Date(patient.createdAt).toLocaleDateString('ja-JP') : '未記録'}</p>
                    <p>更新日: {patient.updatedAt ? new Date(patient.updatedAt).toLocaleDateString('ja-JP') : '未記録'}</p>
                  </div>
                  <div className={isHeadquarters ? "" : "grid grid-cols-2 gap-2"}>
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleViewDetail(patient)}
                      className={`text-xs h-8 ${isHeadquarters ? 'w-full' : ''}`}
                      data-testid={`button-detail-${patient.id}`}
                    >
                      <Eye className="mr-1 h-3 w-3" />
                      詳細
                    </Button>
                    {!isHeadquarters && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEditPatient(patient)}
                        className="text-xs h-8"
                        data-testid={`button-edit-${patient.id}`}
                      >
                        <Edit className="mr-1 h-3 w-3" />
                        編集
                      </Button>
                    )}
                  </div>
                </div>

                {/* Desktop layout (horizontal) */}
                <div className="hidden sm:flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback>{getFullName(patient).charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-lg">{getFullName(patient)}</h3>
                        <Badge className={getStatusColor(getPatientStatus(patient))}>
                          {getStatusText(getPatientStatus(patient))}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <div className="flex items-center gap-2">
                          <User className="h-3 w-3" />
                          {calculateAge(patient.dateOfBirth)}歳 ・ {patient.gender === 'male' ? '男性' : patient.gender === 'female' ? '女性' : 'その他'}
                        </div>
                        {(patient as any).facility && (
                          <div className="flex items-center gap-2">
                            <Building2 className="h-3 w-3" />
                            所属施設: {(patient as any).facility.name}
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3 w-3" />
                          {patient.address || '住所未登録'}
                        </div>
                        <div className="flex items-center gap-2">
                          <Phone className="h-3 w-3" />
                          {patient.phone || '電話番号未登録'}
                        </div>
                        <p>既往歴: {patient.medicalHistory || '未記録'}</p>
                        <p>患者番号: {patient.patientNumber}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col md:items-end gap-2 flex-shrink-0">
                    <div className="text-sm text-muted-foreground">
                      <p>登録日: {patient.createdAt ? new Date(patient.createdAt).toLocaleDateString('ja-JP') : '未記録'}</p>
                      <p>更新日: {patient.updatedAt ? new Date(patient.updatedAt).toLocaleDateString('ja-JP') : '未記録'}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleViewDetail(patient)}
                        data-testid={`button-detail-${patient.id}`}
                      >
                        <Eye className="mr-1 h-3 w-3" />
                        詳細
                      </Button>
                      {!isHeadquarters && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditPatient(patient)}
                          data-testid={`button-edit-${patient.id}`}
                        >
                          <Edit className="mr-1 h-3 w-3" />
                          編集
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {filteredPatients.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <User className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>条件に一致する患者が見つかりません</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Patient Form Dialog */}
      <PatientForm
        isOpen={isPatientFormOpen}
        onClose={handleCloseForm}
        patient={selectedPatient}
        mode={formMode}
      />
    </div>
  )
}