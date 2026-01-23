'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, TrendingUp, RefreshCcw, DollarSign, Package } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface TradeReentryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingTrade: {
    trade_id: string
    entry_price: number
    qty: number
    entry_cost_usd: number
    max_profit: number
    max_contract_price: number
  }
  newTrade: {
    entry_price: number
    qty: number
    entry_cost_usd: number
  }
  onDecision: (decision: 'NEW_ENTRY' | 'AVERAGE_ADJUSTMENT') => void
  isProcessing?: boolean
}

export function TradeReentryDialog({
  open,
  onOpenChange,
  existingTrade,
  newTrade,
  onDecision,
  isProcessing = false,
}: TradeReentryDialogProps) {
  const [hoveredOption, setHoveredOption] = useState<string | null>(null)

  // Calculate what would happen with average adjustment
  const combinedQty = existingTrade.qty + newTrade.qty
  const avgEntry = (
    (existingTrade.entry_price * existingTrade.qty + newTrade.entry_price * newTrade.qty) /
    combinedQty
  ).toFixed(2)
  const newTotalCost = parseFloat(avgEntry) * combinedQty * 100

  // Calculate if NEW_ENTRY would close as win or loss
  const wouldCloseAsWin = existingTrade.max_profit >= 100
  const closurePnL = wouldCloseAsWin
    ? existingTrade.max_profit
    : -existingTrade.entry_cost_usd

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-orange-500" />
            Contract Re-Entry Detected
          </DialogTitle>
          <DialogDescription>
            You already have an active trade for this exact contract. Choose how to proceed:
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Existing Trade Info */}
          <Card>
            <CardContent className="pt-4">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Package className="h-4 w-4" />
                Current Active Trade
              </h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Entry Price:</span>
                  <p className="font-semibold">${existingTrade.entry_price.toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Quantity:</span>
                  <p className="font-semibold">{existingTrade.qty} contract(s)</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Total Cost:</span>
                  <p className="font-semibold">${existingTrade.entry_cost_usd.toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Max Profit:</span>
                  <p className={`font-semibold ${existingTrade.max_profit >= 100 ? 'text-green-600' : 'text-gray-600'}`}>
                    ${existingTrade.max_profit.toFixed(2)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* New Entry Info */}
          <Card className="border-blue-200">
            <CardContent className="pt-4">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-600" />
                New Entry
              </h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Entry Price:</span>
                  <p className="font-semibold">${newTrade.entry_price.toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Quantity:</span>
                  <p className="font-semibold">{newTrade.qty} contract(s)</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Decision Options */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Choose Action:</h4>

            {/* Option A: New Entry */}
            <Card
              className={`cursor-pointer transition-all ${
                hoveredOption === 'NEW_ENTRY'
                  ? 'border-red-500 shadow-md'
                  : 'border-gray-200 hover:border-red-300'
              }`}
              onMouseEnter={() => setHoveredOption('NEW_ENTRY')}
              onMouseLeave={() => setHoveredOption(null)}
              onClick={() => !isProcessing && onDecision('NEW_ENTRY')}
            >
              <CardContent className="pt-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h5 className="font-semibold text-base mb-1">New Entry</h5>
                    <p className="text-sm text-muted-foreground mb-3">
                      Close previous trade and start fresh with new entry
                    </p>
                  </div>
                  <Badge variant={wouldCloseAsWin ? 'success' : 'destructive'}>
                    {wouldCloseAsWin ? 'Win' : 'Loss'}
                  </Badge>
                </div>

                <Alert className={wouldCloseAsWin ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
                  <DollarSign className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    <strong>Previous trade will close:</strong>
                    <br />
                    P&L: <span className={wouldCloseAsWin ? 'text-green-700 font-semibold' : 'text-red-700 font-semibold'}>
                      ${closurePnL.toFixed(2)}
                    </span>
                    {wouldCloseAsWin && (
                      <span className="text-green-700"> (using max profit)</span>
                    )}
                    {!wouldCloseAsWin && (
                      <span className="text-red-700"> (total loss)</span>
                    )}
                    <br />
                    <strong>New trade:</strong> Entry ${newTrade.entry_price.toFixed(2)} × {newTrade.qty}
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>

            {/* Option B: Average Adjustment */}
            <Card
              className={`cursor-pointer transition-all ${
                hoveredOption === 'AVERAGE_ADJUSTMENT'
                  ? 'border-blue-500 shadow-md'
                  : 'border-gray-200 hover:border-blue-300'
              }`}
              onMouseEnter={() => setHoveredOption('AVERAGE_ADJUSTMENT')}
              onMouseLeave={() => setHoveredOption(null)}
              onClick={() => !isProcessing && onDecision('AVERAGE_ADJUSTMENT')}
            >
              <CardContent className="pt-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h5 className="font-semibold text-base mb-1 flex items-center gap-2">
                      <RefreshCcw className="h-4 w-4" />
                      Average Adjustment
                    </h5>
                    <p className="text-sm text-muted-foreground mb-3">
                      Merge into current position with weighted average entry
                    </p>
                  </div>
                  <Badge variant="outline">Merge</Badge>
                </div>

                <Alert className="border-blue-200 bg-blue-50">
                  <DollarSign className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    <strong>New averaged position:</strong>
                    <br />
                    Entry: ${avgEntry} per contract
                    <br />
                    Quantity: {combinedQty} contracts (was {existingTrade.qty})
                    <br />
                    Total Cost: ${newTotalCost.toFixed(2)}
                    <br />
                    <span className="text-blue-700 text-xs mt-1 inline-block">
                      High watermark preserved • Win status maintained if already won
                    </span>
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
