import { useState } from "react"
import { Link, useLocation } from "wouter"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { 
  Home, 
  Users, 
  ClipboardList, 
  Calendar, 
  UserCheck, 
  Settings, 
  FileText,
  Shield,
  ChevronLeft,
  ChevronRight
} from "lucide-react"

interface SidebarProps {
  collapsed?: boolean
  onToggle?: () => void
  facilitySlug?: string
}

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

export function Sidebar({ 
  collapsed = false, 
  onToggle = () => console.log('Sidebar toggle clicked'),
  facilitySlug = "facility1"
}: SidebarProps) {
  const [location] = useLocation()

  const getHref = (path: string) => {
    return path
  }

  const isActive = (href: string) => {
    return location === href
  }

  return (
    <div className={cn(
      "flex flex-col border-r bg-card/50 backdrop-blur-sm transition-all duration-300",
      collapsed ? "w-16" : "w-64"
    )}>
      {/* Sidebar Header */}
      <div className="flex h-16 items-center justify-between px-4 border-b">
        {!collapsed && (
          <span className="font-semibold text-sm text-muted-foreground">
            メニュー
          </span>
        )}
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onToggle}
          data-testid="button-sidebar-toggle"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-1">
          {navigationItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            
            return (
              <Link 
                key={item.href} 
                href={getHref(item.href)}
                className="block"
              >
                <Button
                  variant={active ? "secondary" : "ghost"}
                  className={cn(
                    "w-full justify-start gap-3 h-10",
                    collapsed && "justify-center px-2",
                    active && "bg-primary/10 text-primary border-primary/20"
                  )}
                  data-testid={`nav-${item.href.replace('/', '')}`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">{item.title}</span>
                      {item.badge && (
                        <Badge 
                          variant={item.badge.variant}
                          className="h-5 px-1.5 text-xs"
                        >
                          {item.badge.text}
                        </Badge>
                      )}
                    </>
                  )}
                </Button>
              </Link>
            )
          })}
        </nav>
      </ScrollArea>
    </div>
  )
}