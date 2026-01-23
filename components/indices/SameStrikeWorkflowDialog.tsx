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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, TrendingUp, Calculator } from 'lucide-react';

interface ExistingTrade {
  id: string;
  entryPrice: number;
  currentPrice: number;
  highestPrice: number;
  entryCost: number;
  status: string;
}

interface SameStrikeWorkflowDialogProps {
  open: boolean;
  onClose: () => void;
  existingTrade: ExistingTrade;
  newEntryPrice: number;
  onResolve: (action: 'NEW_TRADE' | 'AVERAGE_ENTRY') => Promise<void>;
}

export function SameStrikeWorkflowDialog({
  open,
  onClose,
  existingTrade,
  newEntryPrice,
  onResolve,
}: SameStrikeWorkflowDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAction = async (action: 'NEW_TRADE' | 'AVERAGE_ENTRY') => {
    try {
      setLoading(true);
      setError(null);
      await onResolve(action);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to process action');
    } finally {
      setLoading(false);
    }
  };

  const peakProfit = ((existingTrade.highestPrice - existingTrade.entryPrice) * 100).toFixed(2);
  const averagedPrice = ((existingTrade.entryPrice + newEntryPrice) / 2).toFixed(2);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            Active Trade Exists for This Strike
          </DialogTitle>
          <DialogDescription>
            You already have an active trade for this strike/expiry. Choose how to proceed:
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Alert>
            <AlertDescription>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Existing Entry:</span>
                  <span className="font-medium">${existingTrade.entryPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current Price:</span>
                  <span className="font-medium">${existingTrade.currentPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Peak Price:</span>
                  <span className="font-medium text-green-600">
                    ${existingTrade.highestPrice.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Peak Profit:</span>
                  <span className="font-medium text-green-600">${peakProfit}</span>
                </div>
              </div>
            </AlertDescription>
          </Alert>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4">
            <div className="border rounded-lg p-4 space-y-2">
              <div className="flex items-start gap-3">
                <div className="mt-1">
                  <TrendingUp className="h-5 w-5 text-blue-500" />
                </div>
                <div className="flex-1 space-y-2">
                  <h4 className="font-semibold">Option 1: New Trade</h4>
                  <p className="text-sm text-muted-foreground">
                    Close the previous trade at its <strong>peak price (${existingTrade.highestPrice.toFixed(2)})</strong> and create a new trade with the current entry price.
                  </p>
                  <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                    <li>Previous trade will be marked as closed</li>
                    <li>P&L calculated at peak price: ${peakProfit}</li>
                    <li>New trade starts fresh with new entry</li>
                    <li>Telegram notification sent for closure</li>
                  </ul>
                  <Button
                    onClick={() => handleAction('NEW_TRADE')}
                    disabled={loading}
                    className="w-full mt-2"
                    variant="default"
                  >
                    {loading ? 'Processing...' : 'Close Old & Create New Trade'}
                  </Button>
                </div>
              </div>
            </div>

            <div className="border rounded-lg p-4 space-y-2">
              <div className="flex items-start gap-3">
                <div className="mt-1">
                  <Calculator className="h-5 w-5 text-purple-500" />
                </div>
                <div className="flex-1 space-y-2">
                  <h4 className="font-semibold">Option 2: Average Entry</h4>
                  <p className="text-sm text-muted-foreground">
                    Add this as a second entry and average the entry prices. Keep the same trade active.
                  </p>
                  <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                    <li>Old entry: ${existingTrade.entryPrice.toFixed(2)}</li>
                    <li>New entry: ${newEntryPrice.toFixed(2)}</li>
                    <li>Averaged entry: ${averagedPrice}</li>
                    <li>Trade continues with averaged calculation</li>
                    <li>Telegram notification sent for averaging</li>
                  </ul>
                  <Button
                    onClick={() => handleAction('AVERAGE_ENTRY')}
                    disabled={loading}
                    className="w-full mt-2"
                    variant="outline"
                  >
                    {loading ? 'Processing...' : 'Average Entry Prices'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
