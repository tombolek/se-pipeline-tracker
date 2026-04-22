/**
 * 1:1 Prep View (Issue #69)
 *
 * Manager-only one-page brief for preparing a 1:1 with a specific SE.
 * Aggregates: SE's open opps + health, tasks (overdue / due soon),
 * recent stage movements, deals missing SE notes, deals with no next step,
 * and an AI-generated coaching narrative.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { listUsers } from '../../api/users';
import { getOneOnOneData, generateOneOnOneNarrative } from '../../api/oneOnOnePrep';
import { useAiJobAttach } from '../../hooks/useAiJob';
import type { OneOnOneData, OneOnOneTask, OneOnOneStageMovement } from '../../api/oneOnOnePrep';
import type { User, Opportunity } from '../../types';
import { computeHealthScore } from '../../utils/healthScore';
import HealthScoreBadge from '../../components/shared/HealthScoreBadge';
import StageBadge from '../../components/shared/StageBadge';
import { formatARR, formatDate } from '../../utils/formatters';
import { Loading } from './shared';
import { computeHygieneFlags } from '../../utils/hygieneFlags';
import { useOppUrlSync } from '../../hooks/useOppUrlSync';
import Drawer from '../../components/Drawer';
import OpportunityDetail from '../../components/OpportunityDetail';
import { useNavigate } from 'react-router-dom';
import { TextWithCitations, makeCrossOppJumper } from '../../components/Citation';
import type { ResolvedCitation } from '../../types/citations';

// Pipeline stage order, latest → earliest. Used to sort opps and tasks so the
// most progressed deals surface at the top of every section.
const STAGE_RANK: Record<string, number> = {
  'Negotiate':             0,
  'Submitted for Booking': 1,
  'Proposal Sent':         2,
  'Build Value':           3,
  'Develop Solution':      4,
  'Qualify':               5,
};
function stageRank(s: string | null | undefined): number {
  return s != null && STAGE_RANK[s] !== undefined ? STAGE_RANK[s] : 99;
}
function byStageDesc<T extends { stage?: string | null }>(a: T, b: T): number {
  return stageRank(a.stage) - stageRank(b.stage);
}

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

function StatCard({ label, value, tone, icon }: {
  label: string; value: string; tone?: 'warn' | 'danger' | 'success'; icon?: React.ReactNode;
}) {
  const color =
    tone === 'danger' ? 'text-status-overdue' :
    tone === 'warn' ? 'text-status-warning' :
    tone === 'success' ? 'text-status-success' :
    'text-brand-navy';
  const iconBg =
    tone === 'danger' ? 'bg-status-overdue/10' :
    tone === 'warn' ? 'bg-status-warning/10' :
    tone === 'success' ? 'bg-status-success/10' :
    'bg-brand-purple/10';
  return (
    <div className="bg-white rounded-2xl border border-brand-navy-30/40 p-4 flex items-center gap-3">
      {icon && <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0`}>{icon}</div>}
      <div>
        <p className={`text-2xl font-semibold ${value === '0' || value === '$0' ? 'text-brand-navy-30' : color}`}>{value}</p>
        <p className="text-[10px] text-brand-navy-70 uppercase tracking-wide">{label}</p>
      </div>
    </div>
  );
}

// Render inline **bold** markers within a line.
function renderInline(text: string, citations?: ResolvedCitation[], onJump?: (c: ResolvedCitation) => void): React.ReactNode {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1
      ? <strong key={i} className="font-semibold text-brand-navy"><TextWithCitations text={part} citations={citations} onJump={onJump} /></strong>
      : <TextWithCitations key={i} text={part} citations={citations} onJump={onJump} />
  );
}

// Render the AI coaching brief's lightweight markdown: ## headings, **bold**,
// blank-line paragraphs, and leading "1." / "-" list markers.
function renderBrief(content: string, citations?: ResolvedCitation[], onJump?: (c: ResolvedCitation) => void): React.ReactNode {
  const blocks = content.trim().split(/\n{2,}/);
  return blocks.map((block, bi) => {
    const lines = block.split('\n');

    // ## Heading
    if (lines[0].startsWith('## ')) {
      const heading = lines[0].replace(/^##\s+/, '');
      const rest = lines.slice(1).join('\n');
      return (
        <div key={bi} className={bi > 0 ? 'mt-4' : ''}>
          <h3 className="text-base font-semibold text-brand-navy mb-1">{renderInline(heading, citations, onJump)}</h3>
          {rest && <p className="text-sm text-brand-navy leading-relaxed">{renderInline(rest, citations, onJump)}</p>}
        </div>
      );
    }

    // Section label pattern: first line is entirely **Bold** → treat as mini-heading.
    const labelMatch = lines[0].match(/^\*\*(.+?)\*\*$/);
    if (labelMatch) {
      const body = lines.slice(1);
      return (
        <div key={bi} className={bi > 0 ? 'mt-3' : ''}>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-purple mb-1">{labelMatch[1]}</p>
          {body.map((ln, i) => {
            const numbered = ln.match(/^(\d+)\.\s+(.*)$/);
            if (numbered) {
              return (
                <p key={i} className="text-sm text-brand-navy leading-relaxed ml-4 -indent-4 mb-0.5">
                  <span className="text-brand-navy-70">{numbered[1]}.</span> {renderInline(numbered[2], citations, onJump)}
                </p>
              );
            }
            if (ln.startsWith('- ')) {
              return (
                <p key={i} className="text-sm text-brand-navy leading-relaxed ml-4 -indent-4 mb-0.5">
                  <span className="text-brand-navy-70">•</span> {renderInline(ln.slice(2), citations, onJump)}
                </p>
              );
            }
            return (
              <p key={i} className="text-sm text-brand-navy leading-relaxed">{renderInline(ln, citations, onJump)}</p>
            );
          })}
        </div>
      );
    }

    // Plain paragraph.
    return (
      <p key={bi} className={`text-sm text-brand-navy leading-relaxed ${bi > 0 ? 'mt-2' : ''}`}>
        {lines.map((ln, i) => (
          <span key={i}>
            {renderInline(ln, citations, onJump)}
            {i < lines.length - 1 && <br />}
          </span>
        ))}
      </p>
    );
  });
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
  const [selectedOppId, setSelectedOppId] = useState<number | null>(null);
  // AI Coaching Brief collapsed by default (mirrors AI Summary / MEDDPICC Coach UX).
  const [narrativeCollapsed, setNarrativeCollapsed] = useState(true);

  const handleOpenOpp = useCallback((id: number) => setSelectedOppId(id), []);
  const handleCloseDrawer = useCallback(() => setSelectedOppId(null), []);
  // Citation click → navigate to the deal's drawer via /home?oppId=<sfid>. #135.
  const navigateToRoute = useNavigate();
  const citeJumper = useMemo(() => makeCrossOppJumper(navigateToRoute), [navigateToRoute]);

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

  // Re-attach to in-flight 1:1 narrative generation if user navigates back mid-run.
  useAiJobAttach({
    key: seId ? `one-on-one-narrative-${seId}` : '',
    enabled: !!seId,
    currentGeneratedAt: data?.narrative?.generated_at ?? null,
    fetchCached: async () => {
      if (!seId) return { generatedAt: null };
      const fresh = await getOneOnOneData(seId);
      return { generatedAt: fresh.narrative?.generated_at ?? null };
    },
    onRunning: () => setNarrativeLoading(true),
    onFresh: async () => {
      if (!seId) return;
      const fresh = await getOneOnOneData(seId);
      setData(prev => prev ? { ...prev, narrative: fresh.narrative } : fresh);
      setNarrativeLoading(false);
    },
    onTimeout: () => setNarrativeLoading(false),
  });

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

  // Derived slices — all sorted latest stage → earliest stage so the most
  // progressed deals surface at the top, earlier-stage deals sink to the bottom.
  const rawOpps = data?.opportunities ?? [];
  const tasks = data?.tasks ?? [];
  const rawStageMovements = data?.stage_movements ?? [];

  const opps = useMemo(() => [...rawOpps].sort(byStageDesc), [rawOpps]);

  useOppUrlSync(selectedOppId, setSelectedOppId, opps);

  const overdueTasks = useMemo(
    () => tasks.filter(t => t.bucket === 'overdue').sort(byStageDesc),
    [tasks]
  );
  const dueSoonTasks = useMemo(
    () => tasks.filter(t => t.bucket === 'due_soon').sort(byStageDesc),
    [tasks]
  );

  const staleOpps = useMemo(
    () => opps.filter(o => {
      const d = daysSince(o.se_comments_updated_at);
      return d === null || d > 21;
    }),
    [opps]
  );

  const noNextStepOpps = useMemo(
    () => opps.filter(o => !o.next_step_sf && (o.next_step_count ?? 0) === 0),
    [opps]
  );

  const hygieneOpps = useMemo(() => {
    const result: { opp: typeof opps[0]; flags: string[] }[] = [];
    for (const o of opps) {
      const flags = computeHygieneFlags(o);
      if (flags.length > 0) result.push({ opp: o, flags });
    }
    return result;
  }, [opps]);

  const stageMovements = useMemo(
    () => [...rawStageMovements].sort(
      (a, b) => stageRank(a.current_stage) - stageRank(b.current_stage)
    ),
    [rawStageMovements]
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
      hygieneCount: hygieneOpps.length,
      red, amber, green,
    };
  }, [opps, overdueTasks, staleOpps, noNextStepOpps, hygieneOpps]);

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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
            <StatCard label="Open Opps" value={String(summary.oppCount)}
              icon={<svg className="w-5 h-5 text-brand-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>} />
            <StatCard label="Total ARR" value={formatARR(summary.totalArr)}
              icon={<svg className="w-5 h-5 text-brand-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>} />
            <StatCard label="Overdue Tasks" value={String(summary.overdueCount)} tone={summary.overdueCount > 0 ? 'danger' : undefined}
              icon={<svg className={`w-5 h-5 ${summary.overdueCount > 0 ? 'text-status-overdue' : 'text-brand-purple'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>} />
            <StatCard label="Hygiene Issues" value={String(summary.hygieneCount)} tone={summary.hygieneCount > 0 ? 'warn' : undefined}
              icon={<svg className={`w-5 h-5 ${summary.hygieneCount > 0 ? 'text-status-warning' : 'text-brand-purple'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>} />
          </div>
          {/* Health + comments row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-5">
            <StatCard label="Red" value={String(summary.red)} tone={summary.red > 0 ? 'danger' : undefined}
              icon={<svg className={`w-5 h-5 ${summary.red > 0 ? 'text-status-overdue' : 'text-brand-navy-30'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9.303 3.376c.866 1.5-.217 3.374-1.948 3.374H4.645c-1.73 0-2.813-1.874-1.948-3.374L10.051 3.378c.866-1.5 3.032-1.5 3.898 0l8.354 12.748z"/></svg>} />
            <StatCard label="Amber" value={String(summary.amber)} tone={summary.amber > 0 ? 'warn' : undefined}
              icon={<svg className={`w-5 h-5 ${summary.amber > 0 ? 'text-status-warning' : 'text-brand-navy-30'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9.303 3.376c.866 1.5-.217 3.374-1.948 3.374H4.645c-1.73 0-2.813-1.874-1.948-3.374L10.051 3.378c.866-1.5 3.032-1.5 3.898 0l8.354 12.748z"/></svg>} />
            <StatCard label="Green" value={String(summary.green)} tone="success"
              icon={<svg className="w-5 h-5 text-status-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>} />
            <StatCard label="Stale Comments" value={String(summary.staleCount)} tone={summary.staleCount > 0 ? 'warn' : undefined}
              icon={<svg className={`w-5 h-5 ${summary.staleCount > 0 ? 'text-status-warning' : 'text-brand-navy-30'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>} />
            <StatCard label="No Next Step" value={String(summary.noNextStep)} tone={summary.noNextStep > 0 ? 'warn' : undefined}
              icon={<svg className={`w-5 h-5 ${summary.noNextStep > 0 ? 'text-status-warning' : 'text-brand-navy-30'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>} />
          </div>

          {/* AI Coaching Brief — collapsible, collapsed by default, with freshness indicator */}
          <div className="mb-4 bg-brand-purple-30 border border-brand-purple/20 rounded-xl overflow-hidden">
            {/* Header — always visible, clickable to collapse */}
            <button
              onClick={() => setNarrativeCollapsed(c => !c)}
              className="w-full flex items-center gap-1.5 px-4 py-2.5 text-left"
            >
              <svg className="w-3.5 h-3.5 text-brand-purple flex-shrink-0" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="#6A2CF5"/>
              </svg>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-brand-purple">AI Coaching Brief</span>
              {data.narrative ? (() => {
                const days = Math.floor((Date.now() - new Date(data.narrative.generated_at).getTime()) / 86400000);
                const color = days <= 3 ? 'text-status-success' : days <= 14 ? 'text-status-warning' : 'text-status-overdue';
                return (
                  <span className={`text-[10px] font-medium ${color} ml-1`}>
                    {days === 0 ? 'today' : `${days}d ago`}
                  </span>
                );
              })() : (
                <span className="text-[10px] font-medium text-brand-navy-70 ml-1">Not generated yet</span>
              )}
              <div className="ml-auto flex items-center gap-1">
                <svg className={`w-3 h-3 text-brand-navy-70 transition-transform ${narrativeCollapsed ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>
            {/* Body — collapsible */}
            {!narrativeCollapsed && (
              <div className="px-4 pb-3 text-sm text-brand-navy leading-relaxed">
                {data.narrative ? (
                  <div>{renderBrief(data.narrative.content, data.narrative.citations, citeJumper)}</div>
                ) : (
                  <p className="text-sm text-brand-navy-70 mb-1">
                    Generate a Claude-powered brief covering wins, coaching focus, risks to flag, and a suggested agenda for your 1:1 with {selectedSe?.name ?? 'this SE'}.
                  </p>
                )}
                <div className="flex items-center gap-3 mt-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleGenerateNarrative(); }}
                    disabled={narrativeLoading}
                    className="text-[10px] font-medium text-brand-purple hover:text-brand-purple-70 transition-colors disabled:opacity-50"
                  >
                    {narrativeLoading ? 'Regenerating…' : data.narrative ? 'Regenerate' : 'Generate coaching brief'}
                  </button>
                  {data.narrative && (
                    <button
                      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(data.narrative!.content); }}
                      className="text-[10px] font-medium text-brand-navy-70 hover:text-brand-navy transition-colors"
                    >
                      Copy
                    </button>
                  )}
                  {narrativeError && (
                    <span className="text-[10px] text-status-overdue">{narrativeError}</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Overdue tasks */}
          {overdueTasks.length > 0 && (
            <Section title="Overdue tasks" count={overdueTasks.length}>
              <TaskList tasks={overdueTasks} tone="danger" onOpenOpp={handleOpenOpp} />
            </Section>
          )}

          {/* Due soon tasks */}
          {dueSoonTasks.length > 0 && (
            <Section title="Due this week" count={dueSoonTasks.length}>
              <TaskList tasks={dueSoonTasks} tone="warn" onOpenOpp={handleOpenOpp} />
            </Section>
          )}

          {/* Stale comments */}
          {staleOpps.length > 0 && (
            <Section
              title="Deals missing SE notes"
              subtitle="(SE comments older than 21 days or never updated)"
              count={staleOpps.length}
            >
              <OppTable opps={staleOpps} showComments onOpenOpp={handleOpenOpp} />
            </Section>
          )}

          {/* No next step */}
          {noNextStepOpps.length > 0 && (
            <Section
              title="Deals with no next step"
              subtitle="(no SF next step + no open 'next step' task)"
              count={noNextStepOpps.length}
            >
              <OppTable opps={noNextStepOpps} onOpenOpp={handleOpenOpp} />
            </Section>
          )}

          {/* Data Hygiene — Needs Attention */}
          {hygieneOpps.length > 0 && (
            <Section
              title="Data Hygiene — Needs Attention"
              subtitle="(SE-responsibility issues)"
              count={hygieneOpps.length}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-brand-navy-70 uppercase tracking-wide border-b border-brand-navy-30/50">
                      <th className="text-left py-2 pr-3 font-medium">Deal</th>
                      <th className="text-left py-2 pr-3 font-medium">Stage</th>
                      <th className="text-right py-2 pr-3 font-medium">ARR</th>
                      <th className="text-left py-2 font-medium">Issues</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-navy-30/30">
                    {hygieneOpps.map(({ opp, flags }) => (
                      <tr
                        key={opp.id}
                        className="hover:bg-brand-purple-30/20 cursor-pointer transition-colors"
                        onClick={() => handleOpenOpp(opp.id)}
                      >
                        <td className="py-2.5 pr-3">
                          <p className="font-medium text-brand-navy">{opp.name}</p>
                          {opp.account_name && <p className="text-xs text-brand-navy-70">{opp.account_name}</p>}
                        </td>
                        <td className="py-2.5 pr-3 text-brand-navy-70 whitespace-nowrap">
                          <StageBadge stage={opp.stage} />
                        </td>
                        <td className="py-2.5 pr-3 text-right text-brand-navy-70 whitespace-nowrap">
                          {opp.arr != null ? formatARR(typeof opp.arr === 'string' ? parseFloat(opp.arr) : opp.arr) : '—'}
                        </td>
                        <td className="py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {flags.map((f, i) => (
                              <span key={i} className={`inline-flex text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                                f.includes('overdue') || f.includes('should be')
                                  ? 'text-status-overdue bg-status-overdue/10'
                                  : f.includes('Missing')
                                  ? 'text-brand-purple bg-brand-purple-30/50'
                                  : 'text-status-warning bg-status-warning/10'
                              }`}>{f}</span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* Stage movements */}
          {stageMovements.length > 0 && (
            <Section
              title="Recent stage movements"
              subtitle="(last 14 days)"
              count={stageMovements.length}
            >
              <StageMovementList moves={stageMovements} onOpenOpp={handleOpenOpp} />
            </Section>
          )}

          {/* All open opps */}
          <Section title="All open opportunities" count={opps.length}>
            <OppTable opps={opps} onOpenOpp={handleOpenOpp} />
          </Section>
        </>
      )}

      {/* Opportunity drawer */}
      <Drawer open={selectedOppId !== null} onClose={handleCloseDrawer}>
        {selectedOppId !== null && (
          <OpportunityDetail key={selectedOppId} oppId={selectedOppId} />
        )}
      </Drawer>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function TaskList({ tasks, tone, onOpenOpp }: {
  tasks: OneOnOneTask[]; tone: 'danger' | 'warn'; onOpenOpp: (id: number) => void;
}) {
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
            <button
              type="button"
              onClick={() => onOpenOpp(t.opportunity_id)}
              className="text-xs text-brand-navy-70 hover:text-brand-purple text-left"
            >
              {t.opportunity_name}
              {t.account_name && <> · {t.account_name}</>}
            </button>
          </div>
          <StageBadge stage={t.stage} />
        </li>
      ))}
    </ul>
  );
}

function OppTable({ opps, showComments, onOpenOpp }: {
  opps: Opportunity[]; showComments?: boolean; onOpenOpp: (id: number) => void;
}) {
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
                <button
                  type="button"
                  onClick={() => onOpenOpp(o.id)}
                  className="text-brand-navy hover:text-brand-purple font-medium text-left"
                >
                  {o.name}
                </button>
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

function StageMovementList({ moves, onOpenOpp }: {
  moves: OneOnOneStageMovement[]; onOpenOpp: (id: number) => void;
}) {
  return (
    <ul className="divide-y divide-brand-navy-30/50">
      {moves.map((m, i) => (
        <li key={`${m.id}-${m.current_stage}-${i}`} className="py-2 flex items-center gap-3 text-sm">
          <div className="text-xs text-brand-navy-70 w-20 flex-shrink-0">{formatDate(m.stage_changed_at)}</div>
          <button
            type="button"
            onClick={() => onOpenOpp(m.id)}
            className="flex-1 text-brand-navy hover:text-brand-purple font-medium truncate text-left"
          >
            {m.name}
          </button>
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
