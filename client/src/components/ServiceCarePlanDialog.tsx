import { useState, useEffect } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
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
import type { ServiceCarePlan } from "@shared/schema"

interface ServiceCarePlanDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  patientId: string
  plan?: ServiceCarePlan | null
}

interface FormData {
  planType: string
  planNumber: string
  planDate: string
  initialPlanDate: string
  certificationDate: string
  certificationPeriodStart: string
  certificationPeriodEnd: string
  creatorType: string  // '1' | '2' | '3' | ''
  careManagerOfficeNumber: string  // 10桁英数字
  userIntention: string
  familyIntention: string
  comprehensivePolicy: string
  remarks: string
  file?: File | null
}

const getInitialFormData = (plan?: ServiceCarePlan | null): FormData => ({
  planType: plan?.planType || 'initial',
  planNumber: plan?.planNumber || '',
  planDate: plan?.planDate || new Date().toISOString().split('T')[0],
  initialPlanDate: plan?.initialPlanDate || '',
  certificationDate: plan?.certificationDate || '',
  certificationPeriodStart: plan?.certificationPeriodStart || '',
  certificationPeriodEnd: plan?.certificationPeriodEnd || '',
  creatorType: plan?.creatorType || '1',  // デフォルト値「1」
  careManagerOfficeNumber: plan?.careManagerOfficeNumber || '',
  userIntention: plan?.userIntention || '',
  familyIntention: plan?.familyIntention || '',
  comprehensivePolicy: plan?.comprehensivePolicy || '',
  remarks: plan?.remarks || '',
})

export function ServiceCarePlanDialog({ open, onOpenChange, patientId, plan }: ServiceCarePlanDialogProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [formData, setFormData] = useState<FormData>(getInitialFormData(plan))
  const [isSaving, setIsSaving] = useState(false)

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
        description: "作成日を入力してください",
        variant: "destructive"
      })
      return
    }

    // 作成区分のバリデーション
    if (!formData.creatorType) {
      toast({
        title: "エラー",
        description: "居宅サービス計画作成区分を選択してください",
        variant: "destructive"
      })
      return
    }

    // 事業所番号の条件付き必須チェック
    if ((formData.creatorType === '1' || formData.creatorType === '3') && 
        !formData.careManagerOfficeNumber) {
      toast({
        title: "エラー",
        description: "居宅介護支援事業所番号を入力してください（作成区分が「居宅介護支援事業所作成」または「介護予防支援事業所・地域包括支援センター作成」の場合は必須です）",
        variant: "destructive"
      })
      return
    }

    // 事業所番号の形式チェック（10桁）
    if (formData.careManagerOfficeNumber && 
        formData.careManagerOfficeNumber.length !== 10) {
      toast({
        title: "エラー",
        description: "居宅介護支援事業所番号は10桁で入力してください",
        variant: "destructive"
      })
      return
    }

    setIsSaving(true)

    try {
      const url = plan ? `/api/service-care-plans/${plan.id}` : "/api/service-care-plans"
      const method = plan ? "PUT" : "POST"

      let response: Response

      // If file is attached, use FormData for multipart upload
      if (formData.file) {
        const multipartData = new FormData()
        multipartData.append('patientId', patientId)
        multipartData.append('planType', formData.planType)
        multipartData.append('planDate', formData.planDate)
        if (formData.planNumber) multipartData.append('planNumber', formData.planNumber)
        if (formData.initialPlanDate) multipartData.append('initialPlanDate', formData.initialPlanDate)
        if (formData.certificationDate) multipartData.append('certificationDate', formData.certificationDate)
        if (formData.certificationPeriodStart) multipartData.append('certificationPeriodStart', formData.certificationPeriodStart)
        if (formData.certificationPeriodEnd) multipartData.append('certificationPeriodEnd', formData.certificationPeriodEnd)
        if (formData.userIntention) multipartData.append('userIntention', formData.userIntention)
        if (formData.familyIntention) multipartData.append('familyIntention', formData.familyIntention)
        if (formData.comprehensivePolicy) multipartData.append('comprehensivePolicy', formData.comprehensivePolicy)
        if (formData.remarks) multipartData.append('remarks', formData.remarks)
        multipartData.append('creatorType', formData.creatorType)
        if (formData.careManagerOfficeNumber) {
          multipartData.append('careManagerOfficeNumber', formData.careManagerOfficeNumber)
        }
        multipartData.append('file', formData.file)

        response = await fetch(url, {
          method,
          body: multipartData,
        })
      } else {
        // No file, send JSON
        const apiData = {
          patientId,
          planType: formData.planType,
          planDate: formData.planDate,
          ...(formData.planNumber && { planNumber: formData.planNumber }),
          ...(formData.initialPlanDate && { initialPlanDate: formData.initialPlanDate }),
          ...(formData.certificationDate && { certificationDate: formData.certificationDate }),
          ...(formData.certificationPeriodStart && { certificationPeriodStart: formData.certificationPeriodStart }),
          ...(formData.certificationPeriodEnd && { certificationPeriodEnd: formData.certificationPeriodEnd }),
          ...(formData.userIntention && { userIntention: formData.userIntention }),
          ...(formData.familyIntention && { familyIntention: formData.familyIntention }),
          ...(formData.comprehensivePolicy && { comprehensivePolicy: formData.comprehensivePolicy }),
          ...(formData.remarks && { remarks: formData.remarks }),
          creatorType: formData.creatorType,
          ...(formData.careManagerOfficeNumber && { 
            careManagerOfficeNumber: formData.careManagerOfficeNumber 
          }),
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
        description: plan ? "居宅サービス計画書を更新しました" : "居宅サービス計画書を作成しました",
      })

      queryClient.invalidateQueries({ queryKey: ["/api/service-care-plans", patientId] })
      onOpenChange(false)
    } catch (error) {
      console.error('Save service care plan error:', error)
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
            {plan ? "居宅サービス計画書を編集" : "居宅サービス計画書を作成"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 基本情報 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="planType">計画種別 *</Label>
              <Select value={formData.planType} onValueChange={(value) => setFormData({ ...formData, planType: value })}>
                <SelectTrigger id="planType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="initial">初回</SelectItem>
                  <SelectItem value="update">更新</SelectItem>
                  <SelectItem value="revision">変更</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="planNumber">計画書番号</Label>
              <Input
                id="planNumber"
                value={formData.planNumber}
                onChange={(e) => setFormData({ ...formData, planNumber: e.target.value })}
                placeholder="例: 2025-001"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="planDate">作成日 *</Label>
              <Input
                id="planDate"
                type="date"
                required
                value={formData.planDate}
                onChange={(e) => setFormData({ ...formData, planDate: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="initialPlanDate">初回作成日</Label>
              <Input
                id="initialPlanDate"
                type="date"
                value={formData.initialPlanDate}
                onChange={(e) => setFormData({ ...formData, initialPlanDate: e.target.value })}
              />
            </div>
          </div>

          {/* 認定情報 */}
          <div className="pt-4 border-t">
            <h3 className="font-semibold mb-3">認定情報</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="certificationDate">認定日</Label>
                <Input
                  id="certificationDate"
                  type="date"
                  value={formData.certificationDate}
                  onChange={(e) => setFormData({ ...formData, certificationDate: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="certificationPeriodStart">認定有効期間（開始）</Label>
                <Input
                  id="certificationPeriodStart"
                  type="date"
                  value={formData.certificationPeriodStart}
                  onChange={(e) => setFormData({ ...formData, certificationPeriodStart: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="certificationPeriodEnd">認定有効期間（終了）</Label>
                <Input
                  id="certificationPeriodEnd"
                  type="date"
                  value={formData.certificationPeriodEnd}
                  onChange={(e) => setFormData({ ...formData, certificationPeriodEnd: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* 居宅サービス計画作成情報 */}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t">
            <div>
              <Label htmlFor="creatorType">
                居宅サービス計画作成区分 <span className="text-red-500">*</span>
              </Label>
              <Select 
                value={formData.creatorType} 
                onValueChange={(value) => {
                  setFormData({ ...formData, creatorType: value })
                  // 作成区分が「2」のとき、事業所番号をクリア
                  if (value === '2') {
                    setFormData(prev => ({ ...prev, careManagerOfficeNumber: '' }))
                  }
                }}
              >
                <SelectTrigger id="creatorType">
                  <SelectValue placeholder="作成区分を選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">居宅介護支援事業所作成</SelectItem>
                  <SelectItem value="2">自己作成</SelectItem>
                  <SelectItem value="3">介護予防支援事業所・地域包括支援センター作成</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="careManagerOfficeNumber">
                居宅介護支援事業所番号
                {(formData.creatorType === '1' || formData.creatorType === '3') && (
                  <span className="text-red-500"> *</span>
                )}
              </Label>
              <Input
                id="careManagerOfficeNumber"
                value={formData.careManagerOfficeNumber}
                onChange={(e) => {
                  // 10桁の英数字のみ許可
                  const value = e.target.value.replace(/[^0-9A-Za-z]/g, '').slice(0, 10)
                  setFormData({ ...formData, careManagerOfficeNumber: value })
                }}
                placeholder="10桁の事業所番号"
                maxLength={10}
                disabled={formData.creatorType === '2'}  // 自己作成のときは無効化
                className={formData.creatorType === '2' ? 'bg-gray-100' : ''}
              />
              {formData.creatorType === '2' && (
                <p className="text-xs text-muted-foreground mt-1">
                  自己作成の場合は事業所番号は不要です
                </p>
              )}
              {(formData.creatorType === '1' || formData.creatorType === '3') && 
               !formData.careManagerOfficeNumber && (
                <p className="text-xs text-red-500 mt-1">
                  事業所番号は必須です
                </p>
              )}
            </div>
          </div>

          {/* 利用者・家族の意向 */}
          <div className="pt-4 border-t">
            <h3 className="font-semibold mb-3">利用者・家族の意向</h3>
            <div className="space-y-3">
              <div>
                <Label htmlFor="userIntention">利用者の生活に対する意向</Label>
                <Textarea
                  id="userIntention"
                  rows={2}
                  value={formData.userIntention}
                  onChange={(e) => setFormData({ ...formData, userIntention: e.target.value })}
                  placeholder="利用者の希望や意向を入力してください"
                />
              </div>
              <div>
                <Label htmlFor="familyIntention">家族の意向</Label>
                <Textarea
                  id="familyIntention"
                  rows={2}
                  value={formData.familyIntention}
                  onChange={(e) => setFormData({ ...formData, familyIntention: e.target.value })}
                  placeholder="家族の希望や意向を入力してください"
                />
              </div>
            </div>
          </div>

          {/* 援助方針 */}
          <div className="pt-4 border-t">
            <h3 className="font-semibold mb-3">総合的な援助の方針</h3>
            <Textarea
              id="comprehensivePolicy"
              rows={3}
              value={formData.comprehensivePolicy}
              onChange={(e) => setFormData({ ...formData, comprehensivePolicy: e.target.value })}
              placeholder="総合的な援助の方針を入力してください"
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
            <Label htmlFor="file">ケアプランPDFファイル</Label>
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
