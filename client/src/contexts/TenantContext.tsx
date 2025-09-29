import React, { createContext, useContext, useEffect, useState } from 'react';

// Types for tenant information
export interface Company {
  id: string;
  name: string;
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

      const subdomain = extractSubdomain();

      if (!subdomain) {
        // No subdomain - for Replit environment, default to headquarters for corporate admin users
        // This will be refined based on user role
        if (window.location.hostname.includes('replit.dev')) {
          const mockCompany: Company = {
            id: '1',
            name: 'NASRECO株式会社',
            domain: window.location.hostname,
          };

          const mockFacility: Facility = {
            id: 'hq-1',
            companyId: '1',
            name: '本社',
            slug: 'headquarters',
            isHeadquarters: true,
          };

          setTenantInfo({
            company: mockCompany,
            facility: mockFacility,
            subdomain: 'headquarters',
            isHeadquarters: true,
            isLoading: false,
          });
          return;
        }

        // No subdomain - might be main domain
        setTenantInfo({
          company: null,
          facility: null,
          subdomain: null,
          isHeadquarters: false,
          isLoading: false,
        });
        return;
      }

      // Fetch tenant information from server
      // In a real implementation, this would be an API call
      // For now, we'll simulate the data structure

      const isHeadquarters = subdomain === 'headquarters';

      // Mock data - replace with actual API call
      const mockCompany: Company = {
        id: '1',
        name: 'NASRECO株式会社',
        domain: window.location.hostname.split('.').slice(1).join('.'),
      };

      const mockFacility: Facility = {
        id: isHeadquarters ? 'hq-1' : `facility-${subdomain}`,
        companyId: '1',
        name: isHeadquarters ? '本社' : subdomain === 'tokyo-honin' ? '東京本院' : 'さくら訪問看護ステーション',
        slug: subdomain,
        isHeadquarters,
      };

      setTenantInfo({
        company: mockCompany,
        facility: mockFacility,
        subdomain,
        isHeadquarters,
        isLoading: false,
      });

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

  useEffect(() => {
    refreshTenantInfo();
  }, []);

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