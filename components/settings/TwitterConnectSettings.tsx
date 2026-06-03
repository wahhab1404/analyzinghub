'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Twitter, CheckCircle, AlertCircle, Link2Off } from 'lucide-react';
import { toast } from 'sonner';

interface TwitterStatus {
  configured: boolean;
  connected: boolean;
  account: {
    handle: string | null;
    displayName: string | null;
    autoPost: boolean;
    connectedAt: string | null;
  } | null;
}

export function TwitterConnectSettings() {
  const [status, setStatus] = useState<TwitterStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    fetchStatus();

    // Surface the OAuth redirect result (?twitter=connected|error&twitter_error=...)
    const params = new URLSearchParams(window.location.search);
    const result = params.get('twitter');
    if (result === 'connected') {
      toast.success('تم ربط حساب X بنجاح - X account connected');
    } else if (result === 'error') {
      toast.error(`فشل ربط حساب X - X connection failed (${params.get('twitter_error') || 'unknown'})`);
    }
    if (result) {
      // Clean the query string so the toast doesn't repeat on refresh.
      params.delete('twitter');
      params.delete('twitter_error');
      const qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/twitter/status');
      if (res.ok) {
        setStatus(await res.json());
      }
    } catch (error) {
      console.error('Failed to fetch X status:', error);
    } finally {
      setLoading(false);
    }
  };

  const connect = () => {
    // Full-page redirect into the OAuth flow.
    window.location.href = '/api/twitter/connect';
  };

  const disconnect = async () => {
    if (!confirm('هل تريد فك ربط حساب X؟ - Disconnect your X account?')) return;
    setDisconnecting(true);
    try {
      const res = await fetch('/api/twitter/disconnect', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Failed to disconnect');
        return;
      }
      toast.success('تم فك ربط حساب X - X account disconnected');
      await fetchStatus();
    } catch (error) {
      toast.error('Failed to disconnect');
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Twitter className="h-5 w-5" />
            نشر على X (تويتر) - Post to X (Twitter)
          </CardTitle>
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
        <CardTitle className="flex items-center gap-2">
          <Twitter className="h-5 w-5" />
          نشر الصفقات الناجحة على X (تويتر)
        </CardTitle>
        <CardDescription>
          اربط حساب X الخاص بك لنشر صفقاتك الرابحة عليه - Link your X account to announce your winning trades
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!status?.configured && (
          <Alert className="border-orange-500/50 bg-orange-500/10">
            <AlertCircle className="h-4 w-4 text-orange-500" />
            <AlertDescription className="text-orange-700 dark:text-orange-400">
              لم يتم إعداد تكامل X على الخادم بعد - X integration is not configured on the server yet.
            </AlertDescription>
          </Alert>
        )}

        {status?.connected && status.account ? (
          <>
            <Alert className="border-green-500/50 bg-green-500/10">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <AlertDescription className="text-green-700 dark:text-green-400">
                حسابك مرتبط - Connected as{' '}
                <span className="font-semibold">@{status.account.handle}</span>
              </AlertDescription>
            </Alert>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {status.account.displayName || status.account.handle}
                  </span>
                  <Badge variant="default" className="text-xs">@{status.account.handle}</Badge>
                </div>
                {status.account.connectedAt && (
                  <p className="text-xs text-muted-foreground">
                    Connected {new Date(status.account.connectedAt).toLocaleDateString()}
                  </p>
                )}
              </div>
              <Button variant="destructive" onClick={disconnect} disabled={disconnecting}>
                {disconnecting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Link2Off className="mr-2 h-4 w-4" />
                )}
                فك الربط - Disconnect
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <Alert>
              <Twitter className="h-4 w-4" />
              <AlertDescription>
                اربط حسابك على X لتتمكن من نشر صفقاتك الناجحة بضغطة زر - Link your X account to post your successful trades.
              </AlertDescription>
            </Alert>
            <Button onClick={connect} disabled={!status?.configured}>
              <Twitter className="mr-2 h-4 w-4" />
              ربط حساب X - Connect X account
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
