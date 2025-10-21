import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";

/**
 * Extended Request interface to include tenant context
 */
export interface PathTenantRequest extends Request {
  company?: any;
  facility?: any;
  isHeadquarters?: boolean;
  companySlug?: string;
  facilitySlug?: string;
}

/**
 * Middleware to extract and resolve company/facility from URL path
 * Supports path-based multi-tenancy: /tokai/mint-koshigaya/...
 *
 * URL Structure:
 * - /tokai                          → Company HQ (東海グループ本社)
 * - /tokai/mint-koshigaya           → Facility (ミントクリニック越谷)
 * - /tokai/mint-koshigaya/patients  → Facility page
 */
export const pathTenantMiddleware = async (req: PathTenantRequest, res: Response, next: NextFunction) => {
  try {
    const pathParts = req.path.split('/').filter(Boolean);

    // For API requests, try to extract tenant info from Referer header
    if (req.path.startsWith('/api/')) {
      console.log(`\n[PathTenant] ========== API REQUEST ==========`);
      console.log(`[PathTenant] API Path: ${req.path}`);

      // Skip auth endpoints
      if (pathParts[0] === 'api' && pathParts[1] === 'auth') {
        console.log(`[PathTenant] Skipping auth API: ${req.path}`);
        return next();
      }

      // Try to extract tenant info from Referer header
      const referer = req.get('Referer') || req.get('Origin');
      console.log(`[PathTenant] Referer header: ${referer}`);

      if (referer) {
        try {
          const refererUrl = new URL(referer);
          const refererPath = refererUrl.pathname;
          const refererParts = refererPath.split('/').filter(Boolean);

          console.log(`[PathTenant] Referer path: ${refererPath}`);
          console.log(`[PathTenant] Referer parts: ${JSON.stringify(refererParts)}`);

          // Check if referer has tenant info (e.g., /tokai/mint-koshigaya/patients)
          if (refererParts.length >= 2) {
            const potentialCompanySlug = refererParts[0];
            const potentialFacilitySlug = refererParts[1];

            console.log(`[PathTenant] Potential company slug: ${potentialCompanySlug}`);
            console.log(`[PathTenant] Potential facility slug: ${potentialFacilitySlug}`);

            // Validate this isn't a known page
            const knownPages = [
              'patients', 'users', 'records', 'schedules', 'dashboard',
              'settings', 'reports', 'login', 'facilities', 'headquarters',
              'medical-institutions', 'care-managers', 'buildings',
              'insurance-cards', 'statistics', 'care-plans', 'care-reports',
              'contracts', 'special-management', 'bonus-master', 'receipts'
            ];

            if (!knownPages.includes(potentialCompanySlug)) {
              console.log(`[PathTenant] Looking up company by slug: ${potentialCompanySlug}`);
              // This looks like a tenant path, resolve it
              const company = await storage.getCompanyBySlug(potentialCompanySlug);
              if (company) {
                req.company = company;
                req.companySlug = potentialCompanySlug;

                console.log(`[PathTenant] ✅ Resolved company from referer: ${company.name} (ID: ${company.id})`);

                // Try to resolve facility
                if (!knownPages.includes(potentialFacilitySlug)) {
                  console.log(`[PathTenant] Looking up facility by slug: ${potentialFacilitySlug} in company: ${company.id}`);
                  const facility = await storage.getFacilityBySlug(company.id, potentialFacilitySlug);
                  if (facility) {
                    req.facility = facility;
                    req.facilitySlug = potentialFacilitySlug;
                    req.isHeadquarters = facility.isHeadquarters;

                    console.log(`[PathTenant] ✅ Resolved facility from referer: ${facility.name} (ID: ${facility.id})`);
                  } else {
                    console.log(`[PathTenant] ❌ Facility not found for slug: ${potentialFacilitySlug}`);
                  }
                } else {
                  console.log(`[PathTenant] Skipping facility lookup - slug is a known page: ${potentialFacilitySlug}`);
                }
              } else {
                console.log(`[PathTenant] ❌ Company not found for slug: ${potentialCompanySlug}`);
              }
            } else {
              console.log(`[PathTenant] Skipping company lookup - slug is a known page: ${potentialCompanySlug}`);
            }
          } else {
            console.log(`[PathTenant] Not enough parts in referer path (need >= 2, got ${refererParts.length})`);
          }
        } catch (e) {
          console.log(`[PathTenant] Could not parse referer: ${referer}`, e);
        }
      } else {
        console.log(`[PathTenant] No Referer or Origin header found`);
      }

      console.log(`[PathTenant] Final state - company: ${req.company?.name || 'none'}, facility: ${req.facility?.name || 'none'}`);
      // Continue with request (tenant may or may not be resolved)
      return next();
    }

    // Skip tenant resolution for specific paths
    if (pathParts.length === 0 ||
        req.path.startsWith('/system-admin') ||  // System admin routes
        req.path.startsWith('/assets') ||
        req.path.startsWith('/uploads') ||
        req.path.startsWith('/@') ||           // Vite internals: /@vite, /@fs, /@react-refresh, etc.
        req.path.startsWith('/node_modules') ||
        req.path.startsWith('/src/')) {        // Vite source files
      console.log(`[PathTenant] Skipping tenant resolution for: ${req.path}`);
      return next();
    }

    // Extract company and facility slugs from path
    // Expected patterns:
    // /api/... → skip (handled by routes)
    // /:companySlug/api/... → company context
    // /:companySlug/:facilitySlug/api/... → facility context
    let companySlug: string | undefined;
    let facilitySlug: string | undefined;

    if (pathParts[0] === 'api') {
      // Direct API access without company context (auth endpoints)
      console.log(`[PathTenant] Skipping API path: ${req.path}`);
      return next();
    } else if (pathParts.length >= 1) {
      // Skip if first part starts with @ or is a known development path
      if (pathParts[0].startsWith('@') || pathParts[0] === 'src' || pathParts[0] === 'node_modules') {
        console.log(`[PathTenant] Skipping development path: ${req.path}`);
        return next();
      }

      // Check if first part is a known page (legacy routing)
      const knownPages = [
        'patients', 'users', 'records', 'schedules', 'dashboard',
        'settings', 'reports', 'login', 'facilities', 'headquarters',
        'medical-institutions', 'care-managers', 'buildings',
        'insurance-cards', 'statistics', 'care-plans', 'care-reports',
        'contracts', 'special-management', 'bonus-master', 'receipts',
        'system-admin'
      ];

      if (knownPages.includes(pathParts[0])) {
        // Legacy routing - skip tenant resolution
        console.log(`[PathTenant] Legacy page detected, skipping tenant resolution: ${req.path}`);
        return next();
      }

      // First part is company slug
      companySlug = pathParts[0];

      // Check if second part is facility slug or 'api'
      if (pathParts.length >= 2 && pathParts[1] !== 'api' && pathParts[1] !== 'dashboard') {
        facilitySlug = pathParts[1];
      }
    }

    // Store slugs in request for later use
    req.companySlug = companySlug;
    req.facilitySlug = facilitySlug;

    // Resolve company if slug provided
    if (companySlug) {
      console.log(`[PathTenant] Looking up company: ${companySlug}`);
      const company = await storage.getCompanyBySlug(companySlug);

      if (!company) {
        console.warn(`[PathTenant] Company not found for slug: ${companySlug}`);
        return res.status(404).json({
          error: '企業が見つかりません',
          companySlug: companySlug
        });
      }

      req.company = company;
      console.log(`[PathTenant] Company resolved: ${company.name} (${company.slug})`);

      // Resolve facility if slug provided
      if (facilitySlug) {
        console.log(`[PathTenant] Looking up facility: ${facilitySlug} in company: ${company.name}`);
        const facility = await storage.getFacilityBySlug(company.id, facilitySlug);

        if (!facility) {
          console.warn(`[PathTenant] Facility not found: ${facilitySlug} in company: ${company.name}`);
          return res.status(404).json({
            error: '施設が見つかりません',
            facilitySlug: facilitySlug,
            company: company.name
          });
        }

        req.facility = facility;
        req.isHeadquarters = facility.isHeadquarters;
        console.log(`[PathTenant] Facility resolved: ${facility.name} (${facility.slug}), isHeadquarters: ${facility.isHeadquarters}`);
      } else {
        // No facility slug - accessing company headquarters
        console.log(`[PathTenant] No facility slug, attempting to use headquarters for company: ${company.name}`);
        const hqFacility = await storage.getHeadquartersFacility(company.id);

        if (hqFacility) {
          req.facility = hqFacility;
          req.isHeadquarters = true;
          console.log(`[PathTenant] Using headquarters facility: ${hqFacility.name}`);
        } else {
          // No headquarters facility found - allow access without facility context
          console.log(`[PathTenant] No headquarters facility found for company: ${company.name}`);
          req.isHeadquarters = true;
        }
      }
    }

    next();
  } catch (error) {
    console.error('[PathTenant] Error in path tenant middleware:', error);

    if (process.env.NODE_ENV === 'development') {
      return res.status(500).json({
        error: 'パステナント解決エラー',
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
    } else {
      return res.status(500).json({ error: 'パステナント解決エラー' });
    }
  }
};

/**
 * Middleware to require a valid company context
 */
export const requireCompany = (req: PathTenantRequest, res: Response, next: NextFunction) => {
  if (!req.company) {
    return res.status(400).json({ error: '有効な企業コンテキストが必要です' });
  }
  next();
};

/**
 * Middleware to require a valid facility context
 */
export const requireFacility = (req: PathTenantRequest, res: Response, next: NextFunction) => {
  if (!req.facility) {
    return res.status(400).json({ error: '有効な施設コンテキストが必要です' });
  }
  next();
};

/**
 * Middleware to require headquarters access
 */
export const requireHeadquarters = (req: PathTenantRequest, res: Response, next: NextFunction) => {
  if (!req.isHeadquarters) {
    return res.status(403).json({ error: '本社アクセス権限が必要です' });
  }
  next();
};
