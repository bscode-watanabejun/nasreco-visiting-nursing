import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";

// Extend AuthenticatedRequest to include hierarchical access info
interface AuthenticatedRequest extends Request {
  user?: any;
  accessibleFacilities?: string[];
  isCorporateAdmin?: boolean;
  company?: any;
  facility?: any;
  isHeadquarters?: boolean;
}

/**
 * Enhanced authentication middleware with hierarchical access control
 */
export const requireAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "認証が必要です" });
  }

  const user = await storage.getUser(req.session.userId);
  if (!user || !user.isActive) {
    return res.status(401).json({ error: "認証が無効です" });
  }

  req.user = user;

  // Set corporate admin flag
  req.isCorporateAdmin = user.role === 'corporate_admin' && user.accessLevel === 'corporate';

  // Determine accessible facilities based on user access level
  if (req.isCorporateAdmin) {
    // Corporate admin can access all facilities in their company
    const userFacility = await storage.getFacility(user.facilityId);
    if (userFacility && userFacility.isHeadquarters) {
      const companyFacilities = await storage.getFacilitiesByCompany(userFacility.companyId);
      req.accessibleFacilities = companyFacilities.map(f => f.id);
    } else {
      // If corporate admin is not in headquarters, limit to their facility
      req.accessibleFacilities = [user.facilityId];
    }
  } else {
    // Regular users can only access their own facility
    req.accessibleFacilities = [user.facilityId];
  }

  next();
};

/**
 * Middleware to check if user can access a specific facility
 */
export const checkFacilityAccess = (facilityIdParam: string = 'facilityId') => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const facilityId = req.params[facilityIdParam] || req.body.facilityId || req.query.facilityId;

    if (!facilityId) {
      // If no specific facility requested, use user's own facility
      return next();
    }

    if (!req.accessibleFacilities || !req.accessibleFacilities.includes(facilityId as string)) {
      return res.status(403).json({ error: "指定された施設へのアクセス権限がありません" });
    }

    next();
  };
};

/**
 * Middleware to require corporate admin privileges
 */
export const requireCorporateAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.isCorporateAdmin) {
    return res.status(403).json({ error: "企業管理者権限が必要です" });
  }
  next();
};

/**
 * Middleware to require headquarters access
 */
export const requireHeadquarters = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: "認証が必要です" });
  }

  const userFacility = await storage.getFacility(req.user.facilityId);
  if (!userFacility || !userFacility.isHeadquarters) {
    return res.status(403).json({ error: "本社アクセス権限が必要です" });
  }

  next();
};

/**
 * Middleware to check subdomain vs user facility match
 */
export const checkSubdomainAccess = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  // Skip check for headquarters or if no facility context
  if (!req.facility || req.isHeadquarters) {
    return next();
  }

  // If user is corporate admin at headquarters, allow access to any facility
  if (req.isCorporateAdmin && req.user) {
    const userFacility = await storage.getFacility(req.user.facilityId);
    if (userFacility && userFacility.isHeadquarters) {
      return next();
    }
  }

  // Check if user's facility matches the subdomain facility
  if (req.user.facilityId !== req.facility.id) {
    return res.status(403).json({ error: "この施設へのアクセス権限がありません" });
  }

  next();
};

/**
 * Utility function to check if user can access specific resource
 */
export const canAccessFacility = (userFacilityId: string, targetFacilityId: string, accessibleFacilities: string[]): boolean => {
  return accessibleFacilities.includes(targetFacilityId);
};