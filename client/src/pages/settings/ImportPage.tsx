import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import type { ApiResponse } from '../../types';
import { formatDate } from '../../utils/formatters';

interface ImportStats {
  rowCount: number;
  added: number;
  updated: number;
  closedLost: number;
  errors: string[];
}

interface ImportKickoffResponse { importId: number }

interface LatestImportRow {
  id: number;
  filename: string | null;
  imported_at: string;
  has_rollback: boolean;
}

// Reduced to two steps — the former "result" step is now the live pipeline
// view on /settings/import-history (we redirect there after kickoff).
type Step = 'pick' | 'preview';

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white dark:bg-ink-1 rounded-2xl border border-brand-navy-30/40 dark:border-ink-border-soft px-5 py-4 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-brand-navy-70 dark:text-fg-2 mt-1">{label}</p>
    </div>
  );
}

export default function ImportPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('pick');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);

  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportStats | null>(null);

  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const [latest, setLatest] = useState<LatestImportRow | null>(null);
  const [rollingBack, setRollingBack] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadLatest = useCallback(async () => {
    try {
      const r = await api.get<ApiResponse<LatestImportRow[]>>('/opportunities/import/history');
      const rows = r.data.data;
      if (rows.length > 0 && rows[0].has_rollback) setLatest(rows[0]);
      else setLatest(null);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadLatest(); }, [loadLatest]);

  function selectFile(f: File) {
    setFile(f);
    setPreviewError(null);
  }

  function resetToStep1() {
    setStep('pick');
    setFile(null);
    setPreview(null);
    setPreviewError(null);
    setImportError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handlePreview() {
    if (!file) return;
    setPreviewing(true);
    setPreviewError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await api.post<ApiResponse<ImportStats>>('/opportunities/import/preview', form);
      setPreview(r.data.data);
      setStep('preview');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setPreviewError(msg ?? 'Could not parse file. Supported formats: Salesforce XLS export, .xlsx, or CSV (UTF-8 / UTF-16).');
    } finally {
      setPreviewing(false);
    }
  }

  async function handleImport() {
    if (!file) return;
    setImporting(true);
    setImportError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      // Server kicks off the 5-stage pipeline in the background and returns
      // the import id immediately. Redirect straight to the history page
      // which auto-expands the new row and polls every 5s until it finishes.
      const r = await api.post<ApiResponse<ImportKickoffResponse>>('/opportunities/import', form);
      const importId = r.data.data.importId;
      // Tell the header's DataFreshnessIndicator to refetch once the import
      // completes. The history page will show when that happens.
      window.dispatchEvent(new CustomEvent('sf-import-completed'));
      navigate(`/settings/imports/history?highlight=${importId}`);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setImportError(msg ?? 'Import failed. Please try again.');
      setImporting(false);
    }
  }

  async function handleRollback() {
    if (!latest) return;
    if (!window.confirm(`Roll back import "${latest.filename ?? 'unknown'}"?\n\nAll opportunity changes from this import will be undone.`)) return;
    setRollingBack(true);
    try {
      await api.delete(`/opportunities/import/${latest.id}`);
      setLatest(null);
      if (step === 'preview') resetToStep1();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      window.alert(msg ?? 'Rollback failed.');
    } finally {
      setRollingBack(false);
    }
  }

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-brand-navy dark:text-fg-1">Import</h1>
        <p className="text-sm text-brand-navy-70 dark:text-fg-2 mt-0.5">Upload a Salesforce XLS export to sync opportunities</p>
      </div>

      {/* Undo last import banner */}
      {latest && (
        <div className="mb-5 flex items-center justify-between gap-4 bg-status-warning/8 border border-status-warning/30 rounded-xl px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-status-warning dark:text-status-d-warning">Last import can be undone</p>
            <p className="text-xs text-brand-navy-70 dark:text-fg-2 mt-0.5 truncate">
              {latest.filename ?? 'Unknown file'} · {formatDate(latest.imported_at)}
            </p>
          </div>
          <button
            onClick={handleRollback}
            disabled={rollingBack}
            className="flex-shrink-0 text-xs px-3 py-1.5 rounded-lg border border-status-warning text-status-warning dark:text-status-d-warning hover:bg-status-warning/10 dark:bg-status-d-warning-soft transition-colors disabled:opacity-40 whitespace-nowrap"
          >
            {rollingBack ? 'Undoing…' : 'Undo import'}
          </button>
        </div>
      )}

      {/* ── STEP 1: Pick file ── */}
      {step === 'pick' && (
        <>
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files[0];
              if (f) selectFile(f);
            }}
            onClick={() => !file && fileInputRef.current?.click()}
            className={`rounded-2xl border-2 border-dashed transition-colors p-8 ${
              dragging
                ? 'border-brand-purple bg-brand-purple/5'
                : file
                ? 'border-brand-navy-30/40 dark:border-ink-border-soft bg-white dark:bg-ink-1 cursor-default'
                : 'border-brand-navy-30/40 dark:border-ink-border-soft bg-white dark:bg-ink-1 hover:border-brand-purple/50 cursor-pointer'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xls,.xlsx,.html,.htm,.csv"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) selectFile(f); }}
            />
            {!file ? (
              <div className="text-center">
                <div className="w-10 h-10 rounded-xl bg-brand-purple/10 dark:bg-accent-purple-soft flex items-center justify-center mx-auto mb-3">
                  <svg className="w-5 h-5 text-brand-purple dark:text-accent-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-brand-navy dark:text-fg-1">Drop your Salesforce export here</p>
                <p className="text-xs text-brand-navy-70 dark:text-fg-2 mt-1">
                  or <span className="text-brand-purple dark:text-accent-purple underline">browse files</span> — .xls format from Salesforce report export
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-brand-purple/10 dark:bg-accent-purple-soft flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-brand-purple dark:text-accent-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-brand-navy dark:text-fg-1 truncate">{file.name}</p>
                  <p className="text-xs text-brand-navy-70 dark:text-fg-2">{(file.size / 1024).toFixed(0)} KB</p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                  className="text-brand-navy-70 dark:text-fg-2 hover:text-brand-navy dark:text-fg-1 p-1 rounded transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={handlePreview}
              disabled={!file || previewing}
              className="px-5 py-2 bg-brand-purple dark:bg-accent-purple text-white text-sm font-semibold rounded-xl hover:bg-brand-purple-70 dark:hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {previewing ? 'Analysing…' : 'Preview Import'}
            </button>
            {previewError && <p className="text-sm text-status-overdue dark:text-status-d-overdue">{previewError}</p>}
          </div>
        </>
      )}

      {/* ── STEP 2: Preview ── */}
      {step === 'preview' && preview && (
        <>
          <div className="mb-5">
            <p className="text-sm font-semibold text-brand-navy dark:text-fg-1 mb-1">Preview — {file?.name}</p>
            <p className="text-xs text-brand-navy-70 dark:text-fg-2">Review the changes below before confirming. No data has been changed yet.</p>
          </div>

          <div className="grid grid-cols-4 gap-3 mb-5">
            <StatCard label="Total rows" value={preview.rowCount} color="text-brand-navy dark:text-fg-1" />
            <StatCard label="New deals" value={preview.added} color="text-status-success dark:text-status-d-success" />
            <StatCard label="Updated" value={preview.updated} color="text-brand-navy-70 dark:text-fg-2" />
            <StatCard label="Removed from open pipeline" value={preview.closedLost} color="text-status-overdue dark:text-status-d-overdue" />
          </div>

          {preview.errors.length > 0 && (
            <div className="mb-5 bg-status-overdue/5 border border-status-overdue/20 rounded-xl p-4">
              <p className="text-sm font-semibold text-status-overdue dark:text-status-d-overdue mb-2">
                {preview.errors.length} error{preview.errors.length > 1 ? 's' : ''} found — import blocked
              </p>
              <ul className="space-y-1">
                {preview.errors.map((e, i) => (
                  <li key={i} className="text-xs text-status-overdue dark:text-status-d-overdue font-mono">{e}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={handleImport}
              disabled={importing || preview.errors.length > 0}
              className="px-5 py-2 bg-brand-purple dark:bg-accent-purple text-white text-sm font-semibold rounded-xl hover:bg-brand-purple-70 dark:hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {importing ? 'Importing…' : 'Confirm & Import'}
            </button>
            <button
              onClick={resetToStep1}
              disabled={importing}
              className="px-4 py-2 text-sm text-brand-navy-70 dark:text-fg-2 hover:text-brand-navy dark:text-fg-1 transition-colors"
            >
              ← Cancel
            </button>
            {importError && <p className="text-sm text-status-overdue dark:text-status-d-overdue">{importError}</p>}
          </div>
        </>
      )}

    </div>
  );
}
