import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { 
  Plus, 
  Search, 
  Edit, 
  FileText, 
  Calendar,
  Phone,
  MapPin,
  User,
  Filter
} from "lucide-react"

interface Patient {
  id: string
  name: string
  age: number
  gender: 'male' | 'female'
  address: string
  phone: string
  condition: string
  status: 'active' | 'inactive' | 'critical'
  lastVisit: string
  nextVisit: string
  assignedNurse: string
}

// TODO: Remove mock data when implementing real backend
const mockPatients: Patient[] = [
  {
    id: '1',
    name: '佐藤 太郎',
    age: 75,
    gender: 'male',
    address: '東京都渋谷区神宮前1-1-1',
    phone: '03-1234-5678',
    condition: '糖尿病・高血圧',
    status: 'active',
    lastVisit: '2024-09-25',
    nextVisit: '2024-09-28',
    assignedNurse: '田中 花子'
  },
  {
    id: '2',
    name: '鈴木 花子',
    age: 68,
    gender: 'female',
    address: '東京都世田谷区三軍茶屋2-2-2',
    phone: '03-2345-6789',
    condition: '脏器病・呼吸器疾患',
    status: 'critical',
    lastVisit: '2024-09-24',
    nextVisit: '2024-09-26',
    assignedNurse: '山田 次郎'
  },
  {
    id: '3',
    name: '田中 明',
    age: 82,
    gender: 'male',
    address: '東京都新宿区歌舞伎町3-3-3',
    phone: '03-3456-7890',
    condition: '認知症・歯行障害',
    status: 'active',
    lastVisit: '2024-09-23',
    nextVisit: '2024-09-30',
    assignedNurse: '田中 花子'
  },
  {
    id: '4',
    name: '伊藤 みどり',
    age: 59,
    gender: 'female',
    address: '東京都港区青山4-4-4',
    phone: '03-4567-8901',
    condition: 'がん术後フォロー',
    status: 'active',
    lastVisit: '2024-09-22',
    nextVisit: '2024-09-29',
    assignedNurse: '山田 次郎'
  },
  {
    id: '5',
    name: '山田 一郎',
    age: 91,
    gender: 'male',
    address: '東京都中央区日本橋5-5-5',
    phone: '03-5678-9012',
    condition: '老人介護・寝たきり',
    status: 'inactive',
    lastVisit: '2024-09-20',
    nextVisit: '2024-10-05',
    assignedNurse: '田中 花子'
  }
]

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
  const [patients] = useState(mockPatients)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'critical' | 'inactive'>('all')

  const filteredPatients = patients.filter(patient => {
    const matchesSearch = patient.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         patient.condition.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'all' || patient.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const activePatients = patients.filter(p => p.status === 'active').length
  const criticalPatients = patients.filter(p => p.status === 'critical').length
  const inactivePatients = patients.filter(p => p.status === 'inactive').length

  const handleAddPatient = () => {
    console.log('新規患者登録クリック')
    alert('新規患者登録画面を開きます')
  }

  const handleEditPatient = (patient: Patient) => {
    console.log('患者編集クリック:', patient.name)
    alert(`${patient.name}さんの編集画面を開きます`)
  }

  const handleViewRecords = (patient: Patient) => {
    console.log('看護記録クリック:', patient.name)
    alert(`${patient.name}さんの看護記録を表示します`)
  }

  const handleViewSchedule = (patient: Patient) => {
    console.log('スケジュールクリック:', patient.name)
    alert(`${patient.name}さんのスケジュールを表示します`)
  }

  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight truncate">
            利用者管理
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">患者情報の管理と編集</p>
        </div>
        <Button 
          onClick={handleAddPatient} 
          className="w-full sm:w-auto flex-shrink-0"
          data-testid="button-add-patient"
        >
          <Plus className="mr-2 h-4 w-4" />
          新規患者登録
        </Button>
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
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="患者名または病名で検索..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-patient-search"
              />
            </div>
            <div className="grid grid-cols-2 sm:flex gap-2">
              <Button 
                variant={statusFilter === 'all' ? 'default' : 'outline'}
                size="default"
                onClick={() => setStatusFilter('all')}
                className="text-sm"
                data-testid="filter-all"
              >
                全て
              </Button>
              <Button 
                variant={statusFilter === 'active' ? 'default' : 'outline'}
                size="default"
                onClick={() => setStatusFilter('active')}
                className="text-sm"
                data-testid="filter-active"
              >
                アクティブ
              </Button>
              <Button 
                variant={statusFilter === 'critical' ? 'default' : 'outline'}
                size="default"
                onClick={() => setStatusFilter('critical')}
                className="text-sm"
                data-testid="filter-critical"
              >
                重要
              </Button>
              <Button 
                variant={statusFilter === 'inactive' ? 'default' : 'outline'}
                size="default"
                onClick={() => setStatusFilter('inactive')}
                className="text-sm"
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
                      <AvatarFallback className="text-sm">{patient.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="font-semibold text-base truncate">{patient.name}</h3>
                        <Badge className={`${getStatusColor(patient.status)} text-xs flex-shrink-0`}>
                          {getStatusText(patient.status)}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3 flex-shrink-0" />
                          <span>{patient.age}歳・{patient.gender === 'male' ? '男性' : '女性'}</span>
                        </div>
                        <div className="flex items-start gap-1">
                          <MapPin className="h-3 w-3 flex-shrink-0 mt-0.5" />
                          <span className="line-clamp-1">{patient.address}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Phone className="h-3 w-3 flex-shrink-0" />
                          <span>{patient.phone}</span>
                        </div>
                        <p className="line-clamp-1">病名: {patient.condition}</p>
                        <p className="line-clamp-1">担当: {patient.assignedNurse}</p>
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground px-1">
                    <p>前回: {new Date(patient.lastVisit).toLocaleDateString('ja-JP')}</p>
                    <p>次回: {new Date(patient.nextVisit).toLocaleDateString('ja-JP')}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Button 
                      size="default" 
                      variant="outline" 
                      onClick={() => handleEditPatient(patient)}
                      className="text-xs px-2"
                      data-testid={`button-edit-${patient.id}`}
                    >
                      <Edit className="mr-1 h-3 w-3" />
                      編集
                    </Button>
                    <Button 
                      size="default" 
                      variant="outline" 
                      onClick={() => handleViewRecords(patient)}
                      className="text-xs px-2"
                      data-testid={`button-records-${patient.id}`}
                    >
                      <FileText className="mr-1 h-3 w-3" />
                      記録
                    </Button>
                    <Button 
                      size="default" 
                      variant="outline" 
                      onClick={() => handleViewSchedule(patient)}
                      className="text-xs px-2"
                      data-testid={`button-schedule-${patient.id}`}
                    >
                      <Calendar className="mr-1 h-3 w-3" />
                      <span className="hidden xs:inline">スケジュール</span>
                      <span className="xs:hidden">予定</span>
                    </Button>
                  </div>
                </div>

                {/* Desktop layout (horizontal) */}
                <div className="hidden sm:flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback>{patient.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-lg">{patient.name}</h3>
                        <Badge className={getStatusColor(patient.status)}>
                          {getStatusText(patient.status)}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <div className="flex items-center gap-2">
                          <User className="h-3 w-3" />
                          {patient.age}歳 ・ {patient.gender === 'male' ? '男性' : '女性'}
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3 w-3" />
                          {patient.address}
                        </div>
                        <div className="flex items-center gap-2">
                          <Phone className="h-3 w-3" />
                          {patient.phone}
                        </div>
                        <p>病名: {patient.condition}</p>
                        <p>担当看護師: {patient.assignedNurse}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-col md:items-end gap-2 flex-shrink-0">
                    <div className="text-sm text-muted-foreground">
                      <p>前回訪問: {new Date(patient.lastVisit).toLocaleDateString('ja-JP')}</p>
                      <p>次回予定: {new Date(patient.nextVisit).toLocaleDateString('ja-JP')}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => handleEditPatient(patient)}
                        data-testid={`button-edit-${patient.id}`}
                      >
                        <Edit className="mr-1 h-3 w-3" />
                        編集
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => handleViewRecords(patient)}
                        data-testid={`button-records-${patient.id}`}
                      >
                        <FileText className="mr-1 h-3 w-3" />
                        記録
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => handleViewSchedule(patient)}
                        data-testid={`button-schedule-${patient.id}`}
                      >
                        <Calendar className="mr-1 h-3 w-3" />
                        スケジュール
                      </Button>
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
    </div>
  )
}