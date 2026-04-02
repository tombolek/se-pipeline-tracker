import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import { listUsers } from '../../api/users';
import { updateMyPreferences } from '../../api/users';
import type { ApiResponse, User, Opportunity } from '../../types';
import { getColumnsForPage, DEFAULT_COLUMNS, COLUMN_BY_KEY } from '../../constants/columnDefs';
import StageBadge from '../../components/shared/StageBadge';
import ColumnPicker from '../../components/shared/ColumnPicker';
import MultiSelectFilter from '../../components/shared/MultiSelectFilter';
import { renderOpportunityCell } from '../../utils/renderOpportunityCell';
import Drawer from '../../components/Drawer';
import OpportunityDetail from '../../components/OpportunityDetail';
import { useAuthStore } from '../../store/auth';

// se_owner is pinned as an interactive select — exclude it from the picker
const SE_OWNER_KEY = 'se_owner';
const DEFAULT_SE_MAPPING_COLS = DEFAULT_COLUMNS.se_mapping.filter(c => c !== SE_OWNER_KEY);

// ── Inline SE assign select ────────────────────────────────────────────────────
function SeAssignSelect({
  opp,
  ses,
  onAssigned,
}: {
  opp: Opportunity;
  ses: User[];
  onAssigned: (oppId: number, se: { id: number; name: string; email: string } | null) => void;
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
      onAssigned(opp.id, newSe ? { id: newSe.id, name: newSe.name, email: newSe.email } : null);
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

const STAGES = [
  'Qualify', 'Build Value', 'Develop Solution',
  'Proposal Sent', 'Negotiate', 'Submitted for Booking',
];

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SeDealMappingPage() {
  const { user: currentUser, setUser } = useAuthStore();
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [ses, setSes] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const defaultFilter: number | 'unassigned' | 'all' =
    currentUser?.role === 'se' && currentUser.id ? currentUser.id : 'all';
  const [filterSe, setFilterSe] = useState<number | 'unassigned' | 'all'>(defaultFilter);
  const [filterStages, setFilterStages] = useState<string[]>([]);
  const [filterFiscalPeriods, setFilterFiscalPeriods] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    const cols = getColumnsForPage('se_mapping', currentUser?.column_prefs ?? null);
    return cols.filter(c => c !== SE_OWNER_KEY);
  });

  const load = useCallback(async () => {
    setLoading(true);
    const [oppsRes, usersRes] = await Promise.all([
      api.get<ApiResponse<Opportunity[]>>('/opportunities?include_qualify=true&sort=close_date'),
      listUsers(),
    ]);
    setOpps(oppsRes.data.data);
    setSes(usersRes.filter(u => u.role === 'se' && u.is_active));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleAssigned(oppId: number, se: { id: number; name: string; email: string } | null) {
    setOpps(prev => prev.map(o => o.id === oppId ? { ...o, se_owner: se } : o));
  }

  async function handleColumnsChange(cols: string[]) {
    setVisibleColumns(cols);
    try {
      const updatedUser = await updateMyPreferences({ column_prefs: { se_mapping: cols } });
      setUser(updatedUser);
    } catch {
      // persist failure is non-fatal
    }
  }

  const unassignedCount = opps.filter(o => !o.se_owner).length;

  const filtered = opps.filter(o => {
    if (filterSe === 'unassigned' && o.se_owner) return false;
    if (typeof filterSe === 'number' && o.se_owner?.id !== filterSe) return false;
    if (filterStages.length > 0 && !filterStages.includes(o.stage)) return false;
    if (filterFiscalPeriods.length > 0 && !filterFiscalPeriods.includes(o.fiscal_period ?? '')) return false;
    return true;
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
            <MultiSelectFilter options={STAGES} selected={filterStages} onChange={setFilterStages} placeholder="All stages" />
            <MultiSelectFilter options={fiscalPeriods} selected={filterFiscalPeriods} onChange={setFilterFiscalPeriods} placeholder="All periods" />
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
            <div className="ml-auto">
              <ColumnPicker
                visibleColumns={visibleColumns}
                defaultColumns={DEFAULT_SE_MAPPING_COLS}
                onChange={handleColumnsChange}
                excludeKeys={[SE_OWNER_KEY]}
              />
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto overflow-x-auto px-8 pb-6">
        {loading ? (
          <div className="text-sm text-brand-navy-70 py-10 text-center">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-brand-navy-70 py-10 text-center">No deals match this filter.</div>
        ) : (
          <div className="bg-white rounded-2xl border border-brand-navy-30/40 overflow-hidden">
            <table className="w-full">
              <thead className="border-b border-brand-navy-30/40">
                <tr>
                  {/* Pinned SE Owner selector column */}
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide whitespace-nowrap">
                    SE Owner
                  </th>
                  {visibleColumns.map(col => (
                    <th key={col} className="px-4 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide whitespace-nowrap">
                      {COLUMN_BY_KEY[col]?.label ?? col}
                    </th>
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
                      {/* Pinned SE assign selector */}
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <SeAssignSelect opp={opp} ses={ses} onAssigned={handleAssigned} />
                      </td>
                      {visibleColumns.map(col => (
                        <td key={col} className="px-4 py-3 whitespace-nowrap">
                          {renderOpportunityCell(opp, col)}
                        </td>
                      ))}
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
