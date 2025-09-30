CREATE TYPE "public"."gender" AS ENUM('male', 'female', 'other');--> statement-breakpoint
CREATE TYPE "public"."record_status" AS ENUM('draft', 'completed', 'reviewed');--> statement-breakpoint
CREATE TYPE "public"."record_type" AS ENUM('vital_signs', 'medication', 'wound_care', 'general_care', 'assessment');--> statement-breakpoint
CREATE TYPE "public"."user_access_level" AS ENUM('facility', 'corporate');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'nurse', 'manager', 'corporate_admin');--> statement-breakpoint
CREATE TYPE "public"."visit_status" AS ENUM('scheduled', 'completed', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TABLE "companies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL,
	"address" text,
	"phone" text,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "companies_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "facilities" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"is_headquarters" boolean DEFAULT false NOT NULL,
	"address" text,
	"phone" text,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "medications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_id" varchar NOT NULL,
	"patient_id" varchar NOT NULL,
	"nurse_id" varchar NOT NULL,
	"medication_name" text NOT NULL,
	"dosage" text NOT NULL,
	"frequency" text NOT NULL,
	"route" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"instructions" text,
	"side_effects" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "nursing_records" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_id" varchar NOT NULL,
	"patient_id" varchar NOT NULL,
	"nurse_id" varchar NOT NULL,
	"visit_id" varchar,
	"record_type" "record_type" NOT NULL,
	"record_date" timestamp with time zone NOT NULL,
	"status" "record_status" DEFAULT 'draft' NOT NULL,
	"visit_time" timestamp with time zone,
	"visit_type_category" text,
	"blood_pressure_systolic" integer,
	"blood_pressure_diastolic" integer,
	"heart_rate" integer,
	"temperature" numeric(4, 1),
	"respiratory_rate" integer,
	"oxygen_saturation" integer,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"observations" text,
	"interventions" text,
	"evaluation" text,
	"patient_family_response" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_id" varchar NOT NULL,
	"patient_number" text NOT NULL,
	"last_name" text NOT NULL,
	"first_name" text NOT NULL,
	"date_of_birth" date NOT NULL,
	"gender" "gender" NOT NULL,
	"address" text,
	"phone" text,
	"emergency_contact" text,
	"emergency_phone" text,
	"insurance_number" text,
	"medical_history" text,
	"allergies" text,
	"current_medications" text,
	"care_notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_critical" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_id" varchar NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"role" "user_role" DEFAULT 'nurse' NOT NULL,
	"access_level" "user_access_level" DEFAULT 'facility' NOT NULL,
	"license_number" text,
	"phone" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "visits" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_id" varchar NOT NULL,
	"patient_id" varchar NOT NULL,
	"nurse_id" varchar NOT NULL,
	"scheduled_date" timestamp with time zone NOT NULL,
	"estimated_duration" integer DEFAULT 60 NOT NULL,
	"purpose" text NOT NULL,
	"status" "visit_status" DEFAULT 'scheduled' NOT NULL,
	"actual_start_time" timestamp with time zone,
	"actual_end_time" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medications" ADD CONSTRAINT "medications_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medications" ADD CONSTRAINT "medications_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medications" ADD CONSTRAINT "medications_nurse_id_users_id_fk" FOREIGN KEY ("nurse_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nursing_records" ADD CONSTRAINT "nursing_records_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nursing_records" ADD CONSTRAINT "nursing_records_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nursing_records" ADD CONSTRAINT "nursing_records_nurse_id_users_id_fk" FOREIGN KEY ("nurse_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nursing_records" ADD CONSTRAINT "nursing_records_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_nurse_id_users_id_fk" FOREIGN KEY ("nurse_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;