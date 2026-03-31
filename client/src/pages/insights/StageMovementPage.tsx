import { useState, useEffect } from 'react';
import api from '../../api/client';
import type { ApiResponse } from '../../types';
import StageBadge from '../../components/shared/StageBadge';
import { formatARR, formatDate } from '../../utils/formatters';
import { PageHeader, Empty, Loading } from './shared';

interface StageMovementRow {
  id: number;
  name: string;
  account_name: string;
  arr: string;
  arr_currency: string;
  current_stage: string;
  previous_stage: string;
  stage_changed_at: string;
  ae_owner_name: string;
  se_owner_name: string | null;
}

export default function StageMovementPage() {
  const [days, setDays] = useState(14);
  const [rows, setRows] = useState<StageMovementRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get<ApiResponse<StageMovementRow[]>>(`/insights/stage-movement?days=${days}`)
      .then(r => setRows(r.data.data))
      .finally(() => setLoading(false));
  }, [days]);

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <PageHeader title="Stage Movement" subtitle="Opportunities that changed stage recently" />
        <div className="ml-auto flex items-center gap-2">
          {[7, 14, 30].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                days === d
                  ? 'bg-brand-purple text-white border-brand-purple'
                  : 'border-brand-navy-30 text-brand-navy-70 hover:border-brand-navy hover:text-brand-navy'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {loading ? <Loading /> : rows.length === 0 ? <Empty /> : (
        <div className="bg-white rounded-2xl border border-brand-navy-30/40 overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-brand-navy-30/40">
              <tr>
                {['Opportunity', 'Stage Change', 'ARR', 'Changed', 'SE Owner'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b border-brand-navy-30/20 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-brand-navy">{r.name}</p>
                    <p className="text-xs text-brand-navy-70">{r.account_name}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs text-brand-navy-70">{r.previous_stage}</span>
                      <svg className="w-3 h-3 text-brand-navy-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                      <StageBadge stage={r.current_stage} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-brand-navy">{formatARR(r.arr)}</td>
                  <td className="px-4 py-3 text-xs text-brand-navy-70">{formatDate(r.stage_changed_at)}</td>
                  <td className="px-4 py-3 text-xs text-brand-navy-70">{r.se_owner_name ?? <span className="text-status-warning">Unassigned</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
