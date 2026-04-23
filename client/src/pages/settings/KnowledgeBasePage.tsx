import { useEffect, useState, useRef, useCallback } from 'react';
import api from '../../api/client';
import type { ApiResponse } from '../../types';

/* ── Types ── */
interface KbFile {
  file_name: string;
  size_bytes: number;
  modified_at: string;
  kind: 'proof_point' | 'differentiator' | 'index';
  customer_count: number;
  last_imported_at: string | null;
  last_imported_count: number | null;
}

interface UploadResult {
  file_name: string;
  kind: 'proof_point' | 'differentiator' | 'index';
  written_bytes: number;
  imported?: number;
  deleted?: number;
  parsed_customers?: string[];
  note?: string;
}

/* ── Helpers ── */
function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 30 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function kindLabel(kind: KbFile['kind']): { label: string; class: string } {
  switch (kind) {
    case 'proof_point':    return { label: 'Proof points',   class: 'bg-brand-purple-30/60 dark:bg-accent-purple-soft text-brand-purple' };
    case 'differentiator': return { label: 'Differentiators', class: 'bg-brand-pink-30/60 text-brand-pink dark:text-accent-pink' };
    case 'index':          return { label: 'Index',          class: 'bg-gray-100 dark:bg-ink-3 text-gray-600' };
  }
}

/* ── Component ── */
export default function KnowledgeBasePage() {
  const [files, setFiles] = useState<KbFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [fullImporting, setFullImporting] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const r = await api.get<ApiResponse<KbFile[]>>('/admin/kb/files');
      setFiles(r.data.data);
      setError(null);
    } catch (e) {
      setError((e as Error).message ?? 'Failed to load KB files');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const showToast = (kind: 'ok' | 'err', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 5000);
  };

  const download = async (fileName: string) => {
    try {
      const r = await api.get(`/admin/kb/files/${encodeURIComponent(fileName)}`, {
        responseType: 'blob',
      });
      const blob = r.data as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      showToast('err', `Download failed: ${(e as Error).message}`);
    }
  };

  const upload = async (fileName: string, file: File) => {
    if (!file.name.endsWith('.md')) {
      showToast('err', 'Only .md files are accepted');
      return;
    }
    setUploading(fileName);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api.post<ApiResponse<UploadResult>>(
        `/admin/kb/files/${encodeURIComponent(fileName)}`,
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      const result = r.data.data;
      if (result.kind === 'proof_point') {
        const prev = files.find(f => f.file_name === fileName)?.customer_count ?? 0;
        const delta = (result.imported ?? 0) - prev;
        const arrow = delta === 0 ? '' : delta > 0 ? ` (+${delta})` : ` (${delta})`;
        showToast('ok', `${fileName} imported: ${prev} → ${result.imported} customers${arrow}`);
      } else {
        showToast('ok', `${fileName} uploaded (${fmtBytes(result.written_bytes)}). Run full re-import to activate.`);
      }
      await refresh();
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } }).response?.data?.error ?? (e as Error).message;
      showToast('err', `Upload rejected: ${msg}`);
    } finally {
      setUploading(null);
    }
  };

  const fullReimport = async () => {
    if (!confirm('Run a full KB re-import? This clears all proof points and differentiators, then re-parses every file. Takes a few seconds.')) return;
    setFullImporting(true);
    try {
      const r = await api.post<ApiResponse<{ proofPoints: number; differentiators: number }>>('/admin/kb/import');
      showToast('ok', `Full re-import complete: ${r.data.data.proofPoints} proof points, ${r.data.data.differentiators} differentiators.`);
      await refresh();
    } catch (e) {
      showToast('err', `Re-import failed: ${(e as Error).message}`);
    } finally {
      setFullImporting(false);
    }
  };

  return (
    <div className="max-w-5xl">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl shadow-lg border text-[12px] font-medium ${
          toast.kind === 'ok'
            ? 'bg-emerald-50 dark:bg-status-d-success-soft border-emerald-200 text-emerald-800'
            : 'bg-red-50 dark:bg-status-d-overdue-soft border-red-200 text-red-800'
        }`}>
          {toast.text}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-lg font-semibold text-brand-navy dark:text-fg-1">Knowledge Base</h1>
          <p className="text-[12px] text-brand-navy-70 dark:text-fg-2 mt-1 max-w-2xl leading-relaxed">
            Source markdown for the Call Prep and Similar Deals features. Each file covers one vertical and follows a strict template (<code className="text-[11px] bg-gray-100 dark:bg-ink-3 px-1 rounded">### Customer</code> → About, Products/Initiatives table, Proof Point). Download, edit locally, upload back — proof-point files auto-import on upload. Differentiators and the index require a full re-import to activate.
          </p>
        </div>
        <button
          onClick={fullReimport}
          disabled={fullImporting}
          className="flex-shrink-0 text-[11px] font-semibold text-brand-purple dark:text-accent-purple hover:text-brand-purple-70 dark:text-accent-purple px-3 py-2 rounded-lg border border-brand-purple/30 dark:border-accent-purple/30 hover:bg-brand-purple-30/30 dark:hover:bg-accent-purple-soft disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {fullImporting ? 'Re-importing…' : 'Full re-import'}
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-12 bg-gray-50 dark:bg-ink-2 rounded-xl animate-pulse" />)}
        </div>
      ) : error ? (
        <div className="bg-red-50 dark:bg-status-d-overdue-soft border border-red-200 rounded-xl px-4 py-3 text-[12px] text-red-700">{error}</div>
      ) : (
        <div className="bg-white dark:bg-ink-1 border border-brand-navy-30/40 dark:border-ink-border-soft rounded-xl overflow-hidden">
          <table className="w-full text-[12px]">
            <thead className="bg-[#F5F5F7] dark:bg-ink-0 text-brand-navy-70 dark:text-fg-2">
              <tr className="text-left">
                <th className="px-4 py-2.5 font-semibold">File</th>
                <th className="px-4 py-2.5 font-semibold">Kind</th>
                <th className="px-4 py-2.5 font-semibold text-right">Customers in DB</th>
                <th className="px-4 py-2.5 font-semibold">Last imported</th>
                <th className="px-4 py-2.5 font-semibold">File on disk</th>
                <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-navy-30/20">
              {files.map(f => {
                const kind = kindLabel(f.kind);
                const isBusy = uploading === f.file_name;
                return (
                  <tr key={f.file_name} className="hover:bg-brand-purple-30/10 dark:hover:bg-accent-purple-soft transition-colors">
                    <td className="px-4 py-2.5 font-mono text-[11px] text-brand-navy dark:text-fg-1">{f.file_name}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${kind.class}`}>
                        {kind.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-brand-navy-70 dark:text-fg-2">
                      {f.kind === 'proof_point' ? f.customer_count : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-brand-navy-70 dark:text-fg-2">{fmtDate(f.last_imported_at)}</td>
                    <td className="px-4 py-2.5 text-brand-navy-70 dark:text-fg-2">
                      {fmtBytes(f.size_bytes)} · <span className="text-[10px]">modified {fmtDate(f.modified_at)}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <button
                        onClick={() => download(f.file_name)}
                        className="text-[11px] font-semibold text-brand-purple dark:text-accent-purple hover:text-brand-purple-70 dark:text-accent-purple mr-3"
                      >
                        Download
                      </button>
                      <input
                        ref={el => { inputRefs.current[f.file_name] = el; }}
                        type="file"
                        accept=".md,text/markdown"
                        className="hidden"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) upload(f.file_name, file);
                          e.target.value = '';
                        }}
                      />
                      <button
                        onClick={() => inputRefs.current[f.file_name]?.click()}
                        disabled={isBusy}
                        className="text-[11px] font-semibold text-brand-purple dark:text-accent-purple hover:text-brand-purple-70 dark:text-accent-purple disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {isBusy ? 'Uploading…' : 'Upload'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footnote */}
      <p className="text-[11px] text-brand-navy-70 dark:text-fg-2 mt-4 max-w-2xl leading-relaxed">
        <strong>Upload flow:</strong> Upload → server writes to disk (atomic) → parses the markdown → on success, replaces just that file's records in the DB and logs the import. If the parser rejects, the DB is untouched and you'll see a line-level error. Customers removed from the file disappear from the DB.
      </p>
    </div>
  );
}
