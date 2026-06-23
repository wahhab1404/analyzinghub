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
import { useLanguage } from '@/lib/i18n/language-context'

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
  const { language } = useLanguage()
  const isAr = language === 'ar'
  if (!standalone && (!analysisId || !indexSymbol)) return null

  const handleComplete = () => {
    onComplete()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto" dir={isAr ? 'rtl' : 'ltr'}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            {indexSymbol && <Badge className="text-sm px-3 py-1">{indexSymbol}</Badge>}
            <DialogTitle>
              {standalone
                ? (isAr ? 'إضافة صفقة مستقلة' : 'Add Standalone Trade')
                : (isAr ? 'إضافة صفقة جديدة' : 'Add New Trade')}
            </DialogTitle>
          </div>
          <DialogDescription>
            {standalone
              ? (isAr ? 'أنشئ صفقة مستقلة دون ربطها بتحليل.' : 'Create a standalone trade without linking to an analysis.')
              : (isAr ? 'أنشئ توصية صفقة جديدة لتحليل المؤشر هذا.' : 'Create a new trade recommendation for this index analysis.')}
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
