'use client';

import { useEffect, useState, useCallback } from 'react';
import Joyride, { CallBackProps, Step, STATUS, ACTIONS, EVENTS } from 'react-joyride';
import { useRouter, usePathname } from 'next/navigation';
import { Tour, TourStep } from '@/services/tutorial/types';
import { TutorialService } from '@/services/tutorial/tutorial.service';

interface TourEngineProps {
  tour: Tour | null;
  userId: string;
  language: 'en' | 'ar';
  onComplete?: () => void;
  onSkip?: () => void;
}

export function TourEngine({ tour, userId, language, onComplete, onSkip }: TourEngineProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [steps, setSteps] = useState<Step[]>([]);

  useEffect(() => {
    if (!tour) {
      setRun(false);
      return;
    }

    const convertedSteps: Step[] = tour.steps.map((step: TourStep) => ({
      target: step.selector,
      content: language === 'ar' ? step.contentAr : step.content,
      title: language === 'ar' ? step.titleAr : step.title,
      placement: step.placement || 'auto',
      disableBeacon: step.disableBeacon ?? true,
      spotlightClicks: step.spotlightClicks ?? false,
      disableOverlayClose: true,
      hideCloseButton: false,
      showSkipButton: true,
      locale: {
        back: language === 'ar' ? 'السابق' : 'Back',
        close: language === 'ar' ? 'إغلاق' : 'Close',
        last: language === 'ar' ? 'إنهاء' : 'Finish',
        next: language === 'ar' ? 'التالي' : 'Next',
        skip: language === 'ar' ? 'تخطي' : 'Skip',
      },
    }));

    setSteps(convertedSteps);

    TutorialService.getTourState(userId, tour.id).then(state => {
      if (state && state.status === 'in_progress') {
        setStepIndex(state.currentStepIndex);
      } else {
        TutorialService.startTour(userId, tour.id);
      }
      setRun(true);
    });
  }, [tour, userId, language]);

  const handleJoyrideCallback = useCallback(
    async (data: CallBackProps) => {
      const { status, type, index, action } = data;

      if (!tour) return;

      const currentStep = tour.steps[index];
      const currentRoute = currentStep?.route;

      if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
        const nextIndex = index + (action === ACTIONS.PREV ? -1 : 1);

        if (nextIndex < tour.steps.length && nextIndex >= 0) {
          const nextStep = tour.steps[nextIndex];
          const nextRoute = nextStep.route;

          if (currentRoute !== nextRoute) {
            setRun(false);
            router.push(nextRoute);

            setTimeout(() => {
              setStepIndex(nextIndex);
              setRun(true);
            }, 1000);
          } else {
            setStepIndex(nextIndex);
          }

          await TutorialService.updateTourProgress(userId, tour.id, nextIndex);
        }
      }

      if (status === STATUS.FINISHED) {
        await TutorialService.completeTour(userId, tour.id);
        setRun(false);
        onComplete?.();
      }

      if (status === STATUS.SKIPPED) {
        await TutorialService.skipTour(userId, tour.id);
        setRun(false);
        onSkip?.();
      }
    },
    [tour, userId, router, onComplete, onSkip]
  );

  if (!tour || steps.length === 0) return null;

  return (
    <Joyride
      steps={steps}
      run={run}
      stepIndex={stepIndex}
      continuous
      showProgress
      showSkipButton
      callback={handleJoyrideCallback}
      styles={{
        options: {
          zIndex: 10000,
          primaryColor: '#2563eb',
          textColor: '#1f2937',
          backgroundColor: '#ffffff',
          arrowColor: '#ffffff',
        },
        tooltip: {
          borderRadius: 8,
          padding: 20,
        },
        tooltipContainer: {
          textAlign: language === 'ar' ? 'right' : 'left',
          direction: language === 'ar' ? 'rtl' : 'ltr',
        },
        buttonNext: {
          backgroundColor: '#2563eb',
          borderRadius: 6,
          padding: '8px 16px',
        },
        buttonBack: {
          marginRight: language === 'ar' ? 0 : 8,
          marginLeft: language === 'ar' ? 8 : 0,
          color: '#6b7280',
        },
        buttonSkip: {
          color: '#6b7280',
        },
      }}
      floaterProps={{
        disableAnimation: false,
        styles: {
          floater: {
            filter: 'none',
          },
        },
      }}
    />
  );
}
