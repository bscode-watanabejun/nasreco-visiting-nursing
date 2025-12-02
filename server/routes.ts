import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import bcrypt from "bcryptjs";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import PDFDocument from "pdfkit";
import { storage } from "./storage";
import { uploadFile, downloadFile, deleteFile } from "./object-storage";
import { requireAuth, requireCorporateAdmin, checkSubdomainAccess } from "./middleware/access-control";
import { requireSystemAdmin } from "./middleware/system-admin";
import { validateMonthlyReceiptData, validateMultipleReceipts } from "./services/csvValidationService";
import { generateNursingReceiptCsv, generateMultipleNursingReceiptCsv } from "./services/csv/nursingReceiptCsvBuilder";
import { NursingReceiptExcelBuilder } from "./services/excel/nursingReceiptExcelBuilder";
import { CareInsuranceReceiptCsvBuilder } from "./services/csv/careInsuranceReceiptCsvBuilder";
import type { ReceiptCsvData, CareInsuranceReceiptCsvData, CareInsurancePatientData, MedicalInsuranceReceiptCsvData } from "./services/csv/types";
import {
  insertUserSchema,
  insertPatientSchema,
  insertVisitSchema,
  insertNursingRecordSchema,
  insertMedicationSchema,
  insertFacilitySchema,
  insertCompanySchema,
  insertScheduleSchema,
  insertMedicalInstitutionSchema,
  insertCareManagerSchema,
  insertBuildingSchema,
  insertDoctorOrderSchema,
  insertInsuranceCardSchema,
  insertCarePlanSchema,
  insertServiceCarePlanSchema,
  insertCareReportSchema,
  updateUserSelfSchema,
  updateUserAdminSchema,
  updatePatientSchema,
  updateVisitSchema,
  updateNursingRecordSchema,
  updateMedicationSchema,
  updateScheduleSchema,
  updateMedicalInstitutionSchema,
  updateCareManagerSchema,
  updateBuildingSchema,
  updateDoctorOrderSchema,
  updateInsuranceCardSchema,
  updateCarePlanSchema,
  updateServiceCarePlanSchema,
  updateCareReportSchema,
  insertContractSchema,
  updateContractSchema,
  insertSpecialManagementDefinitionSchema,
  updateSpecialManagementDefinitionSchema,
  insertSpecialManagementFieldSchema,
  updateSpecialManagementFieldSchema,
  insertBonusMasterSchema,
  updateBonusMasterSchema,
  nursingRecordAttachments,
  medicalInstitutions,
  careManagers,
  doctorOrders,
  insuranceCards,
  publicExpenseCards,
  carePlans,
  serviceCarePlans,
  careReports,
  contracts,
  bonusMaster,
  bonusCalculationHistory,
  monthlyReceipts,
  facilities,
  patients,
  users,
  schedules,
  nursingRecords,
  buildings,
  specialManagementDefinitions,
  specialManagementFields,
  prefectureCodes,
  nursingServiceCodes,
  staffQualificationCodes,
  visitLocationCodes,
  receiptTypeCodes,
  type NursingRecordAttachment,
  type MedicalInstitution,
  type CareManager,
  type DoctorOrder,
  type InsuranceCard,
  type BonusMaster
} from "@shared/schema";
import { z } from "zod";
import { db } from "./db";
import { eq, and, or, gte, lte, sql, isNotNull, inArray, isNull, not, lt, asc, desc, ne, type SQL } from "drizzle-orm";
import { stringify } from "csv-stringify/sync";
import { validateReceipt, detectMissingBonuses } from "./validators/receipt-validator";

// Extend Express session data
declare module "express-session" {
  interface SessionData {
    userId?: string;
    facilityId?: string;
  }
}

// Extend Express Request to include user info and hierarchical access
interface AuthenticatedRequest extends Request {
  user?: any;
  accessibleFacilities?: string[];
  isCorporateAdmin?: boolean;
  company?: any;
  facility?: any;
  isHeadquarters?: boolean;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // ========== Multer Configuration for File Uploads ==========
  // Using memoryStorage to upload files to Object Storage instead of local filesystem
  const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('画像（JPEG、PNG）またはPDFファイルのみアップロード可能です'));
    }
  };

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
    },
    fileFilter: fileFilter
  });

  // Helper function to decode UTF-8 filename from multer
  // Multer receives filename as latin1, but browsers send it as UTF-8
  function decodeFilename(filename: string): string {
    try {
      // Convert latin1 bytes back to UTF-8 string
      const buffer = Buffer.from(filename, 'latin1');
      return buffer.toString('utf8');
    } catch (error) {
      console.error('Filename decoding error:', error);
      return filename; // Fallback to original if decoding fails
    }
  }

  // Helper function to upload document file to Object Storage
  async function uploadDocumentFile(file: Express.Multer.File, documentType: string): Promise<{ filePath: string; originalFileName: string }> {
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    const ext = path.extname(file.originalname);
    const fileName = `${uniqueSuffix}${ext}`;
    const objectKey = `documents/${documentType}/${fileName}`;

    await uploadFile(objectKey, file.buffer, file.mimetype);

    return {
      filePath: objectKey,
      originalFileName: decodeFilename(file.originalname)
    };
  }

  // Multer setup for doctor orders and insurance cards
  const documentUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
    },
    fileFilter: (req, file, cb) => {
      const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
      if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('PDFまたは画像ファイル（JPEG、PNG）のみアップロード可能です'));
      }
    }
  });

  // ========== Authentication Routes ==========
  
  // Login
  app.post("/api/auth/login", async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { username, password } = req.body;
      
      console.log("Login attempt for user:", username);
      
      if (!username || !password) {
        return res.status(400).json({ error: "ユーザー名とパスワードが必要です" });
      }

      let user = await storage.getUserByUsername(username);
      if (!user) {
        // Try to find user by email if username search fails
        user = await storage.getUserByEmail(username);
      }
      console.log("User lookup result:", user ? "Found" : "Not found");
      if (!user) {
        return res.status(401).json({ error: "メールアドレスまたはパスワードが正しくありません" });
      }

      const isValidPassword = await bcrypt.compare(password, user.password);
      console.log("Password validation:", { isValidPassword });
      if (!isValidPassword) {
        return res.status(401).json({ error: "メールアドレスまたはパスワードが正しくありません" });
      }

      if (!user.isActive) {
        return res.status(401).json({ error: "アカウントが無効化されています" });
      }

      // Regenerate session ID to prevent session fixation attacks
      req.session.regenerate((err) => {
        if (err) {
          console.error("Session regeneration error:", err);
          return res.status(500).json({ error: "認証に失敗しました" });
        }

        // Set session after regeneration
        req.session.userId = user.id;
        req.session.facilityId = user.facilityId;

        // Return user info (without password)
        const { password: _, ...userWithoutPassword } = user;
        res.json({
          user: userWithoutPassword,
          requirePasswordChange: user.mustChangePassword || false
        });
      });
      
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Logout
  app.post("/api/auth/logout", (req: AuthenticatedRequest, res: Response) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "ログアウトに失敗しました" });
      }
      res.json({ success: true });
    });
  });

  // Get tenant information from URL path (for TenantContext)
  // No authentication required - this is public tenant info based on URL
  app.get("/api/tenant-info", async (req: Request, res: Response) => {
    try {
      const { companySlug, facilitySlug } = req.query;

      if (!companySlug || !facilitySlug) {
        return res.status(400).json({ error: "companySlug and facilitySlug are required" });
      }

      // Get company by slug
      const company = await storage.getCompanyBySlug(companySlug as string);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }

      // Get facility by slug
      const facility = await storage.getFacilityBySlug(company.id, facilitySlug as string);
      if (!facility) {
        return res.status(404).json({ error: "Facility not found" });
      }

      // Return tenant information
      res.json({
        company: {
          id: company.id,
          name: company.name,
          slug: company.slug
        },
        facility: {
          id: facility.id,
          companyId: facility.companyId,
          name: facility.name,
          slug: facility.slug,
          isHeadquarters: facility.isHeadquarters
        }
      });

    } catch (error) {
      console.error("Get tenant info error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Get current user
  app.get("/api/auth/me", async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "認証が必要です" });
      }

      const user = await storage.getUser(req.session.userId);
      if (!user) {
        return res.status(401).json({ error: "ユーザーが見つかりません" });
      }

      // Get facility information
      const facility = await storage.getFacility(user.facilityId);

      // Get company information if facility exists and construct response
      let facilityData: any = null;
      if (facility) {
        const company = await storage.getCompany(facility.companyId);
        facilityData = {
          id: facility.id,
          name: facility.name,
          slug: facility.slug,
          isHeadquarters: facility.isHeadquarters,
          companyId: facility.companyId,
          company: company ? {
            id: company.id,
            name: company.name,
            slug: company.slug
          } : null
        };
      }

      const { password: _, ...userWithoutPassword } = user;
      res.json({
        user: {
          ...userWithoutPassword,
          facility: facilityData
        }
      });

    } catch (error) {
      console.error("Get current user error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Get notification count
  app.get("/api/notifications/count", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.facility?.id || req.user.facilityId;
      if (!facilityId) {
        return res.status(401).json({ error: "施設IDが見つかりません" });
      }

      const today = new Date();
      today.setHours(23, 59, 59, 999);
      
      // Calculate 30 days ago
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(today.getDate() - 30);
      thirtyDaysAgo.setHours(0, 0, 0, 0);

      // 1. Count schedules without records (past 30 days)
      const allSchedules = await db.query.schedules.findMany({
        where: and(
          eq(schedules.facilityId, facilityId),
          not(inArray(schedules.status, ["cancelled"] as const)),
          gte(schedules.scheduledDate, thirtyDaysAgo),
          lte(schedules.scheduledDate, today)
        ),
        columns: { id: true }
      });

      const schedulesWithRecords = await db.query.nursingRecords.findMany({
        where: and(
          eq(nursingRecords.facilityId, facilityId),
          isNotNull(nursingRecords.scheduleId)
        ),
        columns: { scheduleId: true }
      });

      const scheduleIdsWithRecords = new Set(
        schedulesWithRecords
          .map(r => r.scheduleId)
          .filter((id): id is string => id !== null)
      );

      const schedulesWithoutRecordsCount = allSchedules.filter(
        s => !scheduleIdsWithRecords.has(s.id)
      ).length;

      // 2. Count doctor orders expiring within 14 days
      const fourteenDaysFromNow = new Date();
      fourteenDaysFromNow.setDate(today.getDate() + 14);
      const todayStr = today.toISOString().split('T')[0];
      const fourteenDaysStr = fourteenDaysFromNow.toISOString().split('T')[0];

      const expiringDoctorOrders = await db.query.doctorOrders.findMany({
        where: and(
          eq(doctorOrders.facilityId, facilityId),
          gte(doctorOrders.endDate, todayStr),
          lte(doctorOrders.endDate, fourteenDaysStr)
        ),
        columns: { id: true }
      });

      // 3. Count insurance cards expiring within 30 days
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(today.getDate() + 30);
      const thirtyDaysStr = thirtyDaysFromNow.toISOString().split('T')[0];

      const expiringInsuranceCards = await db.query.insuranceCards.findMany({
        where: and(
          eq(insuranceCards.facilityId, facilityId),
          isNotNull(insuranceCards.validUntil),
          gte(insuranceCards.validUntil, todayStr),
          lte(insuranceCards.validUntil, thirtyDaysStr)
        ),
        columns: { id: true }
      });

      const totalCount =
        schedulesWithoutRecordsCount +
        expiringDoctorOrders.length +
        expiringInsuranceCards.length;

      res.json({
        total: totalCount,
        schedulesWithoutRecords: schedulesWithoutRecordsCount,
        expiringDoctorOrders: expiringDoctorOrders.length,
        expiringInsuranceCards: expiringInsuranceCards.length
      });

    } catch (error) {
      console.error("Get notification count error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Get notification details list (top 5 per category)
  app.get("/api/notifications/list", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.facility?.id || req.user.facilityId;
      if (!facilityId) {
        return res.status(401).json({ error: "施設IDが見つかりません" });
      }

      const today = new Date();
      today.setHours(23, 59, 59, 999);
      
      // Calculate 30 days ago
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(today.getDate() - 30);
      thirtyDaysAgo.setHours(0, 0, 0, 0);

      // 1. Get schedules without records (past 30 days, top 5)
      const allSchedules = await db.query.schedules.findMany({
        where: and(
          eq(schedules.facilityId, facilityId),
          not(inArray(schedules.status, ["cancelled"] as const)),
          gte(schedules.scheduledDate, thirtyDaysAgo),
          lte(schedules.scheduledDate, today)
        ),
        with: {
          patient: {
            columns: {
              id: true,
              lastName: true,
              firstName: true,
            }
          },
          nurse: {
            columns: {
              id: true,
              fullName: true,
            }
          }
        },
        orderBy: [desc(schedules.scheduledDate)],
      });

      const schedulesWithRecords = await db.query.nursingRecords.findMany({
        where: and(
          eq(nursingRecords.facilityId, facilityId),
          isNotNull(nursingRecords.scheduleId)
        ),
        columns: { scheduleId: true }
      });

      const scheduleIdsWithRecords = new Set(
        schedulesWithRecords
          .map(r => r.scheduleId)
          .filter((id): id is string => id !== null)
      );

      const schedulesWithoutRecordsData = allSchedules
        .filter(s => !scheduleIdsWithRecords.has(s.id))
        .slice(0, 5)
        .map(schedule => ({
          id: schedule.id,
          scheduledDate: schedule.scheduledDate,
          scheduledStartTime: schedule.scheduledStartTime,
          scheduledEndTime: schedule.scheduledEndTime,
          purpose: schedule.purpose,
          patient: schedule.patient,
          nurse: schedule.nurse,
        }));

      // 2. Get doctor orders expiring within 14 days (top 5)
      const fourteenDaysFromNow = new Date();
      fourteenDaysFromNow.setDate(today.getDate() + 14);
      const todayStr = today.toISOString().split('T')[0];
      const fourteenDaysStr = fourteenDaysFromNow.toISOString().split('T')[0];

      const expiringDoctorOrdersData = await db.query.doctorOrders.findMany({
        where: and(
          eq(doctorOrders.facilityId, facilityId),
          gte(doctorOrders.endDate, todayStr),
          lte(doctorOrders.endDate, fourteenDaysStr)
        ),
        with: {
          patient: {
            columns: {
              id: true,
              lastName: true,
              firstName: true,
            }
          },
          medicalInstitution: {
            columns: {
              id: true,
              name: true,
              doctorName: true,
            }
          }
        },
        orderBy: [asc(doctorOrders.endDate)],
        limit: 5,
      });

      // Calculate days remaining for each doctor order
      const doctorOrdersWithDays = expiringDoctorOrdersData.map(order => {
        const endDate = new Date(order.endDate);
        const daysRemaining = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return {
          ...order,
          daysRemaining,
        };
      });

      // 3. Get insurance cards expiring within 30 days (top 5)
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(today.getDate() + 30);
      const thirtyDaysStr = thirtyDaysFromNow.toISOString().split('T')[0];

      const expiringInsuranceCardsData = await db.query.insuranceCards.findMany({
        where: and(
          eq(insuranceCards.facilityId, facilityId),
          isNotNull(insuranceCards.validUntil),
          gte(insuranceCards.validUntil, todayStr),
          lte(insuranceCards.validUntil, thirtyDaysStr)
        ),
        with: {
          patient: {
            columns: {
              id: true,
              lastName: true,
              firstName: true,
            }
          }
        },
        orderBy: [asc(insuranceCards.validUntil)],
        limit: 5,
      });

      // Calculate days remaining for each insurance card
      const insuranceCardsWithDays = expiringInsuranceCardsData.map(card => {
        const validUntil = new Date(card.validUntil!);
        const daysRemaining = Math.ceil((validUntil.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return {
          ...card,
          daysRemaining,
        };
      });

      res.json({
        schedulesWithoutRecords: schedulesWithoutRecordsData,
        expiringDoctorOrders: doctorOrdersWithDays,
        expiringInsuranceCards: insuranceCardsWithDays,
      });

    } catch (error) {
      console.error("Get notification list error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // ========== Enhanced Middleware for authenticated routes ==========
  // Use hierarchical access control middleware from separate file

  // Additional middleware to check subdomain access
  app.use('/api', requireAuth);
  app.use('/api', checkSubdomainAccess);

  // ========== System Admin Routes (System Administrator only) ==========

  // Get all companies (system admin only)
  app.get("/api/system-admin/companies", requireAuth, requireSystemAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const companies = await storage.getCompanies();
      // Exclude SYSTEM company from the list
      const filteredCompanies = companies.filter(c => c.slug !== 'system');
      res.json(filteredCompanies);
    } catch (error) {
      console.error("Get companies error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Get company detail with statistics (system admin only)
  app.get("/api/system-admin/companies/:id", requireAuth, requireSystemAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const company = await storage.getCompany(id);

      if (!company) {
        return res.status(404).json({ error: "企業が見つかりません" });
      }

      // Get facilities for this company
      const facilities = await storage.getFacilitiesByCompany(id);

      // Get user count across all facilities
      let totalUsers = 0;
      for (const facility of facilities) {
        const users = await storage.getUsersByFacility(facility.id);
        totalUsers += users.length;
      }

      // Get patient count across all facilities
      let totalPatients = 0;
      for (const facility of facilities) {
        const patients = await storage.getPatientsByFacility(facility.id);
        totalPatients += patients.length;
      }

      res.json({
        ...company,
        facilities,
        statistics: {
          facilityCount: facilities.length,
          userCount: totalUsers,
          patientCount: totalPatients
        }
      });
    } catch (error) {
      console.error("Get company detail error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Create company with headquarters and initial admin (system admin only)
  app.post("/api/system-admin/companies", requireAuth, requireSystemAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        companyName,
        companySlug,
        companyAddress,
        companyPhone,
        companyEmail,
        facilityName,
        facilitySlug,
        facilityAddress,
        facilityPhone,
        facilityEmail,
        adminUsername,
        adminEmail,
        adminFullName,
        adminPassword,
        adminPhone
      } = req.body;

      // Validate required fields
      if (!companyName || !companySlug || !facilityName || !facilitySlug || !adminUsername || !adminEmail || !adminFullName || !adminPassword) {
        return res.status(400).json({ error: "必須項目が入力されていません" });
      }

      // Check if company slug already exists
      const existingCompany = await storage.getCompanyBySlug(companySlug);
      if (existingCompany) {
        return res.status(400).json({ error: "この企業スラッグは既に使用されています" });
      }

      // Check if username already exists
      const existingUser = await storage.getUserByUsername(adminUsername);
      if (existingUser) {
        return res.status(400).json({ error: "このユーザー名は既に使用されています" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(adminPassword, 10);

      // Create company
      const company = await storage.createCompany({
        name: companyName,
        slug: companySlug,
        address: companyAddress,
        phone: companyPhone,
        email: companyEmail
      });

      // Create headquarters facility
      const facility = await storage.createFacility({
        companyId: company.id,
        name: facilityName,
        slug: facilitySlug,
        isHeadquarters: true,
        address: facilityAddress || companyAddress,
        phone: facilityPhone || companyPhone,
        email: facilityEmail || companyEmail
      });

      // Create initial admin user
      const adminUser = await storage.createUser({
        facilityId: facility.id,
        username: adminUsername,
        password: hashedPassword,
        email: adminEmail,
        fullName: adminFullName,
        role: 'corporate_admin',
        accessLevel: 'corporate',
        phone: adminPhone,
        isActive: true,
        mustChangePassword: true
      });

      res.status(201).json({
        company,
        facility,
        adminUser: {
          id: adminUser.id,
          username: adminUser.username,
          email: adminUser.email,
          fullName: adminUser.fullName,
          role: adminUser.role
        },
        loginUrl: `/${companySlug}/${facilitySlug}/login`
      });
    } catch (error: any) {
      console.error("Create company error:", error);
      if (error.code === '23505') { // Unique violation
        return res.status(400).json({ error: "スラッグまたはユーザー名が既に使用されています" });
      }
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Update company (system admin only)
  app.put("/api/system-admin/companies/:id", requireAuth, requireSystemAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { name, slug, address, phone, email } = req.body;

      // Prevent updating SYSTEM company
      const company = await storage.getCompany(id);
      if (!company) {
        return res.status(404).json({ error: "企業が見つかりません" });
      }

      if (company.slug === 'system') {
        return res.status(403).json({ error: "SYSTEM企業は編集できません" });
      }

      // Check if new slug is already taken
      if (slug && slug !== company.slug) {
        const existingCompany = await storage.getCompanyBySlug(slug);
        if (existingCompany && existingCompany.id !== id) {
          return res.status(400).json({ error: "この企業スラッグは既に使用されています" });
        }
      }

      const updatedCompany = await storage.updateCompany(id, {
        name,
        slug,
        address,
        phone,
        email
      });

      if (!updatedCompany) {
        return res.status(404).json({ error: "企業が見つかりません" });
      }

      res.json(updatedCompany);
    } catch (error) {
      console.error("Update company error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Delete company (system admin only) - logical delete
  app.delete("/api/system-admin/companies/:id", requireAuth, requireSystemAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      // Prevent deleting SYSTEM company
      const company = await storage.getCompany(id);
      if (!company) {
        return res.status(404).json({ error: "企業が見つかりません" });
      }

      if (company.slug === 'system') {
        return res.status(403).json({ error: "SYSTEM企業は削除できません" });
      }

      // Check if company has any active non-headquarters facilities
      // Get all facilities (including logically deleted ones)
      const allFacilities = await db.select().from(facilities).where(eq(facilities.companyId, id));

      // Only check for active non-headquarters facilities
      const activeFacilities = allFacilities.filter(f => f.isActive);
      const activeNonHqFacilities = activeFacilities.filter(f => !f.isHeadquarters);

      if (activeNonHqFacilities.length > 0) {
        return res.status(400).json({
          error: "本社以外のアクティブな施設が存在する企業は削除できません",
          details: `先に施設管理から${activeNonHqFacilities.length}個の施設を削除してください。`
        });
      }

      // All facilities (including logically deleted ones) will be physically deleted

      // Count users before deletion for response message
      let totalDeletedUsers = 0;
      for (const facility of allFacilities) {
        const users = await storage.getUsersByFacility(facility.id);
        totalDeletedUsers += users.length;
      }

      // Delete all related data for each facility
      for (const facility of allFacilities) {
        // Delete all patients and their related data
        const patients = await storage.getPatientsByFacility(facility.id);
        for (const patient of patients) {
          // Delete patient-related data using raw queries
          await db.execute(sql`DELETE FROM nursing_records WHERE patient_id = ${patient.id}`);
          await db.execute(sql`DELETE FROM visits WHERE patient_id = ${patient.id}`);
          await db.execute(sql`DELETE FROM schedules WHERE patient_id = ${patient.id}`);
          await db.execute(sql`DELETE FROM medications WHERE patient_id = ${patient.id}`);
          await db.execute(sql`DELETE FROM additional_payments WHERE patient_id = ${patient.id}`);
          await db.execute(sql`DELETE FROM doctor_orders WHERE patient_id = ${patient.id}`);
          await db.execute(sql`DELETE FROM insurance_cards WHERE patient_id = ${patient.id}`);
          await db.execute(sql`DELETE FROM care_plans WHERE patient_id = ${patient.id}`);
          await db.execute(sql`DELETE FROM service_care_plans WHERE patient_id = ${patient.id}`);
          await db.execute(sql`DELETE FROM care_reports WHERE patient_id = ${patient.id}`);
          await db.execute(sql`DELETE FROM contracts WHERE patient_id = ${patient.id}`);
          await db.execute(sql`DELETE FROM monthly_receipts WHERE patient_id = ${patient.id}`);
          // Delete patient
          await storage.deletePatient(patient.id);
        }

        // Delete facility-specific data
        await db.execute(sql`DELETE FROM buildings WHERE facility_id = ${facility.id}`);
        await db.execute(sql`DELETE FROM medical_institutions WHERE facility_id = ${facility.id}`);
        await db.execute(sql`DELETE FROM care_managers WHERE facility_id = ${facility.id}`);
        await db.execute(sql`DELETE FROM special_management_definitions WHERE facility_id = ${facility.id}`);
        await db.execute(sql`DELETE FROM bonus_master WHERE facility_id = ${facility.id}`);

        // Delete all users in the facility
        const users = await storage.getUsersByFacility(facility.id);
        for (const user of users) {
          await storage.deleteUser(user.id);
        }

        // Finally delete the facility
        await storage.deleteFacility(facility.id);
      }

      // Delete company
      const success = await storage.deleteCompany(id);
      if (!success) {
        return res.status(404).json({ error: "企業が見つかりません" });
      }

      res.json({
        message: "企業を削除しました",
        deletedFacilities: allFacilities.length,
        deletedUsers: totalDeletedUsers
      });
    } catch (error) {
      console.error("Delete company error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // ========== Companies Routes (Deprecated - kept for backward compatibility) ==========

  // Get companies (system admin only)
  app.get("/api/companies", requireSystemAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const companies = await storage.getCompanies();
      res.json(companies);
    } catch (error) {
      console.error("Get companies error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Create company (system admin only)
  app.post("/api/companies", requireSystemAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const validatedData = insertCompanySchema.parse(req.body);
      const company = await storage.createCompany(validatedData);
      res.status(201).json(company);
    } catch (error) {
      console.error("Create company error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // ========== Facilities Routes ==========
  
  // Get facilities (hierarchical access)
  app.get("/api/facilities", async (req: AuthenticatedRequest, res: Response) => {
    try {
      let facilities: any[] = [];
      const userFacility = await storage.getFacility(req.user.facilityId);

      if (req.isCorporateAdmin) {
        // Corporate admin can see all facilities in their company
        if (userFacility) {
          facilities = await storage.getFacilitiesByCompany(userFacility.companyId);
        }
      } else if (userFacility?.isHeadquarters && ['admin', 'manager'].includes(req.user.role)) {
        // Headquarters admin/manager can see all facilities in their company
        facilities = await storage.getFacilitiesByCompany(userFacility.companyId);
      } else if (['admin', 'manager'].includes(req.user.role)) {
        // Facility admin/manager can see their own facility only
        facilities = userFacility ? [userFacility] : [];
      } else {
        return res.status(403).json({ error: "権限がありません" });
      }

      // Exclude SYSTEM facility from customer-facing API
      const filteredFacilities = facilities.filter(f => f.slug !== 'system');

      res.json(filteredFacilities);

    } catch (error) {
      console.error("Get facilities error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Create facility (corporate admin only)
  app.post("/api/facilities", requireAuth, requireCorporateAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const validatedData = insertFacilitySchema.parse(req.body);

      // Ensure companyId matches user's company
      const userFacility = await storage.getFacility(req.user.facilityId);
      if (!userFacility) {
        return res.status(400).json({ error: "ユーザーの施設情報が見つかりません" });
      }

      const facilityToCreate = {
        ...validatedData,
        companyId: userFacility.companyId
      };

      const facility = await storage.createFacility(facilityToCreate);
      res.status(201).json(facility);

    } catch (error) {
      console.error("Create facility error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Update facility
  app.put("/api/facilities/:id", async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userFacility = await storage.getFacility(req.user.facilityId);

      // Check permissions: corporate admin OR headquarters admin/manager
      const canUpdate = req.isCorporateAdmin ||
                       (userFacility?.isHeadquarters && ['admin', 'manager'].includes(req.user.role));

      if (!canUpdate) {
        return res.status(403).json({ error: "施設を更新する権限がありません" });
      }

      // Get the facility to update
      const existingFacility = await storage.getFacility(id);
      if (!existingFacility) {
        return res.status(404).json({ error: "施設が見つかりません" });
      }

      // Ensure facility belongs to the same company
      if (userFacility && existingFacility.companyId !== userFacility.companyId) {
        return res.status(403).json({ error: "他社の施設を更新することはできません" });
      }

      // Validate and update
      const updateData = insertFacilitySchema.partial().parse(req.body);
      const updatedFacility = await storage.updateFacility(id, updateData);

      res.json(updatedFacility);

    } catch (error) {
      console.error("Update facility error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Deactivate facility (soft delete - corporate admin only)
  app.patch("/api/facilities/:id/deactivate", requireAuth, requireCorporateAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userFacility = await storage.getFacility(req.user.facilityId);

      if (!userFacility) {
        return res.status(400).json({ error: "ユーザーの施設情報が見つかりません" });
      }

      // Get the facility to deactivate
      const existingFacility = await storage.getFacility(id);
      if (!existingFacility) {
        return res.status(404).json({ error: "施設が見つかりません" });
      }

      // Ensure facility belongs to the same company
      if (existingFacility.companyId !== userFacility.companyId) {
        return res.status(403).json({ error: "他社の施設を削除することはできません" });
      }

      // Check if already deleted
      if (!existingFacility.isActive) {
        return res.status(400).json({ error: "この施設は既に削除されています" });
      }

      // Cannot delete headquarters
      if (existingFacility.isHeadquarters) {
        return res.status(403).json({ error: "本社施設は削除できません" });
      }

      // Check if this is the last active facility in the company
      const activeFacilities = await db.query.facilities.findMany({
        where: and(
          eq(facilities.companyId, existingFacility.companyId),
          eq(facilities.isActive, true)
        )
      });

      if (activeFacilities.length === 1) {
        return res.status(403).json({ error: "企業内の最後の施設は削除できません" });
      }

      // Get warnings about related data
      const warnings: string[] = [];

      // Check active users
      const activeUsers = await db.query.users.findMany({
        where: and(
          eq(users.facilityId, id),
          eq(users.isActive, true)
        )
      });

      if (activeUsers.length > 0) {
        warnings.push(`${activeUsers.length}名のアクティブユーザーが紐づいています`);
      }

      // Check active patients
      const activePatients = await db.query.patients.findMany({
        where: and(
          eq(patients.facilityId, id),
          eq(patients.isActive, true)
        )
      });

      if (activePatients.length > 0) {
        warnings.push(`${activePatients.length}名のアクティブ利用者が紐づいています`);
      }

      // Check uncompleted schedules
      const now = new Date();
      const uncompletedSchedules = await db.query.schedules.findMany({
        where: and(
          eq(schedules.facilityId, id),
          or(
            eq(schedules.status, 'scheduled'),
            eq(schedules.status, 'in_progress')
          ),
          gte(schedules.scheduledDate, now)
        )
      });

      if (uncompletedSchedules.length > 0) {
        warnings.push(`${uncompletedSchedules.length}件の未完了スケジュールがあります`);
      }

      // Perform soft delete
      const updatedFacility = await storage.updateFacility(id, {
        isActive: false,
        deletedAt: new Date(),
        deletedBy: req.user.id
      });

      res.json({
        facility: updatedFacility,
        warnings: warnings.length > 0 ? warnings : undefined
      });

    } catch (error) {
      console.error("Deactivate facility error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // ========== Statistics Routes ==========

  // Get headquarters summary statistics
  app.get("/api/statistics/headquarters/summary", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userFacility = await storage.getFacility(req.user.facilityId);
      if (!userFacility) {
        return res.status(400).json({ error: "ユーザーの施設情報が見つかりません" });
      }

      // Only allow headquarters or corporate admin to access
      if (!userFacility.isHeadquarters && req.user.role !== 'corporate_admin') {
        return res.status(403).json({ error: "本社ユーザーまたはコーポレート管理者のみアクセス可能です" });
      }

      // Parse period parameter (default: 7d)
      const period = (req.query.period as string) || '7d';
      let daysBack = 7;

      switch (period) {
        case '30d':
          daysBack = 30;
          break;
        case '90d':
          daysBack = 90;
          break;
        case '7d':
        default:
          daysBack = 7;
          break;
      }

      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);

      // Get all facilities in the company
      const allFacilities = await db.query.facilities.findMany({
        where: and(
          eq(facilities.companyId, userFacility.companyId),
          eq(facilities.isActive, true)
        )
      });

      const facilityIds = allFacilities.map(f => f.id);

      // Count total patients across all facilities
      const totalPatientsResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(patients)
        .where(
          and(
            inArray(patients.facilityId, facilityIds),
            eq(patients.isActive, true)
          )
        );
      const totalPatients = totalPatientsResult[0]?.count || 0;

      // Count active users (staff) across all facilities
      const activeUsersResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(
          and(
            inArray(users.facilityId, facilityIds),
            eq(users.isActive, true)
          )
        );
      const activeUsers = activeUsersResult[0]?.count || 0;

      // Count upcoming visits (scheduled status within period)
      const upcomingVisitsResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schedules)
        .where(
          and(
            inArray(schedules.facilityId, facilityIds),
            eq(schedules.status, 'scheduled'),
            gte(schedules.scheduledDate, startDate),
            lte(schedules.scheduledDate, endDate)
          )
        );
      const upcomingVisits = upcomingVisitsResult[0]?.count || 0;

      // Count completed visits within period
      const completedVisitsResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schedules)
        .where(
          and(
            inArray(schedules.facilityId, facilityIds),
            eq(schedules.status, 'completed'),
            gte(schedules.scheduledDate, startDate),
            lte(schedules.scheduledDate, endDate)
          )
        );
      const completedVisits = completedVisitsResult[0]?.count || 0;

      res.json({
        totalPatients,
        activeUsers,
        upcomingVisits,
        completedVisits,
        period,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      });

    } catch (error) {
      console.error("Get headquarters summary statistics error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Get facilities details statistics
  app.get("/api/statistics/facilities/details", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userFacility = await storage.getFacility(req.user.facilityId);
      if (!userFacility) {
        return res.status(400).json({ error: "ユーザーの施設情報が見つかりません" });
      }

      // Only allow headquarters or corporate admin to access
      if (!userFacility.isHeadquarters && req.user.role !== 'corporate_admin') {
        return res.status(403).json({ error: "本社ユーザーまたはコーポレート管理者のみアクセス可能です" });
      }

      // Parse period parameter (default: 7d)
      const period = (req.query.period as string) || '7d';
      let daysBack = 7;

      switch (period) {
        case '30d':
          daysBack = 30;
          break;
        case '90d':
          daysBack = 90;
          break;
        case '7d':
        default:
          daysBack = 7;
          break;
      }

      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);

      // Get all facilities in the company
      const allFacilities = await db.query.facilities.findMany({
        where: and(
          eq(facilities.companyId, userFacility.companyId),
          eq(facilities.isActive, true)
        )
      });

      // Build statistics for each facility
      const facilitiesStats = await Promise.all(
        allFacilities.map(async (facility) => {
          // Count patients for this facility
          const patientsResult = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(patients)
            .where(
              and(
                eq(patients.facilityId, facility.id),
                eq(patients.isActive, true)
              )
            );
          const totalPatients = patientsResult[0]?.count || 0;

          // Count active users for this facility
          const usersResult = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(users)
            .where(
              and(
                eq(users.facilityId, facility.id),
                eq(users.isActive, true)
              )
            );
          const activeUsers = usersResult[0]?.count || 0;

          // Count upcoming visits for this facility
          const upcomingResult = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(schedules)
            .where(
              and(
                eq(schedules.facilityId, facility.id),
                eq(schedules.status, 'scheduled'),
                gte(schedules.scheduledDate, startDate),
                lte(schedules.scheduledDate, endDate)
              )
            );
          const upcomingVisits = upcomingResult[0]?.count || 0;

          // Count completed visits for this facility
          const completedResult = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(schedules)
            .where(
              and(
                eq(schedules.facilityId, facility.id),
                eq(schedules.status, 'completed'),
                gte(schedules.scheduledDate, startDate),
                lte(schedules.scheduledDate, endDate)
              )
            );
          const completedVisits = completedResult[0]?.count || 0;

          return {
            facilityId: facility.id,
            facilityName: facility.name,
            facilitySlug: facility.slug,
            totalPatients,
            activeUsers,
            upcomingVisits,
            completedVisits
          };
        })
      );

      res.json({
        facilities: facilitiesStats,
        period,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      });

    } catch (error) {
      console.error("Get facilities details statistics error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // ========== Users Routes ==========
  
  // Get users in facility
  app.get("/api/users", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Parse pagination parameters
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100); // Max 100 per page

      if (page < 1 || limit < 1) {
        return res.status(400).json({ error: "ページ番号と件数は1以上である必要があります" });
      }

      // Determine which users to show based on URL context and user role
      // - If accessing HQ URL: corporate_admin sees all company users, others see HQ facility users
      // - If accessing facility URL: everyone sees only that facility's users
      let result;

      // Check if current URL context is a headquarters facility
      const currentFacility = req.facility ? await storage.getFacility(req.facility.id) : null;
      const isHeadquartersUrl = currentFacility?.isHeadquarters === true;

      if (isHeadquartersUrl && req.user.role === 'corporate_admin' && req.user.accessLevel === 'corporate') {
        // Corporate admin accessing HQ URL: show all company users
        const userFacility = await storage.getFacility(req.user.facilityId);
        if (!userFacility) {
          return res.status(404).json({ error: "施設が見つかりません" });
        }
        result = await storage.getUsersByCompanyPaginated(userFacility.companyId, { page, limit });
      } else if (req.facility) {
        // Accessing specific facility URL: show only that facility's users
        result = await storage.getUsersByFacilityPaginated(req.facility.id, { page, limit });
      } else {
        // Fallback to user's own facility
        result = await storage.getUsersByFacilityPaginated(req.user.facilityId, { page, limit });
      }

      // Remove passwords from response
      const usersWithoutPasswords = result.data.map(({ password, ...user }) => user);

      res.json({
        data: usersWithoutPasswords,
        pagination: result.pagination
      });

    } catch (error) {
      console.error("Get users error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Create user (admin, manager, or corporate_admin)
  app.post("/api/users", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!['admin', 'manager', 'corporate_admin'].includes(req.user.role)) {
        return res.status(403).json({ error: "権限がありません" });
      }

      const userData = insertUserSchema.omit({ facilityId: true }).parse(req.body);

      // Hash password
      const hashedPassword = await bcrypt.hash(userData.password, 10);

      // Determine facility ID: use URL context facility if available, otherwise user's facility
      const targetFacilityId = req.facility?.id || req.user.facilityId;

      // Automatically set accessLevel to 'corporate' for corporate_admin role
      const accessLevel: 'facility' | 'corporate' = userData.role === 'corporate_admin' ? 'corporate' : 'facility';

      // Set facility ID and access level for the new user
      const userToCreate = {
        ...userData,
        password: hashedPassword,
        facilityId: targetFacilityId,
        accessLevel: accessLevel
      };
      
      const user = await storage.createUser(userToCreate);
      const { password: _, ...userWithoutPassword } = user;
      res.status(201).json(userWithoutPassword);
      
    } catch (error) {
      console.error("Create user error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Update user
  app.put("/api/users/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      
      // First, get the target user to check facility membership
      const targetUser = await storage.getUser(id);
      if (!targetUser) {
        return res.status(404).json({ error: "ユーザーが見つかりません" });
      }

      // Check multi-tenant access
      // Corporate admins can update users in any facility within their company
      // Others can only update users in their own facility or URL context facility
      const targetFacilityId = req.facility?.id || req.user.facilityId;
      const isCorporateAdmin = req.user.role === 'corporate_admin' && req.user.accessLevel === 'corporate';

      if (!isCorporateAdmin && targetUser.facilityId !== targetFacilityId) {
        return res.status(404).json({ error: "ユーザーが見つかりません" });
      }

      // Determine update permissions and validate data
      let validatedData;

      if (req.user.id === id) {
        // Self-update: limited fields only
        validatedData = updateUserSelfSchema.parse(req.body);
      } else if (['admin', 'manager', 'corporate_admin'].includes(req.user.role)) {
        // Admin/Manager/Corporate Admin updating other users
        validatedData = updateUserAdminSchema.parse(req.body);

        // Additional restriction: only admins and corporate_admins can change roles
        if (validatedData.role && !['admin', 'corporate_admin'].includes(req.user.role)) {
          return res.status(403).json({ error: "役職の変更は管理者のみ可能です" });
        }
      } else {
        // Regular users cannot update other users
        return res.status(403).json({ error: "他のユーザーの情報を変更する権限がありません。自分自身の情報のみ変更できます。" });
      }
      
      // Check for email uniqueness if email is being changed
      if ('email' in validatedData && validatedData.email) {
        const emailValue = validatedData.email as string;
        if (emailValue !== targetUser.email) {
          const existingUserByEmail = await storage.getUserByEmail(emailValue);
          if (existingUserByEmail && existingUserByEmail.id !== id) {
            return res.status(400).json({ 
              error: "このメールアドレスは既に使用されています" 
            });
          }
        }
      }

      // Check for username uniqueness if username is being changed
      if ('username' in validatedData && validatedData.username) {
        const usernameValue = validatedData.username as string;
        if (usernameValue !== targetUser.username) {
          const existingUserByUsername = await storage.getUserByUsername(usernameValue);
          if (existingUserByUsername && existingUserByUsername.id !== id) {
            return res.status(400).json({ 
              error: "このユーザー名は既に使用されています" 
            });
          }
        }
      }

      // Hash password if provided
      if (validatedData.password) {
        validatedData.password = await bcrypt.hash(validatedData.password, 10);
      }

      // Automatically set accessLevel to 'corporate' if role is changed to corporate_admin
      const dataToUpdate: any = { ...validatedData };
      if ('role' in dataToUpdate) {
        if (dataToUpdate.role === 'corporate_admin') {
          dataToUpdate.accessLevel = 'corporate';
        } else if (dataToUpdate.role && dataToUpdate.role !== 'corporate_admin') {
          // If role is changed from corporate_admin to something else, set accessLevel to 'facility'
          dataToUpdate.accessLevel = 'facility';
        }
      }

      const user = await storage.updateUser(id, dataToUpdate);
      if (!user) {
        return res.status(404).json({ error: "ユーザーが見つかりません" });
      }
      
      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
      
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "入力データが正しくありません",
          details: error.errors 
        });
      }
      console.error("Update user error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Deactivate user
  app.patch("/api/users/:id/deactivate", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      // Self-deactivation is not allowed
      if (req.user.id === id) {
        return res.status(403).json({ error: "自分自身を無効化することはできません" });
      }

      // Get target user
      const targetUser = await storage.getUser(id);
      if (!targetUser) {
        return res.status(404).json({ error: "ユーザーが見つかりません" });
      }

      // Check facility access
      const targetFacilityId = req.facility?.id || req.user.facilityId;
      const isCorporateAdmin = req.user.role === 'corporate_admin' && req.user.accessLevel === 'corporate';

      if (!isCorporateAdmin && targetUser.facilityId !== targetFacilityId) {
        return res.status(404).json({ error: "ユーザーが見つかりません" });
      }

      // Permission check
      if (req.user.role === 'nurse') {
        return res.status(403).json({ error: "権限がありません" });
      }

      // Manager can only deactivate nurses
      if (req.user.role === 'manager' && targetUser.role !== 'nurse') {
        return res.status(403).json({ error: "主任は看護師のみ無効化できます" });
      }

      // Prevent deactivating the last admin
      if (targetUser.role === 'admin') {
        const admins = await storage.getUsersByFacility(req.user.facilityId);
        const activeAdmins = admins.filter(u => u.role === 'admin' && u.isActive);
        if (activeAdmins.length === 1) {
          return res.status(403).json({ error: "この施設の最後の管理者は無効化できません" });
        }
      }

      // Deactivate user
      const updatedUser = await storage.updateUser(id, { isActive: false });
      if (!updatedUser) {
        return res.status(404).json({ error: "ユーザーが見つかりません" });
      }

      const { password: _, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);

    } catch (error) {
      console.error("Deactivate user error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Activate user
  app.patch("/api/users/:id/activate", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      // Get target user
      const targetUser = await storage.getUser(id);
      if (!targetUser) {
        return res.status(404).json({ error: "ユーザーが見つかりません" });
      }

      // Check facility access
      const targetFacilityId = req.facility?.id || req.user.facilityId;
      const isCorporateAdmin = req.user.role === 'corporate_admin' && req.user.accessLevel === 'corporate';

      if (!isCorporateAdmin && targetUser.facilityId !== targetFacilityId) {
        return res.status(404).json({ error: "ユーザーが見つかりません" });
      }

      // Permission check
      if (req.user.role === 'nurse') {
        return res.status(403).json({ error: "権限がありません" });
      }

      // Manager can only activate nurses
      if (req.user.role === 'manager' && targetUser.role !== 'nurse') {
        return res.status(403).json({ error: "主任は看護師のみ有効化できます" });
      }

      // Activate user
      const updatedUser = await storage.updateUser(id, { isActive: true });
      if (!updatedUser) {
        return res.status(404).json({ error: "ユーザーが見つかりません" });
      }

      const { password: _, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);

    } catch (error) {
      console.error("Activate user error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Reset user password
  app.post("/api/users/:id/reset-password", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      // Get target user
      const targetUser = await storage.getUser(id);
      if (!targetUser) {
        return res.status(404).json({ error: "ユーザーが見つかりません" });
      }

      // Check facility access
      const targetFacilityId = req.facility?.id || req.user.facilityId;
      const isCorporateAdmin = req.user.role === 'corporate_admin' && req.user.accessLevel === 'corporate';

      if (!isCorporateAdmin && targetUser.facilityId !== targetFacilityId) {
        return res.status(404).json({ error: "ユーザーが見つかりません" });
      }

      // Permission check
      if (req.user.role === 'nurse') {
        return res.status(403).json({ error: "権限がありません" });
      }

      // Manager can only reset passwords for nurses
      if (req.user.role === 'manager' && targetUser.role !== 'nurse') {
        return res.status(403).json({ error: "主任は看護師のみパスワードリセットできます" });
      }

      // Generate temporary password (12 characters: alphanumeric)
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
      let temporaryPassword = '';
      for (let i = 0; i < 12; i++) {
        temporaryPassword += chars.charAt(Math.floor(Math.random() * chars.length));
      }

      // Hash the temporary password
      const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

      // Update user password and set mustChangePassword flag
      await storage.updateUser(id, {
        password: hashedPassword,
        mustChangePassword: true
      });

      // Return temporary password (only shown once)
      res.json({ temporaryPassword });

    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Change password on first login (after temporary password)
  app.post("/api/auth/change-password-first-login", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { newPassword } = req.body;

      if (!newPassword || typeof newPassword !== 'string') {
        return res.status(400).json({ error: "新しいパスワードが必要です" });
      }

      // Validate password strength
      if (newPassword.length < 8) {
        return res.status(400).json({ error: "パスワードは8文字以上である必要があります" });
      }

      // Check if user must change password
      const user = await storage.getUser(req.user.id);
      if (!user) {
        return res.status(404).json({ error: "ユーザーが見つかりません" });
      }

      if (!user.mustChangePassword) {
        return res.status(400).json({ error: "パスワード変更は不要です" });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update password and clear mustChangePassword flag
      await storage.updateUser(req.user.id, {
        password: hashedPassword,
        mustChangePassword: false
      });

      res.json({ success: true, message: "パスワードを変更しました" });

    } catch (error) {
      console.error("Change password first login error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // ========== Patients Routes ==========
  
  // Get patients in facility
  app.get("/api/patients", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Parse pagination parameters
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100); // Max 100 per page

      if (page < 1 || limit < 1) {
        return res.status(400).json({ error: "ページ番号と件数は1以上である必要があります" });
      }

      // Determine which patients to show based on URL context and user role
      // - If accessing HQ URL: corporate_admin sees all company patients, others see HQ facility patients
      // - If accessing facility URL: everyone sees only that facility's patients
      let result;

      // Check if current URL context is a headquarters facility
      const currentFacility = req.facility ? await storage.getFacility(req.facility.id) : null;
      const isHeadquartersUrl = currentFacility?.isHeadquarters === true;

      // Check for isCritical filter
      const isCritical = req.query.isCritical === 'true';

      if (isHeadquartersUrl && req.user.role === 'corporate_admin' && req.user.accessLevel === 'corporate') {
        // Corporate admin accessing HQ URL: show all company patients
        const userFacility = await storage.getFacility(req.user.facilityId);
        if (!userFacility) {
          return res.status(404).json({ error: "施設が見つかりません" });
        }

        if (isCritical) {
          // Get all company critical patients
          const criticalPatients = await db.query.patients.findMany({
            where: and(
              eq(patients.isCritical, true),
              eq(patients.isActive, true)
            ),
            orderBy: [desc(patients.updatedAt)],
          });

          // Filter by company
          const facilitiesInCompany = await db.query.facilities.findMany({
            where: eq(facilities.companyId, userFacility.companyId)
          });
          const facilityIds = facilitiesInCompany.map(f => f.id);
          const companyCriticalPatients = criticalPatients.filter(p => facilityIds.includes(p.facilityId));

          res.json({
            data: companyCriticalPatients,
            pagination: {
              page: 1,
              limit: companyCriticalPatients.length,
              total: companyCriticalPatients.length,
              totalPages: 1,
              hasNext: false,
              hasPrev: false,
            }
          });
        } else {
          result = await storage.getPatientsByCompanyPaginated(userFacility.companyId, { page, limit });
          res.json(result);
        }
      } else if (req.facility) {
        // Accessing specific facility URL: show only that facility's patients
        if (isCritical) {
          const criticalPatients = await db.query.patients.findMany({
            where: and(
              eq(patients.facilityId, req.facility.id),
              eq(patients.isCritical, true),
              eq(patients.isActive, true)
            ),
            orderBy: [desc(patients.updatedAt)],
          });

          res.json({
            data: criticalPatients,
            pagination: {
              page: 1,
              limit: criticalPatients.length,
              total: criticalPatients.length,
              totalPages: 1,
              hasNext: false,
              hasPrev: false,
            }
          });
        } else {
          result = await storage.getPatientsByFacilityPaginated(req.facility.id, { page, limit });
          res.json(result);
        }
      } else {
        // Fallback to user's own facility
        const targetFacilityId = req.user.facilityId;

        if (isCritical) {
          const criticalPatients = await db.query.patients.findMany({
            where: and(
              eq(patients.facilityId, targetFacilityId),
              eq(patients.isCritical, true),
              eq(patients.isActive, true)
            ),
            orderBy: [desc(patients.updatedAt)],
          });

          res.json({
            data: criticalPatients,
            pagination: {
              page: 1,
              limit: criticalPatients.length,
              total: criticalPatients.length,
              totalPages: 1,
              hasNext: false,
              hasPrev: false,
            }
          });
        } else {
          result = await storage.getPatientsByFacilityPaginated(targetFacilityId, { page, limit });
          res.json(result);
        }
      }

    } catch (error) {
      console.error("Get patients error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Get patient by ID
  app.get("/api/patients/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const patient = await storage.getPatient(id);

      if (!patient) {
        return res.status(404).json({ error: "患者が見つかりません" });
      }

      // Check access permission based on URL context and user role
      const currentFacility = req.facility ? await storage.getFacility(req.facility.id) : null;
      const isHeadquartersUrl = currentFacility?.isHeadquarters === true;

      if (isHeadquartersUrl && req.user.role === 'corporate_admin' && req.user.accessLevel === 'corporate') {
        // Corporate admin at HQ URL: can access all company patients
        const userFacility = await storage.getFacility(req.user.facilityId);
        if (!userFacility) {
          return res.status(404).json({ error: "施設が見つかりません" });
        }

        // Get patient's facility to check company
        const patientFacility = await storage.getFacility(patient.facilityId);
        if (!patientFacility || patientFacility.companyId !== userFacility.companyId) {
          return res.status(404).json({ error: "患者が見つかりません" });
        }
      } else if (req.facility) {
        // Accessing specific facility URL: can only access that facility's patients
        if (patient.facilityId !== req.facility.id) {
          return res.status(404).json({ error: "患者が見つかりません" });
        }
      } else {
        // Fallback: can only access own facility's patients
        if (patient.facilityId !== req.user.facilityId) {
          return res.status(404).json({ error: "患者が見つかりません" });
        }
      }

      res.json(patient);

    } catch (error) {
      console.error("Get patient error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Create patient
  app.post("/api/patients", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Check if accessing from headquarters URL - headquarters should not create patients
      const currentFacility = req.facility ? await storage.getFacility(req.facility.id) : null;
      const isHeadquartersUrl = currentFacility?.isHeadquarters === true;

      if (isHeadquartersUrl) {
        return res.status(403).json({ error: "本社システムでは患者の登録はできません。各施設で登録してください。" });
      }

      const patientData = insertPatientSchema.parse(req.body);

      // Convert empty strings to null for foreign key fields
      const cleanedData = {
        ...patientData,
        medicalInstitutionId: patientData.medicalInstitutionId === "" ? null : patientData.medicalInstitutionId,
        careManagerId: patientData.careManagerId === "" ? null : patientData.careManagerId,
        buildingId: patientData.buildingId === "" ? null : patientData.buildingId,
      };

      // Set facility ID from URL context if available, otherwise user's facility
      const targetFacilityId = req.facility?.id || req.user.facilityId;
      const patientToCreate = {
        ...cleanedData,
        facilityId: targetFacilityId
      };

      const patient = await storage.createPatient(patientToCreate);
      res.status(201).json(patient);

    } catch (error) {
      console.error("Create patient error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Update patient
  app.put("/api/patients/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      // Check if accessing from headquarters URL - headquarters should not edit patients
      const currentFacility = req.facility ? await storage.getFacility(req.facility.id) : null;
      const isHeadquartersUrl = currentFacility?.isHeadquarters === true;

      if (isHeadquartersUrl) {
        return res.status(403).json({ error: "本社システムでは患者の編集はできません。各施設で編集してください。" });
      }

      // Check if patient belongs to the facility (use URL context if available)
      const targetFacilityId = req.facility?.id || req.user.facilityId;
      const existingPatient = await storage.getPatient(id);
      if (!existingPatient || existingPatient.facilityId !== targetFacilityId) {
        return res.status(404).json({ error: "患者が見つかりません" });
      }

      // Validate update data with Zod schema
      const validatedData = updatePatientSchema.parse(req.body);

      // Convert empty strings to null for foreign key fields
      const cleanedData = {
        ...validatedData,
        medicalInstitutionId: validatedData.medicalInstitutionId === "" ? null : validatedData.medicalInstitutionId,
        careManagerId: validatedData.careManagerId === "" ? null : validatedData.careManagerId,
        buildingId: validatedData.buildingId === "" ? null : validatedData.buildingId,
      };

      const patient = await storage.updatePatient(id, cleanedData);
      if (!patient) {
        return res.status(404).json({ error: "患者が見つかりません" });
      }

      res.json(patient);

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "入力データが正しくありません",
          details: error.errors
        });
      }
      console.error("Update patient error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Delete patient
  app.delete("/api/patients/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      // Only admin and manager can delete patients
      if (!['admin', 'manager'].includes(req.user.role)) {
        return res.status(403).json({ error: "患者の削除は管理者のみ可能です" });
      }

      // Check if accessing from headquarters URL - headquarters should not delete patients
      const currentFacility = req.facility ? await storage.getFacility(req.facility.id) : null;
      const isHeadquartersUrl = currentFacility?.isHeadquarters === true;

      if (isHeadquartersUrl) {
        return res.status(403).json({ error: "本社システムでは患者の削除はできません。各施設で削除してください。" });
      }

      // Check if patient belongs to the facility (use URL context if available)
      const targetFacilityId = req.facility?.id || req.user.facilityId;
      const existingPatient = await storage.getPatient(id);
      if (!existingPatient || existingPatient.facilityId !== targetFacilityId) {
        return res.status(404).json({ error: "患者が見つかりません" });
      }

      // Delete all related data (order matters due to foreign key constraints)
      // First delete bonus_calculation_history (references nursing_records)
      await db.execute(sql`DELETE FROM bonus_calculation_history WHERE nursing_record_id IN (SELECT id FROM nursing_records WHERE patient_id = ${id})`);
      // Then delete nursing_records
      await db.execute(sql`DELETE FROM nursing_records WHERE patient_id = ${id}`);
      await db.execute(sql`DELETE FROM visits WHERE patient_id = ${id}`);
      await db.execute(sql`DELETE FROM schedules WHERE patient_id = ${id}`);
      await db.execute(sql`DELETE FROM medications WHERE patient_id = ${id}`);
      await db.execute(sql`DELETE FROM additional_payments WHERE patient_id = ${id}`);
      await db.execute(sql`DELETE FROM doctor_orders WHERE patient_id = ${id}`);
      await db.execute(sql`DELETE FROM insurance_cards WHERE patient_id = ${id}`);
      await db.execute(sql`DELETE FROM care_plans WHERE patient_id = ${id}`);
      await db.execute(sql`DELETE FROM service_care_plans WHERE patient_id = ${id}`);
      await db.execute(sql`DELETE FROM care_reports WHERE patient_id = ${id}`);
      await db.execute(sql`DELETE FROM contracts WHERE patient_id = ${id}`);
      await db.execute(sql`DELETE FROM monthly_receipts WHERE patient_id = ${id}`);

      // Delete patient
      const deleted = await storage.deletePatient(id);
      if (!deleted) {
        return res.status(404).json({ error: "患者の削除に失敗しました" });
      }

      res.json({ message: "患者を削除しました" });

    } catch (error) {
      console.error("Delete patient error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // ========== Visits Routes ==========
  
  // Get visits (all, by patient, or by nurse)
  app.get("/api/visits", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { patientId, nurseId } = req.query;

      // Parse pagination parameters
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100); // Max 100 per page

      if (page < 1 || limit < 1) {
        return res.status(400).json({ error: "ページ番号と件数は1以上である必要があります" });
      }

      // Determine facility ID: use URL context facility if available, otherwise user's facility
      const targetFacilityId = req.facility?.id || req.user.facilityId;

      let result;
      if (patientId) {
        result = await storage.getVisitsByPatientPaginated(patientId as string, targetFacilityId, { page, limit });
      } else if (nurseId) {
        result = await storage.getVisitsByNursePaginated(nurseId as string, targetFacilityId, { page, limit });
      } else {
        result = await storage.getVisitsByFacilityPaginated(targetFacilityId, { page, limit });
      }

      res.json(result);

    } catch (error) {
      console.error("Get visits error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Get upcoming visits
  app.get("/api/visits/upcoming", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Determine facility ID: use URL context facility if available, otherwise user's facility
      const targetFacilityId = req.facility?.id || req.user.facilityId;
      const visits = await storage.getUpcomingVisits(targetFacilityId);
      res.json(visits);
      
    } catch (error) {
      console.error("Get upcoming visits error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Create visit
  app.post("/api/visits", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const visitData = insertVisitSchema.parse(req.body);
      
      // Set facility ID from current user
      const visitToCreate = {
        ...visitData,
        facilityId: req.user.facilityId
      };
      
      const visit = await storage.createVisit(visitToCreate);
      res.status(201).json(visit);
      
    } catch (error) {
      console.error("Create visit error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Update visit
  app.put("/api/visits/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      
      // Check if visit belongs to user's facility
      const existingVisit = await storage.getVisit(id);
      if (!existingVisit || existingVisit.facilityId !== req.user.facilityId) {
        return res.status(404).json({ error: "訪問予定が見つかりません" });
      }
      
      // Validate update data with Zod schema
      const validatedData = updateVisitSchema.parse(req.body);
      
      // Cross-tenant reference validation: ensure patientId and nurseId belong to same facility
      if (validatedData.patientId) {
        const patient = await storage.getPatient(validatedData.patientId);
        if (!patient || patient.facilityId !== req.user.facilityId) {
          return res.status(400).json({ error: "指定された患者が見つかりません" });
        }
      }
      
      if (validatedData.nurseId) {
        const nurse = await storage.getUser(validatedData.nurseId);
        if (!nurse || nurse.facilityId !== req.user.facilityId) {
          return res.status(400).json({ error: "指定された看護師が見つかりません" });
        }
      }
      
      const visit = await storage.updateVisit(id, validatedData);
      if (!visit) {
        return res.status(404).json({ error: "訪問予定が見つかりません" });
      }
      
      res.json(visit);
      
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "入力データが正しくありません",
          details: error.errors 
        });
      }
      console.error("Update visit error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // ========== Schedules Routes ==========

  // Get schedules
  app.get("/api/schedules", requireAuth, checkSubdomainAccess, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Determine facility ID: use URL context facility if available, otherwise user's facility
      const facilityId = req.facility?.id || req.user.facilityId;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;

      // Optional filters
      const nurseId = req.query.nurseId as string | undefined;
      const patientId = req.query.patientId as string | undefined;
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;

      const result = await storage.getSchedules(facilityId, {
        page,
        limit,
        nurseId,
        patientId,
        startDate,
        endDate
      });

      res.json(result);
    } catch (error) {
      console.error("Get schedules error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Get schedules without records - MUST be before /:id route
  app.get("/api/schedules/without-records", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Determine facility ID: use URL context facility if available, otherwise user's facility
      const facilityId = req.facility?.id || req.user.facilityId;
      const { startDate, endDate, nurseId } = req.query;

      // Build query conditions
      const whereConditions = [
        eq(schedules.facilityId, facilityId),
        // Search for past schedules (not just "completed" status)
        // Exclude cancelled schedules
        not(inArray(schedules.status, ["cancelled"] as const)),
      ];

      // Filter by nurse if specified
      if (nurseId && typeof nurseId === 'string') {
        whereConditions.push(eq(schedules.nurseId, nurseId));
      }

      const today = new Date();
      today.setHours(23, 59, 59, 999); // End of today

      if (startDate && typeof startDate === 'string') {
        whereConditions.push(gte(schedules.scheduledDate, new Date(startDate)));
      }

      if (endDate && typeof endDate === 'string') {
        // Use user-specified endDate, but limit to today if future date is specified
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999); // End of the specified day

        const effectiveEndDate = endDateTime > today ? today : endDateTime;
        whereConditions.push(lte(schedules.scheduledDate, effectiveEndDate));
      } else {
        // If no endDate specified, only show past schedules (up to today)
        whereConditions.push(lte(schedules.scheduledDate, today));
      }

      // Get all past schedules in the date range (excluding cancelled/no-show/refused)
      const allSchedules = await db.query.schedules.findMany({
        where: and(...whereConditions),
        with: {
          patient: {
            columns: {
              id: true,
              lastName: true,
              firstName: true,
            }
          },
          nurse: {
            columns: {
              id: true,
              fullName: true,
            }
          }
        },
        orderBy: (schedules, { desc }) => [desc(schedules.scheduledDate)]
      });

      // Get all nursing records with scheduleId
      const schedulesWithRecords = await db.query.nursingRecords.findMany({
        where: and(
          eq(nursingRecords.facilityId, facilityId),
          isNotNull(nursingRecords.scheduleId)
        ),
        columns: {
          scheduleId: true,
        }
      });

      // Create a Set of schedule IDs that have records
      const recordedScheduleIds = new Set(
        schedulesWithRecords.map(record => record.scheduleId).filter(Boolean)
      );

      // Filter schedules that don't have records
      const schedulesWithoutRecords = allSchedules.filter(
        schedule => !recordedScheduleIds.has(schedule.id)
      );

      res.json(schedulesWithoutRecords);
    } catch (error) {
      console.error("Get schedules without records error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Get single schedule
  app.get("/api/schedules/:id", requireAuth, checkSubdomainAccess, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const schedule = await storage.getScheduleById(id);

      if (!schedule) {
        return res.status(404).json({ error: "スケジュールが見つかりません" });
      }

      // Check facility access
      if (schedule.facilityId !== req.user.facilityId && !req.isCorporateAdmin) {
        return res.status(403).json({ error: "アクセス権限がありません" });
      }

      res.json(schedule);
    } catch (error) {
      console.error("Get schedule error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Get nursing record by schedule ID
  app.get("/api/schedules/:id/nursing-record", requireAuth, checkSubdomainAccess, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      
      // まずスケジュールを取得して、そのスケジュールのfacilityIdを確認
      const schedule = await db.query.schedules.findFirst({
        where: eq(schedules.id, id),
      });
      
      if (!schedule) {
        console.log(`[ScheduleRecordAPI] Schedule not found: ${id}`);
        return res.status(404).json({ error: "スケジュールが見つかりません" });
      }
      
      // セキュリティチェック: ユーザーがこのスケジュールの施設にアクセスできるか確認
      const scheduleFacilityId = schedule.facilityId;
      const userFacilityId = req.facility?.id || req.user.facilityId;
      const accessibleFacilities = req.accessibleFacilities || [req.user.facilityId];
      
      // ログ出力（本番環境でのデバッグ用）
      console.log(`[ScheduleRecordAPI] Schedule ID: ${id}`);
      console.log(`[ScheduleRecordAPI] Schedule facilityId: ${scheduleFacilityId}`);
      console.log(`[ScheduleRecordAPI] req.facility?.id: ${req.facility?.id || 'null'}`);
      console.log(`[ScheduleRecordAPI] req.user.facilityId: ${req.user.facilityId}`);
      console.log(`[ScheduleRecordAPI] accessibleFacilities: ${JSON.stringify(accessibleFacilities)}`);
      console.log(`[ScheduleRecordAPI] isCorporateAdmin: ${req.isCorporateAdmin || false}`);
      
      // ユーザーがスケジュールの施設にアクセスできるか確認
      // 1. スケジュールのfacilityIdがユーザーのアクセス可能な施設リストに含まれているか
      // 2. または、コーポレート管理者の場合
      const hasAccess = accessibleFacilities.includes(scheduleFacilityId) || 
                       (req.isCorporateAdmin && req.user.accessLevel === 'corporate');
      
      console.log(`[ScheduleRecordAPI] hasAccess: ${hasAccess}`);
      
      if (!hasAccess) {
        console.warn(`[ScheduleRecordAPI] Access denied: User from facility ${userFacilityId} attempting to access schedule from facility ${scheduleFacilityId}`);
        return res.status(403).json({ error: "このスケジュールへのアクセス権限がありません" });
      }

      // スケジュールのfacilityIdを使用して訪問記録を検索
      // これにより、req.facility?.idやreq.user.facilityIdがスケジュールのfacilityIdと異なる場合でも
      // 正しく記録を見つけることができる
      const record = await db.query.nursingRecords.findFirst({
        where: and(
          eq(nursingRecords.scheduleId, id),
          eq(nursingRecords.facilityId, scheduleFacilityId),
          isNull(nursingRecords.deletedAt)
        ),
      });

      if (!record) {
        console.log(`[ScheduleRecordAPI] Record not found for schedule ${id} with facilityId ${scheduleFacilityId}`);
        // Return 200 with hasRecord: false instead of 404
        return res.json({ hasRecord: false });
      }

      console.log(`[ScheduleRecordAPI] Record found: ${record.id}`);
      res.json({ hasRecord: true, record });
    } catch (error) {
      console.error("Get nursing record by schedule error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Create schedule
  app.post("/api/schedules", requireAuth, checkSubdomainAccess, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const validatedData = insertScheduleSchema.parse(req.body);
      // Determine facility ID: use URL context facility if available, otherwise user's facility
      const facilityId = req.facility?.id || req.user.facilityId;

      const newSchedule = await storage.createSchedule({
        ...validatedData,
        facilityId,
      });

      res.status(201).json(newSchedule);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Zodバリデーションエラー:", error.errors); // 詳細ログ
        return res.status(400).json({
          error: "入力データが不正です",
          details: error.errors
        });
      }
      console.error("Create schedule error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Update schedule
  app.put("/api/schedules/:id", requireAuth, checkSubdomainAccess, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const validatedData = updateScheduleSchema.parse(req.body);

      // Check if schedule exists and user has access
      const existingSchedule = await storage.getScheduleById(id);
      if (!existingSchedule) {
        return res.status(404).json({ error: "スケジュールが見つかりません" });
      }

      if (existingSchedule.facilityId !== req.user.facilityId && !req.isCorporateAdmin) {
        return res.status(403).json({ error: "アクセス権限がありません" });
      }

      const updatedSchedule = await storage.updateSchedule(id, validatedData);
      res.json(updatedSchedule);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "入力データが不正です",
          details: error.errors
        });
      }
      console.error("Update schedule error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Update schedule status
  app.patch("/api/schedules/:id/status", requireAuth, checkSubdomainAccess, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      // Validate status
      if (!["scheduled", "in_progress", "completed", "cancelled"].includes(status)) {
        return res.status(400).json({ error: "無効なステータスです" });
      }

      // Check if schedule exists and user has access
      const existingSchedule = await storage.getScheduleById(id);
      if (!existingSchedule) {
        return res.status(404).json({ error: "スケジュールが見つかりません" });
      }

      if (existingSchedule.facilityId !== req.user.facilityId && !req.isCorporateAdmin) {
        return res.status(403).json({ error: "アクセス権限がありません" });
      }

      // Update status with timestamps
      const updateData: any = { status };
      const now = new Date();

      if (status === "in_progress" && !existingSchedule.actualStartTime) {
        updateData.actualStartTime = now;
      }

      if (status === "completed" && !existingSchedule.actualEndTime) {
        updateData.actualEndTime = now;
      }

      const updatedSchedule = await storage.updateSchedule(id, updateData);
      res.json(updatedSchedule);
    } catch (error) {
      console.error("Update schedule status error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Generate recurring schedules
  app.post("/api/schedules/generate-recurring", requireAuth, checkSubdomainAccess, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        patientId,
        nurseId,
        demoStaffName,
        startTime, // HH:MM format
        endTime, // HH:MM format
        duration,
        purpose,
        recurrencePattern, // "weekly", "biweekly", "monthly"
        recurrenceDays, // Array of day numbers [0-6] where 0=Sunday
        startDate, // YYYY-MM-DD
        endDate, // YYYY-MM-DD
        visitType,
        notes
      } = req.body;

      const facilityId = req.user.facilityId;

      // Validate required fields
      if (!patientId || !startTime || !endTime || !purpose || !recurrencePattern || !recurrenceDays || !startDate || !endDate) {
        return res.status(400).json({ error: "必須フィールドが不足しています" });
      }

      // Validate dates
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (start > end) {
        return res.status(400).json({ error: "開始日は終了日より前である必要があります" });
      }

      // Calculate date difference limit (e.g., max 6 months)
      const maxDays = 180;
      const daysDiff = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff > maxDays) {
        return res.status(400).json({ error: `生成期間は最大${maxDays}日までです` });
      }

      // Generate parent schedule ID
      const parentScheduleId = crypto.randomUUID();

      // Generate schedule dates based on pattern
      const scheduleDates: Date[] = [];
      const currentDate = new Date(start);

      while (currentDate <= end) {
        const dayOfWeek = currentDate.getDay(); // 0=Sunday, 6=Saturday

        // Check if this day matches recurrence pattern
        if (recurrenceDays.includes(dayOfWeek)) {
          scheduleDates.push(new Date(currentDate));
        }

        // Increment based on pattern
        if (recurrencePattern === "weekly") {
          currentDate.setDate(currentDate.getDate() + 1);
        } else if (recurrencePattern === "biweekly") {
          // For biweekly, we still check daily but track weeks
          currentDate.setDate(currentDate.getDate() + 1);
        } else if (recurrencePattern === "monthly") {
          currentDate.setDate(currentDate.getDate() + 1);
        } else {
          currentDate.setDate(currentDate.getDate() + 1);
        }
      }

      // Apply biweekly filter (every other week)
      let filteredDates = scheduleDates;
      if (recurrencePattern === "biweekly") {
        filteredDates = scheduleDates.filter((date, index) => {
          const weekNumber = Math.floor((date.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 7));
          return weekNumber % 2 === 0;
        });
      }

      // Limit number of schedules
      const maxSchedules = 100;
      if (filteredDates.length > maxSchedules) {
        return res.status(400).json({
          error: `生成されるスケジュール数が多すぎます（${filteredDates.length}件）。最大${maxSchedules}件までです。期間を短縮してください。`
        });
      }

      // Create schedules
      const createdSchedules = [];
      for (const scheduleDate of filteredDates) {
        // Combine date with time
        // Note: Time is interpreted as JST, so we need to subtract 9 hours to store as UTC
        const [startHour, startMinute] = startTime.split(':').map(Number);
        const [endHour, endMinute] = endTime.split(':').map(Number);

        const scheduledStartTime = new Date(scheduleDate);
        scheduledStartTime.setUTCHours(startHour - 9, startMinute, 0, 0);

        const scheduledEndTime = new Date(scheduleDate);
        scheduledEndTime.setUTCHours(endHour - 9, endMinute, 0, 0);

        const scheduleData = {
          facilityId,
          patientId,
          nurseId: nurseId || null,
          demoStaffName: demoStaffName || null,
          scheduledDate: scheduleDate,
          scheduledStartTime,
          scheduledEndTime,
          duration: duration || 60,
          purpose,
          status: "scheduled" as const,
          isRecurring: true,
          recurrencePattern: (recurrencePattern === "weekly" ? "weekly_monday" :
                           recurrencePattern === "biweekly" ? "biweekly" :
                           recurrencePattern === "monthly" ? "monthly" : "none") as "weekly_monday" | "biweekly" | "monthly" | "none",
          recurrenceEndDate: endDate,
          recurrenceDays: JSON.stringify(recurrenceDays),
          parentScheduleId,
          visitType: visitType || null,
          notes: notes || null,
        };

        const newSchedule = await storage.createSchedule(scheduleData);
        createdSchedules.push(newSchedule);
      }

      res.status(201).json({
        message: `${createdSchedules.length}件のスケジュールを作成しました`,
        count: createdSchedules.length,
        parentScheduleId,
        schedules: createdSchedules
      });
    } catch (error) {
      console.error("Generate recurring schedules error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Bulk update recurring schedules
  app.put("/api/schedules/recurring/:parentId", requireAuth, checkSubdomainAccess, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { parentId } = req.params;
      const updateData = req.body;

      // Find all schedules with this parentScheduleId
      const recurringSchedules = await db
        .select()
        .from(schedules)
        .where(and(
          eq(schedules.parentScheduleId, parentId),
          eq(schedules.facilityId, req.user.facilityId)
        ));

      if (recurringSchedules.length === 0) {
        return res.status(404).json({ error: "繰り返しスケジュールが見つかりません" });
      }

      // Update all schedules in the series
      const updatedSchedules = [];
      for (const schedule of recurringSchedules) {
        const updated = await storage.updateSchedule(schedule.id, updateData);
        updatedSchedules.push(updated);
      }

      res.json({
        message: `${updatedSchedules.length}件のスケジュールを更新しました`,
        count: updatedSchedules.length,
        schedules: updatedSchedules
      });
    } catch (error) {
      console.error("Bulk update recurring schedules error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Bulk delete recurring schedules
  app.delete("/api/schedules/recurring/:parentId", requireAuth, checkSubdomainAccess, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { parentId } = req.params;

      // Find all schedules with this parentScheduleId
      const recurringSchedules = await db
        .select()
        .from(schedules)
        .where(and(
          eq(schedules.parentScheduleId, parentId),
          eq(schedules.facilityId, req.user.facilityId)
        ));

      if (recurringSchedules.length === 0) {
        return res.status(404).json({ error: "繰り返しスケジュールが見つかりません" });
      }

      // Delete all schedules in the series
      for (const schedule of recurringSchedules) {
        await storage.deleteSchedule(schedule.id);
      }

      res.json({
        message: `${recurringSchedules.length}件のスケジュールを削除しました`,
        count: recurringSchedules.length
      });
    } catch (error) {
      console.error("Bulk delete recurring schedules error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Delete schedule
  app.delete("/api/schedules/:id", requireAuth, checkSubdomainAccess, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const deleteRecords = req.query.deleteRecords === 'true';

      // Check if schedule exists and user has access
      const existingSchedule = await storage.getScheduleById(id);
      if (!existingSchedule) {
        return res.status(404).json({ error: "スケジュールが見つかりません" });
      }

      if (existingSchedule.facilityId !== req.user.facilityId && !req.isCorporateAdmin) {
        return res.status(403).json({ error: "アクセス権限がありません" });
      }

      // 管理者チェック: deleteRecordsオプションは管理者のみ使用可能
      if (deleteRecords && req.user.role !== 'admin') {
        return res.status(403).json({ error: "この操作は管理者のみ実行できます" });
      }

      await storage.deleteSchedule(id, { deleteRecords });
      res.status(204).send();
    } catch (error) {
      console.error("Delete schedule error:", error);
      if (error instanceof Error && error.message.includes("看護記録が存在するため削除できません")) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Generate recurring schedules
  app.post("/api/schedules/:id/generate-recurring", requireAuth, checkSubdomainAccess, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.user.facilityId;

      // Get the master schedule
      const masterSchedule = await storage.getScheduleById(id);
      if (!masterSchedule) {
        return res.status(404).json({ error: "スケジュールが見つかりません" });
      }

      if (masterSchedule.facilityId !== facilityId && !req.isCorporateAdmin) {
        return res.status(403).json({ error: "アクセス権限がありません" });
      }

      if (!masterSchedule.isRecurring || !masterSchedule.recurrencePattern || masterSchedule.recurrencePattern === 'none') {
        return res.status(400).json({ error: "繰り返しスケジュールではありません" });
      }

      // Calculate end date (default to 3 months if not specified)
      const endDate = masterSchedule.recurrenceEndDate
        ? new Date(masterSchedule.recurrenceEndDate)
        : new Date(new Date().setMonth(new Date().getMonth() + 3));

      const generatedSchedules = [];
      let currentDate = new Date(masterSchedule.scheduledDate);

      // Generate schedules based on pattern
      while (currentDate <= endDate) {
        // Skip the original date
        if (currentDate.getTime() !== new Date(masterSchedule.scheduledDate).getTime()) {
          const scheduledStartTime = new Date(currentDate);
          scheduledStartTime.setHours(new Date(masterSchedule.scheduledStartTime).getHours());
          scheduledStartTime.setMinutes(new Date(masterSchedule.scheduledStartTime).getMinutes());

          const scheduledEndTime = new Date(currentDate);
          scheduledEndTime.setHours(new Date(masterSchedule.scheduledEndTime).getHours());
          scheduledEndTime.setMinutes(new Date(masterSchedule.scheduledEndTime).getMinutes());

          const newSchedule = await storage.createSchedule({
            facilityId: masterSchedule.facilityId,
            patientId: masterSchedule.patientId,
            nurseId: masterSchedule.nurseId,
            scheduledDate: currentDate,
            scheduledStartTime,
            scheduledEndTime,
            duration: masterSchedule.duration,
            purpose: masterSchedule.purpose,
            visitType: masterSchedule.visitType,
            notes: masterSchedule.notes,
            isRecurring: false, // Generated schedules are not recurring themselves
            recurrencePattern: 'none',
          });

          generatedSchedules.push(newSchedule);
        }

        // Move to next occurrence based on pattern
        switch (masterSchedule.recurrencePattern) {
          case 'daily':
            currentDate.setDate(currentDate.getDate() + 1);
            break;
          case 'weekly_monday':
          case 'weekly_tuesday':
          case 'weekly_wednesday':
          case 'weekly_thursday':
          case 'weekly_friday':
          case 'weekly_saturday':
          case 'weekly_sunday':
            currentDate.setDate(currentDate.getDate() + 7);
            break;
          case 'biweekly':
            currentDate.setDate(currentDate.getDate() + 14);
            break;
          case 'monthly':
            currentDate.setMonth(currentDate.getMonth() + 1);
            break;
          default:
            // Unknown pattern, stop
            break;
        }
      }

      res.json({
        message: `${generatedSchedules.length}件のスケジュールを生成しました`,
        count: generatedSchedules.length,
        schedules: generatedSchedules
      });
    } catch (error) {
      console.error("Generate recurring schedules error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // ========== Nursing Records Routes ==========

  // Get nursing records
  app.get("/api/nursing-records", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { patientId, nurseId } = req.query;

      // Parse pagination parameters
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100); // Max 100 per page

      if (page < 1 || limit < 1) {
        return res.status(400).json({ error: "ページ番号と件数は1以上である必要があります" });
      }

      // Determine facility ID: use URL context facility if available, otherwise user's facility
      const targetFacilityId = req.facility?.id || req.user.facilityId;

      let result;
      if (patientId) {
        result = await storage.getNursingRecordsByPatientPaginated(patientId as string, targetFacilityId, { page, limit });
      } else if (nurseId) {
        result = await storage.getNursingRecordsByNursePaginated(nurseId as string, targetFacilityId, { page, limit });
      } else {
        result = await storage.getNursingRecordsByFacilityPaginated(targetFacilityId, { page, limit });
      }

      res.json(result);

    } catch (error) {
      console.error("Get nursing records error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Search nursing records with advanced filters
  app.get("/api/nursing-records/search", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { status, patientId, nurseId, dateFrom, dateTo, sortBy, sortOrder } = req.query;

      // Parse pagination parameters
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 1000); // Max 1000 per page

      if (page < 1 || limit < 1) {
        return res.status(400).json({ error: "ページ番号と件数は1以上である必要があります" });
      }

      // Determine facility ID: use URL context facility if available, otherwise user's facility
      const targetFacilityId = req.facility?.id || req.user.facilityId;

      const result = await storage.searchNursingRecordsPaginated(targetFacilityId, {
        page,
        limit,
        status: status as 'draft' | 'completed' | 'reviewed' | undefined,
        patientId: patientId as string | undefined,
        nurseId: nurseId as string | undefined,
        dateFrom: dateFrom as string | undefined,
        dateTo: dateTo as string | undefined,
        sortBy: sortBy as 'visitDate' | 'recordDate' | undefined,
        sortOrder: sortOrder as 'asc' | 'desc' | undefined,
      });

      res.json(result);

    } catch (error) {
      console.error("Search nursing records error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Get latest nursing record by patient ID (MUST come BEFORE /:id route)
  app.get("/api/nursing-records/latest-by-patient/:patientId", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { patientId } = req.params;
      const excludeRecordId = req.query.excludeRecordId as string | undefined;
      const visitDate = req.query.visitDate as string | undefined;
      const actualStartTime = req.query.actualStartTime as string | undefined;
      
      // Determine facility ID: use URL context facility if available, otherwise user's facility
      const targetFacilityId = req.facility?.id || req.user.facilityId;

      const conditions = [
        eq(nursingRecords.patientId, patientId),
        eq(nursingRecords.facilityId, targetFacilityId),
        isNull(nursingRecords.deletedAt)
      ];

      // 編集している記録を除外
      if (excludeRecordId) {
        conditions.push(ne(nursingRecords.id, excludeRecordId));
      }

      // 訪問日と開始時間を基準に前回の記録を取得
      if (visitDate) {
        if (actualStartTime) {
          // 訪問日と開始時間の両方が指定されている場合
          const targetStartTime = new Date(`${visitDate}T${actualStartTime}`);
          
          // visitDate < 指定の訪問日 または (visitDate = 指定の訪問日 AND actualStartTime < 指定の開始時間)
          const dateCondition = lt(nursingRecords.visitDate, visitDate);
          const sameDateCondition = eq(nursingRecords.visitDate, visitDate);
          const timeCondition = lt(nursingRecords.actualStartTime, targetStartTime);
          const combinedCondition = or(
            dateCondition,
            and(sameDateCondition, timeCondition)
          ) as SQL<unknown>;
          conditions.push(combinedCondition);
        } else {
          // 訪問日のみ指定されている場合
          conditions.push(lt(nursingRecords.visitDate, visitDate));
        }
      }

      // 訪問日と開始時間の降順でソート（最も新しい前回の記録を取得）
      const previousRecord = await db.query.nursingRecords.findFirst({
        where: and(...conditions),
        orderBy: [
          desc(nursingRecords.visitDate),
          desc(nursingRecords.actualStartTime),
          desc(nursingRecords.recordDate)
        ],
      });

      if (!previousRecord) {
        return res.json(null);
      }

      res.json(previousRecord);
    } catch (error) {
      console.error("Get previous nursing record error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Get single nursing record by ID (MUST come AFTER /search and base routes)
  app.get("/api/nursing-records/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const record = await storage.getNursingRecord(id);

      if (!record) {
        return res.status(404).json({ error: "看護記録が見つかりません" });
      }

      // Check if nursing record belongs to user's facility
      const targetFacilityId = req.facility?.id || req.user.facilityId;
      if (record.facilityId !== targetFacilityId) {
        return res.status(404).json({ error: "看護記録が見つかりません" });
      }

      // Fetch schedule information if scheduleId exists
      let schedule = null;
      if (record.scheduleId) {
        schedule = await storage.getScheduleById(record.scheduleId);
      }

      // Add schedule data to response
      const recordWithScheduleData = {
        ...record,
        demoStaffName: schedule?.demoStaffName || null,
        purpose: schedule?.purpose || null,
      };

      res.json(recordWithScheduleData);
    } catch (error) {
      console.error("Get nursing record error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Helper function: Calculate bonuses and points for nursing record (Phase 4 - Rule Engine)
  async function calculateBonusesAndPoints(recordData: any, facilityId: string, nursingRecordId?: string) {
    const appliedBonuses: any[] = [];
    let calculatedPoints = 0;

    // Get patient information for context (needed for visit date calculation)
    const patient = await db.query.patients.findFirst({
      where: eq(patients.id, recordData.patientId)
    });

    if (!patient) {
      return { calculatedPoints, appliedBonuses };
    }

    // Count same-day visits for dailyVisitCount (must be done before service code assignment)
    const visitDate = recordData.visitDate ? new Date(recordData.visitDate) : new Date(recordData.recordDate);
    const startOfDay = new Date(visitDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(visitDate);
    endOfDay.setHours(23, 59, 59, 999);

    const sameDayVisits = await db.query.nursingRecords.findMany({
      where: and(
        eq(nursingRecords.facilityId, facilityId),
        eq(nursingRecords.patientId, recordData.patientId),
        gte(nursingRecords.visitDate, startOfDay.toISOString().split('T')[0]),
        lte(nursingRecords.visitDate, endOfDay.toISOString().split('T')[0]),
        isNull(nursingRecords.deletedAt),
        // 編集時は現在の記録を除外
        nursingRecordId ? ne(nursingRecords.id, nursingRecordId) : undefined
      )
    });

    const dailyVisitCount = sameDayVisits.length + 1; // +1 for current visit

    // サービスコードから点数を取得
    let serviceCodeId = recordData.serviceCodeId;
    let serviceCodePoints = 0;

    // サービスコードが選択されていない場合の処理
    // 編集時（nursingRecordIdが存在する場合）は、ユーザーの選択を尊重して自動設定しない
    // 新規作成時のみ、1回目の訪問記録でデフォルトで510000110を設定
    // 基本療養費は1日1回のみ適用されるため、2回目以降は自動設定しない
    if (!serviceCodeId) {
      // 新規作成時（nursingRecordIdが存在しない）かつ1回目の訪問記録の場合のみ、デフォルトサービスコードを設定
      if (!nursingRecordId && dailyVisitCount === 1) {
        const defaultServiceCode = await db.query.nursingServiceCodes.findFirst({
          where: and(
            eq(nursingServiceCodes.serviceCode, '510000110'),
            eq(nursingServiceCodes.isActive, true)
          ),
        });
        if (defaultServiceCode) {
          serviceCodeId = defaultServiceCode.id;
          serviceCodePoints = defaultServiceCode.points;
          // recordDataにも設定（後続処理で使用）
          recordData.serviceCodeId = defaultServiceCode.id;
        }
      }
      // 編集時または2回目以降の訪問でサービスコードが未選択の場合は、点数を0点のまま（基本療養費は適用されない）
    } else {
      // 選択されたサービスコードの点数を取得
      const selectedServiceCode = await db.query.nursingServiceCodes.findFirst({
        where: eq(nursingServiceCodes.id, serviceCodeId),
      });
      if (selectedServiceCode) {
        serviceCodePoints = selectedServiceCode.points;
      }
    }

    // 基本点数としてサービスコードの点数を使用
    calculatedPoints += serviceCodePoints;

    // Phase2-1: Get facility information for context
    const facility = await db.query.facilities.findFirst({
      where: eq(facilities.id, facilityId)
    });

    // Calculate patient age
    let patientAge: number | undefined;
    if (patient.dateOfBirth) {
      const birthDate = new Date(patient.dateOfBirth);
      patientAge = visitDate.getFullYear() - birthDate.getFullYear();
      const monthDiff = visitDate.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && visitDate.getDate() < birthDate.getDate())) {
        patientAge--;
      }
    }

    // Week 3: Get assigned nurse information for specialist management bonus
    const assignedNurse = recordData.nurseId ? await db.query.users.findFirst({
      where: eq(users.id, recordData.nurseId),
      columns: {
        id: true,
        fullName: true,
        specialistCertifications: true,
      }
    }) : undefined;

    // Build bonus calculation context
    const context = {
      nursingRecordId: nursingRecordId || "",
      patientId: recordData.patientId,
      facilityId,
      visitDate: visitDate,
      visitStartTime: recordData.actualStartTime ? new Date(recordData.actualStartTime) : null,
      visitEndTime: recordData.actualEndTime ? new Date(recordData.actualEndTime) : null,
      isSecondVisit: recordData.isSecondVisit || false,
      emergencyVisitReason: recordData.emergencyVisitReason,
      multipleVisitReason: recordData.multipleVisitReason,
      longVisitReason: recordData.longVisitReason,
      patientAge,
      buildingId: patient.buildingId,
      insuranceType: (patient.insuranceType || "medical") as "medical" | "care",
      dailyVisitCount,
      // Phase2-1: 施設体制フラグ
      has24hSupportSystem: facility?.has24hSupportSystem || false,
      has24hSupportSystemEnhanced: facility?.has24hSupportSystemEnhanced || false,
      hasEmergencySupportSystem: facility?.hasEmergencySupportSystem || false,
      hasEmergencySupportSystemEnhanced: facility?.hasEmergencySupportSystemEnhanced || false,
      burdenReductionMeasures: facility?.burdenReductionMeasures || [],
      // Phase 2-A: 記録フラグ（加算判定用）
      isDischargeDate: recordData.isDischargeDate || false,
      isFirstVisitOfPlan: recordData.isFirstVisitOfPlan || false,
      hasCollaborationRecord: recordData.hasCollaborationRecord || false,
      isTerminalCare: recordData.isTerminalCare || false,
      terminalCareDeathDate: recordData.terminalCareDeathDate ? new Date(recordData.terminalCareDeathDate) : null,
      // Phase 2-A: 患者情報（日付フィールド）
      lastDischargeDate: patient.lastDischargeDate ? new Date(patient.lastDischargeDate) : null,
      lastPlanCreatedDate: patient.lastPlanCreatedDate ? new Date(patient.lastPlanCreatedDate) : null,
      deathDate: patient.deathDate ? new Date(patient.deathDate) : null,
      // RJレコード用：死亡詳細情報
      deathTime: (patient as any).deathTime || null,
      deathPlaceCode: (patient as any).deathPlaceCode || null,
      deathPlaceText: (patient as any).deathPlaceText || null,
      // Phase 4: 特別管理情報
      specialManagementTypes: patient.specialManagementTypes || [],
      // Week 3: 専門管理加算用フィールド
      specialistCareType: recordData.specialistCareType || null,
      assignedNurse: assignedNurse ? {
        id: assignedNurse.id,
        fullName: assignedNurse.fullName,
        specialistCertifications: assignedNurse.specialistCertifications as string[] | null,
      } : undefined,
    };

    // Calculate bonuses using the new rule engine
    const { calculateBonuses, saveBonusCalculationHistory } = await import("./bonus-engine");
    const bonusResults = await calculateBonuses(context);

    // Convert results to old format for backward compatibility
    for (const result of bonusResults) {
      calculatedPoints += result.calculatedPoints;
      appliedBonuses.push({
        bonusCode: result.bonusCode,
        bonusName: result.bonusName,
        type: result.bonusCode, // For backward compatibility
        points: result.calculatedPoints,
        version: result.appliedVersion,
        details: result.calculationDetails,
      });
    }

    // Save calculation history if nursingRecordId is provided
    if (nursingRecordId) {
      await saveBonusCalculationHistory(nursingRecordId, bonusResults);
    }

    return {
      calculatedPoints,
      appliedBonuses
    };
  }

  // Create nursing record
  app.post("/api/nursing-records", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const recordData = insertNursingRecordSchema.parse(req.body);

      // If scheduleId is provided, auto-fill schedule information
      if (recordData.scheduleId) {
        const schedule = await storage.getScheduleById(recordData.scheduleId);
        if (schedule && schedule.facilityId === req.user.facilityId) {
          // Auto-fill from schedule if not already provided
          if (!recordData.patientId) {
            recordData.patientId = schedule.patientId;
          }
          if (!recordData.actualStartTime && schedule.actualStartTime) {
            recordData.actualStartTime = schedule.actualStartTime;
          }
          if (!recordData.actualEndTime && schedule.actualEndTime) {
            recordData.actualEndTime = schedule.actualEndTime;
          }
        }
      }

      // サービスコードが未選択の場合、1回目の訪問記録のみデフォルトで510000110を設定
      // 基本療養費は1日1回のみ適用されるため、2回目以降は自動設定しない
      if (!recordData.serviceCodeId) {
        // 同日の訪問回数を計算
        const visitDate = recordData.visitDate ? new Date(recordData.visitDate) : new Date(recordData.recordDate);
        const visitDateStr = visitDate.toISOString().split('T')[0];
        
        const sameDayVisits = await db.query.nursingRecords.findMany({
          where: and(
            eq(nursingRecords.facilityId, req.user.facilityId),
            eq(nursingRecords.patientId, recordData.patientId),
            eq(nursingRecords.visitDate, visitDateStr),
            isNull(nursingRecords.deletedAt)
          )
        });
        
        const dailyVisitCount = sameDayVisits.length + 1; // +1 for current visit
        
        // 1回目の訪問記録の場合のみ、510000110を自動設定
        if (dailyVisitCount === 1) {
          const defaultServiceCode = await db.query.nursingServiceCodes.findFirst({
            where: and(
              eq(nursingServiceCodes.serviceCode, '510000110'),
              eq(nursingServiceCodes.isActive, true)
            ),
          });
          if (defaultServiceCode) {
            recordData.serviceCodeId = defaultServiceCode.id;
          }
        }
      }

      // Add nurseId to recordData for bonus calculation
      const recordDataWithNurseId = { ...recordData, nurseId: req.user.id };

      // Calculate bonuses and points (first pass without record ID)
      const { calculatedPoints, appliedBonuses } = await calculateBonusesAndPoints(recordDataWithNurseId, req.user.facilityId);
      recordData.calculatedPoints = calculatedPoints;
      recordData.appliedBonuses = appliedBonuses;

      // Pass facility ID and nurse ID separately
      const record = await storage.createNursingRecord(recordData, req.user.facilityId, req.user.id);

      // Recalculate and save bonus history with record ID (Phase 4)
      await calculateBonusesAndPoints(recordDataWithNurseId, req.user.facilityId, record.id);

      // Fetch patient and nurse information for the response
      const patient = await storage.getPatient(record.patientId);
      const nurse = await storage.getUser(record.nurseId);

      // Fetch schedule information if scheduleId exists
      let schedule = null;
      if (record.scheduleId) {
        schedule = await storage.getScheduleById(record.scheduleId);
      }

      // Add patient and nurse names to the record
      const recordWithNames = {
        ...record,
        patientName: patient ? `${patient.lastName} ${patient.firstName}` : undefined,
        nurseName: nurse?.fullName || undefined,
        demoStaffName: schedule?.demoStaffName || null,
        purpose: schedule?.purpose || null,
      };

      res.status(201).json(recordWithNames);

    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Nursing record validation error:", error.errors);
        return res.status(400).json({
          error: "入力データが正しくありません",
          details: error.errors
        });
      }
      console.error("Create nursing record error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Update nursing record
  app.put("/api/nursing-records/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      // Check if nursing record belongs to user's facility
      const existingRecord = await storage.getNursingRecord(id);
      if (!existingRecord || existingRecord.facilityId !== req.user.facilityId) {
        return res.status(404).json({ error: "看護記録が見つかりません" });
      }

      // Phase 3: 編集権限チェック
      const isAdmin = ['admin', 'manager'].includes(req.user.role);
      const isOwner = existingRecord.nurseId === req.user.id;

      if (existingRecord.status === 'reviewed') {
        // 確認済み記録は管理者のみ編集可能
        if (!isAdmin) {
          return res.status(403).json({
            error: "確認済みの記録は管理者のみ編集できます"
          });
        }
      } else if (existingRecord.status === 'completed' || existingRecord.status === 'draft') {
        // 完了/下書き記録は作成者または管理者のみ編集可能
        if (!isOwner && !isAdmin) {
          return res.status(403).json({
            error: "この記録を編集する権限がありません"
          });
        }
      }

      // Validate update data with Zod schema
      const validatedData = updateNursingRecordSchema.parse(req.body);

      // Cross-tenant reference validation
      if (validatedData.patientId) {
        const patient = await storage.getPatient(validatedData.patientId);
        if (!patient || patient.facilityId !== req.user.facilityId) {
          return res.status(400).json({ error: "指定された患者が見つかりません" });
        }
      }

      if (validatedData.visitId) {
        const visit = await storage.getVisit(validatedData.visitId);
        if (!visit || visit.facilityId !== req.user.facilityId) {
          return res.status(400).json({ error: "指定された訪問予定が見つかりません" });
        }
      }

      // Merge existing data with updates for bonus calculation
      const mergedData = {
        ...existingRecord,
        ...validatedData
      };

      // 編集時は、ユーザーが明示的にサービスコードを未選択にした場合はそれを尊重する
      // 自動設定は行わない（calculateBonusesAndPoints関数内で処理される）

      // Recalculate bonuses and points
      const { calculatedPoints, appliedBonuses } = await calculateBonusesAndPoints(mergedData, req.user.facilityId);
      validatedData.calculatedPoints = calculatedPoints;
      validatedData.appliedBonuses = appliedBonuses;

      // Phase 3: 編集履歴用に既存データを保存
      const record = await storage.updateNursingRecord(id, validatedData, req.user.id, existingRecord);
      if (!record) {
        return res.status(404).json({ error: "看護記録が見つかりません" });
      }

      // Recalculate and save bonus history with record ID (Phase 4)
      await calculateBonusesAndPoints(mergedData, req.user.facilityId, id);

      // Fetch patient and nurse information for the response
      const patient = await storage.getPatient(record.patientId);
      const nurse = await storage.getUser(record.nurseId);

      // Add patient and nurse names to the record
      const recordWithNames = {
        ...record,
        patientName: patient ? `${patient.lastName} ${patient.firstName}` : undefined,
        nurseName: nurse?.fullName || undefined,
      };

      res.json(recordWithNames);

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "入力データが正しくありません",
          details: error.errors
        });
      }
      console.error("Update nursing record error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Get nursing record edit history (Phase 3: 管理者のみ)
  app.get("/api/nursing-records/:id/edit-history", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      // 管理者のみアクセス可能
      if (!['admin', 'manager'].includes(req.user.role)) {
        return res.status(403).json({ error: "編集履歴は管理者のみ閲覧できます" });
      }

      // Check if nursing record belongs to user's facility
      const existingRecord = await storage.getNursingRecord(id);
      if (!existingRecord || existingRecord.facilityId !== req.user.facilityId) {
        return res.status(404).json({ error: "看護記録が見つかりません" });
      }

      const history = await storage.getNursingRecordEditHistory(id);
      res.json(history);

    } catch (error) {
      console.error("Get nursing record edit history error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Delete nursing record (soft delete)
  app.delete("/api/nursing-records/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      // Check if nursing record belongs to user's facility
      const existingRecord = await storage.getNursingRecord(id);
      if (!existingRecord || existingRecord.facilityId !== req.user.facilityId) {
        return res.status(404).json({ error: "看護記録が見つかりません" });
      }

      // Soft delete by setting deletedAt timestamp
      const record = await storage.deleteNursingRecord(id);
      if (!record) {
        return res.status(404).json({ error: "看護記録が見つかりません" });
      }

      res.json({ message: "看護記録を削除しました", id });

    } catch (error) {
      console.error("Delete nursing record error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // ========== Nursing Record Attachments Routes ==========

  // Upload attachment to nursing record
  app.post("/api/nursing-records/:id/attachments", requireAuth, upload.array('files', 10), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { captions } = req.body; // Array of captions corresponding to files

      // Check if nursing record exists and belongs to user's facility
      const nursingRecord = await storage.getNursingRecord(id);
      if (!nursingRecord || nursingRecord.facilityId !== req.user.facilityId) {
        return res.status(404).json({ error: "看護記録が見つかりません" });
      }

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: "ファイルがアップロードされていません" });
      }

      // Parse captions if provided as JSON string
      let captionsArray: string[] = [];
      if (captions) {
        try {
          captionsArray = typeof captions === 'string' ? JSON.parse(captions) : captions;
        } catch (e) {
          captionsArray = [];
        }
      }

      // Save attachment records to database
      const attachments: NursingRecordAttachment[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const caption = captionsArray[i] || null;

        // Generate unique file key for Object Storage
        const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
        const ext = path.extname(file.originalname);
        const fileName = `${uniqueSuffix}${ext}`;
        const objectKey = `nursing-records/${id}/${fileName}`;

        // Upload to Object Storage
        await uploadFile(objectKey, file.buffer, file.mimetype);

        const [attachment] = await db.insert(nursingRecordAttachments).values({
          nursingRecordId: id,
          fileName: fileName,
          originalFileName: file.originalname,
          fileType: file.mimetype,
          fileSize: file.size,
          filePath: objectKey,
          caption: caption
        }).returning();

        attachments.push(attachment);
      }

      res.json({ message: "ファイルをアップロードしました", attachments });

    } catch (error) {
      console.error("Upload attachment error:", error);
      res.status(500).json({ error: "ファイルのアップロードに失敗しました" });
    }
  });

  // Get attachments for nursing record
  app.get("/api/nursing-records/:id/attachments", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      // Check if nursing record exists and belongs to user's facility
      const nursingRecord = await storage.getNursingRecord(id);
      if (!nursingRecord || nursingRecord.facilityId !== req.user.facilityId) {
        return res.status(404).json({ error: "看護記録が見つかりません" });
      }

      const attachments = await db.select()
        .from(nursingRecordAttachments)
        .where(eq(nursingRecordAttachments.nursingRecordId, id));

      res.json(attachments);

    } catch (error) {
      console.error("Get attachments error:", error);
      res.status(500).json({ error: "添付ファイルの取得に失敗しました" });
    }
  });

  // Get single attachment file
  app.get("/api/attachments/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      const [attachment] = await db.select()
        .from(nursingRecordAttachments)
        .where(eq(nursingRecordAttachments.id, id));

      if (!attachment) {
        return res.status(404).json({ error: "添付ファイルが見つかりません" });
      }

      // Verify access through nursing record
      const nursingRecord = await storage.getNursingRecord(attachment.nursingRecordId!);
      if (!nursingRecord || nursingRecord.facilityId !== req.user.facilityId) {
        return res.status(403).json({ error: "アクセス権限がありません" });
      }

      // Download from Object Storage
      const fileBuffer = await downloadFile(attachment.filePath);

      if (!fileBuffer) {
        return res.status(404).json({ error: "ファイルが見つかりません" });
      }

      // Set appropriate content type
      res.setHeader('Content-Type', attachment.fileType);
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(attachment.originalFileName)}"`);
      res.setHeader('Content-Length', fileBuffer.length.toString());

      // Send file buffer
      res.send(fileBuffer);

    } catch (error) {
      console.error("Get attachment file error:", error);
      res.status(500).json({ error: "ファイルの取得に失敗しました" });
    }
  });

  // Delete attachment
  app.delete("/api/attachments/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      const [attachment] = await db.select()
        .from(nursingRecordAttachments)
        .where(eq(nursingRecordAttachments.id, id));

      if (!attachment) {
        return res.status(404).json({ error: "添付ファイルが見つかりません" });
      }

      // Verify access through nursing record
      const nursingRecord = await storage.getNursingRecord(attachment.nursingRecordId!);
      if (!nursingRecord || nursingRecord.facilityId !== req.user.facilityId) {
        return res.status(403).json({ error: "アクセス権限がありません" });
      }

      // Delete file from Object Storage
      await deleteFile(attachment.filePath);

      // Delete record from database
      await db.delete(nursingRecordAttachments).where(eq(nursingRecordAttachments.id, id));

      res.json({ message: "添付ファイルを削除しました" });

    } catch (error) {
      console.error("Delete attachment error:", error);
      res.status(500).json({ error: "ファイルの削除に失敗しました" });
    }
  });

  // Update attachment caption
  app.patch("/api/attachments/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { caption } = req.body;

      const [attachment] = await db.select()
        .from(nursingRecordAttachments)
        .where(eq(nursingRecordAttachments.id, id));

      if (!attachment) {
        return res.status(404).json({ error: "添付ファイルが見つかりません" });
      }

      // Verify access through nursing record
      const nursingRecord = await storage.getNursingRecord(attachment.nursingRecordId!);
      if (!nursingRecord || nursingRecord.facilityId !== req.user.facilityId) {
        return res.status(403).json({ error: "アクセス権限がありません" });
      }

      // Update caption
      const [updatedAttachment] = await db.update(nursingRecordAttachments)
        .set({ caption: caption || null })
        .where(eq(nursingRecordAttachments.id, id))
        .returning();

      res.json(updatedAttachment);

    } catch (error) {
      console.error("Update attachment caption error:", error);
      res.status(500).json({ error: "キャプションの更新に失敗しました" });
    }
  });

  // ========== Medications Routes ==========
  
  // Get medications
  app.get("/api/medications", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { patientId } = req.query;

      // Parse pagination parameters
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100); // Max 100 per page

      if (page < 1 || limit < 1) {
        return res.status(400).json({ error: "ページ番号と件数は1以上である必要があります" });
      }

      // Determine facility ID: use URL context facility if available, otherwise user's facility
      const targetFacilityId = req.facility?.id || req.user.facilityId;

      let result;
      if (patientId) {
        result = await storage.getMedicationsByPatientPaginated(patientId as string, targetFacilityId, { page, limit });
      } else {
        result = await storage.getMedicationsByFacilityPaginated(targetFacilityId, { page, limit });
      }
      
      res.json(result);
      
    } catch (error) {
      console.error("Get medications error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Create medication
  app.post("/api/medications", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const medicationData = insertMedicationSchema.parse(req.body);
      
      // Set facility ID and nurse ID from current user
      const medicationToCreate = {
        ...medicationData,
        facilityId: req.user.facilityId,
        nurseId: req.user.id
      };
      
      const medication = await storage.createMedication(medicationToCreate);
      res.status(201).json(medication);
      
    } catch (error) {
      console.error("Create medication error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Update medication
  app.put("/api/medications/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      
      // Check if medication belongs to user's facility
      const existingMedication = await storage.getMedication(id);
      if (!existingMedication || existingMedication.facilityId !== req.user.facilityId) {
        return res.status(404).json({ error: "薬歴が見つかりません" });
      }
      
      // Validate update data with Zod schema
      const validatedData = updateMedicationSchema.parse(req.body);
      
      // Cross-tenant reference validation
      if (validatedData.patientId) {
        const patient = await storage.getPatient(validatedData.patientId);
        if (!patient || patient.facilityId !== req.user.facilityId) {
          return res.status(400).json({ error: "指定された患者が見つかりません" });
        }
      }
      
      if (validatedData.nurseId) {
        const nurse = await storage.getUser(validatedData.nurseId);
        if (!nurse || nurse.facilityId !== req.user.facilityId) {
          return res.status(400).json({ error: "指定された看護師が見つかりません" });
        }
      }
      
      const medication = await storage.updateMedication(id, validatedData);
      if (!medication) {
        return res.status(404).json({ error: "薬歴が見つかりません" });
      }
      
      res.json(medication);
      
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "入力データが正しくありません",
          details: error.errors 
        });
      }
      console.error("Update medication error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // ========== Medical Institutions API (医療機関マスタ) ==========

  // Get all medical institutions for the facility
  app.get("/api/medical-institutions", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.facility?.id || req.user.facilityId;

      if (!facilityId) {
        return res.status(401).json({ error: "施設IDが見つかりません" });
      }

      const institutions = await db.query.medicalInstitutions.findMany({
        where: and(
          eq(medicalInstitutions.facilityId, facilityId),
          eq(medicalInstitutions.isActive, true)
        ),
        orderBy: (medicalInstitutions, { asc }) => [asc(medicalInstitutions.name)]
      });

      res.json(institutions);
    } catch (error) {
      console.error("Get medical institutions error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Get single medical institution
  app.get("/api/medical-institutions/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      const institution = await db.query.medicalInstitutions.findFirst({
        where: and(
          eq(medicalInstitutions.id, id),
          eq(medicalInstitutions.facilityId, facilityId)
        )
      });

      if (!institution) {
        return res.status(404).json({ error: "医療機関が見つかりません" });
      }

      res.json(institution);
    } catch (error) {
      console.error("Get medical institution error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Create medical institution
  app.post("/api/medical-institutions", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.facility?.id || req.user.facilityId;

      if (!facilityId) {
        return res.status(401).json({ error: "施設IDが見つかりません" });
      }

      const validatedData = insertMedicalInstitutionSchema.parse(req.body);

      const [institution] = await db.insert(medicalInstitutions).values({
        ...validatedData,
        facilityId
      }).returning();

      res.status(201).json(institution);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "入力データが正しくありません",
          details: error.errors
        });
      }
      console.error("Create medical institution error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Update medical institution
  app.put("/api/medical-institutions/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      const validatedData = updateMedicalInstitutionSchema.parse(req.body);

      const [institution] = await db.update(medicalInstitutions)
        .set({
          ...validatedData,
          updatedAt: new Date()
        })
        .where(and(
          eq(medicalInstitutions.id, id),
          eq(medicalInstitutions.facilityId, facilityId)
        ))
        .returning();

      if (!institution) {
        return res.status(404).json({ error: "医療機関が見つかりません" });
      }

      res.json(institution);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "入力データが正しくありません",
          details: error.errors
        });
      }
      console.error("Update medical institution error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Delete (soft delete) medical institution
  app.delete("/api/medical-institutions/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      const [institution] = await db.update(medicalInstitutions)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(
          eq(medicalInstitutions.id, id),
          eq(medicalInstitutions.facilityId, facilityId)
        ))
        .returning();

      if (!institution) {
        return res.status(404).json({ error: "医療機関が見つかりません" });
      }

      res.json({ message: "医療機関を削除しました" });
    } catch (error) {
      console.error("Delete medical institution error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // ========== Buildings API (建物マスタ) ==========

  // Get all buildings for the facility
  app.get("/api/buildings", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.facility?.id || req.user.facilityId;

      if (!facilityId) {
        return res.status(401).json({ error: "施設IDが見つかりません" });
      }

      const buildingsList = await db.query.buildings.findMany({
        where: eq(buildings.facilityId, facilityId),
        orderBy: (buildings, { asc }) => [asc(buildings.name)]
      });

      res.json(buildingsList);
    } catch (error) {
      console.error("Get buildings error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Create building
  app.post("/api/buildings", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.facility?.id || req.user.facilityId;

      if (!facilityId) {
        return res.status(401).json({ error: "施設IDが見つかりません" });
      }

      const validatedData = insertBuildingSchema.parse(req.body);

      const [building] = await db.insert(buildings).values({
        ...validatedData,
        facilityId
      }).returning();

      res.status(201).json(building);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "入力データが正しくありません",
          details: error.errors
        });
      }
      console.error("Create building error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Update building
  app.put("/api/buildings/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      const validatedData = updateBuildingSchema.parse(req.body);

      const [building] = await db.update(buildings)
        .set({
          ...validatedData,
          updatedAt: new Date()
        })
        .where(and(
          eq(buildings.id, id),
          eq(buildings.facilityId, facilityId)
        ))
        .returning();

      if (!building) {
        return res.status(404).json({ error: "建物が見つかりません" });
      }

      res.json(building);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "入力データが正しくありません",
          details: error.errors
        });
      }
      console.error("Update building error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Delete building
  app.delete("/api/buildings/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      // Check if building has patients
      const patientsInBuilding = await db.query.patients.findMany({
        where: and(
          eq(patients.buildingId, id),
          eq(patients.facilityId, facilityId)
        )
      });

      if (patientsInBuilding.length > 0) {
        return res.status(400).json({
          error: "この建物には利用者が登録されています。先に利用者の建物情報を解除してください。"
        });
      }

      await db.delete(buildings)
        .where(and(
          eq(buildings.id, id),
          eq(buildings.facilityId, facilityId)
        ));

      res.json({ message: "建物を削除しました" });
    } catch (error) {
      console.error("Delete building error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // ========== Care Managers API (ケアマネージャーマスタ) ==========

  // Get all care managers for the facility
  app.get("/api/care-managers", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.facility?.id || req.user.facilityId;

      if (!facilityId) {
        return res.status(401).json({ error: "施設IDが見つかりません" });
      }

      const managers = await db.query.careManagers.findMany({
        where: and(
          eq(careManagers.facilityId, facilityId),
          eq(careManagers.isActive, true)
        ),
        orderBy: (careManagers, { asc }) => [asc(careManagers.officeName)]
      });

      res.json(managers);
    } catch (error) {
      console.error("Get care managers error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Get single care manager
  app.get("/api/care-managers/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      const manager = await db.query.careManagers.findFirst({
        where: and(
          eq(careManagers.id, id),
          eq(careManagers.facilityId, facilityId)
        )
      });

      if (!manager) {
        return res.status(404).json({ error: "ケアマネージャーが見つかりません" });
      }

      res.json(manager);
    } catch (error) {
      console.error("Get care manager error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Create care manager
  app.post("/api/care-managers", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.facility?.id || req.user.facilityId;

      if (!facilityId) {
        return res.status(401).json({ error: "施設IDが見つかりません" });
      }

      const validatedData = insertCareManagerSchema.parse(req.body);

      const [manager] = await db.insert(careManagers).values({
        ...validatedData,
        facilityId
      }).returning();

      res.status(201).json(manager);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "入力データが正しくありません",
          details: error.errors
        });
      }
      console.error("Create care manager error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Update care manager
  app.put("/api/care-managers/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      const validatedData = updateCareManagerSchema.parse(req.body);

      const [manager] = await db.update(careManagers)
        .set({
          ...validatedData,
          updatedAt: new Date()
        })
        .where(and(
          eq(careManagers.id, id),
          eq(careManagers.facilityId, facilityId)
        ))
        .returning();

      if (!manager) {
        return res.status(404).json({ error: "ケアマネージャーが見つかりません" });
      }

      res.json(manager);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "入力データが正しくありません",
          details: error.errors
        });
      }
      console.error("Update care manager error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Delete (soft delete) care manager
  app.delete("/api/care-managers/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      const [manager] = await db.update(careManagers)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(
          eq(careManagers.id, id),
          eq(careManagers.facilityId, facilityId)
        ))
        .returning();

      if (!manager) {
        return res.status(404).json({ error: "ケアマネージャーが見つかりません" });
      }

      res.json({ message: "ケアマネージャーを削除しました" });
    } catch (error) {
      console.error("Delete care manager error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // ========== Special Management API (特別管理マスタ) ==========

  // Get all special management definitions
  app.get("/api/special-management-definitions", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.facility?.id || req.user.facilityId;

      // 自施設のマスタのみ取得
      const definitions = await db.query.specialManagementDefinitions.findMany({
        where: and(
          eq(specialManagementDefinitions.facilityId, facilityId),
          eq(specialManagementDefinitions.isActive, true)
        ),
        with: {
          fields: {
            orderBy: [asc(specialManagementFields.displayOrder)]
          }
        },
        orderBy: [asc(specialManagementDefinitions.displayOrder)]
      });

      res.json(definitions);
    } catch (error) {
      console.error("Get special management definitions error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Get a single special management definition by ID
  app.get("/api/special-management-definitions/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      const definition = await db.query.specialManagementDefinitions.findFirst({
        where: and(
          eq(specialManagementDefinitions.id, id),
          eq(specialManagementDefinitions.isActive, true)
        ),
        with: {
          fields: {
            orderBy: [asc(specialManagementFields.displayOrder)]
          }
        }
      });

      if (!definition) {
        return res.status(404).json({ error: "特管マスタが見つかりません" });
      }

      res.json(definition);
    } catch (error) {
      console.error("Get special management definition error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Create a new special management definition
  app.post("/api/special-management-definitions", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.facility?.id || req.user.facilityId;
      const data = insertSpecialManagementDefinitionSchema.parse(req.body);

      // カテゴリの自動生成（special_001, special_002, ...）
      let generatedCategory = data.category;
      if (!generatedCategory) {
        // 既存のカテゴリから最大番号を取得
        const existingDefinitions = await db
          .select({ category: specialManagementDefinitions.category })
          .from(specialManagementDefinitions)
          .where(eq(specialManagementDefinitions.facilityId, facilityId));

        const maxNumber = existingDefinitions
          .map(d => d.category)
          .filter(c => c.startsWith('special_'))
          .map(c => parseInt(c.replace('special_', '')) || 0)
          .reduce((max, num) => Math.max(max, num), 0);

        generatedCategory = `special_${String(maxNumber + 1).padStart(3, '0')}`;
      }

      const [definition] = await db
        .insert(specialManagementDefinitions)
        .values({
          ...data,
          category: generatedCategory,
          facilityId: facilityId, // 自施設専用マスタとして管理
        })
        .returning();

      // フィールド定義も一緒に作成する場合
      if (req.body.fields && Array.isArray(req.body.fields)) {
        const fieldsData = req.body.fields.map((field: any, index: number) => {
          // フィールド名の自動生成（field_001, field_002, ...）
          const fieldName = field.fieldName || `field_${String(index + 1).padStart(3, '0')}`;

          return {
            definitionId: definition.id,
            fieldName: fieldName,
            fieldLabel: field.fieldLabel,
            fieldType: field.fieldType,
            fieldOptions: field.fieldOptions || null,
            isRequired: field.isRequired || false,
            displayOrder: field.displayOrder ?? index,
          };
        });

        await db.insert(specialManagementFields).values(fieldsData);
      }

      // 作成したデータをフィールド付きで返す
      const createdDefinition = await db.query.specialManagementDefinitions.findFirst({
        where: eq(specialManagementDefinitions.id, definition.id),
        with: {
          fields: {
            orderBy: [asc(specialManagementFields.displayOrder)]
          }
        }
      });

      res.json(createdDefinition);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "入力データが不正です", details: error.errors });
      }
      console.error("Create special management definition error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Update a special management definition
  app.put("/api/special-management-definitions/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;
      const data = updateSpecialManagementDefinitionSchema.parse(req.body);

      // 自施設のマスタのみ更新可能
      const [updated] = await db
        .update(specialManagementDefinitions)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(and(
          eq(specialManagementDefinitions.id, id),
          eq(specialManagementDefinitions.facilityId, facilityId)
        ))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "特管マスタの更新に失敗しました" });
      }

      // フィールド定義も一緒に更新する場合
      if (req.body.fields && Array.isArray(req.body.fields)) {
        // 既存のフィールドを削除して新しいフィールドを挿入
        await db
          .delete(specialManagementFields)
          .where(eq(specialManagementFields.definitionId, id));

        const fieldsData = req.body.fields.map((field: any, index: number) => {
          // フィールド名の自動生成（field_001, field_002, ...）
          const fieldName = field.fieldName || `field_${String(index + 1).padStart(3, '0')}`;

          return {
            definitionId: id,
            fieldName: fieldName,
            fieldLabel: field.fieldLabel,
            fieldType: field.fieldType,
            fieldOptions: field.fieldOptions || null,
            isRequired: field.isRequired || false,
            displayOrder: field.displayOrder ?? index,
          };
        });

        await db.insert(specialManagementFields).values(fieldsData);
      }

      // 更新したデータをフィールド付きで返す
      const updatedDefinition = await db.query.specialManagementDefinitions.findFirst({
        where: eq(specialManagementDefinitions.id, id),
        with: {
          fields: {
            orderBy: [asc(specialManagementFields.displayOrder)]
          }
        }
      });

      res.json(updatedDefinition);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "入力データが不正です", details: error.errors });
      }
      console.error("Update special management definition error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Delete a special management definition (soft delete)
  app.delete("/api/special-management-definitions/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      // 自施設のマスタのみ削除可能
      const [deleted] = await db
        .update(specialManagementDefinitions)
        .set({
          isActive: false,
          updatedAt: new Date(),
        })
        .where(and(
          eq(specialManagementDefinitions.id, id),
          eq(specialManagementDefinitions.facilityId, facilityId)
        ))
        .returning();

      if (!deleted) {
        return res.status(404).json({ error: "特管マスタが見つかりません" });
      }

      res.json({ message: "特管マスタを削除しました" });
    } catch (error) {
      console.error("Delete special management definition error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Get fields for a specific definition
  app.get("/api/special-management-definitions/:id/fields", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      const fields = await db.query.specialManagementFields.findMany({
        where: eq(specialManagementFields.definitionId, id),
        orderBy: [asc(specialManagementFields.displayOrder)]
      });

      res.json(fields);
    } catch (error) {
      console.error("Get special management fields error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // ========== Doctor Orders API (訪問看護指示書) ==========

  // Get all doctor orders (with optional patient filter)
  app.get("/api/doctor-orders", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.facility?.id || req.user.facilityId;
      const { patientId } = req.query;

      const whereConditions = [
        eq(doctorOrders.facilityId, facilityId),
        eq(doctorOrders.isActive, true)
      ];

      if (patientId && typeof patientId === 'string') {
        whereConditions.push(eq(doctorOrders.patientId, patientId));
      }

      const orders = await db.query.doctorOrders.findMany({
        where: and(...whereConditions),
        with: {
          medicalInstitution: true
        },
        orderBy: (doctorOrders, { desc }) => [desc(doctorOrders.startDate)]
      });

      res.json(orders);
    } catch (error) {
      console.error("Get doctor orders error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Get all doctor orders for a patient
  app.get("/api/doctor-orders/patient/:patientId", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { patientId } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      const orders = await db.query.doctorOrders.findMany({
        where: and(
          eq(doctorOrders.patientId, patientId),
          eq(doctorOrders.facilityId, facilityId),
          eq(doctorOrders.isActive, true)
        ),
        with: {
          medicalInstitution: true
        },
        orderBy: (doctorOrders, { desc }) => [desc(doctorOrders.startDate)]
      });

      res.json(orders);
    } catch (error) {
      console.error("Get doctor orders error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Get expiring doctor orders (within 30 days)
  app.get("/api/doctor-orders/expiring", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.facility?.id || req.user.facilityId;
      const today = new Date();
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(today.getDate() + 30);

      const orders = await db.query.doctorOrders.findMany({
        where: and(
          eq(doctorOrders.facilityId, facilityId),
          eq(doctorOrders.isActive, true),
          lte(doctorOrders.endDate, thirtyDaysFromNow.toISOString().split('T')[0]),
          gte(doctorOrders.endDate, today.toISOString().split('T')[0])
        ),
        with: {
          patient: true,
          medicalInstitution: true
        },
        orderBy: (doctorOrders, { asc }) => [asc(doctorOrders.endDate)]
      });

      res.json(orders);
    } catch (error) {
      console.error("Get expiring doctor orders error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Get single doctor order
  app.get("/api/doctor-orders/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      const order = await db.query.doctorOrders.findFirst({
        where: and(
          eq(doctorOrders.id, id),
          eq(doctorOrders.facilityId, facilityId)
        ),
        with: {
          patient: true,
          medicalInstitution: true
        }
      });

      if (!order) {
        return res.status(404).json({ error: "訪問看護指示書が見つかりません" });
      }

      res.json(order);
    } catch (error) {
      console.error("Get doctor order error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Create doctor order
  app.post("/api/doctor-orders", requireAuth, documentUpload.single('file'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.facility?.id || req.user.facilityId;

      if (!facilityId) {
        return res.status(401).json({ error: "施設IDが見つかりません" });
      }

      // When using multipart/form-data, convert numeric fields from strings
      const bodyData = { ...req.body };
      if (bodyData.weeklyVisitLimit !== undefined && bodyData.weeklyVisitLimit !== '') {
        bodyData.weeklyVisitLimit = parseInt(bodyData.weeklyVisitLimit);
      } else if (bodyData.weeklyVisitLimit === '') {
        // Remove empty string to allow null/undefined
        delete bodyData.weeklyVisitLimit;
      }

      const validatedData = insertDoctorOrderSchema.parse(bodyData);

      const orderData: any = {
        ...validatedData,
        facilityId
      };

      // Add file path and original filename if file was uploaded
      if (req.file) {
        const uploaded = await uploadDocumentFile(req.file, 'doctor-orders');
        orderData.filePath = uploaded.filePath;
        orderData.originalFileName = uploaded.originalFileName;
      }

      const [order] = await db.insert(doctorOrders).values(orderData).returning();

      res.status(201).json(order);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "入力データが正しくありません",
          details: error.errors
        });
      }
      console.error("Create doctor order error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Update doctor order
  app.put("/api/doctor-orders/:id", requireAuth, documentUpload.single('file'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      // When using multipart/form-data, convert numeric fields from strings
      const bodyData = { ...req.body };
      if (bodyData.weeklyVisitLimit !== undefined && bodyData.weeklyVisitLimit !== '') {
        bodyData.weeklyVisitLimit = parseInt(bodyData.weeklyVisitLimit);
      } else if (bodyData.weeklyVisitLimit === '') {
        // Remove empty string to allow null/undefined
        delete bodyData.weeklyVisitLimit;
      }

      const validatedData = updateDoctorOrderSchema.parse(bodyData);

      const updateData: any = {
        ...validatedData,
        updatedAt: new Date()
      };

      // If a new file is uploaded, delete the old one first
      if (req.file) {
        // Get current order to find old file path
        const [currentOrder] = await db.select()
          .from(doctorOrders)
          .where(and(
            eq(doctorOrders.id, id),
            eq(doctorOrders.facilityId, facilityId)
          ))
          .limit(1);

        // Delete old file from Object Storage if exists
        if (currentOrder?.filePath) {
          try {
            await deleteFile(currentOrder.filePath);
          } catch (fileError) {
            console.error('Error deleting old file:', fileError);
          }
        }

        const uploaded = await uploadDocumentFile(req.file, 'doctor-orders');
        updateData.filePath = uploaded.filePath;
        updateData.originalFileName = uploaded.originalFileName;
      }

      const [order] = await db.update(doctorOrders)
        .set(updateData)
        .where(and(
          eq(doctorOrders.id, id),
          eq(doctorOrders.facilityId, facilityId)
        ))
        .returning();

      if (!order) {
        return res.status(404).json({ error: "訪問看護指示書が見つかりません" });
      }

      res.json(order);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "入力データが正しくありません",
          details: error.errors
        });
      }
      console.error("Update doctor order error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Delete (soft delete) doctor order
  app.delete("/api/doctor-orders/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      const [order] = await db.update(doctorOrders)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(
          eq(doctorOrders.id, id),
          eq(doctorOrders.facilityId, facilityId)
        ))
        .returning();

      if (!order) {
        return res.status(404).json({ error: "訪問看護指示書が見つかりません" });
      }

      res.json({ message: "訪問看護指示書を削除しました" });
    } catch (error) {
      console.error("Delete doctor order error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Download doctor order attachment with original filename
  app.get("/api/doctor-orders/:id/attachment/download", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      const [order] = await db.select()
        .from(doctorOrders)
        .where(and(
          eq(doctorOrders.id, id),
          eq(doctorOrders.facilityId, facilityId)
        ))
        .limit(1);

      if (!order) {
        return res.status(404).json({ error: "訪問看護指示書が見つかりません" });
      }

      if (!order.filePath) {
        return res.status(404).json({ error: "添付ファイルがありません" });
      }

      // Download from Object Storage
      const fileBuffer = await downloadFile(order.filePath);
      if (!fileBuffer) {
        return res.status(404).json({ error: "ファイルが見つかりません" });
      }

      // Check if download is requested
      const forceDownload = req.query.download === 'true';

      // Set Content-Disposition header with RFC 5987 encoding for international filenames
      const filename = order.originalFileName || order.filePath.split('/').pop() || 'download';
      const encodedFilename = encodeURIComponent(filename);
      const disposition = forceDownload ? 'attachment' : 'inline';
      res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodedFilename}`);
      res.setHeader('Content-Length', fileBuffer.length.toString());

      // Determine content type from file extension
      const ext = path.extname(filename).toLowerCase();
      const contentType = ext === '.pdf' ? 'application/pdf' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.png' ? 'image/png' : 'application/octet-stream';
      res.setHeader('Content-Type', contentType);

      res.send(fileBuffer);
    } catch (error) {
      console.error("Download doctor order attachment error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Delete doctor order attachment
  app.delete("/api/doctor-orders/:id/attachment", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      // Get current order to find file path
      const [currentOrder] = await db.select()
        .from(doctorOrders)
        .where(and(
          eq(doctorOrders.id, id),
          eq(doctorOrders.facilityId, facilityId)
        ))
        .limit(1);

      if (!currentOrder) {
        return res.status(404).json({ error: "訪問看護指示書が見つかりません" });
      }

      // Delete file from Object Storage if exists
      if (currentOrder.filePath) {
        try {
          await deleteFile(currentOrder.filePath);
        } catch (fileError) {
          console.error('Error deleting file:', fileError);
        }
      }

      // Update database to remove file path
      const [order] = await db.update(doctorOrders)
        .set({ filePath: null, updatedAt: new Date() })
        .where(and(
          eq(doctorOrders.id, id),
          eq(doctorOrders.facilityId, facilityId)
        ))
        .returning();

      res.json({ message: "添付ファイルを削除しました", order });
    } catch (error) {
      console.error("Delete doctor order attachment error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // ========== Insurance Cards API (保険証情報) ==========

  // Get all insurance cards (with optional patient filter)
  app.get("/api/insurance-cards", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.facility?.id || req.user.facilityId;
      const { patientId } = req.query;

      const whereConditions = [
        eq(insuranceCards.facilityId, facilityId),
        eq(insuranceCards.isActive, true)
      ];

      if (patientId && typeof patientId === 'string') {
        whereConditions.push(eq(insuranceCards.patientId, patientId));
      }

      const cards = await db.query.insuranceCards.findMany({
        where: and(...whereConditions),
        with: {
          patient: true
        },
        orderBy: (insuranceCards, { desc }) => [desc(insuranceCards.validFrom)]
      });

      res.json(cards);
    } catch (error) {
      console.error("Get insurance cards error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Get expiring insurance cards (within 30 days) - MUST be before /:id route
  app.get("/api/insurance-cards/expiring", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.facility?.id || req.user.facilityId;
      const today = new Date();
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(today.getDate() + 30);

      const cards = await db.query.insuranceCards.findMany({
        where: and(
          eq(insuranceCards.facilityId, facilityId),
          eq(insuranceCards.isActive, true),
          isNotNull(insuranceCards.validUntil), // Only check cards with expiry date
          lte(insuranceCards.validUntil, thirtyDaysFromNow.toISOString().split('T')[0]),
          gte(insuranceCards.validUntil, today.toISOString().split('T')[0])
        ),
        with: {
          patient: true
        },
        orderBy: (insuranceCards, { asc }) => [asc(insuranceCards.validUntil)]
      });

      res.json(cards);
    } catch (error) {
      console.error("Get expiring insurance cards error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Get all insurance cards for a patient
  app.get("/api/insurance-cards/patient/:patientId", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { patientId } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      const cards = await db.query.insuranceCards.findMany({
        where: and(
          eq(insuranceCards.patientId, patientId),
          eq(insuranceCards.facilityId, facilityId),
          eq(insuranceCards.isActive, true)
        ),
        orderBy: (insuranceCards, { desc }) => [desc(insuranceCards.validFrom)]
      });

      res.json(cards);
    } catch (error) {
      console.error("Get insurance cards error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Get single insurance card
  app.get("/api/insurance-cards/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      const card = await db.query.insuranceCards.findFirst({
        where: and(
          eq(insuranceCards.id, id),
          eq(insuranceCards.facilityId, facilityId)
        )
      });

      if (!card) {
        return res.status(404).json({ error: "保険証情報が見つかりません" });
      }

      res.json(card);
    } catch (error) {
      console.error("Get insurance card error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Create insurance card
  app.post("/api/insurance-cards", requireAuth, documentUpload.single('file'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.facility?.id || req.user.facilityId;

      if (!facilityId) {
        return res.status(401).json({ error: "施設IDが見つかりません" });
      }

      const validatedData = insertInsuranceCardSchema.parse(req.body);

      const cardData: any = {
        ...validatedData,
        facilityId
      };

      // FormDataで空文字列が送信された場合、nullに変換
      if (validatedData.partialBurdenCategory === '') {
        cardData.partialBurdenCategory = null;
      }

      // Add file path and original filename if file was uploaded
      if (req.file) {
        const uploaded = await uploadDocumentFile(req.file, 'insurance-cards');
        cardData.filePath = uploaded.filePath;
        cardData.originalFileName = uploaded.originalFileName;
      }

      const [card] = await db.insert(insuranceCards).values(cardData).returning();

      res.status(201).json(card);
    } catch (error) {

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "入力データが正しくありません",
          details: error.errors
        });
      }
      console.error("Create insurance card error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Update insurance card
  app.put("/api/insurance-cards/:id", requireAuth, documentUpload.single('file'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      const validatedData = updateInsuranceCardSchema.parse(req.body);

      const updateData: any = {
        ...validatedData,
        updatedAt: new Date()
      };

      // FormDataで空文字列が送信された場合、nullに変換
      if (validatedData.partialBurdenCategory === '') {
        updateData.partialBurdenCategory = null;
      }

      // If a new file is uploaded, delete the old one first
      if (req.file) {
        // Get current card to find old file path
        const [currentCard] = await db.select()
          .from(insuranceCards)
          .where(and(
            eq(insuranceCards.id, id),
            eq(insuranceCards.facilityId, facilityId)
          ))
          .limit(1);

        // Delete old file from Object Storage if exists
        if (currentCard?.filePath) {
          try {
            await deleteFile(currentCard.filePath);
          } catch (fileError) {
            console.error('Error deleting old file:', fileError);
          }
        }

        const uploaded = await uploadDocumentFile(req.file, 'insurance-cards');
        updateData.filePath = uploaded.filePath;
        updateData.originalFileName = uploaded.originalFileName;
      }

      const [card] = await db.update(insuranceCards)
        .set(updateData)
        .where(and(
          eq(insuranceCards.id, id),
          eq(insuranceCards.facilityId, facilityId)
        ))
        .returning();

      if (!card) {
        return res.status(404).json({ error: "保険証情報が見つかりません" });
      }

      res.json(card);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "入力データが正しくありません",
          details: error.errors
        });
      }
      console.error("Update insurance card error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Delete (soft delete) insurance card
  app.delete("/api/insurance-cards/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      const [card] = await db.update(insuranceCards)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(
          eq(insuranceCards.id, id),
          eq(insuranceCards.facilityId, facilityId)
        ))
        .returning();

      if (!card) {
        return res.status(404).json({ error: "保険証情報が見つかりません" });
      }

      res.json({ message: "保険証情報を削除しました" });
    } catch (error) {
      console.error("Delete insurance card error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Download insurance card attachment with original filename
  app.get("/api/insurance-cards/:id/attachment/download", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      // Get insurance card with file
      const [card] = await db.select()
        .from(insuranceCards)
        .where(and(
          eq(insuranceCards.id, id),
          eq(insuranceCards.facilityId, facilityId)
        ))
        .limit(1);

      if (!card) {
        return res.status(404).json({ error: "保険証情報が見つかりません" });
      }

      if (!card.filePath) {
        return res.status(404).json({ error: "添付ファイルが見つかりません" });
      }

      // Download from Object Storage
      const fileBuffer = await downloadFile(card.filePath);
      if (!fileBuffer) {
        return res.status(404).json({ error: "ファイルが見つかりません" });
      }

      // Check if download is requested
      const forceDownload = req.query.download === 'true';

      // Set headers
      const filename = card.originalFileName || card.filePath.split('/').pop() || 'download';
      const encodedFilename = encodeURIComponent(filename);
      const disposition = forceDownload ? 'attachment' : 'inline';
      res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodedFilename}`);
      res.setHeader('Content-Length', fileBuffer.length.toString());

      // Determine content type
      const ext = path.extname(filename).toLowerCase();
      const contentType = ext === '.pdf' ? 'application/pdf' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.png' ? 'image/png' : 'application/octet-stream';
      res.setHeader('Content-Type', contentType);

      res.send(fileBuffer);
    } catch (error) {
      console.error("Download insurance card attachment error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Delete insurance card attachment
  app.delete("/api/insurance-cards/:id/attachment", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      // Get current card to find file path
      const [currentCard] = await db.select()
        .from(insuranceCards)
        .where(and(
          eq(insuranceCards.id, id),
          eq(insuranceCards.facilityId, facilityId)
        ))
        .limit(1);

      if (!currentCard) {
        return res.status(404).json({ error: "保険証情報が見つかりません" });
      }

      // Delete file from Object Storage if exists
      if (currentCard.filePath) {
        try {
          await deleteFile(currentCard.filePath);
        } catch (fileError) {
          console.error('Error deleting file from Object Storage:', fileError);
        }
      }

      // Update database to remove file path
      const [card] = await db.update(insuranceCards)
        .set({ filePath: null, updatedAt: new Date() })
        .where(and(
          eq(insuranceCards.id, id),
          eq(insuranceCards.facilityId, facilityId)
        ))
        .returning();

      res.json({ message: "添付ファイルを削除しました", card });
    } catch (error) {
      console.error("Delete insurance card attachment error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // ========== Public Expense Cards API (公費負担医療情報) ==========

  // Get all public expense cards for a patient
  app.get("/api/public-expense-cards", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.facility?.id || req.user.facilityId;
      const { patientId } = req.query;

      if (!patientId || typeof patientId !== 'string') {
        return res.status(400).json({ error: "患者IDが必要です" });
      }

      const cards = await db.query.publicExpenseCards.findMany({
        where: and(
          eq(publicExpenseCards.patientId, patientId),
          eq(publicExpenseCards.facilityId, facilityId)
        ),
        orderBy: asc(publicExpenseCards.priority),
      });

      res.json(cards);
    } catch (error) {
      console.error("Get public expense cards error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Get a single public expense card by ID
  app.get("/api/public-expense-cards/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.facility?.id || req.user.facilityId;
      const { id } = req.params;

      const card = await db.query.publicExpenseCards.findFirst({
        where: and(
          eq(publicExpenseCards.id, id),
          eq(publicExpenseCards.facilityId, facilityId)
        ),
      });

      if (!card) {
        return res.status(404).json({ error: "公費情報が見つかりません" });
      }

      res.json(card);
    } catch (error) {
      console.error("Get public expense card error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Create a new public expense card
  app.post("/api/public-expense-cards", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.facility?.id || req.user.facilityId;
      const data = req.body;

      // Validate facility access
      if (data.facilityId && data.facilityId !== facilityId) {
        return res.status(403).json({ error: "アクセス権限がありません" });
      }

      // Check for duplicate priority
      if (data.priority) {
        const existingCard = await db.query.publicExpenseCards.findFirst({
          where: and(
            eq(publicExpenseCards.patientId, data.patientId),
            eq(publicExpenseCards.facilityId, facilityId),
            eq(publicExpenseCards.priority, data.priority),
            eq(publicExpenseCards.isActive, true)
          ),
        });

        if (existingCard) {
          return res.status(400).json({
            error: `優先順位${data.priority}は既に使用されています。別の優先順位を選択してください。`
          });
        }
      }

      const [newCard] = await db.insert(publicExpenseCards)
        .values({
          ...data,
          facilityId,
          id: crypto.randomUUID(),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      res.status(201).json(newCard);
    } catch (error) {
      console.error("Create public expense card error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Update a public expense card
  app.patch("/api/public-expense-cards/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.facility?.id || req.user.facilityId;
      const { id } = req.params;
      const data = req.body;

      // Get the current card
      const currentCard = await db.query.publicExpenseCards.findFirst({
        where: and(
          eq(publicExpenseCards.id, id),
          eq(publicExpenseCards.facilityId, facilityId)
        ),
      });

      if (!currentCard) {
        return res.status(404).json({ error: "公費情報が見つかりません" });
      }

      // Check for duplicate priority (only if priority is being changed)
      if (data.priority && data.priority !== currentCard.priority) {
        const existingCard = await db.query.publicExpenseCards.findFirst({
          where: and(
            eq(publicExpenseCards.patientId, currentCard.patientId),
            eq(publicExpenseCards.facilityId, facilityId),
            eq(publicExpenseCards.priority, data.priority),
            eq(publicExpenseCards.isActive, true),
            ne(publicExpenseCards.id, id) // Exclude current card
          ),
        });

        if (existingCard) {
          return res.status(400).json({
            error: `優先順位${data.priority}は既に使用されています。別の優先順位を選択してください。`
          });
        }
      }

      const [updatedCard] = await db.update(publicExpenseCards)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(and(
          eq(publicExpenseCards.id, id),
          eq(publicExpenseCards.facilityId, facilityId)
        ))
        .returning();

      res.json(updatedCard);
    } catch (error) {
      console.error("Update public expense card error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Delete a public expense card
  app.delete("/api/public-expense-cards/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.facility?.id || req.user.facilityId;
      const { id } = req.params;

      const [deletedCard] = await db.delete(publicExpenseCards)
        .where(and(
          eq(publicExpenseCards.id, id),
          eq(publicExpenseCards.facilityId, facilityId)
        ))
        .returning();

      if (!deletedCard) {
        return res.status(404).json({ error: "公費情報が見つかりません" });
      }

      res.json({ message: "公費情報を削除しました" });
    } catch (error) {
      console.error("Delete public expense card error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // ========== Care Plans API (訪問看護計画書) ==========

  // Get all care plans with optional patient filter
  app.get("/api/care-plans", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.facility?.id || req.user.facilityId;
      const { patientId } = req.query;

      const whereConditions = [
        eq(carePlans.facilityId, facilityId),
        eq(carePlans.isActive, true)
      ];

      if (patientId && typeof patientId === 'string') {
        whereConditions.push(eq(carePlans.patientId, patientId));
      }

      const plans = await db.query.carePlans.findMany({
        where: and(...whereConditions),
        with: {
          patient: true,
          doctorOrder: true,
          createdBy: true,
          approvedBy: true,
        },
        orderBy: (carePlans, { desc }) => [desc(carePlans.planDate)]
      });

      res.json(plans);
    } catch (error) {
      console.error("Get care plans error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Get single care plan
  app.get("/api/care-plans/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      const plan = await db.query.carePlans.findFirst({
        where: and(
          eq(carePlans.id, id),
          eq(carePlans.facilityId, facilityId)
        ),
        with: {
          patient: true,
          doctorOrder: true,
          createdBy: true,
          approvedBy: true,
        }
      });

      if (!plan) {
        return res.status(404).json({ error: "訪問看護計画書が見つかりません" });
      }

      res.json(plan);
    } catch (error) {
      console.error("Get care plan error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Create care plan
  app.post("/api/care-plans", requireAuth, documentUpload.single('file'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.facility?.id || req.user.facilityId;
      const userId = req.session.userId;

      if (!facilityId || !userId) {
        return res.status(401).json({ error: "認証情報が見つかりません" });
      }

      const validatedData = insertCarePlanSchema.parse(req.body);

      const planData: any = {
        ...validatedData,
        facilityId,
        createdBy: userId,
      };

      if (req.file) {
        const uploaded = await uploadDocumentFile(req.file, 'care-plans');
        planData.filePath = uploaded.filePath;
        planData.originalFileName = uploaded.originalFileName;
      }

      const [plan] = await db.insert(carePlans).values(planData).returning();

      // Fetch the plan with relations
      const planWithRelations = await db.query.carePlans.findFirst({
        where: eq(carePlans.id, plan.id),
        with: {
          patient: true,
          doctorOrder: true,
          createdBy: true,
          approvedBy: true,
        }
      });

      res.status(201).json(planWithRelations);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Care plan validation error:", error.errors);
        return res.status(400).json({
          error: "入力データが正しくありません",
          details: error.errors
        });
      }
      console.error("Create care plan error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Update care plan
  app.put("/api/care-plans/:id", requireAuth, documentUpload.single('file'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      const validatedData = updateCarePlanSchema.parse(req.body);

      const updateData: any = {
        ...validatedData,
        updatedAt: new Date()
      };

      if (req.file) {
        const [currentPlan] = await db.select()
          .from(carePlans)
          .where(and(
            eq(carePlans.id, id),
            eq(carePlans.facilityId, facilityId)
          ))
          .limit(1);

        // Delete old file from Object Storage if exists
        if (currentPlan?.filePath) {
          try {
            await deleteFile(currentPlan.filePath);
          } catch (fileError) {
            console.error('Error deleting old file:', fileError);
          }
        }

        const uploaded = await uploadDocumentFile(req.file, 'care-plans');
        updateData.filePath = uploaded.filePath;
        updateData.originalFileName = uploaded.originalFileName;
      }

      const [plan] = await db.update(carePlans)
        .set(updateData)
        .where(and(
          eq(carePlans.id, id),
          eq(carePlans.facilityId, facilityId)
        ))
        .returning();

      if (!plan) {
        return res.status(404).json({ error: "訪問看護計画書が見つかりません" });
      }

      // Fetch the plan with relations
      const planWithRelations = await db.query.carePlans.findFirst({
        where: eq(carePlans.id, plan.id),
        with: {
          patient: true,
          doctorOrder: true,
          createdBy: true,
          approvedBy: true,
        }
      });

      res.json(planWithRelations);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "入力データが正しくありません",
          details: error.errors
        });
      }
      console.error("Update care plan error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Delete (soft delete) care plan
  // Download care plan attachment
  app.get("/api/care-plans/:id/attachment/download", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      const [plan] = await db.select()
        .from(carePlans)
        .where(and(
          eq(carePlans.id, id),
          eq(carePlans.facilityId, facilityId)
        ))
        .limit(1);

      if (!plan) {
        return res.status(404).json({ error: "訪問看護計画書が見つかりません" });
      }

      if (!plan.filePath) {
        return res.status(404).json({ error: "添付ファイルが見つかりません" });
      }

      // Download from Object Storage
      const fileBuffer = await downloadFile(plan.filePath);
      if (!fileBuffer) {
        return res.status(404).json({ error: "ファイルが見つかりません" });
      }

      // Check if download is requested
      const forceDownload = req.query.download === 'true';

      // Set headers
      const filename = plan.originalFileName || plan.filePath.split('/').pop() || 'download';
      const encodedFilename = encodeURIComponent(filename);
      const disposition = forceDownload ? 'attachment' : 'inline';
      res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodedFilename}`);
      res.setHeader('Content-Length', fileBuffer.length.toString());

      // Determine content type
      const ext = path.extname(filename).toLowerCase();
      const contentType = ext === '.pdf' ? 'application/pdf' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.png' ? 'image/png' : 'application/octet-stream';
      res.setHeader('Content-Type', contentType);

      res.send(fileBuffer);
    } catch (error) {
      console.error("Download care plan attachment error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Delete care plan attachment
  app.delete("/api/care-plans/:id/attachment", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      const [currentPlan] = await db.select()
        .from(carePlans)
        .where(and(
          eq(carePlans.id, id),
          eq(carePlans.facilityId, facilityId)
        ))
        .limit(1);

      if (!currentPlan) {
        return res.status(404).json({ error: "訪問看護計画書が見つかりません" });
      }

      if (currentPlan.filePath) {
        try {
          await deleteFile(currentPlan.filePath);
        } catch (fileError) {
          console.error('Error deleting file from Object Storage:', fileError);
        }
      }

      const [plan] = await db.update(carePlans)
        .set({ filePath: null, originalFileName: null, updatedAt: new Date() })
        .where(and(
          eq(carePlans.id, id),
          eq(carePlans.facilityId, facilityId)
        ))
        .returning();

      res.json({ message: "添付ファイルを削除しました", plan });
    } catch (error) {
      console.error("Delete care plan attachment error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  app.delete("/api/care-plans/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      const [plan] = await db.update(carePlans)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(
          eq(carePlans.id, id),
          eq(carePlans.facilityId, facilityId)
        ))
        .returning();

      if (!plan) {
        return res.status(404).json({ error: "訪問看護計画書が見つかりません" });
      }

      res.json({ message: "訪問看護計画書を削除しました" });
    } catch (error) {
      console.error("Delete care plan error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // ========== Service Care Plans API (居宅サービス計画書) ==========

  // Get all service care plans with optional patient filter
  app.get("/api/service-care-plans", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.facility?.id || req.user.facilityId;
      const { patientId } = req.query;

      const whereConditions = [
        eq(serviceCarePlans.facilityId, facilityId),
        eq(serviceCarePlans.isActive, true)
      ];

      if (patientId && typeof patientId === 'string') {
        whereConditions.push(eq(serviceCarePlans.patientId, patientId));
      }

      const plans = await db.query.serviceCarePlans.findMany({
        where: and(...whereConditions),
        with: {
          patient: true,
          facility: true,
        },
        orderBy: (serviceCarePlans, { desc }) => [desc(serviceCarePlans.planDate)]
      });

      res.json(plans);
    } catch (error) {
      console.error("Get service care plans error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Get single service care plan
  app.get("/api/service-care-plans/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      const plan = await db.query.serviceCarePlans.findFirst({
        where: and(
          eq(serviceCarePlans.id, id),
          eq(serviceCarePlans.facilityId, facilityId)
        ),
        with: {
          patient: true,
          facility: true,
        }
      });

      if (!plan) {
        return res.status(404).json({ error: "居宅サービス計画書が見つかりません" });
      }

      res.json(plan);
    } catch (error) {
      console.error("Get service care plan error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Create service care plan
  app.post("/api/service-care-plans", requireAuth, documentUpload.single('file'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.facility?.id || req.user.facilityId;

      if (!facilityId) {
        return res.status(401).json({ error: "認証情報が見つかりません" });
      }

      const validatedData = insertServiceCarePlanSchema.parse(req.body);

      const planData: any = {
        ...validatedData,
        facilityId,
      };

      if (req.file) {
        const uploaded = await uploadDocumentFile(req.file, 'care-plan-versions');
        planData.filePath = uploaded.filePath;
        planData.originalFileName = uploaded.originalFileName;
      }

      const [plan] = await db.insert(serviceCarePlans).values(planData).returning();

      // Fetch the plan with relations
      const planWithRelations = await db.query.serviceCarePlans.findFirst({
        where: eq(serviceCarePlans.id, plan.id),
        with: {
          patient: true,
          facility: true,
        }
      });

      res.status(201).json(planWithRelations);
    } catch (error) {
      console.error("Create service care plan error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "入力データが不正です", details: error.errors });
      }
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Update service care plan
  app.put("/api/service-care-plans/:id", requireAuth, documentUpload.single('file'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      if (!facilityId) {
        return res.status(401).json({ error: "認証情報が見つかりません" });
      }

      const validatedData = updateServiceCarePlanSchema.parse(req.body);

      const updateData: any = {
        ...validatedData,
        updatedAt: new Date(),
      };

      if (req.file) {
        const uploaded = await uploadDocumentFile(req.file, 'care-plan-versions');
        updateData.filePath = uploaded.filePath;
        updateData.originalFileName = uploaded.originalFileName;
      }

      const [plan] = await db.update(serviceCarePlans)
        .set(updateData)
        .where(and(
          eq(serviceCarePlans.id, id),
          eq(serviceCarePlans.facilityId, facilityId)
        ))
        .returning();

      if (!plan) {
        return res.status(404).json({ error: "居宅サービス計画書が見つかりません" });
      }

      // Fetch the plan with relations
      const planWithRelations = await db.query.serviceCarePlans.findFirst({
        where: eq(serviceCarePlans.id, plan.id),
        with: {
          patient: true,
          facility: true,
        }
      });

      res.json(planWithRelations);
    } catch (error) {
      console.error("Update service care plan error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "入力データが不正です", details: error.errors });
      }
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Download service care plan attachment
  app.get("/api/service-care-plans/:id/attachment/download", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      const plan = await db.query.serviceCarePlans.findFirst({
        where: and(
          eq(serviceCarePlans.id, id),
          eq(serviceCarePlans.facilityId, facilityId)
        )
      });

      if (!plan || !plan.filePath) {
        return res.status(404).json({ error: "ファイルが見つかりません" });
      }

      // Download from Object Storage
      const fileBuffer = await downloadFile(plan.filePath);
      if (!fileBuffer) {
        return res.status(404).json({ error: "ファイルが見つかりません" });
      }

      // Check if download is requested
      const forceDownload = req.query.download === 'true';

      // Set headers
      const filename = plan.originalFileName || plan.filePath.split('/').pop() || 'download';
      const encodedFilename = encodeURIComponent(filename);
      const disposition = forceDownload ? 'attachment' : 'inline';
      res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodedFilename}`);
      res.setHeader('Content-Length', fileBuffer.length.toString());

      // Determine content type
      const ext = path.extname(filename).toLowerCase();
      const contentType = ext === '.pdf' ? 'application/pdf' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.png' ? 'image/png' : 'application/octet-stream';
      res.setHeader('Content-Type', contentType);

      res.send(fileBuffer);
    } catch (error) {
      console.error("Download service care plan attachment error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Delete service care plan attachment
  app.delete("/api/service-care-plans/:id/attachment", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      const plan = await db.query.serviceCarePlans.findFirst({
        where: and(
          eq(serviceCarePlans.id, id),
          eq(serviceCarePlans.facilityId, facilityId)
        )
      });

      if (!plan) {
        return res.status(404).json({ error: "居宅サービス計画書が見つかりません" });
      }

      if (plan.filePath) {
        try {
          await deleteFile(plan.filePath);
        } catch (fileError) {
          console.error('Error deleting file from Object Storage:', fileError);
        }
      }

      await db.update(serviceCarePlans)
        .set({
          filePath: null,
          originalFileName: null,
          updatedAt: new Date()
        })
        .where(eq(serviceCarePlans.id, id));

      res.json({ message: "添付ファイルを削除しました" });
    } catch (error) {
      console.error("Delete service care plan attachment error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Delete service care plan (logical delete)
  app.delete("/api/service-care-plans/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      const [plan] = await db.update(serviceCarePlans)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(
          eq(serviceCarePlans.id, id),
          eq(serviceCarePlans.facilityId, facilityId)
        ))
        .returning();

      if (!plan) {
        return res.status(404).json({ error: "居宅サービス計画書が見つかりません" });
      }

      res.json({ message: "居宅サービス計画書を削除しました" });
    } catch (error) {
      console.error("Delete service care plan error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // ========== Care Reports API (訪問看護報告書) ==========

  // Get all care reports with optional patient filter
  app.get("/api/care-reports", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.facility?.id || req.user.facilityId;
      const { patientId } = req.query;

      const whereConditions = [
        eq(careReports.facilityId, facilityId),
        eq(careReports.isActive, true)
      ];

      if (patientId && typeof patientId === 'string') {
        whereConditions.push(eq(careReports.patientId, patientId));
      }

      const reports = await db.query.careReports.findMany({
        where: and(...whereConditions),
        with: {
          patient: true,
          carePlan: true,
          createdBy: true,
          approvedBy: true,
        },
        orderBy: (careReports, { desc }) => [
          desc(careReports.reportDate),
          desc(careReports.createdAt)
        ]
      });

      res.json(reports);
    } catch (error) {
      console.error("Get care reports error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Get single care report
  app.get("/api/care-reports/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      const report = await db.query.careReports.findFirst({
        where: and(
          eq(careReports.id, id),
          eq(careReports.facilityId, facilityId)
        ),
        with: {
          patient: true,
          carePlan: true,
          createdBy: true,
          approvedBy: true,
        }
      });

      if (!report) {
        return res.status(404).json({ error: "訪問看護報告書が見つかりません" });
      }

      res.json(report);
    } catch (error) {
      console.error("Get care report error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Create care report
  app.post("/api/care-reports", requireAuth, documentUpload.single('file'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.facility?.id || req.user.facilityId;
      const userId = req.session.userId;

      if (!facilityId || !userId) {
        return res.status(401).json({ error: "認証情報が見つかりません" });
      }

      // FormDataの場合は数値型を変換
      const requestData = { ...req.body };
      if (requestData.visitCount !== undefined) {
        requestData.visitCount = parseInt(requestData.visitCount);
      }

      const validatedData = insertCareReportSchema.parse(requestData);

      const reportData: any = {
        ...validatedData,
        facilityId,
        createdBy: userId,
      };

      if (req.file) {
        const uploaded = await uploadDocumentFile(req.file, 'visit-reports');
        reportData.filePath = uploaded.filePath;
        reportData.originalFileName = uploaded.originalFileName;
      }

      const [report] = await db.insert(careReports).values(reportData).returning();

      // Fetch the report with relations
      const reportWithRelations = await db.query.careReports.findFirst({
        where: eq(careReports.id, report.id),
        with: {
          patient: true,
          carePlan: true,
          createdBy: true,
          approvedBy: true,
        }
      });

      res.status(201).json(reportWithRelations);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "入力データが正しくありません",
          details: error.errors
        });
      }
      console.error("Create care report error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Update care report
  app.put("/api/care-reports/:id", requireAuth, documentUpload.single('file'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      // FormDataの場合は数値型を変換
      const requestData = { ...req.body };
      if (requestData.visitCount !== undefined) {
        requestData.visitCount = parseInt(requestData.visitCount);
      }
      // carePlanIdが空文字列の場合はnullに変換（計画書を削除する場合）
      if (requestData.carePlanId === '') {
        requestData.carePlanId = null;
      }

      const validatedData = updateCareReportSchema.parse(requestData);

      const updateData: any = {
        ...validatedData,
        updatedAt: new Date()
      };

      if (req.file) {
        const [currentReport] = await db.select()
          .from(careReports)
          .where(and(
            eq(careReports.id, id),
            eq(careReports.facilityId, facilityId)
          ))
          .limit(1);

        // Delete old file from Object Storage if exists
        if (currentReport?.filePath) {
          try {
            await deleteFile(currentReport.filePath);
          } catch (fileError) {
            console.error('Error deleting old file:', fileError);
          }
        }

        const uploaded = await uploadDocumentFile(req.file, 'visit-reports');
        updateData.filePath = uploaded.filePath;
        updateData.originalFileName = uploaded.originalFileName;
      }

      const [report] = await db.update(careReports)
        .set(updateData)
        .where(and(
          eq(careReports.id, id),
          eq(careReports.facilityId, facilityId)
        ))
        .returning();

      if (!report) {
        return res.status(404).json({ error: "訪問看護報告書が見つかりません" });
      }

      // Fetch the report with relations
      const reportWithRelations = await db.query.careReports.findFirst({
        where: eq(careReports.id, report.id),
        with: {
          patient: true,
          carePlan: true,
          createdBy: true,
          approvedBy: true,
        }
      });

      res.json(reportWithRelations);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "入力データが正しくありません",
          details: error.errors
        });
      }
      console.error("Update care report error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Delete (soft delete) care report
  // Download care report attachment
  app.get("/api/care-reports/:id/attachment/download", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      const [report] = await db.select()
        .from(careReports)
        .where(and(
          eq(careReports.id, id),
          eq(careReports.facilityId, facilityId)
        ))
        .limit(1);

      if (!report) {
        return res.status(404).json({ error: "訪問看護報告書が見つかりません" });
      }

      if (!report.filePath) {
        return res.status(404).json({ error: "添付ファイルが見つかりません" });
      }

      // Download from Object Storage
      const fileBuffer = await downloadFile(report.filePath);
      if (!fileBuffer) {
        return res.status(404).json({ error: "ファイルが見つかりません" });
      }

      // Check if download is requested
      const forceDownload = req.query.download === 'true';

      // Set headers
      const filename = report.originalFileName || report.filePath.split('/').pop() || 'download';
      const encodedFilename = encodeURIComponent(filename);
      const disposition = forceDownload ? 'attachment' : 'inline';
      res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodedFilename}`);
      res.setHeader('Content-Length', fileBuffer.length.toString());

      // Determine content type
      const ext = path.extname(filename).toLowerCase();
      const contentType = ext === '.pdf' ? 'application/pdf' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.png' ? 'image/png' : 'application/octet-stream';
      res.setHeader('Content-Type', contentType);

      res.send(fileBuffer);
    } catch (error) {
      console.error("Download care report attachment error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Delete care report attachment
  app.delete("/api/care-reports/:id/attachment", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      const [currentReport] = await db.select()
        .from(careReports)
        .where(and(
          eq(careReports.id, id),
          eq(careReports.facilityId, facilityId)
        ))
        .limit(1);

      if (!currentReport) {
        return res.status(404).json({ error: "訪問看護報告書が見つかりません" });
      }

      if (currentReport.filePath) {
        try {
          await deleteFile(currentReport.filePath);
        } catch (fileError) {
          console.error('Error deleting file from Object Storage:', fileError);
        }
      }

      const [report] = await db.update(careReports)
        .set({ filePath: null, originalFileName: null, updatedAt: new Date() })
        .where(and(
          eq(careReports.id, id),
          eq(careReports.facilityId, facilityId)
        ))
        .returning();

      res.json({ message: "添付ファイルを削除しました", report });
    } catch (error) {
      console.error("Delete care report attachment error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  app.delete("/api/care-reports/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      const [report] = await db.update(careReports)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(
          eq(careReports.id, id),
          eq(careReports.facilityId, facilityId)
        ))
        .returning();

      if (!report) {
        return res.status(404).json({ error: "訪問看護報告書が見つかりません" });
      }

      res.json({ message: "訪問看護報告書を削除しました" });
    } catch (error) {
      console.error("Delete care report error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // ========== PDF Export APIs ==========

  // Export care plan to PDF
  app.get("/api/care-plans/:id/pdf", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      // Fetch care plan with relations
      const plan = await db.query.carePlans.findFirst({
        where: and(
          eq(carePlans.id, id),
          eq(carePlans.facilityId, facilityId),
          eq(carePlans.isActive, true)
        ),
        with: {
          patient: true,
          facility: true,
          createdBy: true,
          approvedBy: true,
        }
      });

      if (!plan) {
        return res.status(404).json({ error: "訪問看護計画書が見つかりません" });
      }

      // Create PDF document with Japanese font
      const doc = new PDFDocument({ margin: 50, size: 'A4' });

      // Register Japanese font
      const fontPath = path.join(process.cwd(), 'server', 'fonts', 'NotoSansCJKjp-Regular.otf');
      doc.registerFont('NotoSans', fontPath);
      doc.font('NotoSans');

      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=care-plan-${plan.planNumber}.pdf`);

      // Pipe PDF to response
      doc.pipe(res);

      // Add content
      doc.fontSize(20).text('訪問看護計画書', { align: 'center' });
      doc.moveDown();

      doc.fontSize(12);
      doc.text(`計画書番号: ${plan.planNumber}`);
      doc.text(`計画日: ${plan.planDate ? new Date(plan.planDate).toLocaleDateString('ja-JP') : '未設定'}`);
      doc.text(`利用者: ${plan.patient.lastName} ${plan.patient.firstName}`);
      doc.text(`計画期間: ${plan.planPeriodStart ? new Date(plan.planPeriodStart).toLocaleDateString('ja-JP') : '未設定'} ～ ${plan.planPeriodEnd ? new Date(plan.planPeriodEnd).toLocaleDateString('ja-JP') : '未設定'}`);
      doc.moveDown();

      doc.text('看護目標:');
      doc.fontSize(10).text(plan.nursingGoals || '未記入', { indent: 20 });
      doc.moveDown();

      doc.fontSize(12).text('看護計画:');
      doc.fontSize(10).text(plan.nursingPlan || '未記入', { indent: 20 });
      doc.moveDown();

      doc.fontSize(12).text('週間訪問計画:');
      doc.fontSize(10).text(plan.weeklyVisitPlan || '未記入', { indent: 20 });
      doc.moveDown();

      if (plan.remarks) {
        doc.fontSize(12).text('備考:');
        doc.fontSize(10).text(plan.remarks, { indent: 20 });
        doc.moveDown();
      }

      doc.fontSize(10);
      if (plan.createdBy) {
        doc.text(`作成者: ${plan.createdBy.fullName}`);
      }
      if (plan.approvedBy) {
        doc.text(`承認者: ${plan.approvedBy.fullName}`);
      }

      // Finalize PDF
      doc.end();
    } catch (error) {
      console.error("Export care plan PDF error:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "PDF生成中にエラーが発生しました" });
      }
    }
  });

  // Export care report to PDF
  app.get("/api/care-reports/:id/pdf", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      // Fetch care report with relations
      const report = await db.query.careReports.findFirst({
        where: and(
          eq(careReports.id, id),
          eq(careReports.facilityId, facilityId),
          eq(careReports.isActive, true)
        ),
        with: {
          patient: true,
          facility: true,
          carePlan: true,
          createdBy: true,
          approvedBy: true,
        }
      });

      if (!report) {
        return res.status(404).json({ error: "訪問看護報告書が見つかりません" });
      }

      // Create PDF document with Japanese font
      const doc = new PDFDocument({ margin: 50, size: 'A4' });

      // Register Japanese font
      const fontPath = path.join(process.cwd(), 'server', 'fonts', 'NotoSansCJKjp-Regular.otf');
      doc.registerFont('NotoSans', fontPath);
      doc.font('NotoSans');

      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=care-report-${report.reportNumber}.pdf`);

      // Pipe PDF to response
      doc.pipe(res);

      // Add content
      doc.fontSize(20).text('訪問看護報告書', { align: 'center' });
      doc.moveDown();

      doc.fontSize(12);
      doc.text(`報告書番号: ${report.reportNumber}`);
      doc.text(`報告日: ${report.reportDate ? new Date(report.reportDate).toLocaleDateString('ja-JP') : '未設定'}`);
      doc.text(`利用者: ${report.patient.lastName} ${report.patient.firstName}`);
      doc.text(`報告期間: ${report.reportPeriodStart ? new Date(report.reportPeriodStart).toLocaleDateString('ja-JP') : '未設定'} ～ ${report.reportPeriodEnd ? new Date(report.reportPeriodEnd).toLocaleDateString('ja-JP') : '未設定'}`);
      doc.text(`訪問回数: ${report.visitCount || 0}回`);
      doc.moveDown();

      doc.text('利用者の状態:');
      doc.fontSize(10).text(report.patientCondition || '未記入', { indent: 20 });
      doc.moveDown();

      doc.fontSize(12).text('看護の成果:');
      doc.fontSize(10).text(report.nursingOutcomes || '未記入', { indent: 20 });
      doc.moveDown();

      doc.fontSize(12).text('問題点と対応:');
      doc.fontSize(10).text(report.problemsAndActions || '未記入', { indent: 20 });
      doc.moveDown();

      if (report.familySupport) {
        doc.fontSize(12).text('家族支援:');
        doc.fontSize(10).text(report.familySupport, { indent: 20 });
        doc.moveDown();
      }

      if (report.communicationWithDoctor) {
        doc.fontSize(12).text('医師との連携:');
        doc.fontSize(10).text(report.communicationWithDoctor, { indent: 20 });
        doc.moveDown();
      }

      if (report.communicationWithCareManager) {
        doc.fontSize(12).text('ケアマネージャーとの連携:');
        doc.fontSize(10).text(report.communicationWithCareManager, { indent: 20 });
        doc.moveDown();
      }

      if (report.remarks) {
        doc.fontSize(12).text('備考:');
        doc.fontSize(10).text(report.remarks, { indent: 20 });
        doc.moveDown();
      }

      doc.fontSize(10);
      if (report.createdBy) {
        doc.text(`作成者: ${report.createdBy.fullName}`);
      }
      if (report.approvedBy) {
        doc.text(`承認者: ${report.approvedBy.fullName}`);
      }

      // Finalize PDF
      doc.end();
    } catch (error) {
      console.error("Export care report PDF error:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "PDF生成中にエラーが発生しました" });
      }
    }
  });

  // ========== Contracts API (契約書・同意書) ==========

  // Get all contracts (with optional patient filter)
  app.get("/api/contracts", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.facility?.id || req.user.facilityId;
      const { patientId } = req.query;

      const whereConditions = [
        eq(contracts.facilityId, facilityId),
        eq(contracts.isActive, true)
      ];

      if (patientId && typeof patientId === 'string') {
        whereConditions.push(eq(contracts.patientId, patientId));
      }

      const allContracts = await db.query.contracts.findMany({
        where: and(...whereConditions),
        with: {
          patient: true,
          witnessedBy: {
            columns: {
              id: true,
              fullName: true
            }
          }
        },
        orderBy: (contracts, { desc }) => [
          desc(contracts.contractDate),
          desc(contracts.createdAt)
        ]
      });

      res.json(allContracts);
    } catch (error) {
      console.error("Get contracts error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Create new contract
  app.post("/api/contracts", requireAuth, documentUpload.single('file'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.facility?.id || req.user.facilityId;
      const validatedData = insertContractSchema.parse(req.body);

      const contractData: any = {
        ...validatedData,
        facilityId: facilityId,
      };

      // Convert empty string witnessedBy to null to avoid foreign key constraint violation
      if (contractData.witnessedBy === '' || contractData.witnessedBy === undefined) {
        contractData.witnessedBy = null;
      }

      // Add file path and original filename if file was uploaded
      if (req.file) {
        const uploaded = await uploadDocumentFile(req.file, 'contracts');
        contractData.filePath = uploaded.filePath;
        contractData.originalFileName = uploaded.originalFileName;
      }

      const [contract] = await db.insert(contracts)
        .values(contractData)
        .returning();

      // Fetch the contract with relations
      const contractWithRelations = await db.query.contracts.findFirst({
        where: eq(contracts.id, contract.id),
        with: {
          patient: true,
          witnessedBy: {
            columns: {
              fullName: true
            }
          }
        }
      });

      res.status(201).json(contractWithRelations);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Contract validation error:", error.errors);
        return res.status(400).json({
          error: "入力データが正しくありません",
          details: error.errors
        });
      }
      console.error("Create contract error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Update contract
  app.put("/api/contracts/:id", requireAuth, documentUpload.single('file'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;
      const validatedData = updateContractSchema.parse(req.body);

      const updateData: any = {
        ...validatedData,
        updatedAt: new Date()
      };

      // Convert empty string witnessedBy to null to avoid foreign key constraint violation
      if (updateData.witnessedBy === '' || updateData.witnessedBy === undefined) {
        updateData.witnessedBy = null;
      }

      // If a new file is uploaded, delete the old one first
      if (req.file) {
        // Get current contract to find old file path
        const [currentContract] = await db.select()
          .from(contracts)
          .where(and(
            eq(contracts.id, id),
            eq(contracts.facilityId, facilityId)
          ))
          .limit(1);

        // Delete old file from Object Storage if exists
        if (currentContract?.filePath) {
          try {
            await deleteFile(currentContract.filePath);
          } catch (fileError) {
            console.error('Error deleting old file:', fileError);
          }
        }

        const uploaded = await uploadDocumentFile(req.file, 'contracts');
        updateData.filePath = uploaded.filePath;
        updateData.originalFileName = uploaded.originalFileName;
      }

      const [contract] = await db.update(contracts)
        .set(updateData)
        .where(and(
          eq(contracts.id, id),
          eq(contracts.facilityId, facilityId)
        ))
        .returning();

      if (!contract) {
        return res.status(404).json({ error: "契約書が見つかりません" });
      }

      // Fetch the contract with relations
      const contractWithRelations = await db.query.contracts.findFirst({
        where: eq(contracts.id, contract.id),
        with: {
          patient: true,
          witnessedBy: {
            columns: {
              fullName: true
            }
          }
        }
      });

      res.json(contractWithRelations);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "入力データが正しくありません",
          details: error.errors
        });
      }
      console.error("Update contract error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Delete (soft delete) contract
  // Download contract attachment with original filename
  app.get("/api/contracts/:id/attachment/download", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      const [contract] = await db.select()
        .from(contracts)
        .where(and(
          eq(contracts.id, id),
          eq(contracts.facilityId, facilityId)
        ))
        .limit(1);

      if (!contract) {
        return res.status(404).json({ error: "契約書が見つかりません" });
      }

      if (!contract.filePath) {
        return res.status(404).json({ error: "添付ファイルが見つかりません" });
      }

      // Download from Object Storage
      const fileBuffer = await downloadFile(contract.filePath);
      if (!fileBuffer) {
        return res.status(404).json({ error: "ファイルが見つかりません" });
      }

      // Check if download is requested
      const forceDownload = req.query.download === 'true';

      // Set headers
      const filename = contract.originalFileName || contract.filePath.split('/').pop() || 'download';
      const encodedFilename = encodeURIComponent(filename);
      const disposition = forceDownload ? 'attachment' : 'inline';
      res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodedFilename}`);
      res.setHeader('Content-Length', fileBuffer.length.toString());

      // Determine content type
      const ext = path.extname(filename).toLowerCase();
      const contentType = ext === '.pdf' ? 'application/pdf' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.png' ? 'image/png' : 'application/octet-stream';
      res.setHeader('Content-Type', contentType);

      res.send(fileBuffer);
    } catch (error) {
      console.error("Download contract attachment error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Delete contract attachment
  app.delete("/api/contracts/:id/attachment", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      // Get current contract to find file path
      const [currentContract] = await db.select()
        .from(contracts)
        .where(and(
          eq(contracts.id, id),
          eq(contracts.facilityId, facilityId)
        ))
        .limit(1);

      if (!currentContract) {
        return res.status(404).json({ error: "契約書が見つかりません" });
      }

      // Delete file from Object Storage if exists
      if (currentContract.filePath) {
        try {
          await deleteFile(currentContract.filePath);
        } catch (fileError) {
          console.error('Error deleting file from Object Storage:', fileError);
        }
      }

      // Update database to remove file path
      const [contract] = await db.update(contracts)
        .set({ filePath: null, originalFileName: null, updatedAt: new Date() })
        .where(and(
          eq(contracts.id, id),
          eq(contracts.facilityId, facilityId)
        ))
        .returning();

      res.json({ message: "添付ファイルを削除しました", contract });
    } catch (error) {
      console.error("Delete contract attachment error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  app.delete("/api/contracts/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      const [contract] = await db.update(contracts)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(
          eq(contracts.id, id),
          eq(contracts.facilityId, facilityId)
        ))
        .returning();

      if (!contract) {
        return res.status(404).json({ error: "契約書が見つかりません" });
      }

      res.json({ message: "契約書を削除しました" });
    } catch (error) {
      console.error("Delete contract error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Get contracts for a specific patient
  app.get("/api/patients/:patientId/contracts", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { patientId } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      const patientContracts = await db.select()
        .from(contracts)
        .where(and(
          eq(contracts.patientId, patientId),
          eq(contracts.facilityId, facilityId),
          eq(contracts.isActive, true)
        ))
        .orderBy(contracts.contractDate);

      res.json(patientContracts);
    } catch (error) {
      console.error("Get patient contracts error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // ==================== Bonus Calculation History Management ====================

  // Update service code for bonus calculation history
  app.patch("/api/bonus-calculation-history/:id/service-code", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { serviceCodeId } = req.body;

      // serviceCodeIdがnullまたは空文字列の場合は選択解除を許可
      if (serviceCodeId !== null && serviceCodeId !== '' && typeof serviceCodeId !== 'string') {
        return res.status(400).json({ error: "サービスコードIDが不正です" });
      }

      // nullまたは空文字列の場合は未選択状態にする
      const finalServiceCodeId = (serviceCodeId === null || serviceCodeId === '') ? null : serviceCodeId;

      // 加算履歴を取得
      const history = await db.query.bonusCalculationHistory.findFirst({
        where: eq(bonusCalculationHistory.id, id),
        with: {
          nursingRecord: true,
        },
      });

      if (!history) {
        console.error(`[Update service code] Bonus calculation history not found: id=${id}`);
        return res.status(404).json({ error: "加算履歴が見つかりません" });
      }

      // 訪問記録が存在しない場合のチェック
      if (!history.nursingRecord) {
        console.error(`[Update service code] Nursing record not found for history: id=${id}, nursingRecordId=${history.nursingRecordId}`);
        return res.status(404).json({ error: "加算履歴に関連する訪問記録が見つかりません" });
      }

      // 訪問記録の施設IDを確認（テナントチェック）
      if (history.nursingRecord.facilityId !== req.user.facilityId) {
        return res.status(403).json({ error: "この加算履歴にアクセスする権限がありません" });
      }

      // サービスコードが指定されている場合のみ存在確認と点数チェック
      if (finalServiceCodeId) {
        const serviceCode = await db.query.nursingServiceCodes.findFirst({
          where: eq(nursingServiceCodes.id, finalServiceCodeId),
        });

        if (!serviceCode) {
          return res.status(404).json({ error: "サービスコードが見つかりません" });
        }

        // 加算マスタを取得して点数を確認
        const bonusMasterRecord = await db.query.bonusMaster.findFirst({
          where: eq(bonusMaster.id, history.bonusMasterId),
        });

        if (bonusMasterRecord) {
          // 点数整合性チェック（警告のみ、エラーにはしない）
          const bonusPoints = bonusMasterRecord.fixedPoints || 0;
          const serviceCodePoints = serviceCode.points;
          
          // 加算マスタの点数は10円単位で保存されている可能性があるため、10倍して比較
          const bonusPointsInYen = bonusPoints * 10;
          if (bonusPointsInYen !== serviceCodePoints && bonusPoints !== serviceCodePoints) {
            console.warn(`[Update service code] Points mismatch: bonus=${bonusPointsInYen} or ${bonusPoints}, serviceCode=${serviceCodePoints}`);
          }
        }
      }

      // サービスコードを更新（nullの場合は選択解除）
      await db.update(bonusCalculationHistory)
        .set({
          serviceCodeId: finalServiceCodeId,
        })
        .where(eq(bonusCalculationHistory.id, id));

      // 更新後のデータを取得
      const updatedHistory = await db.query.bonusCalculationHistory.findFirst({
        where: eq(bonusCalculationHistory.id, id),
        with: {
          bonusMaster: true,
          serviceCode: true,
        },
      });

      // 該当レセプトを取得して再計算（同期的に実行、レスポンスを返す前に完了させる）
      // これにより、フロントエンドでデータ再取得時に最新の点数が反映される
      try {
        const nursingRecord = history.nursingRecord;
        const visitDate = new Date(nursingRecord.visitDate);
        const targetYear = visitDate.getFullYear();
        const targetMonth = visitDate.getMonth() + 1;
        
        // 患者の保険種別を取得
        const patient = await db.query.patients.findFirst({
          where: eq(patients.id, nursingRecord.patientId),
        });
        
        if (patient) {
          const insuranceType = patient.insuranceType as 'medical' | 'care';
          
          // 該当レセプトを取得
          const receipt = await db.query.monthlyReceipts.findFirst({
            where: and(
              eq(monthlyReceipts.facilityId, req.user.facilityId),
              eq(monthlyReceipts.patientId, nursingRecord.patientId),
              eq(monthlyReceipts.targetYear, targetYear),
              eq(monthlyReceipts.targetMonth, targetMonth),
              eq(monthlyReceipts.insuranceType, insuranceType)
            ),
          });
          
          // レセプトが存在し、未確定の場合のみ再計算
          if (receipt && !receipt.isConfirmed) {
            // 加算を再計算（最新の加算マスタ設定で再計算）
            const { recalculateBonusesForReceipt } = await import("./bonus-engine");
            await recalculateBonusesForReceipt({
              id: receipt.id,
              patientId: receipt.patientId,
              facilityId: receipt.facilityId,
              targetYear: receipt.targetYear,
              targetMonth: receipt.targetMonth,
              insuranceType: receipt.insuranceType,
            });

            // Re-fetch nursing records and recalculate
            const startDate = new Date(targetYear, targetMonth - 1, 1);
            const endDate = new Date(targetYear, targetMonth, 0);

            const records = await db.select()
              .from(nursingRecords)
              .where(and(
                eq(nursingRecords.facilityId, req.user.facilityId),
                eq(nursingRecords.patientId, nursingRecord.patientId),
                gte(nursingRecords.visitDate, startDate.toISOString().split('T')[0]),
                lte(nursingRecords.visitDate, endDate.toISOString().split('T')[0]),
                eq(nursingRecords.status, 'completed')
              ));

            // Recalculate totals
            let totalVisitPoints = 0;
            let specialManagementPoints = 0;
            const bonusMap = new Map<string, { bonusCode: string; bonusName: string; count: number; points: number }>();

            const recordIds = records.map(r => r.id);
            let bonusHistoryForRecords: any[] = [];

            if (recordIds.length > 0) {
              bonusHistoryForRecords = await db.select({
                history: bonusCalculationHistory,
                bonus: bonusMaster,
                serviceCode: nursingServiceCodes,
              })
                .from(bonusCalculationHistory)
                .leftJoin(bonusMaster, eq(bonusCalculationHistory.bonusMasterId, bonusMaster.id))
                .leftJoin(nursingServiceCodes, eq(bonusCalculationHistory.serviceCodeId, nursingServiceCodes.id))
                .where(and(
                  inArray(bonusCalculationHistory.nursingRecordId, recordIds),
                  isNotNull(bonusCalculationHistory.serviceCodeId) // サービスコード選択済みのもののみ
                ));
            }

            for (const item of bonusHistoryForRecords) {
              if (!item.bonus) continue;

              const bonusCode = item.bonus.bonusCode;
              const bonusName = item.bonus.bonusName;
              // サービスコードの点数を使用（CSV出力と統一）
              const points = item.serviceCode?.points ?? item.history.calculatedPoints;

              if (bonusMap.has(bonusCode)) {
                const existing = bonusMap.get(bonusCode)!;
                existing.count += 1;
                existing.points += points;
              } else {
                bonusMap.set(bonusCode, {
                  bonusCode,
                  bonusName,
                  count: 1,
                  points,
                });
              }

              if (bonusCode.includes('special_management')) {
                specialManagementPoints += points;
              }
            }

            // 各訪問記録のサービスコードから点数を取得
            const defaultServiceCode = await db.query.nursingServiceCodes.findFirst({
              where: and(
                eq(nursingServiceCodes.serviceCode, '510000110'),
                eq(nursingServiceCodes.isActive, true)
              ),
            });

            for (const record of records) {
              let recordPoints = 0;

              if (record.serviceCodeId) {
                const serviceCode = await db.query.nursingServiceCodes.findFirst({
                  where: eq(nursingServiceCodes.id, record.serviceCodeId),
                });
                if (serviceCode) {
                  recordPoints = serviceCode.points;
                }
              } else {
                // サービスコードが選択されていない場合、デフォルトで510000110を使用
                if (defaultServiceCode) {
                  recordPoints = defaultServiceCode.points;
                }
              }

              totalVisitPoints += recordPoints;
            }

            const bonusBreakdown = Array.from(bonusMap.values());
            const totalBonusPoints = bonusBreakdown.reduce((sum, b) => sum + b.points, 0);
            const totalPoints = totalVisitPoints + totalBonusPoints;
            const totalAmount = totalPoints * 10;

            // Run CSV export validation (don't block recalculation if this fails)
            let csvExportReady = false;
            let csvExportWarnings: Array<{field: string; message: string; severity: 'error' | 'warning'}> = [];
            let lastCsvExportCheck: Date | null = null;
            
            try {
              const csvValidationResult = await validateMonthlyReceiptData(
                req.user.facilityId,
                nursingRecord.patientId,
                targetYear,
                targetMonth
              );
              csvExportReady = csvValidationResult.canExportCsv;
              csvExportWarnings = [
                ...csvValidationResult.errors.map(e => ({ field: e.field, message: e.message, severity: e.severity })),
                ...csvValidationResult.warnings.map(w => ({ field: w.field, message: w.message, severity: w.severity }))
              ];
              lastCsvExportCheck = new Date();
            } catch (error) {
              console.error("CSV validation error during receipt recalculation:", error);
              // Continue with recalculation even if CSV validation fails
            }

            // レセプトを更新
            await db.update(monthlyReceipts)
              .set({
                visitCount: records.length,
                totalVisitPoints,
                specialManagementPoints,
                bonusBreakdown,
                totalPoints,
                totalAmount,
                csvExportReady,
                csvExportWarnings,
                lastCsvExportCheck,
                updatedAt: new Date(),
              })
              .where(eq(monthlyReceipts.id, receipt.id));
          }
        }
      } catch (recalcError) {
        // レセプト再計算エラーはログに記録するが、サービスコード更新は成功とする
        console.error("Receipt recalculation error after service code update:", recalcError);
        console.error("Error details:", {
          historyId: id,
          nursingRecordId: history.nursingRecord?.id,
          error: recalcError instanceof Error ? recalcError.message : String(recalcError),
          stack: recalcError instanceof Error ? recalcError.stack : undefined,
        });
      }

      res.json(updatedHistory);
    } catch (error: any) {
      console.error("Update bonus calculation history service code error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // ==================== Bonus Master Management ====================

  // Get all bonus masters (global + facility-specific)
  app.get("/api/bonus-masters", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.facility?.id || req.user.facilityId;
      const { insuranceType, isActive } = req.query;

      let conditions: any[] = [
        or(
          isNull(bonusMaster.facilityId),
          eq(bonusMaster.facilityId, facilityId)
        )
      ];

      if (insuranceType && (insuranceType === 'medical' || insuranceType === 'care')) {
        conditions.push(eq(bonusMaster.insuranceType, insuranceType as "medical" | "care"));
      }

      if (isActive !== undefined) {
        conditions.push(eq(bonusMaster.isActive, isActive === 'true'));
      }

      const bonuses = await db.select()
        .from(bonusMaster)
        .where(and(...conditions))
        .orderBy(bonusMaster.displayOrder, bonusMaster.bonusCode);

      res.json(bonuses);
    } catch (error) {
      console.error("Get bonus masters error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Create bonus master (admin only)
  app.post("/api/bonus-masters", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.facility?.id || req.user.facilityId;
      const bonusData = insertBonusMasterSchema.parse(req.body);

      // Set facilityId to null for global bonuses, or use facility ID from request body
      const dataToInsert = {
        ...bonusData,
        facilityId: req.body.facilityId || null,
      };

      // Check for overlapping periods with same bonusCode
      // Build facility condition based on whether facilityId is null
      const facilityCondition = dataToInsert.facilityId
        ? or(
            eq(bonusMaster.facilityId, dataToInsert.facilityId),
            isNull(bonusMaster.facilityId)
          )
        : isNull(bonusMaster.facilityId);

      const overlappingBonuses = await db.select()
        .from(bonusMaster)
        .where(
          and(
            eq(bonusMaster.bonusCode, dataToInsert.bonusCode),
            eq(bonusMaster.isActive, true),
            facilityCondition
          )
        );

      // Check for period overlap
      for (const existing of overlappingBonuses) {
        const newFrom = new Date(dataToInsert.validFrom);
        const newTo = dataToInsert.validTo ? new Date(dataToInsert.validTo) : null;
        const existingFrom = new Date(existing.validFrom);
        const existingTo = existing.validTo ? new Date(existing.validTo) : null;

        // Check if periods overlap
        // Overlap if: newFrom <= existingTo (or null) AND newTo (or null) >= existingFrom
        const overlaps =
          (existingTo === null || newFrom <= existingTo) &&
          (newTo === null || newTo >= existingFrom);

        if (overlaps) {
          const existingPeriod = `${existing.validFrom}${existingTo ? ' 〜 ' + existing.validTo : ' 〜 （無期限）'}`;
          const newPeriod = `${dataToInsert.validFrom}${newTo ? ' 〜 ' + dataToInsert.validTo : ' 〜 （無期限）'}`;
          return res.status(400).json({
            error: `加算コード「${dataToInsert.bonusCode}」の有効期間が重複しています。\n既存: ${existingPeriod}\n新規: ${newPeriod}\n\n有効期間が重複しないように設定してください。`
          });
        }
      }

      const [newBonus] = await db.insert(bonusMaster)
        .values(dataToInsert)
        .returning();

      res.json(newBonus);
    } catch (error: any) {
      console.error("Create bonus master error:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: "入力データが不正です", details: error.errors });
      }
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Update bonus master (admin only)
  app.put("/api/bonus-masters/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;
      const bonusData = updateBonusMasterSchema.parse(req.body);

      // Check if bonus exists and user has permission
      const existing = await db.select()
        .from(bonusMaster)
        .where(and(
          eq(bonusMaster.id, id),
          or(
            isNull(bonusMaster.facilityId),
            eq(bonusMaster.facilityId, facilityId)
          )
        ))
        .limit(1);

      if (existing.length === 0) {
        return res.status(404).json({ error: "加算マスタが見つかりません" });
      }

      // Check for overlapping periods with same bonusCode (if bonusCode is being updated)
      if (bonusData.bonusCode || bonusData.validFrom || bonusData.validTo !== undefined) {
        const currentBonus = existing[0];
        const updatedBonusCode = bonusData.bonusCode || currentBonus.bonusCode;
        const updatedValidFrom = bonusData.validFrom || currentBonus.validFrom;
        const updatedValidTo = bonusData.validTo !== undefined ? bonusData.validTo : currentBonus.validTo;
        const updatedFacilityId = currentBonus.facilityId; // facilityId is not updatable

        // Build facility condition based on whether facilityId is null
        const facilityCondition = updatedFacilityId
          ? or(
              eq(bonusMaster.facilityId, updatedFacilityId),
              isNull(bonusMaster.facilityId)
            )
          : isNull(bonusMaster.facilityId);

        const overlappingBonuses = await db.select()
          .from(bonusMaster)
          .where(
            and(
              eq(bonusMaster.bonusCode, updatedBonusCode),
              eq(bonusMaster.isActive, true),
              ne(bonusMaster.id, id), // Exclude self
              facilityCondition
            )
          );

        // Check for period overlap
        for (const existingBonus of overlappingBonuses) {
          const newFrom = new Date(updatedValidFrom);
          const newTo = updatedValidTo ? new Date(updatedValidTo) : null;
          const existingFrom = new Date(existingBonus.validFrom);
          const existingTo = existingBonus.validTo ? new Date(existingBonus.validTo) : null;

          // Check if periods overlap
          const overlaps =
            (existingTo === null || newFrom <= existingTo) &&
            (newTo === null || newTo >= existingFrom);

          if (overlaps) {
            const existingPeriod = `${existingBonus.validFrom}${existingTo ? ' 〜 ' + existingBonus.validTo : ' 〜 （無期限）'}`;
            const newPeriod = `${updatedValidFrom}${newTo ? ' 〜 ' + updatedValidTo : ' 〜 （無期限）'}`;
            return res.status(400).json({
              error: `加算コード「${updatedBonusCode}」の有効期間が重複しています。\n既存: ${existingPeriod}\n更新後: ${newPeriod}\n\n有効期間が重複しないように設定してください。`
            });
          }
        }
      }

      const [updatedBonus] = await db.update(bonusMaster)
        .set({ ...bonusData, updatedAt: new Date() })
        .where(eq(bonusMaster.id, id))
        .returning();

      res.json(updatedBonus);
    } catch (error: any) {
      console.error("Update bonus master error:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: "入力データが不正です", details: error.errors });
      }
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Delete bonus master (logical delete, admin only)
  app.delete("/api/bonus-masters/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      // Check if bonus exists and user has permission
      const existing = await db.select()
        .from(bonusMaster)
        .where(and(
          eq(bonusMaster.id, id),
          or(
            isNull(bonusMaster.facilityId),
            eq(bonusMaster.facilityId, facilityId)
          )
        ))
        .limit(1);

      if (existing.length === 0) {
        return res.status(404).json({ error: "加算マスタが見つかりません" });
      }

      const [deletedBonus] = await db.update(bonusMaster)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(bonusMaster.id, id))
        .returning();

      res.json({ message: "加算マスタを削除しました", bonus: deletedBonus });
    } catch (error) {
      console.error("Delete bonus master error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // ==================== Monthly Receipts Management ====================

  // Get all monthly receipts (with filters)
  app.get("/api/monthly-receipts", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.facility?.id || req.user.facilityId;
      const { year, month, insuranceType, patientId, isConfirmed } = req.query;

      const conditions = [eq(monthlyReceipts.facilityId, facilityId)];

      if (year && year !== 'all') {
        conditions.push(eq(monthlyReceipts.targetYear, parseInt(year as string)));
      }
      if (month && month !== 'all') {
        conditions.push(eq(monthlyReceipts.targetMonth, parseInt(month as string)));
      }
      if (insuranceType && insuranceType !== 'all') {
        conditions.push(eq(monthlyReceipts.insuranceType, insuranceType as any));
      }
      if (patientId) {
        conditions.push(eq(monthlyReceipts.patientId, patientId as string));
      }
      if (isConfirmed !== undefined && isConfirmed !== 'all') {
        conditions.push(eq(monthlyReceipts.isConfirmed, isConfirmed === 'true'));
      }

      const receipts = await db.select({
        receipt: monthlyReceipts,
        patient: patients,
      })
        .from(monthlyReceipts)
        .leftJoin(patients, eq(monthlyReceipts.patientId, patients.id))
        .where(and(...conditions))
        .orderBy(
          desc(monthlyReceipts.targetYear),
          desc(monthlyReceipts.targetMonth),
          patients.lastName
        );

      // 各レセプトに対応する保険証情報を取得
      const receiptsWithInsuranceCards = await Promise.all(
        receipts.map(async (r) => {
          const receipt = r.receipt;
          const targetDate = new Date(receipt.targetYear, receipt.targetMonth - 1, 15); // 対象月の15日
          const targetDateStr = targetDate.toISOString().split('T')[0];

          // 対象年月に有効な保険証を取得
          const cardType = receipt.insuranceType === 'medical' ? 'medical' : 'long_term_care';
          const insuranceCard = await db.query.insuranceCards.findFirst({
            where: and(
              eq(insuranceCards.patientId, receipt.patientId),
              eq(insuranceCards.facilityId, facilityId),
              eq(insuranceCards.cardType, cardType),
              eq(insuranceCards.isActive, true),
              lte(insuranceCards.validFrom, targetDateStr),
              or(
                isNull(insuranceCards.validUntil),
                gte(insuranceCards.validUntil, targetDateStr)
              )
            ),
            orderBy: desc(insuranceCards.validFrom),
          });

          return {
            ...receipt,
            patient: r.patient,
            insuranceCard: insuranceCard ? {
              reviewOrganizationCode: insuranceCard.reviewOrganizationCode,
              insurerNumber: insuranceCard.insurerNumber,
            } : null,
          };
        })
      );

      res.json(receiptsWithInsuranceCards);
    } catch (error) {
      console.error("Get monthly receipts error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Get single monthly receipt with details
  app.get("/api/monthly-receipts/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      const receiptData = await db.select({
        receipt: monthlyReceipts,
        patient: patients,
        confirmedBy: users,
      })
        .from(monthlyReceipts)
        .leftJoin(patients, eq(monthlyReceipts.patientId, patients.id))
        .leftJoin(users, eq(monthlyReceipts.confirmedBy, users.id))
        .where(and(
          eq(monthlyReceipts.id, id),
          eq(monthlyReceipts.facilityId, facilityId)
        ))
        .limit(1);

      if (receiptData.length === 0) {
        return res.status(404).json({ error: "レセプトが見つかりません" });
      }

      // Get related nursing records for the period
      const targetYear = receiptData[0].receipt.targetYear;
      const targetMonth = receiptData[0].receipt.targetMonth;
      const patientId = receiptData[0].receipt.patientId;
      const insuranceType = receiptData[0].receipt.insuranceType;

      const startDate = new Date(targetYear, targetMonth - 1, 1);
      const endDate = new Date(targetYear, targetMonth, 0);

      const relatedRecords = await db.select({
        record: nursingRecords,
        nurse: users,
        schedule: schedules,
      })
        .from(nursingRecords)
        .leftJoin(users, eq(nursingRecords.nurseId, users.id))
        .leftJoin(schedules, eq(nursingRecords.scheduleId, schedules.id))
        .where(and(
          eq(nursingRecords.patientId, patientId),
          eq(nursingRecords.facilityId, facilityId),
          gte(nursingRecords.visitDate, startDate.toISOString().split('T')[0]),
          lte(nursingRecords.visitDate, endDate.toISOString().split('T')[0])
        ))
        .orderBy(nursingRecords.visitDate);

      // Get bonus calculation history for these records
      const recordIds = relatedRecords.map(r => r.record.id);
      let bonusHistory: any[] = [];

      if (recordIds.length > 0) {
        bonusHistory = await db.select({
          history: bonusCalculationHistory,
          bonus: bonusMaster,
          serviceCode: nursingServiceCodes,
        })
          .from(bonusCalculationHistory)
          .leftJoin(bonusMaster, eq(bonusCalculationHistory.bonusMasterId, bonusMaster.id))
          .leftJoin(nursingServiceCodes, eq(bonusCalculationHistory.serviceCodeId, nursingServiceCodes.id))
          .where(inArray(bonusCalculationHistory.nursingRecordId, recordIds));
      }

      // Get insurance card information
      const insuranceCardData = await db.select()
        .from(insuranceCards)
        .where(and(
          eq(insuranceCards.patientId, patientId),
          eq(insuranceCards.facilityId, facilityId),
          eq(insuranceCards.isActive, true), // 有効な保険証のみ取得
          eq(insuranceCards.cardType, insuranceType === 'medical' ? 'medical' : 'long_term_care')
        ))
        .orderBy(desc(insuranceCards.validFrom))
        .limit(1);

      // Get doctor order information
      const doctorOrderData = await db.select({
        order: doctorOrders,
        medicalInstitution: medicalInstitutions,
      })
        .from(doctorOrders)
        .leftJoin(medicalInstitutions, eq(doctorOrders.medicalInstitutionId, medicalInstitutions.id))
        .where(and(
          eq(doctorOrders.patientId, patientId),
          eq(doctorOrders.facilityId, facilityId)
        ))
        .orderBy(desc(doctorOrders.orderDate))
        .limit(1);

      // Get public expense cards information
      const publicExpenseCardsData = await db.select()
        .from(publicExpenseCards)
        .where(and(
          eq(publicExpenseCards.patientId, patientId),
          eq(publicExpenseCards.facilityId, facilityId),
          eq(publicExpenseCards.isActive, true)
        ))
        .orderBy(asc(publicExpenseCards.priority));

      res.json({
        ...receiptData[0].receipt,
        patient: receiptData[0].patient,
        confirmedByUser: receiptData[0].confirmedBy,
        insuranceCard: insuranceCardData[0] || null,
        doctorOrder: doctorOrderData[0] ? {
          order: doctorOrderData[0].order,
          medicalInstitution: doctorOrderData[0].medicalInstitution,
        } : null,
        publicExpenseCards: publicExpenseCardsData,
        relatedRecords: relatedRecords.map(r => ({
          ...r.record,
          nurse: r.nurse,
          schedule: r.schedule,
        })),
        bonusHistory,
      });
    } catch (error) {
      console.error("Get monthly receipt detail error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Generate monthly receipts for a specific month
  app.post("/api/monthly-receipts/generate", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.facility?.id || req.user.facilityId;
      const { year, month, insuranceType } = req.body;

      if (!year || !month || !insuranceType) {
        return res.status(400).json({ error: "年月、保険種別は必須です" });
      }

      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);

      // Get all nursing records for the target month
      const nursingRecordsForMonth = await db.select({
        record: nursingRecords,
        patient: patients,
      })
        .from(nursingRecords)
        .leftJoin(patients, eq(nursingRecords.patientId, patients.id))
        .where(and(
          eq(nursingRecords.facilityId, facilityId),
          gte(nursingRecords.visitDate, startDate.toISOString().split('T')[0]),
          lte(nursingRecords.visitDate, endDate.toISOString().split('T')[0]),
          eq(nursingRecords.status, 'completed')
        ));

      // Get insurance cards to determine patient's insurance type
      const patientIds = Array.from(new Set(nursingRecordsForMonth.map(r => r.record.patientId)));
      const insuranceCardsForPatients = await db.select()
        .from(insuranceCards)
        .where(and(
          eq(insuranceCards.facilityId, facilityId),
          inArray(insuranceCards.patientId, patientIds),
          eq(insuranceCards.cardType, insuranceType === 'medical' ? 'medical' : 'long_term_care')
        ));

      // Create a set of patient IDs who have the specified insurance type
      const patientsWithInsurance = new Set(insuranceCardsForPatients.map(ic => ic.patientId));

      // Filter records by insurance type
      const recordsByPatient = new Map<string, any[]>();

      for (const item of nursingRecordsForMonth) {
        if (!item.patient) continue;

        const patientId = item.record.patientId;

        // Only include patients who have the specified insurance type
        if (!patientsWithInsurance.has(patientId)) {
          continue;
        }

        if (!recordsByPatient.has(patientId)) {
          recordsByPatient.set(patientId, []);
        }
        recordsByPatient.get(patientId)!.push(item);
      }

      const generatedReceipts = [];
      let skippedCount = 0;

      // Generate receipt for each patient
      for (const [patientId, records] of Array.from(recordsByPatient.entries())) {
        if (records.length === 0) continue;

        const patient = records[0].patient;

        // Calculate totals
        let totalVisitPoints = 0;
        let specialManagementPoints = 0;
        const bonusMap = new Map<string, { bonusCode: string; bonusName: string; count: number; points: number }>();

        // Get bonus calculation history for all records
        const recordIds = records.map((r: any) => r.record.id);
        const bonusHistoryForRecords = await db.select({
          history: bonusCalculationHistory,
          bonus: bonusMaster,
          serviceCode: nursingServiceCodes,
        })
          .from(bonusCalculationHistory)
          .leftJoin(bonusMaster, eq(bonusCalculationHistory.bonusMasterId, bonusMaster.id))
          .leftJoin(nursingServiceCodes, eq(bonusCalculationHistory.serviceCodeId, nursingServiceCodes.id))
          .where(and(
            inArray(bonusCalculationHistory.nursingRecordId, recordIds),
            isNotNull(bonusCalculationHistory.serviceCodeId) // サービスコード選択済みのもののみ
          ));

        // Aggregate bonus points
        for (const item of bonusHistoryForRecords) {
          if (!item.bonus) continue;

          const bonusCode = item.bonus.bonusCode;
          const bonusName = item.bonus.bonusName;
          // サービスコードの点数を使用（CSV出力と統一）
          const points = item.serviceCode?.points ?? item.history.calculatedPoints;

          if (bonusMap.has(bonusCode)) {
            const existing = bonusMap.get(bonusCode)!;
            existing.count += 1;
            existing.points += points;
          } else {
            bonusMap.set(bonusCode, {
              bonusCode,
              bonusName,
              count: 1,
              points,
            });
          }

          // Check if this is special management bonus
          if (bonusCode.includes('special_management')) {
            specialManagementPoints += points;
          }
        }

        // 各訪問記録のサービスコードから点数を取得
        const defaultServiceCode = await db.query.nursingServiceCodes.findFirst({
          where: and(
            eq(nursingServiceCodes.serviceCode, '510000110'),
            eq(nursingServiceCodes.isActive, true)
          ),
        });

        for (const recordItem of records) {
          const record = recordItem.record;
          let recordPoints = 0;

          if (record.serviceCodeId) {
            const serviceCode = await db.query.nursingServiceCodes.findFirst({
              where: eq(nursingServiceCodes.id, record.serviceCodeId),
            });
            if (serviceCode) {
              recordPoints = serviceCode.points;
            }
          } else {
            // サービスコードが選択されていない場合、デフォルトで510000110を使用
            if (defaultServiceCode) {
              recordPoints = defaultServiceCode.points;
            }
          }

          totalVisitPoints += recordPoints;
        }

        const bonusBreakdown = Array.from(bonusMap.values());
        const totalBonusPoints = bonusBreakdown.reduce((sum, b) => sum + b.points, 0);
        const totalPoints = totalVisitPoints + totalBonusPoints;
        const totalAmount = insuranceType === 'medical' ? totalPoints * 10 : totalPoints * 10; // Convert to yen

        // Run validation for this receipt
        const doctorOrdersForPatient = await db.select()
          .from(doctorOrders)
          .where(and(
            eq(doctorOrders.patientId, patientId),
            eq(doctorOrders.facilityId, facilityId)
          ));

        const insuranceCardsForPatient = await db.select()
          .from(insuranceCards)
          .where(and(
            eq(insuranceCards.patientId, patientId),
            eq(insuranceCards.facilityId, facilityId)
          ));

        const bonusCalculations = bonusHistoryForRecords.map(bc => ({
          bonusMasterId: bc.bonus?.id || '',
          bonusCode: bc.bonus?.bonusCode || '',
          bonusName: bc.bonus?.bonusName || '',
          calculatedPoints: bc.history.calculatedPoints,
        }));

        const validationResult = validateReceipt({
          patientId,
          targetYear: year,
          targetMonth: month,
          insuranceType,
          nursingRecords: records.map((r: any) => ({
            id: r.record.id,
            visitDate: r.record.visitDate,
            actualStartTime: r.record.actualStartTime,
            actualEndTime: r.record.actualEndTime,
            emergencyVisitReason: r.record.emergencyVisitReason,
            multipleVisitReason: r.record.multipleVisitReason,
            isSecondVisit: r.record.isSecondVisit,
          })),
          patient: {
            id: patient.id,
            buildingId: patient.buildingId,
            careLevel: patient.careLevel,
          },
          doctorOrders: doctorOrdersForPatient.map(o => ({
            id: o.id,
            patientId: o.patientId,
            startDate: o.startDate,
            endDate: o.endDate,
          })),
          insuranceCards: insuranceCardsForPatient.map(c => ({
            id: c.id,
            patientId: c.patientId,
            cardType: c.cardType,
            validFrom: c.validFrom,
            validTo: c.validUntil,
          })),
          bonusCalculations,
        });

        const hasErrors = validationResult.errors.length > 0;
        const hasWarnings = validationResult.warnings.length > 0;
        const errorMessages = validationResult.errors.map(e => e.message);
        const warningMessages = validationResult.warnings.map(w => w.message);

        // Run CSV export validation
        const csvValidationResult = await validateMonthlyReceiptData(
          facilityId,
          patientId,
          year,
          month
        );

        // Merge CSV validation warnings/errors with existing ones
        const allErrors = [
          ...errorMessages,
          ...csvValidationResult.errors.map(e => `[CSV出力] ${e.message}`)
        ];
        const allWarnings = [
          ...warningMessages,
          ...csvValidationResult.warnings.map(w => `[CSV出力] ${w.message}`)
        ];

        // Prepare CSV export status data
        const csvExportReady = csvValidationResult.canExportCsv;
        const csvExportWarnings = [
          ...csvValidationResult.errors.map(e => ({ field: e.field, message: e.message, severity: e.severity })),
          ...csvValidationResult.warnings.map(w => ({ field: w.field, message: w.message, severity: w.severity }))
        ];
        const lastCsvExportCheck = new Date();

        // Check if receipt already exists
        const existingReceipt = await db.select()
          .from(monthlyReceipts)
          .where(and(
            eq(monthlyReceipts.facilityId, facilityId),
            eq(monthlyReceipts.patientId, patientId),
            eq(monthlyReceipts.targetYear, year),
            eq(monthlyReceipts.targetMonth, month),
            eq(monthlyReceipts.insuranceType, insuranceType)
          ))
          .limit(1);

        if (existingReceipt.length > 0) {
          // Skip if already confirmed
          if (existingReceipt[0].isConfirmed) {
            console.log(`Skipping confirmed receipt for patient ${patientId}, ${year}/${month}`);
            skippedCount++;
            continue;
          }

          // Update existing receipt (only if not confirmed)
          const [updated] = await db.update(monthlyReceipts)
            .set({
              visitCount: records.length,
              totalVisitPoints,
              specialManagementPoints,
              bonusBreakdown,
              totalPoints,
              totalAmount,
              hasErrors: allErrors.length > 0,
              hasWarnings: allWarnings.length > 0,
              errorMessages: allErrors,
              warningMessages: allWarnings,
              csvExportReady,
              csvExportWarnings,
              lastCsvExportCheck,
              updatedAt: new Date(),
            })
            .where(eq(monthlyReceipts.id, existingReceipt[0].id))
            .returning();

          generatedReceipts.push(updated);
        } else {
          // Create new receipt
          const [newReceipt] = await db.insert(monthlyReceipts)
            .values({
              facilityId: facilityId,
              patientId,
              targetYear: year,
              targetMonth: month,
              insuranceType,
              visitCount: records.length,
              totalVisitPoints,
              specialManagementPoints,
              bonusBreakdown,
              totalPoints,
              totalAmount,
              hasErrors: allErrors.length > 0,
              hasWarnings: allWarnings.length > 0,
              errorMessages: allErrors,
              warningMessages: allWarnings,
              csvExportReady,
              csvExportWarnings,
              lastCsvExportCheck,
            })
            .returning();

          generatedReceipts.push(newReceipt);
        }
      }

      const message = skippedCount > 0
        ? `${year}年${month}月分のレセプトを生成しました（確定済み${skippedCount}件はスキップ）`
        : `${year}年${month}月分のレセプトを生成しました`;

      res.json({
        message,
        count: generatedReceipts.length,
        skippedCount,
        receipts: generatedReceipts,
      });
    } catch (error) {
      console.error("Generate monthly receipts error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Finalize a monthly receipt (lock it)
  app.post("/api/monthly-receipts/:id/finalize", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;
      const userId = req.session.userId;

      const existing = await db.select()
        .from(monthlyReceipts)
        .where(and(
          eq(monthlyReceipts.id, id),
          eq(monthlyReceipts.facilityId, facilityId)
        ))
        .limit(1);

      if (existing.length === 0) {
        return res.status(404).json({ error: "レセプトが見つかりません" });
      }

      if (existing[0].isConfirmed) {
        return res.status(400).json({ error: "既に確定済みです" });
      }

      // Run comprehensive validation before finalizing
      const patientId = existing[0].patientId;
      const targetYear = existing[0].targetYear;
      const targetMonth = existing[0].targetMonth;
      const insuranceType = existing[0].insuranceType;

      // Fetch all required data for validation
      const [patientData, records, orders, cards] = await Promise.all([
        db.select()
          .from(patients)
          .where(eq(patients.id, patientId))
          .limit(1),
        db.select()
          .from(nursingRecords)
          .where(and(
            eq(nursingRecords.patientId, patientId),
            eq(nursingRecords.facilityId, facilityId),
            sql`EXTRACT(YEAR FROM ${nursingRecords.visitDate}) = ${targetYear}`,
            sql`EXTRACT(MONTH FROM ${nursingRecords.visitDate}) = ${targetMonth}`
          )),
        db.select()
          .from(doctorOrders)
          .where(and(
            eq(doctorOrders.patientId, patientId),
            eq(doctorOrders.facilityId, facilityId)
          )),
        db.select()
          .from(insuranceCards)
          .where(and(
            eq(insuranceCards.patientId, patientId),
            eq(insuranceCards.facilityId, facilityId)
          ))
      ]);

      if (patientData.length === 0) {
        return res.status(404).json({ error: "患者情報が見つかりません" });
      }
      const patient = patientData[0];

      // Get bonus calculations
      const recordIds = records.map(r => r.id);
      let bonusCalcs: any[] = [];

      if (recordIds.length > 0) {
        bonusCalcs = await db.select({
          history: bonusCalculationHistory,
          bonus: bonusMaster,
        })
          .from(bonusCalculationHistory)
          .leftJoin(bonusMaster, eq(bonusCalculationHistory.bonusMasterId, bonusMaster.id))
          .where(inArray(bonusCalculationHistory.nursingRecordId, recordIds));
      }

      const bonusCalculations = bonusCalcs.map(bc => ({
        bonusMasterId: bc.bonus?.id || '',
        bonusCode: bc.bonus?.bonusCode || '',
        bonusName: bc.bonus?.bonusName || '',
        calculatedPoints: bc.history.calculatedPoints,
      }));

      const validationResult = validateReceipt({
        patientId,
        targetYear,
        targetMonth,
        insuranceType,
        nursingRecords: records.map(r => ({
          id: r.id,
          visitDate: r.visitDate,
          actualStartTime: r.actualStartTime,
          actualEndTime: r.actualEndTime,
          emergencyVisitReason: r.emergencyVisitReason,
          multipleVisitReason: r.multipleVisitReason,
          isSecondVisit: r.isSecondVisit,
        })),
        patient: {
          id: patient.id,
          buildingId: patient.buildingId,
          careLevel: patient.careLevel,
        },
        doctorOrders: orders.map(o => ({
          id: o.id,
          patientId: o.patientId,
          startDate: o.startDate,
          endDate: o.endDate,
        })),
        insuranceCards: cards.map(c => ({
          id: c.id,
          patientId: c.patientId,
          cardType: c.cardType,
          validFrom: c.validFrom,
          validTo: c.validUntil,
        })),
        bonusCalculations,
      });

      // If validation finds errors, update the receipt and block finalization
      if (validationResult.errors.length > 0) {
        const errorMessages = validationResult.errors.map(e => e.message);
        await db.update(monthlyReceipts)
          .set({
            hasErrors: true,
            errorMessages,
            updatedAt: new Date(),
          })
          .where(eq(monthlyReceipts.id, id));

        return res.status(400).json({
          error: "エラーがあるため確定できません。エラーを修正してください。",
          errors: validationResult.errors,
          warnings: validationResult.warnings
        });
      }

      // Run CSV export validation (don't block finalization if this fails)
      let csvExportReady = false;
      let csvExportWarnings: Array<{field: string; message: string; severity: 'error' | 'warning'}> = [];
      let lastCsvExportCheck: Date | null = null;
      
      try {
        const csvValidationResult = await validateMonthlyReceiptData(
          facilityId,
          patientId,
          targetYear,
          targetMonth
        );
        csvExportReady = csvValidationResult.canExportCsv;
        csvExportWarnings = [
          ...csvValidationResult.errors.map(e => ({ field: e.field, message: e.message, severity: e.severity })),
          ...csvValidationResult.warnings.map(w => ({ field: w.field, message: w.message, severity: w.severity }))
        ];
        lastCsvExportCheck = new Date();
      } catch (error) {
        console.error("CSV validation error during finalization:", error);
        // Continue with finalization even if CSV validation fails
      }

      // Update validation status and finalize
      const [updated] = await db.update(monthlyReceipts)
        .set({
          isConfirmed: true,
          confirmedBy: userId!,
          confirmedAt: new Date(),
          hasErrors: false,
          errorMessages: [],
          csvExportReady,
          csvExportWarnings,
          lastCsvExportCheck,
          updatedAt: new Date(),
        })
        .where(eq(monthlyReceipts.id, id))
        .returning();

      res.json({
        message: "レセプトを確定しました",
        receipt: updated,
        warnings: validationResult.warnings.length > 0 ? validationResult.warnings : undefined
      });
    } catch (error) {
      console.error("Finalize receipt error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Reopen a finalized receipt (for corrections)
  app.post("/api/monthly-receipts/:id/reopen", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      const existing = await db.select()
        .from(monthlyReceipts)
        .where(and(
          eq(monthlyReceipts.id, id),
          eq(monthlyReceipts.facilityId, facilityId)
        ))
        .limit(1);

      if (existing.length === 0) {
        return res.status(404).json({ error: "レセプトが見つかりません" });
      }

      if (!existing[0].isConfirmed) {
        return res.status(400).json({ error: "未確定のレセプトです" });
      }

      if (existing[0].isSent) {
        return res.status(400).json({ error: "送信済みのレセプトは再開できません" });
      }

      const [updated] = await db.update(monthlyReceipts)
        .set({
          isConfirmed: false,
          confirmedBy: null,
          confirmedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(monthlyReceipts.id, id))
        .returning();

      res.json({ message: "レセプトを再開しました", receipt: updated });
    } catch (error) {
      console.error("Reopen receipt error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Recalculate a monthly receipt
  app.post("/api/monthly-receipts/:id/recalculate", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      const existing = await db.select()
        .from(monthlyReceipts)
        .where(and(
          eq(monthlyReceipts.id, id),
          eq(monthlyReceipts.facilityId, facilityId)
        ))
        .limit(1);

      if (existing.length === 0) {
        return res.status(404).json({ error: "レセプトが見つかりません" });
      }

      if (existing[0].isConfirmed) {
        return res.status(400).json({ error: "確定済みのレセプトは再計算できません。先に再開してください。" });
      }

      const receipt = existing[0];
      const { targetYear, targetMonth, patientId, insuranceType } = receipt;

      // 加算を再計算（最新の加算マスタ設定で再計算）
      const { recalculateBonusesForReceipt } = await import("./bonus-engine");
      await recalculateBonusesForReceipt({
        id: receipt.id,
        patientId: receipt.patientId,
        facilityId: receipt.facilityId,
        targetYear: receipt.targetYear,
        targetMonth: receipt.targetMonth,
        insuranceType: receipt.insuranceType,
      });

      // Re-fetch nursing records and recalculate
      const startDate = new Date(targetYear, targetMonth - 1, 1);
      const endDate = new Date(targetYear, targetMonth, 0);

      const records = await db.select()
        .from(nursingRecords)
        .where(and(
          eq(nursingRecords.facilityId, facilityId),
          eq(nursingRecords.patientId, patientId),
          gte(nursingRecords.visitDate, startDate.toISOString().split('T')[0]),
          lte(nursingRecords.visitDate, endDate.toISOString().split('T')[0]),
          eq(nursingRecords.status, 'completed')
        ));

      // Recalculate totals (same logic as generate)
      let totalVisitPoints = 0;
      let specialManagementPoints = 0;
      const bonusMap = new Map<string, { bonusCode: string; bonusName: string; count: number; points: number }>();

      const recordIds = records.map(r => r.id);
      let bonusHistoryForRecords: any[] = [];

      if (recordIds.length > 0) {
        bonusHistoryForRecords = await db.select({
          history: bonusCalculationHistory,
          bonus: bonusMaster,
          serviceCode: nursingServiceCodes,
        })
          .from(bonusCalculationHistory)
          .leftJoin(bonusMaster, eq(bonusCalculationHistory.bonusMasterId, bonusMaster.id))
          .leftJoin(nursingServiceCodes, eq(bonusCalculationHistory.serviceCodeId, nursingServiceCodes.id))
          .where(and(
            inArray(bonusCalculationHistory.nursingRecordId, recordIds),
            isNotNull(bonusCalculationHistory.serviceCodeId) // サービスコード選択済みのもののみ
          ));
      }

      for (const item of bonusHistoryForRecords) {
        if (!item.bonus) continue;

        const bonusCode = item.bonus.bonusCode;
        const bonusName = item.bonus.bonusName;
        // サービスコードの点数を使用（CSV出力と統一）
        const points = item.serviceCode?.points ?? item.history.calculatedPoints;

        if (bonusMap.has(bonusCode)) {
          const existing = bonusMap.get(bonusCode)!;
          existing.count += 1;
          existing.points += points;
        } else {
          bonusMap.set(bonusCode, {
            bonusCode,
            bonusName,
            count: 1,
            points,
          });
        }

        if (bonusCode.includes('special_management')) {
          specialManagementPoints += points;
        }
      }

      // 各訪問記録のサービスコードから点数を取得
      const defaultServiceCode = await db.query.nursingServiceCodes.findFirst({
        where: and(
          eq(nursingServiceCodes.serviceCode, '510000110'),
          eq(nursingServiceCodes.isActive, true)
        ),
      });

      for (const record of records) {
        let recordPoints = 0;

        if (record.serviceCodeId) {
          const serviceCode = await db.query.nursingServiceCodes.findFirst({
            where: eq(nursingServiceCodes.id, record.serviceCodeId),
          });
          if (serviceCode) {
            recordPoints = serviceCode.points;
          }
        } else {
          // サービスコードが選択されていない場合、デフォルトで510000110を使用
          if (defaultServiceCode) {
            recordPoints = defaultServiceCode.points;
          }
        }

        totalVisitPoints += recordPoints;
      }

      const bonusBreakdown = Array.from(bonusMap.values());
      const totalBonusPoints = bonusBreakdown.reduce((sum, b) => sum + b.points, 0);
      const totalPoints = totalVisitPoints + totalBonusPoints;
      const totalAmount = totalPoints * 10;

      // Run CSV export validation (don't block recalculation if this fails)
      let csvExportReady = false;
      let csvExportWarnings: Array<{field: string; message: string; severity: 'error' | 'warning'}> = [];
      let lastCsvExportCheck: Date | null = null;
      
      try {
        const csvValidationResult = await validateMonthlyReceiptData(
          facilityId,
          patientId,
          targetYear,
          targetMonth
        );
        csvExportReady = csvValidationResult.canExportCsv;
        csvExportWarnings = [
          ...csvValidationResult.errors.map(e => ({ field: e.field, message: e.message, severity: e.severity })),
          ...csvValidationResult.warnings.map(w => ({ field: w.field, message: w.message, severity: w.severity }))
        ];
        lastCsvExportCheck = new Date();
      } catch (error) {
        console.error("CSV validation error during recalculation:", error);
        // Continue with recalculation even if CSV validation fails
      }

      const [updated] = await db.update(monthlyReceipts)
        .set({
          visitCount: records.length,
          totalVisitPoints,
          specialManagementPoints,
          bonusBreakdown,
          totalPoints,
          totalAmount,
          csvExportReady,
          csvExportWarnings,
          lastCsvExportCheck,
          updatedAt: new Date(),
        })
        .where(eq(monthlyReceipts.id, id))
        .returning();

      res.json({ message: "レセプトを再計算しました", receipt: updated });
    } catch (error) {
      console.error("Recalculate receipt error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Update monthly receipt (manual adjustments)
  app.put("/api/monthly-receipts/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;
      const updateData = req.body;

      const existing = await db.select()
        .from(monthlyReceipts)
        .where(and(
          eq(monthlyReceipts.id, id),
          eq(monthlyReceipts.facilityId, facilityId)
        ))
        .limit(1);

      if (existing.length === 0) {
        return res.status(404).json({ error: "レセプトが見つかりません" });
      }

      if (existing[0].isConfirmed) {
        return res.status(400).json({ error: "確定済みのレセプトは編集できません" });
      }

      const [updated] = await db.update(monthlyReceipts)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(eq(monthlyReceipts.id, id))
        .returning();

      res.json({ message: "レセプトを更新しました", receipt: updated });
    } catch (error) {
      console.error("Update receipt error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Delete monthly receipt
  app.delete("/api/monthly-receipts/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      const existing = await db.select()
        .from(monthlyReceipts)
        .where(and(
          eq(monthlyReceipts.id, id),
          eq(monthlyReceipts.facilityId, facilityId)
        ))
        .limit(1);

      if (existing.length === 0) {
        return res.status(404).json({ error: "レセプトが見つかりません" });
      }

      if (existing[0].isConfirmed || existing[0].isSent) {
        return res.status(400).json({ error: "確定済みまたは送信済みのレセプトは削除できません" });
      }

      await db.delete(monthlyReceipts)
        .where(eq(monthlyReceipts.id, id));

      res.json({ message: "レセプトを削除しました" });
    } catch (error) {
      console.error("Delete receipt error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Export monthly receipts to CSV (Care Insurance Format)
  app.get("/api/monthly-receipts/export/care-insurance", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.facility?.id || req.user.facilityId;
      const { year, month } = req.query;

      if (!year || !month) {
        return res.status(400).json({ error: "年月は必須です" });
      }

      const targetYear = parseInt(year as string);
      const targetMonth = parseInt(month as string);

      // Get all care insurance receipts for the month
      const receipts = await db.select({
        receipt: monthlyReceipts,
        patient: patients,
      })
        .from(monthlyReceipts)
        .leftJoin(patients, eq(monthlyReceipts.patientId, patients.id))
        .where(and(
          eq(monthlyReceipts.facilityId, facilityId),
          eq(monthlyReceipts.targetYear, targetYear),
          eq(monthlyReceipts.targetMonth, targetMonth),
          eq(monthlyReceipts.insuranceType, 'care')
        ))
        .orderBy(patients.patientNumber);

      if (receipts.length === 0) {
        return res.status(404).json({ error: "該当するレセプトがありません" });
      }

      // Get facility information
      const facility = await db.query.facilities.findFirst({
        where: eq(facilities.id, facilityId),
      });

      if (!facility) {
        return res.status(404).json({ error: "施設情報が見つかりません" });
      }

      // 指定事業所番号を優先使用、未設定時は既存のfacilityCodeから生成（後方互換性）
      const facilityCode10 = facility.careInsuranceFacilityNumber 
        || (facility.facilityCode 
          ? facility.facilityCode.padEnd(10, '0').substring(0, 10)
          : '0000000000');

      // サービスコードを6桁から2桁+4桁に分解する関数
      const processServiceCode = (serviceCode: string | null): { typeCode: string; itemCode: string } => {
        if (!serviceCode) {
          return { typeCode: '13', itemCode: '0000' }; // デフォルト値
        }
        // 介護保険のサービスコードは6桁（先頭2桁がサービス種類コード、後4桁がサービス項目コード）
        if (serviceCode.length === 6) {
          return {
            typeCode: serviceCode.substring(0, 2),
            itemCode: serviceCode.substring(2, 6),
          };
        }
        // 9桁の場合は先頭2桁と次の4桁を使用（医療保険との互換性）
        if (serviceCode.length >= 6) {
          return {
            typeCode: serviceCode.substring(0, 2),
            itemCode: serviceCode.substring(2, 6),
          };
        }
        return { typeCode: '13', itemCode: '0000' };
      };

      // 全利用者のデータを準備
      const patientDataList: CareInsurancePatientData[] = [];
      const startDate = new Date(targetYear, targetMonth - 1, 1);
      const endDate = new Date(targetYear, targetMonth, 0);

      for (const receiptItem of receipts) {
        const receipt = receiptItem.receipt;
        const patient = receiptItem.patient!;

        if (!patient) {
          continue; // 患者情報がない場合はスキップ
        }

        // Get insurance card
        const insuranceCardData = await db.select()
          .from(insuranceCards)
          .where(and(
            eq(insuranceCards.patientId, patient.id),
            eq(insuranceCards.facilityId, facilityId),
            eq(insuranceCards.cardType, 'long_term_care')
          ))
          .orderBy(desc(insuranceCards.validFrom))
          .limit(1);

        if (!insuranceCardData[0]) {
          console.warn(`患者 ${patient.patientNumber} の介護保険証情報が見つかりません。スキップします。`);
          continue; // 保険証がない場合はスキップ
        }

        const insuranceCard = insuranceCardData[0];

        // 要介護状態区分がない場合はスキップ
        if (!patient.careLevel) {
          console.warn(`患者 ${patient.patientNumber} の要介護状態区分が設定されていません。スキップします。`);
          continue;
        }

        // 被保険者番号を10桁にパディング（左側に0を追加）
        const insuredNumber10 = insuranceCard.insuredNumber.padStart(10, '0').substring(0, 10);
        
        // 保険者番号を8桁にパディング（左側に0を追加）
        const insurerNumber8 = insuranceCard.insurerNumber.padStart(8, '0').substring(0, 8);

        // Get public expense cards
        const publicExpenseCardsData = await db.select()
          .from(publicExpenseCards)
          .where(and(
            eq(publicExpenseCards.patientId, patient.id),
            eq(publicExpenseCards.facilityId, facilityId),
            eq(publicExpenseCards.isActive, true)
          ))
          .orderBy(asc(publicExpenseCards.priority));

        // Get service care plan
        const serviceCarePlanData = await db.select()
          .from(serviceCarePlans)
          .where(and(
            eq(serviceCarePlans.patientId, patient.id),
            eq(serviceCarePlans.facilityId, facilityId),
            eq(serviceCarePlans.isActive, true)
          ))
          .orderBy(desc(serviceCarePlans.planDate))
          .limit(1);

        // Get nursing records for the period
        const relatedRecords = await db.select({
          record: nursingRecords,
          serviceCode: nursingServiceCodes,
        })
          .from(nursingRecords)
          .leftJoin(nursingServiceCodes, eq(nursingRecords.serviceCodeId, nursingServiceCodes.id))
          .where(and(
            eq(nursingRecords.patientId, patient.id),
            eq(nursingRecords.facilityId, facilityId),
            gte(nursingRecords.visitDate, startDate.toISOString().split('T')[0]),
            lte(nursingRecords.visitDate, endDate.toISOString().split('T')[0]),
            eq(nursingRecords.status, 'completed')
          ))
          .orderBy(nursingRecords.visitDate);

        // Get bonus calculation history
        const recordIds = relatedRecords.map(r => r.record.id);
        let bonusHistory: any[] = [];

        if (recordIds.length > 0) {
          bonusHistory = await db.select({
            history: bonusCalculationHistory,
            bonus: bonusMaster,
            serviceCode: nursingServiceCodes,
          })
            .from(bonusCalculationHistory)
            .leftJoin(bonusMaster, eq(bonusCalculationHistory.bonusMasterId, bonusMaster.id))
            .leftJoin(nursingServiceCodes, eq(bonusCalculationHistory.serviceCodeId, nursingServiceCodes.id))
            .where(inArray(bonusCalculationHistory.nursingRecordId, recordIds));
        }

        // サービス開始年月日を訪問記録の最初の日付から取得
        const serviceStartDate = relatedRecords.length > 0 
          ? relatedRecords[0].record.visitDate 
          : null;

        // 訪問記録をサービス項目コードごとにグループ化
        const recordGroups = new Map<string, {
          serviceCode: string;
          serviceTypeCode: string;
          serviceItemCode: string;
          points: number;
          visitCount: number;
          totalPoints: number;
        }>();

        for (const item of relatedRecords) {
          const record = item.record;
          const serviceCode = item.serviceCode?.serviceCode || '';
          const { typeCode, itemCode } = processServiceCode(serviceCode);
          const key = `${typeCode}-${itemCode}`;

          if (!recordGroups.has(key)) {
            recordGroups.set(key, {
              serviceCode,
              serviceTypeCode: typeCode,
              serviceItemCode: itemCode,
              points: item.serviceCode?.points || 0,
              visitCount: 0,
              totalPoints: 0,
            });
          }

          const group = recordGroups.get(key)!;
          group.visitCount++;
          group.totalPoints += item.serviceCode?.points || 0;
        }

        // 加算履歴もグループ化
        const bonusGroups = new Map<string, {
          serviceCode: string;
          serviceTypeCode: string;
          serviceItemCode: string;
          points: number;
          visitCount: number;
          totalPoints: number;
        }>();

        for (const item of bonusHistory) {
          const serviceCode = item.serviceCode?.serviceCode || '';
          const { typeCode, itemCode } = processServiceCode(serviceCode);
          const key = `${typeCode}-${itemCode}`;

          if (!bonusGroups.has(key)) {
            bonusGroups.set(key, {
              serviceCode,
              serviceTypeCode: typeCode,
              serviceItemCode: itemCode,
              points: item.serviceCode?.points || 0,
              visitCount: 0,
              totalPoints: 0,
            });
          }

          const group = bonusGroups.get(key)!;
          group.visitCount++;
          group.totalPoints += item.serviceCode?.points || 0;
        }

        // 利用者データを追加
        patientDataList.push({
          receipt: {
            id: receipt.id,
            targetYear: receipt.targetYear,
            targetMonth: receipt.targetMonth,
            visitCount: receipt.visitCount,
            totalPoints: receipt.totalPoints,
            totalAmount: receipt.totalAmount,
          },
          patient: {
            id: patient.id,
            patientNumber: patient.patientNumber,
            lastName: patient.lastName,
            firstName: patient.firstName,
            kanaName: patient.kanaName,
            dateOfBirth: patient.dateOfBirth,
            gender: patient.gender,
            careLevel: patient.careLevel,
          },
          insuranceCard: {
            insurerNumber: insurerNumber8,
            insuredNumber: insuredNumber10,
            copaymentRate: insuranceCard.copaymentRate,
            certificationDate: insuranceCard.certificationDate,
            validFrom: insuranceCard.validFrom,
            validUntil: insuranceCard.validUntil,
          },
          publicExpenses: publicExpenseCardsData.map(pe => ({
            priority: pe.priority,
            legalCategoryNumber: pe.legalCategoryNumber,
            beneficiaryNumber: pe.beneficiaryNumber,
            recipientNumber: pe.recipientNumber,
            benefitRate: pe.benefitRate,
            validFrom: pe.validFrom,
            validUntil: pe.validUntil,
          })),
          serviceCarePlan: {
            planDate: serviceCarePlanData[0]?.planDate || '',
            certificationPeriodStart: serviceCarePlanData[0]?.certificationPeriodStart || null,
            certificationPeriodEnd: serviceCarePlanData[0]?.certificationPeriodEnd || null,
            planPeriodStart: serviceStartDate || null, // サービス開始年月日（訪問記録の最初の日付）
            planPeriodEnd: null, // サービス終了年月日（訪問看護では通常不要）
            creatorType: (serviceCarePlanData[0]?.creatorType as '1' | '2' | '3' | null) || '1', // DBから取得、なければデフォルト値「1」
            careManagerOfficeNumber: serviceCarePlanData[0]?.careManagerOfficeNumber || null, // DBから取得
          },
          nursingRecords: Array.from(recordGroups.values()).map(group => ({
            id: '',
            visitDate: '',
            serviceCode: group.serviceCode,
            serviceTypeCode: group.serviceTypeCode,
            serviceItemCode: group.serviceItemCode,
            points: group.points,
            visitCount: group.visitCount,
            totalPoints: group.totalPoints,
          })),
          bonusHistory: Array.from(bonusGroups.values()).map(group => ({
            id: '',
            nursingRecordId: '',
            visitDate: '',
            bonusCode: '',
            bonusName: '',
            serviceCode: group.serviceCode,
            serviceTypeCode: group.serviceTypeCode,
            serviceItemCode: group.serviceItemCode,
            points: group.points,
            visitCount: group.visitCount,
            totalPoints: group.totalPoints,
          })),
        });
      }

      if (patientDataList.length === 0) {
        return res.status(400).json({ error: "有効な利用者データがありません" });
      }

      // CSV生成用データを構築（複数利用者対応）
      const csvData: CareInsuranceReceiptCsvData = {
        facility: {
          facilityCode: facilityCode10,
          prefectureCode: facility.prefectureCode || '00',
          name: facility.name,
        },
        targetYear,
        targetMonth,
        patients: patientDataList,
      };

      // CSVを生成
      const builder = new CareInsuranceReceiptCsvBuilder();
      const csvBuffer = await builder.build(csvData);

      res.setHeader('Content-Type', 'text/csv; charset=Shift_JIS');
      res.setHeader('Content-Disposition', `attachment; filename="care_receipt_${targetYear}${String(targetMonth).padStart(2, '0')}.csv"`);
      res.send(csvBuffer);
    } catch (error) {
      console.error("Export care insurance CSV error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Export monthly receipts to CSV (Medical Insurance Format)
  app.get("/api/monthly-receipts/export/medical-insurance", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.facility?.id || req.user.facilityId;
      const { year, month } = req.query;

      if (!year || !month) {
        return res.status(400).json({ error: "年月は必須です" });
      }

      // Get all medical insurance receipts for the month
      const receipts = await db.select({
        receipt: monthlyReceipts,
        patient: patients,
      })
        .from(monthlyReceipts)
        .leftJoin(patients, eq(monthlyReceipts.patientId, patients.id))
        .where(and(
          eq(monthlyReceipts.facilityId, facilityId),
          eq(monthlyReceipts.targetYear, parseInt(year as string)),
          eq(monthlyReceipts.targetMonth, parseInt(month as string)),
          eq(monthlyReceipts.insuranceType, 'medical')
        ))
        .orderBy(patients.patientNumber);

      if (receipts.length === 0) {
        return res.status(404).json({ error: "該当するレセプトがありません" });
      }

      // Generate CSV data (simplified format - should match actual 支払基金 format)
      const csvData = receipts.map((item, index) => {
        const receipt = item.receipt;
        const patient = item.patient!;

        return [
          index + 1, // 連番
          patient.insuranceNumber || '', // 保険証番号
          `${patient.lastName} ${patient.firstName}`, // 氏名
          receipt.visitCount, // 訪問回数
          receipt.totalVisitPoints, // 基本点数
          receipt.specialManagementPoints || 0, // 特別管理加算
          receipt.totalPoints, // 合計点数
          receipt.totalAmount, // 合計金額
          receipt.isConfirmed ? '確定済み' : '未確定', // ステータス
        ];
      });

      // Add header row
      const header = [
        '連番',
        '保険証番号',
        '氏名',
        '訪問回数',
        '基本点数',
        '特別管理加算',
        '合計点数',
        '合計金額',
        'ステータス'
      ];

      const csv = stringify([header, ...csvData], {
        bom: true, // Add BOM for Excel compatibility
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="receipt_medical_${year}_${month}.csv"`);
      res.send(csv);
    } catch (error) {
      console.error("Export medical insurance CSV error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Validate a monthly receipt
  app.post("/api/monthly-receipts/:id/validate", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      // Get receipt with all related data
      const receiptData = await db.select({
        receipt: monthlyReceipts,
        patient: patients,
      })
        .from(monthlyReceipts)
        .leftJoin(patients, eq(monthlyReceipts.patientId, patients.id))
        .where(and(
          eq(monthlyReceipts.id, id),
          eq(monthlyReceipts.facilityId, facilityId)
        ))
        .limit(1);

      if (receiptData.length === 0) {
        return res.status(404).json({ error: "レセプトが見つかりません" });
      }

      const receipt = receiptData[0].receipt;
      const patient = receiptData[0].patient!;
      const { targetYear, targetMonth, patientId, insuranceType } = receipt;

      // Get nursing records for the period
      const startDate = new Date(targetYear, targetMonth - 1, 1);
      const endDate = new Date(targetYear, targetMonth, 0);

      const records = await db.select()
        .from(nursingRecords)
        .where(and(
          eq(nursingRecords.facilityId, facilityId),
          eq(nursingRecords.patientId, patientId),
          gte(nursingRecords.visitDate, startDate.toISOString().split('T')[0]),
          lte(nursingRecords.visitDate, endDate.toISOString().split('T')[0]),
          eq(nursingRecords.status, 'completed')
        ));

      // Get doctor orders
      const orders = await db.select()
        .from(doctorOrders)
        .where(and(
          eq(doctorOrders.facilityId, facilityId),
          eq(doctorOrders.patientId, patientId)
        ));

      // Get insurance cards (レセプト詳細APIと同じ条件で取得)
      const cards = await db.select()
        .from(insuranceCards)
        .where(and(
          eq(insuranceCards.facilityId, facilityId),
          eq(insuranceCards.patientId, patientId),
          eq(insuranceCards.isActive, true), // 有効な保険証のみ取得
          eq(insuranceCards.cardType, insuranceType === 'medical' ? 'medical' : 'long_term_care') // 保険種別でフィルタリング
        ))
        .orderBy(desc(insuranceCards.validFrom));

      // Get bonus calculations
      const recordIds = records.map(r => r.id);
      let bonusCalcs: any[] = [];

      if (recordIds.length > 0) {
        bonusCalcs = await db.select({
          history: bonusCalculationHistory,
          bonus: bonusMaster,
        })
          .from(bonusCalculationHistory)
          .leftJoin(bonusMaster, eq(bonusCalculationHistory.bonusMasterId, bonusMaster.id))
          .where(inArray(bonusCalculationHistory.nursingRecordId, recordIds));
      }

      const bonusCalculations = bonusCalcs.map(bc => ({
        bonusMasterId: bc.bonus?.id || '',
        bonusCode: bc.bonus?.bonusCode || '',
        bonusName: bc.bonus?.bonusName || '',
        calculatedPoints: bc.history.calculatedPoints,
        serviceCodeId: bc.history.serviceCodeId || null, // サービスコード選択済みかどうかを判定するため
      }));

      // Run validation
      const validationResult = validateReceipt({
        patientId,
        targetYear,
        targetMonth,
        insuranceType,
        nursingRecords: records.map(r => ({
          id: r.id,
          visitDate: r.visitDate,
          actualStartTime: r.actualStartTime,
          actualEndTime: r.actualEndTime,
          emergencyVisitReason: r.emergencyVisitReason,
          multipleVisitReason: r.multipleVisitReason,
          isSecondVisit: r.isSecondVisit,
        })),
        patient: {
          id: patient.id,
          buildingId: patient.buildingId,
          careLevel: patient.careLevel,
        },
        doctorOrders: orders.map(o => ({
          id: o.id,
          patientId: o.patientId,
          startDate: o.startDate,
          endDate: o.endDate,
        })),
        insuranceCards: cards.map(c => ({
          id: c.id,
          patientId: c.patientId,
          cardType: c.cardType,
          validFrom: c.validFrom,
          validTo: c.validUntil,
        })),
        bonusCalculations,
      });

      // Detect missing bonuses
      const missingSuggestions = detectMissingBonuses(
        records.map(r => ({
          id: r.id,
          visitDate: r.visitDate,
          actualStartTime: r.actualStartTime,
          actualEndTime: r.actualEndTime,
          emergencyVisitReason: r.emergencyVisitReason,
          multipleVisitReason: r.multipleVisitReason,
          isSecondVisit: r.isSecondVisit,
        })),
        {
          id: patient.id,
          buildingId: patient.buildingId,
          careLevel: patient.careLevel,
        },
        bonusCalculations
      );

      // Run CSV export validation
      const csvValidationResult = await validateMonthlyReceiptData(
        facilityId,
        patientId,
        targetYear,
        targetMonth,
        insuranceType // レセプトのinsuranceTypeを引数として渡す
      );

      // Update receipt with validation results
      const hasErrors = validationResult.errors.length > 0 || csvValidationResult.errors.length > 0;
      const hasWarnings = validationResult.warnings.length > 0 || missingSuggestions.length > 0 || csvValidationResult.warnings.length > 0;

      // Prepare CSV export status data
      const csvExportReady = csvValidationResult.canExportCsv;
      const csvExportWarnings = [
        ...csvValidationResult.errors.map(e => ({ field: e.field, message: e.message, severity: e.severity })),
        ...csvValidationResult.warnings.map(w => ({ field: w.field, message: w.message, severity: w.severity }))
      ];
      const lastCsvExportCheck = new Date();

      await db.update(monthlyReceipts)
        .set({
          hasErrors,
          hasWarnings,
          errorMessages: [
            ...validationResult.errors.map(e => e.message),
            ...csvValidationResult.errors.map(e => e.message),
          ],
          warningMessages: [
            ...validationResult.warnings.map(w => w.message),
            ...missingSuggestions.map(s => s.message),
            ...csvValidationResult.warnings.map(w => w.message),
          ],
          csvExportReady,
          csvExportWarnings,
          lastCsvExportCheck,
          updatedAt: new Date(),
        })
        .where(eq(monthlyReceipts.id, id));

      res.json({
        isValid: validationResult.isValid && csvValidationResult.isValid,
        hasErrors,
        hasWarnings,
        errors: validationResult.errors,
        warnings: validationResult.warnings,
        missingSuggestions,
        validation: {
          isValid: csvValidationResult.isValid,
          canExportCsv: csvValidationResult.canExportCsv,
          errors: csvValidationResult.errors,
          warnings: csvValidationResult.warnings,
        },
      });
    } catch (error) {
      console.error("Validate receipt error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Get bonus suggestions for a nursing record
  app.get("/api/nursing-records/:id/bonus-suggestions", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      // Get nursing record
      const recordData = await db.select({
        record: nursingRecords,
        patient: patients,
      })
        .from(nursingRecords)
        .leftJoin(patients, eq(nursingRecords.patientId, patients.id))
        .where(and(
          eq(nursingRecords.id, id),
          eq(nursingRecords.facilityId, facilityId)
        ))
        .limit(1);

      if (recordData.length === 0) {
        return res.status(404).json({ error: "訪問記録が見つかりません" });
      }

      const record = recordData[0].record;
      const patient = recordData[0].patient!;

      // Get already applied bonuses
      const appliedBonuses = await db.select({
        history: bonusCalculationHistory,
        bonus: bonusMaster,
      })
        .from(bonusCalculationHistory)
        .leftJoin(bonusMaster, eq(bonusCalculationHistory.bonusMasterId, bonusMaster.id))
        .where(eq(bonusCalculationHistory.nursingRecordId, id));

      const bonusCalculations = appliedBonuses.map(ab => ({
        bonusMasterId: ab.bonus?.id || '',
        bonusCode: ab.bonus?.bonusCode || '',
        bonusName: ab.bonus?.bonusName || '',
        calculatedPoints: ab.history.calculatedPoints,
      }));

      // Detect missing bonuses
      const suggestions = detectMissingBonuses(
        [{
          id: record.id,
          visitDate: record.visitDate,
          actualStartTime: record.actualStartTime,
          actualEndTime: record.actualEndTime,
          emergencyVisitReason: record.emergencyVisitReason,
          multipleVisitReason: record.multipleVisitReason,
          isSecondVisit: record.isSecondVisit,
        }],
        {
          id: patient.id,
          buildingId: patient.buildingId,
          careLevel: patient.careLevel,
        },
        bonusCalculations
      );

      res.json({
        suggestions,
        appliedBonuses: bonusCalculations,
      });
    } catch (error) {
      console.error("Get bonus suggestions error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // PDF生成エンドポイント（サーバー側でPDFを生成）
  app.get("/api/monthly-receipts/:id/pdf", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const startTime = Date.now();
    const timings: Record<string, number> = {};
    let lastCheckpoint = startTime;

    const checkpoint = (label: string) => {
      const now = Date.now();
      timings[label] = now - lastCheckpoint;
      lastCheckpoint = now;
    };

    try {
      const { id } = req.params;
      const facilityId = req.facility?.id || req.user.facilityId;

      // レセプト詳細データを取得
      checkpoint('start');
      const [receipt] = await db.select()
        .from(monthlyReceipts)
        .where(and(
          eq(monthlyReceipts.id, id),
          eq(monthlyReceipts.facilityId, facilityId)
        ))
        .leftJoin(patients, eq(monthlyReceipts.patientId, patients.id));
      checkpoint('receipt_query');

      if (!receipt || !receipt.monthly_receipts) {
        return res.status(404).json({ error: "レセプトが見つかりません" });
      }

      const receiptData = receipt.monthly_receipts;
      const patientData = receipt.patients;

      // 日付範囲を計算
      const startDate = `${receiptData.targetYear}-${String(receiptData.targetMonth).padStart(2, '0')}-01`;
      const endYear = receiptData.targetMonth === 12 ? receiptData.targetYear + 1 : receiptData.targetYear;
      const endMonth = receiptData.targetMonth === 12 ? 1 : receiptData.targetMonth + 1;
      const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

      // データベースクエリを並列実行（パフォーマンス改善）
      checkpoint('before_parallel_queries');
      const cardType = receiptData.insuranceType === 'care' ? 'long_term_care' : 'medical';
      const [insuranceCardsData, doctorOrdersData, records, facility] = await Promise.all([
        // 保険証情報を取得
        db.select()
          .from(insuranceCards)
          .where(and(
            eq(insuranceCards.patientId, receiptData.patientId),
            eq(insuranceCards.cardType, cardType),
            eq(insuranceCards.isActive, true)
          )),
        // 訪問看護指示書情報を取得
        db.select()
          .from(doctorOrders)
          .leftJoin(medicalInstitutions, eq(doctorOrders.medicalInstitutionId, medicalInstitutions.id))
          .where(eq(doctorOrders.patientId, receiptData.patientId)),
        // 看護記録を取得（サービスコード情報も含める）
        db.select({
          nursing_records: nursingRecords,
          users: users,
          nursing_service_codes: nursingServiceCodes,
        })
          .from(nursingRecords)
          .leftJoin(users, eq(nursingRecords.nurseId, users.id))
          .leftJoin(nursingServiceCodes, eq(nursingRecords.serviceCodeId, nursingServiceCodes.id))
          .where(and(
            eq(nursingRecords.patientId, receiptData.patientId),
            gte(nursingRecords.visitDate, startDate),
            lt(nursingRecords.visitDate, endDate)
          ))
          .orderBy(asc(nursingRecords.visitDate)),
        // 施設情報を取得
        db.query.facilities.findFirst({
          where: eq(facilities.id, facilityId),
        }),
      ]);
      checkpoint('parallel_queries_complete');

      // 適用済みサービスコードを取得（serviceCodeIdが設定されている加算履歴）
      // パフォーマンス改善: recordsで既にサービスコード情報を取得しているため、
      // appliedServiceCodesDataではbonusCalculationHistoryから直接取得し、
      // recordsのデータとマージする
      const recordIds = records.map(r => r.nursing_records.id);
      
      // recordsから訪問日時情報をマップ化（高速アクセス用）
      const recordsMap = new Map(
        records.map(r => [r.nursing_records.id, {
          visitDate: r.nursing_records.visitDate,
          actualStartTime: r.nursing_records.actualStartTime,
          actualEndTime: r.nursing_records.actualEndTime,
        }])
      );
      
      // appliedServiceCodesDataの取得（nursingRecordsのJOINを削除してパフォーマンス改善）
      checkpoint('before_applied_service_codes_query');
      const appliedServiceCodesData = recordIds.length > 0 ? await db.select({
        history: bonusCalculationHistory,
        serviceCode: nursingServiceCodes,
        recordId: bonusCalculationHistory.nursingRecordId,
      })
        .from(bonusCalculationHistory)
        .leftJoin(nursingServiceCodes, eq(bonusCalculationHistory.serviceCodeId, nursingServiceCodes.id))
        .where(and(
          inArray(bonusCalculationHistory.nursingRecordId, recordIds),
          isNotNull(bonusCalculationHistory.serviceCodeId)
        ))
        .then(results => results.map(item => {
          // recordsから訪問日時情報を取得（マップを使用して高速化）
          const record = recordsMap.get(item.recordId);
          return {
            history: item.history,
            serviceCode: item.serviceCode,
            record: record || null,
          };
        }).sort((a, b) => {
          // 訪問日時でソート（recordsの順序に合わせる）
          if (!a.record || !b.record) return 0;
          const dateCompare = a.record.visitDate.localeCompare(b.record.visitDate);
          if (dateCompare !== 0) return dateCompare;
          const aTime = a.record.actualStartTime ? String(a.record.actualStartTime) : '';
          const bTime = b.record.actualStartTime ? String(b.record.actualStartTime) : '';
          return aTime.localeCompare(bTime);
        })) : [];
      checkpoint('applied_service_codes_query_complete');

      // bonusBreakdownから各加算の点数を正確に取得するため、bonusCodeの完全一致または部分一致で検索
      // bonusBreakdownには { bonusCode, bonusName, count, points } の形式でデータが含まれる

      const facilityInfo = facility ? {
        name: facility.name,
        address: facility.address || '',
        phone: facility.phone || '',
        fax: '',
      } : undefined;

      // PDFデータ構造を構築
      const bonusBreakdown = (receiptData.bonusBreakdown as any[]) || [];
      
      // bonusBreakdownから各加算の点数を合計して取得（複数の加算がある場合は合計）
      const emergencyPoints = bonusBreakdown
        .filter((b: any) => b.bonusCode?.includes('emergency'))
        .reduce((sum, b) => sum + (b.points || 0), 0);
      
      const longDurationPoints = bonusBreakdown
        .filter((b: any) => b.bonusCode?.includes('long_duration') || b.bonusCode?.includes('long_visit') || (b.bonusCode?.includes('long') && !b.bonusCode?.includes('along')))
        .reduce((sum, b) => sum + (b.points || 0), 0);
      
      const multipleVisitPoints = bonusBreakdown
        .filter((b: any) => b.bonusCode?.includes('multiple_visit') || b.bonusCode?.includes('multiple'))
        .reduce((sum, b) => sum + (b.points || 0), 0);
      
      const sameBuildingReduction = bonusBreakdown
        .filter((b: any) => b.bonusCode?.includes('same_building') || b.bonusCode?.includes('building_reduction'))
        .reduce((sum, b) => sum + (b.points || 0), 0);
      
      const pdfData = {
        id: receiptData.id.toString(),
        targetYear: receiptData.targetYear,
        targetMonth: receiptData.targetMonth,
        insuranceType: receiptData.insuranceType,
        visitCount: receiptData.visitCount,
        totalVisitPoints: receiptData.totalVisitPoints,
        specialManagementPoints: receiptData.specialManagementPoints || 0,
        emergencyPoints,
        longDurationPoints,
        multipleVisitPoints,
        sameBuildingReduction,
        totalPoints: receiptData.totalPoints,
        totalAmount: receiptData.totalAmount,
        patient: {
          patientNumber: patientData?.patientNumber || '',
          lastName: patientData?.lastName || '',
          firstName: patientData?.firstName || '',
          dateOfBirth: patientData?.dateOfBirth || '',
          gender: patientData?.gender || 'male',
          address: patientData?.address || null,
        },
        insuranceCard: insuranceCardsData[0] ? {
          cardType: insuranceCardsData[0].cardType,
          insurerNumber: insuranceCardsData[0].insurerNumber || '',
          insuredNumber: insuranceCardsData[0].insuredNumber || '',
          validFrom: insuranceCardsData[0].validFrom,
          validUntil: insuranceCardsData[0].validUntil || null,
          copaymentRate: insuranceCardsData[0].copaymentRate,
        } : null,
        doctorOrder: doctorOrdersData[0]?.doctor_orders ? {
          order: {
            orderDate: doctorOrdersData[0].doctor_orders.orderDate,
            diagnosis: doctorOrdersData[0].doctor_orders.diagnosis,
            orderContent: doctorOrdersData[0].doctor_orders.orderContent,
          },
          medicalInstitution: doctorOrdersData[0].medical_institutions ? {
            name: doctorOrdersData[0].medical_institutions.name,
            doctorName: doctorOrdersData[0].medical_institutions.doctorName,
          } : { name: '', doctorName: '' },
        } : null,
        relatedRecords: records.map(r => {
          // パフォーマンス改善: サーバー側でフォーマット処理を実行
          const visitDate = r.nursing_records.visitDate;
          const actualStartTime = r.nursing_records.actualStartTime;
          const actualEndTime = r.nursing_records.actualEndTime;
          
          // 日付フォーマット
          const visitDateFormatted = visitDate ? (() => {
            const date = new Date(visitDate);
            return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
          })() : '';
          
          // 時間フォーマット
          const formatTime = (time: string | Date | null | undefined): string | null => {
            if (!time) return null;
            const timeStr = typeof time === 'string' 
              ? (time.includes('T') ? time.substring(11, 16) : time.substring(0, 5))
              : (time instanceof Date ? time.toISOString().substring(11, 16) : String(time).substring(0, 5));
            return timeStr;
          };
          
          const startTimeFormatted = formatTime(actualStartTime);
          const endTimeFormatted = formatTime(actualEndTime);
          
          // 観察事項の文字列切り詰め
          const observations = r.nursing_records.observations || '';
          const observationsText = observations.length > 40 ? observations.substring(0, 40) + '...' : observations;
          
          // サービスコードの点数フォーマット
          const serviceCodePointsFormatted = r.nursing_service_codes 
            ? r.nursing_service_codes.points.toLocaleString() 
            : null;
          
          return {
            visitDate: visitDateFormatted,
            actualStartTime: startTimeFormatted,
            actualEndTime: endTimeFormatted,
            status: r.nursing_records.status,
            observations: observationsText || '-',
            implementedCare: r.nursing_records.content || '',
            nurse: r.users ? {
              fullName: r.users.fullName,
            } : null,
            serviceCode: r.nursing_service_codes ? {
              code: r.nursing_service_codes.serviceCode,
              name: r.nursing_service_codes.serviceName,
              points: r.nursing_service_codes.points,
              pointsFormatted: serviceCodePointsFormatted!,
            } : null,
          };
        }),
        bonusHistory: bonusBreakdown.map((item: any) => ({
          bonus: {
            bonusCode: item.bonusCode || '',
            bonusName: item.bonusName || '',
            bonusCategory: item.bonusCategory || '',
          },
          history: {
            calculatedPoints: item.points || 0,
            appliedAt: new Date().toISOString(),
          },
        })),
        appliedServiceCodes: appliedServiceCodesData.map(item => {
          const visitDate = item.record?.visitDate || '';
          const actualStartTime = item.record?.actualStartTime as string | Date | null | undefined;
          const actualEndTime = item.record?.actualEndTime as string | Date | null | undefined;
          
          // パフォーマンス改善: サーバー側でフォーマット処理を実行
          const formatDate = (dateStr: string) => {
            const date = new Date(dateStr);
            return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
          };
          
          const formatTime = (time: string | Date | null | undefined): string | null => {
            if (!time) return null;
            if (typeof time === 'string') {
              return time.includes('T') ? time.substring(11, 16) : time.substring(0, 5);
            }
            if (time instanceof Date) {
              return time.toISOString().substring(11, 16);
            }
            return String(time).substring(0, 5);
          };
          
          const visitDateFormatted = visitDate ? formatDate(visitDate) : '';
          const startTimeFormatted = formatTime(actualStartTime);
          const endTimeFormatted = formatTime(actualEndTime);
          const visitDateTime = startTimeFormatted ? `${visitDateFormatted} ${startTimeFormatted}` : visitDateFormatted;
          
          return {
            visitDate: visitDateFormatted,
            visitDateTime,
            visitEndTime: endTimeFormatted,
            serviceCode: item.serviceCode ? {
              code: item.serviceCode.serviceCode,
              name: item.serviceCode.serviceName,
              points: item.serviceCode.points,
              pointsFormatted: item.serviceCode.points.toLocaleString(),
              unit: '回', // 単位は固定（サービスコードマスタにunitフィールドがないため）
            } : null,
          };
        }),
      };

      checkpoint('pdf_data_preparation_complete');
      
      // データ量をログ出力（デバッグ用）
      console.log('[PDF Performance] Data counts:', {
        relatedRecords: pdfData.relatedRecords.length,
        appliedServiceCodes: pdfData.appliedServiceCodes?.length || 0,
        bonusHistory: pdfData.bonusHistory.length,
      });

      // レスポンスヘッダーを先に設定（ストリーミングを早く開始）
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=receipt_${receiptData.targetYear}${String(receiptData.targetMonth).padStart(2, '0')}_${patientData?.patientNumber || 'unknown'}.pdf`
      );

      // パフォーマンス改善: データは既にサーバー側でフォーマット済みのため、変換不要
      checkpoint('before_date_conversion');
      const pdfDataWithStringDates = pdfData; // 既にフォーマット済み
      checkpoint('date_conversion_complete');

      // モジュールを並列で読み込む（パフォーマンス改善）
      checkpoint('before_module_imports');
      const [{ renderToStream }, { registerPDFFont }, ReceiptPDFModule, React] = await Promise.all([
        import('@react-pdf/renderer'),
        import('./pdf-fonts'),
        import('../client/src/components/ReceiptPDF'),
        import('react'),
      ]);
      checkpoint('module_imports_complete');

      // フォント登録（キャッシュ済みの場合は高速）
      checkpoint('before_font_registration');
      registerPDFFont();
      checkpoint('font_registration_complete');

      // ReceiptPDFコンポーネントを取得
      const ReceiptPDF = ReceiptPDFModule.ReceiptPDF;

      // PDFをストリームとして生成（ReceiptPDFはDocumentを含むコンポーネント）
      checkpoint('before_pdf_render');
      const pdfElement = React.createElement(ReceiptPDF, { receipt: pdfDataWithStringDates, facilityInfo }) as any;
      const pdfStream = await renderToStream(pdfElement);
      checkpoint('pdf_render_complete');

      // PDFストリームをレスポンスにパイプ
      checkpoint('before_stream_pipe');
      pdfStream.pipe(res);
      
      // ストリーミング完了を待機（非同期）
      pdfStream.on('end', () => {
        checkpoint('stream_complete');
        const totalTime = Date.now() - startTime;
        console.log('[PDF Performance] Total time:', totalTime, 'ms');
        console.log('[PDF Performance] Timings:', JSON.stringify(timings, null, 2));
      });

    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error("[PDF Performance] Error occurred after", totalTime, "ms");
      console.error("[PDF Performance] Timings so far:", JSON.stringify(timings, null, 2));
      console.error("PDF generation error:", error);
      res.status(500).json({ error: "PDF生成中にエラーが発生しました" });
    }
  });

  // ========== 訪問看護記録書Ⅰ PDF生成API（サーバーサイド・完全一致実装） ==========
  app.get("/api/patients/:id/nursing-record-i-pdf", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { generateNursingRecordIPDF } = await import("./pdf-generators/nursing-record-i");
      const patientId = req.params.id;
      const userId = req.session?.userId;
      if (!userId) return res.status(401).json({ error: "認証失敗" });

      const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
      if (!user) return res.status(401).json({ error: "認証失敗" });

      const patient = await db.query.patients.findFirst({
        where: and(eq(patients.id, patientId), eq(patients.facilityId, user.facilityId)),
        with: { medicalInstitution: true, careManager: true, building: true },
      });
      if (!patient) return res.status(404).json({ error: "患者が見つかりません" });

      const initialRecord = await db.query.nursingRecords.findFirst({
        where: and(eq(nursingRecords.patientId, patientId), eq(nursingRecords.facilityId, user.facilityId)),
        with: { nurse: true },
        orderBy: asc(nursingRecords.recordDate),
      });

      const latestRecord = await db.query.nursingRecords.findFirst({
        where: and(eq(nursingRecords.patientId, patientId), eq(nursingRecords.facilityId, user.facilityId)),
        with: { nurse: true },
        orderBy: desc(nursingRecords.recordDate),
      });

      const insuranceCard = await db.query.insuranceCards.findFirst({
        where: and(
          eq(insuranceCards.patientId, patientId),
          or(sql`${insuranceCards.validUntil} IS NULL`, gte(insuranceCards.validUntil, new Date().toISOString().split('T')[0]))
        ),
        orderBy: desc(insuranceCards.validFrom),
      });

      const facility = await db.query.facilities.findFirst({ where: eq(facilities.id, user.facilityId) });

      const filename = `訪問看護記録書Ⅰ_${patient.lastName}${patient.firstName}_${new Date().toISOString().split('T')[0]}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);

      const pdfData = {
        patient: {
          lastName: patient.lastName, firstName: patient.firstName, dateOfBirth: patient.dateOfBirth,
          gender: patient.gender, address: patient.address, phone: patient.phone,
          emergencyContact: patient.emergencyContact, emergencyPhone: patient.emergencyPhone,
          medicalHistory: patient.medicalHistory, careLevel: patient.careLevel,
        },
        initialRecord: initialRecord ? {
          recordDate: initialRecord.recordDate, actualStartTime: initialRecord.actualStartTime,
          actualEndTime: initialRecord.actualEndTime, nurse: initialRecord.nurse,
        } : null,
        latestRecord: latestRecord ? { observations: latestRecord.observations } : null,
        medicalInstitution: patient.medicalInstitution,
        careManager: patient.careManager,
        insuranceCard,
        facility,
      };

      await generateNursingRecordIPDF(pdfData, res, path.join(process.cwd(), 'server', 'fonts', 'NotoSansCJKjp-Regular.otf'));
    } catch (error) {
      console.error("記録書Ⅰ PDF生成エラー:", error);
      if (!res.headersSent) res.status(500).json({ error: "PDF生成中にエラーが発生しました" });
    }
  });

  // 訪問看護記録書I Excel出力
  app.get("/api/patients/:id/nursing-record-i-excel", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { generateNursingRecordIExcel } = await import("./excel-generators/nursing-record-i");
      const patientId = req.params.id;
      const userId = req.session?.userId;
      if (!userId) return res.status(401).json({ error: "認証失敗" });

      const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
      if (!user) return res.status(401).json({ error: "認証失敗" });

      const patient = await db.query.patients.findFirst({
        where: and(eq(patients.id, patientId), eq(patients.facilityId, user.facilityId)),
        with: { medicalInstitution: true, careManager: true },
      });
      if (!patient) return res.status(404).json({ error: "患者が見つかりません" });

      const doctorOrder = await db.query.doctorOrders.findFirst({
        where: and(
          eq(doctorOrders.patientId, patientId),
          eq(doctorOrders.facilityId, user.facilityId)
        ),
        orderBy: desc(doctorOrders.orderDate),
      });

      const initialNursingRecord = await db.query.nursingRecords.findFirst({
        where: and(
          eq(nursingRecords.patientId, patientId),
          eq(nursingRecords.facilityId, user.facilityId),
          eq(nursingRecords.isFirstVisitOfPlan, true)
        ),
        with: { nurse: true, schedule: true },
        orderBy: asc(nursingRecords.visitDate),
      });

      const facility = await db.query.facilities.findFirst({ where: eq(facilities.id, user.facilityId) });
      if (!facility) return res.status(404).json({ error: "施設情報が見つかりません" });

      const excelData = {
        patient: {
          lastName: patient.lastName,
          firstName: patient.firstName,
          dateOfBirth: patient.dateOfBirth,
          address: patient.address,
          phone: patient.phone,
          emergencyContact: patient.emergencyContact,
          emergencyPhone: patient.emergencyPhone,
          medicalHistory: patient.medicalHistory,
          careLevel: patient.careLevel,
        },
        doctorOrder: doctorOrder ? {
          diagnosis: doctorOrder.diagnosis,
          orderContent: doctorOrder.orderContent,
        } : null,
        medicalInstitution: patient.medicalInstitution,
        careManager: patient.careManager,
        initialVisit: initialNursingRecord ? {
          visitDate: initialNursingRecord.visitDate,
          actualStartTime: initialNursingRecord.actualStartTime ? initialNursingRecord.actualStartTime.toISOString().split('T')[1].substring(0, 5) : null,
          actualEndTime: initialNursingRecord.actualEndTime ? initialNursingRecord.actualEndTime.toISOString().split('T')[1].substring(0, 5) : null,
          content: initialNursingRecord.content,
          nurseName: initialNursingRecord.nurse?.fullName || '',
          visitType: initialNursingRecord.schedule?.visitType || '',
        } : null,
        facility: {
          name: facility.name,
        },
      };

      const buffer = await generateNursingRecordIExcel(excelData);

      const filename = `訪問看護記録書I_${patient.lastName}${patient.firstName}_${new Date().toISOString().split('T')[0]}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      res.send(buffer);
    } catch (error) {
      console.error("記録書I Excel生成エラー:", error);
      if (!res.headersSent) res.status(500).json({ error: "Excel生成中にエラーが発生しました" });
    }
  });

  // ========== マスターデータ取得API ==========

  // 都道府県コード一覧
  app.get("/api/master/prefecture-codes", async (req, res) => {
    try {
      const codes = await db.query.prefectureCodes.findMany({
        orderBy: [asc(prefectureCodes.displayOrder)],
      });
      res.json(codes);
    } catch (error) {
      console.error("Error fetching prefecture codes:", error);
      res.status(500).json({ error: "都道府県コードの取得に失敗しました" });
    }
  });

  // 訪問看護サービスコード一覧
  app.get("/api/master/nursing-service-codes", async (req, res) => {
    try {
      const { isActive, insuranceType } = req.query;

      let whereConditions = [];
      if (isActive !== undefined) {
        whereConditions.push(eq(nursingServiceCodes.isActive, isActive === 'true'));
      }
      if (insuranceType && (insuranceType === 'medical' || insuranceType === 'care')) {
        whereConditions.push(eq(nursingServiceCodes.insuranceType, insuranceType));
      }

      const codes = await db.query.nursingServiceCodes.findMany({
        where: whereConditions.length > 0 ? and(...whereConditions) : undefined,
        orderBy: [asc(nursingServiceCodes.serviceCode)],
      });
      res.json(codes);
    } catch (error) {
      console.error("Error fetching nursing service codes:", error);
      res.status(500).json({ error: "サービスコードの取得に失敗しました" });
    }
  });

  // 職員資格コード一覧
  app.get("/api/master/staff-qualification-codes", async (req, res) => {
    try {
      const codes = await db.query.staffQualificationCodes.findMany({
        orderBy: [asc(staffQualificationCodes.displayOrder)],
      });
      res.json(codes);
    } catch (error) {
      console.error("Error fetching staff qualification codes:", error);
      res.status(500).json({ error: "職員資格コードの取得に失敗しました" });
    }
  });

  // 訪問場所コード一覧
  app.get("/api/master/visit-location-codes", async (req, res) => {
    try {
      const codes = await db.query.visitLocationCodes.findMany({
        orderBy: [asc(visitLocationCodes.displayOrder)],
      });
      res.json(codes);
    } catch (error) {
      console.error("Error fetching visit location codes:", error);
      res.status(500).json({ error: "訪問場所コードの取得に失敗しました" });
    }
  });

  // レセプト種別コード一覧
  app.get("/api/master/receipt-type-codes", async (req, res) => {
    try {
      const { insuranceType } = req.query;

      let whereConditions = [];
      if (insuranceType && (insuranceType === 'medical' || insuranceType === 'care')) {
        whereConditions.push(eq(receiptTypeCodes.insuranceType, insuranceType));
      }

      const codes = await db.query.receiptTypeCodes.findMany({
        where: whereConditions.length > 0 ? and(...whereConditions) : undefined,
        orderBy: [asc(receiptTypeCodes.displayOrder)],
      });
      res.json(codes);
    } catch (error) {
      console.error("Error fetching receipt type codes:", error);
      res.status(500).json({ error: "レセプト種別コードの取得に失敗しました" });
    }
  });

  // ========== マスターデータCRUD API ==========

  // 都道府県コード - 作成
  app.post("/api/master/prefecture-codes", requireSystemAdmin, async (req, res) => {
    try {
      const { prefectureCode, prefectureName, displayOrder } = req.body;

      if (!prefectureCode || !prefectureName) {
        return res.status(400).json({ error: "都道府県コードと名称は必須です" });
      }

      const [newCode] = await db.insert(prefectureCodes).values({
        id: crypto.randomUUID(),
        prefectureCode,
        prefectureName,
        displayOrder: displayOrder || 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();

      res.json(newCode);
    } catch (error) {
      console.error("Error creating prefecture code:", error);
      res.status(500).json({ error: "都道府県コードの作成に失敗しました" });
    }
  });

  // 都道府県コード - 更新
  app.put("/api/master/prefecture-codes/:id", requireSystemAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { prefectureCode, prefectureName, displayOrder, isActive } = req.body;

      const [updated] = await db.update(prefectureCodes)
        .set({
          prefectureCode,
          prefectureName,
          displayOrder,
          isActive,
          updatedAt: new Date(),
        })
        .where(eq(prefectureCodes.id, id))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "都道府県コードが見つかりません" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating prefecture code:", error);
      res.status(500).json({ error: "都道府県コードの更新に失敗しました" });
    }
  });

  // 訪問看護サービスコード - 作成
  app.post("/api/master/nursing-service-codes", requireSystemAdmin, async (req, res) => {
    try {
      const { serviceCode, serviceName, insuranceType, points, description } = req.body;

      if (!serviceCode || !serviceName || !insuranceType || !points) {
        return res.status(400).json({ error: "サービスコード、名称、保険種別、点数は必須です" });
      }

      if (insuranceType !== 'medical' && insuranceType !== 'care') {
        return res.status(400).json({ error: "保険種別は medical または care である必要があります" });
      }

      const today = new Date().toISOString().split('T')[0];

      const [newCode] = await db.insert(nursingServiceCodes).values({
        id: crypto.randomUUID(),
        serviceCode,
        serviceName,
        insuranceType,
        points: parseInt(points),
        validFrom: today,
        description: description || null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();

      res.json(newCode);
    } catch (error) {
      console.error("Error creating nursing service code:", error);
      res.status(500).json({ error: "サービスコードの作成に失敗しました" });
    }
  });

  // 訪問看護サービスコード - 更新
  app.put("/api/master/nursing-service-codes/:id", requireSystemAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { serviceCode, serviceName, insuranceType, points, description, isActive } = req.body;

      if (insuranceType && insuranceType !== 'medical' && insuranceType !== 'care') {
        return res.status(400).json({ error: "保険種別は medical または care である必要があります" });
      }

      const [updated] = await db.update(nursingServiceCodes)
        .set({
          serviceCode,
          serviceName,
          insuranceType,
          points: points ? parseInt(points) : undefined,
          description,
          isActive,
          updatedAt: new Date(),
        })
        .where(eq(nursingServiceCodes.id, id))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "サービスコードが見つかりません" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating nursing service code:", error);
      res.status(500).json({ error: "サービスコードの更新に失敗しました" });
    }
  });

  // 職員資格コード - 作成
  app.post("/api/master/staff-qualification-codes", requireSystemAdmin, async (req, res) => {
    try {
      const { qualificationCode, qualificationName, displayOrder } = req.body;

      if (!qualificationCode || !qualificationName) {
        return res.status(400).json({ error: "資格コードと名称は必須です" });
      }

      const [newCode] = await db.insert(staffQualificationCodes).values({
        id: crypto.randomUUID(),
        qualificationCode,
        qualificationName,
        displayOrder: displayOrder || 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();

      res.json(newCode);
    } catch (error) {
      console.error("Error creating staff qualification code:", error);
      res.status(500).json({ error: "職員資格コードの作成に失敗しました" });
    }
  });

  // 職員資格コード - 更新
  app.put("/api/master/staff-qualification-codes/:id", requireSystemAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { qualificationCode, qualificationName, displayOrder, isActive } = req.body;

      const [updated] = await db.update(staffQualificationCodes)
        .set({
          qualificationCode,
          qualificationName,
          displayOrder,
          isActive,
          updatedAt: new Date(),
        })
        .where(eq(staffQualificationCodes.id, id))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "職員資格コードが見つかりません" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating staff qualification code:", error);
      res.status(500).json({ error: "職員資格コードの更新に失敗しました" });
    }
  });

  // 訪問場所コード - 作成
  app.post("/api/master/visit-location-codes", requireSystemAdmin, async (req, res) => {
    try {
      const { locationCode, locationName, displayOrder } = req.body;

      if (!locationCode || !locationName) {
        return res.status(400).json({ error: "場所コードと名称は必須です" });
      }

      const [newCode] = await db.insert(visitLocationCodes).values({
        id: crypto.randomUUID(),
        locationCode,
        locationName,
        displayOrder: displayOrder || 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();

      res.json(newCode);
    } catch (error) {
      console.error("Error creating visit location code:", error);
      res.status(500).json({ error: "訪問場所コードの作成に失敗しました" });
    }
  });

  // 訪問場所コード - 更新
  app.put("/api/master/visit-location-codes/:id", requireSystemAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { locationCode, locationName, displayOrder, isActive } = req.body;

      const [updated] = await db.update(visitLocationCodes)
        .set({
          locationCode,
          locationName,
          displayOrder,
          isActive,
          updatedAt: new Date(),
        })
        .where(eq(visitLocationCodes.id, id))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "訪問場所コードが見つかりません" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating visit location code:", error);
      res.status(500).json({ error: "訪問場所コードの更新に失敗しました" });
    }
  });

  // レセプト種別コード - 作成
  app.post("/api/master/receipt-type-codes", requireSystemAdmin, async (req, res) => {
    try {
      const { receiptTypeCode, receiptTypeName, insuranceType, displayOrder, description } = req.body;

      if (!receiptTypeCode || !receiptTypeName || !insuranceType) {
        return res.status(400).json({ error: "種別コード、名称、保険種別は必須です" });
      }

      if (insuranceType !== 'medical' && insuranceType !== 'care') {
        return res.status(400).json({ error: "保険種別は medical または care である必要があります" });
      }

      const [newCode] = await db.insert(receiptTypeCodes).values({
        id: crypto.randomUUID(),
        receiptTypeCode,
        receiptTypeName,
        insuranceType,
        displayOrder: displayOrder || 0,
        description: description || null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();

      res.json(newCode);
    } catch (error) {
      console.error("Error creating receipt type code:", error);
      res.status(500).json({ error: "レセプト種別コードの作成に失敗しました" });
    }
  });

  // レセプト種別コード - 更新
  app.put("/api/master/receipt-type-codes/:id", requireSystemAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { receiptTypeCode, receiptTypeName, insuranceType, displayOrder, description, isActive } = req.body;

      if (insuranceType && insuranceType !== 'medical' && insuranceType !== 'care') {
        return res.status(400).json({ error: "保険種別は medical または care である必要があります" });
      }

      const [updated] = await db.update(receiptTypeCodes)
        .set({
          receiptTypeCode,
          receiptTypeName,
          insuranceType,
          displayOrder,
          description,
          isActive,
          updatedAt: new Date(),
        })
        .where(eq(receiptTypeCodes.id, id))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "レセプト種別コードが見つかりません" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating receipt type code:", error);
      res.status(500).json({ error: "レセプト種別コードの更新に失敗しました" });
    }
  });

  // ======================
  // CSV出力データチェックAPI
  // ======================

  /**
   * 単一月次レセプトのデータ検証
   * GET /api/receipts/:id/validate
   */
  app.get("/api/receipts/:id/validate", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;

      // レセプト情報を取得
      const receipt = await db.query.monthlyReceipts.findFirst({
        where: eq(monthlyReceipts.id, id),
      });

      if (!receipt) {
        return res.status(404).json({ error: "レセプトが見つかりません" });
      }

      // バリデーション実行
      const validationResult = await validateMonthlyReceiptData(
        receipt.facilityId,
        receipt.patientId,
        receipt.targetYear,
        receipt.targetMonth
      );

      res.json(validationResult);
    } catch (error) {
      console.error("Error validating receipt:", error);
      res.status(500).json({ error: "レセプトの検証に失敗しました" });
    }
  });

  /**
   * 複数月次レセプトのバッチ検証
   * POST /api/receipts/validate-batch
   * Body: { receiptIds: string[] }
   */
  app.post("/api/receipts/validate-batch", requireAuth, async (req, res) => {
    try {
      const { receiptIds } = req.body;

      if (!Array.isArray(receiptIds) || receiptIds.length === 0) {
        return res.status(400).json({ error: "レセプトIDの配列が必要です" });
      }

      // バッチ検証実行
      const resultsMap = await validateMultipleReceipts(receiptIds);

      // Map を オブジェクトに変換して返す
      const results: Record<string, any> = {};
      resultsMap.forEach((value, key) => {
        results[key] = value;
      });

      res.json(results);
    } catch (error) {
      console.error("Error batch validating receipts:", error);
      res.status(500).json({ error: "レセプトのバッチ検証に失敗しました" });
    }
  });

  /**
   * 月次レセプト生成前の事前チェック
   * POST /api/receipts/pre-check
   * Body: { facilityId: string, patientId: string, targetYear: number, targetMonth: number }
   */
  app.post("/api/receipts/pre-check", requireAuth, async (req, res) => {
    try {
      const { facilityId, patientId, targetYear, targetMonth } = req.body;

      if (!facilityId || !patientId || !targetYear || !targetMonth) {
        return res.status(400).json({
          error: "facilityId, patientId, targetYear, targetMonth は必須です"
        });
      }

      // バリデーション実行
      const validationResult = await validateMonthlyReceiptData(
        facilityId,
        patientId,
        targetYear,
        targetMonth
      );

      res.json(validationResult);
    } catch (error) {
      console.error("Error pre-checking receipt data:", error);
      res.status(500).json({ error: "レセプトデータの事前チェックに失敗しました" });
    }
  });

  // ======================
  // 医療保険レセプトCSV出力API
  // ======================

  /**
   * 給付割合を計算する関数
   * CSVビルダーのdetermineReviewOrganizationCodeロジックを参考に実装
   */
  function calculateBenefitRatio(insuranceCard: {
    reviewOrganizationCode?: string | null;
    insurerNumber?: string | null;
    copaymentRate?: string | null;
  }): string | null {
    // 審査支払機関コードを取得
    let reviewOrgCode: string | null = null;
    
    // 保険証に設定されている審査支払機関コードを優先使用
    if (insuranceCard?.reviewOrganizationCode) {
      reviewOrgCode = insuranceCard.reviewOrganizationCode;
    } else {
      // 保険者番号から動的判定（フォールバック）
      const insurerNumber = insuranceCard?.insurerNumber;
      if (!insurerNumber) {
        return null;
      }

      const length = insurerNumber.trim().length;
      const prefix = insurerNumber.substring(0, 2);

      // 6桁 → 国保連 ('2')
      if (length === 6) {
        reviewOrgCode = '2';
      } else if (length === 8) {
        // 後期高齢者医療（39で始まる） → 国保連 ('2')
        if (prefix === '39') {
          reviewOrgCode = '2';
        } else {
          // その他の8桁 → 社保 ('1')
          reviewOrgCode = '1';
        }
      } else {
        return null;
      }
    }

    // 国保の場合のみ給付割合を計算（審査支払機関コードが'2'の場合）
    if (reviewOrgCode === '2') {
      // 負担割合から給付割合を計算（100 - 負担割合）
      const copaymentRate = insuranceCard.copaymentRate 
        ? parseInt(insuranceCard.copaymentRate) 
        : 30; // デフォルト3割
      const benefitRate = 100 - copaymentRate;
      return String(benefitRate).padStart(3, '0'); // 3桁で出力（例: 070, 080, 090）
    }

    // 国保以外の場合はnull
    return null;
  }

  /**
   * 単一月次レセプトのCSV出力
   * GET /api/receipts/:id/export-csv
   */
  app.get("/api/receipts/:id/export-csv", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;

      // レセプト情報を取得
      const receipt = await db.query.monthlyReceipts.findFirst({
        where: eq(monthlyReceipts.id, id),
      });

      if (!receipt) {
        return res.status(404).json({ error: "レセプトが見つかりません" });
      }

      // 事前バリデーション
      const validationResult = await validateMonthlyReceiptData(
        receipt.facilityId,
        receipt.patientId,
        receipt.targetYear,
        receipt.targetMonth
      );

      if (!validationResult.canExportCsv) {
        return res.status(400).json({
          error: "CSV出力に必要なデータが不足しています",
          validation: validationResult
        });
      }

      // 関連データを取得してCSVデータを構築（Phase 3: 保険証・公費情報も取得）
      const [facility, patient, nursingRecordsData, doctorOrdersData, insuranceCardsData, publicExpensesData] = await Promise.all([
        db.query.facilities.findFirst({
          where: eq(facilities.id, receipt.facilityId),
        }),
        db.query.patients.findFirst({
          where: eq(patients.id, receipt.patientId),
        }),
        db.query.nursingRecords.findMany({
          where: and(
            eq(nursingRecords.patientId, receipt.patientId),
            eq(nursingRecords.facilityId, receipt.facilityId)
          ),
          with: {
            serviceCode: true, // サービスコードリレーションを含める
          },
        }),
        db.query.doctorOrders.findMany({
          where: and(
            eq(doctorOrders.patientId, receipt.patientId),
            eq(doctorOrders.facilityId, receipt.facilityId),
            eq(doctorOrders.isActive, true)
          ),
        }),
        db.query.insuranceCards.findMany({
          where: and(
            eq(insuranceCards.patientId, receipt.patientId),
            eq(insuranceCards.isActive, true)
          ),
        }),
        db.query.publicExpenseCards.findMany({
          where: and(
            eq(publicExpenseCards.patientId, receipt.patientId),
            eq(publicExpenseCards.isActive, true)
          ),
          orderBy: asc(publicExpenseCards.priority),
        }),
      ]);

      if (!facility || !patient) {
        return res.status(500).json({ error: "必要なデータが見つかりません" });
      }

      // 医療保険レセプトの場合は医療保険の保険証を選択、介護保険レセプトの場合は介護保険の保険証を選択
      const targetCardType = receipt.insuranceType === 'medical' ? 'medical' : 'long_term_care';
      const targetInsuranceCard = insuranceCardsData.find(card => card.cardType === targetCardType);
      
      if (!targetInsuranceCard) {
        return res.status(400).json({ 
          error: `${receipt.insuranceType === 'medical' ? '医療' : '介護'}保険証が登録されていません` 
        });
      }

      // 対象月の訪問記録をフィルタ
      const startDate = new Date(receipt.targetYear, receipt.targetMonth - 1, 1);
      const endDate = new Date(receipt.targetYear, receipt.targetMonth, 0);
      const targetRecords = nursingRecordsData.filter(record => {
        const visitDate = new Date(record.visitDate);
        return visitDate >= startDate && visitDate <= endDate;
      });

      // 有効な訪問看護指示書を取得
      const validOrder = doctorOrdersData.find(order => {
        const orderStart = new Date(order.startDate);
        const orderEnd = new Date(order.endDate);
        return orderStart <= startDate && orderEnd >= endDate;
      });

      if (!validOrder) {
        return res.status(400).json({ error: "有効な訪問看護指示書がありません" });
      }

      // 医療機関情報を取得
      const medicalInstitution = await db.query.medicalInstitutions.findFirst({
        where: eq(medicalInstitutions.id, validOrder.medicalInstitutionId),
      });

      if (!medicalInstitution) {
        return res.status(500).json({ error: "医療機関情報が見つかりません" });
      }

      // 主治医への直近報告年月日を取得（レセプト対象月以前の報告書から）
      // endDateを文字列形式（YYYY-MM-DD）に変換
      const endDateStr = `${receipt.targetYear}-${String(receipt.targetMonth).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
      const lastReportDate = await db.query.careReports.findFirst({
        where: and(
          eq(careReports.patientId, receipt.patientId),
          eq(careReports.facilityId, receipt.facilityId),
          eq(careReports.isActive, true),
          // レセプト対象月以前の報告書のみ（対象月の月末日以前）
          lte(careReports.reportDate, endDateStr),
          // sentToDoctorAtまたはreportDateが存在するもの
          or(
            isNotNull(careReports.sentToDoctorAt),
            isNotNull(careReports.reportDate)
          )
        ),
        orderBy: desc(careReports.reportDate),
      });

      // 直近報告日を決定（sentToDoctorAtがあれば優先、なければreportDate）
      const lastReportDateValue = lastReportDate
        ? (lastReportDate.sentToDoctorAt || lastReportDate.reportDate)
        : null;

      // 加算履歴を取得（サービスコード選択済みのもののみ）
      const recordIds = targetRecords.map(r => r.id);
      let bonusHistoryData: Array<{
        history: typeof bonusCalculationHistory.$inferSelect;
        bonus: typeof bonusMaster.$inferSelect | null;
        serviceCode: typeof nursingServiceCodes.$inferSelect | null;
      }> = [];

      if (recordIds.length > 0) {
        bonusHistoryData = await db.select({
          history: bonusCalculationHistory,
          bonus: bonusMaster,
          serviceCode: nursingServiceCodes,
        })
          .from(bonusCalculationHistory)
          .leftJoin(bonusMaster, eq(bonusCalculationHistory.bonusMasterId, bonusMaster.id))
          .leftJoin(nursingServiceCodes, eq(bonusCalculationHistory.serviceCodeId, nursingServiceCodes.id))
          .where(
            and(
              inArray(bonusCalculationHistory.nursingRecordId, recordIds),
              isNotNull(bonusCalculationHistory.serviceCodeId) // サービスコード選択済みのもののみ
            )
          );
      }

      // CSVデータを構築
      const csvData: ReceiptCsvData = {
        receipt: {
          id: receipt.id,
          targetYear: receipt.targetYear,
          targetMonth: receipt.targetMonth,
          insuranceType: receipt.insuranceType,
          visitCount: receipt.visitCount,
          totalPoints: receipt.totalPoints,
          totalAmount: receipt.totalAmount,
          // 一部負担金額・減免情報
          partialBurdenAmount: receipt.partialBurdenAmount || null,
          reductionCategory: (receipt.reductionCategory === '1' || receipt.reductionCategory === '2' || receipt.reductionCategory === '3') 
            ? receipt.reductionCategory 
            : null,
          reductionRate: receipt.reductionRate || null,
          reductionAmount: receipt.reductionAmount || null,
          certificateNumber: receipt.certificateNumber || null,
          // ⭐ 追加: 公費一部負担情報（KOレコード用）
          publicExpenseBurdenInfo: (receipt.publicExpenseBurdenInfo as any) || null,
          // 高額療養費適用状況（MFレコード用）
          highCostCategory: (receipt.highCostCategory === 'high_cost' || receipt.highCostCategory === 'high_cost_multiple')
            ? receipt.highCostCategory
            : null,
          // ⭐ 追加: 給付割合（REレコード用、Excel出力用）
          benefitRatio: calculateBenefitRatio({
            reviewOrganizationCode: targetInsuranceCard.reviewOrganizationCode || null,
            insurerNumber: targetInsuranceCard.insurerNumber || null,
            copaymentRate: targetInsuranceCard.copaymentRate || null,
          }),
        },
        facility: {
          facilityCode: facility.facilityCode || '0000000',
          prefectureCode: facility.prefectureCode || '00',
          name: facility.name,
          address: facility.address || '',
          phone: facility.phone || '',
        },
        patient: {
          id: patient.id,
          patientNumber: patient.patientNumber,
          lastName: patient.lastName,
          firstName: patient.firstName,
          kanaName: patient.kanaName || '',
          dateOfBirth: patient.dateOfBirth,
          gender: patient.gender,
          insuranceNumber: patient.insuranceNumber || '',
          insuranceType: patient.insuranceType, // Phase 3: 保険種別
          deathDate: patient.deathDate || null, // RJレコード用：死亡年月日
          deathTime: (patient as any).deathTime || null,
          deathPlaceCode: (patient as any).deathPlaceCode || null,
          deathPlaceText: (patient as any).deathPlaceText || null,
        },
        // Phase 3: 保険証情報（レセプトの保険種別に応じた保険証を使用）
        insuranceCard: {
          cardType: targetInsuranceCard.cardType,
          relationshipType: targetInsuranceCard.relationshipType || null,
          ageCategory: targetInsuranceCard.ageCategory || null,
          elderlyRecipientCategory: targetInsuranceCard.elderlyRecipientCategory || null,
          // HO/KOレコード出力用フィールド（schema.tsの既存フィールド名を使用）
          insurerNumber: targetInsuranceCard.insurerNumber || '',
          certificateSymbol: targetInsuranceCard.insuredSymbol || '',     // schema: insuredSymbol
          certificateNumber: targetInsuranceCard.insuredCardNumber || '', // schema: insuredCardNumber
          reviewOrganizationCode: targetInsuranceCard.reviewOrganizationCode || null, // 審査支払機関コード
          copaymentRate: targetInsuranceCard.copaymentRate || null, // 負担割合（給付割合計算用）
          partialBurdenCategory: (targetInsuranceCard.partialBurdenCategory === '1' || targetInsuranceCard.partialBurdenCategory === '3') 
            ? targetInsuranceCard.partialBurdenCategory 
            : null, // 一部負担金区分（別表7）
        },
        // Phase 3: 公費負担医療情報（優先順位順）
        publicExpenses: publicExpensesData.map(pe => ({
          id: pe.id, // ⭐ 追加: 公費ID（publicExpenseBurdenInfoのキーとして使用）
          legalCategoryNumber: pe.legalCategoryNumber,
          beneficiaryNumber: pe.beneficiaryNumber,
          recipientNumber: pe.recipientNumber,
          priority: pe.priority,
        })),
        medicalInstitution: {
          institutionCode: medicalInstitution.institutionCode || '0000000',
          prefectureCode: medicalInstitution.prefectureCode || '00',
          name: medicalInstitution.name,
          doctorName: medicalInstitution.doctorName,
          lastReportDate: lastReportDateValue, // 主治医への直近報告年月日
        },
        // 摘要欄実装用: 複数主治医対応（現状は1件のみ）
        medicalInstitutions: [{
          institutionCode: medicalInstitution.institutionCode || '0000000',
          prefectureCode: medicalInstitution.prefectureCode || '00',
          name: medicalInstitution.name,
          doctorName: medicalInstitution.doctorName,
          lastReportDate: lastReportDateValue,
        }],
        doctorOrder: {
          id: validOrder.id,
          startDate: validOrder.startDate,
          endDate: validOrder.endDate,
          diagnosis: validOrder.diagnosis,
          icd10Code: validOrder.icd10Code || '',
          instructionType: validOrder.instructionType, // Phase 3: 指示区分
          diseasePresenceCode: validOrder.diseasePresenceCode || '03', // 基準告示第2の1に規定する疾病等の有無コード（別表13）
        },
        nursingRecords: targetRecords.map(record => ({
          id: record.id,
          visitDate: record.visitDate,
          publicExpenseId: record.publicExpenseId || null,
          actualStartTime: record.actualStartTime instanceof Date
            ? record.actualStartTime.toISOString().split('T')[1].substring(0, 5)
            : (record.actualStartTime || ''),
          actualEndTime: record.actualEndTime instanceof Date
            ? record.actualEndTime.toISOString().split('T')[1].substring(0, 5)
            : (record.actualEndTime || ''),
          serviceCode: record.serviceCode?.serviceCode || '', // 実際の9桁サービスコードを取得
          visitLocationCode: record.visitLocationCode || '01', // デフォルトは'01'（自宅、別表16）
          visitLocationCustom: record.visitLocationCustom || null,
          staffQualificationCode: record.staffQualificationCode || '00',
          calculatedPoints: record.calculatedPoints || 0,
          observations: record.observations || '', // 観察事項（JSレコードの心身の状態用）
          isServiceEnd: record.isServiceEnd || false,
          serviceEndReasonCode: record.serviceEndReasonCode || null,
          serviceEndReasonText: record.serviceEndReasonText || null,
          appliedBonuses: (record.appliedBonuses as any[]) || [],
        })),
        bonusBreakdown: (receipt.bonusBreakdown as any[]) || [],
        bonusHistory: bonusHistoryData
          .filter(item => item.bonus && item.serviceCode) // 加算マスタとサービスコードが存在するもののみ
          .map(item => ({
            id: item.history.id,
            nursingRecordId: item.history.nursingRecordId,
            visitDate: targetRecords.find(r => r.id === item.history.nursingRecordId)?.visitDate || new Date(),
            bonusCode: item.bonus!.bonusCode,
            bonusName: item.bonus!.bonusName,
            serviceCode: item.serviceCode!.serviceCode,
            points: item.serviceCode!.points,
          })),
      };

      // 訪問看護療養費CSV生成
      const csvBuffer = await generateNursingReceiptCsv(csvData);

      // ファイル名を生成
      const fileName = `receipt_${receipt.targetYear}${String(receipt.targetMonth).padStart(2, '0')}_${patient.patientNumber}.csv`;

      // レスポンスヘッダー設定
      res.setHeader('Content-Type', 'text/csv; charset=Shift_JIS');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(csvBuffer);

    } catch (error) {
      console.error("Error exporting receipt CSV:", error);
      res.status(500).json({ error: "CSV出力に失敗しました" });
    }
  });

  /**
   * GET /api/receipts/:id/export-excel
   * 単一月次レセプトのExcel出力
   */
  app.get("/api/receipts/:id/export-excel", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;

      // レセプト情報を取得
      const receipt = await db.query.monthlyReceipts.findFirst({
        where: eq(monthlyReceipts.id, id),
      });

      if (!receipt) {
        return res.status(404).json({ error: "レセプトが見つかりません" });
      }

      // 医療保険レセプトのみ対応
      if (receipt.insuranceType !== 'medical') {
        return res.status(400).json({ error: "医療保険レセプトのみExcel出力に対応しています" });
      }

      // 事前バリデーション
      const validationResult = await validateMonthlyReceiptData(
        receipt.facilityId,
        receipt.patientId,
        receipt.targetYear,
        receipt.targetMonth
      );

      if (!validationResult.canExportCsv) {
        return res.status(400).json({
          error: "Excel出力に必要なデータが不足しています",
          validation: validationResult
        });
      }

      // CSV出力と同じデータ取得ロジックを使用
      // 関連データを取得してCSVデータを構築
      const [facility, patient, nursingRecordsData, doctorOrdersData, insuranceCardsData, publicExpensesData] = await Promise.all([
        db.query.facilities.findFirst({
          where: eq(facilities.id, receipt.facilityId),
        }),
        db.query.patients.findFirst({
          where: eq(patients.id, receipt.patientId),
        }),
        db.query.nursingRecords.findMany({
          where: and(
            eq(nursingRecords.patientId, receipt.patientId),
            eq(nursingRecords.facilityId, receipt.facilityId)
          ),
          with: {
            serviceCode: true,
          },
        }),
        db.query.doctorOrders.findMany({
          where: and(
            eq(doctorOrders.patientId, receipt.patientId),
            eq(doctorOrders.facilityId, receipt.facilityId),
            eq(doctorOrders.isActive, true)
          ),
        }),
        db.query.insuranceCards.findMany({
          where: and(
            eq(insuranceCards.patientId, receipt.patientId),
            eq(insuranceCards.isActive, true)
          ),
        }),
        db.query.publicExpenseCards.findMany({
          where: and(
            eq(publicExpenseCards.patientId, receipt.patientId),
            eq(publicExpenseCards.isActive, true)
          ),
          orderBy: asc(publicExpenseCards.priority),
        }),
      ]);

      if (!facility || !patient) {
        return res.status(500).json({ error: "必要なデータが見つかりません" });
      }

      // 医療保険レセプトの場合は医療保険の保険証を選択
      const targetInsuranceCard = insuranceCardsData.find(card => card.cardType === 'medical');
      
      if (!targetInsuranceCard) {
        return res.status(400).json({ 
          error: "医療保険証が登録されていません" 
        });
      }

      // 対象月の訪問記録をフィルタ
      const startDate = new Date(receipt.targetYear, receipt.targetMonth - 1, 1);
      const endDate = new Date(receipt.targetYear, receipt.targetMonth, 0);
      const targetRecords = nursingRecordsData.filter(record => {
        const visitDate = new Date(record.visitDate);
        return visitDate >= startDate && visitDate <= endDate;
      });

      // 有効な訪問看護指示書を取得
      const validOrder = doctorOrdersData.find(order => {
        const orderStart = new Date(order.startDate);
        const orderEnd = new Date(order.endDate);
        return orderStart <= startDate && orderEnd >= endDate;
      });

      if (!validOrder) {
        return res.status(400).json({ error: "有効な訪問看護指示書がありません" });
      }

      // 医療機関情報を取得
      const medicalInstitution = await db.query.medicalInstitutions.findFirst({
        where: eq(medicalInstitutions.id, validOrder.medicalInstitutionId),
      });

      if (!medicalInstitution) {
        return res.status(500).json({ error: "医療機関情報が見つかりません" });
      }

      // 主治医への直近報告年月日を取得
      const endDateStr = `${receipt.targetYear}-${String(receipt.targetMonth).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
      const lastReportDate = await db.query.careReports.findFirst({
        where: and(
          eq(careReports.patientId, receipt.patientId),
          eq(careReports.facilityId, receipt.facilityId),
          eq(careReports.isActive, true),
          lte(careReports.reportDate, endDateStr),
          or(
            isNotNull(careReports.sentToDoctorAt),
            isNotNull(careReports.reportDate)
          )
        ),
        orderBy: desc(careReports.reportDate),
      });

      const lastReportDateValue = lastReportDate
        ? (lastReportDate.sentToDoctorAt || lastReportDate.reportDate)
        : null;

      // 加算履歴を取得
      const recordIds = targetRecords.map(r => r.id);
      let bonusHistoryData: Array<{
        history: typeof bonusCalculationHistory.$inferSelect;
        bonus: typeof bonusMaster.$inferSelect | null;
        serviceCode: typeof nursingServiceCodes.$inferSelect | null;
      }> = [];

      if (recordIds.length > 0) {
        bonusHistoryData = await db.select({
          history: bonusCalculationHistory,
          bonus: bonusMaster,
          serviceCode: nursingServiceCodes,
        })
          .from(bonusCalculationHistory)
          .leftJoin(bonusMaster, eq(bonusCalculationHistory.bonusMasterId, bonusMaster.id))
          .leftJoin(nursingServiceCodes, eq(bonusCalculationHistory.serviceCodeId, nursingServiceCodes.id))
          .where(inArray(bonusCalculationHistory.nursingRecordId, recordIds))
          .orderBy(asc(bonusCalculationHistory.createdAt));
      }

      // Excelデータを構築（CSVデータと同じ構造を使用）
      const excelData: ReceiptCsvData = {
        receipt: {
          id: receipt.id,
          targetYear: receipt.targetYear,
          targetMonth: receipt.targetMonth,
          insuranceType: receipt.insuranceType,
          visitCount: receipt.visitCount,
          totalPoints: receipt.totalPoints,
          totalAmount: receipt.totalAmount,
          partialBurdenAmount: receipt.partialBurdenAmount || null,
          reductionCategory: (receipt.reductionCategory === '1' || receipt.reductionCategory === '2' || receipt.reductionCategory === '3') 
            ? receipt.reductionCategory 
            : null,
          reductionRate: receipt.reductionRate || null,
          reductionAmount: receipt.reductionAmount || null,
          certificateNumber: receipt.certificateNumber || null,
          publicExpenseBurdenInfo: (receipt.publicExpenseBurdenInfo as any) || null,
          highCostCategory: (receipt.highCostCategory === 'high_cost' || receipt.highCostCategory === 'high_cost_multiple')
            ? receipt.highCostCategory
            : null,
          // ⭐ 追加: 給付割合（REレコード用、Excel出力用）
          benefitRatio: calculateBenefitRatio({
            reviewOrganizationCode: targetInsuranceCard.reviewOrganizationCode || null,
            insurerNumber: targetInsuranceCard.insurerNumber || null,
            copaymentRate: targetInsuranceCard.copaymentRate || null,
          }),
        },
        facility: {
          facilityCode: facility.facilityCode || '0000000',
          prefectureCode: facility.prefectureCode || '00',
          name: facility.name,
          address: facility.address || '',
          phone: facility.phone || '',
        },
        patient: {
          id: patient.id,
          patientNumber: patient.patientNumber,
          lastName: patient.lastName,
          firstName: patient.firstName,
          kanaName: patient.kanaName || '',
          dateOfBirth: patient.dateOfBirth,
          gender: patient.gender,
          insuranceNumber: patient.insuranceNumber || '',
          insuranceType: null,
          deathDate: patient.deathDate || null,
          deathTime: null,
          deathPlaceCode: null,
          deathPlaceText: null,
        },
        medicalInstitution: {
          institutionCode: medicalInstitution.institutionCode || '',
          prefectureCode: medicalInstitution.prefectureCode || '',
          name: medicalInstitution.name,
          doctorName: medicalInstitution.doctorName || '',
          lastReportDate: lastReportDateValue,
        },
        // 摘要欄実装用: 複数主治医対応（現状は1件のみ）
        medicalInstitutions: [{
          institutionCode: medicalInstitution.institutionCode || '',
          prefectureCode: medicalInstitution.prefectureCode || '',
          name: medicalInstitution.name,
          doctorName: medicalInstitution.doctorName || '',
          lastReportDate: lastReportDateValue,
        }],
        insuranceCard: {
          cardType: targetInsuranceCard.cardType as 'medical' | 'long_term_care',
          relationshipType: targetInsuranceCard.relationshipType as any,
          ageCategory: targetInsuranceCard.ageCategory as any,
          elderlyRecipientCategory: targetInsuranceCard.elderlyRecipientCategory as any,
          insurerNumber: targetInsuranceCard.insurerNumber,
          certificateSymbol: targetInsuranceCard.insuredSymbol || '',
          certificateNumber: targetInsuranceCard.insuredCardNumber || '',
          reviewOrganizationCode: targetInsuranceCard.reviewOrganizationCode as any,
          copaymentRate: targetInsuranceCard.copaymentRate as any,
          partialBurdenCategory: targetInsuranceCard.partialBurdenCategory as any,
        },
        publicExpenses: publicExpensesData.map(pe => ({
          id: pe.id,
          legalCategoryNumber: pe.legalCategoryNumber,
          beneficiaryNumber: pe.beneficiaryNumber,
          recipientNumber: pe.recipientNumber,
          priority: pe.priority,
        })),
        doctorOrder: {
          id: validOrder.id,
          startDate: validOrder.startDate,
          endDate: validOrder.endDate,
          diagnosis: validOrder.diagnosis,
          icd10Code: validOrder.icd10Code || '',
          instructionType: validOrder.instructionType as any,
        },
        nursingRecords: targetRecords.map(record => {
          // actualStartTimeとactualEndTimeを文字列に変換
          let actualStartTimeStr = '';
          let actualEndTimeStr = '';
          
          if (record.actualStartTime) {
            const startTime = typeof record.actualStartTime === 'string' 
              ? new Date(record.actualStartTime) 
              : record.actualStartTime;
            const hours = String(startTime.getHours()).padStart(2, '0');
            const minutes = String(startTime.getMinutes()).padStart(2, '0');
            actualStartTimeStr = `${hours}:${minutes}`;
          }
          
          if (record.actualEndTime) {
            const endTime = typeof record.actualEndTime === 'string' 
              ? new Date(record.actualEndTime) 
              : record.actualEndTime;
            const hours = String(endTime.getHours()).padStart(2, '0');
            const minutes = String(endTime.getMinutes()).padStart(2, '0');
            actualEndTimeStr = `${hours}:${minutes}`;
          }
          
          return {
            id: record.id,
            visitDate: record.visitDate,
            publicExpenseId: record.publicExpenseId || null,
            actualStartTime: actualStartTimeStr,
            actualEndTime: actualEndTimeStr,
            serviceCode: record.serviceCode?.serviceCode || '',
            visitLocationCode: record.visitLocationCode || '',
            visitLocationCustom: record.visitLocationCustom || null,
            staffQualificationCode: record.staffQualificationCode || '',
            calculatedPoints: record.calculatedPoints || 0,
            observations: record.observations || '',
            isServiceEnd: record.isServiceEnd || false,
            serviceEndReasonCode: record.serviceEndReasonCode || null,
            serviceEndReasonText: record.serviceEndReasonText || null,
            appliedBonuses: [],
          };
        }),
        bonusBreakdown: [],
        bonusHistory: bonusHistoryData
          .filter(item => item.serviceCode !== null) // サービスコードが選択されていない加算は除外
          .map(item => ({
            id: item.history.id,
            nursingRecordId: item.history.nursingRecordId,
            visitDate: targetRecords.find(r => r.id === item.history.nursingRecordId)?.visitDate || new Date(),
            bonusCode: item.bonus!.bonusCode,
            bonusName: item.bonus!.bonusName,
            serviceCode: item.serviceCode!.serviceCode,
            points: item.serviceCode!.points,
          })),
      };

      // Excelファイルを生成
      const excelBuilder = new NursingReceiptExcelBuilder();
      const excelBuffer = await excelBuilder.build(excelData);

      // ファイル名を生成
      const fileName = `receipt_${receipt.targetYear}${String(receipt.targetMonth).padStart(2, '0')}_${patient.patientNumber}.xlsx`;

      // レスポンスヘッダー設定
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(excelBuffer);

    } catch (error) {
      console.error("Error exporting receipt Excel:", error);
      res.status(500).json({ error: "Excel出力に失敗しました" });
    }
  });

  /**
   * POST /api/monthly-receipts/export/medical-insurance-batch
   * 複数の医療保険レセプトを1ファイルにまとめてCSV出力
   */
  app.post("/api/monthly-receipts/export/medical-insurance-batch", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.facility?.id || req.user.facilityId;
      const { receiptIds } = req.body as { receiptIds: string[] };

      if (!receiptIds || !Array.isArray(receiptIds) || receiptIds.length === 0) {
        return res.status(400).json({ error: "レセプトIDの配列が必要です" });
      }

      // レセプト情報を取得（確定済みかつ医療保険のみ）
      const receipts = await db.query.monthlyReceipts.findMany({
        where: and(
          eq(monthlyReceipts.facilityId, facilityId),
          inArray(monthlyReceipts.id, receiptIds),
          eq(monthlyReceipts.insuranceType, 'medical'),
          eq(monthlyReceipts.isConfirmed, true)
        ),
      });

      if (receipts.length === 0) {
        return res.status(404).json({ error: "該当するレセプトがありません" });
      }

      // 各レセプトのCSVデータを構築
      const receiptCsvDataList: ReceiptCsvData[] = [];
      const skippedReceipts: string[] = [];

      for (const receipt of receipts) {
        try {
          // 事前バリデーション
          const validationResult = await validateMonthlyReceiptData(
            receipt.facilityId,
            receipt.patientId,
            receipt.targetYear,
            receipt.targetMonth
          );

          if (!validationResult.canExportCsv) {
            skippedReceipts.push(receipt.id);
            continue;
          }

          // 関連データを取得
          const [facility, patient, nursingRecordsData, doctorOrdersData, insuranceCardsData, publicExpensesData] = await Promise.all([
            db.query.facilities.findFirst({
              where: eq(facilities.id, receipt.facilityId),
            }),
            db.query.patients.findFirst({
              where: eq(patients.id, receipt.patientId),
            }),
            db.query.nursingRecords.findMany({
              where: and(
                eq(nursingRecords.patientId, receipt.patientId),
                eq(nursingRecords.facilityId, receipt.facilityId)
              ),
              with: {
                serviceCode: true,
              },
            }),
            db.query.doctorOrders.findMany({
              where: and(
                eq(doctorOrders.patientId, receipt.patientId),
                eq(doctorOrders.facilityId, receipt.facilityId),
                eq(doctorOrders.isActive, true)
              ),
            }),
            db.query.insuranceCards.findMany({
              where: and(
                eq(insuranceCards.patientId, receipt.patientId),
                eq(insuranceCards.isActive, true)
              ),
            }),
            db.query.publicExpenseCards.findMany({
              where: and(
                eq(publicExpenseCards.patientId, receipt.patientId),
                eq(publicExpenseCards.isActive, true)
              ),
              orderBy: asc(publicExpenseCards.priority),
            }),
          ]);

          if (!facility || !patient) {
            skippedReceipts.push(receipt.id);
            continue;
          }

          // 医療保険の保険証を選択（医療保険レセプトなので、医療保険の保険証を使用）
          const medicalInsuranceCard = insuranceCardsData.find(card => card.cardType === 'medical');
          if (!medicalInsuranceCard) {
            skippedReceipts.push(receipt.id);
            continue;
          }

          // 対象月の訪問記録をフィルタ
          const startDate = new Date(receipt.targetYear, receipt.targetMonth - 1, 1);
          const endDate = new Date(receipt.targetYear, receipt.targetMonth, 0);
          const targetRecords = nursingRecordsData.filter(record => {
            const visitDate = new Date(record.visitDate);
            return visitDate >= startDate && visitDate <= endDate;
          });

          // 有効な訪問看護指示書を取得
          const validOrder = doctorOrdersData.find(order => {
            const orderStart = new Date(order.startDate);
            const orderEnd = new Date(order.endDate);
            return orderStart <= startDate && orderEnd >= endDate;
          });

          if (!validOrder) {
            skippedReceipts.push(receipt.id);
            continue;
          }

          // 医療機関情報を取得
          const medicalInstitution = await db.query.medicalInstitutions.findFirst({
            where: eq(medicalInstitutions.id, validOrder.medicalInstitutionId),
          });

          if (!medicalInstitution) {
            skippedReceipts.push(receipt.id);
            continue;
          }

          // 主治医への直近報告年月日を取得（レセプト対象月以前の報告書から）
          // endDateを文字列形式（YYYY-MM-DD）に変換
          const endDateStr = `${receipt.targetYear}-${String(receipt.targetMonth).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
          const lastReportDate = await db.query.careReports.findFirst({
            where: and(
              eq(careReports.patientId, receipt.patientId),
              eq(careReports.facilityId, receipt.facilityId),
              eq(careReports.isActive, true),
              // レセプト対象月以前の報告書のみ（対象月の月末日以前）
              lte(careReports.reportDate, endDateStr),
              // sentToDoctorAtまたはreportDateが存在するもの
              or(
                isNotNull(careReports.sentToDoctorAt),
                isNotNull(careReports.reportDate)
              )
            ),
            orderBy: desc(careReports.reportDate),
          });

          // 直近報告日を決定（sentToDoctorAtがあれば優先、なければreportDate）
          const lastReportDateValue = lastReportDate
            ? (lastReportDate.sentToDoctorAt || lastReportDate.reportDate)
            : null;

          // 加算履歴を取得（サービスコード選択済みのもののみ）
          const recordIds = targetRecords.map(r => r.id);
          let bonusHistoryData: Array<{
            history: typeof bonusCalculationHistory.$inferSelect;
            bonus: typeof bonusMaster.$inferSelect | null;
            serviceCode: typeof nursingServiceCodes.$inferSelect | null;
          }> = [];

          if (recordIds.length > 0) {
            bonusHistoryData = await db.select({
              history: bonusCalculationHistory,
              bonus: bonusMaster,
              serviceCode: nursingServiceCodes,
            })
              .from(bonusCalculationHistory)
              .leftJoin(bonusMaster, eq(bonusCalculationHistory.bonusMasterId, bonusMaster.id))
              .leftJoin(nursingServiceCodes, eq(bonusCalculationHistory.serviceCodeId, nursingServiceCodes.id))
              .where(
                and(
                  inArray(bonusCalculationHistory.nursingRecordId, recordIds),
                  isNotNull(bonusCalculationHistory.serviceCodeId)
                )
              );
          }

          // CSVデータを構築
          const csvData: ReceiptCsvData = {
            receipt: {
              id: receipt.id,
              targetYear: receipt.targetYear,
              targetMonth: receipt.targetMonth,
              insuranceType: receipt.insuranceType,
              visitCount: receipt.visitCount,
              totalPoints: receipt.totalPoints,
              totalAmount: receipt.totalAmount,
              // 一部負担金額・減免情報
              partialBurdenAmount: receipt.partialBurdenAmount || null,
              reductionCategory: (receipt.reductionCategory === '1' || receipt.reductionCategory === '2' || receipt.reductionCategory === '3') 
                ? receipt.reductionCategory 
                : null,
              reductionRate: receipt.reductionRate || null,
              reductionAmount: receipt.reductionAmount || null,
              certificateNumber: receipt.certificateNumber || null,
              // ⭐ 追加: 公費一部負担情報（KOレコード用）
              publicExpenseBurdenInfo: (receipt.publicExpenseBurdenInfo as any) || null,
              // 高額療養費適用状況（MFレコード用）
              highCostCategory: (receipt.highCostCategory === 'high_cost' || receipt.highCostCategory === 'high_cost_multiple')
                ? receipt.highCostCategory
                : null,
            },
            facility: {
              facilityCode: facility.facilityCode || '0000000',
              prefectureCode: facility.prefectureCode || '00',
              name: facility.name,
              address: facility.address || '',
              phone: facility.phone || '',
            },
            patient: {
              id: patient.id,
              patientNumber: patient.patientNumber,
              lastName: patient.lastName,
              firstName: patient.firstName,
              kanaName: patient.kanaName || '',
              dateOfBirth: patient.dateOfBirth,
              gender: patient.gender,
              insuranceNumber: patient.insuranceNumber || '',
              insuranceType: patient.insuranceType,
              deathDate: patient.deathDate || null,
              deathTime: (patient as any).deathTime || null,
              deathPlaceCode: (patient as any).deathPlaceCode || null,
              deathPlaceText: (patient as any).deathPlaceText || null,
            },
            insuranceCard: {
              cardType: medicalInsuranceCard.cardType,
              relationshipType: medicalInsuranceCard.relationshipType || null,
              ageCategory: medicalInsuranceCard.ageCategory || null,
              elderlyRecipientCategory: medicalInsuranceCard.elderlyRecipientCategory || null,
              insurerNumber: medicalInsuranceCard.insurerNumber || '',
              certificateSymbol: medicalInsuranceCard.insuredSymbol || '',
              certificateNumber: medicalInsuranceCard.insuredCardNumber || '',
              reviewOrganizationCode: medicalInsuranceCard.reviewOrganizationCode || null,
              copaymentRate: medicalInsuranceCard.copaymentRate || null, // 負担割合（給付割合計算用）
              partialBurdenCategory: (medicalInsuranceCard.partialBurdenCategory === '1' || medicalInsuranceCard.partialBurdenCategory === '3') 
                ? medicalInsuranceCard.partialBurdenCategory 
                : null, // 一部負担金区分（別表7）
            },
            publicExpenses: publicExpensesData.map(pe => ({
              id: pe.id, // ⭐ 追加: 公費ID（publicExpenseBurdenInfoのキーとして使用）
              legalCategoryNumber: pe.legalCategoryNumber,
              beneficiaryNumber: pe.beneficiaryNumber,
              recipientNumber: pe.recipientNumber,
              priority: pe.priority,
            })),
            medicalInstitution: {
              institutionCode: medicalInstitution.institutionCode || '0000000',
              prefectureCode: medicalInstitution.prefectureCode || '00',
              name: medicalInstitution.name,
              doctorName: medicalInstitution.doctorName,
              lastReportDate: lastReportDateValue, // 主治医への直近報告年月日
            },
            // 摘要欄実装用: 複数主治医対応（現状は1件のみ）
            medicalInstitutions: [{
              institutionCode: medicalInstitution.institutionCode || '0000000',
              prefectureCode: medicalInstitution.prefectureCode || '00',
              name: medicalInstitution.name,
              doctorName: medicalInstitution.doctorName,
              lastReportDate: lastReportDateValue,
            }],
            doctorOrder: {
              id: validOrder.id,
              startDate: validOrder.startDate,
              endDate: validOrder.endDate,
              diagnosis: validOrder.diagnosis,
              icd10Code: validOrder.icd10Code || '',
              instructionType: validOrder.instructionType,
            },
            nursingRecords: targetRecords.map(record => ({
              id: record.id,
              visitDate: record.visitDate,
              publicExpenseId: record.publicExpenseId || null,
              actualStartTime: record.actualStartTime instanceof Date
                ? record.actualStartTime.toISOString().split('T')[1].substring(0, 5)
                : (record.actualStartTime || ''),
              actualEndTime: record.actualEndTime instanceof Date
                ? record.actualEndTime.toISOString().split('T')[1].substring(0, 5)
                : (record.actualEndTime || ''),
              serviceCode: record.serviceCode?.serviceCode || '',
              visitLocationCode: record.visitLocationCode || '01',
              visitLocationCustom: record.visitLocationCustom || null,
              staffQualificationCode: record.staffQualificationCode || '00',
              calculatedPoints: record.calculatedPoints || 0,
              observations: record.observations || '',
              isServiceEnd: record.isServiceEnd || false,
              serviceEndReasonCode: record.serviceEndReasonCode || null,
              serviceEndReasonText: record.serviceEndReasonText || null,
              appliedBonuses: (record.appliedBonuses as any[]) || [],
            })),
            bonusBreakdown: (receipt.bonusBreakdown as any[]) || [],
            bonusHistory: bonusHistoryData
              .filter(item => item.bonus && item.serviceCode)
              .map(item => ({
                id: item.history.id,
                nursingRecordId: item.history.nursingRecordId,
                visitDate: targetRecords.find(r => r.id === item.history.nursingRecordId)?.visitDate || new Date(),
                bonusCode: item.bonus!.bonusCode,
                bonusName: item.bonus!.bonusName,
                serviceCode: item.serviceCode!.serviceCode,
                points: item.serviceCode!.points,
              })),
          };

          receiptCsvDataList.push(csvData);
        } catch (error) {
          console.error(`Error processing receipt ${receipt.id}:`, error);
          skippedReceipts.push(receipt.id);
        }
      }

      if (receiptCsvDataList.length === 0) {
        return res.status(400).json({ 
          error: "CSV出力可能なレセプトがありません",
          skippedReceipts 
        });
      }

      // 最初のレセプトの施設情報と対象年月を使用
      const firstReceipt = receiptCsvDataList[0];
      const csvData: MedicalInsuranceReceiptCsvData = {
        facility: firstReceipt.facility,
        targetYear: firstReceipt.receipt.targetYear,
        targetMonth: firstReceipt.receipt.targetMonth,
        receipts: receiptCsvDataList,
      };

      // CSV生成
      const csvBuffer = await generateMultipleNursingReceiptCsv(csvData);

      // ファイル名を生成
      const fileName = `medical_receipts_${csvData.targetYear}${String(csvData.targetMonth).padStart(2, '0')}.csv`;

      // レスポンスヘッダー設定
      res.setHeader('Content-Type', 'text/csv; charset=Shift_JIS');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      
      // スキップされたレセプトがある場合は警告ヘッダーを追加
      if (skippedReceipts.length > 0) {
        res.setHeader('X-Skipped-Receipts', skippedReceipts.join(','));
      }

      res.send(csvBuffer);
    } catch (error) {
      console.error("Error exporting batch receipt CSV:", error);
      res.status(500).json({ error: "CSV出力に失敗しました" });
    }
  });

  // Export receipt list to CSV (Summary and Details)
  app.post("/api/monthly-receipts/export/list", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.facility?.id || req.user.facilityId;
      const { receiptIds } = req.body;

      if (!Array.isArray(receiptIds) || receiptIds.length === 0) {
        return res.status(400).json({ error: "レセプトIDが指定されていません" });
      }

      // レセプトデータを取得
      const receiptsData = await db.select({
        receipt: monthlyReceipts,
        patient: patients,
      })
        .from(monthlyReceipts)
        .leftJoin(patients, eq(monthlyReceipts.patientId, patients.id))
        .where(and(
          eq(monthlyReceipts.facilityId, facilityId),
          inArray(monthlyReceipts.id, receiptIds)
        ))
        .orderBy(
          desc(monthlyReceipts.targetYear),
          desc(monthlyReceipts.targetMonth),
          patients.lastName
        );

      if (receiptsData.length === 0) {
        return res.status(404).json({ error: "レセプトが見つかりません" });
      }

      // 各レセプトに対応する保険証情報を取得
      const receiptsWithInsuranceCards = await Promise.all(
        receiptsData.map(async (r) => {
          const receipt = r.receipt;
          const targetDate = new Date(receipt.targetYear, receipt.targetMonth - 1, 15);
          const targetDateStr = targetDate.toISOString().split('T')[0];

          const cardType = receipt.insuranceType === 'medical' ? 'medical' : 'long_term_care';
          const insuranceCard = await db.query.insuranceCards.findFirst({
            where: and(
              eq(insuranceCards.patientId, receipt.patientId),
              eq(insuranceCards.facilityId, facilityId),
              eq(insuranceCards.cardType, cardType),
              eq(insuranceCards.isActive, true),
              lte(insuranceCards.validFrom, targetDateStr),
              or(
                isNull(insuranceCards.validUntil),
                gte(insuranceCards.validUntil, targetDateStr)
              )
            ),
            orderBy: desc(insuranceCards.validFrom),
          });

          return {
            ...receipt,
            patient: r.patient,
            insuranceCard: insuranceCard ? {
              reviewOrganizationCode: insuranceCard.reviewOrganizationCode,
              insurerNumber: insuranceCard.insurerNumber,
            } : null,
          };
        })
      );

      // 保険種別を判定する関数（フロントエンドと同じロジック）
      const determineInsuranceCategory = (receipt: typeof receiptsWithInsuranceCards[0]): '社保' | '国保' | '介護保険' | null => {
        if (receipt.insuranceType === 'care') {
          return '介護保険';
        }
        
        if (receipt.insuranceType === 'medical') {
          if (receipt.insuranceCard?.reviewOrganizationCode === '1') {
            return '社保';
          }
          if (receipt.insuranceCard?.reviewOrganizationCode === '2') {
            return '国保';
          }
          
          if (receipt.insuranceCard?.insurerNumber) {
            const insurerNumber = receipt.insuranceCard.insurerNumber.trim();
            const length = insurerNumber.length;
            const prefix = insurerNumber.substring(0, 2);
            
            if (length === 6) {
              return '国保';
            }
            
            if (length === 8) {
              if (prefix === '39') {
                return '国保';
              }
              return '社保';
            }
          }
        }
        return null;
      };

      // 合計カードのデータを計算
      const summary = {
        '社保': { totalPoints: 0, totalAmount: 0, count: 0 },
        '国保': { totalPoints: 0, totalAmount: 0, count: 0 },
        '介護保険': { totalPoints: 0, totalAmount: 0, count: 0 },
      };

      receiptsWithInsuranceCards.forEach(receipt => {
        const category = determineInsuranceCategory(receipt);
        if (category) {
          summary[category].totalPoints += receipt.totalPoints;
          summary[category].totalAmount += receipt.totalAmount;
          summary[category].count += 1;
        }
      });

      // ステータスを文字列に変換する関数
      const getStatusText = (receipt: typeof receiptsWithInsuranceCards[0]): string => {
        if (receipt.isSent) {
          return '送信済み';
        }
        if (receipt.isConfirmed) {
          if (receipt.hasErrors) {
            return 'エラーあり';
          }
          if (receipt.hasWarnings) {
            return '警告あり';
          }
          return '確定済み';
        }
        if (receipt.hasErrors) {
          return 'エラーあり';
        }
        if (receipt.hasWarnings) {
          return '警告あり';
        }
        return '未確定';
      };

      // CSVデータを生成
      const csvData: string[][] = [];

      // 1. 合計カードのデータセクション
      csvData.push(['保険種別', '件数', '合計点数', '合計金額']);
      if (summary['社保'].count > 0 || summary['国保'].count > 0) {
        csvData.push(['医療保険（社保）', `${summary['社保'].count}`, `${summary['社保'].totalPoints}`, `${summary['社保'].totalAmount}`]);
        csvData.push(['医療保険（国保）', `${summary['国保'].count}`, `${summary['国保'].totalPoints}`, `${summary['国保'].totalAmount}`]);
      }
      if (summary['介護保険'].count > 0) {
        csvData.push(['介護保険', `${summary['介護保険'].count}`, `${summary['介護保険'].totalPoints}`, `${summary['介護保険'].totalAmount}`]);
      }

      // 2. 空行
      csvData.push([]);

      // 3. 利用者ごとのデータセクション
      csvData.push(['対象月', '利用者', '保険種別', '訪問回数', '合計点数', '合計金額', 'ステータス']);
      receiptsWithInsuranceCards.forEach(receipt => {
        const targetMonth = `${receipt.targetYear}年${receipt.targetMonth}月`;
        const patientName = receipt.patient 
          ? `${receipt.patient.lastName} ${receipt.patient.firstName}`
          : '不明';
        const insuranceTypeText = receipt.insuranceType === 'medical' ? '医療保険' : '介護保険';
        const visitCount = `${receipt.visitCount}回`;
        const totalPoints = receipt.totalPoints.toLocaleString();
        const totalAmount = `¥${receipt.totalAmount.toLocaleString()}`;
        const status = getStatusText(receipt);

        csvData.push([targetMonth, patientName, insuranceTypeText, visitCount, totalPoints, totalAmount, status]);
      });

      // CSVを生成（Shift_JISエンコード）
      const csvContent = stringify(csvData);
      const { toShiftJIS } = await import("./services/csv/csvUtils");
      const csvBuffer = Buffer.concat([toShiftJIS(csvContent), Buffer.from([0x1A])]);

      // ファイル名を生成（最初のレセプトの対象年月を使用）
      const firstReceipt = receiptsWithInsuranceCards[0];
      const fileName = `receipts_list_${firstReceipt.targetYear}${String(firstReceipt.targetMonth).padStart(2, '0')}.csv`;

      // レスポンスヘッダー設定
      res.setHeader('Content-Type', 'text/csv; charset=Shift_JIS');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

      res.send(csvBuffer);
    } catch (error) {
      console.error("Error exporting receipt list CSV:", error);
      res.status(500).json({ error: "CSV出力に失敗しました" });
    }
  });

  // Export care insurance receipts to CSV (Batch - Multiple Receipts)
  app.post("/api/monthly-receipts/export/care-insurance-batch", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.facility?.id || req.user.facilityId;
      const { receiptIds } = req.body;

      if (!Array.isArray(receiptIds) || receiptIds.length === 0) {
        return res.status(400).json({ error: "レセプトIDのリストが必要です" });
      }

      // Get confirmed care insurance receipts for the given IDs
      const receipts = await db.select({
        receipt: monthlyReceipts,
        patient: patients,
      })
        .from(monthlyReceipts)
        .leftJoin(patients, eq(monthlyReceipts.patientId, patients.id))
        .where(and(
          eq(monthlyReceipts.facilityId, facilityId),
          eq(monthlyReceipts.insuranceType, 'care'),
          eq(monthlyReceipts.isConfirmed, true),
          inArray(monthlyReceipts.id, receiptIds)
        ))
        .orderBy(patients.patientNumber);

      if (receipts.length === 0) {
        return res.status(404).json({ error: "該当する確定済みの介護保険レセプトがありません" });
      }

      // Get facility information
      const facility = await db.query.facilities.findFirst({
        where: eq(facilities.id, facilityId),
      });

      if (!facility) {
        return res.status(404).json({ error: "施設情報が見つかりません" });
      }

      // 指定事業所番号を優先使用、未設定時は既存のfacilityCodeから生成（後方互換性）
      const facilityCode10 = facility.careInsuranceFacilityNumber 
        || (facility.facilityCode 
          ? facility.facilityCode.padEnd(10, '0').substring(0, 10)
          : '0000000000');

      // サービスコードを6桁から2桁+4桁に分解する関数
      const processServiceCode = (serviceCode: string | null): { typeCode: string; itemCode: string } => {
        if (!serviceCode) {
          return { typeCode: '13', itemCode: '0000' }; // デフォルト値
        }
        // 介護保険のサービスコードは6桁（先頭2桁がサービス種類コード、後4桁がサービス項目コード）
        if (serviceCode.length === 6) {
          return {
            typeCode: serviceCode.substring(0, 2),
            itemCode: serviceCode.substring(2, 6),
          };
        }
        // 9桁の場合は先頭2桁と次の4桁を使用（医療保険との互換性）
        if (serviceCode.length >= 6) {
          return {
            typeCode: serviceCode.substring(0, 2),
            itemCode: serviceCode.substring(2, 6),
          };
        }
        return { typeCode: '13', itemCode: '0000' };
      };

      // 全利用者のデータを準備
      const patientDataList: CareInsurancePatientData[] = [];
      const skippedReceipts: string[] = [];

      for (const receiptItem of receipts) {
        try {
          const receipt = receiptItem.receipt;
          const patient = receiptItem.patient!;

          if (!patient) {
            skippedReceipts.push(receipt.id);
            continue;
          }

          const targetYear = receipt.targetYear;
          const targetMonth = receipt.targetMonth;
          const startDate = new Date(targetYear, targetMonth - 1, 1);
          const endDate = new Date(targetYear, targetMonth, 0);

          // Get insurance card
          const insuranceCardData = await db.select()
            .from(insuranceCards)
            .where(and(
              eq(insuranceCards.patientId, patient.id),
              eq(insuranceCards.facilityId, facilityId),
              eq(insuranceCards.cardType, 'long_term_care')
            ))
            .orderBy(desc(insuranceCards.validFrom))
            .limit(1);

          if (!insuranceCardData[0]) {
            console.warn(`患者 ${patient.patientNumber} の介護保険証情報が見つかりません。スキップします。`);
            skippedReceipts.push(receipt.id);
            continue;
          }

          const insuranceCard = insuranceCardData[0];

          // 要介護状態区分がない場合はスキップ
          if (!patient.careLevel) {
            console.warn(`患者 ${patient.patientNumber} の要介護状態区分が設定されていません。スキップします。`);
            skippedReceipts.push(receipt.id);
            continue;
          }

          // 被保険者番号を10桁にパディング（左側に0を追加）
          const insuredNumber10 = insuranceCard.insuredNumber.padStart(10, '0').substring(0, 10);
          
          // 保険者番号を8桁にパディング（左側に0を追加）
          const insurerNumber8 = insuranceCard.insurerNumber.padStart(8, '0').substring(0, 8);

          // Get public expense cards
          const publicExpenseCardsData = await db.select()
            .from(publicExpenseCards)
            .where(and(
              eq(publicExpenseCards.patientId, patient.id),
              eq(publicExpenseCards.facilityId, facilityId),
              eq(publicExpenseCards.isActive, true)
            ))
            .orderBy(asc(publicExpenseCards.priority));

          // Get service care plan
          const serviceCarePlanData = await db.select()
            .from(serviceCarePlans)
            .where(and(
              eq(serviceCarePlans.patientId, patient.id),
              eq(serviceCarePlans.facilityId, facilityId),
              eq(serviceCarePlans.isActive, true)
            ))
            .orderBy(desc(serviceCarePlans.planDate))
            .limit(1);

          // Get nursing records for the period
          const relatedRecords = await db.select({
            record: nursingRecords,
            serviceCode: nursingServiceCodes,
          })
            .from(nursingRecords)
            .leftJoin(nursingServiceCodes, eq(nursingRecords.serviceCodeId, nursingServiceCodes.id))
            .where(and(
              eq(nursingRecords.patientId, patient.id),
              eq(nursingRecords.facilityId, facilityId),
              gte(nursingRecords.visitDate, startDate.toISOString().split('T')[0]),
              lte(nursingRecords.visitDate, endDate.toISOString().split('T')[0]),
              eq(nursingRecords.status, 'completed')
            ))
            .orderBy(nursingRecords.visitDate);

          // Get bonus calculation history
          const recordIds = relatedRecords.map(r => r.record.id);
          let bonusHistory: any[] = [];

          if (recordIds.length > 0) {
            bonusHistory = await db.select({
              history: bonusCalculationHistory,
              bonus: bonusMaster,
              serviceCode: nursingServiceCodes,
            })
              .from(bonusCalculationHistory)
              .leftJoin(bonusMaster, eq(bonusCalculationHistory.bonusMasterId, bonusMaster.id))
              .leftJoin(nursingServiceCodes, eq(bonusCalculationHistory.serviceCodeId, nursingServiceCodes.id))
              .where(inArray(bonusCalculationHistory.nursingRecordId, recordIds));
          }

          // サービス開始年月日を訪問記録の最初の日付から取得
          const serviceStartDate = relatedRecords.length > 0 
            ? relatedRecords[0].record.visitDate 
            : null;

          // 訪問記録をサービス項目コードごとにグループ化
          const recordGroups = new Map<string, {
            serviceCode: string;
            serviceTypeCode: string;
            serviceItemCode: string;
            points: number;
            visitCount: number;
            totalPoints: number;
          }>();

          for (const item of relatedRecords) {
            const record = item.record;
            const serviceCode = item.serviceCode?.serviceCode || '';
            const { typeCode, itemCode } = processServiceCode(serviceCode);
            const key = `${typeCode}-${itemCode}`;

            if (!recordGroups.has(key)) {
              recordGroups.set(key, {
                serviceCode,
                serviceTypeCode: typeCode,
                serviceItemCode: itemCode,
                points: item.serviceCode?.points || 0,
                visitCount: 0,
                totalPoints: 0,
              });
            }

            const group = recordGroups.get(key)!;
            group.visitCount++;
            group.totalPoints += item.serviceCode?.points || 0;
          }

          // 加算をサービス項目コードごとにグループ化
          const bonusGroups = new Map<string, {
            serviceCode: string;
            serviceTypeCode: string;
            serviceItemCode: string;
            points: number;
            visitCount: number;
            totalPoints: number;
          }>();

          for (const item of bonusHistory) {
            if (!item.bonus || !item.serviceCode) continue;
            const serviceCode = item.serviceCode.serviceCode;
            const { typeCode, itemCode } = processServiceCode(serviceCode);
            const key = `${typeCode}-${itemCode}`;

            if (!bonusGroups.has(key)) {
              bonusGroups.set(key, {
                serviceCode,
                serviceTypeCode: typeCode,
                serviceItemCode: itemCode,
                points: item.serviceCode.points,
                visitCount: 0,
                totalPoints: 0,
              });
            }

            const group = bonusGroups.get(key)!;
            group.visitCount++;
            group.totalPoints += item.serviceCode.points;
          }

          patientDataList.push({
            receipt: {
              id: receipt.id,
              targetYear: receipt.targetYear,
              targetMonth: receipt.targetMonth,
              visitCount: receipt.visitCount,
              totalPoints: receipt.totalPoints,
              totalAmount: receipt.totalAmount,
            },
            patient: {
              id: patient.id,
              patientNumber: patient.patientNumber,
              lastName: patient.lastName,
              firstName: patient.firstName,
              kanaName: patient.kanaName,
              dateOfBirth: patient.dateOfBirth,
              gender: patient.gender,
              careLevel: patient.careLevel,
            },
            insuranceCard: {
              insurerNumber: insurerNumber8,
              insuredNumber: insuredNumber10,
              copaymentRate: insuranceCard.copaymentRate,
              certificationDate: insuranceCard.certificationDate,
              validFrom: insuranceCard.validFrom,
              validUntil: insuranceCard.validUntil,
            },
            publicExpenses: publicExpenseCardsData.map(pe => ({
              priority: pe.priority,
              legalCategoryNumber: pe.legalCategoryNumber,
              beneficiaryNumber: pe.beneficiaryNumber,
              recipientNumber: pe.recipientNumber,
              benefitRate: pe.benefitRate,
              validFrom: pe.validFrom,
              validUntil: pe.validUntil,
            })),
            serviceCarePlan: {
              planDate: serviceCarePlanData[0]?.planDate || '',
              certificationPeriodStart: serviceCarePlanData[0]?.certificationPeriodStart || null,
              certificationPeriodEnd: serviceCarePlanData[0]?.certificationPeriodEnd || null,
              planPeriodStart: serviceStartDate || null,
              planPeriodEnd: null,
              creatorType: (serviceCarePlanData[0]?.creatorType as '1' | '2' | '3' | null) || '1', // DBから取得、なければデフォルト値「1」
              careManagerOfficeNumber: serviceCarePlanData[0]?.careManagerOfficeNumber || null, // DBから取得
            },
            nursingRecords: Array.from(recordGroups.values()).map(group => ({
              id: '',
              visitDate: '',
              serviceCode: group.serviceCode,
              serviceTypeCode: group.serviceTypeCode,
              serviceItemCode: group.serviceItemCode,
              points: group.points,
              visitCount: group.visitCount,
              totalPoints: group.totalPoints,
            })),
            bonusHistory: Array.from(bonusGroups.values()).map(group => ({
              id: '',
              nursingRecordId: '',
              visitDate: '',
              bonusCode: '',
              bonusName: '',
              serviceCode: group.serviceCode,
              serviceTypeCode: group.serviceTypeCode,
              serviceItemCode: group.serviceItemCode,
              points: group.points,
              visitCount: group.visitCount,
              totalPoints: group.totalPoints,
            })),
          });
        } catch (error) {
          console.error(`Error processing receipt ${receiptItem.receipt.id}:`, error);
          skippedReceipts.push(receiptItem.receipt.id);
        }
      }

      if (patientDataList.length === 0) {
        return res.status(400).json({ 
          error: "CSV出力可能なレセプトがありません",
          skippedReceipts 
        });
      }

      // 最初のレセプトの対象年月を使用
      const firstReceipt = patientDataList[0];
      const csvData: CareInsuranceReceiptCsvData = {
        facility: {
          facilityCode: facilityCode10,
          prefectureCode: facility.prefectureCode || '00',
          name: facility.name,
        },
        targetYear: firstReceipt.receipt.targetYear,
        targetMonth: firstReceipt.receipt.targetMonth,
        patients: patientDataList,
      };

      // CSVを生成
      const builder = new CareInsuranceReceiptCsvBuilder();
      const csvBuffer = await builder.build(csvData);

      // ファイル名を生成
      const fileName = `care_receipts_${csvData.targetYear}${String(csvData.targetMonth).padStart(2, '0')}.csv`;

      // レスポンスヘッダー設定
      res.setHeader('Content-Type', 'text/csv; charset=Shift_JIS');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      
      // スキップされたレセプトがある場合は警告ヘッダーを追加
      if (skippedReceipts.length > 0) {
        res.setHeader('X-Skipped-Receipts', skippedReceipts.join(','));
      }

      res.send(csvBuffer);
    } catch (error) {
      console.error("Error exporting batch care insurance receipt CSV:", error);
      res.status(500).json({ error: "CSV出力に失敗しました" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
