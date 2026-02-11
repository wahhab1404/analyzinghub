'use client';

import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n/language-context';

interface ContextualHelpProps {
  title: string;
  titleAr: string;
  content: string;
  contentAr: string;
  tourId?: string;
  onStartTour?: (tourId: string) => void;
}

export function ContextualHelp({
  title,
  titleAr,
  content,
  contentAr,
  tourId,
  onStartTour,
}: ContextualHelpProps) {
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);

  const handleShowMe = () => {
    if (tourId && onStartTour) {
      onStartTour(tourId);
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 rounded-full hover:bg-primary/10"
        >
          <HelpCircle className="h-4 w-4 text-muted-foreground hover:text-primary" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80"
        align={language === 'ar' ? 'start' : 'end'}
        side="bottom"
      >
        <div className="space-y-3">
          <h4 className="font-medium text-sm">
            {language === 'ar' ? titleAr : title}
          </h4>
          <p className="text-sm text-muted-foreground">
            {language === 'ar' ? contentAr : content}
          </p>
          {tourId && onStartTour && (
            <Button
              size="sm"
              onClick={handleShowMe}
              className="w-full"
              variant="outline"
            >
              {language === 'ar' ? 'اعرض لي' : 'Show Me'}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
