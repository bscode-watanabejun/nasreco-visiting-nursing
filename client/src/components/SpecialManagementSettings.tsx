import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, X, MoveUp, MoveDown } from "lucide-react";

// Type definitions
type SpecialManagementField = {
  id?: string;
  definitionId?: string;
  fieldName: string;
  fieldLabel: string;
  fieldType: "text" | "number" | "select" | "textarea";
  fieldOptions?: { options?: string[] } | null;
  isRequired: boolean;
  displayOrder: number;
};

type SpecialManagementDefinition = {
  id: string;
  category: string;
  displayName: string;
  insuranceType: "medical_5000" | "medical_2500" | "care_500" | "care_250";
  monthlyPoints: number;
  description: string | null;
  displayOrder: number;
  isActive: boolean;
  facilityId: string | null;
  fields?: SpecialManagementField[];
};

const INSURANCE_TYPE_LABELS: Record<string, string> = {
  "medical_5000": "医療5000円",
  "medical_2500": "医療2500円",
  "care_500": "介護500円",
  "care_250": "介護250円",
};

const FIELD_TYPE_LABELS: Record<string, string> = {
  "text": "テキスト",
  "number": "数値",
  "select": "選択",
  "textarea": "複数行テキスト",
};

export default function SpecialManagementSettings() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDefinition, setEditingDefinition] = useState<SpecialManagementDefinition | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<{
    displayName: string;
    insuranceType: "medical_5000" | "medical_2500" | "care_500" | "care_250";
    monthlyPoints: number;
    description: string;
    displayOrder: number;
  }>({
    displayName: "",
    insuranceType: "medical_2500",
    monthlyPoints: 2500,
    description: "",
    displayOrder: 0,
  });

  const [fields, setFields] = useState<SpecialManagementField[]>([]);
  const [editingFieldIndex, setEditingFieldIndex] = useState<number | null>(null);

  // Fetch special management definitions
  const { data: definitions = [], isLoading } = useQuery<SpecialManagementDefinition[]>({
    queryKey: ["/api/special-management-definitions"],
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: { definition: typeof formData; fields: SpecialManagementField[] }) => {
      const response = await fetch("/api/special-management-definitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data.definition, fields: data.fields }),
        credentials: "include",
      });
      if (!response.ok) throw new Error("特管マスタの登録に失敗しました");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/special-management-definitions"] });
      toast({ title: "特管マスタを登録しました" });
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({ title: "エラー", description: error.message, variant: "destructive" });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { definition: typeof formData; fields: SpecialManagementField[] } }) => {
      const response = await fetch(`/api/special-management-definitions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data.definition, fields: data.fields }),
        credentials: "include",
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "特管マスタの更新に失敗しました");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/special-management-definitions"] });
      toast({ title: "特管マスタを更新しました" });
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({ title: "エラー", description: error.message, variant: "destructive" });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/special-management-definitions/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "特管マスタの削除に失敗しました");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/special-management-definitions"] });
      toast({ title: "特管マスタを削除しました" });
    },
    onError: (error: Error) => {
      toast({ title: "エラー", description: error.message, variant: "destructive" });
    },
  });

  const handleOpenDialog = (definition?: SpecialManagementDefinition) => {
    if (definition) {
      setEditingDefinition(definition);
      setFormData({
        displayName: definition.displayName,
        insuranceType: definition.insuranceType,
        monthlyPoints: definition.monthlyPoints,
        description: definition.description || "",
        displayOrder: definition.displayOrder,
      });
      setFields(definition.fields || []);
    } else {
      setEditingDefinition(null);
      setFormData({
        displayName: "",
        insuranceType: "medical_2500",
        monthlyPoints: 2500,
        description: "",
        displayOrder: definitions.length,
      });
      setFields([]);
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingDefinition(null);
    setEditingFieldIndex(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (editingDefinition) {
      updateMutation.mutate({
        id: editingDefinition.id,
        data: { definition: formData, fields },
      });
    } else {
      createMutation.mutate({ definition: formData, fields });
    }
  };

  const handleDelete = (id: string, displayName: string) => {
    if (confirm(`「${displayName}」を削除してもよろしいですか？`)) {
      deleteMutation.mutate(id);
    }
  };

  // Field management functions
  const addField = () => {
    const newField: SpecialManagementField = {
      fieldName: "", // サーバー側で自動生成
      fieldLabel: "",
      fieldType: "text",
      fieldOptions: null,
      isRequired: false,
      displayOrder: fields.length,
    };
    setFields([...fields, newField]);
    setEditingFieldIndex(fields.length);
  };

  const updateField = (index: number, updates: Partial<SpecialManagementField>) => {
    const newFields = [...fields];
    newFields[index] = { ...newFields[index], ...updates };
    setFields(newFields);
  };

  const removeField = (index: number) => {
    const newFields = fields.filter((_, i) => i !== index);
    // Re-order remaining fields
    newFields.forEach((field, i) => {
      field.displayOrder = i;
    });
    setFields(newFields);
    if (editingFieldIndex === index) {
      setEditingFieldIndex(null);
    }
  };

  const moveField = (index: number, direction: "up" | "down") => {
    const newFields = [...fields];
    const targetIndex = direction === "up" ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= newFields.length) return;

    [newFields[index], newFields[targetIndex]] = [newFields[targetIndex], newFields[index]];

    // Update display orders
    newFields.forEach((field, i) => {
      field.displayOrder = i;
    });

    setFields(newFields);
  };

  return (
    <div className="w-full max-w-full space-y-4 sm:space-y-6 p-3 sm:p-4 lg:p-6 overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">特別管理マスタ設定</h1>
          <p className="text-muted-foreground">特別管理加算の項目とフィールドを管理します</p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="mr-2 h-4 w-4" />
          新規作成
        </Button>
      </div>

      {/* Special Management Definitions Table */}
      <Card>
        <CardHeader>
          <CardTitle>特別管理加算一覧</CardTitle>
          <CardDescription>登録されている特別管理加算の項目</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">読み込み中...</div>
          ) : definitions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              特管マスタが登録されていません
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>表示名</TableHead>
                  <TableHead>保険種別</TableHead>
                  <TableHead>月額点数</TableHead>
                  <TableHead>フィールド数</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {definitions.map((definition) => (
                  <TableRow key={definition.id}>
                    <TableCell className="font-medium">{definition.displayName}</TableCell>
                    <TableCell>{INSURANCE_TYPE_LABELS[definition.insuranceType]}</TableCell>
                    <TableCell>{definition.monthlyPoints}円</TableCell>
                    <TableCell>{definition.fields?.length || 0}個</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenDialog(definition)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(definition.id, definition.displayName)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit/Create Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingDefinition ? "特管マスタを編集" : "特管マスタを新規作成"}
            </DialogTitle>
            <DialogDescription>
              特別管理項目の基本情報とフィールドを設定してください
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">基本情報</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="displayName">表示名 *</Label>
                  <Input
                    id="displayName"
                    value={formData.displayName}
                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                    placeholder="例: 在宅酸素療法"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="insuranceType">保険種別 *</Label>
                  <Select
                    value={formData.insuranceType}
                    onValueChange={(value: any) => setFormData({ ...formData, insuranceType: value })}
                  >
                    <SelectTrigger id="insuranceType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="medical_5000">医療5000円</SelectItem>
                      <SelectItem value="medical_2500">医療2500円</SelectItem>
                      <SelectItem value="care_500">介護500円</SelectItem>
                      <SelectItem value="care_250">介護250円</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="monthlyPoints">月額点数（円） *</Label>
                  <Input
                    id="monthlyPoints"
                    type="number"
                    value={formData.monthlyPoints}
                    onChange={(e) => setFormData({ ...formData, monthlyPoints: parseInt(e.target.value) })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">説明</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="この特管項目の説明を入力してください"
                  rows={2}
                />
              </div>
            </div>

            <Separator />

            {/* Fields Management */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">記録フィールド設定</h3>
                <Button type="button" size="sm" variant="outline" onClick={addField}>
                  <Plus className="mr-2 h-4 w-4" />
                  フィールド追加
                </Button>
              </div>

              {fields.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground border-2 border-dashed rounded-lg">
                  フィールドが登録されていません。「フィールド追加」ボタンから追加してください。
                </div>
              ) : (
                <div className="space-y-2">
                  {fields.map((field, index) => (
                    <Card key={index} className="p-4">
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <Label className="text-xs">ラベル（表示名） *</Label>
                                <Input
                                  value={field.fieldLabel}
                                  onChange={(e) => updateField(index, { fieldLabel: e.target.value })}
                                  placeholder="例: 酸素流量(L/分)"
                                  className="h-8 text-sm"
                                  required
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">入力形式</Label>
                                <Select
                                  value={field.fieldType}
                                  onValueChange={(value: any) => updateField(index, { fieldType: value })}
                                >
                                  <SelectTrigger className="h-8 text-sm">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="text">テキスト</SelectItem>
                                    <SelectItem value="number">数値</SelectItem>
                                    <SelectItem value="select">選択</SelectItem>
                                    <SelectItem value="textarea">複数行</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            {field.fieldType === "select" && (
                              <div className="space-y-1">
                                <Label className="text-xs">選択肢（カンマ区切り）</Label>
                                <Input
                                  value={field.fieldOptions?.options?.join(", ") || ""}
                                  onChange={(e) => {
                                    const options = e.target.value.split(",").map(s => s.trim()).filter(Boolean);
                                    updateField(index, { fieldOptions: { options } });
                                  }}
                                  placeholder="例: 少量, 中等量, 多量"
                                  className="h-8 text-sm"
                                />
                              </div>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => moveField(index, "up")}
                              disabled={index === 0}
                            >
                              <MoveUp className="h-3 w-3" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => moveField(index, "down")}
                              disabled={index === fields.length - 1}
                            >
                              <MoveDown className="h-3 w-3" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeField(index)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                キャンセル
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {editingDefinition ? "更新" : "作成"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
