import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import bcrypt from "bcryptjs";
import multer from "multer";
import path from "path";
import fs from "fs";
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
  updateUserSelfSchema,
  updateUserAdminSchema,
  updatePatientSchema,
  updateVisitSchema,
  updateNursingRecordSchema,
  updateMedicationSchema,
  updateScheduleSchema,
  nursingRecordAttachments,
  type NursingRecordAttachment
} from "@shared/schema";
import { z } from "zod";
import { db } from "./db";
import { eq } from "drizzle-orm";

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
      
      // Set facility ID from current user
      const patientToCreate = {
        ...patientData,
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
      
      const patient = await storage.updatePatient(id, validatedData);
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

  // Create nursing record
  app.post("/api/nursing-records", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const recordData = insertNursingRecordSchema.parse(req.body);

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

  const httpServer = createServer(app);
  return httpServer;
}
