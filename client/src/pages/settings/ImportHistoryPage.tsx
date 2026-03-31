import { useState, useEffect } from 'react';
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
}

function StatusBadge({ status }: { status: ImportRow['status'] }) {
  const styles = {
    success: 'bg-status-success/10 text-status-success',
    partial: 'bg-status-warning/10 text-status-warning',
    failed:  'bg-status-overdue/10 text-status-overdue',
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

  useEffect(() => {
    api.get<ApiResponse<ImportRow[]>>('/opportunities/import/history')
      .then(r => setRows(r.data.data))
      .catch(() => setError('Failed to load import history.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-brand-navy">Import History</h1>
        <p className="text-sm text-brand-navy-70 mt-0.5">Salesforce data import log — last 50 imports</p>
      </div>

      {loading && <div className="text-sm text-brand-navy-70 py-10 text-center">Loading…</div>}
      {error && <div className="text-sm text-status-overdue py-4">{error}</div>}
      {!loading && !error && rows.length === 0 && (
        <div className="text-sm text-brand-navy-70 py-10 text-center">No imports yet.</div>
      )}
      {!loading && !error && rows.length > 0 && (
        <div className="bg-white rounded-2xl border border-brand-navy-30/40 overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-brand-navy-30/40">
              <tr>
                {['Date', 'File', 'Rows', 'Added', 'Updated', 'Closed Lost', 'Status'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b border-brand-navy-30/20 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs text-brand-navy whitespace-nowrap">
                    {new Date(r.imported_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-xs text-brand-navy-70 max-w-[200px] truncate" title={r.filename ?? ''}>
                    {r.filename ?? <span className="text-brand-navy-30">—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-brand-navy">{r.row_count ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-status-success font-medium">+{r.opportunities_added}</td>
                  <td className="px-4 py-3 text-sm text-brand-navy-70">{r.opportunities_updated}</td>
                  <td className="px-4 py-3 text-sm text-status-overdue font-medium">{r.opportunities_closed_lost}</td>
                  <td className="px-4 py-3">
                    <div>
                      <StatusBadge status={r.status} />
                      {r.error_log && (
                        <p className="text-[10px] text-status-overdue mt-1 max-w-[200px] truncate" title={r.error_log}>
                          {r.error_log}
                        </p>
                      )}
                    </div>
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
