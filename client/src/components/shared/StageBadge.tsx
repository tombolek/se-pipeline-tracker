// Stage chip colors — light mode keeps the rainbow it has today; dark
// mode collapses to two neutral-purple tones for pipeline stages plus
// status-d shades for outcome stages, so the table doesn't flicker like
// a Christmas tree on a dark surface. #138
const STAGE_STYLES: Record<string, { chip: string; dot: string }> = {
  'Qualify':               { chip: 'bg-brand-navy-30/30 text-brand-navy-70 dark:bg-ink-3 dark:text-fg-2',                       dot: 'bg-brand-navy-30 dark:bg-fg-3' },
  'Develop Solution':      { chip: 'bg-brand-purple-30/60 text-brand-purple dark:bg-accent-purple-soft dark:text-accent-purple', dot: 'bg-brand-purple dark:bg-accent-purple' },
  'Build Value':           { chip: 'bg-brand-purple-30/40 text-brand-purple dark:bg-accent-purple-soft dark:text-accent-purple', dot: 'bg-brand-purple-70 dark:bg-accent-purple' },
  'Proposal Sent':         { chip: 'bg-blue-50 dark:bg-status-d-info-soft text-blue-700 dark:bg-status-d-info-soft dark:text-status-d-info',               dot: 'bg-blue-400 dark:bg-status-d-info' },
  'Submitted for Booking': { chip: 'bg-amber-50 dark:bg-status-d-warning-soft text-amber-800 dark:bg-status-d-warning-soft dark:text-status-d-warning',       dot: 'bg-amber-500 dark:bg-status-d-warning' },
  'Negotiate':             { chip: 'bg-orange-50 dark:bg-status-d-warning-soft text-orange-700 dark:bg-status-d-warning-soft dark:text-status-d-warning',     dot: 'bg-orange-400 dark:bg-status-d-warning' },
  'Closed Won':            { chip: 'bg-emerald-50 dark:bg-status-d-success-soft text-emerald-800 dark:bg-status-d-success-soft dark:text-status-d-success',   dot: 'bg-emerald-500 dark:bg-status-d-success' },
};

export default function StageBadge({ stage }: { stage: string }) {
  const style = STAGE_STYLES[stage] ?? { chip: 'bg-gray-100 text-gray-600 dark:bg-ink-3 dark:text-fg-3', dot: 'bg-gray-400 dark:bg-fg-4' };
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap ${style.chip}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${style.dot}`} />
      {stage}
    </span>
  );
}
