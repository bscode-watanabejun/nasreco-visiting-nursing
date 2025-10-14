import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";

/**
 * Middleware to extract and resolve subdomain to facility information
 * Supports both development (localhost) and production (custom domain) environments
 */
export const subdomainMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const host = req.get('Host');
    if (!host) {
      console.warn('Subdomain middleware: Missing Host header');
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

        // Log development mode usage
        if (subdomain) {
          console.log(`Development mode: Using subdomain "${subdomain}" for testing`);
        }
      } else if (host.includes('replit.dev')) {
        // Replit environment - handle dynamic subdomains
        // For Replit, use query parameter or header for subdomain override
        const requestedSubdomain = req.query.subdomain as string || req.get('X-Subdomain');
        if (requestedSubdomain) {
          subdomain = requestedSubdomain;
          console.log(`Replit mode: Using requested subdomain "${subdomain}"`);
        } else {
          // No specific subdomain requested - default to no subdomain (main domain)
          subdomain = undefined;
          console.log(`Replit mode: No subdomain specified, using main domain`);
        }

        // Extract the main replit domain (e.g., riker.replit.dev)
        const replitDomainMatch = host.match(/([^.]+\.replit\.dev)/);
        baseDomain = replitDomainMatch ? replitDomainMatch[1] : host;
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
        // Check if this is the main domain (visit.nasreco.com)
        // Treat 'visit' as the main domain, not a subdomain
        if (hostParts[0] === 'visit' && hostParts.slice(1).join('.') === 'nasreco.com') {
          subdomain = undefined;
          baseDomain = host;
          console.log(`Treating ${host} as main domain (not subdomain)`);
        } else {
          subdomain = hostParts[0];
          baseDomain = hostParts.slice(1).join('.');
        }
      } else if (hostParts.length === 2) {
        // Main domain without subdomain
        baseDomain = host;
      } else {
        console.warn(`Subdomain middleware: Invalid host format: ${host}`);
        return res.status(400).json({ error: 'Invalid host format' });
      }
    }

    // Store subdomain in request
    req.subdomain = subdomain;

    // Skip subdomain resolution for certain paths
    if (req.path.startsWith('/api/auth/') || req.path === '/api/health') {
      return next();
    }

    // If no subdomain, this might be the main domain
    if (!subdomain) {
      console.log(`No subdomain detected for host: ${host}`);

      // For Replit development, try to find a default facility (headquarters)
      if (process.env.NODE_ENV === 'development' && baseDomain.includes('replit.dev')) {
        try {
          const company = await storage.getCompanyByDomain(baseDomain);
          if (company) {
            const defaultFacility = await storage.getFacilityBySlug(company.id, 'headquarters');
            if (defaultFacility) {
              req.company = company;
              req.facility = defaultFacility;
              req.isHeadquarters = defaultFacility.isHeadquarters;
              console.log(`Using default facility: ${defaultFacility.name} for ${company.name}`);
              return next();
            }
          }
        } catch (error) {
          console.warn('Failed to find default facility:', error);
        }
      }

      console.log(`Allowing access without facility context`);
      return next();
    }

    // Find company by domain
    console.log(`Looking up company for domain: ${baseDomain}`);
    const company = await storage.getCompanyByDomain(baseDomain);
    if (!company) {
      console.warn(`Company not found for domain: ${baseDomain}`);
      return res.status(404).json({
        error: 'Company not found for domain',
        domain: baseDomain
      });
    }

    // Find facility by subdomain (slug)
    console.log(`Looking up facility for subdomain: ${subdomain} in company: ${company.name}`);
    const facility = await storage.getFacilityBySlug(company.id, subdomain);
    if (!facility) {
      console.warn(`Facility not found for subdomain: ${subdomain} in company: ${company.name}`);
      return res.status(404).json({
        error: 'Facility not found for subdomain',
        subdomain: subdomain,
        company: company.name
      });
    }

    // Store resolved information in request
    req.company = company;
    req.facility = facility;
    req.isHeadquarters = facility.isHeadquarters;

    console.log(`Successfully resolved: ${facility.name} (${subdomain}) in ${company.name}`);
    next();
  } catch (error) {
    console.error('Subdomain middleware error:', error);

    // More detailed error response in development
    if (process.env.NODE_ENV === 'development') {
      return res.status(500).json({
        error: 'Internal server error in subdomain resolution',
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
    } else {
      return res.status(500).json({ error: 'Internal server error in subdomain resolution' });
    }
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