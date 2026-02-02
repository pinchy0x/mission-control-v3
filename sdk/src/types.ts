/**
 * Mission Control v3 SDK Type Definitions
 */

// ============ ENUMS / LITERALS ============

export type AgentStatus = 'idle' | 'active' | 'blocked';
export type AgentLevel = 'intern' | 'specialist' | 'lead';

export type TaskStatus = 'inbox' | 'assigned' | 'in_progress' | 'review' | 'blocked' | 'done' | 'archived';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

export type TriggerStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type TriggerEventType = 'task_assigned' | 'mention_created' | 'task_rejected';

export type NotificationType = 'assignment' | 'mention' | 'reply' | 'status_change' | 'approval' | 'rejection';

export type ActivityType = 
  | 'task_created' 
  | 'task_updated' 
  | 'task_assigned' 
  | 'task_status_changed'
  | 'message_sent' 
  | 'agent_status_changed' 
  | 'deliverable_created'
  | 'doc_updated';

// ============ CORE ENTITIES ============

export interface Agent {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  level: AgentLevel;
  session_key?: string | null;
  current_task_id?: string | null;
  avatar_emoji: string;
  cron_job_id?: string | null;
  team_id?: string | null;
  department?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  workspace_id?: string | null;
  created_by?: string | null;
  deliverable_path?: string | null;
  due_date?: string | null;
  blocked_reason?: string | null;
  estimated_minutes?: number | null;
  created_at: string;
  updated_at: string;
  // Populated by list endpoint
  assignee_ids?: string[];
  assignee_names?: string[];
  tag_ids?: string[];
  tag_names?: string[];
  tag_colors?: string[];
}

export interface TaskWithDetails extends Task {
  assignees: Agent[];
}

export interface Message {
  id: string;
  task_id: string;
  from_agent_id: string;
  content: string;
  created_at: string;
  // Populated by API
  from_agent_name?: string;
  avatar_emoji?: string;
}

export interface Activity {
  id: string;
  type: ActivityType;
  agent_id?: string | null;
  task_id?: string | null;
  message: string;
  metadata?: string | null;
  created_at: string;
  // Populated by API
  agent_name?: string;
  avatar_emoji?: string;
  task_title?: string;
}

export interface Notification {
  id: string;
  agent_id: string;
  task_id?: string | null;
  message_id?: string | null;
  content: string;
  type: NotificationType;
  delivered: number; // 0 or 1
  read: number; // 0 or 1
  created_at: string;
}

export interface Subscription {
  agent_id: string;
  task_id: string;
  subscribed_at: string;
  task_title?: string;
}

export interface Trigger {
  id: string;
  agent_id: string;
  cron_job_id: string;
  event_type: TriggerEventType;
  task_id?: string | null;
  message_id?: string | null;
  context?: string | null;
  status: TriggerStatus;
  error?: string | null;
  created_at: string;
  claimed_at?: string | null;
  completed_at?: string | null;
  // Populated by API
  agent_name?: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface Department {
  id: string;
  name: string;
  emoji: string;
  description?: string | null;
  team_count?: number;
  agent_count?: number;
}

export interface Team {
  id: string;
  department_id: string;
  name: string;
  emoji: string;
  description?: string | null;
  lead_agent_id?: string | null;
  department_name?: string;
  department_emoji?: string;
  agent_count?: number;
  lead_name?: string;
  lead_emoji?: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  emoji: string;
  description?: string | null;
  status: string;
  created_at: string;
  task_count?: number;
  completed_count?: number;
}

export interface Doc {
  id: string;
  workspace_id: string;
  filename: string;
  content: string;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
  created_by_name?: string;
  updated_by_name?: string;
  content_length?: number;
}

export interface Dependency {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dependency_created_at: string;
}

// ============ API REQUEST TYPES ============

export interface CreateAgentRequest {
  name: string;
  role: string;
  level?: AgentLevel;
  session_key?: string;
  avatar_emoji?: string;
}

export interface UpdateAgentRequest {
  name?: string;
  role?: string;
  status?: AgentStatus;
  level?: AgentLevel;
  current_task_id?: string | null;
  avatar_emoji?: string;
  cron_job_id?: string | null;
  team_id?: string | null;
  department?: string | null;
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  workspace_id?: string;
  created_by?: string;
  due_date?: string;
  estimated_minutes?: number;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  workspace_id?: string | null;
  deliverable_path?: string | null;
  due_date?: string | null;
  blocked_reason?: string | null;
  estimated_minutes?: number | null;
}

export interface ListTasksOptions {
  status?: TaskStatus;
  assignee?: string;
}

export interface CreateMessageRequest {
  from_agent_id: string;
  content: string;
}

export interface AssignTaskRequest {
  agent_id: string;
}

export interface ApproveRejectRequest {
  agent_id: string;
  feedback?: string; // Required for reject
}

export interface ClaimTriggerRequest {
  limit?: number;
}

export interface UpdateTriggerRequest {
  status?: TriggerStatus;
  error?: string;
}

export interface ListTriggersOptions {
  status?: TriggerStatus;
  limit?: number;
}

export interface ListNotificationsOptions {
  unread?: boolean;
}

// ============ API RESPONSE TYPES ============

export interface SuccessResponse {
  success: true;
}

export interface IdResponse extends SuccessResponse {
  id: string;
}

export interface AgentsResponse {
  agents: Agent[];
}

export interface AgentResponse {
  agent: Agent;
}

export interface TasksResponse {
  tasks: Task[];
}

export interface TaskResponse {
  task: TaskWithDetails;
  messages: Message[];
}

export interface MessagesResponse {
  messages: Message[];
}

export interface ActivitiesResponse {
  activities: Activity[];
}

export interface NotificationsResponse {
  notifications: Notification[];
}

export interface SubscriptionsResponse {
  subscriptions: Subscription[];
}

export interface TriggersResponse {
  triggers: Trigger[];
}

export interface ClaimTriggersResponse {
  triggers: Trigger[];
  claimed: number;
}

export interface AgentQueueResponse {
  agent: { id: string; name: string };
  queue: Task[];
  count: number;
}

export interface DependenciesResponse {
  blockers: Dependency[];
  blocking: Dependency[];
  is_blocked: boolean;
  blocker_count: number;
  blocking_count: number;
}

export interface StatsResponse {
  agentsActive: number;
  tasksInQueue: number;
  tasksInProgress: number;
}

export interface FullStatsResponse {
  departments: number;
  teams: number;
  agents: number;
  workspaces: number;
  tasksByStatus: Array<{ status: string; count: number }>;
  tasksByWorkspace: Array<{ name: string; count: number }>;
}

export interface TagsResponse {
  tags: Tag[];
  colors: string[];
}

export interface ErrorResponse {
  error: string;
  message?: string;
  blockers?: Dependency[];
}

// ============ CLIENT CONFIG ============

export interface MCClientConfig {
  baseURL: string;
  token: string;
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}
