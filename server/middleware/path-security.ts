import type { Response, NextFunction } from "express";
import type { PathTenantRequest } from "./path-tenant";
import { AuditLogger } from "../audit-logger";

/**
 * Extended AuthenticatedRequest to include user and tenant context
 */
export interface AuthenticatedPathRequest extends PathTenantRequest {
  user?: any;
  accessibleFacilities?: string[];
  isCorporateAdmin?: boolean;
}

/**
 * Middleware to check if authenticated user has access to the facility in the URL path
 *
 * Security checks:
 * 1. User must be logged in
 * 2. User's facility must match URL facility (unless corporate admin)
 * 3. Corporate admins at headquarters can access all facilities in their company
 */
export const checkPathFacilityAccess = (req: AuthenticatedPathRequest, res: Response, next: NextFunction) => {
  console.log(`\n[PathSecurity] ========== checkPathFacilityAccess ==========`);
  console.log(`[PathSecurity] URL: ${req.method} ${req.originalUrl}`);
  console.log(`[PathSecurity] Path: ${req.path}`);

  // User must be authenticated
  if (!req.user) {
    console.log(`[PathSecurity] ❌ No user in request`);
    return res.status(401).json({ error: "認証が必要です" });
  }

  console.log(`[PathSecurity] User: ${req.user.email || req.user.id}`);
  console.log(`[PathSecurity] User facilityId: ${req.user.facilityId}`);
  console.log(`[PathSecurity] User role: ${req.user.role}`);
  console.log(`[PathSecurity] User accessLevel: ${req.user.accessLevel}`);
  console.log(`[PathSecurity] isCorporateAdmin: ${req.isCorporateAdmin}`);
  console.log(`[PathSecurity] accessibleFacilities: ${JSON.stringify(req.accessibleFacilities)}`);

  // If no facility in URL, only allow if user is corporate admin at headquarters
  if (!req.facility) {
    if (req.isCorporateAdmin && req.user.accessLevel === 'corporate') {
      console.log(`[PathSecurity] ✅ No facility in URL - allowing corporate admin access`);
      return next();
    }

    console.log(`[PathSecurity] ❌ No facility context - access denied for non-corporate users`);
    console.log(`[PathSecurity] This likely means Referer header is missing or path-based routing is not working`);
    return res.status(403).json({
      error: "施設コンテキストが見つかりません。正しいURLからアクセスしてください。",
      hint: "URLは /:companySlug/:facilitySlug/... の形式である必要があります"
    });
  }

  console.log(`[PathSecurity] URL facility: ${req.facility.name} (ID: ${req.facility.id})`);
  console.log(`[PathSecurity] URL facilitySlug: ${req.facilitySlug}`);

  // Get user's facility ID from session
  const userFacilityId = req.user.facilityId;

  console.log(`[PathSecurity] Comparing: user facilityId="${userFacilityId}" vs URL facility.id="${req.facility.id}"`);
  console.log(`[PathSecurity] Type check: user facilityId type=${typeof userFacilityId}, URL facility.id type=${typeof req.facility.id}`);
  console.log(`[PathSecurity] Strict equality: ${userFacilityId === req.facility.id}`);

  // Check if user's facility matches URL facility
  if (userFacilityId === req.facility.id) {
    // Direct match - user accessing their own facility
    console.log(`[PathSecurity] ✅ Direct match - user accessing their own facility`);
    return next();
  }

  // Corporate admin from headquarters can access all facilities in their company
  if (req.isCorporateAdmin && req.user.accessLevel === 'corporate') {
    // Verify user is from headquarters
    if (req.accessibleFacilities && req.accessibleFacilities.includes(req.facility.id)) {
      console.log(`[PathSecurity] ✅ Corporate admin accessing facility: ${req.facility.name}`);
      return next();
    } else {
      console.log(`[PathSecurity] ⚠️ Corporate admin but facility not in accessible list`);
    }
  }

  // Access denied - Log audit event
  const errorMessage = `この施設へのアクセス権限がありません`;
  console.error(`[PathSecurity] ❌ ACCESS DENIED`);
  console.error(`  User: ${req.user.email || req.user.id}`);
  console.error(`  User Facility: ${req.user.facility?.name || userFacilityId}`);
  console.error(`  Requested Facility: ${req.facility.name} (${req.facility.id})`);
  console.error(`  URL: ${req.method} ${req.originalUrl}`);

  // Audit log: Cross-tenant access attempt
  if (req.user.facility && req.facility) {
    AuditLogger.logCrossTenantAttempt(
      req,
      { id: req.user.facility.id, name: req.user.facility.name },
      { id: req.facility.id, name: req.facility.name },
      `User from facility "${req.user.facility.name}" attempted to access facility "${req.facility.name}"`
    );
  } else {
    AuditLogger.logAccessDenied(req, errorMessage);
  }

  return res.status(403).json({
    error: errorMessage,
    userFacility: req.user.facility?.name,
    requestedFacility: req.facility.name
  });
};

/**
 * Middleware to check if authenticated user has access to the company in the URL path
 */
export const checkPathCompanyAccess = async (req: AuthenticatedPathRequest, res: Response, next: NextFunction) => {
  // User must be authenticated
  if (!req.user) {
    return res.status(401).json({ error: "認証が必要です" });
  }

  // If no company in URL, no check needed
  if (!req.company) {
    return next();
  }

  // Get user's facility to determine their company
  const userFacility = req.user.facility;
  if (!userFacility) {
    return res.status(403).json({ error: "ユーザーの施設情報が見つかりません" });
  }

  // Check if user's company matches URL company
  if (userFacility.companyId === req.company.id) {
    return next();
  }

  // Access denied - user trying to access different company
  console.warn(`[PathSecurity] Company access denied: User company ${userFacility.companyId} attempting to access ${req.company.id}`);

  // Audit log: Cross-company access attempt
  AuditLogger.logAccessDenied(
    req,
    `User from company "${userFacility.companyId}" attempted to access company "${req.company.id}"`,
    {
      requestedCompanyId: req.company.id,
      requestedCompanyName: req.company.name
    }
  );

  return res.status(403).json({
    error: "この企業へのアクセス権限がありません"
  });
};

/**
 * Middleware to validate session consistency with URL path
 * Ensures user is not accessing facilities outside their session scope
 */
export const validateSessionPath = (req: AuthenticatedPathRequest, res: Response, next: NextFunction) => {
  // Skip validation for non-authenticated requests
  if (!req.user || !req.session.userId) {
    return next();
  }

  // If facility context exists, validate it matches accessible facilities
  if (req.facility && req.accessibleFacilities) {
    if (!req.accessibleFacilities.includes(req.facility.id)) {
      console.warn(`[PathSecurity] Session-path mismatch: Facility ${req.facility.id} not in accessible list`);
      return res.status(403).json({
        error: "セッションとパスの不整合が検出されました。再ログインしてください。"
      });
    }
  }

  next();
};
