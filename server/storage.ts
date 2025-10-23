import {
  type User, type InsertUser,
  type Company, type InsertCompany,
  type Facility, type InsertFacility,
  type Patient, type InsertPatient,
  type Visit, type InsertVisit,
  type NursingRecord, type InsertNursingRecord,
  type Medication, type InsertMedication,
  type Schedule, type InsertSchedule,
  type PaginationOptions, type PaginatedResult,
  users, companies, facilities, patients, visits, nursingRecords, medications, schedules
} from "@shared/schema";
import { eq, and, desc, asc, count, isNull, gte, lte } from "drizzle-orm";
import { db } from "./db";

// Storage interface for all visiting nursing system operations
export interface IStorage {
  getUserByEmail(email: string): Promise<User | undefined>;

  // ========== Companies ==========
  getCompany(id: string): Promise<Company | undefined>;
  getCompanyBySlug(slug: string): Promise<Company | undefined>;
  getCompanies(): Promise<Company[]>;
  createCompany(company: InsertCompany): Promise<Company>;
  updateCompany(id: string, company: Partial<InsertCompany>): Promise<Company | undefined>;
  deleteCompany(id: string): Promise<boolean>;

  // ========== Facilities ==========
  getFacility(id: string): Promise<Facility | undefined>;
  getFacilityBySlug(companyId: string, slug: string): Promise<Facility | undefined>;
  getHeadquartersFacility(companyId: string): Promise<Facility | undefined>;
  getFacilities(): Promise<Facility[]>;
  getFacilitiesByCompany(companyId: string): Promise<Facility[]>;
  createFacility(facility: InsertFacility & { companyId: string }): Promise<Facility>;
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

  // ========== Schedules ==========
  getScheduleById(id: string): Promise<Schedule | undefined>;
  getSchedules(facilityId: string, filters?: {
    page: number;
    limit: number;
    nurseId?: string;
    patientId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<PaginatedResult<Schedule>>;
  createSchedule(schedule: InsertSchedule & { facilityId: string }): Promise<Schedule>;
  updateSchedule(id: string, schedule: Partial<InsertSchedule>): Promise<Schedule | undefined>;
  deleteSchedule(id: string): Promise<boolean>;

  // ========== Nursing Records ==========
  getNursingRecord(id: string): Promise<NursingRecord | undefined>;
  getNursingRecordsByFacility(facilityId: string): Promise<NursingRecord[]>;
  getNursingRecordsByPatient(patientId: string): Promise<NursingRecord[]>;
  getNursingRecordsByNurse(nurseId: string): Promise<NursingRecord[]>;
  createNursingRecord(record: Omit<InsertNursingRecord, 'facilityId' | 'nurseId'>, facilityId: string, nurseId: string): Promise<NursingRecord>;
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

  // ========== Paginated List Methods ==========
  getUsersByFacilityPaginated(facilityId: string, options: PaginationOptions): Promise<PaginatedResult<User>>;
  getUsersByCompanyPaginated(companyId: string, options: PaginationOptions): Promise<PaginatedResult<User>>;
  getPatientsByFacilityPaginated(facilityId: string, options: PaginationOptions): Promise<PaginatedResult<Patient>>;
  getPatientsByCompanyPaginated(companyId: string, options: PaginationOptions): Promise<PaginatedResult<Patient>>;
  getVisitsByFacilityPaginated(facilityId: string, options: PaginationOptions): Promise<PaginatedResult<Visit>>;
  getVisitsByPatientPaginated(patientId: string, facilityId: string, options: PaginationOptions): Promise<PaginatedResult<Visit>>;
  getVisitsByNursePaginated(nurseId: string, facilityId: string, options: PaginationOptions): Promise<PaginatedResult<Visit>>;
  getNursingRecordsByFacilityPaginated(facilityId: string, options: PaginationOptions): Promise<PaginatedResult<NursingRecord>>;
  getNursingRecordsByPatientPaginated(patientId: string, facilityId: string, options: PaginationOptions): Promise<PaginatedResult<NursingRecord>>;
  getNursingRecordsByNursePaginated(nurseId: string, facilityId: string, options: PaginationOptions): Promise<PaginatedResult<NursingRecord>>;
  searchNursingRecordsPaginated(facilityId: string, searchParams: {
    page: number;
    limit: number;
    status?: 'draft' | 'completed' | 'reviewed';
    patientId?: string;
    nurseId?: string;
    dateFrom?: string;
    dateTo?: string;
    sortBy?: 'visitDate' | 'recordDate';
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResult<NursingRecord> & { stats: { draft: number; completed: number; reviewed: number } }>;
  getMedicationsByFacilityPaginated(facilityId: string, options: PaginationOptions): Promise<PaginatedResult<Medication>>;
  getMedicationsByPatientPaginated(patientId: string, facilityId: string, options: PaginationOptions): Promise<PaginatedResult<Medication>>;
}

// PostgreSQL implementation using Drizzle ORM
export class PostgreSQLStorage implements IStorage {
  // ========== Companies ==========
  async getCompany(id: string): Promise<Company | undefined> {
    const result = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
    return result[0];
  }

  async getCompanyBySlug(slug: string): Promise<Company | undefined> {
    const result = await db.select().from(companies).where(eq(companies.slug, slug)).limit(1);
    return result[0];
  }

  async getCompanies(): Promise<Company[]> {
    return await db.select().from(companies);
  }

  async createCompany(company: InsertCompany): Promise<Company> {
    const result = await db.insert(companies).values(company).returning();
    return result[0];
  }

  async updateCompany(id: string, company: Partial<InsertCompany>): Promise<Company | undefined> {
    const result = await db
      .update(companies)
      .set({ ...company, updatedAt: new Date() })
      .where(eq(companies.id, id))
      .returning();
    return result[0];
  }

  async deleteCompany(id: string): Promise<boolean> {
    const result = await db.delete(companies).where(eq(companies.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // ========== Facilities ==========
  async getFacility(id: string): Promise<Facility | undefined> {
    const result = await db.select().from(facilities).where(eq(facilities.id, id)).limit(1);
    return result[0];
  }

  async getFacilityBySlug(companyId: string, slug: string): Promise<Facility | undefined> {
    const result = await db
      .select()
      .from(facilities)
      .where(and(eq(facilities.companyId, companyId), eq(facilities.slug, slug)))
      .limit(1);
    return result[0];
  }

  async getHeadquartersFacility(companyId: string): Promise<Facility | undefined> {
    const result = await db
      .select()
      .from(facilities)
      .where(and(eq(facilities.companyId, companyId), eq(facilities.isHeadquarters, true)))
      .limit(1);
    return result[0];
  }

  async getFacilities(): Promise<Facility[]> {
    return await db.select().from(facilities);
  }

  async getFacilitiesByCompany(companyId: string): Promise<Facility[]> {
    return await db.select().from(facilities).where(and(eq(facilities.companyId, companyId), eq(facilities.isActive, true)));
  }

  async createFacility(facility: InsertFacility & { companyId: string }): Promise<Facility> {
    const result = await db.insert(facilities).values(facility).returning();
    return result[0];
  }

  async updateFacility(id: string, facility: Partial<InsertFacility> & { isActive?: boolean; deletedAt?: Date | null; deletedBy?: string | null }): Promise<Facility | undefined> {
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

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
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
    const result = await db.query.patients.findFirst({
      where: eq(patients.id, id),
      with: {
        building: true,
        medicalInstitution: true,
        careManager: true
      }
    });
    return result;
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

  // ========== Schedules ==========
  async getScheduleById(id: string): Promise<Schedule | undefined> {
    const result = await db.select().from(schedules).where(eq(schedules.id, id)).limit(1);
    return result[0];
  }

  async getSchedules(facilityId: string, filters?: {
    page: number;
    limit: number;
    nurseId?: string;
    patientId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<PaginatedResult<Schedule>> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const offset = (page - 1) * limit;

    // Build query conditions
    const conditions = [eq(schedules.facilityId, facilityId)];

    if (filters?.nurseId) {
      conditions.push(eq(schedules.nurseId, filters.nurseId));
    }

    if (filters?.patientId) {
      conditions.push(eq(schedules.patientId, filters.patientId));
    }

    if (filters?.startDate && filters?.endDate) {
      // Filter by date range using scheduledDate to avoid timezone issues
      conditions.push(gte(schedules.scheduledDate, new Date(filters.startDate)));
      conditions.push(lte(schedules.scheduledDate, new Date(filters.endDate)));
    }

    // Get total count
    const [{ total }] = await db
      .select({ total: count() })
      .from(schedules)
      .where(and(...conditions));

    // Get paginated data
    const data = await db
      .select()
      .from(schedules)
      .where(and(...conditions))
      .orderBy(desc(schedules.scheduledDate))
      .limit(limit)
      .offset(offset);

    const totalPages = Math.ceil(Number(total) / limit);

    return {
      data,
      pagination: {
        page,
        limit,
        total: Number(total),
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async createSchedule(schedule: InsertSchedule & { facilityId: string }): Promise<Schedule> {
    const result = await db.insert(schedules).values(schedule).returning();
    return result[0];
  }

  async updateSchedule(id: string, schedule: Partial<InsertSchedule>): Promise<Schedule | undefined> {
    const result = await db
      .update(schedules)
      .set({ ...schedule, updatedAt: new Date() })
      .where(eq(schedules.id, id))
      .returning();
    return result[0];
  }

  async deleteSchedule(id: string): Promise<boolean> {
    // Check if there are any nursing records referencing this schedule
    const referencingRecords = await db
      .select()
      .from(nursingRecords)
      .where(eq(nursingRecords.scheduleId, id))
      .limit(1);

    if (referencingRecords.length > 0) {
      throw new Error("このスケジュールに紐付いた看護記録が存在するため削除できません");
    }

    const result = await db.delete(schedules).where(eq(schedules.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // ========== Nursing Records ==========
  async getNursingRecord(id: string): Promise<NursingRecord | undefined> {
    const result = await db.select().from(nursingRecords).where(eq(nursingRecords.id, id)).limit(1);
    return result[0];
  }

  async getNursingRecordsByFacility(facilityId: string): Promise<NursingRecord[]> {
    return await db.select().from(nursingRecords)
      .where(and(
        eq(nursingRecords.facilityId, facilityId),
        isNull(nursingRecords.deletedAt)
      ));
  }

  async getNursingRecordsByPatient(patientId: string): Promise<NursingRecord[]> {
    return await db
      .select()
      .from(nursingRecords)
      .where(and(
        eq(nursingRecords.patientId, patientId),
        isNull(nursingRecords.deletedAt)
      ))
      .orderBy(desc(nursingRecords.recordDate));
  }

  async getNursingRecordsByNurse(nurseId: string): Promise<NursingRecord[]> {
    return await db
      .select()
      .from(nursingRecords)
      .where(and(
        eq(nursingRecords.nurseId, nurseId),
        isNull(nursingRecords.deletedAt)
      ))
      .orderBy(desc(nursingRecords.recordDate));
  }

  async createNursingRecord(record: Omit<InsertNursingRecord, 'facilityId' | 'nurseId'>, facilityId: string, nurseId: string): Promise<NursingRecord> {
    const fullRecord = { ...record, facilityId, nurseId };
    const result = await db.insert(nursingRecords).values(fullRecord).returning();
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
    // Soft delete by setting deletedAt timestamp
    const result = await db.update(nursingRecords)
      .set({ deletedAt: new Date() })
      .where(eq(nursingRecords.id, id));
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

  // ========== Paginated List Methods Implementation ==========
  
  private createPaginatedResult<T>(
    data: T[], 
    total: number, 
    page: number, 
    limit: number
  ): PaginatedResult<T> {
    const totalPages = Math.ceil(total / limit);
    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      }
    };
  }

  async getUsersByFacilityPaginated(facilityId: string, options: PaginationOptions): Promise<PaginatedResult<any>> {
    const offset = (options.page - 1) * options.limit;

    const [data, totalResult] = await Promise.all([
      db.select({
        id: users.id,
        facilityId: users.facilityId,
        username: users.username,
        password: users.password,
        email: users.email,
        fullName: users.fullName,
        role: users.role,
        accessLevel: users.accessLevel,
        licenseNumber: users.licenseNumber,
        phone: users.phone,
        isActive: users.isActive,
        mustChangePassword: users.mustChangePassword,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        facility: {
          id: facilities.id,
          name: facilities.name,
          slug: facilities.slug,
          isHeadquarters: facilities.isHeadquarters,
          companyId: facilities.companyId,
        }
      }).from(users)
        .leftJoin(facilities, eq(users.facilityId, facilities.id))
        .where(eq(users.facilityId, facilityId))
        .orderBy(desc(users.createdAt))
        .limit(options.limit)
        .offset(offset),
      db.select({ count: count() }).from(users)
        .where(eq(users.facilityId, facilityId))
    ]);

    const total = Number(totalResult[0].count);
    return this.createPaginatedResult(data, total, options.page, options.limit);
  }

  async getUsersByCompanyPaginated(companyId: string, options: PaginationOptions): Promise<PaginatedResult<any>> {
    const offset = (options.page - 1) * options.limit;

    const [data, totalResult] = await Promise.all([
      db.select({
        id: users.id,
        facilityId: users.facilityId,
        username: users.username,
        password: users.password,
        email: users.email,
        fullName: users.fullName,
        role: users.role,
        accessLevel: users.accessLevel,
        licenseNumber: users.licenseNumber,
        phone: users.phone,
        isActive: users.isActive,
        mustChangePassword: users.mustChangePassword,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        facility: {
          id: facilities.id,
          name: facilities.name,
          slug: facilities.slug,
          isHeadquarters: facilities.isHeadquarters,
          companyId: facilities.companyId,
        }
      }).from(users)
        .leftJoin(facilities, eq(users.facilityId, facilities.id))
        .where(eq(facilities.companyId, companyId))
        .orderBy(desc(users.createdAt))
        .limit(options.limit)
        .offset(offset),
      db.select({ count: count() }).from(users)
        .leftJoin(facilities, eq(users.facilityId, facilities.id))
        .where(eq(facilities.companyId, companyId))
    ]);

    const total = Number(totalResult[0].count);
    return this.createPaginatedResult(data, total, options.page, options.limit);
  }

  async getPatientsByFacilityPaginated(facilityId: string, options: PaginationOptions): Promise<PaginatedResult<Patient>> {
    const offset = (options.page - 1) * options.limit;

    const [data, totalResult] = await Promise.all([
      db.select().from(patients)
        .where(eq(patients.facilityId, facilityId))
        .orderBy(desc(patients.createdAt))
        .limit(options.limit)
        .offset(offset),
      db.select({ count: count() }).from(patients)
        .where(eq(patients.facilityId, facilityId))
    ]);

    const total = Number(totalResult[0].count);
    return this.createPaginatedResult(data, total, options.page, options.limit);
  }

  async getPatientsByCompanyPaginated(companyId: string, options: PaginationOptions): Promise<PaginatedResult<any>> {
    const offset = (options.page - 1) * options.limit;

    const [data, totalResult] = await Promise.all([
      db.select({
        id: patients.id,
        facilityId: patients.facilityId,
        patientNumber: patients.patientNumber,
        lastName: patients.lastName,
        firstName: patients.firstName,
        dateOfBirth: patients.dateOfBirth,
        gender: patients.gender,
        address: patients.address,
        phone: patients.phone,
        emergencyContact: patients.emergencyContact,
        emergencyPhone: patients.emergencyPhone,
        medicalHistory: patients.medicalHistory,
        allergies: patients.allergies,
        currentMedications: patients.currentMedications,
        insuranceNumber: patients.insuranceNumber,
        careNotes: patients.careNotes,
        isActive: patients.isActive,
        isCritical: patients.isCritical,
        createdAt: patients.createdAt,
        updatedAt: patients.updatedAt,
        facility: {
          id: facilities.id,
          name: facilities.name,
          slug: facilities.slug,
        }
      }).from(patients)
        .leftJoin(facilities, eq(patients.facilityId, facilities.id))
        .where(eq(facilities.companyId, companyId))
        .orderBy(desc(patients.createdAt))
        .limit(options.limit)
        .offset(offset),
      db.select({ count: count() }).from(patients)
        .leftJoin(facilities, eq(patients.facilityId, facilities.id))
        .where(eq(facilities.companyId, companyId))
    ]);

    const total = Number(totalResult[0].count);
    return this.createPaginatedResult(data, total, options.page, options.limit);
  }

  async getVisitsByFacilityPaginated(facilityId: string, options: PaginationOptions): Promise<PaginatedResult<Visit>> {
    const offset = (options.page - 1) * options.limit;
    
    const [data, totalResult] = await Promise.all([
      db.select().from(visits)
        .where(eq(visits.facilityId, facilityId))
        .orderBy(desc(visits.scheduledDate))
        .limit(options.limit)
        .offset(offset),
      db.select({ count: count() }).from(visits)
        .where(eq(visits.facilityId, facilityId))
    ]);

    const total = Number(totalResult[0].count);
    return this.createPaginatedResult(data, total, options.page, options.limit);
  }

  async getVisitsByPatientPaginated(patientId: string, facilityId: string, options: PaginationOptions): Promise<PaginatedResult<Visit>> {
    const offset = (options.page - 1) * options.limit;
    
    const [data, totalResult] = await Promise.all([
      db.select().from(visits)
        .where(and(
          eq(visits.patientId, patientId),
          eq(visits.facilityId, facilityId)
        ))
        .orderBy(desc(visits.scheduledDate))
        .limit(options.limit)
        .offset(offset),
      db.select({ count: count() }).from(visits)
        .where(and(
          eq(visits.patientId, patientId),
          eq(visits.facilityId, facilityId)
        ))
    ]);

    const total = Number(totalResult[0].count);
    return this.createPaginatedResult(data, total, options.page, options.limit);
  }

  async getVisitsByNursePaginated(nurseId: string, facilityId: string, options: PaginationOptions): Promise<PaginatedResult<Visit>> {
    const offset = (options.page - 1) * options.limit;
    
    const [data, totalResult] = await Promise.all([
      db.select().from(visits)
        .where(and(
          eq(visits.nurseId, nurseId),
          eq(visits.facilityId, facilityId)
        ))
        .orderBy(desc(visits.scheduledDate))
        .limit(options.limit)
        .offset(offset),
      db.select({ count: count() }).from(visits)
        .where(and(
          eq(visits.nurseId, nurseId),
          eq(visits.facilityId, facilityId)
        ))
    ]);

    const total = Number(totalResult[0].count);
    return this.createPaginatedResult(data, total, options.page, options.limit);
  }

  async getNursingRecordsByFacilityPaginated(facilityId: string, options: PaginationOptions): Promise<PaginatedResult<NursingRecord>> {
    const offset = (options.page - 1) * options.limit;

    const [data, totalResult] = await Promise.all([
      db.select().from(nursingRecords)
        .where(and(
          eq(nursingRecords.facilityId, facilityId),
          isNull(nursingRecords.deletedAt)
        ))
        .orderBy(desc(nursingRecords.recordDate))
        .limit(options.limit)
        .offset(offset),
      db.select({ count: count() }).from(nursingRecords)
        .where(and(
          eq(nursingRecords.facilityId, facilityId),
          isNull(nursingRecords.deletedAt)
        ))
    ]);

    const total = Number(totalResult[0].count);
    return this.createPaginatedResult(data, total, options.page, options.limit);
  }

  async getNursingRecordsByPatientPaginated(patientId: string, facilityId: string, options: PaginationOptions): Promise<PaginatedResult<NursingRecord>> {
    const offset = (options.page - 1) * options.limit;

    const [data, totalResult] = await Promise.all([
      db.select().from(nursingRecords)
        .where(and(
          eq(nursingRecords.patientId, patientId),
          eq(nursingRecords.facilityId, facilityId),
          isNull(nursingRecords.deletedAt)
        ))
        .orderBy(desc(nursingRecords.recordDate))
        .limit(options.limit)
        .offset(offset),
      db.select({ count: count() }).from(nursingRecords)
        .where(and(
          eq(nursingRecords.patientId, patientId),
          eq(nursingRecords.facilityId, facilityId),
          isNull(nursingRecords.deletedAt)
        ))
    ]);

    const total = Number(totalResult[0].count);
    return this.createPaginatedResult(data, total, options.page, options.limit);
  }

  async getNursingRecordsByNursePaginated(nurseId: string, facilityId: string, options: PaginationOptions): Promise<PaginatedResult<NursingRecord>> {
    const offset = (options.page - 1) * options.limit;

    const [data, totalResult] = await Promise.all([
      db.select().from(nursingRecords)
        .where(and(
          eq(nursingRecords.nurseId, nurseId),
          eq(nursingRecords.facilityId, facilityId)
        ))
        .orderBy(desc(nursingRecords.recordDate))
        .limit(options.limit)
        .offset(offset),
      db.select({ count: count() }).from(nursingRecords)
        .where(and(
          eq(nursingRecords.nurseId, nurseId),
          eq(nursingRecords.facilityId, facilityId)
        ))
    ]);

    const total = Number(totalResult[0].count);
    return this.createPaginatedResult(data, total, options.page, options.limit);
  }

  async searchNursingRecordsPaginated(facilityId: string, searchParams: {
    page: number;
    limit: number;
    status?: 'draft' | 'completed' | 'reviewed';
    patientId?: string;
    nurseId?: string;
    dateFrom?: string;
    dateTo?: string;
    sortBy?: 'visitDate' | 'recordDate';
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResult<NursingRecord> & { stats: { draft: number; completed: number; reviewed: number } }> {
    const { page, limit: requestedLimit, status, patientId, nurseId, dateFrom, dateTo, sortBy = 'visitDate', sortOrder = 'desc' } = searchParams;

    // Enforce maximum limit of 1000
    const limit = Math.min(requestedLimit, 1000);
    const offset = (page - 1) * limit;

    // Build WHERE conditions dynamically
    const conditions = [
      eq(nursingRecords.facilityId, facilityId),
      isNull(nursingRecords.deletedAt)
    ];

    if (status) {
      conditions.push(eq(nursingRecords.status, status));
    }

    if (patientId) {
      conditions.push(eq(nursingRecords.patientId, patientId));
    }

    if (nurseId) {
      conditions.push(eq(nursingRecords.nurseId, nurseId));
    }

    if (dateFrom) {
      console.log('🔍 DEBUG - Date filter FROM:', dateFrom, 'Type:', typeof dateFrom);
      conditions.push(gte(nursingRecords.visitDate, dateFrom));
    }

    if (dateTo) {
      console.log('🔍 DEBUG - Date filter TO:', dateTo, 'Type:', typeof dateTo);
      conditions.push(lte(nursingRecords.visitDate, dateTo));
    }

    // Determine sort order
    // When sorting by visitDate, also sort by actualStartTime as secondary sort key
    const sortColumn = sortBy === 'visitDate' ? nursingRecords.visitDate : nursingRecords.recordDate;
    const primaryOrder = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);
    const secondaryOrder = sortBy === 'visitDate'
      ? (sortOrder === 'asc' ? asc(nursingRecords.actualStartTime) : desc(nursingRecords.actualStartTime))
      : undefined;

    // Execute queries in parallel for performance
    const [data, totalResult, draftCount, completedCount, reviewedCount] = await Promise.all([
      // Main data query
      db.select().from(nursingRecords)
        .where(and(...conditions))
        .orderBy(primaryOrder, ...(secondaryOrder ? [secondaryOrder] : []))
        .limit(limit)
        .offset(offset),

      // Total count for filtered results
      db.select({ count: count() }).from(nursingRecords)
        .where(and(...conditions)),

      // Status counts (全体の件数、フィルタ適用済み - statusフィルタを除く)
      db.select({ count: count() }).from(nursingRecords)
        .where(and(
          eq(nursingRecords.facilityId, facilityId),
          isNull(nursingRecords.deletedAt),
          eq(nursingRecords.status, 'draft'),
          ...(patientId ? [eq(nursingRecords.patientId, patientId)] : []),
          ...(nurseId ? [eq(nursingRecords.nurseId, nurseId)] : []),
          ...(dateFrom ? [gte(nursingRecords.visitDate, dateFrom)] : []),
          ...(dateTo ? [lte(nursingRecords.visitDate, dateTo)] : [])
        )),

      db.select({ count: count() }).from(nursingRecords)
        .where(and(
          eq(nursingRecords.facilityId, facilityId),
          isNull(nursingRecords.deletedAt),
          eq(nursingRecords.status, 'completed'),
          ...(patientId ? [eq(nursingRecords.patientId, patientId)] : []),
          ...(nurseId ? [eq(nursingRecords.nurseId, nurseId)] : []),
          ...(dateFrom ? [gte(nursingRecords.visitDate, dateFrom)] : []),
          ...(dateTo ? [lte(nursingRecords.visitDate, dateTo)] : [])
        )),

      db.select({ count: count() }).from(nursingRecords)
        .where(and(
          eq(nursingRecords.facilityId, facilityId),
          isNull(nursingRecords.deletedAt),
          eq(nursingRecords.status, 'reviewed'),
          ...(patientId ? [eq(nursingRecords.patientId, patientId)] : []),
          ...(nurseId ? [eq(nursingRecords.nurseId, nurseId)] : []),
          ...(dateFrom ? [gte(nursingRecords.visitDate, dateFrom)] : []),
          ...(dateTo ? [lte(nursingRecords.visitDate, dateTo)] : [])
        ))
    ]);

    const total = Number(totalResult[0].count);

    // DEBUG: Log search results
    console.log('🔍 DEBUG - Search results count:', data.length);
    if (data.length > 0) {
      console.log('🔍 DEBUG - First record visitDate:', data[0].visitDate);
      console.log('🔍 DEBUG - First record visitDate type:', typeof data[0].visitDate);
    }

    const paginatedResult = this.createPaginatedResult(data, total, page, limit);

    return {
      ...paginatedResult,
      stats: {
        draft: Number(draftCount[0].count),
        completed: Number(completedCount[0].count),
        reviewed: Number(reviewedCount[0].count)
      }
    };
  }

  async getMedicationsByFacilityPaginated(facilityId: string, options: PaginationOptions): Promise<PaginatedResult<Medication>> {
    const offset = (options.page - 1) * options.limit;
    
    const [data, totalResult] = await Promise.all([
      db.select().from(medications)
        .where(eq(medications.facilityId, facilityId))
        .orderBy(desc(medications.createdAt))
        .limit(options.limit)
        .offset(offset),
      db.select({ count: count() }).from(medications)
        .where(eq(medications.facilityId, facilityId))
    ]);

    const total = Number(totalResult[0].count);
    return this.createPaginatedResult(data, total, options.page, options.limit);
  }

  async getMedicationsByPatientPaginated(patientId: string, facilityId: string, options: PaginationOptions): Promise<PaginatedResult<Medication>> {
    const offset = (options.page - 1) * options.limit;
    
    const [data, totalResult] = await Promise.all([
      db.select().from(medications)
        .where(and(
          eq(medications.patientId, patientId),
          eq(medications.facilityId, facilityId)
        ))
        .orderBy(desc(medications.createdAt))
        .limit(options.limit)
        .offset(offset),
      db.select({ count: count() }).from(medications)
        .where(and(
          eq(medications.patientId, patientId),
          eq(medications.facilityId, facilityId)
        ))
    ]);

    const total = Number(totalResult[0].count);
    return this.createPaginatedResult(data, total, options.page, options.limit);
  }
}

// Export the PostgreSQL storage instance
export const storage = new PostgreSQLStorage();
