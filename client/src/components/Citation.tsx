/**
 * Citation pill + text-with-citations renderer for AI output (#135).
 *
 * Server returns AI text with inline `[N]` markers plus a parallel
 * `ResolvedCitation[]` whose `id` matches the marker numbers. We parse the
 * text, swap each marker for a <CitationPill>, and render the surrounding
 * prose as-is. Unresolved markers (server dropped them during validation)
 * render as a distinct red error pill so the SE can't mistake a hallucinated
 * source for a real one.
 *
 * Hover → tooltip with kind/meta/preview + "Jump to source →" action.
 * Click → scrolls the drawer to the cited source and flashes a highlight.
 */
import React, { useState, useMemo } from 'react';
import type { ResolvedCitation } from '../types/citations';

// ── Pill ────────────────────────────────────────────────────────────────────

function CitationPill({
  citation,
  onJump,
}: {
  citation: ResolvedCitation;
  onJump?: (c: ResolvedCitation) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className="inline-block relative align-[1px] mx-[1px]"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => onJump?.(citation)}
        className={`inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded font-mono text-[9px] font-bold transition-colors cursor-pointer ${
          open
            ? 'bg-brand-purple text-white'
            : 'bg-brand-purple-30 dark:bg-accent-purple-soft text-brand-purple dark:text-accent-purple hover:bg-brand-purple hover:text-white'
        }`}
        title="Click to jump to source"
      >
        {citation.id}
      </button>
      {open && (
        // Outer positioner includes a 6px bottom padding bridge so the cursor
        // can cross from the pill into the card without passing through a
        // dead zone that would trigger onMouseLeave.
        <span
          className="absolute bottom-full left-1/2 -translate-x-1/2 pb-1.5 z-[60]"
          role="tooltip"
        >
          <span
            onClick={onJump ? (e) => { e.stopPropagation(); onJump(citation); } : undefined}
            className={`block min-w-[240px] max-w-[320px] bg-white dark:bg-ink-2 border border-brand-navy-30 dark:border-ink-border rounded-lg px-3 py-2 shadow-[0_8px_24px_rgba(26,12,66,0.15)] text-left ${onJump ? 'cursor-pointer hover:border-brand-purple dark:hover:border-accent-purple hover:shadow-[0_8px_24px_rgba(106,44,245,0.25)] transition-[border-color,box-shadow]' : ''}`}
          >
            <span className="block text-[9px] font-semibold uppercase tracking-widest text-brand-purple dark:text-accent-purple">
              {citation.label}
            </span>
            {citation.meta && (
              <span className="block text-[10px] text-brand-navy-70 dark:text-fg-3 mt-0.5">{citation.meta}</span>
            )}
            <span className="block text-[11px] text-brand-navy dark:text-fg-1 italic mt-1 leading-snug">
              "{truncate(citation.preview, 160)}"
            </span>
            {onJump && (
              <span className="block text-[10px] text-brand-purple dark:text-accent-purple font-semibold mt-1.5 no-underline">
                Click to jump →
              </span>
            )}
          </span>
        </span>
      )}
    </span>
  );
}

// Error pill for markers whose citation got stripped by the server.
function UnsupportedPill() {
  return (
    <span
      className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded bg-status-overdue/15 text-status-overdue font-mono text-[9px] font-bold mx-[1px] align-[1px] cursor-help"
      title="This citation couldn't be verified against the deal's data. Treat the surrounding claim with caution."
    >
      ?
    </span>
  );
}

// ── Text-with-citations ────────────────────────────────────────────────────

const MARKER_PATTERN = /\[(\d+)\]/g;

/**
 * Render AI text with inline `[N]` markers as prose + citation pills. Any
 * unknown marker ids render as a red `?` pill.
 *
 * `className` is applied to the outer span; the caller controls display
 * (e.g., paragraph, inline). Use inside a block element if it's a paragraph.
 */
export function TextWithCitations({
  text,
  citations,
  onJump,
  className,
}: {
  text: string;
  citations: ResolvedCitation[] | undefined;
  onJump?: (c: ResolvedCitation) => void;
  className?: string;
}) {
  const byId = useMemo(() => {
    const m = new Map<number, ResolvedCitation>();
    for (const c of citations ?? []) m.set(c.id, c);
    return m;
  }, [citations]);

  const parts = useMemo(() => splitByMarkers(text), [text]);

  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (part.kind === 'text') {
          return <React.Fragment key={i}>{part.value}</React.Fragment>;
        }
        const c = byId.get(part.id);
        if (!c) return <UnsupportedPill key={i} />;
        return <CitationPill key={i} citation={c} onJump={onJump} />;
      })}
    </span>
  );
}

// ── Internals ──────────────────────────────────────────────────────────────

type Part =
  | { kind: 'text'; value: string }
  | { kind: 'marker'; id: number };

function splitByMarkers(text: string): Part[] {
  const out: Part[] = [];
  let lastIndex = 0;
  // `matchAll` over the pattern; we reset lastIndex for each pass since the
  // regex has the /g flag and tracks state internally.
  MARKER_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MARKER_PATTERN.exec(text)) !== null) {
    if (m.index > lastIndex) {
      out.push({ kind: 'text', value: text.slice(lastIndex, m.index) });
    }
    out.push({ kind: 'marker', id: parseInt(m[1], 10) });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) {
    out.push({ kind: 'text', value: text.slice(lastIndex) });
  }
  return out;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + '…';
}

// ── Jump handler helper ────────────────────────────────────────────────────

/**
 * Build a default onJump handler that scrolls + highlights DOM elements in
 * the opportunity drawer. Callers can pass this or supply their own (for
 * routing to another page etc.).
 *
 * Contract: each jumpable source in the drawer should have
 * `data-cite-target="<kind>:<id>"` where kind/id matches the citation's ref.
 */
export function makeScrollJumper(): (c: ResolvedCitation) => void {
  return (c) => {
    const sel = selectorForCitation(c);
    if (!sel) return;
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('cite-flash');
    setTimeout(() => el.classList.remove('cite-flash'), 2200);
  };
}

function selectorForCitation(c: ResolvedCitation): string | null {
  switch (c.kind) {
    case 'note':           return c.note_id != null ? `[data-cite-target="note:${c.note_id}"]` : null;
    case 'task':           return c.task_id != null ? `[data-cite-target="task:${c.task_id}"]` : null;
    case 'field':          return c.field_name    ? `[data-cite-target="field:${c.field_name}"]` : null;
    case 'tech_discovery': return c.tech_discovery_path ? `[data-cite-target="td:${c.tech_discovery_path}"]` : null;
    case 'kb_proof_point': return c.kb_proof_point_id != null ? `[data-cite-target="kb:${c.kb_proof_point_id}"]` : null;
    case 'history':        return null;
    case 'opportunity':    return null;  // handled by opportunity jumpers that navigate instead of scroll
  }
}

/**
 * Variant of makeScrollJumper that handles `opportunity` kind by navigating
 * to the deal's drawer (via `?oppId=<sfid>`). Other kinds fall through to the
 * scroll behaviour. Use this for cross-opp surfaces like 1:1 Prep and
 * Forecasting where a citation can point to a whole deal. #135.
 */
export function makeCrossOppJumper(navigate: (path: string) => void): (c: ResolvedCitation) => void {
  const scrollJump = makeScrollJumper();
  return (c) => {
    if (c.kind === 'opportunity' && c.opportunity_sfid) {
      navigate(`/home?oppId=${c.opportunity_sfid}`);
      return;
    }
    scrollJump(c);
  };
}
