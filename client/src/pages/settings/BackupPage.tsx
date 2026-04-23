import { useEffect, useRef, useState } from 'react';
import {
  createBackup, listBackups, downloadBackupFromS3, triggerJsonDownload,
  restoreFromKey, restoreFromFile,
  type BackupMeta, type RestoreResult,
} from '../../api/backup';

// ── helpers ───────────────────────────────────────────────────────────────────
function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
function fmtDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

interface BackupCounts { users: number; tasks: number; notes: number; se_assignments: number; }
function countBackup(b: unknown): BackupCounts {
  const backup = b as Record<string, unknown[]>;
  return {
    users:          backup.users?.length          ?? 0,
    tasks:          backup.tasks?.length           ?? 0,
    notes:          backup.notes?.length           ?? 0,
    se_assignments: backup.se_assignments?.length  ?? 0,
  };
}

// ── confirmation modal ────────────────────────────────────────────────────────
function ConfirmModal({ counts, onConfirm, onCancel, loading, result }: {
  counts: BackupCounts;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
  result: RestoreResult | null;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="bg-white dark:bg-ink-1 rounded-lg shadow-lg w-full max-w-sm mx-4 p-6" onClick={e => e.stopPropagation()}>
        {result ? (
          <>
            <div className="flex items-center gap-2 mb-4">
              <span className="w-5 h-5 text-emerald-500">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </span>
              <h2 className="text-base font-semibold text-brand-navy dark:text-fg-1">Restore complete</h2>
            </div>
            <ul className="text-sm text-brand-navy-70 dark:text-fg-2 space-y-1 mb-5">
              <li>{result.usersProcessed} users restored</li>
              <li>{result.tasksRestored} tasks restored{result.tasksSkipped > 0 && `, ${result.tasksSkipped} skipped (opportunity not found)`}</li>
              <li>{result.notesRestored} notes restored</li>
              <li>{result.assignmentsProcessed} SE assignments applied</li>
            </ul>
            <button onClick={onCancel}
              className="w-full px-4 py-2 rounded-lg bg-brand-purple dark:bg-accent-purple text-white text-sm font-semibold hover:bg-brand-purple-70 dark:hover:opacity-90 transition-colors">
              Done
            </button>
          </>
        ) : (
          <>
            <h2 className="text-base font-semibold text-brand-navy dark:text-fg-1 mb-1">Restore this backup?</h2>
            <p className="text-xs text-brand-navy-70 dark:text-fg-2 mb-4">
              This will merge the backup data into the current database. Existing user passwords are preserved.
              New users will be created with a temporary password.
            </p>
            <ul className="text-xs text-brand-navy-70 dark:text-fg-2 bg-brand-navy-30/10 rounded-lg px-4 py-3 space-y-1 mb-5">
              <li><span className="font-medium text-brand-navy dark:text-fg-1">{counts.users}</span> users</li>
              <li><span className="font-medium text-brand-navy dark:text-fg-1">{counts.tasks}</span> tasks</li>
              <li><span className="font-medium text-brand-navy dark:text-fg-1">{counts.notes}</span> notes</li>
              <li><span className="font-medium text-brand-navy dark:text-fg-1">{counts.se_assignments}</span> SE → deal assignments</li>
            </ul>
            <div className="flex justify-end gap-2">
              <button onClick={onCancel} disabled={loading}
                className="px-4 py-2 rounded-lg border border-brand-navy-30 text-sm text-brand-navy-70 dark:text-fg-2 hover:text-brand-navy dark:text-fg-1 transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button onClick={onConfirm} disabled={loading}
                className="px-4 py-2 rounded-lg bg-status-overdue text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity">
                {loading ? 'Restoring…' : 'Confirm Restore'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function BackupPage() {
  const [backups, setBackups]           = useState<BackupMeta[]>([]);
  const [loadingList, setLoadingList]   = useState(true);
  const [creating, setCreating]         = useState(false);
  const [createMsg, setCreateMsg]       = useState<string | null>(null);
  const [downloading, setDownloading]   = useState<string | null>(null);

  // restore state
  const [pendingRestore, setPendingRestore] = useState<{ source: 's3' | 'file'; key?: string; backup?: unknown } | null>(null);
  const [restoring, setRestoring]       = useState(false);
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null);

  // file upload
  const [fileBackup, setFileBackup]     = useState<Record<string, unknown> | null>(null);
  const [fileError, setFileError]       = useState<string | null>(null);
  const fileRef                         = useRef<HTMLInputElement>(null);

  async function loadList() {
    setLoadingList(true);
    try { setBackups(await listBackups()); }
    catch { setBackups([]); }
    finally { setLoadingList(false); }
  }

  useEffect(() => { loadList(); }, []);

  // ── Create backup ────────────────────────────────────────────────────────
  async function handleCreate() {
    setCreating(true);
    setCreateMsg(null);
    try {
      const result = await createBackup();
      const ts = result.s3_key.split('/').pop()?.replace('.json', '') ?? 'backup';
      triggerJsonDownload(result.backup, `${ts}.json`);
      setCreateMsg('Backup created and downloaded.');
      await loadList();
    } catch {
      setCreateMsg('Failed to create backup. Is the server configured with APP_BACKUP_BUCKET?');
    } finally {
      setCreating(false);
    }
  }

  // ── Download from S3 ─────────────────────────────────────────────────────
  async function handleDownload(key: string) {
    setDownloading(key);
    try { await downloadBackupFromS3(key); }
    catch { alert('Download failed.'); }
    finally { setDownloading(null); }
  }

  // ── Restore ──────────────────────────────────────────────────────────────
  async function handleRestoreConfirm() {
    if (!pendingRestore) return;
    setRestoring(true);
    try {
      const result = pendingRestore.source === 's3'
        ? await restoreFromKey(pendingRestore.key!)
        : await restoreFromFile(pendingRestore.backup!);
      setRestoreResult(result);
    } catch {
      alert('Restore failed. Check server logs.');
      setPendingRestore(null);
    } finally {
      setRestoring(false);
    }
  }

  function closeConfirm() {
    setPendingRestore(null);
    setRestoreResult(null);
  }

  // ── File picker ──────────────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFileError(null);
    setFileBackup(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (!parsed.version || !Array.isArray(parsed.users)) {
          setFileError('Not a valid backup file.');
          return;
        }
        setFileBackup(parsed);
      } catch {
        setFileError('Could not parse JSON.');
      }
    };
    reader.readAsText(file);
  }

  const pendingCounts = pendingRestore?.backup
    ? countBackup(pendingRestore.backup)
    : pendingRestore?.key
      ? { users: 0, tasks: 0, notes: 0, se_assignments: 0 }  // will be loaded server-side
      : { users: 0, tasks: 0, notes: 0, se_assignments: 0 };

  const fileCounts = fileBackup ? countBackup(fileBackup) : null;

  return (
    <div className="max-w-3xl">
      {/* Confirmation modal */}
      {pendingRestore && (
        <ConfirmModal
          counts={pendingCounts}
          onConfirm={handleRestoreConfirm}
          onCancel={closeConfirm}
          loading={restoring}
          result={restoreResult}
        />
      )}

      <div className="mb-6">
        <h1 className="text-lg font-semibold text-brand-navy dark:text-fg-1">Backup &amp; Restore</h1>
        <p className="text-sm text-brand-navy-70 dark:text-fg-2 mt-0.5">
          Back up user hierarchy, territories, tasks, notes, and SE assignments.
          Opportunities are re-imported from Salesforce and are not included.
        </p>
      </div>

      {/* ── Back Up Now ─────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-ink-1 rounded-lg border border-brand-navy-30/40 dark:border-ink-border-soft p-5 mb-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-brand-navy dark:text-fg-1">Create backup</h2>
            <p className="text-xs text-brand-navy-70 dark:text-fg-2 mt-0.5">
              Saves to S3 and downloads a copy to your browser.
            </p>
          </div>
          <button onClick={handleCreate} disabled={creating}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-purple dark:bg-accent-purple text-white text-sm font-semibold hover:bg-brand-purple-70 dark:hover:opacity-90 disabled:opacity-50 transition-colors whitespace-nowrap flex-shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            {creating ? 'Creating…' : 'Back Up Now'}
          </button>
        </div>
        {createMsg && (
          <p className={`mt-3 text-xs ${createMsg.startsWith('Failed') ? 'text-status-overdue dark:text-status-d-overdue' : 'text-status-success dark:text-status-d-success'}`}>
            {createMsg}
          </p>
        )}
      </div>

      {/* ── S3 Backup List ──────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-ink-1 rounded-lg border border-brand-navy-30/40 dark:border-ink-border-soft overflow-hidden mb-4">
        <div className="flex items-center justify-between px-5 py-3 border-b border-brand-navy-30/30 dark:border-ink-border-soft">
          <h2 className="text-sm font-semibold text-brand-navy dark:text-fg-1">Stored backups</h2>
          <button onClick={loadList} disabled={loadingList}
            className="text-xs text-brand-navy-70 dark:text-fg-2 hover:text-brand-navy dark:text-fg-1 transition-colors">
            Refresh
          </button>
        </div>

        {loadingList ? (
          <div className="px-5 py-8 text-center text-sm text-brand-navy-70 dark:text-fg-2">Loading…</div>
        ) : backups.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm font-medium text-brand-navy-70 dark:text-fg-2">No backups yet</p>
            <p className="text-xs text-brand-navy-30 dark:text-fg-4 mt-1">Create your first backup above.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-brand-navy-30/20 dark:border-ink-border-soft">
                <th className="text-left px-5 py-2 text-[11px] font-semibold text-brand-navy-70 dark:text-fg-2 uppercase tracking-wide">Date</th>
                <th className="text-left px-3 py-2 text-[11px] font-semibold text-brand-navy-70 dark:text-fg-2 uppercase tracking-wide">Created by</th>
                <th className="text-right px-3 py-2 text-[11px] font-semibold text-brand-navy-70 dark:text-fg-2 uppercase tracking-wide">Size</th>
                <th className="px-5 py-2" />
              </tr>
            </thead>
            <tbody>
              {backups.map(b => (
                <tr key={b.key} className="border-b border-brand-navy-30/20 dark:border-ink-border-soft last:border-0 hover:bg-brand-navy/[0.025]">
                  <td className="px-5 py-3 text-sm text-brand-navy dark:text-fg-1">{fmtDate(b.last_modified)}</td>
                  <td className="px-3 py-3 text-sm text-brand-navy-70 dark:text-fg-2 truncate max-w-[180px]">{b.created_by || '—'}</td>
                  <td className="px-3 py-3 text-sm text-brand-navy-70 dark:text-fg-2 text-right">{fmtSize(b.size)}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleDownload(b.key)}
                        disabled={downloading === b.key}
                        className="text-xs px-2.5 py-1 rounded border border-brand-navy-30 text-brand-navy-70 dark:text-fg-2 hover:text-brand-navy dark:text-fg-1 transition-colors disabled:opacity-40">
                        {downloading === b.key ? '…' : 'Download'}
                      </button>
                      <button
                        onClick={() => setPendingRestore({ source: 's3', key: b.key, backup: undefined })}
                        className="text-xs px-2.5 py-1 rounded border border-status-overdue/40 text-status-overdue dark:text-status-d-overdue hover:bg-status-overdue/5 transition-colors">
                        Restore
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Restore from file ───────────────────────────────────────────── */}
      <div className="bg-white dark:bg-ink-1 rounded-lg border border-brand-navy-30/40 dark:border-ink-border-soft p-5">
        <h2 className="text-sm font-semibold text-brand-navy dark:text-fg-1 mb-0.5">Restore from file</h2>
        <p className="text-xs text-brand-navy-70 dark:text-fg-2 mb-4">Upload a previously downloaded backup JSON file.</p>

        <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFileChange} />
        <button onClick={() => { fileRef.current?.click(); }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-brand-navy-30 text-sm text-brand-navy-70 dark:text-fg-2 hover:text-brand-navy dark:text-fg-1 hover:border-brand-navy transition-colors mb-3">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          Choose backup file…
        </button>

        {fileError && <p className="text-xs text-status-overdue dark:text-status-d-overdue mb-2">{fileError}</p>}

        {fileCounts && fileBackup && (
          <div className="bg-brand-navy-30/10 rounded-lg px-4 py-3 mb-3">
            <p className="text-xs font-medium text-brand-navy dark:text-fg-1 mb-1">File contents:</p>
            <ul className="text-xs text-brand-navy-70 dark:text-fg-2 space-y-0.5">
              <li>{fileCounts.users} users · {fileCounts.tasks} tasks · {fileCounts.notes} notes · {fileCounts.se_assignments} SE assignments</li>
            </ul>
          </div>
        )}

        {fileBackup && (
          <button
            onClick={() => setPendingRestore({ source: 'file', backup: fileBackup })}
            className="px-4 py-2 rounded-lg bg-status-overdue text-white text-sm font-semibold hover:opacity-90 transition-opacity">
            Restore from file
          </button>
        )}
      </div>
    </div>
  );
}
