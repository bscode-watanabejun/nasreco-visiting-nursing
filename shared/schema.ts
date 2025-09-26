import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, decimal, date, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums for various status fields
export const userRoleEnum = pgEnum("user_role", ["admin", "nurse", "manager"]);
export const genderEnum = pgEnum("gender", ["male", "female", "other"]);
export const recordTypeEnum = pgEnum("record_type", ["vital_signs", "medication", "wound_care", "general_care", "assessment"]);
export const visitStatusEnum = pgEnum("visit_status", ["scheduled", "completed", "cancelled", "no_show"]);

// ========== Facilities Table (Multi-tenant support) ==========
export const facilities = pgTable("facilities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ========== Users Table (Enhanced with facility association) ==========
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  facilityId: varchar("facility_id").notNull().references(() => facilities.id),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull().unique(),
  fullName: text("full_name").notNull(),
  role: userRoleEnum("role").notNull().default("nurse"),
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
  createdAt: true,
  updatedAt: true,
});

export const insertMedicationSchema = createInsertSchema(medications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// ========== Type Exports ==========
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
