import type { Task } from '../../types';

export const STATUS_STYLES: Record<Task['status'], string> = {
  open:        'bg-brand-navy-30/30 text-brand-navy-70',
  in_progress: 'bg-blue-50 text-blue-700',
  done:        'bg-status-success/15 text-emerald-700',
  blocked:     'bg-status-overdue/10 text-status-overdue',
};

export const STATUS_LABELS: Record<Task['status'], string> = {
  open:        'Open',
  in_progress: 'In progress',
  done:        'Done',
  blocked:     'Blocked',
};
