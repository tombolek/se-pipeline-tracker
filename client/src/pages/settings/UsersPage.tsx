import { useState, useEffect, useCallback } from 'react';
import type { User } from '../../types';
import {
  listUsers, createUser, updateUser,
  resetUserPassword, listTeams, reassignWorkload,
} from '../../api/users';
import { useAuthStore } from '../../store/auth';
import { formatDate } from '../../utils/formatters';

// ── Shared atoms ──────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: 'manager' | 'se' }) {
  return role === 'manager'
    ? <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-brand-purple/10 text-brand-purple">Manager</span>
    : <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-brand-navy-30/50 text-brand-navy-70">SE</span>;
}

function UserAvatar({ user, size = 8 }: { user: User; size?: number }) {
  const bg = user.role === 'manager' ? 'bg-brand-purple' : 'bg-brand-navy-70';
  return (
    <div className={`w-${size} h-${size} rounded-full ${bg} flex items-center justify-center text-[11px] font-semibold text-white flex-shrink-0`}>
      {user.name[0]?.toUpperCase()}
    </div>
  );
}

// ── Add User Modal ─────────────────────────────────────────────────────────────

function AddUserModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (u: User) => void;
}) {
  const [form, setForm] = useState({ name: '', email: '', role: 'se' as 'manager' | 'se', password: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      setError('All fields are required.'); return;
    }
    setSaving(true); setError(null);
    try {
      const u = await createUser(form);
      onCreated(u);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to create user.');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl border border-brand-navy-30/40 w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-brand-navy mb-5">Add User</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide mb-1">Full Name</label>
            <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Alex Rivera" autoFocus
              className="w-full px-3 py-2 rounded-lg border border-brand-navy-30 text-sm text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-purple" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide mb-1">Email</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="alex@ataccama.com"
              className="w-full px-3 py-2 rounded-lg border border-brand-navy-30 text-sm text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-purple" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide mb-1">Role</label>
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as 'manager' | 'se' }))}
              className="w-full px-3 py-2 rounded-lg border border-brand-navy-30 text-sm text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-purple bg-white">
              <option value="se">SE</option>
              <option value="manager">Manager</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide mb-1">Temporary Password</label>
            <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="Min. 6 characters"
              className="w-full px-3 py-2 rounded-lg border border-brand-navy-30 text-sm text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-purple" />
          </div>
          {error && <p className="text-xs text-status-overdue">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg border border-brand-navy-30 text-sm text-brand-navy-70 hover:text-brand-navy transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 rounded-lg bg-brand-purple text-white text-sm font-semibold hover:bg-brand-purple-70 disabled:opacity-50 transition-colors">
              {saving ? 'Creating…' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Reset Password Modal ───────────────────────────────────────────────────────

function ResetPasswordModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.trim().length < 6) { setError('Minimum 6 characters'); return; }
    setSaving(true); setError(null);
    try {
      await resetUserPassword(user.id, password.trim());
      setDone(true);
      setTimeout(onClose, 1500);
    } catch { setError('Failed to reset password.'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl border border-brand-navy-30/40 w-full max-w-sm mx-4 p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-brand-navy mb-1">Reset password</h2>
        <p className="text-xs text-brand-navy-70 mb-5">Set a new temporary password for <span className="font-medium text-brand-navy">{user.name}</span>.</p>
        {done ? (
          <p className="text-sm text-status-success font-medium flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
            Password updated
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input type="password" autoFocus value={password} onChange={e => setPassword(e.target.value)}
              placeholder="New password (min. 6 characters)"
              className="w-full px-3 py-2 rounded-lg border border-brand-navy-30 text-sm text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-purple" />
            {error && <p className="text-xs text-status-overdue">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose}
                className="px-4 py-2 rounded-lg border border-brand-navy-30 text-sm text-brand-navy-70 hover:text-brand-navy transition-colors">Cancel</button>
              <button type="submit" disabled={saving}
                className="px-4 py-2 rounded-lg bg-brand-purple text-white text-sm font-semibold hover:bg-brand-purple-70 disabled:opacity-50 transition-colors">
                {saving ? 'Saving…' : 'Set password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Reassign Workload Modal ────────────────────────────────────────────────────

function ReassignWorkloadModal({ user, activeUsers, onClose, onDone }: {
  user: User;
  activeUsers: User[];
  onClose: () => void;
  onDone: () => void;
}) {
  const candidates = activeUsers.filter(u => u.id !== user.id);
  const [toUserId, setToUserId] = useState<number | ''>(candidates[0]?.id ?? '');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ tasks_reassigned: number; opps_reassigned: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!toUserId) return;
    setSaving(true); setError(null);
    try {
      const res = await reassignWorkload(user.id, toUserId as number);
      setResult(res);
      setTimeout(onDone, 1800);
    } catch { setError('Failed to reassign workload.'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl border border-brand-navy-30/40 w-full max-w-sm mx-4 p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-brand-navy mb-1">Reassign workload</h2>
        <p className="text-xs text-brand-navy-70 mb-5">
          All tasks assigned to and open opportunities owned by <span className="font-medium text-brand-navy">{user.name}</span> will be transferred to:
        </p>
        {result ? (
          <p className="text-sm text-status-success font-medium flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
            {result.tasks_reassigned} task{result.tasks_reassigned !== 1 ? 's' : ''} and {result.opps_reassigned} deal{result.opps_reassigned !== 1 ? 's' : ''} transferred
          </p>
        ) : (
          <div className="space-y-4">
            <select value={toUserId} onChange={e => setToUserId(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-brand-navy-30 text-sm text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-purple bg-white">
              {candidates.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
            </select>
            {error && <p className="text-xs text-status-overdue">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={onClose}
                className="px-4 py-2 rounded-lg border border-brand-navy-30 text-sm text-brand-navy-70 hover:text-brand-navy transition-colors">Cancel</button>
              <button onClick={handleConfirm} disabled={saving || !toUserId}
                className="px-4 py-2 rounded-lg bg-brand-purple text-white text-sm font-semibold hover:bg-brand-purple-70 disabled:opacity-50 transition-colors">
                {saving ? 'Transferring…' : 'Transfer'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Deactivate Modal (with optional workload reassignment) ────────────────────

function DeactivateModal({ user, activeUsers, onClose, onDone }: {
  user: User;
  activeUsers: User[];
  onClose: () => void;
  onDone: (updated: User) => void;
}) {
  const candidates = activeUsers.filter(u => u.id !== user.id);
  const [withReassign, setWithReassign] = useState(true);
  const [toUserId, setToUserId] = useState<number | ''>(candidates[0]?.id ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setSaving(true); setError(null);
    try {
      if (withReassign && toUserId) {
        await reassignWorkload(user.id, toUserId as number);
      }
      const updated = await updateUser(user.id, { is_active: false });
      onDone(updated);
    } catch { setError('Something went wrong. Please try again.'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl border border-brand-navy-30/40 w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-full bg-status-warning/10 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-status-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-brand-navy">Deactivate {user.name}?</h2>
            <p className="text-xs text-brand-navy-70 mt-0.5">They will no longer be able to log in.</p>
          </div>
        </div>

        <p className="text-sm text-brand-navy-70 mb-4">
          Would you like to reassign their open deals and tasks to another team member first?
        </p>

        <div className="space-y-2 mb-5">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input type="radio" checked={withReassign} onChange={() => setWithReassign(true)} className="mt-0.5 accent-brand-purple" />
            <div>
              <span className="text-sm font-medium text-brand-navy">Yes, reassign workload to:</span>
              {withReassign && (
                <select value={toUserId} onChange={e => setToUserId(Number(e.target.value))}
                  className="mt-1.5 w-full px-3 py-1.5 rounded-lg border border-brand-navy-30 text-sm text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-purple bg-white">
                  {candidates.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                </select>
              )}
            </div>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="radio" checked={!withReassign} onChange={() => setWithReassign(false)} className="accent-brand-purple" />
            <span className="text-sm text-brand-navy-70">No, just deactivate</span>
          </label>
        </div>

        {error && <p className="text-xs text-status-overdue mb-3">{error}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={saving}
            className="px-4 py-2 rounded-lg border border-brand-navy-30 text-sm text-brand-navy-70 hover:text-brand-navy transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button onClick={handleConfirm} disabled={saving || (withReassign && !toUserId)}
            className="px-4 py-2 rounded-lg bg-status-warning text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity">
            {saving ? 'Deactivating…' : 'Deactivate'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Org Chart ─────────────────────────────────────────────────────────────

function OrgChartTab({ users, setUsers, availableTeams, currentUserId }: {
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  availableTeams: string[];
  currentUserId: number | undefined;
}) {
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const managers = users.filter(u => u.role === 'manager');
  const seUsers = users.filter(u => u.role === 'se');
  const unassigned = seUsers.filter(u => !u.manager_id || !managers.find(m => m.id === u.manager_id));

  async function handleReassign(se: User, managerId: number | null) {
    setUpdatingId(se.id);
    try {
      const updated = await updateUser(se.id, { manager_id: managerId });
      setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
    } finally { setUpdatingId(null); }
  }

  async function handleToggleTerritory(mgr: User, territory: string) {
    setUpdatingId(mgr.id);
    try {
      const current = mgr.teams ?? [];
      const teams = current.includes(territory)
        ? current.filter(t => t !== territory)
        : [...current, territory];
      const updated = await updateUser(mgr.id, { teams });
      setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
    } finally { setUpdatingId(null); }
  }

  function SeCard({ se }: { se: User }) {
    return (
      <div className={`flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-brand-purple-30/20 transition-colors ${!se.is_active ? 'opacity-50' : ''}`}>
        <UserAvatar user={se} size={7} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-brand-navy truncate">{se.name}</p>
          <p className="text-[11px] text-brand-navy-70 truncate">{se.email}</p>
        </div>
        {!se.is_active && <span className="text-[10px] text-brand-navy-30 font-medium">Inactive</span>}
        <select
          value={se.manager_id ?? ''}
          onChange={e => handleReassign(se, e.target.value ? parseInt(e.target.value) : null)}
          disabled={updatingId === se.id}
          className="text-xs border border-brand-navy-30 rounded-lg px-2 py-1 text-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-purple disabled:opacity-50 bg-white"
        >
          <option value="">No manager</option>
          {managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {managers.length === 0 && (
        <div className="text-sm text-brand-navy-70 py-8 text-center">No managers found.</div>
      )}
      {managers.map(mgr => {
        const reports = seUsers.filter(u => u.manager_id === mgr.id);
        const isSelf = mgr.id === currentUserId;
        return (
          <div key={mgr.id} className={`bg-white rounded-2xl border border-brand-navy-30/40 overflow-hidden ${!mgr.is_active ? 'opacity-60' : ''}`}>
            {/* Manager header */}
            <div className="flex items-start gap-3 px-5 py-4 border-b border-brand-navy-30/30 bg-brand-purple-30/10">
              <UserAvatar user={mgr} size={9} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-brand-navy">{mgr.name}</span>
                  <RoleBadge role="manager" />
                  {isSelf && <span className="text-[10px] text-brand-navy-70">(you)</span>}
                  {!mgr.is_active && <span className="text-[10px] font-medium text-brand-navy-30">Inactive</span>}
                </div>
                <p className="text-xs text-brand-navy-70 mt-0.5">{mgr.email}</p>
                {/* Territory chips */}
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {availableTeams.map(t => {
                    const active = (mgr.teams ?? []).includes(t);
                    return (
                      <button key={t}
                        onClick={() => handleToggleTerritory(mgr, t)}
                        disabled={updatingId === mgr.id}
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors disabled:opacity-50 ${
                          active ? 'bg-brand-purple text-white' : 'bg-brand-navy-30/30 text-brand-navy-70 hover:bg-brand-purple/10 hover:text-brand-purple'
                        }`}>
                        {t}
                      </button>
                    );
                  })}
                  {availableTeams.length === 0 && <span className="text-[11px] text-brand-navy-30">No territories configured</span>}
                </div>
              </div>
              <div className="text-xs text-brand-navy-30 font-medium mt-0.5">
                {reports.length} SE{reports.length !== 1 ? 's' : ''}
              </div>
            </div>
            {/* Direct reports */}
            <div className="px-4 py-1 divide-y divide-brand-navy-30/10">
              {reports.length === 0 ? (
                <p className="text-xs text-brand-navy-30 py-3 pl-1">No direct reports</p>
              ) : (
                reports.map(se => <SeCard key={se.id} se={se} />)
              )}
            </div>
          </div>
        );
      })}

      {/* Unassigned SEs */}
      {unassigned.length > 0 && (
        <div className="bg-white rounded-2xl border border-brand-navy-30/40 overflow-hidden">
          <div className="px-5 py-3 border-b border-brand-navy-30/30 bg-gray-50">
            <span className="text-xs font-semibold text-brand-navy-70 uppercase tracking-wide">Not assigned to a manager</span>
          </div>
          <div className="px-4 py-1 divide-y divide-brand-navy-30/10">
            {unassigned.map(se => <SeCard key={se.id} se={se} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Access Management ─────────────────────────────────────────────────────

function AccessManagementTab({ users, setUsers, currentUserId }: {
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  currentUserId: number | undefined;
}) {
  const [search, setSearch] = useState('');
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [reassignTarget, setReassignTarget] = useState<User | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null);

  const activeUsers = users.filter(u => u.is_active);
  const q = search.toLowerCase();
  const filtered = users
        .filter(u => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));

  async function handleToggleRole(u: User) {
    setUpdatingId(u.id);
    try {
      const updated = await updateUser(u.id, { role: u.role === 'manager' ? 'se' : 'manager' });
      setUsers(prev => prev.map(x => x.id === updated.id ? updated : x));
    } finally { setUpdatingId(null); }
  }

  async function handleReactivate(u: User) {
    setUpdatingId(u.id);
    try {
      const updated = await updateUser(u.id, { is_active: true });
      setUsers(prev => prev.map(x => x.id === updated.id ? updated : x));
    } finally { setUpdatingId(null); }
  }

  return (
    <div>
      {/* Modals */}
      {showAdd && (
        <AddUserModal
          onClose={() => setShowAdd(false)}
          onCreated={u => { setUsers(prev => [...prev, u]); setShowAdd(false); }}
        />
      )}
      {resetTarget && (
        <ResetPasswordModal user={resetTarget} onClose={() => setResetTarget(null)} />
      )}
      {reassignTarget && (
        <ReassignWorkloadModal
          user={reassignTarget}
          activeUsers={activeUsers}
          onClose={() => setReassignTarget(null)}
          onDone={() => setReassignTarget(null)}
        />
      )}
      {deactivateTarget && (
        <DeactivateModal
          user={deactivateTarget}
          activeUsers={activeUsers}
          onClose={() => setDeactivateTarget(null)}
          onDone={updated => {
            setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
            setDeactivateTarget(null);
          }}
        />
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="Search users…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 max-w-xs px-3 py-2 rounded-lg border border-brand-navy-30 text-sm text-brand-navy placeholder:text-brand-navy-70 focus:outline-none focus:ring-2 focus:ring-brand-purple"
        />
        <button
          onClick={() => setShowAdd(true)}
          className="ml-auto px-4 py-2 bg-brand-purple text-white text-sm font-semibold rounded-xl hover:bg-brand-purple-70 transition-colors"
        >
          + Add User
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-brand-navy-30/40 overflow-hidden">
        <table className="w-full">
          <thead className="border-b border-brand-navy-30/40">
            <tr>
              {['User', 'Role', 'Status', 'Last Login', 'Actions'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => {
              const isSelf = u.id === currentUserId;
              const isUpdating = updatingId === u.id;
              return (
                <tr key={u.id} className={`border-b border-brand-navy-30/20 last:border-0 ${!u.is_active ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <UserAvatar user={u} size={7} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-brand-navy">
                          {u.name}
                          {isSelf && <span className="ml-1.5 text-[10px] text-brand-navy-70 font-normal">(you)</span>}
                        </p>
                        <p className="text-xs text-brand-navy-70 truncate">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                  <td className="px-4 py-3">
                    {u.is_active
                      ? <span className="flex items-center gap-1.5 text-xs text-status-success font-medium"><span className="w-1.5 h-1.5 rounded-full bg-status-success inline-block" />Active</span>
                      : <span className="flex items-center gap-1.5 text-xs text-brand-navy-70"><span className="w-1.5 h-1.5 rounded-full bg-brand-navy-30 inline-block" />Inactive</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-xs text-brand-navy-70">
                    {u.last_login_at ? formatDate(u.last_login_at) : <span className="text-brand-navy-30">Never</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button onClick={() => handleToggleRole(u)} disabled={isUpdating}
                        className="text-xs px-2.5 py-1 rounded-lg border border-brand-navy-30 text-brand-navy-70 hover:border-brand-purple hover:text-brand-purple transition-colors disabled:opacity-40">
                        {u.role === 'manager' ? 'Make SE' : 'Make Manager'}
                      </button>
                      {u.is_active ? (
                        <button onClick={() => !isSelf && setDeactivateTarget(u)}
                          disabled={isSelf || isUpdating}
                          title={isSelf ? "Can't deactivate your own account" : undefined}
                          className="text-xs px-2.5 py-1 rounded-lg border border-brand-navy-30 text-brand-navy-70 hover:border-status-warning hover:text-status-warning transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                          Deactivate
                        </button>
                      ) : (
                        <button onClick={() => handleReactivate(u)} disabled={isUpdating}
                          className="text-xs px-2.5 py-1 rounded-lg border border-brand-navy-30 text-brand-navy-70 hover:border-status-success hover:text-status-success transition-colors disabled:opacity-40">
                          Reactivate
                        </button>
                      )}
                      <button onClick={() => setResetTarget(u)} disabled={isUpdating}
                        className="text-xs px-2.5 py-1 rounded-lg border border-brand-navy-30 text-brand-navy-70 hover:border-brand-purple hover:text-brand-purple transition-colors disabled:opacity-40">
                        Reset pwd
                      </button>
                      <button onClick={() => setReassignTarget(u)} disabled={isUpdating}
                        className="text-xs px-2.5 py-1 rounded-lg border border-brand-navy-30 text-brand-navy-70 hover:border-brand-navy hover:text-brand-navy transition-colors disabled:opacity-40">
                        Reassign
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="text-sm text-brand-navy-70 py-10 text-center">No users found.</p>
        )}
      </div>
    </div>
  );
}

// ── Tab: Access Audit ──────────────────────────────────────────────────────────

function AccessAuditTab({ users }: { users: User[] }) {
  const sorted = [...users]
        .sort((a, b) => {
      if (!a.last_login_at && !b.last_login_at) return 0;
      if (!a.last_login_at) return 1;
      if (!b.last_login_at) return -1;
      return new Date(b.last_login_at).getTime() - new Date(a.last_login_at).getTime();
    });

  return (
    <div className="bg-white rounded-2xl border border-brand-navy-30/40 overflow-hidden">
      <table className="w-full">
        <thead className="border-b border-brand-navy-30/40">
          <tr>
            {['User', 'Role', 'Status', 'Last Login'].map(h => (
              <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(u => (
            <tr key={u.id} className={`border-b border-brand-navy-30/20 last:border-0 ${!u.is_active ? 'opacity-60' : ''}`}>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <UserAvatar user={u} size={7} />
                  <div>
                    <p className="text-sm font-medium text-brand-navy">{u.name}</p>
                    <p className="text-xs text-brand-navy-70">{u.email}</p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
              <td className="px-4 py-3">
                {u.is_active
                  ? <span className="flex items-center gap-1.5 text-xs text-status-success font-medium"><span className="w-1.5 h-1.5 rounded-full bg-status-success inline-block" />Active</span>
                  : <span className="flex items-center gap-1.5 text-xs text-brand-navy-70"><span className="w-1.5 h-1.5 rounded-full bg-brand-navy-30 inline-block" />Inactive</span>
                }
              </td>
              <td className="px-4 py-3 text-xs text-brand-navy-70">
                {u.last_login_at
                  ? <span>{formatDate(u.last_login_at)}</span>
                  : <span className="text-brand-navy-30">Never logged in</span>
                }
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = 'org-chart' | 'access-management' | 'audit';

const TABS: { id: Tab; label: string }[] = [
  { id: 'org-chart',          label: 'Org Chart' },
  { id: 'access-management',  label: 'Access Management' },
  { id: 'audit',              label: 'Access Audit' },
];

export default function UsersPage() {
  const { user: currentUser } = useAuthStore();
  const [tab, setTab] = useState<Tab>('org-chart');
  const [users, setUsers] = useState<User[]>([]);
  const [availableTeams, setAvailableTeams] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setUsers(await listUsers()); }
    catch { setError('Failed to load users.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { listTeams().then(setAvailableTeams).catch(() => {}); }, []);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-brand-navy">Users</h1>
        <p className="text-sm text-brand-navy-70 mt-0.5">Manage team members, roles, and access</p>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 border-b border-brand-navy-30/40 mb-6">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px ${
              tab === t.id
                ? 'border-brand-purple text-brand-purple'
                : 'border-transparent text-brand-navy-70 hover:text-brand-navy'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading && <div className="text-sm text-brand-navy-70 py-10 text-center">Loading…</div>}
      {error && <div className="text-sm text-status-overdue py-4">{error}</div>}
      {!loading && !error && (
        <>
          {tab === 'org-chart' && (
            <OrgChartTab
              users={users}
              setUsers={setUsers}
              availableTeams={availableTeams}
              currentUserId={currentUser?.id}
            />
          )}
          {tab === 'access-management' && (
            <AccessManagementTab
              users={users}
              setUsers={setUsers}
              currentUserId={currentUser?.id}
            />
          )}
          {tab === 'audit' && (
            <AccessAuditTab users={users} />
          )}
        </>
      )}
    </div>
  );
}
