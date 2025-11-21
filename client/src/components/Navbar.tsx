import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { Bell, Settings, LogOut, Building2, ChevronDown, Heart } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { NotificationPanel } from "@/components/NotificationPanel"
import { useState } from "react"

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
  const [isNotificationOpen, setIsNotificationOpen] = useState(false)
  const [isFacilityPopoverOpen, setIsFacilityPopoverOpen] = useState(false)

  // Fetch notification count
  const { data: notificationData } = useQuery<{
    total: number
    schedulesWithoutRecords: number
    expiringDoctorOrders: number
    expiringInsuranceCards: number
  }>({
    queryKey: ["/api/notifications/count"],
    refetchInterval: 60000, // Refetch every 60 seconds
  })

  const notificationCount = notificationData?.total || 0

  return (
    <nav className="flex-1">
      <div className="flex h-12 sm:h-14 items-center px-3 sm:px-4 lg:px-6 justify-between">
        {/* Logo and App Name - 左寄せ */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0">
            <Heart className="h-4 w-4 sm:h-5 sm:w-5 text-white fill-none stroke-white stroke-2" />
          </div>
          <div className="min-w-0">
            <span className="font-bold text-sm sm:text-lg truncate block">
              <span className="sm:hidden">NASRECO</span>
              <span className="hidden sm:inline">NASRECO 訪問看護</span>
            </span>
          </div>
        </div>

        {/* Facility Selector and User Menu */}
        <div className="flex items-center gap-1 sm:gap-2 lg:gap-4 flex-shrink-0">
          {/* Facility Selector */}
          <Popover open={isFacilityPopoverOpen} onOpenChange={setIsFacilityPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // モバイル画面ではPopoverを開く、デスクトップでは施設変更を実行
                  if (window.innerWidth < 768) {
                    setIsFacilityPopoverOpen(true)
                  } else {
                    onFacilityChange && onFacilityChange(currentFacility || "")
                  }
                }}
                className="gap-1.5 h-8 sm:h-9 md:cursor-pointer"
                data-testid="button-facility-switch"
              >
                <Building2 className="h-4 w-4 flex-shrink-0" />
                <span className="hidden md:inline text-xs max-w-32 xl:max-w-48 truncate">
                  {currentFacility}
                </span>
                <ChevronDown className="h-3 w-3 flex-shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-3 w-64" align="start">
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">現在の施設</div>
                <div className="text-sm font-semibold">{currentFacility}</div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Notifications */}
          <Popover open={isNotificationOpen} onOpenChange={setIsNotificationOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="通知"
                data-testid="button-notifications"
                className="h-8 w-8 sm:h-9 sm:w-9"
              >
                <div className="relative">
                  <Bell className="h-4 w-4" />
                  {notificationCount > 0 && (
                    <Badge
                      variant="destructive"
                      className="absolute -top-2 -right-2 h-4 w-4 sm:h-5 sm:w-5 flex items-center justify-center p-0 text-[10px] sm:text-xs"
                    >
                      {notificationCount}
                    </Badge>
                  )}
                </div>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-80 sm:w-96" align="end">
              <NotificationPanel onClose={() => setIsNotificationOpen(false)} />
            </PopoverContent>
          </Popover>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 h-8 sm:h-9"
                data-testid="button-user-menu"
              >
                <Avatar className="h-6 w-6 sm:h-7 sm:w-7 flex-shrink-0">
                  <AvatarFallback className="text-xs sm:text-sm">
                    {userName.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden lg:flex flex-col items-start min-w-0">
                  <span className="text-xs font-medium truncate max-w-24 xl:max-w-none">
                    {userName}
                  </span>
                  <span className="text-[10px] text-muted-foreground truncate max-w-24 xl:max-w-none">
                    {userRole}
                  </span>
                </div>
                <ChevronDown className="h-3 w-3 flex-shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 sm:w-56">
              <DropdownMenuItem className="py-2">
                <Settings className="mr-2 h-4 w-4 flex-shrink-0" />
                <span>設定</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={onLogout} 
                className="text-destructive py-2"
                data-testid="button-logout"
              >
                <LogOut className="mr-2 h-4 w-4 flex-shrink-0" />
                <span>ログアウト</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </nav>
  )
}