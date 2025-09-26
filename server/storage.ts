import { 
  type User, type InsertUser,
  type Facility, type InsertFacility,
  type Patient, type InsertPatient,
  type Visit, type InsertVisit,
  type NursingRecord, type InsertNursingRecord,
  type Medication, type InsertMedication,
  users, facilities, patients, visits, nursingRecords, medications
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { db } from "./db";

// Storage interface for all visiting nursing system operations
export interface IStorage {
  // ========== Facilities ==========
  getFacility(id: string): Promise<Facility | undefined>;
  getFacilities(): Promise<Facility[]>;
  createFacility(facility: InsertFacility): Promise<Facility>;
  updateFacility(id: string, facility: Partial<InsertFacility>): Promise<Facility | undefined>;
  deleteFacility(id: string): Promise<boolean>;

  // ========== Users ==========
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUsersByFacility(facilityId: string): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, user: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;

  // ========== Patients ==========
  getPatient(id: string): Promise<Patient | undefined>;
  getPatientsByFacility(facilityId: string): Promise<Patient[]>;
  getPatientByPatientNumber(facilityId: string, patientNumber: string): Promise<Patient | undefined>;
  createPatient(patient: InsertPatient): Promise<Patient>;
  updatePatient(id: string, patient: Partial<InsertPatient>): Promise<Patient | undefined>;
  deletePatient(id: string): Promise<boolean>;

  // ========== Visits ==========
  getVisit(id: string): Promise<Visit | undefined>;
  getVisitsByFacility(facilityId: string): Promise<Visit[]>;
  getVisitsByPatient(patientId: string): Promise<Visit[]>;
  getVisitsByNurse(nurseId: string): Promise<Visit[]>;
  getUpcomingVisits(facilityId: string): Promise<Visit[]>;
  createVisit(visit: InsertVisit): Promise<Visit>;
  updateVisit(id: string, visit: Partial<InsertVisit>): Promise<Visit | undefined>;
  deleteVisit(id: string): Promise<boolean>;

  // ========== Nursing Records ==========
  getNursingRecord(id: string): Promise<NursingRecord | undefined>;
  getNursingRecordsByFacility(facilityId: string): Promise<NursingRecord[]>;
  getNursingRecordsByPatient(patientId: string): Promise<NursingRecord[]>;
  getNursingRecordsByNurse(nurseId: string): Promise<NursingRecord[]>;
  createNursingRecord(record: InsertNursingRecord): Promise<NursingRecord>;
  updateNursingRecord(id: string, record: Partial<InsertNursingRecord>): Promise<NursingRecord | undefined>;
  deleteNursingRecord(id: string): Promise<boolean>;

  // ========== Medications ==========
  getMedication(id: string): Promise<Medication | undefined>;
  getMedicationsByFacility(facilityId: string): Promise<Medication[]>;
  getMedicationsByPatient(patientId: string): Promise<Medication[]>;
  getActiveMedicationsByPatient(patientId: string): Promise<Medication[]>;
  createMedication(medication: InsertMedication): Promise<Medication>;
  updateMedication(id: string, medication: Partial<InsertMedication>): Promise<Medication | undefined>;
  deleteMedication(id: string): Promise<boolean>;
}

// PostgreSQL implementation using Drizzle ORM
export class PostgreSQLStorage implements IStorage {
  // ========== Facilities ==========
  async getFacility(id: string): Promise<Facility | undefined> {
    const result = await db.select().from(facilities).where(eq(facilities.id, id)).limit(1);
    return result[0];
  }

  async getFacilities(): Promise<Facility[]> {
    return await db.select().from(facilities);
  }

  async createFacility(facility: InsertFacility): Promise<Facility> {
    const result = await db.insert(facilities).values(facility).returning();
    return result[0];
  }

  async updateFacility(id: string, facility: Partial<InsertFacility>): Promise<Facility | undefined> {
    const result = await db
      .update(facilities)
      .set({ ...facility, updatedAt: new Date() })
      .where(eq(facilities.id, id))
      .returning();
    return result[0];
  }

  async deleteFacility(id: string): Promise<boolean> {
    const result = await db.delete(facilities).where(eq(facilities.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // ========== Users ==========
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }

  async getUsersByFacility(facilityId: string): Promise<User[]> {
    return await db.select().from(users).where(eq(users.facilityId, facilityId));
  }

  async createUser(user: InsertUser): Promise<User> {
    const result = await db.insert(users).values(user).returning();
    return result[0];
  }

  async updateUser(id: string, user: Partial<InsertUser>): Promise<User | undefined> {
    const result = await db
      .update(users)
      .set({ ...user, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return result[0];
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // ========== Patients ==========
  async getPatient(id: string): Promise<Patient | undefined> {
    const result = await db.select().from(patients).where(eq(patients.id, id)).limit(1);
    return result[0];
  }

  async getPatientsByFacility(facilityId: string): Promise<Patient[]> {
    return await db.select().from(patients).where(eq(patients.facilityId, facilityId));
  }

  async getPatientByPatientNumber(facilityId: string, patientNumber: string): Promise<Patient | undefined> {
    const result = await db
      .select()
      .from(patients)
      .where(and(eq(patients.facilityId, facilityId), eq(patients.patientNumber, patientNumber)))
      .limit(1);
    return result[0];
  }

  async createPatient(patient: InsertPatient): Promise<Patient> {
    const result = await db.insert(patients).values(patient).returning();
    return result[0];
  }

  async updatePatient(id: string, patient: Partial<InsertPatient>): Promise<Patient | undefined> {
    const result = await db
      .update(patients)
      .set({ ...patient, updatedAt: new Date() })
      .where(eq(patients.id, id))
      .returning();
    return result[0];
  }

  async deletePatient(id: string): Promise<boolean> {
    const result = await db.delete(patients).where(eq(patients.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // ========== Visits ==========
  async getVisit(id: string): Promise<Visit | undefined> {
    const result = await db.select().from(visits).where(eq(visits.id, id)).limit(1);
    return result[0];
  }

  async getVisitsByFacility(facilityId: string): Promise<Visit[]> {
    return await db.select().from(visits).where(eq(visits.facilityId, facilityId));
  }

  async getVisitsByPatient(patientId: string): Promise<Visit[]> {
    return await db.select().from(visits).where(eq(visits.patientId, patientId));
  }

  async getVisitsByNurse(nurseId: string): Promise<Visit[]> {
    return await db.select().from(visits).where(eq(visits.nurseId, nurseId));
  }

  async getUpcomingVisits(facilityId: string): Promise<Visit[]> {
    return await db
      .select()
      .from(visits)
      .where(and(
        eq(visits.facilityId, facilityId),
        eq(visits.status, "scheduled")
      ))
      .orderBy(visits.scheduledDate);
  }

  async createVisit(visit: InsertVisit): Promise<Visit> {
    const result = await db.insert(visits).values(visit).returning();
    return result[0];
  }

  async updateVisit(id: string, visit: Partial<InsertVisit>): Promise<Visit | undefined> {
    const result = await db
      .update(visits)
      .set({ ...visit, updatedAt: new Date() })
      .where(eq(visits.id, id))
      .returning();
    return result[0];
  }

  async deleteVisit(id: string): Promise<boolean> {
    const result = await db.delete(visits).where(eq(visits.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // ========== Nursing Records ==========
  async getNursingRecord(id: string): Promise<NursingRecord | undefined> {
    const result = await db.select().from(nursingRecords).where(eq(nursingRecords.id, id)).limit(1);
    return result[0];
  }

  async getNursingRecordsByFacility(facilityId: string): Promise<NursingRecord[]> {
    return await db.select().from(nursingRecords).where(eq(nursingRecords.facilityId, facilityId));
  }

  async getNursingRecordsByPatient(patientId: string): Promise<NursingRecord[]> {
    return await db
      .select()
      .from(nursingRecords)
      .where(eq(nursingRecords.patientId, patientId))
      .orderBy(desc(nursingRecords.recordDate));
  }

  async getNursingRecordsByNurse(nurseId: string): Promise<NursingRecord[]> {
    return await db
      .select()
      .from(nursingRecords)
      .where(eq(nursingRecords.nurseId, nurseId))
      .orderBy(desc(nursingRecords.recordDate));
  }

  async createNursingRecord(record: InsertNursingRecord): Promise<NursingRecord> {
    const result = await db.insert(nursingRecords).values(record).returning();
    return result[0];
  }

  async updateNursingRecord(id: string, record: Partial<InsertNursingRecord>): Promise<NursingRecord | undefined> {
    const result = await db
      .update(nursingRecords)
      .set({ ...record, updatedAt: new Date() })
      .where(eq(nursingRecords.id, id))
      .returning();
    return result[0];
  }

  async deleteNursingRecord(id: string): Promise<boolean> {
    const result = await db.delete(nursingRecords).where(eq(nursingRecords.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // ========== Medications ==========
  async getMedication(id: string): Promise<Medication | undefined> {
    const result = await db.select().from(medications).where(eq(medications.id, id)).limit(1);
    return result[0];
  }

  async getMedicationsByFacility(facilityId: string): Promise<Medication[]> {
    return await db.select().from(medications).where(eq(medications.facilityId, facilityId));
  }

  async getMedicationsByPatient(patientId: string): Promise<Medication[]> {
    return await db.select().from(medications).where(eq(medications.patientId, patientId));
  }

  async getActiveMedicationsByPatient(patientId: string): Promise<Medication[]> {
    return await db
      .select()
      .from(medications)
      .where(and(
        eq(medications.patientId, patientId),
        eq(medications.isActive, true)
      ));
  }

  async createMedication(medication: InsertMedication): Promise<Medication> {
    const result = await db.insert(medications).values(medication).returning();
    return result[0];
  }

  async updateMedication(id: string, medication: Partial<InsertMedication>): Promise<Medication | undefined> {
    const result = await db
      .update(medications)
      .set({ ...medication, updatedAt: new Date() })
      .where(eq(medications.id, id))
      .returning();
    return result[0];
  }

  async deleteMedication(id: string): Promise<boolean> {
    const result = await db.delete(medications).where(eq(medications.id, id));
    return (result.rowCount ?? 0) > 0;
  }
}

// Export the PostgreSQL storage instance
export const storage = new PostgreSQLStorage();
