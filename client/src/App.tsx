import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useState, useEffect } from "react";
import { TenantProvider, useTenant, useIsHeadquarters } from "@/contexts/TenantContext";

// Import all main components
import { Dashboard } from "@/components/Dashboard";
import { PatientManagement } from "@/components/PatientManagement";
import { NursingRecords } from "@/components/NursingRecords";
import { UserManagement } from "@/components/UserManagement";
import { LoginForm } from "@/components/LoginForm";
import { Navbar } from "@/components/Navbar";
import { AppSidebar } from "@/components/Sidebar";
import { HeadquartersDashboard } from "@/components/HeadquartersDashboard";
import { FacilityManagement } from "@/components/FacilityManagement";
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
  const { facility, company, isLoading: tenantLoading } = useTenant();
  const isHeadquarters = useIsHeadquarters();
  const [currentFacility, setCurrentFacility] = useState(facility?.name || '東京本院');

  // Update current facility when tenant info changes
  useEffect(() => {
    if (facility) {
      setCurrentFacility(facility.name);
    }
  }, [facility]);

  const handleLogin = async (email: string, password: string) => {
    try {
      console.log('ログイン試行 for user:', email);
      
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: email, password }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setIsAuthenticated(true);
        console.log('ログイン成功:', data);
      } else {
        const errorData = await response.json();
        console.error('ログイン失敗:', errorData);
        // ここでエラーメッセージを表示する機能を追加することも可能
      }
    } catch (error) {
      console.error('ログインエラー:', error);
    }
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
        setIsAuthenticated(false);
        console.log('ログアウト成功');
      } else {
        console.error('ログアウトに失敗しました');
      }
    } catch (error) {
      console.error('ログアウトエラー:', error);
    }
  };

  // Show loading while tenant info is being loaded
  if (tenantLoading) {
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
          error={undefined}
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
                userName="田中 花子"
                userRole={isHeadquarters ? '企業管理者' : '管理者'}
                onLogout={handleLogout}
              />
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            <Switch>
              {/* Headquarters-specific routes */}
              {isHeadquarters ? (
                <>
                  <Route path="/" component={HeadquartersDashboard} />
                  <Route path="/dashboard" component={HeadquartersDashboard} />
                  <Route path="/facilities" component={FacilityManagement} />
                  <Route path="/patients" component={PatientManagement} />
                  <Route path="/records" component={NursingRecords} />
                  <Route path="/users" component={UserManagement} />
                </>
              ) : (
                /* Facility-specific routes */
                <>
                  <Route path="/" component={Dashboard} />
                  <Route path="/dashboard" component={Dashboard} />
                  <Route path="/patients" component={PatientManagement} />
                  <Route path="/records" component={NursingRecords} />
                  <Route path="/users" component={UserManagement} />
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
