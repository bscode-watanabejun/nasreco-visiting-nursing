import { LoginForm } from '../LoginForm'

export default function LoginFormExample() {
  return (
    <LoginForm 
      onLogin={(email, password) => {
        console.log('ログイン試行:', { email, password })
        alert(`ログイン試行: ${email}`)
      }}
      onForgotPassword={() => {
        console.log('パスワードリセットクリック')
        alert('パスワードリセットページに移動します')
      }}
      loading={false}
      error={undefined}
    />
  )
}