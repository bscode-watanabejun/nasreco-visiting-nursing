import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import bcrypt from "bcryptjs";
import { storage } from "./storage";
import { 
  insertUserSchema, 
  insertPatientSchema, 
  insertVisitSchema, 
  insertNursingRecordSchema, 
  insertMedicationSchema,
  insertFacilitySchema,
  updateUserSelfSchema,
  updateUserAdminSchema,
  updatePatientSchema,
  updateVisitSchema,
  updateNursingRecordSchema,
  updateMedicationSchema
} from "@shared/schema";
import { z } from "zod";

// Extend Express session data
declare module "express-session" {
  interface SessionData {
    userId?: string;
    facilityId?: string;
  }
}

// Extend Express Request to include user info
interface AuthenticatedRequest extends Request {
  user?: any;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // ========== Authentication Routes ==========
  
  // Login
  app.post("/api/auth/login", async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ error: "ユーザー名とパスワードが必要です" });
      }

      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ error: "認証に失敗しました" });
      }

      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: "認証に失敗しました" });
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
        res.json({ user: userWithoutPassword });
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

      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
      
    } catch (error) {
      console.error("Get current user error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // ========== Middleware for authenticated routes ==========
  const requireAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "認証が必要です" });
    }
    
    const user = await storage.getUser(req.session.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ error: "認証が無効です" });
    }
    
    req.user = user;
    next();
  };

  // ========== Facilities Routes ==========
  
  // Get facilities (admin only)
  app.get("/api/facilities", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: "権限がありません" });
      }
      
      const facilities = await storage.getFacilities();
      res.json(facilities);
      
    } catch (error) {
      console.error("Get facilities error:", error);
      res.status(500).json({ error: "サーバーエラーが発生しました" });
    }
  });

  // Create facility (admin only)
  app.post("/api/facilities", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: "権限がありません" });
      }
      
      const validatedData = insertFacilitySchema.parse(req.body);
      const facility = await storage.createFacility(validatedData);
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
      
      const userData = insertUserSchema.parse(req.body);
      
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
      
      // Set facility ID and nurse ID from current user
      const recordToCreate = {
        ...recordData,
        facilityId: req.user.facilityId,
        nurseId: req.user.id
      };
      
      const record = await storage.createNursingRecord(recordToCreate);
      res.status(201).json(record);
      
    } catch (error) {
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
      
      if (validatedData.nurseId) {
        const nurse = await storage.getUser(validatedData.nurseId);
        if (!nurse || nurse.facilityId !== req.user.facilityId) {
          return res.status(400).json({ error: "指定された看護師が見つかりません" });
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
