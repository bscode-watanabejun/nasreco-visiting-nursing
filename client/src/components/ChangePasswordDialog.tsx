import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Eye, EyeOff, AlertCircle, Loader2, CheckCircle2 } from "lucide-react"
import { authApi } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"

interface ChangePasswordDialogProps {
  open: boolean
  onSuccess: () => void
}

export function ChangePasswordDialog({ open, onSuccess }: ChangePasswordDialogProps) {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()

  const validatePassword = (password: string): string | null => {
    if (password.length < 8) {
      return 'パスワードは8文字以上である必要があります'
    }
    if (!/[A-Za-z]/.test(password)) {
      return 'パスワードには英字を含める必要があります'
    }
    if (!/[0-9]/.test(password)) {
      return 'パスワードには数字を含める必要があります'
    }
    return null
  }

  const getPasswordStrength = (password: string): { label: string; color: string; percentage: number } => {
    if (password.length === 0) return { label: '', color: '', percentage: 0 }
    if (password.length < 8) return { label: '弱い', color: 'bg-red-500', percentage: 25 }

    let strength = 0
    if (password.length >= 12) strength += 25
    if (/[a-z]/.test(password)) strength += 25
    if (/[A-Z]/.test(password)) strength += 25
    if (/[0-9]/.test(password)) strength += 25
    if (/[^A-Za-z0-9]/.test(password)) strength += 25

    if (strength < 50) return { label: '弱い', color: 'bg-red-500', percentage: strength }
    if (strength < 75) return { label: '普通', color: 'bg-yellow-500', percentage: strength }
    return { label: '強い', color: 'bg-green-500', percentage: strength }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validation
    const passwordError = validatePassword(newPassword)
    if (passwordError) {
      setError(passwordError)
      return
    }

    if (newPassword !== confirmPassword) {
      setError('パスワードが一致しません')
      return
    }

    setIsSubmitting(true)

    try {
      await authApi.changePasswordFirstLogin(newPassword)

      toast({
        title: 'パスワード変更完了',
        description: 'パスワードを正常に変更しました',
      })

      // Reset form
      setNewPassword('')
      setConfirmPassword('')
      onSuccess()
    } catch (error: any) {
      setError(error.message || 'パスワード変更に失敗しました')
      toast({
        title: 'パスワード変更エラー',
        description: error.message || '予期しないエラーが発生しました',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const passwordStrength = getPasswordStrength(newPassword)

  return (
    <Dialog open={open} onOpenChange={() => {}} modal={true}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-orange-500" />
            パスワード変更が必要です
          </DialogTitle>
          <DialogDescription>
            一時パスワードでログインしました。
            セキュリティのため、新しいパスワードを設定してください。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="new-password">新しいパスワード *</Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="8文字以上（英数字を含む）"
                required
                autoComplete="new-password"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowNewPassword(!showNewPassword)}
              >
                {showNewPassword ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>

            {/* Password Strength Indicator */}
            {newPassword && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">パスワード強度:</span>
                  <span className={`font-medium ${
                    passwordStrength.label === '強い' ? 'text-green-600' :
                    passwordStrength.label === '普通' ? 'text-yellow-600' :
                    'text-red-600'
                  }`}>
                    {passwordStrength.label}
                  </span>
                </div>
                <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${passwordStrength.color} transition-all duration-300`}
                    style={{ width: `${passwordStrength.percentage}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">パスワード確認 *</Label>
            <div className="relative">
              <Input
                id="confirm-password"
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="もう一度パスワードを入力"
                required
                autoComplete="new-password"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                パスワードが一致しません
              </p>
            )}
            {confirmPassword && newPassword === confirmPassword && (
              <p className="text-xs text-green-600 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                パスワードが一致しました
              </p>
            )}
          </div>

          <div className="bg-muted p-3 rounded-lg text-xs space-y-1">
            <p className="font-medium">パスワード要件:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>8文字以上</li>
              <li>英字を含む（推奨：大文字と小文字）</li>
              <li>数字を含む</li>
              <li>特殊文字を含む（推奨）</li>
            </ul>
          </div>

          <DialogFooter>
            <Button
              type="submit"
              disabled={isSubmitting || !newPassword || !confirmPassword || newPassword !== confirmPassword}
              className="w-full"
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              パスワードを変更
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
