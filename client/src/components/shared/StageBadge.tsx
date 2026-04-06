const STAGE_STYLES: Record<string, { chip: string; dot: string }> = {
  'Qualify':               { chip: 'bg-brand-navy-30/30 text-brand-navy-70',  dot: 'bg-brand-navy-30' },
  'Develop Solution':      { chip: 'bg-brand-purple-30/60 text-brand-purple',  dot: 'bg-brand-purple' },
  'Build Value':           { chip: 'bg-brand-purple-30/40 text-brand-purple',  dot: 'bg-brand-purple-70' },
  'Proposal Sent':         { chip: 'bg-blue-50 text-blue-700',                 dot: 'bg-blue-400' },
  'Submitted for Booking': { chip: 'bg-amber-50 text-amber-800',               dot: 'bg-amber-500' },
  'Negotiate':             { chip: 'bg-orange-50 text-orange-700',             dot: 'bg-orange-400' },
  'Closed Won':            { chip: 'bg-emerald-50 text-emerald-800',           dot: 'bg-emerald-500' },
};

export default function StageBadge({ stage }: { stage: string }) {
  const style = STAGE_STYLES[stage] ?? { chip: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' };
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap ${style.chip}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${style.dot}`} />
      {stage}
    </span>
  );
}
