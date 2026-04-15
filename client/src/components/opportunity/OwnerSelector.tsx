import { useEffect, useRef, useState } from 'react';
import { listUsers } from '../../api/users';
import { assignSeOwner } from '../../api/opportunities';
import type { User, Opportunity } from '../../types';
import { useAuthStore } from '../../store/auth';

interface Props {
  oppId: number;
  owner: { id: number; name: string; email: string } | null;
  readOnly?: boolean;
  onChange: (opp: Opportunity) => void;
}

/**
 * Compact SE-Owner display + inline change popover.
 *
 * Permission model (mirrors the server PATCH handler):
 *   - manager: can assign/unassign anyone with role=se
 *   - se: can self-assign if the opp is currently unassigned;
 *         can reassign to anyone (or unassign) if they currently own the opp
 *   - viewer: never
 */
export default function OwnerSelector({ oppId, owner, readOnly, onChange }: Props) {
  const { user } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const isManager = user?.role === 'manager';
  const isOwner = !!owner && owner.id === user?.id;
  const canSelfAssignIfUnassigned = user?.role === 'se' && !owner;
  const canChange = !readOnly && (isManager || isOwner || canSelfAssignIfUnassigned);

  useEffect(() => {
    if (!open || users.length > 0) return;
    listUsers().then(setUsers).catch(() => setUsers([]));
  }, [open, users.length]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function assign(userId: number | null) {
    setError(null);
    setSaving(true);
    try {
      const opp = await assignSeOwner(oppId, userId);
      onChange(opp);
      setFilter('');
      setOpen(false);
    } catch (e) {
      setError((e as Error).message || 'Failed to assign');
    } finally {
      setSaving(false);
    }
  }

  // When the current user is an SE who doesn't own the opp, the server only lets
  // them assign themselves — so the dropdown shows just "Assign to me" rather
  // than a full SE list.
  const candidates = users
    .filter(u => u.is_active && u.role === 'se')
    .filter(u => !owner || u.id !== owner.id)
    .filter(u => isManager || isOwner ? true : u.id === user?.id)
    .filter(u => !filter || u.name.toLowerCase().includes(filter.toLowerCase()) || u.email.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="flex items-center gap-1.5" ref={ref}>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-navy-70">Owner</span>
      {canChange ? (
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          disabled={saving}
          className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full transition-colors disabled:opacity-50 ${
            owner
              ? 'bg-brand-purple text-white hover:bg-brand-purple-70'
              : 'bg-amber-50 text-status-warning border border-amber-200 hover:bg-amber-100'
          }`}
          title="Change SE Owner"
        >
          {owner?.name ?? 'Unassigned'}
          <svg className="w-3 h-3 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      ) : (
        <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${
          owner ? 'bg-brand-purple/15 text-brand-purple' : 'bg-gray-100 text-brand-navy-70'
        }`}>
          {owner?.name ?? 'Unassigned'}
        </span>
      )}

      {open && canChange && (
        <div className="absolute left-0 top-5 z-30 w-72 bg-white rounded-lg border border-brand-navy-30 shadow-xl overflow-hidden" style={{ position: 'absolute', top: '100%', marginTop: '0.25rem' }}>
          <div className="p-2 border-b border-brand-navy-30/40">
            <input
              autoFocus
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder={isManager || isOwner ? 'Search SE…' : 'Assign to me'}
              className="w-full px-2 py-1 text-xs border border-brand-navy-30 rounded focus:outline-none focus:ring-1 focus:ring-brand-purple"
            />
          </div>
          {error && <p className="px-3 py-2 text-[11px] text-status-overdue bg-red-50">{error}</p>}
          <ul className="max-h-56 overflow-y-auto">
            {(isManager || isOwner) && owner && (
              <li>
                <button
                  type="button"
                  onClick={() => assign(null)}
                  disabled={saving}
                  className="w-full px-3 py-1.5 text-left text-xs text-status-warning hover:bg-amber-50 transition-colors disabled:opacity-50 border-b border-brand-navy-30/30"
                >
                  Unassign
                </button>
              </li>
            )}
            {candidates.length === 0 ? (
              <li className="px-3 py-2 text-xs text-brand-navy-70">No matches.</li>
            ) : (
              candidates.slice(0, 20).map(u => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => assign(u.id)}
                    disabled={saving}
                    className="w-full px-3 py-1.5 text-left text-xs hover:bg-brand-purple-30/40 transition-colors disabled:opacity-50"
                  >
                    <span className="font-medium text-brand-navy">{u.name}</span>
                    <span className="ml-2 text-brand-navy-70">{u.email}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
