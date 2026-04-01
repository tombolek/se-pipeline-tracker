import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import { listUsers } from '../../api/users';
import type { ApiResponse, User } from '../../types';
import StageBadge from '../../components/shared/StageBadge';
import { formatARR, formatDate } from '../../utils/formatters';
import Drawer from '../../components/Drawer';
import OpportunityDetail from '../../components/OpportunityDetail';
import { useAuthStore } from '../../store/auth';

interface MappingOpp {
  id: number;
  name: string;
  account_name: string | null;
  stage: string;
  arr: number | null;
  arr_currency: string;
  close_date: string | null;
  ae_owner_name: string | null;
  se_owner: { id: number; name: string } | null;
}

// ── Inline SE assign select ────────────────────────────────────────────────────
function SeAssignSelect({
  opp,
  ses,
  onAssigned,
}: {
  opp: MappingOpp;
  ses: User[];
  onAssigned: (oppId: number, se: { id: number; name: string } | null) => void;
}) {
  const [saving, setSaving] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    e.stopPropagation();
    const val = e.target.value;
    const newSeId = val === '' ? null : parseInt(val);
    setSaving(true);
    try {
      await api.patch(`/opportunities/${opp.id}`, { se_owner_id: newSeId });
      const newSe = newSeId ? (ses.find(s => s.id === newSeId) ?? null) : null;
      onAssigned(opp.id, newSe ? { id: newSe.id, name: newSe.name } : null);
    } catch {
      // revert is implicit — state only updates on success
    } finally {
      setSaving(false);
    }
  }

  return (
    <select
      value={opp.se_owner?.id ?? ''}
      onChange={handleChange}
      onClick={e => e.stopPropagation()}
      disabled={saving}
      className={`text-xs rounded-lg border px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-purple transition-colors disabled:opacity-50 ${
        opp.se_owner
          ? 'border-brand-navy-30 text-brand-navy bg-white'
          : 'border-status-warning text-status-warning bg-status-warning/10 font-medium'
      }`}
    >
      <option value="">Unassigned</option>
      {ses.map(se => (
        <option key={se.id} value={se.id}>{se.name}</option>
      ))}
    </select>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SeDealMappingPage() {
  const { user: currentUser } = useAuthStore();
  const [opps, setOpps] = useState<MappingOpp[]>([]);
  const [ses, setSes] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const defaultFilter: number | 'unassigned' | 'all' =
    currentUser?.role === 'se' && currentUser.id ? currentUser.id : 'all';
  const [filterSe, setFilterSe] = useState<number | 'unassigned' | 'all'>(defaultFilter);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [oppsRes, usersRes] = await Promise.all([
      api.get<ApiResponse<MappingOpp[]>>('/opportunities?include_qualify=true&sort=close_date'),
      listUsers(),
    ]);
    setOpps(oppsRes.data.data);
    setSes(usersRes.filter(u => u.role === 'se' && u.is_active));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleAssigned(oppId: number, se: { id: number; name: string } | null) {
    setOpps(prev => prev.map(o => o.id === oppId ? { ...o, se_owner: se } : o));
  }

  const unassignedCount = opps.filter(o => !o.se_owner).length;

  const filtered = opps.filter(o => {
    if (filterSe === 'unassigned') return !o.se_owner;
    if (filterSe === 'all') return true;
    return o.se_owner?.id === filterSe;
  });

  return (
    <div className="flex flex-col h-full relative overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-8 pt-6 pb-4">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-semibold text-brand-navy">SE Deal Mapping</h1>
            <p className="text-sm text-brand-navy-70 mt-0.5">Assign SEs to opportunities and manage coverage</p>
          </div>
          {unassignedCount > 0 && (
            <span className="ml-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-status-warning/15 text-status-warning border border-status-warning/30">
              {unassignedCount} unassigned
            </span>
          )}
        </div>

        {/* Filter pills */}
        {!loading && (
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <button
              onClick={() => setFilterSe('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                filterSe === 'all'
                  ? 'bg-brand-purple text-white border-brand-purple'
                  : 'border-brand-navy-30 text-brand-navy-70 hover:border-brand-navy'
              }`}
            >
              All deals <span className="ml-1 opacity-70">{opps.length}</span>
            </button>
            <button
              onClick={() => setFilterSe('unassigned')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                filterSe === 'unassigned'
                  ? 'bg-status-warning text-white border-status-warning'
                  : 'border-status-warning/50 text-status-warning hover:border-status-warning'
              }`}
            >
              Unassigned <span className="ml-1 opacity-70">{unassignedCount}</span>
            </button>
            {ses.map(se => {
              const count = opps.filter(o => o.se_owner?.id === se.id).length;
              return (
                <button
                  key={se.id}
                  onClick={() => setFilterSe(se.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    filterSe === se.id
                      ? 'bg-brand-purple text-white border-brand-purple'
                      : 'border-brand-navy-30 text-brand-navy-70 hover:border-brand-navy'
                  }`}
                >
                  {se.name} <span className="ml-1 opacity-60">{count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto px-8 pb-6">
        {loading ? (
          <div className="text-sm text-brand-navy-70 py-10 text-center">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-brand-navy-70 py-10 text-center">No deals match this filter.</div>
        ) : (
          <div className="bg-white rounded-2xl border border-brand-navy-30/40 overflow-hidden">
            <table className="w-full">
              <thead className="border-b border-brand-navy-30/40">
                <tr>
                  {['SE Owner', 'Opportunity', 'Stage', 'ARR', 'Close', 'AE Owner'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(opp => {
                  const isUnassigned = !opp.se_owner;
                  return (
                    <tr
                      key={opp.id}
                      onClick={() => setSelectedId(opp.id)}
                      className={`border-b border-brand-navy-30/20 last:border-0 cursor-pointer transition-colors ${
                        isUnassigned
                          ? 'bg-status-warning/5 hover:bg-status-warning/10 border-l-2 border-l-status-warning'
                          : 'hover:bg-brand-purple-30/10'
                      }`}
                    >
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <SeAssignSelect opp={opp} ses={ses} onAssigned={handleAssigned} />
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-brand-navy leading-tight truncate max-w-[260px]">{opp.name}</p>
                        <p className="text-xs text-brand-navy-70 truncate max-w-[260px]">{opp.account_name ?? '—'}</p>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StageBadge stage={opp.stage} />
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-brand-navy whitespace-nowrap">
                        {formatARR(opp.arr)}
                      </td>
                      <td className="px-4 py-3 text-xs text-brand-navy-70 whitespace-nowrap">
                        {opp.close_date ? formatDate(opp.close_date) : <span className="text-brand-navy-30">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-brand-navy-70 whitespace-nowrap">
                        {opp.ae_owner_name ?? <span className="text-brand-navy-30">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Drawer open={selectedId !== null} onClose={() => setSelectedId(null)}>
        {selectedId !== null && (
          <OpportunityDetail key={selectedId} oppId={selectedId} onRefreshList={load} />
        )}
      </Drawer>
    </div>
  );
}
