import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/client';
import type { ApiResponse } from '../../types';

// ── Types (mirror server shape from /opportunities/import/history) ────────

type StageName = 'parse' | 'validate' | 'reconcile' | 'enrich' | 'finalize';
type StageStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';
type ImportStatus = 'in_progress' | 'success' | 'partial' | 'failed';

interface StageLogEntry {
  status: StageStatus;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  counts?: Record<string, unknown>;
  error?: string;
}

type StageLog = Partial<Record<StageName, StageLogEntry>>;

interface ImportRow {
  id: number;
  imported_at: string;
  filename: string | null;
  row_count: number | null;
  opportunities_added: number;
  opportunities_updated: number;
  opportunities_closed_lost: number;
  opportunities_closed_won: number;
  opportunities_stale: number;
  status: ImportStatus;
  error_log: string | null;
  started_at: string | null;
  finished_at: string | null;
  stage_log: StageLog | null;
  has_rollback: boolean;
}

const STAGE_ORDER: { key: StageName; label: string }[] = [
  { key: 'parse',     label: 'Parse' },
  { key: 'validate',  label: 'Validate' },
  { key: 'reconcile', label: 'Reconcile' },
  { key: 'enrich',    label: 'Enrich' },
  { key: 'finalize',  label: 'Finalize' },
];

// ── Helpers ───────────────────────────────────────────────────────────────

function formatDuration(ms: number | undefined | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

function totalDurationMs(row: ImportRow): number | null {
  if (!row.started_at) return null;
  const end = row.finished_at ?? new Date().toISOString();
  return new Date(end).getTime() - new Date(row.started_at).getTime();
}

function getCount(entry: StageLogEntry | undefined, key: string): number | string | undefined {
  if (!entry?.counts) return undefined;
  const v = entry.counts[key];
  if (typeof v === 'number' || typeof v === 'string') return v;
  return undefined;
}

// ── Status + stage visual atoms ───────────────────────────────────────────

function ImportStatusBadge({ status }: { status: ImportStatus }) {
  const styles: Record<ImportStatus, string> = {
    in_progress: 'bg-status-warning/10 dark:bg-status-d-warning-soft text-status-warning dark:text-status-d-warning',
    success:     'bg-status-success/10 dark:bg-status-d-success-soft text-status-success dark:text-status-d-success',
    partial:     'bg-status-warning/10 dark:bg-status-d-warning-soft text-status-warning dark:text-status-d-warning',
    failed:      'bg-status-overdue/10 dark:bg-status-d-overdue-soft text-status-overdue dark:text-status-d-overdue',
  };
  const label = status === 'in_progress' ? 'Running' : status;
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${styles[status]}`}>
      {label}
    </span>
  );
}

function StageDot({ status }: { status: StageStatus }) {
  const common = 'w-10 h-10 rounded-full border-2 flex items-center justify-center font-bold text-sm';
  if (status === 'success') {
    return <div className={`${common} bg-status-success/15 dark:bg-status-d-success-soft border-status-success dark:border-status-d-success text-status-success dark:text-status-d-success`}>✓</div>;
  }
  if (status === 'failed') {
    return <div className={`${common} bg-status-overdue/15 dark:bg-status-d-overdue-soft border-status-overdue dark:border-status-d-overdue text-status-overdue dark:text-status-d-overdue`}>✗</div>;
  }
  if (status === 'running') {
    return (
      <div className={`${common} bg-status-warning/15 dark:bg-status-d-warning-soft border-status-warning dark:border-status-d-warning text-status-warning dark:text-status-d-warning animate-pulse`}>
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      </div>
    );
  }
  // pending or skipped
  return <div className={`${common} bg-gray-100 dark:bg-ink-2 border-brand-navy-30/50 dark:border-ink-border-soft text-brand-navy-30 dark:text-fg-4`}>○</div>;
}

function StageConnector({ status }: { status: StageStatus }) {
  const colorMap: Record<StageStatus, string> = {
    success:  'text-status-success dark:text-status-d-success',
    failed:   'text-status-overdue dark:text-status-d-overdue',
    running:  'text-status-warning dark:text-status-d-warning',
    pending:  'text-brand-navy-30/60 dark:text-ink-border-soft',
    skipped:  'text-brand-navy-30/60 dark:text-ink-border-soft',
  };
  return (
    <div
      className={`h-0.5 flex-1 mt-5 ${colorMap[status]}`}
      style={{
        background: 'linear-gradient(90deg, currentColor 50%, transparent 50%)',
        backgroundSize: '8px 2px',
      }}
    />
  );
}

// ── Stage counts summary (per-stage inline text) ──────────────────────────

function StageCaption({ stage, entry }: { stage: StageName; entry: StageLogEntry | undefined }) {
  if (!entry || entry.status === 'pending') {
    return <div className="text-[11px] text-brand-navy-30 dark:text-fg-4 mt-0.5 text-center">pending</div>;
  }
  if (entry.status === 'skipped') {
    return <div className="text-[11px] text-brand-navy-30 dark:text-fg-4 mt-0.5 text-center">skipped</div>;
  }
  if (entry.status === 'running') {
    return <div className="text-[11px] text-status-warning dark:text-status-d-warning mt-0.5 text-center">running…</div>;
  }
  if (entry.status === 'failed') {
    return <div className="text-[11px] text-status-overdue dark:text-status-d-overdue mt-0.5 text-center max-w-[140px] truncate" title={entry.error ?? ''}>{entry.error ?? 'failed'}</div>;
  }

  // success: surface the most useful count(s) for this stage
  let line: string | null = null;
  switch (stage) {
    case 'parse':     line = `${getCount(entry, 'rows') ?? 0} rows`; break;
    case 'validate':  line = `${getCount(entry, 'mapped') ?? 0} mapped`; break;
    case 'reconcile': {
      const a = getCount(entry, 'added') ?? 0;
      const u = getCount(entry, 'updated') ?? 0;
      const s = getCount(entry, 'stale') ?? 0;
      line = `+${a} · ~${u} · ⌀${s}`;
      break;
    }
    case 'enrich': {
      const n = getCount(entry, 'notesCreated') ?? 0;
      const h = getCount(entry, 'historyEntries') ?? 0;
      line = `${n} notes · ${h} history`;
      break;
    }
    case 'finalize':  line = 'cache cleared'; break;
  }
  return (
    <>
      <div className="text-[11px] text-brand-navy-70 dark:text-fg-2 mt-0.5 text-center">{line}</div>
      <div className="text-[10px] text-brand-navy-30 dark:text-fg-4 mt-0.5">{formatDuration(entry.durationMs)}</div>
    </>
  );
}

// ── Pipeline diagram for one import ───────────────────────────────────────

function PipelineDiagram({ stageLog }: { stageLog: StageLog }) {
  return (
    <div className="flex items-start gap-0 mt-2">
      {STAGE_ORDER.map((s, i) => {
        const entry = stageLog[s.key];
        const status = entry?.status ?? 'pending';
        const next = STAGE_ORDER[i + 1];
        return (
          <div key={s.key} className="contents">
            <div className="flex flex-col items-center flex-1 min-w-0">
              <StageDot status={status} />
              <div className="mt-2 text-xs font-semibold text-brand-navy dark:text-fg-1">{s.label}</div>
              <StageCaption stage={s.key} entry={entry} />
            </div>
            {next && <StageConnector status={status} />}
          </div>
        );
      })}
    </div>
  );
}

// ── Expanded detail panel (counts + errors + rollback) ────────────────────

function ImportDetails({ row, isLatestRollback, onRollback, rollingBack }: {
  row: ImportRow;
  isLatestRollback: boolean;
  onRollback: (id: number, filename: string | null) => void;
  rollingBack: boolean;
}) {
  const rowErrors = useMemo(
    () => (row.error_log ?? '').split('\n').map(s => s.trim()).filter(Boolean),
    [row.error_log]
  );
  const enrichEntry = row.stage_log?.enrich;

  return (
    <div className="px-6 pb-6 pt-2 bg-gray-50/50 dark:bg-ink-0/50">
      {row.stage_log && <PipelineDiagram stageLog={row.stage_log} />}

      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div className="bg-white dark:bg-ink-1 rounded-lg border border-brand-navy-30/40 dark:border-ink-border-soft p-3">
          <div className="text-brand-navy-70 dark:text-fg-2 font-semibold uppercase tracking-wide text-[10px] mb-1">Reconcile breakdown</div>
          <div className="flex justify-between text-brand-navy dark:text-fg-1"><span>New opportunities</span><span className="font-medium text-status-success dark:text-status-d-success">+{row.opportunities_added}</span></div>
          <div className="flex justify-between text-brand-navy dark:text-fg-1"><span>Field updates</span><span className="font-medium">{row.opportunities_updated}</span></div>
          <div className="flex justify-between text-brand-navy dark:text-fg-1"><span>Marked stale</span><span className="font-medium text-status-warning dark:text-status-d-warning">{row.opportunities_stale}</span></div>
          <div className="flex justify-between text-brand-navy dark:text-fg-1"><span>Newly Closed Won</span><span className="font-medium text-status-success dark:text-status-d-success">{row.opportunities_closed_won}</span></div>
          <div className="flex justify-between text-brand-navy dark:text-fg-1"><span>Newly Closed Lost</span><span className="font-medium text-status-overdue dark:text-status-d-overdue">{row.opportunities_closed_lost}</span></div>
        </div>

        <div className="bg-white dark:bg-ink-1 rounded-lg border border-brand-navy-30/40 dark:border-ink-border-soft p-3">
          <div className="text-brand-navy-70 dark:text-fg-2 font-semibold uppercase tracking-wide text-[10px] mb-1">Auto-generated</div>
          <div className="flex justify-between text-brand-navy dark:text-fg-1"><span>Notes from SE comments</span><span className="font-medium">{String(getCount(enrichEntry, 'notesCreated') ?? '—')}</span></div>
          <div className="flex justify-between text-brand-navy dark:text-fg-1"><span>Product-tagging tasks</span><span className="font-medium">{String(getCount(enrichEntry, 'autoTasksCreated') ?? '—')}</span></div>
          <div className="flex justify-between text-brand-navy dark:text-fg-1"><span>Field history entries</span><span className="font-medium">{String(getCount(enrichEntry, 'historyEntries') ?? '—')}</span></div>
          <div className="flex justify-between text-brand-navy dark:text-fg-1"><span>Products derived</span><span className="font-medium">{String(getCount(enrichEntry, 'productsDerived') ?? '—')}</span></div>
        </div>

        <div className="bg-white dark:bg-ink-1 rounded-lg border border-brand-navy-30/40 dark:border-ink-border-soft p-3">
          <div className="text-brand-navy-70 dark:text-fg-2 font-semibold uppercase tracking-wide text-[10px] mb-1">Timing</div>
          <div className="flex justify-between text-brand-navy dark:text-fg-1"><span>Started</span><span className="font-medium">{row.started_at ? new Date(row.started_at).toLocaleTimeString() : '—'}</span></div>
          <div className="flex justify-between text-brand-navy dark:text-fg-1"><span>Finished</span><span className="font-medium">{row.finished_at ? new Date(row.finished_at).toLocaleTimeString() : (row.status === 'in_progress' ? 'running…' : '—')}</span></div>
          <div className="flex justify-between text-brand-navy dark:text-fg-1"><span>Total duration</span><span className="font-medium">{formatDuration(totalDurationMs(row))}</span></div>
          {isLatestRollback && (
            <div className="mt-3">
              <button
                onClick={() => onRollback(row.id, row.filename)}
                disabled={rollingBack}
                className="w-full text-xs px-2.5 py-1 rounded-lg border border-status-warning text-status-warning dark:text-status-d-warning hover:bg-status-warning/10 dark:hover:bg-status-d-warning-soft transition-colors disabled:opacity-40"
              >
                {rollingBack ? 'Undoing…' : 'Undo this import'}
              </button>
            </div>
          )}
        </div>
      </div>

      {rowErrors.length > 0 && (
        <div className="mt-4 bg-white dark:bg-ink-1 rounded-lg border border-status-warning/40 dark:border-status-d-warning/40 p-3 text-xs">
          <div className="text-status-warning dark:text-status-d-warning font-semibold uppercase tracking-wide text-[10px] mb-2">
            {rowErrors.length} row{rowErrors.length > 1 ? 's' : ''} skipped — validation errors
          </div>
          <ul className="space-y-1 font-mono text-[11px] text-brand-navy dark:text-fg-1 max-h-48 overflow-y-auto">
            {rowErrors.map((e, i) => (
              <li key={i}><span className="text-status-overdue dark:text-status-d-overdue mr-1">✗</span>{e}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── One row in the list ───────────────────────────────────────────────────

function ImportRowView({ row, expanded, onToggle, isLatestRollback, onRollback, rollingBack }: {
  row: ImportRow;
  expanded: boolean;
  onToggle: () => void;
  isLatestRollback: boolean;
  onRollback: (id: number, filename: string | null) => void;
  rollingBack: boolean;
}) {
  const headlineCounts = (() => {
    if (row.status === 'in_progress') return 'running…';
    if (row.status === 'failed' && row.row_count == null) return 'file rejected';
    const parts: string[] = [];
    if (row.opportunities_added)      parts.push(`+${row.opportunities_added} added`);
    if (row.opportunities_updated)    parts.push(`${row.opportunities_updated} updated`);
    if (row.opportunities_stale)      parts.push(`${row.opportunities_stale} stale`);
    return parts.length ? parts.join(' · ') : '—';
  })();

  const totalMs = totalDurationMs(row);

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full text-left hover:bg-gray-50 dark:hover:bg-ink-2 transition-colors"
      >
        <div className="flex items-center gap-4 px-5 py-3">
          <span className={`text-brand-navy-70 dark:text-fg-2 text-xs transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
          <div className="flex-1 grid grid-cols-[1.5fr_1fr_2fr_0.6fr_0.8fr] gap-4 items-center min-w-0">
            <div className="min-w-0">
              <div className="text-sm font-medium text-brand-navy dark:text-fg-1">{new Date(row.imported_at).toLocaleString()}</div>
              <div className="text-xs text-brand-navy-70 dark:text-fg-2 truncate" title={row.filename ?? ''}>{row.filename ?? '—'}</div>
            </div>
            <div className="text-sm text-brand-navy dark:text-fg-1">
              {row.row_count != null ? <><span className="font-semibold">{row.row_count}</span> <span className="text-brand-navy-70 dark:text-fg-2">rows</span></> : <span className="text-brand-navy-70 dark:text-fg-2">—</span>}
            </div>
            <div className="text-sm text-brand-navy-70 dark:text-fg-2 truncate">{headlineCounts}</div>
            <div className="text-xs text-brand-navy-70 dark:text-fg-2">{formatDuration(totalMs)}</div>
            <div className="justify-self-end"><ImportStatusBadge status={row.status} /></div>
          </div>
        </div>
      </button>
      {expanded && (
        <ImportDetails
          row={row}
          isLatestRollback={isLatestRollback}
          onRollback={onRollback}
          rollingBack={rollingBack}
        />
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function ImportHistoryPage() {
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');

  const [rows, setRows] = useState<ImportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rollingBack, setRollingBack] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  // One-shot flag: after the first fetch, auto-expand the highlighted row
  // (or the most recent one if no highlight).
  const initialExpandDoneRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get<ApiResponse<ImportRow[]>>('/opportunities/import/history');
      setRows(r.data.data);
      setError(null);
    } catch {
      setError('Failed to load import history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-expand the row of interest on first successful load.
  useEffect(() => {
    if (initialExpandDoneRef.current) return;
    if (rows.length === 0) return;
    const target = highlightId
      ? rows.find(r => String(r.id) === highlightId)
      : rows[0];
    if (target) {
      setExpandedIds(prev => new Set(prev).add(target.id));
    }
    initialExpandDoneRef.current = true;
  }, [rows, highlightId]);

  // Poll every 5s while any import is in_progress.
  const hasInProgress = rows.some(r => r.status === 'in_progress');
  useEffect(() => {
    if (!hasInProgress) return;
    const h = setInterval(() => { load(); }, 5000);
    return () => clearInterval(h);
  }, [hasInProgress, load]);

  function toggle(id: number) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleRollback(id: number, filename: string | null) {
    if (!window.confirm(`Roll back import "${filename ?? 'unknown'}"?\n\nAll opportunity changes from this import will be undone.`)) return;
    setRollingBack(true);
    try {
      await api.delete(`/opportunities/import/${id}`);
      await load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      window.alert(msg ?? 'Rollback failed.');
    } finally {
      setRollingBack(false);
    }
  }

  // The most recent import is the only one eligible for rollback, and only
  // when it's not still running.
  const rollbackEligibleId = rows.length > 0 && rows[0].has_rollback && rows[0].status !== 'in_progress'
    ? rows[0].id
    : null;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-brand-navy dark:text-fg-1">Import History</h1>
        <p className="text-sm text-brand-navy-70 dark:text-fg-2 mt-0.5">
          Salesforce data import log — last 50 imports. Click any row to inspect the 5-stage pipeline and see where an import succeeded or failed.
          {hasInProgress && <span className="ml-2 text-status-warning dark:text-status-d-warning">· auto-refreshing every 5s while an import is running</span>}
        </p>
      </div>

      {loading && <div className="text-sm text-brand-navy-70 dark:text-fg-2 py-10 text-center">Loading…</div>}
      {error && <div className="text-sm text-status-overdue dark:text-status-d-overdue py-4">{error}</div>}
      {!loading && !error && rows.length === 0 && (
        <div className="text-sm text-brand-navy-70 dark:text-fg-2 py-10 text-center">No imports yet.</div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="bg-white dark:bg-ink-1 rounded-2xl border border-brand-navy-30/40 dark:border-ink-border-soft overflow-hidden">
          {/* header */}
          <div className="px-5 py-2.5 border-b border-brand-navy-30/40 dark:border-ink-border-soft bg-gray-50/40 dark:bg-ink-2/40">
            <div className="flex items-center gap-4">
              <span className="w-3" />
              <div className="flex-1 grid grid-cols-[1.5fr_1fr_2fr_0.6fr_0.8fr] gap-4 text-[11px] font-semibold text-brand-navy-70 dark:text-fg-2 uppercase tracking-wide">
                <div>When / File</div>
                <div>Rows</div>
                <div>Changes</div>
                <div>Duration</div>
                <div className="justify-self-end">Status</div>
              </div>
            </div>
          </div>
          <div className="divide-y divide-brand-navy-30/20 dark:divide-ink-border-soft/50">
            {rows.map(row => (
              <ImportRowView
                key={row.id}
                row={row}
                expanded={expandedIds.has(row.id)}
                onToggle={() => toggle(row.id)}
                isLatestRollback={rollbackEligibleId === row.id}
                onRollback={handleRollback}
                rollingBack={rollingBack}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
