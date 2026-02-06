'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Info, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

interface EditHighWatermarkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trade: {
    id: string;
    underlying_index_symbol: string;
    strike?: number;
    option_type?: string;
    contract_high_since?: number;
    max_contract_price?: number;
    status: string;
  };
  onSuccess?: () => void;
}

export function EditHighWatermarkDialog({
  open,
  onOpenChange,
  trade,
  onSuccess,
}: EditHighWatermarkDialogProps) {
  const currentHigh = trade.contract_high_since || trade.max_contract_price || 0;
  const [highWatermark, setHighWatermark] = useState(currentHigh.toString());
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [marketStatus, setMarketStatus] = useState<'open' | 'closed' | null>(null);

  const handleSubmit = async () => {
    const newHigh = parseFloat(highWatermark);

    if (isNaN(newHigh) || newHigh <= 0) {
      toast.error('Please enter a valid positive number');
      return;
    }

    if (newHigh === currentHigh) {
      toast.info('High watermark unchanged');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/indices/trades/${trade.id}/edit-high`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          highWatermark: newHigh,
          reason: reason || 'Manual high watermark adjustment',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update high watermark');
      }

      setMarketStatus(data.marketStatus);

      if (data.telegramNotificationSent) {
        toast.success('High watermark updated and Telegram notification sent!', {
          description: `Market is ${data.marketStatus}. Image ${data.snapshotGenerated ? 'generated successfully' : 'generation failed'}.`,
        });
      } else {
        toast.success('High watermark updated successfully', {
          description: `Market is ${data.marketStatus}. No Telegram notification sent.`,
        });
      }

      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (error: any) {
      console.error('Error updating high watermark:', error);
      toast.error(error.message || 'Failed to update high watermark');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-600" />
            Edit High Watermark
          </DialogTitle>
          <DialogDescription>
            Update the highest contract price for this trade
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <div className="text-sm space-y-1">
                <p><strong>Trade:</strong> {trade.underlying_index_symbol} {trade.strike} {trade.option_type?.toUpperCase()}</p>
                <p><strong>Current High:</strong> ${currentHigh.toFixed(2)}</p>
                <p><strong>Status:</strong> {trade.status}</p>
              </div>
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="highWatermark">New High Price *</Label>
            <Input
              id="highWatermark"
              type="number"
              step="0.01"
              min="0"
              placeholder="Enter new high price"
              value={highWatermark}
              onChange={(e) => setHighWatermark(e.target.value)}
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground">
              This will update the maximum contract price reached since entry
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason (Optional)</Label>
            <Textarea
              id="reason"
              placeholder="Why are you updating the high watermark?"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isSubmitting}
              rows={3}
            />
          </div>

          <Alert variant="default" className="border-blue-200 bg-blue-50">
            <AlertCircle className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-sm text-blue-800">
              <strong>Market Hours Behavior:</strong>
              <ul className="mt-1 ml-4 list-disc space-y-1">
                <li><strong>Market Open:</strong> Updates DB, generates image, sends Telegram notification</li>
                <li><strong>Market Closed:</strong> Updates DB and reports only (no Telegram notification)</li>
              </ul>
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Updating...' : 'Update High Watermark'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
