import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useRoute, useLocation } from "wouter"
import { useBasePath } from "@/hooks/useBasePath"
import { useState, useEffect } from "react"
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
import { PatientForm } from "@/components/PatientForm"
import { PublicExpenseCardDialog } from "@/components/PublicExpenseCardDialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
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
  FileSpreadsheet,
} from "lucide-react"
import { Combobox } from "@/components/ui/combobox"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { masterDataApi, type NursingServiceCode } from "@/lib/api"

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
  // 一部負担金額・減免情報（HOレコード用）
  partialBurdenAmount: number | null
  reductionCategory: '1' | '2' | '3' | null
  reductionRate: number | null
  reductionAmount: number | null
  certificateNumber: string | null
  // ⭐ 追加: 公費一部負担情報（KOレコード用）
  publicExpenseBurdenInfo: {
    [publicExpenseCardId: string]: {
      partialBurdenAmount: number | null
      publicExpenseBurdenAmount: number | null
    }
  } | null
  // 高額療養費適用状況（MFレコード用）
  highCostCategory: 'high_cost' | 'high_cost_multiple' | null
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
  publicExpenseCards: Array<{
    id: string
    legalCategoryNumber: string
    beneficiaryNumber: string
    recipientNumber: string
    priority: number
    validFrom: string
    validUntil: string | null
    notes: string | null
  }>
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
      serviceCodeId: string | null
    }
    bonus: {
      id: string
      bonusCode: string
      bonusName: string
      bonusCategory: string
      insuranceType: string
    } | null
    serviceCode: {
      id: string
      serviceCode: string
      serviceName: string
      points: number
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
  const [patientFormOpen, setPatientFormOpen] = useState(false)
  const [publicExpenseCardDialogOpen, setPublicExpenseCardDialogOpen] = useState(false)
  const [editingPublicExpenseCard, setEditingPublicExpenseCard] = useState<{
    id: string
    patientId: string
    facilityId: string
    beneficiaryNumber: string
    recipientNumber: string | null
    legalCategoryNumber: string
    priority: number
    benefitRate: number | null
    validFrom: string
    validUntil: string | null
    notes: string | null
    isActive: boolean
    createdAt: Date
    updatedAt: Date
  } | null>(null)
  const [validationDialogOpen, setValidationDialogOpen] = useState(false)
  const [validationErrors, setValidationErrors] = useState<Array<{ recordType: string; message: string }>>([])
  const [validationWarnings, setValidationWarnings] = useState<Array<{ recordType: string; message: string }>>([])

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
    staleTime: 0,              // データを常に古いものとして扱う
    refetchOnMount: 'always',  // マウント時に常に再取得（キャッシュがあっても最新情報を取得）
  })

  // Fetch patient data for editing
  const { data: patientData, refetch: refetchPatientData } = useQuery({
    queryKey: [`/api/patients/${receipt?.patientId}`],
    queryFn: async () => {
      const response = await fetch(`/api/patients/${receipt?.patientId}`)
      if (!response.ok) {
        throw new Error("患者データの取得に失敗しました")
      }
      return response.json()
    },
    enabled: !!receipt?.patientId,
    staleTime: 0,              // データを常に古いものとして扱う
    refetchOnMount: 'always',  // マウント時に常に再取得（キャッシュがあっても最新情報を取得）
  })

  // ダイアログを開くときに患者データを再取得
  useEffect(() => {
    if (patientFormOpen && receipt?.patientId) {
      refetchPatientData()
    }
  }, [patientFormOpen, receipt?.patientId, refetchPatientData])

  // Fetch insurance card data for editing
  const { data: insuranceCardData, refetch: refetchInsuranceCardData } = useQuery({
    queryKey: [`/api/insurance-cards`, receipt?.patientId, receipt?.insuranceCard?.id],
    queryFn: async () => {
      if (!receipt?.patientId || !receipt?.insuranceCard?.id) return null
      const response = await fetch(`/api/insurance-cards?patientId=${receipt.patientId}`)
      if (!response.ok) {
        throw new Error("保険証データの取得に失敗しました")
      }
      const cards = await response.json()
      // 該当するIDの保険証を探す
      return cards.find((card: any) => card.id === receipt?.insuranceCard?.id) || null
    },
    enabled: !!receipt?.patientId && !!receipt?.insuranceCard?.id,
    staleTime: 0,
    refetchOnMount: 'always',
  })

  // Fetch doctor order data for editing
  const { data: doctorOrderData, refetch: refetchDoctorOrderData } = useQuery({
    queryKey: [`/api/doctor-orders`, receipt?.patientId, receipt?.doctorOrder?.order?.id],
    queryFn: async () => {
      if (!receipt?.patientId || !receipt?.doctorOrder?.order?.id) return null
      const response = await fetch(`/api/doctor-orders?patientId=${receipt.patientId}`)
      if (!response.ok) {
        throw new Error("訪問看護指示書データの取得に失敗しました")
      }
      const orders = await response.json()
      // 該当するIDの訪問看護指示書を探す
      return orders.find((order: any) => order.id === receipt?.doctorOrder?.order?.id) || null
    },
    enabled: !!receipt?.patientId && !!receipt?.doctorOrder?.order?.id,
    staleTime: 0,
    refetchOnMount: 'always',
  })

  // ダイアログを開くときに保険証データを再取得
  useEffect(() => {
    if (insuranceCardDialogOpen && receipt?.patientId && receipt?.insuranceCard?.id) {
      refetchInsuranceCardData()
    }
  }, [insuranceCardDialogOpen, receipt?.patientId, receipt?.insuranceCard?.id, refetchInsuranceCardData])

  // ダイアログを開くときに訪問看護指示書データを再取得
  useEffect(() => {
    if (doctorOrderDialogOpen && receipt?.patientId && receipt?.doctorOrder?.order?.id) {
      refetchDoctorOrderData()
    }
  }, [doctorOrderDialogOpen, receipt?.patientId, receipt?.doctorOrder?.order?.id, refetchDoctorOrderData])

  // Fetch public expense cards for editing
  const { data: publicExpenseCards = [] } = useQuery<Array<{
    id: string
    patientId: string
    facilityId: string
    beneficiaryNumber: string
    recipientNumber: string | null
    legalCategoryNumber: string
    priority: number
    benefitRate: number | null
    validFrom: string
    validUntil: string | null
    notes: string | null
    isActive: boolean
    createdAt: Date
    updatedAt: Date
  }>>({
    queryKey: [`/api/public-expense-cards`, receipt?.patientId],
    queryFn: async () => {
      const response = await fetch(`/api/public-expense-cards?patientId=${receipt?.patientId}`)
      if (!response.ok) {
        throw new Error("公費情報の取得に失敗しました")
      }
      return response.json()
    },
    enabled: !!receipt?.patientId,
  })

  // ローカル状態（一部負担金額・減免情報用）
  const [localPartialBurdenAmount, setLocalPartialBurdenAmount] = useState<number | null>(null);
  const [localReductionCategory, setLocalReductionCategory] = useState<'1' | '2' | '3' | null>(null);
  const [localReductionRate, setLocalReductionRate] = useState<number | null>(null);
  const [localReductionAmount, setLocalReductionAmount] = useState<number | null>(null);
  const [localCertificateNumber, setLocalCertificateNumber] = useState<string | null>(null);

  // ⭐ 追加: 公費一部負担情報のローカル状態（公費IDをキーとしたマップ）
  const [localPublicExpenseBurdenInfo, setLocalPublicExpenseBurdenInfo] = useState<{
    [publicExpenseCardId: string]: {
      partialBurdenAmount: number | null;
      publicExpenseBurdenAmount: number | null;
    };
  }>({});

  // 高額療養費適用状況のローカル状態（MFレコード用）
  const [localHighCostCategory, setLocalHighCostCategory] = useState<'high_cost' | 'high_cost_multiple' | null>(null);

  // receiptが変更されたときにローカル状態を更新
  useEffect(() => {
    if (receipt) {
      setLocalPartialBurdenAmount(receipt.partialBurdenAmount || null);
      setLocalReductionCategory(receipt.reductionCategory || null);
      setLocalReductionRate(receipt.reductionRate || null);
      setLocalReductionAmount(receipt.reductionAmount || null);
      setLocalCertificateNumber(receipt.certificateNumber || null);
      // ⭐ 追加: 公費一部負担情報のローカル状態を更新
      setLocalPublicExpenseBurdenInfo(receipt.publicExpenseBurdenInfo || {});
      // 高額療養費適用状況のローカル状態を更新
      // receiptの値とローカル状態が異なる場合のみ更新（APIリクエスト中の上書きを防ぐ）
      const receiptValue = receipt.highCostCategory || null;
      if (receiptValue !== localHighCostCategory) {
        setLocalHighCostCategory(receiptValue);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt]);

  // Update receipt mutation (一部負担金額・減免情報用)
  const updateReceiptMutation = useMutation({
    mutationFn: async (data: Partial<MonthlyReceiptDetail>) => {
      const response = await fetch(`/api/monthly-receipts/${receiptId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '更新に失敗しました');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/monthly-receipts/${receiptId}`] });
      toast({
        title: "更新しました",
        description: "一部負担金額・減免情報を更新しました",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "エラー",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // onBlur時の保存処理
  const handleSaveBurdenInfo = () => {
    if (!receipt) return;
    
    const hasChanges = 
      localPartialBurdenAmount !== receipt.partialBurdenAmount ||
      localReductionCategory !== receipt.reductionCategory ||
      localReductionRate !== receipt.reductionRate ||
      localReductionAmount !== receipt.reductionAmount ||
      localCertificateNumber !== receipt.certificateNumber ||
      localHighCostCategory !== receipt.highCostCategory;

    if (hasChanges) {
      updateReceiptMutation.mutate({
        partialBurdenAmount: localPartialBurdenAmount,
        reductionCategory: localReductionCategory,
        reductionRate: localReductionCategory === '1' ? localReductionRate : null,
        reductionAmount: localReductionCategory === '1' ? localReductionAmount : null,
        certificateNumber: localCertificateNumber,
        highCostCategory: localHighCostCategory,
      });
    }
  };

  // ⭐ 追加: 公費一部負担情報の保存処理（onBlur時）
  const handleSavePublicExpenseBurdenInfo = (publicExpenseCardId: string) => {
    if (!receipt) return;

    const currentInfo = receipt.publicExpenseBurdenInfo || {};
    const localInfo = localPublicExpenseBurdenInfo[publicExpenseCardId] || { partialBurdenAmount: null, publicExpenseBurdenAmount: null };
    const currentCardInfo = currentInfo[publicExpenseCardId] || { partialBurdenAmount: null, publicExpenseBurdenAmount: null };

    const hasChanges = 
      localInfo.partialBurdenAmount !== currentCardInfo.partialBurdenAmount ||
      localInfo.publicExpenseBurdenAmount !== currentCardInfo.publicExpenseBurdenAmount;

    if (hasChanges) {
      // 既存の情報とマージ
      const updatedInfo = {
        ...currentInfo,
        [publicExpenseCardId]: {
          partialBurdenAmount: localInfo.partialBurdenAmount,
          publicExpenseBurdenAmount: localInfo.publicExpenseBurdenAmount,
        },
      };

      updateReceiptMutation.mutate({
        publicExpenseBurdenInfo: updatedInfo,
      });
    }
  };

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

      // バリデーションエラー・警告の処理（レセプト詳細画面に表示されるためダイアログは不要）
      const totalErrors = (data.errors?.length || 0) + (data.validation?.errors?.length || 0)
      const totalWarnings = (data.warnings?.length || 0) + (data.validation?.warnings?.length || 0) + (data.missingSuggestions?.length || 0)

      if (totalErrors > 0) {
        toast({
          title: "検証完了 - エラーあり",
          description: `${totalErrors}件のエラーが見つかりました`,
          variant: "destructive",
        })
      } else if (totalWarnings > 0) {
        toast({
          title: "検証完了 - 警告あり",
          description: `${totalWarnings}件の警告があります`,
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

  // CSV出力関数
  const handleDownloadCSV = async () => {
    try {
      toast({
        title: "CSV生成中",
        description: "医療保険レセプトCSVを生成しています...",
      })

      const response = await fetch(`/api/receipts/${receiptId}/export-csv`)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'CSVの生成に失敗しました' }))

        // バリデーション詳細がある場合はダイアログで表示（エラートーストは不要）
        if (errorData.validation) {
          const { errors, warnings } = errorData.validation

          setValidationErrors(errors || [])
          setValidationWarnings(warnings || [])
          setValidationDialogOpen(true)
          return
        }

        throw new Error(errorData.error || 'CSVの生成に失敗しました')
      }

      // CSVファイルとしてダウンロード（訪問看護療養費オンライン請求仕様に準拠）
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'RECEIPTH.UKE'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast({
        title: "CSV生成完了",
        description: "医療保険レセプトCSVのダウンロードが完了しました",
      })
    } catch (error) {
      console.error("CSV generation error:", error)
      toast({
        title: "CSV生成エラー",
        description: error instanceof Error ? error.message : "CSVの生成に失敗しました",
        variant: "destructive",
      })
    }
  }

  // Excel出力関数
  const handleDownloadExcel = async () => {
    try {
      toast({
        title: "Excel生成中",
        description: "訪問看護療養費明細書Excelを生成しています...",
      })

      const response = await fetch(`/api/receipts/${receiptId}/export-excel`)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Excelの生成に失敗しました' }))

        // バリデーション詳細がある場合はダイアログで表示（エラートーストは不要）
        if (errorData.validation) {
          const { errors, warnings } = errorData.validation

          setValidationErrors(errors || [])
          setValidationWarnings(warnings || [])
          setValidationDialogOpen(true)
          return
        }

        throw new Error(errorData.error || 'Excelの生成に失敗しました')
      }

      // Excelファイルとしてダウンロード
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      // Content-Dispositionヘッダーからファイル名を取得、なければデフォルト名を使用
      const contentDisposition = response.headers.get('Content-Disposition')
      const fileName = contentDisposition
        ? contentDisposition.split('filename=')[1]?.replace(/"/g, '') || 'receipt.xlsx'
        : 'receipt.xlsx'
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast({
        title: "Excel生成完了",
        description: "訪問看護療養費明細書Excelのダウンロードが完了しました",
      })
    } catch (error) {
      console.error("Excel generation error:", error)
      toast({
        title: "Excel生成エラー",
        description: error instanceof Error ? error.message : "Excelの生成に失敗しました",
        variant: "destructive",
      })
    }
  }

  // PDF生成関数（サーバー側でPDFを生成）
  const handleDownloadPDF = async () => {
    try {
      toast({
        title: "PDF生成中",
        description: "レセプトPDFを生成しています...",
      })

      const response = await fetch(`/api/monthly-receipts/${receiptId}/pdf`)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "PDF生成に失敗しました" }))
        throw new Error(errorData.error || "PDF生成に失敗しました")
      }

      // PDFバイナリを取得
      const blob = await response.blob()

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
              onClick={() => {
                // URLクエリパラメータを保持して一覧画面に戻る
                const currentParams = new URLSearchParams(window.location.search)
                const queryString = currentParams.toString()
                setLocation(`${basePath}/monthly-receipts${queryString ? `?${queryString}` : ''}`)
              }}
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
          {receipt.insuranceType === 'medical' && (
            <>
              <Button
                variant="outline"
                size="default"
                onClick={handleDownloadCSV}
                className="gap-2"
              >
                <FileSpreadsheet className="w-4 h-4" />
                医療保険レセプトCSV出力
              </Button>
              <Button
                variant="outline"
                size="default"
                onClick={handleDownloadExcel}
                className="gap-2"
              >
                <FileSpreadsheet className="w-4 h-4" />
                訪問看護療養費明細書Excel出力
              </Button>
            </>
          )}
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
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              利用者情報
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPatientFormOpen(true)}
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
              <div className="text-sm text-muted-foreground">患者番号</div>
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
              {(receipt.insuranceCard as any).relationshipType && (
                <div>
                  <div className="text-sm text-muted-foreground">本人家族区分</div>
                  <div className="font-medium">
                    {(receipt.insuranceCard as any).relationshipType === 'self' ? '本人' :
                     (receipt.insuranceCard as any).relationshipType === 'preschool' ? '未就学者' :
                     (receipt.insuranceCard as any).relationshipType === 'family' ? '家族' :
                     (receipt.insuranceCard as any).relationshipType === 'elderly_general' ? '高齢受給者一般・低所得者' :
                     (receipt.insuranceCard as any).relationshipType === 'elderly_70' ? '高齢受給者7割' : '-'}
                  </div>
                </div>
              )}
              {(receipt.insuranceCard as any).ageCategory && (
                <div>
                  <div className="text-sm text-muted-foreground">年齢区分</div>
                  <div className="font-medium">
                    {(receipt.insuranceCard as any).ageCategory === 'preschool' ? '未就学者（6歳未満）' :
                     (receipt.insuranceCard as any).ageCategory === 'general' ? '一般' :
                     (receipt.insuranceCard as any).ageCategory === 'elderly' ? '高齢者（75歳以上）' : '-'}
                  </div>
                </div>
              )}
              {(receipt.insuranceCard as any).elderlyRecipientCategory && (
                <div>
                  <div className="text-sm text-muted-foreground">高齢受給者区分</div>
                  <div className="font-medium">
                    {(receipt.insuranceCard as any).elderlyRecipientCategory === 'general_low' ? '一般・低所得者（2割負担）' :
                     (receipt.insuranceCard as any).elderlyRecipientCategory === 'seventy' ? '7割負担（現役並み所得者）' : '-'}
                  </div>
                </div>
              )}
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
              {(receipt.doctorOrder.order as any).insuranceType && (
                <div>
                  <div className="text-sm text-muted-foreground">保険種別</div>
                  <div className="font-medium">
                    {(receipt.doctorOrder.order as any).insuranceType === 'medical' ? '医療保険' :
                     (receipt.doctorOrder.order as any).insuranceType === 'care' ? '介護保険' : '-'}
                  </div>
                </div>
              )}
              {(receipt.doctorOrder.order as any).instructionType && (
                <div>
                  <div className="text-sm text-muted-foreground">指示区分</div>
                  <div className="font-medium">
                    {(receipt.doctorOrder.order as any).instructionType === 'regular' ? '訪問看護指示書' :
                     (receipt.doctorOrder.order as any).instructionType === 'special' ? '特別訪問看護指示書' :
                     (receipt.doctorOrder.order as any).instructionType === 'psychiatric' ? '精神科訪問看護指示書' :
                     (receipt.doctorOrder.order as any).instructionType === 'psychiatric_special' ? '精神科特別訪問看護指示書' :
                     (receipt.doctorOrder.order as any).instructionType === 'medical_observation' ? '医療観察精神科訪問看護指示' :
                     (receipt.doctorOrder.order as any).instructionType === 'medical_observation_special' ? '医療観察精神科特別訪問看護指示' : '-'}
                  </div>
                </div>
              )}
              <div className="md:col-span-2">
                <div className="text-sm text-muted-foreground">病名</div>
                <div className="font-medium">{receipt.doctorOrder.order.diagnosis}</div>
              </div>
              {(receipt.doctorOrder.order as any).icd10Code && (
                <div>
                  <div className="text-sm text-muted-foreground">ICD-10コード</div>
                  <div className="font-medium">{(receipt.doctorOrder.order as any).icd10Code}</div>
                </div>
              )}
              {(receipt.doctorOrder.order as any).hasInfusionInstruction !== undefined && (
                <div>
                  <div className="text-sm text-muted-foreground">点滴注射指示</div>
                  <div className="font-medium">
                    {(receipt.doctorOrder.order as any).hasInfusionInstruction ? 'はい' : 'いいえ'}
                  </div>
                </div>
              )}
              {(receipt.doctorOrder.order as any).hasPressureUlcerTreatment !== undefined && (
                <div>
                  <div className="text-sm text-muted-foreground">床ずれ処置</div>
                  <div className="font-medium">
                    {(receipt.doctorOrder.order as any).hasPressureUlcerTreatment ? 'はい' : 'いいえ'}
                  </div>
                </div>
              )}
              {(receipt.doctorOrder.order as any).hasHomeInfusionManagement !== undefined && (
                <div>
                  <div className="text-sm text-muted-foreground">在宅患者訪問点滴注射管理指導料</div>
                  <div className="font-medium">
                    {(receipt.doctorOrder.order as any).hasHomeInfusionManagement ? 'はい' : 'いいえ'}
                  </div>
                </div>
              )}
              <div className="md:col-span-2">
                <div className="text-sm text-muted-foreground">指示内容</div>
                <div className="font-medium whitespace-pre-wrap">{receipt.doctorOrder.order.orderContent}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Public Expense Cards Information */}
      {receipt.publicExpenseCards && receipt.publicExpenseCards.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              公費負担医療情報
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {receipt.publicExpenseCards.map((card, index) => {
                // 編集対象の公費カードを取得
                const fullCardData = publicExpenseCards.find(c => c.id === card.id)
                
                return (
                <div key={card.id}>
                  {index > 0 && <Separator className="my-4" />}
                  <div className="flex items-start justify-between mb-4">
                    <div className="text-sm font-semibold text-muted-foreground">
                      公費負担医療 {card.priority}（優先順位{card.priority}）
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (fullCardData) {
                          setEditingPublicExpenseCard(fullCardData)
                          setPublicExpenseCardDialogOpen(true)
                        }
                      }}
                      disabled={receipt.isConfirmed || !fullCardData}
                      className="gap-2"
                    >
                      <Edit className="w-4 h-4" />
                      編集
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-muted-foreground">優先順位</div>
                      <div className="font-medium">{card.priority}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">法別番号</div>
                      <div className="font-medium">{card.legalCategoryNumber}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">負担者番号</div>
                      <div className="font-medium">{card.beneficiaryNumber}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">受給者番号</div>
                      <div className="font-medium">{card.recipientNumber}</div>
                    </div>
                    <div className="md:col-span-2">
                      <div className="text-sm text-muted-foreground">有効期間</div>
                      <div className="font-medium">
                        {card.validFrom} 〜 {card.validUntil || '期限なし'}
                      </div>
                    </div>
                    {card.notes && (
                      <div className="md:col-span-2">
                        <div className="text-sm text-muted-foreground">備考</div>
                        <div className="font-medium whitespace-pre-wrap">{card.notes}</div>
                      </div>
                    )}
                  </div>

                  {/* ⭐ 追加: 一部負担金額・公費給付情報（KOレコード用） */}
                  <Separator className="my-4" />
                  <div className="space-y-4">
                    <div className="text-sm font-semibold text-muted-foreground">一部負担金額・公費給付情報（KOレコード用）</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor={`partialBurdenAmount-${card.id}`}>一部負担金額（円）</Label>
                        <Input
                          id={`partialBurdenAmount-${card.id}`}
                          type="number"
                          min="0"
                          max="99999999"
                          value={localPublicExpenseBurdenInfo[card.id]?.partialBurdenAmount || ''}
                          onChange={(e) => {
                            const value = e.target.value === '' ? null : parseInt(e.target.value, 10);
                            // 8桁制限（99,999,999まで）
                            if (value !== null && (value < 0 || value > 99999999)) {
                              return;
                            }
                            setLocalPublicExpenseBurdenInfo(prev => ({
                              ...prev,
                              [card.id]: {
                                ...prev[card.id],
                                partialBurdenAmount: value,
                              },
                            }));
                          }}
                          onBlur={() => handleSavePublicExpenseBurdenInfo(card.id)}
                          disabled={receipt.isConfirmed || updateReceiptMutation.isPending}
                          placeholder="例: 50000（8桁以内）"
                        />
                      </div>
                      <div>
                        <Label htmlFor={`publicExpenseBurdenAmount-${card.id}`}>公費給付対象一部負担金（円）</Label>
                        <Input
                          id={`publicExpenseBurdenAmount-${card.id}`}
                          type="number"
                          min="0"
                          max="999999"
                          value={localPublicExpenseBurdenInfo[card.id]?.publicExpenseBurdenAmount || ''}
                          onChange={(e) => {
                            const value = e.target.value === '' ? null : parseInt(e.target.value, 10);
                            // 6桁制限（999,999まで）
                            if (value !== null && (value < 0 || value > 999999)) {
                              return;
                            }
                            setLocalPublicExpenseBurdenInfo(prev => ({
                              ...prev,
                              [card.id]: {
                                ...prev[card.id],
                                publicExpenseBurdenAmount: value,
                              },
                            }));
                          }}
                          onBlur={() => handleSavePublicExpenseBurdenInfo(card.id)}
                          disabled={receipt.isConfirmed || updateReceiptMutation.isPending}
                          placeholder="例: 30000（6桁以内）"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                )
              })}
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
          </div>
        </CardContent>
      </Card>

      {/* 一部負担金額・減免情報セクション（医療保険のみ） */}
      {receipt.insuranceType === 'medical' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              一部負担金額・減免情報（HOレコード用）
            </CardTitle>
            <CardDescription>
              医療保険レセプトCSV出力用の情報です。確定済みのレセプトは編集できません。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* 証明書番号（国保の場合のみ表示） */}
              {receipt.insuranceCard?.insurerNumber?.startsWith('06') && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="certificateNumber">証明書番号</Label>
                    <Input
                      id="certificateNumber"
                      type="text"
                      maxLength={3}
                      value={localCertificateNumber || ''}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^0-9]/g, '');
                        setLocalCertificateNumber(value || null);
                      }}
                      onBlur={handleSaveBurdenInfo}
                      disabled={receipt.isConfirmed || updateReceiptMutation.isPending}
                      placeholder="3桁以内の数字"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      国民健康保険一部負担金減額、免除、徴収猶予証明書の証明書番号
                    </p>
                  </div>
                </div>
              )}

              {/* 一部負担金額・減免区分（横並び） */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="partialBurdenAmount">一部負担金額（円）</Label>
                  <Input
                    id="partialBurdenAmount"
                    type="number"
                    min="0"
                    max="99999999"
                    value={localPartialBurdenAmount || ''}
                    onChange={(e) => {
                      const value = e.target.value === '' ? null : parseInt(e.target.value, 10);
                      // 8桁制限（99,999,999まで）
                      if (value !== null && (value < 0 || value > 99999999)) {
                        return;
                      }
                      setLocalPartialBurdenAmount(value);
                    }}
                    onBlur={handleSaveBurdenInfo}
                    disabled={receipt.isConfirmed || updateReceiptMutation.isPending}
                    placeholder="例: 50000（8桁以内）"
                  />
                </div>
                <div>
                  <Label htmlFor="reductionCategory">減免区分</Label>
                  <Select
                    value={localReductionCategory || 'none'}
                    onValueChange={(value) => {
                      // CLAUDE.mdの推奨方法に従い、'none'を未選択として扱う
                      const category = value === 'none' ? null : value as '1' | '2' | '3';
                      setLocalReductionCategory(category);
                      if (category !== '1') {
                        setLocalReductionRate(null);
                        setLocalReductionAmount(null);
                      }
                    }}
                    onOpenChange={(open) => {
                      // Selectが閉じたときに保存
                      if (!open) {
                        handleSaveBurdenInfo();
                      }
                    }}
                    disabled={receipt.isConfirmed || updateReceiptMutation.isPending}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="選択してください" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">未選択</SelectItem>
                      <SelectItem value="1">減額</SelectItem>
                      <SelectItem value="2">免除</SelectItem>
                      <SelectItem value="3">支払猶予</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    別表9: 1=減額, 2=免除, 3=支払猶予
                  </p>
                </div>
              </div>

              {/* 減額割合・減額金額（減免区分が「減額」の場合のみ表示） */}
              {localReductionCategory === '1' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="reductionRate">減額割合（%）</Label>
                    <Input
                      id="reductionRate"
                      type="number"
                      min="0"
                      max="100"
                      value={localReductionRate || ''}
                      onChange={(e) => {
                        const value = e.target.value === '' ? null : parseInt(e.target.value, 10);
                        // 0-100%制限
                        if (value !== null && (value < 0 || value > 100)) {
                          return;
                        }
                        setLocalReductionRate(value);
                      }}
                      onBlur={handleSaveBurdenInfo}
                      disabled={receipt.isConfirmed || updateReceiptMutation.isPending}
                      placeholder="例: 50（0-100%）"
                    />
                  </div>
                  <div>
                    <Label htmlFor="reductionAmount">減額金額（円）</Label>
                    <Input
                      id="reductionAmount"
                      type="number"
                      min="0"
                      max="999999"
                      value={localReductionAmount || ''}
                      onChange={(e) => {
                        const value = e.target.value === '' ? null : parseInt(e.target.value, 10);
                        // 6桁制限（999,999まで）
                        if (value !== null && (value < 0 || value > 999999)) {
                          return;
                        }
                        setLocalReductionAmount(value);
                      }}
                      onBlur={handleSaveBurdenInfo}
                      disabled={receipt.isConfirmed || updateReceiptMutation.isPending}
                      placeholder="例: 30000（6桁以内）"
                    />
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 高額療養費適用状況セクション（医療保険のみ） */}
      {receipt.insuranceType === 'medical' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              高額療養費適用状況（MFレコード用）
            </CardTitle>
            <CardDescription>
              医療保険レセプトCSV出力用の情報です。確定済みのレセプトは編集できません。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="highCostCategory">高額療養費適用状況</Label>
                <Select
                  value={localHighCostCategory || 'none'}
                  onValueChange={(value) => {
                    // CLAUDE.mdの推奨方法に従い、'none'を未選択として扱う
                    const category = value === 'none' ? null : value as 'high_cost' | 'high_cost_multiple';
                    setLocalHighCostCategory(category);
                  }}
                  onOpenChange={(open) => {
                    // Selectが閉じたときに保存
                    if (!open) {
                      handleSaveBurdenInfo();
                    }
                  }}
                  disabled={receipt.isConfirmed || updateReceiptMutation.isPending}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">高額療養費該当なし</SelectItem>
                    <SelectItem value="high_cost">高額療養費現物給付あり（多数回該当を除く）</SelectItem>
                    <SelectItem value="high_cost_multiple">高額療養費現物給付あり（多数回該当）</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  高額療養費制度の適用状況を選択してください。
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* サービスコード選択セクション（未選択・選択済み両方） */}
      {(() => {
        const allBonuses = receipt.bonusHistory.filter(item => item.bonus);
        // serviceCodeIdが存在し、かつserviceCodeオブジェクトも存在する場合のみ選択済みとする
        const selectedBonuses = allBonuses.filter(item => item.history.serviceCodeId && item.serviceCode);
        const unselectedBonuses = allBonuses.filter(item => !item.history.serviceCodeId || !item.serviceCode);

        if (allBonuses.length === 0) return null;

        return (
          <>
            {/* 選択済みのサービスコードセクション */}
            {selectedBonuses.length > 0 && (
              <SelectedBonusServiceCodeSection
                bonuses={selectedBonuses}
                receiptId={receipt.id}
                insuranceType={receipt.insuranceType}
                relatedRecords={receipt.relatedRecords}
                onUpdate={async () => {
                  await queryClient.invalidateQueries({ queryKey: [`/api/monthly-receipts/${receiptId}`] });
                  await queryClient.refetchQueries({ queryKey: [`/api/monthly-receipts/${receiptId}`] });
                }}
              />
            )}

            {/* サービスコード未選択の加算セクション */}
            {unselectedBonuses.length > 0 && (
              <UnselectedBonusServiceCodeSection
                bonuses={unselectedBonuses}
                receiptId={receipt.id}
                insuranceType={receipt.insuranceType}
                relatedRecords={receipt.relatedRecords}
                onUpdate={async () => {
                  await queryClient.invalidateQueries({ queryKey: [`/api/monthly-receipts/${receiptId}`] });
                  await queryClient.refetchQueries({ queryKey: [`/api/monthly-receipts/${receiptId}`] });
                }}
              />
            )}
          </>
        );
      })()}

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
                  {[...receipt.relatedRecords]
                    .sort((a, b) => {
                      // 訪問日で比較
                      const dateA = a.visitDate || ''
                      const dateB = b.visitDate || ''
                      if (dateA !== dateB) {
                        return dateA.localeCompare(dateB)
                      }
                      
                      // 同じ日付の場合は開始時間で比較
                      const timeA = a.actualStartTime || a.schedule?.startTime || ''
                      const timeB = b.actualStartTime || b.schedule?.startTime || ''
                      return timeA.localeCompare(timeB)
                    })
                    .map((record) => {
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
                          ) : record.status === 'reviewed' ? (
                            <Badge variant="secondary" className="gap-1">
                              <CheckCircle className="w-3 h-3" />
                              確認済み
                            </Badge>
                          ) : record.status === 'draft' ? (
                            <Badge variant="outline">下書き</Badge>
                          ) : (
                            <Badge variant="outline">{record.status}</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {recordBonuses.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {recordBonuses.map((b) => (
                                <Badge key={b.history.id} variant="outline" className="text-xs">
                                  {b.bonus?.bonusName} ({b.history.calculatedPoints}{receipt.insuranceType === "medical" ? "点" : "単位"})
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
      {/* Patient Form Dialog */}
      {receipt && (
        <PatientForm
          isOpen={patientFormOpen}
          onClose={async () => {
            setPatientFormOpen(false)
            // 編集完了後はレセプトデータと患者データを再取得
            await queryClient.invalidateQueries({ queryKey: [`/api/monthly-receipts/${receiptId}`] })
            await queryClient.invalidateQueries({ queryKey: [`/api/patients/${receipt?.patientId}`] })
            await queryClient.refetchQueries({ queryKey: [`/api/monthly-receipts/${receiptId}`] })
            await queryClient.refetchQueries({ queryKey: [`/api/patients/${receipt?.patientId}`] })
          }}
          patient={patientData || null}
          mode="edit"
        />
      )}

      {receipt.insuranceCard && insuranceCardData && (
        <InsuranceCardDialog
          open={insuranceCardDialogOpen}
          onOpenChange={async (open) => {
            setInsuranceCardDialogOpen(open)
            if (!open) {
              // 編集完了後はレセプトデータと保険証データを再取得
              await queryClient.invalidateQueries({ queryKey: [`/api/monthly-receipts/${receiptId}`] })
              await queryClient.invalidateQueries({ queryKey: [`/api/insurance-cards`, receipt?.patientId, receipt?.insuranceCard?.id] })
              await queryClient.refetchQueries({ queryKey: [`/api/monthly-receipts/${receiptId}`] })
              await queryClient.refetchQueries({ queryKey: [`/api/insurance-cards`, receipt?.patientId, receipt?.insuranceCard?.id] })
            }
          }}
          patientId={receipt.patientId}
          card={insuranceCardData}
        />
      )}

      {receipt.doctorOrder && doctorOrderData && (
        <DoctorOrderDialog
          open={doctorOrderDialogOpen}
          onOpenChange={async (open) => {
            setDoctorOrderDialogOpen(open)
            if (!open) {
              // 編集完了後はレセプトデータと訪問看護指示書データを再取得
              await queryClient.invalidateQueries({ queryKey: [`/api/monthly-receipts/${receiptId}`] })
              await queryClient.invalidateQueries({ queryKey: [`/api/doctor-orders`, receipt?.patientId, receipt?.doctorOrder?.order?.id] })
              await queryClient.refetchQueries({ queryKey: [`/api/monthly-receipts/${receiptId}`] })
              await queryClient.refetchQueries({ queryKey: [`/api/doctor-orders`, receipt?.patientId, receipt?.doctorOrder?.order?.id] })
            }
          }}
          patientId={receipt.patientId}
          order={doctorOrderData}
        />
      )}

      {/* Public Expense Card Dialog */}
      {receipt && patientData && (
        <PublicExpenseCardDialog
          open={publicExpenseCardDialogOpen}
          onOpenChange={(open) => {
            setPublicExpenseCardDialogOpen(open)
            if (!open) {
              setEditingPublicExpenseCard(null)
              // ダイアログが閉じられたときにレセプト詳細データを再取得
              // PublicExpenseCardDialog内で保存成功時にpublic-expense-cardsクエリが無効化されるため、
              // レセプト詳細データも再取得して最新の公費情報を反映する
              queryClient.invalidateQueries({ queryKey: [`/api/monthly-receipts/${receiptId}`] })
            }
          }}
          patientId={receipt.patientId}
          facilityId={patientData.facilityId || ''}
          editingCard={editingPublicExpenseCard || undefined}
          existingCards={publicExpenseCards}
        />
      )}

      {/* バリデーションエラーダイアログ */}
      <Dialog open={validationDialogOpen} onOpenChange={setValidationDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              CSV出力に必要なデータが不足しています
            </DialogTitle>
            <DialogDescription>
              以下のデータを入力・修正してから、再度CSV出力を行ってください。
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-6 mt-4">
            {/* エラー項目 */}
            {validationErrors.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant="destructive" className="text-sm">
                    エラー {validationErrors.length}件
                  </Badge>
                  <span className="text-sm text-muted-foreground">修正必須</span>
                </div>
                <Card>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[180px]">カテゴリ</TableHead>
                        <TableHead>内容</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {validationErrors.map((err, index) => {
                        const recordTypeLabels: Record<string, string> = {
                          facility: '施設情報',
                          patient: '患者情報',
                          medicalInstitution: '医療機関情報',
                          doctorOrder: '医師指示書',
                          nursingRecord: '訪問記録'
                        }
                        const recordTypeLabel = recordTypeLabels[err.recordType] || err.recordType
                        return (
                          <TableRow key={index}>
                            <TableCell className="font-medium">
                              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                                {recordTypeLabel}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">{err.message}</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </Card>
              </div>
            )}

            {/* 警告項目 */}
            {validationWarnings.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant="secondary" className="text-sm bg-yellow-100 text-yellow-800 border-yellow-300">
                    警告 {validationWarnings.length}件
                  </Badge>
                  <span className="text-sm text-muted-foreground">推奨</span>
                </div>
                <Card>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[180px]">カテゴリ</TableHead>
                        <TableHead>内容</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {validationWarnings.map((warn, index) => {
                        const recordTypeLabels: Record<string, string> = {
                          facility: '施設情報',
                          patient: '患者情報',
                          medicalInstitution: '医療機関情報',
                          doctorOrder: '医師指示書',
                          nursingRecord: '訪問記録'
                        }
                        const recordTypeLabel = recordTypeLabels[warn.recordType] || warn.recordType
                        return (
                          <TableRow key={index}>
                            <TableCell className="font-medium">
                              <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                                {recordTypeLabel}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">{warn.message}</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </Card>
              </div>
            )}
          </div>

          <div className="mt-6 flex justify-end border-t pt-4">
            <Button onClick={() => setValidationDialogOpen(false)}>
              閉じる
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// サービスコード選択済みの加算セクションコンポーネント
function SelectedBonusServiceCodeSection({
  bonuses,
  receiptId,
  insuranceType,
  relatedRecords,
  onUpdate,
}: {
  bonuses: Array<{
    history: {
      id: string
      nursingRecordId: string
      bonusMasterId: string
      calculatedPoints: number
      appliedAt: string
      calculationDetails: any
      serviceCodeId: string | null
    }
    bonus: {
      id: string
      bonusCode: string
      bonusName: string
      bonusCategory: string
      insuranceType: string
    } | null
    serviceCode: {
      id: string
      serviceCode: string
      serviceName: string
      points: number
    } | null
  }>
  receiptId: string
  insuranceType: 'medical' | 'care'
  relatedRecords: Array<{
    id: string
    visitDate: string
    actualStartTime: string | null
    actualEndTime: string | null
    schedule: {
      startTime: string
      endTime: string
    } | null
  }>
  onUpdate: () => Promise<void>
}) {
  const { toast } = useToast()
  const [selectedServiceCodes, setSelectedServiceCodes] = useState<Record<string, string>>({})
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [clearingIds, setClearingIds] = useState<Set<string>>(new Set())

  // サービスコード一覧を取得
  const { data: serviceCodes = [] } = useQuery<NursingServiceCode[]>({
    queryKey: ['/api/master/nursing-service-codes', insuranceType],
    queryFn: () => masterDataApi.getNursingServiceCodes({
      isActive: true,
      insuranceType,
    }),
  })

  // 加算に対応するサービスコードをフィルタ（加算コード名から推測）
  const getAvailableServiceCodes = (bonusCode: string): NursingServiceCode[] => {
    return serviceCodes.filter(code => {
      // 基本療養費のサービスコードを除外（サービス名が「基本療養費」で始まるもの）
      // 加算用のサービスコードは「加算」で始まるため、除外されない
      if (code.serviceName.startsWith('訪問看護基本療養費') || 
          code.serviceName.startsWith('精神科訪問看護基本療養費')) {
        return false;
      }
      
      if (bonusCode === 'medical_emergency_visit') {
        return code.serviceCode.startsWith('510002') || code.serviceCode.startsWith('510004')
      }
      if (bonusCode === 'medical_night_early_morning' || bonusCode === 'medical_late_night') {
        return code.serviceCode.startsWith('510003') || code.serviceCode.startsWith('510004')
      }
      if (bonusCode.startsWith('discharge_support_guidance')) {
        return code.serviceCode.startsWith('550001')
      }
      if (bonusCode.startsWith('24h_response_system')) {
        return code.serviceCode.startsWith('550000') || code.serviceCode.startsWith('550002')
      }
      if (bonusCode.startsWith('terminal_care')) {
        return code.serviceCode.startsWith('580000')
      }
      if (bonusCode.startsWith('special_management')) {
        return code.serviceCode.startsWith('550000')
      }
      if (bonusCode === 'specialist_management') {
        return code.serviceCode.startsWith('550001')
      }
      if (bonusCode === 'medical_long_visit') {
        return code.serviceCode.startsWith('510002') || code.serviceCode.startsWith('510004')
      }
      // その他の加算は全てのサービスコードを表示（基本療養費は既に除外済み）
      return true
    })
  }

  const handleSave = async (historyId: string, serviceCodeId: string) => {
    if (!serviceCodeId) {
      toast({
        title: "エラー",
        description: "サービスコードを選択してください",
        variant: "destructive",
      })
      return
    }

    setSavingIds(prev => new Set(prev).add(historyId))

    try {
      const response = await fetch(`/api/bonus-calculation-history/${historyId}/service-code`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ serviceCodeId }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'サービスコードの保存に失敗しました')
      }

      toast({
        title: "保存完了",
        description: "サービスコードを保存しました",
      })

      await onUpdate()
      setSelectedServiceCodes(prev => {
        const next = { ...prev }
        delete next[historyId]
        return next
      })
    } catch (error: any) {
      toast({
        title: "エラー",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setSavingIds(prev => {
        const next = new Set(prev)
        next.delete(historyId)
        return next
      })
    }
  }

  const handleClear = async (historyId: string) => {
    setClearingIds(prev => new Set(prev).add(historyId))

    try {
      const response = await fetch(`/api/bonus-calculation-history/${historyId}/service-code`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ serviceCodeId: null }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'サービスコードの解除に失敗しました')
      }

      toast({
        title: "解除完了",
        description: "サービスコードの選択を解除しました",
      })

      await onUpdate()
    } catch (error: any) {
      toast({
        title: "エラー",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setClearingIds(prev => {
        const next = new Set(prev)
        next.delete(historyId)
        return next
      })
    }
  }

  // 訪問時間のフォーマット関数
  const formatTime = (timestamp: string | null) => {
    if (!timestamp) return null
    const date = new Date(timestamp)
    return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
  }

  // 訪問日時でソート（古い順）
  const sortedBonuses = [...bonuses].sort((a, b) => {
    const recordA = relatedRecords.find(r => r.id === a.history.nursingRecordId)
    const recordB = relatedRecords.find(r => r.id === b.history.nursingRecordId)
    
    // 訪問日で比較
    const dateA = recordA?.visitDate || ''
    const dateB = recordB?.visitDate || ''
    if (dateA !== dateB) {
      return dateA.localeCompare(dateB)
    }
    
    // 同じ日付の場合は開始時間で比較
    const timeA = recordA?.actualStartTime || recordA?.schedule?.startTime || ''
    const timeB = recordB?.actualStartTime || recordB?.schedule?.startTime || ''
    return timeA.localeCompare(timeB)
  })

  return (
    <Card className="border-green-200 bg-green-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-green-800">
          <CheckCircle className="w-5 h-5" />
          サービスコード選択済みの加算
        </CardTitle>
        <CardDescription>
          以下の加算はサービスコードが選択済みです。変更または解除できます。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sortedBonuses.map((bonus) => {
          if (!bonus.bonus || !bonus.serviceCode) return null

          const availableCodes = getAvailableServiceCodes(bonus.bonus.bonusCode)
          const selectedCodeId = selectedServiceCodes[bonus.history.id] || bonus.history.serviceCodeId || ''
          const isSaving = savingIds.has(bonus.history.id)
          const isClearing = clearingIds.has(bonus.history.id)

          // 選択済みのサービスコードがavailableCodesに含まれていない場合、追加する
          const selectedServiceCodeInList = availableCodes.find(code => code.id === bonus.history.serviceCodeId)
          const optionsForCombobox = [
            { value: '', label: '選択してください' },
            ...availableCodes.map(code => ({
              value: code.id,
              label: `${code.serviceCode} - ${code.serviceName} (${code.points.toLocaleString()}${insuranceType === "medical" ? "点" : "単位"})`,
            })),
          ]
          
          // 選択済みのサービスコードがavailableCodesに含まれていない場合、オプションに追加
          if (bonus.history.serviceCodeId && bonus.serviceCode && !selectedServiceCodeInList) {
            optionsForCombobox.push({
              value: bonus.history.serviceCodeId,
              label: `${bonus.serviceCode.serviceCode} - ${bonus.serviceCode.serviceName} (${bonus.serviceCode.points.toLocaleString()}${insuranceType === "medical" ? "点" : "単位"})`,
            })
          }

          // 訪問記録を検索
          const record = relatedRecords.find(r => r.id === bonus.history.nursingRecordId)
          const visitDate = record?.visitDate || '-'
          const startTime = record?.actualStartTime
            ? formatTime(record.actualStartTime)
            : record?.schedule?.startTime || '-'
          const endTime = record?.actualEndTime
            ? formatTime(record.actualEndTime)
            : record?.schedule?.endTime || '-'
          const visitTime = `${startTime} - ${endTime}`

          return (
            <div key={bonus.history.id} className="border rounded-md py-3 px-4 bg-white">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-3">
                <div>
                  <div className="text-sm text-muted-foreground">訪問日</div>
                  <div className="font-medium">{visitDate}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">訪問時間</div>
                  <div className="font-medium">{visitTime}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">加算名</div>
                  <div className="font-medium">{bonus.bonus.bonusName}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">{insuranceType === "medical" ? "点数" : "単位"}</div>
                  <div className="font-medium">{bonus.history.calculatedPoints.toLocaleString()}{insuranceType === "medical" ? "点" : "単位"}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">選択済みサービスコード</div>
                  <div className="font-medium text-sm">
                    {bonus.serviceCode.serviceCode} - {bonus.serviceCode.serviceName}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    ({bonus.serviceCode.points.toLocaleString()}{insuranceType === "medical" ? "点" : "単位"})
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>サービスコード変更</Label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Combobox
                      options={optionsForCombobox}
                      value={selectedCodeId}
                      onValueChange={(value) => {
                        setSelectedServiceCodes(prev => ({
                          ...prev,
                          [bonus.history.id]: value,
                        }))
                      }}
                      placeholder="選択してください"
                      searchPlaceholder="サービスコードまたは名称で検索..."
                      emptyText="該当するサービスコードが見つかりませんでした"
                      maxHeight="300px"
                    />
                  </div>
                  <Button
                    onClick={() => handleSave(bonus.history.id, selectedCodeId)}
                    disabled={!selectedCodeId || selectedCodeId === bonus.history.serviceCodeId || isSaving}
                    variant="default"
                  >
                    {isSaving ? '保存中...' : '変更'}
                  </Button>
                  <Button
                    onClick={() => handleClear(bonus.history.id)}
                    disabled={isClearing}
                    variant="outline"
                  >
                    {isClearing ? '解除中...' : 'クリア'}
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

// サービスコード未選択の加算セクションコンポーネント
function UnselectedBonusServiceCodeSection({
  bonuses,
  receiptId,
  insuranceType,
  relatedRecords,
  onUpdate,
}: {
  bonuses: Array<{
    history: {
      id: string
      nursingRecordId: string
      bonusMasterId: string
      calculatedPoints: number
      appliedAt: string
      calculationDetails: any
      serviceCodeId: string | null
    }
    bonus: {
      id: string
      bonusCode: string
      bonusName: string
      bonusCategory: string
      insuranceType: string
    } | null
    serviceCode: {
      id: string
      serviceCode: string
      serviceName: string
      points: number
    } | null
  }>
  receiptId: string
  insuranceType: 'medical' | 'care'
  relatedRecords: Array<{
    id: string
    visitDate: string
    actualStartTime: string | null
    actualEndTime: string | null
    schedule: {
      startTime: string
      endTime: string
    } | null
  }>
  onUpdate: () => Promise<void>
}) {
  const { toast } = useToast()
  const [selectedServiceCodes, setSelectedServiceCodes] = useState<Record<string, string>>({})
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())

  // サービスコード一覧を取得
  const { data: serviceCodes = [] } = useQuery<NursingServiceCode[]>({
    queryKey: ['/api/master/nursing-service-codes', insuranceType],
    queryFn: () => masterDataApi.getNursingServiceCodes({
      isActive: true,
      insuranceType,
    }),
  })

  // 加算に対応するサービスコードをフィルタ（加算コード名から推測）
  const getAvailableServiceCodes = (bonusCode: string): NursingServiceCode[] => {
    // 加算コードに基づいてサービスコードをフィルタ
    return serviceCodes.filter(code => {
      // 基本療養費のサービスコードを除外（サービス名が「基本療養費」で始まるもの）
      // 加算用のサービスコードは「加算」で始まるため、除外されない
      if (code.serviceName.startsWith('訪問看護基本療養費') || 
          code.serviceName.startsWith('精神科訪問看護基本療養費')) {
        return false;
      }
      
      // 緊急訪問加算の場合
      if (bonusCode === 'medical_emergency_visit') {
        return code.serviceCode.startsWith('510002') || code.serviceCode.startsWith('510004')
      }
      // 時間帯別加算の場合
      if (bonusCode === 'medical_night_early_morning' || bonusCode === 'medical_late_night') {
        return code.serviceCode.startsWith('510003') || code.serviceCode.startsWith('510004')
      }
      // 退院支援加算の場合
      if (bonusCode.startsWith('discharge_support_guidance')) {
        return code.serviceCode.startsWith('550001')
      }
      // 24時間対応体制加算の場合
      if (bonusCode.startsWith('24h_response_system')) {
        return code.serviceCode.startsWith('550000') || code.serviceCode.startsWith('550002')
      }
      // ターミナルケア加算の場合
      if (bonusCode.startsWith('terminal_care')) {
        return code.serviceCode.startsWith('580000')
      }
      // 特別管理加算の場合
      if (bonusCode.startsWith('special_management')) {
        return code.serviceCode.startsWith('550000')
      }
      // 専門管理加算の場合
      if (bonusCode === 'specialist_management') {
        return code.serviceCode.startsWith('550001')
      }
      // その他の加算は全てのサービスコードを表示（基本療養費は既に除外済み）
      return true
    })
  }

  const handleSave = async (historyId: string, serviceCodeId: string) => {
    if (!serviceCodeId) {
      toast({
        title: "エラー",
        description: "サービスコードを選択してください",
        variant: "destructive",
      })
      return
    }

    setSavingIds(prev => new Set(prev).add(historyId))

    try {
      const response = await fetch(`/api/bonus-calculation-history/${historyId}/service-code`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ serviceCodeId }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'サービスコードの保存に失敗しました')
      }

      toast({
        title: "保存完了",
        description: "サービスコードを保存しました",
      })

      onUpdate()
    } catch (error: any) {
      toast({
        title: "エラー",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setSavingIds(prev => {
        const next = new Set(prev)
        next.delete(historyId)
        return next
      })
    }
  }

  // 訪問時間のフォーマット関数
  const formatTime = (timestamp: string | null) => {
    if (!timestamp) return null
    const date = new Date(timestamp)
    return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
  }

  // 訪問日時でソート（古い順）
  const sortedBonuses = [...bonuses].sort((a, b) => {
    const recordA = relatedRecords.find(r => r.id === a.history.nursingRecordId)
    const recordB = relatedRecords.find(r => r.id === b.history.nursingRecordId)
    
    // 訪問日で比較
    const dateA = recordA?.visitDate || ''
    const dateB = recordB?.visitDate || ''
    if (dateA !== dateB) {
      return dateA.localeCompare(dateB)
    }
    
    // 同じ日付の場合は開始時間で比較
    const timeA = recordA?.actualStartTime || recordA?.schedule?.startTime || ''
    const timeB = recordB?.actualStartTime || recordB?.schedule?.startTime || ''
    return timeA.localeCompare(timeB)
  })

  return (
    <Card className="border-yellow-200 bg-yellow-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-yellow-800">
          <AlertTriangle className="w-5 h-5" />
          サービスコード未選択の加算
        </CardTitle>
        <CardDescription>
          以下の加算はサービスコードが未選択のため、CSV出力に含まれません。サービスコードを選択してください。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sortedBonuses.map((bonus) => {
          if (!bonus.bonus) return null

          const availableCodes = getAvailableServiceCodes(bonus.bonus.bonusCode)
          const selectedCodeId = selectedServiceCodes[bonus.history.id] || ''
          const isSaving = savingIds.has(bonus.history.id)

          // 訪問記録を検索
          const record = relatedRecords.find(r => r.id === bonus.history.nursingRecordId)
          const visitDate = record?.visitDate || '-'
          const startTime = record?.actualStartTime
            ? formatTime(record.actualStartTime)
            : record?.schedule?.startTime || '-'
          const endTime = record?.actualEndTime
            ? formatTime(record.actualEndTime)
            : record?.schedule?.endTime || '-'
          const visitTime = `${startTime} - ${endTime}`

          return (
            <div key={bonus.history.id} className="border rounded-md py-3 px-4 bg-white">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-3">
                <div>
                  <div className="text-sm text-muted-foreground">訪問日</div>
                  <div className="font-medium">{visitDate}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">訪問時間</div>
                  <div className="font-medium">{visitTime}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">加算名</div>
                  <div className="font-medium">{bonus.bonus.bonusName}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">{insuranceType === "medical" ? "点数" : "単位"}</div>
                  <div className="font-medium">{bonus.history.calculatedPoints.toLocaleString()}{insuranceType === "medical" ? "点" : "単位"}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">加算コード</div>
                  <div className="font-medium text-xs">{bonus.bonus.bonusCode}</div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>サービスコード</Label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Combobox
                      options={[
                        { value: '', label: '選択してください' },
                        ...availableCodes.map(code => ({
                          value: code.id,
                          label: `${code.serviceCode} - ${code.serviceName} (${code.points.toLocaleString()}${insuranceType === "medical" ? "点" : "単位"})`,
                        })),
                      ]}
                      value={selectedCodeId}
                      onValueChange={(value) => {
                        setSelectedServiceCodes(prev => ({
                          ...prev,
                          [bonus.history.id]: value,
                        }))
                      }}
                      placeholder="選択してください"
                      searchPlaceholder="サービスコードまたは名称で検索..."
                      emptyText="該当するサービスコードが見つかりませんでした"
                      maxHeight="300px"
                    />
                  </div>
                  <Button
                    onClick={() => handleSave(bonus.history.id, selectedCodeId)}
                    disabled={!selectedCodeId || isSaving}
                  >
                    {isSaving ? '保存中...' : '保存'}
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
