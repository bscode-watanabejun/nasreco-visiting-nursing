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
import { Download, TrendingUp, Users, Calendar as CalendarIcon } from "lucide-react";

type MonthlyStatistic = {
  patientId: string;
  patientName: string;
  visitCount: number;
  totalMinutes: number;
  averageMinutes: number;
  calculatedPoints: number;
  appliedBonuses: any[];
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

  // Fetch monthly statistics
  const { data: stats, isLoading } = useQuery<MonthlyStatisticsResponse>({
    queryKey: ["/api/statistics/monthly", selectedYear, selectedMonth],
    queryFn: async () => {
      const response = await fetch(`/api/statistics/monthly/${selectedYear}/${selectedMonth}`);
      if (!response.ok) throw new Error("月次実績の取得に失敗しました");
      return response.json();
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
  const totalCost = stats?.statistics.reduce((sum, stat) => sum + stat.estimatedCost, 0) || 0;

  return (
    <div className="container mx-auto py-6 space-y-6">
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
      <div className="grid gap-4 md:grid-cols-4">
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
            <CardTitle className="text-sm font-medium">合計算定点数</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalPoints.toLocaleString()}点</div>
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
                  <TableHead>利用者名</TableHead>
                  <TableHead className="text-right">訪問回数</TableHead>
                  <TableHead className="text-right">総訪問時間</TableHead>
                  <TableHead className="text-right">平均訪問時間</TableHead>
                  <TableHead className="text-right">算定点数</TableHead>
                  <TableHead className="text-right">概算金額</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.statistics.map((stat) => (
                  <TableRow key={stat.patientId}>
                    <TableCell className="font-medium">{stat.patientName}</TableCell>
                    <TableCell className="text-right">{stat.visitCount}回</TableCell>
                    <TableCell className="text-right">{stat.totalMinutes}分</TableCell>
                    <TableCell className="text-right">{stat.averageMinutes}分</TableCell>
                    <TableCell className="text-right">{stat.calculatedPoints.toLocaleString()}点</TableCell>
                    <TableCell className="text-right">¥{stat.estimatedCost.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
