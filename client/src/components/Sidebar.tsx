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
  SidebarHeader,
  useSidebar
} from "@/components/ui/sidebar"
import {
  Home,
  Users,
  ClipboardList,
  Calendar,
  UserCheck,
  Settings,
  FileText,
  Shield,
  Building2,
  BarChart3,
  Heart,
  Hospital,
  UserCog,
  CreditCard,
  FileEdit,
  FileCheck,
  FileSignature,
  AlertTriangle
} from "lucide-react"
import { useIsHeadquarters } from "@/contexts/TenantContext"
import { useUserBasedHeadquarters } from "@/hooks/useUserBasedHeadquarters"

type NavigationItem = {
  title: string;
  href: string;
  icon: any;
  badge: { text: string; variant: "destructive" | "default" } | null;
};

type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

// Base navigation items for facilities - grouped by workflow
const facilityNavigationGroups: NavigationGroup[] = [
  {
    label: "ダッシュボード",
    items: [
      {
        title: "ダッシュボード",
        href: "/",
        icon: Home,
        badge: null,
      },
    ],
  },
  {
    label: "日々の業務",
    items: [
      {
        title: "訪問スケジュール",
        href: "/schedule",
        icon: Calendar,
        badge: null,
      },
      {
        title: "訪問記録",
        href: "/records",
        icon: ClipboardList,
        badge: { text: "3", variant: "destructive" as const },
      },
      {
        title: "記録未作成一覧",
        href: "/schedules-without-records",
        icon: AlertTriangle,
        badge: null,
      },
    ],
  },
  {
    label: "利用者管理",
    items: [
      {
        title: "利用者一覧",
        href: "/patients",
        icon: Users,
        badge: null,
      },
      {
        title: "契約書・同意書",
        href: "/contracts",
        icon: FileSignature,
        badge: null,
      },
      {
        title: "訪問看護計画書",
        href: "/care-plans",
        icon: FileEdit,
        badge: null,
      },
      {
        title: "訪問看護報告書",
        href: "/care-reports",
        icon: FileCheck,
        badge: null,
      },
    ],
  },
  {
    label: "マスタ管理",
    items: [
      {
        title: "医療機関マスタ",
        href: "/medical-institutions",
        icon: Hospital,
        badge: null,
      },
      {
        title: "ケアマネマスタ",
        href: "/care-managers",
        icon: UserCog,
        badge: null,
      },
      {
        title: "建物管理",
        href: "/buildings",
        icon: Building2,
        badge: null,
      },
      {
        title: "保険証管理",
        href: "/insurance-cards",
        icon: CreditCard,
        badge: null,
      },
    ],
  },
  {
    label: "集計・レポート",
    items: [
      {
        title: "月次実績",
        href: "/statistics/monthly",
        icon: BarChart3,
        badge: null,
      },
      {
        title: "レポート",
        href: "/reports",
        icon: FileText,
        badge: null,
      },
    ],
  },
  {
    label: "システム管理",
    items: [
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
        title: "設定",
        href: "/settings",
        icon: Settings,
        badge: null,
      },
    ],
  },
];

// Headquarters-specific navigation items
const headquartersNavigationItems: NavigationItem[] = [
  {
    title: "統合ダッシュボード",
    href: "/",
    icon: BarChart3,
    badge: null,
  },
  {
    title: "施設管理",
    href: "/facilities",
    icon: Building2,
    badge: null,
  },
  {
    title: "全社員管理",
    href: "/users",
    icon: Shield,
    badge: null,
  },
  {
    title: "全利用者管理",
    href: "/patients",
    icon: Users,
    badge: null,
  },
  {
    title: "統合レポート",
    href: "/reports",
    icon: FileText,
    badge: null,
  },
  {
    title: "システム設定",
    href: "/settings",
    icon: Settings,
    badge: null,
  },
];

export function AppSidebar() {
  const [location] = useLocation()
  const isHeadquarters = useIsHeadquarters()
  const isUserBasedHeadquarters = useUserBasedHeadquarters()
  const { isMobile, setOpenMobile } = useSidebar()

  // Use user-based headquarters detection as the primary indicator
  const shouldShowHeadquartersMenu = isUserBasedHeadquarters || isHeadquarters

  const isActive = (href: string) => {
    return location === href
  }

  // Close sidebar on mobile when a menu item is clicked
  const handleLinkClick = () => {
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  return (
    <Sidebar variant="inset">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-4 py-2">
          <div className="h-8 w-8 rounded-full bg-orange-500 flex items-center justify-center">
            <Heart className="h-5 w-5 text-white fill-none stroke-white stroke-2" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-lg">NASRECO</span>
            {shouldShowHeadquartersMenu && (
              <span className="text-xs text-muted-foreground">本社システム</span>
            )}
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {shouldShowHeadquartersMenu ? (
          // Headquarters menu - simple single group
          <SidebarGroup>
            <SidebarGroupLabel>本社メニュー</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {headquartersNavigationItems.map((item) => {
                  const Icon = item.icon
                  const active = isActive(item.href)

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        className="h-10"
                      >
                        <Link href={item.href} onClick={handleLinkClick}>
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
        ) : (
          // Facility menu - grouped by workflow
          <>
            {facilityNavigationGroups.map((group) => (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => {
                      const Icon = item.icon
                      const active = isActive(item.href)

                      return (
                        <SidebarMenuItem key={item.href}>
                          <SidebarMenuButton
                            asChild
                            isActive={active}
                            className="h-10"
                          >
                            <Link href={item.href} onClick={handleLinkClick}>
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
            ))}
          </>
        )}
      </SidebarContent>
    </Sidebar>
  )
}