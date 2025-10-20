import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import type { Patient } from "@shared/schema"
import {
  FileText,
  Download,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Lock,
  Unlock,
  Eye,
  Printer
} from "lucide-react"
import { useLocation } from "wouter"
import { useBasePath } from "@/hooks/useBasePath"
import { pdf } from "@react-pdf/renderer"
import { ReceiptPDF } from "@/components/ReceiptPDF"

interface MonthlyReceipt {
  id: string
  patientId: string
  targetYear: number
  targetMonth: number
  insuranceType: 'medical' | 'care'
  visitCount: number
  totalPoints: number
  totalAmount: number
  isConfirmed: boolean
  isSent: boolean
  hasErrors: boolean
  hasWarnings: boolean
  errorMessages: string[] | null
  warningMessages: string[] | null
  patient?: {
    lastName: string
    firstName: string
    patientNumber: string
  }
}

export default function MonthlyReceiptsManagement() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [, setLocation] = useLocation()
  const basePath = useBasePath()

  const [generateDialogOpen, setGenerateDialogOpen] = useState(false)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedInsuranceType, setSelectedInsuranceType] = useState<'medical' | 'care'>('care')

  // Filters
  const [filterYear, setFilterYear] = useState<string>(new Date().getFullYear().toString())
  const [filterMonth, setFilterMonth] = useState<string>((new Date().getMonth() + 1).toString())
  const [filterInsuranceType, setFilterInsuranceType] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterPatientId, setFilterPatientId] = useState<string>('all')

  // Fetch patients for filter dropdown
  const { data: patientsData } = useQuery<{ data: Patient[] } | Patient[]>({
    queryKey: ["/api/patients"],
  })
  const patients: Patient[] = Array.isArray(patientsData)
    ? patientsData
    : ((patientsData as { data: Patient[] })?.data || [])

  // Fetch monthly receipts
  const { data: allReceipts = [], isLoading } = useQuery<MonthlyReceipt[]>({
    queryKey: ["/api/monthly-receipts", filterYear, filterMonth, filterInsuranceType],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filterYear !== 'all') params.append("year", filterYear)
      if (filterMonth !== 'all') params.append("month", filterMonth)
      if (filterInsuranceType !== 'all') params.append("insuranceType", filterInsuranceType)

      const response = await fetch(`/api/monthly-receipts?${params}`)
      if (!response.ok) throw new Error("レセプトの取得に失敗しました")
      return response.json()
    },
  })

  // Client-side filtering by status and patient
  const receipts = allReceipts.filter((receipt) => {
    // Filter by patient
    if (filterPatientId !== 'all' && receipt.patientId !== filterPatientId) return false

    // Filter by status
    if (filterStatus === 'all') return true
    // エラーあり: エラーがあるもの（確定状態は問わない）
    if (filterStatus === 'error') return receipt.hasErrors
    // 警告あり: 警告はあるがエラーはなく、未確定のもの
    if (filterStatus === 'warning') return receipt.hasWarnings && !receipt.hasErrors && !receipt.isConfirmed
    // 確定済み: 確定済みでエラーがないもの（警告の有無は問わない）
    if (filterStatus === 'confirmed') return receipt.isConfirmed && !receipt.hasErrors
    // 未確定: 未確定でエラーも警告もないもの
    if (filterStatus === 'unconfirmed') return !receipt.isConfirmed && !receipt.hasErrors && !receipt.hasWarnings
    // 送信済み: 送信済みのもの
    if (filterStatus === 'sent') return receipt.isSent
    return true
  })

  // Generate monthly receipts
  const generateMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/monthly-receipts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: selectedYear,
          month: selectedMonth,
          insuranceType: selectedInsuranceType,
        }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "レセプト生成に失敗しました")
      }
      return response.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/monthly-receipts"] })
      toast({
        title: "生成完了",
        description: `${data.count}件のレセプトを生成しました`,
      })
      setGenerateDialogOpen(false)
    },
    onError: (error: Error) => {
      toast({
        title: "エラー",
        description: error.message,
        variant: "destructive",
      })
    },
  })

  // Finalize receipt
  const finalizeMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/monthly-receipts/${id}/finalize`, {
        method: "POST",
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "確定に失敗しました")
      }
      return response.json()
    },
    onSuccess: (data, id) => {
      // Invalidate both list and detail caches
      queryClient.invalidateQueries({ queryKey: ["/api/monthly-receipts"] })
      queryClient.invalidateQueries({ queryKey: [`/api/monthly-receipts/${id}`] })
      toast({
        title: "確定完了",
        description: "レセプトを確定しました",
      })
    },
    onError: (error: Error) => {
      toast({
        title: "エラー",
        description: error.message,
        variant: "destructive",
      })
    },
  })

  // Reopen receipt
  const reopenMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/monthly-receipts/${id}/reopen`, {
        method: "POST",
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "再開に失敗しました")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/monthly-receipts"] })
      toast({
        title: "再開完了",
        description: "レセプトを再開しました",
      })
    },
    onError: (error: Error) => {
      toast({
        title: "エラー",
        description: error.message,
        variant: "destructive",
      })
    },
  })

  // Recalculate receipt
  const recalculateMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/monthly-receipts/${id}/recalculate`, {
        method: "POST",
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "再計算に失敗しました")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/monthly-receipts"] })
      toast({
        title: "再計算完了",
        description: "レセプトを再計算しました",
      })
    },
    onError: (error: Error) => {
      toast({
        title: "エラー",
        description: error.message,
        variant: "destructive",
      })
    },
  })

  const handleGenerate = () => {
    generateMutation.mutate()
  }

  const handleDownloadCSV = async (insuranceType: 'medical' | 'care') => {
    if (filterYear === 'all' || filterMonth === 'all') {
      toast({
        title: "エラー",
        description: "年月を選択してください",
        variant: "destructive",
      })
      return
    }

    try {
      const endpoint = insuranceType === 'care'
        ? `/api/monthly-receipts/export/care-insurance?year=${filterYear}&month=${filterMonth}`
        : `/api/monthly-receipts/export/medical-insurance?year=${filterYear}&month=${filterMonth}`

      const response = await fetch(endpoint)

      if (!response.ok) {
        if (response.status === 404) {
          const insuranceTypeName = insuranceType === 'care' ? '介護保険' : '医療保険'
          toast({
            title: "データなし",
            description: `${filterYear}年${filterMonth}月の${insuranceTypeName}レセプトがありません`,
            variant: "destructive",
          })
          return
        }
        const error = await response.json()
        throw new Error(error.error || "CSV出力に失敗しました")
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `receipt_${insuranceType}_${filterYear}_${filterMonth}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

      toast({
        title: "ダウンロード完了",
        description: "CSVファイルをダウンロードしました",
      })
    } catch (error) {
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "CSV出力に失敗しました",
        variant: "destructive",
      })
    }
  }

  // PDF生成関数
  const handleDownloadPDF = async (receiptId: string) => {
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
      link.download = `receipt_${pdfData.targetYear}${String(pdfData.targetMonth).padStart(2, '0')}_${pdfData.patient.patientNumber}.pdf`
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

  const getStatusBadge = (receipt: MonthlyReceipt) => {
    if (receipt.hasErrors) {
      return <Badge variant="destructive" className="flex items-center gap-1"><XCircle className="w-3 h-3" />エラーあり</Badge>
    }
    if (receipt.isSent) {
      return <Badge variant="default" className="flex items-center gap-1"><CheckCircle className="w-3 h-3" />送信済み</Badge>
    }
    if (receipt.isConfirmed) {
      return <Badge variant="secondary" className="flex items-center gap-1"><Lock className="w-3 h-3" />確定済み</Badge>
    }
    if (receipt.hasWarnings) {
      return <Badge variant="outline" className="flex items-center gap-1 border-yellow-500 text-yellow-700"><AlertTriangle className="w-3 h-3" />警告あり</Badge>
    }
    return <Badge variant="outline">未確定</Badge>
  }

  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i)
  const months = Array.from({ length: 12 }, (_, i) => i + 1)

  return (
    <div className="w-full max-w-full space-y-4 sm:space-y-6 p-3 sm:p-4 lg:p-6 overflow-x-hidden">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">月次レセプト管理</h1>
          <p className="text-muted-foreground">
            月次レセプトの生成・確認・CSV出力を管理します
          </p>
        </div>
        <Button onClick={() => setGenerateDialogOpen(true)} className="gap-2">
          <FileText className="w-4 h-4" />
          レセプト生成
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>絞り込み</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <Label>対象年</Label>
              <Select value={filterYear} onValueChange={setFilterYear}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map(year => (
                    <SelectItem key={year} value={year.toString()}>{year}年</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>対象月</Label>
              <Select value={filterMonth} onValueChange={setFilterMonth}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map(month => (
                    <SelectItem key={month} value={month.toString()}>{month}月</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>利用者</Label>
              <Select value={filterPatientId} onValueChange={setFilterPatientId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">すべて</SelectItem>
                  {patients.map(patient => (
                    <SelectItem key={patient.id} value={patient.id}>
                      {patient.lastName} {patient.firstName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>保険種別</Label>
              <Select value={filterInsuranceType} onValueChange={setFilterInsuranceType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">すべて</SelectItem>
                  <SelectItem value="care">介護保険</SelectItem>
                  <SelectItem value="medical">医療保険</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>ステータス</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">すべて</SelectItem>
                  <SelectItem value="error">エラーあり</SelectItem>
                  <SelectItem value="warning">警告あり</SelectItem>
                  <SelectItem value="unconfirmed">未確定</SelectItem>
                  <SelectItem value="confirmed">確定済み</SelectItem>
                  <SelectItem value="sent">送信済み</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={() => handleDownloadCSV('care')} className="gap-2">
              <Download className="w-4 h-4" />
              介護保険CSV出力
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleDownloadCSV('medical')} className="gap-2">
              <Download className="w-4 h-4" />
              医療保険CSV出力
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Receipts Table */}
      <Card>
        <CardHeader>
          <CardTitle>レセプト一覧</CardTitle>
          <CardDescription>
            {receipts.length}件のレセプト
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">読み込み中...</div>
          ) : receipts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              該当するレセプトがありません
            </div>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>対象月</TableHead>
                    <TableHead>利用者</TableHead>
                    <TableHead>保険種別</TableHead>
                    <TableHead className="text-right">訪問回数</TableHead>
                    <TableHead className="text-right">合計点数</TableHead>
                    <TableHead className="text-right">合計金額</TableHead>
                    <TableHead>ステータス</TableHead>
                    <TableHead className="text-center">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receipts.map((receipt) => (
                    <TableRow key={receipt.id}>
                      <TableCell>
                        {receipt.targetYear}年{receipt.targetMonth}月
                      </TableCell>
                      <TableCell>
                        {receipt.patient ?
                          `${receipt.patient.lastName} ${receipt.patient.firstName}` :
                          '不明'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={receipt.insuranceType === 'medical' ? 'medical' : 'care'}>
                          {receipt.insuranceType === 'care' ? '介護保険' : '医療保険'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{receipt.visitCount}回</TableCell>
                      <TableCell className="text-right">{receipt.totalPoints.toLocaleString()}点</TableCell>
                      <TableCell className="text-right">¥{receipt.totalAmount.toLocaleString()}</TableCell>
                      <TableCell>{getStatusBadge(receipt)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {!receipt.isConfirmed && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => recalculateMutation.mutate(receipt.id)}
                                disabled={recalculateMutation.isPending}
                                className="gap-1"
                              >
                                <RefreshCw className="w-3 h-3" />
                                再計算
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setLocation(`${basePath}/monthly-receipts/${receipt.id}`)}
                                className="gap-1"
                              >
                                <Eye className="w-3 h-3" />
                                詳細
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDownloadPDF(receipt.id)}
                                className="gap-1"
                              >
                                <Download className="w-3 h-3" />
                                PDF
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => finalizeMutation.mutate(receipt.id)}
                                disabled={finalizeMutation.isPending || receipt.hasErrors}
                                className="gap-1"
                              >
                                <Lock className="w-3 h-3" />
                                確定
                              </Button>
                            </>
                          )}
                          {receipt.isConfirmed && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setLocation(`${basePath}/monthly-receipts/${receipt.id}`)}
                                className="gap-1"
                              >
                                <Eye className="w-3 h-3" />
                                詳細
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDownloadPDF(receipt.id)}
                                className="gap-1"
                              >
                                <Download className="w-3 h-3" />
                                PDF
                              </Button>
                              {!receipt.isSent && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => reopenMutation.mutate(receipt.id)}
                                  disabled={reopenMutation.isPending}
                                  className="gap-1"
                                >
                                  <Unlock className="w-3 h-3" />
                                  再開
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Generate Dialog */}
      <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>レセプト生成</DialogTitle>
            <DialogDescription>
              対象年月と保険種別を選択してレセプトを生成します
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>対象年</Label>
              <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map(year => (
                    <SelectItem key={year} value={year.toString()}>{year}年</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>対象月</Label>
              <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map(month => (
                    <SelectItem key={month} value={month.toString()}>{month}月</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>保険種別</Label>
              <Select value={selectedInsuranceType} onValueChange={(v: 'medical' | 'care') => setSelectedInsuranceType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="care">介護保険</SelectItem>
                  <SelectItem value="medical">医療保険</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateDialogOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={handleGenerate} disabled={generateMutation.isPending}>
              {generateMutation.isPending ? "生成中..." : "生成"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
