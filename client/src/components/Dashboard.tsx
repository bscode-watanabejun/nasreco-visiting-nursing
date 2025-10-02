import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { VisitRecordDialog } from "@/components/VisitRecordDialog"
import {
  Users,
  Calendar,
  ClipboardList,
  AlertTriangle,
  Plus,
  Clock,
  CheckCircle,
  User,
  Bell
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
    case 'scheduled': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
    default: return 'bg-gray-100 text-gray-800 border-gray-200'
  }
}

const getCardStatusColor = (status: string) => {
  switch (status) {
    case 'completed': return 'bg-green-50 border-green-200 hover:bg-green-100'
    case 'in-progress': return 'bg-orange-50 border-orange-200 hover:bg-orange-100'
    case 'scheduled': return 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100'
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
  const [isVisitRecordDialogOpen, setIsVisitRecordDialogOpen] = useState(false)
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
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="space-y-3 sm:space-y-0">
        <div className="sm:flex sm:items-center sm:justify-between sm:gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">
              ダッシュボード
            </h1>
            <p className="text-sm text-muted-foreground mt-1">本日は{today}です。</p>
          </div>

          {/* Desktop buttons */}
          <div className="hidden sm:flex flex-col sm:flex-row gap-2 sm:gap-2 flex-shrink-0">
            <Button
              className="w-full sm:w-auto bg-orange-500 hover:bg-orange-600 text-white border-orange-600"
              data-testid="button-new-record"
              onClick={() => setIsVisitRecordDialogOpen(true)}
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

        {/* Action buttons row - Mobile only */}
        <div className="flex items-center gap-3 sm:hidden">
          <Button
            variant="ghost"
            size="sm"
            className="flex items-center gap-1 px-3 py-1.5"
            data-testid="button-notifications"
          >
            <Bell className="h-4 w-4" />
            <span className="text-sm">通知</span>
            <Badge className="ml-1 bg-orange-500 text-white px-1.5 py-0 h-5 rounded-full text-xs">3</Badge>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex items-center gap-1 px-3 py-1.5"
            data-testid="button-schedule"
          >
            <Calendar className="h-4 w-4" />
            <span className="text-sm">カレンダー</span>
          </Button>
          <Button
            size="sm"
            className="ml-auto bg-orange-500 hover:bg-orange-600 text-white px-4 py-1.5"
            data-testid="button-new-record"
            onClick={() => setIsVisitRecordDialogOpen(true)}
          >
            <Plus className="mr-1 h-4 w-4" />
            新規記録
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <Card className="p-4 sm:p-auto">
          <div className="flex flex-col sm:block">
            <div className="flex items-center justify-between mb-2 sm:hidden">
              <span className="text-xs text-muted-foreground">本日の訪問予定</span>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardHeader className="hidden sm:flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">本日の訪問</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="sm:pt-0">
              <div className="text-2xl font-bold">{totalVisits}件</div>
              <p className="text-xs text-muted-foreground mt-1 sm:mt-0">
                <span className="sm:hidden">残り {totalVisits - completedVisits} 件</span>
                <span className="hidden sm:inline">完了: {completedVisits}件</span>
              </p>
            </CardContent>
          </div>
        </Card>

        <Card className="p-4 sm:p-auto">
          <div className="flex flex-col sm:block">
            <div className="flex items-center justify-between mb-2 sm:hidden">
              <span className="text-xs text-muted-foreground">担当患者数</span>
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardHeader className="hidden sm:flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">担当患者</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="sm:pt-0">
              <div className="text-2xl font-bold">
                <span className="sm:hidden">12名</span>
                <span className="hidden sm:inline">28名</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 sm:mt-0">
                <span className="sm:hidden">先月比 +2名</span>
                <span className="hidden sm:inline">先月比 +3名</span>
              </p>
            </CardContent>
          </div>
        </Card>

        <Card className="p-4 sm:p-auto">
          <div className="flex flex-col sm:block">
            <div className="flex items-center justify-between mb-2 sm:hidden">
              <span className="text-xs text-muted-foreground">未完了の記録</span>
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardHeader className="hidden sm:flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">未完了記録</CardTitle>
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="sm:pt-0">
              <div className="text-2xl font-bold">{pendingRecords}件</div>
              <p className="text-xs text-muted-foreground mt-1 sm:mt-0">
                <span className="sm:hidden">24時間以内</span>
                <span className="hidden sm:inline">24時間以内に入力が必要</span>
              </p>
            </CardContent>
          </div>
        </Card>

        <Card className="p-4 sm:p-auto">
          <div className="flex flex-col sm:block">
            <div className="flex items-center justify-between mb-2 sm:hidden">
              <span className="text-xs text-muted-foreground">要注意アラート</span>
              <AlertTriangle className="h-4 w-4 text-orange-500" />
            </div>
            <CardHeader className="hidden sm:flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">重要アラート</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent className="sm:pt-0">
              <div className="text-2xl font-bold text-orange-500 sm:text-destructive">{criticalAlerts}件</div>
              <p className="text-xs text-muted-foreground mt-1 sm:mt-0">
                確認が必要です
              </p>
            </CardContent>
          </div>
        </Card>
      </div>

      {/* Quick Navigation Tabs - Mobile */}
      <div className="flex justify-center gap-6 py-2 sm:hidden">
        <button className="text-sm text-muted-foreground hover:text-primary">訪問スケジュール</button>
        <button className="text-sm text-muted-foreground hover:text-primary">要注意患者</button>
        <button className="text-sm text-muted-foreground hover:text-primary">最近の記録</button>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="visits" className="space-y-4">
        <TabsList className="hidden sm:grid w-full grid-cols-3 h-10">
          <TabsTrigger value="visits" data-testid="tab-visits">本日の訪問</TabsTrigger>
          <TabsTrigger value="alerts" data-testid="tab-alerts">要注意患者</TabsTrigger>
          <TabsTrigger value="recent" data-testid="tab-recent">最近の記録</TabsTrigger>
        </TabsList>

        <TabsContent value="visits" className="space-y-3">
          <div>
            <h2 className="text-lg font-bold mb-1">本日の訪問スケジュール</h2>
            <p className="text-xs text-muted-foreground mb-3">{today}の訪問予定です</p>
          </div>
          <div className="space-y-3">
            {visits.map((visit) => (
              <div key={visit.id} className={`p-3 sm:p-4 rounded-lg transition-colors ${getCardStatusColor(visit.status)}`}>
                {/* Mobile layout */}
                <div className="sm:hidden">
                  <Card className={`p-4 ${visit.status === 'in-progress' ? 'border-orange-200 bg-orange-50' : ''}`}>
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg font-bold">{visit.time}</span>
                            <span className="text-sm font-medium">{visit.patientName}</span>
                            <span className="text-xs px-2 py-0.5 bg-gray-100 rounded text-muted-foreground">
                              {visit.id === '1' ? '68歳' : visit.id === '2' ? '75歳' : visit.id === '3' ? '82歳' : '73歳'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{visit.id === '1' || visit.id === '3' ? '60分' : '45分'}</span>
                            <span>·</span>
                            <span>{visit.type}</span>
                          </div>
                        </div>
                        {visit.status === 'completed' && (
                          <span className="text-xs text-green-600 font-medium">完了</span>
                        )}
                        {visit.status === 'in-progress' && (
                          <span className="text-xs text-orange-600 font-medium">実施中</span>
                        )}
                        {visit.status === 'scheduled' && (
                          <span className="text-xs text-yellow-600 font-medium">予定</span>
                        )}
                      </div>

                      {visit.status === 'scheduled' && (
                        <Button
                          size="sm"
                          className="w-full bg-red-500 hover:bg-red-600 text-white"
                          data-testid={`button-start-visit-${visit.id}`}
                        >
                          <span className="bg-white text-red-500 rounded-full px-2 py-0.5 mr-2 text-xs">待機I</span>
                        </Button>
                      )}
                      {visit.status === 'in-progress' && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            data-testid={`button-detail-visit-${visit.id}`}
                          >
                            詳細
                          </Button>
                          <Button
                            size="sm"
                            className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
                            data-testid={`button-complete-visit-${visit.id}`}
                          >
                            記録
                          </Button>
                        </div>
                      )}

                      {(visit.status === 'scheduled' || visit.status === 'in-progress') && (
                        <div className="text-xs text-muted-foreground">
                          備考: {visit.id === '1' ? '定期訪問 - バイタルチェックと服薬確認' :
                                 visit.id === '2' ? 'アセスメント訪問 - 状態評価と計画見直し' :
                                 visit.id === '3' ? '定期訪問 - 創傷処置' :
                                 '定期訪問 - バイタルチェックと服薬確認'}
                        </div>
                      )}
                    </div>
                  </Card>
                </div>

                {/* Desktop layout */}
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
                      <Button size="sm" className="bg-yellow-500 hover:bg-yellow-600 text-white border-yellow-600" data-testid={`button-start-visit-${visit.id}`}>
                        <Clock className="mr-1 h-3 w-3" />
                        待機
                      </Button>
                    )}
                    {visit.status === 'in-progress' && (
                      <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white border-orange-600" data-testid={`button-complete-visit-${visit.id}`}>
                        <CheckCircle className="mr-1 h-3 w-3" />
                        記録
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
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

      {/* 訪問記録ダイアログ */}
      <VisitRecordDialog
        open={isVisitRecordDialogOpen}
        onOpenChange={setIsVisitRecordDialogOpen}
      />
    </div>
  )
}