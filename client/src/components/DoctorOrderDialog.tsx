import { useState, useEffect, useRef } from "react"
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
  icd10Code: string // ICD-10コード（レセプトCSV出力用）
  orderContent: string
  weeklyVisitLimit: string
  notes: string
  file?: File | null
  instructionType: 'regular' | 'special' | 'psychiatric' | 'psychiatric_special' | 'medical_observation' | 'medical_observation_special' | ''
  insuranceType: 'medical' | 'care' | ''
  hasInfusionInstruction: 'yes' | 'no' | ''
  hasPressureUlcerTreatment: 'yes' | 'no' | ''
  hasHomeInfusionManagement: 'yes' | 'no' | ''
  diseasePresenceCode: '01' | '02' | '03' // 基準告示第2の1に規定する疾病等の有無コード（別表13）
}

const getInitialFormData = (order?: DoctorOrder | null): FormData => ({
  medicalInstitutionId: order?.medicalInstitutionId || '',
  orderDate: order?.orderDate || new Date().toISOString().split('T')[0],
  startDate: order?.startDate || new Date().toISOString().split('T')[0],
  endDate: order?.endDate || '',
  diagnosis: order?.diagnosis || '',
  icd10Code: order?.icd10Code || '',
  orderContent: order?.orderContent || '',
  weeklyVisitLimit: order?.weeklyVisitLimit?.toString() || '',
  notes: order?.notes || '',
  instructionType: order?.instructionType || 'regular',
  insuranceType: order?.insuranceType || '',
  hasInfusionInstruction: order?.hasInfusionInstruction ? 'yes' : order?.hasInfusionInstruction === false ? 'no' : '',
  hasPressureUlcerTreatment: order?.hasPressureUlcerTreatment ? 'yes' : order?.hasPressureUlcerTreatment === false ? 'no' : '',
  hasHomeInfusionManagement: order?.hasHomeInfusionManagement ? 'yes' : order?.hasHomeInfusionManagement === false ? 'no' : '',
  diseasePresenceCode: (order?.diseasePresenceCode as '01' | '02' | '03') || '03', // デフォルト値は'03'（無）
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

  // 前回のorderオブジェクトのJSON文字列を追跡（変更検知用）
  const previousOrderJsonRef = useRef<string | null>(null)

  // Reset form when dialog opens or order changes
  useEffect(() => {
    if (open) {
      // orderオブジェクトのJSON文字列を取得（変更検知用）
      const currentOrderJson = order ? JSON.stringify(order) : null
      const orderDataChanged = previousOrderJsonRef.current !== currentOrderJson
      
      // ダイアログが開かれたとき、またはorderが変更されたときにフォームをリセット
      if (orderDataChanged || previousOrderJsonRef.current === null) {
        setFormData(getInitialFormData(order))
        previousOrderJsonRef.current = currentOrderJson
      }
    } else {
      // ダイアログが閉じられたときにリセット
      previousOrderJsonRef.current = null
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
      const url = order ? `/api/doctor-orders/${order.id}` : "/api/doctor-orders"
      const method = order ? "PUT" : "POST"

      let response: Response

      // If file is attached, use FormData for multipart upload
      if (formData.file) {
        const multipartData = new FormData()
        multipartData.append('patientId', patientId)
        multipartData.append('medicalInstitutionId', formData.medicalInstitutionId)
        multipartData.append('orderDate', formData.orderDate)
        multipartData.append('startDate', formData.startDate)
        multipartData.append('endDate', formData.endDate)
        multipartData.append('diagnosis', formData.diagnosis)
        if (formData.icd10Code) {
          multipartData.append('icd10Code', formData.icd10Code)
        }
        multipartData.append('orderContent', formData.orderContent)
        if (formData.weeklyVisitLimit) {
          multipartData.append('weeklyVisitLimit', formData.weeklyVisitLimit)
        }
        if (formData.notes) {
          multipartData.append('notes', formData.notes)
        }
        if (formData.instructionType) {
          multipartData.append('instructionType', formData.instructionType)
        }
        if (formData.insuranceType) {
          multipartData.append('insuranceType', formData.insuranceType)
        }
        // 指示期間を訪問看護指示期間としても送信（レセプトCSV出力用）
        multipartData.append('nursingInstructionStartDate', formData.startDate)
        if (formData.endDate) {
          multipartData.append('nursingInstructionEndDate', formData.endDate)
        }
        if (formData.hasInfusionInstruction) {
          multipartData.append('hasInfusionInstruction', formData.hasInfusionInstruction === 'yes' ? 'true' : 'false')
        }
        if (formData.hasPressureUlcerTreatment) {
          multipartData.append('hasPressureUlcerTreatment', formData.hasPressureUlcerTreatment === 'yes' ? 'true' : 'false')
        }
        if (formData.hasHomeInfusionManagement) {
          multipartData.append('hasHomeInfusionManagement', formData.hasHomeInfusionManagement === 'yes' ? 'true' : 'false')
        }
        if (formData.diseasePresenceCode) {
          multipartData.append('diseasePresenceCode', formData.diseasePresenceCode)
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
          medicalInstitutionId: formData.medicalInstitutionId,
          orderDate: formData.orderDate,
          startDate: formData.startDate,
          endDate: formData.endDate,
          diagnosis: formData.diagnosis,
          ...(formData.icd10Code && { icd10Code: formData.icd10Code }),
          orderContent: formData.orderContent,
          ...(formData.weeklyVisitLimit && { weeklyVisitLimit: parseInt(formData.weeklyVisitLimit) }),
          ...(formData.notes && { notes: formData.notes }),
          ...(formData.instructionType && { instructionType: formData.instructionType }),
          ...(formData.insuranceType && { insuranceType: formData.insuranceType }),
          // 指示期間を訪問看護指示期間としても送信（レセプトCSV出力用）
          nursingInstructionStartDate: formData.startDate,
          nursingInstructionEndDate: formData.endDate,
          ...(formData.hasInfusionInstruction && { hasInfusionInstruction: formData.hasInfusionInstruction === 'yes' }),
          ...(formData.hasPressureUlcerTreatment && { hasPressureUlcerTreatment: formData.hasPressureUlcerTreatment === 'yes' }),
          ...(formData.hasHomeInfusionManagement && { hasHomeInfusionManagement: formData.hasHomeInfusionManagement === 'yes' }),
          ...(formData.diseasePresenceCode && { diseasePresenceCode: formData.diseasePresenceCode }),
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

      await queryClient.invalidateQueries({ queryKey: ["doctor-orders"] })
      await queryClient.invalidateQueries({ queryKey: ["/api/doctor-orders/expiring"] })
      // レセプト詳細のクエリも無効化・再取得（パターンマッチ）
      await queryClient.invalidateQueries({ queryKey: ["/api/monthly-receipts"], exact: false })
      await queryClient.refetchQueries({ queryKey: ["/api/monthly-receipts"], exact: false })

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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            <div className="space-y-2">
              <Label htmlFor="orderDate" className="text-sm">指示日</Label>
              <Input
                id="orderDate"
                type="date"
                value={formData.orderDate}
                onChange={(e) => setFormData(prev => ({ ...prev, orderDate: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="startDate" className="text-sm">指示期間開始日</Label>
              <Input
                id="startDate"
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate" className="text-sm">
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

          {/* ICD-10 Code */}
          <div className="space-y-2">
            <Label htmlFor="icd10Code">ICD-10コード</Label>
            <Input
              id="icd10Code"
              value={formData.icd10Code}
              onChange={(e) => setFormData(prev => ({ ...prev, icd10Code: e.target.value }))}
              placeholder="例: I639 (7桁以内)"
              maxLength={7}
            />
            <p className="text-xs text-muted-foreground">
              レセプトCSV出力に必要です（任意）
            </p>
          </div>

          {/* Insurance Type */}
          <div className="space-y-2">
            <Label htmlFor="insuranceType">保険種別</Label>
            <Select
              value={formData.insuranceType}
              onValueChange={(value: 'medical' | 'care') =>
                setFormData(prev => ({ ...prev, insuranceType: value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="保険種別を選択してください" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="medical">医療保険</SelectItem>
                <SelectItem value="care">介護保険</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              レセプト請求先の判定に使用されます
            </p>
          </div>

          {/* Instruction Type */}
          <div className="space-y-2">
            <Label htmlFor="instructionType">指示区分</Label>
            <Select
              value={formData.instructionType}
              onValueChange={(value: 'regular' | 'special' | 'psychiatric' | 'psychiatric_special' | 'medical_observation' | 'medical_observation_special') =>
                setFormData(prev => ({ ...prev, instructionType: value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="指示区分を選択してください" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="regular">訪問看護指示（通常）</SelectItem>
                <SelectItem value="special">特別訪問看護指示</SelectItem>
                <SelectItem value="psychiatric">精神科訪問看護指示</SelectItem>
                <SelectItem value="psychiatric_special">精神科特別訪問看護指示</SelectItem>
                <SelectItem value="medical_observation">医療観察精神科訪問看護指示</SelectItem>
                <SelectItem value="medical_observation_special">医療観察精神科特別訪問看護指示</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              レセプトCSV出力時の指示区分コードの判定に使用されます
            </p>
          </div>

          {/* Infusion Instruction */}
          <div className="space-y-2">
            <Label htmlFor="hasInfusionInstruction">点滴注射指示</Label>
            <Select
              value={formData.hasInfusionInstruction}
              onValueChange={(value: 'yes' | 'no') =>
                setFormData(prev => ({ ...prev, hasInfusionInstruction: value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="点滴注射指示の有無を選択してください" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">はい</SelectItem>
                <SelectItem value="no">いいえ</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              在宅患者訪問点滴注射管理指導料の算定判定に使用されます
            </p>
          </div>

          {/* Pressure Ulcer Treatment */}
          <div className="space-y-2">
            <Label htmlFor="hasPressureUlcerTreatment">床ずれ処置</Label>
            <Select
              value={formData.hasPressureUlcerTreatment}
              onValueChange={(value: 'yes' | 'no') =>
                setFormData(prev => ({ ...prev, hasPressureUlcerTreatment: value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="床ずれ処置の有無を選択してください" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">はい</SelectItem>
                <SelectItem value="no">いいえ</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              褥瘡処置加算の算定判定に使用されます
            </p>
          </div>

          {/* Home Infusion Management */}
          <div className="space-y-2">
            <Label htmlFor="hasHomeInfusionManagement">在宅患者訪問点滴注射管理指導料</Label>
            <Select
              value={formData.hasHomeInfusionManagement}
              onValueChange={(value: 'yes' | 'no') =>
                setFormData(prev => ({ ...prev, hasHomeInfusionManagement: value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="在宅患者訪問点滴注射管理指導料の有無を選択してください" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">はい</SelectItem>
                <SelectItem value="no">いいえ</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              該当する加算の算定判定に使用されます
            </p>
          </div>

          {/* Disease Presence Code */}
          <div className="space-y-2">
            <Label htmlFor="diseasePresenceCode">基準告示第2の1に規定する疾病等の有無</Label>
            <Select
              value={formData.diseasePresenceCode}
              onValueChange={(value: '01' | '02' | '03') =>
                setFormData(prev => ({ ...prev, diseasePresenceCode: value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="選択してください" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="01">別表7</SelectItem>
                <SelectItem value="02">別表8</SelectItem>
                <SelectItem value="03">無</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              レセプトCSV出力のJSレコードに必須出力されます（未選択時は「無」を出力）
            </p>
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

          {/* File Upload */}
          <div className="space-y-2">
            <Label htmlFor="file">指示書PDFファイル</Label>
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
            {order?.filePath && !formData.file && (
              <p className="text-xs text-green-600">
                既存ファイル: {order.originalFileName || order.filePath.split('/').pop()}
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
              {isSaving ? '保存中...' : (order ? '更新' : '登録')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
