/**
 * Mission Control SDK - Agents Module
 */

import type { MCHttpClient } from './client';
import type {
  Agent,
  CreateAgentRequest,
  UpdateAgentRequest,
  AgentsResponse,
  AgentResponse,
  IdResponse,
  SuccessResponse,
} from './types';

/**
 * Agents API module
 */
export class AgentsModule {
  constructor(private readonly http: MCHttpClient) {}

  /**
   * List all agents
   */
  async list(): Promise<Agent[]> {
    const response = await this.http.get<AgentsResponse>('/api/agents');
    return response.agents;
  }

  /**
   * Get an agent by ID
   */
  async get(agentId: string): Promise<Agent> {
    const response = await this.http.get<AgentResponse>(`/api/agents/${agentId}`);
    return response.agent;
  }

  /**
   * Create a new agent
   */
  async create(data: CreateAgentRequest): Promise<string> {
    const response = await this.http.post<IdResponse>('/api/agents', data);
    return response.id;
  }

  /**
   * Update an agent
   */
  async update(agentId: string, data: UpdateAgentRequest): Promise<void> {
    await this.http.patch<SuccessResponse>(`/api/agents/${agentId}`, data);
  }

  /**
   * Delete an agent
   */
  async delete(agentId: string): Promise<void> {
    await this.http.delete<SuccessResponse>(`/api/agents/${agentId}`);
  }

  /**
   * Set agent status
   */
  async setStatus(agentId: string, status: Agent['status']): Promise<void> {
    await this.update(agentId, { status });
  }

  /**
   * Set agent's current task
   */
  async setCurrentTask(agentId: string, taskId: string | null): Promise<void> {
    await this.update(agentId, { current_task_id: taskId });
  }

  /**
   * Find agent by name
   */
  async findByName(name: string): Promise<Agent | undefined> {
    const agents = await this.list();
    return agents.find(a => a.name.toLowerCase() === name.toLowerCase());
  }

  /**
   * Get agents by team
   */
  async listByTeam(teamId: string): Promise<Agent[]> {
    const agents = await this.list();
    return agents.filter(a => a.team_id === teamId);
  }

  /**
   * Get active agents
   */
  async listActive(): Promise<Agent[]> {
    const agents = await this.list();
    return agents.filter(a => a.status === 'active');
  }
}
