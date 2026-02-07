'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface AdChannel {
  id: string;
  channel_id: string;
  channel_name: string;
  is_active: boolean;
  created_at: string;
}

export function AdChannelsSettings() {
  const [channels, setChannels] = useState<AdChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [newChannelId, setNewChannelId] = useState('');
  const [newChannelName, setNewChannelName] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [channelToDelete, setChannelToDelete] = useState<AdChannel | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchChannels();
  }, []);

  const fetchChannels = async () => {
    try {
      const response = await fetch('/api/telegram/ad-channels');
      if (!response.ok) throw new Error('Failed to fetch channels');

      const data = await response.json();
      setChannels(data);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch ad channels',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddChannel = async () => {
    if (!newChannelId.trim() || !newChannelName.trim()) {
      toast({
        title: 'Missing Information',
        description: 'Please provide both channel ID and name',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/telegram/ad-channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: newChannelId.trim(),
          channelName: newChannelName.trim(),
        }),
      });

      if (!response.ok) throw new Error('Failed to add channel');

      toast({
        title: 'Success',
        description: 'Ad channel added successfully',
      });

      setNewChannelId('');
      setNewChannelName('');
      fetchChannels();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to add channel',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (channel: AdChannel) => {
    try {
      const response = await fetch('/api/telegram/ad-channels', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: channel.id,
          isActive: !channel.is_active,
        }),
      });

      if (!response.ok) throw new Error('Failed to update channel');

      toast({
        title: 'Success',
        description: `Channel ${!channel.is_active ? 'activated' : 'deactivated'}`,
      });

      fetchChannels();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update channel',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteChannel = async () => {
    if (!channelToDelete) return;

    try {
      const response = await fetch(`/api/telegram/ad-channels?id=${channelToDelete.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete channel');

      toast({
        title: 'Success',
        description: 'Ad channel deleted successfully',
      });

      setDeleteDialogOpen(false);
      setChannelToDelete(null);
      fetchChannels();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete channel',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Advertisement Channels</CardTitle>
          <CardDescription>Manage Telegram channels for sending trade advertisements</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>إعلانات الصفقات - Advertisement Channels</CardTitle>
          <CardDescription>
            أضف قنوات تليجرام لإرسال إعلانات صفقاتك الناجحة تلقائيا - Add Telegram channels to send your successful trade advertisements
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="channelId">Channel ID</Label>
                <Input
                  id="channelId"
                  placeholder="@channelname or -100123456789"
                  value={newChannelId}
                  onChange={(e) => setNewChannelId(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="channelName">Display Name</Label>
                <Input
                  id="channelName"
                  placeholder="My Advertisement Channel"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                />
              </div>
            </div>
            <Button onClick={handleAddChannel} disabled={submitting}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
              ) : (
                <Plus className="h-4 w-4 ml-2" />
              )}
              Add Channel
            </Button>
          </div>

          {channels.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No ad channels configured yet
            </div>
          ) : (
            <div className="space-y-3">
              {channels.map((channel) => (
                <div
                  key={channel.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{channel.channel_name}</span>
                      <Badge variant={channel.is_active ? 'default' : 'secondary'}>
                        {channel.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground font-mono">
                      {channel.channel_id}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleToggleActive(channel)}
                      title={channel.is_active ? 'Deactivate' : 'Activate'}
                    >
                      {channel.is_active ? (
                        <ToggleRight className="h-4 w-4 text-green-600" />
                      ) : (
                        <ToggleLeft className="h-4 w-4 text-gray-400" />
                      )}
                    </Button>
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={() => {
                        setChannelToDelete(channel);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Ad Channel</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this advertisement channel? This action cannot be undone.
              {channelToDelete && (
                <div className="mt-3 p-3 bg-muted rounded-md">
                  <div className="font-medium">{channelToDelete.channel_name}</div>
                  <div className="text-xs text-muted-foreground font-mono mt-1">
                    {channelToDelete.channel_id}
                  </div>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteChannel}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
