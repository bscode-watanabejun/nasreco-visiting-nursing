import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  User,
  Mail,
  Phone,
  Shield,
  UserCheck,
  UserX,
  Settings
} from "lucide-react"

interface User {
  id: string
  name: string
  email: string
  phone: string
  role: 'admin' | 'nurse' | 'supervisor'
  status: 'active' | 'inactive'
  facility: string
  createdDate: string
  lastLogin: string
}

// TODO: Remove mock data when implementing real backend
const mockUsers: User[] = [
  {
    id: '1',
    name: '田中 花子',
    email: 'hanako.tanaka@healthcare.com',
    phone: '090-1234-5678',
    role: 'admin',
    status: 'active',
    facility: '東京本院',
    createdDate: '2024-01-15',
    lastLogin: '2024-09-26 08:30'
  },
  {
    id: '2',
    name: '山田 次郎',
    email: 'jiro.yamada@healthcare.com',
    phone: '090-2345-6789',
    role: 'nurse',
    status: 'active',
    facility: '東京本院',
    createdDate: '2024-02-20',
    lastLogin: '2024-09-26 09:15'
  },
  {
    id: '3',
    name: '佐藤 美和',
    email: 'miwa.sato@healthcare.com',
    phone: '090-3456-7890',
    role: 'supervisor',
    status: 'active',
    facility: '東京本院',
    createdDate: '2024-03-10',
    lastLogin: '2024-09-25 17:20'
  },
  {
    id: '4',
    name: '鈴木 健一',
    email: 'kenichi.suzuki@healthcare.com',
    phone: '090-4567-8901',
    role: 'nurse',
    status: 'inactive',
    facility: '東京本院',
    createdDate: '2024-01-30',
    lastLogin: '2024-09-20 16:45'
  }
]

const getRoleColor = (role: string) => {
  switch (role) {
    case 'admin': return 'bg-purple-100 text-purple-800 border-purple-200'
    case 'supervisor': return 'bg-blue-100 text-blue-800 border-blue-200'
    case 'nurse': return 'bg-green-100 text-green-800 border-green-200'
    default: return 'bg-gray-100 text-gray-800 border-gray-200'
  }
}

const getRoleText = (role: string) => {
  switch (role) {
    case 'admin': return '管理者'
    case 'supervisor': return '主任'
    case 'nurse': return '看護師'
    default: return role
  }
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'active': return 'bg-green-100 text-green-800 border-green-200'
    case 'inactive': return 'bg-gray-100 text-gray-800 border-gray-200'
    default: return 'bg-gray-100 text-gray-800 border-gray-200'
  }
}

const getStatusText = (status: string) => {
  switch (status) {
    case 'active': return 'アクティブ'
    case 'inactive': return '無効'
    default: return status
  }
}

export function UserManagement() {
  const [users] = useState(mockUsers)
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'supervisor' | 'nurse'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesRole = roleFilter === 'all' || user.role === roleFilter
    const matchesStatus = statusFilter === 'all' || user.status === statusFilter
    return matchesSearch && matchesRole && matchesStatus
  })

  const adminUsers = users.filter(u => u.role === 'admin').length
  const nurseUsers = users.filter(u => u.role === 'nurse').length
  const activeUsers = users.filter(u => u.status === 'active').length

  const handleCreateNew = () => {
    setIsCreating(true)
    setSelectedUser(null)
    console.log('新規ユーザー作成モード')
  }

  const handleEditUser = (user: User) => {
    setSelectedUser(user)
    setIsCreating(false)
    console.log('ユーザー編集:', user.id)
  }

  if (isCreating || selectedUser) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {isCreating ? '新規ユーザー作成' : 'ユーザー編集'}
            </h1>
            <p className="text-muted-foreground">
              {isCreating ? '新しいスタッフアカウントを作成' : `${selectedUser?.name}のアカウント設定`}
            </p>
          </div>
          <Button variant="outline" onClick={() => { setIsCreating(false); setSelectedUser(null) }}>
            一覧に戻る
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">基本情報</h3>
                <div className="space-y-4">
                  <div>
                    <Label>氏名 *</Label>
                    <Input defaultValue={selectedUser?.name || ''} placeholder="田中 花子" />
                  </div>
                  <div>
                    <Label>メールアドレス *</Label>
                    <Input type="email" defaultValue={selectedUser?.email || ''} placeholder="hanako.tanaka@healthcare.com" />
                  </div>
                  <div>
                    <Label>電話番号</Label>
                    <Input type="tel" defaultValue={selectedUser?.phone || ''} placeholder="090-1234-5678" />
                  </div>
                  {isCreating && (
                    <div>
                      <Label>初期パスワード *</Label>
                      <Input type="password" placeholder="8文字以上のパスワード" />
                      <p className="text-xs text-muted-foreground mt-1">
                        初回ログイン時にパスワード変更を求められます
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Role and Access */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">権限設定</h3>
                <div className="space-y-4">
                  <div>
                    <Label>役職 *</Label>
                    <Select defaultValue={selectedUser?.role || 'nurse'}>
                      <SelectTrigger>
                        <SelectValue placeholder="役職を選択" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">管理者</SelectItem>
                        <SelectItem value="supervisor">主任</SelectItem>
                        <SelectItem value="nurse">看護師</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>所属施設 *</Label>
                    <Select defaultValue={selectedUser?.facility || '東京本院'}>
                      <SelectTrigger>
                        <SelectValue placeholder="施設を選択" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="東京本院">東京本院</SelectItem>
                        <SelectItem value="大阪支院">大阪支院</SelectItem>
                        <SelectItem value="名古屋支院">名古屋支院</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>ステータス</Label>
                    <Select defaultValue={selectedUser?.status || 'active'}>
                      <SelectTrigger>
                        <SelectValue placeholder="ステータスを選択" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">アクティブ</SelectItem>
                        <SelectItem value="inactive">無効</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6 pt-6 border-t">
              <Button variant="outline">キャンセル</Button>
              <Button>{isCreating ? 'ユーザーを作成' : '変更を保存'}</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">ユーザー管理</h1>
          <p className="text-muted-foreground">スタッフアカウントの管理と権限設定</p>
        </div>
        <Button onClick={handleCreateNew} data-testid="button-create-user">
          <Plus className="mr-2 h-4 w-4" />
          新規ユーザー作成
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">アクティブユーザー</CardTitle>
            <UserCheck className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{activeUsers}名</div>
            <p className="text-xs text-muted-foreground">
              利用可能なアカウント
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">看護師</CardTitle>
            <User className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{nurseUsers}名</div>
            <p className="text-xs text-muted-foreground">
              看護師アカウント
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">管理者</CardTitle>
            <Shield className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{adminUsers}名</div>
            <p className="text-xs text-muted-foreground">
              管理者アカウント
            </p>
          </CardContent>
        </Card>
      </div>

      {/* User List */}
      <Card>
        <CardHeader>
          <CardTitle>ユーザー一覧</CardTitle>
          <CardDescription>登録済みの全スタッフアカウント</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="ユーザー名またはメールアドレスで検索..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-user-search"
              />
            </div>
            <div className="flex gap-2">
              <Select value={roleFilter} onValueChange={(value: any) => setRoleFilter(value)}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="役職" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全役職</SelectItem>
                  <SelectItem value="admin">管理者</SelectItem>
                  <SelectItem value="supervisor">主任</SelectItem>
                  <SelectItem value="nurse">看護師</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="ステータス" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全て</SelectItem>
                  <SelectItem value="active">アクティブ</SelectItem>
                  <SelectItem value="inactive">無効</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* User List */}
          <div className="space-y-4">
            {filteredUsers.map((user) => (
              <div key={user.id} className="border rounded-lg p-4 hover-elevate">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-lg">{user.name}</h3>
                        <Badge className={getRoleColor(user.role)}>
                          {getRoleText(user.role)}
                        </Badge>
                        <Badge className={getStatusColor(user.status)}>
                          {getStatusText(user.status)}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <div className="flex items-center gap-2">
                          <Mail className="h-3 w-3" />
                          {user.email}
                        </div>
                        <div className="flex items-center gap-2">
                          <Phone className="h-3 w-3" />
                          {user.phone}
                        </div>
                        <p>所属: {user.facility}</p>
                        <p>最終ログイン: {new Date(user.lastLogin).toLocaleString('ja-JP')}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleEditUser(user)}
                      data-testid={`button-edit-${user.id}`}
                    >
                      <Edit className="mr-1 h-3 w-3" />
                      編集
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline"
                      data-testid={`button-reset-password-${user.id}`}
                    >
                      <Settings className="mr-1 h-3 w-3" />
                      パスワードリセット
                    </Button>
                    {user.status === 'active' ? (
                      <Button 
                        size="sm" 
                        variant="outline"
                        data-testid={`button-deactivate-${user.id}`}
                      >
                        <UserX className="mr-1 h-3 w-3" />
                        無効化
                      </Button>
                    ) : (
                      <Button 
                        size="sm" 
                        variant="outline"
                        data-testid={`button-activate-${user.id}`}
                      >
                        <UserCheck className="mr-1 h-3 w-3" />
                        有効化
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {filteredUsers.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <User className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>条件に一致するユーザーが見つかりません</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}