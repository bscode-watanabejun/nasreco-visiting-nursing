import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, CreditCard } from "lucide-react";
import type { InsuranceCard, Patient } from "@shared/schema";

export default function InsuranceCardManagement() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<InsuranceCard | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    patientId: "",
    cardType: "long_term_care" as "medical" | "long_term_care",
    insurerNumber: "",
    insuredNumber: "",
    insuredSymbol: "",
    insuredCardNumber: "",
    copaymentRate: "10" as "10" | "20" | "30",
    validFrom: "",
    validUntil: "",
  });

  // Fetch patients for dropdown
  const { data: patientsData } = useQuery<{ data: Patient[] } | Patient[]>({
    queryKey: ["/api/patients"],
  });

  // Handle both array and paginated response formats
  const patients: Patient[] = Array.isArray(patientsData)
    ? patientsData
    : ((patientsData as { data: Patient[] })?.data || []);

  // Fetch insurance cards
  const { data: cards = [], isLoading } = useQuery<InsuranceCard[]>({
    queryKey: ["/api/insurance-cards", selectedPatientId],
    queryFn: async () => {
      const url = selectedPatientId
        ? `/api/insurance-cards?patientId=${selectedPatientId}`
        : "/api/insurance-cards";
      const response = await fetch(url);
      if (!response.ok) throw new Error("保険証の取得に失敗しました");
      return response.json();
    },
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await fetch("/api/insurance-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!response.ok) throw new Error("保険証の登録に失敗しました");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/insurance-cards"] });
      toast({ title: "保険証を登録しました" });
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({ title: "エラー", description: error.message, variant: "destructive" });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const response = await fetch(`/api/insurance-cards/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!response.ok) throw new Error("保険証の更新に失敗しました");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/insurance-cards"] });
      toast({ title: "保険証を更新しました" });
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({ title: "エラー", description: error.message, variant: "destructive" });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/insurance-cards/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error("保険証の削除に失敗しました");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/insurance-cards"] });
      toast({ title: "保険証を削除しました" });
    },
    onError: (error: Error) => {
      toast({ title: "エラー", description: error.message, variant: "destructive" });
    },
  });

  const handleOpenDialog = (card?: InsuranceCard) => {
    if (card) {
      setEditingCard(card);
      setFormData({
        patientId: card.patientId,
        cardType: card.cardType as "medical" | "long_term_care",
        insurerNumber: card.insurerNumber,
        insuredNumber: card.insuredNumber,
        insuredSymbol: card.insuredSymbol || "",
        insuredCardNumber: card.insuredCardNumber || "",
        copaymentRate: (card.copaymentRate as "10" | "20" | "30") || "10",
        validFrom: card.validFrom || "",
        validUntil: card.validUntil || "",
      });
    } else {
      setEditingCard(null);
      setFormData({
        patientId: "",
        cardType: "long_term_care",
        insurerNumber: "",
        insuredNumber: "",
        insuredSymbol: "",
        insuredCardNumber: "",
        copaymentRate: "10",
        validFrom: "",
        validUntil: "",
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingCard(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCard) {
      updateMutation.mutate({ id: editingCard.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("本当に削除しますか？")) {
      deleteMutation.mutate(id);
    }
  };

  const getPatientName = (patientId: string) => {
    const patient = patients.find(p => p.id === patientId);
    return patient ? `${patient.lastName} ${patient.firstName}` : "不明";
  };

  const isCardValid = (card: InsuranceCard) => {
    if (!card.validUntil) return true; // 無期限
    return new Date(card.validUntil) >= new Date();
  };

  return (
    <div className="container mx-auto py-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>保険証管理</CardTitle>
              <CardDescription>利用者の医療保険・介護保険証を管理します</CardDescription>
            </div>
            <div className="flex gap-2">
              <Select
                value={selectedPatientId || undefined}
                onValueChange={(value) => setSelectedPatientId(value || "")}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="全利用者" />
                </SelectTrigger>
                <SelectContent>
                  {patients.map((patient) => (
                    <SelectItem key={patient.id} value={patient.id}>
                      {patient.lastName} {patient.firstName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={() => handleOpenDialog()}>
                <Plus className="mr-2 h-4 w-4" />
                新規登録
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">読み込み中...</div>
          ) : cards.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CreditCard className="mx-auto h-12 w-12 opacity-50 mb-4" />
              保険証が登録されていません
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>利用者名</TableHead>
                  <TableHead>保険種別</TableHead>
                  <TableHead>保険者番号</TableHead>
                  <TableHead>被保険者番号</TableHead>
                  <TableHead>負担割合</TableHead>
                  <TableHead>有効期限</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cards.map((card) => (
                  <TableRow key={card.id}>
                    <TableCell className="font-medium">{getPatientName(card.patientId)}</TableCell>
                    <TableCell>
                      <Badge variant={card.cardType === "medical" ? "default" : "secondary"}>
                        {card.cardType === "medical" ? "医療保険" : "介護保険"}
                      </Badge>
                    </TableCell>
                    <TableCell>{card.insurerNumber}</TableCell>
                    <TableCell>{card.insuredNumber}</TableCell>
                    <TableCell>{card.copaymentRate ? `${card.copaymentRate}割` : "-"}</TableCell>
                    <TableCell>
                      {card.validUntil ? (
                        <div className="flex items-center gap-2">
                          {new Date(card.validUntil).toLocaleDateString('ja-JP')}
                          {!isCardValid(card) && (
                            <Badge variant="destructive">期限切れ</Badge>
                          )}
                        </div>
                      ) : (
                        <Badge variant="outline">無期限</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenDialog(card)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(card.id)}
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
              {editingCard ? "保険証の編集" : "保険証の新規登録"}
            </DialogTitle>
            <DialogDescription>
              医療保険または介護保険証の情報を入力してください
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="patientId">利用者 *</Label>
                <Select
                  value={formData.patientId}
                  onValueChange={(value) => setFormData({ ...formData, patientId: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="利用者を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {patients.map((patient) => (
                      <SelectItem key={patient.id} value={patient.id}>
                        {patient.lastName} {patient.firstName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cardType">保険種別 *</Label>
                  <Select
                    value={formData.cardType}
                    onValueChange={(value) => setFormData({ ...formData, cardType: value as "medical" | "long_term_care" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="medical">医療保険</SelectItem>
                      <SelectItem value="long_term_care">介護保険</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="copaymentRate">負担割合</Label>
                  <Select
                    value={formData.copaymentRate}
                    onValueChange={(value) => setFormData({ ...formData, copaymentRate: value as "10" | "20" | "30" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">1割</SelectItem>
                      <SelectItem value="20">2割</SelectItem>
                      <SelectItem value="30">3割</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="insurerNumber">保険者番号 *</Label>
                  <Input
                    id="insurerNumber"
                    required
                    value={formData.insurerNumber}
                    onChange={(e) => setFormData({ ...formData, insurerNumber: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="insuredNumber">被保険者番号 *</Label>
                  <Input
                    id="insuredNumber"
                    required
                    value={formData.insuredNumber}
                    onChange={(e) => setFormData({ ...formData, insuredNumber: e.target.value })}
                  />
                </div>
              </div>

              {formData.cardType === "medical" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="insuredSymbol">記号（医療保険のみ）</Label>
                    <Input
                      id="insuredSymbol"
                      value={formData.insuredSymbol}
                      onChange={(e) => setFormData({ ...formData, insuredSymbol: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="insuredCardNumber">番号（医療保険のみ）</Label>
                    <Input
                      id="insuredCardNumber"
                      value={formData.insuredCardNumber}
                      onChange={(e) => setFormData({ ...formData, insuredCardNumber: e.target.value })}
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="validFrom">有効期間開始日 *</Label>
                  <Input
                    id="validFrom"
                    type="date"
                    required
                    value={formData.validFrom}
                    onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="validUntil">有効期限（無期限の場合は空欄）</Label>
                  <Input
                    id="validUntil"
                    type="date"
                    value={formData.validUntil}
                    onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                  />
                </div>
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
                {editingCard ? "更新" : "登録"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
