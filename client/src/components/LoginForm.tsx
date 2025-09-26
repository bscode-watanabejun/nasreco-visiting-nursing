import { useState } from "react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Eye, EyeOff, AlertCircle } from "lucide-react"

interface LoginFormProps {
  onLogin?: (email: string, password: string) => void
  onForgotPassword?: () => void
  loading?: boolean
  error?: string
}

export function LoginForm({ 
  onLogin = (email, password) => console.log('Login attempt:', { email, password }),
  onForgotPassword = () => console.log('Forgot password clicked'),
  loading = false,
  error
}: LoginFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    // Reset errors
    setEmailError('')
    setPasswordError('')
    
    // Validation
    let hasErrors = false
    
    if (!email) {
      setEmailError('メールアドレスを入力してください')
      hasErrors = true
    } else if (!validateEmail(email)) {
      setEmailError('正しいメールアドレスを入力してください')
      hasErrors = true
    }
    
    if (!password) {
      setPasswordError('パスワードを入力してください')
      hasErrors = true
    } else if (password.length < 6) {
      setPasswordError('パスワードは6文字以上で入力してください')
      hasErrors = true
    }
    
    if (!hasErrors) {
      onLogin(email, password)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="h-12 w-12 rounded bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-xl">N</span>
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">NASRECO 訪問看護</CardTitle>
          <CardDescription>
            アカウントにログインしてください
          </CardDescription>
        </CardHeader>
        
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="email">メールアドレス</Label>
              <Input
                id="email"
                type="email"
                placeholder="example@healthcare.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="input-email"
                className={emailError ? "border-destructive" : ""}
              />
              {emailError && (
                <p className="text-sm text-destructive">{emailError}</p>
              )}
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">パスワード</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="px-0 font-normal text-primary"
                  onClick={onForgotPassword}
                  data-testid="link-forgot-password"
                >
                  パスワードをお忘れですか？
                </Button>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="パスワードを入力"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  data-testid="input-password"
                  className={passwordError ? "border-destructive pr-10" : "pr-10"}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                  data-testid="button-toggle-password"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              {passwordError && (
                <p className="text-sm text-destructive">{passwordError}</p>
              )}
            </div>
          </CardContent>
          
          <CardFooter className="flex flex-col space-y-4">
            <Button 
              type="submit" 
              className="w-full" 
              disabled={loading}
              data-testid="button-login"
            >
              {loading ? 'ログイン中...' : 'ログイン'}
            </Button>
            
            <p className="text-center text-sm text-muted-foreground">
              アカウントをお持ちでない方は管理者にお問い合わせください
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}