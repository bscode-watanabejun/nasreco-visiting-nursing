import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Users, 
  Calendar, 
  ClipboardList, 
  AlertTriangle, 
  Plus,
  Clock,
  CheckCircle,
  User
} from "lucide-react"

interface PatientVisit {
  id: string
  patientName: string
  time: string
  type: string
  status: 'scheduled' | 'in-progress' | 'completed'
  nurse: string
}

// TODO: Remove mock data when implementing real backend
const mockVisits: PatientVisit[] = [
  {
    id: '1',
    patientName: '佐藤 太郎',
    time: '09:00',
    type: '定期訪問',
    status: 'completed',
    nurse: '田中 花子'
  },
  {
    id: '2', 
    patientName: '鈴木 花子',
    time: '10:30',
    type: 'アセスメント',
    status: 'in-progress',
    nurse: '山田 次郎'
  },
  {
    id: '3',
    patientName: '田中 明',
    time: '14:00',
    type: '定期訪問',
    status: 'scheduled',
    nurse: '田中 花子'
  },
  {
    id: '4',
    patientName: '伊藤 みどり',
    time: '15:30',
    type: '緊急訪問',
    status: 'scheduled',
    nurse: '山田 次郎'
  }
]

const getStatusColor = (status: string) => {
  switch (status) {
    case 'completed': return 'bg-green-100 text-green-800 border-green-200'
    case 'in-progress': return 'bg-orange-100 text-orange-800 border-orange-200'
    case 'scheduled': return 'bg-blue-100 text-blue-800 border-blue-200'
    default: return 'bg-gray-100 text-gray-800 border-gray-200'
  }
}

const getCardStatusColor = (status: string) => {
  switch (status) {
    case 'completed': return 'bg-green-50 border-green-200 hover:bg-green-100'
    case 'in-progress': return 'bg-orange-50 border-orange-200 hover:bg-orange-100'
    case 'scheduled': return 'bg-blue-50 border-blue-200 hover:bg-blue-100'
    default: return 'bg-gray-50 border-gray-200 hover:bg-gray-100'
  }
}

const getStatusText = (status: string) => {
  switch (status) {
    case 'completed': return '完了'
    case 'in-progress': return '実施中'
    case 'scheduled': return '予定'
    default: return status
  }
}

export function Dashboard() {
  const [visits] = useState(mockVisits)
  const today = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long', 
    day: 'numeric',
    weekday: 'long'
  })

  const completedVisits = visits.filter(v => v.status === 'completed').length
  const totalVisits = visits.length
  const pendingRecords = 3 // TODO: Get from backend
  const criticalAlerts = 2 // TODO: Get from backend

  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight truncate">
            ダッシュボード
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground truncate">{today}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-2 flex-shrink-0">
          <Button 
            className="w-full sm:w-auto"
            data-testid="button-new-record"
          >
            <Plus className="mr-2 h-4 w-4" />
            新規記録
          </Button>
          <Button 
            variant="outline" 
            className="w-full sm:w-auto"
            data-testid="button-schedule"
          >
            <Calendar className="mr-2 h-4 w-4" />
            スケジュール
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">本日の訪問</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalVisits}件</div>
            <p className="text-xs text-muted-foreground">
              完了: {completedVisits}件
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">担当患者</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">28名</div>
            <p className="text-xs text-muted-foreground">
              先月比 +3名
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">未完了記録</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingRecords}件</div>
            <p className="text-xs text-muted-foreground">
              24時間以内に入力が必要
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">重要アラート</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{criticalAlerts}件</div>
            <p className="text-xs text-muted-foreground">
              確認が必要です
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="visits" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 h-9 sm:h-10">
          <TabsTrigger value="visits" className="text-xs sm:text-sm" data-testid="tab-visits">
            <span className="hidden sm:inline">本日の訪問</span>
            <span className="sm:hidden">訪問</span>
          </TabsTrigger>
          <TabsTrigger value="alerts" className="text-xs sm:text-sm" data-testid="tab-alerts">
            アラート
          </TabsTrigger>
          <TabsTrigger value="recent" className="text-xs sm:text-sm" data-testid="tab-recent">
            <span className="hidden sm:inline">最近の記録</span>
            <span className="sm:hidden">記録</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="visits" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>訪問スケジュール</CardTitle>
              <CardDescription>{today}の訪問予定一覧</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-4">
              {visits.map((visit) => (
                <div key={visit.id} className={`p-3 sm:p-4 rounded-lg transition-colors ${getCardStatusColor(visit.status)}`}>
                  {/* Mobile layout (stacked) */}
                  <div className="sm:hidden space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="text-center min-w-[3rem]">
                          <div className="font-semibold text-sm">{visit.time}</div>
                          <div className="text-xs text-muted-foreground">{visit.type}</div>
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-semibold text-sm truncate">{visit.patientName}</h4>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <User className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">{visit.nurse}</span>
                          </div>
                        </div>
                      </div>
                      <Badge className={`${getStatusColor(visit.status)} text-xs flex-shrink-0`}>
                        {getStatusText(visit.status)}
                      </Badge>
                    </div>
                    {(visit.status === 'scheduled' || visit.status === 'in-progress') && (
                      <div className="flex gap-2">
                        {visit.status === 'scheduled' && (
                          <Button 
                            size="default" 
                            className="flex-1"
                            data-testid={`button-start-visit-${visit.id}`}
                          >
                            <Clock className="mr-1 h-3 w-3" />
                            開始
                          </Button>
                        )}
                        {visit.status === 'in-progress' && (
                          <Button 
                            size="default" 
                            variant="outline" 
                            className="flex-1"
                            data-testid={`button-complete-visit-${visit.id}`}
                          >
                            <CheckCircle className="mr-1 h-3 w-3" />
                            完了
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Desktop layout (horizontal) */}
                  <div className="hidden sm:flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="text-center min-w-[4rem]">
                        <div className="font-semibold">{visit.time}</div>
                        <div className="text-xs text-muted-foreground">{visit.type}</div>
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-semibold">{visit.patientName}</h4>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <User className="h-3 w-3" />
                          {visit.nurse}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge className={getStatusColor(visit.status)}>
                        {getStatusText(visit.status)}
                      </Badge>
                      {visit.status === 'scheduled' && (
                        <Button size="sm" data-testid={`button-start-visit-${visit.id}`}>
                          <Clock className="mr-1 h-3 w-3" />
                          開始
                        </Button>
                      )}
                      {visit.status === 'in-progress' && (
                        <Button size="sm" variant="outline" data-testid={`button-complete-visit-${visit.id}`}>
                          <CheckCircle className="mr-1 h-3 w-3" />
                          完了
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts">
          <Card>
            <CardHeader>
              <CardTitle>重要アラート</CardTitle>
              <CardDescription>確認が必要な項目</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 sm:space-y-4">
                <div className="flex items-start gap-3 p-3 border rounded-lg border-destructive/20 bg-destructive/5">
                  <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="font-medium text-sm sm:text-base">薬物投与エラーの可能性</p>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      佐藤太郎さん - 薬物重複チェックが必要
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 border rounded-lg border-destructive/20 bg-destructive/5">
                  <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="font-medium text-sm sm:text-base">バイタルサイン異常</p>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      鈴木花子さん - 血圧値が基準値を超過
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recent">
          <Card>
            <CardHeader>
              <CardTitle>最近の記録</CardTitle>
              <CardDescription>直近の訪問記録一覧</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 p-3 border rounded-lg">
                  <div className="min-w-0">
                    <p className="font-medium text-sm sm:text-base truncate">佐藤太郎さん</p>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      2024/09/25 09:00 - 定期訪問
                    </p>
                  </div>
                  <Badge className={`${getStatusColor('completed')} flex-shrink-0 text-xs`}>
                    完了
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-3 p-3 border rounded-lg">
                  <div className="min-w-0">
                    <p className="font-medium text-sm sm:text-base truncate">田中明さん</p>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      2024/09/24 14:30 - アセスメント
                    </p>
                  </div>
                  <Badge className={`${getStatusColor('completed')} flex-shrink-0 text-xs`}>
                    完了
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-3 p-3 border rounded-lg">
                  <div className="min-w-0">
                    <p className="font-medium text-sm sm:text-base truncate">伊藤みどりさん</p>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      2024/09/24 10:15 - 定期訪問
                    </p>
                  </div>
                  <Badge className={`${getStatusColor('completed')} flex-shrink-0 text-xs`}>
                    完了
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}