import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getDeployStatus, triggerDeploy, getDeployLog, getCommits,
  type DeployStatus, type DeployLogEntry, type CommitEntry,
} from '../../api/deploy';

function sha(s: string | null | undefined, len = 8) {
  if (!s) return '—';
  return s.slice(0, len);
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const SCOPE_STYLES: Record<string, string> = {
  'fe':     'bg-blue-100 text-blue-700',
  'be':     'bg-orange-100 text-orange-700',
  'fe+be':  'bg-brand-pink-30 text-brand-pink dark:text-accent-pink',
  'infra':  'bg-gray-100 dark:bg-ink-3 text-gray-600',
};

function parseScope(message: string): string | null {
  const m = message.match(/\[(\w[^\]]*)\]/);
  return m ? m[1].toLowerCase() : null;
}

function ScopeBadge({ message }: { message: string }) {
  const scope = parseScope(message);
  if (!scope || !SCOPE_STYLES[scope]) return null;
  return (
    <span className={`text-[10px] font-semibold rounded px-1.5 py-px flex-shrink-0 mt-px ${SCOPE_STYLES[scope]}`}>
      {scope}
    </span>
  );
}

function fmtCommitDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = diffMs / 3600000;
  if (diffH < 1)   return `${Math.round(diffMs / 60000)}m ago`;
  if (diffH < 24)  return `${Math.round(diffH)}h ago`;
  if (diffH < 168) return `${Math.round(diffH / 24)}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function DeployPage() {
  const [status, setStatus]           = useState<DeployStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [commits, setCommits]         = useState<CommitEntry[]>([]);
  const [loadingCommits, setLoadingCommits] = useState(true);

  const [activeLog, setActiveLog]     = useState<DeployLogEntry | null>(null);
  const [deploying, setDeploying]     = useState(false);
  const [triggerError, setTriggerError] = useState<string | null>(null);

  const pollRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const pollLog = useCallback(async (logId: number) => {
    try {
      const entry = await getDeployLog(logId);
      setActiveLog(entry);
      if (entry.status === 'success' || entry.status === 'failed') {
        stopPolling();
        setDeploying(false);
        getDeployStatus().then(setStatus).catch(() => {});
      }
    } catch { /* ignore transient errors */ }
  }, [stopPolling]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeLog?.log]);

  useEffect(() => {
    setLoadingStatus(true);
    getDeployStatus()
      .then(async (s) => {
        setStatus(s);
        if (s.deploy_running && s.last_deploy) {
          setDeploying(true);
          const entry = await getDeployLog(s.last_deploy.id);
          setActiveLog(entry);
          pollRef.current = setInterval(() => pollLog(s.last_deploy!.id), 2000);
        }
      })
      .catch(e => setStatusError(String(e)))
      .finally(() => setLoadingStatus(false));

    getCommits()
      .then(setCommits)
      .catch(() => {})
      .finally(() => setLoadingCommits(false));

    return stopPolling;
  }, [pollLog, stopPolling]);

  async function handleDeploy() {
    setTriggerError(null);
    setDeploying(true);
    setActiveLog(null);
    try {
      const { log_id } = await triggerDeploy();
      const entry = await getDeployLog(log_id);
      setActiveLog(entry);
      pollRef.current = setInterval(() => pollLog(log_id), 2000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setTriggerError(msg);
      setDeploying(false);
    }
  }

  const isRunning = deploying || status?.deploy_running;
  const canDeploy = !isRunning && !!status && !status.error;
  const hasUpdate = status?.has_update;
  const deployedSha = status?.frontend_sha ?? status?.server_sha;

  return (
    <div className="flex gap-6 items-start">

      {/* ── Left column ───────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-brand-navy dark:text-fg-1">Deploy</h1>
          <p className="text-sm text-brand-navy-70 dark:text-fg-2 mt-1">
            Trigger a frontend re-deploy from the latest GitHub commit. The server
            downloads the source, builds it, and publishes to CloudFront.
          </p>
        </div>

        {/* Version status */}
        <div className="bg-white dark:bg-ink-1 rounded-lg border border-brand-navy-30 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-brand-navy dark:text-fg-1">Version Status</h2>

          {loadingStatus && <p className="text-sm text-brand-navy-70 dark:text-fg-2">Loading...</p>}
          {statusError   && <p className="text-sm text-status-overdue dark:text-status-d-overdue">Failed to load status: {statusError}</p>}

          {status && !loadingStatus && (
            <>
              <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-brand-navy-70 dark:text-fg-2 mb-0.5">Server deployed</p>
                  <code className="font-mono text-brand-navy dark:text-fg-1">{sha(status.server_sha)}</code>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-brand-navy-70 dark:text-fg-2 mb-0.5">Frontend deployed</p>
                  <code className="font-mono text-brand-navy dark:text-fg-1">{sha(status.frontend_sha)}</code>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-brand-navy-70 dark:text-fg-2 mb-0.5">Latest on GitHub</p>
                  <code className="font-mono text-brand-navy dark:text-fg-1">{sha(status.latest_sha)}</code>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-brand-navy-70 dark:text-fg-2 mb-0.5">Status</p>
                  {isRunning ? (
                    <span className="inline-flex items-center gap-1.5 text-status-warning dark:text-status-d-warning font-medium text-sm">
                      <span className="w-2 h-2 rounded-full bg-status-warning animate-pulse" />
                      Deploying…
                    </span>
                  ) : hasUpdate ? (
                    <span className="inline-flex items-center gap-1.5 text-status-warning dark:text-status-d-warning font-medium text-sm">
                      <span className="w-2 h-2 rounded-full bg-status-warning" />
                      Update available
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-status-success dark:text-status-d-success font-medium text-sm">
                      <span className="w-2 h-2 rounded-full bg-status-success" />
                      Up to date
                    </span>
                  )}
                </div>
              </div>

              {status.error && (
                <p className="text-xs text-status-overdue dark:text-status-d-overdue bg-red-50 dark:bg-status-d-overdue-soft rounded px-3 py-2">
                  GitHub API error: {status.error}
                </p>
              )}

              {status.last_deploy && !isRunning && (
                <p className="text-xs text-brand-navy-70 dark:text-fg-2">
                  Last deploy: {fmtDate(status.last_deploy.triggered_at)} —{' '}
                  <span className={
                    status.last_deploy.status === 'success' ? 'text-status-success dark:text-status-d-success' :
                    status.last_deploy.status === 'failed'  ? 'text-status-overdue dark:text-status-d-overdue' :
                    'text-brand-navy-70 dark:text-fg-2'
                  }>
                    {status.last_deploy.status}
                  </span>
                  {status.last_deploy.target_sha && (
                    <> → <code className="font-mono">{sha(status.last_deploy.target_sha)}</code></>
                  )}
                </p>
              )}

              {triggerError && (
                <p className="text-sm text-status-overdue dark:text-status-d-overdue bg-red-50 dark:bg-status-d-overdue-soft rounded px-3 py-2">
                  {triggerError}
                </p>
              )}

              <button
                onClick={handleDeploy}
                disabled={!canDeploy}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  canDeploy
                    ? 'bg-brand-purple dark:bg-accent-purple text-white hover:bg-brand-purple-70 dark:hover:opacity-90'
                    : 'bg-brand-navy-30 text-brand-navy-70 dark:text-fg-2 cursor-not-allowed'
                }`}
              >
                {isRunning ? 'Deploying…' : 'Deploy latest'}
              </button>
            </>
          )}
        </div>

        {/* Deploy log */}
        {activeLog && (
          <div className="bg-white dark:bg-ink-1 rounded-lg border border-brand-navy-30 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-brand-navy-30">
              <h2 className="text-sm font-semibold text-brand-navy dark:text-fg-1">Deploy log</h2>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                activeLog.status === 'success' ? 'bg-emerald-100 text-emerald-700' :
                activeLog.status === 'failed'  ? 'bg-red-100 text-red-700' :
                'bg-amber-100 text-amber-700'
              }`}>
                {activeLog.status}
              </span>
            </div>
            <div className="bg-brand-navy rounded-b-lg p-4 font-mono text-xs text-white/80 max-h-80 overflow-y-auto leading-relaxed">
              {activeLog.log.length === 0 ? (
                <span className="text-white/40">Waiting for output…</span>
              ) : (
                activeLog.log.map((line, i) => (
                  <div key={i} className={
                    line.includes('ERROR')    ? 'text-status-overdue dark:text-status-d-overdue' :
                    line.includes('complete') || line.includes('Deploy complete') ? 'text-status-success dark:text-status-d-success' :
                    'text-white/80'
                  }>
                    {line}
                  </div>
                ))
              )}
              {isRunning && <div className="text-white/40 mt-1 animate-pulse">▌</div>}
              <div ref={logEndRef} />
            </div>
          </div>
        )}
      </div>

      {/* ── Right column: commit history ──────────────────────────────────────── */}
      <div className="w-80 flex-shrink-0">
        <div className="bg-white dark:bg-ink-1 rounded-lg border border-brand-navy-30 overflow-hidden">
          <div className="px-4 py-3 border-b border-brand-navy-30">
            <h2 className="text-sm font-semibold text-brand-navy dark:text-fg-1">Recent commits</h2>
            <p className="text-[11px] text-brand-navy-70 dark:text-fg-2 mt-0.5">master branch · last 20</p>
          </div>

          <div className="overflow-y-auto max-h-[600px] divide-y divide-brand-navy-30/50">
            {loadingCommits && (
              <p className="px-4 py-3 text-sm text-brand-navy-70 dark:text-fg-2">Loading...</p>
            )}
            {!loadingCommits && commits.length === 0 && (
              <p className="px-4 py-3 text-sm text-brand-navy-70 dark:text-fg-2">No commits found.</p>
            )}
            {commits.map((c) => {
              const isDeployed = deployedSha && c.sha.startsWith(deployedSha);
              return (
                <div key={c.sha} className={`px-4 py-3 ${isDeployed ? 'bg-brand-purple-30/40 dark:bg-accent-purple-soft' : ''}`}>
                  <div className="flex items-start gap-1.5 flex-wrap">
                    <code className="text-[11px] font-mono text-brand-navy-70 dark:text-fg-2 mt-0.5 flex-shrink-0">
                      {c.sha.slice(0, 7)}
                    </code>
                    <ScopeBadge message={c.message} />
                    {isDeployed && (
                      <span className="text-[10px] font-semibold bg-brand-purple dark:bg-accent-purple text-white rounded px-1.5 py-px flex-shrink-0 mt-px">
                        deployed
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-brand-navy dark:text-fg-1 mt-1 leading-snug line-clamp-2">
                    {c.message}
                  </p>
                  <p className="text-[11px] text-brand-navy-70 dark:text-fg-2 mt-1">
                    {fmtCommitDate(c.date)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

    </div>
  );
}
