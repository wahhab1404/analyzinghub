import { createServiceRoleClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface TelegramNotificationPayload {
  notificationId: string;
  userId: string;
  type: 'target_hit' | 'stop_hit' | 'new_analysis';
  analysisId?: string;
  analyzerName?: string;
  symbol?: string;
  targetNumber?: number;
  targetPrice?: number;
  stopPrice?: number;
  metadata?: Record<string, any>;
}

export class TelegramService {
  private getClient(): SupabaseClient {
    return createServiceRoleClient()
  }

  private get supabase(): SupabaseClient {
    return this.getClient()
  }

  private get supabaseUrl(): string {
    return process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
  }

  private get supabaseServiceKey(): string {
    return process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  }

  async sendNotification(payload: TelegramNotificationPayload): Promise<boolean> {
    try {
      // Check if user has Telegram enabled
      const { data: account } = await this.supabase
        .from('telegram_accounts')
        .select('id')
        .eq('user_id', payload.userId)
        .is('revoked_at', null)
        .maybeSingle();

      if (!account) {
        console.log(`User ${payload.userId} does not have Telegram linked`);
        return false;
      }

      // Get notification preferences
      const { data: prefs } = await this.supabase
        .from('notification_preferences')
        .select('telegram_enabled')
        .eq('user_id', payload.userId)
        .maybeSingle();

      if (!prefs?.telegram_enabled) {
        console.log(`User ${payload.userId} has Telegram notifications disabled`);
        return false;
      }

      // Call the edge function
      const edgeFunctionUrl = `${this.supabaseUrl}/functions/v1/telegram-sender`;
      const response = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.supabaseServiceKey}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!result.ok) {
        console.error('Failed to send Telegram notification:', result.error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error in TelegramService.sendNotification:', error);
      return false;
    }
  }

  async sendBulkNotifications(
    payloads: TelegramNotificationPayload[]
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    // Process notifications in batches to avoid overwhelming the system
    const batchSize = 10;
    for (let i = 0; i < payloads.length; i += batchSize) {
      const batch = payloads.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map((payload) => this.sendNotification(payload))
      );

      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
          success++;
        } else {
          failed++;
        }
      });

      // Small delay between batches
      if (i + batchSize < payloads.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return { success, failed };
  }

  async getDeliveryLogs(userId: string, limit: number = 50) {
    const { data, error } = await this.supabase
      .from('notification_delivery_log')
      .select('*')
      .eq('user_id', userId)
      .eq('channel', 'telegram')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching delivery logs:', error);
      return [];
    }

    return data;
  }

  async getDeliveryStats(userId: string, days: number = 7) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data, error } = await this.supabase
      .from('notification_delivery_log')
      .select('status')
      .eq('user_id', userId)
      .eq('channel', 'telegram')
      .gte('created_at', startDate.toISOString());

    if (error) {
      console.error('Error fetching delivery stats:', error);
      return { total: 0, sent: 0, failed: 0, throttled: 0 };
    }

    const stats = {
      total: data.length,
      sent: data.filter((log) => log.status === 'sent').length,
      failed: data.filter((log) => log.status === 'failed').length,
      throttled: data.filter((log) => log.status === 'throttled').length,
    };

    return stats;
  }
}

export const telegramService = new TelegramService();
