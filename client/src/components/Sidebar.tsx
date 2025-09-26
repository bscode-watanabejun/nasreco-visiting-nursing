import { Link, useLocation } from "wouter"
import { Badge } from "@/components/ui/badge"
import { 
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader
} from "@/components/ui/sidebar"
import { 
  Home, 
  Users, 
  ClipboardList, 
  Calendar, 
  UserCheck, 
  Settings, 
  FileText,
  Shield
} from "lucide-react"

const navigationItems = [
  {
    title: "ダッシュボード",
    href: "/",
    icon: Home,
    badge: null,
  },
  {
    title: "利用者管理",
    href: "/patients",
    icon: Users,
    badge: null,
  },
  {
    title: "看護記録",
    href: "/records",
    icon: ClipboardList,
    badge: { text: "3", variant: "destructive" as const },
  },
  {
    title: "訪問スケジュール",
    href: "/schedule",
    icon: Calendar,
    badge: null,
  },
  {
    title: "出勤管理",
    href: "/attendance",
    icon: UserCheck,
    badge: null,
  },
  {
    title: "ユーザー管理",
    href: "/users",
    icon: Shield,
    badge: null,
  },
  {
    title: "レポート",
    href: "/reports",
    icon: FileText,
    badge: null,
  },
  {
    title: "設定",
    href: "/settings",
    icon: Settings,
    badge: null,
  },
]

export function AppSidebar() {
  const [location] = useLocation()

  const isActive = (href: string) => {
    return location === href
  }

  return (
    <Sidebar variant="inset">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-4 py-2">
          <div className="h-8 w-8 rounded bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">N</span>
          </div>
          <span className="font-bold text-lg">NASRECO</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>メインメニュー</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => {
                const Icon = item.icon
                const active = isActive(item.href)
                
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton 
                      asChild
                      isActive={active}
                      className="h-10"
                    >
                      <Link href={item.href}>
                        <Icon className="h-4 w-4" />
                        <span>{item.title}</span>
                        {item.badge && (
                          <Badge 
                            variant={item.badge.variant}
                            className="ml-auto h-5 px-1.5 text-xs"
                          >
                            {item.badge.text}
                          </Badge>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}