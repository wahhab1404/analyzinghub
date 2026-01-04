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
  analysisId: string | null
  indexSymbol: string | null
  onComplete: () => void
}

export function NewTradeDialog({
  open,
  onOpenChange,
  analysisId,
  indexSymbol,
  onComplete
}: NewTradeDialogProps) {
  if (!analysisId || !indexSymbol) return null

  const handleComplete = () => {
    onComplete()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Badge className="text-sm px-3 py-1">{indexSymbol}</Badge>
            <DialogTitle>Add New Trade</DialogTitle>
          </div>
          <DialogDescription>
            Create a new trade recommendation for this index analysis.
          </DialogDescription>
        </DialogHeader>

        <AddTradeForm
          analysisId={analysisId}
          indexSymbol={indexSymbol}
          onComplete={handleComplete}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
