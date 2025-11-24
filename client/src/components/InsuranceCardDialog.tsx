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
  relationshipType: 'self' | 'preschool' | 'family' | 'elderly_general' | 'elderly_70' | ''
  ageCategory: 'preschool' | 'general' | 'elderly' | ''
  elderlyRecipientCategory: 'general_low' | 'seventy' | ''
  reviewOrganizationCode: '1' | '2' | ''
  partialBurdenCategory: '1' | '3' | undefined
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
  relationshipType: card?.relationshipType || '',
  ageCategory: card?.ageCategory || '',
  elderlyRecipientCategory: card?.elderlyRecipientCategory || '',
  reviewOrganizationCode: (card?.reviewOrganizationCode as '1' | '2') || '',
  partialBurdenCategory: (card?.partialBurdenCategory === '1' || card?.partialBurdenCategory === '3') 
    ? card.partialBurdenCategory 
    : undefined,
})

// 年齢区分を計算する関数
const calculateAgeCategory = (birthDate: string | null): 'preschool' | 'general' | 'elderly' | '' => {
  if (!birthDate) return ''
  const today = new Date()
  const birth = new Date(birthDate)
  const age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  const dayDiff = today.getDate() - birth.getDate()
  const adjustedAge = monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? age - 1 : age

  if (adjustedAge < 6) return 'preschool'
  if (adjustedAge >= 75) return 'elderly'
  return 'general'
}

// 保険者番号から審査支払機関コードを判定する関数
const determineReviewOrganizationCode = (insurerNumber: string): '1' | '2' | '' => {
  if (!insurerNumber) return ''

  const length = insurerNumber.trim().length
  const prefix = insurerNumber.substring(0, 2)

  // 6桁 → 国保連 ('2')
  if (length === 6) {
    return '2'
  }

  // 8桁の場合
  if (length === 8) {
    // 後期高齢者医療（39で始まる） → 国保連 ('2')
    if (prefix === '39') {
      return '2'
    }
    // その他の8桁 → 社保 ('1')
    return '1'
  }

  // 判定不能
  return ''
}

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

  // 選択された患者の情報を取得
  const selectedPatient = patients.find(p => p.id === formData.patientId)

  // 患者の年齢を計算
  const patientAge = selectedPatient?.dateOfBirth
    ? (() => {
        const today = new Date()
        const birth = new Date(selectedPatient.dateOfBirth)
        const age = today.getFullYear() - birth.getFullYear()
        const monthDiff = today.getMonth() - birth.getMonth()
        const dayDiff = today.getDate() - birth.getDate()
        return monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? age - 1 : age
      })()
    : null

  // Reset form when dialog opens or card changes
  useEffect(() => {
    if (open) {
      const initialData = getInitialFormData(card, patientId)
      setFormData(initialData)
    }
  }, [open, card, patientId])

  // 患者が選択されていて、患者情報が読み込まれたら年齢区分を自動計算
  useEffect(() => {
    // patientsが読み込まれていて、患者が選択されている場合
    if (patients.length > 0 && formData.patientId && selectedPatient?.dateOfBirth) {
      const ageCategory = calculateAgeCategory(selectedPatient.dateOfBirth)
      setFormData(prev => {
        // 既に同じ年齢区分が設定されている場合は更新しない（無限ループ防止）
        if (prev.ageCategory === ageCategory) {
          return prev
        }
        return { ...prev, ageCategory }
      })
    }
  }, [formData.patientId, selectedPatient?.dateOfBirth, patients.length])

  // 保険者番号が変更されたら審査支払機関コードを自動判定
  useEffect(() => {
    if (formData.insurerNumber) {
      const reviewOrganizationCode = determineReviewOrganizationCode(formData.insurerNumber)
      if (reviewOrganizationCode) {
        setFormData(prev => ({ ...prev, reviewOrganizationCode }))
      }
    }
  }, [formData.insurerNumber])

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
        if (formData.relationshipType) multipartData.append('relationshipType', formData.relationshipType)
        // 年齢区分は自動計算で設定されるため、患者が選択されている場合は必ず送信
        const ageCategoryToSend = selectedPatient?.dateOfBirth 
          ? calculateAgeCategory(selectedPatient.dateOfBirth) 
          : formData.ageCategory || null;
        if (ageCategoryToSend) multipartData.append('ageCategory', ageCategoryToSend)
        if (formData.elderlyRecipientCategory) multipartData.append('elderlyRecipientCategory', formData.elderlyRecipientCategory)
        if (formData.reviewOrganizationCode) multipartData.append('reviewOrganizationCode', formData.reviewOrganizationCode)
        // 一部負担金区分は表示されている場合のみ送信（該当なしの場合はnullを送信）
        if (formData.cardType === 'medical' && formData.elderlyRecipientCategory === 'general_low') {
          multipartData.append('partialBurdenCategory', formData.partialBurdenCategory || '')
        }
        multipartData.append('file', formData.file)

        response = await fetch(url, {
          method,
          body: multipartData,
        })
      } else {
        // No file, send JSON
        // 年齢区分は自動計算で設定されるため、患者が選択されている場合は必ず送信
        const ageCategoryToSend = selectedPatient?.dateOfBirth 
          ? calculateAgeCategory(selectedPatient.dateOfBirth) 
          : formData.ageCategory || null;
        
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
          ...(formData.relationshipType && { relationshipType: formData.relationshipType }),
          // 年齢区分は自動計算で設定されるため、値がある場合は必ず送信
          ...(ageCategoryToSend && { ageCategory: ageCategoryToSend }),
          ...(formData.elderlyRecipientCategory && { elderlyRecipientCategory: formData.elderlyRecipientCategory }),
          ...(formData.reviewOrganizationCode && { reviewOrganizationCode: formData.reviewOrganizationCode }),
          // 一部負担金区分は表示されている場合のみ送信（該当なしの場合はnullを送信）
          ...(formData.cardType === 'medical' && formData.elderlyRecipientCategory === 'general_low' && {
            partialBurdenCategory: formData.partialBurdenCategory || null
          }),
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

          {/* Review Organization Code (医療保険のみ) */}
          {formData.cardType === 'medical' && (
            <div className="space-y-2">
              <Label htmlFor="reviewOrganizationCode">審査支払機関（自動判定）</Label>
              <Select
                value={formData.reviewOrganizationCode}
                onValueChange={(value: '1' | '2') =>
                  setFormData(prev => ({ ...prev, reviewOrganizationCode: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="保険者番号から自動判定されます" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">社会保険診療報酬支払基金</SelectItem>
                  <SelectItem value="2">国民健康保険団体連合会</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                保険者番号から自動判定されます（6桁→国保連、8桁の'39'始まり→国保連、8桁その他→社保）
              </p>
            </div>
          )}

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

          {/* Relationship Type (医療保険のみ) */}
          {formData.cardType === 'medical' && (
            <div className="space-y-2">
              <Label htmlFor="relationshipType">本人家族区分（医療保険のみ）</Label>
              <Select
                value={formData.relationshipType}
                onValueChange={(value: 'self' | 'preschool' | 'family' | 'elderly_general' | 'elderly_70') =>
                  setFormData(prev => ({ ...prev, relationshipType: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="本人家族区分を選択してください" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="self">本人</SelectItem>
                  <SelectItem value="preschool">未就学者</SelectItem>
                  <SelectItem value="family">家族</SelectItem>
                  <SelectItem value="elderly_general">高齢受給者一般・低所得者</SelectItem>
                  <SelectItem value="elderly_70">高齢受給者7割</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                レセプト種別コードの判定に使用されます
              </p>
            </div>
          )}

          {/* Age Category (自動計算、表示のみ) */}
          {selectedPatient && (
            <div className="space-y-2">
              <Label htmlFor="ageCategory">年齢区分（自動計算）</Label>
              <div className="flex items-center gap-2">
                <div className="flex-1 text-sm font-medium px-3 py-2 bg-muted rounded-md">
                  {formData.ageCategory === 'preschool' && '未就学者（6歳未満）'}
                  {formData.ageCategory === 'general' && '一般'}
                  {formData.ageCategory === 'elderly' && '高齢者（75歳以上）'}
                  {!formData.ageCategory && '未設定'}
                </div>
                {patientAge !== null && (
                  <span className="text-sm text-muted-foreground">
                    （現在{patientAge}歳）
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                患者の生年月日から自動的に計算されます
              </p>
            </div>
          )}

          {/* Elderly Recipient Category (70-74歳の場合のみ、医療保険のみ) */}
          {formData.cardType === 'medical' && patientAge !== null && patientAge >= 70 && patientAge < 75 && (
            <div className="space-y-2">
              <Label htmlFor="elderlyRecipientCategory">
                高齢受給者区分（70-74歳の場合）<span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.elderlyRecipientCategory}
                onValueChange={(value: 'general_low' | 'seventy') =>
                  setFormData(prev => ({ ...prev, elderlyRecipientCategory: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="高齢受給者区分を選択してください" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general_low">一般・低所得者（2割負担）</SelectItem>
                  <SelectItem value="seventy">7割負担（現役並み所得者）</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                70-74歳の高齢受給者の負担区分を選択してください
              </p>
            </div>
          )}

          {/* Partial Burden Category (70歳以上、低所得者の場合のみ、医療保険のみ) */}
          {formData.cardType === 'medical' && patientAge !== null && patientAge >= 70 && formData.elderlyRecipientCategory === 'general_low' && (
            <div className="space-y-2">
              <Label htmlFor="partialBurdenCategory">
                一部負担金区分
              </Label>
              <Select
                value={formData.partialBurdenCategory || 'none'}
                onValueChange={(value: '1' | '3' | 'none') =>
                  setFormData(prev => ({ ...prev, partialBurdenCategory: value === 'none' ? undefined : value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="該当なし" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">該当なし</SelectItem>
                  <SelectItem value="1">適用区分II（コード1）</SelectItem>
                  <SelectItem value="3">適用区分I（コード3）</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                70歳以上の低所得者で、特定医療費受給者証・特定疾患医療受給者証・限度額適用・標準負担額減額認定証が提示された場合のみ記録します
              </p>
            </div>
          )}

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
