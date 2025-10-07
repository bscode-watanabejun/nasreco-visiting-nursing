import { useState, useEffect } from "react"
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import type { CarePlan, DoctorOrder } from "@shared/schema"

interface CarePlanDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  patientId: string
  plan?: CarePlan | null
}

interface FormData {
  doctorOrderId: string
  planNumber: string
  planDate: string
  planPeriodStart: string
  planPeriodEnd: string
  nursingGoals: string
  nursingPlan: string
  weeklyVisitPlan: string
  remarks: string
  file?: File | null
}

const getInitialFormData = (plan?: CarePlan | null): FormData => ({
  doctorOrderId: plan?.doctorOrderId || '',
  planNumber: plan?.planNumber || '',
  planDate: plan?.planDate || new Date().toISOString().split('T')[0],
  planPeriodStart: plan?.planPeriodStart || new Date().toISOString().split('T')[0],
  planPeriodEnd: plan?.planPeriodEnd || '',
  nursingGoals: plan?.nursingGoals || '',
  nursingPlan: plan?.nursingPlan || '',
  weeklyVisitPlan: plan?.weeklyVisitPlan || '',
  remarks: plan?.remarks || '',
})

export function CarePlanDialog({ open, onOpenChange, patientId, plan }: CarePlanDialogProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [formData, setFormData] = useState<FormData>(getInitialFormData(plan))
  const [isSaving, setIsSaving] = useState(false)

  // Fetch doctor orders for this patient
  const { data: doctorOrders = [] } = useQuery<DoctorOrder[]>({
    queryKey: ["/api/doctor-orders", patientId],
    queryFn: async () => {
      const response = await fetch(`/api/doctor-orders?patientId=${patientId}`)
      if (!response.ok) throw new Error("訪問看護指示書の取得に失敗しました")
      return response.json()
    },
    enabled: open && !!patientId,
  })

  // Reset form when dialog opens or plan changes
  useEffect(() => {
    if (open) {
      setFormData(getInitialFormData(plan))
    }
  }, [open, plan])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
    if (!formData.planDate) {
      toast({
        title: "エラー",
        description: "計画日を入力してください",
        variant: "destructive"
      })
      return
    }
    if (!formData.planPeriodStart || !formData.planPeriodEnd) {
      toast({
        title: "エラー",
        description: "計画期間を入力してください",
        variant: "destructive"
      })
      return
    }

    setIsSaving(true)

    try {
      const url = plan ? `/api/care-plans/${plan.id}` : "/api/care-plans"
      const method = plan ? "PUT" : "POST"

      let response: Response

      // If file is attached, use FormData for multipart upload
      if (formData.file) {
        const multipartData = new FormData()
        multipartData.append('patientId', patientId)
        multipartData.append('planDate', formData.planDate)
        multipartData.append('planPeriodStart', formData.planPeriodStart)
        multipartData.append('planPeriodEnd', formData.planPeriodEnd)
        if (formData.doctorOrderId) multipartData.append('doctorOrderId', formData.doctorOrderId)
        if (formData.planNumber) multipartData.append('planNumber', formData.planNumber)
        if (formData.nursingGoals) multipartData.append('nursingGoals', formData.nursingGoals)
        if (formData.nursingPlan) multipartData.append('nursingPlan', formData.nursingPlan)
        if (formData.weeklyVisitPlan) multipartData.append('weeklyVisitPlan', formData.weeklyVisitPlan)
        if (formData.remarks) multipartData.append('remarks', formData.remarks)
        multipartData.append('file', formData.file)

        response = await fetch(url, {
          method,
          body: multipartData,
        })
      } else {
        // No file, send JSON
        const apiData = {
          patientId,
          planDate: formData.planDate,
          planPeriodStart: formData.planPeriodStart,
          planPeriodEnd: formData.planPeriodEnd,
          ...(formData.doctorOrderId && { doctorOrderId: formData.doctorOrderId }),
          ...(formData.planNumber && { planNumber: formData.planNumber }),
          ...(formData.nursingGoals && { nursingGoals: formData.nursingGoals }),
          ...(formData.nursingPlan && { nursingPlan: formData.nursingPlan }),
          ...(formData.weeklyVisitPlan && { weeklyVisitPlan: formData.weeklyVisitPlan }),
          ...(formData.remarks && { remarks: formData.remarks }),
        }

        response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(apiData),
        })
      }

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || '保存に失敗しました')
      }

      toast({
        title: plan ? "更新完了" : "作成完了",
        description: plan ? "訪問看護計画書を更新しました" : "訪問看護計画書を作成しました",
      })

      queryClient.invalidateQueries({ queryKey: ["/api/care-plans", patientId] })
      onOpenChange(false)
    } catch (error) {
      console.error('Save care plan error:', error)
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : '保存中にエラーが発生しました',
        variant: "destructive"
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {plan ? "訪問看護計画書を編集" : "訪問看護計画書を作成"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 基本情報 */}
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

          {/* 訪問看護指示書との紐付け */}
          {doctorOrders.length > 0 && (
            <div>
              <Label htmlFor="doctorOrderId">関連する訪問看護指示書</Label>
              <Select value={formData.doctorOrderId || "none"} onValueChange={(value) => setFormData({ ...formData, doctorOrderId: value === "none" ? "" : value })}>
                <SelectTrigger id="doctorOrderId">
                  <SelectValue placeholder="選択してください（任意）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">なし</SelectItem>
                  {doctorOrders.map((order) => (
                    <SelectItem key={order.id} value={order.id}>
                      {order.diagnosis} ({order.startDate} 〜 {order.endDate})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* 看護目標 */}
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

          {/* 看護計画 */}
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

          {/* 週間訪問計画 */}
          <div>
            <Label htmlFor="weeklyVisitPlan">週間訪問計画</Label>
            <Textarea
              id="weeklyVisitPlan"
              rows={3}
              value={formData.weeklyVisitPlan}
              onChange={(e) => setFormData({ ...formData, weeklyVisitPlan: e.target.value })}
              placeholder="週間訪問計画を入力してください（例：月・水・金）"
            />
          </div>

          {/* 備考 */}
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

          {/* ファイルアップロード */}
          <div className="space-y-2 pt-4 border-t">
            <Label htmlFor="file">計画書PDFファイル</Label>
            <Input
              id="file"
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => {
                const file = e.target.files?.[0] || null
                setFormData({ ...formData, file })
              }}
            />
            {formData.file && (
              <p className="text-xs text-muted-foreground">
                選択中: {formData.file.name} ({(formData.file.size / 1024).toFixed(1)} KB)
              </p>
            )}
            {plan?.filePath && !formData.file && (
              <p className="text-xs text-green-600">
                既存ファイル: {plan.originalFileName || plan.filePath.split('/').pop()}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              PDF形式または画像ファイル（JPEG、PNG）をアップロードできます
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              キャンセル
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "保存中..." : plan ? "更新" : "作成"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
