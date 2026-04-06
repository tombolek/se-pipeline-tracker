import type { Task } from '../../types';

export const STATUS_STYLES: Record<Task['status'], string> = {
  open:        'bg-brand-navy-30/20 text-brand-navy-70',
  in_progress: 'bg-blue-50 text-blue-700',
  done:        'bg-emerald-50 text-emerald-800',
  blocked:     'bg-red-50 text-red-700',
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
