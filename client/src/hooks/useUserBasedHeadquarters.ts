import { useCurrentUser } from "./useCurrentUser";
import { useTenant } from "@/contexts/TenantContext";

/**
 * Hook to determine if the user should see headquarters features
 * based on their role and access level, prioritizing the current URL context
 *
 * Key logic:
 * - If URL points to a specific facility (non-HQ), show facility menu even for corporate admins
 * - If URL points to HQ or no facility context, show HQ menu for corporate admins
 */
export function useUserBasedHeadquarters(): boolean {
  const { data: currentUser } = useCurrentUser();
  const { isHeadquarters: tenantIsHeadquarters, facility: tenantFacility } = useTenant();

  // Corporate admin users with corporate access level
  const isUserCorporateAdmin = currentUser?.role === 'corporate_admin' &&
                               currentUser?.accessLevel === 'corporate';

  // If user is assigned to a headquarters facility
  const isUserInHeadquartersFacility = currentUser?.facility?.isHeadquarters === true;

  // Check if current URL context points to a headquarters facility
  const isCurrentUrlHeadquarters = tenantFacility?.isHeadquarters === true;

  // If URL points to a non-HQ facility, always show facility menu (even for corporate admins)
  if (tenantFacility && !isCurrentUrlHeadquarters) {
    return false;
  }

  // Priority: Current URL context > User's facility assignment > Corporate admin role
  return isCurrentUrlHeadquarters || isUserInHeadquartersFacility || isUserCorporateAdmin;
}