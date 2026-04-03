import { useState } from 'react';
import type { Task, User } from '../../types';
import { updateTask } from '../../api/tasks';
import { formatDate } from '../../utils/formatters';
import { STATUS_STYLES, STATUS_LABELS } from '../shared/StatusChip';

// ── EditTaskForm ───────────────────────────────────────────────────────────────

function EditTaskForm({
  task,
  onSave,
  onCancel,
}: {
  task: Task;
  onSave: (patch: Partial<Task>) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [dueDate, setDueDate] = useState(task.due_date ?? '');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const patch = {
        title: title.trim(),
        description: description.trim() || undefined,
        due_date: dueDate || null,
      };
      await updateTask(task.id, patch);
      onSave(patch);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex-1 space-y-1.5">
      <input
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        className="w-full px-2 py-1 rounded border border-brand-navy-30 text-sm text-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-purple"
      />
      <input
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="Description (optional)"
        className="w-full px-2 py-1 rounded border border-brand-navy-30 text-xs text-brand-navy placeholder:text-brand-navy-30 focus:outline-none focus:ring-1 focus:ring-brand-purple"
      />
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          className="px-2 py-0.5 rounded border border-brand-navy-30 text-xs text-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-purple"
        />
        <button type="submit" disabled={saving || !title.trim()} className="px-2.5 py-0.5 bg-brand-purple text-white text-xs font-medium rounded hover:bg-brand-purple-70 disabled:opacity-50 transition-colors">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} className="px-2 py-0.5 text-xs text-brand-navy-70 hover:text-brand-navy transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── TaskRow ────────────────────────────────────────────────────────────────────

export function TaskRow({
  task,
  onStatusChange,
  onDelete,
  onEdit,
  readOnly = false,
}: {
  task: Task;
  onStatusChange: (id: number, status: Task['status']) => void;
  onDelete: (id: number) => void;
  onEdit?: (id: number, patch: Partial<Task>) => void;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const isOverdue = task.due_date && task.status !== 'done' && new Date(task.due_date) < new Date();

  function handleSave(patch: Partial<Task>) {
    setEditing(false);
    onEdit?.(task.id, patch);
  }

  if (editing) {
    return (
      <div className="flex items-start gap-3 py-2.5 border-b border-brand-navy-30/40 last:border-0">
        <div className="mt-0.5 w-4 h-4 flex-shrink-0" />
        <EditTaskForm task={task} onSave={handleSave} onCancel={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div className={`group flex items-start gap-3 py-2.5 border-b border-brand-navy-30/40 last:border-0 ${task.status === 'done' ? 'opacity-60' : ''}`}>
      <button
        onClick={() => !readOnly && onStatusChange(task.id, task.status === 'done' ? 'open' : 'done')}
        disabled={readOnly}
        className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
          task.status === 'done'
            ? 'bg-status-success border-status-success'
            : readOnly
              ? 'border-brand-navy-30 opacity-40 cursor-default'
              : 'border-brand-navy-30 hover:border-brand-purple'
        }`}
      >
        {task.status === 'done' && (
          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <p className={`text-sm text-brand-navy leading-tight ${task.status === 'done' ? 'line-through' : ''}`}>{task.title}</p>
        {task.description && <p className="text-xs text-brand-navy-70 mt-0.5 line-clamp-2">{task.description}</p>}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {task.assigned_to_name && (
            <span className="text-[11px] text-brand-navy-70">{task.assigned_to_name}</span>
          )}
          {task.due_date && (
            <span className={`text-[11px] ${isOverdue ? 'text-status-overdue font-medium' : 'text-brand-navy-70'}`}>
              Due {formatDate(task.due_date)}
            </span>
          )}
          {readOnly ? (
            <span className={`text-[10px] px-1.5 py-px rounded-full font-medium ${STATUS_STYLES[task.status]}`}>
              {STATUS_LABELS[task.status]}
            </span>
          ) : (
            <select
              value={task.status}
              onChange={e => onStatusChange(task.id, e.target.value as Task['status'])}
              className={`text-[10px] px-1.5 py-px rounded-full border-0 font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-purple ${STATUS_STYLES[task.status]}`}
            >
              {(Object.keys(STATUS_LABELS) as Task['status'][]).map(s => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {!readOnly && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">
          <button
            onClick={() => setEditing(true)}
            className="text-brand-navy-30 hover:text-brand-purple"
            title="Edit task"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          <button
            onClick={() => onDelete(task.id)}
            className="text-brand-navy-30 hover:text-status-overdue"
            title="Delete task"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

// ── AddTaskForm ────────────────────────────────────────────────────────────────

export function AddTaskForm({
  onAdd,
  onCancel,
  users = [],
  defaultAssigneeId,
}: {
  onAdd: (title: string, isNextStep: boolean, dueDate: string, assignedToId?: number) => Promise<void>;
  onCancel: () => void;
  users?: User[];
  defaultAssigneeId?: number;
}) {
  const [title, setTitle] = useState('');
  const [isNextStep, setIsNextStep] = useState(false);
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [assignedToId, setAssignedToId] = useState<number | undefined>(defaultAssigneeId);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onAdd(title.trim(), isNextStep, dueDate, assignedToId);
      setTitle('');
      setDueDate('');
      setIsNextStep(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-2 p-3 bg-gray-50 rounded-lg border border-brand-navy-30 space-y-2">
      <input
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Task title…"
        className="w-full px-3 py-1.5 rounded border border-brand-navy-30 text-sm text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-purple"
      />
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="date"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          className="px-2 py-1 rounded border border-brand-navy-30 text-xs text-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-purple"
        />
        {users.length > 0 && (
          <select
            value={assignedToId ?? ''}
            onChange={e => setAssignedToId(e.target.value ? parseInt(e.target.value) : undefined)}
            className="px-2 py-1 rounded border border-brand-navy-30 text-xs text-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-purple"
          >
            <option value="">Unassigned</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-1.5 text-xs text-brand-navy cursor-pointer">
          <input type="checkbox" checked={isNextStep} onChange={e => setIsNextStep(e.target.checked)} className="accent-brand-purple" />
          Next step
        </label>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={saving || !title.trim()} className="px-3 py-1 bg-brand-purple text-white text-xs font-medium rounded hover:bg-brand-purple-70 disabled:opacity-50 transition-colors">
          {saving ? 'Adding…' : 'Add task'}
        </button>
        <button type="button" onClick={onCancel} className="px-3 py-1 text-xs text-brand-navy-70 hover:text-brand-navy transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}
