import { Navbar } from '../Navbar'

export default function NavbarExample() {
  return (
    <Navbar 
      facilityName="さくら訪問看護ステーション"
      userName="田中 花子"
      userRole="管理者"
      onFacilitySwitch={() => console.log('施設切り替えクリック')}
      onLogout={() => console.log('ログアウトクリック')}
    />
  )
}