import { useState, useRef, useEffect, useCallback } from 'react';
import api from '../../api/client';
import type { ApiResponse } from '../../types';

interface ImportStats {
  rowCount: number;
  added: number;
  updated: number;
  closedLost: number;
  errors: string[];
}

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

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [lastResult, setLastResult] = useState<{ stats: ImportStats; filename: string } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const [rows, setRows] = useState<ImportRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [rollingBack, setRollingBack] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadHistory = useCallback(async () => {
    try {
      const r = await api.get<ApiResponse<ImportRow[]>>('/opportunities/import/history');
      setRows(r.data.data);
      setHistoryError(null);
    } catch {
      setHistoryError('Failed to load import history.');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  function onFileSelect(f: File) {
    setFile(f);
    setLastResult(null);
    setImportError(null);
  }

  async function handleImport() {
    if (!file) return;
    setImporting(true);
    setImportError(null);
    setLastResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await api.post<ApiResponse<ImportStats>>('/opportunities/import', form);
      setLastResult({ stats: r.data.data, filename: file.name });
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadHistory();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setImportError(msg ?? 'Import failed. Check that the file is a valid Salesforce export.');
    } finally {
      setImporting(false);
    }
  }

  async function handleRollback(id: number) {
    if (!window.confirm('Roll back this import? All opportunity changes from this import will be undone.')) return;
    setRollingBack(true);
    try {
      await api.delete(`/opportunities/import/${id}`);
      setLastResult(null);
      await loadHistory();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      window.alert(msg ?? 'Rollback failed.');
    } finally {
      setRollingBack(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-brand-navy">Import</h1>
        <p className="text-sm text-brand-navy-70 mt-0.5">Upload a Salesforce export file to sync opportunities</p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files[0];
          if (f) onFileSelect(f);
        }}
        onClick={() => !file && fileInputRef.current?.click()}
        className={`mb-4 rounded-2xl border-2 border-dashed transition-colors p-8 ${
          dragging
            ? 'border-brand-purple bg-brand-purple/5'
            : file
            ? 'border-brand-navy-30/40 bg-white cursor-default'
            : 'border-brand-navy-30/40 bg-white hover:border-brand-purple/50 cursor-pointer'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xls,.xlsx,.html,.htm"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onFileSelect(f); }}
        />

        {!file ? (
          <div className="text-center">
            <div className="w-10 h-10 rounded-xl bg-brand-purple/10 flex items-center justify-center mx-auto mb-3">
              <svg className="w-5 h-5 text-brand-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </div>
            <p className="text-sm font-medium text-brand-navy">Drop your Salesforce export here</p>
            <p className="text-xs text-brand-navy-70 mt-1">
              or <span className="text-brand-purple underline">browse files</span> — .xls format from Salesforce report export
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-brand-purple/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-brand-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-brand-navy truncate">{file.name}</p>
              <p className="text-xs text-brand-navy-70">{(file.size / 1024).toFixed(0)} KB</p>
            </div>
            <button
              onClick={e => {
                e.stopPropagation();
                setFile(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              className="text-brand-navy-70 hover:text-brand-navy p-1 rounded transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Import button + inline error */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={handleImport}
          disabled={!file || importing}
          className="px-5 py-2 bg-brand-purple text-white text-sm font-semibold rounded-xl hover:bg-brand-purple-70 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {importing ? 'Importing…' : 'Run Import'}
        </button>
        {importError && <p className="text-sm text-status-overdue">{importError}</p>}
      </div>

      {/* Success result banner */}
      {lastResult && (
        <div className="mb-6 bg-status-success/10 border border-status-success/20 rounded-2xl p-4">
          <p className="text-sm font-semibold text-status-success mb-2">
            Import complete — {lastResult.filename}
          </p>
          <div className="flex gap-6 text-xs text-brand-navy-70">
            <span><span className="font-semibold text-brand-navy">{lastResult.stats.rowCount}</span> rows processed</span>
            <span><span className="font-semibold text-status-success">+{lastResult.stats.added}</span> added</span>
            <span><span className="font-semibold text-brand-navy">{lastResult.stats.updated}</span> updated</span>
            <span><span className="font-semibold text-status-overdue">{lastResult.stats.closedLost}</span> closed lost</span>
          </div>
          {lastResult.stats.errors.length > 0 && (
            <p className="text-xs text-status-warning mt-2">
              {lastResult.stats.errors.length} row error{lastResult.stats.errors.length > 1 ? 's' : ''} — see history below for details
            </p>
          )}
        </div>
      )}

      {/* History section */}
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-brand-navy">History</h2>
        <p className="text-xs text-brand-navy-70">Last 50 imports. The most recent import can be undone if there was a problem.</p>
      </div>

      {historyLoading && <div className="text-sm text-brand-navy-70 py-10 text-center">Loading…</div>}
      {historyError && <div className="text-sm text-status-overdue py-4">{historyError}</div>}
      {!historyLoading && !historyError && rows.length === 0 && (
        <div className="text-sm text-brand-navy-70 py-10 text-center">No imports yet.</div>
      )}
      {!historyLoading && !historyError && rows.length > 0 && (
        <div className="bg-white rounded-2xl border border-brand-navy-30/40 overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-brand-navy-30/40">
              <tr>
                {['Date', 'File', 'Rows', 'Added', 'Updated', 'Closed Lost', 'Status', ''].map((h, i) => (
                  <th key={i} className="px-4 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={r.id} className="border-b border-brand-navy-30/20 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs text-brand-navy whitespace-nowrap">
                    {new Date(r.imported_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-xs text-brand-navy-70 max-w-[180px] truncate" title={r.filename ?? ''}>
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
                        <p className="text-[10px] text-status-overdue mt-1 max-w-[180px] truncate" title={r.error_log}>
                          {r.error_log}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {idx === 0 && r.has_rollback && (
                      <button
                        onClick={() => handleRollback(r.id)}
                        disabled={rollingBack}
                        className="text-xs px-2.5 py-1 rounded-lg border border-status-warning text-status-warning hover:bg-status-warning/10 transition-colors disabled:opacity-40 whitespace-nowrap"
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
