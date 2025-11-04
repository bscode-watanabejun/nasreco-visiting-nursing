import { useForm } from "react-hook-form"
import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

interface PublicExpenseCard {
  id: string
  patientId: string
  facilityId: string
  beneficiaryNumber: string
  recipientNumber: string | null
  legalCategoryNumber: string
  priority: number
  validFrom: string
  validUntil: string | null
  notes: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

interface PublicExpenseCardFormData {
  beneficiaryNumber: string
  recipientNumber?: string
  legalCategoryNumber: string
  priority: string
  validFrom: string
  validUntil?: string
  notes?: string
}

interface PublicExpenseCardDialogProps {
  patientId: string
  facilityId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  editingCard?: PublicExpenseCard | null
  existingCards?: PublicExpenseCard[] // 既存の公費リスト（優先順位の重複チェック用）
}

// 法別番号のマスターデータ（主要なもの）
const LEGAL_CATEGORY_OPTIONS = [
  { value: "10", label: "10 - 生活保護" },
  { value: "12", label: "12 - 生活保護（中国残留邦人等）" },
  { value: "15", label: "15 - 障害者自立支援" },
  { value: "19", label: "19 - 原爆" },
  { value: "21", label: "21 - 精神通院医療" },
  { value: "25", label: "25 - 結核児童" },
  { value: "28", label: "28 - 小児慢性特定疾病" },
  { value: "30", label: "30 - 医療観察法" },
  { value: "38", label: "38 - 肝炎治療医療" },
  { value: "51", label: "51 - 特定疾患" },
  { value: "52", label: "52 - 小児慢性特定疾患" },
  { value: "53", label: "53 - 特定疾患（経過措置）" },
  { value: "54", label: "54 - 指定難病" },
  { value: "66", label: "66 - 感染症" },
  { value: "67", label: "67 - 感染症（37条の2）" },
  { value: "80", label: "80 - その他公費" },
]

export function PublicExpenseCardDialog({
  patientId,
  facilityId,
  open,
  onOpenChange,
  editingCard,
  existingCards = [],
}: PublicExpenseCardDialogProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  // 使用可能な優先順位を計算（編集中のカードは除外）
  const usedPriorities = existingCards
    .filter(card => card.id !== editingCard?.id)
    .map(card => card.priority)

  const availablePriorities = [1, 2, 3, 4].filter(p => !usedPriorities.includes(p))

  const form = useForm<PublicExpenseCardFormData>({
    defaultValues: {
      beneficiaryNumber: "",
      recipientNumber: "",
      legalCategoryNumber: "",
      priority: "1",
      validFrom: "",
      validUntil: "",
      notes: "",
    },
  })

  // ダイアログが開いたとき、またはeditingCardが変更されたときにフォームをリセット
  useEffect(() => {
    if (open) {
      if (editingCard) {
        // 編集モード: 既存のデータでフォームを埋める
        form.reset({
          beneficiaryNumber: editingCard.beneficiaryNumber,
          recipientNumber: editingCard.recipientNumber || "",
          legalCategoryNumber: editingCard.legalCategoryNumber,
          priority: editingCard.priority.toString(),
          validFrom: editingCard.validFrom,
          validUntil: editingCard.validUntil || "",
          notes: editingCard.notes || "",
        })
      } else {
        // 新規登録モード: フォームをクリア
        form.reset({
          beneficiaryNumber: "",
          recipientNumber: "",
          legalCategoryNumber: "",
          priority: "1",
          validFrom: "",
          validUntil: "",
          notes: "",
        })
      }
    }
  }, [open, editingCard, form])

  const onSubmit = async (data: PublicExpenseCardFormData) => {
    try {
      const payload = {
        patientId,
        facilityId,
        beneficiaryNumber: data.beneficiaryNumber,
        recipientNumber: data.recipientNumber || null,
        legalCategoryNumber: data.legalCategoryNumber,
        priority: parseInt(data.priority),
        validFrom: data.validFrom,
        validUntil: data.validUntil || null,
        notes: data.notes || null,
        isActive: true,
      }

      const url = editingCard
        ? `/api/public-expense-cards/${editingCard.id}`
        : "/api/public-expense-cards"

      const method = editingCard ? "PATCH" : "POST"

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error("公費情報の保存に失敗しました")
      }

      toast({
        title: "保存完了",
        description: `公費情報を${editingCard ? "更新" : "登録"}しました`,
      })

      queryClient.invalidateQueries({ queryKey: ["public-expense-cards", patientId] })

      // フォームをクリアしてダイアログを閉じる
      form.reset({
        beneficiaryNumber: "",
        recipientNumber: "",
        legalCategoryNumber: "",
        priority: "1",
        validFrom: "",
        validUntil: "",
        notes: "",
      })
      onOpenChange(false)
    } catch (error) {
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "保存中にエラーが発生しました",
        variant: "destructive",
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingCard ? "公費負担医療情報を編集" : "公費負担医療情報を追加"}
          </DialogTitle>
          <DialogDescription>
            患者の公費負担医療制度の情報を入力してください。最大4つまで登録できます。
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="priority"
              rules={{ required: "優先順位は必須です" }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>優先順位 *</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={availablePriorities.length === 0 && !editingCard}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="優先順位を選択" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availablePriorities.length === 0 && !editingCard ? (
                        <SelectItem value="0" disabled>
                          すべての優先順位が使用されています
                        </SelectItem>
                      ) : (
                        <>
                          {[1, 2, 3, 4].map((priority) => {
                            const isUsed = usedPriorities.includes(priority)
                            const priorityLabel = ['第一公費', '第二公費', '第三公費', '第四公費'][priority - 1]

                            return (
                              <SelectItem
                                key={priority}
                                value={priority.toString()}
                                disabled={isUsed}
                              >
                                {priorityLabel}（優先順位{priority}）{isUsed ? ' - 使用済み' : ''}
                              </SelectItem>
                            )
                          })}
                        </>
                      )}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    複数の公費を併用する場合の適用順序を指定します
                    {availablePriorities.length > 0 && (
                      <span className="block text-xs mt-1">
                        利用可能: {availablePriorities.map(p => `優先順位${p}`).join(', ')}
                      </span>
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="legalCategoryNumber"
              rules={{ required: "法別番号は必須です" }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>法別番号 *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="法別番号を選択" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {LEGAL_CATEGORY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    公費負担医療の種類を識別する番号です
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="beneficiaryNumber"
              rules={{
                required: "負担者番号は必須です",
                pattern: {
                  value: /^\d{8}$/,
                  message: "8桁の数字で入力してください",
                },
              }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>負担者番号 *</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="12345678"
                      maxLength={8}
                      type="text"
                    />
                  </FormControl>
                  <FormDescription>8桁の公費負担者番号</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="recipientNumber"
              rules={{
                pattern: {
                  value: /^\d{7}$/,
                  message: "7桁の数字で入力してください",
                },
              }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>受給者番号</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="1234567"
                      maxLength={7}
                      type="text"
                    />
                  </FormControl>
                  <FormDescription>
                    7桁の受給者番号（※医療観察法（法別30）の場合は不要）
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="validFrom"
                rules={{ required: "有効開始日は必須です" }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>有効開始日 *</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="validUntil"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>有効終了日</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" />
                    </FormControl>
                    <FormDescription>未設定の場合は無期限</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>備考</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="特記事項があれば入力してください"
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                キャンセル
              </Button>
              <Button type="submit">
                {editingCard ? "更新" : "登録"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
