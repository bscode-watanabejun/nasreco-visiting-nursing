import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, decimal, date, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums for various status fields
export const userRoleEnum = pgEnum("user_role", ["admin", "nurse", "manager", "corporate_admin"]);
export const userAccessLevelEnum = pgEnum("user_access_level", ["facility", "corporate"]);
export const genderEnum = pgEnum("gender", ["male", "female", "other"]);
export const recordTypeEnum = pgEnum("record_type", ["vital_signs", "medication", "wound_care", "general_care", "assessment"]);
export const visitStatusEnum = pgEnum("visit_status", ["scheduled", "completed", "cancelled", "no_show"]);
export const recordStatusEnum = pgEnum("record_status", ["draft", "completed", "reviewed"]);

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

// ========== Nursing Records Table ==========
export const nursingRecords = pgTable("nursing_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  facilityId: varchar("facility_id").notNull().references(() => facilities.id),
  patientId: varchar("patient_id").notNull().references(() => patients.id),
  nurseId: varchar("nurse_id").notNull().references(() => users.id),
  visitId: varchar("visit_id").references(() => visits.id),
  recordType: recordTypeEnum("record_type").notNull(),
  recordDate: timestamp("record_date", { withTimezone: true }).notNull(),

  // Record status
  status: recordStatusEnum("status").notNull().default("draft"),

  // Visit information
  visitTime: timestamp("visit_time", { withTimezone: true }),
  visitTypeCategory: text("visit_type_category"), // "定期訪問" or "緊急訪問"

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

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
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
});

export const insertMedicationSchema = createInsertSchema(medications).omit({
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

// Update Types
export type UpdateUserSelf = z.infer<typeof updateUserSelfSchema>;
export type UpdateUserAdmin = z.infer<typeof updateUserAdminSchema>;
export type UpdatePatient = z.infer<typeof updatePatientSchema>;
export type UpdateVisit = z.infer<typeof updateVisitSchema>;
export type UpdateNursingRecord = z.infer<typeof updateNursingRecordSchema>;
export type UpdateMedication = z.infer<typeof updateMedicationSchema>;

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
