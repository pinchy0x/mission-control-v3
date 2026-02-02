import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(dateInput: string | number): string {
  try {
    if (!dateInput) return 'never';
    
    const date = typeof dateInput === 'number' 
      ? new Date(dateInput) 
      : new Date(dateInput);
    
    if (isNaN(date.getTime()) || date.getTime() === 0) return 'never';
    
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
  } catch {
    return 'Unknown';
  }
}

export function formatDueDate(dueDate: string | null, status: string): { text: string; isOverdue: boolean } {
  if (!dueDate) return { text: '', isOverdue: false };
  const due = new Date(dueDate);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  
  const isOverdue = diffDays < 0 && status !== 'done';
  if (isOverdue) return { text: `${Math.abs(diffDays)}d overdue`, isOverdue: true };
  if (diffDays === 0) return { text: 'Due today', isOverdue: false };
  if (diffDays === 1) return { text: 'Due tomorrow', isOverdue: false };
  return { text: `Due in ${diffDays}d`, isOverdue: false };
}

export function formatEstimate(mins: number | null): string {
  if (!mins) return '';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
