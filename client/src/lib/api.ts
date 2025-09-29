import type { User, InsertUser } from '@shared/schema';

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
};

export { ApiError };