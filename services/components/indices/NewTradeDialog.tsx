'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { AddTradeForm } from './AddTradeForm'

interface NewTradeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  analysisId?: string | null
  indexSymbol?: string | null
  onComplete: () => void
  standalone?: boolean
}

export function NewTradeDialog({
  open,
  onOpenChange,
  analysisId,
  indexSymbol,
  onComplete,
  standalone = false
}: NewTradeDialogProps) {
  if (!standalone && (!analysisId || !indexSymbol)) return null

  const handleComplete = () => {
    onComplete()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {indexSymbol && <Badge className="text-sm px-3 py-1">{indexSymbol}</Badge>}
            <DialogTitle>{standalone ? 'Add Standalone Trade' : 'Add New Trade'}</DialogTitle>
          </div>
          <DialogDescription>
            {standalone
              ? 'Create a standalone trade without linking to an analysis.'
              : 'Create a new trade recommendation for this index analysis.'}
          </DialogDescription>
        </DialogHeader>

        <AddTradeForm
          analysisId={analysisId}
          indexSymbol={indexSymbol}
          onComplete={handleComplete}
          onCancel={() => onOpenChange(false)}
          standalone={standalone}
        />
      </DialogContent>
    </Dialog>
  )
}
