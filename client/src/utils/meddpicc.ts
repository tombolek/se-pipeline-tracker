/**
 * MEDDPICC completeness + quality scoring (Issue #76).
 *
 * Quality tiers per field:
 *   empty  — null / blank
 *   weak   — filled but too short (<30 chars) or a known placeholder
 *   strong — meaningful content
 *
 * Score = number of "strong" fields out of 9.
 * RAG: green 8-9, amber 5-7, red < 5
 */
import type { Opportunity } from '../types';

export type MeddpiccQuality = 'empty' | 'weak' | 'strong';

export interface MeddpiccField {
  key: keyof Opportunity;
  label: string;
  quality: MeddpiccQuality;
}

export interface MeddpiccScore {
  fields: MeddpiccField[];
  strong: number;
  weak: number;
  rag: 'green' | 'amber' | 'red';
}

export const MEDDPICC_FIELDS: { key: keyof Opportunity; label: string }[] = [
  { key: 'metrics',           label: 'Metrics' },
  { key: 'economic_buyer',    label: 'Economic Buyer' },
  { key: 'decision_criteria', label: 'Decision Criteria' },
  { key: 'decision_process',  label: 'Decision Process' },
  { key: 'paper_process',     label: 'Paper Process' },
  { key: 'implicate_pain',    label: 'Implicate the Pain' },
  { key: 'champion',          label: 'Champion' },
  { key: 'authority',         label: 'Authority' },
  { key: 'need',              label: 'Need / Timeline' },
];

const PLACEHOLDERS = new Set([
  'tbd', 'n/a', 'na', 'unknown', 'yes', 'no', '-', '--', '---',
  'none', 'tbc', 'todo', 'not applicable', 'not yet', 'pending', 'x',
]);

const MIN_STRONG_LENGTH = 30;

function scoreField(value: string | null | undefined): MeddpiccQuality {
  if (!value?.trim()) return 'empty';
  const trimmed = value.trim();
  if (PLACEHOLDERS.has(trimmed.toLowerCase())) return 'weak';
  if (trimmed.length < MIN_STRONG_LENGTH) return 'weak';
  return 'strong';
}

export function computeMeddpicc(opp: Opportunity): MeddpiccScore {
  const fields: MeddpiccField[] = MEDDPICC_FIELDS.map(f => ({
    ...f,
    quality: scoreField(opp[f.key] as string | null | undefined),
  }));

  const strong = fields.filter(f => f.quality === 'strong').length;
  const weak   = fields.filter(f => f.quality === 'weak').length;
  const rag    = strong >= 8 ? 'green' : strong >= 5 ? 'amber' : 'red';

  return { fields, strong, weak, rag };
}
