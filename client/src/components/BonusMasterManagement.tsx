import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { Calculator, Pencil, Plus, Search, Copy } from "lucide-react"
import type { BonusMaster } from "@shared/schema"

// Form data type
type BonusFormData = {
  bonusCode: string
  bonusName: string
  bonusCategory: string
  insuranceType: "medical" | "care"
  version: string
  validFrom: string
  validTo: string
  pointsType: "fixed" | "conditional"
  fixedPoints: number
  conditionalPattern: string
  pointsConfig: any
  displayOrder: number
  notes: string
  isActive: boolean
}

const initialFormData: BonusFormData = {
  bonusCode: "",
  bonusName: "",
  bonusCategory: "",
  insuranceType: "medical",
  version: "2024",
  validFrom: "2024-04-01",
  validTo: "",
  pointsType: "fixed",
  fixedPoints: 0,
  conditionalPattern: "",
  pointsConfig: null,
  displayOrder: 100,
  notes: "",
  isActive: true,
}

export default function BonusMasterManagement() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingBonus, setEditingBonus] = useState<BonusMaster | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [insuranceFilter, setInsuranceFilter] = useState<string>("all")
  const [activeFilter, setActiveFilter] = useState<string>("active")
  const [formData, setFormData] = useState<BonusFormData>(initialFormData)

  // Fetch bonus masters
  const { data: bonusesData = [], isLoading } = useQuery<BonusMaster[]>({
    queryKey: ["/api/bonus-masters", insuranceFilter, activeFilter],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (insuranceFilter !== "all") params.append("insuranceType", insuranceFilter)
      if (activeFilter !== "all") params.append("isActive", activeFilter === "active" ? "true" : "false")

      const response = await fetch(`/api/bonus-masters?${params}`)
      if (!response.ok) throw new Error("加算マスタの取得に失敗しました")
      return response.json()
    },
  })

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: BonusFormData) => {
      const response = await fetch("/api/bonus-masters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "加算マスタの登録に失敗しました")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bonus-masters"] })
      toast({
        title: "登録完了",
        description: "加算マスタを登録しました",
      })
      handleCloseDialog()
    },
    onError: (error: Error) => {
      toast({
        title: "エラー",
        description: (
          <div className="whitespace-pre-line">
            {error.message}
          </div>
        ),
        variant: "destructive",
      })
    },
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<BonusFormData> }) => {
      const response = await fetch(`/api/bonus-masters/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "加算マスタの更新に失敗しました")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bonus-masters"] })
      toast({
        title: "更新完了",
        description: "加算マスタを更新しました",
      })
      handleCloseDialog()
    },
    onError: (error: Error) => {
      toast({
        title: "エラー",
        description: (
          <div className="whitespace-pre-line">
            {error.message}
          </div>
        ),
        variant: "destructive",
      })
    },
  })

  // Filter bonuses by search term
  const filteredBonuses = bonusesData.filter(bonus =>
    bonus.bonusName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    bonus.bonusCode.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Load form data when editing
  useEffect(() => {
    if (editingBonus) {
      setFormData({
        bonusCode: editingBonus.bonusCode,
        bonusName: editingBonus.bonusName,
        bonusCategory: editingBonus.bonusCategory,
        insuranceType: editingBonus.insuranceType,
        version: editingBonus.version,
        validFrom: editingBonus.validFrom,
        validTo: editingBonus.validTo || "",
        pointsType: editingBonus.pointsType,
        fixedPoints: editingBonus.fixedPoints || 0,
        conditionalPattern: editingBonus.conditionalPattern || "",
        pointsConfig: editingBonus.pointsConfig,
        displayOrder: editingBonus.displayOrder ?? 100,
        notes: editingBonus.notes || "",
        isActive: editingBonus.isActive,
      })
    } else {
      setFormData(initialFormData)
    }
  }, [editingBonus])

  const handleOpenDialog = (bonus?: BonusMaster) => {
    setEditingBonus(bonus || null)
    setDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setDialogOpen(false)
    setEditingBonus(null)
    setFormData(initialFormData)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
    if (!formData.bonusCode.trim()) {
      toast({
        title: "エラー",
        description: "加算コードを入力してください",
        variant: "destructive",
      })
      return
    }

    if (!formData.bonusName.trim()) {
      toast({
        title: "エラー",
        description: "加算名を入力してください",
        variant: "destructive",
      })
      return
    }

    // Prepare data for submission
    const submitData: any = {
      ...formData,
      validTo: formData.validTo || null,
    }

    // Convert pointsConfig for conditional patterns
    if (formData.pointsType === "conditional" && formData.conditionalPattern) {
      // pointsConfig is already in the correct format
    } else if (formData.pointsType === "fixed") {
      submitData.conditionalPattern = null
      submitData.pointsConfig = null
    }

    if (editingBonus) {
      updateMutation.mutate({ id: editingBonus.id, data: submitData })
    } else {
      createMutation.mutate(submitData)
    }
  }

  // Handle creating a new version from existing bonus
  const handleCreateVersion = (bonus: BonusMaster) => {
    setFormData({
      bonusCode: bonus.bonusCode,
      bonusName: bonus.bonusName,
      bonusCategory: bonus.bonusCategory,
      insuranceType: bonus.insuranceType,
      version: "2026", // New version
      validFrom: "2026-04-01",
      validTo: "",
      pointsType: bonus.pointsType,
      fixedPoints: bonus.fixedPoints || 0,
      conditionalPattern: bonus.conditionalPattern || "",
      pointsConfig: bonus.pointsConfig,
      displayOrder: bonus.displayOrder ?? 100,
      notes: bonus.notes || "",
      isActive: true,
    })
    setEditingBonus(null)
    setDialogOpen(true)
    toast({
      title: "新バージョン作成",
      description: `${bonus.bonusName}の新バージョンを作成します`,
    })
  }

  // Get insurance type label
  const getInsuranceTypeLabel = (type: string) => {
    return type === "medical" ? "医療保険" : "介護保険"
  }

  // Get points type label
  const getPointsTypeLabel = (type: string) => {
    return type === "fixed" ? "固定点数" : "条件分岐"
  }

  // Render points config fields based on conditional pattern
  const renderPointsConfigFields = () => {
    if (formData.pointsType !== "conditional") return null

    const pattern = formData.conditionalPattern

    switch (pattern) {
      case "monthly_14day_threshold":
        return (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>月14日目まで（点）</Label>
              <Input
                type="number"
                value={formData.pointsConfig?.up_to_14 || ""}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  pointsConfig: { ...prev.pointsConfig, up_to_14: parseInt(e.target.value) || 0 }
                }))}
              />
            </div>
            <div className="space-y-2">
              <Label>月15日目以降（点）</Label>
              <Input
                type="number"
                value={formData.pointsConfig?.after_14 || ""}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  pointsConfig: { ...prev.pointsConfig, after_14: parseInt(e.target.value) || 0 }
                }))}
              />
            </div>
          </div>
        )

      case "time_based":
        return (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>夜間（18:00-22:00）（点）</Label>
              <Input
                type="number"
                value={formData.pointsConfig?.night || ""}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  pointsConfig: { ...prev.pointsConfig, night: parseInt(e.target.value) || 0 }
                }))}
              />
            </div>
            <div className="space-y-2">
              <Label>深夜（22:00-6:00）（点）</Label>
              <Input
                type="number"
                value={formData.pointsConfig?.late_night || ""}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  pointsConfig: { ...prev.pointsConfig, late_night: parseInt(e.target.value) || 0 }
                }))}
              />
            </div>
            <div className="space-y-2">
              <Label>早朝（6:00-8:00）（点）</Label>
              <Input
                type="number"
                value={formData.pointsConfig?.early_morning || ""}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  pointsConfig: { ...prev.pointsConfig, early_morning: parseInt(e.target.value) || 0 }
                }))}
              />
            </div>
            <div className="space-y-2">
              <Label>日中（8:00-18:00）（点）</Label>
              <Input
                type="number"
                value={formData.pointsConfig?.daytime || ""}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  pointsConfig: { ...prev.pointsConfig, daytime: parseInt(e.target.value) || 0 }
                }))}
              />
            </div>
          </div>
        )

      case "duration_based":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>90分以上（点）</Label>
              <Input
                type="number"
                value={formData.pointsConfig?.duration_90 || ""}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  pointsConfig: { ...prev.pointsConfig, duration_90: parseInt(e.target.value) || 0 }
                }))}
              />
            </div>
          </div>
        )

      case "age_based":
        return (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>6歳未満（点）</Label>
              <Input
                type="number"
                value={formData.pointsConfig?.age_0_6 || ""}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  pointsConfig: { ...prev.pointsConfig, age_0_6: parseInt(e.target.value) || 0 }
                }))}
              />
            </div>
          </div>
        )

      default:
        return (
          <div className="space-y-2">
            <Label>点数設定（JSON）</Label>
            <Textarea
              value={JSON.stringify(formData.pointsConfig, null, 2)}
              onChange={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value)
                  setFormData(prev => ({ ...prev, pointsConfig: parsed }))
                } catch (err) {
                  // Invalid JSON, ignore
                }
              }}
              rows={5}
              className="font-mono text-sm"
            />
          </div>
        )
    }
  }

  return (
    <div className="w-full max-w-full space-y-4 sm:space-y-6 p-3 sm:p-4 lg:p-6 overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">加算マスタ管理</h1>
          <p className="text-muted-foreground">診療報酬加算項目の登録と管理</p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="mr-2 h-4 w-4" />
          新規登録
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="search">検索</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="加算名・コードで検索"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="insurance-filter">保険種別</Label>
              <Select value={insuranceFilter} onValueChange={setInsuranceFilter}>
                <SelectTrigger id="insurance-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">すべて</SelectItem>
                  <SelectItem value="medical">医療保険</SelectItem>
                  <SelectItem value="care">介護保険</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="active-filter">ステータス</Label>
              <Select value={activeFilter} onValueChange={setActiveFilter}>
                <SelectTrigger id="active-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">有効のみ</SelectItem>
                  <SelectItem value="inactive">無効のみ</SelectItem>
                  <SelectItem value="all">すべて</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bonus Masters Table */}
      <Card>
        <CardHeader>
          <CardTitle>登録済み加算一覧</CardTitle>
          <CardDescription>
            {filteredBonuses.length}件の加算が登録されています
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">読み込み中...</div>
          ) : filteredBonuses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              加算が登録されていません
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>加算コード</TableHead>
                    <TableHead>加算名</TableHead>
                    <TableHead>保険種別</TableHead>
                    <TableHead>点数タイプ</TableHead>
                    <TableHead>有効期間</TableHead>
                    <TableHead>バージョン</TableHead>
                    <TableHead>ステータス</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBonuses.map((bonus) => (
                    <TableRow key={bonus.id}>
                      <TableCell className="font-mono text-sm">
                        {bonus.bonusCode}
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Calculator className="h-4 w-4 text-muted-foreground" />
                          {bonus.bonusName}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={bonus.insuranceType === "medical" ? "medical" : "care"}>
                          {getInsuranceTypeLabel(bonus.insuranceType)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {getPointsTypeLabel(bonus.pointsType)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {bonus.validFrom}
                        {bonus.validTo && ` 〜 ${bonus.validTo}`}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{bonus.version}</Badge>
                      </TableCell>
                      <TableCell>
                        {bonus.isActive ? (
                          <Badge variant="success">有効</Badge>
                        ) : (
                          <Badge variant="secondary">無効</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleOpenDialog(bonus)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleCreateVersion(bonus)}
                            title="新バージョン作成"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingBonus ? "加算マスタの編集" : "加算マスタの新規登録"}
            </DialogTitle>
            <DialogDescription>
              加算マスタの情報を入力してください
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6">
            <Tabs defaultValue="basic" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="basic">基本情報</TabsTrigger>
                <TabsTrigger value="points">点数設定</TabsTrigger>
                <TabsTrigger value="advanced">詳細設定</TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="bonusCode">
                      加算コード <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="bonusCode"
                      value={formData.bonusCode}
                      onChange={(e) => setFormData(prev => ({ ...prev, bonusCode: e.target.value }))}
                      placeholder="例: emergency_visit"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bonusName">
                      加算名 <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="bonusName"
                      value={formData.bonusName}
                      onChange={(e) => setFormData(prev => ({ ...prev, bonusName: e.target.value }))}
                      placeholder="例: 緊急訪問看護加算"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="bonusCategory">カテゴリ</Label>
                    <Input
                      id="bonusCategory"
                      value={formData.bonusCategory}
                      onChange={(e) => setFormData(prev => ({ ...prev, bonusCategory: e.target.value }))}
                      placeholder="例: 訪問看護加算"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="insuranceType">保険種別</Label>
                    <Select
                      value={formData.insuranceType}
                      onValueChange={(value: "medical" | "care") =>
                        setFormData(prev => ({ ...prev, insuranceType: value }))
                      }
                    >
                      <SelectTrigger id="insuranceType">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="medical">医療保険</SelectItem>
                        <SelectItem value="care">介護保険</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="version">バージョン</Label>
                    <Input
                      id="version"
                      value={formData.version}
                      onChange={(e) => setFormData(prev => ({ ...prev, version: e.target.value }))}
                      placeholder="例: 2024"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="validFrom">有効開始日</Label>
                    <Input
                      id="validFrom"
                      type="date"
                      value={formData.validFrom}
                      onChange={(e) => setFormData(prev => ({ ...prev, validFrom: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="validTo">有効終了日</Label>
                    <Input
                      id="validTo"
                      type="date"
                      value={formData.validTo}
                      onChange={(e) => setFormData(prev => ({ ...prev, validTo: e.target.value }))}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="points" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="pointsType">点数タイプ</Label>
                  <Select
                    value={formData.pointsType}
                    onValueChange={(value: "fixed" | "conditional") => {
                      setFormData(prev => ({
                        ...prev,
                        pointsType: value,
                        pointsConfig: value === "conditional" ? {} : null
                      }))
                    }}
                  >
                    <SelectTrigger id="pointsType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">固定点数</SelectItem>
                      <SelectItem value="conditional">条件分岐</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formData.pointsType === "fixed" ? (
                  <div className="space-y-2">
                    <Label htmlFor="fixedPoints">固定点数</Label>
                    <Input
                      id="fixedPoints"
                      type="number"
                      value={formData.fixedPoints}
                      onChange={(e) => setFormData(prev => ({ ...prev, fixedPoints: parseInt(e.target.value) || 0 }))}
                    />
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="conditionalPattern">条件分岐パターン</Label>
                      <Select
                        value={formData.conditionalPattern}
                        onValueChange={(value) => {
                          setFormData(prev => ({
                            ...prev,
                            conditionalPattern: value,
                            pointsConfig: {}
                          }))
                        }}
                      >
                        <SelectTrigger id="conditionalPattern">
                          <SelectValue placeholder="パターンを選択" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monthly_14day_threshold">月14日閾値型</SelectItem>
                          <SelectItem value="time_based">時間帯別型</SelectItem>
                          <SelectItem value="duration_based">訪問時間長型</SelectItem>
                          <SelectItem value="age_based">年齢区分型</SelectItem>
                          <SelectItem value="building_occupancy">同一建物区分型</SelectItem>
                          <SelectItem value="visit_count">訪問回数型</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {renderPointsConfigFields()}
                  </>
                )}
              </TabsContent>

              <TabsContent value="advanced" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="displayOrder">表示順序</Label>
                  <Input
                    id="displayOrder"
                    type="number"
                    value={formData.displayOrder}
                    onChange={(e) => setFormData(prev => ({ ...prev, displayOrder: parseInt(e.target.value) || 0 }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">備考</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    rows={4}
                    placeholder="特記事項があれば入力してください"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="isActive"
                    checked={formData.isActive}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isActive: checked }))}
                  />
                  <Label htmlFor="isActive">有効</Label>
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseDialog}
              >
                キャンセル
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending
                  ? "保存中..."
                  : editingBonus
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
