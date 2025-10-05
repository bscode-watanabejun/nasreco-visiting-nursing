import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, FileCheck, Download } from "lucide-react";
import type { CareReport, Patient, CarePlan } from "@shared/schema";

type CareReportWithRelations = CareReport & {
  patient: Patient;
  carePlan?: CarePlan | null;
  creator?: { fullName: string } | null;
  approver?: { fullName: string } | null;
};

export default function CareReportManagement() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingReport, setEditingReport] = useState<CareReportWithRelations | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string>("all");
  const [selectedPatientIdForForm, setSelectedPatientIdForForm] = useState<string>("");
  const [selectedCarePlanIdForForm, setSelectedCarePlanIdForForm] = useState<string>("none");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form state
  const [formData, setFormData] = useState({
    reportNumber: "",
    reportDate: new Date().toISOString().split('T')[0],
    reportPeriodStart: new Date().toISOString().split('T')[0],
    reportPeriodEnd: new Date().toISOString().split('T')[0],
    visitCount: 0,
    patientCondition: "",
    nursingOutcomes: "",
    problemsAndActions: "",
    familySupport: "",
    communicationWithDoctor: "",
    communicationWithCareManager: "",
    remarks: "",
  });

  // Fetch care reports
  const { data: careReports, isLoading: loadingReports } = useQuery<CareReportWithRelations[]>({
    queryKey: ["/api/care-reports", selectedPatientId],
    queryFn: async () => {
      const url = selectedPatientId !== "all"
        ? `/api/care-reports?patientId=${selectedPatientId}`
        : "/api/care-reports";
      const response = await fetch(url);
      if (!response.ok) throw new Error("訪問看護報告書の取得に失敗しました");
      return response.json();
    },
  });

  // Fetch patients for filter
  const { data: patientsResponse } = useQuery<{ data: Patient[]; total: number }>({
    queryKey: ["/api/patients"],
    queryFn: async () => {
      const response = await fetch("/api/patients?limit=100");
      if (!response.ok) throw new Error("利用者の取得に失敗しました");
      return response.json();
    },
  });

  const patients = patientsResponse?.data;

  // Fetch care plans for dropdown
  const { data: carePlans } = useQuery<CarePlan[]>({
    queryKey: ["/api/care-plans"],
    queryFn: async () => {
      const response = await fetch("/api/care-plans");
      if (!response.ok) throw new Error("計画書の取得に失敗しました");
      return response.json();
    },
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: typeof formData & { patientId: string; carePlanId?: string }) => {
      const response = await fetch("/api/care-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("作成に失敗しました");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/care-reports"] });
      setIsDialogOpen(false);
      resetForm();
      toast({ description: "訪問看護報告書を作成しました" });
    },
    onError: () => {
      toast({ variant: "destructive", description: "作成に失敗しました" });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData & { id: string; patientId: string; carePlanId?: string }) => {
      const response = await fetch(`/api/care-reports/${data.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("更新に失敗しました");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/care-reports"] });
      setIsDialogOpen(false);
      setEditingReport(null);
      resetForm();
      toast({ description: "訪問看護報告書を更新しました" });
    },
    onError: () => {
      toast({ variant: "destructive", description: "更新に失敗しました" });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/care-reports/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("削除に失敗しました");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/care-reports"] });
      toast({ description: "訪問看護報告書を削除しました" });
    },
    onError: () => {
      toast({ variant: "destructive", description: "削除に失敗しました" });
    },
  });

  const resetForm = () => {
    setFormData({
      reportNumber: "",
      reportDate: new Date().toISOString().split('T')[0],
      reportPeriodStart: new Date().toISOString().split('T')[0],
      reportPeriodEnd: new Date().toISOString().split('T')[0],
      visitCount: 0,
      patientCondition: "",
      nursingOutcomes: "",
      problemsAndActions: "",
      familySupport: "",
      communicationWithDoctor: "",
      communicationWithCareManager: "",
      remarks: "",
    });
  };

  const handleAdd = () => {
    setEditingReport(null);
    resetForm();
    setSelectedPatientIdForForm("");
    setSelectedCarePlanIdForForm("none");
    setIsDialogOpen(true);
  };

  const handleEdit = (report: CareReportWithRelations) => {
    setEditingReport(report);
    setSelectedCarePlanIdForForm(report.carePlanId || "none");
    setFormData({
      reportNumber: report.reportNumber || "",
      reportDate: report.reportDate,
      reportPeriodStart: report.reportPeriodStart,
      reportPeriodEnd: report.reportPeriodEnd,
      visitCount: report.visitCount || 0,
      patientCondition: report.patientCondition || "",
      nursingOutcomes: report.nursingOutcomes || "",
      problemsAndActions: report.problemsAndActions || "",
      familySupport: report.familySupport || "",
      communicationWithDoctor: report.communicationWithDoctor || "",
      communicationWithCareManager: report.communicationWithCareManager || "",
      remarks: report.remarks || "",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("この訪問看護報告書を削除してもよろしいですか?")) {
      deleteMutation.mutate(id);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const patientId = editingReport?.patientId || selectedPatientIdForForm;
    if (!patientId) {
      toast({ variant: "destructive", description: "利用者を選択してください" });
      return;
    }

    const carePlanId = selectedCarePlanIdForForm === "none" ? undefined : selectedCarePlanIdForForm;

    if (editingReport) {
      updateMutation.mutate({ ...formData, id: editingReport.id, patientId, carePlanId });
    } else {
      createMutation.mutate({ ...formData, patientId, carePlanId });
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">訪問看護報告書</h1>
          <p className="text-muted-foreground">訪問看護報告書の作成・管理</p>
        </div>
        <Button onClick={handleAdd}>
          <Plus className="mr-2 h-4 w-4" />
          新規作成
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>絞り込み</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="w-64">
            <Label>利用者</Label>
            <Select value={selectedPatientId} onValueChange={setSelectedPatientId}>
              <SelectTrigger>
                <SelectValue placeholder="全ての利用者" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全ての利用者</SelectItem>
                {patients?.map((patient) => (
                  <SelectItem key={patient.id} value={patient.id}>
                    {patient.lastName} {patient.firstName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>訪問看護報告書一覧</CardTitle>
          <CardDescription>登録されている訪問看護報告書</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingReports ? (
            <div className="text-center py-8">読み込み中...</div>
          ) : !careReports || careReports.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              訪問看護報告書が登録されていません
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>報告書番号</TableHead>
                  <TableHead>利用者</TableHead>
                  <TableHead>報告日</TableHead>
                  <TableHead>報告期間</TableHead>
                  <TableHead className="text-right">訪問回数</TableHead>
                  <TableHead>作成者</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {careReports.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell className="font-medium">{report.reportNumber || "-"}</TableCell>
                    <TableCell>{report.patient.lastName} {report.patient.firstName}</TableCell>
                    <TableCell>{report.reportDate}</TableCell>
                    <TableCell>
                      {report.reportPeriodStart} ~ {report.reportPeriodEnd}
                    </TableCell>
                    <TableCell className="text-right">{report.visitCount || 0}回</TableCell>
                    <TableCell>{report.creator?.fullName || "-"}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => window.open(`/api/care-reports/${report.id}/pdf`, '_blank')}
                        title="PDF出力"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(report)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(report.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingReport ? "訪問看護報告書を編集" : "訪問看護報告書を作成"}
            </DialogTitle>
            <DialogDescription>
              訪問看護報告書の情報を入力してください
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!editingReport && (
              <div>
                <Label htmlFor="patientId">利用者 *</Label>
                <Select value={selectedPatientIdForForm} onValueChange={setSelectedPatientIdForForm} required>
                  <SelectTrigger id="patientId">
                    <SelectValue placeholder="利用者を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {patients?.map((patient) => (
                      <SelectItem key={patient.id} value={patient.id}>
                        {patient.lastName} {patient.firstName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label htmlFor="carePlanId">関連する計画書</Label>
              <Select value={selectedCarePlanIdForForm} onValueChange={setSelectedCarePlanIdForForm}>
                <SelectTrigger id="carePlanId">
                  <SelectValue placeholder="計画書を選択（任意）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">なし</SelectItem>
                  {carePlans?.filter(cp => !editingReport || cp.patientId === editingReport.patientId).map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.planNumber || plan.planDate} ({plan.planPeriodStart} ~ {plan.planPeriodEnd})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="reportNumber">報告書番号</Label>
                <Input
                  id="reportNumber"
                  value={formData.reportNumber}
                  onChange={(e) => setFormData({ ...formData, reportNumber: e.target.value })}
                  placeholder="例: 2025-R001"
                />
              </div>
              <div>
                <Label htmlFor="reportDate">報告日 *</Label>
                <Input
                  id="reportDate"
                  type="date"
                  required
                  value={formData.reportDate}
                  onChange={(e) => setFormData({ ...formData, reportDate: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="reportPeriodStart">報告期間（開始）*</Label>
                <Input
                  id="reportPeriodStart"
                  type="date"
                  required
                  value={formData.reportPeriodStart}
                  onChange={(e) => setFormData({ ...formData, reportPeriodStart: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="reportPeriodEnd">報告期間（終了）*</Label>
                <Input
                  id="reportPeriodEnd"
                  type="date"
                  required
                  value={formData.reportPeriodEnd}
                  onChange={(e) => setFormData({ ...formData, reportPeriodEnd: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="visitCount">訪問回数</Label>
              <Input
                id="visitCount"
                type="number"
                min="0"
                value={formData.visitCount}
                onChange={(e) => setFormData({ ...formData, visitCount: parseInt(e.target.value) || 0 })}
              />
            </div>

            <div>
              <Label htmlFor="patientCondition">利用者の状態</Label>
              <Textarea
                id="patientCondition"
                rows={3}
                value={formData.patientCondition}
                onChange={(e) => setFormData({ ...formData, patientCondition: e.target.value })}
                placeholder="利用者の状態を入力してください"
              />
            </div>

            <div>
              <Label htmlFor="nursingOutcomes">看護の成果</Label>
              <Textarea
                id="nursingOutcomes"
                rows={3}
                value={formData.nursingOutcomes}
                onChange={(e) => setFormData({ ...formData, nursingOutcomes: e.target.value })}
                placeholder="看護の成果を入力してください"
              />
            </div>

            <div>
              <Label htmlFor="problemsAndActions">問題点と対応</Label>
              <Textarea
                id="problemsAndActions"
                rows={3}
                value={formData.problemsAndActions}
                onChange={(e) => setFormData({ ...formData, problemsAndActions: e.target.value })}
                placeholder="問題点と対応を入力してください"
              />
            </div>

            <div>
              <Label htmlFor="familySupport">家族への支援</Label>
              <Textarea
                id="familySupport"
                rows={2}
                value={formData.familySupport}
                onChange={(e) => setFormData({ ...formData, familySupport: e.target.value })}
                placeholder="家族への支援を入力してください"
              />
            </div>

            <div>
              <Label htmlFor="communicationWithDoctor">主治医への連絡事項</Label>
              <Textarea
                id="communicationWithDoctor"
                rows={2}
                value={formData.communicationWithDoctor}
                onChange={(e) => setFormData({ ...formData, communicationWithDoctor: e.target.value })}
                placeholder="主治医への連絡事項を入力してください"
              />
            </div>

            <div>
              <Label htmlFor="communicationWithCareManager">ケアマネージャーへの連絡事項</Label>
              <Textarea
                id="communicationWithCareManager"
                rows={2}
                value={formData.communicationWithCareManager}
                onChange={(e) => setFormData({ ...formData, communicationWithCareManager: e.target.value })}
                placeholder="ケアマネージャーへの連絡事項を入力してください"
              />
            </div>

            <div>
              <Label htmlFor="remarks">備考</Label>
              <Textarea
                id="remarks"
                rows={2}
                value={formData.remarks}
                onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                placeholder="備考を入力してください"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                キャンセル
              </Button>
              <Button type="submit">
                {editingReport ? "更新" : "作成"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
