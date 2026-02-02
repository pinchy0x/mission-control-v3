/**
 * Mission Control SDK - Triggers Module
 */

import type { MCHttpClient } from './client';
import type {
  Trigger,
  ClaimTriggerRequest,
  UpdateTriggerRequest,
  ListTriggersOptions,
  TriggersResponse,
  ClaimTriggersResponse,
  SuccessResponse,
} from './types';

/**
 * Triggers API module for event-driven agent execution
 */
export class TriggersModule {
  constructor(private readonly http: MCHttpClient) {}

  /**
   * Poll and claim pending triggers for processing
   * 
   * Atomically claims triggers to prevent double-processing.
   * Claimed triggers move to 'processing' status.
   */
  async poll(options: ClaimTriggerRequest = {}): Promise<ClaimTriggersResponse> {
    return this.http.post<ClaimTriggersResponse>('/api/triggers/claim', options);
  }

  /**
   * Acknowledge/update a trigger after processing
   * 
   * Call with status='completed' on success, status='failed' with error on failure
   */
  async acknowledge(triggerId: string, data: UpdateTriggerRequest): Promise<void> {
    await this.http.patch<SuccessResponse>(`/api/triggers/${triggerId}`, data);
  }

  /**
   * Mark a trigger as completed
   */
  async complete(triggerId: string): Promise<void> {
    await this.acknowledge(triggerId, { status: 'completed' });
  }

  /**
   * Mark a trigger as failed with error message
   */
  async fail(triggerId: string, error: string): Promise<void> {
    await this.acknowledge(triggerId, { status: 'failed', error });
  }

  /**
   * List recent triggers (for debugging/monitoring)
   */
  async list(options: ListTriggersOptions = {}): Promise<Trigger[]> {
    const params = new URLSearchParams();
    if (options.status) params.set('status', options.status);
    if (options.limit) params.set('limit', String(options.limit));
    
    const query = params.toString();
    const path = query ? `/api/triggers?${query}` : '/api/triggers';
    
    const response = await this.http.get<TriggersResponse>(path);
    return response.triggers;
  }

  /**
   * Poll for pending triggers and process them with a handler
   * 
   * @example
   * ```ts
   * await triggers.processWithHandler(async (trigger) => {
   *   console.log('Processing:', trigger.event_type);
   *   // Handle the trigger...
   * });
   * ```
   */
  async processWithHandler(
    handler: (trigger: Trigger) => Promise<void>,
    options: { limit?: number; continueOnError?: boolean } = {}
  ): Promise<{ processed: number; failed: number }> {
    const { limit = 5, continueOnError = true } = options;
    
    const { triggers } = await this.poll({ limit });
    
    let processed = 0;
    let failed = 0;
    
    for (const trigger of triggers) {
      try {
        await handler(trigger);
        await this.complete(trigger.id);
        processed++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await this.fail(trigger.id, errorMessage);
        failed++;
        
        if (!continueOnError) {
          throw error;
        }
      }
    }
    
    return { processed, failed };
  }

  /**
   * Parse trigger context JSON safely
   */
  parseContext<T = Record<string, unknown>>(trigger: Trigger): T | null {
    if (!trigger.context) return null;
    
    try {
      return JSON.parse(trigger.context) as T;
    } catch {
      return null;
    }
  }
}
