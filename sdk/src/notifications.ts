/**
 * Mission Control SDK - Notifications Module
 */

import type { MCHttpClient } from './client';
import type {
  Notification,
  ListNotificationsOptions,
  NotificationsResponse,
  SuccessResponse,
  Subscription,
  SubscriptionsResponse,
} from './types';

/**
 * Notifications API module
 */
export class NotificationsModule {
  constructor(private readonly http: MCHttpClient) {}

  /**
   * List notifications for an agent
   */
  async list(agentId: string, options: ListNotificationsOptions = {}): Promise<Notification[]> {
    const params = new URLSearchParams();
    if (options.unread) params.set('unread', 'true');
    
    const query = params.toString();
    const path = query 
      ? `/api/notifications/${agentId}?${query}` 
      : `/api/notifications/${agentId}`;
    
    const response = await this.http.get<NotificationsResponse>(path);
    return response.notifications;
  }

  /**
   * Get unread notifications for an agent
   */
  async listUnread(agentId: string): Promise<Notification[]> {
    return this.list(agentId, { unread: true });
  }

  /**
   * Mark a notification as read
   */
  async markRead(notificationId: string): Promise<void> {
    await this.http.post<SuccessResponse>(`/api/notifications/${notificationId}/read`);
  }

  /**
   * Mark a notification as delivered
   */
  async markDelivered(notificationId: string): Promise<void> {
    await this.http.post<SuccessResponse>(`/api/notifications/${notificationId}/delivered`);
  }

  /**
   * Mark multiple notifications as read
   */
  async markManyRead(notificationIds: string[]): Promise<void> {
    await Promise.all(notificationIds.map(id => this.markRead(id)));
  }

  /**
   * Get count of unread notifications
   */
  async getUnreadCount(agentId: string): Promise<number> {
    const notifications = await this.listUnread(agentId);
    return notifications.length;
  }

  /**
   * Get agent's task subscriptions
   */
  async getSubscriptions(agentId: string): Promise<Subscription[]> {
    const response = await this.http.get<SubscriptionsResponse>(`/api/subscriptions/${agentId}`);
    return response.subscriptions;
  }

  /**
   * Process notifications with a handler
   * 
   * @example
   * ```ts
   * await notifications.processUnread(agentId, async (notification) => {
   *   if (notification.type === 'mention') {
   *     // Handle mention...
   *   }
   * });
   * ```
   */
  async processUnread(
    agentId: string,
    handler: (notification: Notification) => Promise<void>,
    options: { markAsRead?: boolean; continueOnError?: boolean } = {}
  ): Promise<{ processed: number; failed: number }> {
    const { markAsRead = true, continueOnError = true } = options;
    
    const notifications = await this.listUnread(agentId);
    
    let processed = 0;
    let failed = 0;
    
    for (const notification of notifications) {
      try {
        await handler(notification);
        if (markAsRead) {
          await this.markRead(notification.id);
        }
        processed++;
      } catch (error) {
        failed++;
        if (!continueOnError) {
          throw error;
        }
      }
    }
    
    return { processed, failed };
  }

  /**
   * Filter notifications by type
   */
  filterByType(notifications: Notification[], type: Notification['type']): Notification[] {
    return notifications.filter(n => n.type === type);
  }

  /**
   * Group notifications by task
   */
  groupByTask(notifications: Notification[]): Map<string | null, Notification[]> {
    const groups = new Map<string | null, Notification[]>();
    
    for (const notification of notifications) {
      const taskId = notification.task_id ?? null;
      const existing = groups.get(taskId) || [];
      existing.push(notification);
      groups.set(taskId, existing);
    }
    
    return groups;
  }
}
