import { useQuery } from "@tanstack/react-query";

interface CurrentUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: 'admin' | 'nurse' | 'manager' | 'corporate_admin';
  accessLevel: 'facility' | 'corporate';
  licenseNumber: string | null;
  phone: string | null;
  isActive: boolean;
  facilityId: string;
  facility?: {
    id: string;
    name: string;
    slug: string;
    isHeadquarters: boolean;
    companyId: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

interface CurrentUserResponse {
  user: CurrentUser;
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ["currentUser"],
    queryFn: async (): Promise<CurrentUser> => {
      const response = await fetch("/api/auth/me", {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Unauthorized");
        }
        throw new Error("Failed to fetch current user");
      }

      const data: CurrentUserResponse = await response.json();
      return data.user;
    },
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}