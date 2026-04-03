/**
 * parseSeCommentDate
 *
 * Extracts the date stamp written at the start of an SE comment.
 * SEs use ~14 different formats; we try them in order of specificity.
 *
 * Year inference for year-less formats:
 *   A comment date is always in the past, so we use the current year
 *   unless that produces a future date — in which case we use (currentYear - 1).
 */

const MONTH_MAP: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

const M3   = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec';
const MU3  = 'JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEPT?|OCT|NOV|DEC';  // SEPT? covers SEP + SEPT
const MF   = 'January|February|March|April|May|June|July|August|September|October|November|December';
const MALL = `${MF}|${M3}`;  // full names first so they win in alternation

const parseMonth = (s: string): number => MONTH_MAP[s.toLowerCase()] ?? 0;
const y2to4     = (s: string): number => { const n = parseInt(s, 10); return n < 50 ? 2000 + n : 1900 + n; };

/** Returns the nearest past year for a given month/day (today as reference). */
function inferYear(month: number, day: number, ref: Date = new Date()): number {
  const thisYear = ref.getFullYear();
  const candidate = new Date(thisYear, month - 1, day);
  return candidate > ref ? thisYear - 1 : thisYear;
}

interface PatternDef {
  id: string;
  re: RegExp;
  ex: (m: RegExpMatchArray) => { year: number | null; month: number; day: number };
}

const PATTERNS: PatternDef[] = [
  // 1. YYYYMMDD:   e.g. 20260312:
  {
    id: 'fmt1',
    re: /^(\d{4})(\d{2})(\d{2}):/,
    ex: m => ({ year: +m[1], month: +m[2], day: +m[3] }),
  },

  // 2. [Init ]YYYY-MM-DD   e.g. TB 2026-03-31
  {
    id: 'fmt2',
    re: /^(?:[A-Z]{2,3}\s+)?(\d{4})-(\d{2})-(\d{2})/,
    ex: m => ({ year: +m[1], month: +m[2], day: +m[3] }),
  },

  // 8a. [Init|Name ]D MonthName YYYY   e.g. Kir 21 Aug 2025:  /  1 July 2025:  /  KK 5 Sep 2025:
  {
    id: 'fmt8a',
    re: new RegExp(`^(?:[A-Za-z]+\\s+)?(\\d{1,2})\\s+(${MALL})\\s+(\\d{4})`, 'i'),
    ex: m => ({ year: +m[3], month: parseMonth(m[2]), day: +m[1] }),
  },

  // 6. Init DD/MM/YY   e.g. BS 19/03/26  /  ZV 27/03/26
  //    Day-first confirmed by values >12 in day position (e.g. 19/03, 23/03)
  {
    id: 'fmt6',
    re: /^[A-Z]{2,3}\s+(\d{1,2})\/(\d{2})\/(\d{2})/,
    ex: m => ({ year: y2to4(m[3]), month: +m[2], day: +m[1] }),
  },

  // 7. Init DD Mon YY   e.g. PZR 12 Mar 26  /  LHL 19 Mar 26
  {
    id: 'fmt7',
    re: new RegExp(`^[A-Z]{2,3}\\s+(\\d{1,2})\\s+(${M3})\\s+(\\d{2})(?:[\\s:,\\-]|$)`, 'i'),
    ex: m => ({ year: y2to4(m[3]), month: parseMonth(m[2]), day: +m[1] }),
  },

  // 3. InitDDMMM:  run-together   e.g. ZB31MAR:  /  LHL13MAR
  {
    id: 'fmt3',
    re: new RegExp(`^[A-Z]{2,3}(\\d{2})(${MU3})[:\\s\\-]`),
    ex: m => ({ year: null, month: parseMonth(m[2]), day: +m[1] }),
  },

  // 4. Init_DDMMM  underscore day-first   e.g. BM_21NOV  /  BM_26SEPT
  {
    id: 'fmt4',
    re: new RegExp(`^[A-Z]{2,3}_(\\d{1,2})(${MU3})(?:[\\s\\-]|$)`),
    ex: m => ({ year: null, month: parseMonth(m[2]), day: +m[1] }),
  },

  // 5. Init_MMMDD  underscore month-first (inverted)   e.g. BM_OCT08  /  BM_JAN14
  {
    id: 'fmt5',
    re: new RegExp(`^[A-Z]{2,3}_(${MU3})(\\d{2})(?:[\\s\\-]|$)`),
    ex: m => ({ year: null, month: parseMonth(m[1]), day: +m[2] }),
  },

  // 13. PZR+MMDD  run-together   e.g. PZR0130  /  PZR0312
  {
    id: 'fmt13',
    re: /^PZR(\d{2})(\d{2})[\s\-]/,
    ex: m => ({ year: null, month: +m[1], day: +m[2] }),
  },

  // 8b. Init Mon D -   e.g. TB Mar 9 -
  {
    id: 'fmt8b',
    re: new RegExp(`^[A-Z]{2,3}\\s+(${MALL})\\s+(\\d{1,2})\\s*[\\-–]`, 'i'),
    ex: m => ({ year: null, month: parseMonth(m[1]), day: +m[2] }),
  },

  // 10. DDMon  run-together no year   e.g. 01Apr  /  04Jul  /  19Feb
  {
    id: 'fmt10',
    re: new RegExp(`^(\\d{2})(${M3})(?:[\\s\\-]|$)`, 'i'),
    ex: m => ({ year: null, month: parseMonth(m[2]), day: +m[1] }),
  },

  // 11. D Mon [Tag]   e.g. 20 Mar MAD  /  7 Jan MAD  /  12 Mar Demo
  {
    id: 'fmt11',
    re: new RegExp(`^(\\d{1,2})\\s+(${MALL})(?:[\\s\\-]|$)`, 'i'),
    ex: m => ({ year: null, month: parseMonth(m[2]), day: +m[1] }),
  },

  // 12. Mon D - [text]   e.g. Mar 12 - KA  /  March 5 - EP  /  Oct 30 - we're
  {
    id: 'fmt12',
    re: new RegExp(`^(${MALL})\\s+(\\d{1,2})\\s*[\\-–:]`, 'i'),
    ex: m => ({ year: null, month: parseMonth(m[1]), day: +m[2] }),
  },

  // 9. M/DD  no year   e.g. 3/16  /  03/06 EI:  /  12/11  /  7/18
  //    Treated as MM/DD (US-style); values with day>12 confirm this unambiguously
  {
    id: 'fmt9',
    re: /^(\d{1,2})\/(\d{1,2})(?:[\s:\/\-]|$)/,
    ex: m => ({ year: null, month: +m[1], day: +m[2] }),
  },
];

export interface ParsedCommentDate {
  date: Date;
  /** Which regex pattern matched */
  fmt: string;
  /** Whether the year was explicitly in the comment or inferred */
  yearInferred: boolean;
}

/**
 * Parse the date stamp from the beginning of an SE comment.
 *
 * @param comment  The raw se_comments string
 * @param ref      Reference "today" for year inference (defaults to now; injectable for tests)
 * @returns        Parsed date, or null if no recognisable stamp found
 */
export function parseSeCommentDate(
  comment: string | null | undefined,
  ref: Date = new Date(),
): ParsedCommentDate | null {
  if (!comment) return null;

  // Normalise: strip HTML line-breaks, work on first line only
  const line = comment.replace(/<br\s*\/?>/gi, '\n').split('\n')[0].trim();
  if (!line) return null;

  for (const p of PATTERNS) {
    const m = line.match(p.re);
    if (!m) continue;

    const raw = p.ex(m);
    if (raw.month < 1 || raw.month > 12 || raw.day < 1 || raw.day > 31) continue;

    const yearInferred = raw.year === null;
    const year = raw.year ?? inferYear(raw.month, raw.day, ref);

    return {
      date: new Date(year, raw.month - 1, raw.day),
      fmt: p.id,
      yearInferred,
    };
  }

  return null;
}
