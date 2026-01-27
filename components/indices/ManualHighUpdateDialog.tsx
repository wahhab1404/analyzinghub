'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, TrendingUp, DollarSign, AlertCircle, CheckCircle2 } from 'lucide-react';

interface ManualHighUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trade: any;
  onSuccess?: () => void;
}

export function ManualHighUpdateDialog({
  open,
  onOpenChange,
  trade,
  onSuccess
}: ManualHighUpdateDialogProps) {
  const [manualPrice, setManualPrice] = useState('');
  const [manualHigh, setManualHigh] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [result, setResult] = useState<any>(null);

  const entryPrice = trade?.entry_contract_snapshot?.mid || trade?.entry_contract_snapshot?.last || 0;
  const currentHigh = trade?.contract_high_since || trade?.max_contract_price || entryPrice;
  const currentPrice = trade?.current_contract || entryPrice;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setResult(null);

    const priceValue = parseFloat(manualPrice);
    const highValue = parseFloat(manualHigh);

    if (!priceValue && !highValue) {
      setError('Please enter at least one price');
      return;
    }

    if (priceValue && priceValue <= 0) {
      setError('Price must be greater than 0');
      return;
    }

    if (highValue && highValue <= 0) {
      setError('High price must be greater than 0');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`/api/indices/trades/${trade.id}/manual-price`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manualPrice: priceValue || undefined,
          manualHigh: highValue || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update prices');
      }

      setSuccess(true);
      setResult(data);
      setManualPrice('');
      setManualHigh('');

      if (onSuccess) {
        onSuccess();
      }

      setTimeout(() => {
        onOpenChange(false);
        setSuccess(false);
        setResult(null);
      }, 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update prices');
    } finally {
      setLoading(false);
    }
  };

  const calculateProfit = (price: number) => {
    if (!price || !entryPrice || entryPrice === 0) return null;
    const profitPercent = ((price - entryPrice) / entryPrice) * 100;
    const profitDollars = (price - entryPrice) * (trade?.qty || 1) * 100;
    return { profitPercent, profitDollars };
  };

  const priceProfit = manualPrice ? calculateProfit(parseFloat(manualPrice)) : null;
  const highProfit = manualHigh ? calculateProfit(parseFloat(manualHigh)) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Manual Price Update
          </DialogTitle>
          <DialogDescription>
            Update the contract price manually when the market is closed or data is delayed
          </DialogDescription>
        </DialogHeader>

        {success && result && (
          <Alert className="border-green-200 bg-green-50 dark:bg-green-900/20">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800 dark:text-green-200">
              {result.isWinningTrade && (
                <div className="font-semibold mb-1">
                  🎉 Winning Trade! Hit $100 profit milestone!
                </div>
              )}
              {result.newHighDetected && !result.isWinningTrade && (
                <div className="font-semibold mb-1">
                  📈 New High Detected!
                </div>
              )}
              Prices updated successfully. Telegram notification queued.
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3 bg-muted/50 p-4 rounded-lg">
            <h4 className="font-semibold text-sm">Current Trade Info</h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-muted-foreground">Entry Price</div>
                <div className="font-semibold">${entryPrice.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Current Price</div>
                <div className="font-semibold">${currentPrice.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Current High</div>
                <div className="font-semibold">${currentHigh.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Quantity</div>
                <div className="font-semibold">{trade?.qty || 1}</div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="manualPrice">Current Price (Optional)</Label>
            <Input
              id="manualPrice"
              type="number"
              step="0.01"
              placeholder={`Current: $${currentPrice.toFixed(2)}`}
              value={manualPrice}
              onChange={(e) => setManualPrice(e.target.value)}
              disabled={loading}
            />
            {priceProfit && (
              <div className="flex items-center gap-2 text-sm">
                <DollarSign className="h-3 w-3" />
                <span className={priceProfit.profitPercent >= 0 ? 'text-green-600' : 'text-red-600'}>
                  {priceProfit.profitPercent >= 0 ? '+' : ''}{priceProfit.profitPercent.toFixed(2)}%
                  ({priceProfit.profitDollars >= 0 ? '+' : ''}${priceProfit.profitDollars.toFixed(2)})
                </span>
                {priceProfit.profitDollars >= 100 && (
                  <span className="px-2 py-0.5 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded-full text-xs font-semibold">
                    WINNER 🎉
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="manualHigh">
              New High Price (Optional)
              <span className="text-xs text-muted-foreground ml-2">
                Must be higher than ${currentHigh.toFixed(2)}
              </span>
            </Label>
            <Input
              id="manualHigh"
              type="number"
              step="0.01"
              placeholder={`Current high: $${currentHigh.toFixed(2)}`}
              value={manualHigh}
              onChange={(e) => setManualHigh(e.target.value)}
              disabled={loading}
            />
            {highProfit && (
              <div className="flex items-center gap-2 text-sm">
                <TrendingUp className="h-3 w-3" />
                <span className={highProfit.profitPercent >= 0 ? 'text-green-600' : 'text-red-600'}>
                  {highProfit.profitPercent >= 0 ? '+' : ''}{highProfit.profitPercent.toFixed(2)}%
                  ({highProfit.profitDollars >= 0 ? '+' : ''}${highProfit.profitDollars.toFixed(2)})
                </span>
                {highProfit.profitDollars >= 100 && (
                  <span className="px-2 py-0.5 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded-full text-xs font-semibold">
                    WINNER 🎉
                  </span>
                )}
              </div>
            )}
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              <strong>Note:</strong> Manual updates are typically used when the market is closed (weekends, holidays)
              or when automatic tracking has delays. The system will automatically generate a snapshot and send
              notifications if this creates a new high or reaches the $100 profit milestone.
            </AlertDescription>
          </Alert>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || (!manualPrice && !manualHigh)}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update Prices
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
