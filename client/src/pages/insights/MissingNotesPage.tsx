import { useState, useEffect } from 'react';
import api from '../../api/client';
import type { ApiResponse } from '../../types';
import StageBadge from '../../components/shared/StageBadge';
import SortableHeader from '../../components/shared/SortableHeader';
import { formatARR, daysSinceLabel } from '../../utils/formatters';
import { Empty, Loading } from './shared';
import RowCapture from '../../components/RowCapture';
import Drawer from '../../components/Drawer';
import OpportunityDetail from '../../components/OpportunityDetail';
import { sortRows, type SortDir, type ColType } from '../../utils/sortRows';

interface MissingNotesRow {
  id: number;
  name: string;
  account_name: string;
  stage: string;
  arr: string;
  se_comments_updated_at: string | null;
  days_since_update: number | null;
  se_owner_name: string | null;
}

const COLS: { key: keyof MissingNotesRow; label: string; type: ColType }[] = [
  { key: 'name',                   label: 'Opportunity',      type: 'string' },
  { key: 'stage',                  label: 'Stage',            type: 'string' },
  { key: 'arr',                    label: 'ARR',              type: 'number' },
  { key: 'se_comments_updated_at', label: 'Last SE Update',   type: 'date'   },
  { key: 'se_owner_name',          label: 'SE Owner',         type: 'string' },
];

export default function MissingNotesPage() {
  const [threshold, setThreshold] = useState(21);
  const [rows, setRows] = useState<MissingNotesRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  function handleSort(key: string) {
    if (sortKey !== key) { setSortKey(key); setSortDir('asc'); }
    else if (sortDir === 'asc') setSortDir('desc');
    else { setSortKey(null); setSortDir('asc'); }
  }

  function load() {
    setLoading(true);
    api.get<ApiResponse<MissingNotesRow[]>>(`/insights/missing-notes?threshold_days=${threshold}`)
      .then(r => setRows(r.data.data))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [threshold]);

  const colTypeMap = Object.fromEntries(COLS.map(c => [c.key, c.type])) as Record<string, ColType>;
  const displayed = sortKey
    ? sortRows(rows, sortKey, sortDir, k => colTypeMap[k] ?? 'string')
    : rows;

  return (
    <div className="flex flex-col h-full relative overflow-hidden">
      {/* Header + controls */}
      <div className="flex-shrink-0 px-8 pt-6 pb-4">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-semibold text-brand-navy">Missing Notes</h1>
            <p className="text-sm text-brand-navy-70 mt-0.5">Opportunities without recent SE comments</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {[14, 21, 30].map(d => (
              <button
                key={d}
                onClick={() => setThreshold(d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  threshold === d
                    ? 'bg-brand-purple text-white border-brand-purple'
                    : 'border-brand-navy-30 text-brand-navy-70 hover:border-brand-navy'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Scrollable table */}
      <div className="flex-1 overflow-y-auto px-8 pb-6">
        {loading ? <Loading /> : rows.length === 0 ? <Empty /> : (
          <div className="bg-white rounded-2xl border border-brand-navy-30/40 overflow-hidden">
            <table className="w-full">
              <thead className="border-b border-brand-navy-30/40">
                <tr>
                  {COLS.map(c => (
                    <SortableHeader
                      key={c.key}
                      colKey={c.key}
                      label={c.label}
                      currentKey={sortKey}
                      currentDir={sortDir}
                      onSort={handleSort}
                      className="px-4 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide"
                    />
                  ))}
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {displayed.map(r => {
                  const stale = r.days_since_update === null || r.days_since_update > 30;
                  const selected = selectedId === r.id;
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setSelectedId(r.id)}
                      className={`group border-b border-brand-navy-30/20 last:border-0 cursor-pointer transition-colors ${
                        selected
                          ? 'bg-brand-purple-30/20 border-l-2 border-l-brand-purple'
                          : 'hover:bg-brand-purple-30/10'
                      }`}
                    >
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-brand-navy">{r.name}</p>
                        <p className="text-xs text-brand-navy-70">{r.account_name}</p>
                      </td>
                      <td className="px-4 py-3"><StageBadge stage={r.stage} /></td>
                      <td className="px-4 py-3 text-sm font-medium text-brand-navy">{formatARR(r.arr)}</td>
                      <td className={`px-4 py-3 text-xs font-medium ${stale ? 'text-status-overdue' : 'text-status-warning'}`}>
                        {daysSinceLabel(r.se_comments_updated_at)}
                      </td>
                      <td className="px-4 py-3 text-xs text-brand-navy-70">{r.se_owner_name ?? <span className="text-status-warning">Unassigned</span>}</td>
                      <td className="px-2 py-3" onClick={e => e.stopPropagation()}>
                        <RowCapture oppId={r.id} oppName={r.name} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Slide-in drawer */}
      <Drawer open={selectedId !== null} onClose={() => setSelectedId(null)}>
        {selectedId !== null && (
          <OpportunityDetail
            key={selectedId}
            oppId={selectedId}
            onRefreshList={load}
          />
        )}
      </Drawer>
    </div>
  );
}
