import { useCurrentUser } from "./useCurrentUser";
import { useTenant } from "@/contexts/TenantContext";

/**
 * Hook to determine if the user should see headquarters features
 * based on their role and access level, prioritizing user's actual facility
 */
export function useUserBasedHeadquarters(): boolean {
  const { data: currentUser } = useCurrentUser();
  const { isHeadquarters: tenantIsHeadquarters } = useTenant();

  // Corporate admin users with corporate access level should see headquarters features
  const isUserCorporateAdmin = currentUser?.role === 'corporate_admin' &&
                               currentUser?.accessLevel === 'corporate';

  // If user is assigned to a headquarters facility, they should see headquarters features
  const isUserInHeadquartersFacility = currentUser?.facility?.isHeadquarters === true;

  // Priority: User's facility assignment > Corporate admin role > Tenant context
  return isUserInHeadquartersFacility || isUserCorporateAdmin || tenantIsHeadquarters;
}