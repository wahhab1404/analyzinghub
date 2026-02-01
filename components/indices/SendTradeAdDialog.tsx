'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Send } from 'lucide-react';

interface AdChannel {
  id: string;
  channel_id: string;
  channel_name: string;
  is_active: boolean;
}

interface SendTradeAdDialogProps {
  tradeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SendTradeAdDialog({ tradeId, open, onOpenChange }: SendTradeAdDialogProps) {
  const [channels, setChannels] = useState<AdChannel[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchChannels();
    }
  }, [open]);

  const fetchChannels = async () => {
    setFetching(true);
    try {
      const response = await fetch('/api/telegram/ad-channels');
      if (!response.ok) throw new Error('Failed to fetch channels');

      const data = await response.json();
      setChannels(data.filter((ch: AdChannel) => ch.is_active));
      setSelectedChannels(data.filter((ch: AdChannel) => ch.is_active).map((ch: AdChannel) => ch.channel_id));
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch advertisement channels',
        variant: 'destructive',
      });
    } finally {
      setFetching(false);
    }
  };

  const handleToggleChannel = (channelId: string) => {
    setSelectedChannels(prev =>
      prev.includes(channelId)
        ? prev.filter(id => id !== channelId)
        : [...prev, channelId]
    );
  };

  const handleSendAd = async () => {
    if (selectedChannels.length === 0) {
      toast({
        title: 'No Channels Selected',
        description: 'Please select at least one channel',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/telegram/send-trade-ad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tradeId,
          channelIds: selectedChannels,
        }),
      });

      if (!response.ok) throw new Error('Failed to send advertisement');

      const result = await response.json();

      toast({
        title: 'Advertisement Sent',
        description: `Sent to ${result.totalSent} channel(s)${result.totalFailed > 0 ? `, ${result.totalFailed} failed` : ''}`,
      });

      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to send advertisement',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>إرسال إعلان للقنوات</DialogTitle>
          <DialogDescription>
            اختر القنوات التي تريد إرسال إعلان الصفقة إليها
          </DialogDescription>
        </DialogHeader>

        {fetching ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : channels.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            لا توجد قنوات إعلانية نشطة
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-3">
              {channels.map((channel) => (
                <div key={channel.id} className="flex items-center space-x-2 space-x-reverse">
                  <Checkbox
                    id={channel.id}
                    checked={selectedChannels.includes(channel.channel_id)}
                    onCheckedChange={() => handleToggleChannel(channel.channel_id)}
                  />
                  <label
                    htmlFor={channel.id}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    {channel.channel_name}
                  </label>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleSendAd}
                disabled={loading || selectedChannels.length === 0}
                className="flex-1"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin ml-2" />
                ) : (
                  <Send className="h-4 w-4 ml-2" />
                )}
                إرسال الإعلان
              </Button>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                إلغاء
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
