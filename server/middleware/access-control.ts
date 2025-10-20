import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { checkPathFacilityAccess } from "./path-security";

/**
 * Enhanced authentication middleware with hierarchical access control
 * Now works with path-based tenant system
 */
export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  console.log(`\n[RequireAuth] ========== Authentication Check ==========`);
  console.log(`[RequireAuth] Path: ${req.path}`);
  console.log(`[RequireAuth] Session userId: ${req.session.userId}`);

  if (!req.session.userId) {
    console.log(`[RequireAuth] ❌ No session userId`);
    return res.status(401).json({ error: "認証が必要です" });
  }

  const user = await storage.getUser(req.session.userId);
  if (!user || !user.isActive) {
    console.log(`[RequireAuth] ❌ User not found or inactive`);
    return res.status(401).json({ error: "認証が無効です" });
  }

  console.log(`[RequireAuth] ✅ User authenticated: ${user.email}`);
  console.log(`[RequireAuth] User ID: ${user.id}`);
  console.log(`[RequireAuth] User facilityId: ${user.facilityId}`);
  console.log(`[RequireAuth] User role: ${user.role}`);
  console.log(`[RequireAuth] User accessLevel: ${user.accessLevel}`);

  // Fetch and attach user's facility to req.user
  const userFacility = await storage.getFacility(user.facilityId);
  if (userFacility) {
    req.user = { ...user, facility: userFacility };
    console.log(`[RequireAuth] User facility attached: ${userFacility.name} (ID: ${userFacility.id})`);
  } else {
    req.user = user;
    console.log(`[RequireAuth] ⚠️ User facility not found for ID: ${user.facilityId}`);
  }

  // Set corporate admin flag
  req.isCorporateAdmin = user.role === 'corporate_admin' && user.accessLevel === 'corporate';
  console.log(`[RequireAuth] isCorporateAdmin: ${req.isCorporateAdmin}`);

  // Determine accessible facilities based on user access level
  if (req.isCorporateAdmin) {
    // Corporate admin can access all facilities in their company
    console.log(`[RequireAuth] User facility: ${userFacility?.name} (isHeadquarters: ${userFacility?.isHeadquarters})`);

    if (userFacility && userFacility.isHeadquarters) {
      const companyFacilities = await storage.getFacilitiesByCompany(userFacility.companyId);
      req.accessibleFacilities = companyFacilities.map(f => f.id);
      console.log(`[RequireAuth] Corporate admin at HQ - accessible facilities: ${req.accessibleFacilities.length} facilities`);
      console.log(`[RequireAuth] Accessible facility IDs: ${JSON.stringify(req.accessibleFacilities)}`);
    } else {
      // If corporate admin is not in headquarters, limit to their facility
      req.accessibleFacilities = [user.facilityId];
      console.log(`[RequireAuth] Corporate admin not at HQ - limited to own facility`);
    }
  } else {
    // Regular users can only access their own facility
    req.accessibleFacilities = [user.facilityId];
    console.log(`[RequireAuth] Regular user - accessible facilities: [${user.facilityId}]`);
  }

  next();
};

/**
 * Middleware to check if user can access a specific facility
 */
export const checkFacilityAccess = (facilityIdParam: string = 'facilityId') => {
  return (req: Request, res: Response, next: NextFunction) => {
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
export const requireCorporateAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.isCorporateAdmin) {
    return res.status(403).json({ error: "企業管理者権限が必要です" });
  }
  next();
};

/**
 * Middleware to require headquarters access
 */
export const requireHeadquarters = async (req: Request, res: Response, next: NextFunction) => {
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
 * NOTE: This is kept for backward compatibility, but checkPathFacilityAccess is recommended for path-based routing
 */
export const checkSubdomainAccess = async (req: Request, res: Response, next: NextFunction) => {
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