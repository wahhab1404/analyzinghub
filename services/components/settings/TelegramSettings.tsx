'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Send, CheckCircle, XCircle, Copy, Check, AtSign } from 'lucide-react';
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

interface UsernameLink {
  telegram_username: string;
  expires_at: string;
}

export function TelegramSettings() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkCode, setLinkCode] = useState<LinkCodeResponse | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showUsernameLink, setShowUsernameLink] = useState(false);
  const [telegramUsername, setTelegramUsername] = useState('');
  const [linkingByUsername, setLinkingByUsername] = useState(false);
  const [usernameLink, setUsernameLink] = useState<UsernameLink | null>(null);

  useEffect(() => {
    fetchStatus();
    fetchUsernameLink();
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

  const fetchUsernameLink = async () => {
    try {
      const response = await fetch('/api/me');
      const userData = await response.json();
      if (!userData.id) return;

      const linkResponse = await fetch(`/api/telegram/link-username?user_id=${userData.id}`);
      const linkData = await linkResponse.json();

      if (linkData.pending_link) {
        setUsernameLink(linkData.pending_link);
      }
    } catch (error) {
      console.error('Error fetching username link:', error);
    }
  };

  const linkByUsername = async () => {
    if (!telegramUsername.trim()) {
      toast.error('Please enter your Telegram username');
      return;
    }

    setLinkingByUsername(true);
    try {
      const userResponse = await fetch('/api/me');
      const userData = await userResponse.json();

      const response = await fetch('/api/telegram/link-username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegram_username: telegramUsername,
          user_id: userData.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || 'Failed to link username');
        return;
      }

      setUsernameLink({
        telegram_username: data.username,
        expires_at: data.expires_at,
      });
      toast.success('Username link created! Send /start to @AnalyzingHubBot to complete linking.');
      setTelegramUsername('');
    } catch (error) {
      console.error('Error linking username:', error);
      toast.error('Failed to link username');
    } finally {
      setLinkingByUsername(false);
    }
  };

  const cancelUsernameLink = async () => {
    try {
      const userResponse = await fetch('/api/me');
      const userData = await userResponse.json();

      await fetch(`/api/telegram/link-username?user_id=${userData.id}`, {
        method: 'DELETE',
      });

      setUsernameLink(null);
      toast.success('Username link cancelled');
    } catch (error) {
      console.error('Error cancelling username link:', error);
      toast.error('Failed to cancel username link');
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

            {usernameLink ? (
              <div className="space-y-4">
                <Alert className="border-blue-500/50 bg-blue-500/10">
                  <AtSign className="h-4 w-4 text-blue-500" />
                  <AlertDescription className="text-blue-700 dark:text-blue-400">
                    Username link pending for <strong>@{usernameLink.telegram_username}</strong>
                  </AlertDescription>
                </Alert>

                <div className="rounded-lg border bg-muted/50 p-4">
                  <h4 className="font-semibold mb-2">Complete Linking:</h4>
                  <ol className="list-decimal list-inside space-y-2 text-sm">
                    <li>Open Telegram and search for <code className="bg-background px-2 py-1 rounded">@AnalyzingHubBot</code></li>
                    <li>Send <code className="bg-background px-2 py-1 rounded">/start</code> to the bot</li>
                    <li>Your account will be automatically linked</li>
                  </ol>
                </div>

                <Button
                  variant="outline"
                  onClick={cancelUsernameLink}
                  className="w-full"
                >
                  Cancel Username Link
                </Button>
              </div>
            ) : !linkCode && !showUsernameLink ? (
              <div className="space-y-3">
                <Button
                  onClick={generateLinkCode}
                  disabled={generatingCode}
                  className="w-full"
                >
                  {generatingCode && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t.telegramSettings.generateLinkCode}
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      Or
                    </span>
                  </div>
                </div>

                <Button
                  variant="outline"
                  onClick={() => setShowUsernameLink(true)}
                  className="w-full"
                >
                  <AtSign className="mr-2 h-4 w-4" />
                  Link by Username
                </Button>
              </div>
            ) : showUsernameLink && !linkCode ? (
              <div className="space-y-4">
                <div className="rounded-lg border bg-muted/50 p-4">
                  <h4 className="font-semibold mb-2">Link by Telegram Username:</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Enter your Telegram username, then send /start to @AnalyzingHubBot to complete the linking.
                  </p>

                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="text"
                        placeholder="username"
                        value={telegramUsername}
                        onChange={(e) => setTelegramUsername(e.target.value)}
                        className="pl-9"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            linkByUsername();
                          }
                        }}
                      />
                    </div>
                    <Button
                      onClick={linkByUsername}
                      disabled={linkingByUsername || !telegramUsername.trim()}
                    >
                      {linkingByUsername && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Link
                    </Button>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  onClick={() => setShowUsernameLink(false)}
                  className="w-full"
                >
                  Use Link Code Instead
                </Button>
              </div>
            ) : null}

            {linkCode && (
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
