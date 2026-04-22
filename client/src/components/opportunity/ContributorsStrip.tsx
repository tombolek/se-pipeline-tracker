import { useEffect, useRef, useState } from 'react';
import { listUsers } from '../../api/users';
import { addSeContributor, removeSeContributor, type SeContributorUser } from '../../api/opportunities';
import type { User } from '../../types';
import { useAuthStore } from '../../store/auth';

interface Props {
  oppId: number;
  ownerId: number | null;
  contributors: SeContributorUser[];
  readOnly?: boolean;
  onChange: (next: SeContributorUser[]) => void;
}

export default function ContributorsStrip({ oppId, ownerId, contributors, readOnly, onChange }: Props) {
  const { user } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const canManage = !readOnly && (
    user?.role === 'manager' ||
    (user?.role === 'se' && ownerId === user?.id)
  );
  // Even if they can't manage all, an SE can add/remove themselves
  const canToggleSelf = !readOnly && user?.role === 'se';

  useEffect(() => {
    if (!open || allUsers.length > 0) return;
    listUsers().then(setAllUsers).catch(() => setAllUsers([]));
  }, [open, allUsers.length]);

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

  async function add(userId: number) {
    setError(null);
    setLoading(true);
    try {
      const next = await addSeContributor(oppId, userId);
      onChange(next);
      setFilter('');
      setOpen(false);
    } catch (e) {
      setError((e as Error).message || 'Failed to add');
    } finally {
      setLoading(false);
    }
  }

  async function remove(userId: number) {
    if (readOnly) return;
    setError(null);
    setLoading(true);
    try {
      const next = await removeSeContributor(oppId, userId);
      onChange(next);
    } catch (e) {
      setError((e as Error).message || 'Failed to remove');
    } finally {
      setLoading(false);
    }
  }

  const existingIds = new Set(contributors.map(c => c.id));
  const candidates = allUsers
    .filter(u => u.is_active && u.role !== 'viewer')
    .filter(u => u.id !== ownerId && !existingIds.has(u.id))
    .filter(u => !canManage && canToggleSelf ? u.id === user?.id : true)
    .filter(u => !filter || u.name.toLowerCase().includes(filter.toLowerCase()) || u.email.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="flex items-center gap-1.5 flex-wrap" ref={ref}>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-navy-70 dark:text-fg-2">Contributors</span>
      {contributors.length === 0 && <span className="text-[11px] text-brand-navy-30 dark:text-fg-4">None</span>}
      {contributors.map(c => {
        const canRemove = canManage || (canToggleSelf && c.id === user?.id);
        return (
          <span key={c.id} className="group inline-flex items-center gap-1 bg-brand-purple-30/60 dark:bg-accent-purple-soft text-brand-navy dark:text-fg-1 text-[11px] font-medium px-2 py-0.5 rounded-full">
            {c.name}
            {canRemove && (
              <button
                type="button"
                onClick={() => remove(c.id)}
                disabled={loading}
                className="w-3 h-3 rounded-full text-brand-navy-70 dark:text-fg-2 hover:text-status-overdue dark:text-status-d-overdue transition-colors"
                title={`Remove ${c.name}`}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </span>
        );
      })}

      {(canManage || canToggleSelf) && (
        <div className="relative inline-block">
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            disabled={loading}
            className="text-[11px] text-brand-purple dark:text-accent-purple hover:text-brand-navy dark:text-fg-1 font-medium disabled:opacity-50"
          >
            + Add
          </button>

          {open && (
            <div className="absolute left-0 top-5 z-30 w-64 bg-white dark:bg-ink-1 rounded-lg border border-brand-navy-30 shadow-xl overflow-hidden">
              <div className="p-2 border-b border-brand-navy-30/40 dark:border-ink-border-soft">
                <input
                  autoFocus
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                  placeholder={canManage ? 'Search SE…' : 'Add yourself'}
                  className="w-full px-2 py-1 text-xs border border-brand-navy-30 rounded focus:outline-none focus:ring-1 focus:ring-brand-purple"
                />
              </div>
              {error && <p className="px-3 py-2 text-[11px] text-status-overdue dark:text-status-d-overdue bg-red-50">{error}</p>}
              <ul className="max-h-56 overflow-y-auto">
                {candidates.length === 0 ? (
                  <li className="px-3 py-2 text-xs text-brand-navy-70 dark:text-fg-2">No matches.</li>
                ) : (
                  candidates.slice(0, 20).map(u => (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => add(u.id)}
                        disabled={loading}
                        className="w-full px-3 py-1.5 text-left text-xs hover:bg-brand-purple-30/40 dark:hover:bg-accent-purple-soft transition-colors disabled:opacity-50"
                      >
                        <span className="font-medium text-brand-navy dark:text-fg-1">{u.name}</span>
                        <span className="ml-2 text-brand-navy-70 dark:text-fg-2">{u.email}</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
