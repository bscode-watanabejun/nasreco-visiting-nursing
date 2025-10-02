import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, CheckCircle, XCircle } from "lucide-react"
import type { Patient, PaginatedResult } from "@shared/schema"

interface VisitRecordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface FormData {
  patientId: string
  visitStatusRecord: "completed" | "cancelled" | "rescheduled"
  actualStartTime: string
  actualEndTime: string
  observations: string
  isSecondVisit: boolean
  bloodPressureSystolic: string
  bloodPressureDiastolic: string
  heartRate: string
  temperature: string
  respiratoryRate: string
  oxygenSaturation: string
  careProvided: string
  nextVisitNotes: string
}

const getInitialFormData = (): FormData => ({
  patientId: '',
  visitStatusRecord: 'completed',
  actualStartTime: new Date().toTimeString().slice(0, 5),
  actualEndTime: '',
  observations: '',
  isSecondVisit: false,
  bloodPressureSystolic: '',
  bloodPressureDiastolic: '',
  heartRate: '',
  temperature: '',
  respiratoryRate: '',
  oxygenSaturation: '',
  careProvided: '',
  nextVisitNotes: ''
})

export function VisitRecordDialog({ open, onOpenChange }: VisitRecordDialogProps) {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState("basic")
  const [formData, setFormData] = useState<FormData>(getInitialFormData())
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<string[]>([])

  // Fetch patients
  const { data: patientsData } = useQuery<PaginatedResult<Patient>>({
    queryKey: ["patients"],
    queryFn: async () => {
      const response = await fetch("/api/patients")
      if (!response.ok) throw new Error("患者データの取得に失敗しました")
      return response.json()
    },
  })

  // Fetch current user
  const { data: userData } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const response = await fetch("/api/auth/me")
      if (!response.ok) throw new Error("ユーザー情報の取得に失敗しました")
      return response.json()
    },
  })

  const patients = patientsData?.data || []
  const currentUser = userData?.user
  const selectedPatient = patients.find(p => p.id === formData.patientId)

  const validateForm = (): string[] => {
    const errors: string[] = []

    if (!formData.patientId) {
      errors.push('患者を選択してください')
    }
    if (!formData.actualStartTime) {
      errors.push('「実際の開始時間」を入力してください')
    }
    if (!formData.actualEndTime) {
      errors.push('「実際の終了時間」を入力してください')
    }
    if (!formData.observations.trim()) {
      errors.push('「観察事項」を入力してください')
    }

    // 特別管理加算の検証（該当項目がある場合）
    if (selectedPatient?.isCritical) {
      // 将来的な検証ロジック
    }

    return errors
  }

  const handleSave = async () => {
    setSaveError(null)
    setValidationErrors([])

    const errors = validateForm()
    if (errors.length > 0) {
      setValidationErrors(errors)
      return
    }

    setIsSaving(true)

    try {
      const currentDateTime = new Date()
      const today = currentDateTime.toISOString().split('T')[0]

      // 時間をISO文字列に変換
      const startDateTime = new Date(`${today}T${formData.actualStartTime}:00`)
      const endDateTime = new Date(`${today}T${formData.actualEndTime}:00`)

      const apiData = {
        patientId: formData.patientId,
        recordType: 'general_care' as const,
        recordDate: currentDateTime.toISOString(),
        status: 'completed' as const,
        title: `訪問記録 - ${today}`,
        content: `訪問日時: ${today}\n開始時間: ${formData.actualStartTime}\n終了時間: ${formData.actualEndTime}\n訪問ステータス: ${formData.visitStatusRecord}\n\n観察事項:\n${formData.observations}\n\n実施したケア:\n${formData.careProvided}\n\n次回訪問時の申し送り:\n${formData.nextVisitNotes}`,

        // 新規フィールド
        visitStatusRecord: formData.visitStatusRecord,
        actualStartTime: startDateTime.toISOString(),
        actualEndTime: endDateTime.toISOString(),
        isSecondVisit: formData.isSecondVisit,

        // 既存フィールド
        observations: formData.observations,
        interventions: formData.careProvided,
        patientFamilyResponse: formData.nextVisitNotes,

        // バイタルサイン
        ...(formData.bloodPressureSystolic && { bloodPressureSystolic: parseInt(formData.bloodPressureSystolic) }),
        ...(formData.bloodPressureDiastolic && { bloodPressureDiastolic: parseInt(formData.bloodPressureDiastolic) }),
        ...(formData.heartRate && { heartRate: parseInt(formData.heartRate) }),
        ...(formData.temperature && { temperature: formData.temperature }),
        ...(formData.respiratoryRate && { respiratoryRate: parseInt(formData.respiratoryRate) }),
        ...(formData.oxygenSaturation && { oxygenSaturation: parseInt(formData.oxygenSaturation) }),
      }

      const response = await fetch('/api/nursing-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiData),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown server error' }))
        throw new Error(error.error || `サーバーエラー (${response.status})`)
      }

      await queryClient.invalidateQueries({ queryKey: ["nursing-records"] })
      alert('訪問記録を保存しました')
      setFormData(getInitialFormData())
      onOpenChange(false)

    } catch (error) {
      console.error('Save error:', error)
      setSaveError(error instanceof Error ? error.message : '保存中にエラーが発生しました')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl sm:text-2xl">
            訪問記録の作成
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })} の訪問記録を作成します
          </p>
        </DialogHeader>

        {/* 基本情報セクション */}
        <div className="space-y-4 p-4 bg-gray-50 rounded-lg border">
          <h3 className="font-semibold text-base">基本情報</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 患者名 */}
            <div className="space-y-2">
              <Label htmlFor="patient">患者名</Label>
              <Select
                value={formData.patientId}
                onValueChange={(value) => setFormData(prev => ({ ...prev, patientId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="患者を選択してください" />
                </SelectTrigger>
                <SelectContent>
                  {patients.map((patient) => (
                    <SelectItem key={patient.id} value={patient.id}>
                      <div className="flex items-center gap-2">
                        <span>{patient.lastName} {patient.firstName}</span>
                        {patient.isCritical && (
                          <Badge className="ml-2 bg-yellow-100 text-yellow-800 text-xs">
                            重要
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 担当者 */}
            <div className="space-y-2">
              <Label>担当者</Label>
              <div className="flex items-center h-10 px-3 border rounded-md bg-gray-100">
                <span className="text-sm">{currentUser?.fullName || 'ログインユーザー'}</span>
              </div>
            </div>

            {/* 予定時間（モックアップ） */}
            <div className="space-y-2">
              <Label>予定時間</Label>
              <div className="flex items-center h-10 px-3 border rounded-md bg-gray-100">
                <span className="text-sm text-muted-foreground">10:30 - 11:15</span>
              </div>
            </div>

            {/* 訪問ステータス */}
            <div className="space-y-2">
              <Label htmlFor="visit-status">訪問ステータス</Label>
              <Select
                value={formData.visitStatusRecord}
                onValueChange={(value: "completed" | "cancelled" | "rescheduled") =>
                  setFormData(prev => ({ ...prev, visitStatusRecord: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="completed">完了</SelectItem>
                  <SelectItem value="cancelled">キャンセル</SelectItem>
                  <SelectItem value="rescheduled">日程変更</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 特別管理加算対象患者エリア */}
          {selectedPatient?.isCritical && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div>
                  <p className="font-medium text-sm text-yellow-900">特別管理加算対象患者</p>
                  <div className="text-xs text-yellow-800 mt-1">
                    <p>対象項目:</p>
                    <ul className="list-disc list-inside ml-2 mt-1">
                      <li>在宅悪性腫瘍法</li>
                      <li>点滴注射(週3日以上)</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* メッセージ表示エリア */}
          {validationErrors.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <div className="flex items-start gap-2">
                <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-sm text-red-900">未入力の必須項目があります</p>
                  <ul className="list-disc list-inside text-xs text-red-800 mt-1">
                    {validationErrors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* タブ */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5 h-auto">
            <TabsTrigger value="basic" className="text-xs sm:text-sm py-2">
              基本記録
              <span className="ml-1 text-red-500">●</span>
            </TabsTrigger>
            <TabsTrigger value="vitals" className="text-xs sm:text-sm py-2">
              バイタル
            </TabsTrigger>
            <TabsTrigger value="care" className="text-xs sm:text-sm py-2">
              ケア内容
            </TabsTrigger>
            <TabsTrigger value="special" className="text-xs sm:text-sm py-2">
              特管記録
              <span className="ml-1 text-red-500">●</span>
            </TabsTrigger>
            <TabsTrigger value="photos" className="text-xs sm:text-sm py-2">
              写真・メモ
            </TabsTrigger>
          </TabsList>

          {/* 基本記録タブ */}
          <TabsContent value="basic" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start-time">
                  実際の開始時間 <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="start-time"
                  type="time"
                  value={formData.actualStartTime}
                  onChange={(e) => setFormData(prev => ({ ...prev, actualStartTime: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="end-time">
                  実際の終了時間 <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="end-time"
                  type="time"
                  value={formData.actualEndTime}
                  onChange={(e) => setFormData(prev => ({ ...prev, actualEndTime: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="observations">
                観察事項 <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="observations"
                placeholder="患者の状態、変化、気づいた点などを記録してください"
                value={formData.observations}
                onChange={(e) => setFormData(prev => ({ ...prev, observations: e.target.value }))}
                className="min-h-[120px] resize-none"
              />
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="second-visit"
                checked={formData.isSecondVisit}
                onChange={(e) => setFormData(prev => ({ ...prev, isSecondVisit: e.target.checked }))}
                className="w-4 h-4"
              />
              <Label htmlFor="second-visit" className="cursor-pointer">
                本日2回目以降の訪問
              </Label>
            </div>
          </TabsContent>

          {/* バイタルタブ */}
          <TabsContent value="vitals" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bp">血圧 (mmHg)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="bp-systolic"
                    type="number"
                    placeholder="収縮期"
                    value={formData.bloodPressureSystolic}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      bloodPressureSystolic: e.target.value
                    }))}
                  />
                  <span className="text-muted-foreground">/</span>
                  <Input
                    id="bp-diastolic"
                    type="number"
                    placeholder="拡張期"
                    value={formData.bloodPressureDiastolic}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      bloodPressureDiastolic: e.target.value
                    }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="heart-rate">脈拍 (回/分)</Label>
                <Input
                  id="heart-rate"
                  type="number"
                  placeholder="例: 72"
                  value={formData.heartRate}
                  onChange={(e) => setFormData(prev => ({ ...prev, heartRate: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="temperature">体温 (°C)</Label>
                <Input
                  id="temperature"
                  type="number"
                  step="0.1"
                  placeholder="例: 36.5"
                  value={formData.temperature}
                  onChange={(e) => setFormData(prev => ({ ...prev, temperature: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="respiratory-rate">呼吸数 (回/分)</Label>
                <Input
                  id="respiratory-rate"
                  type="number"
                  placeholder="例: 18"
                  value={formData.respiratoryRate}
                  onChange={(e) => setFormData(prev => ({ ...prev, respiratoryRate: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="spo2">酸素飽和度 (%)</Label>
                <Input
                  id="spo2"
                  type="number"
                  placeholder="例: 98"
                  value={formData.oxygenSaturation}
                  onChange={(e) => setFormData(prev => ({ ...prev, oxygenSaturation: e.target.value }))}
                />
              </div>
            </div>
          </TabsContent>

          {/* ケア内容タブ */}
          <TabsContent value="care" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="care-provided">実施したケア内容</Label>
              <Textarea
                id="care-provided"
                placeholder="実施した看護ケア、処置、指導内容などを記録してください"
                value={formData.careProvided}
                onChange={(e) => setFormData(prev => ({ ...prev, careProvided: e.target.value }))}
                className="min-h-[120px] resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="next-visit-notes">次回訪問時の申し送り</Label>
              <Textarea
                id="next-visit-notes"
                placeholder="次回訪問時に注意すべき点、継続すべきケアなどを記録してください"
                value={formData.nextVisitNotes}
                onChange={(e) => setFormData(prev => ({ ...prev, nextVisitNotes: e.target.value }))}
                className="min-h-[120px] resize-none"
              />
            </div>
          </TabsContent>

          {/* 特管記録タブ（保留） */}
          <TabsContent value="special" className="mt-4">
            <div className="p-8 text-center text-muted-foreground border-2 border-dashed rounded-lg">
              <p className="text-sm">特別管理加算記録機能は準備中です</p>
            </div>
          </TabsContent>

          {/* 写真・メモタブ（保留） */}
          <TabsContent value="photos" className="mt-4">
            <div className="p-8 text-center text-muted-foreground border-2 border-dashed rounded-lg">
              <p className="text-sm">写真・メモ機能は準備中です</p>
            </div>
          </TabsContent>
        </Tabs>

        {/* エラー表示 */}
        {saveError && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex items-start gap-2">
              <XCircle className="h-5 w-5 text-red-400 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-medium text-red-800">エラー</h3>
                <p className="text-sm text-red-700 mt-1">{saveError}</p>
              </div>
            </div>
          </div>
        )}

        {/* アクションボタン */}
        <div className="flex flex-col sm:flex-row justify-end gap-2 pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
            className="w-full sm:w-auto"
          >
            キャンセル
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full sm:w-auto bg-orange-500 hover:bg-orange-600"
          >
            {isSaving ? '保存中...' : '記録を保存'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
