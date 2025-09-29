import { useCurrentUser } from "./useCurrentUser";
import { useTenant } from "@/contexts/TenantContext";

/**
 * Hook to determine if the user should see headquarters features
 * based on their role and access level, in addition to tenant context
 */
export function useUserBasedHeadquarters(): boolean {
  const { data: currentUser } = useCurrentUser();
  const { isHeadquarters: tenantIsHeadquarters } = useTenant();

  // Corporate admin users with corporate access level should see headquarters features
  const isUserCorporateAdmin = currentUser?.role === 'corporate_admin' &&
                               currentUser?.accessLevel === 'corporate';

  // Return true if either tenant context indicates headquarters OR user is corporate admin
  return tenantIsHeadquarters || isUserCorporateAdmin;
}