export type TaskStatus = 'inbox' | 'assigned' | 'in_progress' | 'review' | 'done' | 'blocked';

export type Agent = {
  id: string;
  name: string;
  role: string;
  status: 'idle' | 'active' | 'blocked';
  level: string;
  avatar_emoji: string;
  current_task_id: string | null;
  team_id?: string;
  team_name?: string;
  department?: string;
  // Stats (loaded separately)
  stats?: AgentStats;
};

export type AgentStats = {
  agent_id: string;
  agent_name: string;
  tasks_completed: {
    total: number;
    week: number;
    month: number;
  };
  avg_completion_time_minutes: number;
  tasks_assigned: number;
  review_rejection_rate: number;
  last_active_at: string | null;
};

export type Team = {
  id: string;
  name: string;
  emoji: string;
  department_name: string;
  agent_count: number;
};

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  emoji: string;
  task_count: number;
  completed_count: number;
};

export type Task = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: string;
  assignee_ids: string[];
  assignee_names: string[];
  created_at: string;
  due_date: string | null;
  estimated_minutes: number | null;
  tag_ids: string[];
  tag_names: string[];
  tag_colors: string[];
  workspace_id?: string;
  has_blockers?: boolean;
  is_blocked?: boolean;
  blocker_count?: number;
  incomplete_blocker_count?: number;
  // Subtask fields
  parent_task_id?: string | null;
  subtask_count?: number;
  incomplete_subtask_count?: number;
  has_subtasks?: boolean;
};

export type Subtask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignee_names: string[];
  created_at: string;
};

export type ParentTask = {
  id: string;
  title: string;
  status: string;
};

export type TaskDependency = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dependency_created_at: string;
};

export type Tag = {
  id: string;
  name: string;
  color: string;
};

export type Activity = {
  id: string;
  type: string;
  agent_name: string;
  avatar_emoji: string;
  task_title: string;
  message: string;
  created_at: string;
};

export type Doc = {
  id: string;
  workspace_id: string;
  filename: string;
  content?: string;
  created_by_name: string | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
  content_length: number;
};

export type Notification = {
  id: string;
  type: 'mention' | 'assignment' | 'status_change' | 'comment' | 'approval' | 'standup';
  title: string;
  message: string;
  read: boolean;
  task_id?: string;
  created_at: string;
};

export type SearchResult = {
  id: string;
  type: 'task' | 'document' | 'agent';
  title: string;
  description?: string;
};

export type TaskMessage = {
  id: string;
  content: string;
  from_agent_name: string;
  avatar_emoji: string;
  created_at: string;
};

export type DependencyData = {
  blockers: TaskDependency[];
  blocking: TaskDependency[];
  is_blocked: boolean;
};

export const STATUS_COLUMNS: TaskStatus[] = ['inbox', 'assigned', 'in_progress', 'review', 'done'];

export const STATUS_LABELS: Record<string, string> = {
  inbox: 'Inbox',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  review: 'Review',
  done: 'Done',
};
