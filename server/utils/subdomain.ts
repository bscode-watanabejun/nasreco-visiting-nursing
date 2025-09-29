/**
 * Utility functions for handling subdomain-based routing
 */

/**
 * Generate facility URL based on subdomain
 */
export const generateFacilityUrl = (slug: string, baseDomain: string, protocol = 'https'): string => {
  if (process.env.NODE_ENV === 'development') {
    // In development, use port from environment or default
    const port = process.env.PORT || '5000';
    return `${protocol}://${slug}.localhost:${port}`;
  }

  return `${protocol}://${slug}.${baseDomain}`;
};

/**
 * Generate headquarters URL
 */
export const generateHeadquartersUrl = (baseDomain: string, protocol = 'https'): string => {
  if (process.env.NODE_ENV === 'development') {
    const port = process.env.PORT || '5000';
    return `${protocol}://headquarters.localhost:${port}`;
  }

  return `${protocol}://headquarters.${baseDomain}`;
};

/**
 * Extract subdomain from host
 */
export const extractSubdomain = (host: string): string | null => {
  const hostParts = host.split('.');

  if (process.env.NODE_ENV === 'development') {
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
      return null; // Handle via query param or header in development
    }
  }

  if (hostParts.length >= 3) {
    return hostParts[0];
  }

  return null;
};

/**
 * Validate facility slug format
 */
export const isValidSlug = (slug: string): boolean => {
  // Slug should be lowercase, alphanumeric with hyphens
  const slugRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  return slugRegex.test(slug) && slug.length >= 2 && slug.length <= 50;
};

/**
 * Generate slug from facility name
 */
export const generateSlugFromName = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
};

/**
 * Check if current request is from headquarters
 */
export const isHeadquartersRequest = (subdomain?: string): boolean => {
  return subdomain === 'headquarters';
};