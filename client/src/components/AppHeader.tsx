/**
 * Top application header (Issue #140 / horizontal redesign).
 *
 * Holds cross-cutting tools that used to crowd the sidebar footer:
 *   Quick note · Recent actions · What's New · How To · user pill
 *
 * Layout:
 *   [ 🟥 Pipeline Tracker ]            ← left: app icon + one-line name
 *                         … chips …    ← right: features
 *                                 ↓T   ← user avatar with dropdown (Sign out, Settings, Shortcuts)
 *
 * Height: 42px (slimmer than a typical 56px top bar — the app already uses
 * the vertical real estate heavily for the sidebar and drawer).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { usePipelineStore } from '../store/pipeline';
import { getChangelog } from '../api/changelog';
import ChangelogModal from './ChangelogModal';
import RecentActionsModal from './RecentActionsModal';
import ConnectionIndicator from './ConnectionIndicator';
import DataFreshnessIndicator from './DataFreshnessIndicator';

/**
 * Pill tooltip shown on hover for icon-only header buttons. Reveals the
 * action name (+ optional kbd hint) below the button. Pure CSS via Tailwind
 * `group-hover:`; no JS / no tooltip library. The parent button must have
 * `className="... group"`.
 */
function TooltipPill({ children }: { children: ReactNode }) {
  return (
    <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-brand-navy opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
      {children}
    </span>
  );
}

/** Square icon button (32x32) with hover-pill tooltip. Navy-header styling. */
const iconBtnClass =
  'group relative inline-flex items-center justify-center w-8 h-8 rounded-md text-white/75 hover:bg-white/10 hover:text-white transition-colors';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export default function AppHeader() {
  const { user, logout } = useAuthStore();
  const openQuickCapture = usePipelineStore((s) => s.openQuickCapture);
  const navigate = useNavigate();

  const [changelogOpen, setChangelogOpen] = useState(false);
  const [changelogUnread, setChangelogUnread] = useState(0);
  const [recentOpen, setRecentOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getChangelog().then(r => setChangelogUnread(r.unread_count)).catch(() => {});
  }, []);

  function openChangelog() {
    setChangelogOpen(true);
    setChangelogUnread(0); // optimistic; server also marks read inside the modal
  }

  // Close the user dropdown on outside click / Escape.
  useEffect(() => {
    if (!userMenuOpen) return;
    function onClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setUserMenuOpen(false); }
    document.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [userMenuOpen]);

  const isViewer = user?.role === 'viewer';

  return (
    <>
      <header className="bg-brand-navy text-white h-[42px] px-4 flex items-center gap-4 flex-shrink-0 border-b border-white/5">
        {/* Left — app icon + name */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-6 h-6 rounded-md bg-brand-pink flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <span className="font-semibold text-[13px] tracking-tight">Pipeline Tracker</span>
        </div>

        <div className="flex-1" />

        {/* Right — connection indicator + icon-only feature buttons + user pill */}
        <nav className="flex items-center gap-1 flex-shrink-0">
          {/* Data freshness (SF import age) + connection indicator — left of the feature buttons */}
          <DataFreshnessIndicator />
          <ConnectionIndicator />

          <div className="w-px h-5 bg-white/10 mx-1" />

          {!isViewer && (
            <button
              onClick={openQuickCapture}
              className={iconBtnClass}
              aria-label="Quick note or task"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <TooltipPill>
                Quick note
                <span className="ml-1.5 font-mono text-[10px] text-brand-navy-70">{isMac ? '⌘K' : 'Ctrl+K'}</span>
              </TooltipPill>
            </button>
          )}

          {!isViewer && (
            <button
              onClick={() => setRecentOpen(true)}
              className={iconBtnClass}
              aria-label="Recent actions"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a4 4 0 014 4v0a4 4 0 01-4 4H9m-6-8l4-4m-4 4l4 4" />
              </svg>
              <TooltipPill>Recent actions</TooltipPill>
            </button>
          )}

          <button
            onClick={openChangelog}
            className={iconBtnClass}
            aria-label="What's New"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {changelogUnread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-brand-pink text-[9px] font-semibold text-white flex items-center justify-center leading-none">
                {changelogUnread}
              </span>
            )}
            <TooltipPill>What's New</TooltipPill>
          </button>

          <NavLink
            to="/settings/how-to"
            className={({ isActive }) =>
              `${iconBtnClass}${isActive ? ' bg-white/10 text-white' : ''}`
            }
            aria-label="How To"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <TooltipPill>How To</TooltipPill>
          </NavLink>

          <div className="w-px h-5 bg-white/10 mx-2" />

          {/* User pill + dropdown. Below the xl breakpoint the name/role text
              collapses — just the avatar + chevron remain (design option A). */}
          <div ref={userMenuRef} className="relative">
            <button
              onClick={() => setUserMenuOpen(o => !o)}
              className="inline-flex items-center gap-2 pl-1 pr-1.5 py-0.5 rounded-md hover:bg-white/10 transition-colors"
            >
              <div className="w-6 h-6 rounded-full bg-brand-purple flex items-center justify-center text-[11px] font-semibold flex-shrink-0">
                {user?.name?.[0]?.toUpperCase() ?? '?'}
              </div>
              <div className="hidden xl:block text-left leading-tight">
                <p className="text-[11px] font-medium max-w-[140px] truncate">{user?.name}</p>
                <p className="text-[9px] text-white/50 capitalize">{user?.role}</p>
              </div>
              <svg className={`w-3 h-3 text-white/40 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-64 bg-white text-brand-navy rounded-xl border border-brand-navy-30 shadow-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-brand-navy-30/40">
                  <p className="text-sm font-semibold truncate">{user?.name}</p>
                  <p className="text-[11px] text-brand-navy-70 truncate">
                    {user?.email}
                    <span className="text-brand-navy-30 mx-1">·</span>
                    <span className="capitalize">{user?.role}</span>
                  </p>
                </div>
                <ul className="py-1">
                  {user?.is_admin && (
                    <li>
                      <button
                        onClick={() => { setUserMenuOpen(false); navigate('/settings/users'); }}
                        className="w-full text-left px-4 py-2 text-xs text-brand-navy hover:bg-brand-purple-30/40 transition-colors"
                      >
                        Settings
                      </button>
                    </li>
                  )}
                  <li><hr className="my-1 border-brand-navy-30/30" /></li>
                  <li>
                    <button
                      onClick={() => { setUserMenuOpen(false); void logout(); }}
                      className="w-full text-left px-4 py-2 text-xs text-status-overdue hover:bg-status-overdue/5 transition-colors"
                    >
                      Sign out
                    </button>
                  </li>
                </ul>
              </div>
            )}
          </div>
        </nav>
      </header>

      <ChangelogModal open={changelogOpen} onClose={() => setChangelogOpen(false)} />
      <RecentActionsModal open={recentOpen} onClose={() => setRecentOpen(false)} />
    </>
  );
}
