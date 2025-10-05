import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
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
import type { DoctorOrder, MedicalInstitution } from "@shared/schema"

interface DoctorOrderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  patientId: string
  order?: DoctorOrder | null
}

interface FormData {
  medicalInstitutionId: string
  orderDate: string
  startDate: string
  endDate: string
  diagnosis: string
  orderContent: string
  weeklyVisitLimit: string
  notes: string
}

const getInitialFormData = (order?: DoctorOrder | null): FormData => ({
  medicalInstitutionId: order?.medicalInstitutionId || '',
  orderDate: order?.orderDate || new Date().toISOString().split('T')[0],
  startDate: order?.startDate || new Date().toISOString().split('T')[0],
  endDate: order?.endDate || '',
  diagnosis: order?.diagnosis || '',
  orderContent: order?.orderContent || '',
  weeklyVisitLimit: order?.weeklyVisitLimit?.toString() || '',
  notes: order?.notes || '',
})

export function DoctorOrderDialog({ open, onOpenChange, patientId, order }: DoctorOrderDialogProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [formData, setFormData] = useState<FormData>(getInitialFormData(order))
  const [isSaving, setIsSaving] = useState(false)

  // Fetch medical institutions
  const { data: medicalInstitutions = [] } = useQuery<MedicalInstitution[]>({
    queryKey: ["/api/medical-institutions"],
    queryFn: async () => {
      const response = await fetch("/api/medical-institutions")
      if (!response.ok) throw new Error("医療機関データの取得に失敗しました")
      return response.json()
    },
  })

  // Reset form when dialog opens or order changes
  useEffect(() => {
    if (open) {
      setFormData(getInitialFormData(order))
    }
  }, [open, order])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
    if (!formData.medicalInstitutionId) {
      toast({
        title: "エラー",
        description: "医療機関を選択してください",
        variant: "destructive"
      })
      return
    }
    if (!formData.endDate) {
      toast({
        title: "エラー",
        description: "指示期間終了日を入力してください",
        variant: "destructive"
      })
      return
    }
    if (!formData.diagnosis) {
      toast({
        title: "エラー",
        description: "病名を入力してください",
        variant: "destructive"
      })
      return
    }
    if (!formData.orderContent) {
      toast({
        title: "エラー",
        description: "指示内容を入力してください",
        variant: "destructive"
      })
      return
    }

    setIsSaving(true)

    try {
      const apiData = {
        patientId,
        medicalInstitutionId: formData.medicalInstitutionId,
        orderDate: formData.orderDate,
        startDate: formData.startDate,
        endDate: formData.endDate,
        diagnosis: formData.diagnosis,
        orderContent: formData.orderContent,
        ...(formData.weeklyVisitLimit && { weeklyVisitLimit: parseInt(formData.weeklyVisitLimit) }),
        ...(formData.notes && { notes: formData.notes }),
      }

      const url = order ? `/api/doctor-orders/${order.id}` : "/api/doctor-orders"
      const method = order ? "PUT" : "POST"

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiData),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown server error' }))
        throw new Error(error.error || `サーバーエラー (${response.status})`)
      }

      await queryClient.invalidateQueries({ queryKey: ["doctor-orders"] })

      toast({
        title: "保存完了",
        description: order ? "訪問看護指示書を更新しました" : "訪問看護指示書を登録しました",
      })

      onOpenChange(false)
    } catch (error) {
      console.error('Save doctor order error:', error)
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {order ? '訪問看護指示書の編集' : '訪問看護指示書の登録'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Medical Institution */}
          <div className="space-y-2">
            <Label htmlFor="medicalInstitutionId">
              医療機関 <span className="text-red-500">*</span>
            </Label>
            <Select
              value={formData.medicalInstitutionId}
              onValueChange={(value) => setFormData(prev => ({ ...prev, medicalInstitutionId: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="医療機関を選択してください" />
              </SelectTrigger>
              <SelectContent>
                {medicalInstitutions.map((institution) => (
                  <SelectItem key={institution.id} value={institution.id}>
                    {institution.name} - {institution.doctorName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {medicalInstitutions.length === 0 && (
              <p className="text-xs text-muted-foreground">
                医療機関が登録されていません。先に「医療機関マスタ」から登録してください。
              </p>
            )}
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="orderDate">指示日</Label>
              <Input
                id="orderDate"
                type="date"
                value={formData.orderDate}
                onChange={(e) => setFormData(prev => ({ ...prev, orderDate: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="startDate">指示期間開始日</Label>
              <Input
                id="startDate"
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">
                指示期間終了日 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="endDate"
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
                required
              />
            </div>
          </div>

          {/* Diagnosis */}
          <div className="space-y-2">
            <Label htmlFor="diagnosis">
              病名（主たる傷病名） <span className="text-red-500">*</span>
            </Label>
            <Input
              id="diagnosis"
              value={formData.diagnosis}
              onChange={(e) => setFormData(prev => ({ ...prev, diagnosis: e.target.value }))}
              placeholder="例: 脳梗塞後遺症、糖尿病"
              required
            />
          </div>

          {/* Order Content */}
          <div className="space-y-2">
            <Label htmlFor="orderContent">
              指示内容 <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="orderContent"
              value={formData.orderContent}
              onChange={(e) => setFormData(prev => ({ ...prev, orderContent: e.target.value }))}
              placeholder="例: バイタルサイン測定、服薬管理、清潔ケア"
              rows={4}
              required
            />
          </div>

          {/* Weekly Visit Limit */}
          <div className="space-y-2">
            <Label htmlFor="weeklyVisitLimit">週の訪問回数上限</Label>
            <Input
              id="weeklyVisitLimit"
              type="number"
              min="1"
              max="7"
              value={formData.weeklyVisitLimit}
              onChange={(e) => setFormData(prev => ({ ...prev, weeklyVisitLimit: e.target.value }))}
              placeholder="例: 3"
            />
            <p className="text-xs text-muted-foreground">
              訪問看護指示書に記載されている週の訪問回数上限を入力してください
            </p>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">備考</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="特記事項があれば入力してください"
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              キャンセル
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? '保存中...' : (order ? '更新' : '登録')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
