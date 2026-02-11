import { createClient } from '@/lib/supabase/client';
import { TutorialProgress, TourState, TutorialAnalyticsEvent } from './types';

export class TutorialService {
  static async getTutorialProgress(
    userId: string
  ): Promise<TutorialProgress[]> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('user_tutorial_progress')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      console.error('Error fetching tutorial progress:', error);
      return [];
    }

    return (data || []).map(item => ({
      sectionId: item.section_id,
      completed: !!item.completed_at,
      completedAt: item.completed_at || undefined,
      lastStepSeen: item.last_step_seen || 0,
      language: item.language as 'en' | 'ar',
    }));
  }

  static async getSectionProgress(
    userId: string,
    sectionId: string
  ): Promise<TutorialProgress | null> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('user_tutorial_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('section_id', sectionId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return {
      sectionId: data.section_id,
      completed: !!data.completed_at,
      completedAt: data.completed_at || undefined,
      lastStepSeen: data.last_step_seen || 0,
      language: data.language as 'en' | 'ar',
    };
  }

  static async updateSectionProgress(
    userId: string,
    sectionId: string,
    lastStepSeen: number,
    language: 'en' | 'ar'
  ): Promise<void> {
    const supabase = createClient();

    await supabase
      .from('user_tutorial_progress')
      .upsert({
        user_id: userId,
        section_id: sectionId,
        last_step_seen: lastStepSeen,
        language,
      }, {
        onConflict: 'user_id,section_id'
      });
  }

  static async markSectionComplete(
    userId: string,
    sectionId: string,
    language: 'en' | 'ar'
  ): Promise<void> {
    const supabase = createClient();

    await supabase
      .from('user_tutorial_progress')
      .upsert({
        user_id: userId,
        section_id: sectionId,
        completed_at: new Date().toISOString(),
        language,
      }, {
        onConflict: 'user_id,section_id'
      });

    await this.trackEvent(userId, {
      eventType: 'section_completed',
      eventData: { sectionId, language }
    });
  }

  static async getTourState(
    userId: string,
    tourId: string
  ): Promise<TourState | null> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('user_tour_state')
      .select('*')
      .eq('user_id', userId)
      .eq('tour_id', tourId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return {
      tourId: data.tour_id,
      currentStepIndex: data.current_step_index || 0,
      status: data.status as TourState['status'],
      updatedAt: data.updated_at,
    };
  }

  static async getAllTourStates(
    userId: string
  ): Promise<TourState[]> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('user_tour_state')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      console.error('Error fetching tour states:', error);
      return [];
    }

    return (data || []).map(item => ({
      tourId: item.tour_id,
      currentStepIndex: item.current_step_index || 0,
      status: item.status as TourState['status'],
      updatedAt: item.updated_at,
    }));
  }

  static async startTour(
    userId: string,
    tourId: string
  ): Promise<void> {
    const supabase = createClient();

    await supabase
      .from('user_tour_state')
      .upsert({
        user_id: userId,
        tour_id: tourId,
        current_step_index: 0,
        status: 'in_progress',
      }, {
        onConflict: 'user_id,tour_id'
      });

    await this.trackEvent(userId, {
      eventType: 'tour_started',
      eventData: { tourId }
    });
  }

  static async updateTourProgress(
    userId: string,
    tourId: string,
    currentStepIndex: number
  ): Promise<void> {
    const supabase = createClient();

    await supabase
      .from('user_tour_state')
      .upsert({
        user_id: userId,
        tour_id: tourId,
        current_step_index: currentStepIndex,
        status: 'in_progress',
      }, {
        onConflict: 'user_id,tour_id'
      });

    await this.trackEvent(userId, {
      eventType: 'tour_step_viewed',
      eventData: { tourId, stepIndex: currentStepIndex }
    });
  }

  static async completeTour(
    userId: string,
    tourId: string
  ): Promise<void> {
    const supabase = createClient();

    await supabase
      .from('user_tour_state')
      .upsert({
        user_id: userId,
        tour_id: tourId,
        status: 'completed',
      }, {
        onConflict: 'user_id,tour_id'
      });

    await this.trackEvent(userId, {
      eventType: 'tour_completed',
      eventData: { tourId }
    });
  }

  static async skipTour(
    userId: string,
    tourId: string
  ): Promise<void> {
    const supabase = createClient();

    await supabase
      .from('user_tour_state')
      .upsert({
        user_id: userId,
        tour_id: tourId,
        status: 'skipped',
      }, {
        onConflict: 'user_id,tour_id'
      });

    await this.trackEvent(userId, {
      eventType: 'tour_skipped',
      eventData: { tourId }
    });
  }

  static async trackEvent(
    userId: string,
    event: TutorialAnalyticsEvent
  ): Promise<void> {
    const supabase = createClient();

    await supabase
      .from('tutorial_analytics')
      .insert({
        user_id: userId,
        event_type: event.eventType,
        event_data: event.eventData || {},
      });
  }

  static async getCompletionStats(userId: string): Promise<{
    sectionsCompleted: number;
    toursCompleted: number;
    totalSections: number;
    totalTours: number;
    completionPercentage: number;
  }> {
    const [progress, tourStates] = await Promise.all([
      this.getTutorialProgress(userId),
      this.getAllTourStates(userId),
    ]);

    const sectionsCompleted = progress.filter(p => p.completed).length;
    const toursCompleted = tourStates.filter(t => t.status === 'completed').length;

    return {
      sectionsCompleted,
      toursCompleted,
      totalSections: progress.length,
      totalTours: tourStates.length,
      completionPercentage: progress.length > 0
        ? Math.round((sectionsCompleted / progress.length) * 100)
        : 0,
    };
  }

  static async shouldShowOnboarding(userId: string): Promise<boolean> {
    const tourStates = await this.getAllTourStates(userId);
    const hasStartedAnyTour = tourStates.length > 0;

    return !hasStartedAnyTour;
  }
}
