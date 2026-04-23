import type { Task } from '../../types';

export const STATUS_STYLES: Record<Task['status'], string> = {
  open:        'bg-brand-navy-30/20 text-brand-navy-70 dark:text-fg-2',
  in_progress: 'bg-blue-50 dark:bg-status-d-info-soft text-blue-700',
  done:        'bg-emerald-50 dark:bg-status-d-success-soft text-emerald-800',
  blocked:     'bg-red-50 dark:bg-status-d-overdue-soft text-red-700',
};

export const STATUS_DOT: Record<Task['status'], string> = {
  open:        'bg-brand-navy-30',
  in_progress: 'bg-blue-400',
  done:        'bg-emerald-500',
  blocked:     'bg-red-400',
};

export const STATUS_LABELS: Record<Task['status'], string> = {
  open:        'Open',
  in_progress: 'In progress',
  done:        'Done',
  blocked:     'Blocked',
};
