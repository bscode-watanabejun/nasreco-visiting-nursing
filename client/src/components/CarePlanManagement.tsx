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
import { Plus, Edit, Trash2, FileText } from "lucide-react";
import type { CarePlan, Patient } from "@shared/schema";

type CarePlanWithRelations = CarePlan & {
  patient: Patient;
  creator: { fullName: string };
  approver?: { fullName: string } | null;
};

export default function CarePlanManagement() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<CarePlanWithRelations | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form state
  const [formData, setFormData] = useState({
    planNumber: "",
    planDate: new Date().toISOString().split('T')[0],
    planPeriodStart: new Date().toISOString().split('T')[0],
    planPeriodEnd: new Date().toISOString().split('T')[0],
    nursingGoals: "",
    nursingPlan: "",
    weeklyVisitPlan: "",
    remarks: "",
  });

  // Fetch care plans
  const { data: carePlans, isLoading: loadingPlans } = useQuery<CarePlanWithRelations[]>({
    queryKey: ["/api/care-plans", selectedPatientId],
    queryFn: async () => {
      const url = selectedPatientId
        ? `/api/care-plans?patientId=${selectedPatientId}`
        : "/api/care-plans";
      const response = await fetch(url);
      if (!response.ok) throw new Error("訪問看護計画書の取得に失敗しました");
      return response.json();
    },
  });

  // Fetch patients for filter
  const { data: patients } = useQuery<Patient[]>({
    queryKey: ["/api/patients"],
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: typeof formData & { patientId: string }) => {
      const response = await fetch("/api/care-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("作成に失敗しました");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/care-plans"] });
      setIsDialogOpen(false);
      resetForm();
      toast({ description: "訪問看護計画書を作成しました" });
    },
    onError: () => {
      toast({ variant: "destructive", description: "作成に失敗しました" });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData & { id: string; patientId: string }) => {
      const response = await fetch(`/api/care-plans/${data.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("更新に失敗しました");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/care-plans"] });
      setIsDialogOpen(false);
      setEditingPlan(null);
      resetForm();
      toast({ description: "訪問看護計画書を更新しました" });
    },
    onError: () => {
      toast({ variant: "destructive", description: "更新に失敗しました" });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/care-plans/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("削除に失敗しました");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/care-plans"] });
      toast({ description: "訪問看護計画書を削除しました" });
    },
    onError: () => {
      toast({ variant: "destructive", description: "削除に失敗しました" });
    },
  });

  const resetForm = () => {
    setFormData({
      planNumber: "",
      planDate: new Date().toISOString().split('T')[0],
      planPeriodStart: new Date().toISOString().split('T')[0],
      planPeriodEnd: new Date().toISOString().split('T')[0],
      nursingGoals: "",
      nursingPlan: "",
      weeklyVisitPlan: "",
      remarks: "",
    });
  };

  const handleAdd = () => {
    setEditingPlan(null);
    resetForm();
    setIsDialogOpen(true);
  };

  const handleEdit = (plan: CarePlanWithRelations) => {
    setEditingPlan(plan);
    setFormData({
      planNumber: plan.planNumber || "",
      planDate: plan.planDate,
      planPeriodStart: plan.planPeriodStart,
      planPeriodEnd: plan.planPeriodEnd,
      nursingGoals: plan.nursingGoals || "",
      nursingPlan: plan.nursingPlan || "",
      weeklyVisitPlan: plan.weeklyVisitPlan || "",
      remarks: plan.remarks || "",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("この訪問看護計画書を削除してもよろしいですか?")) {
      deleteMutation.mutate(id);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const patientId = editingPlan?.patientId || (document.getElementById("patientId") as HTMLSelectElement)?.value;
    if (!patientId) {
      toast({ variant: "destructive", description: "利用者を選択してください" });
      return;
    }

    if (editingPlan) {
      updateMutation.mutate({ ...formData, id: editingPlan.id, patientId });
    } else {
      createMutation.mutate({ ...formData, patientId });
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">訪問看護計画書</h1>
          <p className="text-muted-foreground">訪問看護計画書の作成・管理</p>
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
                <SelectItem value="">全ての利用者</SelectItem>
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
          <CardTitle>訪問看護計画書一覧</CardTitle>
          <CardDescription>登録されている訪問看護計画書</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingPlans ? (
            <div className="text-center py-8">読み込み中...</div>
          ) : !carePlans || carePlans.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              訪問看護計画書が登録されていません
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>計画書番号</TableHead>
                  <TableHead>利用者</TableHead>
                  <TableHead>計画日</TableHead>
                  <TableHead>計画期間</TableHead>
                  <TableHead>看護目標</TableHead>
                  <TableHead>作成者</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {carePlans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell className="font-medium">{plan.planNumber || "-"}</TableCell>
                    <TableCell>{plan.patient.lastName} {plan.patient.firstName}</TableCell>
                    <TableCell>{plan.planDate}</TableCell>
                    <TableCell>
                      {plan.planPeriodStart} ~ {plan.planPeriodEnd}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {plan.nursingGoals || "-"}
                    </TableCell>
                    <TableCell>{plan.creator.fullName}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(plan)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(plan.id)}
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
              {editingPlan ? "訪問看護計画書を編集" : "訪問看護計画書を作成"}
            </DialogTitle>
            <DialogDescription>
              訪問看護計画書の情報を入力してください
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!editingPlan && (
              <div>
                <Label htmlFor="patientId">利用者 *</Label>
                <Select name="patientId" required>
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="planNumber">計画書番号</Label>
                <Input
                  id="planNumber"
                  value={formData.planNumber}
                  onChange={(e) => setFormData({ ...formData, planNumber: e.target.value })}
                  placeholder="例: 2025-001"
                />
              </div>
              <div>
                <Label htmlFor="planDate">計画日 *</Label>
                <Input
                  id="planDate"
                  type="date"
                  required
                  value={formData.planDate}
                  onChange={(e) => setFormData({ ...formData, planDate: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="planPeriodStart">計画期間（開始）*</Label>
                <Input
                  id="planPeriodStart"
                  type="date"
                  required
                  value={formData.planPeriodStart}
                  onChange={(e) => setFormData({ ...formData, planPeriodStart: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="planPeriodEnd">計画期間（終了）*</Label>
                <Input
                  id="planPeriodEnd"
                  type="date"
                  required
                  value={formData.planPeriodEnd}
                  onChange={(e) => setFormData({ ...formData, planPeriodEnd: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="nursingGoals">看護目標</Label>
              <Textarea
                id="nursingGoals"
                rows={3}
                value={formData.nursingGoals}
                onChange={(e) => setFormData({ ...formData, nursingGoals: e.target.value })}
                placeholder="看護目標を入力してください"
              />
            </div>

            <div>
              <Label htmlFor="nursingPlan">看護計画</Label>
              <Textarea
                id="nursingPlan"
                rows={4}
                value={formData.nursingPlan}
                onChange={(e) => setFormData({ ...formData, nursingPlan: e.target.value })}
                placeholder="看護計画を入力してください"
              />
            </div>

            <div>
              <Label htmlFor="weeklyVisitPlan">週間訪問計画</Label>
              <Textarea
                id="weeklyVisitPlan"
                rows={3}
                value={formData.weeklyVisitPlan}
                onChange={(e) => setFormData({ ...formData, weeklyVisitPlan: e.target.value })}
                placeholder="週間訪問計画を入力してください"
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
                {editingPlan ? "更新" : "作成"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
