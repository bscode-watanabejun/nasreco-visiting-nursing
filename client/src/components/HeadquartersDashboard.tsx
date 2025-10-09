import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Building2,
  Users,
  UserCheck,
  Activity,
  TrendingUp,
  MapPin,
  Phone,
  Mail,
  ChevronRight,
  Plus,
  Settings,
  BarChart3,
  Clock
} from "lucide-react";
import { facilityApi } from "@/lib/api";
import { useTenant } from "@/contexts/TenantContext";

interface Facility {
  id: string;
  companyId: string;
  name: string;
  slug: string;
  isHeadquarters: boolean;
  address: string | null;
  phone: string | null;
  email: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

interface FacilityStats {
  id: string;
  name: string;
  slug: string;
  totalPatients: number;
  activeUsers: number;
  upcomingVisits: number;
  completedVisits: number;
  isOnline: boolean;
}

export function HeadquartersDashboard() {
  const [selectedTimeRange, setSelectedTimeRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [selectedFacility, setSelectedFacility] = useState<string>('all');
  const { company, generateFacilityUrl } = useTenant();

  // Fetch facilities data
  const { data: facilities, isLoading: facilitiesLoading } = useQuery<Facility[]>({
    queryKey: ["facilities"],
    queryFn: facilityApi.getFacilities,
  });

  // Convert facilities to stats format with placeholder data
  // TODO: Implement real-time statistics from backend
  const facilityStats: FacilityStats[] = (facilities || []).map(facility => ({
    id: facility.id,
    name: facility.name,
    slug: facility.slug,
    totalPatients: 0, // TODO: Fetch from backend
    activeUsers: 0, // TODO: Fetch from backend
    upcomingVisits: 0, // TODO: Fetch from backend
    completedVisits: 0, // TODO: Fetch from backend
    isOnline: true, // TODO: Implement online status check
  }));

  // Calculate aggregated statistics
  const totalStats = facilityStats.reduce(
    (acc, facility) => ({
      totalPatients: acc.totalPatients + facility.totalPatients,
      totalUsers: acc.totalUsers + facility.activeUsers,
      totalUpcomingVisits: acc.totalUpcomingVisits + facility.upcomingVisits,
      totalCompletedVisits: acc.totalCompletedVisits + facility.completedVisits,
    }),
    { totalPatients: 0, totalUsers: 0, totalUpcomingVisits: 0, totalCompletedVisits: 0 }
  );

  const handleFacilityClick = (slug: string) => {
    const facilityUrl = generateFacilityUrl(slug);
    window.open(facilityUrl, '_blank');
  };

  return (
    <div className="space-y-6 p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
            {company?.name || 'NASRECO'} 本社ダッシュボード
          </h1>
          <p className="text-muted-foreground">
            全施設の統合管理・監視システム
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Select value={selectedTimeRange} onValueChange={(value: '7d' | '30d' | '90d') => setSelectedTimeRange(value)}>
            <SelectTrigger className="w-full sm:w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">過去7日間</SelectItem>
              <SelectItem value="30d">過去30日間</SelectItem>
              <SelectItem value="90d">過去90日間</SelectItem>
            </SelectContent>
          </Select>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            新規施設
          </Button>
        </div>
      </div>

      {/* Overall Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">総患者数</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStats.totalPatients}</div>
            <p className="text-xs text-muted-foreground">
              全施設合計
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">スタッフ数</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStats.totalUsers}</div>
            <p className="text-xs text-muted-foreground">
              アクティブユーザー
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">予定訪問</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStats.totalUpcomingVisits}</div>
            <p className="text-xs text-muted-foreground">
              今週の予定
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">完了訪問</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStats.totalCompletedVisits}</div>
            <p className="text-xs text-muted-foreground">
              今月の実績
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="facilities" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="facilities">施設管理</TabsTrigger>
          <TabsTrigger value="analytics">統合分析</TabsTrigger>
          <TabsTrigger value="reports">レポート</TabsTrigger>
        </TabsList>

        {/* Facilities Management Tab */}
        <TabsContent value="facilities">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>施設一覧</CardTitle>
                  <CardDescription>
                    各施設の運営状況とパフォーマンス
                  </CardDescription>
                </div>
                <Button variant="outline">
                  <Settings className="h-4 w-4 mr-2" />
                  施設設定
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {facilitiesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
                </div>
              ) : facilityStats.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  施設データがありません
                </div>
              ) : (
                <div className="space-y-4">
                  {facilityStats.map((facility) => (
                  <Card key={facility.id} className="transition-colors hover:bg-muted/50">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-start gap-4">
                          <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-orange-100 text-orange-600">
                            <Building2 className="h-6 w-6" />
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center gap-3">
                              <h3 className="font-semibold text-lg">{facility.name}</h3>
                              <Badge
                                variant={facility.isOnline ? "default" : "destructive"}
                                className="text-xs"
                              >
                                {facility.isOnline ? "オンライン" : "オフライン"}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-muted-foreground">
                              <div>
                                <span className="font-medium text-foreground">{facility.totalPatients}</span>
                                <p>患者数</p>
                              </div>
                              <div>
                                <span className="font-medium text-foreground">{facility.activeUsers}</span>
                                <p>スタッフ</p>
                              </div>
                              <div>
                                <span className="font-medium text-foreground">{facility.upcomingVisits}</span>
                                <p>予定訪問</p>
                              </div>
                              <div>
                                <span className="font-medium text-foreground">{facility.completedVisits}</span>
                                <p>完了訪問</p>
                              </div>
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleFacilityClick(facility.slug)}
                        >
                          <span className="hidden sm:inline mr-2">詳細を見る</span>
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics">
          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  統合パフォーマンス分析
                </CardTitle>
                <CardDescription>
                  全施設の主要指標の推移と比較
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>統合分析チャートを表示予定</p>
                    <p className="text-sm">実装準備中...</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Reports Tab */}
        <TabsContent value="reports">
          <Card>
            <CardHeader>
              <CardTitle>統合レポート</CardTitle>
              <CardDescription>
                全社的な業務レポートと統計データ
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>レポート機能を実装予定</p>
                  <p className="text-sm">各種統計データとエクスポート機能</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}