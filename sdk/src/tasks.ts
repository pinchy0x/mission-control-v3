/**
 * Mission Control SDK - Tasks Module
 */

import type { MCHttpClient } from './client';
import type {
  Task,
  TaskStatus,
  CreateTaskRequest,
  UpdateTaskRequest,
  ListTasksOptions,
  AssignTaskRequest,
  ApproveRejectRequest,
  TasksResponse,
  TaskResponse,
  IdResponse,
  SuccessResponse,
  AgentQueueResponse,
  DependenciesResponse,
} from './types';

/**
 * Tasks API module
 */
export class TasksModule {
  constructor(private readonly http: MCHttpClient) {}

  /**
   * List all tasks with optional filters
   */
  async list(options: ListTasksOptions = {}): Promise<Task[]> {
    const params = new URLSearchParams();
    if (options.status) params.set('status', options.status);
    if (options.assignee) params.set('assignee', options.assignee);
    
    const query = params.toString();
    const path = query ? `/api/tasks?${query}` : '/api/tasks';
    
    const response = await this.http.get<TasksResponse>(path);
    return response.tasks;
  }

  /**
   * Get a task by ID with assignees and messages
   */
  async get(taskId: string): Promise<TaskResponse> {
    return this.http.get<TaskResponse>(`/api/tasks/${taskId}`);
  }

  /**
   * Create a new task
   */
  async create(data: CreateTaskRequest): Promise<string> {
    const response = await this.http.post<IdResponse>('/api/tasks', data);
    return response.id;
  }

  /**
   * Update an existing task
   */
  async update(taskId: string, data: UpdateTaskRequest): Promise<void> {
    await this.http.patch<SuccessResponse>(`/api/tasks/${taskId}`, data);
  }

  /**
   * Delete a task
   */
  async delete(taskId: string): Promise<void> {
    await this.http.delete<SuccessResponse>(`/api/tasks/${taskId}`);
  }

  /**
   * Assign an agent to a task
   */
  async assign(taskId: string, data: AssignTaskRequest): Promise<void> {
    await this.http.post<SuccessResponse>(`/api/tasks/${taskId}/assign`, data);
  }

  /**
   * Unassign an agent from a task
   */
  async unassign(taskId: string, agentId: string): Promise<void> {
    await this.http.post<SuccessResponse>(`/api/tasks/${taskId}/unassign`, { agent_id: agentId });
  }

  /**
   * Change task status (convenience method)
   */
  async changeStatus(taskId: string, status: TaskStatus, blockedReason?: string): Promise<void> {
    const data: UpdateTaskRequest = { status };
    if (status === 'blocked' && blockedReason) {
      data.blocked_reason = blockedReason;
    }
    await this.update(taskId, data);
  }

  /**
   * Claim a task from inbox (self-assign)
   */
  async claim(taskId: string, agentId: string): Promise<void> {
    await this.http.post<SuccessResponse>(`/api/tasks/${taskId}/claim`, { agent_id: agentId });
  }

  /**
   * Approve a task (moves from review to done)
   */
  async approve(taskId: string, data: ApproveRejectRequest): Promise<void> {
    await this.http.post<SuccessResponse>(`/api/tasks/${taskId}/approve`, data);
  }

  /**
   * Reject a task (moves from review back to in_progress)
   */
  async reject(taskId: string, data: ApproveRejectRequest): Promise<void> {
    if (!data.feedback) {
      throw new Error('Feedback is required when rejecting a task');
    }
    await this.http.post<SuccessResponse>(`/api/tasks/${taskId}/reject`, data);
  }

  /**
   * Subscribe an agent to task updates
   */
  async subscribe(taskId: string, agentId: string): Promise<void> {
    await this.http.post<SuccessResponse>(`/api/tasks/${taskId}/subscribe`, { agent_id: agentId });
  }

  /**
   * Unsubscribe an agent from task updates
   */
  async unsubscribe(taskId: string, agentId: string): Promise<void> {
    await this.http.delete<SuccessResponse>(`/api/tasks/${taskId}/subscribe/${agentId}`);
  }

  /**
   * Get agent's task queue (assigned tasks sorted by priority)
   */
  async getAgentQueue(agentId: string): Promise<AgentQueueResponse> {
    return this.http.get<AgentQueueResponse>(`/api/agents/${agentId}/queue`);
  }

  /**
   * Get task dependencies
   */
  async getDependencies(taskId: string): Promise<DependenciesResponse> {
    return this.http.get<DependenciesResponse>(`/api/tasks/${taskId}/dependencies`);
  }

  /**
   * Add a dependency (task depends on another task)
   */
  async addDependency(taskId: string, dependsOnTaskId: string): Promise<void> {
    await this.http.post<SuccessResponse>(`/api/tasks/${taskId}/dependencies`, {
      depends_on_task_id: dependsOnTaskId,
    });
  }

  /**
   * Remove a dependency
   */
  async removeDependency(taskId: string, dependsOnTaskId: string): Promise<void> {
    await this.http.delete<SuccessResponse>(`/api/tasks/${taskId}/dependencies/${dependsOnTaskId}`);
  }

  /**
   * Set tags for a task (replaces existing tags)
   */
  async setTags(taskId: string, tagIds: string[]): Promise<void> {
    await this.http.put<SuccessResponse>(`/api/tasks/${taskId}/tags`, { tag_ids: tagIds });
  }
}
