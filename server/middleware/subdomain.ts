import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";

// Extend Express Request to include subdomain and tenant info
declare module "express-serve-static-core" {
  interface Request {
    subdomain?: string;
    company?: any;
    facility?: any;
    isHeadquarters?: boolean;
  }
}

/**
 * Middleware to extract and resolve subdomain to facility information
 * Supports both development (localhost) and production (custom domain) environments
 */
export const subdomainMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const host = req.get('Host');
    if (!host) {
      return res.status(400).json({ error: 'Missing Host header' });
    }

    // Extract subdomain and domain
    const hostParts = host.split('.');
    let subdomain: string | undefined;
    let baseDomain: string;

    if (process.env.NODE_ENV === 'development') {
      // Development environment (localhost:port)
      if (host.includes('localhost') || host.includes('127.0.0.1')) {
        // For development, we can use a query parameter or header for testing
        subdomain = req.query.subdomain as string || req.get('X-Subdomain');
        baseDomain = 'localhost';
      } else {
        // Still handle subdomain format in development
        if (hostParts.length >= 3) {
          subdomain = hostParts[0];
          baseDomain = hostParts.slice(1).join('.');
        } else {
          baseDomain = host;
        }
      }
    } else {
      // Production environment
      if (hostParts.length >= 3) {
        subdomain = hostParts[0];
        baseDomain = hostParts.slice(1).join('.');
      } else if (hostParts.length === 2) {
        // Main domain without subdomain
        baseDomain = host;
      } else {
        return res.status(400).json({ error: 'Invalid host format' });
      }
    }

    // Store subdomain in request
    req.subdomain = subdomain;

    // Skip subdomain resolution for certain paths
    if (req.path.startsWith('/api/auth/') || req.path === '/api/health') {
      return next();
    }

    // If no subdomain, this might be the main domain - allow it for now
    if (!subdomain) {
      return next();
    }

    // Find company by domain
    const company = await storage.getCompanyByDomain(baseDomain);
    if (!company) {
      return res.status(404).json({ error: 'Company not found for domain' });
    }

    // Find facility by subdomain (slug)
    const facility = await storage.getFacilityBySlug(company.id, subdomain);
    if (!facility) {
      return res.status(404).json({ error: 'Facility not found for subdomain' });
    }

    // Store resolved information in request
    req.company = company;
    req.facility = facility;
    req.isHeadquarters = facility.isHeadquarters;

    next();
  } catch (error) {
    console.error('Subdomain middleware error:', error);
    res.status(500).json({ error: 'Internal server error in subdomain resolution' });
  }
};

/**
 * Middleware to require a valid facility context
 */
export const requireFacility = (req: Request, res: Response, next: NextFunction) => {
  if (!req.facility) {
    return res.status(400).json({ error: 'Valid facility context required' });
  }
  next();
};

/**
 * Middleware to require headquarters access
 */
export const requireHeadquarters = (req: Request, res: Response, next: NextFunction) => {
  if (!req.isHeadquarters) {
    return res.status(403).json({ error: 'Headquarters access required' });
  }
  next();
};