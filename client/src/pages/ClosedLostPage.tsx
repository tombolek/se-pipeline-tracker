import { useState, useEffect, useCallback } from 'react';
import type { ClosedLostItem } from '../api/opportunities';
import { listClosedLost, markClosedLostRead } from '../api/opportunities';
import { usePipelineStore } from '../store/pipeline';
import OpportunityDetail from '../components/OpportunityDetail';
import Drawer from '../components/Drawer';
import StageBadge from '../components/shared/StageBadge';
import { formatARR, formatDate } from '../utils/formatters';

// ── Row ───────────────────────────────────────────────────────────────────────

function ClosedRow({ item, selected, onClick }: {
  item: ClosedLostItem;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <tr
      onClick={onClick}
      className={`border-b border-brand-navy-30/30 cursor-pointer transition-colors ${
        selected
          ? 'bg-brand-purple-30/20 border-l-2 border-l-brand-purple'
          : 'hover:bg-brand-purple-30/10'
      }`}
    >
      {/* Name + account */}
      <td className="px-4 py-3">
        <p className="text-sm font-medium text-brand-navy truncate max-w-[280px]">{item.name}</p>
        <p className="text-xs text-brand-navy-70 truncate max-w-[280px]">{item.account_name ?? '—'}</p>
      </td>

      {/* Stage when closed */}
      <td className="px-3 py-3 whitespace-nowrap">
        <StageBadge stage={item.stage} />
      </td>

      {/* ARR */}
      <td className="px-3 py-3 text-sm font-medium text-brand-navy whitespace-nowrap">
        {formatARR(item.arr)}
      </td>

      {/* AE Owner */}
      <td className="px-3 py-3 text-xs text-brand-navy-70 whitespace-nowrap">
        {item.ae_owner_name ?? '—'}
      </td>

      {/* SE Owner */}
      <td className="px-3 py-3 text-xs text-brand-navy-70 whitespace-nowrap">
        {item.se_owner?.name ?? <span className="text-brand-navy-30">—</span>}
      </td>

      {/* Closed date */}
      <td className="px-3 py-3 text-xs text-brand-navy-70 whitespace-nowrap">
        {formatDate(item.closed_at)}
      </td>

      {/* Chevron */}
      <td className="px-3 py-3 text-brand-navy-30">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </td>
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ClosedLostPage() {
  const [items, setItems] = useState<ClosedLostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const setClosedLostUnread = usePipelineStore((s) => s.setClosedLostUnread);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { items: rows, unreadCount } = await listClosedLost();
      setItems(rows);
      // Mark all as read immediately — update store to 0, then fire server call
      if (unreadCount > 0) {
        setClosedLostUnread(0);
        markClosedLostRead([]).catch(() => {});
      }
    } catch {
      setError('Failed to load closed opportunities.');
    } finally {
      setLoading(false);
    }
  }, [setClosedLostUnread]);

  useEffect(() => { load(); }, [load]);

  function handleClose() {
    setSelectedId(null);
  }

  return (
    <div className="flex flex-col h-full relative overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-brand-navy-30/40 bg-white flex-shrink-0">
        <h1 className="text-base font-semibold text-brand-navy">Closed Lost</h1>
        {!loading && items.length > 0 && (
          <span className="text-[10px] bg-brand-navy-30 text-brand-navy-70 rounded-full px-1.5 py-px font-medium">
            {items.length}
          </span>
        )}
        <span className="text-xs text-brand-navy-70 ml-auto">Sorted by most recently closed</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto bg-white">
        {loading && (
          <div className="flex items-center justify-center py-20 text-sm text-brand-navy-70">Loading…</div>
        )}
        {error && (
          <div className="px-5 py-4 text-sm text-status-overdue">{error}</div>
        )}
        {!loading && !error && items.length === 0 && (
          <div className="flex items-center justify-center py-20 text-sm text-brand-navy-70">
            No closed opportunities yet.
          </div>
        )}
        {!loading && items.length > 0 && (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-white border-b border-brand-navy-30/40 z-10">
              <tr>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">Opportunity</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">Stage</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">ARR</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">AE Owner</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">SE Owner</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">Closed</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <ClosedRow
                  key={item.id}
                  item={item}
                  selected={selectedId === item.id}
                  onClick={() => setSelectedId(item.id)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Slide-in drawer */}
      <Drawer open={selectedId !== null} onClose={handleClose}>
        {selectedId !== null && (
          <OpportunityDetail
            key={selectedId}
            oppId={selectedId}
          />
        )}
      </Drawer>
    </div>
  );
}
