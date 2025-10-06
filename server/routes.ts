import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import bcrypt from "bcryptjs";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import PDFDocument from "pdfkit";
import { storage } from "./storage";
import { requireAuth, requireCorporateAdmin, checkSubdomainAccess } from "./middleware/access-control";
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
  updateCareReportSchema,
  insertContractSchema,
  updateContractSchema,
  nursingRecordAttachments,
  medicalInstitutions,
  careManagers,
  doctorOrders,
  insuranceCards,
  carePlans,
  careReports,
  contracts,
  patients,
  users,
  schedules,
  nursingRecords,
  buildings,
  type NursingRecordAttachment,
  type MedicalInstitution,
  type CareManager,
  type DoctorOrder,
  type InsuranceCard
} from "@shared/schema";
import { z } from "zod";
import { db } from "./db";
import { eq, and, gte, lte, sql, isNotNull, inArray, isNull, not, lt } from "drizzle-orm";

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
  const uploadStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      const nursingRecordId = req.params.id || 'temp';
      const uploadDir = path.join(process.cwd(), 'uploads', 'nursing-records', nursingRecordId);

      // Create directory if it doesn't exist
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      // Generate unique filename with timestamp and random string
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
      const ext = path.extname(file.originalname);
      cb(null, `${uniqueSuffix}${ext}`);
    }
  });

  const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('画像（JPEG、PNG）またはPDFファイルのみアップロード可能です'));
    }
  };

  const upload = multer({
    storage: uploadStorage,
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

  // Multer setup for doctor orders and insurance cards
  const documentStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = path.join(process.cwd(), 'uploads', 'documents');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
      const ext = path.extname(file.originalname);
      cb(null, `${uniqueSuffix}${ext}`);
    }
  });

  const documentUpload = multer({
    storage: documentStorage,
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

      const { password: _, ...userWithoutPassword } = user;
      res.json({
        user: {
          ...userWithoutPassword,
          facility: facility || null
        }
      });

    } catch (error) {
      console.error("Get current user error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // ========== Enhanced Middleware for authenticated routes ==========
  // Use hierarchical access control middleware from separate file

  // Additional middleware to check subdomain access
  app.use('/api', requireAuth);
  app.use('/api', checkSubdomainAccess);

  // ========== Companies Routes (Corporate Admin only) ==========

  // Get companies (corporate admin only)
  app.get("/api/companies", requireCorporateAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const companies = await storage.getCompanies();
      res.json(companies);
    } catch (error) {
      console.error("Get companies error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Create company (corporate admin only)
  app.post("/api/companies", requireCorporateAdmin, async (req: AuthenticatedRequest, res: Response) => {
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

      if (req.isCorporateAdmin) {
        // Corporate admin can see all facilities in their company
        const userFacility = await storage.getFacility(req.user.facilityId);
        if (userFacility) {
          facilities = await storage.getFacilitiesByCompany(userFacility.companyId);
        }
      } else if (['admin', 'manager'].includes(req.user.role)) {
        // Facility admin/manager can see their own facility
        const facility = await storage.getFacility(req.user.facilityId);
        facilities = facility ? [facility] : [];
      } else {
        return res.status(403).json({ error: "権限がありません" });
      }

      res.json(facilities);

    } catch (error) {
      console.error("Get facilities error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Create facility (corporate admin only)
  app.post("/api/facilities", requireCorporateAdmin, async (req: AuthenticatedRequest, res: Response) => {
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

      const result = await storage.getUsersByFacilityPaginated(req.user.facilityId, { page, limit });
      
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

  // Create user (admin or manager only)
  app.post("/api/users", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!['admin', 'manager'].includes(req.user.role)) {
        return res.status(403).json({ error: "権限がありません" });
      }
      
      const userData = insertUserSchema.omit({ facilityId: true }).parse(req.body);
      
      // Hash password
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      
      // Set facility ID from current user
      const userToCreate = {
        ...userData,
        password: hashedPassword,
        facilityId: req.user.facilityId
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
      
      // Check multi-tenant access: target user must be in same facility
      if (targetUser.facilityId !== req.user.facilityId) {
        return res.status(404).json({ error: "ユーザーが見つかりません" });
      }
      
      // Determine update permissions and validate data
      let validatedData;
      
      if (req.user.id === id) {
        // Self-update: limited fields only
        validatedData = updateUserSelfSchema.parse(req.body);
      } else if (['admin', 'manager'].includes(req.user.role)) {
        // Admin/Manager updating other users in same facility
        validatedData = updateUserAdminSchema.parse(req.body);
        
        // Additional restriction: only admins can change roles
        if (validatedData.role && req.user.role !== 'admin') {
          return res.status(403).json({ error: "役職の変更は管理者のみ可能です" });
        }
      } else {
        // Regular users cannot update other users
        return res.status(403).json({ error: "権限がありません" });
      }
      
      // Hash password if provided
      if (validatedData.password) {
        validatedData.password = await bcrypt.hash(validatedData.password, 10);
      }
      
      const user = await storage.updateUser(id, validatedData);
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
      if (targetUser.facilityId !== req.user.facilityId) {
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
      if (targetUser.facilityId !== req.user.facilityId) {
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
      if (targetUser.facilityId !== req.user.facilityId) {
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

      const result = await storage.getPatientsByFacilityPaginated(req.user.facilityId, { page, limit });
      res.json(result);
      
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
      
      if (!patient || patient.facilityId !== req.user.facilityId) {
        return res.status(404).json({ error: "患者が見つかりません" });
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
      const patientData = insertPatientSchema.parse(req.body);

      // Convert empty strings to null for foreign key fields
      const cleanedData = {
        ...patientData,
        medicalInstitutionId: patientData.medicalInstitutionId === "" ? null : patientData.medicalInstitutionId,
        careManagerId: patientData.careManagerId === "" ? null : patientData.careManagerId,
        buildingId: patientData.buildingId === "" ? null : patientData.buildingId,
      };

      // Set facility ID from current user
      const patientToCreate = {
        ...cleanedData,
        facilityId: req.user.facilityId
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

      // Check if patient belongs to user's facility
      const existingPatient = await storage.getPatient(id);
      if (!existingPatient || existingPatient.facilityId !== req.user.facilityId) {
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

      let result;
      if (patientId) {
        result = await storage.getVisitsByPatientPaginated(patientId as string, req.user.facilityId, { page, limit });
      } else if (nurseId) {
        result = await storage.getVisitsByNursePaginated(nurseId as string, req.user.facilityId, { page, limit });
      } else {
        result = await storage.getVisitsByFacilityPaginated(req.user.facilityId, { page, limit });
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
      const visits = await storage.getUpcomingVisits(req.user.facilityId);
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
      const facilityId = req.user.facilityId;
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
      const facilityId = req.session.facilityId;
      const { startDate, endDate } = req.query;

      console.log("=== 記録未作成スケジュール検索 ===");
      console.log("検索期間:", startDate, "～", endDate);

      // Build query conditions
      const whereConditions = [
        eq(schedules.facilityId, facilityId!),
        // Search for past schedules (not just "completed" status)
        // Exclude cancelled schedules
        not(inArray(schedules.status, ["cancelled"] as const)),
      ];

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

      console.log(`過去のスケジュール数（キャンセル等除く）: ${allSchedules.length}`);
      allSchedules.forEach(s => {
        console.log(`  - ID: ${s.id}, 日付: ${s.scheduledDate}, ステータス: ${s.status}`);
      });

      // Get all nursing records with scheduleId
      const schedulesWithRecords = await db.query.nursingRecords.findMany({
        where: and(
          eq(nursingRecords.facilityId, facilityId!),
          isNotNull(nursingRecords.scheduleId)
        ),
        columns: {
          scheduleId: true,
        }
      });

      console.log(`記録が紐づいているスケジュール数: ${schedulesWithRecords.length}`);
      schedulesWithRecords.forEach(r => {
        console.log(`  - scheduleId: ${r.scheduleId}`);
      });

      // Create a Set of schedule IDs that have records
      const recordedScheduleIds = new Set(
        schedulesWithRecords.map(record => record.scheduleId).filter(Boolean)
      );

      // Filter schedules that don't have records
      const schedulesWithoutRecords = allSchedules.filter(
        schedule => !recordedScheduleIds.has(schedule.id)
      );

      console.log(`記録未作成のスケジュール数: ${schedulesWithoutRecords.length}`);
      console.log("===============================");

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

  // Create schedule
  app.post("/api/schedules", requireAuth, checkSubdomainAccess, async (req: AuthenticatedRequest, res: Response) => {
    try {
      console.log("受信データ:", req.body); // デバッグ用
      const validatedData = insertScheduleSchema.parse(req.body);
      const facilityId = req.user.facilityId;
      console.log("バリデーション成功、facilityId:", facilityId); // デバッグ用

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
        const [startHour, startMinute] = startTime.split(':').map(Number);
        const [endHour, endMinute] = endTime.split(':').map(Number);

        const scheduledStartTime = new Date(scheduleDate);
        scheduledStartTime.setHours(startHour, startMinute, 0, 0);

        const scheduledEndTime = new Date(scheduleDate);
        scheduledEndTime.setHours(endHour, endMinute, 0, 0);

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

      // Check if schedule exists and user has access
      const existingSchedule = await storage.getScheduleById(id);
      if (!existingSchedule) {
        return res.status(404).json({ error: "スケジュールが見つかりません" });
      }

      if (existingSchedule.facilityId !== req.user.facilityId && !req.isCorporateAdmin) {
        return res.status(403).json({ error: "アクセス権限がありません" });
      }

      await storage.deleteSchedule(id);
      res.status(204).send();
    } catch (error) {
      console.error("Delete schedule error:", error);
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

      let result;
      if (patientId) {
        result = await storage.getNursingRecordsByPatientPaginated(patientId as string, req.user.facilityId, { page, limit });
      } else if (nurseId) {
        result = await storage.getNursingRecordsByNursePaginated(nurseId as string, req.user.facilityId, { page, limit });
      } else {
        result = await storage.getNursingRecordsByFacilityPaginated(req.user.facilityId, { page, limit });
      }
      
      res.json(result);
      
    } catch (error) {
      console.error("Get nursing records error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Helper function: Calculate bonuses and points for nursing record
  async function calculateBonusesAndPoints(recordData: any, facilityId: string) {
    const appliedBonuses: any[] = [];
    let calculatedPoints = 0;

    // Base visit points (訪問看護基本療養費) - simplified, needs actual tariff table
    const basePoints = 500; // Example: 基本点数（実際の診療報酬点数表に基づいて設定）
    calculatedPoints += basePoints;

    // 1. Multiple visit bonus (複数回訪問加算) - Check if this is 2nd+ visit on same day
    if (recordData.isSecondVisit || recordData.multipleVisitReason) {
      const visitDate = recordData.visitDate ? new Date(recordData.visitDate) : new Date(recordData.recordDate);
      const startOfDay = new Date(visitDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(visitDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Count visits on the same day for the same patient
      const sameDayVisits = await db.query.nursingRecords.findMany({
        where: and(
          eq(nursingRecords.facilityId, facilityId),
          eq(nursingRecords.patientId, recordData.patientId),
          gte(nursingRecords.visitDate, startOfDay.toISOString().split('T')[0]),
          lte(nursingRecords.visitDate, endOfDay.toISOString().split('T')[0]),
          isNull(nursingRecords.deletedAt)
        )
      });

      if (sameDayVisits.length >= 1) { // 2回目以降の訪問
        const multipleVisitBonus = 100; // 複数回訪問加算（例: 100点）
        calculatedPoints += multipleVisitBonus;
        appliedBonuses.push({
          type: 'multiple_visit',
          points: multipleVisitBonus,
          reason: recordData.multipleVisitReason || '複数回訪問',
          visitNumber: sameDayVisits.length + 1
        });
      }
    }

    // 2. Emergency visit bonus (緊急訪問加算)
    if (recordData.emergencyVisitReason) {
      const emergencyBonus = 200; // 緊急訪問加算（例: 200点）
      calculatedPoints += emergencyBonus;
      appliedBonuses.push({
        type: 'emergency_visit',
        points: emergencyBonus,
        reason: recordData.emergencyVisitReason
      });
    }

    // 3. Long visit bonus (長時間訪問加算) - 90 minutes or more
    if (recordData.actualStartTime && recordData.actualEndTime) {
      const startTime = new Date(recordData.actualStartTime);
      const endTime = new Date(recordData.actualEndTime);
      const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60));

      if (durationMinutes >= 90) {
        const longVisitBonus = 150; // 長時間訪問加算（例: 150点）
        calculatedPoints += longVisitBonus;
        appliedBonuses.push({
          type: 'long_visit',
          points: longVisitBonus,
          duration: durationMinutes,
          reason: recordData.longVisitReason || `${durationMinutes}分の訪問`
        });
      }
    }

    // 4. Same building discount (同一建物減算)
    if (recordData.patientId) {
      const patient = await db.query.patients.findFirst({
        where: eq(patients.id, recordData.patientId),
        with: {
          building: true
        }
      });

      if (patient?.buildingId) {
        // Check if other patients in the same building were visited on the same day
        const visitDate = recordData.visitDate ? new Date(recordData.visitDate) : new Date(recordData.recordDate);
        const startOfDay = new Date(visitDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(visitDate);
        endOfDay.setHours(23, 59, 59, 999);

        // Get other patients in the same building
        const patientsInSameBuilding = await db.query.patients.findMany({
          where: and(
            eq(patients.buildingId, patient.buildingId),
            eq(patients.facilityId, facilityId)
          )
        });

        const patientIdsInBuilding = patientsInSameBuilding.map(p => p.id);

        // Count visits to same building on the same day
        const sameBuildingVisits = await db.query.nursingRecords.findMany({
          where: and(
            eq(nursingRecords.facilityId, facilityId),
            inArray(nursingRecords.patientId, patientIdsInBuilding),
            gte(nursingRecords.visitDate, startOfDay.toISOString().split('T')[0]),
            lte(nursingRecords.visitDate, endOfDay.toISOString().split('T')[0]),
            isNull(nursingRecords.deletedAt)
          )
        });

        if (sameBuildingVisits.length >= 1) { // 同一建物で複数訪問
          const sameBuildingDiscount = -50; // 同一建物減算（例: -50点）
          calculatedPoints += sameBuildingDiscount;
          appliedBonuses.push({
            type: 'same_building_discount',
            points: sameBuildingDiscount,
            buildingName: patient.building?.name,
            visitCount: sameBuildingVisits.length + 1
          });
        }
      }
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

      // Calculate bonuses and points
      const { calculatedPoints, appliedBonuses } = await calculateBonusesAndPoints(recordData, req.user.facilityId);
      recordData.calculatedPoints = calculatedPoints;
      recordData.appliedBonuses = appliedBonuses;

      // Pass facility ID and nurse ID separately
      const record = await storage.createNursingRecord(recordData, req.user.facilityId, req.user.id);
      res.status(201).json(record);

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

      // Recalculate bonuses and points
      const { calculatedPoints, appliedBonuses } = await calculateBonusesAndPoints(mergedData, req.user.facilityId);
      validatedData.calculatedPoints = calculatedPoints;
      validatedData.appliedBonuses = appliedBonuses;

      const record = await storage.updateNursingRecord(id, validatedData);
      if (!record) {
        return res.status(404).json({ error: "看護記録が見つかりません" });
      }

      res.json(record);

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

        const [attachment] = await db.insert(nursingRecordAttachments).values({
          nursingRecordId: id,
          fileName: file.filename,
          originalFileName: file.originalname,
          fileType: file.mimetype,
          fileSize: file.size,
          filePath: path.join('nursing-records', id, file.filename),
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

      const filePath = path.join(process.cwd(), 'uploads', attachment.filePath);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "ファイルが見つかりません" });
      }

      // Set appropriate content type
      res.setHeader('Content-Type', attachment.fileType);
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(attachment.originalFileName)}"`);

      // Stream file to response
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);

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

      // Delete file from filesystem
      const filePath = path.join(process.cwd(), 'uploads', attachment.filePath);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

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

      let result;
      if (patientId) {
        result = await storage.getMedicationsByPatientPaginated(patientId as string, req.user.facilityId, { page, limit });
      } else {
        result = await storage.getMedicationsByFacilityPaginated(req.user.facilityId, { page, limit });
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
      const facilityId = req.session.facilityId;

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
      const facilityId = req.session.facilityId;

      const institution = await db.query.medicalInstitutions.findFirst({
        where: and(
          eq(medicalInstitutions.id, id),
          eq(medicalInstitutions.facilityId, facilityId!)
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
      const facilityId = req.session.facilityId;

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
      const facilityId = req.session.facilityId;

      const validatedData = updateMedicalInstitutionSchema.parse(req.body);

      const [institution] = await db.update(medicalInstitutions)
        .set({
          ...validatedData,
          updatedAt: new Date()
        })
        .where(and(
          eq(medicalInstitutions.id, id),
          eq(medicalInstitutions.facilityId, facilityId!)
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
      const facilityId = req.session.facilityId;

      const [institution] = await db.update(medicalInstitutions)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(
          eq(medicalInstitutions.id, id),
          eq(medicalInstitutions.facilityId, facilityId!)
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
      const facilityId = req.session.facilityId;

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
      const facilityId = req.session.facilityId;

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
      const facilityId = req.session.facilityId;

      const validatedData = updateBuildingSchema.parse(req.body);

      const [building] = await db.update(buildings)
        .set({
          ...validatedData,
          updatedAt: new Date()
        })
        .where(and(
          eq(buildings.id, id),
          eq(buildings.facilityId, facilityId!)
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
      const facilityId = req.session.facilityId;

      // Check if building has patients
      const patientsInBuilding = await db.query.patients.findMany({
        where: and(
          eq(patients.buildingId, id),
          eq(patients.facilityId, facilityId!)
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
          eq(buildings.facilityId, facilityId!)
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
      const facilityId = req.session.facilityId;

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
      const facilityId = req.session.facilityId;

      const manager = await db.query.careManagers.findFirst({
        where: and(
          eq(careManagers.id, id),
          eq(careManagers.facilityId, facilityId!)
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
      const facilityId = req.session.facilityId;

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
      const facilityId = req.session.facilityId;

      const validatedData = updateCareManagerSchema.parse(req.body);

      const [manager] = await db.update(careManagers)
        .set({
          ...validatedData,
          updatedAt: new Date()
        })
        .where(and(
          eq(careManagers.id, id),
          eq(careManagers.facilityId, facilityId!)
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
      const facilityId = req.session.facilityId;

      const [manager] = await db.update(careManagers)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(
          eq(careManagers.id, id),
          eq(careManagers.facilityId, facilityId!)
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

  // ========== Doctor Orders API (訪問看護指示書) ==========

  // Get all doctor orders (with optional patient filter)
  app.get("/api/doctor-orders", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.session.facilityId;
      const { patientId } = req.query;

      const whereConditions = [
        eq(doctorOrders.facilityId, facilityId!),
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
      const facilityId = req.session.facilityId;

      const orders = await db.query.doctorOrders.findMany({
        where: and(
          eq(doctorOrders.patientId, patientId),
          eq(doctorOrders.facilityId, facilityId!),
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
      const facilityId = req.session.facilityId;
      const today = new Date();
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(today.getDate() + 30);

      const orders = await db.query.doctorOrders.findMany({
        where: and(
          eq(doctorOrders.facilityId, facilityId!),
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
      const facilityId = req.session.facilityId;

      const order = await db.query.doctorOrders.findFirst({
        where: and(
          eq(doctorOrders.id, id),
          eq(doctorOrders.facilityId, facilityId!)
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
      const facilityId = req.session.facilityId;

      if (!facilityId) {
        return res.status(401).json({ error: "施設IDが見つかりません" });
      }

      const validatedData = insertDoctorOrderSchema.parse(req.body);

      const orderData: any = {
        ...validatedData,
        facilityId
      };

      // Add file path and original filename if file was uploaded
      if (req.file) {
        orderData.filePath = `/uploads/documents/${req.file.filename}`;
        orderData.originalFileName = decodeFilename(req.file.originalname);
      }

      const [order] = await db.insert(doctorOrders).values(orderData).returning();

      res.status(201).json(order);
    } catch (error) {
      // Clean up uploaded file if there was an error
      if (req.file) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (unlinkError) {
          console.error('Error deleting file:', unlinkError);
        }
      }

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
      const facilityId = req.session.facilityId;

      const validatedData = updateDoctorOrderSchema.parse(req.body);

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
            eq(doctorOrders.facilityId, facilityId!)
          ))
          .limit(1);

        // Delete old file if exists
        if (currentOrder?.filePath) {
          const oldFilePath = path.join(process.cwd(), currentOrder.filePath);
          try {
            if (fs.existsSync(oldFilePath)) {
              fs.unlinkSync(oldFilePath);
            }
          } catch (fileError) {
            console.error('Error deleting old file:', fileError);
          }
        }

        updateData.filePath = `/uploads/documents/${req.file.filename}`;
        updateData.originalFileName = decodeFilename(req.file.originalname);
      }

      const [order] = await db.update(doctorOrders)
        .set(updateData)
        .where(and(
          eq(doctorOrders.id, id),
          eq(doctorOrders.facilityId, facilityId!)
        ))
        .returning();

      if (!order) {
        // Clean up uploaded file if order not found
        if (req.file) {
          try {
            fs.unlinkSync(req.file.path);
          } catch (unlinkError) {
            console.error('Error deleting file:', unlinkError);
          }
        }
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
      const facilityId = req.session.facilityId;

      const [order] = await db.update(doctorOrders)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(
          eq(doctorOrders.id, id),
          eq(doctorOrders.facilityId, facilityId!)
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
      const facilityId = req.session.facilityId;

      const [order] = await db.select()
        .from(doctorOrders)
        .where(and(
          eq(doctorOrders.id, id),
          eq(doctorOrders.facilityId, facilityId!)
        ))
        .limit(1);

      if (!order) {
        return res.status(404).json({ error: "訪問看護指示書が見つかりません" });
      }

      if (!order.filePath) {
        return res.status(404).json({ error: "添付ファイルがありません" });
      }

      const filePath = path.join(process.cwd(), order.filePath);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "ファイルが見つかりません" });
      }

      // Set Content-Disposition header with RFC 5987 encoding for international filenames
      const filename = order.originalFileName || order.filePath.split('/').pop() || 'download';
      const encodedFilename = encodeURIComponent(filename);
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);
      res.sendFile(filePath);
    } catch (error) {
      console.error("Download doctor order attachment error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Delete doctor order attachment
  app.delete("/api/doctor-orders/:id/attachment", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.session.facilityId;

      // Get current order to find file path
      const [currentOrder] = await db.select()
        .from(doctorOrders)
        .where(and(
          eq(doctorOrders.id, id),
          eq(doctorOrders.facilityId, facilityId!)
        ))
        .limit(1);

      if (!currentOrder) {
        return res.status(404).json({ error: "訪問看護指示書が見つかりません" });
      }

      // Delete physical file if exists
      if (currentOrder.filePath) {
        const filePath = path.join(process.cwd(), currentOrder.filePath);
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (fileError) {
          console.error('Error deleting file:', fileError);
        }
      }

      // Update database to remove file path
      const [order] = await db.update(doctorOrders)
        .set({ filePath: null, updatedAt: new Date() })
        .where(and(
          eq(doctorOrders.id, id),
          eq(doctorOrders.facilityId, facilityId!)
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
      const facilityId = req.session.facilityId;
      const { patientId } = req.query;

      const whereConditions = [
        eq(insuranceCards.facilityId, facilityId!),
        eq(insuranceCards.isActive, true)
      ];

      if (patientId && typeof patientId === 'string') {
        whereConditions.push(eq(insuranceCards.patientId, patientId));
      }

      const cards = await db.query.insuranceCards.findMany({
        where: and(...whereConditions),
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
      const facilityId = req.session.facilityId;
      const today = new Date();
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(today.getDate() + 30);

      const cards = await db.query.insuranceCards.findMany({
        where: and(
          eq(insuranceCards.facilityId, facilityId!),
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
      const facilityId = req.session.facilityId;

      const cards = await db.query.insuranceCards.findMany({
        where: and(
          eq(insuranceCards.patientId, patientId),
          eq(insuranceCards.facilityId, facilityId!),
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
      const facilityId = req.session.facilityId;

      const card = await db.query.insuranceCards.findFirst({
        where: and(
          eq(insuranceCards.id, id),
          eq(insuranceCards.facilityId, facilityId!)
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
      const facilityId = req.session.facilityId;

      if (!facilityId) {
        return res.status(401).json({ error: "施設IDが見つかりません" });
      }

      const validatedData = insertInsuranceCardSchema.parse(req.body);

      const cardData: any = {
        ...validatedData,
        facilityId
      };

      // Add file path and original filename if file was uploaded
      if (req.file) {
        cardData.filePath = `/uploads/documents/${req.file.filename}`;
        cardData.originalFileName = decodeFilename(req.file.originalname);
      }

      const [card] = await db.insert(insuranceCards).values(cardData).returning();

      res.status(201).json(card);
    } catch (error) {
      // Clean up uploaded file if there was an error
      if (req.file) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (unlinkError) {
          console.error('Error deleting file:', unlinkError);
        }
      }

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
      const facilityId = req.session.facilityId;

      const validatedData = updateInsuranceCardSchema.parse(req.body);

      const updateData: any = {
        ...validatedData,
        updatedAt: new Date()
      };

      // If a new file is uploaded, delete the old one first
      if (req.file) {
        // Get current card to find old file path
        const [currentCard] = await db.select()
          .from(insuranceCards)
          .where(and(
            eq(insuranceCards.id, id),
            eq(insuranceCards.facilityId, facilityId!)
          ))
          .limit(1);

        // Delete old file if exists
        if (currentCard?.filePath) {
          const oldFilePath = path.join(process.cwd(), currentCard.filePath);
          try {
            if (fs.existsSync(oldFilePath)) {
              fs.unlinkSync(oldFilePath);
            }
          } catch (fileError) {
            console.error('Error deleting old file:', fileError);
          }
        }

        updateData.filePath = `/uploads/documents/${req.file.filename}`;
        updateData.originalFileName = decodeFilename(req.file.originalname);
      }

      const [card] = await db.update(insuranceCards)
        .set(updateData)
        .where(and(
          eq(insuranceCards.id, id),
          eq(insuranceCards.facilityId, facilityId!)
        ))
        .returning();

      if (!card) {
        // Clean up uploaded file if card not found
        if (req.file) {
          try {
            fs.unlinkSync(req.file.path);
          } catch (unlinkError) {
            console.error('Error deleting file:', unlinkError);
          }
        }
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
      const facilityId = req.session.facilityId;

      const [card] = await db.update(insuranceCards)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(
          eq(insuranceCards.id, id),
          eq(insuranceCards.facilityId, facilityId!)
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
      const facilityId = req.session.facilityId;

      // Get insurance card with file
      const [card] = await db.select()
        .from(insuranceCards)
        .where(and(
          eq(insuranceCards.id, id),
          eq(insuranceCards.facilityId, facilityId!)
        ))
        .limit(1);

      if (!card) {
        return res.status(404).json({ error: "保険証情報が見つかりません" });
      }

      if (!card.filePath) {
        return res.status(404).json({ error: "添付ファイルが見つかりません" });
      }

      const filePath = path.join(process.cwd(), card.filePath);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "ファイルが見つかりません" });
      }

      // Set Content-Disposition header with RFC 5987 encoding for international filenames
      const filename = card.originalFileName || card.filePath.split('/').pop() || 'download';
      const encodedFilename = encodeURIComponent(filename);
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);
      res.sendFile(filePath);
    } catch (error) {
      console.error("Download insurance card attachment error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Delete insurance card attachment
  app.delete("/api/insurance-cards/:id/attachment", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.session.facilityId;

      // Get current card to find file path
      const [currentCard] = await db.select()
        .from(insuranceCards)
        .where(and(
          eq(insuranceCards.id, id),
          eq(insuranceCards.facilityId, facilityId!)
        ))
        .limit(1);

      if (!currentCard) {
        return res.status(404).json({ error: "保険証情報が見つかりません" });
      }

      // Delete physical file if exists
      if (currentCard.filePath) {
        const filePath = path.join(process.cwd(), currentCard.filePath);
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (fileError) {
          console.error('Error deleting file:', fileError);
        }
      }

      // Update database to remove file path
      const [card] = await db.update(insuranceCards)
        .set({ filePath: null, updatedAt: new Date() })
        .where(and(
          eq(insuranceCards.id, id),
          eq(insuranceCards.facilityId, facilityId!)
        ))
        .returning();

      res.json({ message: "添付ファイルを削除しました", card });
    } catch (error) {
      console.error("Delete insurance card attachment error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // ========== Monthly Statistics API (月次実績集計) ==========

  // Get monthly visit statistics for billing
  app.get("/api/statistics/monthly/:year/:month", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.session.facilityId;
      const { year, month } = req.params;
      const { patientId } = req.query;

      // Calculate start and end dates for the month
      const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      const endDate = new Date(parseInt(year), parseInt(month), 0); // Last day of month

      // Build where conditions
      const whereConditions = [
        eq(nursingRecords.facilityId, facilityId!),
        gte(nursingRecords.recordDate, startDate),
        lte(nursingRecords.recordDate, endDate)
      ];

      if (patientId && typeof patientId === 'string') {
        whereConditions.push(eq(nursingRecords.patientId, patientId));
      }

      // Fetch all nursing records for the period
      const records = await db.query.nursingRecords.findMany({
        where: and(...whereConditions),
        with: {
          patient: true,
          nurse: true,
        },
        orderBy: (nursingRecords, { asc }) => [
          asc(nursingRecords.patientId),
          asc(nursingRecords.recordDate)
        ]
      });

      // Group records by patient
      const patientStats = new Map<string, {
        patientId: string;
        patientName: string;
        visitCount: number;
        totalMinutes: number;
        records: typeof records;
        calculatedPoints: number;
        appliedBonuses: any[];
      }>();

      for (const record of records) {
        const patientId = record.patientId;
        if (!patientStats.has(patientId)) {
          patientStats.set(patientId, {
            patientId,
            patientName: record.patient ? `${record.patient.lastName} ${record.patient.firstName}` : '不明',
            visitCount: 0,
            totalMinutes: 0,
            records: [],
            calculatedPoints: 0,
            appliedBonuses: []
          });
        }

        const stats = patientStats.get(patientId)!;
        stats.visitCount++;

        // Calculate duration if available
        if (record.actualStartTime && record.actualEndTime) {
          const start = new Date(record.actualStartTime);
          const end = new Date(record.actualEndTime);
          const minutes = Math.round((end.getTime() - start.getTime()) / (1000 * 60));
          stats.totalMinutes += minutes;
        }

        stats.records.push(record);

        // Aggregate calculated points and bonuses
        if (record.calculatedPoints) {
          stats.calculatedPoints += record.calculatedPoints;
        }
        if (record.appliedBonuses) {
          stats.appliedBonuses.push(record.appliedBonuses);
        }
      }

      // Convert to array
      const statistics = Array.from(patientStats.values()).map(stat => ({
        patientId: stat.patientId,
        patientName: stat.patientName,
        visitCount: stat.visitCount,
        totalMinutes: stat.totalMinutes,
        averageMinutes: stat.visitCount > 0 ? Math.round(stat.totalMinutes / stat.visitCount) : 0,
        calculatedPoints: stat.calculatedPoints,
        appliedBonuses: stat.appliedBonuses,
        estimatedCost: stat.calculatedPoints * 10, // 1点 = 10円
      }));

      res.json({
        year: parseInt(year),
        month: parseInt(month),
        totalPatients: statistics.length,
        totalVisits: records.length,
        statistics
      });
    } catch (error) {
      console.error("Get monthly statistics error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Export monthly statistics as CSV for billing
  app.get("/api/statistics/monthly/:year/:month/export", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.session.facilityId;
      const { year, month } = req.params;

      // Calculate start and end dates for the month
      const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      const endDate = new Date(parseInt(year), parseInt(month), 0);

      // Fetch all nursing records for the period with patient and insurance info
      const records = await db.query.nursingRecords.findMany({
        where: and(
          eq(nursingRecords.facilityId, facilityId!),
          gte(nursingRecords.recordDate, startDate),
          lte(nursingRecords.recordDate, endDate)
        ),
        with: {
          patient: true,
          nurse: true,
        },
        orderBy: (nursingRecords, { asc }) => [
          asc(nursingRecords.patientId),
          asc(nursingRecords.recordDate)
        ]
      });

      // Get insurance cards for all patients
      const patientIds = Array.from(new Set(records.map(r => r.patientId)));
      const allInsuranceCards = await db.query.insuranceCards.findMany({
        where: and(
          eq(insuranceCards.facilityId, facilityId!),
          eq(insuranceCards.isActive, true)
        )
      });

      // Create CSV header
      const csvRows: string[] = [];
      csvRows.push([
        '利用者ID',
        '利用者名',
        '保険者番号',
        '被保険者番号',
        '負担割合',
        '訪問日',
        '開始時刻',
        '終了時刻',
        '訪問時間（分）',
        '担当看護師',
        '算定点数',
        '適用加算',
        '金額（円）'
      ].join(','));

      // Add data rows
      for (const record of records) {
        const patient = record.patient;
        if (!patient) continue;

        // Find patient's insurance card
        const insuranceCard = allInsuranceCards.find(card => card.patientId === patient.id);

        // Calculate visit duration
        let duration = '';
        if (record.actualStartTime && record.actualEndTime) {
          const start = new Date(record.actualStartTime);
          const end = new Date(record.actualEndTime);
          const minutes = Math.round((end.getTime() - start.getTime()) / (1000 * 60));
          duration = minutes.toString();
        }

        // Format bonuses
        const bonuses = record.appliedBonuses
          ? JSON.stringify(record.appliedBonuses).replace(/,/g, '；') // Replace commas to avoid CSV issues
          : '';

        csvRows.push([
          patient.patientNumber || patient.id,
          `${patient.lastName} ${patient.firstName}`,
          insuranceCard?.insurerNumber || '',
          insuranceCard?.insuredNumber || '',
          insuranceCard?.copaymentRate ? `${insuranceCard.copaymentRate}割` : '',
          new Date(record.recordDate).toLocaleDateString('ja-JP'),
          record.actualStartTime ? new Date(record.actualStartTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '',
          record.actualEndTime ? new Date(record.actualEndTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '',
          duration,
          record.nurse?.fullName || '',
          (record.calculatedPoints || 0).toString(),
          bonuses,
          ((record.calculatedPoints || 0) * 10).toString()
        ].map(field => `"${field}"`).join(','));
      }

      const csv = csvRows.join('\n');

      // Set response headers for file download
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="receipt_${year}_${month}.csv"`);

      // Add BOM for Excel UTF-8 support
      res.send('\uFEFF' + csv);
    } catch (error) {
      console.error("Export monthly statistics error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // ========== Care Plans API (訪問看護計画書) ==========

  // Get all care plans with optional patient filter
  app.get("/api/care-plans", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.session.facilityId;
      const { patientId } = req.query;

      const whereConditions = [
        eq(carePlans.facilityId, facilityId!),
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
      const facilityId = req.session.facilityId;

      const plan = await db.query.carePlans.findFirst({
        where: and(
          eq(carePlans.id, id),
          eq(carePlans.facilityId, facilityId!)
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
      const facilityId = req.session.facilityId;
      const userId = req.session.userId;

      if (!facilityId || !userId) {
        return res.status(401).json({ error: "認証情報が見つかりません" });
      }

      console.log("Received care plan data:", req.body);
      const validatedData = insertCarePlanSchema.parse(req.body);

      const planData: any = {
        ...validatedData,
        facilityId,
        createdBy: userId,
      };

      if (req.file) {
        planData.filePath = `/uploads/documents/${req.file.filename}`;
        planData.originalFileName = decodeFilename(req.file.originalname);
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
      const facilityId = req.session.facilityId;

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
            eq(carePlans.facilityId, facilityId!)
          ))
          .limit(1);

        if (currentPlan?.filePath) {
          const oldFilePath = path.join(process.cwd(), currentPlan.filePath);
          try {
            if (fs.existsSync(oldFilePath)) {
              fs.unlinkSync(oldFilePath);
            }
          } catch (fileError) {
            console.error('Error deleting old file:', fileError);
          }
        }

        updateData.filePath = `/uploads/documents/${req.file.filename}`;
        updateData.originalFileName = decodeFilename(req.file.originalname);
      }

      const [plan] = await db.update(carePlans)
        .set(updateData)
        .where(and(
          eq(carePlans.id, id),
          eq(carePlans.facilityId, facilityId!)
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
      const facilityId = req.session.facilityId;

      const [plan] = await db.select()
        .from(carePlans)
        .where(and(
          eq(carePlans.id, id),
          eq(carePlans.facilityId, facilityId!)
        ))
        .limit(1);

      if (!plan) {
        return res.status(404).json({ error: "訪問看護計画書が見つかりません" });
      }

      if (!plan.filePath) {
        return res.status(404).json({ error: "添付ファイルが見つかりません" });
      }

      const filePath = path.join(process.cwd(), plan.filePath);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "ファイルが見つかりません" });
      }

      const filename = plan.originalFileName || plan.filePath.split('/').pop() || 'download';
      const encodedFilename = encodeURIComponent(filename);
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);
      res.sendFile(filePath);
    } catch (error) {
      console.error("Download care plan attachment error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Delete care plan attachment
  app.delete("/api/care-plans/:id/attachment", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.session.facilityId;

      const [currentPlan] = await db.select()
        .from(carePlans)
        .where(and(
          eq(carePlans.id, id),
          eq(carePlans.facilityId, facilityId!)
        ))
        .limit(1);

      if (!currentPlan) {
        return res.status(404).json({ error: "訪問看護計画書が見つかりません" });
      }

      if (currentPlan.filePath) {
        const filePath = path.join(process.cwd(), currentPlan.filePath);
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (fileError) {
          console.error('Error deleting file:', fileError);
        }
      }

      const [plan] = await db.update(carePlans)
        .set({ filePath: null, originalFileName: null, updatedAt: new Date() })
        .where(and(
          eq(carePlans.id, id),
          eq(carePlans.facilityId, facilityId!)
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
      const facilityId = req.session.facilityId;

      const [plan] = await db.update(carePlans)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(
          eq(carePlans.id, id),
          eq(carePlans.facilityId, facilityId!)
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

  // ========== Care Reports API (訪問看護報告書) ==========

  // Get all care reports with optional patient filter
  app.get("/api/care-reports", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const facilityId = req.session.facilityId;
      const { patientId } = req.query;

      const whereConditions = [
        eq(careReports.facilityId, facilityId!),
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
        orderBy: (careReports, { desc }) => [desc(careReports.reportDate)]
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
      const facilityId = req.session.facilityId;

      const report = await db.query.careReports.findFirst({
        where: and(
          eq(careReports.id, id),
          eq(careReports.facilityId, facilityId!)
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
      const facilityId = req.session.facilityId;
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
        reportData.filePath = `/uploads/documents/${req.file.filename}`;
        reportData.originalFileName = decodeFilename(req.file.originalname);
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
      const facilityId = req.session.facilityId;

      // FormDataの場合は数値型を変換
      const requestData = { ...req.body };
      if (requestData.visitCount !== undefined) {
        requestData.visitCount = parseInt(requestData.visitCount);
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
            eq(careReports.facilityId, facilityId!)
          ))
          .limit(1);

        if (currentReport?.filePath) {
          const oldFilePath = path.join(process.cwd(), currentReport.filePath);
          try {
            if (fs.existsSync(oldFilePath)) {
              fs.unlinkSync(oldFilePath);
            }
          } catch (fileError) {
            console.error('Error deleting old file:', fileError);
          }
        }

        updateData.filePath = `/uploads/documents/${req.file.filename}`;
        updateData.originalFileName = decodeFilename(req.file.originalname);
      }

      const [report] = await db.update(careReports)
        .set(updateData)
        .where(and(
          eq(careReports.id, id),
          eq(careReports.facilityId, facilityId!)
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
      const facilityId = req.session.facilityId;

      const [report] = await db.select()
        .from(careReports)
        .where(and(
          eq(careReports.id, id),
          eq(careReports.facilityId, facilityId!)
        ))
        .limit(1);

      if (!report) {
        return res.status(404).json({ error: "訪問看護報告書が見つかりません" });
      }

      if (!report.filePath) {
        return res.status(404).json({ error: "添付ファイルが見つかりません" });
      }

      const filePath = path.join(process.cwd(), report.filePath);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "ファイルが見つかりません" });
      }

      const filename = report.originalFileName || report.filePath.split('/').pop() || 'download';
      const encodedFilename = encodeURIComponent(filename);
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);
      res.sendFile(filePath);
    } catch (error) {
      console.error("Download care report attachment error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Delete care report attachment
  app.delete("/api/care-reports/:id/attachment", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.session.facilityId;

      const [currentReport] = await db.select()
        .from(careReports)
        .where(and(
          eq(careReports.id, id),
          eq(careReports.facilityId, facilityId!)
        ))
        .limit(1);

      if (!currentReport) {
        return res.status(404).json({ error: "訪問看護報告書が見つかりません" });
      }

      if (currentReport.filePath) {
        const filePath = path.join(process.cwd(), currentReport.filePath);
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (fileError) {
          console.error('Error deleting file:', fileError);
        }
      }

      const [report] = await db.update(careReports)
        .set({ filePath: null, originalFileName: null, updatedAt: new Date() })
        .where(and(
          eq(careReports.id, id),
          eq(careReports.facilityId, facilityId!)
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
      const facilityId = req.session.facilityId;

      const [report] = await db.update(careReports)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(
          eq(careReports.id, id),
          eq(careReports.facilityId, facilityId!)
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
      const facilityId = req.session.facilityId;

      // Fetch care plan with relations
      const plan = await db.query.carePlans.findFirst({
        where: and(
          eq(carePlans.id, id),
          eq(carePlans.facilityId, facilityId!),
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
      const facilityId = req.session.facilityId;

      // Fetch care report with relations
      const report = await db.query.careReports.findFirst({
        where: and(
          eq(careReports.id, id),
          eq(careReports.facilityId, facilityId!),
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
      const facilityId = req.session.facilityId;
      const { patientId } = req.query;

      const whereConditions = [
        eq(contracts.facilityId, facilityId!),
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
        orderBy: (contracts, { desc }) => [desc(contracts.contractDate)]
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
      const facilityId = req.session.facilityId;
      const validatedData = insertContractSchema.parse(req.body);

      const contractData: any = {
        ...validatedData,
        facilityId: facilityId!,
      };

      // Add file path and original filename if file was uploaded
      if (req.file) {
        contractData.filePath = `/uploads/documents/${req.file.filename}`;
        contractData.originalFileName = decodeFilename(req.file.originalname);
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
      const facilityId = req.session.facilityId;
      const validatedData = updateContractSchema.parse(req.body);

      const updateData: any = {
        ...validatedData,
        updatedAt: new Date()
      };

      // If a new file is uploaded, delete the old one first
      if (req.file) {
        // Get current contract to find old file path
        const [currentContract] = await db.select()
          .from(contracts)
          .where(and(
            eq(contracts.id, id),
            eq(contracts.facilityId, facilityId!)
          ))
          .limit(1);

        // Delete old file if exists
        if (currentContract?.filePath) {
          const oldFilePath = path.join(process.cwd(), currentContract.filePath);
          try {
            if (fs.existsSync(oldFilePath)) {
              fs.unlinkSync(oldFilePath);
            }
          } catch (fileError) {
            console.error('Error deleting old file:', fileError);
          }
        }

        updateData.filePath = `/uploads/documents/${req.file.filename}`;
        updateData.originalFileName = decodeFilename(req.file.originalname);
      }

      const [contract] = await db.update(contracts)
        .set(updateData)
        .where(and(
          eq(contracts.id, id),
          eq(contracts.facilityId, facilityId!)
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
      const facilityId = req.session.facilityId;

      const [contract] = await db.select()
        .from(contracts)
        .where(and(
          eq(contracts.id, id),
          eq(contracts.facilityId, facilityId!)
        ))
        .limit(1);

      if (!contract) {
        return res.status(404).json({ error: "契約書が見つかりません" });
      }

      if (!contract.filePath) {
        return res.status(404).json({ error: "添付ファイルが見つかりません" });
      }

      const filePath = path.join(process.cwd(), contract.filePath);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "ファイルが見つかりません" });
      }

      // Set Content-Disposition header with RFC 5987 encoding for international filenames
      const filename = contract.originalFileName || contract.filePath.split('/').pop() || 'download';
      const encodedFilename = encodeURIComponent(filename);
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);
      res.sendFile(filePath);
    } catch (error) {
      console.error("Download contract attachment error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Delete contract attachment
  app.delete("/api/contracts/:id/attachment", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const facilityId = req.session.facilityId;

      // Get current contract to find file path
      const [currentContract] = await db.select()
        .from(contracts)
        .where(and(
          eq(contracts.id, id),
          eq(contracts.facilityId, facilityId!)
        ))
        .limit(1);

      if (!currentContract) {
        return res.status(404).json({ error: "契約書が見つかりません" });
      }

      // Delete physical file if exists
      if (currentContract.filePath) {
        const filePath = path.join(process.cwd(), currentContract.filePath);
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (fileError) {
          console.error('Error deleting file:', fileError);
        }
      }

      // Update database to remove file path
      const [contract] = await db.update(contracts)
        .set({ filePath: null, originalFileName: null, updatedAt: new Date() })
        .where(and(
          eq(contracts.id, id),
          eq(contracts.facilityId, facilityId!)
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
      const facilityId = req.session.facilityId;

      const [contract] = await db.update(contracts)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(
          eq(contracts.id, id),
          eq(contracts.facilityId, facilityId!)
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
      const facilityId = req.session.facilityId;

      const patientContracts = await db.select()
        .from(contracts)
        .where(and(
          eq(contracts.patientId, patientId),
          eq(contracts.facilityId, facilityId!),
          eq(contracts.isActive, true)
        ))
        .orderBy(contracts.contractDate);

      res.json(patientContracts);
    } catch (error) {
      console.error("Get patient contracts error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
