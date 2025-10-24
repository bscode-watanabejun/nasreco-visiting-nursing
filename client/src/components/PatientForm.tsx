import React, { useState, useRef, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query"
import { z } from "zod"
import { format } from "date-fns"
import { ja } from "date-fns/locale"
import { CalendarIcon, Save, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DatePickerWithYearMonth } from "@/components/ui/date-picker-with-year-month"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/use-toast"

import type { Patient, InsertPatient, UpdatePatient, MedicalInstitution, CareManager, Building } from "@shared/schema"

// Type definition for special management
type SpecialManagementDefinition = {
  id: string
  category: string
  displayName: string
  insuranceType: "medical_5000" | "medical_2500" | "care_500" | "care_250"
  monthlyPoints: number
  description: string | null
  displayOrder: number
  isActive: boolean
}

// Helper function to format insurance type label
const formatInsuranceType = (insuranceType: string): string => {
  const map: Record<string, string> = {
    "medical_5000": "医療5000",
    "medical_2500": "医療2500",
    "care_500": "介護500",
    "care_250": "介護250",
  }
  return map[insuranceType] || insuranceType
}

// Form validation schema based on the database schema
const patientFormSchema = z.object({
  patientNumber: z.string().min(1, "患者番号は必須です"),
  lastName: z.string().min(1, "姓は必須です"),
  firstName: z.string().min(1, "名は必須です"),
  dateOfBirth: z.date({
    required_error: "生年月日は必須です",
  }),
  gender: z.enum(["male", "female", "other"], {
    required_error: "性別を選択してください",
  }),
  address: z.string().optional(),
  phone: z.string().optional(),
  emergencyContact: z.string().optional(),
  emergencyPhone: z.string().optional(),
  insuranceNumber: z.string().optional(),
  medicalHistory: z.string().optional(),
  allergies: z.string().optional(),
  currentMedications: z.string().optional(),
  careNotes: z.string().optional(),
  isActive: z.boolean().default(true),
  isCritical: z.boolean().default(false),
  medicalInstitutionId: z.string().optional(),
  careManagerId: z.string().optional(),
  buildingId: z.string().optional(),
  specialManagementTypes: z.array(z.string()).optional(),
  specialManagementStartDate: z.date().optional(),
  specialManagementEndDate: z.date().optional(),
  // 介護・保険管理フィールド
  insuranceType: z.enum(["medical", "care"]).optional(),
  careLevel: z.enum(["support1", "support2", "care1", "care2", "care3", "care4", "care5"]).optional(),
  specialCareType: z.enum(["none", "bedsore", "rare_disease", "mental"]).optional(),
  isInHospital: z.boolean().optional(),
  isInShortStay: z.boolean().optional(),
  // Phase 2-A: 退院・計画・死亡情報
  lastDischargeDate: z.date().nullish(),
  lastPlanCreatedDate: z.date().nullish(),
  deathDate: z.date().nullish(),
})

type PatientFormData = z.infer<typeof patientFormSchema>

interface PatientFormProps {
  isOpen: boolean
  onClose: () => void
  patient?: Patient | null
  mode: "create" | "edit"
}

export function PatientForm({ isOpen, onClose, patient, mode }: PatientFormProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const [isStartDateOpen, setIsStartDateOpen] = useState(false)
  const [isEndDateOpen, setIsEndDateOpen] = useState(false)
  // Phase 2-A: 日付ピッカーの状態
  const [isLastDischargeDateOpen, setIsLastDischargeDateOpen] = useState(false)
  const [isLastPlanDateOpen, setIsLastPlanDateOpen] = useState(false)
  const [isDeathDateOpen, setIsDeathDateOpen] = useState(false)
  // 現在ロードされている患者IDを追跡
  const [loadedPatientId, setLoadedPatientId] = useState<string | null>(null)
  // フォームが初期化済みかどうかを追跡
  const isFormInitialized = useRef(false)

  // Fetch medical institutions and care managers
  const { data: medicalInstitutions = [] } = useQuery<MedicalInstitution[]>({
    queryKey: ["/api/medical-institutions"],
    enabled: isOpen,
  });

  const { data: careManagers = [] } = useQuery<CareManager[]>({
    queryKey: ["/api/care-managers"],
    enabled: isOpen,
  });

  const { data: buildings = [] } = useQuery<Building[]>({
    queryKey: ["/api/buildings"],
    enabled: isOpen,
  });

  // Fetch special management definitions
  const { data: specialManagementDefinitions = [], isLoading: isLoadingSpecialManagement } = useQuery<SpecialManagementDefinition[]>({
    queryKey: ["/api/special-management-definitions"],
    enabled: isOpen,
  });


  const form = useForm<PatientFormData>({
    resolver: zodResolver(patientFormSchema),
    defaultValues: {
      patientNumber: "",
      lastName: "",
      firstName: "",
      dateOfBirth: undefined,
      gender: undefined,
      address: "",
      phone: "",
      emergencyContact: "",
      emergencyPhone: "",
      insuranceNumber: "",
      medicalHistory: "",
      allergies: "",
      currentMedications: "",
      careNotes: "",
      isActive: true,
      isCritical: false,
      medicalInstitutionId: undefined,
      careManagerId: undefined,
      buildingId: undefined,
      specialManagementTypes: [],
      specialManagementStartDate: undefined,
      specialManagementEndDate: undefined,
      // 介護・保険管理フィールド
      insuranceType: undefined,
      careLevel: undefined,
      specialCareType: "none",
      isInHospital: false,
      isInShortStay: false,
      // Phase 2-A: 退院・計画・死亡情報
      lastDischargeDate: undefined,
      lastPlanCreatedDate: undefined,
      deathDate: undefined,
    },
  })

  // Reset form when patient data changes or mode changes
  useEffect(() => {
    if (!isOpen) {
      // ダイアログが閉じられた時はloadedPatientIdと初期化フラグをクリア
      setLoadedPatientId(null)
      isFormInitialized.current = false
      return
    }

    if (isOpen) {
      // 既に同じ患者で初期化済みの場合はスキップ
      if (patient && loadedPatientId === patient.id && isFormInitialized.current) {
        return
      }

      if (patient && mode === 'edit') {
        setLoadedPatientId(patient.id)
        isFormInitialized.current = true
        // Reset form with patient data for editing
        form.reset({
          patientNumber: patient.patientNumber || "",
          lastName: patient.lastName || "",
          firstName: patient.firstName || "",
          dateOfBirth: patient.dateOfBirth ? new Date(patient.dateOfBirth + 'T00:00:00') : undefined,
          gender: patient.gender || undefined,
          address: patient.address || "",
          phone: patient.phone || "",
          emergencyContact: patient.emergencyContact || "",
          emergencyPhone: patient.emergencyPhone || "",
          insuranceNumber: patient.insuranceNumber || "",
          medicalHistory: patient.medicalHistory || "",
          allergies: patient.allergies || "",
          currentMedications: patient.currentMedications || "",
          careNotes: patient.careNotes || "",
          isActive: patient.isActive ?? true,
          isCritical: patient.isCritical ?? false,
          medicalInstitutionId: patient.medicalInstitutionId || "",
          careManagerId: patient.careManagerId || "",
          buildingId: patient.buildingId || "",
          specialManagementTypes: patient.specialManagementTypes || [],
          specialManagementStartDate: patient.specialManagementStartDate ? new Date(patient.specialManagementStartDate + 'T00:00:00') : undefined,
          specialManagementEndDate: patient.specialManagementEndDate ? new Date(patient.specialManagementEndDate + 'T00:00:00') : undefined,
          // 介護・保険管理フィールド
          insuranceType: patient.insuranceType || undefined,
          careLevel: patient.careLevel || undefined,
          specialCareType: patient.specialCareType || "none",
          isInHospital: patient.isInHospital ?? false,
          isInShortStay: patient.isInShortStay ?? false,
          // Phase 2-A: 退院・計画・死亡情報
          lastDischargeDate: patient.lastDischargeDate ? new Date(patient.lastDischargeDate + 'T00:00:00') : undefined,
          lastPlanCreatedDate: patient.lastPlanCreatedDate ? new Date(patient.lastPlanCreatedDate + 'T00:00:00') : undefined,
          deathDate: patient.deathDate ? new Date(patient.deathDate + 'T00:00:00') : undefined,
        })
      } else if (mode === 'create') {
        setLoadedPatientId(null)
        isFormInitialized.current = false
        // Reset form with empty values for creating
        form.reset({
          patientNumber: "",
          lastName: "",
          firstName: "",
          dateOfBirth: undefined,
          gender: undefined,
          address: "",
          phone: "",
          emergencyContact: "",
          emergencyPhone: "",
          insuranceNumber: "",
          medicalHistory: "",
          allergies: "",
          currentMedications: "",
          careNotes: "",
          isActive: true,
          isCritical: false,
          medicalInstitutionId: "",
          careManagerId: "",
          buildingId: "",
          specialManagementTypes: [],
          specialManagementStartDate: undefined,
          specialManagementEndDate: undefined,
          // 介護・保険管理フィールド
          insuranceType: undefined,
          careLevel: undefined,
          specialCareType: "none",
          isInHospital: false,
          isInShortStay: false,
          // Phase 2-A: 退院・計画・死亡情報
          lastDischargeDate: undefined,
          lastPlanCreatedDate: undefined,
          deathDate: undefined,
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, mode])

  // Helper function to format date as YYYY-MM-DD in local timezone
  const formatDateForAPI = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // Create patient mutation
  const createPatientMutation = useMutation({
    mutationFn: async (data: PatientFormData): Promise<Patient> => {
      const patientData: InsertPatient = {
        ...data,
        dateOfBirth: formatDateForAPI(data.dateOfBirth), // Convert to YYYY-MM-DD
        specialManagementStartDate: data.specialManagementStartDate ? formatDateForAPI(data.specialManagementStartDate) : undefined,
        specialManagementEndDate: data.specialManagementEndDate ? formatDateForAPI(data.specialManagementEndDate) : undefined,
        // undefinedの場合はnullを送信してフィールドをクリア
        lastDischargeDate: data.lastDischargeDate ? formatDateForAPI(data.lastDischargeDate) : null,
        lastPlanCreatedDate: data.lastPlanCreatedDate ? formatDateForAPI(data.lastPlanCreatedDate) : null,
        deathDate: data.deathDate ? formatDateForAPI(data.deathDate) : null,
        facilityId: "", // Will be set by the backend
      }

      const response = await fetch("/api/patients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(patientData),
        credentials: "include", // Include session cookies
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Unknown error" }))
        throw new Error(error.error || "患者の登録に失敗しました")
      }

      return await response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] })
      queryClient.invalidateQueries({ queryKey: ["patient"] })
      toast({
        title: "患者登録完了",
        description: "新しい患者が正常に登録されました。",
      })
      onClose()
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "登録エラー",
        description: error.message,
      })
    },
  })

  // Update patient mutation
  const updatePatientMutation = useMutation({
    mutationFn: async (data: PatientFormData): Promise<Patient> => {
      if (!patient?.id) throw new Error("患者IDが見つかりません")

      const updateData: UpdatePatient = {
        ...data,
        dateOfBirth: formatDateForAPI(data.dateOfBirth), // Convert to YYYY-MM-DD
        specialManagementStartDate: data.specialManagementStartDate ? formatDateForAPI(data.specialManagementStartDate) : undefined,
        specialManagementEndDate: data.specialManagementEndDate ? formatDateForAPI(data.specialManagementEndDate) : undefined,
        // undefinedの場合はnullを送信してフィールドをクリア
        lastDischargeDate: data.lastDischargeDate ? formatDateForAPI(data.lastDischargeDate) : null,
        lastPlanCreatedDate: data.lastPlanCreatedDate ? formatDateForAPI(data.lastPlanCreatedDate) : null,
        deathDate: data.deathDate ? formatDateForAPI(data.deathDate) : null,
      }

      const response = await fetch(`/api/patients/${patient.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
        credentials: "include", // Include session cookies
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Unknown error" }))
        throw new Error(error.error || "患者情報の更新に失敗しました")
      }

      return await response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] })
      queryClient.invalidateQueries({ queryKey: ["patient"] })
      toast({
        title: "更新完了",
        description: "患者情報が正常に更新されました。",
      })
      onClose()
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "更新エラー",
        description: error.message,
      })
    },
  })

  const onSubmit = (data: PatientFormData) => {
    // Check for validation errors
    const errors = form.formState.errors
    if (Object.keys(errors).length > 0) {
      toast({
        variant: "destructive",
        title: "入力エラー",
        description: "必須項目を正しく入力してください。",
      })
      return
    }

    if (mode === "create") {
      createPatientMutation.mutate(data)
    } else {
      updatePatientMutation.mutate(data)
    }
  }

  const isLoading = createPatientMutation.isPending || updatePatientMutation.isPending

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            {mode === "create" ? "新規患者登録" : "患者情報編集"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* 基本情報 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">基本情報</CardTitle>
                <CardDescription>患者の基本的な情報を入力してください</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="patientNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>患者番号 *</FormLabel>
                        <FormControl>
                          <Input placeholder="例: P-2024-001" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="gender"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>性別 *</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="性別を選択" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="male">男性</SelectItem>
                            <SelectItem value="female">女性</SelectItem>
                            <SelectItem value="other">その他</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>姓 *</FormLabel>
                        <FormControl>
                          <Input placeholder="例: 佐藤" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>名 *</FormLabel>
                        <FormControl>
                          <Input placeholder="例: 太郎" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="dateOfBirth"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>生年月日 *</FormLabel>
                      <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className="w-full pl-3 text-left font-normal"
                            >
                              {field.value ? (
                                format(field.value, "yyyy年MM月dd日", { locale: ja })
                              ) : (
                                <span className="text-muted-foreground">生年月日を選択</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          {isCalendarOpen && (
                            <DatePickerWithYearMonth
                              selected={field.value}
                              onSelect={(date) => {
                                field.onChange(date)
                                setIsCalendarOpen(false)
                              }}
                              disabled={(date) =>
                                date > new Date() || date < new Date("1900-01-01")
                              }
                              minYear={1900}
                              maxYear={new Date().getFullYear()}
                            />
                          )}
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* 連絡先情報 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">連絡先情報</CardTitle>
                <CardDescription>患者の連絡先と緊急連絡先を入力してください</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>住所</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="例: 東京都渋谷区神宮前1-1-1 マンション名 101号室"
                          className="resize-none"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="buildingId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>建物</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="建物を選択（同一建物減算用）" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {buildings.map((building) => (
                            <SelectItem key={building.id} value={building.id}>
                              {building.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>電話番号</FormLabel>
                        <FormControl>
                          <Input placeholder="例: 03-1234-5678" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="insuranceNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>保険番号</FormLabel>
                        <FormControl>
                          <Input placeholder="例: 12345678" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Separator />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="emergencyContact"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>緊急連絡先（氏名）</FormLabel>
                        <FormControl>
                          <Input placeholder="例: 佐藤 花子（娘）" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="emergencyPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>緊急連絡先（電話番号）</FormLabel>
                        <FormControl>
                          <Input placeholder="例: 090-1234-5678" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            {/* 医療機関・ケアマネ情報 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">医療機関・ケアマネ情報</CardTitle>
                <CardDescription>主治医・医療機関、ケアマネージャー情報を選択してください</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="medicalInstitutionId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>主治医・医療機関</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || undefined}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="医療機関を選択" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {medicalInstitutions.map((institution) => (
                              <SelectItem key={institution.id} value={institution.id}>
                                {institution.name} - {institution.doctorName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="careManagerId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ケアマネージャー</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || undefined}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="ケアマネを選択" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {careManagers.map((manager) => (
                              <SelectItem key={manager.id} value={manager.id}>
                                {manager.officeName} - {manager.managerName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            {/* 医療情報 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">医療情報</CardTitle>
                <CardDescription>既往歴、アレルギー、現在の服薬状況等を入力してください</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="medicalHistory"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>既往歴・医療歴</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="例: 糖尿病（2015年〜）、高血圧（2018年〜）、心筋梗塞（2020年）"
                          className="resize-none min-h-[80px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="allergies"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>アレルギー</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="例: ペニシリン系抗生物質、卵、そば"
                          className="resize-none min-h-[60px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="currentMedications"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>現在の服薬</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="例: アムロジピン 5mg 1日1回朝食後、メトホルミン 500mg 1日2回朝夕食後"
                          className="resize-none min-h-[80px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="careNotes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ケアノート・特記事項</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="例: 歩行時杖使用、軽度の認知症あり、家族との連絡は娘が窓口"
                          className="resize-none min-h-[80px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Separator className="my-4" />

                <div className="flex items-center justify-between space-x-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base font-semibold">重要患者設定</FormLabel>
                    <p className="text-sm text-muted-foreground">
                      特別な配慮が必要な患者として設定します
                    </p>
                  </div>
                  <FormField
                    control={form.control}
                    name="isCritical"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            {/* 保険・介護情報 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">保険・介護情報</CardTitle>
                <CardDescription>保険種別、介護度、特別訪問看護等を入力してください</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="insuranceType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>保険種別</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="選択してください" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="medical">医療保険</SelectItem>
                            <SelectItem value="care">介護保険</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="careLevel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>介護度</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="選択してください" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="support1">要支援1</SelectItem>
                            <SelectItem value="support2">要支援2</SelectItem>
                            <SelectItem value="care1">要介護1</SelectItem>
                            <SelectItem value="care2">要介護2</SelectItem>
                            <SelectItem value="care3">要介護3</SelectItem>
                            <SelectItem value="care4">要介護4</SelectItem>
                            <SelectItem value="care5">要介護5</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="specialCareType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>特別訪問看護</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="選択してください" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">なし</SelectItem>
                          <SelectItem value="bedsore">褥瘡ケア</SelectItem>
                          <SelectItem value="rare_disease">難病等</SelectItem>
                          <SelectItem value="mental">精神科訪問看護</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Separator className="my-4" />

                <div className="space-y-4">
                  <div className="flex items-center justify-between space-x-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base font-semibold">入院中</FormLabel>
                      <p className="text-sm text-muted-foreground">
                        現在入院中の場合は有効にしてください
                      </p>
                    </div>
                    <FormField
                      control={form.control}
                      name="isInHospital"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex items-center justify-between space-x-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base font-semibold">ショートステイ中</FormLabel>
                      <p className="text-sm text-muted-foreground">
                        現在ショートステイ中の場合は有効にしてください
                      </p>
                    </div>
                    <FormField
                      control={form.control}
                      name="isInShortStay"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <Separator className="my-4" />

                {/* Phase 2-A: 退院・計画・死亡情報 */}
                <div className="space-y-4">
                  <h3 className="text-base font-semibold">退院・計画・死亡情報</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="lastDischargeDate"
                      render={({ field }) => {
                        // 常に最新の値を取得
                        const currentValue = form.watch("lastDischargeDate")

                        return (
                          <FormItem>
                            <FormLabel>直近の退院日</FormLabel>
                            <Popover open={isLastDischargeDateOpen} onOpenChange={setIsLastDischargeDateOpen}>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant="outline"
                                    className={`w-full justify-start text-left font-normal ${!currentValue && "text-muted-foreground"}`}
                                  >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {currentValue ? format(currentValue, "yyyy年MM月dd日", { locale: ja }) : <span>退院日を選択</span>}
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                {isLastDischargeDateOpen && (
                                  <DatePickerWithYearMonth
                                    selected={currentValue}
                                    onSelect={(date) => {
                                      field.onChange(date)
                                      setTimeout(() => setIsLastDischargeDateOpen(false), 0)
                                    }}
                                    disabled={(date) =>
                                      date > new Date() || date < new Date("1900-01-01")
                                    }
                                    minYear={1900}
                                    maxYear={new Date().getFullYear()}
                                  />
                                )}
                              </PopoverContent>
                            </Popover>
                            <FormMessage />
                          </FormItem>
                        )
                      }}
                    />

                    <FormField
                      control={form.control}
                      name="lastPlanCreatedDate"
                      render={({ field }) => {
                        const currentValue = form.watch("lastPlanCreatedDate")

                        return (
                          <FormItem>
                            <FormLabel>直近の訪問看護計画作成日</FormLabel>
                            <Popover open={isLastPlanDateOpen} onOpenChange={setIsLastPlanDateOpen}>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant="outline"
                                    className={`w-full justify-start text-left font-normal ${!currentValue && "text-muted-foreground"}`}
                                  >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {currentValue ? format(currentValue, "yyyy年MM月dd日", { locale: ja }) : <span>計画作成日を選択</span>}
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                {isLastPlanDateOpen && (
                                  <DatePickerWithYearMonth
                                    selected={currentValue}
                                    onSelect={(date) => {
                                      field.onChange(date)
                                      setTimeout(() => setIsLastPlanDateOpen(false), 0)
                                    }}
                                  />
                                )}
                              </PopoverContent>
                            </Popover>
                            <FormMessage />
                          </FormItem>
                        )
                      }}
                    />

                    <FormField
                      control={form.control}
                      name="deathDate"
                      render={({ field }) => {
                        const currentValue = form.watch("deathDate")

                        return (
                          <FormItem>
                            <FormLabel>死亡日</FormLabel>
                            <Popover open={isDeathDateOpen} onOpenChange={setIsDeathDateOpen}>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant="outline"
                                    className={`w-full justify-start text-left font-normal ${!currentValue && "text-muted-foreground"}`}
                                  >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {currentValue ? format(currentValue, "yyyy年MM月dd日", { locale: ja }) : <span>死亡日を選択</span>}
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                {isDeathDateOpen && (
                                  <DatePickerWithYearMonth
                                    selected={currentValue}
                                    onSelect={(date) => {
                                      field.onChange(date)
                                      setTimeout(() => setIsDeathDateOpen(false), 0)
                                    }}
                                  />
                                )}
                              </PopoverContent>
                            </Popover>
                            <FormMessage />
                          </FormItem>
                        )
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 特別管理加算 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">特別管理加算</CardTitle>
                <CardDescription>特別な医療管理が必要な項目を選択してください</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="specialManagementTypes"
                  render={() => (
                    <FormItem>
                      <div className="mb-4">
                        <FormLabel className="text-base">管理内容（複数選択可）</FormLabel>
                      </div>
                      {isLoadingSpecialManagement ? (
                        <div className="text-sm text-muted-foreground">読み込み中...</div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {specialManagementDefinitions.map((item) => (
                            <FormField
                              key={item.category}
                              control={form.control}
                              name="specialManagementTypes"
                              render={({ field }) => {
                                return (
                                  <FormItem
                                    key={item.category}
                                    className="flex flex-row items-start space-x-3 space-y-0"
                                  >
                                    <FormControl>
                                      <Checkbox
                                        checked={field.value?.includes(item.category)}
                                        onCheckedChange={(checked) => {
                                          return checked
                                            ? field.onChange([...(field.value || []), item.category])
                                            : field.onChange(
                                                field.value?.filter(
                                                  (value) => value !== item.category
                                                )
                                              )
                                        }}
                                      />
                                    </FormControl>
                                    <div className="space-y-1 leading-none">
                                      <FormLabel className="font-normal cursor-pointer">
                                        {item.displayName}
                                      </FormLabel>
                                      <p className="text-xs text-muted-foreground">
                                        [{formatInsuranceType(item.insuranceType)}]
                                      </p>
                                    </div>
                                  </FormItem>
                                )
                              }}
                            />
                        ))}
                        </div>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Separator className="my-4" />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="specialManagementStartDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>開始日</FormLabel>
                        <Popover open={isStartDateOpen} onOpenChange={setIsStartDateOpen}>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className="w-full pl-3 text-left font-normal"
                              >
                                {field.value ? (
                                  format(field.value, "yyyy年MM月dd日", { locale: ja })
                                ) : (
                                  <span className="text-muted-foreground">開始日を選択</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            {isStartDateOpen && (
                              <DatePickerWithYearMonth
                                selected={field.value}
                                onSelect={(date) => {
                                  field.onChange(date)
                                  setIsStartDateOpen(false)
                                }}
                                disabled={(date) =>
                                  date > new Date() || date < new Date("2000-01-01")
                                }
                                minYear={2000}
                                maxYear={new Date().getFullYear()}
                              />
                            )}
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="specialManagementEndDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>終了日（空白は継続中）</FormLabel>
                        <Popover open={isEndDateOpen} onOpenChange={setIsEndDateOpen}>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className="w-full pl-3 text-left font-normal"
                              >
                                {field.value ? (
                                  format(field.value, "yyyy年MM月dd日", { locale: ja })
                                ) : (
                                  <span className="text-muted-foreground">終了日を選択</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            {isEndDateOpen && (
                              <DatePickerWithYearMonth
                                selected={field.value}
                                onSelect={(date) => {
                                  field.onChange(date)
                                  setIsEndDateOpen(false)
                                }}
                                disabled={(date) =>
                                  date < new Date("2000-01-01")
                                }
                                minYear={2000}
                                maxYear={new Date().getFullYear() + 5}
                              />
                            )}
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isLoading}
              >
                <X className="mr-2 h-4 w-4" />
                キャンセル
              </Button>
              <Button
                type="submit"
                disabled={isLoading}
              >
                <Save className="mr-2 h-4 w-4" />
                {isLoading
                  ? mode === "create"
                    ? "登録中..."
                    : "更新中..."
                  : mode === "create"
                  ? "登録"
                  : "更新"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}