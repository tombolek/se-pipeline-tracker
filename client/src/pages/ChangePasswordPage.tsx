import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { changePassword } from '../api/auth';
import { useAuthStore } from '../store/auth';

export default function ChangePasswordPage() {
  const { user, logout } = useAuthStore();
  const setUser = useAuthStore(s => s.setUser);
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }

    setSaving(true);
    try {
      const updated = await changePassword(password);
      setUser(updated);
      navigate('/pipeline', { replace: true });
    } catch {
      setError('Failed to update password. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7] px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-8 h-8 rounded-lg bg-brand-pink flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <span className="font-semibold text-brand-navy text-lg">Pipeline Tracker</span>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-brand-navy-30/40 p-8">
          <div className="mb-6">
            <h1 className="text-lg font-semibold text-brand-navy">Set a new password</h1>
            <p className="text-sm text-brand-navy-70 mt-1">
              Hi {user?.name?.split(' ')[0]}! A temporary password was set for your account. Please choose a new one to continue.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide mb-1">
                New password
              </label>
              <input
                type="password"
                autoFocus
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min. 6 characters"
                className="w-full px-3 py-2.5 rounded-xl border border-brand-navy-30 text-sm text-brand-navy placeholder:text-brand-navy-30 focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide mb-1">
                Confirm password
              </label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Repeat your new password"
                className="w-full px-3 py-2.5 rounded-xl border border-brand-navy-30 text-sm text-brand-navy placeholder:text-brand-navy-30 focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-transparent"
              />
            </div>

            {error && (
              <p className="text-xs text-status-overdue">{error}</p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full py-2.5 bg-brand-purple text-white text-sm font-semibold rounded-xl hover:bg-brand-purple-70 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Set password & continue'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              onClick={logout}
              className="text-xs text-brand-navy-70 hover:text-brand-navy transition-colors"
            >
              Sign in as a different user
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
