/**
 * AI Jobs — admin view across every agent.
 *
 * Two modes:
 *  • /settings/ai-jobs           → split view: currently-running (auto-refresh) + filterable history
 *  • /settings/ai-jobs/:id       → detail for one job, including prompt+response when the owning
 *                                  agent had log_io = true at call time
 */
import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  listAiJobs, listRunningAiJobs, getAiJob, killAiJob, listAgents,
  type AiJobRow, type AiJobDetail, type AgentWithUsage,
} from '../../api/agents';
import { formatDateTime } from '../../utils/formatters';

const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString();

function StatusPill({ status }: { status: AiJobRow['status'] }) {
  const cls = {
    done:    'bg-emerald-50 dark:bg-status-d-success-soft text-status-success dark:text-status-d-success',
    running: 'bg-amber-50 dark:bg-status-d-warning-soft text-status-warning dark:text-status-d-warning',
    failed:  'bg-red-50 dark:bg-status-d-overdue-soft text-status-overdue dark:text-status-d-overdue',
    killed:  'bg-brand-navy-30/60 text-brand-navy dark:bg-ink-2 dark:text-fg-2',
  }[status];
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${cls}`}>{status}</span>;
}

export default function AiJobsPage() {
  const { id } = useParams();
  if (id) return <AiJobDetailView id={Number(id)} />;
  return <AiJobsListView />;
}

function AiJobsListView() {
  const [running, setRunning] = useState<AiJobRow[]>([]);
  const [history, setHistory] = useState<AiJobRow[]>([]);
  const [agents, setAgents] = useState<AgentWithUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterAgent, setFilterAgent] = useState<number | ''>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [sinceHours, setSinceHours] = useState<number>(24);

  const refresh = useCallback(async () => {
    const [r, h] = await Promise.all([
      listRunningAiJobs(),
      listAiJobs({
        agent_id: filterAgent === '' ? undefined : filterAgent,
        status: filterStatus || undefined,
        since_hours: sinceHours,
        limit: 100,
      }),
    ]);
    setRunning(r);
    setHistory(h);
  }, [filterAgent, filterStatus, sinceHours]);

  useEffect(() => {
    setLoading(true);
    Promise.all([refresh(), listAgents().then(setAgents)])
      .catch(e => setError((e as Error).message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [refresh]);

  // Poll the running list every 3s — lightweight and only when the page is open.
  useEffect(() => {
    const iv = setInterval(() => {
      listRunningAiJobs().then(setRunning).catch(() => {});
    }, 3000);
    return () => clearInterval(iv);
  }, []);

  async function kill(jobId: number) {
    if (!confirm(`Kill job #${jobId}? This aborts the in-flight request to Anthropic.`)) return;
    try {
      await killAiJob(jobId);
      await refresh();
    } catch (e) {
      alert((e as Error).message || 'Failed to kill');
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-brand-navy dark:text-fg-1">AI Jobs</h1>
        <p className="mt-1 text-sm text-brand-navy-70 dark:text-fg-2">
          Every call made by every agent. Kill a runaway job, dig into prompt/response for a past one.
        </p>
      </header>

      {error && <p className="text-sm text-status-overdue dark:text-status-d-overdue">{error}</p>}

      {/* Running jobs */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-brand-navy dark:text-fg-1">
          Running <span className="ml-1 text-brand-navy-70 dark:text-fg-2">({running.length})</span>
        </h2>
        <div className="bg-white dark:bg-ink-1 rounded-xl shadow-sm border border-brand-navy-30/40 dark:border-ink-border-soft overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-brand-navy-30/20 dark:bg-ink-2 text-[11px] uppercase tracking-wider text-brand-navy-70 dark:text-fg-2">
              <tr>
                <th className="text-left px-4 py-2">ID</th>
                <th className="text-left px-4 py-2">Agent</th>
                <th className="text-left px-4 py-2">Started</th>
                <th className="text-left px-4 py-2">User</th>
                <th className="text-left px-4 py-2">Opp</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-navy-30/30 dark:divide-ink-border-soft">
              {running.map(j => (
                <tr key={j.id}>
                  <td className="px-4 py-2">
                    <Link to={`/settings/ai-jobs/${j.id}`} className="text-brand-purple hover:underline font-mono text-[12px]">#{j.id}</Link>
                  </td>
                  <td className="px-4 py-2 text-[12px] text-brand-navy dark:text-fg-1">{j.agent_name ?? j.feature}</td>
                  <td className="px-4 py-2 text-[12px] text-brand-navy-70 dark:text-fg-2">{formatDateTime(j.started_at)}</td>
                  <td className="px-4 py-2 text-[12px] text-brand-navy-70 dark:text-fg-2">{j.started_by_name ?? '—'}</td>
                  <td className="px-4 py-2 text-[12px] text-brand-navy-70 dark:text-fg-2">{j.opportunity_id ?? '—'}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => kill(j.id)}
                      className="text-[12px] text-status-overdue dark:text-status-d-overdue hover:underline"
                    >Kill</button>
                  </td>
                </tr>
              ))}
              {running.length === 0 && !loading && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-brand-navy-70 dark:text-fg-2">No jobs running.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* History with filters */}
      <section>
        <div className="mb-2 flex items-center gap-3">
          <h2 className="text-sm font-semibold text-brand-navy dark:text-fg-1">History</h2>
          <select value={filterAgent} onChange={e => setFilterAgent(e.target.value === '' ? '' : Number(e.target.value))}
                  className="rounded border border-brand-navy-30/60 dark:border-ink-border-soft bg-white dark:bg-ink-0 px-2 py-1 text-xs text-brand-navy dark:text-fg-1">
            <option value="">All agents</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                  className="rounded border border-brand-navy-30/60 dark:border-ink-border-soft bg-white dark:bg-ink-0 px-2 py-1 text-xs text-brand-navy dark:text-fg-1">
            <option value="">Any status</option>
            <option value="done">done</option>
            <option value="failed">failed</option>
            <option value="killed">killed</option>
          </select>
          <select value={sinceHours} onChange={e => setSinceHours(Number(e.target.value))}
                  className="rounded border border-brand-navy-30/60 dark:border-ink-border-soft bg-white dark:bg-ink-0 px-2 py-1 text-xs text-brand-navy dark:text-fg-1">
            <option value={1}>Last hour</option>
            <option value={24}>Last 24h</option>
            <option value={24 * 7}>Last 7d</option>
            <option value={24 * 30}>Last 30d</option>
          </select>
        </div>

        <div className="bg-white dark:bg-ink-1 rounded-xl shadow-sm border border-brand-navy-30/40 dark:border-ink-border-soft overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-brand-navy-30/20 dark:bg-ink-2 text-[11px] uppercase tracking-wider text-brand-navy-70 dark:text-fg-2">
              <tr>
                <th className="text-left px-4 py-2">ID</th>
                <th className="text-left px-4 py-2">Agent</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">Started</th>
                <th className="text-right px-4 py-2">Duration</th>
                <th className="text-right px-4 py-2">In / Out</th>
                <th className="text-left px-4 py-2">User</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-navy-30/30 dark:divide-ink-border-soft">
              {history.map(j => (
                <tr key={j.id} className="hover:bg-brand-navy-30/10 dark:hover:bg-ink-2">
                  <td className="px-4 py-2">
                    <Link to={`/settings/ai-jobs/${j.id}`} className="text-brand-purple hover:underline font-mono text-[12px]">#{j.id}</Link>
                  </td>
                  <td className="px-4 py-2 text-[12px] text-brand-navy dark:text-fg-1">{j.agent_name ?? j.feature}</td>
                  <td className="px-4 py-2"><StatusPill status={j.status} /></td>
                  <td className="px-4 py-2 text-[12px] text-brand-navy-70 dark:text-fg-2">{formatDateTime(j.started_at)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-[12px] text-brand-navy-70 dark:text-fg-2">
                    {j.duration_ms != null ? `${(j.duration_ms / 1000).toFixed(1)}s` : '—'}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-[12px] text-brand-navy-70 dark:text-fg-2">
                    {fmt(j.input_tokens)} / {fmt(j.output_tokens)}
                  </td>
                  <td className="px-4 py-2 text-[12px] text-brand-navy-70 dark:text-fg-2">{j.started_by_name ?? '—'}</td>
                </tr>
              ))}
              {history.length === 0 && !loading && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-brand-navy-70 dark:text-fg-2">No jobs in the selected window.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function AiJobDetailView({ id }: { id: number }) {
  const navigate = useNavigate();
  const [job, setJob] = useState<AiJobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(id)) { navigate('/settings/ai-jobs'); return; }
    setLoading(true);
    getAiJob(id)
      .then(setJob)
      .catch(e => setError((e as Error).message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  if (loading) return <p className="text-sm text-brand-navy-70 dark:text-fg-2">Loading…</p>;
  if (error || !job) return <p className="text-sm text-status-overdue dark:text-status-d-overdue">{error ?? 'Not found'}</p>;

  return (
    <div className="space-y-5">
      <div>
        <Link to="/settings/ai-jobs" className="text-[12px] text-brand-navy-70 dark:text-fg-2 hover:text-brand-navy dark:hover:text-fg-1">← All jobs</Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-xl font-semibold text-brand-navy dark:text-fg-1 font-mono">Job #{job.id}</h1>
          <StatusPill status={job.status} />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 bg-white dark:bg-ink-1 rounded-xl shadow-sm border border-brand-navy-30/40 dark:border-ink-border-soft p-4">
        <Metric label="Agent" value={
          job.agent_id
            ? <Link to={`/settings/agents/${job.agent_id}`} className="text-brand-purple hover:underline">{job.agent_name ?? job.feature}</Link>
            : job.feature
        } />
        <Metric label="Model" value={<span className="font-mono">{job.model ?? '—'}</span>} />
        <Metric label="Input / Output tokens" value={`${fmt(job.input_tokens)} / ${fmt(job.output_tokens)}`} />
        <Metric label="Duration" value={job.duration_ms != null ? `${(job.duration_ms / 1000).toFixed(2)}s` : '—'} />
        <Metric label="Started" value={formatDateTime(job.started_at)} />
        <Metric label="Finished" value={job.finished_at ? formatDateTime(job.finished_at) : '—'} />
        <Metric label="Started by" value={job.started_by_name ?? '—'} />
        <Metric label="Opportunity" value={job.opportunity_id ?? '—'} />
        {job.killed_at && <Metric label="Killed" value={`${formatDateTime(job.killed_at)} by ${job.killed_by_name ?? 'admin'}`} />}
        {job.stop_reason && <Metric label="Stop reason" value={<span className="font-mono">{job.stop_reason}</span>} />}
        {job.pii_counts && (job.pii_counts.email + job.pii_counts.phone > 0) && (
          <Metric label="PII redacted" value={`email: ${job.pii_counts.email}, phone: ${job.pii_counts.phone}`} />
        )}
      </div>

      {job.error && (
        <section>
          <h2 className="text-sm font-semibold text-brand-navy dark:text-fg-1 mb-1">Error</h2>
          <pre className="bg-red-50 dark:bg-status-d-overdue-soft text-status-overdue dark:text-status-d-overdue text-[12px] font-mono rounded p-3 whitespace-pre-wrap">{job.error}</pre>
        </section>
      )}

      {job.prompt_text ? (
        <section>
          <h2 className="text-sm font-semibold text-brand-navy dark:text-fg-1 mb-1">Prompt</h2>
          <pre className="bg-brand-navy-30/20 dark:bg-ink-0 border border-brand-navy-30/40 dark:border-ink-border-soft rounded p-3 text-[12px] font-mono whitespace-pre-wrap text-brand-navy dark:text-fg-1">{job.prompt_text}</pre>
        </section>
      ) : (
        <section className="text-[12px] text-brand-navy-70 dark:text-fg-2 italic">
          Prompt text was not captured {job.agent_log_io ? '(stored only when log I/O was on at call time)' : "(agent's log_io is off)"}.
        </section>
      )}

      {job.response_text && (
        <section>
          <h2 className="text-sm font-semibold text-brand-navy dark:text-fg-1 mb-1">Response</h2>
          <pre className="bg-brand-navy-30/20 dark:bg-ink-0 border border-brand-navy-30/40 dark:border-ink-border-soft rounded p-3 text-[12px] font-mono whitespace-pre-wrap text-brand-navy dark:text-fg-1">{job.response_text}</pre>
        </section>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-brand-navy-70 dark:text-fg-2">{label}</div>
      <div className="mt-0.5 text-sm text-brand-navy dark:text-fg-1">{value}</div>
    </div>
  );
}
