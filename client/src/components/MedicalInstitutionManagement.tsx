import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Building2 } from "lucide-react";
import type { MedicalInstitution } from "@shared/schema";

export default function MedicalInstitutionManagement() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingInstitution, setEditingInstitution] = useState<MedicalInstitution | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    name: "",
    department: "",
    doctorName: "",
    postalCode: "",
    address: "",
    phone: "",
    fax: "",
    email: "",
    notes: "",
  });

  // Fetch medical institutions
  const { data: institutions = [], isLoading, error } = useQuery<MedicalInstitution[]>({
    queryKey: ["/api/medical-institutions"],
    queryFn: async () => {
      const response = await fetch("/api/medical-institutions")
      if (!response.ok) {
        throw new Error("医療機関データの取得に失敗しました")
      }
      return response.json()
    },
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await fetch("/api/medical-institutions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!response.ok) throw new Error("医療機関の登録に失敗しました");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/medical-institutions"] });
      toast({ title: "医療機関を登録しました" });
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({ title: "エラー", description: error.message, variant: "destructive" });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const response = await fetch(`/api/medical-institutions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!response.ok) throw new Error("医療機関の更新に失敗しました");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/medical-institutions"] });
      toast({ title: "医療機関を更新しました" });
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({ title: "エラー", description: error.message, variant: "destructive" });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/medical-institutions/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error("医療機関の削除に失敗しました");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/medical-institutions"] });
      toast({ title: "医療機関を削除しました" });
    },
    onError: (error: Error) => {
      toast({ title: "エラー", description: error.message, variant: "destructive" });
    },
  });

  const handleOpenDialog = (institution?: MedicalInstitution) => {
    if (institution) {
      setEditingInstitution(institution);
      setFormData({
        name: institution.name,
        department: institution.department || "",
        doctorName: institution.doctorName,
        postalCode: institution.postalCode || "",
        address: institution.address || "",
        phone: institution.phone || "",
        fax: institution.fax || "",
        email: institution.email || "",
        notes: institution.notes || "",
      });
    } else {
      setEditingInstitution(null);
      setFormData({
        name: "",
        department: "",
        doctorName: "",
        postalCode: "",
        address: "",
        phone: "",
        fax: "",
        email: "",
        notes: "",
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingInstitution(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingInstitution) {
      updateMutation.mutate({ id: editingInstitution.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("本当に削除しますか？")) {
      deleteMutation.mutate(id);
    }
  };

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Building2 className="mx-auto h-12 w-12 mb-4 opacity-50 text-red-500" />
          <p className="text-muted-foreground">医療機関データの取得に失敗しました</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-full space-y-4 sm:space-y-6 p-3 sm:p-4 lg:p-6 overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">医療機関マスタ</h1>
          <p className="text-muted-foreground">主治医・医療機関の情報を管理します</p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="mr-2 h-4 w-4" />
          新規登録
        </Button>
      </div>

      {/* Medical Institutions Table */}
      <Card>
        <CardHeader>
          <CardTitle>医療機関一覧</CardTitle>
          <CardDescription>登録されている医療機関・主治医の情報</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">読み込み中...</div>
          ) : institutions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              医療機関が登録されていません
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>医療機関名</TableHead>
                  <TableHead>診療科</TableHead>
                  <TableHead>医師名</TableHead>
                  <TableHead>電話番号</TableHead>
                  <TableHead>FAX</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {institutions.map((institution) => (
                  <TableRow key={institution.id}>
                    <TableCell className="font-medium">{institution.name}</TableCell>
                    <TableCell>{institution.department || "-"}</TableCell>
                    <TableCell>{institution.doctorName}</TableCell>
                    <TableCell>{institution.phone || "-"}</TableCell>
                    <TableCell>{institution.fax || "-"}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenDialog(institution)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(institution.id)}
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

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingInstitution ? "医療機関の編集" : "医療機関の新規登録"}
            </DialogTitle>
            <DialogDescription>
              主治医・医療機関の情報を入力してください
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">医療機関名 *</Label>
                  <Input
                    id="name"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="department">診療科</Label>
                  <Input
                    id="department"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="doctorName">医師名 *</Label>
                <Input
                  id="doctorName"
                  required
                  value={formData.doctorName}
                  onChange={(e) => setFormData({ ...formData, doctorName: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="postalCode">郵便番号</Label>
                  <Input
                    id="postalCode"
                    placeholder="123-4567"
                    value={formData.postalCode}
                    onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">住所</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">電話番号</Label>
                  <Input
                    id="phone"
                    placeholder="03-1234-5678"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fax">FAX</Label>
                  <Input
                    id="fax"
                    placeholder="03-1234-5679"
                    value={formData.fax}
                    onChange={(e) => setFormData({ ...formData, fax: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">メール</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">備考</Label>
                <Textarea
                  id="notes"
                  rows={3}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                キャンセル
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editingInstitution ? "更新" : "登録"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
