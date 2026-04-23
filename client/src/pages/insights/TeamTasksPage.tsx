import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/client';
import type { ApiResponse } from '../../types';
import { useTeamScope } from '../../hooks/useTeamScope';
import TeamScopeSelector from '../../components/shared/TeamScopeSelector';
import SortableHeader from '../../components/shared/SortableHeader';
import MultiSelectFilter from '../../components/shared/MultiSelectFilter';
import { sortRows, type SortDir } from '../../utils/sortRows';
import Drawer from '../../components/Drawer';
import OpportunityDetail from '../../components/OpportunityDetail';
import { useOppUrlSync } from '../../hooks/useOppUrlSync';

interface TeamTask {
  id: number;
  title: string;
  status: string;
  due_date: string | null;
  is_next_step: boolean;
  description: string | null;
  created_at: string;
  opportunity_id: number;
  opportunity_name: string;
  opportunity_stage: string;
  assigned_to_id: number | null;
  assigned_to_name: string | null;
}

type View = 'kanban' | 'list';

const STATUS_ORDER = ['open', 'in_progress', 'blocked', 'done'] as const;

const STATUS_META: Record<string, { label: string; dot: string; col: string; count_bg: string }> = {
  open:        { label: 'Open',        dot: 'bg-blue-400',          col: 'border-t-blue-400',          count_bg: 'bg-blue-50 dark:bg-status-d-info-soft text-blue-700' },
  in_progress: { label: 'In Progress', dot: 'bg-amber-400',        col: 'border-t-amber-400',        count_bg: 'bg-amber-50 dark:bg-status-d-warning-soft text-amber-700' },
  blocked:     { label: 'Blocked',     dot: 'bg-status-overdue',    col: 'border-t-status-overdue',    count_bg: 'bg-red-50 dark:bg-status-d-overdue-soft text-status-overdue dark:text-status-d-overdue' },
  done:        { label: 'Done',        dot: 'bg-status-success',    col: 'border-t-status-success',    count_bg: 'bg-emerald-50 dark:bg-status-d-success-soft text-emerald-700' },
};

const LIST_COLS = [
  { key: 'title',              label: 'Task' },
  { key: 'opportunity_name',   label: 'Opportunity' },
  { key: 'assigned_to_name',   label: 'Assignee' },
  { key: 'status',             label: 'Status' },
  { key: 'due_date',           label: 'Due Date' },
] as const;

const COL_TYPE_MAP: Record<string, 'date' | 'number' | 'string'> = {
  due_date: 'date',
};

function dueLabel(d: string | null): { text: string; cls: string } {
  if (!d) return { text: '—', cls: 'text-brand-navy-30 dark:text-fg-4' };
  const diff = Math.floor((new Date(d).getTime() - Date.now()) / 86400000);
  if (diff < 0) return { text: `${Math.abs(diff)}d overdue`, cls: 'text-status-overdue dark:text-status-d-overdue font-medium' };
  if (diff === 0) return { text: 'Today', cls: 'text-status-warning dark:text-status-d-warning font-medium' };
  if (diff <= 7) return { text: `${diff}d`, cls: 'text-brand-navy' };
  return { text: new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), cls: 'text-brand-navy-70 dark:text-fg-2' };
}

export default function TeamTasksPage() {
  const [tasks, setTasks] = useState<TeamTask[]>([]);
  const [loading, setLoading] = useState(true);
  const { seIds } = useTeamScope();
  const [searchParams, setSearchParams] = useSearchParams();

  const [view, setView] = useState<View>('kanban');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [initialAssigneeId] = useState(() => searchParams.get('assignee'));
  const [filterAssignee, setFilterAssignee] = useState<string[]>([]);
  const [filterDue, setFilterDue] = useState<string>('all'); // all | overdue | today | week
  const [sortKey, setSortKey] = useState('due_date');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selectedOppId, setSelectedOppId] = useState<number | null>(null);
  useOppUrlSync(selectedOppId, setSelectedOppId);

  useEffect(() => {
    api.get<ApiResponse<TeamTask[]>>('/insights/team-tasks')
      .then(r => {
        setTasks(r.data.data);
        // Resolve initial assignee ID from URL param to name
        if (initialAssigneeId) {
          const match = r.data.data.find(t => String(t.assigned_to_id) === initialAssigneeId);
          if (match?.assigned_to_name) setFilterAssignee([match.assigned_to_name]);
        }
      })
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear assignee query param after initial load
  useEffect(() => {
    if (searchParams.has('assignee')) {
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('assignee');
      setSearchParams(newParams, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Derived data
  const scoped = useMemo(() => {
    if (seIds.size === 0) return tasks;
    return tasks.filter(t => t.assigned_to_id && seIds.has(t.assigned_to_id));
  }, [tasks, seIds]);

  const assigneeNames = useMemo(() => {
    const s = new Set<string>();
    for (const t of scoped) {
      if (t.assigned_to_name) s.add(t.assigned_to_name);
    }
    return [...s].sort();
  }, [scoped]);

  const statusOptions = useMemo<string[]>(() =>
    STATUS_ORDER.map(s => STATUS_META[s].label),
  []);

  const overdueCount = useMemo(() =>
    scoped.filter(t => t.due_date && new Date(t.due_date) < new Date(new Date().toDateString()) && t.status !== 'done').length,
  [scoped]);

  // Map status labels back to status keys for filtering
  const statusLabelToKey = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of STATUS_ORDER) m[STATUS_META[s].label] = s;
    return m;
  }, []);

  const filtered = useMemo(() => {
    let list = scoped;
    if (filterStatus.length) {
      const keys = filterStatus.map(l => statusLabelToKey[l]).filter(Boolean);
      list = list.filter(t => keys.includes(t.status));
    }
    if (filterAssignee.length) list = list.filter(t => t.assigned_to_name && filterAssignee.includes(t.assigned_to_name));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t => t.title.toLowerCase().includes(q) || t.opportunity_name.toLowerCase().includes(q) || (t.assigned_to_name ?? '').toLowerCase().includes(q));
    }
    const today = new Date(new Date().toDateString());
    if (filterDue === 'overdue') list = list.filter(t => t.due_date && new Date(t.due_date) < today && t.status !== 'done');
    else if (filterDue === 'today') list = list.filter(t => t.due_date && new Date(t.due_date).toDateString() === today.toDateString());
    else if (filterDue === 'week') {
      const end = new Date(today); end.setDate(end.getDate() + 7);
      list = list.filter(t => t.due_date && new Date(t.due_date) >= today && new Date(t.due_date) <= end);
    }
    return list;
  }, [scoped, filterStatus, filterAssignee, search, filterDue]);

  const sorted = useMemo(() =>
    sortRows(filtered, sortKey, sortDir, (k: string) => COL_TYPE_MAP[k] ?? 'string'),
  [filtered, sortKey, sortDir]);

  const kanbanCols = useMemo(() => {
    const groups: Record<string, TeamTask[]> = { open: [], in_progress: [], blocked: [], done: [] };
    for (const t of filtered) {
      (groups[t.status] ??= []).push(t);
    }
    return groups;
  }, [filtered]);

  function handleSort(key: string) {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  if (loading) {
    return <div className="flex items-center justify-center flex-1 text-sm text-brand-navy-70 dark:text-fg-2">Loading team tasks...</div>;
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-8 pt-5 pb-4 flex-shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-brand-navy dark:text-fg-1">Team Tasks</h1>
            <p className="text-xs text-brand-navy-70 dark:text-fg-2 mt-0.5">{filtered.length} task{filtered.length !== 1 ? 's' : ''} across your team</p>
          </div>
          <div className="flex items-center gap-3">
            <TeamScopeSelector />
            {/* View toggle */}
            <div className="flex items-center gap-1 bg-brand-navy-30/20 rounded-lg p-0.5">
              <button
                onClick={() => setView('list')}
                title="List view"
                className={`p-1.5 rounded-md transition-colors ${view === 'list' ? 'bg-white dark:bg-ink-1 shadow-sm text-brand-purple' : 'text-brand-navy-70 dark:text-fg-2 hover:text-brand-navy'}`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M10 3v18M3 6a3 3 0 013-3h12a3 3 0 013 3v12a3 3 0 01-3 3H6a3 3 0 01-3-3V6z" />
                </svg>
              </button>
              <button
                onClick={() => setView('kanban')}
                title="Kanban view"
                className={`p-1.5 rounded-md transition-colors ${view === 'kanban' ? 'bg-white dark:bg-ink-1 shadow-sm text-brand-purple' : 'text-brand-navy-70 dark:text-fg-2 hover:text-brand-navy'}`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <MultiSelectFilter options={statusOptions}  selected={filterStatus}   onChange={setFilterStatus}   placeholder="All statuses" />
          <MultiSelectFilter options={assigneeNames} selected={filterAssignee} onChange={setFilterAssignee} placeholder="All assignees" />

          {/* Due date quick filters */}
          <div className="flex items-center gap-1 ml-1">
            {([
              { key: 'all', label: 'All dates', badge: undefined as number | undefined },
              { key: 'overdue', label: 'Overdue', badge: overdueCount > 0 ? overdueCount : undefined },
              { key: 'today', label: 'Due Today', badge: undefined as number | undefined },
              { key: 'week', label: 'This Week', badge: undefined as number | undefined },
            ]).map(f => (
              <button
                key={f.key}
                onClick={() => setFilterDue(f.key)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                  filterDue === f.key
                    ? 'bg-brand-purple dark:bg-accent-purple text-white'
                    : 'bg-white dark:bg-ink-1 border border-brand-navy-30/40 dark:border-ink-border-soft text-brand-navy-70 dark:text-fg-2 hover:border-brand-navy-30'
                }`}
              >
                {f.label}
                {f.badge !== undefined && (
                  <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                    filterDue === f.key ? 'bg-white/20 text-white' : 'bg-status-overdue/10 dark:bg-status-d-overdue-soft text-status-overdue dark:text-status-d-overdue'
                  }`}>{f.badge}</span>
                )}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative ml-auto">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-brand-navy-30 dark:text-fg-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search tasks..."
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-brand-navy-30/40 dark:border-ink-border-soft bg-white dark:bg-ink-1 focus:outline-none focus:border-brand-purple w-48"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <div className="flex items-center justify-center flex-1 text-sm text-brand-navy-70 dark:text-fg-2">No tasks match the current filters.</div>
      ) : view === 'kanban' ? (
        /* ── Kanban ── */
        <div className="flex-1 overflow-x-auto overflow-y-hidden px-8 pb-6">
          <div className="flex gap-4 h-full min-w-max">
            {STATUS_ORDER.map(status => {
              const meta = STATUS_META[status];
              const col = kanbanCols[status] ?? [];
              return (
                <div key={status} className={`w-[280px] flex flex-col bg-white/60 rounded-2xl border border-brand-navy-30/30 dark:border-ink-border-soft border-t-[3px] ${meta.col}`}>
                  <div className="px-4 py-3 flex items-center gap-2 flex-shrink-0">
                    <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
                    <span className="text-xs font-semibold text-brand-navy dark:text-fg-1">{meta.label}</span>
                    <span className={`ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${meta.count_bg}`}>{col.length}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2 scrollbar-thin">
                    {col.map(t => {
                      const due = dueLabel(t.due_date);
                      return (
                        <div
                          key={t.id}
                          onClick={() => setSelectedOppId(t.opportunity_id)}
                          className="bg-white dark:bg-ink-1 rounded-xl border border-brand-navy-30/30 dark:border-ink-border-soft p-3 cursor-pointer hover:border-brand-purple/40 dark:hover:border-accent-purple/40 hover:shadow-sm transition-all"
                        >
                          <p className="text-xs font-medium text-brand-navy dark:text-fg-1 leading-snug">{t.title}</p>
                          <p className="text-[11px] text-brand-navy-70 dark:text-fg-2 mt-1 truncate">{t.opportunity_name}</p>
                          <div className="flex items-center justify-between mt-2">
                            <div className="flex items-center gap-1.5">
                              {t.assigned_to_name && (
                                <div className="w-5 h-5 rounded-full bg-brand-purple-30 flex items-center justify-center text-[9px] font-semibold text-brand-purple dark:text-accent-purple flex-shrink-0">
                                  {t.assigned_to_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                </div>
                              )}
                              <span className="text-[10px] text-brand-navy-70 dark:text-fg-2">{t.assigned_to_name ?? 'Unassigned'}</span>
                            </div>
                            <span className={`text-[10px] ${due.cls}`}>{due.text}</span>
                          </div>
                          {t.is_next_step && (
                            <span className="inline-block mt-1.5 text-[9px] font-semibold uppercase tracking-wide text-brand-purple dark:text-accent-purple bg-brand-purple-30/50 dark:bg-accent-purple-soft px-1.5 py-0.5 rounded">Next Step</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* ── List ── */
        <div className="flex-1 overflow-y-auto overflow-x-auto px-8 pb-6">
          <div className="bg-white dark:bg-ink-1 rounded-2xl border border-brand-navy-30/40 dark:border-ink-border-soft overflow-hidden">
            <table className="w-full">
              <thead className="border-b border-brand-navy-30/40 dark:border-ink-border-soft">
                <tr>
                  {LIST_COLS.map(c => (
                    <SortableHeader
                      key={c.key}
                      colKey={c.key}
                      label={c.label}
                      currentKey={sortKey}
                      currentDir={sortDir}
                      onSort={handleSort}
                      className="px-4 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 dark:text-fg-2 uppercase tracking-wide whitespace-nowrap"
                    />
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-navy-30/20">
                {sorted.map(t => {
                  const due = dueLabel(t.due_date);
                  const meta = STATUS_META[t.status] ?? STATUS_META.open;
                  const isOverdue = t.due_date && new Date(t.due_date) < new Date(new Date().toDateString()) && t.status !== 'done';
                  return (
                    <tr
                      key={t.id}
                      onClick={() => setSelectedOppId(t.opportunity_id)}
                      className={`cursor-pointer hover:bg-brand-purple-30/20 dark:hover:bg-accent-purple-soft transition-colors ${isOverdue ? 'bg-red-50 dark:bg-status-d-overdue-soft/30' : ''}`}
                    >
                      <td className="px-4 py-2.5 text-xs text-brand-navy dark:text-fg-1 max-w-[260px]">
                        <span className="line-clamp-1">{t.title}</span>
                        {t.is_next_step && (
                          <span className="ml-1.5 text-[9px] font-semibold uppercase tracking-wide text-brand-purple dark:text-accent-purple bg-brand-purple-30/50 dark:bg-accent-purple-soft px-1 py-0.5 rounded">Next Step</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-brand-navy-70 dark:text-fg-2 max-w-[200px] truncate">{t.opportunity_name}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {t.assigned_to_name && (
                            <div className="w-5 h-5 rounded-full bg-brand-purple-30 flex items-center justify-center text-[9px] font-semibold text-brand-purple dark:text-accent-purple flex-shrink-0">
                              {t.assigned_to_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                            </div>
                          )}
                          <span className="text-xs text-brand-navy-70 dark:text-fg-2">{t.assigned_to_name ?? 'Unassigned'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-brand-navy-70 dark:text-fg-2">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${meta.dot}`} />
                          {meta.label}
                        </span>
                      </td>
                      <td className={`px-4 py-2.5 text-xs ${due.cls}`}>{due.text}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Opportunity Drawer */}
      <Drawer open={selectedOppId !== null} onClose={() => setSelectedOppId(null)}>
        {selectedOppId && <OpportunityDetail oppId={selectedOppId} />}
      </Drawer>
    </div>
  );
}
