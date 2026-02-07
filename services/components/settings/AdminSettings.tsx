'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Shield, AlertCircle, CheckCircle, Eye, EyeOff, Edit2, X } from 'lucide-react';
import { toast } from 'sonner';

interface AdminSetting {
  id: string;
  setting_key: string;
  setting_value: string | null;
  description: string;
  updated_at: string;
}

export function AdminSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<AdminSetting[]>([]);
  const [botToken, setBotToken] = useState('');
  const [originalBotToken, setOriginalBotToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/admin/settings');

      if (!response.ok) {
        if (response.status === 403) {
          toast.error('Admin access required');
          return;
        }
        throw new Error('Failed to fetch settings');
      }

      const data = await response.json();
      if (data.ok && data.settings) {
        setSettings(data.settings);
        const tokenSetting = data.settings.find(
          (s: AdminSetting) => s.setting_key === 'telegram_bot_token'
        );
        if (tokenSetting?.setting_value) {
          setBotToken(tokenSetting.setting_value);
          setOriginalBotToken(tokenSetting.setting_value);
        } else {
          setIsEditing(true);
        }
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      toast.error('Failed to fetch admin settings');
    } finally {
      setLoading(false);
    }
  };

  const enableEditing = () => {
    setIsEditing(true);
    setShowToken(false);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setBotToken(originalBotToken);
    setShowToken(false);
  };

  const saveBotToken = async () => {
    if (!botToken.trim()) {
      toast.error('Bot token cannot be empty');
      return;
    }

    if (!botToken.includes(':')) {
      toast.error('Invalid bot token format. Token should contain ":"');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          settingKey: 'telegram_bot_token',
          settingValue: botToken.trim(),
        }),
      });

      const data = await response.json();

      if (!data.ok) {
        toast.error(data.error || 'Failed to update bot token');
        return;
      }

      toast.success('Bot token updated successfully');
      setIsEditing(false);
      setShowToken(false);
      await fetchSettings();
    } catch (error) {
      console.error('Error updating bot token:', error);
      toast.error('Failed to update bot token');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Admin Settings
          </CardTitle>
          <CardDescription>Configure application-wide settings</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const tokenSetting = settings.find(s => s.setting_key === 'telegram_bot_token');
  const isTokenConfigured = tokenSetting?.setting_value;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Admin Settings
        </CardTitle>
        <CardDescription>
          Configure application-wide settings and integrations
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert className={isTokenConfigured ? 'border-green-500/50 bg-green-500/10' : 'border-orange-500/50 bg-orange-500/10'}>
          {isTokenConfigured ? (
            <>
              <CheckCircle className="h-4 w-4 text-green-500" />
              <AlertDescription className="text-green-700 dark:text-green-400">
                Telegram bot is configured and ready for use
              </AlertDescription>
            </>
          ) : (
            <>
              <AlertCircle className="h-4 w-4 text-orange-500" />
              <AlertDescription className="text-orange-700 dark:text-orange-400">
                Telegram bot token not configured. Analyzers cannot connect their channels until this is set.
              </AlertDescription>
            </>
          )}
        </Alert>

        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold mb-4">Telegram Bot Configuration</h3>

            <div className="rounded-lg border bg-muted/50 p-4 mb-4">
              <h4 className="font-semibold mb-2">Setup Instructions:</h4>
              <ol className="list-decimal list-inside space-y-2 text-sm">
                <li>Open Telegram and search for <code className="bg-background px-2 py-1 rounded">@BotFather</code></li>
                <li>Send the command <code className="bg-background px-2 py-1 rounded">/newbot</code></li>
                <li>Follow the instructions to create a new bot</li>
                <li>Copy the bot token provided by BotFather</li>
                <li>Paste the token below and save</li>
              </ol>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bot-token">Telegram Bot Token</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="bot-token"
                    type={showToken ? 'text' : 'password'}
                    placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    disabled={!isEditing}
                    className="pr-10 disabled:opacity-100"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowToken(!showToken)}
                    disabled={!isEditing && !isTokenConfigured}
                  >
                    {showToken ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
                {!isEditing ? (
                  <Button
                    onClick={enableEditing}
                    variant="outline"
                  >
                    <Edit2 className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                ) : (
                  <>
                    <Button
                      onClick={saveBotToken}
                      disabled={saving || !botToken.trim()}
                    >
                      {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save
                    </Button>
                    <Button
                      onClick={cancelEditing}
                      variant="outline"
                      disabled={saving}
                    >
                      <X className="mr-2 h-4 w-4" />
                      Cancel
                    </Button>
                  </>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                The bot token is used by all analyzers to broadcast to their channels
              </p>
            </div>

            {tokenSetting?.updated_at && (
              <p className="text-xs text-muted-foreground mt-2">
                Last updated: {new Date(tokenSetting.updated_at).toLocaleString()}
              </p>
            )}
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Security Note:</strong> This token grants access to your Telegram bot.
              Keep it secure and never share it publicly. Only system administrators should have access to this setting.
            </AlertDescription>
          </Alert>
        </div>
      </CardContent>
    </Card>
  );
}
