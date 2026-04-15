import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { listRecentActions, undoRecentAction, type RecentAction } from '../api/recentActions';

interface Props {
  open: boolean;
  onClose: () => void;
  onUndid?: () => void;
}

function KindBadge({ kind }: { kind: RecentAction['kind'] }) {
  const styles: Record<RecentAction['kind'], string> = {
    task:       'bg-brand-purple-30 text-brand-navy',
    inbox:      'bg-amber-50 text-status-warning',
    assignment: 'bg-sky-50 text-status-info',
  };
  const labels: Record<RecentAction['kind'], string> = {
    task: 'Task', inbox: 'Inbox', assignment: 'SE Assignment',
  };
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${styles[kind]}`}>
      {labels[kind]}
    </span>
  );
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.round(ms / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function RecentActionsModal({ open, onClose, onUndid }: Props) {
  const [items, setItems] = useState<RecentAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [undoing, setUndoing] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const rows = await listRecentActions();
      setItems(rows);
    } catch {
      setErrorMsg('Failed to load recent actions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (open) reload(); }, [open, reload]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  async function handleUndo(a: RecentAction) {
    const key = `${a.kind}:${a.id}`;
    setUndoing(key);
    setErrorMsg(null);
    try {
      await undoRecentAction(a.kind, a.id);
      await reload();
      onUndid?.();
    } catch (e) {
      setErrorMsg((e as Error).message || 'Undo failed');
    } finally {
      setUndoing(null);
    }
  }

  if (!open) return null;

  return createPortal(
    <>
      <div onClick={onClose} className="fixed inset-0 bg-brand-navy/30 backdrop-blur-[2px] z-40" />
      <div className="fixed top-0 right-0 h-full w-[520px] max-w-[95vw] bg-gray-50 shadow-2xl z-50 flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 bg-white border-b border-brand-navy-30/40 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-brand-navy">Recent actions</h2>
            <p className="text-[11px] text-brand-navy-70 mt-0.5">Undo deletes and SE reassignments within 30 days</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-brand-navy-30/50 hover:bg-brand-navy-30 flex items-center justify-center text-brand-navy-70 hover:text-brand-navy transition-colors"
            aria-label="Close"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {errorMsg && <p className="mx-5 mt-3 text-xs text-status-overdue bg-red-50 rounded px-2 py-1.5">{errorMsg}</p>}
          {loading ? (
            <p className="text-xs text-brand-navy-70 text-center py-8">Loading…</p>
          ) : items.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-brand-navy-70">No recent actions to undo.</p>
              <p className="text-xs text-brand-navy-30 mt-1">Deleted tasks/inbox items and SE reassignments from the last 30 days will appear here.</p>
            </div>
          ) : (
            <ul className="divide-y divide-brand-navy-30/20 bg-white border border-brand-navy-30/40 rounded-2xl mx-5 my-4 overflow-hidden">
              {items.map(a => {
                const key = `${a.kind}:${a.id}`;
                return (
                  <li key={key} className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <KindBadge kind={a.kind} />
                          <span className="text-[11px] text-brand-navy-70">{relativeTime(a.at)}</span>
                        </div>
                        <p className="text-sm text-brand-navy mt-1 truncate">{a.title}</p>
                        {a.opportunity_name && (
                          <p className="text-[11px] text-brand-navy-70 mt-0.5 truncate">
                            on <span className="font-medium">{a.opportunity_name}</span>
                          </p>
                        )}
                      </div>
                      {a.undoable ? (
                        <button
                          onClick={() => handleUndo(a)}
                          disabled={undoing === key}
                          className="text-xs text-brand-purple hover:text-brand-navy font-medium disabled:opacity-50 flex-shrink-0 mt-0.5"
                        >
                          {undoing === key ? 'Undoing…' : 'Undo'}
                        </button>
                      ) : (
                        <span className="text-[11px] text-brand-navy-30 flex-shrink-0 mt-0.5" title={a.reason_if_not_undoable ?? ''}>
                          Not undoable
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
