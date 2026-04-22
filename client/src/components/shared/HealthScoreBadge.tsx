/**
 * HealthScoreBadge — displays a RAG dot + numeric score for a deal.
 * On hover, shows a tooltip breaking down the contributing factors.
 */
import { useState, useRef } from 'react';
import { computeHealthScore } from '../../utils/healthScore';
import type { Opportunity } from '../../types';

const RAG_STYLES = {
  green: { dot: 'bg-status-success dark:bg-status-d-success', text: 'text-status-success dark:text-status-d-success' },
  amber: { dot: 'bg-status-warning dark:bg-status-d-warning',  text: 'text-status-warning dark:text-status-d-warning' },
  red:   { dot: 'bg-status-overdue dark:bg-status-d-overdue',  text: 'text-status-overdue dark:text-status-d-overdue' },
};

export default function HealthScoreBadge({ opp }: { opp: Opportunity }) {
  const { score, rag, factors } = computeHealthScore(opp);
  const styles = RAG_STYLES[rag];
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const noIssues = factors.length === 0;

  return (
    <div
      ref={ref}
      className="relative inline-flex items-center gap-1.5 cursor-default"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {/* RAG dot */}
      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${styles.dot}`} />
      {/* Score */}
      <span className={`text-xs font-semibold tabular-nums ${styles.text}`}>{score}</span>

      {/* Tooltip */}
      {show && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-64 bg-brand-navy dark:bg-ink-2 dark:border dark:border-ink-border rounded-xl shadow-xl p-3 pointer-events-none"
          role="tooltip"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-white dark:text-fg-1">Deal Health Score</span>
            <span className={`text-sm font-bold ${styles.text}`}>{score}/100</span>
          </div>

          {noIssues ? (
            <p className="text-xs text-status-success dark:text-status-d-success">No issues detected</p>
          ) : (
            <ul className="space-y-1.5">
              {factors.map(f => (
                <li key={f.label} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-white dark:text-fg-1 leading-tight">{f.label}</p>
                    <p className="text-[11px] text-brand-navy-30 dark:text-fg-3 leading-tight truncate">{f.detail}</p>
                  </div>
                  <span className="text-xs font-medium text-status-overdue dark:text-status-d-overdue flex-shrink-0">−{f.deduction}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Tooltip arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-brand-navy dark:border-t-ink-2" />
        </div>
      )}
    </div>
  );
}
