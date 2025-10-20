import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, TrendingUp, Users, Calendar as CalendarIcon, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type MonthlyStatistic = {
  patientId: string;
  patientName: string;
  visitCount: number;
  totalMinutes: number;
  averageMinutes: number;
  calculatedPoints: number;
  appliedBonuses: any[];
  specialManagementAdditions?: {
    category: string;
    displayName: string;
    monthlyPoints: number;
  }[];
  specialManagementTotalPoints?: number;
  estimatedCost: number;
};

type MonthlyStatisticsResponse = {
  year: number;
  month: number;
  totalPatients: number;
  totalVisits: number;
  statistics: MonthlyStatistic[];
};

export default function MonthlyStatistics() {
  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState((currentDate.getMonth() + 1).toString());
  const [expandedPatient, setExpandedPatient] = useState<string | null>(null);

  // Fetch monthly statistics
  const { data: stats, isLoading, error } = useQuery<MonthlyStatisticsResponse>({
    queryKey: ["/api/statistics/monthly", selectedYear, selectedMonth],
    queryFn: async () => {
      const response = await fetch(`/api/statistics/monthly/${selectedYear}/${selectedMonth}`)
      if (!response.ok) {
        throw new Error("月次実績の取得に失敗しました")
      }
      return response.json()
    },
  });

  const handleExportCSV = () => {
    window.open(`/api/statistics/monthly/${selectedYear}/${selectedMonth}/export`, '_blank');
  };

  // Generate year options (current year and 2 years back)
  const years = Array.from({ length: 3 }, (_, i) => currentDate.getFullYear() - i);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  // Calculate totals
  const totalPoints = stats?.statistics.reduce((sum, stat) => sum + stat.calculatedPoints, 0) || 0;
  const totalSpecialMgmtPoints = stats?.statistics.reduce((sum, stat) => sum + (stat.specialManagementTotalPoints || 0), 0) || 0;
  const totalCost = stats?.statistics.reduce((sum, stat) => sum + stat.estimatedCost, 0) || 0;

  // Helper function to get bonus type name in Japanese
  const getBonusName = (type: string): string => {
    const names: Record<string, string> = {
      'multiple_visit': '複数回訪問加算',
      'emergency_visit': '緊急訪問加算',
      'long_visit': '長時間訪問加算',
      'same_building_discount': '同一建物減算',
    };
    return names[type] || type;
  };

  // Count bonuses by type for a patient
  const getBonusSummary = (appliedBonuses: any[]): { type: string; count: number; totalPoints: number }[] => {
    const bonusMap = new Map<string, { count: number; totalPoints: number }>();

    appliedBonuses.forEach(bonusArray => {
      if (Array.isArray(bonusArray)) {
        bonusArray.forEach(bonus => {
          const existing = bonusMap.get(bonus.type) || { count: 0, totalPoints: 0 };
          bonusMap.set(bonus.type, {
            count: existing.count + 1,
            totalPoints: existing.totalPoints + bonus.points
          });
        });
      }
    });

    return Array.from(bonusMap.entries()).map(([type, data]) => ({
      type,
      count: data.count,
      totalPoints: data.totalPoints
    }));
  };

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <TrendingUp className="mx-auto h-12 w-12 mb-4 opacity-50 text-red-500" />
          <p className="text-muted-foreground">月次実績データの取得に失敗しました</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-full space-y-4 sm:space-y-6 p-3 sm:p-4 lg:p-6 overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">月次実績</h1>
          <p className="text-muted-foreground">訪問実績の集計とレセプトデータ出力</p>
        </div>
        <Button onClick={handleExportCSV} disabled={!stats || stats.statistics.length === 0}>
          <Download className="mr-2 h-4 w-4" />
          CSV出力
        </Button>
      </div>

      {/* Period Selector */}
      <Card>
        <CardHeader>
          <CardTitle>集計期間</CardTitle>
          <CardDescription>年月を選択してください</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="w-32">
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}年
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-32">
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map((month) => (
                    <SelectItem key={month} value={month.toString()}>
                      {month}月
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">対象利用者</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalPatients || 0}名</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">総訪問回数</CardTitle>
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalVisits || 0}回</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">訪問点数</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalPoints.toLocaleString()}点</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">特管点数</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSpecialMgmtPoints.toLocaleString()}点</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">概算金額</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">¥{totalCost.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      {/* Statistics Table */}
      <Card>
        <CardHeader>
          <CardTitle>利用者別実績</CardTitle>
          <CardDescription>
            {selectedYear}年{selectedMonth}月の訪問実績
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">読み込み中...</div>
          ) : !stats || stats.statistics.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              選択した期間のデータがありません
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead>利用者名</TableHead>
                  <TableHead className="text-right">訪問回数</TableHead>
                  <TableHead className="text-right">総訪問時間</TableHead>
                  <TableHead className="text-right">平均訪問時間</TableHead>
                  <TableHead className="text-right">訪問点数</TableHead>
                  <TableHead className="text-right">特管点数</TableHead>
                  <TableHead className="text-right">概算金額</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.statistics.map((stat) => {
                  const bonusSummary = getBonusSummary(stat.appliedBonuses);
                  const isExpanded = expandedPatient === stat.patientId;
                  const hasDetails = bonusSummary.length > 0 || (stat.specialManagementAdditions && stat.specialManagementAdditions.length > 0);

                  return (
                    <>
                      <TableRow
                        key={stat.patientId}
                        className={hasDetails ? "cursor-pointer hover:bg-muted/50" : ""}
                        onClick={() => hasDetails && setExpandedPatient(isExpanded ? null : stat.patientId)}
                      >
                        <TableCell>
                          {hasDetails && (
                            isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{stat.patientName}</TableCell>
                        <TableCell className="text-right">{stat.visitCount}回</TableCell>
                        <TableCell className="text-right">{stat.totalMinutes}分</TableCell>
                        <TableCell className="text-right">{stat.averageMinutes}分</TableCell>
                        <TableCell className="text-right">{stat.calculatedPoints.toLocaleString()}点</TableCell>
                        <TableCell className="text-right">
                          {stat.specialManagementTotalPoints ? (
                            <span className="text-blue-600 font-medium">{stat.specialManagementTotalPoints.toLocaleString()}点</span>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell className="text-right">¥{stat.estimatedCost.toLocaleString()}</TableCell>
                      </TableRow>
                      {isExpanded && hasDetails && (
                        <TableRow>
                          <TableCell colSpan={8} className="bg-muted/30 p-4">
                            <div className="space-y-4">
                              {bonusSummary.length > 0 && (
                                <div className="space-y-2">
                                  <p className="text-sm font-medium text-muted-foreground mb-2">訪問加算の内訳</p>
                                  <div className="flex flex-wrap gap-2">
                                    {bonusSummary.map((bonus) => (
                                      <Badge
                                        key={bonus.type}
                                        variant={bonus.totalPoints < 0 ? "destructive" : "secondary"}
                                        className="text-sm"
                                      >
                                        {getBonusName(bonus.type)}: {bonus.count}回 ({bonus.totalPoints > 0 ? '+' : ''}{bonus.totalPoints}点)
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {stat.specialManagementAdditions && stat.specialManagementAdditions.length > 0 && (
                                <div className="space-y-2">
                                  <p className="text-sm font-medium text-muted-foreground mb-2">特別管理加算（月額固定）</p>
                                  <div className="flex flex-wrap gap-2">
                                    {stat.specialManagementAdditions.map((mgmt) => (
                                      <Badge
                                        key={mgmt.category}
                                        variant="default"
                                        className="text-sm bg-blue-600"
                                      >
                                        {mgmt.displayName}: {mgmt.monthlyPoints}点/月
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
