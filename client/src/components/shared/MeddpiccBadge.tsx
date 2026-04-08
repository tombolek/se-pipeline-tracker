import { computeMeddpicc } from '../../utils/meddpicc';
import type { Opportunity } from '../../types';

const RAG_STYLES = {
  green: { pill: 'bg-emerald-50 text-status-success',  dot: 'bg-status-success' },
  amber: { pill: 'bg-amber-50 text-status-warning',    dot: 'bg-status-warning' },
  red:   { pill: 'bg-red-50 text-status-overdue',      dot: 'bg-status-overdue' },
};

const QUALITY_ICON: Record<string, React.ReactNode> = {
  strong: <span className="text-status-success">✓</span>,
  weak:   <span className="text-status-warning">◐</span>,
  empty:  <span className="text-brand-navy-30">○</span>,
};

export default function MeddpiccBadge({ opp }: { opp: Opportunity }) {
  const { fields, strong, weak, rag } = computeMeddpicc(opp);
  const styles = RAG_STYLES[rag];

  return (
    <div className="relative group/medd inline-block">
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-default ${styles.pill}`}>
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${styles.dot}`} />
        {strong}/{fields.length}
        {weak > 0 && (
          <span className="text-[10px] font-normal opacity-70">+{weak}◐</span>
        )}
      </span>

      {/* Tooltip */}
      <div className="absolute left-0 top-full mt-1.5 z-50 hidden group-hover/medd:block pointer-events-none">
        <div className="bg-brand-navy rounded-xl p-3 w-48 shadow-xl">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50 mb-2">
            MEDDPICC · {strong}/9 quality
          </p>
          <div className="space-y-1">
            {fields.map(f => (
              <div key={f.key as string} className="flex items-center gap-2 text-[11px] text-white/80">
                {QUALITY_ICON[f.quality]}
                <span className={f.quality === 'empty' ? 'opacity-40 italic' : ''}>{f.label}</span>
                {f.quality === 'weak' && (
                  <span className="ml-auto text-[10px] text-status-warning/70">short</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
