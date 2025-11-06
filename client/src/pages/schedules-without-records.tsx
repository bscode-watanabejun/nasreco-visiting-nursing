import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation } from "wouter";
import { useBasePath } from "@/hooks/useBasePath";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, Plus } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type ScheduleWithoutRecord = {
  id: string;
  scheduledDate: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
  purpose: string;
  patient: {
    id: string;
    lastName: string;
    firstName: string;
  };
  nurse: {
    id: string;
    fullName: string;
  } | null;
};

type User = {
  id: string;
  fullName: string;
  role: string;
};

export default function SchedulesWithoutRecords() {
  const [, setLocation] = useLocation();
  const basePath = useBasePath();
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);

  const [startDate, setStartDate] = useState(thirtyDaysAgo.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);
  const [nurseId, setNurseId] = useState<string>("all");

  // Fetch nurses list
  const { data: usersData } = useQuery<{ data: User[] }>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const response = await fetch("/api/users?limit=100");
      if (!response.ok) throw new Error("ユーザー一覧の取得に失敗しました");
      return response.json();
    },
  });

  // Filter nurses only
  const nurses = usersData?.data.filter(user => user.role === 'nurse') || [];

  const { data: schedulesWithoutRecords, isLoading } = useQuery<ScheduleWithoutRecord[]>({
    queryKey: ["/api/schedules/without-records", startDate, endDate, nurseId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (nurseId && nurseId !== "all") params.append('nurseId', nurseId);

      const response = await fetch(`/api/schedules/without-records?${params}`);
      if (!response.ok) throw new Error("記録未作成スケジュールの取得に失敗しました");
      return response.json();
    },
  });

  const handleCreateRecord = (schedule: ScheduleWithoutRecord) => {
    // Navigate to nursing records page with schedule info
    setLocation(`${basePath}/records?mode=create&scheduleId=${schedule.id}&patientId=${schedule.patient.id}`);
  };

  const formatDateTime = (dateTimeStr: string) => {
    const date = new Date(dateTimeStr);
    return date.toLocaleString('ja-JP', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="w-full max-w-full py-4 sm:py-6 px-3 sm:px-4 space-y-4 sm:space-y-6 overflow-x-hidden">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight">記録未作成スケジュール</h1>
        <p className="text-sm sm:text-base text-muted-foreground">完了したスケジュールで訪問記録が未作成のもの</p>
      </div>

      {/* Alert */}
      {schedulesWithoutRecords && schedulesWithoutRecords.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>記録未作成のスケジュールがあります</AlertTitle>
          <AlertDescription>
            {schedulesWithoutRecords.length}件の訪問記録が未作成です。早急に記録を作成してください。
          </AlertDescription>
        </Alert>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>絞り込み条件</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="startDate">開始日</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="endDate">終了日</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="nurseId">担当看護師</Label>
              <Select value={nurseId} onValueChange={setNurseId}>
                <SelectTrigger id="nurseId">
                  <SelectValue placeholder="すべて" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">すべて</SelectItem>
                  {nurses.map((nurse) => (
                    <SelectItem key={nurse.id} value={nurse.id}>
                      {nurse.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* List/Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">記録未作成スケジュール一覧</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            {startDate && endDate && `${startDate} ～ ${endDate} の期間`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">読み込み中...</div>
          ) : !schedulesWithoutRecords || schedulesWithoutRecords.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              記録未作成のスケジュールはありません
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden sm:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>訪問日時</TableHead>
                      <TableHead>利用者</TableHead>
                      <TableHead>担当看護師</TableHead>
                      <TableHead>目的</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {schedulesWithoutRecords.map((schedule) => (
                      <TableRow key={schedule.id}>
                        <TableCell>
                          <div className="font-medium">
                            {new Date(schedule.scheduledDate).toLocaleDateString('ja-JP')}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {formatDateTime(schedule.scheduledStartTime)} ～ {formatDateTime(schedule.scheduledEndTime)}
                          </div>
                        </TableCell>
                        <TableCell>
                          {schedule.patient.lastName} {schedule.patient.firstName}
                        </TableCell>
                        <TableCell>{schedule.nurse?.fullName || '未割当'}</TableCell>
                        <TableCell>{schedule.purpose}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleCreateRecord(schedule)}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            記録作成
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Card View */}
              <div className="sm:hidden space-y-3">
                {schedulesWithoutRecords.map((schedule) => (
                  <div key={schedule.id} className="border rounded-lg p-3 space-y-2">
                    <div className="space-y-1">
                      <div className="font-medium text-sm">
                        {new Date(schedule.scheduledDate).toLocaleDateString('ja-JP')}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDateTime(schedule.scheduledStartTime)} ～ {formatDateTime(schedule.scheduledEndTime)}
                      </div>
                    </div>
                    <div className="space-y-0.5 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground min-w-[60px]">利用者:</span>
                        <span className="font-medium">{schedule.patient.lastName} {schedule.patient.firstName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground min-w-[60px]">担当:</span>
                        <span className="truncate">{schedule.nurse?.fullName || '未割当'}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-xs text-muted-foreground min-w-[60px]">目的:</span>
                        <span className="text-xs line-clamp-2">{schedule.purpose}</span>
                      </div>
                    </div>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleCreateRecord(schedule)}
                      className="w-full text-xs h-8"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      記録作成
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
