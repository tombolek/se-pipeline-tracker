import React, { useState, useRef } from 'react';
import type { ForecastOpp } from '../../api/forecastingBrief';

// ── Bold text renderer ─────────────────────────────────────────────────────
export function renderBold(text: string): React.ReactNode {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1
      ? <strong key={i} className="text-brand-navy dark:text-fg-1 font-semibold">{part}</strong>
      : part
  );
}

// ── Initials helper ────────────────────────────────────────────────────────
export function initials(name: string | null | undefined): string {
  if (!name) return '—';
  return name.split(/\s+/).map(w => w[0]?.toUpperCase() || '').join('');
}

// ── Hover Tooltip (positioned, portal-free) ────────────────────────────────
export function HoverTooltip({ children, content, width = 260 }: {
  children: React.ReactNode;
  content: React.ReactNode;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const handleEnter = () => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + 6,
      left: Math.max(8, rect.left + rect.width / 2 - width / 2),
    });
    setShow(true);
  };

  return (
    <div
      ref={ref}
      className="relative inline-flex"
      onMouseEnter={handleEnter}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && pos && (
        <div
          className="fixed z-[9999] bg-white dark:bg-ink-1 rounded-lg shadow-xl border border-brand-navy-30/30 dark:border-ink-border-soft p-3 text-[11px] text-brand-navy dark:text-fg-1 leading-relaxed"
          style={{ top: pos.top, left: pos.left, width }}
        >
          {content}
        </div>
      )}
    </div>
  );
}

// ── MEDDPICC helpers ────────────────────────────────────────────────────────
export const MEDDPICC_FIELDS = [
  { key: 'metrics', label: 'Metrics' },
  { key: 'economic_buyer', label: 'Econ Buyer' },
  { key: 'decision_criteria', label: 'Decision Crit' },
  { key: 'decision_process', label: 'Decision Proc' },
  { key: 'paper_process', label: 'Paper Process' },
  { key: 'implicate_pain', label: 'Pain' },
  { key: 'champion', label: 'Champion' },
  { key: 'authority', label: 'Authority' },
  { key: 'need', label: 'Need' },
] as const;

export function meddpiccScore(opp: ForecastOpp): number {
  return MEDDPICC_FIELDS.filter(f => {
    const v = opp[f.key as keyof ForecastOpp];
    return v && String(v).trim().length > 0;
  }).length;
}

export function meddpiccFilled(opp: ForecastOpp): Set<string> {
  const s = new Set<string>();
  for (const f of MEDDPICC_FIELDS) {
    const v = opp[f.key as keyof ForecastOpp];
    if (v && String(v).trim().length > 0) s.add(f.key);
  }
  return s;
}

// ── Freshness helpers ───────────────────────────────────────────────────────
export function freshnessDot(daysAgo: number | null): { color: string; label: string } {
  if (daysAgo === null) return { color: 'bg-gray-300', label: 'never' };
  if (daysAgo <= 3) return { color: 'bg-status-success', label: `${daysAgo}d` };
  if (daysAgo <= 7) return { color: 'bg-status-warning', label: `${daysAgo}d` };
  return { color: 'bg-status-overdue', label: `${daysAgo}d` };
}

export function daysInStage(stageChangedAt: string | null): number | null {
  if (!stageChangedAt) return null;
  return Math.floor((Date.now() - new Date(stageChangedAt).getTime()) / 86400000);
}

// ── Forecast category styling ───────────────────────────────────────────────
const FC_STYLES: Record<string, string> = {
  commit:      'bg-blue-100 text-blue-800',
  'most likely': 'bg-amber-100 text-amber-800',
  upside:      'bg-purple-100 text-purple-800',
  pipeline:    'bg-gray-100 dark:bg-ink-3 text-gray-700',
  omitted:     'bg-gray-100 dark:bg-ink-3 text-gray-500',
};

export function ForecastBadge({ category }: { category: string | null }) {
  if (!category) return <span className="text-[9px] text-brand-navy-30 dark:text-fg-4 italic">—</span>;
  const style = FC_STYLES[category.toLowerCase()] || 'bg-gray-100 dark:bg-ink-3 text-gray-600';
  return <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${style}`}>{category}</span>;
}

// ── Stage badge (lightweight inline version) ────────────────────────────────
const STAGE_COLORS: Record<string, string> = {
  'Qualify': 'bg-gray-50 dark:bg-ink-2 text-gray-600 border-gray-200',
  'Build Value': 'bg-emerald-50 dark:bg-status-d-success-soft text-emerald-700 border-emerald-200/60',
  'Develop Solution': 'bg-indigo-50 text-indigo-700 border-indigo-200/60',
  'Proposal Sent': 'bg-purple-50 text-purple-700 border-purple-200/60',
  'Negotiate': 'bg-blue-50 dark:bg-status-d-info-soft text-blue-700 border-blue-200/60',
  'Submitted for Booking': 'bg-amber-50 dark:bg-status-d-warning-soft text-amber-700 border-amber-200/60',
};

export function StagePill({ stage }: { stage: string }) {
  const style = STAGE_COLORS[stage] || 'bg-gray-50 dark:bg-ink-2 text-gray-600 border-gray-200';
  return <span className={`text-[9px] px-2 py-0.5 rounded-full border font-semibold ${style}`}>{stage}</span>;
}

// ── Health score (simple inline) ────────────────────────────────────────────
export function HealthBadge({ opp }: { opp: ForecastOpp }) {
  const score = computeSimpleHealth(opp);
  const factors = computeHealthFactors(opp);
  const color = score >= 70 ? 'text-emerald-600' : score >= 40 ? 'text-amber-600' : 'text-status-overdue dark:text-status-d-overdue';
  return (
    <HoverTooltip width={220} content={
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold text-brand-navy dark:text-fg-1">Health Score</span>
          <span className={`text-[12px] font-bold ${color}`}>{score}/100</span>
        </div>
        <div className="space-y-1">
          {factors.map(f => (
            <div key={f.label} className="flex items-center justify-between text-[10px]">
              <span className="text-brand-navy-70 dark:text-fg-2">{f.label}</span>
              <span className={f.penalty > 0 ? 'text-status-overdue dark:text-status-d-overdue font-medium' : 'text-emerald-600 font-medium'}>
                {f.penalty > 0 ? `−${f.penalty}` : '✓'}
              </span>
            </div>
          ))}
        </div>
      </div>
    }>
      <span className={`text-[10px] font-semibold ${color} cursor-default`}>{score}</span>
    </HoverTooltip>
  );
}

export function computeHealthFactors(opp: ForecastOpp): { label: string; penalty: number }[] {
  const factors: { label: string; penalty: number }[] = [];
  const mScore = meddpiccScore(opp);
  const meddpiccMax = opp.record_type?.toLowerCase()?.includes('upsell') ? 10 : 30;
  const mPenalty = Math.round(((9 - mScore) / 9) * meddpiccMax);
  factors.push({ label: `MEDDPICC (${mScore}/9)`, penalty: mPenalty });
  const daysAgo = opp.se_comments_days_ago;
  const cPenalty = daysAgo === null ? 15 : daysAgo > 21 ? 25 : daysAgo > 7 ? 10 : 0;
  factors.push({ label: `SE Comments (${daysAgo !== null ? `${daysAgo}d` : 'never'})`, penalty: cPenalty });
  const tPenalty = Math.min(opp.overdue_task_count * 7, 35);
  factors.push({ label: `Overdue Tasks (${opp.overdue_task_count})`, penalty: tPenalty });
  const stDays = daysInStage(opp.stage_changed_at);
  const sPenalty = stDays !== null && stDays > 45 ? 15 : stDays !== null && stDays > 30 ? 8 : 0;
  factors.push({ label: `Stage Velocity (${stDays !== null ? `${stDays}d` : '?'})`, penalty: sPenalty });
  return factors;
}

export function computeSimpleHealth(opp: ForecastOpp): number {
  let score = 100;
  const mScore = meddpiccScore(opp);
  const meddpiccPenalty = opp.record_type?.toLowerCase()?.includes('upsell') ? 10 : 30;
  score -= Math.round(((9 - mScore) / 9) * meddpiccPenalty);
  const daysAgo = opp.se_comments_days_ago;
  if (daysAgo === null) score -= 15;
  else if (daysAgo > 21) score -= 25;
  else if (daysAgo > 7) score -= 10;
  score -= Math.min(opp.overdue_task_count * 7, 35);
  const stDays = daysInStage(opp.stage_changed_at);
  if (stDays !== null && stDays > 45) score -= 15;
  else if (stDays !== null && stDays > 30) score -= 8;
  return Math.max(0, Math.min(100, score));
}

// ── Territory grouping ──────────────────────────────────────────────────────
const NA_TEAMS = new Set(['NA Enterprise', 'NA Strategic']);
const INTL_TEAMS = new Set(['EMEA', 'ANZ']);

export type ForecastRegion = 'NA' | 'INTL';

export function detectDefaultRegion(userTeams: string[]): ForecastRegion {
  for (const t of userTeams) {
    if (NA_TEAMS.has(t)) return 'NA';
    if (INTL_TEAMS.has(t)) return 'INTL';
  }
  return 'NA';
}

export function regionFilter(opp: { team?: string | null }, region: ForecastRegion): boolean {
  const t = opp.team || '';
  if (region === 'NA') return NA_TEAMS.has(t);
  return INTL_TEAMS.has(t);
}

// ── Stage ordering for pipeline sort ────────────────────────────────────────
export const STAGE_ORDER: Record<string, number> = {
  'Qualify': 1,
  'Build Value': 2,
  'Develop Solution': 3,
  'Proposal Sent': 4,
  'Negotiate': 5,
  'Submitted for Booking': 6,
};

// ── Forecast category ordering ──────────────────────────────────────────────
export const FC_ORDER: Record<string, number> = {
  'commit': 1,
  'most likely': 2,
  'upside': 3,
  'pipeline': 4,
  'omitted': 5,
};

export function getFcGroup(fc: string | null): string {
  if (!fc) return 'Uncategorized';
  return fc;
}

// ── FQ helpers ──────────────────────────────────────────────────────────────
export function getCurrentFQ(): string {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `Q${q}-${now.getFullYear()}`;
}

export function getNextFQ(): string {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  if (q === 4) return `Q1-${now.getFullYear() + 1}`;
  return `Q${q + 1}-${now.getFullYear()}`;
}
