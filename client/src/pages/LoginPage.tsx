import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, isLoading, error } = useAuthStore();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await login(email, password);
      navigate('/pipeline');
    } catch {
      // error is set in the store
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7]">
      <div className="w-full max-w-sm px-4">
        {/* Inline wordmark — replaces the large centred icon */}
        <div className="flex items-center gap-2 mb-8">
          <div className="w-6 h-6 rounded-md bg-brand-purple flex items-center justify-center flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-brand-navy tracking-tight">Pipeline Tracker</span>
        </div>

        {/* Single heading — no card wrapper, no duplicate title */}
        <h1 className="text-xl font-semibold text-brand-navy leading-snug tracking-tight mb-1">Welcome back</h1>
        <p className="text-sm text-brand-navy-70 mb-8">Sign in with your Ataccama account to continue.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-brand-navy-70 mb-1.5 tracking-wide">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              placeholder="you@ataccama.com"
              className="w-full px-3.5 py-2.5 rounded-lg border border-brand-navy-30 text-sm text-brand-navy placeholder:text-brand-navy-30 focus:outline-none focus:ring-[3px] focus:ring-brand-purple/15 focus:border-brand-purple transition"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-brand-navy-70 mb-1.5 tracking-wide">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 rounded-lg border border-brand-navy-30 text-sm text-brand-navy placeholder:text-brand-navy-30 focus:outline-none focus:ring-[3px] focus:ring-brand-purple/15 focus:border-brand-purple transition"
            />
          </div>

          {error && (
            <p className="text-sm text-status-overdue bg-red-50 border border-red-100 rounded-lg px-3.5 py-2.5">
              {error}
            </p>
          )}

          <div className="pt-1">
            <button
              type="submit"
              disabled={isLoading}
              className="py-2 px-6 bg-brand-purple hover:bg-brand-purple-70 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition focus:outline-none focus:ring-2 focus:ring-brand-purple focus:ring-offset-2"
            >
              {isLoading ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
