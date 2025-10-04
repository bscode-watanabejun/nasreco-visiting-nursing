import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useState, useEffect } from "react";
import { TenantProvider, useTenant, useIsHeadquarters } from "@/contexts/TenantContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useUserBasedHeadquarters } from "@/hooks/useUserBasedHeadquarters";

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
import InsuranceCardManagement from "@/components/InsuranceCardManagement";
import MonthlyStatistics from "@/components/MonthlyStatistics";
import CarePlanManagement from "@/components/CarePlanManagement";
import CareReportManagement from "@/components/CareReportManagement";
import NotFound from "@/pages/not-found";

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
  const { facility, company, isLoading: tenantLoading } = useTenant();
  const isHeadquarters = useIsHeadquarters();
  const isUserBasedHeadquarters = useUserBasedHeadquarters();
  const [currentFacility, setCurrentFacility] = useState(facility?.name || '東京本院');
  const queryClient = useQueryClient();

  // Get current user information
  const { data: currentUser, isLoading: userLoading, error: userError } = useCurrentUser();

  // Use user-based headquarters detection as the primary indicator
  const shouldShowHeadquartersFeatures = isUserBasedHeadquarters || isHeadquarters;

  // Set authentication state based on user data
  useEffect(() => {
    if (currentUser) {
      setIsAuthenticated(true);
    } else if (userError && !userLoading) {
      setIsAuthenticated(false);
    }
  }, [currentUser, userError, userLoading]);

  // Update current facility when tenant info changes
  useEffect(() => {
    if (facility) {
      setCurrentFacility(facility.name);
    }
  }, [facility]);

  // Get user role display string
  const getUserRoleDisplay = (user: any) => {
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
        queryClient.invalidateQueries({ queryKey: ["currentUser"] });
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
    setCurrentFacility(facility);
    console.log('施設変更:', facility);
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

  // Show loading while tenant info or user info is being loaded
  if (tenantLoading || (userLoading && !userError)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">システムを読み込んでいます...</p>
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

  const style = {
    "--sidebar-width": "20rem",
    "--sidebar-width-icon": "4rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1">
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
          <main className="flex-1 overflow-auto">
            <Switch>
              {/* Headquarters-specific routes */}
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
                  <Route path="/insurance-cards" component={InsuranceCardManagement} />
                  <Route path="/statistics/monthly" component={MonthlyStatistics} />
                  <Route path="/care-plans" component={CarePlanManagement} />
                  <Route path="/care-reports" component={CareReportManagement} />
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
                  <Route path="/insurance-cards" component={InsuranceCardManagement} />
                  <Route path="/statistics/monthly" component={MonthlyStatistics} />
                  <Route path="/care-plans" component={CarePlanManagement} />
                  <Route path="/care-reports" component={CareReportManagement} />
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
