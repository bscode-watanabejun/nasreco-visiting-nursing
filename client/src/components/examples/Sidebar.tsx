import { useState } from "react"
import { Sidebar } from '../Sidebar'

export default function SidebarExample() {
  const [collapsed, setCollapsed] = useState(false)
  
  return (
    <div className="h-screen flex">
      <Sidebar 
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        facilitySlug="facility1"
      />
      <div className="flex-1 p-6 bg-background">
        <p className="text-muted-foreground">サイドバーのデモです。メニューをクリックしてナビゲーションをテストできます。</p>
      </div>
    </div>
  )
}