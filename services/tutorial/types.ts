import { UserCapabilities } from '@/services/capabilities/types';

export interface TutorialStep {
  title: string;
  titleAr: string;
  content: string;
  contentAr: string;
  imageKey?: string;
  videoUrl?: string;
  deepLink?: string;
  tips?: string[];
  tipsAr?: string[];
  commonMistakes?: string[];
  commonMistakesAr?: string[];
}

export interface TutorialSection {
  id: string;
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  icon: string;
  capabilitiesRequired: (keyof UserCapabilities)[];
  rolesAllowed?: string[];
  estimatedMinutes: number;
  steps: TutorialStep[];
  relatedTourId?: string;
}

export interface TutorialProgress {
  sectionId: string;
  completed: boolean;
  completedAt?: string;
  lastStepSeen: number;
  language: 'en' | 'ar';
}

export interface TourStep {
  route: string;
  selector: string;
  title: string;
  titleAr: string;
  content: string;
  contentAr: string;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  disableBeacon?: boolean;
  spotlightClicks?: boolean;
  waitForSelector?: boolean;
  delay?: number;
}

export interface Tour {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  capabilitiesRequired: (keyof UserCapabilities)[];
  estimatedMinutes: number;
  steps: TourStep[];
}

export interface TourState {
  tourId: string;
  currentStepIndex: number;
  status: 'not_started' | 'in_progress' | 'completed' | 'skipped';
  updatedAt: string;
}

export interface TutorialAnalyticsEvent {
  eventType:
    | 'tour_started'
    | 'tour_completed'
    | 'tour_skipped'
    | 'tour_step_viewed'
    | 'section_viewed'
    | 'section_completed'
    | 'help_clicked'
    | 'search_used';
  eventData?: Record<string, any>;
}
