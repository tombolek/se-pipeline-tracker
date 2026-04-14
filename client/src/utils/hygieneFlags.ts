/**
 * SE Data Hygiene — shared flag computation.
 *
 * Given an opportunity-like object, returns an array of human-readable
 * flag strings describing SE-responsibility hygiene issues.
 * Used by the Home page digest and the 1:1 Prep page.
 */

const DAY_MS = 86_400_000;
const POC_ACTIVE = ['Identified', 'In Deployment', 'In Progress', 'Wrapping Up'];
const POC_STARTED = ['In Progress', 'Wrapping Up'];
const DEVELOP_OR_LATER = ['Develop Solution', 'Build Value', 'Proposal Sent', 'Submitted for Booking', 'Negotiate'];
const DEMO_RE = /\bdemo\b/i;

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
}

function toDate(v: string | null | undefined): string | null {
  if (!v) return null;
  return v.slice(0, 10);
}

export interface HygieneFlagInput {
  stage?: string | null;
  se_comments?: string | null;
  se_comments_updated_at?: string | null;
  poc_status?: string | null;
  poc_start_date?: string | null;
  poc_end_date?: string | null;
  technical_blockers?: string | null;
  next_step_sf?: string | null;
  last_note_at?: string | null;
}

export function computeHygieneFlags(opp: HygieneFlagInput): string[] {
  const flags: string[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const nowMs = Date.now();

  const seCommentsDays = daysSince(opp.se_comments_updated_at);
  const pocStart = toDate(opp.poc_start_date);
  const pocEnd = toDate(opp.poc_end_date);
  const pocStatus = opp.poc_status?.trim() || null;
  const stage = opp.stage ?? '';

  // Rule 1: Stale SE Comments (>21 days or never updated)
  if (seCommentsDays === null) {
    flags.push('SE Comments never updated');
  } else if (seCommentsDays > 21) {
    flags.push(`SE Comments ${seCommentsDays}d old`);
  }

  // Rule 2: PoC not started on time
  if (pocStart && pocStart < today && pocStatus && POC_ACTIVE.includes(pocStatus) && !POC_STARTED.includes(pocStatus)) {
    flags.push('PoC should be In Progress');
  }

  // Rule 3: PoC overrunning
  if (pocStatus === 'In Progress' && pocEnd && pocEnd < today) {
    const overdue = Math.floor((nowMs - new Date(pocEnd).getTime()) / DAY_MS);
    flags.push(`PoC overdue by ${overdue}d`);
  }

  // Rule 4: PoC wrap-up overdue
  if (pocStatus === 'Wrapping Up' && pocEnd && pocEnd < today) {
    const overdue = Math.floor((nowMs - new Date(pocEnd).getTime()) / DAY_MS);
    flags.push(`PoC wrap-up overdue ${overdue}d`);
  }

  // Rule 5: PoC timeline too long (>6 weeks)
  if (pocStart && pocEnd) {
    const span = Math.floor((new Date(pocEnd).getTime() - new Date(pocStart).getTime()) / DAY_MS);
    if (span > 42) {
      flags.push(`PoC span ${Math.round(span / 7)}wk`);
    }
  }

  // Rule 6: Develop Solution → missing PoC planning
  if (stage === 'Develop Solution' && (!pocStatus || !pocStart)) {
    if (!pocStatus && !pocStart) {
      flags.push('Missing PoC planning');
    } else if (!pocStatus) {
      flags.push('Missing PoC status');
    } else if (!pocStart) {
      flags.push('Missing PoC start date');
    }
  }

  // Rule 7: Develop Solution or later → missing Tech Blockers
  if (DEVELOP_OR_LATER.includes(stage) && !opp.technical_blockers?.trim()) {
    flags.push('Missing Tech Blockers');
  }

  // Rule 8: Demo mentioned in SE Comments or Next Step, but no recent note
  const mentionsDemo = (opp.se_comments && DEMO_RE.test(opp.se_comments)) ||
                       (opp.next_step_sf && DEMO_RE.test(opp.next_step_sf));
  if (mentionsDemo) {
    const lastNote = daysSince(opp.last_note_at);
    if (lastNote === null || lastNote > 7) {
      flags.push('Demo mentioned, no follow-up');
    }
  }

  return flags;
}
