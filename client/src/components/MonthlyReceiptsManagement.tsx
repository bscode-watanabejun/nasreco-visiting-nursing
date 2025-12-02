import { useState, useEffect } from "react"
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Alert,
  AlertTitle,
  AlertDescription,
} from "@/components/ui/alert"
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
  Printer,
  FileSpreadsheet,
  Info
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
  // Phase 3: レセプトCSV対応
  csvExportReady: boolean | null
  csvExportWarnings: Array<{field: string; message: string}> | null
  lastCsvExportCheck: string | null
  patient?: {
    lastName: string
    firstName: string
    patientNumber: string
  }
  insuranceCard?: {
    reviewOrganizationCode: '1' | '2' | null
    insurerNumber: string | null
  } | null
}

export default function MonthlyReceiptsManagement() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [location, setLocation] = useLocation()
  const basePath = useBasePath()

  const [generateDialogOpen, setGenerateDialogOpen] = useState(false)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedInsuranceType, setSelectedInsuranceType] = useState<'medical' | 'care'>('medical')

  // URLクエリパラメータからフィルタ条件を読み込む
  const getInitialFilters = () => {
    const urlParams = new URLSearchParams(window.location.search)
    const currentYear = new Date().getFullYear()
    const currentMonth = new Date().getMonth() + 1
    
    return {
      year: urlParams.get('year') || currentYear.toString(),
      month: urlParams.get('month') || currentMonth.toString(),
      insuranceType: urlParams.get('insuranceType') || 'medical',
      status: urlParams.get('status') || 'all',
      patientId: urlParams.get('patientId') || 'all',
    }
  }

  const initialFilters = getInitialFilters()

  // Filters
  const [filterYear, setFilterYear] = useState<string>(initialFilters.year)
  const [filterMonth, setFilterMonth] = useState<string>(initialFilters.month)
  const [filterInsuranceType, setFilterInsuranceType] = useState<string>(initialFilters.insuranceType)
  const [filterStatus, setFilterStatus] = useState<string>(initialFilters.status)
  const [filterPatientId, setFilterPatientId] = useState<string>(initialFilters.patientId)

  // フィルタ条件が変更されたらURLクエリパラメータを更新
  useEffect(() => {
    const params = new URLSearchParams()
    if (filterYear !== 'all') params.set('year', filterYear)
    if (filterMonth !== 'all') params.set('month', filterMonth)
    params.set('insuranceType', filterInsuranceType)
    if (filterStatus !== 'all') params.set('status', filterStatus)
    if (filterPatientId !== 'all') params.set('patientId', filterPatientId)

    const newSearch = params.toString()
    const newUrl = `${location.split('?')[0]}${newSearch ? `?${newSearch}` : ''}`
    
    // URLを更新（ページリロードはしない）
    if (window.location.search !== `?${newSearch}`) {
      window.history.replaceState({}, '', newUrl)
    }
  }, [filterYear, filterMonth, filterInsuranceType, filterStatus, filterPatientId, location])

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
      params.append("insuranceType", filterInsuranceType)

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
    onSuccess: (_, id) => {
      // Find the receipt that was recalculated
      const receipt = allReceipts.find(r => r.id === id)
      const receiptInfo = receipt
        ? `${receipt.targetYear}年${receipt.targetMonth}月「${receipt.patient ? `${receipt.patient.lastName} ${receipt.patient.firstName}` : '不明'}」さんのレセプトを再計算しました`
        : "レセプトを再計算しました"
      
      queryClient.invalidateQueries({ queryKey: ["/api/monthly-receipts"] })
      toast({
        title: "再計算完了",
        description: receiptInfo,
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

  const handleDownloadMedicalInsuranceBatchCSV = async () => {
    // 表示されているレセプトのうち、確定済みかつ医療保険のレセプトIDを収集
    const targetReceiptIds = receipts
      .filter(receipt => receipt.isConfirmed && receipt.insuranceType === 'medical')
      .map(receipt => receipt.id)

    if (targetReceiptIds.length === 0) {
      toast({
        title: "エラー",
        description: "出力可能な医療保険レセプトがありません（確定済みの医療保険レセプトが必要です）",
        variant: "destructive",
      })
      return
    }

    try {
      toast({
        title: "CSV生成中",
        description: "医療保険レセプトCSVを生成しています...",
      })

      const response = await fetch('/api/monthly-receipts/export/medical-insurance-batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ receiptIds: targetReceiptIds }),
      })

      if (!response.ok) {
        if (response.status === 404) {
          toast({
            title: "データなし",
            description: "該当するレセプトがありません",
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
      a.download = `medical_receipts_${filterYear}${String(filterMonth).padStart(2, '0')}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

      // スキップされたレセプトがある場合は警告を表示
      const skippedReceiptsHeader = response.headers.get('X-Skipped-Receipts')
      if (skippedReceiptsHeader) {
        const skippedCount = skippedReceiptsHeader.split(',').length
        toast({
          title: "ダウンロード完了",
          description: `CSVファイルをダウンロードしました（${skippedCount}件のレセプトはデータ不足のためスキップされました）`,
        })
      } else {
        toast({
          title: "ダウンロード完了",
          description: "CSVファイルをダウンロードしました",
        })
      }
    } catch (error) {
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "CSV出力に失敗しました",
        variant: "destructive",
      })
    }
  }

  const handleDownloadListCSV = async () => {
    // 表示されているレセプトのIDを収集
    const targetReceiptIds = receipts.map(receipt => receipt.id);

    if (targetReceiptIds.length === 0) {
      toast({
        title: "エラー",
        description: "出力可能なレセプトがありません",
        variant: "destructive",
      })
      return
    }

    try {
      toast({
        title: "CSV生成中",
        description: "レセプト一覧CSVを生成しています...",
      })

      const response = await fetch('/api/monthly-receipts/export/list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ receiptIds: targetReceiptIds }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'CSV出力に失敗しました')
      }

      // レスポンスからファイル名を取得（Content-Dispositionヘッダーから）
      const contentDisposition = response.headers.get('Content-Disposition')
      let fileName = 'receipts_list.csv'
      if (contentDisposition) {
        const fileNameMatch = contentDisposition.match(/filename="(.+)"/)
        if (fileNameMatch) {
          fileName = fileNameMatch[1]
        }
      }

      // レスポンスをBlobとして取得
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast({
        title: "出力完了",
        description: "レセプト一覧CSVを出力しました",
      })
    } catch (error: any) {
      toast({
        title: "エラー",
        description: error.message,
        variant: "destructive",
      })
    }
  }

  const handleDownloadCareInsuranceBatchCSV = async () => {
    // 表示されているレセプトのうち、確定済みかつ介護保険のレセプトIDを収集
    const targetReceiptIds = receipts
      .filter(receipt => receipt.isConfirmed && receipt.insuranceType === 'care')
      .map(receipt => receipt.id)

    if (targetReceiptIds.length === 0) {
      toast({
        title: "エラー",
        description: "出力可能な介護保険レセプトがありません（確定済みの介護保険レセプトが必要です）",
        variant: "destructive",
      })
      return
    }

    try {
      toast({
        title: "CSV生成中",
        description: "介護保険レセプトCSVを生成しています...",
      })

      const response = await fetch('/api/monthly-receipts/export/care-insurance-batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ receiptIds: targetReceiptIds }),
      })

      if (!response.ok) {
        if (response.status === 404) {
          toast({
            title: "データなし",
            description: "該当するレセプトがありません",
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
      a.download = `care_receipts_${filterYear}${String(filterMonth).padStart(2, '0')}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

      // スキップされたレセプトがある場合は警告を表示
      const skippedReceiptsHeader = response.headers.get('X-Skipped-Receipts')
      if (skippedReceiptsHeader) {
        const skippedCount = skippedReceiptsHeader.split(',').length
        toast({
          title: "ダウンロード完了",
          description: `CSVファイルをダウンロードしました（${skippedCount}件のレセプトはデータ不足のためスキップされました）`,
        })
      } else {
        toast({
          title: "ダウンロード完了",
          description: "CSVファイルをダウンロードしました",
        })
      }
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

  // 審査支払機関コードから社保/国保を判定する関数
  const determineInsuranceCategory = (receipt: MonthlyReceipt): '社保' | '国保' | '介護保険' | null => {
    if (receipt.insuranceType === 'care') {
      return '介護保険'
    }
    
    if (receipt.insuranceType === 'medical') {
      // 審査支払機関コードから判定
      if (receipt.insuranceCard?.reviewOrganizationCode === '1') {
        return '社保'
      }
      if (receipt.insuranceCard?.reviewOrganizationCode === '2') {
        return '国保'
      }
      
      // 審査支払機関コードが設定されていない場合は保険者番号から判定
      if (receipt.insuranceCard?.insurerNumber) {
        const insurerNumber = receipt.insuranceCard.insurerNumber.trim()
        const length = insurerNumber.length
        const prefix = insurerNumber.substring(0, 2)
        
        // 6桁 → 国保連 ('2')
        if (length === 6) {
          return '国保'
        }
        
        // 8桁の場合
        if (length === 8) {
          // 後期高齢者医療（39で始まる） → 国保連 ('2')
          if (prefix === '39') {
            return '国保'
          }
          // その他の8桁 → 社保 ('1')
          return '社保'
        }
      }
    }
    
    return null
  }

  // 未集計理由を取得する関数
  const getUncategorizedReason = (receipt: MonthlyReceipt): string => {
    if (receipt.insuranceType === 'care') {
      // 介護保険の場合
      if (!receipt.insuranceCard) {
        return '保険証情報が取得できませんでした'
      }
      return '保険種別の判定ができませんでした'
    }
    
    if (receipt.insuranceType === 'medical') {
      // 医療保険の場合
      if (!receipt.insuranceCard) {
        return '保険証情報が取得できませんでした'
      }
      
      if (!receipt.insuranceCard.insurerNumber) {
        return '保険者番号が設定されていません'
      }
      
      const insurerNumber = receipt.insuranceCard.insurerNumber.trim()
      const length = insurerNumber.length
      
      // 6桁または8桁以外の形式
      if (length !== 6 && length !== 8) {
        return `保険者番号の形式が不正です（${length}桁）`
      }
      
      return '保険種別の判定ができませんでした'
    }
    
    return '保険種別の判定ができませんでした'
  }

  // 集計されなかったレセプトを取得する関数
  const getUncategorizedReceipts = (): Array<{ receipt: MonthlyReceipt; reason: string }> => {
    const uncategorized: Array<{ receipt: MonthlyReceipt; reason: string }> = []
    
    receipts.forEach(receipt => {
      const category = determineInsuranceCategory(receipt)
      if (!category) {
        uncategorized.push({
          receipt,
          reason: getUncategorizedReason(receipt)
        })
      }
    })
    
    return uncategorized
  }

  // 保険種別ごとの合計を計算
  const calculateSummary = () => {
    const summary = {
      '社保': { totalPoints: 0, totalAmount: 0, count: 0 },
      '国保': { totalPoints: 0, totalAmount: 0, count: 0 },
      '介護保険': { totalPoints: 0, totalAmount: 0, count: 0 },
    }

    receipts.forEach(receipt => {
      const category = determineInsuranceCategory(receipt)
      if (category) {
        summary[category].totalPoints += receipt.totalPoints
        summary[category].totalAmount += receipt.totalAmount
        summary[category].count += 1
      }
    })

    return summary
  }

  const summary = calculateSummary()
  const uncategorizedReceipts = getUncategorizedReceipts()

  // 合計件数の検証
  const getSummaryValidation = () => {
    const medicalReceipts = receipts.filter(r => r.insuranceType === 'medical')
    const careReceipts = receipts.filter(r => r.insuranceType === 'care')
    
    const medicalTotal = summary['社保'].count + summary['国保'].count
    const medicalUncategorized = uncategorizedReceipts.filter(r => r.receipt.insuranceType === 'medical').length
    const careUncategorized = uncategorizedReceipts.filter(r => r.receipt.insuranceType === 'care').length
    
    return {
      medical: {
        totalInList: medicalReceipts.length,
        totalInSummary: medicalTotal,
        uncategorized: medicalUncategorized,
        hasMismatch: medicalReceipts.length !== medicalTotal
      },
      care: {
        totalInList: careReceipts.length,
        totalInSummary: summary['介護保険'].count,
        uncategorized: careUncategorized,
        hasMismatch: careReceipts.length !== summary['介護保険'].count
      }
    }
  }

  const validation = getSummaryValidation()

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
                  <SelectItem value="medical">医療保険</SelectItem>
                  <SelectItem value="care">介護保険</SelectItem>
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
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 医療保険（社保） */}
        {(summary['社保'].count > 0 || filterInsuranceType === 'medical') && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">医療保険（社保）</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 pb-3">
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">件数</span>
                  <span className="font-semibold text-sm">{summary['社保'].count}件</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">合計点数</span>
                  <span className="font-semibold text-sm">{summary['社保'].totalPoints.toLocaleString()}点</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">合計金額</span>
                  <span className="font-semibold text-sm">¥{summary['社保'].totalAmount.toLocaleString()}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 医療保険（国保） */}
        {(summary['国保'].count > 0 || filterInsuranceType === 'medical') && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">医療保険（国保）</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 pb-3">
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">件数</span>
                  <span className="font-semibold text-sm">{summary['国保'].count}件</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">合計点数</span>
                  <span className="font-semibold text-sm">{summary['国保'].totalPoints.toLocaleString()}点</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">合計金額</span>
                  <span className="font-semibold text-sm">¥{summary['国保'].totalAmount.toLocaleString()}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 医療保険の未集計警告カード */}
        {filterInsuranceType === 'medical' && validation.medical.hasMismatch && (
          <Card className="border-yellow-500 bg-yellow-50">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-600" />
                <CardTitle className="text-base text-yellow-800">未集計レセプト</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0 pb-3">
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">未集計件数: </span>
                  <span className="font-semibold text-yellow-700">{validation.medical.uncategorized}件</span>
                </div>
                <Collapsible>
                  <CollapsibleTrigger className="text-xs text-yellow-700 hover:text-yellow-800 flex items-center gap-1 font-medium">
                    <AlertTriangle className="w-3 h-3" />
                    詳細を表示
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 pt-2 border-t border-yellow-300">
                    <div className="space-y-2 text-xs">
                      {uncategorizedReceipts
                        .filter(r => r.receipt.insuranceType === 'medical')
                        .map((r, idx) => (
                          <div key={idx} className="text-yellow-800">
                            <div className="font-medium">
                              {r.receipt.patient ? `${r.receipt.patient.lastName} ${r.receipt.patient.firstName}` : '不明'}
                            </div>
                            <div className="text-xs text-yellow-700 ml-2">{r.reason}</div>
                          </div>
                        ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 介護保険 */}
        {(summary['介護保険'].count > 0 || filterInsuranceType === 'care') && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">介護保険</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 pb-3">
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">件数</span>
                  <span className="font-semibold text-sm">{summary['介護保険'].count}件</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">合計点数</span>
                  <span className="font-semibold text-sm">{summary['介護保険'].totalPoints.toLocaleString()}単位</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">合計金額</span>
                  <span className="font-semibold text-sm">¥{summary['介護保険'].totalAmount.toLocaleString()}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 介護保険の未集計警告カード */}
        {filterInsuranceType === 'care' && validation.care.hasMismatch && (
          <Card className="border-yellow-500 bg-yellow-50">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-600" />
                <CardTitle className="text-base text-yellow-800">未集計レセプト</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0 pb-3">
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">未集計件数: </span>
                  <span className="font-semibold text-yellow-700">{validation.care.uncategorized}件</span>
                </div>
                <Collapsible>
                  <CollapsibleTrigger className="text-xs text-yellow-700 hover:text-yellow-800 flex items-center gap-1 font-medium">
                    <AlertTriangle className="w-3 h-3" />
                    詳細を表示
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 pt-2 border-t border-yellow-300">
                    <div className="space-y-2 text-xs">
                      {uncategorizedReceipts
                        .filter(r => r.receipt.insuranceType === 'care')
                        .map((r, idx) => (
                          <div key={idx} className="text-yellow-800">
                            <div className="font-medium">
                              {r.receipt.patient ? `${r.receipt.patient.lastName} ${r.receipt.patient.firstName}` : '不明'}
                            </div>
                            <div className="text-xs text-yellow-700 ml-2">{r.reason}</div>
                          </div>
                        ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Receipts Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>レセプト一覧</CardTitle>
              <CardDescription>
                {receipts.length}件のレセプト
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleDownloadListCSV}
                className="gap-2"
              >
                <FileSpreadsheet className="w-4 h-4" />
                一覧CSV出力
              </Button>
              {filterInsuranceType === 'medical' && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleDownloadMedicalInsuranceBatchCSV}
                  className="gap-2"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  医療保険レセプトデータ出力
                </Button>
              )}
              {filterInsuranceType === 'care' && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleDownloadCareInsuranceBatchCSV}
                  className="gap-2"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  介護保険レセプトデータ出力
                </Button>
              )}
            </div>
          </div>
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
                    <TableHead>CSV出力</TableHead>
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
                      <TableCell>
                        {receipt.csvExportReady ? (
                          <Badge variant="default" className="gap-1">
                            <CheckCircle className="w-3 h-3" />
                            準備完了
                          </Badge>
                        ) : receipt.csvExportWarnings && receipt.csvExportWarnings.length > 0 ? (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            不足あり
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1">
                            <XCircle className="w-3 h-3" />
                            未チェック
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {!receipt.isConfirmed && (
                            <>
                              <Tooltip>
                                <TooltipTrigger asChild>
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
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>訪問記録の加算を再計算して<br />レセプトの点数・金額を更新します</p>
                                </TooltipContent>
                              </Tooltip>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  // 現在のクエリパラメータを保持して詳細画面に遷移
                                  const currentParams = new URLSearchParams(window.location.search)
                                  const queryString = currentParams.toString()
                                  setLocation(`${basePath}/monthly-receipts/${receipt.id}${queryString ? `?${queryString}` : ''}`)
                                }}
                                className="gap-1"
                              >
                                <Eye className="w-3 h-3" />
                                詳細
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
                                onClick={() => {
                                  // 現在のクエリパラメータを保持して詳細画面に遷移
                                  const currentParams = new URLSearchParams(window.location.search)
                                  const queryString = currentParams.toString()
                                  setLocation(`${basePath}/monthly-receipts/${receipt.id}${queryString ? `?${queryString}` : ''}`)
                                }}
                                className="gap-1"
                              >
                                <Eye className="w-3 h-3" />
                                詳細
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

          {/* レセプト生成条件の表示 */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>レセプトが生成される条件</AlertTitle>
            <AlertDescription className="mt-2 space-y-2">
              <p>以下の条件を満たす患者のレセプトが生成されます。</p>
              <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground pl-1 mt-2">
                <li>対象年月に「完了」または「確認済み」ステータスの訪問記録が存在すること</li>
                <li>患者が指定された保険種別（医療保険/介護保険）の保険証を持っていること</li>
                <li>同じ対象年月・保険種別の確定済みレセプトが存在しないこと（既存の未確定レセプトは更新されます）</li>
              </ul>
            </AlertDescription>
          </Alert>

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
                  <SelectItem value="medical">医療保険</SelectItem>
                  <SelectItem value="care">介護保険</SelectItem>
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
