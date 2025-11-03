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
import { Plus, Edit, Trash2, ExternalLink, Download, FileText } from "lucide-react";
import type { Contract, Patient } from "@shared/schema";

type ContractWithRelations = Contract & {
  patient: Patient;
  witnessedBy?: { fullName: string; id: string } | null;
};

export default function ContractManagement() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<ContractWithRelations | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string>("all");
  const [selectedContractType, setSelectedContractType] = useState<string>("all");
  const [selectedPatientIdForForm, setSelectedPatientIdForForm] = useState<string>("");
  const [selectedWitnessId, setSelectedWitnessId] = useState<string>("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form state
  const [formData, setFormData] = useState({
    contractType: "service_agreement" as const,
    contractDate: new Date().toISOString().split('T')[0],
    startDate: new Date().toISOString().split('T')[0],
    endDate: "",
    title: "",
    description: "",
    signedBy: "",
    file: null as File | null,
  });

  // Fetch contracts
  const { data: contractsList, isLoading: loadingContracts, error: contractsError } = useQuery<ContractWithRelations[]>({
    queryKey: ["/api/contracts", selectedPatientId],
    queryFn: async () => {
      const url = selectedPatientId !== "all"
        ? `/api/contracts?patientId=${selectedPatientId}`
        : "/api/contracts";
      const response = await fetch(url);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || "契約書の取得に失敗しました";
        throw new Error(errorMessage);
      }
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

  // Fetch users for witness selection
  const { data: usersResponse } = useQuery<{ data: any[]; total: number }>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const response = await fetch("/api/users?limit=100");
      if (!response.ok) throw new Error("スタッフの取得に失敗しました");
      return response.json();
    },
  });

  const users = usersResponse?.data;

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: typeof formData & { patientId: string; witnessedBy?: string }) => {
      const formDataToSend = new FormData();
      formDataToSend.append('patientId', data.patientId);
      formDataToSend.append('contractType', data.contractType);
      formDataToSend.append('contractDate', data.contractDate);
      formDataToSend.append('startDate', data.startDate);
      if (data.endDate) formDataToSend.append('endDate', data.endDate);
      formDataToSend.append('title', data.title);
      if (data.description) formDataToSend.append('description', data.description);
      if (data.signedBy) formDataToSend.append('signedBy', data.signedBy);
      if (data.witnessedBy) formDataToSend.append('witnessedBy', data.witnessedBy);
      if (data.file) formDataToSend.append('file', data.file);

      const response = await fetch("/api/contracts", {
        method: "POST",
        body: formDataToSend,
      });
      if (!response.ok) throw new Error("作成に失敗しました");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      setIsDialogOpen(false);
      resetForm();
      toast({ description: "契約書を作成しました" });
    },
    onError: () => {
      toast({ variant: "destructive", description: "作成に失敗しました" });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData & { id: string; patientId: string; witnessedBy?: string }) => {
      const formDataToSend = new FormData();
      formDataToSend.append('patientId', data.patientId);
      formDataToSend.append('contractType', data.contractType);
      formDataToSend.append('contractDate', data.contractDate);
      formDataToSend.append('startDate', data.startDate);
      if (data.endDate) formDataToSend.append('endDate', data.endDate);
      formDataToSend.append('title', data.title);
      if (data.description) formDataToSend.append('description', data.description);
      if (data.signedBy) formDataToSend.append('signedBy', data.signedBy);
      if (data.witnessedBy) formDataToSend.append('witnessedBy', data.witnessedBy);
      if (data.file) formDataToSend.append('file', data.file);

      const response = await fetch(`/api/contracts/${data.id}`, {
        method: "PUT",
        body: formDataToSend,
      });
      if (!response.ok) throw new Error("更新に失敗しました");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      setIsDialogOpen(false);
      setEditingContract(null);
      resetForm();
      toast({ description: "契約書を更新しました" });
    },
    onError: () => {
      toast({ variant: "destructive", description: "更新に失敗しました" });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/contracts/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("削除に失敗しました");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      toast({ description: "契約書を削除しました" });
    },
    onError: () => {
      toast({ variant: "destructive", description: "削除に失敗しました" });
    },
  });

  const resetForm = () => {
    setFormData({
      contractType: "service_agreement",
      contractDate: new Date().toISOString().split('T')[0],
      startDate: new Date().toISOString().split('T')[0],
      endDate: "",
      title: "",
      description: "",
      signedBy: "",
      file: null,
    });
    setSelectedPatientIdForForm("");
    setSelectedWitnessId("none");
  };

  const handleAdd = () => {
    setEditingContract(null);
    resetForm();
    setIsDialogOpen(true);
  };

  const handleEdit = (contract: ContractWithRelations) => {
    setEditingContract(contract);
    setFormData({
      contractType: contract.contractType as any,
      contractDate: contract.contractDate,
      startDate: contract.startDate,
      endDate: contract.endDate || "",
      title: contract.title,
      description: contract.description || "",
      signedBy: contract.signedBy || "",
      file: null,
    });
    setSelectedPatientIdForForm(contract.patientId);
    setSelectedWitnessId(contract.witnessedBy?.id || "none");
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("この契約書を削除してもよろしいですか?")) {
      deleteMutation.mutate(id);
    }
  };

  const handleDeleteAttachment = async (id: string) => {
    if (!confirm('添付ファイルを削除してもよろしいですか？')) return;

    try {
      const response = await fetch(`/api/contracts/${id}/attachment`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('削除に失敗しました');

      toast({
        title: "削除完了",
        description: "添付ファイルを削除しました"
      });

      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
    } catch (error) {
      toast({
        title: "エラー",
        description: "削除中にエラーが発生しました",
        variant: "destructive"
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const patientId = editingContract?.patientId || selectedPatientIdForForm;
    if (!patientId) {
      toast({ variant: "destructive", description: "利用者を選択してください" });
      return;
    }

    const submitData = {
      ...formData,
      patientId,
      witnessedBy: selectedWitnessId === "none" ? undefined : selectedWitnessId,
    };

    if (editingContract) {
      updateMutation.mutate({ ...submitData, id: editingContract.id });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const contractTypeLabels: Record<string, string> = {
    service_agreement: "サービス利用契約書",
    important_matters: "重要事項説明書",
    personal_info_consent: "個人情報利用同意書",
    medical_consent: "医療行為同意書",
    other: "その他"
  };

  // Show error if contracts fetch failed
  if (contractsError) {
    return (
      <div className="space-y-4 sm:space-y-6 p-3 sm:p-4 lg:p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center max-w-md">
            <FileText className="mx-auto h-12 w-12 mb-4 opacity-50 text-red-500" />
            <p className="text-muted-foreground mb-2">契約書データの取得に失敗しました</p>
            <p className="text-sm text-red-500">{contractsError.message}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full space-y-4 sm:space-y-6 p-3 sm:p-4 lg:p-6 overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">契約書・同意書管理</h1>
          <p className="text-muted-foreground">契約書・同意書の作成・管理</p>
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
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="w-full sm:w-64">
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

            <div className="w-full sm:w-64">
              <Label>契約種別</Label>
              <Select value={selectedContractType} onValueChange={setSelectedContractType}>
                <SelectTrigger>
                  <SelectValue placeholder="全ての契約種別" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全ての契約種別</SelectItem>
                  <SelectItem value="service_agreement">サービス利用契約書</SelectItem>
                  <SelectItem value="important_matters">重要事項説明書</SelectItem>
                  <SelectItem value="personal_info_consent">個人情報利用同意書</SelectItem>
                  <SelectItem value="medical_consent">医療行為同意書</SelectItem>
                  <SelectItem value="other">その他</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>契約書・同意書一覧</CardTitle>
          <CardDescription>登録されている契約書・同意書</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingContracts ? (
            <div className="text-center py-8">読み込み中...</div>
          ) : !contractsList || contractsList.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              契約書・同意書が登録されていません
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>契約種別</TableHead>
                  <TableHead>タイトル</TableHead>
                  <TableHead>利用者</TableHead>
                  <TableHead>契約日</TableHead>
                  <TableHead>有効期間</TableHead>
                  <TableHead>署名者</TableHead>
                  <TableHead>立会人</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contractsList
                  .filter(contract => selectedContractType === "all" || contract.contractType === selectedContractType)
                  .map((contract) => (
                  <>
                    <TableRow
                      key={contract.id}
                      onClick={() => setExpandedRow(expandedRow === contract.id ? null : contract.id)}
                      className="cursor-pointer hover:bg-muted/50"
                    >
                      <TableCell>{contractTypeLabels[contract.contractType]}</TableCell>
                      <TableCell className="font-medium">{contract.title}</TableCell>
                      <TableCell>{contract.patient.lastName} {contract.patient.firstName}</TableCell>
                      <TableCell>{contract.contractDate}</TableCell>
                      <TableCell>
                        {contract.startDate} ~ {contract.endDate || "無期限"}
                      </TableCell>
                      <TableCell>{contract.signedBy || "-"}</TableCell>
                      <TableCell>{contract.witnessedBy?.fullName || "-"}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(contract);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(contract.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>

                    {/* 展開エリア */}
                    {expandedRow === contract.id && (
                      <TableRow>
                        <TableCell colSpan={8}>
                          <div className="p-4 space-y-3 bg-muted/30">
                            {contract.description && (
                              <div>
                                <p className="text-sm font-medium">説明・備考</p>
                                <p className="text-sm whitespace-pre-wrap">{contract.description}</p>
                              </div>
                            )}

                            {contract.filePath && (
                              <div>
                                <p className="text-sm font-medium">添付ファイル</p>
                                <p className="text-sm mt-1">{contract.originalFileName || contract.filePath.split('/').pop()}</p>
                                <div className="flex flex-wrap gap-2 mt-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => window.open(`/api/contracts/${contract.id}/attachment/download`, '_blank')}
                                  >
                                    <ExternalLink className="mr-1 h-3 w-3" />
                                    プレビュー
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => window.location.href = `/api/contracts/${contract.id}/attachment/download?download=true`}
                                  >
                                    <Download className="mr-1 h-3 w-3" />
                                    ダウンロード
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => handleDeleteAttachment(contract.id)}
                                  >
                                    <Trash2 className="mr-1 h-3 w-3" />
                                    削除
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
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
              {editingContract ? "契約書・同意書を編集" : "契約書・同意書を作成"}
            </DialogTitle>
            <DialogDescription>
              契約書・同意書の情報を入力してください
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!editingContract && (
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="contractType">契約種別 *</Label>
                <Select
                  value={formData.contractType}
                  onValueChange={(value) => setFormData({ ...formData, contractType: value as any })}
                  required
                >
                  <SelectTrigger id="contractType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="service_agreement">サービス利用契約書</SelectItem>
                    <SelectItem value="important_matters">重要事項説明書</SelectItem>
                    <SelectItem value="personal_info_consent">個人情報利用同意書</SelectItem>
                    <SelectItem value="medical_consent">医療行為同意書</SelectItem>
                    <SelectItem value="other">その他</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="contractDate">契約日 *</Label>
                <Input
                  id="contractDate"
                  type="date"
                  required
                  value={formData.contractDate}
                  onChange={(e) => setFormData({ ...formData, contractDate: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="title">タイトル *</Label>
              <Input
                id="title"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="例: 訪問看護サービス利用契約書"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="startDate">有効開始日 *</Label>
                <Input
                  id="startDate"
                  type="date"
                  required
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="endDate">有効終了日</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  placeholder="空欄の場合は無期限"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="description">説明・備考</Label>
              <Textarea
                id="description"
                rows={3}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="契約内容の説明や備考を入力してください"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="signedBy">署名者</Label>
                <Input
                  id="signedBy"
                  value={formData.signedBy}
                  onChange={(e) => setFormData({ ...formData, signedBy: e.target.value })}
                  placeholder="利用者または代理人の氏名"
                />
              </div>
              <div>
                <Label htmlFor="witnessedBy">立会人（スタッフ）</Label>
                <Select value={selectedWitnessId} onValueChange={setSelectedWitnessId}>
                  <SelectTrigger id="witnessedBy">
                    <SelectValue placeholder="立会人を選択（任意）" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">なし</SelectItem>
                    {users?.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* File Upload */}
            <div className="space-y-2">
              <Label htmlFor="file">契約書PDFファイル</Label>
              <Input
                id="file"
                type="file"
                accept="application/pdf,image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setFormData(prev => ({ ...prev, file }));
                }}
              />
              {formData.file && (
                <p className="text-xs text-muted-foreground">
                  選択中: {formData.file.name} ({(formData.file.size / 1024).toFixed(1)} KB)
                </p>
              )}
              {editingContract?.filePath && !formData.file && (
                <p className="text-xs text-green-600">
                  既存ファイル: {editingContract.originalFileName || editingContract.filePath.split('/').pop()}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                PDF形式または画像ファイル（JPEG、PNG）をアップロードできます
              </p>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                キャンセル
              </Button>
              <Button type="submit">
                {editingContract ? "更新" : "作成"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
