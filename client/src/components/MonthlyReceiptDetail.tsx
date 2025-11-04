import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useRoute, useLocation } from "wouter"
import { useBasePath } from "@/hooks/useBasePath"
import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/hooks/use-toast"
import { InsuranceCardDialog } from "@/components/InsuranceCardDialog"
import { DoctorOrderDialog } from "@/components/DoctorOrderDialog"
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle,
  FileText,
  Calendar,
  User,
  CreditCard,
  Stethoscope,
  Lock,
  Unlock,
  XCircle,
  ClipboardCheck,
  Edit,
  Download,
  Printer,
} from "lucide-react"
import { pdf } from "@react-pdf/renderer"
import { ReceiptPDF } from "@/components/ReceiptPDF"

interface MonthlyReceiptDetail {
  id: string
  patientId: string
  targetYear: number
  targetMonth: number
  insuranceType: 'medical' | 'care'
  visitCount: number
  totalVisitPoints: number
  specialManagementPoints: number | null
  emergencyPoints: number | null
  longDurationPoints: number | null
  multipleVisitPoints: number | null
  sameBuildingReduction: number | null
  totalPoints: number
  totalAmount: number
  isConfirmed: boolean
  confirmedAt: string | null
  confirmedBy: string | null
  isSent: boolean
  sentAt: string | null
  hasErrors: boolean
  hasWarnings: boolean
  errorMessages: string[] | null
  warningMessages: string[] | null
  notes: string | null
  patient: {
    id: string
    patientNumber: string
    lastName: string
    firstName: string
    dateOfBirth: string
    gender: string
    phone: string | null
    address: string | null
  }
  confirmedByUser: {
    id: string
    username: string
    fullName: string
  } | null
  insuranceCard: {
    id: string
    cardType: string
    insurerNumber: string
    insuredNumber: string
    validFrom: string
    validUntil: string | null
    copaymentRate: string | null
  } | null
  doctorOrder: {
    order: {
      id: string
      orderDate: string
      startDate: string
      endDate: string
      diagnosis: string
      orderContent: string
    }
    medicalInstitution: {
      id: string
      name: string
      doctorName: string
      phone: string
    }
  } | null
  relatedRecords: Array<{
    id: string
    visitDate: string
    actualStartTime: string | null
    actualEndTime: string | null
    status: string
    vitalSigns: any
    observations: string
    implementedCare: string
    nurse: {
      id: string
      username: string
      fullName: string
    } | null
    schedule: {
      id: string
      scheduledDate: string
      startTime: string
      endTime: string
    } | null
  }>
  bonusHistory: Array<{
    history: {
      id: string
      nursingRecordId: string
      bonusMasterId: string
      calculatedPoints: number
      appliedAt: string
      calculationDetails: any
    }
    bonus: {
      id: string
      bonusCode: string
      bonusName: string
      bonusCategory: string
      insuranceType: string
    } | null
  }>
}

export default function MonthlyReceiptDetail() {
  const [, setLocation] = useLocation()
  const basePath = useBasePath()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  // Try both route patterns (with and without basePath)
  const [matchMultiTenant, paramsMultiTenant] = useRoute("/:companySlug/:facilitySlug/monthly-receipts/:id")
  const [matchSingle, paramsSingle] = useRoute("/monthly-receipts/:id")

  const receiptId = paramsMultiTenant?.id || paramsSingle?.id

  // Dialog states
  const [insuranceCardDialogOpen, setInsuranceCardDialogOpen] = useState(false)
  const [doctorOrderDialogOpen, setDoctorOrderDialogOpen] = useState(false)

  const { data: receipt, isLoading, error } = useQuery<MonthlyReceiptDetail>({
    queryKey: [`/api/monthly-receipts/${receiptId}`],
    queryFn: async () => {
      const response = await fetch(`/api/monthly-receipts/${receiptId}`)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || "レセプトの取得に失敗しました")
      }
      return response.json()
    },
    enabled: !!receiptId,
  })

  // Validate receipt mutation
  const validateMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/monthly-receipts/${receiptId}/validate`, {
        method: "POST",
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "検証に失敗しました")
      }
      return response.json()
    },
    onSuccess: (data) => {
      // Invalidate both detail and list caches
      queryClient.invalidateQueries({ queryKey: [`/api/monthly-receipts/${receiptId}`] })
      queryClient.invalidateQueries({ queryKey: ["/api/monthly-receipts"] })

      if (data.errors && data.errors.length > 0) {
        toast({
          title: "検証完了 - エラーあり",
          description: `${data.errors.length}件のエラーが見つかりました`,
          variant: "destructive",
        })
      } else if (data.warnings && data.warnings.length > 0) {
        toast({
          title: "検証完了 - 警告あり",
          description: `${data.warnings.length}件の警告があります`,
        })
      } else {
        toast({
          title: "検証完了",
          description: "エラーは見つかりませんでした",
        })
      }
    },
    onError: (error: Error) => {
      toast({
        title: "エラー",
        description: error.message,
        variant: "destructive",
      })
    },
  })

  // Finalize receipt mutation
  const finalizeMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/monthly-receipts/${receiptId}/finalize`, {
        method: "POST",
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "レセプトの確定に失敗しました")
      }
      return response.json()
    },
    onSuccess: (data) => {
      // Invalidate both detail and list caches
      queryClient.invalidateQueries({ queryKey: [`/api/monthly-receipts/${receiptId}`] })
      queryClient.invalidateQueries({ queryKey: ["/api/monthly-receipts"] })

      if (data.warnings && data.warnings.length > 0) {
        toast({
          title: "レセプトを確定しました",
          description: `${data.warnings.length}件の警告がありますが、確定しました`,
        })
      } else {
        toast({
          title: "レセプトを確定しました",
          description: "レセプトが確定されました",
        })
      }
    },
    onError: (error: Error) => {
      toast({
        title: "確定エラー",
        description: error.message,
        variant: "destructive",
      })
    },
  })

  // Reopen receipt mutation
  const reopenMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/monthly-receipts/${receiptId}/reopen`, {
        method: "POST",
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "レセプトの再開に失敗しました")
      }
      return response.json()
    },
    onSuccess: () => {
      // Invalidate both detail and list caches
      queryClient.invalidateQueries({ queryKey: [`/api/monthly-receipts/${receiptId}`] })
      queryClient.invalidateQueries({ queryKey: ["/api/monthly-receipts"] })
      toast({
        title: "レセプトを再開しました",
        description: "レセプトの編集が可能になりました",
      })
    },
    onError: (error: Error) => {
      toast({
        title: "再開エラー",
        description: error.message,
        variant: "destructive",
      })
    },
  })

  // PDF生成関数
  const handleDownloadPDF = async () => {
    try {
      toast({
        title: "PDF生成中",
        description: "レセプトPDFを生成しています...",
      })

      const response = await fetch(`/api/monthly-receipts/${receiptId}/pdf`)
      if (!response.ok) {
        throw new Error("PDFデータの取得に失敗しました")
      }

      const { pdfData, facilityInfo } = await response.json()

      // PDFドキュメントを生成
      const blob = await pdf(
        <ReceiptPDF receipt={pdfData} facilityInfo={facilityInfo} />
      ).toBlob()

      // ダウンロード
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `receipt_${receipt!.targetYear}${String(receipt!.targetMonth).padStart(2, '0')}_${receipt!.patient.patientNumber}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast({
        title: "PDF生成完了",
        description: "レセプトPDFのダウンロードが完了しました",
      })
    } catch (error) {
      console.error("PDF generation error:", error)
      toast({
        title: "PDF生成エラー",
        description: error instanceof Error ? error.message : "PDFの生成に失敗しました",
        variant: "destructive",
      })
    }
  }

  // PDF印刷関数
  const handlePrintPDF = async () => {
    try {
      toast({
        title: "印刷準備中",
        description: "レセプトPDFを準備しています...",
      })

      const response = await fetch(`/api/monthly-receipts/${receiptId}/pdf`)
      if (!response.ok) {
        throw new Error("PDFデータの取得に失敗しました")
      }

      const { pdfData, facilityInfo } = await response.json()

      // PDFドキュメントを生成
      const blob = await pdf(
        <ReceiptPDF receipt={pdfData} facilityInfo={facilityInfo} />
      ).toBlob()

      // 印刷用の新しいウィンドウで開く
      const url = URL.createObjectURL(blob)
      const printWindow = window.open(url)
      if (printWindow) {
        printWindow.addEventListener('load', () => {
          printWindow.print()
        })
      }

      toast({
        title: "印刷準備完了",
        description: "印刷ダイアログを開きました",
      })
    } catch (error) {
      console.error("Print PDF error:", error)
      toast({
        title: "印刷エラー",
        description: error instanceof Error ? error.message : "印刷の準備に失敗しました",
        variant: "destructive",
      })
    }
  }

  if (isLoading) {
    return (
      <div className="w-full max-w-full space-y-4 sm:space-y-6 p-3 sm:p-4 lg:p-6 overflow-x-hidden">
        <div className="text-center py-8 text-muted-foreground">読み込み中...</div>
      </div>
    )
  }

  if (error || !receipt) {
    return (
      <div className="w-full max-w-full space-y-4 sm:space-y-6 p-3 sm:p-4 lg:p-6 overflow-x-hidden">
        <div className="text-center py-8 text-destructive">
          レセプトの読み込みに失敗しました
        </div>
      </div>
    )
  }

  const insuranceTypeLabel = receipt.insuranceType === 'medical' ? '医療保険' : '介護保険'

  // Status badge with consistent priority logic
  const getStatusBadge = () => {
    if (receipt.hasErrors) {
      return (
        <Badge variant="destructive" className="gap-1 px-2.5 py-1 text-xs font-semibold">
          <XCircle className="w-3 h-3" />
          エラーあり
        </Badge>
      )
    }
    if (receipt.isSent) {
      return (
        <Badge variant="default" className="gap-1 px-2.5 py-1 text-xs font-semibold">
          <CheckCircle className="w-3 h-3" />
          送信済み
        </Badge>
      )
    }
    if (receipt.isConfirmed) {
      return (
        <Badge variant="secondary" className="gap-1 px-2.5 py-1 text-xs font-semibold">
          <Lock className="w-3 h-3" />
          確定済み
        </Badge>
      )
    }
    if (receipt.hasWarnings) {
      return (
        <Badge variant="outline" className="gap-1 px-2.5 py-1 text-xs font-semibold border-2 border-yellow-500 text-yellow-700">
          <AlertTriangle className="w-3 h-3" />
          警告あり
        </Badge>
      )
    }
    return (
      <Badge variant="outline" className="gap-1 px-2.5 py-1 text-xs font-semibold border-2 border-amber-500 text-amber-700">
        <AlertTriangle className="w-3 h-3" />
        未確定
      </Badge>
    )
  }

  const statusBadge = getStatusBadge()

  return (
    <div className="w-full max-w-full space-y-4 sm:space-y-6 p-3 sm:p-4 lg:p-6 overflow-x-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2 flex-1">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation(`${basePath}/monthly-receipts`)}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              一覧に戻る
            </Button>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold tracking-tight">レセプト詳細</h1>
            <div className="flex items-center gap-2">
              <Badge
                variant={receipt.insuranceType === 'medical' ? 'medical' : 'care'}
                className="px-2.5 py-1 text-xs font-semibold"
              >
                {insuranceTypeLabel}
              </Badge>
              {statusBadge}
            </div>
          </div>
          <p className="text-muted-foreground">
            {receipt.targetYear}年{receipt.targetMonth}月分 - {receipt.patient.lastName} {receipt.patient.firstName}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Action Buttons */}
          <Button
            variant="outline"
            size="default"
            onClick={handlePrintPDF}
            className="gap-2"
          >
            <Printer className="w-4 h-4" />
            印刷
          </Button>
          <Button
            variant="outline"
            size="default"
            onClick={handleDownloadPDF}
            className="gap-2"
          >
            <Download className="w-4 h-4" />
            PDF出力
          </Button>
          <Button
            variant="outline"
            size="default"
            onClick={() => validateMutation.mutate()}
            disabled={validateMutation.isPending || receipt.isConfirmed}
            className="gap-2"
          >
            <ClipboardCheck className="w-4 h-4" />
            {validateMutation.isPending ? "検証中..." : "検証"}
          </Button>
          {receipt.isConfirmed ? (
            <Button
              variant="outline"
              size="default"
              onClick={() => reopenMutation.mutate()}
              disabled={reopenMutation.isPending || receipt.isSent}
              className="gap-2"
            >
              <Unlock className="w-4 h-4" />
              {reopenMutation.isPending ? "再開中..." : "再開"}
            </Button>
          ) : (
            <Button
              variant="default"
              size="default"
              onClick={() => finalizeMutation.mutate()}
              disabled={finalizeMutation.isPending || receipt.hasErrors}
              className="gap-2"
            >
              <Lock className="w-4 h-4" />
              {finalizeMutation.isPending ? "確定中..." : "確定"}
            </Button>
          )}
        </div>
      </div>

      {/* Error Messages */}
      {receipt.hasErrors && receipt.errorMessages && receipt.errorMessages.length > 0 && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <XCircle className="w-5 h-5" />
              バリデーションエラー
            </CardTitle>
            <CardDescription>
              以下のエラーを修正してください。エラーがある場合、レセプトを確定できません。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-1">
              {receipt.errorMessages.map((msg, index) => (
                <li key={index} className="text-sm text-destructive">{msg}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Warning Messages */}
      {receipt.hasWarnings && receipt.warningMessages && receipt.warningMessages.length > 0 && (
        <Card className="border-yellow-500">
          <CardHeader>
            <CardTitle className="text-yellow-700 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              確認推奨事項
            </CardTitle>
            <CardDescription>
              以下の項目を確認してください。警告があってもレセプトの確定は可能ですが、内容の確認を推奨します。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-1">
              {receipt.warningMessages.map((msg, index) => (
                <li key={index} className="text-sm text-yellow-700">{msg}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Patient Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            利用者情報
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">利用者番号</div>
              <div className="font-medium">{receipt.patient.patientNumber}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">氏名</div>
              <div className="font-medium">{receipt.patient.lastName} {receipt.patient.firstName}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">生年月日</div>
              <div className="font-medium">{receipt.patient.dateOfBirth}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">性別</div>
              <div className="font-medium">{receipt.patient.gender === 'male' ? '男性' : '女性'}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">電話番号</div>
              <div className="font-medium">{receipt.patient.phone || '-'}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">住所</div>
              <div className="font-medium">{receipt.patient.address || '-'}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Insurance Card Information */}
      {receipt.insuranceCard && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                保険証情報
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setInsuranceCardDialogOpen(true)}
                className="gap-2"
              >
                <Edit className="w-4 h-4" />
                編集
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">保険種別</div>
                <div className="font-medium">
                  {receipt.insuranceCard.cardType === 'medical' ? '医療保険' : '介護保険'}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">保険者番号</div>
                <div className="font-medium">{receipt.insuranceCard.insurerNumber}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">被保険者番号</div>
                <div className="font-medium">{receipt.insuranceCard.insuredNumber}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">自己負担割合</div>
                <div className="font-medium">
                  {receipt.insuranceCard.copaymentRate
                    ? `${parseInt(receipt.insuranceCard.copaymentRate) / 10}割`
                    : '-'}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">有効期間</div>
                <div className="font-medium">
                  {receipt.insuranceCard.validFrom} 〜 {receipt.insuranceCard.validUntil || '期限なし'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Doctor Order Information */}
      {receipt.doctorOrder && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Stethoscope className="w-5 h-5" />
                訪問看護指示書
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDoctorOrderDialogOpen(true)}
                className="gap-2"
              >
                <Edit className="w-4 h-4" />
                編集
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">主治医</div>
                <div className="font-medium">{receipt.doctorOrder.medicalInstitution.doctorName}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">医療機関</div>
                <div className="font-medium">{receipt.doctorOrder.medicalInstitution.name}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">指示書発行日</div>
                <div className="font-medium">{receipt.doctorOrder.order.orderDate}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">有効期間</div>
                <div className="font-medium">
                  {receipt.doctorOrder.order.startDate} 〜 {receipt.doctorOrder.order.endDate}
                </div>
              </div>
              <div className="md:col-span-2">
                <div className="text-sm text-muted-foreground">病名</div>
                <div className="font-medium">{receipt.doctorOrder.order.diagnosis}</div>
              </div>
              <div className="md:col-span-2">
                <div className="text-sm text-muted-foreground">指示内容</div>
                <div className="font-medium whitespace-pre-wrap">{receipt.doctorOrder.order.orderContent}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Receipt Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            レセプト集計
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">訪問回数</div>
                <div className="text-2xl font-bold">{receipt.visitCount}回</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">基本点数</div>
                <div className="text-2xl font-bold">{receipt.totalVisitPoints.toLocaleString()}点</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">合計点数</div>
                <div className="text-2xl font-bold">{receipt.totalPoints.toLocaleString()}点</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">合計金額</div>
                <div className="text-2xl font-bold">¥{receipt.totalAmount.toLocaleString()}</div>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="text-sm font-medium">加算内訳</div>
              {(() => {
                // Aggregate bonus points by bonus type
                const bonusSummary = new Map<string, { name: string; points: number; count: number }>()

                receipt.bonusHistory.forEach((item) => {
                  if (item.bonus) {
                    const key = item.bonus.bonusCode
                    const existing = bonusSummary.get(key)
                    if (existing) {
                      existing.points += item.history.calculatedPoints
                      existing.count += 1
                    } else {
                      bonusSummary.set(key, {
                        name: item.bonus.bonusName,
                        points: item.history.calculatedPoints,
                        count: 1,
                      })
                    }
                  }
                })

                // Convert to array and sort by points (descending)
                const bonusArray = Array.from(bonusSummary.values()).sort((a, b) => b.points - a.points)

                return bonusArray.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {bonusArray.map((bonus, index) => (
                      <div key={index} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          {bonus.name}
                          {bonus.count > 1 && <span className="ml-1 text-xs">×{bonus.count}</span>}
                        </span>
                        <span className="font-medium">{bonus.points.toLocaleString()}点</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">加算なし</div>
                )
              })()}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Related Nursing Records */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            訪問記録（{receipt.relatedRecords.length}件）
          </CardTitle>
          <CardDescription>
            {receipt.targetYear}年{receipt.targetMonth}月の訪問実績
          </CardDescription>
        </CardHeader>
        <CardContent>
          {receipt.relatedRecords.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              訪問記録がありません
            </div>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>訪問日</TableHead>
                    <TableHead>訪問時間</TableHead>
                    <TableHead>担当看護師</TableHead>
                    <TableHead>ステータス</TableHead>
                    <TableHead>適用加算</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receipt.relatedRecords.map((record) => {
                    const recordBonuses = receipt.bonusHistory.filter(
                      (b) => b.history.nursingRecordId === record.id
                    )

                    // Format time from timestamp or use schedule time as fallback
                    const formatTime = (timestamp: string | null) => {
                      if (!timestamp) return null
                      const date = new Date(timestamp)
                      return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
                    }

                    const startTime = record.actualStartTime
                      ? formatTime(record.actualStartTime)
                      : record.schedule?.startTime || '-'
                    const endTime = record.actualEndTime
                      ? formatTime(record.actualEndTime)
                      : record.schedule?.endTime || '-'

                    return (
                      <TableRow
                        key={record.id}
                        onClick={() => {
                          const currentPath = window.location.pathname
                          const encodedReturnTo = encodeURIComponent(currentPath)
                          setLocation(`${basePath}/records?recordId=${record.id}&returnTo=${encodedReturnTo}`)
                        }}
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                      >
                        <TableCell>{record.visitDate}</TableCell>
                        <TableCell>
                          {startTime} - {endTime}
                        </TableCell>
                        <TableCell>{record.nurse?.fullName || '-'}</TableCell>
                        <TableCell>
                          {record.status === 'completed' ? (
                            <Badge variant="secondary" className="gap-1">
                              <CheckCircle className="w-3 h-3" />
                              完了
                            </Badge>
                          ) : (
                            <Badge variant="outline">{record.status}</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {recordBonuses.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {recordBonuses.map((b) => (
                                <Badge key={b.history.id} variant="outline" className="text-xs">
                                  {b.bonus?.bonusName} ({b.history.calculatedPoints}点)
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">なし</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Information */}
      {receipt.isConfirmed && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              確定情報
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">確定日時</div>
                <div className="font-medium">{receipt.confirmedAt ? new Date(receipt.confirmedAt).toLocaleString('ja-JP') : '-'}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">確定者</div>
                <div className="font-medium">{receipt.confirmedByUser?.fullName || '-'}</div>
              </div>
              {receipt.isSent && (
                <div>
                  <div className="text-sm text-muted-foreground">送信日時</div>
                  <div className="font-medium">{receipt.sentAt ? new Date(receipt.sentAt).toLocaleString('ja-JP') : '-'}</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      {receipt.notes && (
        <Card>
          <CardHeader>
            <CardTitle>備考</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap">{receipt.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialogs */}
      {receipt.insuranceCard && (
        <InsuranceCardDialog
          open={insuranceCardDialogOpen}
          onOpenChange={(open) => {
            setInsuranceCardDialogOpen(open)
            if (!open) {
              // Refresh receipt data and re-validate after editing
              queryClient.invalidateQueries({ queryKey: [`/api/monthly-receipts/${receiptId}`] })
              queryClient.invalidateQueries({ queryKey: ["/api/monthly-receipts"] })
              // Auto-validate after editing
              validateMutation.mutate()
            }
          }}
          patientId={receipt.patientId}
          card={{
            id: receipt.insuranceCard.id,
            patientId: receipt.patientId,
            facilityId: '', // Will be filled by the dialog
            cardType: receipt.insuranceCard.cardType as 'medical' | 'long_term_care',
            insurerNumber: receipt.insuranceCard.insurerNumber,
            insuredNumber: receipt.insuranceCard.insuredNumber,
            insuredSymbol: '',
            insuredCardNumber: '',
            copaymentRate: (receipt.insuranceCard.copaymentRate as '10' | '20' | '30') || null,
            validFrom: receipt.insuranceCard.validFrom,
            validUntil: receipt.insuranceCard.validUntil || null,
            certificationDate: '',
            notes: '',
            isActive: true,
            filePath: null,
            originalFileName: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          }}
        />
      )}

      {receipt.doctorOrder && (
        <DoctorOrderDialog
          open={doctorOrderDialogOpen}
          onOpenChange={(open) => {
            setDoctorOrderDialogOpen(open)
            if (!open) {
              // Refresh receipt data and re-validate after editing
              queryClient.invalidateQueries({ queryKey: [`/api/monthly-receipts/${receiptId}`] })
              queryClient.invalidateQueries({ queryKey: ["/api/monthly-receipts"] })
              // Auto-validate after editing
              validateMutation.mutate()
            }
          }}
          patientId={receipt.patientId}
          order={{
            id: receipt.doctorOrder.order.id,
            patientId: receipt.patientId,
            facilityId: '', // Will be filled by the dialog
            medicalInstitutionId: receipt.doctorOrder.medicalInstitution.id,
            orderDate: receipt.doctorOrder.order.orderDate,
            startDate: receipt.doctorOrder.order.startDate,
            endDate: receipt.doctorOrder.order.endDate,
            diagnosis: receipt.doctorOrder.order.diagnosis,
            orderContent: receipt.doctorOrder.order.orderContent,
            isActive: true,
            notes: null,
            weeklyVisitLimit: null,
            filePath: null,
            originalFileName: null,
            icd10Code: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          }}
        />
      )}
    </div>
  )
}
