import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation } from "wouter";
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
  };
};

export default function SchedulesWithoutRecords() {
  const [, setLocation] = useLocation();
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);

  const [startDate, setStartDate] = useState(sevenDaysAgo.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);

  const { data: schedulesWithoutRecords, isLoading } = useQuery<ScheduleWithoutRecord[]>({
    queryKey: ["/api/schedules/without-records", startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const response = await fetch(`/api/schedules/without-records?${params}`);
      if (!response.ok) throw new Error("記録未作成スケジュールの取得に失敗しました");
      return response.json();
    },
  });

  const handleCreateRecord = (schedule: ScheduleWithoutRecord) => {
    // Navigate to nursing records page with schedule info
    setLocation(`/records?mode=create&scheduleId=${schedule.id}&patientId=${schedule.patient.id}`);
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
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">記録未作成スケジュール</h1>
        <p className="text-muted-foreground">完了したスケジュールで訪問記録が未作成のもの</p>
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
          <CardTitle>期間指定</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 max-w-md">
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
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>記録未作成スケジュール一覧</CardTitle>
          <CardDescription>
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
                    <TableCell>{schedule.nurse.fullName}</TableCell>
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
