import { useLocation } from "wouter";

/**
 * Extract company and facility slugs from current URL path
 * 
 * URL patterns:
 * - /tokai/mint-koshigaya/patients → { companySlug: "tokai", facilitySlug: "mint-koshigaya", basePath: "/tokai/mint-koshigaya" }
 * - /tokai/dashboard → { companySlug: "tokai", facilitySlug: null, basePath: "/tokai" }
 * - /patients (legacy) → { companySlug: null, facilitySlug: null, basePath: "" }
 */
export function usePathContext() {
  const [location] = useLocation();
  
  const pathParts = location.split('/').filter(Boolean);
  
  // Check if first part looks like a company slug (not 'patients', 'users', etc.)
  const knownPages = ['patients', 'users', 'records', 'schedules', 'dashboard', 'settings', 'reports'];
  
  let companySlug: string | null = null;
  let facilitySlug: string | null = null;
  
  if (pathParts.length > 0 && !knownPages.includes(pathParts[0])) {
    // First part is company slug
    companySlug = pathParts[0];
    
    // Check if second part is facility slug
    if (pathParts.length > 1 && !knownPages.includes(pathParts[1])) {
      facilitySlug = pathParts[1];
    }
  }
  
  const basePath = companySlug
    ? (facilitySlug ? `/${companySlug}/${facilitySlug}` : `/${companySlug}`)
    : '';
  
  return {
    companySlug,
    facilitySlug,
    basePath,
    isPathBased: companySlug !== null,
  };
}

/**
 * Get base path for navigation links
 * Returns empty string for legacy routes, or "/:companySlug/:facilitySlug" for path-based routes
 */
export function useBasePath(): string {
  const { basePath } = usePathContext();
  return basePath;
}

/**
 * Get API base path for fetch requests
 * Returns "/api" for legacy, or "/:companySlug/:facilitySlug/api" for path-based
 */
export function useApiBasePath(): string {
  const { basePath } = usePathContext();
  return basePath ? `${basePath}/api` : '/api';
}

/**
 * Create a navigation path with proper tenant context
 * 
 * @param page - Page path (e.g., "/patients", "/users")
 * @returns Full path with tenant context (e.g., "/tokai/mint-koshigaya/patients")
 */
export function useNavPath(page: string): string {
  const basePath = useBasePath();
  
  // Remove leading slash from page if present
  const cleanPage = page.startsWith('/') ? page.substring(1) : page;
  
  return basePath ? `${basePath}/${cleanPage}` : `/${cleanPage}`;
}
