import type { User, InsertUser, Company, Facility, InsertCompany, InsertFacility } from '@shared/schema';

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface CreateUserRequest {
  username: string;
  password: string;
  email: string;
  fullName: string;
  role: 'admin' | 'nurse' | 'manager' | 'corporate_admin';
  licenseNumber?: string;
  phone?: string;
  isActive?: boolean;
}

export interface UpdateUserRequest {
  username?: string;
  password?: string;
  email?: string;
  fullName?: string;
  role?: 'admin' | 'nurse' | 'manager' | 'corporate_admin';
  licenseNumber?: string;
  phone?: string;
  isActive?: boolean;
}

export interface CreateCompanyRequest {
  name: string;
  domain: string;
  address?: string;
  phone?: string;
  email?: string;
}

export interface CreateFacilityRequest {
  name: string;
  slug: string;
  isHeadquarters?: boolean;
  address?: string;
  phone?: string;
  email?: string;
}

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(response.status, errorData.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// User API functions
export const userApi = {
  // Get paginated list of users
  async getUsers(page = 1, limit = 20): Promise<PaginatedResponse<User>> {
    return fetchApi<PaginatedResponse<User>>(`/users?page=${page}&limit=${limit}`);
  },

  // Create new user
  async createUser(userData: CreateUserRequest): Promise<User> {
    return fetchApi<User>('/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },

  // Update user
  async updateUser(id: string, userData: UpdateUserRequest): Promise<User> {
    return fetchApi<User>(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(userData),
    });
  },

  // Delete user (if needed in the future)
  async deleteUser(id: string): Promise<void> {
    return fetchApi<void>(`/users/${id}`, {
      method: 'DELETE',
    });
  },

  // Deactivate user
  async deactivateUser(id: string): Promise<User> {
    return fetchApi<User>(`/users/${id}/deactivate`, {
      method: 'PATCH',
    });
  },

  // Activate user
  async activateUser(id: string): Promise<User> {
    return fetchApi<User>(`/users/${id}/activate`, {
      method: 'PATCH',
    });
  },

  // Reset user password
  async resetPassword(id: string): Promise<{ temporaryPassword: string }> {
    return fetchApi<{ temporaryPassword: string }>(`/users/${id}/reset-password`, {
      method: 'POST',
    });
  },
};

// Company API functions (Corporate Admin only)
export const companyApi = {
  // Get all companies
  async getCompanies(): Promise<Company[]> {
    return fetchApi<Company[]>('/companies');
  },

  // Create new company
  async createCompany(companyData: CreateCompanyRequest): Promise<Company> {
    return fetchApi<Company>('/companies', {
      method: 'POST',
      body: JSON.stringify(companyData),
    });
  },
};

// Facility API functions
export const facilityApi = {
  // Get facilities (hierarchical access)
  async getFacilities(): Promise<Facility[]> {
    return fetchApi<Facility[]>('/facilities');
  },

  // Create new facility (Corporate Admin only)
  async createFacility(facilityData: CreateFacilityRequest): Promise<Facility> {
    return fetchApi<Facility>('/facilities', {
      method: 'POST',
      body: JSON.stringify(facilityData),
    });
  },

  // Update facility
  async updateFacility(id: string, facilityData: Partial<CreateFacilityRequest>): Promise<Facility> {
    return fetchApi<Facility>(`/facilities/${id}`, {
      method: 'PUT',
      body: JSON.stringify(facilityData),
    });
  },

  // Deactivate facility (soft delete - Corporate Admin only)
  async deactivateFacility(id: string): Promise<{ facility: Facility; warnings?: string[] }> {
    return fetchApi<{ facility: Facility; warnings?: string[] }>(`/facilities/${id}/deactivate`, {
      method: 'PATCH',
    });
  },
};

// Tenant/Subdomain utility functions
export const tenantApi = {
  // Get current tenant info (for the current subdomain)
  async getCurrentTenant(): Promise<{ company: Company; facility: Facility }> {
    return fetchApi<{ company: Company; facility: Facility }>('/tenant/current');
  },

  // Validate subdomain
  async validateSubdomain(subdomain: string): Promise<{ valid: boolean; facility?: Facility }> {
    return fetchApi<{ valid: boolean; facility?: Facility }>(`/tenant/validate/${subdomain}`);
  },
};

// Auth API functions
export const authApi = {
  // Change password on first login
  async changePasswordFirstLogin(newPassword: string): Promise<{ success: boolean; message: string }> {
    return fetchApi<{ success: boolean; message: string }>('/auth/change-password-first-login', {
      method: 'POST',
      body: JSON.stringify({ newPassword }),
    });
  },
};

export { ApiError };