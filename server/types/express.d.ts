import "express";

declare global {
  namespace Express {
    interface Request {
      // Tenant context (from path-tenant middleware)
      company?: any;
      facility?: any;
      isHeadquarters?: boolean;
      companySlug?: string;
      facilitySlug?: string;

      // User context (from auth middleware)
      user?: any;
      accessibleFacilities?: string[];
      isCorporateAdmin?: boolean;

      // Legacy subdomain support
      subdomain?: string;
    }
  }
}
