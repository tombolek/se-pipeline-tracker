import { useState, useEffect, useCallback, useRef } from 'react';
import { track } from '../hooks/useTracking';
import type { Opportunity, Task, Note, User } from '../types';
import { computeHealthScore } from '../utils/healthScore';
import { computeMeddpicc } from '../utils/meddpicc';
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
import OpportunityTimeline from './OpportunityTimeline';
import AccountTimelinePanel from './AccountTimelinePanel';
import MeetingNotesModal from './MeetingNotesModal';

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

const HEALTH_PILL_STYLES = {
  green: { pill: 'bg-emerald-50 border-emerald-200/60 hover:border-emerald-300', dot: 'bg-status-success', text: 'text-emerald-700', chevron: 'text-emerald-400' },
  amber: { pill: 'bg-amber-50 border-amber-200/60 hover:border-amber-400', dot: 'bg-status-warning', text: 'text-amber-700', chevron: 'text-amber-400' },
  red:   { pill: 'bg-red-50 border-red-200/60 hover:border-red-400', dot: 'bg-status-overdue', text: 'text-red-700', chevron: 'text-red-300' },
};

function HealthScorePill({ opp }: { opp: Opportunity }) {
  const { score, rag, factors } = computeHealthScore(opp);
  const s = HEALTH_PILL_STYLES[rag];

  return (
    <div className="relative group/health">
      <button className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-colors ${s.pill}`}>
        <div className={`w-2 h-2 rounded-full ${s.dot}`} />
        <span className={`text-[11px] font-semibold tabular-nums ${s.text}`}>{score}</span>
        <svg className={`w-2.5 h-2.5 ${s.chevron}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
      </button>
      {/* Hover popover */}
      <div className="absolute top-full right-0 mt-1.5 z-50 hidden group-hover/health:block">
        <div className="bg-white border border-brand-navy-30 rounded-xl shadow-lg p-3 w-[240px]">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-navy-70 mb-2">Health Score Breakdown</p>
          <div className="space-y-1.5">
            {factors.length === 0 ? (
              <p className="text-[11px] text-status-success">No issues detected</p>
            ) : (
              factors.map(f => (
                <div key={f.label} className="flex items-center justify-between text-[12px]">
                  <span className="text-brand-navy-70">{f.label}</span>
                  <span className="font-semibold text-status-overdue">-{f.deduction}</span>
                </div>
              ))
            )}
          </div>
          <div className="mt-2 pt-2 border-t border-brand-navy-30/30">
            <p className={`text-[10px] ${s.text} font-medium`}>{rag === 'green' ? 'Healthy' : rag === 'amber' ? 'Needs attention' : 'At risk'} · {score}/100</p>
          </div>
        </div>
      </div>
    </div>
  );
}

const MEDDPICC_PILL_STYLES = {
  green: { pill: 'bg-emerald-50 border-emerald-200/60 hover:border-emerald-300', text: 'text-emerald-700', chevron: 'text-emerald-400' },
  amber: { pill: 'bg-amber-50 border-amber-200/60 hover:border-amber-400', text: 'text-amber-700', chevron: 'text-amber-400' },
  red:   { pill: 'bg-red-50 border-red-200/60 hover:border-red-400', text: 'text-red-600', chevron: 'text-red-300' },
};

const QUALITY_ICON = {
  strong: <span className="text-status-success font-bold">✓</span>,
  weak:   <span className="text-status-warning">◐</span>,
  empty:  <span className="text-brand-navy-30">○</span>,
};

function MeddpiccPill({ opp }: { opp: Opportunity }) {
  const { fields, strong, rag } = computeMeddpicc(opp);
  const s = MEDDPICC_PILL_STYLES[rag];

  return (
    <div className="relative group/medd">
      <button className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-colors ${s.pill}`}>
        <span className={`text-[11px] font-semibold tabular-nums ${s.text}`}>{strong}/9</span>
        <svg className={`w-2.5 h-2.5 ${s.chevron}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
      </button>
      {/* Hover popover */}
      <div className="absolute top-full right-0 mt-1.5 z-50 hidden group-hover/medd:block">
        <div className="bg-white border border-brand-navy-30 rounded-xl shadow-lg p-3 w-[240px]">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-navy-70 mb-2">MEDDPICC Fields</p>
          <div className="space-y-1">
            {fields.map(f => (
              <div key={f.key as string} className="flex items-center gap-1.5">
                <span className="text-[11px] w-3.5 text-center flex-shrink-0">{QUALITY_ICON[f.quality]}</span>
                <span className={`text-[11px] ${f.quality === 'empty' ? 'text-brand-navy-30' : 'text-brand-navy'}`}>{f.label}</span>
                {f.quality === 'weak' && (
                  <span className="ml-auto text-[9px] text-status-warning">short</span>
                )}
              </div>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t border-brand-navy-30/30">
            <p className={`text-[10px] ${s.text} font-medium`}>{rag === 'green' ? 'Well qualified' : rag === 'amber' ? 'Partially qualified' : 'Under-qualified'} · {strong}/9 fields filled</p>
          </div>
        </div>
      </div>
    </div>
  );
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
  const [activeTab, setActiveTab] = useState<'work' | 'timeline'>('work');

  const [showAllFields, setShowAllFields] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [showAccountPanel, setShowAccountPanel] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const initialLoadDone = useRef(false);

  const reload = useCallback(async () => {
    // Only show loading spinner on initial load. Background refreshes
    // (e.g. from MeetingNotesModal) must NOT set loading=true, because
    // the early-return guard unmounts portalled modals and destroys state.
    if (!initialLoadDone.current) setLoading(true);
    try {
      const [detail, noteList] = await Promise.all([
        getOpportunity(oppId),
        getNotes(oppId),
      ]);
      setOpp(detail);
      setNotes(noteList);
      initialLoadDone.current = true;
    } finally {
      setLoading(false);
    }
  }, [oppId]);

  useEffect(() => {
    listUsers().then(users => setActiveUsers(users.filter(u => u.is_active)));
  }, []);

  useEffect(() => { initialLoadDone.current = false; reload(); }, [reload]);
  useEffect(() => { track('open', 'opportunity', oppId); }, [oppId]);

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
    <div className="flex-1 flex min-h-0 overflow-hidden bg-[#F5F5F7] relative">

      {/* ── Left: working area (55%) ── */}
      <div className="w-[55%] flex-shrink-0 min-w-0 flex flex-col overflow-hidden">

        {/* Compact header */}
        <div className="px-5 pt-4 pb-3 bg-white border-b border-brand-navy-30/30 flex-shrink-0">
          {/* Row 1: Title + badges + Summarize */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-semibold text-brand-navy leading-snug truncate">{opp.name}</h2>
                {isReadOnly && (
                  <span className="text-[9px] font-semibold bg-brand-pink/10 text-brand-pink px-1.5 py-px rounded-full uppercase tracking-wide">Closed Lost</span>
                )}
                {opp.key_deal && (
                  <span className="text-[9px] font-semibold bg-yellow-100 text-yellow-700 px-1.5 py-px rounded-full uppercase tracking-wide">Key Deal</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {!isReadOnly && !opp.se_owner && (
                <button
                  onClick={handleAssignSelf}
                  disabled={assigningOwner}
                  className="px-2.5 py-1.5 text-[11px] font-medium bg-brand-purple text-white rounded-lg hover:bg-brand-purple-70 disabled:opacity-50 transition-colors"
                >
                  Assign to me
                </button>
              )}
              {/* Summarize button — sparkle icon + label */}
              <button
                onClick={handleGetSummary}
                disabled={summaryLoading}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-brand-navy-30 hover:border-brand-purple hover:bg-brand-purple-30/30 transition-colors group/ai disabled:opacity-50"
                title="AI Summary"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="url(#ai-sparkle-grad)" className="group-hover/ai:opacity-80"/>
                  <defs><linearGradient id="ai-sparkle-grad" x1="2" y1="2" x2="22" y2="22"><stop stopColor="#F10090"/><stop offset="1" stopColor="#6A2CF5"/></linearGradient></defs>
                </svg>
                <span className="text-[11px] font-medium text-brand-navy-70 group-hover/ai:text-brand-navy">
                  {summaryLoading ? 'Thinking…' : 'Summarize'}
                </span>
              </button>
            </div>
          </div>

          {/* Row 2: Account + meta + score pills */}
          <div className="flex items-center gap-3 mt-1.5">
            {opp.account_name ? (
              <button
                onClick={() => setShowAccountPanel(v => !v)}
                className="flex items-center gap-1 text-[12px] text-brand-purple font-medium hover:text-brand-purple-70 transition-colors"
                title="View account history"
              >
                <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                </svg>
                {opp.account_name}
              </button>
            ) : (
              <span className="text-[11px] text-brand-navy-70">—</span>
            )}
            <span className="text-brand-navy-30">|</span>
            <span className="text-[11px] text-brand-navy-70">{opp.stage}</span>
            {opp.arr != null && <>
              <span className="text-brand-navy-30">|</span>
              <span className="text-[11px] text-brand-navy-70">{formatARR(opp.arr)}</span>
            </>}
            {opp.close_date && <>
              <span className="text-brand-navy-30">|</span>
              <span className="text-[11px] text-brand-navy-70">Close {formatDate(opp.close_date)}</span>
            </>}

            {/* Score pills — compact, hover for details */}
            <div className="ml-auto flex items-center gap-2">
              <HealthScorePill opp={opp} />
              <MeddpiccPill opp={opp} />
            </div>
          </div>
        </div>

        {/* Summary callout (below header, above tabs) */}
        <div className="px-5">
          {summary && (
            <div className="mt-3 bg-brand-purple-30 border border-brand-purple/20 rounded-xl px-4 py-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <svg className="w-3.5 h-3.5 text-brand-purple flex-shrink-0" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="#6A2CF5"/>
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

        {/* Tab bar */}
        <div className="flex gap-1 bg-white mx-5 mt-3 border border-brand-navy-30/40 rounded-xl p-1 flex-shrink-0">
          {(['work', 'timeline'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-brand-purple text-white'
                  : 'text-brand-navy-70 hover:text-brand-navy'
              }`}
            >
              {tab === 'work' ? 'Work' : 'Timeline'}
            </button>
          ))}
        </div>

        {/* Scrollable work area */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">

        {/* Timeline tab */}
        {activeTab === 'timeline' && <OpportunityTimeline oppId={oppId} />}

        {/* Work tab content */}
        {activeTab === 'work' && <>

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
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-brand-navy-70">Notes</h3>
              {notes.length > 0 && (
                <span className="text-[10px] bg-brand-navy-30 text-brand-navy-70 rounded-full px-1.5 py-px font-medium">{notes.length}</span>
              )}
              {notesFreshnessDays !== null && (
                <div className="flex items-center gap-1 ml-1">
                  <FreshnessTag updatedAt={opp.last_note_at} />
                </div>
              )}
            </div>
            {!isReadOnly && (
              <button
                onClick={() => setShowNotesModal(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium bg-brand-purple text-white rounded-lg hover:bg-brand-purple-70 transition-colors"
                title="Import call notes with Claude"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Import with Claude
              </button>
            )}
          </div>
          {!isReadOnly && <AddNoteForm onAdd={handleAddNote} />}
          {notes.length > 0 && (
            <div className="bg-white rounded-xl border border-brand-navy-30 px-4 mt-3">
              {[...notes].reverse().map(n => <NoteItem key={n.id} note={n} />)}
            </div>
          )}
        </div>

        </>}

        </div>{/* end scrollable work area */}
      </div>

      {/* ── Right: SF info panel (45%) ── */}
      <div className="flex-1 min-w-0 overflow-y-auto bg-white border-l border-brand-navy-30/30">
        {/* Open in SF — compact */}
        <div className="px-4 pt-3 pb-2 border-b border-brand-navy-30/20">
          <a
            href={`https://ataccama.lightning.force.com/lightning/r/Opportunity/${opp.sf_opportunity_id}/view`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-brand-navy-30 text-[11px] font-medium text-brand-navy-70 hover:text-brand-navy hover:border-brand-navy transition-colors"
          >
            <svg className="w-3.5 h-3.5 text-[#00A1E0]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.8 5.4c-.7-.7-1.6-1.1-2.6-1.1-1.3 0-2.5.7-3.2 1.7C9.4 5.4 8.6 5 7.7 5 5.7 5 4 6.7 4 8.8c0 .4.1.8.2 1.2C3 10.7 2 12 2 13.5 2 15.4 3.6 17 5.5 17c.3 0 .5 0 .8-.1.5 1.4 1.8 2.4 3.4 2.4 1.3 0 2.4-.7 3-1.8.6.4 1.2.6 2 .6 1.3 0 2.4-.7 3-1.8.3.1.7.1 1.1.1C21 16.4 23 14.5 23 12c0-2-1.3-3.7-3.1-4.3-.7-1.3-2.1-2.3-3.6-2.3h-.5z"/>
            </svg>
            Open
            <svg className="w-2.5 h-2.5 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
          </a>
        </div>
        <div className="px-4 py-3 border-b border-brand-navy-30/20">
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
          <FieldRow label="RFx Status" value={opp.rfx_status} />
          <FieldRow label="Competitors" value={opp.engaged_competitors} />
        </div>

        {/* See all fields */}
        <div className="mb-3">
          <button
            onClick={() => setShowAllFields(v => !v)}
            className="flex items-center gap-1.5 text-[11px] text-brand-navy-70 hover:text-brand-navy transition-colors"
          >
            <svg className={`w-3 h-3 transition-transform ${showAllFields ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
            {showAllFields ? 'Hide all fields' : 'See all fields'}
          </button>
          {showAllFields && opp.sf_raw_fields && (
            <div className="mt-2 border border-brand-navy-30/40 rounded-lg overflow-hidden">
              {Object.entries(opp.sf_raw_fields).map(([key, val]) => (
                <div key={key} className="flex justify-between gap-2 px-3 py-1.5 text-xs border-b border-brand-navy-30/20 last:border-0 even:bg-gray-50/60">
                  <span className="text-brand-navy-70 flex-shrink-0 max-w-[45%]">{key}</span>
                  <span className="text-brand-navy font-medium text-right break-words">{val === null || val === undefined || val === '' ? '—' : String(val)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 space-y-0 border-t border-brand-navy-30/50 pt-2">
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

          <Collapsible title="MEDDPICC" defaultOpen={false}>
            {(() => {
              const { fields } = computeMeddpicc(opp);
              return (
                <div className="space-y-2.5">
                  {fields.map(f => {
                    const val = opp[f.key] as string | null;
                    return (
                      <div key={f.key as string}>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[10px]">{QUALITY_ICON[f.quality]}</span>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-navy-70">{f.label}</span>
                          {f.quality === 'weak' && (
                            <span className="text-[9px] text-status-warning font-medium ml-auto">short</span>
                          )}
                        </div>
                        <p className={`text-xs leading-relaxed ${val ? 'text-brand-navy' : 'text-brand-navy-30 italic'}`}>
                          {val ?? 'Not filled'}
                        </p>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </Collapsible>
        </div>
      </div>

      {/* ── Meeting Notes Modal ── */}
      {showNotesModal && (
        <MeetingNotesModal
          opp={opp}
          onClose={() => setShowNotesModal(false)}
          onRefresh={reload}
        />
      )}

      {/* ── Account Timeline Panel ── */}
      {showAccountPanel && opp.account_name && (
        <AccountTimelinePanel
          accountName={opp.account_name}
          currentOppId={opp.id}
          onClose={() => setShowAccountPanel(false)}
        />
      )}

    </div>
  );
}
