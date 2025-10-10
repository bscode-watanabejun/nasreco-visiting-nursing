import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { Building, Pencil, Plus, Trash2 } from "lucide-react"
import type { Building as BuildingType } from "@shared/schema"

export default function BuildingManagement() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingBuilding, setEditingBuilding] = useState<BuildingType | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    notes: ""
  })

  // Fetch buildings
  const { data: buildingsData = [], isLoading } = useQuery<BuildingType[]>({
    queryKey: ["/api/buildings"],
    queryFn: async () => {
      const response = await fetch("/api/buildings")
      if (!response.ok) throw new Error("建物データの取得に失敗しました")
      return response.json()
    },
  })

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await fetch("/api/buildings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "建物の登録に失敗しました")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/buildings"] })
      toast({
        title: "登録完了",
        description: "建物を登録しました",
      })
      setDialogOpen(false)
      resetForm()
    },
    onError: (error: Error) => {
      toast({
        title: "エラー",
        description: error.message,
        variant: "destructive",
      })
    },
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const response = await fetch(`/api/buildings/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "建物の更新に失敗しました")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/buildings"] })
      toast({
        title: "更新完了",
        description: "建物情報を更新しました",
      })
      setDialogOpen(false)
      resetForm()
    },
    onError: (error: Error) => {
      toast({
        title: "エラー",
        description: error.message,
        variant: "destructive",
      })
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/buildings/${id}`, {
        method: "DELETE",
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "建物の削除に失敗しました")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/buildings"] })
      toast({
        title: "削除完了",
        description: "建物を削除しました",
      })
    },
    onError: (error: Error) => {
      toast({
        title: "エラー",
        description: error.message,
        variant: "destructive",
      })
    },
  })

  const resetForm = () => {
    setFormData({
      name: "",
      address: "",
      notes: ""
    })
    setEditingBuilding(null)
  }

  const handleOpenDialog = (building?: BuildingType) => {
    if (building) {
      setEditingBuilding(building)
      setFormData({
        name: building.name,
        address: building.address || "",
        notes: building.notes || ""
      })
    } else {
      resetForm()
    }
    setDialogOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      toast({
        title: "エラー",
        description: "建物名を入力してください",
        variant: "destructive",
      })
      return
    }

    if (editingBuilding) {
      updateMutation.mutate({ id: editingBuilding.id, data: formData })
    } else {
      createMutation.mutate(formData)
    }
  }

  const handleDelete = async (building: BuildingType) => {
    if (!confirm(`「${building.name}」を削除してもよろしいですか？`)) {
      return
    }
    deleteMutation.mutate(building.id)
  }

  return (
    <div className="w-full max-w-full space-y-4 sm:space-y-6 p-3 sm:p-4 lg:p-6 overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">建物管理</h1>
          <p className="text-muted-foreground">建物・施設情報の登録と管理</p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="mr-2 h-4 w-4" />
          新規登録
        </Button>
      </div>

      {/* Buildings Table */}
      <Card>
        <CardHeader>
          <CardTitle>登録済み建物一覧</CardTitle>
          <CardDescription>
            同一建物減算の適用に使用されます
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">読み込み中...</div>
          ) : buildingsData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              建物が登録されていません
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>建物名</TableHead>
                  <TableHead>住所</TableHead>
                  <TableHead>備考</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {buildingsData.map((building) => (
                  <TableRow key={building.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Building className="h-4 w-4 text-muted-foreground" />
                        {building.name}
                      </div>
                    </TableCell>
                    <TableCell>{building.address || "-"}</TableCell>
                    <TableCell className="max-w-xs truncate">
                      {building.notes || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleOpenDialog(building)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(building)}
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

      {/* Building Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingBuilding ? "建物情報の編集" : "建物の新規登録"}
            </DialogTitle>
            <DialogDescription>
              建物・施設の情報を入力してください
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                建物名 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="例: さくらマンション"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">住所</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="例: 東京都渋谷区1-2-3"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">備考</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="特記事項があれば入力してください"
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                キャンセル
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending
                  ? "保存中..."
                  : editingBuilding
                  ? "更新"
                  : "登録"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
