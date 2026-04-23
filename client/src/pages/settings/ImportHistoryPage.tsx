import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import type { ApiResponse } from '../../types';

interface ImportRow {
  id: number;
  imported_at: string;
  filename: string | null;
  row_count: number | null;
  opportunities_added: number;
  opportunities_updated: number;
  opportunities_closed_lost: number;
  status: 'success' | 'partial' | 'failed';
  error_log: string | null;
  has_rollback: boolean;
}

function StatusBadge({ status }: { status: ImportRow['status'] }) {
  const styles = {
    success: 'bg-status-success/10 dark:bg-status-d-success-soft text-status-success dark:text-status-d-success',
    partial: 'bg-status-warning/10 dark:bg-status-d-warning-soft text-status-warning dark:text-status-d-warning',
    failed:  'bg-status-overdue/10 dark:bg-status-d-overdue-soft text-status-overdue dark:text-status-d-overdue',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${styles[status]}`}>
      {status}
    </span>
  );
}

export default function ImportHistoryPage() {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rollingBack, setRollingBack] = useState(false);

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

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-brand-navy dark:text-fg-1">Import History</h1>
        <p className="text-sm text-brand-navy-70 dark:text-fg-2 mt-0.5">Salesforce data import log — last 50 imports. The most recent import can be undone.</p>
      </div>

      {loading && <div className="text-sm text-brand-navy-70 dark:text-fg-2 py-10 text-center">Loading…</div>}
      {error && <div className="text-sm text-status-overdue dark:text-status-d-overdue py-4">{error}</div>}
      {!loading && !error && rows.length === 0 && (
        <div className="text-sm text-brand-navy-70 dark:text-fg-2 py-10 text-center">No imports yet.</div>
      )}
      {!loading && !error && rows.length > 0 && (
        <div className="bg-white dark:bg-ink-1 rounded-2xl border border-brand-navy-30/40 dark:border-ink-border-soft overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-brand-navy-30/40 dark:border-ink-border-soft">
              <tr>
                {['Date', 'File', 'Rows', 'Added', 'Updated', 'Removed', 'Status', ''].map((h, i) => (
                  <th key={i} className="px-4 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 dark:text-fg-2 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={r.id} className="border-b border-brand-navy-30/20 dark:border-ink-border-soft last:border-0 hover:bg-gray-50 dark:hover:bg-ink-2">
                  <td className="px-4 py-3 text-xs text-brand-navy dark:text-fg-1 whitespace-nowrap">
                    {new Date(r.imported_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-xs text-brand-navy-70 dark:text-fg-2 max-w-[200px] truncate" title={r.filename ?? ''}>
                    {r.filename ?? <span className="text-brand-navy-30 dark:text-fg-4">—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-brand-navy dark:text-fg-1">{r.row_count ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-status-success dark:text-status-d-success font-medium">+{r.opportunities_added}</td>
                  <td className="px-4 py-3 text-sm text-brand-navy-70 dark:text-fg-2">{r.opportunities_updated}</td>
                  <td className="px-4 py-3 text-sm text-status-overdue dark:text-status-d-overdue font-medium">{r.opportunities_closed_lost}</td>
                  <td className="px-4 py-3">
                    <div>
                      <StatusBadge status={r.status} />
                      {r.error_log && (
                        <p className="text-[10px] text-status-overdue dark:text-status-d-overdue mt-1 max-w-[180px] truncate" title={r.error_log}>
                          {r.error_log}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {idx === 0 && r.has_rollback && (
                      <button
                        onClick={() => handleRollback(r.id, r.filename)}
                        disabled={rollingBack}
                        className="text-xs px-2.5 py-1 rounded-lg border border-status-warning text-status-warning dark:text-status-d-warning hover:bg-status-warning/10 dark:bg-status-d-warning-soft transition-colors disabled:opacity-40 whitespace-nowrap"
                      >
                        {rollingBack ? 'Undoing…' : 'Undo'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
