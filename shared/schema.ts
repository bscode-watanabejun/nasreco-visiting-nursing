import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, decimal, date, pgEnum, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums for various status fields
export const userRoleEnum = pgEnum("user_role", ["admin", "nurse", "manager", "corporate_admin"]);
export const userAccessLevelEnum = pgEnum("user_access_level", ["facility", "corporate"]);
export const genderEnum = pgEnum("gender", ["male", "female", "other"]);
export const recordTypeEnum = pgEnum("record_type", ["vital_signs", "medication", "wound_care", "general_care", "assessment"]);
export const visitStatusEnum = pgEnum("visit_status", ["scheduled", "completed", "cancelled", "no_show"]);
export const recordStatusEnum = pgEnum("record_status", ["draft", "completed", "reviewed"]);
export const visitStatusRecordEnum = pgEnum("visit_status_record", ["pending", "completed", "no_show", "refused", "cancelled", "rescheduled"]);
export const insuranceTypeEnum = pgEnum("insurance_type", ["medical", "care"]);
export const careLevelEnum = pgEnum("care_level", ["support1", "support2", "care1", "care2", "care3", "care4", "care5"]);
export const specialCareTypeEnum = pgEnum("special_care_type", ["bedsore", "rare_disease", "mental", "none"]);
export const recurrencePatternEnum = pgEnum("recurrence_pattern", ["none", "daily", "weekly_monday", "weekly_tuesday", "weekly_wednesday", "weekly_thursday", "weekly_friday", "weekly_saturday", "weekly_sunday", "biweekly", "monthly"]);
export const scheduleStatusEnum = pgEnum("schedule_status", ["scheduled", "in_progress", "completed", "cancelled"]);
export const insuranceCardTypeEnum = pgEnum("insurance_card_type", ["medical", "long_term_care"]);
export const copaymentRateEnum = pgEnum("copayment_rate", ["10", "20", "30"]);

// ========== Session Table (express-session store) ==========
// Note: This table is managed by connect-pg-simple, but we define it here to prevent drizzle-kit from deleting it
// Match the exact structure created by connect-pg-simple to avoid migration warnings
export const session = pgTable("session", {
  sid: varchar("sid").primaryKey(), // No length specified to match existing table
  sess: json("sess").notNull(), // Session data as JSON
  expire: timestamp("expire", { precision: 6, withTimezone: false }).notNull(), // Match existing timestamp(6) without timezone
});

// ========== Companies Table (Hierarchical Multi-tenant support) ==========
export const companies = pgTable("companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  domain: text("domain").notNull().unique(), // e.g., "nasreco.com"
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ========== Facilities Table (Enhanced Multi-tenant support) ==========
export const facilities = pgTable("facilities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  name: text("name").notNull(),
  slug: text("slug").notNull(), // e.g., "tokyo-honin", "sakura-station"
  isHeadquarters: boolean("is_headquarters").notNull().default(false),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ========== Buildings Table (Same Building Management) ==========
export const buildings = pgTable("buildings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  facilityId: varchar("facility_id").notNull().references(() => facilities.id),
  name: text("name").notNull(),
  address: text("address").notNull(),
  postalCode: text("postal_code"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ========== Users Table (Enhanced with hierarchical access) ==========
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  facilityId: varchar("facility_id").notNull().references(() => facilities.id),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull().unique(),
  fullName: text("full_name").notNull(),
  role: userRoleEnum("role").notNull().default("nurse"),
  accessLevel: userAccessLevelEnum("access_level").notNull().default("facility"),
  licenseNumber: text("license_number"),
  phone: text("phone"),
  isActive: boolean("is_active").notNull().default(true),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ========== Patients Table ==========
export const patients = pgTable("patients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  facilityId: varchar("facility_id").notNull().references(() => facilities.id),
  patientNumber: text("patient_number").notNull(),
  lastName: text("last_name").notNull(),
  firstName: text("first_name").notNull(),
  dateOfBirth: date("date_of_birth").notNull(),
  gender: genderEnum("gender").notNull(),
  address: text("address"),
  phone: text("phone"),
  emergencyContact: text("emergency_contact"),
  emergencyPhone: text("emergency_phone"),
  insuranceNumber: text("insurance_number"),
  medicalHistory: text("medical_history"),
  allergies: text("allergies"),
  currentMedications: text("current_medications"),
  careNotes: text("care_notes"),
  isActive: boolean("is_active").notNull().default(true),
  isCritical: boolean("is_critical").notNull().default(false),

  // Enhanced fields for care management
  careLevel: careLevelEnum("care_level"), // 要支援1-2, 要介護1-5
  insuranceType: insuranceTypeEnum("insurance_type"), // 医療保険 or 介護保険
  specialCareType: specialCareTypeEnum("special_care_type").default("none"), // 特別訪問看護
  buildingId: varchar("building_id").references(() => buildings.id), // 同一建物管理
  isInHospital: boolean("is_in_hospital").notNull().default(false), // 入院中
  isInShortStay: boolean("is_in_short_stay").notNull().default(false), // ショートステイ中

  // Medical institution and care manager references (Phase 1 addition)
  medicalInstitutionId: varchar("medical_institution_id").references(() => medicalInstitutions.id), // 主治医
  careManagerId: varchar("care_manager_id").references(() => careManagers.id), // ケアマネージャー

  // Special management addition (特別管理加算)
  specialManagementTypes: text("special_management_types").array(), // 特管項目（複数選択）
  specialManagementStartDate: date("special_management_start_date"), // 特管開始日
  specialManagementEndDate: date("special_management_end_date"), // 特管終了日（nullは継続中）

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ========== Visits Table (Scheduling) ==========
export const visits = pgTable("visits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  facilityId: varchar("facility_id").notNull().references(() => facilities.id),
  patientId: varchar("patient_id").notNull().references(() => patients.id),
  nurseId: varchar("nurse_id").notNull().references(() => users.id),
  scheduledDate: timestamp("scheduled_date", { withTimezone: true }).notNull(),
  estimatedDuration: integer("estimated_duration").notNull().default(60), // minutes
  purpose: text("purpose").notNull(),
  status: visitStatusEnum("status").notNull().default("scheduled"),
  actualStartTime: timestamp("actual_start_time", { withTimezone: true }),
  actualEndTime: timestamp("actual_end_time", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ========== Schedules Table (Enhanced Scheduling) ==========
export const schedules = pgTable("schedules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  facilityId: varchar("facility_id").notNull().references(() => facilities.id),
  patientId: varchar("patient_id").notNull().references(() => patients.id),
  nurseId: varchar("nurse_id").references(() => users.id), // Nullable for demo staff
  demoStaffName: text("demo_staff_name"), // For non-assigned staff system (ABC, etc.)
  scheduledDate: timestamp("scheduled_date", { withTimezone: true }).notNull(),
  scheduledStartTime: timestamp("scheduled_start_time", { withTimezone: true }).notNull(),
  scheduledEndTime: timestamp("scheduled_end_time", { withTimezone: true }).notNull(),
  duration: integer("duration").notNull().default(60), // minutes
  purpose: text("purpose").notNull(),
  status: scheduleStatusEnum("status").notNull().default("scheduled"), // Schedule status
  actualStartTime: timestamp("actual_start_time", { withTimezone: true }), // When nurse starts the visit
  actualEndTime: timestamp("actual_end_time", { withTimezone: true }), // When nurse completes the visit
  isRecurring: boolean("is_recurring").notNull().default(false),
  recurrencePattern: recurrencePatternEnum("recurrence_pattern").default("none"),
  recurrenceEndDate: date("recurrence_end_date"),
  recurrenceDays: text("recurrence_days"), // JSON array of days [0-6] where 0=Sunday, 1=Monday, etc. e.g., "[1,3,5]" for Mon/Wed/Fri
  parentScheduleId: varchar("parent_schedule_id"), // Groups recurring schedules together (references schedules.id but not FK to allow deletion)
  visitType: text("visit_type"), // "定期訪問", "緊急訪問", etc.
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ========== Additional Payments Table (加算管理) ==========
export const additionalPayments = pgTable("additional_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  facilityId: varchar("facility_id").notNull().references(() => facilities.id),
  patientId: varchar("patient_id").notNull().references(() => patients.id),
  type: text("type").notNull(), // "special_management", "multiple_visits", "emergency", "long_visit"
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  reason: text("reason"), // 複数回訪問理由、緊急訪問理由など
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ========== Nursing Records Table ==========
export const nursingRecords = pgTable("nursing_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  facilityId: varchar("facility_id").notNull().references(() => facilities.id),
  patientId: varchar("patient_id").notNull().references(() => patients.id),
  nurseId: varchar("nurse_id").notNull().references(() => users.id),
  visitId: varchar("visit_id").references(() => visits.id),
  scheduleId: varchar("schedule_id").references(() => schedules.id), // Schedule reference for tracking
  recordType: recordTypeEnum("record_type").notNull(),
  recordDate: timestamp("record_date", { withTimezone: true }).notNull(),
  visitDate: date("visit_date").notNull().default(sql`CURRENT_DATE`), // 訪問日（実際の訪問が行われた日付）

  // Record status
  status: recordStatusEnum("status").notNull().default("draft"),

  // Visit information
  visitStatusRecord: visitStatusRecordEnum("visit_status_record"), // 訪問ステータス
  actualStartTime: timestamp("actual_start_time", { withTimezone: true }), // 実際の開始時間
  actualEndTime: timestamp("actual_end_time", { withTimezone: true }), // 実際の終了時間
  isSecondVisit: boolean("is_second_visit").notNull().default(false), // 本日2回目以降の訪問

  // Vital Signs (if applicable)
  bloodPressureSystolic: integer("blood_pressure_systolic"),
  bloodPressureDiastolic: integer("blood_pressure_diastolic"),
  heartRate: integer("heart_rate"),
  temperature: decimal("temperature", { precision: 4, scale: 1 }),
  respiratoryRate: integer("respiratory_rate"),
  oxygenSaturation: integer("oxygen_saturation"),

  // General content
  title: text("title").notNull(),
  content: text("content").notNull(),
  observations: text("observations"),
  interventions: text("interventions"),
  evaluation: text("evaluation"),

  // Patient and family response
  patientFamilyResponse: text("patient_family_response"),

  // Additional payment related fields (加算関連)
  multipleVisitReason: text("multiple_visit_reason"), // 複数回訪問理由
  emergencyVisitReason: text("emergency_visit_reason"), // 緊急訪問理由
  longVisitReason: text("long_visit_reason"), // 長時間訪問理由
  hasAdditionalPaymentAlert: boolean("has_additional_payment_alert").default(false), // 加算未入力アラート

  // Phase 1: Bonus calculation fields (加算計算フィールド)
  calculatedPoints: integer("calculated_points"), // 算定点数
  appliedBonuses: json("applied_bonuses"), // 適用加算の詳細（JSON配列）

  // Special management record data (特別管理記録データ)
  specialManagementData: json("special_management_data"), // 特管記録（JSON形式）

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// ========== Medications Table ==========
export const medications = pgTable("medications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  facilityId: varchar("facility_id").notNull().references(() => facilities.id),
  patientId: varchar("patient_id").notNull().references(() => patients.id),
  nurseId: varchar("nurse_id").notNull().references(() => users.id),
  medicationName: text("medication_name").notNull(),
  dosage: text("dosage").notNull(),
  frequency: text("frequency").notNull(),
  route: text("route").notNull(), // oral, injection, topical, etc.
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  instructions: text("instructions"),
  sideEffects: text("side_effects"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ========== Nursing Record Attachments Table ==========
export const nursingRecordAttachments = pgTable("nursing_record_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nursingRecordId: varchar("nursing_record_id").references(() => nursingRecords.id),
  fileName: text("file_name").notNull(),
  originalFileName: text("original_file_name").notNull(),
  fileType: text("file_type").notNull(), // image/jpeg, image/png, application/pdf
  fileSize: integer("file_size").notNull(), // bytes
  filePath: text("file_path").notNull(), // relative path from uploads directory
  caption: text("caption"), // メモ・説明
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ========== Medical Institutions Table (医療機関マスタ) ==========
export const medicalInstitutions = pgTable("medical_institutions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  facilityId: varchar("facility_id").notNull().references(() => facilities.id),
  name: text("name").notNull(), // 病院名・診療所名
  department: text("department"), // 診療科
  doctorName: text("doctor_name").notNull(), // 医師名
  postalCode: text("postal_code"), // 郵便番号
  address: text("address"), // 住所
  phone: text("phone"), // 電話番号
  fax: text("fax"), // FAX番号
  email: text("email"), // メールアドレス
  notes: text("notes"), // 備考
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ========== Care Managers Table (ケアマネージャーマスタ) ==========
export const careManagers = pgTable("care_managers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  facilityId: varchar("facility_id").notNull().references(() => facilities.id),
  officeName: text("office_name").notNull(), // 事業所名
  managerName: text("manager_name").notNull(), // ケアマネージャー名
  postalCode: text("postal_code"), // 郵便番号
  address: text("address"), // 住所
  phone: text("phone"), // 電話番号
  fax: text("fax"), // FAX番号
  email: text("email"), // メールアドレス
  notes: text("notes"), // 備考
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ========== Doctor Orders Table (訪問看護指示書) ==========
export const doctorOrders = pgTable("doctor_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  facilityId: varchar("facility_id").notNull().references(() => facilities.id),
  patientId: varchar("patient_id").notNull().references(() => patients.id),
  medicalInstitutionId: varchar("medical_institution_id").notNull().references(() => medicalInstitutions.id),
  orderDate: date("order_date").notNull(), // 指示日
  startDate: date("start_date").notNull(), // 指示期間開始日
  endDate: date("end_date").notNull(), // 指示期間終了日
  diagnosis: text("diagnosis").notNull(), // 病名・主たる傷病名
  orderContent: text("order_content").notNull(), // 指示内容
  weeklyVisitLimit: integer("weekly_visit_limit"), // 週の訪問回数上限
  filePath: text("file_path"), // PDF/画像ファイルパス
  originalFileName: text("original_file_name"), // 元のファイル名
  notes: text("notes"), // 備考
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ========== Insurance Cards Table (保険証情報) ==========
export const insuranceCards = pgTable("insurance_cards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  facilityId: varchar("facility_id").notNull().references(() => facilities.id),
  patientId: varchar("patient_id").notNull().references(() => patients.id),
  cardType: insuranceCardTypeEnum("card_type").notNull(), // 保険証種別（医療保険・介護保険）
  insurerNumber: text("insurer_number").notNull(), // 保険者番号
  insuredNumber: text("insured_number").notNull(), // 被保険者番号
  insuredSymbol: text("insured_symbol"), // 記号（医療保険のみ）
  insuredCardNumber: text("insured_card_number"), // 番号（医療保険のみ）
  copaymentRate: copaymentRateEnum("copayment_rate"), // 負担割合（1割・2割・3割）
  validFrom: date("valid_from").notNull(), // 有効期間開始日
  validUntil: date("valid_until"), // 有効期限（nullの場合は無期限）
  certificationDate: date("certification_date"), // 認定日（介護保険のみ）
  filePath: text("file_path"), // PDF/画像ファイルパス
  originalFileName: text("original_file_name"), // 元のファイル名
  notes: text("notes"), // 備考
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ========== Care Plans Table (訪問看護計画書) ==========
export const carePlans = pgTable("care_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  facilityId: varchar("facility_id").notNull().references(() => facilities.id),
  patientId: varchar("patient_id").notNull().references(() => patients.id),
  doctorOrderId: varchar("doctor_order_id").references(() => doctorOrders.id), // 関連する訪問看護指示書
  planNumber: text("plan_number"), // 計画書番号
  planDate: date("plan_date").notNull(), // 計画作成日
  planPeriodStart: date("plan_period_start").notNull(), // 計画期間開始日
  planPeriodEnd: date("plan_period_end").notNull(), // 計画期間終了日
  nursingGoals: text("nursing_goals"), // 看護目標
  problemList: json("problem_list"), // 課題リスト（JSON配列）
  nursingPlan: text("nursing_plan"), // 看護計画
  weeklyVisitPlan: text("weekly_visit_plan"), // 週間訪問計画（例：月・水・金）
  remarks: text("remarks"), // 備考
  filePath: text("file_path"), // PDF/画像ファイルパス
  originalFileName: text("original_file_name"), // 元のファイル名
  createdBy: varchar("created_by").notNull().references(() => users.id), // 作成者
  approvedBy: varchar("approved_by").references(() => users.id), // 承認者
  approvedAt: timestamp("approved_at", { withTimezone: true }), // 承認日時
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ========== Service Care Plans Table (居宅サービス計画書 - ケアマネ作成) ==========
export const serviceCareplanTypeEnum = pgEnum("service_careplan_type", ["initial", "update", "revision"]);

export const serviceCarePlans = pgTable("service_care_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  facilityId: varchar("facility_id").notNull().references(() => facilities.id),
  patientId: varchar("patient_id").notNull().references(() => patients.id),

  // 基本情報
  planType: serviceCareplanTypeEnum("plan_type").notNull().default("initial"),
  planNumber: text("plan_number"), // 計画書番号
  planDate: date("plan_date").notNull(), // 作成日
  initialPlanDate: date("initial_plan_date"), // 初回作成日

  // 認定情報
  certificationDate: date("certification_date"), // 認定日
  certificationPeriodStart: date("certification_period_start"), // 認定有効期間開始
  certificationPeriodEnd: date("certification_period_end"), // 認定有効期間終了

  // 利用者・家族の意向
  userIntention: text("user_intention"), // 利用者の生活に対する意向
  familyIntention: text("family_intention"), // 家族の意向

  // 援助方針
  comprehensivePolicy: text("comprehensive_policy"), // 総合的な援助の方針

  // 生活課題と目標（JSON配列）
  lifeChallenges: json("life_challenges"), // [{challenge, longTermGoal, shortTermGoal, supportContent, serviceType, frequency, period}]

  // 週間サービス計画（JSON配列）
  weeklySchedule: json("weekly_schedule"), // [{dayOfWeek, timeSlot, service, provider}]

  // サービス担当者会議
  meetingDate: timestamp("meeting_date", { withTimezone: true }), // 会議開催日時
  meetingParticipants: text("meeting_participants"), // 参加者
  meetingNotes: text("meeting_notes"), // 検討内容

  // モニタリング
  monitoringNotes: text("monitoring_notes"), // モニタリング記録

  // 備考
  remarks: text("remarks"), // 備考

  // ファイル添付
  filePath: text("file_path"), // PDF/画像ファイルパス
  originalFileName: text("original_file_name"), // 元のファイル名

  // メタ情報
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ========== Care Reports Table (訪問看護報告書) ==========
export const careReports = pgTable("care_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  facilityId: varchar("facility_id").notNull().references(() => facilities.id),
  patientId: varchar("patient_id").notNull().references(() => patients.id),
  carePlanId: varchar("care_plan_id").references(() => carePlans.id), // 関連する訪問看護計画書
  reportNumber: text("report_number"), // 報告書番号
  reportDate: date("report_date").notNull(), // 報告日
  reportPeriodStart: date("report_period_start").notNull(), // 報告期間開始日
  reportPeriodEnd: date("report_period_end").notNull(), // 報告期間終了日
  visitCount: integer("visit_count"), // 訪問回数
  patientCondition: text("patient_condition"), // 利用者の状態
  nursingOutcomes: text("nursing_outcomes"), // 看護実施内容・成果
  problemsAndActions: text("problems_and_actions"), // 今後の課題と対応
  familySupport: text("family_support"), // 家族支援の状況
  communicationWithDoctor: text("communication_with_doctor"), // 主治医との連携内容
  communicationWithCareManager: text("communication_with_care_manager"), // ケアマネとの連携内容
  remarks: text("remarks"), // 特記事項
  filePath: text("file_path"), // PDF/画像ファイルパス
  originalFileName: text("original_file_name"), // 元のファイル名
  createdBy: varchar("created_by").notNull().references(() => users.id), // 作成者
  approvedBy: varchar("approved_by").references(() => users.id), // 承認者
  approvedAt: timestamp("approved_at", { withTimezone: true }), // 承認日時
  sentToDoctorAt: timestamp("sent_to_doctor_at", { withTimezone: true }), // 医師への提出日時
  sentToCareManagerAt: timestamp("sent_to_care_manager_at", { withTimezone: true }), // ケアマネへの提出日時
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ========== Contracts Table (契約書・同意書) ==========
export const contractTypeEnum = pgEnum("contract_type", [
  "service_agreement", // サービス利用契約書
  "important_matters", // 重要事項説明書
  "personal_info_consent", // 個人情報利用同意書
  "medical_consent", // 医療行為同意書
  "other" // その他
]);

export const contracts = pgTable("contracts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  facilityId: varchar("facility_id").notNull().references(() => facilities.id),
  patientId: varchar("patient_id").notNull().references(() => patients.id),
  contractType: contractTypeEnum("contract_type").notNull(),
  contractDate: date("contract_date").notNull(), // 契約日
  startDate: date("start_date").notNull(), // 有効開始日
  endDate: date("end_date"), // 有効終了日（nullの場合は無期限）
  title: text("title").notNull(), // 契約書タイトル
  description: text("description"), // 説明・備考
  filePath: text("file_path"), // PDF/画像ファイルパス
  fileName: text("file_name"), // ファイル名（非推奨、後方互換性のため残す）
  originalFileName: text("original_file_name"), // 元のファイル名
  signedBy: text("signed_by"), // 署名者（利用者または代理人）
  witnessedBy: varchar("witnessed_by").references(() => users.id), // 立会人（スタッフ）
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ========== Special Management Definitions Table (特別管理加算マスタ) ==========
export const insuranceTypeSpecialEnum = pgEnum("insurance_type_special", ["medical_5000", "medical_2500", "care_500", "care_250"]);
export const fieldTypeEnum = pgEnum("field_type", ["text", "number", "select", "textarea"]);

export const specialManagementDefinitions = pgTable("special_management_definitions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  facilityId: varchar("facility_id").references(() => facilities.id), // null = 全施設共通
  category: varchar("category", { length: 50 }).notNull(), // 'special_001', 'special_002'等（自動生成）
  displayName: varchar("display_name", { length: 100 }).notNull(), // '在宅酸素療法'
  insuranceType: insuranceTypeSpecialEnum("insurance_type").notNull(), // 'medical_5000'等
  monthlyPoints: integer("monthly_points").notNull(), // 月額加算点数（円）
  description: text("description"), // 説明
  displayOrder: integer("display_order").notNull().default(0), // 表示順序
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ========== Special Management Fields Table (特管フィールド定義) ==========
export const specialManagementFields = pgTable("special_management_fields", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  definitionId: varchar("definition_id").notNull().references(() => specialManagementDefinitions.id, { onDelete: "cascade" }),
  fieldName: varchar("field_name", { length: 50 }).notNull(), // 'flow_rate', 'spo2'等
  fieldLabel: varchar("field_label", { length: 100 }).notNull(), // '酸素流量(L/分)'
  fieldType: fieldTypeEnum("field_type").notNull(), // 'number', 'text', 'select'
  fieldOptions: json("field_options"), // selectの場合の選択肢 ["24時間", "夜間のみ"]
  isRequired: boolean("is_required").notNull().default(false),
  displayOrder: integer("display_order").notNull().default(0), // 表示順序
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ========== Insert Schemas ==========
export const insertCompanySchema = createInsertSchema(companies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFacilitySchema = createInsertSchema(facilities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPatientSchema = createInsertSchema(patients).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertVisitSchema = createInsertSchema(visits).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertNursingRecordSchema = createInsertSchema(nursingRecords).omit({
  id: true,
  facilityId: true, // Set by server from user session
  nurseId: true,    // Set by server from user session
  createdAt: true,
  updatedAt: true,
}).extend({
  recordDate: z.coerce.date(),
  visitTime: z.coerce.date().optional().nullable(),
  actualStartTime: z.coerce.date().optional().nullable(),
  actualEndTime: z.coerce.date().optional().nullable(),
});

export const insertMedicationSchema = createInsertSchema(medications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBuildingSchema = createInsertSchema(buildings).omit({
  id: true,
  facilityId: true, // Set by server from user session
  createdAt: true,
  updatedAt: true,
});

export const insertScheduleSchema = createInsertSchema(schedules).omit({
  id: true,
  facilityId: true, // Set by server from user session
  status: true, // Defaults to 'scheduled'
  actualStartTime: true, // Set when status changes
  actualEndTime: true, // Set when status changes
  createdAt: true,
  updatedAt: true,
}).extend({
  scheduledDate: z.coerce.date(),
  scheduledStartTime: z.coerce.date(),
  scheduledEndTime: z.coerce.date(),
});

export const insertAdditionalPaymentSchema = createInsertSchema(additionalPayments).omit({
  id: true,
  facilityId: true, // Set by server from user session
  createdAt: true,
  updatedAt: true,
});

export const insertNursingRecordAttachmentSchema = createInsertSchema(nursingRecordAttachments).omit({
  id: true,
  createdAt: true,
});

export const insertMedicalInstitutionSchema = createInsertSchema(medicalInstitutions).omit({
  id: true,
  facilityId: true, // Set by server from user session
  createdAt: true,
  updatedAt: true,
});

export const insertCareManagerSchema = createInsertSchema(careManagers).omit({
  id: true,
  facilityId: true, // Set by server from user session
  createdAt: true,
  updatedAt: true,
});

export const insertDoctorOrderSchema = createInsertSchema(doctorOrders).omit({
  id: true,
  facilityId: true, // Set by server from user session
  createdAt: true,
  updatedAt: true,
});

export const insertInsuranceCardSchema = createInsertSchema(insuranceCards).omit({
  id: true,
  facilityId: true, // Set by server from user session
  createdAt: true,
  updatedAt: true,
});

export const insertCarePlanSchema = createInsertSchema(carePlans).omit({
  id: true,
  facilityId: true, // Set by server from user session
  createdBy: true, // Set by server from user session
  approvedBy: true, // Set separately when approved
  approvedAt: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
});

export const insertServiceCarePlanSchema = createInsertSchema(serviceCarePlans).omit({
  id: true,
  facilityId: true, // Set by server from user session
  isActive: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCareReportSchema = createInsertSchema(careReports).omit({
  id: true,
  facilityId: true, // Set by server from user session
  createdBy: true, // Set by server from user session
  approvedBy: true, // Set separately when approved
  approvedAt: true,
  sentToDoctorAt: true,
  sentToCareManagerAt: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
});

export const insertContractSchema = createInsertSchema(contracts).omit({
  id: true,
  facilityId: true, // Set by server from user session
  isActive: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSpecialManagementDefinitionSchema = createInsertSchema(specialManagementDefinitions).omit({
  id: true,
  facilityId: true, // Set by server from user session (or null for global)
  createdAt: true,
  updatedAt: true,
});

export const insertSpecialManagementFieldSchema = createInsertSchema(specialManagementFields).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// ========== Update Schemas ==========
// User self-update schema (limited fields for security)
export const updateUserSelfSchema = insertUserSchema.pick({
  fullName: true,
  phone: true,
  licenseNumber: true,
}).partial().extend({
  password: z.string().min(8, "パスワードは8文字以上で入力してください").optional(),
});

// Admin user update schema (excludes sensitive fields)
export const updateUserAdminSchema = insertUserSchema.omit({
  facilityId: true, // Cannot change facility
}).partial().extend({
  password: z.string().min(8, "パスワードは8文字以上で入力してください").optional(),
});

// General update schemas for other entities
export const updatePatientSchema = insertPatientSchema.omit({
  facilityId: true,
}).partial();

export const updateVisitSchema = insertVisitSchema.omit({
  facilityId: true,
}).partial();

export const updateMedicationSchema = insertMedicationSchema.omit({
  facilityId: true,
}).partial();

export const updateNursingRecordSchema = insertNursingRecordSchema.partial();

export const updateBuildingSchema = insertBuildingSchema.partial();

export const updateScheduleSchema = insertScheduleSchema.partial();

export const updateAdditionalPaymentSchema = insertAdditionalPaymentSchema.partial();

export const updateNursingRecordAttachmentSchema = insertNursingRecordAttachmentSchema.partial();

export const updateMedicalInstitutionSchema = insertMedicalInstitutionSchema.partial();

export const updateCareManagerSchema = insertCareManagerSchema.partial();

export const updateDoctorOrderSchema = insertDoctorOrderSchema.partial();

export const updateInsuranceCardSchema = insertInsuranceCardSchema.partial();

export const updateCarePlanSchema = insertCarePlanSchema.partial();

export const updateServiceCarePlanSchema = insertServiceCarePlanSchema.partial();

export const updateCareReportSchema = insertCareReportSchema.partial();

export const updateContractSchema = insertContractSchema.partial();

export const updateSpecialManagementDefinitionSchema = insertSpecialManagementDefinitionSchema.partial();

export const updateSpecialManagementFieldSchema = insertSpecialManagementFieldSchema.partial();

// ========== Type Exports ==========
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companies.$inferSelect;

export type InsertFacility = z.infer<typeof insertFacilitySchema>;
export type Facility = typeof facilities.$inferSelect;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertPatient = z.infer<typeof insertPatientSchema>;
export type Patient = typeof patients.$inferSelect;

export type InsertVisit = z.infer<typeof insertVisitSchema>;
export type Visit = typeof visits.$inferSelect;

export type InsertNursingRecord = z.infer<typeof insertNursingRecordSchema>;
export type NursingRecord = typeof nursingRecords.$inferSelect;

export type InsertMedication = z.infer<typeof insertMedicationSchema>;
export type Medication = typeof medications.$inferSelect;

export type InsertBuilding = z.infer<typeof insertBuildingSchema>;
export type Building = typeof buildings.$inferSelect;

export type InsertSchedule = z.infer<typeof insertScheduleSchema>;
export type Schedule = typeof schedules.$inferSelect;

export type InsertAdditionalPayment = z.infer<typeof insertAdditionalPaymentSchema>;
export type AdditionalPayment = typeof additionalPayments.$inferSelect;

export type InsertNursingRecordAttachment = z.infer<typeof insertNursingRecordAttachmentSchema>;
export type NursingRecordAttachment = typeof nursingRecordAttachments.$inferSelect;

export type InsertMedicalInstitution = z.infer<typeof insertMedicalInstitutionSchema>;
export type MedicalInstitution = typeof medicalInstitutions.$inferSelect;

export type InsertCareManager = z.infer<typeof insertCareManagerSchema>;
export type CareManager = typeof careManagers.$inferSelect;

export type InsertDoctorOrder = z.infer<typeof insertDoctorOrderSchema>;
export type DoctorOrder = typeof doctorOrders.$inferSelect;

export type InsertInsuranceCard = z.infer<typeof insertInsuranceCardSchema>;
export type InsuranceCard = typeof insuranceCards.$inferSelect;

export type InsertCarePlan = z.infer<typeof insertCarePlanSchema>;
export type CarePlan = typeof carePlans.$inferSelect;

export type InsertServiceCarePlan = z.infer<typeof insertServiceCarePlanSchema>;
export type ServiceCarePlan = typeof serviceCarePlans.$inferSelect;

export type InsertCareReport = z.infer<typeof insertCareReportSchema>;
export type CareReport = typeof careReports.$inferSelect;

export type InsertContract = z.infer<typeof insertContractSchema>;
export type Contract = typeof contracts.$inferSelect;

// Update Types
export type UpdateUserSelf = z.infer<typeof updateUserSelfSchema>;
export type UpdateUserAdmin = z.infer<typeof updateUserAdminSchema>;
export type UpdatePatient = z.infer<typeof updatePatientSchema>;
export type UpdateVisit = z.infer<typeof updateVisitSchema>;
export type UpdateNursingRecord = z.infer<typeof updateNursingRecordSchema>;
export type UpdateMedication = z.infer<typeof updateMedicationSchema>;
export type UpdateBuilding = z.infer<typeof updateBuildingSchema>;
export type UpdateSchedule = z.infer<typeof updateScheduleSchema>;
export type UpdateAdditionalPayment = z.infer<typeof updateAdditionalPaymentSchema>;
export type UpdateNursingRecordAttachment = z.infer<typeof updateNursingRecordAttachmentSchema>;
export type UpdateMedicalInstitution = z.infer<typeof updateMedicalInstitutionSchema>;
export type UpdateCareManager = z.infer<typeof updateCareManagerSchema>;
export type UpdateDoctorOrder = z.infer<typeof updateDoctorOrderSchema>;
export type UpdateInsuranceCard = z.infer<typeof updateInsuranceCardSchema>;
export type UpdateCarePlan = z.infer<typeof updateCarePlanSchema>;
export type UpdateServiceCarePlan = z.infer<typeof updateServiceCarePlanSchema>;
export type UpdateCareReport = z.infer<typeof updateCareReportSchema>;
export type UpdateContract = z.infer<typeof updateContractSchema>;

export type InsertSpecialManagementDefinition = z.infer<typeof insertSpecialManagementDefinitionSchema>;
export type SpecialManagementDefinition = typeof specialManagementDefinitions.$inferSelect;

export type InsertSpecialManagementField = z.infer<typeof insertSpecialManagementFieldSchema>;
export type SpecialManagementField = typeof specialManagementFields.$inferSelect;

export type UpdateSpecialManagementDefinition = z.infer<typeof updateSpecialManagementDefinitionSchema>;
export type UpdateSpecialManagementField = z.infer<typeof updateSpecialManagementFieldSchema>;

// Pagination Types
export interface PaginationOptions {
  page: number;
  limit: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// ========== Relations ==========

export const patientsRelations = relations(patients, ({ one, many }) => ({
  facility: one(facilities, {
    fields: [patients.facilityId],
    references: [facilities.id],
  }),
  medicalInstitution: one(medicalInstitutions, {
    fields: [patients.medicalInstitutionId],
    references: [medicalInstitutions.id],
  }),
  careManager: one(careManagers, {
    fields: [patients.careManagerId],
    references: [careManagers.id],
  }),
  building: one(buildings, {
    fields: [patients.buildingId],
    references: [buildings.id],
  }),
  doctorOrders: many(doctorOrders),
  insuranceCards: many(insuranceCards),
  nursingRecords: many(nursingRecords),
}));

export const medicalInstitutionsRelations = relations(medicalInstitutions, ({ one, many }) => ({
  facility: one(facilities, {
    fields: [medicalInstitutions.facilityId],
    references: [facilities.id],
  }),
  patients: many(patients),
  doctorOrders: many(doctorOrders),
}));

export const careManagersRelations = relations(careManagers, ({ one, many }) => ({
  facility: one(facilities, {
    fields: [careManagers.facilityId],
    references: [facilities.id],
  }),
  patients: many(patients),
}));

export const doctorOrdersRelations = relations(doctorOrders, ({ one }) => ({
  facility: one(facilities, {
    fields: [doctorOrders.facilityId],
    references: [facilities.id],
  }),
  patient: one(patients, {
    fields: [doctorOrders.patientId],
    references: [patients.id],
  }),
  medicalInstitution: one(medicalInstitutions, {
    fields: [doctorOrders.medicalInstitutionId],
    references: [medicalInstitutions.id],
  }),
}));

export const insuranceCardsRelations = relations(insuranceCards, ({ one }) => ({
  facility: one(facilities, {
    fields: [insuranceCards.facilityId],
    references: [facilities.id],
  }),
  patient: one(patients, {
    fields: [insuranceCards.patientId],
    references: [patients.id],
  }),
}));

export const carePlansRelations = relations(carePlans, ({ one }) => ({
  facility: one(facilities, {
    fields: [carePlans.facilityId],
    references: [facilities.id],
  }),
  patient: one(patients, {
    fields: [carePlans.patientId],
    references: [patients.id],
  }),
  doctorOrder: one(doctorOrders, {
    fields: [carePlans.doctorOrderId],
    references: [doctorOrders.id],
  }),
  createdBy: one(users, {
    fields: [carePlans.createdBy],
    references: [users.id],
  }),
  approvedBy: one(users, {
    fields: [carePlans.approvedBy],
    references: [users.id],
  }),
}));

export const serviceCarePlansRelations = relations(serviceCarePlans, ({ one }) => ({
  facility: one(facilities, {
    fields: [serviceCarePlans.facilityId],
    references: [facilities.id],
  }),
  patient: one(patients, {
    fields: [serviceCarePlans.patientId],
    references: [patients.id],
  }),
}));

export const careReportsRelations = relations(careReports, ({ one }) => ({
  facility: one(facilities, {
    fields: [careReports.facilityId],
    references: [facilities.id],
  }),
  patient: one(patients, {
    fields: [careReports.patientId],
    references: [patients.id],
  }),
  carePlan: one(carePlans, {
    fields: [careReports.carePlanId],
    references: [carePlans.id],
  }),
  createdBy: one(users, {
    fields: [careReports.createdBy],
    references: [users.id],
  }),
  approvedBy: one(users, {
    fields: [careReports.approvedBy],
    references: [users.id],
  }),
}));

export const schedulesRelations = relations(schedules, ({ one }) => ({
  facility: one(facilities, {
    fields: [schedules.facilityId],
    references: [facilities.id],
  }),
  patient: one(patients, {
    fields: [schedules.patientId],
    references: [patients.id],
  }),
  nurse: one(users, {
    fields: [schedules.nurseId],
    references: [users.id],
  }),
}));

export const nursingRecordsRelations = relations(nursingRecords, ({ one }) => ({
  facility: one(facilities, {
    fields: [nursingRecords.facilityId],
    references: [facilities.id],
  }),
  patient: one(patients, {
    fields: [nursingRecords.patientId],
    references: [patients.id],
  }),
  nurse: one(users, {
    fields: [nursingRecords.nurseId],
    references: [users.id],
  }),
  schedule: one(schedules, {
    fields: [nursingRecords.scheduleId],
    references: [schedules.id],
  }),
}));

export const contractsRelations = relations(contracts, ({ one }) => ({
  facility: one(facilities, {
    fields: [contracts.facilityId],
    references: [facilities.id],
  }),
  patient: one(patients, {
    fields: [contracts.patientId],
    references: [patients.id],
  }),
  witnessedBy: one(users, {
    fields: [contracts.witnessedBy],
    references: [users.id],
  }),
}));

export const specialManagementDefinitionsRelations = relations(specialManagementDefinitions, ({ one, many }) => ({
  facility: one(facilities, {
    fields: [specialManagementDefinitions.facilityId],
    references: [facilities.id],
  }),
  fields: many(specialManagementFields),
}));

export const specialManagementFieldsRelations = relations(specialManagementFields, ({ one }) => ({
  definition: one(specialManagementDefinitions, {
    fields: [specialManagementFields.definitionId],
    references: [specialManagementDefinitions.id],
  }),
}));
