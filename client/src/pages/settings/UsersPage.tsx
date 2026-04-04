import { useState, useEffect, useCallback } from 'react';
import type { User } from '../../types';
import { listUsers, createUser, updateUser, deleteUser, resetUserPassword } from '../../api/users';
import { useAuthStore } from '../../store/auth';
import { formatDate } from '../../utils/formatters';

function RoleBadge({ role }: { role: 'manager' | 'se' }) {
  return role === 'manager'
    ? <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-brand-purple/10 text-brand-purple">Manager</span>
    : <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-brand-navy-30/50 text-brand-navy-70">SE</span>;
}

interface AddFormState {
  name: string;
  email: string;
  role: 'manager' | 'se';
  password: string;
}

// ── Confirm Delete Modal ───────────────────────────────────────────────────────
function ConfirmDeleteModal({ user, onConfirm, onCancel, deleting }: {
  user: User;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl border border-brand-navy-30/40 w-full max-w-md mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-full bg-status-overdue/10 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-status-overdue" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-brand-navy">Delete user?</h2>
            <p className="text-xs text-brand-navy-70 mt-0.5">This action cannot be undone.</p>
          </div>
        </div>

        <p className="text-sm text-brand-navy mb-2">
          You are about to permanently delete <span className="font-semibold">{user.name}</span> ({user.email}).
        </p>
        <ul className="text-xs text-brand-navy-70 space-y-1 mb-5 ml-3 list-disc">
          <li>The user will no longer be able to log in</li>
          <li>Any opportunities assigned to them will become unassigned</li>
          <li>Their tasks and notes will remain but will show as orphaned</li>
        </ul>

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="px-4 py-2 rounded-lg border border-brand-navy-30 text-sm text-brand-navy-70 hover:border-brand-navy hover:text-brand-navy transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="px-4 py-2 rounded-lg bg-status-overdue text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1.5"
          >
            {deleting ? (
              <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Deleting…</>
            ) : 'Delete user'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Reset Password Inline Form ─────────────────────────────────────────────────
function ResetPasswordRow({ user, onDone }: { user: User; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.trim().length < 6) { setError('Minimum 6 characters'); return; }
    setSaving(true);
    setError(null);
    try {
      await resetUserPassword(user.id, password.trim());
      setSuccess(true);
      setTimeout(onDone, 1200);
    } catch {
      setError('Failed to reset password.');
    } finally {
      setSaving(false);
    }
  }

  if (success) {
    return (
      <td colSpan={6} className="px-4 py-3 bg-status-success/5">
        <span className="text-xs text-status-success font-medium flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
          Password updated for {user.name}
        </span>
      </td>
    );
  }

  return (
    <td colSpan={6} className="px-4 py-2 bg-brand-purple/5">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <span className="text-xs text-brand-navy-70">New password for <span className="font-medium text-brand-navy">{user.name}</span>:</span>
        <input
          autoFocus
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Min. 6 characters"
          className="px-2.5 py-1.5 rounded-lg border border-brand-navy-30 text-sm text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-purple w-48"
        />
        {error && <span className="text-xs text-status-overdue">{error}</span>}
        <button
          type="submit"
          disabled={saving}
          className="px-3 py-1.5 rounded-lg bg-brand-purple text-white text-xs font-semibold hover:bg-brand-purple-70 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Set password'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="px-3 py-1.5 rounded-lg border border-brand-navy-30 text-xs text-brand-navy-70 hover:text-brand-navy transition-colors"
        >
          Cancel
        </button>
      </form>
    </td>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function UsersPage() {
  const { user: currentUser } = useAuthStore();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<AddFormState>({ name: '', email: '', role: 'se', password: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [resetPasswordId, setResetPasswordId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await listUsers());
    } catch {
      setError('Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      setFormError('All fields are required.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await createUser(form);
      setForm({ name: '', email: '', role: 'se', password: '' });
      setShowAdd(false);
      await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setFormError(msg ?? 'Failed to create user.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleRole(u: User) {
    setUpdatingId(u.id);
    try {
      const updated = await updateUser(u.id, { role: u.role === 'manager' ? 'se' : 'manager' });
      setUsers(prev => prev.map(x => x.id === updated.id ? updated : x));
    } finally {
      setUpdatingId(null);
    }
  }

  async function toggleActive(u: User) {
    setUpdatingId(u.id);
    try {
      const updated = await updateUser(u.id, { is_active: !u.is_active });
      setUsers(prev => prev.map(x => x.id === updated.id ? updated : x));
    } finally {
      setUpdatingId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteUser(deleteTarget.id);
      setUsers(prev => prev.filter(x => x.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      {deleteTarget && (
        <ConfirmDeleteModal
          user={deleteTarget}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
          deleting={deleting}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-brand-navy">Users</h1>
          <p className="text-sm text-brand-navy-70 mt-0.5">Manage team members and their roles</p>
        </div>
        <button
          onClick={() => { setShowAdd(v => !v); setFormError(null); }}
          className="px-4 py-2 bg-brand-purple text-white text-sm font-semibold rounded-xl hover:bg-brand-purple-70 transition-colors"
        >
          {showAdd ? 'Cancel' : '+ Add User'}
        </button>
      </div>

      {/* Add User form */}
      {showAdd && (
        <form onSubmit={handleAdd} className="bg-white rounded-2xl border border-brand-navy-30/40 p-5 mb-4">
          <h2 className="text-sm font-semibold text-brand-navy mb-4">New User</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide mb-1">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Full name"
                className="w-full px-3 py-2 rounded-lg border border-brand-navy-30 text-sm text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-purple"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="you@ataccama.com"
                className="w-full px-3 py-2 rounded-lg border border-brand-navy-30 text-sm text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-purple"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide mb-1">Role</label>
              <select
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value as 'manager' | 'se' }))}
                className="w-full px-3 py-2 rounded-lg border border-brand-navy-30 text-sm text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-purple"
              >
                <option value="se">SE</option>
                <option value="manager">Manager</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide mb-1">Temporary Password</label>
              <input
                type="password"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Set a temporary password"
                className="w-full px-3 py-2 rounded-lg border border-brand-navy-30 text-sm text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-purple"
              />
            </div>
          </div>
          {formError && <p className="text-xs text-status-overdue mt-3">{formError}</p>}
          <div className="flex justify-end mt-4">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-brand-purple text-white text-sm font-semibold rounded-xl hover:bg-brand-purple-70 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Creating…' : 'Create User'}
            </button>
          </div>
        </form>
      )}

      {/* Users table */}
      {loading && <div className="text-sm text-brand-navy-70 py-10 text-center">Loading…</div>}
      {error && <div className="text-sm text-status-overdue py-4">{error}</div>}
      {!loading && !error && (
        <div className="bg-white rounded-2xl border border-brand-navy-30/40 overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-brand-navy-30/40">
              <tr>
                {['Name', 'Email', 'Role', 'Last Login', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === currentUser?.id;
                const isUpdating = updatingId === u.id;
                const showResetForm = resetPasswordId === u.id;
                return [
                  <tr key={u.id} className={`border-b border-brand-navy-30/20 ${showResetForm ? '' : 'last:border-0'} ${!u.is_active ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-brand-purple flex items-center justify-center text-[10px] font-semibold text-white flex-shrink-0">
                          {u.name[0]?.toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-brand-navy">{u.name}</span>
                        {isSelf && <span className="text-[10px] text-brand-navy-70">(you)</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-brand-navy-70">{u.email}</td>
                    <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                    <td className="px-4 py-3 text-xs text-brand-navy-70">{u.last_login_at ? formatDate(u.last_login_at) : <span className="text-brand-navy-30">Never</span>}</td>
                    <td className="px-4 py-3">
                      {u.is_active
                        ? <span className="flex items-center gap-1.5 text-xs text-status-success font-medium"><span className="w-1.5 h-1.5 rounded-full bg-status-success" />Active</span>
                        : <span className="flex items-center gap-1.5 text-xs text-brand-navy-70"><span className="w-1.5 h-1.5 rounded-full bg-brand-navy-30" />Inactive</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleRole(u)}
                          disabled={isUpdating}
                          className="text-xs px-2.5 py-1 rounded-lg border border-brand-navy-30 text-brand-navy-70 hover:border-brand-purple hover:text-brand-purple transition-colors disabled:opacity-40"
                        >
                          {u.role === 'manager' ? 'Make SE' : 'Make Manager'}
                        </button>
                        <button
                          onClick={() => toggleActive(u)}
                          disabled={isSelf || isUpdating}
                          title={isSelf ? "Can't deactivate your own account" : undefined}
                          className="text-xs px-2.5 py-1 rounded-lg border border-brand-navy-30 text-brand-navy-70 hover:border-brand-navy hover:text-brand-navy transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          {u.is_active ? 'Deactivate' : 'Reactivate'}
                        </button>
                        <button
                          onClick={() => setResetPasswordId(showResetForm ? null : u.id)}
                          disabled={isUpdating}
                          className="text-xs px-2.5 py-1 rounded-lg border border-brand-navy-30 text-brand-navy-70 hover:border-brand-purple hover:text-brand-purple transition-colors disabled:opacity-40"
                        >
                          Reset pwd
                        </button>
                        {!isSelf && (
                          <button
                            onClick={() => setDeleteTarget(u)}
                            disabled={isUpdating}
                            className="text-xs px-2.5 py-1 rounded-lg border border-brand-navy-30 text-status-overdue/70 hover:border-status-overdue hover:text-status-overdue transition-colors disabled:opacity-40"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>,
                  showResetForm && (
                    <tr key={`${u.id}-reset`} className="border-b border-brand-navy-30/20 last:border-0">
                      <ResetPasswordRow user={u} onDone={() => setResetPasswordId(null)} />
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
