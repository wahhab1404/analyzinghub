'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Send, CheckCircle, AlertCircle, Radio, Languages } from 'lucide-react';
import { toast } from 'sonner';
import { AdChannelsSettings } from './AdChannelsSettings';

interface Channel {
  id: string;
  channelId: string;
  channelName: string;
  audienceType: 'public' | 'followers' | 'subscribers';
  verified: boolean;
  notifyNewAnalysis: boolean;
  notifyTargetHit: boolean;
  notifyStopHit: boolean;
  broadcastLanguage: 'en' | 'ar' | 'both';
  isPlatformDefault: boolean;
  linkedPlanId?: string;
  linkedPlanName?: string;
  createdAt: string;
}

interface ChannelStatus {
  channels: Channel[];
}

export function ChannelSettings() {
  const [status, setStatus] = useState<ChannelStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [channelInput, setChannelInput] = useState('');
  const [selectedAudienceType, setSelectedAudienceType] = useState<'public' | 'followers' | 'subscribers'>('public');
  const [isPlatformDefault, setIsPlatformDefault] = useState(true);
  const [editingChannel, setEditingChannel] = useState<string | null>(null);
  const [settings, setSettings] = useState({
    notifyNewAnalysis: true,
    notifyTargetHit: true,
    notifyStopHit: true,
    broadcastLanguage: 'en' as 'en' | 'ar' | 'both',
  });

  useEffect(() => {
    fetchStatus();
  }, []);

  // Note: Users can now add multiple channels of the same type (especially for subscribers)
  // Each channel can be either a platform default or linked to a specific plan

  useEffect(() => {
    if (editingChannel && status?.channels) {
      const channel = status.channels.find(c => c.id === editingChannel);
      if (channel) {
        setSettings({
          notifyNewAnalysis: channel.notifyNewAnalysis,
          notifyTargetHit: channel.notifyTargetHit,
          notifyStopHit: channel.notifyStopHit,
          broadcastLanguage: channel.broadcastLanguage || 'en',
        });
      }
    }
  }, [editingChannel, status]);

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/telegram/channels/list');
      const data = await response.json();
      if (data.ok) {
        setStatus({
          channels: data.channels || [],
        });
      }
    } catch (error) {
      console.error('Error fetching channel status:', error);
      toast.error('Failed to fetch channel status');
    } finally {
      setLoading(false);
    }
  };

  const getAudienceTypeLabel = (type: string) => {
    switch (type) {
      case 'public':
        return 'Public Channel (All Followers)';
      case 'followers':
        return 'Followers-Only Channel';
      case 'subscribers':
        return 'Subscribers-Only Channel';
      default:
        return type;
    }
  };

  const getAudienceTypeDescription = (type: string) => {
    switch (type) {
      case 'public':
        return 'Broadcasts all public posts to this channel';
      case 'followers':
        return 'Broadcasts follower-only posts to this channel';
      case 'subscribers':
        return 'Broadcasts subscriber-only posts to this channel';
      default:
        return '';
    }
  };

  const connectChannel = async () => {
    if (!channelInput.trim()) {
      toast.error('Please enter a channel ID or username');
      return;
    }

    // For platform defaults, check if one already exists for this type
    if (isPlatformDefault && status?.channels?.some(c => c.audienceType === selectedAudienceType && c.isPlatformDefault)) {
      toast.error(`You already have a platform default ${selectedAudienceType} channel. Uncheck "Platform Default" to add another channel for plans.`);
      return;
    }

    setConnecting(true);
    try {
      const body: any = {
        audienceType: selectedAudienceType,
        isPlatformDefault: isPlatformDefault,
      };

      if (channelInput.startsWith('-100') || channelInput.startsWith('-')) {
        body.channelId = channelInput;
      } else {
        body.channelUsername = channelInput.replace('@', '');
      }

      const response = await fetch('/api/telegram/channel/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const text = await response.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (parseError) {
        console.error('Failed to parse response:', text);
        toast.error(`Server error: ${text.substring(0, 100)}`);
        return;
      }

      if (!response.ok) {
        const errorMsg = data?.error || `HTTP ${response.status}: ${text || '[empty]'}`;
        console.error('Connection failed:', errorMsg);
        toast.error(errorMsg);
        return;
      }

      if (!data.ok) {
        toast.error(data.error || 'Failed to connect channel');
        return;
      }

      toast.success('Channel connected successfully!');
      setChannelInput('');
      setIsPlatformDefault(true);
      await fetchStatus();
    } catch (error) {
      console.error('Error connecting channel:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to connect channel');
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async (channelId: string, audienceType: string) => {
    if (!confirm(`Are you sure you want to disconnect your ${audienceType} channel?`)) {
      return;
    }

    setDisconnecting(true);
    try {
      const response = await fetch('/api/telegram/channel/disconnect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ audienceType }),
      });
      const data = await response.json();

      if (!data.ok) {
        toast.error(data.error || 'Failed to disconnect');
        return;
      }

      toast.success('Channel disconnected');
      await fetchStatus();
    } catch (error) {
      console.error('Error disconnecting:', error);
      toast.error('Failed to disconnect');
    } finally {
      setDisconnecting(false);
    }
  };

  const saveSettings = async (channelId: string) => {
    if (!channelId) return;

    setSavingSettings(true);
    try {
      const response = await fetch('/api/telegram/channel/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channelId,
          ...settings,
        }),
      });

      const data = await response.json();

      if (!data.ok) {
        toast.error(data.error || 'Failed to update settings');
        return;
      }

      toast.success('Settings updated successfully');
      setEditingChannel(null);

      try {
        await fetchStatus();
      } catch (statusError) {
        console.error('Error refreshing status:', statusError);
      }
    } catch (error) {
      console.error('Error updating settings:', error);
      toast.error('Failed to update settings');
    } finally {
      setSavingSettings(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Telegram Channel Broadcasting</CardTitle>
          <CardDescription>Broadcast analysis updates to your Telegram channel</CardDescription>
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
    <>
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Radio className="h-5 w-5" />
          Telegram Channel Broadcasting
        </CardTitle>
        <CardDescription>
          Automatically broadcast your analysis updates to your Telegram channel
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {status?.channels && status.channels.length > 0 ? (
          <div className="space-y-6">
            <Alert className="border-green-500/50 bg-green-500/10">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <AlertDescription className="text-green-700 dark:text-green-400">
                You have {status.channels.length} Telegram channel{status.channels.length > 1 ? 's' : ''} connected
              </AlertDescription>
            </Alert>

            {status.channels.map((channel) => (
              <Card key={channel.id} className="border-2">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">{getAudienceTypeLabel(channel.audienceType)}</CardTitle>
                      <CardDescription className="mt-1">
                        {getAudienceTypeDescription(channel.audienceType)}
                      </CardDescription>
                    </div>
                    <Badge variant={channel.audienceType === 'subscribers' ? 'default' : 'secondary'}>
                      {channel.audienceType}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border p-3 bg-muted/30">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{channel.channelName}</p>
                      <div className="flex gap-2">
                        {channel.isPlatformDefault && (
                          <Badge variant="default" className="text-xs">
                            Platform Default
                          </Badge>
                        )}
                        {channel.linkedPlanName && (
                          <Badge variant="secondary" className="text-xs">
                            {channel.linkedPlanName}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Channel ID: {channel.channelId}
                    </p>
                    {channel.createdAt && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Connected {new Date(channel.createdAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>

                  {editingChannel === channel.id ? (
                    <div className="space-y-4">
                      <h4 className="font-semibold text-sm">Broadcasting Settings</h4>

                      <div className="flex items-center justify-between space-x-2 rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <Label className="text-sm font-medium">New Analysis</Label>
                          <p className="text-xs text-muted-foreground">
                            Broadcast when you publish a new analysis
                          </p>
                        </div>
                        <Switch
                          checked={settings.notifyNewAnalysis}
                          onCheckedChange={(checked) =>
                            setSettings({ ...settings, notifyNewAnalysis: checked })
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between space-x-2 rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <Label className="text-sm font-medium">Target Hit</Label>
                          <p className="text-xs text-muted-foreground">
                            Broadcast when a target price is reached
                          </p>
                        </div>
                        <Switch
                          checked={settings.notifyTargetHit}
                          onCheckedChange={(checked) =>
                            setSettings({ ...settings, notifyTargetHit: checked })
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between space-x-2 rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <Label className="text-sm font-medium">Stop Loss Hit</Label>
                          <p className="text-xs text-muted-foreground">
                            Broadcast when a stop loss is triggered
                          </p>
                        </div>
                        <Switch
                          checked={settings.notifyStopHit}
                          onCheckedChange={(checked) =>
                            setSettings({ ...settings, notifyStopHit: checked })
                          }
                        />
                      </div>

                      <div className="space-y-2 rounded-lg border p-3">
                        <div className="flex items-center gap-2">
                          <Languages className="h-4 w-4 text-primary" />
                          <Label className="text-sm font-medium">Broadcast Language</Label>
                        </div>
                        <Select
                          value={settings.broadcastLanguage}
                          onValueChange={(value: 'en' | 'ar' | 'both') =>
                            setSettings({ ...settings, broadcastLanguage: value })
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="en">English Only</SelectItem>
                            <SelectItem value="ar">Arabic Only (عربي فقط)</SelectItem>
                            <SelectItem value="both">Both Languages</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          onClick={() => saveSettings(channel.id)}
                          disabled={savingSettings}
                          className="flex-1"
                        >
                          {savingSettings && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Save Settings
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setEditingChannel(null)}
                          disabled={savingSettings}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setEditingChannel(channel.id)}
                        className="flex-1"
                      >
                        Edit Settings
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => disconnect(channel.id, channel.audienceType)}
                        disabled={disconnecting}
                      >
                        {disconnecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Disconnect
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}

            <div className="border-t pt-4">
              <h3 className="font-semibold mb-4">Add Another Channel</h3>
              <div className="space-y-4">
                <Alert className="border-blue-500/50 bg-blue-500/10">
                  <AlertCircle className="h-4 w-4 text-blue-500" />
                  <AlertDescription className="text-blue-700 dark:text-blue-400">
                    You can add multiple subscriber channels - one as platform default and others for specific plans.
                  </AlertDescription>
                </Alert>

                <div className="space-y-3 rounded-lg border p-4">
                  <Label htmlFor="audience-type">Channel Type</Label>
                  <Select
                    value={selectedAudienceType}
                    onValueChange={(value: 'public' | 'followers' | 'subscribers') =>
                      setSelectedAudienceType(value)
                    }
                  >
                    <SelectTrigger id="audience-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem
                        value="public"
                        disabled={status.channels.some(c => c.audienceType === 'public' && c.isPlatformDefault)}
                      >
                        Public Channel {status.channels.some(c => c.audienceType === 'public' && c.isPlatformDefault) ? '(Already Connected)' : ''}
                      </SelectItem>
                      <SelectItem
                        value="followers"
                        disabled={status.channels.some(c => c.audienceType === 'followers' && c.isPlatformDefault)}
                      >
                        Followers-Only Channel {status.channels.some(c => c.audienceType === 'followers' && c.isPlatformDefault) ? '(Already Connected)' : ''}
                      </SelectItem>
                      <SelectItem value="subscribers">
                        Subscribers-Only Channel
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {getAudienceTypeDescription(selectedAudienceType)}
                  </p>
                </div>

                  <div className="space-y-2">
                    <Label htmlFor="channel-input">Channel Username or ID</Label>
                    <div className="flex gap-2">
                      <Input
                        id="channel-input"
                        placeholder="@mychannel or -1001234567890"
                        value={channelInput}
                        onChange={(e) => setChannelInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            connectChannel();
                          }
                        }}
                      />
                      <Button
                        onClick={connectChannel}
                        disabled={connecting || !channelInput.trim()}
                      >
                        {connecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Connect
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 rounded-lg border p-3">
                    <Switch
                      id="platform-default"
                      checked={isPlatformDefault}
                      onCheckedChange={setIsPlatformDefault}
                    />
                    <div className="space-y-0.5">
                      <Label htmlFor="platform-default" className="text-sm font-medium cursor-pointer">
                        Set as Platform Default
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Platform default channels receive posts for all {selectedAudienceType}. Uncheck to create a channel for a specific plan.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <Alert>
              <Send className="h-4 w-4" />
              <AlertDescription>
                Connect Telegram channels to automatically broadcast your analyses to different audiences
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/50 p-4">
                <h4 className="font-semibold mb-2">Setup Instructions:</h4>
                <ol className="list-decimal list-inside space-y-2 text-sm">
                  <li>Create Telegram channels for different audience types (public, followers, subscribers)</li>
                  <li>Add <code className="bg-background px-2 py-1 rounded">@AnalyzingHubBot</code> to each channel as an admin</li>
                  <li>Give the bot permission to post messages</li>
                  <li>Select the channel type and enter channel username or ID below</li>
                  <li>Click Connect to verify and activate broadcasting</li>
                </ol>
              </div>

              <Alert className="border-orange-500/50 bg-orange-500/10">
                <AlertCircle className="h-4 w-4 text-orange-500" />
                <AlertDescription className="text-orange-700 dark:text-orange-400">
                  <strong>Important:</strong> The bot must be added as an admin with post permission before connecting
                </AlertDescription>
              </Alert>

              <div className="space-y-3 rounded-lg border p-4">
                <Label htmlFor="audience-type-new">Channel Type</Label>
                <Select
                  value={selectedAudienceType}
                  onValueChange={(value: 'public' | 'followers' | 'subscribers') =>
                    setSelectedAudienceType(value)
                  }
                >
                  <SelectTrigger id="audience-type-new">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public Channel (All Followers)</SelectItem>
                    <SelectItem value="followers">Followers-Only Channel</SelectItem>
                    <SelectItem value="subscribers">Subscribers-Only Channel</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {getAudienceTypeDescription(selectedAudienceType)}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="channel-input">Channel Username or ID</Label>
                <div className="flex gap-2">
                  <Input
                    id="channel-input"
                    placeholder="@mychannel or -1001234567890"
                    value={channelInput}
                    onChange={(e) => setChannelInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        connectChannel();
                      }
                    }}
                  />
                  <Button
                    onClick={connectChannel}
                    disabled={connecting || !channelInput.trim()}
                  >
                    {connecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Connect
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  You can find your channel username in the channel info, or use the numeric channel ID
                </p>
              </div>

              <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-2">Channel Types:</p>
                <ul className="space-y-2 list-disc list-inside">
                  <li><strong>Public:</strong> Broadcasts all public posts to all your followers</li>
                  <li><strong>Followers-Only:</strong> Exclusive content for users who follow you</li>
                  <li><strong>Subscribers-Only:</strong> Premium content for paying subscribers only</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>

    <div className="mt-6">
      <AdChannelsSettings />
    </div>
  </>
  );
}
