'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, KeyRound, Mail, Eye, EyeOff } from 'lucide-react'
import { OTPLoginForm } from './OTPLoginForm'
import { useTranslation } from '@/lib/i18n/language-context'

export function LoginForm() {
  const router = useRouter()
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (!email || !password) {
        throw new Error(t.forms.validation.fillAllFields)
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email)) {
        throw new Error(t.forms.validation.invalidEmail)
      }

      console.log('[LoginForm] Submitting login:', {
        email,
        hasPassword: !!password,
      })

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      // CRITICAL: Log raw response text BEFORE parsing
      const responseText = await response.text()
      console.log('AUTH RAW RESPONSE:', response.status, responseText)

      let result
      try {
        result = JSON.parse(responseText)
      } catch (parseError) {
        console.error('[LoginForm] Failed to parse response:', parseError)
        throw new Error(t.forms.validation.invalidResponse)
      }

      console.log('[LoginForm] Response:', {
        status: response.status,
        ok: response.ok,
        result,
      })

      if (!response.ok) {
        console.error('[LoginForm] Login failed:', {
          status: response.status,
          error: result.error,
          fullResult: result,
        })
        throw new Error(result.error || t.auth.signInFailed)
      }

      console.log('[LoginForm] Login successful, redirecting to dashboard')
      window.location.href = '/dashboard/feed'
    } catch (err) {
      console.error('[LoginForm] Login error:', err)
      setError(err instanceof Error ? err.message : t.auth.signInFailed)
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">{t.auth.signIn}</CardTitle>
        <CardDescription>
          {t.auth.choosePreferedMethod}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="password" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="password" className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              {t.auth.password}
            </TabsTrigger>
            <TabsTrigger value="otp" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              {t.auth.emailCode}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="password" className="mt-4">
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
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
                  <Label htmlFor="password">{t.auth.password}</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder={t.auth.passwordPlaceholder}
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
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                  {t.auth.signIn}
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="otp" className="mt-4">
            <OTPLoginForm />
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter>
        <p className="text-sm text-center text-muted-foreground w-full">
          {t.auth.dontHaveAccount}{' '}
          <Link href="/register" className="font-medium text-primary hover:underline">
            {t.auth.signUp}
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}
