import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { 
  Plus, 
  Search, 
  Edit, 
  Eye, 
  Calendar,
  Clock,
  User,
  FileText,
  AlertCircle
} from "lucide-react"

interface NursingRecord {
  id: string
  patientName: string
  patientId: string
  date: string
  time: string
  nurseName: string
  visitType: string
  status: 'draft' | 'completed' | 'reviewed'
  vitalSigns: {
    bloodPressure: string
    pulse: string
    temperature: string
    respiration: string
  }
  observations: string
  careProvided: string
  medications: string
  nextPlan: string
}

// TODO: Remove mock data when implementing real backend
const mockRecords: NursingRecord[] = [
  {
    id: '1',
    patientName: '佐藤 太郎',
    patientId: '1',
    date: '2024-09-26',
    time: '09:00',
    nurseName: '田中 花子',
    visitType: '定期訪問',
    status: 'completed',
    vitalSigns: {
      bloodPressure: '140/90',
      pulse: '72',
      temperature: '36.5',
      respiration: '18'
    },
    observations: '痛みの訴えなし。食欲良好。歩行状態安定。',
    careProvided: 'バイタルサイン測定、服薬確認、血糖値測定。',
    medications: 'メトホルミン服用確認。副作用なし。',
    nextPlan: '次回訪問時にHbA1c結果確認予定。'
  },
  {
    id: '2',
    patientName: '鈴木 花子',
    patientId: '2',
    date: '2024-09-26',
    time: '10:30',
    nurseName: '山田 次郎',
    visitType: '緊急訪問',
    status: 'completed',
    vitalSigns: {
      bloodPressure: '160/100',
      pulse: '88',
      temperature: '37.2',
      respiration: '22'
    },
    observations: '呼吸困難の訴えあり。顔色不良。下肢浮腫軽度あり。',
    careProvided: '酸素投与、ポジショニング、家族への指導。',
    medications: '利尿剤追加。心不全薬綾量調整。',
    nextPlan: '明日再訪問予定。主治医へ報告済み。'
  },
  {
    id: '3',
    patientName: '田中 明',
    patientId: '3',
    date: '2024-09-25',
    time: '14:00',
    nurseName: '田中 花子',
    visitType: '定期訪問',
    status: 'reviewed',
    vitalSigns: {
      bloodPressure: '130/80',
      pulse: '68',
      temperature: '36.3',
      respiration: '16'
    },
    observations: '認知片状安定。家族とのコミュニケーション良好。',
    careProvided: '服薬管理指導、リハビリテーション実施。',
    medications: 'アリセプト服用継続。副作用なし。',
    nextPlan: '次回訪問時に歩行訓練強化予定。'
  }
]

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

export function NursingRecords() {
  const [records] = useState(mockRecords)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'completed' | 'reviewed'>('all')
  const [selectedRecord, setSelectedRecord] = useState<NursingRecord | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const filteredRecords = records.filter(record => {
    const matchesSearch = record.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         record.nurseName.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'all' || record.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const draftRecords = records.filter(r => r.status === 'draft').length
  const completedRecords = records.filter(r => r.status === 'completed').length
  const reviewedRecords = records.filter(r => r.status === 'reviewed').length

  const handleCreateNew = () => {
    setIsCreating(true)
    setSelectedRecord(null)
    console.log('新規記録作成モード')
  }

  const handleViewRecord = (record: NursingRecord) => {
    setSelectedRecord(record)
    setIsCreating(false)
    console.log('記録表示:', record.id)
  }

  if (isCreating || selectedRecord) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {isCreating ? '新規看護記録' : '看護記録詳細'}
            </h1>
            <p className="text-muted-foreground">
              {isCreating ? '新しい訪問記録を作成' : `${selectedRecord?.patientName}さんの記録`}
            </p>
          </div>
          <Button variant="outline" onClick={() => { setIsCreating(false); setSelectedRecord(null) }}>
            一覧に戻る
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">基本情報</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>患者名</Label>
                    <Input defaultValue={selectedRecord?.patientName || ''} disabled={!isCreating} />
                  </div>
                  <div>
                    <Label>訪問日</Label>
                    <Input type="date" defaultValue={selectedRecord?.date || new Date().toISOString().split('T')[0]} disabled={!isCreating} />
                  </div>
                  <div>
                    <Label>訪問時刻</Label>
                    <Input type="time" defaultValue={selectedRecord?.time || ''} disabled={!isCreating} />
                  </div>
                  <div>
                    <Label>訪問種別</Label>
                    <Input defaultValue={selectedRecord?.visitType || ''} disabled={!isCreating} />
                  </div>
                </div>
              </div>

              {/* Vital Signs */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">バイタルサイン</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>血圧 (mmHg)</Label>
                    <Input defaultValue={selectedRecord?.vitalSigns.bloodPressure || ''} placeholder="120/80" />
                  </div>
                  <div>
                    <Label>脈拍 (/分)</Label>
                    <Input defaultValue={selectedRecord?.vitalSigns.pulse || ''} placeholder="72" />
                  </div>
                  <div>
                    <Label>体温 (℃)</Label>
                    <Input defaultValue={selectedRecord?.vitalSigns.temperature || ''} placeholder="36.5" />
                  </div>
                  <div>
                    <Label>呼吸数 (/分)</Label>
                    <Input defaultValue={selectedRecord?.vitalSigns.respiration || ''} placeholder="18" />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4 mt-6">
              {/* Observations */}
              <div>
                <Label>観察所見</Label>
                <Textarea 
                  defaultValue={selectedRecord?.observations || ''}
                  placeholder="患者の状態、症状、外観などを記載"
                  className="min-h-[100px]"
                />
              </div>

              {/* Care Provided */}
              <div>
                <Label>実施したケア</Label>
                <Textarea 
                  defaultValue={selectedRecord?.careProvided || ''}
                  placeholder="実施した看護ケア、処置などを記載"
                  className="min-h-[100px]"
                />
              </div>

              {/* Medications */}
              <div>
                <Label>投薬・薬物管理</Label>
                <Textarea 
                  defaultValue={selectedRecord?.medications || ''}
                  placeholder="投薬内容、副作用の有無などを記載"
                  className="min-h-[80px]"
                />
              </div>

              {/* Next Plan */}
              <div>
                <Label>次回予定・申し送り</Label>
                <Textarea 
                  defaultValue={selectedRecord?.nextPlan || ''}
                  placeholder="次回訪問の予定、注意事項などを記載"
                  className="min-h-[80px]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6 pt-6 border-t">
              {isCreating ? (
                <>
                  <Button variant="outline">下書き保存</Button>
                  <Button>記録完成</Button>
                </>
              ) : (
                <>
                  {selectedRecord?.status === 'draft' && <Button>編集</Button>}
                  {selectedRecord?.status === 'completed' && <Button>確認済みにする</Button>}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">看護記録</h1>
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
                className="pl-10"
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
                          {new Date(record.date).toLocaleDateString('ja-JP')}
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {record.time}
                        </div>
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {record.nurseName}
                        </div>
                      </div>
                      <p>訪問種別: {record.visitType}</p>
                      <p className="truncate max-w-md">観察: {record.observations}</p>
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
          
          {filteredRecords.length === 0 && (
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