/**
 * Quota Groups settings (Issue #94).
 * Define the groups + targets used by the % to Target report.
 * Manager-only.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../api/client';
import type { ApiResponse } from '../../types';
import {
  listQuotaGroups, createQuotaGroup, updateQuotaGroup, deleteQuotaGroup,
  type QuotaGroup, type QuotaRuleType,
} from '../../api/settings';
import { listTeams } from '../../api/users';
import { formatARR } from '../../utils/formatters';

function RuleChip({ group }: { group: QuotaGroup | { rule_type: QuotaRuleType; rule_value: string[] } }) {
  if (group.rule_type === 'global') {
    return <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-brand-navy-30/60 text-brand-navy dark:text-fg-1">All Closed Won</span>;
  }
  if (group.rule_type === 'teams') {
    return <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-brand-purple-30 text-brand-navy dark:text-fg-1">Teams: {group.rule_value.join(', ') || '—'}</span>;
  }
  return <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-brand-pink-30 text-[#33012A]">AE: {group.rule_value.join(', ') || '—'}</span>;
}

interface ModalProps {
  initial?: QuotaGroup;
  onClose: () => void;
  onSaved: (g: QuotaGroup) => void;
  teams: string[];
  aeOwners: string[];
}

function GroupModal({ initial, onClose, onSaved, teams, aeOwners }: ModalProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [ruleType, setRuleType] = useState<QuotaRuleType>(initial?.rule_type ?? 'teams');
  const [ruleValue, setRuleValue] = useState<string[]>(initial?.rule_value ?? []);
  const [target, setTarget] = useState<string>(
    initial ? String(parseFloat(initial.target_amount)) : ''
  );
  const [chipInput, setChipInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggestions = useMemo(() => {
    const pool = ruleType === 'teams' ? teams : ruleType === 'ae_owners' ? aeOwners : [];
    if (!chipInput.trim()) return pool.filter(p => !ruleValue.includes(p)).slice(0, 8);
    const q = chipInput.toLowerCase();
    return pool.filter(p => p.toLowerCase().includes(q) && !ruleValue.includes(p)).slice(0, 8);
  }, [ruleType, ruleValue, chipInput, teams, aeOwners]);

  function addChip(value: string) {
    const v = value.trim();
    if (!v) return;
    if (!ruleValue.includes(v)) setRuleValue([...ruleValue, v]);
    setChipInput('');
  }
  function removeChip(value: string) {
    setRuleValue(ruleValue.filter(v => v !== value));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError('Name is required.'); return; }
    if (ruleType !== 'global' && ruleValue.length === 0) {
      setError(ruleType === 'teams' ? 'Pick at least one team.' : 'Pick at least one AE owner.');
      return;
    }
    const targetNum = parseFloat(target);
    if (!isFinite(targetNum) || targetNum < 0) { setError('Target must be a non-negative number.'); return; }

    setSaving(true);
    try {
      const payload = { name: name.trim(), rule_type: ruleType, rule_value: ruleType === 'global' ? [] : ruleValue, target_amount: targetNum };
      const saved = initial
        ? await updateQuotaGroup(initial.id, payload)
        : await createQuotaGroup(payload);
      onSaved(saved);
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error ?? 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-brand-navy/60 flex items-center justify-center p-4" onClick={onClose}>
      <form
        className="bg-white dark:bg-ink-1 rounded-2xl border border-brand-navy-30/40 dark:border-ink-border-soft p-6 max-w-[560px] w-full shadow-xl"
        onClick={e => e.stopPropagation()}
        onSubmit={handleSave}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-brand-navy dark:text-fg-1">{initial ? `Edit group — ${initial.name}` : 'New quota group'}</h3>
          <button type="button" onClick={onClose} className="text-brand-navy-70 dark:text-fg-2 hover:text-brand-navy dark:text-fg-1 text-xl leading-none">×</button>
        </div>

        {error && <p className="text-xs text-status-overdue dark:text-status-d-overdue bg-status-overdue/10 dark:bg-status-d-overdue-soft border border-status-overdue/30 rounded-lg px-3 py-2 mb-3">{error}</p>}

        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-brand-navy-70 dark:text-fg-2 mb-1">Name</label>
            <input
              className="w-full border border-brand-navy-30 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-purple"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. NA, INTL, DACH"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-brand-navy-70 dark:text-fg-2 mb-1.5">Rule</label>
            <div className="flex items-center gap-2 mb-3">
              {(['global', 'teams', 'ae_owners'] as QuotaRuleType[]).map(rt => (
                <button
                  key={rt}
                  type="button"
                  onClick={() => { setRuleType(rt); setRuleValue([]); setChipInput(''); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    ruleType === rt
                      ? 'bg-brand-purple dark:bg-accent-purple text-white border-brand-purple'
                      : 'border-brand-navy-30 text-brand-navy-70 dark:text-fg-2 hover:border-brand-navy hover:text-brand-navy'
                  }`}
                >
                  {rt === 'global' ? 'All Closed Won' : rt === 'teams' ? 'By team' : 'By AE owner'}
                </button>
              ))}
            </div>

            {ruleType !== 'global' && (
              <div>
                <div className="flex items-center gap-1.5 flex-wrap border border-brand-navy-30 rounded-lg p-2 min-h-[44px]">
                  {ruleValue.map(v => (
                    <span key={v} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                      ruleType === 'teams' ? 'bg-brand-purple-30 text-brand-navy' : 'bg-brand-pink-30 text-[#33012A]'
                    }`}>
                      {v}
                      <button type="button" className="opacity-60 hover:opacity-100" onClick={() => removeChip(v)}>×</button>
                    </span>
                  ))}
                  <input
                    className="flex-1 min-w-[160px] text-sm outline-none bg-transparent"
                    placeholder={ruleType === 'teams' ? '+ add team…' : '+ add AE owner…'}
                    value={chipInput}
                    onChange={e => setChipInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addChip(chipInput);
                      }
                    }}
                  />
                </div>
                {suggestions.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap mt-2">
                    {suggestions.map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => addChip(s)}
                        className="px-2 py-0.5 rounded-full text-[11px] font-medium border border-brand-navy-30/60 dark:border-ink-border text-brand-navy-70 dark:text-fg-2 hover:border-brand-navy hover:text-brand-navy dark:text-fg-1"
                      >+ {s}</button>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-brand-navy-70 dark:text-fg-2 mt-1.5">
                  {ruleType === 'teams' ? 'Suggestions from existing opportunity teams.' : 'Suggestions from existing AE owners.'}
                </p>
              </div>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-brand-navy-70 dark:text-fg-2 mb-1">Target (USD, annual)</label>
            <input
              className="w-full border border-brand-navy-30 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-purple"
              value={target}
              onChange={e => setTarget(e.target.value)}
              placeholder="e.g. 1500000"
              inputMode="numeric"
            />
            {target && parseFloat(target) > 0 && (
              <p className="text-[11px] text-brand-navy-70 dark:text-fg-2 mt-1">Displayed as {formatARR(parseFloat(target))}</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-brand-navy-30/40 dark:border-ink-border-soft">
          <button type="button" onClick={onClose} className="text-xs font-medium text-brand-navy-70 dark:text-fg-2 hover:text-brand-navy dark:text-fg-1 px-3 py-2">Cancel</button>
          <button
            type="submit"
            disabled={saving}
            className="bg-brand-purple hover:bg-brand-purple-70 dark:hover:opacity-90 text-white text-xs font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
          >{saving ? 'Saving…' : 'Save group'}</button>
        </div>
      </form>
    </div>
  );
}

export default function QuotaSettingsPage() {
  const [groups, setGroups] = useState<QuotaGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<QuotaGroup | 'new' | null>(null);
  const [teams, setTeams] = useState<string[]>([]);
  const [aeOwners, setAeOwners] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listQuotaGroups();
      setGroups(list);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Lazy-load suggestion pools when opening the modal
  useEffect(() => {
    if (editing === null) return;
    if (teams.length === 0) listTeams().then(setTeams).catch(() => {});
    if (aeOwners.length === 0) {
      api.get<ApiResponse<string[]>>('/insights/ae-owners')
        .then(r => setAeOwners(r.data.data))
        .catch(() => {});
    }
  }, [editing, teams.length, aeOwners.length]);

  async function handleDelete(g: QuotaGroup) {
    if (!confirm(`Delete quota group "${g.name}"? This cannot be undone.`)) return;
    try {
      await deleteQuotaGroup(g.id);
      setGroups(groups.filter(x => x.id !== g.id));
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function reorder(g: QuotaGroup, dir: -1 | 1) {
    const idx = groups.findIndex(x => x.id === g.id);
    const j = idx + dir;
    if (j < 0 || j >= groups.length) return;
    const a = groups[idx], b = groups[j];
    try {
      const [savedA, savedB] = await Promise.all([
        updateQuotaGroup(a.id, { sort_order: b.sort_order }),
        updateQuotaGroup(b.id, { sort_order: a.sort_order }),
      ]);
      setGroups(prev => prev
        .map(g => g.id === savedA.id ? savedA : g.id === savedB.id ? savedB : g)
        .sort((x, y) => x.sort_order - y.sort_order)
      );
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div>
      <div className="flex items-start gap-4 mb-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-navy-70 dark:text-fg-2">Settings · Quotas</p>
          <h1 className="text-[22px] font-semibold text-brand-navy dark:text-fg-1 leading-tight mt-0.5">Quota groups</h1>
          <p className="text-xs text-brand-navy-70 dark:text-fg-2 mt-1">
            Define the groups and targets used by the <a className="text-brand-purple dark:text-accent-purple underline" href="/insights/percent-to-target">% to Target report</a>.
            A single deal can count toward multiple groups.
          </p>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="ml-auto bg-brand-purple hover:bg-brand-purple-70 dark:hover:opacity-90 text-white text-xs font-semibold px-4 py-2 rounded-lg"
        >+ Add group</button>
      </div>

      {error && <p className="text-xs text-status-overdue dark:text-status-d-overdue mb-3">{error}</p>}

      <div className="bg-white dark:bg-ink-1 rounded-2xl border border-brand-navy-30/40 dark:border-ink-border-soft overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-ink-2/50 border-b border-brand-navy-30/40 dark:border-ink-border-soft">
            <tr>
              <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 dark:text-fg-2 uppercase tracking-wide">Name</th>
              <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 dark:text-fg-2 uppercase tracking-wide">Rule</th>
              <th className="px-5 py-2.5 text-right text-[11px] font-semibold text-brand-navy-70 dark:text-fg-2 uppercase tracking-wide">Target (USD)</th>
              <th className="px-5 py-2.5 text-center text-[11px] font-semibold text-brand-navy-70 dark:text-fg-2 uppercase tracking-wide">Order</th>
              <th className="px-5 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-brand-navy-70 dark:text-fg-2">Loading…</td></tr>
            ) : groups.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-brand-navy-70 dark:text-fg-2">No quota groups yet. Click <b>+ Add group</b> to start.</td></tr>
            ) : groups.map((g, i) => (
              <tr key={g.id} className="border-b border-brand-navy-30/20 dark:border-ink-border-soft last:border-0">
                <td className="px-5 py-3 text-sm font-semibold text-brand-navy dark:text-fg-1">{g.name}</td>
                <td className="px-5 py-3"><RuleChip group={g} /></td>
                <td className="px-5 py-3 text-right text-sm text-brand-navy dark:text-fg-1 font-medium">${parseFloat(g.target_amount).toLocaleString('en-US')}</td>
                <td className="px-5 py-3 text-center text-xs text-brand-navy-70 dark:text-fg-2">
                  {g.sort_order} ·
                  <button onClick={() => reorder(g, -1)} disabled={i === 0} className="ml-1 disabled:opacity-30 hover:text-brand-navy dark:text-fg-1">↑</button>
                  <button onClick={() => reorder(g, 1)} disabled={i === groups.length - 1} className="ml-1 disabled:opacity-30 hover:text-brand-navy dark:text-fg-1">↓</button>
                </td>
                <td className="px-5 py-3 text-right text-xs">
                  <button onClick={() => setEditing(g)} className="text-brand-purple dark:text-accent-purple font-medium hover:underline mr-3">Edit</button>
                  <button onClick={() => handleDelete(g)} className="text-brand-navy-70 dark:text-fg-2 hover:text-status-overdue dark:text-status-d-overdue">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing !== null && (
        <GroupModal
          initial={editing === 'new' ? undefined : editing}
          teams={teams}
          aeOwners={aeOwners}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setGroups(prev => {
              const exists = prev.some(g => g.id === saved.id);
              const next = exists ? prev.map(g => g.id === saved.id ? saved : g) : [...prev, saved];
              return next.sort((a, b) => a.sort_order - b.sort_order);
            });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
