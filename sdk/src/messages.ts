/**
 * Mission Control SDK - Messages Module
 */

import type { MCHttpClient } from './client';
import type {
  Message,
  CreateMessageRequest,
  MessagesResponse,
  IdResponse,
} from './types';

/**
 * Messages API module
 */
export class MessagesModule {
  constructor(private readonly http: MCHttpClient) {}

  /**
   * List messages for a task
   */
  async list(taskId: string): Promise<Message[]> {
    const response = await this.http.get<MessagesResponse>(`/api/tasks/${taskId}/messages`);
    return response.messages;
  }

  /**
   * Post a message to a task
   * 
   * @mentions - Include @AgentName in content to mention agents
   * Agent will be auto-subscribed to task after posting
   */
  async post(taskId: string, data: CreateMessageRequest): Promise<string> {
    const response = await this.http.post<IdResponse>(`/api/tasks/${taskId}/messages`, data);
    return response.id;
  }

  /**
   * Convenience method to post a message
   */
  async send(taskId: string, fromAgentId: string, content: string): Promise<string> {
    return this.post(taskId, {
      from_agent_id: fromAgentId,
      content,
    });
  }

  /**
   * Post a message with @mentions
   */
  async mention(taskId: string, fromAgentId: string, content: string, mentionAgentNames: string[]): Promise<string> {
    // Build content with mentions
    const mentionText = mentionAgentNames.map(name => `@${name}`).join(' ');
    const fullContent = mentionText ? `${mentionText} ${content}` : content;
    
    return this.send(taskId, fromAgentId, fullContent);
  }

  /**
   * Post a status update message
   */
  async postStatusUpdate(taskId: string, fromAgentId: string, status: string, details?: string): Promise<string> {
    const content = details 
      ? `**Status Update:** ${status}\n\n${details}`
      : `**Status Update:** ${status}`;
    
    return this.send(taskId, fromAgentId, content);
  }

  /**
   * Post a blocker message
   */
  async postBlocker(taskId: string, fromAgentId: string, reason: string): Promise<string> {
    return this.send(taskId, fromAgentId, `🚫 **Blocked:** ${reason}`);
  }

  /**
   * Post a completion message
   */
  async postComplete(taskId: string, fromAgentId: string, deliverablePath?: string): Promise<string> {
    const content = deliverablePath
      ? `✅ **Task Complete**\n\nDeliverable: \`${deliverablePath}\``
      : `✅ **Task Complete**`;
    
    return this.send(taskId, fromAgentId, content);
  }
}
