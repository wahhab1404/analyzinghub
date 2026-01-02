'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Send, CheckCircle, XCircle, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/i18n/language-context';

interface TelegramStatus {
  connected: boolean;
  username?: string;
  linkedAt?: string;
}

interface LinkCodeResponse {
  code: string;
  expiresAt: string;
}

export function TelegramSettings() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkCode, setLinkCode] = useState<LinkCodeResponse | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/telegram/status');
      const data = await response.json();
      if (data.ok) {
        setStatus({
          connected: data.connected,
          username: data.username,
          linkedAt: data.linkedAt,
        });
      }
    } catch (error) {
      console.error('Error fetching Telegram status:', error);
      toast.error(t.telegramSettings.failedToFetch);
    } finally {
      setLoading(false);
    }
  };

  const generateLinkCode = async () => {
    setGeneratingCode(true);
    try {
      const response = await fetch('/api/telegram/link-code', {
        method: 'POST',
      });
      const data = await response.json();

      if (!data.ok) {
        toast.error(data.error || t.telegramSettings.failedToGenerate);
        return;
      }

      setLinkCode({
        code: data.code,
        expiresAt: data.expiresAt,
      });
      toast.success(t.telegramSettings.codeGeneratedSuccess);
    } catch (error) {
      console.error('Error generating link code:', error);
      toast.error(t.telegramSettings.failedToGenerate);
    } finally {
      setGeneratingCode(false);
    }
  };

  const disconnect = async () => {
    if (!confirm(t.telegramSettings.confirmDisconnect)) {
      return;
    }

    setDisconnecting(true);
    try {
      const response = await fetch('/api/telegram/disconnect', {
        method: 'POST',
      });
      const data = await response.json();

      if (!data.ok) {
        toast.error(data.error || t.telegramSettings.failedToDisconnect);
        return;
      }

      toast.success(t.telegramSettings.accountDisconnected);
      setStatus({ connected: false });
      setLinkCode(null);
      await fetchStatus();
    } catch (error) {
      console.error('Error disconnecting:', error);
      toast.error(t.telegramSettings.failedToDisconnect);
    } finally {
      setDisconnecting(false);
    }
  };

  const copyCode = () => {
    if (linkCode) {
      navigator.clipboard.writeText(linkCode.code);
      setCopied(true);
      toast.success(t.telegramSettings.codeCopied);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getTimeRemaining = () => {
    if (!linkCode) return '';
    const expires = new Date(linkCode.expiresAt);
    const now = new Date();
    const diff = expires.getTime() - now.getTime();
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t.telegramSettings.telegramNotifications}</CardTitle>
          <CardDescription>{t.telegramSettings.receiveAlerts}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.telegramSettings.telegramNotifications}</CardTitle>
        <CardDescription>
          {t.telegramSettings.receiveRealTimeAlerts}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {status?.connected ? (
          <div className="space-y-4">
            <Alert className="border-green-500/50 bg-green-500/10">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <AlertDescription className="text-green-700 dark:text-green-400">
                {t.telegramSettings.accountConnected}
                {status.username && ` (@${status.username})`}
              </AlertDescription>
            </Alert>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <p className="font-medium">{t.telegramSettings.connectedAccount}</p>
                <p className="text-sm text-muted-foreground">
                  {status.username ? `@${status.username}` : t.telegramSettings.telegramUser}
                </p>
                {status.linkedAt && (
                  <p className="text-xs text-muted-foreground">
                    {t.telegramSettings.linkedDate.replace('{date}', new Date(status.linkedAt).toLocaleDateString())}
                  </p>
                )}
              </div>
              <Button
                variant="destructive"
                onClick={disconnect}
                disabled={disconnecting}
              >
                {disconnecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t.telegramSettings.disconnect}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Alert>
              <Send className="h-4 w-4" />
              <AlertDescription>
                {t.telegramSettings.connectToReceive}
              </AlertDescription>
            </Alert>

            {!linkCode ? (
              <Button
                onClick={generateLinkCode}
                disabled={generatingCode}
                className="w-full"
              >
                {generatingCode && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t.telegramSettings.generateLinkCode}
              </Button>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg border bg-muted/50 p-4">
                  <h4 className="font-semibold mb-2">{t.telegramSettings.followSteps}</h4>
                  <ol className="list-decimal list-inside space-y-2 text-sm">
                    <li>
                      {t.telegramSettings.openTelegramSearch}{' '}
                      <code className="bg-background px-2 py-1 rounded">
                        {t.telegramSettings.botUsername}
                      </code>
                    </li>
                    <li>{t.telegramSettings.sendCommand.replace('{code}', linkCode.code)}</li>
                    <li>{t.telegramSettings.autoLinked}</li>
                  </ol>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-background border rounded-lg p-3 font-mono text-2xl text-center tracking-wider">
                    {linkCode.code}
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={copyCode}
                    className="h-12 w-12"
                  >
                    {copied ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                <p className="text-sm text-muted-foreground text-center">
                  {t.telegramSettings.codeExpiresIn.replace('{time}', getTimeRemaining())}
                </p>

                <Button
                  variant="ghost"
                  onClick={generateLinkCode}
                  disabled={generatingCode}
                  className="w-full"
                >
                  {t.telegramSettings.generateNewCode}
                </Button>
              </div>
            )}

            <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-2">{t.telegramSettings.note}</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>{t.telegramSettings.botSendsBothLanguages}</li>
                <li>{t.telegramSettings.configureEvents}</li>
                <li>{t.telegramSettings.startConversationFirst}</li>
              </ul>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
