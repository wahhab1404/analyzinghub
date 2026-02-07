'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Eye, EyeOff } from 'lucide-react'
import { RoleName } from '@/lib/types/database'
import { useTranslation } from '@/lib/i18n/language-context'

export function RegisterForm() {
  const { t } = useTranslation()
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [role, setRole] = useState<RoleName>('Trader')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (!fullName || !email || !password || !confirmPassword || !role) {
        throw new Error(t.forms.validation.fillAllFields)
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email)) {
        throw new Error(t.forms.validation.invalidEmail)
      }

      if (password.length < 8) {
        throw new Error(t.forms.validation.passwordMinLength)
      }

      if (password !== confirmPassword) {
        throw new Error(t.forms.validation.passwordsNotMatch)
      }

      console.log('[RegisterForm] Submitting registration:', {
        email,
        hasPassword: !!password,
        hasFullName: !!fullName,
        role,
      })

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, fullName, role }),
      })

      // CRITICAL: Log raw response text BEFORE parsing
      const responseText = await response.text()
      console.log('AUTH RAW RESPONSE:', response.status, responseText)

      let result
      try {
        result = JSON.parse(responseText)
      } catch (parseError) {
        console.error('[RegisterForm] Failed to parse response:', parseError)
        throw new Error(`${t.forms.validation.invalidResponse}: ${responseText.substring(0, 100)}`)
      }

      console.log('[RegisterForm] Response:', {
        status: response.status,
        ok: response.ok,
        result,
      })

      if (!response.ok) {
        console.error('[RegisterForm] Registration failed:', {
          status: response.status,
          error: result.error,
          fullResult: result,
        })
        throw new Error(result.error || t.auth.accountCreated)
      }

      console.log('[RegisterForm] Registration successful, redirecting to dashboard')
      window.location.href = '/dashboard/feed'
    } catch (err) {
      setError(err instanceof Error ? err.message : t.auth.accountCreated)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">{t.forms.register.createAccount}</CardTitle>
        <CardDescription>
          {t.forms.register.enterInfo}
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="fullName">{t.forms.profile.fullName}</Label>
            <Input
              id="fullName"
              type="text"
              placeholder={t.forms.register.fullNamePlaceholder}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={loading}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{t.auth.email}</Label>
            <Input
              id="email"
              type="email"
              placeholder={t.auth.emailPlaceholder}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">{t.dashboard.admin.role}</Label>
            <Select value={role} onValueChange={(value) => setRole(value as RoleName)} disabled={loading}>
              <SelectTrigger>
                <SelectValue placeholder={t.forms.register.selectRole} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Trader">{t.forms.register.trader}</SelectItem>
                <SelectItem value="Analyzer">{t.forms.register.analyzer}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t.forms.register.roleDescription}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t.auth.password}</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder={t.forms.register.createPassword}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
                className="pe-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute end-0 top-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowPassword(!showPassword)}
                disabled={loading}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">{t.auth.confirmPassword}</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                placeholder={t.forms.register.confirmYourPassword}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                required
                className="pe-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute end-0 top-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                disabled={loading}
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {loading ? t.forms.register.creatingAccount : t.forms.register.createAccount}
          </Button>
          <p className="text-sm text-center text-muted-foreground">
            {t.auth.alreadyHaveAccount}{' '}
            <Link href="/login" className="font-medium text-primary hover:underline">
              {t.forms.register.signIn}
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  )
}
