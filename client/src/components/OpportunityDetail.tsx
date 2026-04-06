import { useState, useEffect, useCallback, useRef } from 'react';
import type { Opportunity, Task, Note, User } from '../types';
import { getOpportunity, assignSeOwner } from '../api/opportunities';
import { createTask, updateTask, deleteTask } from '../api/tasks';
import { getNotes, createNote } from '../api/notes';
import { listUsers } from '../api/users';
import { useAuthStore } from '../store/auth';
import api from '../api/client';
import type { ApiResponse } from '../types';
import { formatDate, formatARR, daysSince } from '../utils/formatters';
import { TaskRow, AddTaskForm } from './opportunity/TaskSection';
import { NoteItem, AddNoteForm } from './opportunity/NoteSection';

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionHeader({ title, count, action }: { title: string; count?: number; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-brand-navy-70">{title}</h3>
        {count !== undefined && count > 0 && (
          <span className="text-[10px] bg-brand-navy-30 text-brand-navy-70 rounded-full px-1.5 py-px font-medium">{count}</span>
        )}
      </div>
      {action}
    </div>
  );
}

function Collapsible({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-brand-navy-30/50 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full py-2.5 text-left"
      >
        <span className="text-xs font-semibold uppercase tracking-widest text-brand-navy-70">{title}</span>
        <svg className={`w-3.5 h-3.5 text-brand-navy-70 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="pb-3">{children}</div>}
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: string | null | undefined | number | boolean }) {
  const display = value === null || value === undefined || value === '' ? '—' : String(value);
  return (
    <div className="flex justify-between gap-2 py-1 text-xs">
      <span className="text-brand-navy-70 flex-shrink-0">{label}</span>
      <span className="text-brand-navy text-right font-medium">{display}</span>
    </div>
  );
}

function FreshnessTag({ updatedAt }: { updatedAt: string | null }) {
  const days = daysSince(updatedAt);
  if (days === null) return <span className="text-[10px] text-brand-navy-30">never</span>;
  const color = days <= 7 ? 'text-status-success' : days <= 21 ? 'text-status-warning' : 'text-status-overdue';
  return <span className={`text-[10px] font-medium ${color}`}>{days}d ago</span>;
}

interface HistoryEntry { id: number; field_name: string; old_value: string | null; new_value: string | null; changed_at: string; }

function FieldHistory({ oppId, field }: { oppId: number; field: 'se_comments' | 'next_step_sf' }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (open) { setOpen(false); return; }
    if (entries !== null) { setOpen(true); return; }
    setLoading(true);
    try {
      const r = await api.get<ApiResponse<HistoryEntry[]>>(`/opportunities/${oppId}/field-history?field=${field}`);
      setEntries(r.data.data);
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-2">
      <button
        onClick={toggle}
        className="text-[10px] text-brand-navy-70 hover:text-brand-navy transition-colors flex items-center gap-1"
      >
        <svg className={`w-2.5 h-2.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
        {loading ? 'Loading…' : open ? 'Hide history' : 'Show history'}
      </button>
      {open && entries && entries.length > 0 && (
        <div className="mt-1.5 space-y-2 pl-2 border-l-2 border-brand-navy-30/50">
          {entries.map(e => (
            <div key={e.id}>
              <p className="text-[10px] text-brand-navy-70">{formatDate(e.changed_at)}</p>
              <p className="text-[10px] text-brand-navy leading-relaxed line-clamp-3">
                {e.new_value || <span className="italic text-brand-navy-30">cleared</span>}
              </p>
            </div>
          ))}
        </div>
      )}
      {open && entries?.length === 0 && (
        <p className="text-[10px] text-brand-navy-30 mt-1 italic">No history yet</p>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  oppId: number;
  onRefreshList?: () => void;
}

export default function OpportunityDetail({ oppId, onRefreshList }: Props) {
  const { user } = useAuthStore();
  const [opp, setOpp] = useState<Opportunity | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeUsers, setActiveUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddTask, setShowAddTask] = useState(false);
  const [assigningOwner, setAssigningOwner] = useState(false);

  // Resizable right panel
  const [rightWidth, setRightWidth] = useState(224); // 224px = w-56
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  function onDragStart(e: React.MouseEvent) {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: rightWidth };
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
  }

  function onDragMove(e: MouseEvent) {
    if (!dragRef.current) return;
    const delta = dragRef.current.startX - e.clientX;
    const next = Math.min(480, Math.max(160, dragRef.current.startWidth + delta));
    setRightWidth(next);
  }

  function onDragEnd() {
    dragRef.current = null;
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
  }
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [detail, noteList] = await Promise.all([
        getOpportunity(oppId),
        getNotes(oppId),
      ]);
      setOpp(detail);
      setNotes(noteList);
    } finally {
      setLoading(false);
    }
  }, [oppId]);

  useEffect(() => {
    listUsers().then(users => setActiveUsers(users.filter(u => u.is_active)));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  async function handleTaskStatusChange(id: number, status: Task['status']) {
    await updateTask(id, { status });
    reload();
    onRefreshList?.();
  }

  async function handleTaskDelete(id: number) {
    await deleteTask(id);
    reload();
    onRefreshList?.();
  }

  function handleTaskEdit(_id: number, _patch: Partial<Task>) {
    reload();
    onRefreshList?.();
  }

  async function handleAddTask(title: string, isNextStep: boolean, dueDate: string, assignedToId?: number) {
    await createTask(oppId, { title, is_next_step: isNextStep, due_date: dueDate || undefined, assigned_to_id: assignedToId });
    setShowAddTask(false);
    reload();
    onRefreshList?.();
  }

  async function handleAddNote(content: string) {
    await createNote(oppId, content);
    reload();
  }

  async function handleAssignSelf() {
    if (!user || assigningOwner) return;
    setAssigningOwner(true);
    try {
      await assignSeOwner(oppId, user.id);
      reload();
      onRefreshList?.();
    } finally {
      setAssigningOwner(false);
    }
  }

  async function handleGetSummary() {
    setSummaryLoading(true);
    setSummary(null);
    try {
      const { data } = await api.post<ApiResponse<{ summary: string }>>(`/opportunities/${oppId}/summary`);
      setSummary(data.data.summary);
    } finally {
      setSummaryLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#F5F5F7]">
        <p className="text-sm text-brand-navy-70">Loading…</p>
      </div>
    );
  }
  if (!opp) return null;

  const isReadOnly = opp.is_closed_lost;
  const tasks = opp.tasks ?? [];
  const nextSteps = tasks.filter(t => t.is_next_step && t.status !== 'done');
  const openTasks = tasks.filter(t => !t.is_next_step && t.status !== 'done');
  const doneTasks = tasks.filter(t => t.status === 'done');

  const notesFreshnessDays = daysSince(opp.last_note_at);

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden bg-[#F5F5F7]">

      {/* ── Left: working area ── */}
      <div className="flex-1 min-w-0 overflow-y-auto px-6 py-5 space-y-6">

        {/* Header */}
        <div>
          <div className="flex items-start gap-3 mb-1">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-semibold text-brand-navy leading-tight">{opp.name}</h2>
                {isReadOnly && (
                  <span className="text-[10px] font-semibold bg-brand-pink/10 text-brand-pink px-2 py-0.5 rounded-full uppercase tracking-wide">Closed Lost</span>
                )}
                {opp.key_deal && (
                  <span className="text-[10px] font-semibold bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full uppercase tracking-wide">Key Deal</span>
                )}
              </div>
              <p className="text-sm text-brand-navy-70 mt-0.5">{opp.account_name ?? '—'}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {!isReadOnly && !opp.se_owner && (
                <button
                  onClick={handleAssignSelf}
                  disabled={assigningOwner}
                  className="px-3 py-1.5 text-xs font-medium bg-brand-purple text-white rounded-lg hover:bg-brand-purple-70 disabled:opacity-50 transition-colors"
                >
                  Assign to me
                </button>
              )}
              <div className="relative group/ai">
                <button
                  onClick={handleGetSummary}
                  disabled={summaryLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-brand-navy-30 text-brand-navy-70 rounded-lg opacity-50 cursor-not-allowed transition-colors"
                  title="Requires ANTHROPIC_API_KEY — not configured yet"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  {summaryLoading ? 'Thinking…' : 'AI Summary'}
                </button>
                <div className="absolute bottom-full right-0 mb-1.5 hidden group-hover/ai:block z-10 pointer-events-none">
                  <div className="bg-brand-navy text-white text-[10px] rounded-lg px-2.5 py-1.5 whitespace-nowrap">
                    Needs <code className="font-mono">ANTHROPIC_API_KEY</code> in .env
                  </div>
                </div>
              </div>
            </div>
          </div>
          {summary && (
            <div className="mt-3 bg-brand-purple-30 border border-brand-purple/20 rounded-xl px-4 py-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <svg className="w-3.5 h-3.5 text-brand-purple flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-brand-purple">AI Summary</span>
                <button onClick={() => setSummary(null)} className="ml-auto text-brand-navy-70 hover:text-brand-navy">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-sm text-brand-navy leading-relaxed">{summary}</p>
            </div>
          )}
          {notesFreshnessDays !== null && notesFreshnessDays > 21 && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-status-overdue bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              No notes in {notesFreshnessDays} days
            </div>
          )}
        </div>

        {/* Next Steps */}
        {nextSteps.length > 0 && (
          <div>
            <SectionHeader title="Next Steps" count={nextSteps.length} />
            <div className="bg-white rounded-xl border border-brand-navy-30 px-4 divide-y-0">
              {nextSteps.map(t => (
                <TaskRow key={t.id} task={t} onStatusChange={handleTaskStatusChange} onDelete={handleTaskDelete} onEdit={handleTaskEdit} readOnly={isReadOnly} />
              ))}
            </div>
          </div>
        )}

        {/* Tasks */}
        <div>
          <SectionHeader
            title="Tasks"
            count={openTasks.length}
            action={
              !isReadOnly ? (
                <button
                  onClick={() => setShowAddTask(!showAddTask)}
                  className="text-xs text-brand-purple hover:text-brand-navy font-medium transition-colors"
                >
                  + Add task
                </button>
              ) : undefined
            }
          />
          {!isReadOnly && showAddTask && <AddTaskForm onAdd={handleAddTask} onCancel={() => setShowAddTask(false)} users={activeUsers} defaultAssigneeId={opp?.se_owner?.id} />}
          {openTasks.length > 0 && (
            <div className="bg-white rounded-xl border border-brand-navy-30 px-4 mt-2 divide-y-0">
              {openTasks.map(t => (
                <TaskRow key={t.id} task={t} onStatusChange={handleTaskStatusChange} onDelete={handleTaskDelete} onEdit={handleTaskEdit} readOnly={isReadOnly} />
              ))}
            </div>
          )}
          {openTasks.length === 0 && !showAddTask && (
            <p className="text-xs text-brand-navy-70 italic">No open tasks</p>
          )}
          {doneTasks.length > 0 && (
            <details className="mt-2">
              <summary className="text-[11px] text-brand-navy-70 cursor-pointer hover:text-brand-navy">
                {doneTasks.length} completed task{doneTasks.length !== 1 ? 's' : ''}
              </summary>
              <div className="bg-white rounded-xl border border-brand-navy-30 px-4 mt-1.5">
                {doneTasks.map(t => (
                  <TaskRow key={t.id} task={t} onStatusChange={handleTaskStatusChange} onDelete={handleTaskDelete} onEdit={handleTaskEdit} readOnly={isReadOnly} />
                ))}
              </div>
            </details>
          )}
        </div>

        {/* Notes */}
        <div>
          <SectionHeader
            title="Notes"
            count={notes.length}
            action={
              notesFreshnessDays !== null
                ? <FreshnessTag updatedAt={opp.last_note_at} />
                : undefined
            }
          />
          {!isReadOnly && <AddNoteForm onAdd={handleAddNote} />}
          {notes.length > 0 && (
            <div className="bg-white rounded-xl border border-brand-navy-30 px-4 mt-3">
              {[...notes].reverse().map(n => <NoteItem key={n.id} note={n} />)}
            </div>
          )}
        </div>

      </div>

      {/* ── Drag handle ── */}
      <div
        onMouseDown={onDragStart}
        className="w-1 flex-shrink-0 bg-brand-navy-30/40 hover:bg-brand-purple cursor-col-resize transition-colors relative group"
        title="Drag to resize"
      />

      {/* ── Right: SF info panel ── */}
      <div className="flex-shrink-0 border-l-0 overflow-y-auto bg-white px-4 py-4" style={{ width: rightWidth }}>
        <a
          href={`https://ataccama.lightning.force.com/lightning/r/Opportunity/${opp.sf_opportunity_id}/view`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 w-full mb-4 px-3 py-1.5 rounded-lg border border-brand-navy-30 text-xs font-medium text-brand-navy-70 hover:text-brand-navy hover:border-brand-navy transition-colors"
        >
          <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          Open in Salesforce
        </a>
        <div className="mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-navy-70 mb-2">Deal Info</p>
          <FieldRow label="Stage" value={opp.stage} />
          <FieldRow label="ARR" value={formatARR(opp.arr)} />
          <FieldRow label="Close" value={formatDate(opp.close_date)} />
          <FieldRow label="AE Owner" value={opp.ae_owner_name} />
          <FieldRow label="SE Owner" value={opp.se_owner?.name ?? 'Unassigned'} />
          <FieldRow label="Team" value={opp.team} />
          <FieldRow label="Record Type" value={opp.record_type} />
          <FieldRow label="Deploy" value={opp.deploy_mode} />
          <FieldRow label="PoC Status" value={opp.poc_status} />
          <FieldRow label="Competitors" value={opp.engaged_competitors} />
        </div>

        <div className="space-y-0 border-t border-brand-navy-30/50 pt-2">
          <Collapsible title="SF Next Step" defaultOpen={true}>
            <p className="text-xs text-brand-navy leading-relaxed">{opp.next_step_sf ?? '—'}</p>
            <FieldHistory oppId={oppId} field="next_step_sf" />
          </Collapsible>

          <Collapsible title="SE Comments" defaultOpen={true}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <FreshnessTag updatedAt={opp.se_comments_updated_at} />
            </div>
            <p className="text-xs text-brand-navy leading-relaxed whitespace-pre-wrap">{opp.se_comments ?? '—'}</p>
            <FieldHistory oppId={oppId} field="se_comments" />
          </Collapsible>

          {(opp.manager_comments || user?.role === 'manager') && (
            <Collapsible title="Manager Comments" defaultOpen={false}>
              <p className="text-xs text-brand-navy leading-relaxed whitespace-pre-wrap">{opp.manager_comments ?? '—'}</p>
            </Collapsible>
          )}

          {opp.previous_stage && (
            <Collapsible title="Stage History" defaultOpen={false}>
              <FieldRow label="Previous" value={opp.previous_stage} />
              <FieldRow label="Changed" value={formatDate(opp.stage_changed_at)} />
            </Collapsible>
          )}
        </div>
      </div>

    </div>
  );
}
