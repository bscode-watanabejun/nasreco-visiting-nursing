import { pgTable, index, varchar, json, timestamp, foreignKey, text, date, boolean, integer, numeric, unique, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const gender = pgEnum("gender", ['male', 'female', 'other'])
export const recordType = pgEnum("record_type", ['vital_signs', 'medication', 'wound_care', 'general_care', 'assessment'])
export const userAccessLevel = pgEnum("user_access_level", ['facility', 'corporate'])
export const userRole = pgEnum("user_role", ['admin', 'nurse', 'manager', 'corporate_admin'])
export const visitStatus = pgEnum("visit_status", ['scheduled', 'completed', 'cancelled', 'no_show'])


export const session = pgTable("session", {
	sid: varchar().primaryKey().notNull(),
	sess: json().notNull(),
	expire: timestamp({ precision: 6, mode: 'string' }).notNull(),
}, (table) => [
	index("IDX_session_expire").using("btree", table.expire.asc().nullsLast().op("timestamp_ops")),
]);

export const patients = pgTable("patients", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	facilityId: varchar("facility_id").notNull(),
	patientNumber: text("patient_number").notNull(),
	lastName: text("last_name").notNull(),
	firstName: text("first_name").notNull(),
	dateOfBirth: date("date_of_birth").notNull(),
	gender: gender().notNull(),
	address: text(),
	phone: text(),
	emergencyContact: text("emergency_contact"),
	emergencyPhone: text("emergency_phone"),
	insuranceNumber: text("insurance_number"),
	medicalHistory: text("medical_history"),
	allergies: text(),
	currentMedications: text("current_medications"),
	careNotes: text("care_notes"),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	isCritical: boolean("is_critical").default(false).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.facilityId],
			foreignColumns: [facilities.id],
			name: "patients_facility_id_facilities_id_fk"
		}),
]);

export const medications = pgTable("medications", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	facilityId: varchar("facility_id").notNull(),
	patientId: varchar("patient_id").notNull(),
	nurseId: varchar("nurse_id").notNull(),
	medicationName: text("medication_name").notNull(),
	dosage: text().notNull(),
	frequency: text().notNull(),
	route: text().notNull(),
	startDate: date("start_date").notNull(),
	endDate: date("end_date"),
	instructions: text(),
	sideEffects: text("side_effects"),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.facilityId],
			foreignColumns: [facilities.id],
			name: "medications_facility_id_facilities_id_fk"
		}),
	foreignKey({
			columns: [table.patientId],
			foreignColumns: [patients.id],
			name: "medications_patient_id_patients_id_fk"
		}),
	foreignKey({
			columns: [table.nurseId],
			foreignColumns: [users.id],
			name: "medications_nurse_id_users_id_fk"
		}),
]);

export const facilities = pgTable("facilities", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	name: text().notNull(),
	address: text(),
	phone: text(),
	email: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	companyId: varchar("company_id"),
	slug: text().default(').notNull(),
	isHeadquarters: boolean("is_headquarters").default(false).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "facilities_company_id_fkey"
		}),
]);

export const nursingRecords = pgTable("nursing_records", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	facilityId: varchar("facility_id").notNull(),
	patientId: varchar("patient_id").notNull(),
	nurseId: varchar("nurse_id").notNull(),
	visitId: varchar("visit_id"),
	recordType: recordType("record_type").notNull(),
	recordDate: timestamp("record_date", { withTimezone: true, mode: 'string' }).notNull(),
	bloodPressureSystolic: integer("blood_pressure_systolic"),
	bloodPressureDiastolic: integer("blood_pressure_diastolic"),
	heartRate: integer("heart_rate"),
	temperature: numeric({ precision: 4, scale:  1 }),
	respiratoryRate: integer("respiratory_rate"),
	oxygenSaturation: integer("oxygen_saturation"),
	title: text().notNull(),
	content: text().notNull(),
	observations: text(),
	interventions: text(),
	evaluation: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.facilityId],
			foreignColumns: [facilities.id],
			name: "nursing_records_facility_id_facilities_id_fk"
		}),
	foreignKey({
			columns: [table.patientId],
			foreignColumns: [patients.id],
			name: "nursing_records_patient_id_patients_id_fk"
		}),
	foreignKey({
			columns: [table.nurseId],
			foreignColumns: [users.id],
			name: "nursing_records_nurse_id_users_id_fk"
		}),
	foreignKey({
			columns: [table.visitId],
			foreignColumns: [visits.id],
			name: "nursing_records_visit_id_visits_id_fk"
		}),
]);

export const visits = pgTable("visits", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	facilityId: varchar("facility_id").notNull(),
	patientId: varchar("patient_id").notNull(),
	nurseId: varchar("nurse_id").notNull(),
	scheduledDate: timestamp("scheduled_date", { withTimezone: true, mode: 'string' }).notNull(),
	estimatedDuration: integer("estimated_duration").default(60).notNull(),
	purpose: text().notNull(),
	status: visitStatus().default('scheduled').notNull(),
	actualStartTime: timestamp("actual_start_time", { withTimezone: true, mode: 'string' }),
	actualEndTime: timestamp("actual_end_time", { withTimezone: true, mode: 'string' }),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.facilityId],
			foreignColumns: [facilities.id],
			name: "visits_facility_id_facilities_id_fk"
		}),
	foreignKey({
			columns: [table.patientId],
			foreignColumns: [patients.id],
			name: "visits_patient_id_patients_id_fk"
		}),
	foreignKey({
			columns: [table.nurseId],
			foreignColumns: [users.id],
			name: "visits_nurse_id_users_id_fk"
		}),
]);

export const users = pgTable("users", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	facilityId: varchar("facility_id").notNull(),
	username: text().notNull(),
	password: text().notNull(),
	email: text().notNull(),
	fullName: text("full_name").notNull(),
	role: userRole().default('nurse').notNull(),
	licenseNumber: text("license_number"),
	phone: text(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	accessLevel: userAccessLevel("access_level").default('facility'),
}, (table) => [
	foreignKey({
			columns: [table.facilityId],
			foreignColumns: [facilities.id],
			name: "users_facility_id_facilities_id_fk"
		}),
	unique("users_username_unique").on(table.username),
	unique("users_email_unique").on(table.email),
]);

export const companies = pgTable("companies", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	name: text().notNull(),
	domain: text().notNull(),
	address: text(),
	phone: text(),
	email: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	unique("companies_domain_key").on(table.domain),
]);
