/**
 * AI Usage dashboard — admin.
 *
 * Three rollups over a configurable window:
 *   • by agent (which features eat which tokens; where the fails live)
 *   • by user  (who invokes the most AI)
 *   • by day   (is usage trending up/down)
 */
import { useEffect, useState } from 'react';
import { getAiUsageSummary, type AiUsageSummary } from '../../api/agents';
import { Link } from 'react-router-dom';

const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString();

export default function AiUsagePage() {
  const [summary, setSummary] = useState<AiUsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sinceHours, setSinceHours] = useState<number>(168);

  useEffect(() => {
    setLoading(true);
    getAiUsageSummary(sinceHours)
      .then(setSummary)
      .catch(e => setError((e as Error).message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [sinceHours]);

  const totalCalls  = summary?.by_agent.reduce((s, a) => s + a.calls, 0) ?? 0;
  const totalIn     = summary?.by_agent.reduce((s, a) => s + a.input_tokens, 0) ?? 0;
  const totalOut    = summary?.by_agent.reduce((s, a) => s + a.output_tokens, 0) ?? 0;
  const totalFailed = summary?.by_agent.reduce((s, a) => s + a.failed, 0) ?? 0;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-brand-navy dark:text-fg-1">AI Usage</h1>
          <p className="mt-1 text-sm text-brand-navy-70 dark:text-fg-2">
            Aggregate token usage across every agent. Use this to spot cost spikes, failing agents, or heavy users.
          </p>
        </div>
        <select value={sinceHours} onChange={e => setSinceHours(Number(e.target.value))}
                className="rounded border border-brand-navy-30/60 dark:border-ink-border-soft bg-white dark:bg-ink-0 px-2 py-1.5 text-sm text-brand-navy dark:text-fg-1">
          <option value={24}>Last 24 hours</option>
          <option value={168}>Last 7 days</option>
          <option value={24 * 30}>Last 30 days</option>
        </select>
      </header>

      {loading && <p className="text-sm text-brand-navy-70 dark:text-fg-2">Loading…</p>}
      {error && <p className="text-sm text-status-overdue dark:text-status-d-overdue">{error}</p>}

      {summary && (
        <>
          <div className="grid grid-cols-4 gap-3">
            <Kpi label="Total calls"  value={fmt(totalCalls)} />
            <Kpi label="Input tokens" value={fmt(totalIn)} />
            <Kpi label="Output tokens" value={fmt(totalOut)} />
            <Kpi label="Failed" value={fmt(totalFailed)} tone={totalFailed > 0 ? 'warn' : 'ok'} />
          </div>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-brand-navy dark:text-fg-1">By agent</h2>
            <div className="bg-white dark:bg-ink-1 rounded-xl shadow-sm border border-brand-navy-30/40 dark:border-ink-border-soft overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-brand-navy-30/20 dark:bg-ink-2 text-[11px] uppercase tracking-wider text-brand-navy-70 dark:text-fg-2">
                  <tr>
                    <th className="text-left px-4 py-2">Agent</th>
                    <th className="text-right px-4 py-2">Calls</th>
                    <th className="text-right px-4 py-2">Input tokens</th>
                    <th className="text-right px-4 py-2">Output tokens</th>
                    <th className="text-right px-4 py-2">Failed</th>
                    <th className="text-right px-4 py-2">Killed</th>
                    <th className="text-right px-4 py-2">Avg duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-navy-30/30 dark:divide-ink-border-soft">
                  {summary.by_agent.map(a => (
                    <tr key={a.agent_id}>
                      <td className="px-4 py-2">
                        <Link to={`/settings/agents/${a.agent_id}`} className="text-brand-navy dark:text-fg-1 hover:text-brand-purple">{a.agent_name}</Link>
                        <span className="ml-2 font-mono text-[11px] text-brand-navy-70 dark:text-fg-2">{a.feature}</span>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmt(a.calls)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmt(a.input_tokens)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmt(a.output_tokens)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-brand-navy-70 dark:text-fg-2">{a.failed}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-brand-navy-70 dark:text-fg-2">{a.killed}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-brand-navy-70 dark:text-fg-2">
                        {a.avg_duration_ms != null ? `${(a.avg_duration_ms / 1000).toFixed(1)}s` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-brand-navy dark:text-fg-1">By user</h2>
            <div className="bg-white dark:bg-ink-1 rounded-xl shadow-sm border border-brand-navy-30/40 dark:border-ink-border-soft overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-brand-navy-30/20 dark:bg-ink-2 text-[11px] uppercase tracking-wider text-brand-navy-70 dark:text-fg-2">
                  <tr>
                    <th className="text-left px-4 py-2">User</th>
                    <th className="text-right px-4 py-2">Calls</th>
                    <th className="text-right px-4 py-2">Input tokens</th>
                    <th className="text-right px-4 py-2">Output tokens</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-navy-30/30 dark:divide-ink-border-soft">
                  {summary.by_user.map(u => (
                    <tr key={u.user_id}>
                      <td className="px-4 py-2 text-brand-navy dark:text-fg-1">{u.user_name}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmt(u.calls)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmt(u.input_tokens)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmt(u.output_tokens)}</td>
                    </tr>
                  ))}
                  {summary.by_user.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-brand-navy-70 dark:text-fg-2">No usage in window.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-brand-navy dark:text-fg-1">By day</h2>
            <div className="bg-white dark:bg-ink-1 rounded-xl shadow-sm border border-brand-navy-30/40 dark:border-ink-border-soft overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-brand-navy-30/20 dark:bg-ink-2 text-[11px] uppercase tracking-wider text-brand-navy-70 dark:text-fg-2">
                  <tr>
                    <th className="text-left px-4 py-2">Day</th>
                    <th className="text-right px-4 py-2">Calls</th>
                    <th className="text-right px-4 py-2">Input tokens</th>
                    <th className="text-right px-4 py-2">Output tokens</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-navy-30/30 dark:divide-ink-border-soft">
                  {summary.by_day.map(d => (
                    <tr key={d.day}>
                      <td className="px-4 py-2 font-mono text-[12px] text-brand-navy-70 dark:text-fg-2">{d.day}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmt(d.calls)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmt(d.input_tokens)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmt(d.output_tokens)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'ok' | 'warn' }) {
  const border = tone === 'warn' ? 'border-amber-300 dark:border-status-d-warning' : 'border-brand-navy-30/40 dark:border-ink-border-soft';
  return (
    <div className={`bg-white dark:bg-ink-1 rounded-xl shadow-sm border ${border} p-4`}>
      <div className="text-[10px] uppercase tracking-wider text-brand-navy-70 dark:text-fg-2">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-brand-navy dark:text-fg-1 tabular-nums">{value}</div>
    </div>
  );
}
