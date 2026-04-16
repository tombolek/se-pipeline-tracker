/**
 * Review Offline Changes (Issue #117, Phase 2C).
 *
 * Lands the user here after reconnect when the write-queue flush produced
 * conflicts. Each conflict card shows:
 *   - What you tried to do (captured at queue time)
 *   - The current server state (captured when the flush was rejected)
 *   - Who changed it while you were offline, if known
 *   - Actions: Re-apply my change (force overwrite with fresh version),
 *              Keep current, View opportunity
 *
 * Successful flushes don't normally route the user here — they just sync
 * quietly. We still include a small "Recently synced" summary at the top
 * when there are confirmed writes in the current session (ephemeral,
 * non-persistent) so the user gets a one-look confirmation that the
 * offline work made it to the server.
 *
 * Route: /review-offline-changes
 * Entry points:
 *   - Auto-redirect from reconnect banner when conflicts.length > 0
 *   - Connection indicator dropdown → "View conflicts"
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listConflicts, removeConflict, type ConflictRecord as QueueConflict } from '../offline/queue';
import api from '../api/client';

type DisplayConflict = QueueConflict;

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function kindLabel(kind: QueueConflict['kind']): string {
  switch (kind) {
    case 'note':        return 'Note';
    case 'task_create': return 'New task';
    case 'task_patch':  return 'Task edit';
    case 'reassign':    return 'Reassign SE';
  }
  return 'Change';
}

function describeUserIntent(c: DisplayConflict): React.ReactNode {
  switch (c.kind) {
    case 'reassign': {
      const newOwner = c.your_change.se_owner_id;
      if (newOwner == null) return <>Unassign SE Owner</>;
      return <>Assign SE Owner to user #{String(newOwner)}</>;
    }
    case 'task_patch': {
      const patch = (c.your_change.patch ?? {}) as Record<string, unknown>;
      const fields = Object.keys(patch);
      if (fields.length === 0) return <>Edit task</>;
      return <>Change {fields.join(', ')}</>;
    }
    case 'task_create':
      return <>Add task: <em>{String(c.your_change.title ?? '')}</em></>;
    case 'note':
      return <>Add a note</>;
  }
}

function describeServerState(c: DisplayConflict): React.ReactNode {
  const s = c.server_state;
  if (c.kind === 'reassign') {
    const owner = (s.se_owner as { name?: string } | undefined)?.name;
    return owner ? <>SE Owner is now <strong>{owner}</strong></> : <>SE is now unassigned</>;
  }
  if (c.kind === 'task_patch') {
    const current = (s.current ?? {}) as Record<string, unknown>;
    return (
      <>Current title: <em>{String(current.title ?? '—')}</em>
        {current.status ? <> · status: <strong>{String(current.status)}</strong></> : null}
      </>
    );
  }
  return <>Server state unknown</>;
}

export default function ReviewOfflineChangesPage() {
  const navigate = useNavigate();
  const [conflicts, setConflicts] = useState<DisplayConflict[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function refresh() {
    setConflicts(await listConflicts());
  }
  useEffect(() => { void refresh(); }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  async function reapply(c: DisplayConflict) {
    if (busy) return;
    setBusy(c.id);
    try {
      // Force replay WITHOUT the version guard. User has consciously chosen
      // to overwrite whatever's on the server.
      switch (c.kind) {
        case 'note':
          await api.post(`/opportunities/${c.opportunity_id}/notes`, {
            content: String(c.your_change.content ?? ''),
          });
          break;
        case 'task_create':
          await api.post(`/opportunities/${c.opportunity_id}/tasks`, c.your_change);
          break;
        case 'task_patch':
          await api.patch(`/tasks/${c.your_change.task_id}`, c.your_change.patch);
          break;
        case 'reassign':
          await api.patch(`/opportunities/${c.opportunity_id}`, {
            se_owner_id: c.your_change.se_owner_id ?? null,
          });
          break;
      }
      await removeConflict(c.id);
      await refresh();
      setToast('Your change has been re-applied.');
    } catch (e) {
      setToast(`Re-apply failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function discard(c: DisplayConflict) {
    if (busy) return;
    setBusy(c.id);
    try {
      await removeConflict(c.id);
      await refresh();
      setToast('Change discarded.');
    } finally {
      setBusy(null);
    }
  }

  async function discardAll() {
    if (!window.confirm(`Discard ${conflicts.length} unapplied change${conflicts.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    for (const c of conflicts) { await removeConflict(c.id); }
    await refresh();
    setToast('All unapplied changes discarded.');
  }

  if (conflicts.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 px-6 py-16">
        <div className="max-w-md text-center">
          <div className="w-14 h-14 rounded-2xl bg-status-success/10 border border-status-success/30 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-status-success" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
            </svg>
          </div>
          <h2 className="text-base font-semibold text-brand-navy">All offline changes are in sync</h2>
          <p className="text-sm text-brand-navy-70 mt-2 leading-relaxed">
            Nothing to review. Your queued edits applied cleanly.
          </p>
          <button
            onClick={() => navigate(-1)}
            className="mt-5 px-4 py-2 rounded-lg bg-brand-purple text-white text-xs font-medium hover:bg-brand-purple-70 transition-colors"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 px-6 py-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-lg font-semibold text-brand-navy mb-1">Review offline changes</h1>
        <p className="text-xs text-brand-navy-70 mb-6">
          Some of the edits you made while offline conflict with changes made by others. Pick what to do with each.
        </p>

        {conflicts.map(c => (
          <div key={c.id} className="bg-white rounded-xl border-2 border-status-overdue mb-3 p-4">
            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-status-overdue/20 text-status-overdue flex items-center justify-center flex-shrink-0 text-sm">⚠</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-brand-navy">
                  {kindLabel(c.kind)} on <span className="font-semibold">{c.opportunity_name}</span>
                </p>
                <p className="text-[11px] text-brand-navy-70 mt-0.5">
                  Not applied · queued {formatTimestamp(c.queued_at)}
                  {c.server_actor ? <> · conflicts with edit by <strong>{c.server_actor}</strong></> : null}
                </p>

                <div className="mt-3 p-3 rounded-lg bg-status-overdue/[0.04] border border-status-overdue/20 text-[11px] space-y-1">
                  <p><span className="text-brand-navy-70">Your change:</span> {describeUserIntent(c)}</p>
                  <p><span className="text-brand-navy-70">Current state:</span> {describeServerState(c)}</p>
                </div>

                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <button
                    onClick={() => reapply(c)}
                    disabled={busy === c.id}
                    className="px-3 py-1.5 bg-brand-purple text-white text-[11px] font-medium rounded-md hover:bg-brand-purple-70 disabled:opacity-50"
                  >
                    {busy === c.id ? 'Applying…' : 'Re-apply my change'}
                  </button>
                  <button
                    onClick={() => discard(c)}
                    disabled={busy === c.id}
                    className="px-3 py-1.5 border border-brand-navy-30 text-[11px] font-medium rounded-md hover:border-brand-purple disabled:opacity-50"
                  >
                    Keep current
                  </button>
                  <button
                    onClick={() => { navigate(`/pipeline?oppId=${c.opportunity_id}`); }}
                    className="px-3 py-1.5 text-[11px] font-medium text-brand-navy-70 rounded-md hover:text-brand-navy ml-auto"
                  >
                    View opportunity
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}

        <div className="text-right mt-4">
          <button
            onClick={discardAll}
            className="text-xs text-brand-navy-70 hover:text-status-overdue"
          >
            Discard all unapplied changes
          </button>
        </div>

        {toast && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-brand-navy text-white text-xs px-3 py-2 rounded-lg shadow-lg">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
