'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Mail, Shield } from 'lucide-react';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useTranslation } from '@/lib/i18n/language-context';

export function OTPLoginForm() {
  const router = useRouter();
  const { t } = useTranslation();
  const [step, setStep] = useState<'email' | 'code' | 'username'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [username, setUsername] = useState('');
  const [isNewUser, setIsNewUser] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [remainingAttempts, setRemainingAttempts] = useState(5);

  const handleRequestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t('auth.sendingCode'));
      }

      setIsNewUser(data.isNewUser);
      setSuccess(t('auth.verificationCodeSent'));
      setStep(data.isNewUser ? 'username' : 'code');
    } catch (err: any) {
      setError(err.message || t('auth.sendingCode'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          code,
          username: isNewUser ? username : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.remainingAttempts !== undefined) {
          setRemainingAttempts(data.remainingAttempts);
        }
        throw new Error(data.error || t('auth.invalidCredentials'));
      }

      setSuccess(t('auth.loginSuccessful'));
      setTimeout(() => {
        router.push('/dashboard/feed');
        router.refresh();
      }, 1000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleProceedToVerification = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Please enter a username');
      return;
    }
    setError('');
    setStep('code');
  };

  return (
    <div className="space-y-6">
      {step === 'email' && (
        <form onSubmit={handleRequestOTP} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{t.auth.email}</Label>
            <div className="relative">
              <Mail className="absolute start-3 top-3 h-5 w-5 text-gray-400" />
              <Input
                id="email"
                type="email"
                placeholder={t.auth.emailPlaceholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                className="ps-10"
              />
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert>
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
                {t.auth.sendingCode}
              </>
            ) : (
              <>
                <Shield className="me-2 h-4 w-4" />
                {t.auth.sendVerificationCode}
              </>
            )}
          </Button>
        </form>
      )}

      {step === 'username' && (
        <form onSubmit={handleProceedToVerification} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">{t.auth.chooseUsername}</Label>
            <Input
              id="username"
              type="text"
              placeholder={t.auth.username}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              disabled={loading}
            />
            <p className="text-sm text-gray-500">
              {t.auth.usernameDescription}
            </p>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {t.common.next}
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => setStep('email')}
          >
            {t.common.back}
          </Button>
        </form>
      )}

      {step === 'code' && (
        <form onSubmit={handleVerifyOTP} className="space-y-4">
          <div className="space-y-2">
            <Label>{t.auth.enterVerificationCode}</Label>
            <p className="text-sm text-gray-500">
              {t.auth.verificationCodeSent} {email}
            </p>
            <div className="flex justify-center">
              <InputOTP
                maxLength={6}
                value={code}
                onChange={(value) => setCode(value)}
                disabled={loading}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>
            <p className="text-xs text-center text-gray-500 mt-2">
              {remainingAttempts} {t.auth.attemptsRemaining}
            </p>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert>
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={loading || code.length !== 6}
          >
            {loading ? (
              <>
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
                {t.auth.verifying}
              </>
            ) : (
              t.auth.verifyAndLogin
            )}
          </Button>

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setStep('email');
                setCode('');
                setError('');
              }}
            >
              {t.auth.useDifferentEmail}
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleRequestOTP}
              disabled={loading}
            >
              {t.auth.resendCode}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
