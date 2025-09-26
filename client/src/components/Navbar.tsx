import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { Bell, Settings, LogOut, Building2, ChevronDown } from "lucide-react"

interface NavbarProps {
  currentFacility?: string
  userName?: string
  userRole?: string
  onFacilityChange?: (facility: string) => void
  onLogout?: () => void
}

export function Navbar({ 
  currentFacility = "さくら訪問看護ステーション", 
  userName = "田中 花子", 
  userRole = "管理者",
  onFacilityChange = () => console.log('Facility change clicked'),
  onLogout = () => console.log('Logout clicked')
}: NavbarProps) {
  const [notificationCount] = useState(3)

  return (
    <nav className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="flex h-16 items-center justify-between px-4 lg:px-6">
        {/* Logo and App Name */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">N</span>
            </div>
            <span className="font-bold text-lg">NASRECO 訪問看護</span>
          </div>
        </div>

        {/* Facility Selector and User Menu */}
        <div className="flex items-center gap-4">
          {/* Facility Selector */}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => onFacilityChange && onFacilityChange(currentFacility || "")}
            className="gap-2"
            data-testid="button-facility-switch"
          >
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">{currentFacility}</span>
            <span className="sm:hidden">施設</span>
            <ChevronDown className="h-3 w-3" />
          </Button>

          {/* Notifications */}
          <Button variant="ghost" size="icon" data-testid="button-notifications">
            <div className="relative">
              <Bell className="h-4 w-4" />
              {notificationCount > 0 && (
                <Badge 
                  variant="destructive" 
                  className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-xs"
                >
                  {notificationCount}
                </Badge>
              )}
            </div>
          </Button>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2" data-testid="button-user-menu">
                <Avatar className="h-7 w-7">
                  <AvatarFallback>{userName.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="hidden lg:flex flex-col items-start">
                  <span className="text-sm font-medium">{userName}</span>
                  <span className="text-xs text-muted-foreground">{userRole}</span>
                </div>
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem>
                <Settings className="mr-2 h-4 w-4" />
                設定
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onLogout} className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                ログアウト
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </nav>
  )
}