import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  Settings,
  Loader2,
  Copy,
  CheckCircle2
} from "lucide-react"
import { useUsersQuery, useCreateUserMutation, useUpdateUserMutation, useDeactivateUserMutation, useActivateUserMutation, useResetPasswordMutation } from '@/hooks/useUsers'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useQuery } from '@tanstack/react-query'
import { facilityApi } from '@/lib/api'
import { useUserBasedHeadquarters } from '@/hooks/useUserBasedHeadquarters'
import { useTenant } from '@/contexts/TenantContext'
import type { User as ApiUser } from '@shared/schema'
import type { CreateUserRequest, UpdateUserRequest } from '@/lib/api'

// Map API User to display format
interface DisplayUser {
  id: string
  name: string
  email: string
  phone: string
  role: 'admin' | 'nurse' | 'manager' | 'corporate_admin'
  status: 'active' | 'inactive'
  facility: string
  createdDate: string
  lastLogin: string
  username: string
  fullName: string
  isActive: boolean
}

// Convert API user to display format
function mapApiUserToDisplay(user: any): DisplayUser {
  return {
    id: user.id,
    name: user.fullName,
    email: user.email,
    phone: user.phone || '',
    role: user.role,
    status: user.isActive ? 'active' : 'inactive',
    facility: user.facility?.name || 'ステーション',
    createdDate: user.createdAt ? new Date(user.createdAt).toLocaleDateString('ja-JP') : '',
    lastLogin: user.updatedAt ? new Date(user.updatedAt).toLocaleString('ja-JP') : '',
    username: user.username,
    fullName: user.fullName,
    isActive: user.isActive
  }
}


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
    case 'corporate_admin': return 'Corporate Admin'
    case 'admin': return '管理者'
    case 'manager': return '主任'
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
  const [currentPage, setCurrentPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'manager' | 'nurse' | 'corporate_admin'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [facilityFilter, setFacilityFilter] = useState<string>('all')
  const [selectedUser, setSelectedUser] = useState<DisplayUser | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [formData, setFormData] = useState<CreateUserRequest | UpdateUserRequest>({})

  // Dialog states
  const [deactivateDialogUser, setDeactivateDialogUser] = useState<DisplayUser | null>(null)
  const [activateDialogUser, setActivateDialogUser] = useState<DisplayUser | null>(null)
  const [resetPasswordDialogUser, setResetPasswordDialogUser] = useState<DisplayUser | null>(null)
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null)
  const [passwordCopied, setPasswordCopied] = useState(false)

  // Fetch users data
  const { data: usersResponse, isLoading, error } = useUsersQuery(currentPage, 20)
  const { data: currentUser } = useCurrentUser()
  const { facility: currentFacility, isHeadquarters } = useTenant()
  const isUserBasedHeadquarters = useUserBasedHeadquarters()

  // Fetch facilities list for headquarters users
  const { data: facilities } = useQuery({
    queryKey: ["facilities"],
    queryFn: facilityApi.getFacilities,
    enabled: isUserBasedHeadquarters, // Only fetch for headquarters users
  })

  const createUserMutation = useCreateUserMutation()
  const updateUserMutation = useUpdateUserMutation()
  const deactivateUserMutation = useDeactivateUserMutation()
  const activateUserMutation = useActivateUserMutation()
  const resetPasswordMutation = useResetPasswordMutation()

  const users = usersResponse?.data.map(mapApiUserToDisplay) || []

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesRole = roleFilter === 'all' || user.role === roleFilter
    const matchesStatus = statusFilter === 'all' || user.status === statusFilter
    const matchesFacility = facilityFilter === 'all' || user.facility === facilityFilter
    return matchesSearch && matchesRole && matchesStatus && matchesFacility
  })

  const adminUsers = users.filter(u => u.role === 'admin').length
  const nurseUsers = users.filter(u => u.role === 'nurse').length
  const activeUsers = users.filter(u => u.status === 'active').length

  const handleCreateNew = () => {
    setIsCreating(true)
    setSelectedUser(null)
    setFormData({
      username: '',
      password: '',
      email: '',
      fullName: '',
      role: isHeadquarters ? 'corporate_admin' : 'nurse',
      phone: '',
      isActive: true
    })
  }

  const handleEditUser = (user: DisplayUser) => {
    setSelectedUser(user)
    setIsCreating(false)
    setFormData({
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      phone: user.phone,
      isActive: user.isActive
    })
  }

  const handleFormSubmit = async () => {
    try {
      if (isCreating) {
        await createUserMutation.mutateAsync(formData as CreateUserRequest)
      } else if (selectedUser) {
        const updateData = { ...formData }
        delete updateData.password // Don't update password unless explicitly set
        await updateUserMutation.mutateAsync({
          id: selectedUser.id,
          userData: updateData as UpdateUserRequest
        })
      }
      // Reset form and go back to list
      setIsCreating(false)
      setSelectedUser(null)
      setFormData({})
    } catch (error) {
      // Error handling is done in the mutation hooks
      console.error('Form submission error:', error)
    }
  }

  const handleCancel = () => {
    setIsCreating(false)
    setSelectedUser(null)
    setFormData({})
  }

  const updateFormData = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  // Handle deactivate user
  const handleDeactivateUser = async (user: DisplayUser) => {
    setDeactivateDialogUser(user)
  }

  const confirmDeactivate = async () => {
    if (!deactivateDialogUser) return

    try {
      await deactivateUserMutation.mutateAsync(deactivateDialogUser.id)
      setDeactivateDialogUser(null)
    } catch (error) {
      // Error is handled by the mutation hook
    }
  }

  // Handle activate user
  const handleActivateUser = async (user: DisplayUser) => {
    setActivateDialogUser(user)
  }

  const confirmActivate = async () => {
    if (!activateDialogUser) return

    try {
      await activateUserMutation.mutateAsync(activateDialogUser.id)
      setActivateDialogUser(null)
    } catch (error) {
      // Error is handled by the mutation hook
    }
  }

  // Handle reset password
  const handleResetPassword = async (user: DisplayUser) => {
    setResetPasswordDialogUser(user)
  }

  const confirmResetPassword = async () => {
    if (!resetPasswordDialogUser) return

    try {
      const result = await resetPasswordMutation.mutateAsync(resetPasswordDialogUser.id)
      setTemporaryPassword(result.temporaryPassword)
      setResetPasswordDialogUser(null)
      setPasswordCopied(false)
    } catch (error) {
      // Error is handled by the mutation hook
    }
  }

  // Copy password to clipboard
  const copyPassword = async () => {
    if (temporaryPassword) {
      await navigator.clipboard.writeText(temporaryPassword)
      setPasswordCopied(true)
      setTimeout(() => setPasswordCopied(false), 2000)
    }
  }

  // Check if current user can manage target user
  const canManageUser = (targetUser: DisplayUser): boolean => {
    if (!currentUser) return false

    // Nurse cannot manage anyone
    if (currentUser.role === 'nurse') return false

    // Admin can manage everyone
    if (currentUser.role === 'admin') return true

    // Manager can only manage nurses
    if (currentUser.role === 'manager') {
      return targetUser.role === 'nurse'
    }

    return false
  }

  if (isCreating || selectedUser) {
    return (
      <div className="space-y-4 md:space-y-6 p-3 sm:p-4 md:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl lg:text-3xl font-bold tracking-tight">
              {isCreating ? '新規ユーザー登録' : 'ユーザー編集'}
            </h1>
            <p className="text-sm md:text-base text-muted-foreground">
              {isCreating ? '新しいスタッフアカウントを登録' : `${selectedUser?.name}のアカウント設定`}
            </p>
          </div>
          <Button variant="outline" onClick={handleCancel} className="w-full sm:w-auto">
            一覧に戻る
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="text-base md:text-lg font-semibold">基本情報</h3>
                <div className="space-y-3 md:space-y-4">
                  <div>
                    <Label>氏名 *</Label>
                    <Input
                      value={formData.fullName || ''}
                      onChange={(e) => updateFormData('fullName', e.target.value)}
                      placeholder="田中 花子"
                    />
                  </div>
                  <div>
                    <Label>ユーザー名 *</Label>
                    <Input
                      value={formData.username || ''}
                      onChange={(e) => updateFormData('username', e.target.value)}
                      placeholder="hanako.tanaka"
                    />
                  </div>
                  <div>
                    <Label>メールアドレス *</Label>
                    <Input
                      type="email"
                      value={formData.email || ''}
                      onChange={(e) => updateFormData('email', e.target.value)}
                      placeholder="hanako.tanaka@healthcare.com"
                    />
                  </div>
                  <div>
                    <Label>電話番号</Label>
                    <Input
                      type="tel"
                      value={formData.phone || ''}
                      onChange={(e) => updateFormData('phone', e.target.value)}
                      placeholder="090-1234-5678"
                    />
                  </div>
                  {isCreating && (
                    <div>
                      <Label>初期パスワード *</Label>
                      <Input
                        type="password"
                        value={formData.password || ''}
                        onChange={(e) => updateFormData('password', e.target.value)}
                        placeholder="8文字以上のパスワード"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        初回ログイン時にパスワード変更を求められます
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Role and Access */}
              <div className="space-y-4">
                <h3 className="text-base md:text-lg font-semibold">権限設定</h3>
                <div className="space-y-3 md:space-y-4">
                  <div>
                    <Label>役職 *</Label>
                    <Select
                      value={formData.role || (isHeadquarters ? 'corporate_admin' : 'nurse')}
                      onValueChange={(value) => updateFormData('role', value)}
                      disabled={
                        (!isCreating && selectedUser?.id === currentUser?.id) ||
                        (isCreating && isHeadquarters) ||
                        (!isCreating && selectedUser?.role === 'corporate_admin')
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="役職を選択" />
                      </SelectTrigger>
                      <SelectContent>
                        {/* 新規登録時は現在のURLコンテキストで判定、編集時は編集対象ユーザーの役職で判定 */}
                        {(isCreating ? isHeadquarters : selectedUser?.role === 'corporate_admin') ? (
                          <SelectItem value="corporate_admin">Corporate Admin（本社管理者）</SelectItem>
                        ) : (
                          <>
                            <SelectItem value="admin">管理者</SelectItem>
                            <SelectItem value="manager">主任</SelectItem>
                            <SelectItem value="nurse">看護師</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                    {isHeadquarters && isCreating && (
                      <p className="text-xs text-muted-foreground mt-1">
                        ※ 本社システムでは、全社の統合管理・分析を行うCorporate Adminのみ登録できます
                      </p>
                    )}
                    {!isCreating && selectedUser?.role === 'corporate_admin' && (
                      <p className="text-xs text-muted-foreground mt-1">
                        ※ 本社ユーザーの役職は変更できません
                      </p>
                    )}
                  </div>
                  <div>
                    <Label>所属施設 *</Label>
                    <Select value={selectedUser?.facility || currentFacility?.name || currentUser?.facility?.name || 'ステーション'} disabled>
                      <SelectTrigger>
                        <SelectValue placeholder="施設を選択" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={selectedUser?.facility || currentFacility?.name || currentUser?.facility?.name || 'ステーション'}>
                          {selectedUser?.facility || currentFacility?.name || currentUser?.facility?.name || 'ステーション'}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      アクセス中の施設に自動設定されます
                    </p>
                  </div>
                  <div>
                    <Label>ステータス</Label>
                    <Select
                      value={formData.isActive ? 'active' : 'inactive'}
                      onValueChange={(value) => updateFormData('isActive', value === 'active')}
                    >
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

            <div className="flex flex-col sm:flex-row justify-end gap-2 mt-6 pt-6 border-t">
              <Button variant="outline" onClick={handleCancel} disabled={createUserMutation.isPending || updateUserMutation.isPending}>
                キャンセル
              </Button>
              <Button
                onClick={handleFormSubmit}
                disabled={createUserMutation.isPending || updateUserMutation.isPending || !formData.fullName || !formData.email || !formData.username || (isCreating && !formData.password)}
              >
                {(createUserMutation.isPending || updateUserMutation.isPending) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isCreating ? 'ユーザーを作成' : '変更を保存'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Show error if users fetch failed
  if (error) {
    const errorMessage = error instanceof Error ? error.message : 'ユーザーデータの取得に失敗しました';
    return (
      <div className="space-y-4 sm:space-y-6 p-3 sm:p-4 lg:p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center max-w-md">
            <User className="mx-auto h-12 w-12 mb-4 opacity-50 text-red-500" />
            <p className="text-muted-foreground mb-2">ユーザーデータの取得に失敗しました</p>
            <p className="text-sm text-red-500">{errorMessage}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 p-3 sm:p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">ユーザー管理</h1>
          <p className="text-sm md:text-base text-muted-foreground">スタッフアカウントの管理と権限設定</p>
        </div>
        <Button onClick={handleCreateNew} data-testid="button-create-user" className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          <span className="sm:inline">新規ユーザー登録</span>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
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
          <div className="flex flex-col gap-3">
            <div className="relative w-full">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="ユーザー名またはメールアドレスで検索..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-full"
                data-testid="input-user-search"
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full">
              {/* Facility Filter - Only show for headquarters */}
              {isUserBasedHeadquarters && facilities && (
                <Select value={facilityFilter} onValueChange={setFacilityFilter}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder="施設" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全施設</SelectItem>
                    {facilities.map((facility) => (
                      <SelectItem key={facility.id} value={facility.name}>
                        {facility.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select value={roleFilter} onValueChange={(value: any) => setRoleFilter(value)}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="役職" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全役職</SelectItem>
                  {isHeadquarters && (
                    <SelectItem value="corporate_admin">Corporate Admin</SelectItem>
                  )}
                  <SelectItem value="admin">管理者</SelectItem>
                  <SelectItem value="manager">主任</SelectItem>
                  <SelectItem value="nurse">看護師</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
                <SelectTrigger className="w-full sm:w-40">
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
          
          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="ml-2 text-muted-foreground">ユーザー情報を読み込み中...</span>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="text-center py-8 text-red-600">
              <p>ユーザー情報の読み込みに失敗しました</p>
              <Button variant="outline" onClick={() => window.location.reload()} className="mt-2">
                再読み込み
              </Button>
            </div>
          )}

          {/* User List */}
          {!isLoading && !error && (
            <div className="space-y-4">
              {filteredUsers.map((user) => (
                <div key={user.id} className="border rounded-lg p-3 md:p-4 hover-elevate">
                {/* Mobile layout (stacked) */}
                <div className="sm:hidden space-y-3">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-10 w-10 flex-shrink-0">
                      <AvatarFallback className="text-sm">{user.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <h3 className="font-semibold text-base truncate">{user.name}</h3>
                        <Badge className={`${getRoleColor(user.role)} text-xs`}>
                          {getRoleText(user.role)}
                        </Badge>
                        <Badge className={`${getStatusColor(user.status)} text-xs`}>
                          {getStatusText(user.status)}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div className="flex items-center gap-2">
                          <Mail className="h-3 w-3 shrink-0" />
                          <span className="truncate">{user.email}</span>
                        </div>
                        {user.phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="h-3 w-3 shrink-0" />
                            <span>{user.phone}</span>
                          </div>
                        )}
                        <p>所属: {user.facility}</p>
                        <p>最終ログイン: {new Date(user.lastLogin).toLocaleString('ja-JP')}</p>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEditUser(user)}
                      data-testid={`button-edit-${user.id}`}
                      className="text-xs h-8"
                    >
                      <Edit className="mr-1 h-3 w-3" />
                      <span>編集</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleResetPassword(user)}
                      disabled={!canManageUser(user) || currentUser?.id === user.id}
                      data-testid={`button-reset-password-${user.id}`}
                      className="text-xs h-8"
                    >
                      <Settings className="mr-1 h-3 w-3" />
                      <span>PW</span>
                    </Button>
                    {user.status === 'active' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeactivateUser(user)}
                        disabled={!canManageUser(user) || currentUser?.id === user.id}
                        data-testid={`button-deactivate-${user.id}`}
                        className="col-span-2 text-xs h-8"
                      >
                        <UserX className="mr-1 h-3 w-3" />
                        <span>無効化</span>
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleActivateUser(user)}
                        disabled={!canManageUser(user)}
                        data-testid={`button-activate-${user.id}`}
                        className="col-span-2 text-xs h-8"
                      >
                        <UserCheck className="mr-1 h-3 w-3" />
                        <span>有効化</span>
                      </Button>
                    )}
                  </div>
                </div>

                {/* Desktop layout (horizontal) */}
                <div className="hidden sm:flex flex-col md:flex-row md:items-center justify-between gap-4">
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
                        {user.phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="h-3 w-3" />
                            {user.phone}
                          </div>
                        )}
                        <p>所属: {user.facility}</p>
                        <p>最終ログイン: {new Date(user.lastLogin).toLocaleString('ja-JP')}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col md:items-end gap-2 flex-shrink-0">
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
                        onClick={() => handleResetPassword(user)}
                        disabled={!canManageUser(user) || currentUser?.id === user.id}
                        data-testid={`button-reset-password-${user.id}`}
                      >
                        <Settings className="mr-1 h-3 w-3" />
                        パスワード
                      </Button>
                      {user.status === 'active' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeactivateUser(user)}
                          disabled={!canManageUser(user) || currentUser?.id === user.id}
                          data-testid={`button-deactivate-${user.id}`}
                        >
                          <UserX className="mr-1 h-3 w-3" />
                          無効化
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleActivateUser(user)}
                          disabled={!canManageUser(user)}
                          data-testid={`button-activate-${user.id}`}
                        >
                          <UserCheck className="mr-1 h-3 w-3" />
                          有効化
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              ))}
            </div>
          )}

          {!isLoading && !error && filteredUsers.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <User className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>条件に一致するユーザーが見つかりません</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Deactivate User Dialog */}
      <AlertDialog open={!!deactivateDialogUser} onOpenChange={(open) => !open && setDeactivateDialogUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ユーザーを無効化しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              {deactivateDialogUser?.name}さんのアカウントを無効化します。
              このユーザーはログインできなくなります。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deactivateUserMutation.isPending}>
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeactivate}
              disabled={deactivateUserMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deactivateUserMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              無効化
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Activate User Dialog */}
      <AlertDialog open={!!activateDialogUser} onOpenChange={(open) => !open && setActivateDialogUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ユーザーを有効化しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              {activateDialogUser?.name}さんのアカウントを有効化します。
              このユーザーは再度ログインできるようになります。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={activateUserMutation.isPending}>
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmActivate}
              disabled={activateUserMutation.isPending}
            >
              {activateUserMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              有効化
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Password Dialog */}
      <AlertDialog open={!!resetPasswordDialogUser} onOpenChange={(open) => !open && setResetPasswordDialogUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>パスワードをリセットしますか？</AlertDialogTitle>
            <AlertDialogDescription>
              {resetPasswordDialogUser?.name}さんのパスワードをリセットします。
              新しい一時パスワードが発行されます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetPasswordMutation.isPending}>
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmResetPassword}
              disabled={resetPasswordMutation.isPending}
            >
              {resetPasswordMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              リセット
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Temporary Password Dialog */}
      <Dialog open={!!temporaryPassword} onOpenChange={(open) => !open && setTemporaryPassword(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>一時パスワード発行完了</DialogTitle>
            <DialogDescription>
              以下の一時パスワードをユーザーに伝えてください。
              このパスワードは一度だけ表示されます。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted p-4 rounded-lg">
              <div className="flex items-center justify-between gap-4">
                <code className="text-lg font-mono font-bold flex-1 text-center">
                  {temporaryPassword}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={copyPassword}
                  className="shrink-0"
                >
                  {passwordCopied ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      コピー済み
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      コピー
                    </>
                  )}
                </Button>
              </div>
            </div>
            <div className="text-sm text-muted-foreground space-y-2">
              <p>⚠️ このパスワードは次回ログイン時に変更が必要です。</p>
              <p>⚠️ ダイアログを閉じると再表示できません。</p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setTemporaryPassword(null)} className="w-full">
              閉じる
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}