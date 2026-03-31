import { useState, useEffect } from 'react';
import type { Task } from '../types';
import api from '../api/client';
import type { ApiResponse } from '../types';
import { updateTask, deleteTask } from '../api/tasks';
import { formatDate } from '../utils/formatters';
import { STATUS_STYLES, STATUS_LABELS } from '../components/shared/StatusChip';

// ── Helpers ───────────────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function groupTasks(tasks: Task[]): {
  overdue: Task[];
  today: Task[];
  week: Task[];
  later: Task[];
  noDue: Task[];
  done: Task[];
} {
  const now = startOfDay(new Date());
  const weekEnd = new Date(now); weekEnd.setDate(now.getDate() + 7);

  const overdue: Task[] = [];
  const today: Task[] = [];
  const week: Task[] = [];
  const later: Task[] = [];
  const noDue: Task[] = [];
  const done: Task[] = [];

  for (const t of tasks) {
    if (t.status === 'done') { done.push(t); continue; }
    if (!t.due_date) { noDue.push(t); continue; }
    const due = startOfDay(new Date(t.due_date));
    if (due < now) { overdue.push(t); continue; }
    if (due.getTime() === now.getTime()) { today.push(t); continue; }
    if (due <= weekEnd) { week.push(t); continue; }
    later.push(t);
  }

  return { overdue, today, week, later, noDue, done };
}

// ── Status selector ───────────────────────────────────────────────────────────

// ── Task card ─────────────────────────────────────────────────────────────────
function TaskCard({
  task,
  onUpdate,
  onDelete,
}: {
  task: Task;
  onUpdate: (id: number, patch: Partial<Task>) => void;
  onDelete: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDesc, setEditDesc] = useState(task.description ?? '');
  const [editDue, setEditDue] = useState(task.due_date ?? '');
  const [saving, setSaving] = useState(false);

  const isOverdue = task.due_date && task.status !== 'done'
    && startOfDay(new Date(task.due_date)) < startOfDay(new Date());

  async function toggleDone() {
    const newStatus = task.status === 'done' ? 'open' : 'done';
    await updateTask(task.id, { status: newStatus });
    onUpdate(task.id, { status: newStatus });
  }

  async function handleStatusChange(s: Task['status']) {
    await updateTask(task.id, { status: s });
    onUpdate(task.id, { status: s });
  }

  async function handleDelete() {
    await deleteTask(task.id);
    onDelete(task.id);
  }

  function openEdit() {
    setEditTitle(task.title);
    setEditDesc(task.description ?? '');
    setEditDue(task.due_date ?? '');
    setEditing(true);
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTitle.trim()) return;
    setSaving(true);
    try {
      const patch = {
        title: editTitle.trim(),
        description: editDesc.trim() || undefined,
        due_date: editDue || null,
      };
      await updateTask(task.id, patch);
      onUpdate(task.id, patch);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="bg-white rounded-xl border border-brand-purple/40 px-4 py-3 shadow-sm">
        <form onSubmit={submitEdit} className="space-y-2">
          <input
            autoFocus
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            className="w-full px-2 py-1.5 rounded border border-brand-navy-30 text-sm text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-purple"
          />
          <input
            value={editDesc}
            onChange={e => setEditDesc(e.target.value)}
            placeholder="Description (optional)"
            className="w-full px-2 py-1 rounded border border-brand-navy-30 text-xs text-brand-navy placeholder:text-brand-navy-30 focus:outline-none focus:ring-1 focus:ring-brand-purple"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="date"
              value={editDue}
              onChange={e => setEditDue(e.target.value)}
              className="px-2 py-1 rounded border border-brand-navy-30 text-xs text-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-purple"
            />
            <button type="submit" disabled={saving || !editTitle.trim()} className="px-3 py-1 bg-brand-purple text-white text-xs font-medium rounded hover:bg-brand-purple-70 disabled:opacity-50 transition-colors">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="px-2 py-1 text-xs text-brand-navy-70 hover:text-brand-navy transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className={`group flex items-start gap-3 bg-white rounded-xl border px-4 py-3 transition-opacity ${
      task.status === 'done' ? 'opacity-50 border-brand-navy-30/40' : 'border-brand-navy-30/60 shadow-sm'
    }`}>
      {/* Checkbox */}
      <button
        onClick={toggleDone}
        className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
          task.status === 'done'
            ? 'bg-status-success border-status-success'
            : 'border-brand-navy-30 hover:border-brand-purple'
        }`}
      >
        {task.status === 'done' && (
          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={`text-sm font-medium text-brand-navy leading-snug ${task.status === 'done' ? 'line-through' : ''}`}>
              {task.title}
            </p>
            {task.opportunity_name && (
              <p className="text-xs text-brand-navy-70 mt-0.5 truncate">{task.opportunity_name}</p>
            )}
            {task.description && (
              <p className="text-xs text-brand-navy-70 mt-0.5 line-clamp-2">{task.description}</p>
            )}
          </div>
          {task.is_next_step && (
            <span className="flex-shrink-0 text-[9px] font-semibold bg-brand-purple/10 text-brand-purple px-1.5 py-0.5 rounded-full uppercase tracking-wide">
              Next step
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <select
            value={task.status}
            onChange={e => handleStatusChange(e.target.value as Task['status'])}
            className={`text-[10px] px-2 py-0.5 rounded-full border-0 font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-purple ${STATUS_STYLES[task.status]}`}
          >
            {(Object.keys(STATUS_LABELS) as Task['status'][]).map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>

          {task.due_date && (
            <span className={`text-[11px] ${isOverdue ? 'text-status-overdue font-medium' : 'text-brand-navy-70'}`}>
              {isOverdue ? 'Overdue · ' : 'Due '}{formatDate(task.due_date)}
            </span>
          )}
        </div>
      </div>

      {/* Edit + Delete */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 flex-shrink-0">
        <button
          onClick={openEdit}
          className="text-brand-navy-30 hover:text-brand-purple"
          title="Edit task"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>
        <button
          onClick={handleDelete}
          className="text-brand-navy-30 hover:text-status-overdue"
          title="Delete task"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────
function Section({
  title,
  count,
  color,
  tasks,
  onUpdate,
  onDelete,
  collapsible = false,
}: {
  title: string;
  count: number;
  color: string;
  tasks: Task[];
  onUpdate: (id: number, patch: Partial<Task>) => void;
  onDelete: (id: number) => void;
  collapsible?: boolean;
}) {
  const [open, setOpen] = useState(!collapsible);
  if (count === 0) return null;

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 mb-3 group w-full text-left"
        disabled={!collapsible}
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />
        <h2 className="text-xs font-semibold uppercase tracking-widest text-brand-navy-70">{title}</h2>
        <span className="text-[10px] bg-brand-navy-30/60 text-brand-navy-70 rounded-full px-1.5 py-px font-medium">{count}</span>
        {collapsible && (
          <svg className={`w-3.5 h-3.5 text-brand-navy-30 ml-auto transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>
      {open && (
        <div className="space-y-2 mb-6">
          {tasks.map(t => (
            <TaskCard key={t.id} task={t} onUpdate={onUpdate} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function MyTasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<ApiResponse<Task[]>>('/tasks');
      setTasks(data.data);
    } catch {
      setError('Failed to load tasks.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function handleUpdate(id: number, patch: Partial<Task>) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
  }

  function handleDelete(id: number) {
    setTasks(prev => prev.filter(t => t.id !== id));
  }

  const groups = groupTasks(tasks);
  const activeCount = tasks.filter(t => t.status !== 'done').length;

  return (
    <div className="flex-1 overflow-y-auto bg-[#F5F5F7] px-8 py-6">
      {/* Header */}
      <div className="flex items-baseline gap-3 mb-6">
        <h1 className="text-xl font-semibold text-brand-navy">My Tasks</h1>
        {!loading && (
          <span className="text-sm text-brand-navy-70">{activeCount} open</span>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20 text-sm text-brand-navy-70">Loading…</div>
      )}
      {error && (
        <div className="text-sm text-status-overdue">{error}</div>
      )}

      {!loading && !error && activeCount === 0 && groups.done.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-2">
          <svg className="w-10 h-10 text-brand-navy-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          <p className="text-sm text-brand-navy-70">No tasks assigned to you.</p>
        </div>
      )}

      {!loading && !error && (
        <div className="max-w-2xl">
          <Section title="Overdue" count={groups.overdue.length} color="bg-status-overdue"
            tasks={groups.overdue} onUpdate={handleUpdate} onDelete={handleDelete} />
          <Section title="Today" count={groups.today.length} color="bg-brand-purple"
            tasks={groups.today} onUpdate={handleUpdate} onDelete={handleDelete} />
          <Section title="This Week" count={groups.week.length} color="bg-status-warning"
            tasks={groups.week} onUpdate={handleUpdate} onDelete={handleDelete} />
          <Section title="Later" count={groups.later.length} color="bg-blue-400"
            tasks={groups.later} onUpdate={handleUpdate} onDelete={handleDelete} />
          <Section title="No Due Date" count={groups.noDue.length} color="bg-brand-navy-30"
            tasks={groups.noDue} onUpdate={handleUpdate} onDelete={handleDelete} />
          <Section title="Completed" count={groups.done.length} color="bg-status-success"
            tasks={groups.done} onUpdate={handleUpdate} onDelete={handleDelete} collapsible />
        </div>
      )}
    </div>
  );
}
