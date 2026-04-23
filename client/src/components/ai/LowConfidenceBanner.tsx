import { useState } from 'react';
import type { LowConfidenceSpan } from '../../types/citations';

/**
 * Warning banner shown above AI prose output when one or more paragraphs
 * carry no `[N]` citation markers. Hallucination guardrail (Issue #136).
 *
 * UX: compact banner with a count; click to expand and see the flagged
 * paragraph text so the reader knows which claims are ungrounded. The prose
 * itself is not altered — the user sees the model's output but knows
 * specifically what to treat with skepticism.
 */
export default function LowConfidenceBanner({ spans }: { spans: LowConfidenceSpan[] }) {
  const [expanded, setExpanded] = useState(false);
  if (spans.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-400/50 bg-amber-50 dark:bg-status-d-warning-soft/50">
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-amber-100/40 transition-colors rounded-lg"
      >
        <svg className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <span className="text-[11px] font-medium text-amber-900 flex-1">
          {spans.length === 1
            ? '1 paragraph is not backed by a cited source — treat with caution'
            : `${spans.length} paragraphs are not backed by cited sources — treat with caution`}
        </span>
        <svg className={`w-3 h-3 text-amber-700 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && (
        <ul className="px-3 pb-2 pt-0 text-[11px] text-amber-900 space-y-1.5">
          {spans.map((s, i) => (
            <li key={i} className="pl-4 border-l-2 border-amber-300/60 italic">
              "{s.text}"
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
