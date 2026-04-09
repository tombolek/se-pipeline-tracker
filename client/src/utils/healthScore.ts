/**
 * Deal Health Score computation (Issue #65).
 *
 * Scoring: start at 100, apply deductions across 5 dimensions.
 * RAG thresholds: Green >= 70, Amber 40-69, Red < 40.
 */
import type { Opportunity } from '../types';

export type HealthRAG = 'green' | 'amber' | 'red';

export interface HealthFactor {
  label: string;
  deduction: number;
  detail: string;
}

export interface HealthScore {
  score: number;
  rag: HealthRAG;
  factors: HealthFactor[];
}

// The 9 MEDDPICC fields tracked in this tool
const MEDDPICC_FIELDS: { key: keyof Opportunity; label: string }[] = [
  { key: 'metrics',           label: 'Metrics' },
  { key: 'economic_buyer',    label: 'Economic Buyer' },
  { key: 'decision_criteria', label: 'Decision Criteria' },
  { key: 'decision_process',  label: 'Decision Process' },
  { key: 'paper_process',     label: 'Paper Process' },
  { key: 'implicate_pain',    label: 'Implicate Pain' },
  { key: 'champion',          label: 'Champion' },
  { key: 'authority',         label: 'Authority / Budget' },
  { key: 'need',              label: 'Need / Timeline' },
];

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export function computeHealthScore(opp: Opportunity): HealthScore {
  const factors: HealthFactor[] = [];
  let deducted = 0;

  // ── 1. MEDDPICC completeness (max -30, reduced to -10 for Upsell) ────────
  const isUpsell = opp.record_type?.toLowerCase() === 'upsell';
  const meddpiccMax = isUpsell ? 10 : 30;
  const missing = MEDDPICC_FIELDS.filter(f => !opp[f.key]);
  const meddpiccDeduction = Math.round(missing.length * (meddpiccMax / MEDDPICC_FIELDS.length));
  if (meddpiccDeduction > 0) {
    factors.push({
      label: 'MEDDPICC completeness',
      deduction: meddpiccDeduction,
      detail: `${missing.length}/9 fields missing${isUpsell ? ' (reduced weight — Upsell)' : ''}: ${missing.map(f => f.label).join(', ')}`,
    });
    deducted += meddpiccDeduction;
  }

  // ── 2. SE Comments freshness (max -25) ──────────────────────────────────────
  const seCommentsDays = daysSince(opp.se_comments_updated_at);
  let seCommentsDeduction = 0;
  let seCommentsDetail = '';
  if (seCommentsDays === null) {
    seCommentsDeduction = 25;
    seCommentsDetail = 'Never updated';
  } else if (seCommentsDays > 21) {
    seCommentsDeduction = 20;
    seCommentsDetail = `${seCommentsDays}d ago (stale)`;
  } else if (seCommentsDays > 7) {
    seCommentsDeduction = 10;
    seCommentsDetail = `${seCommentsDays}d ago`;
  }
  if (seCommentsDeduction > 0) {
    factors.push({
      label: 'SE Comments freshness',
      deduction: seCommentsDeduction,
      detail: seCommentsDetail,
    });
    deducted += seCommentsDeduction;
  }

  // ── 3. Note freshness (max -5) ──────────────────────────────────────────────
  // Low-weight signal — note absence alone is a minor concern; overdue tasks
  // are the primary negative indicator (see dimension 4).
  const noteDays = daysSince(opp.last_note_at);
  let noteDeduction = 0;
  let noteDetail = '';
  if (noteDays === null) {
    noteDeduction = 5;
    noteDetail = 'No notes added';
  } else if (noteDays > 60) {
    noteDeduction = 3;
    noteDetail = `Last note ${noteDays}d ago`;
  }
  if (noteDeduction > 0) {
    factors.push({
      label: 'Note freshness',
      deduction: noteDeduction,
      detail: noteDetail,
    });
    deducted += noteDeduction;
  }

  // ── 4. Overdue tasks (max -35) ──────────────────────────────────────────────
  // Primary negative signal — each unresolved overdue task is a strong indicator
  // of deal risk or neglect.
  const overdue = opp.overdue_task_count ?? 0;
  const overdueDeduction = Math.min(overdue * 10, 35);
  if (overdueDeduction > 0) {
    factors.push({
      label: 'Overdue tasks',
      deduction: overdueDeduction,
      detail: `${overdue} overdue task${overdue !== 1 ? 's' : ''}`,
    });
    deducted += overdueDeduction;
  }

  // ── 5. Days in current stage (max -15) ──────────────────────────────────────
  const stageDays = daysSince(opp.stage_changed_at);
  let stageDeduction = 0;
  let stageDetail = '';
  if (stageDays !== null) {
    if (stageDays > 60) {
      stageDeduction = 15;
      stageDetail = `${stageDays}d in "${opp.stage}"`;
    } else if (stageDays > 30) {
      stageDeduction = 10;
      stageDetail = `${stageDays}d in "${opp.stage}"`;
    }
  }
  if (stageDeduction > 0) {
    factors.push({
      label: 'Time in stage',
      deduction: stageDeduction,
      detail: stageDetail,
    });
    deducted += stageDeduction;
  }

  const score = Math.max(0, 100 - deducted);
  const rag: HealthRAG = score >= 70 ? 'green' : score >= 40 ? 'amber' : 'red';

  return { score, rag, factors };
}
