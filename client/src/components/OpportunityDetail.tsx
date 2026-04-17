import { useState, useEffect, useCallback, useRef } from 'react';
import { track } from '../hooks/useTracking';
import type { Opportunity, Task, Note, User } from '../types';
import { computeHealthScore } from '../utils/healthScore';
import { computeMeddpicc } from '../utils/meddpicc';
import { getOpportunity, assignSeOwner, getFavoriteIds, addFavorite, removeFavorite } from '../api/opportunities';
import { createTask, updateTask, deleteTask } from '../api/tasks';
import { getNotes, createNote } from '../api/notes';
import { listUsers } from '../api/users';
import { useAuthStore } from '../store/auth';
import api from '../api/client';
import type { ApiResponse } from '../types';
import { useAiJobAttach } from '../hooks/useAiJob';
import { formatDate, formatARR, daysSince } from '../utils/formatters';
import { TaskRow, AddTaskForm } from './opportunity/TaskSection';
import { NoteItem, AddNoteForm } from './opportunity/NoteSection';
import ApplyTemplateButton from './opportunity/ApplyTemplateButton';
import ContributorsStrip from './opportunity/ContributorsStrip';
import OwnerSelector from './opportunity/OwnerSelector';
import OpportunityTimeline from './OpportunityTimeline';
import CallPrepTab from './CallPrepTab';
import AccountTimelinePanel from './AccountTimelinePanel';
import MeetingNotesModal from './MeetingNotesModal';
import DealInfoTab from './opportunity/DealInfoTab';
import DemoPrepTab from './DemoPrepTab';
import SimilarDealsTab from './SimilarDealsTab';

// ── MEDDPICC Coach types ──────────────────────────────────────────────────────
export interface CoachElement {
  key: string;
  label: string;
  status: 'green' | 'amber' | 'red';
  evidence: string | null;
  gap: string | null;
  suggested_question: string | null;
}
export interface CoachResult {
  elements: CoachElement[];
  overall_assessment: string;
  counts: { green: number; amber: number; red: number };
}

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

function HealthScorePill({ opp, onClick }: { opp: Opportunity; onClick?: () => void }) {
  const { score, rag, factors } = computeHealthScore(opp);
  const s = HEALTH_PILL_STYLES[rag];

  return (
    <div className="relative group/health">
      <button onClick={onClick} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-colors ${s.pill}`}>
        <div className={`w-2 h-2 rounded-full ${s.dot}`} />
        <span className={`text-[10px] font-medium text-brand-navy-70`}>Health</span>
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

function MeddpiccPill({ opp, onClick }: { opp: Opportunity; onClick?: () => void }) {
  const { fields, strong, rag } = computeMeddpicc(opp);
  const s = MEDDPICC_PILL_STYLES[rag];

  return (
    <div className="relative group/medd">
      <button onClick={onClick} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-colors ${s.pill}`}>
        <span className={`text-[10px] font-medium text-brand-navy-70`}>MEDDPICC</span>
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

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  oppId: number;
  onRefreshList?: () => void;
  initialTab?: 'work' | 'timeline' | 'call-prep' | 'demo-prep' | 'similar-deals' | 'deal-info';
  initialAction?: 'summary' | 'notes-processor';
}

export default function OpportunityDetail({ oppId, onRefreshList, initialTab, initialAction }: Props) {
  const { user } = useAuthStore();
  const [opp, setOpp] = useState<Opportunity | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeUsers, setActiveUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showAddNote, setShowAddNote] = useState(false);
  const [assigningOwner, setAssigningOwner] = useState(false);
  const [activeTab, setActiveTab] = useState<'work' | 'timeline' | 'call-prep' | 'demo-prep' | 'similar-deals' | 'deal-info'>(initialTab ?? 'work');
  const [scrollToSection, setScrollToSection] = useState<string | null>(null);

  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryGeneratedAt, setSummaryGeneratedAt] = useState<string | null>(null);
  const [summaryCollapsed, setSummaryCollapsed] = useState(false);
  const [coachResult, setCoachResult] = useState<CoachResult | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachGeneratedAt, setCoachGeneratedAt] = useState<string | null>(null);
  const [coachCollapsed, setCoachCollapsed] = useState(true);
  const coachPanelRef = useRef<HTMLDivElement>(null);
  const [showAccountPanel, setShowAccountPanel] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
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

  // Load favorite state
  useEffect(() => {
    getFavoriteIds().then(ids => setIsFavorite(ids.includes(oppId))).catch(() => {});
  }, [oppId]);

  const toggleFavorite = async () => {
    setFavoriteLoading(true);
    try {
      if (isFavorite) { await removeFavorite(oppId); setIsFavorite(false); }
      else { await addFavorite(oppId); setIsFavorite(true); }
    } catch { /* silently fail */ }
    setFavoriteLoading(false);
  };

  // Trigger initial action (summary or notes processor) after first load
  const initialActionFired = useRef(false);
  useEffect(() => {
    if (!initialAction || initialActionFired.current || !opp || loading) return;
    initialActionFired.current = true;
    if (initialAction === 'summary') handleGetSummary();
    if (initialAction === 'notes-processor') setShowNotesModal(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAction, opp, loading]);

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
    setShowAddNote(false);
    reload();
  }

  function handleTemplateApplied() {
    // Both task_pack and note results need a full reload: the server persisted new rows
    // and we want authoritative timestamps/ids plus any opportunity-level recomputes.
    reload();
    onRefreshList?.();
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
    setSummaryCollapsed(false);
    try {
      const { data } = await api.post<ApiResponse<{ summary: string; generated_at: string }>>(`/opportunities/${oppId}/summary`);
      setSummary(data.data.summary);
      setSummaryGeneratedAt(data.data.generated_at);
    } finally {
      setSummaryLoading(false);
    }
  }

  // Load cached summary + coach result on mount
  useEffect(() => {
    api.get<ApiResponse<{ summary: string; generated_at: string } | null>>(`/opportunities/${oppId}/summary/cached`)
      .then(r => {
        if (r.data.data) {
          setSummary(r.data.data.summary);
          setSummaryGeneratedAt(r.data.data.generated_at);
        }
      })
      .catch(() => {});
    api.get<ApiResponse<{ coach: CoachResult; generated_at: string } | null>>(`/opportunities/${oppId}/meddpicc-coach/cached`)
      .then(r => {
        if (r.data.data?.coach) {
          setCoachResult(r.data.data.coach);
          setCoachGeneratedAt(r.data.data.generated_at);
        }
      })
      .catch(e => console.warn('Failed to load cached coach:', e));
  }, [oppId]);

  // Re-attach to in-flight AI Summary generation if user navigates back mid-run.
  useAiJobAttach({
    key: `summary-${oppId}`,
    currentGeneratedAt: summaryGeneratedAt,
    fetchCached: async () => {
      const r = await api.get<ApiResponse<{ summary: string; generated_at: string } | null>>(
        `/opportunities/${oppId}/summary/cached`
      );
      return { generatedAt: r.data.data?.generated_at ?? null };
    },
    onRunning: () => { setSummaryLoading(true); setSummaryCollapsed(false); },
    onFresh: async () => {
      const r = await api.get<ApiResponse<{ summary: string; generated_at: string } | null>>(
        `/opportunities/${oppId}/summary/cached`
      );
      if (r.data.data) {
        setSummary(r.data.data.summary);
        setSummaryGeneratedAt(r.data.data.generated_at);
      }
      setSummaryLoading(false);
    },
    onTimeout: () => setSummaryLoading(false),
  });

  // Re-attach to in-flight MEDDPICC Coach generation if user navigates back mid-run.
  useAiJobAttach({
    key: `meddpicc-coach-${oppId}`,
    currentGeneratedAt: coachGeneratedAt,
    fetchCached: async () => {
      const r = await api.get<ApiResponse<{ coach: CoachResult; generated_at: string } | null>>(
        `/opportunities/${oppId}/meddpicc-coach/cached`
      );
      return { generatedAt: r.data.data?.generated_at ?? null };
    },
    onRunning: () => setCoachLoading(true),
    onFresh: async () => {
      const r = await api.get<ApiResponse<{ coach: CoachResult; generated_at: string } | null>>(
        `/opportunities/${oppId}/meddpicc-coach/cached`
      );
      if (r.data.data?.coach) {
        setCoachResult(r.data.data.coach);
        setCoachGeneratedAt(r.data.data.generated_at);
        setCoachCollapsed(false);
      }
      setCoachLoading(false);
    },
    onTimeout: () => setCoachLoading(false),
  });

  async function handleGetCoach() {
    setCoachLoading(true);
    try {
      const { data } = await api.post<ApiResponse<{ coach: CoachResult; generated_at: string }>>(`/opportunities/${oppId}/meddpicc-coach`);
      if (data.data?.coach) {
        setCoachResult(data.data.coach);
        setCoachGeneratedAt(data.data.generated_at);
        setCoachCollapsed(false); // auto-expand when freshly generated
        setTimeout(() => coachPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
      } else {
        console.error('MEDDPICC Coach: API returned no coach data', data);
      }
    } catch (e) {
      console.error('MEDDPICC Coach error:', e);
    } finally {
      setCoachLoading(false);
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
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#F5F5F7] relative">

        {/* Compact header — pl-12 leaves space for Drawer close button */}
        <div className="pl-12 pr-5 pt-4 pb-3 bg-white border-b border-brand-navy-30/30 flex-shrink-0">
          {/* Row 1: Title + badges + Summarize */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={toggleFavorite}
                  disabled={favoriteLoading}
                  className="flex-shrink-0 transition-colors disabled:opacity-50"
                  title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                >
                  {isFavorite ? (
                    <svg className="w-5 h-5 text-amber-400" viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                  ) : (
                    <svg className="w-5 h-5 text-brand-navy-30 hover:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"/></svg>
                  )}
                </button>
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
            <span className="text-brand-navy-30">|</span>
            <span className={`text-[11px] font-medium ${opp.poc_status ? 'text-brand-navy' : 'text-brand-navy-30'}`}>
              PoC {opp.poc_status ?? 'N/A'}
            </span>
            <span className="text-brand-navy-30">|</span>
            <span className={`text-[11px] font-medium ${opp.rfx_status ? 'text-brand-navy' : 'text-brand-navy-30'}`}>
              RFx {opp.rfx_status ?? 'N/A'}
            </span>

            {/* Score pills — compact, hover for details */}
            <div className="ml-auto flex items-center gap-2">
              <HealthScorePill opp={opp} onClick={() => { setActiveTab('deal-info'); setScrollToSection('health-breakdown'); }} />
              <MeddpiccPill opp={opp} onClick={() => { setActiveTab('deal-info'); setScrollToSection('meddpicc'); }} />
              {/* MEDDPICC Coach trigger */}
              <button
                onClick={handleGetCoach}
                disabled={coachLoading}
                className="w-6 h-6 rounded-full flex items-center justify-center border border-brand-purple/30 bg-brand-purple-30/40 hover:bg-brand-purple-30 hover:border-brand-purple transition-colors disabled:opacity-50"
                title="MEDDPICC Gap Coach"
              >
                {coachLoading ? (
                  <svg className="w-3 h-3 animate-spin text-brand-purple" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                    <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" stroke="url(#coach-grad)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <defs><linearGradient id="coach-grad" x1="3" y1="3" x2="21" y2="21"><stop stopColor="#F10090"/><stop offset="1" stopColor="#6A2CF5"/></linearGradient></defs>
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Row 3: SE Owner + Contributors (Issues #104, header fix) */}
          <div className="mt-2 flex items-start gap-5 flex-wrap relative">
            <OwnerSelector
              oppId={oppId}
              owner={opp.se_owner}
              readOnly={isReadOnly}
              onChange={next => setOpp(prev => prev ? { ...prev, se_owner: next.se_owner ?? null } : prev)}
            />
            <span className="text-brand-navy-30">|</span>
            <ContributorsStrip
              oppId={oppId}
              ownerId={opp.se_owner?.id ?? null}
              contributors={opp.se_contributors ?? []}
              readOnly={isReadOnly}
              onChange={next => setOpp(prev => prev ? { ...prev, se_contributors: next } : prev)}
            />
          </div>
        </div>

        {/* Summary callout (below header, above tabs) */}
        <div className="px-5 flex-shrink-0">
          {summary && (
            <div className="mt-3 bg-brand-purple-30 border border-brand-purple/20 rounded-xl overflow-hidden">
              {/* Header — always visible, clickable to collapse */}
              <button
                onClick={() => setSummaryCollapsed(c => !c)}
                className="w-full flex items-center gap-1.5 px-4 py-2.5 text-left"
              >
                <svg className="w-3.5 h-3.5 text-brand-purple flex-shrink-0" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="#6A2CF5"/>
                </svg>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-brand-purple">AI Summary</span>
                {summaryGeneratedAt && (() => {
                  const days = Math.floor((Date.now() - new Date(summaryGeneratedAt).getTime()) / 86400000);
                  const color = days <= 3 ? 'text-status-success' : days <= 14 ? 'text-status-warning' : 'text-status-overdue';
                  return (
                    <span className={`text-[10px] font-medium ${color} ml-1`}>
                      {days === 0 ? 'today' : `${days}d ago`}
                    </span>
                  );
                })()}
                <div className="ml-auto flex items-center gap-1">
                  <svg className={`w-3 h-3 text-brand-navy-70 transition-transform ${summaryCollapsed ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>
              {/* Body — collapsible */}
              {!summaryCollapsed && (
                <div className="px-4 pb-3 text-sm text-brand-navy leading-relaxed space-y-2">
                  {summary.split('\n').filter(line => line.trim()).map((line, i) => {
                    const stripped = line.replace(/^#{1,4}\s+/, '');
                    const isHeader = line !== stripped;
                    const parts = stripped.split(/\*\*(.+?)\*\*/g);
                    const rendered = parts.map((part, j) =>
                      j % 2 === 1
                        ? <strong key={j} className="font-semibold text-brand-navy">{part}</strong>
                        : <span key={j}>{part}</span>
                    );
                    if (isHeader) {
                      return <p key={i} className="font-semibold text-brand-navy text-xs uppercase tracking-wide mt-2 first:mt-0">{rendered}</p>;
                    }
                    return <p key={i}>{rendered}</p>;
                  })}
                  {/* Regenerate link */}
                  <div className="flex items-center gap-3 pt-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleGetSummary(); }}
                      disabled={summaryLoading}
                      className="text-[10px] font-medium text-brand-purple hover:text-brand-purple-70 transition-colors disabled:opacity-50"
                    >
                      {summaryLoading ? 'Regenerating...' : 'Regenerate'}
                    </button>
                  </div>
                </div>
              )}
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
          {/* MEDDPICC Gap Coach panel — collapsed by default, above tabs */}
          {coachResult && (
            <div ref={coachPanelRef} className="mt-3 bg-gradient-to-br from-brand-purple-30/80 to-brand-purple-30/40 border border-brand-purple/20 rounded-xl overflow-hidden">
              {/* Header — always visible, clickable to collapse */}
              <button
                onClick={() => setCoachCollapsed(c => !c)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-left"
              >
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                  <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" stroke="#6A2CF5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-brand-purple">MEDDPICC Gap Coach</span>
                {coachGeneratedAt && (() => {
                  const days = Math.floor((Date.now() - new Date(coachGeneratedAt).getTime()) / 86400000);
                  const color = days <= 3 ? 'text-status-success' : days <= 14 ? 'text-status-warning' : 'text-status-overdue';
                  return (
                    <span className={`text-[10px] font-medium ${color} ml-1`}>
                      {days === 0 ? 'today' : `${days}d ago`}
                    </span>
                  );
                })()}
                {coachResult.counts && (
                  <span className="text-[10px] text-brand-navy-70 ml-1">
                    {coachResult.counts.green}✓ {coachResult.counts.amber}◐ {coachResult.counts.red}✗
                  </span>
                )}
                <div className="ml-auto flex items-center gap-1">
                  <svg className={`w-3 h-3 text-brand-navy-70 transition-transform ${coachCollapsed ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Body — collapsible, with internal scroll for long content */}
              {!coachCollapsed && (
                <div className="max-h-[50vh] overflow-y-auto">
                  {/* Element rows */}
                  <div className="divide-y divide-brand-purple/10 border-t border-brand-purple/10">
                    {coachResult.elements.map(el => {
                      const dotColor = el.status === 'green' ? 'bg-status-success ring-status-success/20'
                        : el.status === 'amber' ? 'bg-status-warning ring-status-warning/20'
                        : 'bg-status-overdue ring-status-overdue/20';
                      const badgeColor = el.status === 'green' ? 'text-status-success bg-emerald-50'
                        : el.status === 'amber' ? 'text-status-warning bg-amber-50'
                        : 'text-status-overdue bg-red-50';
                      const badgeLabel = el.status === 'green' ? 'Strong'
                        : el.status === 'amber' ? 'Gap'
                        : 'No evidence';
                      return (
                        <div key={el.key} className="px-4 py-3">
                          <div className="flex items-start gap-2.5">
                            <span className={`mt-0.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ring-2 ${dotColor}`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-brand-navy">{el.label}</span>
                                <span className={`text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${badgeColor}`}>{badgeLabel}</span>
                              </div>
                              {el.evidence && (
                                <p className="text-[11px] text-brand-navy-70 mt-1 leading-relaxed">{el.evidence}</p>
                              )}
                              {el.gap && (
                                <p className="text-[11px] text-brand-navy-70 mt-1 leading-relaxed">{el.gap}</p>
                              )}
                              {el.suggested_question && (
                                <div className="mt-2 bg-white/60 rounded-lg px-3 py-2 border border-brand-purple/10">
                                  <p className="text-[10px] font-semibold text-brand-purple uppercase tracking-wide mb-0.5">Suggested question</p>
                                  <p className="text-[11px] text-brand-navy italic leading-relaxed">{el.suggested_question}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Overall assessment */}
                  <div className="px-4 py-3 bg-white/40 border-t border-brand-purple/10">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <svg className="w-3.5 h-3.5 text-brand-purple flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                      </svg>
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-brand-purple">Overall Assessment</span>
                    </div>
                    <p className="text-[11px] text-brand-navy leading-relaxed">{coachResult.overall_assessment}</p>
                    <div className="flex items-center gap-3 mt-2 pt-2 border-t border-brand-purple/10">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleGetCoach(); }}
                        disabled={coachLoading}
                        className="text-[10px] font-medium text-brand-purple hover:text-brand-purple-70 transition-colors disabled:opacity-50"
                      >
                        {coachLoading ? 'Analyzing…' : 'Regenerate'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tab bar — real tab style with active tab connected to content */}
        <div className="flex px-5 bg-[#F5F5F7] pt-1 flex-shrink-0">
          {([
            { key: 'work' as const, label: 'Work' },
            { key: 'timeline' as const, label: 'Timeline' },
            { key: 'call-prep' as const, label: 'Call Prep', icon: true },
            { key: 'demo-prep' as const, label: 'Demo Prep', icon: 'demo' as const },
            { key: 'similar-deals' as const, label: 'Similar Deals', icon: 'similar' as const },
            { key: 'deal-info' as const, label: 'Deal Info' },
          ]).map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`relative px-5 py-2 text-xs font-semibold transition-colors flex items-center gap-1.5 rounded-t-lg border border-b-0 ${
                  isActive
                    ? 'bg-white text-brand-purple border-brand-navy-30/40 z-10'
                    : 'bg-transparent text-brand-navy-70 border-transparent hover:text-brand-navy hover:bg-white/50'
                }`}
                style={isActive ? { marginBottom: '-1px' } : undefined}
              >
                {tab.icon === true && (
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"/>
                  </svg>
                )}
                {tab.icon === 'demo' && (
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5"/>
                  </svg>
                )}
                {tab.icon === 'similar' && (
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="9" cy="9" r="6"/>
                    <circle cx="17" cy="17" r="4"/>
                  </svg>
                )}
                {tab.label}
              </button>
            );
          })}
        </div>
        {/* Divider line under tabs — active tab overlaps it */}
        <div className="border-t border-brand-navy-30/40 flex-shrink-0" />

        {/* Scrollable work area */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6 bg-white">

        {/* Timeline tab */}
        {activeTab === 'timeline' && <OpportunityTimeline oppId={oppId} />}

        {/* Call Prep tab */}
        {activeTab === 'call-prep' && <CallPrepTab oppId={oppId} oppName={opp?.name} />}

        {/* Demo Prep tab */}
        {activeTab === 'demo-prep' && <DemoPrepTab oppId={oppId} oppName={opp?.name} />}

        {/* Similar Deals tab */}
        {activeTab === 'similar-deals' && <SimilarDealsTab oppId={oppId} oppName={opp?.name} />}

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
                <div className="flex items-center gap-3">
                  <ApplyTemplateButton
                    oppId={oppId}
                    stage={opp?.stage ?? null}
                    kind="task_pack"
                    onApplied={handleTemplateApplied}
                  />
                  <span className="text-brand-navy-30">·</span>
                  <button
                    onClick={() => setShowAddTask(!showAddTask)}
                    className="text-xs text-brand-purple hover:text-brand-navy font-medium transition-colors"
                  >
                    + Add task
                  </button>
                </div>
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
              <div className="flex items-center gap-3">
                <ApplyTemplateButton
                  oppId={oppId}
                  stage={opp?.stage ?? null}
                  kind="note"
                  onApplied={handleTemplateApplied}
                />
                <span className="text-brand-navy-30">·</span>
                <button
                  onClick={() => setShowAddNote(!showAddNote)}
                  className="text-xs text-brand-purple hover:text-brand-navy font-medium transition-colors"
                >
                  + Add note
                </button>
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
              </div>
            )}
          </div>
          {!isReadOnly && showAddNote && <AddNoteForm onAdd={handleAddNote} onCancel={() => setShowAddNote(false)} />}
          {notes.length > 0 && (
            <div className="bg-white rounded-xl border border-brand-navy-30 px-4 mt-3">
              {[...notes].reverse().map(n => <NoteItem key={n.id} note={n} />)}
            </div>
          )}
        </div>

        </>}

        {/* Deal Info tab */}
        {activeTab === 'deal-info' && (
          <DealInfoTab
            opp={opp}
            oppId={oppId}
            readOnly={isReadOnly}
            onUpdate={reload}
            scrollToSection={scrollToSection}
            onScrollDone={() => setScrollToSection(null)}
            coachResult={coachResult}
          />
        )}

        </div>{/* end scrollable work area */}

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
