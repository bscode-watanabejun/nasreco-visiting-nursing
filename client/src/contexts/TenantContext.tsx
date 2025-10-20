import React, { createContext, useContext, useEffect, useState } from 'react';
import { useLocation } from 'wouter';

// Types for tenant information
export interface Company {
  id: string;
  name: string;
  slug: string;
  domain: string;
}

export interface Facility {
  id: string;
  companyId: string;
  name: string;
  slug: string;
  isHeadquarters: boolean;
}

export interface TenantInfo {
  company: Company | null;
  facility: Facility | null;
  subdomain: string | null;
  isHeadquarters: boolean;
  isLoading: boolean;
}

interface TenantContextType extends TenantInfo {
  refreshTenantInfo: () => Promise<void>;
  generateFacilityUrl: (slug: string) => string;
  generateHeadquartersUrl: () => string;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

// Helper functions
const extractSubdomain = (): string | null => {
  if (typeof window === 'undefined') return null;

  const hostname = window.location.hostname;

  // Development environment
  if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
    // Check for subdomain in development (e.g., headquarters.localhost:5000)
    const parts = hostname.split('.');
    if (parts.length >= 2 && parts[0] !== 'localhost') {
      return parts[0];
    }
    // Fallback: check URL params or session storage for development
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('subdomain') || sessionStorage.getItem('dev_subdomain');
  }

  // Replit environment - handle dynamic subdomains
  if (hostname.includes('replit.dev')) {
    // For Replit, check URL params first
    const urlParams = new URLSearchParams(window.location.search);
    const requestedSubdomain = urlParams.get('subdomain');
    if (requestedSubdomain) {
      return requestedSubdomain;
    }

    // If no subdomain specified, return null (will be handled by user role-based detection)
    return null;
  }

  // Production environment
  const parts = hostname.split('.');
  return parts.length >= 3 ? parts[0] : null;
};

const generateUrl = (subdomain: string): string => {
  if (typeof window === 'undefined') return '';

  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  const port = window.location.port;

  if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
    // Development
    const portString = port ? `:${port}` : '';
    return `${protocol}//${subdomain}.localhost${portString}`;
  }

  // Production
  const domain = hostname.split('.').slice(1).join('.');
  return `${protocol}//${subdomain}.${domain}`;
};

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [location] = useLocation(); // Track current location
  const [tenantInfo, setTenantInfo] = useState<TenantInfo>({
    company: null,
    facility: null,
    subdomain: null,
    isHeadquarters: false,
    isLoading: true,
  });

  const refreshTenantInfo = async (): Promise<void> => {
    try {
      setTenantInfo(prev => ({ ...prev, isLoading: true }));

      // Path-based multi-tenancy: Extract company and facility from URL path
      // URL format: /companySlug/facilitySlug/...
      const pathParts = window.location.pathname.split('/').filter(Boolean);

      const knownPages = [
        'dashboard', 'patients', 'records', 'schedule', 'users', 'facilities',
        'medical-institutions', 'care-managers', 'buildings', 'insurance-cards',
        'statistics', 'care-plans', 'care-reports', 'contracts', 'special-management-settings',
        'bonus-masters', 'monthly-receipts', 'schedules-without-records', 'reports', 'attendance', 'settings'
      ];

      let companySlug: string | null = null;
      let facilitySlug: string | null = null;

      if (pathParts.length > 0 && !knownPages.includes(pathParts[0])) {
        companySlug = pathParts[0]; // e.g., "kansai"
        if (pathParts.length > 1 && !knownPages.includes(pathParts[1])) {
          facilitySlug = pathParts[1]; // e.g., "kobe-care"
        }
      }

      // If no path-based tenant info, use subdomain fallback (for backward compatibility)
      if (!companySlug && !facilitySlug) {
        const subdomain = extractSubdomain();
        if (subdomain) {
          facilitySlug = subdomain;
        }
      }

      if (!companySlug && !facilitySlug) {
        // No tenant context - let user role-based detection handle the facility assignment
        setTenantInfo({
          company: null,
          facility: null,
          subdomain: null,
          isHeadquarters: false,
          isLoading: false,
        });
        return;
      }

      // Fetch tenant information from server API
      // This should match the actual facility from the database
      try {
        console.log('[TenantContext] Fetching tenant info:', { companySlug, facilitySlug });
        const response = await fetch(`/api/tenant-info?companySlug=${companySlug || ''}&facilitySlug=${facilitySlug || ''}`);

        if (response.ok) {
          const data = await response.json();
          console.log('[TenantContext] Tenant info loaded:', data);
          setTenantInfo({
            company: data.company || null,
            facility: data.facility || null,
            subdomain: facilitySlug,
            isHeadquarters: data.facility?.isHeadquarters || false,
            isLoading: false,
          });
        } else {
          console.warn('[TenantContext] Failed to fetch tenant info, status:', response.status);
          // Fallback: No tenant info available
          setTenantInfo({
            company: null,
            facility: null,
            subdomain: facilitySlug,
            isHeadquarters: false,
            isLoading: false,
          });
        }
      } catch (apiError) {
        console.warn('[TenantContext] Failed to fetch tenant info from API, using fallback:', apiError);
        // Fallback: No tenant info available
        setTenantInfo({
          company: null,
          facility: null,
          subdomain: facilitySlug,
          isHeadquarters: false,
          isLoading: false,
        });
      }

    } catch (error) {
      console.error('Failed to load tenant information:', error);
      setTenantInfo(prev => ({ ...prev, isLoading: false }));
    }
  };

  const generateFacilityUrl = (slug: string): string => {
    return generateUrl(slug);
  };

  const generateHeadquartersUrl = (): string => {
    return generateUrl('headquarters');
  };

  // Refresh tenant info whenever the location (URL path) changes
  useEffect(() => {
    console.log('[TenantContext] Location changed to:', location);
    refreshTenantInfo();
  }, [location]); // Re-run when location changes

  // Listen for subdomain changes (e.g., during development)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'dev_subdomain') {
        refreshTenantInfo();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return (
    <TenantContext.Provider
      value={{
        ...tenantInfo,
        refreshTenantInfo,
        generateFacilityUrl,
        generateHeadquartersUrl,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = (): TenantContextType => {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
};

// Helper hooks
export const useIsHeadquarters = (): boolean => {
  const { isHeadquarters } = useTenant();
  return isHeadquarters;
};

export const useCurrentFacility = (): Facility | null => {
  const { facility } = useTenant();
  return facility;
};

export const useCurrentCompany = (): Company | null => {
  const { company } = useTenant();
  return company;
};