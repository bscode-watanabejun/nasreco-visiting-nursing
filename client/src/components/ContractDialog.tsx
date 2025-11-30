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
import type { Contract } from "@shared/schema"

type ContractWithWitness = Contract & {
  witnessedBy?: string | { id: string; fullName: string } | null;
}

interface ContractDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  patientId: string
  contract?: ContractWithWitness | null
}

interface FormData {
  contractType: "service_agreement" | "important_matters" | "personal_info_consent" | "medical_consent" | "other"
  contractDate: string
  startDate: string
  endDate: string
  title: string
  description: string
  signedBy: string
  witnessedBy: string
  file?: File | null
}

const getInitialFormData = (contract?: ContractWithWitness | null): FormData => ({
  contractType: contract?.contractType || "service_agreement",
  contractDate: contract?.contractDate || new Date().toISOString().split('T')[0],
  startDate: contract?.startDate || new Date().toISOString().split('T')[0],
  endDate: contract?.endDate || "",
  title: contract?.title || "",
  description: contract?.description || "",
  signedBy: contract?.signedBy || "",
  witnessedBy: "",
})

export function ContractDialog({ open, onOpenChange, patientId, contract }: ContractDialogProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [formData, setFormData] = useState<FormData>(getInitialFormData(contract))
  const [selectedWitnessId, setSelectedWitnessId] = useState<string>("none")
  const [isSaving, setIsSaving] = useState(false)

  // Fetch users for witness selection
  const { data: usersResponse } = useQuery<{ data: any[]; total: number }>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const response = await fetch("/api/users?limit=100")
      if (!response.ok) throw new Error("スタッフの取得に失敗しました")
      return response.json()
    },
    enabled: open,
  })

  const users = usersResponse?.data || []

  // Reset form when dialog opens or contract changes
  useEffect(() => {
    if (open) {
      const initialData = getInitialFormData(contract)
      setFormData(initialData)
      // witnessedBy can be a string (ID) or an object with id property (from relation)
      // Handle both cases safely
      let witnessedById: string | null = null
      if (contract?.witnessedBy) {
        if (typeof contract.witnessedBy === 'string') {
          witnessedById = contract.witnessedBy.trim() !== '' ? contract.witnessedBy : null
        } else if (typeof contract.witnessedBy === 'object' && contract.witnessedBy !== null) {
          const witnessObj = contract.witnessedBy as { id: string; fullName?: string }
          if ('id' in witnessObj && typeof witnessObj.id === 'string') {
            witnessedById = witnessObj.id
          }
        }
      }
      setSelectedWitnessId(witnessedById || "none")
    }
  }, [open, contract])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
    if (!formData.contractDate) {
      toast({
        title: "エラー",
        description: "契約日を入力してください",
        variant: "destructive"
      })
      return
    }
    if (!formData.startDate) {
      toast({
        title: "エラー",
        description: "有効開始日を入力してください",
        variant: "destructive"
      })
      return
    }
    if (!formData.title) {
      toast({
        title: "エラー",
        description: "タイトルを入力してください",
        variant: "destructive"
      })
      return
    }

    setIsSaving(true)

    try {
      const url = contract ? `/api/contracts/${contract.id}` : "/api/contracts"
      const method = contract ? "PUT" : "POST"

      const formDataToSend = new FormData()
      formDataToSend.append('patientId', patientId)
      formDataToSend.append('contractType', formData.contractType)
      formDataToSend.append('contractDate', formData.contractDate)
      formDataToSend.append('startDate', formData.startDate)
      if (formData.endDate) formDataToSend.append('endDate', formData.endDate)
      formDataToSend.append('title', formData.title)
      if (formData.description) formDataToSend.append('description', formData.description)
      if (formData.signedBy) formDataToSend.append('signedBy', formData.signedBy)
      // Always include witnessedBy: send the ID if selected, or empty string to clear it
      if (selectedWitnessId !== "none") {
        formDataToSend.append('witnessedBy', selectedWitnessId)
      } else if (contract) {
        // When editing and clearing witnessedBy, send empty string to set it to null
        formDataToSend.append('witnessedBy', '')
      }
      if (formData.file) formDataToSend.append('file', formData.file)

      const response = await fetch(url, {
        method,
        body: formDataToSend,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || '保存に失敗しました')
      }

      toast({
        title: contract ? "更新完了" : "作成完了",
        description: contract ? "契約書・同意書を更新しました" : "契約書・同意書を作成しました",
      })

      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] })
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", patientId] })
      onOpenChange(false)
    } catch (error) {
      console.error('Save contract error:', error)
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : '保存中にエラーが発生しました',
        variant: "destructive"
      })
    } finally {
      setIsSaving(false)
    }
  }

  const contractTypeLabels: Record<string, string> = {
    service_agreement: "サービス利用契約書",
    important_matters: "重要事項説明書",
    personal_info_consent: "個人情報利用同意書",
    medical_consent: "医療行為同意書",
    other: "その他"
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {contract ? "契約書・同意書を編集" : "契約書・同意書を作成"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="contractType">契約種別 *</Label>
              <Select
                value={formData.contractType}
                onValueChange={(value) => setFormData({ ...formData, contractType: value as any })}
                required
              >
                <SelectTrigger id="contractType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="service_agreement">サービス利用契約書</SelectItem>
                  <SelectItem value="important_matters">重要事項説明書</SelectItem>
                  <SelectItem value="personal_info_consent">個人情報利用同意書</SelectItem>
                  <SelectItem value="medical_consent">医療行為同意書</SelectItem>
                  <SelectItem value="other">その他</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="contractDate">契約日 *</Label>
              <Input
                id="contractDate"
                type="date"
                required
                value={formData.contractDate}
                onChange={(e) => setFormData({ ...formData, contractDate: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="title">タイトル *</Label>
            <Input
              id="title"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="例: 訪問看護サービス利用契約書"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="startDate">有効開始日 *</Label>
              <Input
                id="startDate"
                type="date"
                required
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="endDate">有効終了日</Label>
              <Input
                id="endDate"
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                placeholder="空欄の場合は無期限"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="description">説明・備考</Label>
            <Textarea
              id="description"
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="契約内容の説明や備考を入力してください"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="signedBy">署名者</Label>
              <Input
                id="signedBy"
                value={formData.signedBy}
                onChange={(e) => setFormData({ ...formData, signedBy: e.target.value })}
                placeholder="利用者または代理人の氏名"
              />
            </div>
            <div>
              <Label htmlFor="witnessedBy">立会人（スタッフ）</Label>
              <Select value={selectedWitnessId} onValueChange={setSelectedWitnessId}>
                <SelectTrigger id="witnessedBy">
                  <SelectValue placeholder="立会人を選択（任意）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">なし</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* File Upload */}
          <div className="space-y-2 pt-4 border-t">
            <Label htmlFor="file">契約書PDFファイル</Label>
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
            {contract?.filePath && !formData.file && (
              <p className="text-xs text-green-600">
                既存ファイル: {contract.originalFileName || contract.filePath.split('/').pop()}
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
              {isSaving ? "保存中..." : contract ? "更新" : "作成"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

