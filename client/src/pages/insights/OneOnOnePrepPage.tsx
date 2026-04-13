/**
 * 1:1 Prep View (Issue #69)
 *
 * Manager-only one-page brief for preparing a 1:1 with a specific SE.
 * Aggregates: SE's open opps + health, tasks (overdue / due soon),
 * recent stage movements, deals missing SE notes, deals with no next step,
 * and an AI-generated coaching narrative.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { listUsers } from '../../api/users';
import { getOneOnOneData, generateOneOnOneNarrative } from '../../api/oneOnOnePrep';
import type { OneOnOneData, OneOnOneTask, OneOnOneStageMovement } from '../../api/oneOnOnePrep';
import type { User, Opportunity } from '../../types';
import { computeHealthScore } from '../../utils/healthScore';
import HealthScoreBadge from '../../components/shared/HealthScoreBadge';
import StageBadge from '../../components/shared/StageBadge';
import { formatARR, formatDate } from '../../utils/formatters';
import { Loading } from './shared';

// ── Helpers ────────────────────────────────────────────────────────────────

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function CommentsFreshness({ iso }: { iso: string | null }) {
  const d = daysSince(iso);
  if (d === null) return <span className="text-status-overdue text-xs font-medium">Never</span>;
  if (d > 21)    return <span className="text-status-overdue text-xs font-medium">{d}d ago</span>;
  if (d > 7)     return <span className="text-status-warning text-xs font-medium">{d}d ago</span>;
  return <span className="text-status-success text-xs font-medium">{d}d ago</span>;
}

function Section({ title, subtitle, count, children }: {
  title: string; subtitle?: string; count?: number; children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-xl border border-brand-navy-30 shadow-sm p-5 mb-4">
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="text-base font-semibold text-brand-navy">{title}</h2>
        {typeof count === 'number' && (
          <span className="text-xs text-brand-navy-70">({count})</span>
        )}
        {subtitle && <span className="text-xs text-brand-navy-70 ml-2">{subtitle}</span>}
      </div>
      {children}
    </section>
  );
}

function StatCard({ label, value, tone }: {
  label: string; value: string; tone?: 'warn' | 'danger' | 'success';
}) {
  const color =
    tone === 'danger' ? 'text-status-overdue' :
    tone === 'warn' ? 'text-status-warning' :
    tone === 'success' ? 'text-status-success' :
    'text-brand-navy';
  return (
    <div className="bg-[#F5F5F7] rounded-xl p-3 text-center">
      <p className={`text-xl font-semibold ${color}`}>{value}</p>
      <p className="text-[10px] text-brand-navy-70 uppercase tracking-wide mt-0.5">{label}</p>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function OneOnOnePrepPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSeId = searchParams.get('se') ? parseInt(searchParams.get('se') as string) : null;

  const [ses, setSes] = useState<User[]>([]);
  const [seId, setSeId] = useState<number | null>(initialSeId);
  const [data, setData] = useState<OneOnOneData | null>(null);
  const [loading, setLoading] = useState(false);
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  const [narrativeError, setNarrativeError] = useState<string | null>(null);

  // Load SEs list once
  useEffect(() => {
    listUsers().then(users => {
      const active = users.filter(u => u.is_active && u.role === 'se');
      setSes(active);
      // Auto-pick first SE if none selected
      if (!initialSeId && active.length > 0) {
        setSeId(active[0].id);
      }
    });
  }, [initialSeId]);

  // Load prep data whenever SE changes
  useEffect(() => {
    if (!seId) { setData(null); return; }
    setLoading(true);
    setData(null);
    getOneOnOneData(seId)
      .then(setData)
      .finally(() => setLoading(false));
  }, [seId]);

  const handleSelectSe = useCallback((id: number) => {
    setSeId(id);
    setSearchParams({ se: String(id) }, { replace: true });
  }, [setSearchParams]);

  const handleGenerateNarrative = useCallback(async () => {
    if (!seId) return;
    setNarrativeLoading(true);
    setNarrativeError(null);
    try {
      const narrative = await generateOneOnOneNarrative(seId);
      setData(prev => prev ? { ...prev, narrative } : prev);
    } catch {
      setNarrativeError('Failed to generate narrative. Try again.');
    } finally {
      setNarrativeLoading(false);
    }
  }, [seId]);

  // Derived slices
  const opps = data?.opportunities ?? [];
  const tasks = data?.tasks ?? [];
  const stageMovements = data?.stage_movements ?? [];

  const overdueTasks = useMemo(() => tasks.filter(t => t.bucket === 'overdue'), [tasks]);
  const dueSoonTasks = useMemo(() => tasks.filter(t => t.bucket === 'due_soon'), [tasks]);

  const staleOpps = useMemo(() =>
    opps.filter(o => {
      const d = daysSince(o.se_comments_updated_at);
      return d === null || d > 21;
    }).sort((a, b) => {
      const aD = daysSince(a.se_comments_updated_at) ?? 9999;
      const bD = daysSince(b.se_comments_updated_at) ?? 9999;
      return bD - aD;
    }),
    [opps]
  );

  const noNextStepOpps = useMemo(() =>
    opps.filter(o => !o.next_step_sf && (o.next_step_count ?? 0) === 0),
    [opps]
  );

  const summary = useMemo(() => {
    const totalArr = opps.reduce((s, o) => s + (typeof o.arr === 'string' ? parseFloat(o.arr) : o.arr ?? 0), 0);
    const overdueCount = overdueTasks.length;
    const scores = opps.map(o => computeHealthScore(o));
    const red = scores.filter(s => s.rag === 'red').length;
    const amber = scores.filter(s => s.rag === 'amber').length;
    const green = scores.filter(s => s.rag === 'green').length;
    return {
      oppCount: opps.length,
      totalArr,
      overdueCount,
      staleCount: staleOpps.length,
      noNextStep: noNextStepOpps.length,
      red, amber, green,
    };
  }, [opps, overdueTasks, staleOpps, noNextStepOpps]);

  const selectedSe = ses.find(s => s.id === seId);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-brand-navy">1:1 Prep</h1>
          <p className="text-sm text-brand-navy-70 mt-0.5">
            One-page brief for your next 1:1. Pick an SE to see their pipeline, task load, risks and a coaching narrative.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-brand-navy-70">SE</label>
          <select
            value={seId ?? ''}
            onChange={e => handleSelectSe(parseInt(e.target.value))}
            className="px-3 py-1.5 rounded-lg border border-brand-navy-30 text-sm text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-purple bg-white"
          >
            <option value="" disabled>Select an SE…</option>
            {ses.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      {!seId && (
        <div className="bg-white rounded-xl border border-brand-navy-30 p-8 text-center text-brand-navy-70">
          Pick an SE above to load their 1:1 prep brief.
        </div>
      )}

      {loading && <Loading />}

      {data && !loading && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-5">
            <StatCard label="Open Opps" value={String(summary.oppCount)} />
            <StatCard label="Total ARR" value={formatARR(summary.totalArr)} />
            <StatCard label="Red" value={String(summary.red)} tone={summary.red > 0 ? 'danger' : undefined} />
            <StatCard label="Amber" value={String(summary.amber)} tone={summary.amber > 0 ? 'warn' : undefined} />
            <StatCard label="Green" value={String(summary.green)} tone="success" />
            <StatCard label="Overdue tasks" value={String(summary.overdueCount)} tone={summary.overdueCount > 0 ? 'danger' : undefined} />
            <StatCard label="Stale comments" value={String(summary.staleCount)} tone={summary.staleCount > 0 ? 'warn' : undefined} />
          </div>

          {/* AI narrative */}
          <Section
            title="AI Coaching Brief"
            subtitle={data.narrative ? `Generated ${formatDate(data.narrative.generated_at)}` : 'Not generated yet'}
          >
            {data.narrative ? (
              <div className="text-sm text-brand-navy whitespace-pre-wrap leading-relaxed">
                {data.narrative.content}
              </div>
            ) : (
              <p className="text-sm text-brand-navy-70 mb-3">
                Generate a Claude-powered brief covering wins, coaching focus, risks to flag, and a suggested agenda for your 1:1 with {selectedSe?.name ?? 'this SE'}.
              </p>
            )}
            <div className="flex items-center gap-3 mt-3">
              <button
                onClick={handleGenerateNarrative}
                disabled={narrativeLoading}
                className="px-3 py-1.5 rounded-lg bg-brand-purple text-white text-xs font-medium hover:bg-brand-purple-70 disabled:opacity-50"
              >
                {narrativeLoading ? 'Generating…' : data.narrative ? 'Regenerate' : 'Generate coaching brief'}
              </button>
              {data.narrative && (
                <button
                  onClick={() => navigator.clipboard.writeText(data.narrative!.content)}
                  className="px-3 py-1.5 rounded-lg border border-brand-navy-30 text-brand-navy text-xs font-medium hover:border-brand-navy"
                >
                  Copy
                </button>
              )}
              {narrativeError && (
                <span className="text-xs text-status-overdue">{narrativeError}</span>
              )}
            </div>
          </Section>

          {/* Overdue tasks */}
          {overdueTasks.length > 0 && (
            <Section title="Overdue tasks" count={overdueTasks.length}>
              <TaskList tasks={overdueTasks} tone="danger" />
            </Section>
          )}

          {/* Due soon tasks */}
          {dueSoonTasks.length > 0 && (
            <Section title="Due this week" count={dueSoonTasks.length}>
              <TaskList tasks={dueSoonTasks} tone="warn" />
            </Section>
          )}

          {/* Stale comments */}
          {staleOpps.length > 0 && (
            <Section
              title="Deals missing SE notes"
              subtitle="(SE comments older than 21 days or never updated)"
              count={staleOpps.length}
            >
              <OppTable opps={staleOpps} showComments />
            </Section>
          )}

          {/* No next step */}
          {noNextStepOpps.length > 0 && (
            <Section
              title="Deals with no next step"
              subtitle="(no SF next step + no open 'next step' task)"
              count={noNextStepOpps.length}
            >
              <OppTable opps={noNextStepOpps} />
            </Section>
          )}

          {/* Stage movements */}
          {stageMovements.length > 0 && (
            <Section
              title="Recent stage movements"
              subtitle="(last 14 days)"
              count={stageMovements.length}
            >
              <StageMovementList moves={stageMovements} />
            </Section>
          )}

          {/* All open opps */}
          <Section title="All open opportunities" count={opps.length}>
            <OppTable opps={opps} />
          </Section>
        </>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function TaskList({ tasks, tone }: { tasks: OneOnOneTask[]; tone: 'danger' | 'warn' }) {
  const dueClass = tone === 'danger' ? 'text-status-overdue' : 'text-status-warning';
  return (
    <ul className="divide-y divide-brand-navy-30/50">
      {tasks.map(t => (
        <li key={t.id} className="py-2 flex items-start gap-3 text-sm">
          <div className={`text-xs font-medium w-20 flex-shrink-0 ${dueClass}`}>
            {t.due_date ? formatDate(t.due_date) : 'No due date'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-brand-navy font-medium">{t.title}</div>
            <Link
              to={`/pipeline?opp=${t.opportunity_id}`}
              className="text-xs text-brand-navy-70 hover:text-brand-purple"
            >
              {t.opportunity_name}
              {t.account_name && <> · {t.account_name}</>}
            </Link>
          </div>
          <StageBadge stage={t.stage} />
        </li>
      ))}
    </ul>
  );
}

function OppTable({ opps, showComments }: { opps: Opportunity[]; showComments?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-brand-navy-70 border-b border-brand-navy-30">
            <th className="py-2 pr-3 font-medium">Health</th>
            <th className="py-2 pr-3 font-medium">Deal</th>
            <th className="py-2 pr-3 font-medium">Account</th>
            <th className="py-2 pr-3 font-medium">Stage</th>
            <th className="py-2 pr-3 font-medium text-right">ARR</th>
            <th className="py-2 pr-3 font-medium">Close</th>
            {showComments && <th className="py-2 pr-3 font-medium">SE comments</th>}
            <th className="py-2 pr-3 font-medium">Next step</th>
          </tr>
        </thead>
        <tbody>
          {opps.map(o => (
            <tr key={o.id} className="border-b border-brand-navy-30/50 last:border-0 hover:bg-brand-purple-30/20">
              <td className="py-2 pr-3">
                <HealthScoreBadge opp={o} />
              </td>
              <td className="py-2 pr-3">
                <Link to={`/pipeline?opp=${o.id}`} className="text-brand-navy hover:text-brand-purple font-medium">
                  {o.name}
                </Link>
              </td>
              <td className="py-2 pr-3 text-brand-navy-70">{o.account_name ?? '—'}</td>
              <td className="py-2 pr-3"><StageBadge stage={o.stage} /></td>
              <td className="py-2 pr-3 text-right text-brand-navy">{formatARR(o.arr)}</td>
              <td className="py-2 pr-3 text-brand-navy-70">{formatDate(o.close_date)}</td>
              {showComments && (
                <td className="py-2 pr-3"><CommentsFreshness iso={o.se_comments_updated_at} /></td>
              )}
              <td className="py-2 pr-3 text-brand-navy-70 max-w-xs truncate" title={o.next_step_sf ?? ''}>
                {o.next_step_sf || <span className="text-status-overdue">— none —</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StageMovementList({ moves }: { moves: OneOnOneStageMovement[] }) {
  return (
    <ul className="divide-y divide-brand-navy-30/50">
      {moves.map((m, i) => (
        <li key={`${m.id}-${m.current_stage}-${i}`} className="py-2 flex items-center gap-3 text-sm">
          <div className="text-xs text-brand-navy-70 w-20 flex-shrink-0">{formatDate(m.stage_changed_at)}</div>
          <Link to={`/pipeline?opp=${m.id}`} className="flex-1 text-brand-navy hover:text-brand-purple font-medium truncate">
            {m.name}
          </Link>
          <div className="flex items-center gap-1.5 text-xs">
            {m.previous_stage && (
              <>
                <StageBadge stage={m.previous_stage} />
                <span className="text-brand-navy-70">→</span>
              </>
            )}
            <StageBadge stage={m.current_stage} />
          </div>
          <div className="text-xs text-brand-navy w-20 text-right">{formatARR(m.arr)}</div>
        </li>
      ))}
    </ul>
  );
}
