'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, TrendingUp, Calculator } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface QuickManualTradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function QuickManualTradeDialog({ open, onOpenChange, onSuccess }: QuickManualTradeDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    index: 'SPX',
    strike: '',
    entry: '',
    high: '',
    direction: 'call' as 'call' | 'put',
  });

  const calculateProfit = () => {
    const entry = parseFloat(formData.entry);
    const high = parseFloat(formData.high);

    if (!entry || !high) return { profitPercent: 0, profitDollars: 0 };

    const profitPercent = ((high - entry) / entry) * 100;
    const profitDollars = (high - entry) * 100;

    return { profitPercent, profitDollars };
  };

  const { profitPercent, profitDollars } = calculateProfit();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch('/api/indices/trades/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          index_symbol: formData.index,
          strike: parseFloat(formData.strike),
          entry_price: parseFloat(formData.entry),
          high_price: parseFloat(formData.high),
          direction: formData.direction,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create manual trade');
      }

      setFormData({ index: 'SPX', strike: '', entry: '', high: '', direction: 'call' });
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Quick Manual Trade Entry
          </DialogTitle>
          <DialogDescription>
            Add a trade manually with Index, Strike, Entry, and High. Profit will be calculated automatically.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="index">Index</Label>
              <Select
                value={formData.index}
                onValueChange={(value) => setFormData({ ...formData, index: value })}
              >
                <SelectTrigger id="index">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SPX">SPX</SelectItem>
                  <SelectItem value="NDX">NDX</SelectItem>
                  <SelectItem value="RUT">RUT</SelectItem>
                  <SelectItem value="DJI">DJI</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="direction">Direction</Label>
              <Select
                value={formData.direction}
                onValueChange={(value: 'call' | 'put') => setFormData({ ...formData, direction: value })}
              >
                <SelectTrigger id="direction">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="call">Call</SelectItem>
                  <SelectItem value="put">Put</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="strike">Strike Price</Label>
            <Input
              id="strike"
              type="number"
              step="0.01"
              placeholder="6900"
              value={formData.strike}
              onChange={(e) => setFormData({ ...formData, strike: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="entry">Entry Price</Label>
              <Input
                id="entry"
                type="number"
                step="0.01"
                placeholder="3.50"
                value={formData.entry}
                onChange={(e) => setFormData({ ...formData, entry: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="high">High Price</Label>
              <Input
                id="high"
                type="number"
                step="0.01"
                placeholder="7.00"
                value={formData.high}
                onChange={(e) => setFormData({ ...formData, high: e.target.value })}
                required
              />
            </div>
          </div>

          {formData.entry && formData.high && (
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Calculator className="h-4 w-4" />
                Auto-Calculated Profit
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Profit %</div>
                  <div className={`text-lg font-bold ${profitPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {profitPercent >= 0 ? '+' : ''}{profitPercent.toFixed(2)}%
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Profit $</div>
                  <div className={`text-lg font-bold ${profitDollars >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {profitDollars >= 0 ? '+' : ''}${profitDollars.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Trade'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
