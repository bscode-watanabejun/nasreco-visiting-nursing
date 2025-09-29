import { AppSidebar } from '../Sidebar'

export default function SidebarExample() {
  return (
    <div className="h-screen flex">
      <AppSidebar />
      <div className="flex-1 p-6 bg-background">
        <p className="text-muted-foreground">サイドバーのデモです。メニューをクリックしてナビゲーションをテストできます。</p>
      </div>
    </div>
  )
}