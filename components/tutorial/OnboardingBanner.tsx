'use client';

import { useState, useEffect } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { X, Rocket } from 'lucide-react';
import { TutorialService } from '@/services/tutorial/tutorial.service';
import { useLanguage } from '@/lib/i18n/language-context';

interface OnboardingBannerProps {
  userId: string;
  onStartTour: () => void;
}

export function OnboardingBanner({ userId, onStartTour }: OnboardingBannerProps) {
  const { language } = useLanguage();
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const checkOnboarding = async () => {
      const shouldShow = await TutorialService.shouldShowOnboarding(userId);
      const hasDismissed = localStorage.getItem(`onboarding-dismissed-${userId}`) === 'true';

      if (shouldShow && !hasDismissed) {
        setShow(true);
      }
    };

    checkOnboarding();
  }, [userId]);

  const handleStart = () => {
    setShow(false);
    onStartTour();
    localStorage.setItem(`onboarding-dismissed-${userId}`, 'true');
  };

  const handleDismiss = () => {
    setShow(false);
    setDismissed(true);
    localStorage.setItem(`onboarding-dismissed-${userId}`, 'true');
  };

  if (!show || dismissed) return null;

  return (
    <Alert className="mb-6 border-primary bg-primary/5">
      <Rocket className="h-5 w-5 text-primary" />
      <AlertTitle className="text-lg font-semibold mb-2 flex items-center justify-between">
        <span>
          {language === 'ar'
            ? 'مرحباً بك في AnalyzingHub!'
            : 'Welcome to AnalyzingHub!'}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={handleDismiss}
        >
          <X className="h-4 w-4" />
        </Button>
      </AlertTitle>
      <AlertDescription className="space-y-3">
        <p>
          {language === 'ar'
            ? 'هل تريد جولة سريعة لمدة دقيقتين لتتعلم كيفية استخدام المنصة؟'
            : 'Would you like a quick 2-minute tour to learn how to use the platform?'}
        </p>
        <div className="flex gap-3">
          <Button onClick={handleStart} size="sm">
            {language === 'ar' ? 'ابدأ الجولة' : 'Start Tour'}
          </Button>
          <Button onClick={handleDismiss} variant="outline" size="sm">
            {language === 'ar' ? 'لاحقاً' : 'Later'}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
