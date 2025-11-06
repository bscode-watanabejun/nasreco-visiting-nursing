import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useState, useEffect } from "react";
import { TenantProvider, useTenant, useIsHeadquarters } from "@/contexts/TenantContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useUserBasedHeadquarters } from "@/hooks/useUserBasedHeadquarters";
import { usePathContext } from "@/hooks/useBasePath";

// Import all main components
import { Dashboard } from "@/components/Dashboard";
import { PatientManagement } from "@/components/PatientManagement";
import { PatientDetail } from "@/components/PatientDetail";
import { NursingRecords } from "@/components/NursingRecords";
import { UserManagement } from "@/components/UserManagement";
import { ScheduleManagement } from "@/components/ScheduleManagement";
import { LoginForm } from "@/components/LoginForm";
import { Navbar } from "@/components/Navbar";
import { AppSidebar } from "@/components/Sidebar";
import { HeadquartersDashboard } from "@/components/HeadquartersDashboard";
import { FacilityManagement } from "@/components/FacilityManagement";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import MedicalInstitutionManagement from "@/components/MedicalInstitutionManagement";
import CareManagerManagement from "@/components/CareManagerManagement";
import BuildingManagement from "@/components/BuildingManagement";
import InsuranceCardManagement from "@/components/InsuranceCardManagement";
import MonthlyStatistics from "@/components/MonthlyStatistics";
import CarePlanManagement from "@/components/CarePlanManagement";
import CareReportManagement from "@/components/CareReportManagement";
import ContractManagement from "@/components/ContractManagement";
import SpecialManagementSettings from "@/components/SpecialManagementSettings";
import BonusMasterManagement from "@/components/BonusMasterManagement";
import MonthlyReceiptsManagement from "@/components/MonthlyReceiptsManagement";
import MonthlyReceiptDetail from "@/components/MonthlyReceiptDetail";
import { MasterDataManagement } from "@/components/MasterDataManagement";
import SchedulesWithoutRecords from "@/pages/schedules-without-records";
import NotFound from "@/pages/not-found";
import ComingSoon from "@/components/ComingSoon";
import { AccessDeniedPage } from "@/components/AccessDeniedPage";
import { CompanyManagement } from "@/components/CompanyManagement";

// Theme provider for dark/light mode
function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  return (
    <div className={theme}>
      {children}
    </div>
  );
}

function MainLayout() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginError, setLoginError] = useState<string | undefined>(undefined);
  const [requirePasswordChange, setRequirePasswordChange] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const { facility, company, isLoading: tenantLoading } = useTenant();
  const isHeadquarters = useIsHeadquarters();
  const isUserBasedHeadquarters = useUserBasedHeadquarters();
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();
  const { basePath, companySlug, facilitySlug } = usePathContext();

  // Get current user information
  const { data: currentUser, isLoading: userLoading, error: userError } = useCurrentUser();

  // Use user-based headquarters detection as the primary indicator
  // Only evaluate after user data is loaded
  const shouldShowHeadquartersFeatures = currentUser ? (isUserBasedHeadquarters || isHeadquarters) : false;

  // Get current facility name - prioritize URL context (tenant) over user's assigned facility
  const currentFacility = facility?.name || currentUser?.facility?.name || 'ステーション';

  // Tenant access validation: Check if user has access to the current URL's facility
  const hasTenantAccess = () => {
    if (!currentUser || !currentUser.facility) return true; // Let authentication handle this

    // System admins have access to all routes
    if (currentUser.role === 'system_admin') {
      return true;
    }

    // Check if user is a corporate admin (based on actual user role, not UI context)
    const isUserCorporateAdmin = currentUser.role === 'corporate_admin' &&
                                  currentUser.accessLevel === 'corporate';

    // Corporate admins can access all facilities in their company
    if (isUserCorporateAdmin) {
      // If URL has company slug, check if it matches user's company
      if (companySlug && currentUser.facility.company) {
        return companySlug === currentUser.facility.company.slug;
      }
      return true; // Allow access to routes without specific company slug
    }

    // Regular users can only access their own facility
    if (facilitySlug && companySlug) {
      const userFacilitySlug = currentUser.facility.slug;
      const userCompanySlug = currentUser.facility.company?.slug;

      // Check if URL facility matches user's facility
      return facilitySlug === userFacilitySlug && companySlug === userCompanySlug;
    }

    // If no facility in URL, allow (will be redirected by useEffect below)
    return true;
  };

  const handleReturnToMyFacility = () => {
    if (currentUser?.facility?.company) {
      const userCompanySlug = currentUser.facility.company.slug;
      const userFacilitySlug = currentUser.facility.slug;
      const redirectPath = `/${userCompanySlug}/${userFacilitySlug}`;
      console.log('[App] Returning to user facility:', redirectPath);
      window.location.pathname = redirectPath;
    } else {
      window.location.pathname = '/';
    }
  };

  // Set authentication state based on user data
  useEffect(() => {
    if (currentUser) {
      setIsAuthenticated(true);

      // System Admin redirect: only allow /system-admin/* routes
      if (currentUser.role === 'system_admin') {
        const currentPath = window.location.pathname;

        // If not already on system-admin route, redirect
        if (!currentPath.startsWith('/system-admin')) {
          console.log(`[App] Redirecting system admin to /system-admin/companies`);
          setIsRedirecting(true);
          window.location.replace('/system-admin/companies');
          return;
        }

        // System admin is on correct route, continue
        return;
      }

      // Redirect regular users from legacy routes to path-based routes
      const currentPath = window.location.pathname;
      const pathParts = currentPath.split('/').filter(Boolean);

      // Extract slugs from current path
      const knownPages = [
        'dashboard', 'patients', 'records', 'schedule', 'users', 'facilities',
        'medical-institutions', 'care-managers', 'buildings', 'insurance-cards',
        'statistics', 'care-plans', 'care-reports', 'contracts', 'special-management-settings',
        'bonus-masters', 'monthly-receipts', 'schedules-without-records', 'reports', 'attendance', 'settings'
      ];

      let currentCompanySlug = null;
      let currentFacilitySlug = null;

      if (pathParts.length > 0 && !knownPages.includes(pathParts[0])) {
        currentCompanySlug = pathParts[0];
        if (pathParts.length > 1 && !knownPages.includes(pathParts[1])) {
          currentFacilitySlug = pathParts[1];
        }
      }

      // If user is on legacy route (no tenant context in URL), redirect to path-based URL
      if (!currentCompanySlug && !currentFacilitySlug && currentUser.facility) {
        const userFacility = currentUser.facility;

        // All users (including corporate admins) MUST use path-based URLs
        const facilitySlug = userFacility.slug;
        const companySlug = userFacility.company?.slug;

        if (companySlug && facilitySlug) {
          const targetPath = `/${companySlug}/${facilitySlug}${currentPath === '/' ? '' : currentPath}`;
          console.log(`[App] Redirecting user from legacy route ${currentPath} to ${targetPath}`);

          // Set redirecting state to show loading screen
          setIsRedirecting(true);

          // Use replace instead of assign to avoid adding to browser history
          window.location.replace(targetPath);
          return;
        }
      }
    } else if (userError && !userLoading) {
      setIsAuthenticated(false);
    }
  }, [currentUser, userError, userLoading]);

  // Get user role display string
  const getUserRoleDisplay = (user: any) => {
    if (user?.role === 'system_admin') {
      return 'システム管理者';
    }
    if (user?.role === 'corporate_admin' && user?.accessLevel === 'corporate') {
      return '企業管理者';
    }
    switch (user?.role) {
      case 'admin':
        return '管理者';
      case 'nurse':
        return '看護師';
      case 'manager':
        return 'マネージャー';
      default:
        return '一般ユーザー';
    }
  };

  const handleLogin = async (email: string, password: string) => {
    try {
      console.log('ログイン試行 for user:', email);
      setLoginError(undefined); // Clear previous errors

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: email, password }),
      });

      if (response.ok) {
        const data = await response.json();

        // Check if password change is required
        if (data.requirePasswordChange) {
          setRequirePasswordChange(true);
        }

        // Invalidate user query to refetch user data after login
        // The useEffect hook will handle the redirect based on currentUser update
        await queryClient.invalidateQueries({ queryKey: ["currentUser"] });

        setLoginError(undefined); // Clear error on success
        console.log('ログイン成功:', data);
      } else {
        const errorData = await response.json();
        console.error('ログイン失敗:', errorData);
        setLoginError(errorData.error || 'ログインに失敗しました');
      }
    } catch (error) {
      console.error('ログインエラー:', error);
      setLoginError('ネットワークエラーが発生しました');
    }
  };

  const handlePasswordChangeSuccess = () => {
    setRequirePasswordChange(false);
    // Refetch user data to update mustChangePassword flag
    queryClient.invalidateQueries({ queryKey: ["currentUser"] });
  };

  const handleForgotPassword = () => {
    console.log('パスワードリセット要求');
    // TODO: Implement password reset
  };

  const handleFacilityChange = (facility: string) => {
    console.log('施設変更:', facility);
    // TODO: Implement facility switching functionality
  };

  const handleLogout = async () => {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        // Clear user query cache and reset authentication
        queryClient.setQueryData(["currentUser"], null);
        queryClient.removeQueries({ queryKey: ["currentUser"] });
        setIsAuthenticated(false);
        console.log('ログアウト成功');
      } else {
        console.error('ログアウトに失敗しました');
      }
    } catch (error) {
      console.error('ログアウトエラー:', error);
    }
  };

  // Show loading while tenant info or user info is being loaded, or while redirecting
  if (tenantLoading || (userLoading && !userError) || isRedirecting) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">
            {isRedirecting ? '施設に移動しています...' : 'システムを読み込んでいます...'}
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <LoginForm
          onLogin={handleLogin}
          onForgotPassword={handleForgotPassword}
          loading={false}
          error={loginError}
        />
      </div>
    );
  }

  // Show password change dialog if required
  if (requirePasswordChange) {
    return (
      <div className="min-h-screen bg-background">
        <ChangePasswordDialog
          open={requirePasswordChange}
          onSuccess={handlePasswordChangeSuccess}
        />
      </div>
    );
  }

  // Tenant access validation: Show dedicated 403 page if user doesn't have access
  if (isAuthenticated && currentUser && !hasTenantAccess()) {
    const requestedFacilityName = facility?.name;
    const userFacilityName = currentUser.facility?.name;

    return (
      <AccessDeniedPage
        message="この施設へのアクセス権限がありません"
        userFacility={userFacilityName}
        requestedFacility={requestedFacilityName}
        onReturnToMyFacility={handleReturnToMyFacility}
      />
    );
  }

  const style = {
    "--sidebar-width": "20rem",
    "--sidebar-width-icon": "4rem",
  };

  // System Admin layout (always show sidebar)
  if (currentUser?.role === 'system_admin') {
    return (
      <SidebarProvider style={style as React.CSSProperties}>
        <div className="flex h-screen w-full overflow-x-hidden">
          <AppSidebar />
          <div className="flex flex-col flex-1 min-w-0 overflow-x-hidden">
            <header className="border-b bg-background">
              <div className="flex items-center justify-between px-4 py-3">
                <SidebarTrigger />
                <h1 className="text-lg font-semibold">システム管理</h1>
                <Navbar
                  currentFacility="システム管理"
                  onFacilityChange={handleFacilityChange}
                  userName={currentUser?.fullName || 'ユーザー'}
                  userRole={getUserRoleDisplay(currentUser)}
                  onLogout={handleLogout}
                />
              </div>
            </header>
            <main className="flex-1 overflow-y-auto overflow-x-hidden">
              <Switch>
                <Route path="/system-admin/companies" component={CompanyManagement} />
                <Route path="/system-admin/master-data" component={MasterDataManagement} />
                <Route component={CompanyManagement} />
              </Switch>
            </main>
          </div>
        </div>
      </SidebarProvider>
    );
  }

  // Regular user layout (with sidebar)
  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full overflow-x-hidden">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0 overflow-x-hidden">
          <header className="border-b bg-background">
            <div className="flex items-center">
              <SidebarTrigger data-testid="button-sidebar-toggle" className="ml-2" />
              <Navbar
                currentFacility={currentFacility}
                onFacilityChange={handleFacilityChange}
                userName={currentUser?.fullName || 'ユーザー'}
                userRole={getUserRoleDisplay(currentUser)}
                onLogout={handleLogout}
              />
            </div>
          </header>
          <main className="flex-1 overflow-y-auto overflow-x-hidden">
            <Switch>
              {/* System Admin routes should not reach here */}
              <Route path="/system-admin/companies" component={CompanyManagement} />

              {/* Path-based multi-tenant routes: /:companySlug/:facilitySlug/* */}
              <Route path="/:companySlug/:facilitySlug/dashboard" component={shouldShowHeadquartersFeatures ? HeadquartersDashboard : Dashboard} />
              <Route path="/:companySlug/:facilitySlug/facilities" component={FacilityManagement} />
              <Route path="/:companySlug/:facilitySlug/patients/:id" component={PatientDetail} />
              <Route path="/:companySlug/:facilitySlug/patients" component={PatientManagement} />
              <Route path="/:companySlug/:facilitySlug/records" component={NursingRecords} />
              <Route path="/:companySlug/:facilitySlug/schedule" component={ScheduleManagement} />
              <Route path="/:companySlug/:facilitySlug/users" component={UserManagement} />
              <Route path="/:companySlug/:facilitySlug/medical-institutions" component={MedicalInstitutionManagement} />
              <Route path="/:companySlug/:facilitySlug/care-managers" component={CareManagerManagement} />
              <Route path="/:companySlug/:facilitySlug/buildings" component={BuildingManagement} />
              <Route path="/:companySlug/:facilitySlug/insurance-cards" component={InsuranceCardManagement} />
              <Route path="/:companySlug/:facilitySlug/statistics/monthly" component={MonthlyStatistics} />
              <Route path="/:companySlug/:facilitySlug/care-plans" component={CarePlanManagement} />
              <Route path="/:companySlug/:facilitySlug/care-reports" component={CareReportManagement} />
              <Route path="/:companySlug/:facilitySlug/contracts" component={ContractManagement} />
              <Route path="/:companySlug/:facilitySlug/special-management-settings" component={SpecialManagementSettings} />
              <Route path="/:companySlug/:facilitySlug/bonus-masters" component={BonusMasterManagement} />
              <Route path="/:companySlug/:facilitySlug/monthly-receipts/:id" component={MonthlyReceiptDetail} />
              <Route path="/:companySlug/:facilitySlug/monthly-receipts" component={MonthlyReceiptsManagement} />
              <Route path="/:companySlug/:facilitySlug/master-data" component={MasterDataManagement} />
              <Route path="/:companySlug/:facilitySlug/schedules-without-records" component={SchedulesWithoutRecords} />
              <Route path="/:companySlug/:facilitySlug/reports">
                {() => <ComingSoon featureName={shouldShowHeadquartersFeatures ? "統合レポート機能" : "レポート機能"} />}
              </Route>
              <Route path="/:companySlug/:facilitySlug/attendance">
                {() => <ComingSoon featureName="出勤管理機能" />}
              </Route>
              <Route path="/:companySlug/:facilitySlug/settings">
                {() => <ComingSoon featureName={shouldShowHeadquartersFeatures ? "システム設定機能" : "設定機能"} />}
              </Route>
              <Route path="/:companySlug/:facilitySlug" component={shouldShowHeadquartersFeatures ? HeadquartersDashboard : Dashboard} />

              {/* Company-level routes (headquarters only): /:companySlug/* */}
              <Route path="/:companySlug/dashboard" component={HeadquartersDashboard} />
              <Route path="/:companySlug/facilities" component={FacilityManagement} />
              <Route path="/:companySlug" component={HeadquartersDashboard} />

              {/* Legacy routes (for backward compatibility) */}
              {shouldShowHeadquartersFeatures ? (
                <>
                  <Route path="/" component={HeadquartersDashboard} />
                  <Route path="/dashboard" component={HeadquartersDashboard} />
                  <Route path="/facilities" component={FacilityManagement} />
                  <Route path="/patients/:id" component={PatientDetail} />
                  <Route path="/patients" component={PatientManagement} />
                  <Route path="/records" component={NursingRecords} />
                  <Route path="/schedule" component={ScheduleManagement} />
                  <Route path="/users" component={UserManagement} />
                  <Route path="/medical-institutions" component={MedicalInstitutionManagement} />
                  <Route path="/care-managers" component={CareManagerManagement} />
                  <Route path="/buildings" component={BuildingManagement} />
                  <Route path="/insurance-cards" component={InsuranceCardManagement} />
                  <Route path="/statistics/monthly" component={MonthlyStatistics} />
                  <Route path="/care-plans" component={CarePlanManagement} />
                  <Route path="/care-reports" component={CareReportManagement} />
                  <Route path="/contracts" component={ContractManagement} />
                  <Route path="/special-management-settings" component={SpecialManagementSettings} />
                  <Route path="/bonus-masters" component={BonusMasterManagement} />
                  <Route path="/monthly-receipts" component={MonthlyReceiptsManagement} />
                  <Route path="/monthly-receipts/:id" component={MonthlyReceiptDetail} />
                  <Route path="/master-data" component={MasterDataManagement} />
                  <Route path="/schedules-without-records" component={SchedulesWithoutRecords} />
                  <Route path="/reports">
                    {() => <ComingSoon featureName="統合レポート機能" />}
                  </Route>
                  <Route path="/settings">
                    {() => <ComingSoon featureName="システム設定機能" />}
                  </Route>
                </>
              ) : (
                /* Facility-specific routes */
                <>
                  <Route path="/" component={Dashboard} />
                  <Route path="/dashboard" component={Dashboard} />
                  <Route path="/patients/:id" component={PatientDetail} />
                  <Route path="/patients" component={PatientManagement} />
                  <Route path="/records" component={NursingRecords} />
                  <Route path="/schedule" component={ScheduleManagement} />
                  <Route path="/users" component={UserManagement} />
                  <Route path="/medical-institutions" component={MedicalInstitutionManagement} />
                  <Route path="/care-managers" component={CareManagerManagement} />
                  <Route path="/buildings" component={BuildingManagement} />
                  <Route path="/insurance-cards" component={InsuranceCardManagement} />
                  <Route path="/statistics/monthly" component={MonthlyStatistics} />
                  <Route path="/care-plans" component={CarePlanManagement} />
                  <Route path="/care-reports" component={CareReportManagement} />
                  <Route path="/contracts" component={ContractManagement} />
                  <Route path="/special-management-settings" component={SpecialManagementSettings} />
                  <Route path="/bonus-masters" component={BonusMasterManagement} />
                  <Route path="/monthly-receipts" component={MonthlyReceiptsManagement} />
                  <Route path="/monthly-receipts/:id" component={MonthlyReceiptDetail} />
                  <Route path="/master-data" component={MasterDataManagement} />
                  <Route path="/schedules-without-records" component={SchedulesWithoutRecords} />
                  <Route path="/reports">
                    {() => <ComingSoon featureName="レポート機能" />}
                  </Route>
                  <Route path="/attendance">
                    {() => <ComingSoon featureName="出勤管理機能" />}
                  </Route>
                  <Route path="/settings">
                    {() => <ComingSoon featureName="設定機能" />}
                  </Route>
                </>
              )}
              <Route component={NotFound} />
            </Switch>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <TenantProvider>
            <MainLayout />
            <Toaster />
          </TenantProvider>
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
