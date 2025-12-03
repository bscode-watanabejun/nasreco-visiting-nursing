import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, decimal, date, pgEnum, json, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums for various status fields
export const userRoleEnum = pgEnum("user_role", ["admin", "nurse", "manager", "corporate_admin", "system_admin"]);
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

// Phase 3: レセプト動的判定用のENUM定義
export const relationshipTypeEnum = pgEnum("relationship_type", [
  "self",            // 本人/世帯主
  "preschool",       // 未就学者
  "family",          // 家族/その他
  "elderly_general", // 高齢受給者一般・低所得者
  "elderly_70",      // 高齢受給者7割
]);

export const ageCategoryEnum = pgEnum("age_category", [
  "preschool",       // 未就学者（6歳未満）
  "general",         // 一般
  "elderly",         // 高齢者（75歳以上）
]);

export const elderlyRecipientCategoryEnum = pgEnum("elderly_recipient_category", [
  "general_low",     // 一般・低所得者
  "seventy",         // 7割負担
]);

export const instructionTypeEnum = pgEnum("instruction_type", [
  "regular",                    // 01: 訪問看護指示
  "special",                    // 02: 特別訪問看護指示
  "psychiatric",                // 03: 精神科訪問看護指示
  "psychiatric_special",        // 04: 精神科特別訪問看護指示
  "medical_observation",        // 05: 医療観察精神科訪問看護指示
  "medical_observation_special", // 06: 医療観察精神科特別訪問看護指示
]);

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
  slug: text("slug").notNull().unique(), // e.g., "tokai", "shakenfuku" - URL path segment
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
  isActive: boolean("is_active").notNull().default(true),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),

  // Phase2-1: 施設体制フラグ（24時間対応体制・緊急時訪問看護）
  has24hSupportSystem: boolean("has_24h_support_system").default(false), // 24時間対応体制加算（医療保険）
  has24hSupportSystemEnhanced: boolean("has_24h_support_system_enhanced").default(false), // 24時間対応体制加算（看護業務負担軽減）
  hasEmergencySupportSystem: boolean("has_emergency_support_system").default(false), // 緊急時訪問看護加算（I）（介護保険）
  hasEmergencySupportSystemEnhanced: boolean("has_emergency_support_system_enhanced").default(false), // 緊急時訪問看護加算（II）（介護保険）
  burdenReductionMeasures: json("burden_reduction_measures"), // 看護業務負担軽減の取り組み（JSON配列）

  // レセプトCSV出力用フィールド
  facilityCode: varchar("facility_code", { length: 7 }), // 7桁の施設コード（既存データ考慮でNULLABLE）
  prefectureCode: varchar("prefecture_code", { length: 2 }), // 都道府県コード（既存データ考慮でNULLABLE）
  careInsuranceFacilityNumber: varchar("care_insurance_facility_number", { length: 10 }), // 10桁の指定事業所番号（介護保険レセプト用）

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: varchar("deleted_by"), // Foreign key to users.id (defined in relations)
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

  // Week 3: 専門管理加算用フィールド
  specialistCertifications: json("specialist_certifications"), // 専門資格配列（例: ["緩和ケア", "褥瘡ケア", "特定行為研修"]）

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
  kanaName: varchar("kana_name", { length: 50 }), // カナ氏名（全角カタカナ、既存データ考慮でNULLABLE）
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

  // Phase 2-A: 退院・計画・死亡情報
  lastDischargeDate: date("last_discharge_date"), // 直近の退院日
  lastPlanCreatedDate: date("last_plan_created_date"), // 直近の訪問看護計画作成日
  deathDate: date("death_date"), // 死亡日
  // RJレコード用：死亡詳細情報
  deathTime: varchar("death_time", { length: 4 }), // 死亡時刻（HHMM形式）
  deathPlaceCode: varchar("death_place_code", { length: 2 }), // 死亡場所コード（別表16）
  deathPlaceText: text("death_place_text"), // 死亡場所文字データ（コード99の場合のみ、最大130バイト）

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
  demoStaffNameOverride: text("demo_staff_name_override"), // スケジュール未連携時の手動入力
  purposeOverride: text("purpose_override"), // スケジュール未連携時の手動入力
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

  // Phase 2-A: 記録フラグ（加算判定用）
  isDischargeDate: boolean("is_discharge_date").default(false), // 退院日当日訪問
  isFirstVisitOfPlan: boolean("is_first_visit_of_plan").default(false), // 新規計画初回訪問
  hasCollaborationRecord: boolean("has_collaboration_record").default(false), // 多職種連携記録あり
  isTerminalCare: boolean("is_terminal_care").default(false), // ターミナルケア実施
  terminalCareDeathDate: date("terminal_care_death_date"), // ターミナルケア対象患者の死亡日

  // Week 3: 専門管理加算用フィールド
  specialistCareType: text("specialist_care_type"), // 専門的ケアの種類（palliative_care, pressure_ulcer, stoma_care, specific_procedures）

  // レセプトCSV出力用フィールド（新規訪問記録のみ必須）
  serviceCodeId: varchar("service_code_id").references(() => nursingServiceCodes.id), // サービスコードマスタへの参照
  visitLocationCode: varchar("visit_location_code", { length: 2 }), // 訪問場所コード
  visitLocationCustom: text("visit_location_custom"), // 訪問場所詳細（場所コード99の場合のみ、RJレコード用）
  staffQualificationCode: varchar("staff_qualification_code", { length: 2 }), // 職員資格コード
  publicExpenseId: varchar("public_expense_id").references(() => publicExpenseCards.id), // 公費ID（公費併用時のみ）

  // RJレコード用：訪問終了情報
  isServiceEnd: boolean("is_service_end").default(false), // 今回で訪問終了フラグ
  serviceEndReasonCode: varchar("service_end_reason_code", { length: 2 }), // 訪問終了状況コード（別表15）
  serviceEndReasonText: text("service_end_reason_text"), // 訪問終了状況文字データ（コード99の場合のみ、最大20バイト）

  // Phase 3: 編集管理用フィールド
  lastEditedBy: varchar("last_edited_by").references(() => users.id), // 最終編集者
  editCount: integer("edit_count").default(0), // 編集回数

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

  // レセプトCSV出力用フィールド
  institutionCode: varchar("institution_code", { length: 7 }), // 7桁の医療機関コード（既存データ考慮でNULLABLE）
  prefectureCode: varchar("prefecture_code", { length: 2 }), // 都道府県コード（既存データ考慮でNULLABLE）

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
  icd10Code: varchar("icd10_code", { length: 7 }), // ICD-10傷病コード（既存データ考慮でNULLABLE）
  orderContent: text("order_content").notNull(), // 指示内容
  weeklyVisitLimit: integer("weekly_visit_limit"), // 週の訪問回数上限
  filePath: text("file_path"), // PDF/画像ファイルパス
  originalFileName: text("original_file_name"), // 元のファイル名
  notes: text("notes"), // 備考

  // Phase 3: レセプト指示区分判定用のフィールド
  instructionType: instructionTypeEnum("instruction_type").notNull().default("regular"), // 指示区分
  insuranceType: insuranceTypeEnum("insurance_type"), // 保険種別（医療保険・介護保険）
  nursingInstructionStartDate: date("nursing_instruction_start_date"), // 訪問看護指示期間開始日
  nursingInstructionEndDate: date("nursing_instruction_end_date"), // 訪問看護指示期間終了日
  hasInfusionInstruction: boolean("has_infusion_instruction"), // 点滴注射指示の有無
  hasPressureUlcerTreatment: boolean("has_pressure_ulcer_treatment"), // 床ずれ処置の有無
  hasHomeInfusionManagement: boolean("has_home_infusion_management"), // 在宅患者訪問点滴注射管理指導料の有無
  diseasePresenceCode: varchar("disease_presence_code", { length: 2 }), // 基準告示第2の1に規定する疾病等の有無コード（別表13: '01'=別表7, '02'=別表8, '03'=無）

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

  // Phase 3: レセプト種別判定用の追加フィールド
  relationshipType: relationshipTypeEnum("relationship_type"), // 本人家族区分
  ageCategory: ageCategoryEnum("age_category"), // 年齢区分
  elderlyRecipientCategory: elderlyRecipientCategoryEnum("elderly_recipient_category"), // 高齢受給者区分

  // 審査支払機関コード ('1'=社会保険診療報酬支払基金, '2'=国民健康保険団体連合会)
  reviewOrganizationCode: varchar("review_organization_code", { length: 1 }),

  // 一部負担金区分（別表7: '1'=適用区分II, '3'=適用区分I, null=該当なし）
  partialBurdenCategory: varchar("partial_burden_category", { length: 1 }),

  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ========== Public Expense Cards Table (公費負担医療情報) ==========
// Phase 3: レセプト種別判定に必要な公費情報を管理
export const publicExpenseCards = pgTable("public_expense_cards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  facilityId: varchar("facility_id").notNull().references(() => facilities.id),
  patientId: varchar("patient_id").notNull().references(() => patients.id),

  // 公費情報
  beneficiaryNumber: text("beneficiary_number").notNull(), // 負担者番号（8桁）
  recipientNumber: text("recipient_number"), // 受給者番号（7桁）※医療観察法（法別30）は不要

  // 法別番号（公費の種類を識別）例: "10"=生活保護, "51"=特定疾患, "54"=難病
  legalCategoryNumber: text("legal_category_number").notNull(),

  // 優先順位（複数公費併用時の順序: 1=第一公費, 2=第二公費, 3=第三公費, 4=第四公費）
  priority: integer("priority").notNull(),

  // 給付率（百分率、0-100、NULL許可）
  benefitRate: integer("benefit_rate"), // 公費給付率（例：100, 80, 70）

  // 有効期間
  validFrom: date("valid_from").notNull(),
  validUntil: date("valid_until"),

  // その他
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

  // 居宅サービス計画作成情報（レセプトCSV出力用）
  creatorType: varchar("creator_type", { length: 1 }), // 作成区分コード（1=居宅介護支援事業所, 2=自己作成, 3=介護予防支援事業所）
  careManagerOfficeNumber: text("care_manager_office_number"), // 居宅介護支援事業所番号（10桁、作成区分が1または3のとき必須）

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

// ========== Phase 4: Bonus Master Tables (加算マスタ・改定対応) ==========

// Enums for bonus master
export const bonusPointsTypeEnum = pgEnum("bonus_points_type", ["fixed", "conditional"]);
export const bonusConditionalPatternEnum = pgEnum("bonus_conditional_pattern", [
  "monthly_14day_threshold",    // 月14日目までと以降で変動（緊急訪問等）
  "building_occupancy",          // 同一建物1-2人/3人以上
  "time_based",                  // 時間帯別（夜間・深夜等）
  "duration_based",              // 訪問時間長（90分超等）
  "age_based",                   // 年齢区分（6歳未満等）
  "visit_count",                 // 訪問回数（1日2回/3回以上等）
  "combination_control",         // 併算定制御
  "custom"                       // カスタム（JSONルール使用）
]);
export const frequencyLimitEnum = pgEnum("frequency_limit", [
  "unlimited",
  "weekly_1",
  "weekly_3",
  "monthly_1",
  "monthly_2",
  "daily_1"
]);

// Bonus Master Table (加算マスタ)
export const bonusMaster = pgTable("bonus_master", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  facilityId: varchar("facility_id").references(() => facilities.id), // null = 全施設共通

  // 基本情報
  bonusCode: varchar("bonus_code", { length: 50 }).notNull(), // 'emergency_visit', 'long_visit', etc.
  bonusName: text("bonus_name").notNull(), // '緊急訪問看護加算'
  bonusCategory: varchar("bonus_category", { length: 50 }).notNull(), // 'visit_care', 'management', 'information', etc.
  insuranceType: insuranceTypeEnum("insurance_type").notNull(), // 'medical' or 'care'

  // 点数設定
  pointsType: bonusPointsTypeEnum("points_type").notNull().default("fixed"), // 'fixed' or 'conditional'
  fixedPoints: integer("fixed_points"), // 固定点数の場合

  // 条件分岐パターン
  conditionalPattern: bonusConditionalPatternEnum("conditional_pattern"), // 事前定義パターン
  pointsConfig: json("points_config"), // パターンごとの点数設定（JSON）
  /*
  例: monthly_14day_threshold の場合
  {
    "up_to_14": 2650,
    "after_14": 2000
  }

  例: building_occupancy の場合
  {
    "occupancy_1_2": 4500,
    "occupancy_3_plus": 4000
  }
  */

  // 算定制限
  frequencyLimit: frequencyLimitEnum("frequency_limit").default("unlimited"),

  // 算定条件（事前定義、管理画面では表示のみ）
  predefinedConditions: json("predefined_conditions"), // システム側で管理
  /*
  [
    {"type": "field_not_empty", "field": "emergencyVisitReason"},
    {"type": "visit_duration_gte", "value": 90}
  ]
  */

  // 高度なルール（システム管理者のみ編集可能）
  advancedRules: json("advanced_rules"), // null の場合は predefinedConditions を使用

  // 併算定制御
  canCombineWith: text("can_combine_with").array(), // 併算定可能な加算コード配列
  cannotCombineWith: text("cannot_combine_with").array(), // 併算定不可の加算コード配列

  // バージョン管理
  version: varchar("version", { length: 20 }).notNull(), // '2024', '2026'
  validFrom: date("valid_from").notNull(), // 2024-04-01
  validTo: date("valid_to"), // 2026-03-31（nullは現行版）

  // 説明・備考
  requirementsDescription: text("requirements_description"), // 人間が読める算定要件説明
  notes: text("notes"), // 内部メモ

  // メタ情報
  displayOrder: integer("display_order").default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Bonus Calculation History Table (加算計算履歴)
export const bonusCalculationHistory = pgTable("bonus_calculation_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  nursingRecordId: varchar("nursing_record_id").notNull().references(() => nursingRecords.id, { onDelete: "cascade" }),
  bonusMasterId: varchar("bonus_master_id").notNull().references(() => bonusMaster.id),

  // 計算結果
  calculatedPoints: integer("calculated_points").notNull(),
  appliedVersion: varchar("applied_version", { length: 20 }).notNull(), // '2024'

  // 計算根拠（監査用）
  calculationDetails: json("calculation_details"), // どの条件で何点になったか
  /*
  {
    "bonusCode": "emergency_visit",
    "bonusName": "緊急訪問看護加算",
    "matchedCondition": {
      "monthlyVisitCount": 10,
      "rule": "visitCount <= 14",
      "points": 2650
    },
    "checksPassed": ["emergencyVisitReason is not empty"],
    "timestamp": "2025-10-15T10:30:00Z"
  }
  */

  // サービスコード（レセプトCSV出力用）
  serviceCodeId: varchar("service_code_id").references(() => nursingServiceCodes.id), // nullの場合は未選択

  // 手動調整
  isManuallyAdjusted: boolean("is_manually_adjusted").default(false),
  manualAdjustmentReason: text("manual_adjustment_reason"),
  adjustedBy: varchar("adjusted_by").references(() => users.id),
  adjustedAt: timestamp("adjusted_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  // 同じ訪問記録に対して同じ加算マスタが重複しないようにユニーク制約を追加
  uniqueNursingRecordBonusMaster: uniqueIndex("unique_nursing_record_bonus_master").on(
    table.nursingRecordId,
    table.bonusMasterId
  ),
}));

// Monthly Receipts Table (月次レセプトサマリ)
export const monthlyReceipts = pgTable("monthly_receipts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  facilityId: varchar("facility_id").notNull().references(() => facilities.id),
  patientId: varchar("patient_id").notNull().references(() => patients.id),

  // 対象期間
  targetYear: integer("target_year").notNull(), // 2025
  targetMonth: integer("target_month").notNull(), // 10

  // 保険種別
  insuranceType: insuranceTypeEnum("insurance_type").notNull(),

  // 訪問実績
  visitCount: integer("visit_count").notNull().default(0), // 訪問回数
  totalVisitPoints: integer("total_visit_points").notNull().default(0), // 訪問点数合計

  // 特管点数
  specialManagementPoints: integer("special_management_points").default(0), // 特管点数

  // 加算点数内訳（JSON）
  bonusBreakdown: json("bonus_breakdown"), // 加算別の点数内訳
  /*
  [
    {"bonusCode": "emergency_visit", "bonusName": "緊急訪問看護加算", "count": 2, "points": 5300},
    {"bonusCode": "long_visit", "bonusName": "長時間訪問看護加算", "count": 1, "points": 5200}
  ]
  */

  // 合計
  totalPoints: integer("total_points").notNull(), // 総点数
  totalAmount: integer("total_amount").notNull(), // 総金額（点数 × 10円）

  // レセプトステータス
  isConfirmed: boolean("is_confirmed").default(false), // 確定済み
  confirmedBy: varchar("confirmed_by").references(() => users.id),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),

  isSent: boolean("is_sent").default(false), // 送信済み
  sentAt: timestamp("sent_at", { withTimezone: true }),

  // エラー・警告
  hasErrors: boolean("has_errors").default(false),
  hasWarnings: boolean("has_warnings").default(false),
  errorMessages: json("error_messages"), // エラーメッセージ配列
  warningMessages: json("warning_messages"), // 警告メッセージ配列

  // CSV出力関連
  csvExportReady: boolean("csv_export_ready").default(false), // CSV出力可能フラグ
  csvExportWarnings: json("csv_export_warnings"), // 不足データの警告情報（JSON配列）
  lastCsvExportCheck: timestamp("last_csv_export_check", { withTimezone: true }), // 最終チェック日時

  // 備考
  notes: text("notes"),

  // 一部負担金額・減免情報（HOレコード用）
  partialBurdenAmount: integer("partial_burden_amount"), // 一部負担金額（8桁可変、単位: 円）
  reductionCategory: varchar("reduction_category", { length: 1 }), // 減免区分（別表9: '1'=減額, '2'=免除, '3'=支払猶予）
  reductionRate: integer("reduction_rate"), // 減額割合（百分率、0-100）
  reductionAmount: integer("reduction_amount"), // 減額金額（6桁可変、単位: 円）
  certificateNumber: varchar("certificate_number", { length: 3 }), // 証明書番号（3桁可変、国保の場合のみ）

  // ⭐ 追加: 公費一部負担情報（KOレコード用）
  // JSONB形式で公費IDをキーとしたマップ: { "公費ID": { partialBurdenAmount: number | null, publicExpenseBurdenAmount: number | null } }
  publicExpenseBurdenInfo: jsonb("public_expense_burden_info"),

  // 高額療養費適用状況（MFレコード用）
  highCostCategory: varchar("high_cost_category", { length: 20 }), // 'high_cost' | 'high_cost_multiple' | null

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ========== Receipt CSV Export Master Tables (レセプトCSV出力用マスタ) ==========

// 都道府県コードマスタ
export const prefectureCodes = pgTable("prefecture_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  prefectureCode: varchar("prefecture_code", { length: 2 }).notNull().unique(), // 01〜47
  prefectureName: text("prefecture_name").notNull(), // 北海道、青森県、...
  displayOrder: integer("display_order").notNull(), // 表示順序（1〜47）
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// 訪問看護サービスコードマスタ
export const nursingServiceCodes = pgTable("nursing_service_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serviceCode: varchar("service_code", { length: 9 }).notNull(), // 9桁のサービスコード
  serviceName: text("service_name").notNull(), // サービス名称
  points: integer("points").notNull(), // 基本点数
  insuranceType: insuranceTypeEnum("insurance_type").notNull(), // 医療保険 or 介護保険
  validFrom: date("valid_from").notNull(), // 有効期間開始日
  validTo: date("valid_to"), // 有効期間終了日（nullは現行版）
  description: text("description"), // 説明・備考
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// 訪問看護療養費マスター基本テーブル
export const visitingNursingMasterBasic = pgTable("visiting_nursing_master_basic", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serviceCodeId: varchar("service_code_id").notNull().references(() => nursingServiceCodes.id).unique(), // サービスコードマスタへの参照（1対1）
  
  // 訪問看護指示区分（項番45）
  instructionType: varchar("instruction_type", { length: 1 }), // 0:記録不要, 1:訪問看護基本療養費, 3:精神科訪問看護基本療養費, 5:医療観察訪問看護基本料
  
  // きざみ値計算識別（項番19）
  incrementalCalculationFlag: varchar("incremental_calculation_flag", { length: 1 }), // 0:きざみ値により算定しない, 1:きざみ値により算定する
  
  // 特別訪問看護指示区分（項番46）
  specialInstructionType: varchar("special_instruction_type", { length: 1 }), // 0:記録不要, 2:訪問看護基本療養費, 4:精神科訪問看護基本療養費, 6:医療観察訪問看護基本料
  
  // 実施回数区分（項番44）
  visitCountCategory: varchar("visit_count_category", { length: 1 }), // 0:記録不要, 1:01-03のいずれか必要, 2:02が必要, 3:03が必要
  
  // 職種区分（項番29-43、最大15項目）
  staffCategoryCodes: json("staff_category_codes"), // 職種等コードの配列（最大15項目、各2桁）
  
  // レセプト表示用記号①～⑨（項番56-64）
  receiptSymbol1: varchar("receipt_symbol_1", { length: 1 }), // レセプト表示用記号①（○）
  receiptSymbol2: varchar("receipt_symbol_2", { length: 1 }), // レセプト表示用記号②（△）
  receiptSymbol3: varchar("receipt_symbol_3", { length: 1 }), // レセプト表示用記号③（◎）
  receiptSymbol4: varchar("receipt_symbol_4", { length: 1 }), // レセプト表示用記号④（◇）
  receiptSymbol5: varchar("receipt_symbol_5", { length: 1 }), // レセプト表示用記号⑤（□）
  receiptSymbol6: varchar("receipt_symbol_6", { length: 1 }), // レセプト表示用記号⑥（▽）
  receiptSymbol7: varchar("receipt_symbol_7", { length: 1 }), // レセプト表示用記号⑦（☆）
  receiptSymbol8: varchar("receipt_symbol_8", { length: 1 }), // レセプト表示用記号⑧（▲）
  receiptSymbol9: varchar("receipt_symbol_9", { length: 1 }), // レセプト表示用記号⑨（▼）
  
  // 訪問看護療養費種類（項番67）
  serviceType: varchar("service_type", { length: 2 }), // 訪問看護療養費種類コード（2桁）
  
  // 摘要欄実装用フィールド
  receiptDisplayColumn: varchar("receipt_display_column", { length: 2 }), // レセプト表示欄（項番53、CSV列[52]）
  receiptDisplayItem: varchar("receipt_display_item", { length: 2 }), // レセプト表示項（項番54、CSV列[53]）
  amountType: varchar("amount_type", { length: 1 }), // 金額識別（項番15、CSV列[14]：1=金額、3=点数（プラス）、5=％加算）
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  // serviceCodeIdにユニーク制約を追加（1対1の関係を保証）
  uniqueServiceCodeId: uniqueIndex("unique_service_code_id").on(table.serviceCodeId),
}));

// 職員資格コードマスタ
export const staffQualificationCodes = pgTable("staff_qualification_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  qualificationCode: varchar("qualification_code", { length: 2 }).notNull().unique(), // 別表20コード
  qualificationName: text("qualification_name").notNull(), // 資格名称（例：保健師、助産師、看護師、准看護師等）
  description: text("description"), // 説明・備考
  displayOrder: integer("display_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// 訪問場所コードマスタ
export const visitLocationCodes = pgTable("visit_location_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  locationCode: varchar("location_code", { length: 2 }).notNull().unique(), // 別表18コード
  locationName: text("location_name").notNull(), // 場所名称（例：自宅、特養、老健等）
  description: text("description"), // 説明・備考
  displayOrder: integer("display_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// 訪問場所変更履歴テーブル（月単位で管理、RJレコード用）
export const visitLocationChanges = pgTable("visit_location_changes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  facilityId: varchar("facility_id").notNull().references(() => facilities.id),
  patientId: varchar("patient_id").notNull().references(() => patients.id),
  targetYear: integer("target_year").notNull(), // 対象年
  targetMonth: integer("target_month").notNull(), // 対象月
  changeDate: date("change_date").notNull(), // 変更年月日（最初に異なる場所コードが使用された日）
  locationCode: varchar("location_code", { length: 2 }).notNull(), // 別表16コード
  locationCustom: text("location_custom"), // 場所コード99の場合の文字データ
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  // 同一患者・同一月・同一変更日・同一場所コードの重複を防ぐ
  uniquePatientMonthDateLocation: sql`UNIQUE(${table.facilityId}, ${table.patientId}, ${table.targetYear}, ${table.targetMonth}, ${table.changeDate}, ${table.locationCode})`,
}));

// レセプト種別コードマスタ
export const receiptTypeCodes = pgTable("receipt_type_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  receiptTypeCode: varchar("receipt_type_code", { length: 4 }).notNull().unique(), // 別表4コード（4桁）
  receiptTypeName: text("receipt_type_name").notNull(), // 種別名称
  insuranceType: insuranceTypeEnum("insurance_type").notNull(), // 医療保険 or 介護保険
  description: text("description"), // 説明・備考
  displayOrder: integer("display_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// レセプト特記コードマスタ（別表6）
export const receiptSpecialNoteCodes = pgTable("receipt_special_note_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 2 }).notNull().unique(), // 別表6コード（2桁）
  name: text("name").notNull(), // コード名称
  description: text("description"), // 説明・備考
  displayOrder: integer("display_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// 職務上の事由コードマスタ（別表8）
export const workRelatedReasonCodes = pgTable("work_related_reason_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 1 }).notNull().unique(), // 別表8コード（1桁）
  name: text("name").notNull(), // コード名称
  description: text("description"), // 説明・備考
  displayOrder: integer("display_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ========== Nursing Record Edit History (Phase 3: 編集履歴) ==========
export const nursingRecordEditHistory = pgTable("nursing_record_edit_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nursingRecordId: varchar("nursing_record_id").notNull().references(() => nursingRecords.id, { onDelete: 'cascade' }),
  editedBy: varchar("edited_by").notNull().references(() => users.id),
  editedAt: timestamp("edited_at", { withTimezone: true }).defaultNow().notNull(),
  changeType: varchar("change_type", { length: 50 }).notNull(), // 'update' | 'status_change'
  previousData: json("previous_data"), // 変更前のデータ（JSON）
  newData: json("new_data"), // 変更後のデータ（JSON）
  remarks: text("remarks"), // 備考
});

// ========== Insert Schemas ==========
export const insertCompanySchema = createInsertSchema(companies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFacilitySchema = createInsertSchema(facilities).omit({
  id: true,
  companyId: true, // Set by server from user session
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
}).extend({
  reviewOrganizationCode: z.enum(['1', '2']).optional().nullable(),
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

// Phase 4: Bonus Master Insert Schemas
export const insertBonusMasterSchema = createInsertSchema(bonusMaster).omit({
  id: true,
  facilityId: true, // Set by server from user session (or null for global)
  createdAt: true,
  updatedAt: true,
});

export const insertBonusCalculationHistorySchema = createInsertSchema(bonusCalculationHistory).omit({
  id: true,
  createdAt: true,
});

export const insertMonthlyReceiptSchema = createInsertSchema(monthlyReceipts).omit({
  id: true,
  facilityId: true, // Set by server from user session
  createdAt: true,
  updatedAt: true,
});

// Receipt CSV Export Master Insert Schemas
export const insertPrefectureCodeSchema = createInsertSchema(prefectureCodes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertNursingServiceCodeSchema = createInsertSchema(nursingServiceCodes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertStaffQualificationCodeSchema = createInsertSchema(staffQualificationCodes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertVisitLocationCodeSchema = createInsertSchema(visitLocationCodes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertReceiptTypeCodeSchema = createInsertSchema(receiptTypeCodes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertVisitingNursingMasterBasicSchema = createInsertSchema(visitingNursingMasterBasic).omit({
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
  specialistCertifications: true,
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

// Phase 4: Bonus Master Update Schemas
export const updateBonusMasterSchema = insertBonusMasterSchema.partial();

export const updateBonusCalculationHistorySchema = insertBonusCalculationHistorySchema.partial();

export const updateMonthlyReceiptSchema = insertMonthlyReceiptSchema.partial();

// Receipt CSV Export Master Update Schemas
export const updatePrefectureCodeSchema = insertPrefectureCodeSchema.partial();
export const updateNursingServiceCodeSchema = insertNursingServiceCodeSchema.partial();
export const updateStaffQualificationCodeSchema = insertStaffQualificationCodeSchema.partial();
export const updateVisitLocationCodeSchema = insertVisitLocationCodeSchema.partial();
export const updateReceiptTypeCodeSchema = insertReceiptTypeCodeSchema.partial();
export const updateVisitingNursingMasterBasicSchema = insertVisitingNursingMasterBasicSchema.partial();

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

// Phase 4: Bonus Master Types
export type InsertBonusMaster = z.infer<typeof insertBonusMasterSchema>;
export type BonusMaster = typeof bonusMaster.$inferSelect;
export type UpdateBonusMaster = z.infer<typeof updateBonusMasterSchema>;

export type InsertBonusCalculationHistory = z.infer<typeof insertBonusCalculationHistorySchema>;
export type BonusCalculationHistory = typeof bonusCalculationHistory.$inferSelect;
export type UpdateBonusCalculationHistory = z.infer<typeof updateBonusCalculationHistorySchema>;

export type InsertMonthlyReceipt = z.infer<typeof insertMonthlyReceiptSchema>;
export type MonthlyReceipt = typeof monthlyReceipts.$inferSelect;
export type UpdateMonthlyReceipt = z.infer<typeof updateMonthlyReceiptSchema>;

// Receipt CSV Export Master Types
export type InsertPrefectureCode = z.infer<typeof insertPrefectureCodeSchema>;
export type PrefectureCode = typeof prefectureCodes.$inferSelect;
export type UpdatePrefectureCode = z.infer<typeof updatePrefectureCodeSchema>;

export type InsertNursingServiceCode = z.infer<typeof insertNursingServiceCodeSchema>;
export type NursingServiceCode = typeof nursingServiceCodes.$inferSelect;
export type UpdateNursingServiceCode = z.infer<typeof updateNursingServiceCodeSchema>;

export type InsertStaffQualificationCode = z.infer<typeof insertStaffQualificationCodeSchema>;
export type StaffQualificationCode = typeof staffQualificationCodes.$inferSelect;
export type UpdateStaffQualificationCode = z.infer<typeof updateStaffQualificationCodeSchema>;

export type InsertVisitLocationCode = z.infer<typeof insertVisitLocationCodeSchema>;
export type VisitLocationCode = typeof visitLocationCodes.$inferSelect;
export type UpdateVisitLocationCode = z.infer<typeof updateVisitLocationCodeSchema>;

export type InsertReceiptTypeCode = z.infer<typeof insertReceiptTypeCodeSchema>;
export type ReceiptTypeCode = typeof receiptTypeCodes.$inferSelect;
export type UpdateReceiptTypeCode = z.infer<typeof updateReceiptTypeCodeSchema>;

export type InsertVisitingNursingMasterBasic = z.infer<typeof insertVisitingNursingMasterBasicSchema>;
export type VisitingNursingMasterBasic = typeof visitingNursingMasterBasic.$inferSelect;
export type UpdateVisitingNursingMasterBasic = z.infer<typeof updateVisitingNursingMasterBasicSchema>;

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

// Nursing Records Search Types
export interface NursingRecordSearchParams {
  page: number;
  limit: number;
  status?: 'draft' | 'completed' | 'reviewed';
  patientId?: string;
  nurseId?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: 'visitDate' | 'recordDate';
  sortOrder?: 'asc' | 'desc';
}

export interface NursingRecordSearchResult extends PaginatedResult<NursingRecord> {
  stats: {
    draft: number;
    completed: number;
    reviewed: number;
  };
}

// ========== Relations ==========

export const facilitiesRelations = relations(facilities, ({ one, many }) => ({
  company: one(companies, {
    fields: [facilities.companyId],
    references: [companies.id],
  }),
  deletedByUser: one(users, {
    fields: [facilities.deletedBy],
    references: [users.id],
  }),
  users: many(users),
  patients: many(patients),
  buildings: many(buildings),
}));

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
  monthlyReceipts: many(monthlyReceipts),
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

export const nursingRecordsRelations = relations(nursingRecords, ({ one, many }) => ({
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
  serviceCode: one(nursingServiceCodes, {
    fields: [nursingRecords.serviceCodeId],
    references: [nursingServiceCodes.id],
  }),
  lastEditor: one(users, {
    fields: [nursingRecords.lastEditedBy],
    references: [users.id],
  }),
  editHistory: many(nursingRecordEditHistory),
  bonusCalculationHistory: many(bonusCalculationHistory),
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

// Phase 4: Bonus Master Relations
export const bonusMasterRelations = relations(bonusMaster, ({ one, many }) => ({
  facility: one(facilities, {
    fields: [bonusMaster.facilityId],
    references: [facilities.id],
  }),
  calculationHistory: many(bonusCalculationHistory),
}));

export const bonusCalculationHistoryRelations = relations(bonusCalculationHistory, ({ one }) => ({
  nursingRecord: one(nursingRecords, {
    fields: [bonusCalculationHistory.nursingRecordId],
    references: [nursingRecords.id],
  }),
  bonusMaster: one(bonusMaster, {
    fields: [bonusCalculationHistory.bonusMasterId],
    references: [bonusMaster.id],
  }),
  serviceCode: one(nursingServiceCodes, {
    fields: [bonusCalculationHistory.serviceCodeId],
    references: [nursingServiceCodes.id],
  }),
  adjustedBy: one(users, {
    fields: [bonusCalculationHistory.adjustedBy],
    references: [users.id],
  }),
}));

export const monthlyReceiptsRelations = relations(monthlyReceipts, ({ one }) => ({
  facility: one(facilities, {
    fields: [monthlyReceipts.facilityId],
    references: [facilities.id],
  }),
  patient: one(patients, {
    fields: [monthlyReceipts.patientId],
    references: [patients.id],
  }),
  confirmedBy: one(users, {
    fields: [monthlyReceipts.confirmedBy],
    references: [users.id],
  }),
}));

export const nursingRecordEditHistoryRelations = relations(nursingRecordEditHistory, ({ one }) => ({
  nursingRecord: one(nursingRecords, {
    fields: [nursingRecordEditHistory.nursingRecordId],
    references: [nursingRecords.id],
  }),
  editor: one(users, {
    fields: [nursingRecordEditHistory.editedBy],
    references: [users.id],
  }),
}));

// 訪問看護サービスコードマスタと基本テーブルのリレーション
export const nursingServiceCodesRelations = relations(nursingServiceCodes, ({ one }) => ({
  masterBasic: one(visitingNursingMasterBasic, {
    fields: [nursingServiceCodes.id],
    references: [visitingNursingMasterBasic.serviceCodeId],
  }),
}));

export const visitingNursingMasterBasicRelations = relations(visitingNursingMasterBasic, ({ one }) => ({
  serviceCode: one(nursingServiceCodes, {
    fields: [visitingNursingMasterBasic.serviceCodeId],
    references: [nursingServiceCodes.id],
  }),
}));
