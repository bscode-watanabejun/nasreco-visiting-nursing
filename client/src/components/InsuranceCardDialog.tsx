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
import type { InsuranceCard, Patient } from "@shared/schema"

interface InsuranceCardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  patientId?: string
  card?: InsuranceCard | null
}

interface FormData {
  patientId: string
  cardType: 'medical' | 'long_term_care' | ''
  insurerNumber: string
  insuredNumber: string
  insuredSymbol: string
  insuredCardNumber: string
  copaymentRate: '10' | '20' | '30' | ''
  validFrom: string
  validUntil: string
  certificationDate: string
  notes: string
  file?: File | null
}

const getInitialFormData = (card?: InsuranceCard | null, initialPatientId?: string): FormData => ({
  patientId: card?.patientId || initialPatientId || '',
  cardType: card?.cardType || '',
  insurerNumber: card?.insurerNumber || '',
  insuredNumber: card?.insuredNumber || '',
  insuredSymbol: card?.insuredSymbol || '',
  insuredCardNumber: card?.insuredCardNumber || '',
  copaymentRate: card?.copaymentRate || '',
  validFrom: card?.validFrom || new Date().toISOString().split('T')[0],
  validUntil: card?.validUntil || '',
  certificationDate: card?.certificationDate || '',
  notes: card?.notes || '',
})

export function InsuranceCardDialog({ open, onOpenChange, patientId, card }: InsuranceCardDialogProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [formData, setFormData] = useState<FormData>(getInitialFormData(card, patientId))
  const [isSaving, setIsSaving] = useState(false)

  // Fetch patients for dropdown
  const { data: patientsData } = useQuery<{ data: Patient[] } | Patient[]>({
    queryKey: ["/api/patients"],
  })

  // Handle both array and paginated response formats
  const patients: Patient[] = Array.isArray(patientsData)
    ? patientsData
    : ((patientsData as { data: Patient[] })?.data || [])

  // Reset form when dialog opens or card changes
  useEffect(() => {
    if (open) {
      setFormData(getInitialFormData(card, patientId))
    }
  }, [open, card, patientId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
    if (!formData.patientId) {
      toast({
        title: "エラー",
        description: "利用者を選択してください",
        variant: "destructive"
      })
      return
    }
    if (!formData.cardType) {
      toast({
        title: "エラー",
        description: "保険証種別を選択してください",
        variant: "destructive"
      })
      return
    }
    if (!formData.insurerNumber) {
      toast({
        title: "エラー",
        description: "保険者番号を入力してください",
        variant: "destructive"
      })
      return
    }
    if (!formData.insuredNumber) {
      toast({
        title: "エラー",
        description: "被保険者番号を入力してください",
        variant: "destructive"
      })
      return
    }
    if (!formData.validFrom) {
      toast({
        title: "エラー",
        description: "有効期間開始日を入力してください",
        variant: "destructive"
      })
      return
    }

    setIsSaving(true)

    try {
      const url = card ? `/api/insurance-cards/${card.id}` : "/api/insurance-cards"
      const method = card ? "PUT" : "POST"

      let response: Response

      // If file is attached, use FormData for multipart upload
      if (formData.file) {
        const multipartData = new FormData()
        multipartData.append('patientId', formData.patientId)
        multipartData.append('cardType', formData.cardType)
        multipartData.append('insurerNumber', formData.insurerNumber)
        multipartData.append('insuredNumber', formData.insuredNumber)
        multipartData.append('validFrom', formData.validFrom)
        if (formData.insuredSymbol) multipartData.append('insuredSymbol', formData.insuredSymbol)
        if (formData.insuredCardNumber) multipartData.append('insuredCardNumber', formData.insuredCardNumber)
        if (formData.copaymentRate) multipartData.append('copaymentRate', formData.copaymentRate)
        if (formData.validUntil) multipartData.append('validUntil', formData.validUntil)
        if (formData.certificationDate) multipartData.append('certificationDate', formData.certificationDate)
        if (formData.notes) multipartData.append('notes', formData.notes)
        multipartData.append('file', formData.file)

        response = await fetch(url, {
          method,
          body: multipartData,
        })
      } else {
        // No file, send JSON
        const apiData: any = {
          patientId: formData.patientId,
          cardType: formData.cardType,
          insurerNumber: formData.insurerNumber,
          insuredNumber: formData.insuredNumber,
          validFrom: formData.validFrom,
          ...(formData.insuredSymbol && { insuredSymbol: formData.insuredSymbol }),
          ...(formData.insuredCardNumber && { insuredCardNumber: formData.insuredCardNumber }),
          ...(formData.copaymentRate && { copaymentRate: formData.copaymentRate }),
          ...(formData.validUntil && { validUntil: formData.validUntil }),
          ...(formData.certificationDate && { certificationDate: formData.certificationDate }),
          ...(formData.notes && { notes: formData.notes }),
        }

        response = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(apiData),
        })
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown server error' }))
        throw new Error(error.error || `サーバーエラー (${response.status})`)
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/insurance-cards"] })

      toast({
        title: "保存完了",
        description: card ? "保険証情報を更新しました" : "保険証情報を登録しました",
      })

      onOpenChange(false)
    } catch (error) {
      console.error('Save insurance card error:', error)
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
            {card ? '保険証情報の編集' : '保険証情報の登録'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Patient Selection or Display */}
          {patientId ? (
            // 利用者が指定されている場合（編集時 or 利用者詳細画面からの新規登録）
            <div className="space-y-2">
              <Label>利用者</Label>
              <div className="text-sm font-medium px-3 py-2 bg-muted rounded-md">
                {(() => {
                  const patient = patients.find(p => p.id === formData.patientId)
                  return patient ? `${patient.lastName} ${patient.firstName}` : '不明'
                })()}
              </div>
            </div>
          ) : (
            // 利用者が指定されていない場合（保険証管理画面からの新規登録）
            <div className="space-y-2">
              <Label htmlFor="patientId">
                利用者 <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.patientId}
                onValueChange={(value) => setFormData(prev => ({ ...prev, patientId: value }))}
                required
              >
                <SelectTrigger id="patientId">
                  <SelectValue placeholder="利用者を選択してください" />
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
          )}

          {/* Card Type */}
          <div className="space-y-2">
            <Label htmlFor="cardType">
              保険証種別 <span className="text-red-500">*</span>
            </Label>
            <Select
              value={formData.cardType}
              onValueChange={(value: 'medical' | 'long_term_care') =>
                setFormData(prev => ({ ...prev, cardType: value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="保険証種別を選択してください" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="medical">医療保険証</SelectItem>
                <SelectItem value="long_term_care">介護保険証</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Insurer Number */}
          <div className="space-y-2">
            <Label htmlFor="insurerNumber">
              保険者番号 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="insurerNumber"
              value={formData.insurerNumber}
              onChange={(e) => setFormData(prev => ({ ...prev, insurerNumber: e.target.value }))}
              placeholder="例: 12345678"
              required
            />
          </div>

          {/* Insured Number */}
          <div className="space-y-2">
            <Label htmlFor="insuredNumber">
              被保険者番号 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="insuredNumber"
              value={formData.insuredNumber}
              onChange={(e) => setFormData(prev => ({ ...prev, insuredNumber: e.target.value }))}
              placeholder="例: 9876543210"
              required
            />
          </div>

          {/* Medical Insurance Only Fields */}
          {formData.cardType === 'medical' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="insuredSymbol">記号（医療保険のみ）</Label>
                <Input
                  id="insuredSymbol"
                  value={formData.insuredSymbol}
                  onChange={(e) => setFormData(prev => ({ ...prev, insuredSymbol: e.target.value }))}
                  placeholder="例: 01234"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="insuredCardNumber">番号（医療保険のみ）</Label>
                <Input
                  id="insuredCardNumber"
                  value={formData.insuredCardNumber}
                  onChange={(e) => setFormData(prev => ({ ...prev, insuredCardNumber: e.target.value }))}
                  placeholder="例: 56789"
                />
              </div>
            </div>
          )}

          {/* Copayment Rate */}
          <div className="space-y-2">
            <Label htmlFor="copaymentRate">負担割合</Label>
            <Select
              value={formData.copaymentRate}
              onValueChange={(value: '10' | '20' | '30') =>
                setFormData(prev => ({ ...prev, copaymentRate: value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="負担割合を選択してください" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">1割負担</SelectItem>
                <SelectItem value="20">2割負担</SelectItem>
                <SelectItem value="30">3割負担</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Valid Period */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="validFrom">
                有効期間開始日 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="validFrom"
                type="date"
                value={formData.validFrom}
                onChange={(e) => setFormData(prev => ({ ...prev, validFrom: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="validUntil">有効期限</Label>
              <Input
                id="validUntil"
                type="date"
                value={formData.validUntil}
                onChange={(e) => setFormData(prev => ({ ...prev, validUntil: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                空欄の場合は無期限として扱われます
              </p>
            </div>
          </div>

          {/* Certification Date (Long-term care only) */}
          {formData.cardType === 'long_term_care' && (
            <div className="space-y-2">
              <Label htmlFor="certificationDate">認定日（介護保険のみ）</Label>
              <Input
                id="certificationDate"
                type="date"
                value={formData.certificationDate}
                onChange={(e) => setFormData(prev => ({ ...prev, certificationDate: e.target.value }))}
              />
            </div>
          )}

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

          {/* File Upload */}
          <div className="space-y-2">
            <Label htmlFor="file">保険証PDFファイル</Label>
            <Input
              id="file"
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => {
                const file = e.target.files?.[0] || null
                setFormData(prev => ({ ...prev, file }))
              }}
            />
            {formData.file && (
              <p className="text-xs text-muted-foreground">
                選択中: {formData.file.name} ({(formData.file.size / 1024).toFixed(1)} KB)
              </p>
            )}
            {card?.filePath && !formData.file && (
              <p className="text-xs text-green-600">
                既存ファイル: {card.originalFileName || card.filePath.split('/').pop()}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              PDF形式または画像ファイル（JPEG、PNG）をアップロードできます
            </p>
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
              {isSaving ? '保存中...' : (card ? '更新' : '登録')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
