const STAGE_COLORS: Record<string, string> = {
  'Qualify':               'bg-brand-navy-30/40 text-brand-navy-70',
  'Develop Solution':      'bg-brand-purple-30 text-brand-purple',
  'Build Value':           'bg-brand-purple/10 text-brand-purple',
  'Proposal Sent':         'bg-brand-navy/10 text-brand-navy',
  'Submitted for Booking': 'bg-amber-50 text-amber-800',
  'Negotiate':             'bg-orange-50 text-orange-600',
  'Closed Won':            'bg-emerald-50 text-emerald-800',
};

export default function StageBadge({ stage }: { stage: string }) {
  const cls = STAGE_COLORS[stage] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap uppercase tracking-wide ${cls}`}>
      {stage}
    </span>
  );
}
