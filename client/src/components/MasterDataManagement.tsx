import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { Plus, Edit, Database, AlertCircle } from "lucide-react"
import { masterDataApi } from "@/lib/api"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import type {
  PrefectureCode,
  NursingServiceCode,
  StaffQualificationCode,
  VisitLocationCode,
} from "@/lib/api"

// Receipt Type Code interface (not in api.ts yet)
interface ReceiptTypeCode {
  id: string
  receiptTypeCode: string
  receiptTypeName: string
  insuranceType: 'medical' | 'care'
  displayOrder: number
  description: string | null
  isActive: boolean
  createdAt: Date | null
  updatedAt: Date | null
}

type StatusFilter = 'all' | 'active' | 'inactive'

export function MasterDataManagement() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { data: currentUser } = useCurrentUser()
  const [activeTab, setActiveTab] = useState("prefecture")

  // Check if user is system admin (only they can edit)
  const isSystemAdmin = currentUser?.role === 'system_admin'

  // Status filters for each tab
  const [prefectureFilter, setPrefectureFilter] = useState<StatusFilter>('active')
  const [serviceFilter, setServiceFilter] = useState<StatusFilter>('active')
  const [qualificationFilter, setQualificationFilter] = useState<StatusFilter>('active')
  const [locationFilter, setLocationFilter] = useState<StatusFilter>('active')
  const [receiptTypeFilter, setReceiptTypeFilter] = useState<StatusFilter>('active')
  
  // Service code filters
  const [serviceCodeFilter, setServiceCodeFilter] = useState<string>('')
  const [serviceNameFilter, setServiceNameFilter] = useState<string>('')
  const [serviceInsuranceTypeFilter, setServiceInsuranceTypeFilter] = useState<'medical' | 'care'>('medical')

  // Filter function
  const filterByStatus = <T extends { isActive: boolean }>(items: T[], filter: StatusFilter): T[] => {
    if (filter === 'all') return items
    if (filter === 'active') return items.filter(item => item.isActive)
    return items.filter(item => !item.isActive)
  }
  
  // Service code filter function
  const filterServiceCodes = (codes: NursingServiceCode[]): NursingServiceCode[] => {
    let filtered = filterByStatus(codes, serviceFilter)
    
    // コードでフィルタ（部分一致）
    if (serviceCodeFilter.trim()) {
      const codeFilterLower = serviceCodeFilter.trim().toLowerCase()
      filtered = filtered.filter(code => 
        code.serviceCode.toLowerCase().includes(codeFilterLower)
      )
    }
    
    // サービス名でフィルタ（部分一致）
    if (serviceNameFilter.trim()) {
      const nameFilterLower = serviceNameFilter.trim().toLowerCase()
      filtered = filtered.filter(code => 
        code.serviceName.toLowerCase().includes(nameFilterLower)
      )
    }
    
    // 保険種別でフィルタ
    filtered = filtered.filter(code => 
      code.insuranceType === serviceInsuranceTypeFilter
    )
    
    // ソート: 医療保険を上に、介護保険を下に
    filtered.sort((a, b) => {
      if (a.insuranceType === 'medical' && b.insuranceType === 'care') return -1
      if (a.insuranceType === 'care' && b.insuranceType === 'medical') return 1
      // 同じ保険種別の場合はサービスコードでソート
      return a.serviceCode.localeCompare(b.serviceCode)
    })
    
    return filtered
  }

  // Prefecture Codes
  const [prefectureDialog, setPrefectureDialog] = useState(false)
  const [editingPrefecture, setEditingPrefecture] = useState<PrefectureCode | null>(null)
  const [prefectureForm, setPrefectureForm] = useState({
    prefectureCode: "",
    prefectureName: "",
    displayOrder: 0,
    isActive: true,
  })

  const { data: prefectureCodes = [] } = useQuery({
    queryKey: ["prefecture-codes-all"],
    queryFn: async () => {
      const response = await fetch("/api/master/prefecture-codes", {
        credentials: 'include'
      })
      if (!response.ok) throw new Error("都道府県コードの取得に失敗しました")
      return response.json() as Promise<PrefectureCode[]>
    },
  })

  const prefectureMutation = useMutation({
    mutationFn: async (data: typeof prefectureForm) => {
      const url = editingPrefecture
        ? `/api/master/prefecture-codes/${editingPrefecture.id}`
        : "/api/master/prefecture-codes"
      const method = editingPrefecture ? "PUT" : "POST"

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "保存に失敗しました")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prefecture-codes-all"] })
      queryClient.invalidateQueries({ queryKey: ["prefecture-codes"] })
      toast({
        title: "保存完了",
        description: editingPrefecture ? "都道府県コードを更新しました" : "都道府県コードを作成しました",
      })
      setPrefectureDialog(false)
      setEditingPrefecture(null)
      setPrefectureForm({ prefectureCode: "", prefectureName: "", displayOrder: 0, isActive: true })
    },
    onError: (error: Error) => {
      toast({
        title: "エラー",
        description: error.message,
        variant: "destructive",
      })
    },
  })

  // Nursing Service Codes
  const [serviceDialog, setServiceDialog] = useState(false)
  const [editingService, setEditingService] = useState<NursingServiceCode | null>(null)
  const [serviceForm, setServiceForm] = useState({
    serviceCode: "",
    serviceName: "",
    insuranceType: "medical" as "medical" | "care",
    points: "",
    description: "",
    isActive: true,
  })

  const { data: serviceCodes = [] } = useQuery({
    queryKey: ["nursing-service-codes-all"],
    queryFn: async () => {
      const response = await fetch("/api/master/nursing-service-codes", {
        credentials: 'include'
      })
      if (!response.ok) throw new Error("サービスコードの取得に失敗しました")
      return response.json() as Promise<NursingServiceCode[]>
    },
  })

  const serviceMutation = useMutation({
    mutationFn: async (data: typeof serviceForm) => {
      const url = editingService
        ? `/api/master/nursing-service-codes/${editingService.id}`
        : "/api/master/nursing-service-codes"
      const method = editingService ? "PUT" : "POST"

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          points: data.points ? parseInt(data.points) : null,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "保存に失敗しました")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nursing-service-codes-all"] })
      queryClient.invalidateQueries({ queryKey: ["nursing-service-codes"] })
      toast({
        title: "保存完了",
        description: editingService ? "サービスコードを更新しました" : "サービスコードを作成しました",
      })
      setServiceDialog(false)
      setEditingService(null)
      setServiceForm({
        serviceCode: "",
        serviceName: "",
        insuranceType: "medical",
        points: "",
        description: "",
        isActive: true,
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

  // Staff Qualification Codes
  const [qualificationDialog, setQualificationDialog] = useState(false)
  const [editingQualification, setEditingQualification] = useState<StaffQualificationCode | null>(null)
  const [qualificationForm, setQualificationForm] = useState({
    qualificationCode: "",
    qualificationName: "",
    displayOrder: 0,
    isActive: true,
  })

  const { data: qualificationCodes = [] } = useQuery({
    queryKey: ["staff-qualification-codes-all"],
    queryFn: async () => {
      const response = await fetch("/api/master/staff-qualification-codes", {
        credentials: 'include'
      })
      if (!response.ok) throw new Error("職員資格コードの取得に失敗しました")
      return response.json() as Promise<StaffQualificationCode[]>
    },
  })

  const qualificationMutation = useMutation({
    mutationFn: async (data: typeof qualificationForm) => {
      const url = editingQualification
        ? `/api/master/staff-qualification-codes/${editingQualification.id}`
        : "/api/master/staff-qualification-codes"
      const method = editingQualification ? "PUT" : "POST"

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "保存に失敗しました")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-qualification-codes-all"] })
      queryClient.invalidateQueries({ queryKey: ["staff-qualification-codes"] })
      toast({
        title: "保存完了",
        description: editingQualification ? "職員資格コードを更新しました" : "職員資格コードを作成しました",
      })
      setQualificationDialog(false)
      setEditingQualification(null)
      setQualificationForm({ qualificationCode: "", qualificationName: "", displayOrder: 0, isActive: true })
    },
    onError: (error: Error) => {
      toast({
        title: "エラー",
        description: error.message,
        variant: "destructive",
      })
    },
  })

  // Visit Location Codes
  const [locationDialog, setLocationDialog] = useState(false)
  const [editingLocation, setEditingLocation] = useState<VisitLocationCode | null>(null)
  const [locationForm, setLocationForm] = useState({
    locationCode: "",
    locationName: "",
    displayOrder: 0,
    isActive: true,
  })

  const { data: locationCodes = [] } = useQuery({
    queryKey: ["visit-location-codes-all"],
    queryFn: async () => {
      const response = await fetch("/api/master/visit-location-codes", {
        credentials: 'include'
      })
      if (!response.ok) throw new Error("訪問場所コードの取得に失敗しました")
      return response.json() as Promise<VisitLocationCode[]>
    },
  })

  const locationMutation = useMutation({
    mutationFn: async (data: typeof locationForm) => {
      const url = editingLocation
        ? `/api/master/visit-location-codes/${editingLocation.id}`
        : "/api/master/visit-location-codes"
      const method = editingLocation ? "PUT" : "POST"

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "保存に失敗しました")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["visit-location-codes-all"] })
      queryClient.invalidateQueries({ queryKey: ["visit-location-codes"] })
      toast({
        title: "保存完了",
        description: editingLocation ? "訪問場所コードを更新しました" : "訪問場所コードを作成しました",
      })
      setLocationDialog(false)
      setEditingLocation(null)
      setLocationForm({ locationCode: "", locationName: "", displayOrder: 0, isActive: true })
    },
    onError: (error: Error) => {
      toast({
        title: "エラー",
        description: error.message,
        variant: "destructive",
      })
    },
  })

  // Receipt Type Codes
  const [receiptTypeDialog, setReceiptTypeDialog] = useState(false)
  const [editingReceiptType, setEditingReceiptType] = useState<ReceiptTypeCode | null>(null)
  const [receiptTypeForm, setReceiptTypeForm] = useState({
    receiptTypeCode: "",
    receiptTypeName: "",
    insuranceType: "medical" as "medical" | "care",
    displayOrder: 0,
    description: "",
    isActive: true,
  })

  const { data: receiptTypeCodes = [] } = useQuery({
    queryKey: ["receipt-type-codes-all"],
    queryFn: async () => {
      const response = await fetch("/api/master/receipt-type-codes", {
        credentials: 'include'
      })
      if (!response.ok) throw new Error("レセプト種別コードの取得に失敗しました")
      return response.json() as Promise<ReceiptTypeCode[]>
    },
  })

  const receiptTypeMutation = useMutation({
    mutationFn: async (data: typeof receiptTypeForm) => {
      const url = editingReceiptType
        ? `/api/master/receipt-type-codes/${editingReceiptType.id}`
        : "/api/master/receipt-type-codes"
      const method = editingReceiptType ? "PUT" : "POST"

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "保存に失敗しました")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["receipt-type-codes-all"] })
      queryClient.invalidateQueries({ queryKey: ["receipt-type-codes"] })
      toast({
        title: "保存完了",
        description: editingReceiptType ? "レセプト種別コードを更新しました" : "レセプト種別コードを作成しました",
      })
      setReceiptTypeDialog(false)
      setEditingReceiptType(null)
      setReceiptTypeForm({
        receiptTypeCode: "",
        receiptTypeName: "",
        insuranceType: "medical",
        displayOrder: 0,
        description: "",
        isActive: true,
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

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Database className="w-8 h-8" />
            レセプトマスタ管理
          </h1>
          <p className="text-muted-foreground mt-1">
            レセプトCSV出力に必要な各種マスターデータを管理します
          </p>
        </div>
      </div>

      {/* System Admin Mode Banner */}
      {isSystemAdmin && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>システム管理者モード</AlertTitle>
          <AlertDescription>
            レセプトマスタの編集が可能です。変更は全テナントに影響します。
          </AlertDescription>
        </Alert>
      )}

      {/* Read-only Mode Banner */}
      {!isSystemAdmin && (
        <Alert variant="default">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>閲覧モード</AlertTitle>
          <AlertDescription>
            レセプトマスタは閲覧のみ可能です。
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="prefecture">都道府県</TabsTrigger>
          <TabsTrigger value="service">サービスコード</TabsTrigger>
          <TabsTrigger value="qualification">職員資格</TabsTrigger>
          <TabsTrigger value="location">訪問場所</TabsTrigger>
          <TabsTrigger value="receiptType">レセプト種別</TabsTrigger>
        </TabsList>

        {/* Prefecture Codes Tab */}
        <TabsContent value="prefecture">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>都道府県コード</CardTitle>
                  <CardDescription>
                    都道府県コードと名称を管理します
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <div className="flex gap-1 border rounded-md p-1">
                    <Button
                      size="sm"
                      variant={prefectureFilter === 'active' ? 'default' : 'ghost'}
                      onClick={() => setPrefectureFilter('active')}
                    >
                      有効のみ
                    </Button>
                    <Button
                      size="sm"
                      variant={prefectureFilter === 'all' ? 'default' : 'ghost'}
                      onClick={() => setPrefectureFilter('all')}
                    >
                      すべて
                    </Button>
                    <Button
                      size="sm"
                      variant={prefectureFilter === 'inactive' ? 'default' : 'ghost'}
                      onClick={() => setPrefectureFilter('inactive')}
                    >
                      無効のみ
                    </Button>
                  </div>
                  {isSystemAdmin && (
                    <Button
                      onClick={() => {
                        setEditingPrefecture(null)
                        setPrefectureForm({ prefectureCode: "", prefectureName: "", displayOrder: 0, isActive: true })
                        setPrefectureDialog(true)
                      }}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      新規作成
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>コード</TableHead>
                    <TableHead>都道府県名</TableHead>
                    <TableHead>表示順</TableHead>
                    <TableHead>状態</TableHead>
                    {isSystemAdmin && <TableHead className="text-right">操作</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filterByStatus(prefectureCodes, prefectureFilter).map((code) => (
                    <TableRow key={code.id}>
                      <TableCell className="font-mono">{code.prefectureCode}</TableCell>
                      <TableCell>{code.prefectureName}</TableCell>
                      <TableCell>{code.displayOrder}</TableCell>
                      <TableCell>
                        <Badge variant={code.isActive ? "default" : "secondary"}>
                          {code.isActive ? "有効" : "無効"}
                        </Badge>
                      </TableCell>
                      {isSystemAdmin && (
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingPrefecture(code)
                              setPrefectureForm({
                                prefectureCode: code.prefectureCode,
                                prefectureName: code.prefectureName,
                                displayOrder: code.displayOrder,
                                isActive: code.isActive,
                              })
                              setPrefectureDialog(true)
                            }}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Nursing Service Codes Tab */}
        <TabsContent value="service">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>訪問看護サービスコード</CardTitle>
                  <CardDescription>
                    訪問看護サービスのコードと点数を管理します
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <div className="flex gap-1 border rounded-md p-1">
                    <Button
                      size="sm"
                      variant={serviceFilter === 'active' ? 'default' : 'ghost'}
                      onClick={() => setServiceFilter('active')}
                    >
                      有効のみ
                    </Button>
                    <Button
                      size="sm"
                      variant={serviceFilter === 'all' ? 'default' : 'ghost'}
                      onClick={() => setServiceFilter('all')}
                    >
                      すべて
                    </Button>
                    <Button
                      size="sm"
                      variant={serviceFilter === 'inactive' ? 'default' : 'ghost'}
                      onClick={() => setServiceFilter('inactive')}
                    >
                      無効のみ
                    </Button>
                  </div>
                  {isSystemAdmin && (
                    <Button
                      onClick={() => {
                        setEditingService(null)
                        setServiceForm({
                          serviceCode: "",
                          serviceName: "",
                          insuranceType: "medical",
                          points: "",
                          description: "",
                          isActive: true,
                        })
                        setServiceDialog(true)
                      }}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      新規作成
                    </Button>
                  )}
                </div>
              </div>
              {/* フィルタセクション */}
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="service-code-filter">コード</Label>
                    <Input
                      id="service-code-filter"
                      placeholder="コードで検索..."
                      value={serviceCodeFilter}
                      onChange={(e) => setServiceCodeFilter(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="service-name-filter">サービス名</Label>
                    <Input
                      id="service-name-filter"
                      placeholder="サービス名で検索..."
                      value={serviceNameFilter}
                      onChange={(e) => setServiceNameFilter(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="service-insurance-filter">保険種別</Label>
                    <Select
                      value={serviceInsuranceTypeFilter}
                      onValueChange={(value: 'medical' | 'care') => setServiceInsuranceTypeFilter(value)}
                    >
                      <SelectTrigger id="service-insurance-filter">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="medical">医療保険</SelectItem>
                        <SelectItem value="care">介護保険</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>コード</TableHead>
                    <TableHead>サービス名</TableHead>
                    <TableHead>保険種別</TableHead>
                    <TableHead>点数/単位</TableHead>
                    <TableHead>状態</TableHead>
                    {isSystemAdmin && <TableHead className="text-right">操作</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filterServiceCodes(serviceCodes).map((code) => (
                    <TableRow key={code.id}>
                      <TableCell className="font-mono">{code.serviceCode}</TableCell>
                      <TableCell>{code.serviceName}</TableCell>
                      <TableCell>
                        <Badge variant={code.insuranceType === "medical" ? "medical" : "care"}>
                          {code.insuranceType === "medical" ? "医療保険" : "介護保険"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {code.points ? (
                          <>
                            {code.points.toLocaleString()}
                            {code.insuranceType === "medical" ? "点" : "単位"}
                          </>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={code.isActive ? "default" : "secondary"}>
                          {code.isActive ? "有効" : "無効"}
                        </Badge>
                      </TableCell>
                      {isSystemAdmin && (
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingService(code)
                              setServiceForm({
                                serviceCode: code.serviceCode,
                                serviceName: code.serviceName,
                                insuranceType: code.insuranceType,
                                points: code.points?.toString() || "",
                                description: code.description || "",
                                isActive: code.isActive,
                              })
                              setServiceDialog(true)
                            }}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Staff Qualification Codes Tab */}
        <TabsContent value="qualification">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>職員資格コード</CardTitle>
                  <CardDescription>
                    訪問看護職員の資格コードを管理します
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <div className="flex gap-1 border rounded-md p-1">
                    <Button
                      size="sm"
                      variant={qualificationFilter === 'active' ? 'default' : 'ghost'}
                      onClick={() => setQualificationFilter('active')}
                    >
                      有効のみ
                    </Button>
                    <Button
                      size="sm"
                      variant={qualificationFilter === 'all' ? 'default' : 'ghost'}
                      onClick={() => setQualificationFilter('all')}
                    >
                      すべて
                    </Button>
                    <Button
                      size="sm"
                      variant={qualificationFilter === 'inactive' ? 'default' : 'ghost'}
                      onClick={() => setQualificationFilter('inactive')}
                    >
                      無効のみ
                    </Button>
                  </div>
                  {isSystemAdmin && (
                    <Button
                      onClick={() => {
                        setEditingQualification(null)
                        setQualificationForm({ qualificationCode: "", qualificationName: "", displayOrder: 0, isActive: true })
                        setQualificationDialog(true)
                      }}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      新規作成
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>コード</TableHead>
                    <TableHead>資格名</TableHead>
                    <TableHead>表示順</TableHead>
                    <TableHead>状態</TableHead>
                    {isSystemAdmin && <TableHead className="text-right">操作</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filterByStatus(qualificationCodes, qualificationFilter).map((code) => (
                    <TableRow key={code.id}>
                      <TableCell className="font-mono">{code.qualificationCode}</TableCell>
                      <TableCell>{code.qualificationName}</TableCell>
                      <TableCell>{code.displayOrder}</TableCell>
                      <TableCell>
                        <Badge variant={code.isActive ? "default" : "secondary"}>
                          {code.isActive ? "有効" : "無効"}
                        </Badge>
                      </TableCell>
                      {isSystemAdmin && (
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingQualification(code)
                              setQualificationForm({
                                qualificationCode: code.qualificationCode,
                                qualificationName: code.qualificationName,
                                displayOrder: code.displayOrder,
                                isActive: code.isActive,
                              })
                              setQualificationDialog(true)
                            }}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Visit Location Codes Tab */}
        <TabsContent value="location">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>訪問場所コード</CardTitle>
                  <CardDescription>
                    訪問場所のコードを管理します
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <div className="flex gap-1 border rounded-md p-1">
                    <Button
                      size="sm"
                      variant={locationFilter === 'active' ? 'default' : 'ghost'}
                      onClick={() => setLocationFilter('active')}
                    >
                      有効のみ
                    </Button>
                    <Button
                      size="sm"
                      variant={locationFilter === 'all' ? 'default' : 'ghost'}
                      onClick={() => setLocationFilter('all')}
                    >
                      すべて
                    </Button>
                    <Button
                      size="sm"
                      variant={locationFilter === 'inactive' ? 'default' : 'ghost'}
                      onClick={() => setLocationFilter('inactive')}
                    >
                      無効のみ
                    </Button>
                  </div>
                  {isSystemAdmin && (
                    <Button
                      onClick={() => {
                        setEditingLocation(null)
                        setLocationForm({ locationCode: "", locationName: "", displayOrder: 0, isActive: true })
                        setLocationDialog(true)
                      }}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      新規作成
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>コード</TableHead>
                    <TableHead>場所名</TableHead>
                    <TableHead>表示順</TableHead>
                    <TableHead>状態</TableHead>
                    {isSystemAdmin && <TableHead className="text-right">操作</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filterByStatus(locationCodes, locationFilter).map((code) => (
                    <TableRow key={code.id}>
                      <TableCell className="font-mono">{code.locationCode}</TableCell>
                      <TableCell>{code.locationName}</TableCell>
                      <TableCell>{code.displayOrder}</TableCell>
                      <TableCell>
                        <Badge variant={code.isActive ? "default" : "secondary"}>
                          {code.isActive ? "有効" : "無効"}
                        </Badge>
                      </TableCell>
                      {isSystemAdmin && (
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingLocation(code)
                              setLocationForm({
                                locationCode: code.locationCode,
                                locationName: code.locationName,
                                displayOrder: code.displayOrder,
                                isActive: code.isActive,
                              })
                              setLocationDialog(true)
                            }}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Receipt Type Codes Tab */}
        <TabsContent value="receiptType">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>レセプト種別コード</CardTitle>
                  <CardDescription>
                    レセプト種別のコードを管理します
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <div className="flex gap-1 border rounded-md p-1">
                    <Button
                      size="sm"
                      variant={receiptTypeFilter === 'active' ? 'default' : 'ghost'}
                      onClick={() => setReceiptTypeFilter('active')}
                    >
                      有効のみ
                    </Button>
                    <Button
                      size="sm"
                      variant={receiptTypeFilter === 'all' ? 'default' : 'ghost'}
                      onClick={() => setReceiptTypeFilter('all')}
                    >
                      すべて
                    </Button>
                    <Button
                      size="sm"
                      variant={receiptTypeFilter === 'inactive' ? 'default' : 'ghost'}
                      onClick={() => setReceiptTypeFilter('inactive')}
                    >
                      無効のみ
                    </Button>
                  </div>
                  {isSystemAdmin && (
                    <Button
                      onClick={() => {
                        setEditingReceiptType(null)
                        setReceiptTypeForm({
                          receiptTypeCode: "",
                          receiptTypeName: "",
                          insuranceType: "medical",
                          displayOrder: 0,
                          description: "",
                          isActive: true,
                        })
                        setReceiptTypeDialog(true)
                      }}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      新規作成
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>コード</TableHead>
                    <TableHead>種別名</TableHead>
                    <TableHead>保険種別</TableHead>
                    <TableHead>表示順</TableHead>
                    <TableHead>状態</TableHead>
                    {isSystemAdmin && <TableHead className="text-right">操作</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filterByStatus(receiptTypeCodes, receiptTypeFilter).map((code) => (
                    <TableRow key={code.id}>
                      <TableCell className="font-mono">{code.receiptTypeCode}</TableCell>
                      <TableCell>{code.receiptTypeName}</TableCell>
                      <TableCell>
                        <Badge variant={code.insuranceType === "medical" ? "medical" : "care"}>
                          {code.insuranceType === "medical" ? "医療保険" : "介護保険"}
                        </Badge>
                      </TableCell>
                      <TableCell>{code.displayOrder}</TableCell>
                      <TableCell>
                        <Badge variant={code.isActive ? "default" : "secondary"}>
                          {code.isActive ? "有効" : "無効"}
                        </Badge>
                      </TableCell>
                      {isSystemAdmin && (
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingReceiptType(code)
                              setReceiptTypeForm({
                                receiptTypeCode: code.receiptTypeCode,
                                receiptTypeName: code.receiptTypeName,
                                insuranceType: code.insuranceType,
                                displayOrder: code.displayOrder,
                                description: code.description || "",
                                isActive: code.isActive,
                              })
                              setReceiptTypeDialog(true)
                            }}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Prefecture Dialog */}
      <Dialog open={prefectureDialog} onOpenChange={setPrefectureDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingPrefecture ? "都道府県コードを編集" : "都道府県コードを新規作成"}
            </DialogTitle>
            <DialogDescription>
              都道府県コードと名称を入力してください
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="prefecture-code">都道府県コード</Label>
              <Input
                id="prefecture-code"
                value={prefectureForm.prefectureCode}
                onChange={(e) =>
                  setPrefectureForm((prev) => ({ ...prev, prefectureCode: e.target.value }))
                }
                placeholder="例: 01"
                maxLength={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prefecture-name">都道府県名</Label>
              <Input
                id="prefecture-name"
                value={prefectureForm.prefectureName}
                onChange={(e) =>
                  setPrefectureForm((prev) => ({ ...prev, prefectureName: e.target.value }))
                }
                placeholder="例: 北海道"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prefecture-order">表示順</Label>
              <Input
                id="prefecture-order"
                type="number"
                value={prefectureForm.displayOrder}
                onChange={(e) =>
                  setPrefectureForm((prev) => ({
                    ...prev,
                    displayOrder: parseInt(e.target.value) || 0,
                  }))
                }
              />
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="prefecture-active"
                checked={prefectureForm.isActive}
                onCheckedChange={(checked) =>
                  setPrefectureForm((prev) => ({ ...prev, isActive: checked }))
                }
              />
              <Label htmlFor="prefecture-active">有効</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrefectureDialog(false)}>
              キャンセル
            </Button>
            <Button
              onClick={() => prefectureMutation.mutate(prefectureForm)}
              disabled={prefectureMutation.isPending}
            >
              {prefectureMutation.isPending ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Nursing Service Code Dialog */}
      <Dialog open={serviceDialog} onOpenChange={setServiceDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingService ? "サービスコードを編集" : "サービスコードを新規作成"}
            </DialogTitle>
            <DialogDescription>
              訪問看護サービスのコードと情報を入力してください
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="service-code">サービスコード</Label>
              <Input
                id="service-code"
                value={serviceForm.serviceCode}
                onChange={(e) =>
                  setServiceForm((prev) => ({ ...prev, serviceCode: e.target.value }))
                }
                placeholder="例: 311111470"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="service-name">サービス名</Label>
              <Input
                id="service-name"
                value={serviceForm.serviceName}
                onChange={(e) =>
                  setServiceForm((prev) => ({ ...prev, serviceName: e.target.value }))
                }
                placeholder="例: 訪問看護基本療養費（I）"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="service-insurance">保険種別</Label>
              <Select
                value={serviceForm.insuranceType}
                onValueChange={(value: "medical" | "care") =>
                  setServiceForm((prev) => ({ ...prev, insuranceType: value }))
                }
              >
                <SelectTrigger id="service-insurance">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="medical">医療保険</SelectItem>
                  <SelectItem value="care">介護保険</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="service-points">
                {serviceForm.insuranceType === "medical" ? "点数" : "単位"}
              </Label>
              <Input
                id="service-points"
                type="number"
                value={serviceForm.points}
                onChange={(e) =>
                  setServiceForm((prev) => ({ ...prev, points: e.target.value }))
                }
                placeholder={serviceForm.insuranceType === "medical" ? "例: 5550" : "例: 314"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="service-description">説明</Label>
              <Textarea
                id="service-description"
                value={serviceForm.description}
                onChange={(e) =>
                  setServiceForm((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="サービスの詳細説明（任意）"
                rows={3}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="service-active"
                checked={serviceForm.isActive}
                onCheckedChange={(checked) =>
                  setServiceForm((prev) => ({ ...prev, isActive: checked }))
                }
              />
              <Label htmlFor="service-active">有効</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setServiceDialog(false)}>
              キャンセル
            </Button>
            <Button
              onClick={() => serviceMutation.mutate(serviceForm)}
              disabled={serviceMutation.isPending}
            >
              {serviceMutation.isPending ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Staff Qualification Code Dialog */}
      <Dialog open={qualificationDialog} onOpenChange={setQualificationDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingQualification ? "職員資格コードを編集" : "職員資格コードを新規作成"}
            </DialogTitle>
            <DialogDescription>
              職員資格のコードと名称を入力してください
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="qualification-code">資格コード</Label>
              <Input
                id="qualification-code"
                value={qualificationForm.qualificationCode}
                onChange={(e) =>
                  setQualificationForm((prev) => ({
                    ...prev,
                    qualificationCode: e.target.value,
                  }))
                }
                placeholder="例: 1"
                maxLength={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qualification-name">資格名</Label>
              <Input
                id="qualification-name"
                value={qualificationForm.qualificationName}
                onChange={(e) =>
                  setQualificationForm((prev) => ({
                    ...prev,
                    qualificationName: e.target.value,
                  }))
                }
                placeholder="例: 保健師"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qualification-order">表示順</Label>
              <Input
                id="qualification-order"
                type="number"
                value={qualificationForm.displayOrder}
                onChange={(e) =>
                  setQualificationForm((prev) => ({
                    ...prev,
                    displayOrder: parseInt(e.target.value) || 0,
                  }))
                }
              />
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="qualification-active"
                checked={qualificationForm.isActive}
                onCheckedChange={(checked) =>
                  setQualificationForm((prev) => ({ ...prev, isActive: checked }))
                }
              />
              <Label htmlFor="qualification-active">有効</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQualificationDialog(false)}>
              キャンセル
            </Button>
            <Button
              onClick={() => qualificationMutation.mutate(qualificationForm)}
              disabled={qualificationMutation.isPending}
            >
              {qualificationMutation.isPending ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Visit Location Code Dialog */}
      <Dialog open={locationDialog} onOpenChange={setLocationDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingLocation ? "訪問場所コードを編集" : "訪問場所コードを新規作成"}
            </DialogTitle>
            <DialogDescription>
              訪問場所のコードと名称を入力してください
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="location-code">場所コード</Label>
              <Input
                id="location-code"
                value={locationForm.locationCode}
                onChange={(e) =>
                  setLocationForm((prev) => ({ ...prev, locationCode: e.target.value }))
                }
                placeholder="例: 1"
                maxLength={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location-name">場所名</Label>
              <Input
                id="location-name"
                value={locationForm.locationName}
                onChange={(e) =>
                  setLocationForm((prev) => ({ ...prev, locationName: e.target.value }))
                }
                placeholder="例: 自宅"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location-order">表示順</Label>
              <Input
                id="location-order"
                type="number"
                value={locationForm.displayOrder}
                onChange={(e) =>
                  setLocationForm((prev) => ({
                    ...prev,
                    displayOrder: parseInt(e.target.value) || 0,
                  }))
                }
              />
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="location-active"
                checked={locationForm.isActive}
                onCheckedChange={(checked) =>
                  setLocationForm((prev) => ({ ...prev, isActive: checked }))
                }
              />
              <Label htmlFor="location-active">有効</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLocationDialog(false)}>
              キャンセル
            </Button>
            <Button
              onClick={() => locationMutation.mutate(locationForm)}
              disabled={locationMutation.isPending}
            >
              {locationMutation.isPending ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt Type Code Dialog */}
      <Dialog open={receiptTypeDialog} onOpenChange={setReceiptTypeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingReceiptType ? "レセプト種別コードを編集" : "レセプト種別コードを新規作成"}
            </DialogTitle>
            <DialogDescription>
              レセプト種別のコードと情報を入力してください
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="receipt-type-code">種別コード</Label>
              <Input
                id="receipt-type-code"
                value={receiptTypeForm.receiptTypeCode}
                onChange={(e) =>
                  setReceiptTypeForm((prev) => ({ ...prev, receiptTypeCode: e.target.value }))
                }
                placeholder="例: 12"
                maxLength={4}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="receipt-type-name">種別名</Label>
              <Input
                id="receipt-type-name"
                value={receiptTypeForm.receiptTypeName}
                onChange={(e) =>
                  setReceiptTypeForm((prev) => ({ ...prev, receiptTypeName: e.target.value }))
                }
                placeholder="例: 医保・本人（一般）"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="receipt-type-insurance">保険種別</Label>
              <Select
                value={receiptTypeForm.insuranceType}
                onValueChange={(value: "medical" | "care") =>
                  setReceiptTypeForm((prev) => ({ ...prev, insuranceType: value }))
                }
              >
                <SelectTrigger id="receipt-type-insurance">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="medical">医療保険</SelectItem>
                  <SelectItem value="care">介護保険</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="receipt-type-order">表示順</Label>
              <Input
                id="receipt-type-order"
                type="number"
                value={receiptTypeForm.displayOrder}
                onChange={(e) =>
                  setReceiptTypeForm((prev) => ({
                    ...prev,
                    displayOrder: parseInt(e.target.value) || 0,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="receipt-type-description">説明</Label>
              <Textarea
                id="receipt-type-description"
                value={receiptTypeForm.description}
                onChange={(e) =>
                  setReceiptTypeForm((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="種別の詳細説明（任意）"
                rows={3}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="receipt-type-active"
                checked={receiptTypeForm.isActive}
                onCheckedChange={(checked) =>
                  setReceiptTypeForm((prev) => ({ ...prev, isActive: checked }))
                }
              />
              <Label htmlFor="receipt-type-active">有効</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiptTypeDialog(false)}>
              キャンセル
            </Button>
            <Button
              onClick={() => receiptTypeMutation.mutate(receiptTypeForm)}
              disabled={receiptTypeMutation.isPending}
            >
              {receiptTypeMutation.isPending ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
