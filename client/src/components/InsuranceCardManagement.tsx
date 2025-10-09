import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
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
import { Plus, Pencil, Trash2, CreditCard, ExternalLink, Download } from "lucide-react";
import { InsuranceCardDialog } from "./InsuranceCardDialog";
import type { InsuranceCard, Patient } from "@shared/schema";

export default function InsuranceCardManagement() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<InsuranceCard | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
    setEditingCard(card || null);
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("本当に削除しますか？")) {
      deleteMutation.mutate(id);
    }
  };

  const handleDeleteAttachment = async (id: string) => {
    if (!confirm('添付ファイルを削除してもよろしいですか？')) {
      return;
    }

    try {
      const response = await fetch(`/api/insurance-cards/${id}/attachment`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('削除に失敗しました');
      }

      toast({
        title: "削除完了",
        description: "添付ファイルを削除しました",
      });

      queryClient.invalidateQueries({ queryKey: ["/api/insurance-cards"] });
    } catch (error) {
      console.error('Delete attachment error:', error);
      toast({
        title: "エラー",
        description: "削除中にエラーが発生しました",
        variant: "destructive"
      });
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
    <div className="w-full max-w-full space-y-4 sm:space-y-6 p-3 sm:p-4 lg:p-6 overflow-x-hidden">
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
                  <>
                    <TableRow
                      key={card.id}
                      onClick={() => setExpandedRow(expandedRow === card.id ? null : card.id)}
                      className="cursor-pointer hover:bg-muted/50"
                    >
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
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDialog(card);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(card.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>

                    {/* 展開エリア */}
                    {expandedRow === card.id && (
                      <TableRow>
                        <TableCell colSpan={7} className="bg-muted/30 p-0">
                          <div className="p-4 space-y-3">
                            {/* 記号・番号（医療保険のみ） */}
                            {card.cardType === "medical" && (card.insuredSymbol || card.insuredCardNumber) && (
                              <div>
                                <p className="text-sm font-medium text-muted-foreground">記号・番号</p>
                                <p className="text-sm mt-1">
                                  {card.insuredSymbol && `記号: ${card.insuredSymbol}`}
                                  {card.insuredSymbol && card.insuredCardNumber && " / "}
                                  {card.insuredCardNumber && `番号: ${card.insuredCardNumber}`}
                                </p>
                              </div>
                            )}

                            {/* 認定日（介護保険のみ） */}
                            {card.cardType === "long_term_care" && card.certificationDate && (
                              <div>
                                <p className="text-sm font-medium text-muted-foreground">認定日</p>
                                <p className="text-sm mt-1">{new Date(card.certificationDate).toLocaleDateString('ja-JP')}</p>
                              </div>
                            )}

                            {/* 有効期間 */}
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">有効期間</p>
                              <p className="text-sm mt-1">
                                {new Date(card.validFrom).toLocaleDateString('ja-JP')} 〜
                                {card.validUntil ? ` ${new Date(card.validUntil).toLocaleDateString('ja-JP')}` : " 無期限"}
                              </p>
                            </div>

                            {/* 備考 */}
                            {card.notes && (
                              <div>
                                <p className="text-sm font-medium text-muted-foreground">備考</p>
                                <p className="text-sm mt-1 whitespace-pre-wrap">{card.notes}</p>
                              </div>
                            )}

                            {/* 添付ファイル */}
                            {card.filePath && (
                              <div>
                                <p className="text-sm font-medium text-muted-foreground">添付ファイル</p>
                                <p className="text-sm mt-1">
                                  {card.originalFileName || card.filePath.split('/').pop()}
                                </p>
                                <div className="flex flex-wrap gap-2 mt-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => window.open(card.filePath!, '_blank')}
                                  >
                                    <ExternalLink className="mr-1 h-3 w-3" />
                                    プレビュー
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      window.location.href = `/api/insurance-cards/${card.id}/attachment/download`;
                                    }}
                                  >
                                    <Download className="mr-1 h-3 w-3" />
                                    ダウンロード
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => handleDeleteAttachment(card.id)}
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

      {/* 保険証情報編集ダイアログ */}
      <InsuranceCardDialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setEditingCard(null);
          }
        }}
        patientId={editingCard?.patientId}
        card={editingCard}
      />
    </div>
  );
}
