import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useState, useEffect } from "react";

// Import all main components
import { Dashboard } from "@/components/Dashboard";
import { PatientManagement } from "@/components/PatientManagement";
import { NursingRecords } from "@/components/NursingRecords";
import { UserManagement } from "@/components/UserManagement";
import { LoginForm } from "@/components/LoginForm";
import { Navbar } from "@/components/Navbar";
import { Sidebar } from "@/components/Sidebar";
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
  const [currentFacility, setCurrentFacility] = useState('東京本院');

  const handleLogin = async (email: string, password: string) => {
    console.log('ログイン試行:', { email, password });
    // TODO: Implement real authentication
    setIsAuthenticated(true);
  };

  const handleForgotPassword = () => {
    console.log('パスワードリセット要求');
    // TODO: Implement password reset
  };

  const handleFacilityChange = (facility: string) => {
    setCurrentFacility(facility);
    console.log('施設変更:', facility);
  };

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
        <Sidebar />
        <div className="flex flex-col flex-1">
          <header className="flex items-center justify-between p-2 border-b bg-background">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <Navbar 
              currentFacility={currentFacility}
              onFacilityChange={handleFacilityChange}
              userName="田中 花子"
            />
          </header>
          <main className="flex-1 overflow-auto">
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/dashboard" component={Dashboard} />
              <Route path="/patients" component={PatientManagement} />
              <Route path="/records" component={NursingRecords} />
              <Route path="/users" component={UserManagement} />
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
          <MainLayout />
          <Toaster />
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
