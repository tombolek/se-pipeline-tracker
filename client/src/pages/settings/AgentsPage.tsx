/**
 * Agents list — admin-only. Each row is one AI feature (see migration 052).
 * Clicking a row navigates to /settings/agents/:id for fine-tuning.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listAgents, type AgentWithUsage } from '../../api/agents';

const fmt = (n: number) => n.toLocaleString();

function Pill({ tone, children }: { tone: 'ok' | 'off' | 'warn'; children: React.ReactNode }) {
  const cls = tone === 'ok'
    ? 'bg-emerald-50 dark:bg-status-d-success-soft text-status-success dark:text-status-d-success'
    : tone === 'warn'
      ? 'bg-amber-50 dark:bg-status-d-warning-soft text-status-warning dark:text-status-d-warning'
      : 'bg-brand-navy-30/40 text-brand-navy-70 dark:bg-ink-2 dark:text-fg-2';
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${cls}`}>{children}</span>;
}

export default function AgentsPage() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<AgentWithUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAgents()
      .then(setAgents)
      .catch(e => setError((e as Error).message || 'Failed to load agents'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <header className="mb-5">
        <h1 className="text-2xl font-semibold text-brand-navy dark:text-fg-1">AI Agents</h1>
        <p className="mt-1 text-sm text-brand-navy-70 dark:text-fg-2">
          Every AI feature in the app runs as a named agent. Open an agent to fine-tune its instructions,
          inspect its job history, and toggle input/output logging.
        </p>
      </header>

      {loading && <p className="text-sm text-brand-navy-70 dark:text-fg-2">Loading…</p>}
      {error && <p className="text-sm text-status-overdue dark:text-status-d-overdue">{error}</p>}

      {!loading && !error && (
        <div className="bg-white dark:bg-ink-1 rounded-xl shadow-sm overflow-hidden border border-brand-navy-30/40 dark:border-ink-border-soft">
          <table className="w-full text-sm">
            <thead className="bg-brand-navy-30/20 dark:bg-ink-2 text-[11px] uppercase tracking-wider text-brand-navy-70 dark:text-fg-2">
              <tr>
                <th className="text-left px-4 py-2.5">Agent</th>
                <th className="text-left px-4 py-2.5">Feature key</th>
                <th className="text-left px-4 py-2.5">Model</th>
                <th className="text-right px-4 py-2.5">Max tokens</th>
                <th className="text-left px-4 py-2.5">State</th>
                <th className="text-left px-4 py-2.5">Log I/O</th>
                <th className="text-right px-4 py-2.5">Calls (24h)</th>
                <th className="text-right px-4 py-2.5">Tokens (24h)</th>
                <th className="text-right px-4 py-2.5">Failed / running</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-navy-30/30 dark:divide-ink-border-soft">
              {agents.map(a => (
                <tr
                  key={a.id}
                  className="hover:bg-brand-navy-30/10 dark:hover:bg-ink-2 cursor-pointer"
                  onClick={() => navigate(`/settings/agents/${a.id}`)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-brand-navy dark:text-fg-1">{a.name}</div>
                    <div className="text-[12px] text-brand-navy-70 dark:text-fg-2 truncate max-w-md">{a.description}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px] text-brand-navy-70 dark:text-fg-2">{a.feature}</td>
                  <td className="px-4 py-3 text-brand-navy-70 dark:text-fg-2">{a.default_model}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-brand-navy-70 dark:text-fg-2">{a.default_max_tokens}</td>
                  <td className="px-4 py-3">
                    {a.is_enabled ? <Pill tone="ok">Enabled</Pill> : <Pill tone="off">Disabled</Pill>}
                  </td>
                  <td className="px-4 py-3">
                    {a.log_io ? <Pill tone="warn">On</Pill> : <Pill tone="off">Off</Pill>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(a.usage_24h.total_calls)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {fmt(a.usage_24h.input_tokens + a.usage_24h.output_tokens)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-brand-navy-70 dark:text-fg-2">
                    {a.usage_24h.failed_calls} / {a.usage_24h.running_calls}
                  </td>
                </tr>
              ))}
              {agents.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-6 text-center text-brand-navy-70 dark:text-fg-2">No agents registered.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
