import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { Express } from "express";

/**
 * Helper to register routes that work both with and without path-based tenancy
 * 
 * Registers two routes:
 * 1. Legacy route: /api/... (for backward compatibility)
 * 2. Path-based route: /:companySlug/:facilitySlug/api/... (new pattern)
 * 
 * @param app Express app
 * @param method HTTP method
 * @param path API path (e.g., "/api/patients")
 * @param middlewares Middleware chain including route handler
 */
export function registerDualRoute(
  app: Express,
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
  path: string,
  ...middlewares: RequestHandler[]
) {
  // Register legacy route (no tenant path)
  app[method](path, ...middlewares);
  
  // Register path-based tenant route
  // /:companySlug/:facilitySlug/api/... or /:companySlug/api/... for headquarters
  if (path.startsWith('/api/')) {
    const apiPath = path.substring(4); // Remove "/api" prefix
    
    // Facility-level route
    app[method](`/:companySlug/:facilitySlug/api${apiPath}`, ...middlewares);
    
    // Company-level route (headquarters)
    app[method](`/:companySlug/api${apiPath}`, ...middlewares);
  }
}

/**
 * Get base path for current request (for redirects, etc.)
 */
export function getBasePath(req: Request): string {
  if (req.companySlug) {
    if (req.facilitySlug) {
      return `/${req.companySlug}/${req.facilitySlug}`;
    }
    return `/${req.companySlug}`;
  }
  return '';
}

/**
 * Get API base path for current request
 */
export function getApiBasePath(req: Request): string {
  const basePath = getBasePath(req);
  return basePath ? `${basePath}/api` : '/api';
}
