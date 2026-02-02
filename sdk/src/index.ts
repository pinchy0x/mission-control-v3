/**
 * @quantacodes/mc-sdk - Mission Control v3 SDK
 * 
 * TypeScript SDK for Mission Control API with retry, typed errors, and full API coverage.
 * 
 * @example
 * ```ts
 * import { MCClient } from '@quantacodes/mc-sdk';
 * 
 * const mc = new MCClient({
 *   baseURL: 'https://mc-v3-api.example.workers.dev',
 *   token: 'your-api-token'
 * });
 * 
 * // List tasks
 * const tasks = await mc.tasks.list({ status: 'in_progress' });
 * 
 * // Post a message
 * await mc.messages.send(taskId, agentId, 'Hello @Other-Agent!');
 * 
 * // Poll for triggers
 * const { triggers } = await mc.triggers.poll();
 * ```
 */

import { MCHttpClient } from './client';
import { TasksModule } from './tasks';
import { MessagesModule } from './messages';
import { TriggersModule } from './triggers';
import { NotificationsModule } from './notifications';
import { AgentsModule } from './agents';
import type {
  MCClientConfig,
  StatsResponse,
  FullStatsResponse,
  ActivitiesResponse,
  Activity,
  Tag,
  TagsResponse,
} from './types';

// Re-export all types
export * from './types';

// Re-export all errors
export * from './errors';

// Re-export modules for advanced usage
export { MCHttpClient } from './client';
export { TasksModule } from './tasks';
export { MessagesModule } from './messages';
export { TriggersModule } from './triggers';
export { NotificationsModule } from './notifications';
export { AgentsModule } from './agents';

/**
 * Mission Control SDK Client
 * 
 * Main entry point for interacting with Mission Control API.
 */
export class MCClient {
  private readonly http: MCHttpClient;

  /** Tasks API module */
  public readonly tasks: TasksModule;
  
  /** Messages API module */
  public readonly messages: MessagesModule;
  
  /** Triggers API module */
  public readonly triggers: TriggersModule;
  
  /** Notifications API module */
  public readonly notifications: NotificationsModule;
  
  /** Agents API module */
  public readonly agents: AgentsModule;

  constructor(config: MCClientConfig) {
    this.http = new MCHttpClient(config);
    
    // Initialize modules
    this.tasks = new TasksModule(this.http);
    this.messages = new MessagesModule(this.http);
    this.triggers = new TriggersModule(this.http);
    this.notifications = new NotificationsModule(this.http);
    this.agents = new AgentsModule(this.http);
  }

  /**
   * Health check - verify API is reachable
   */
  async health(): Promise<{ status: string; timestamp: string }> {
    return this.http.get<{ status: string; timestamp: string }>('/health');
  }

  /**
   * Get basic stats (agents active, tasks in queue/progress)
   */
  async getStats(): Promise<StatsResponse> {
    return this.http.get<StatsResponse>('/api/stats');
  }

  /**
   * Get full stats including breakdowns by status/workspace
   */
  async getFullStats(): Promise<FullStatsResponse> {
    return this.http.get<FullStatsResponse>('/api/stats/full');
  }

  /**
   * Get activity feed
   */
  async getActivities(options: { limit?: number; offset?: number } = {}): Promise<Activity[]> {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', String(options.limit));
    if (options.offset) params.set('offset', String(options.offset));
    
    const query = params.toString();
    const path = query ? `/api/activities?${query}` : '/api/activities';
    
    const response = await this.http.get<ActivitiesResponse>(path);
    return response.activities;
  }

  /**
   * Get all tags
   */
  async getTags(): Promise<{ tags: Tag[]; colors: string[] }> {
    return this.http.get<TagsResponse>('/api/tags');
  }

  /**
   * Get the underlying HTTP client for advanced usage
   */
  getHttpClient(): MCHttpClient {
    return this.http;
  }
}

// Default export
export default MCClient;
