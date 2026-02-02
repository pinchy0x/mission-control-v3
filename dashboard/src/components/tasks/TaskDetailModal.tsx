'use client';

import { useState, useEffect } from 'react';
import { cn, formatRelativeTime } from '@/lib/utils';
import { fetchAPI } from '@/lib/api';
import type { Task, Agent, Tag, TaskMessage, DependencyData, TaskDependency, Subtask, ParentTask } from '@/lib/types';
import { STATUS_COLUMNS, STATUS_LABELS } from '@/lib/types';
import { Modal, Button, Badge } from '@/components/ui';
import { X, Clock, Link2, MessageSquare } from 'lucide-react';

interface TaskDetailModalProps {
  task: Task | null;
  agents: Agent[];
  tags: Tag[];
  tasks: Task[];
  onClose: () => void;
  onUpdate: () => void;
}

export function TaskDetailModal({ task, agents, tags, tasks, onClose, onUpdate }: TaskDetailModalProps) {
  const [taskMessages, setTaskMessages] = useState<TaskMessage[]>([]);
  const [dependencies, setDependencies] = useState<DependencyData>({ blockers: [], blocking: [], is_blocked: false });
  const [showAddDependency, setShowAddDependency] = useState(false);
  const [localTask, setLocalTask] = useState<Task | null>(task);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [parentTask, setParentTask] = useState<ParentTask | null>(null);
  const [showAddSubtask, setShowAddSubtask] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  useEffect(() => {
    setLocalTask(task);
    setSubtasks([]);
    setParentTask(null);
    setShowAddSubtask(false);
    setNewSubtaskTitle('');
    if (task) {
      loadTaskDetails(task.id);
    }
  }, [task]);

  async function loadTaskDetails(taskId: string) {
    const [msgData, depData, taskData] = await Promise.all([
      fetchAPI(`/api/tasks/${taskId}/messages`),
      fetchAPI(`/api/tasks/${taskId}/dependencies`),
      fetchAPI(`/api/tasks/${taskId}`),
    ]);
    setTaskMessages(msgData?.messages || []);
    setDependencies({
      blockers: depData?.blockers || [],
      blocking: depData?.blocking || [],
      is_blocked: depData?.is_blocked || false,
    });
    setSubtasks(taskData?.subtasks || []);
    setParentTask(taskData?.parent_task || null);
  }

  async function createSubtask() {
    if (!newSubtaskTitle.trim() || !localTask) return;
    const result = await fetchAPI('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ 
        title: newSubtaskTitle,
        parent_task_id: localTask.id,
      }),
    });
    if (result?.error) {
      alert(result.error);
      return;
    }
    setNewSubtaskTitle('');
    setShowAddSubtask(false);
    loadTaskDetails(localTask.id);
    onUpdate();
  }

  async function updateSubtaskStatus(subtaskId: string, status: string) {
    await fetchAPI(`/api/tasks/${subtaskId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    if (localTask) {
      loadTaskDetails(localTask.id);
    }
    onUpdate();
  }

  async function updateTaskStatus(status: string) {
    await fetchAPI(`/api/tasks/${localTask!.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    setLocalTask(prev => prev ? { ...prev, status: status as Task['status'] } : null);
    onUpdate();
  }

  async function updateTaskField(field: string, value: any) {
    await fetchAPI(`/api/tasks/${localTask!.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ [field]: value }),
    });
    setLocalTask(prev => prev ? { ...prev, [field]: value } : null);
    onUpdate();
  }

  async function assignAgent(agentId: string) {
    await fetchAPI(`/api/tasks/${localTask!.id}/assign`, {
      method: 'POST',
      body: JSON.stringify({ agent_id: agentId }),
    });
    onUpdate();
  }

  async function toggleTag(tagId: string) {
    const currentTagIds = localTask?.tag_ids || [];
    const newTagIds = currentTagIds.includes(tagId)
      ? currentTagIds.filter(id => id !== tagId)
      : [...currentTagIds, tagId];
    
    await fetchAPI(`/api/tasks/${localTask!.id}/tags`, {
      method: 'PUT',
      body: JSON.stringify({ tag_ids: newTagIds }),
    });
    
    const newTagNames = newTagIds.map(id => tags.find(t => t.id === id)?.name || '');
    const newTagColors = newTagIds.map(id => tags.find(t => t.id === id)?.color || '');
    setLocalTask(prev => prev ? { ...prev, tag_ids: newTagIds, tag_names: newTagNames, tag_colors: newTagColors } : null);
    onUpdate();
  }

  async function claimTask(agentId: string) {
    const result = await fetchAPI(`/api/tasks/${localTask!.id}/claim`, {
      method: 'POST',
      body: JSON.stringify({ agent_id: agentId }),
    });
    if (result?.error) {
      alert(result.error);
      return;
    }
    onClose();
    onUpdate();
  }

  async function approveTask(agentId: string) {
    await fetchAPI(`/api/tasks/${localTask!.id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ agent_id: agentId }),
    });
    onClose();
    onUpdate();
  }

  async function rejectTask(agentId: string, feedback: string) {
    await fetchAPI(`/api/tasks/${localTask!.id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ agent_id: agentId, feedback }),
    });
    onClose();
    onUpdate();
  }

  async function addDependency(dependsOnId: string) {
    const result = await fetchAPI(`/api/tasks/${localTask!.id}/dependencies`, {
      method: 'POST',
      body: JSON.stringify({ depends_on_task_id: dependsOnId }),
    });
    if (result?.error) {
      alert(result.error);
      return;
    }
    loadTaskDetails(localTask!.id);
    onUpdate();
    setShowAddDependency(false);
  }

  async function removeDependency(depId: string) {
    await fetchAPI(`/api/tasks/${localTask!.id}/dependencies/${depId}`, { method: 'DELETE' });
    loadTaskDetails(localTask!.id);
    onUpdate();
  }

  if (!localTask) return null;

  return (
    <Modal isOpen={!!task} onClose={onClose} title={localTask.title} size="lg">
      <div className="p-6 space-y-6">
        {/* Description */}
        <p className="text-zinc-400 text-sm">{localTask.description || 'No description'}</p>

        {/* Status */}
        <div>
          <label className="text-sm font-medium text-zinc-300 block mb-2">Status</label>
          <select
            value={localTask.status}
            onChange={e => updateTaskStatus(e.target.value)}
            className="w-full bg-zinc-800 text-zinc-100 border border-zinc-700 rounded-lg px-3 py-2 focus:border-blue-500 outline-none"
          >
            {STATUS_COLUMNS.map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>

        {/* Assign Agents */}
        <div>
          <label className="text-sm font-medium text-zinc-300 block mb-2">Assign Agent</label>
          <div className="flex flex-wrap gap-2">
            {agents.map(agent => (
              <button
                key={agent.id}
                onClick={() => assignAgent(agent.id)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm transition-colors',
                  localTask.assignee_ids?.includes(agent.id)
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                )}
              >
                {agent.avatar_emoji} {agent.name}
              </button>
            ))}
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className="text-sm font-medium text-zinc-300 block mb-2">Tags</label>
          <div className="flex flex-wrap gap-2">
            {tags.map(tag => (
              <button
                key={tag.id}
                onClick={() => toggleTag(tag.id)}
                className={cn(
                  'px-3 py-1 rounded text-sm transition-all text-white',
                  localTask.tag_ids?.includes(tag.id)
                    ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900'
                    : 'opacity-50 hover:opacity-75'
                )}
                style={{ backgroundColor: tag.color }}
              >
                {tag.name}
              </button>
            ))}
            {tags.length === 0 && (
              <span className="text-xs text-zinc-500 italic">No tags created yet</span>
            )}
          </div>
        </div>

        {/* Due Date & Estimate */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-zinc-300 block mb-2">Due Date</label>
            <input
              type="date"
              value={localTask.due_date ? localTask.due_date.split('T')[0] : ''}
              onChange={e => {
                const newDate = e.target.value ? new Date(e.target.value).toISOString() : null;
                updateTaskField('due_date', newDate);
              }}
              className="w-full bg-zinc-800 text-zinc-100 border border-zinc-700 rounded-lg px-3 py-2 focus:border-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-300 block mb-2">Estimate (min)</label>
            <input
              type="number"
              placeholder="e.g. 60"
              value={localTask.estimated_minutes || ''}
              onChange={e => updateTaskField('estimated_minutes', e.target.value ? parseInt(e.target.value) : null)}
              className="w-full bg-zinc-800 text-zinc-100 border border-zinc-700 rounded-lg px-3 py-2 focus:border-blue-500 outline-none"
            />
          </div>
        </div>

        {/* Action Buttons */}
        {localTask.status === 'inbox' && agents.length > 0 && (
          <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500/30">
            <p className="text-sm text-blue-300 mb-3">Claim this task to start working</p>
            <div className="flex flex-wrap gap-2">
              {agents.map(agent => (
                <Button
                  key={agent.id}
                  size="sm"
                  onClick={() => claimTask(agent.id)}
                >
                  Claim as {agent.name}
                </Button>
              ))}
            </div>
          </div>
        )}

        {localTask.status === 'review' && agents.length > 0 && (
          <div className="p-4 bg-amber-500/10 rounded-lg border border-amber-500/30">
            <p className="text-sm text-amber-300 mb-3">Review this task</p>
            <div className="flex gap-2">
              <select id="reviewer-select" className="bg-zinc-800 text-zinc-100 border border-zinc-700 rounded px-2 py-1 text-sm flex-1">
                {agents.map(agent => (
                  <option key={agent.id} value={agent.id}>
                    {agent.avatar_emoji} {agent.name} ({agent.level})
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                onClick={() => {
                  const select = document.getElementById('reviewer-select') as HTMLSelectElement;
                  approveTask(select.value);
                }}
              >
                ✓ Approve
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  const select = document.getElementById('reviewer-select') as HTMLSelectElement;
                  const feedback = prompt('Enter rejection feedback (required):');
                  if (feedback?.trim()) {
                    rejectTask(select.value, feedback);
                  }
                }}
              >
                ✗ Reject
              </Button>
            </div>
          </div>
        )}

        {/* Dependencies */}
        <div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-300">
              <Link2 className="h-4 w-4" />
              Dependencies
            </div>
            <button
              onClick={() => setShowAddDependency(!showAddDependency)}
              className="text-xs bg-zinc-700 hover:bg-zinc-600 px-2 py-1 rounded text-zinc-300"
            >
              {showAddDependency ? 'Cancel' : '+ Add Blocker'}
            </button>
          </div>

          {showAddDependency && (
            <div className="mb-3 p-3 bg-zinc-900 rounded border border-zinc-700">
              <p className="text-xs text-zinc-500 mb-2">Select a task that blocks this one:</p>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {tasks.filter(t => 
                  t.id !== localTask.id && 
                  t.status !== 'done' &&
                  !dependencies.blockers.some(b => b.id === t.id)
                ).map(t => (
                  <button
                    key={t.id}
                    onClick={() => addDependency(t.id)}
                    className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-zinc-800 flex items-center gap-2 text-zinc-300"
                  >
                    <span className={cn(
                      'w-2 h-2 rounded-full',
                      t.status === 'in_progress' ? 'bg-blue-500' :
                      t.status === 'review' ? 'bg-amber-500' :
                      'bg-zinc-500'
                    )} />
                    <span className="truncate flex-1">{t.title}</span>
                    <span className="text-zinc-500">{t.status}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {dependencies.blockers.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-zinc-500 mb-2">⛔ Blocked by:</p>
              <div className="space-y-1">
                {dependencies.blockers.map(blocker => (
                  <div 
                    key={blocker.id}
                    className={cn(
                      'flex items-center justify-between px-2 py-1.5 rounded text-xs',
                      blocker.status === 'done' ? 'bg-green-500/10 border border-green-500/30' : 'bg-amber-500/10 border border-amber-500/30'
                    )}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0 text-zinc-300">
                      <span>{blocker.status === 'done' ? '✅' : '🔒'}</span>
                      <span className="truncate">{blocker.title}</span>
                      <Badge variant={blocker.status === 'done' ? 'success' : 'warning'} size="sm">
                        {blocker.status}
                      </Badge>
                    </div>
                    <button
                      onClick={() => removeDependency(blocker.id)}
                      className="text-zinc-500 hover:text-red-400 ml-2"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {dependencies.blocking.length > 0 && (
            <div>
              <p className="text-xs text-zinc-500 mb-2">⏳ Blocks these tasks:</p>
              <div className="space-y-1">
                {dependencies.blocking.map(blocked => (
                  <div 
                    key={blocked.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded text-xs bg-blue-500/10 border border-blue-500/30 text-zinc-300"
                  >
                    <span>➡️</span>
                    <span className="truncate flex-1">{blocked.title}</span>
                    <Badge variant="info" size="sm">{blocked.status}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {dependencies.blockers.length === 0 && dependencies.blocking.length === 0 && !showAddDependency && (
            <p className="text-xs text-zinc-500 italic">No dependencies</p>
          )}
        </div>

        {/* Parent Task Link (if this is a subtask) */}
        {parentTask && (
          <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500/30">
            <p className="text-xs text-blue-300 mb-2">📎 This is a subtask of:</p>
            <button
              onClick={() => {
                const parent = tasks.find(t => t.id === parentTask.id);
                if (parent) {
                  setLocalTask(parent);
                  loadTaskDetails(parent.id);
                }
              }}
              className="text-sm font-medium text-blue-300 hover:text-blue-100 flex items-center gap-2"
            >
              <span>{parentTask.title}</span>
              <Badge variant={parentTask.status === 'done' ? 'success' : 'info'} size="sm">
                {parentTask.status}
              </Badge>
            </button>
          </div>
        )}

        {/* Subtasks Section (only for top-level tasks) */}
        {!parentTask && (
          <div className="p-4 bg-purple-500/10 rounded-lg border border-purple-500/30">
            <div className="flex justify-between items-center mb-3">
              <div className="text-sm font-medium text-purple-300">
                📋 Subtasks {subtasks.length > 0 && (
                  <span className="text-xs font-normal text-purple-400 ml-1">
                    ({subtasks.filter(s => s.status === 'done').length}/{subtasks.length} done)
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowAddSubtask(!showAddSubtask)}
                className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-2 py-1 rounded"
              >
                {showAddSubtask ? 'Cancel' : '+ Add Subtask'}
              </button>
            </div>

            {showAddSubtask && (
              <div className="mb-3 p-3 bg-zinc-900 rounded border border-purple-500/30">
                <input
                  type="text"
                  placeholder="Subtask title..."
                  value={newSubtaskTitle}
                  onChange={e => setNewSubtaskTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createSubtask()}
                  className="w-full bg-zinc-800 text-zinc-100 border border-purple-500/50 rounded px-3 py-2 text-sm mb-2 focus:border-purple-400 outline-none"
                  autoFocus
                />
                <button
                  onClick={createSubtask}
                  disabled={!newSubtaskTitle.trim()}
                  className="w-full bg-purple-600 text-white text-xs py-2 rounded hover:bg-purple-500 disabled:bg-purple-800 disabled:text-purple-400"
                >
                  Create Subtask
                </button>
              </div>
            )}

            {subtasks.length > 0 ? (
              <div className="space-y-2">
                {subtasks.map(subtask => (
                  <div 
                    key={subtask.id}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded text-sm border',
                      subtask.status === 'done' 
                        ? 'bg-green-500/10 border-green-500/30' 
                        : 'bg-zinc-900 border-purple-500/30'
                    )}
                  >
                    <button
                      onClick={() => updateSubtaskStatus(
                        subtask.id, 
                        subtask.status === 'done' ? 'inbox' : 'done'
                      )}
                      className={cn(
                        'w-5 h-5 rounded border-2 flex items-center justify-center text-xs',
                        subtask.status === 'done'
                          ? 'bg-green-500 border-green-500 text-white'
                          : 'border-purple-400 hover:border-purple-300'
                      )}
                    >
                      {subtask.status === 'done' && '✓'}
                    </button>
                    <div className="flex-1 min-w-0">
                      <span className={cn(
                        subtask.status === 'done' ? 'line-through text-zinc-500' : 'text-zinc-200'
                      )}>
                        {subtask.title}
                      </span>
                      {subtask.assignee_names?.length > 0 && (
                        <span className="text-xs text-zinc-500 ml-2">
                          ({subtask.assignee_names.join(', ')})
                        </span>
                      )}
                    </div>
                    <select
                      value={subtask.status}
                      onChange={(e) => updateSubtaskStatus(subtask.id, e.target.value)}
                      className="text-xs bg-zinc-800 text-zinc-300 border border-zinc-700 rounded px-1 py-0.5"
                    >
                      <option value="inbox">Inbox</option>
                      <option value="assigned">Assigned</option>
                      <option value="in_progress">In Progress</option>
                      <option value="review">Review</option>
                      <option value="done">Done</option>
                    </select>
                  </div>
                ))}
              </div>
            ) : !showAddSubtask && (
              <p className="text-xs text-purple-400 italic">No subtasks yet</p>
            )}
          </div>
        )}

        {/* Comments */}
        {taskMessages.length > 0 && (
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-300 mb-3">
              <MessageSquare className="h-4 w-4" />
              Comments ({taskMessages.length})
            </div>
            <div className="space-y-3 max-h-60 overflow-y-auto">
              {taskMessages.map(msg => (
                <div key={msg.id} className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{msg.avatar_emoji || '🤖'}</span>
                    <span className="font-medium text-sm text-zinc-200">{msg.from_agent_name}</span>
                    <span className="text-xs text-zinc-500">{formatRelativeTime(msg.created_at)}</span>
                  </div>
                  <div className="text-sm text-zinc-400 whitespace-pre-wrap bg-zinc-900 p-2 rounded border border-zinc-700 font-mono text-xs max-h-40 overflow-y-auto">
                    {msg.content}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-xs text-zinc-600 pt-4 border-t border-zinc-800">
          Created: {new Date(localTask.created_at).toLocaleString()}
        </div>
      </div>
    </Modal>
  );
}
