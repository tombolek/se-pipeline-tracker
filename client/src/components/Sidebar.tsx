import { NavLink } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/auth';
import { usePipelineStore } from '../store/pipeline';
import { listClosedLost } from '../api/opportunities';
import { listInboxItems } from '../api/inbox';
import { getInsightsNav, type InsightsNavItem } from '../utils/insightsNav';
import { getMainNav, type MainNavItem } from '../utils/mainNav';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

const SETTINGS_NAV = [
  { to: '/settings/users',        label: 'Users',            icon: UsersIcon   },
  { to: '/settings/import',       label: 'Import',           icon: ImportIcon  },
  { to: '/settings/import-history', label: 'Import History', icon: HistoryIcon },
  { to: '/settings/menu-settings', label: 'Menu Settings',   icon: InsightIcon },
  { to: '/settings/backup',       label: 'Backup & Restore', icon: BackupIcon  },
  { to: '/settings/deploy',       label: 'Deploy',           icon: DeployIcon  },
];

function MainNavIcon({ icon }: { icon: MainNavItem['icon'] }) {
  if (icon === 'pipeline')    return <PipelineIcon />;
  if (icon === 'my-pipeline') return (
    <svg className="w-[15px] h-[15px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
  if (icon === 'tasks')      return <TasksIcon />;
  if (icon === 'calendar')   return <CalendarIcon />;
  if (icon === 'se-mapping') return <SeMappingIcon />;
  if (icon === 'poc')        return <PocIcon />;
  if (icon === 'rfx')        return <RfxIcon />;
  return <InsightIcon />;
}

export default function Sidebar() {
  const { user, logout } = useAuthStore();
  const { setClosedLostUnread, inboxCount, setInboxCount, openQuickCapture } = usePipelineStore();
  const [insightsOpen, setInsightsOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [insightsNav, setInsightsNav] = useState<InsightsNavItem[]>(() => getInsightsNav());
  const [mainNav, setMainNav] = useState<MainNavItem[]>(() => getMainNav());

  useEffect(() => {
    listClosedLost()
      .then(({ unreadCount }) => setClosedLostUnread(unreadCount))
      .catch(() => {});
    listInboxItems()
      .then(items => setInboxCount(items.filter(i => i.status === 'open').length))
      .catch(() => {});
  }, [setClosedLostUnread, setInboxCount]);

  useEffect(() => {
    function onInsightsChanged() { setInsightsNav(getInsightsNav()); }
    function onMainChanged() { setMainNav(getMainNav()); }
    window.addEventListener('insightsNavChanged', onInsightsChanged);
    window.addEventListener('mainNavChanged', onMainChanged);
    return () => {
      window.removeEventListener('insightsNavChanged', onInsightsChanged);
      window.removeEventListener('mainNavChanged', onMainChanged);
    };
  }, []);

  return (
    <aside className="flex flex-col w-56 min-h-screen bg-brand-navy text-white flex-shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-white/10">
        <div className="w-7 h-7 rounded-lg bg-brand-pink flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <span className="font-semibold text-sm leading-tight">Pipeline<br/>Tracker</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
        {mainNav.filter(i => i.visible).map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-white/10 text-white border-l-2 border-brand-purple-70' : 'text-white/60 hover:text-white hover:bg-white/[0.07]'
              }`
            }
          >
            <MainNavIcon icon={icon} />
            <span className="flex-1">{label}</span>
            {to === '/my-tasks' && inboxCount > 0 && (
              <span className="text-[10px] font-semibold bg-white/10 text-white/60 rounded px-1.5 py-px min-w-[18px] text-center leading-tight">
                {inboxCount}
              </span>
            )}
          </NavLink>
        ))}

        {user?.role === 'manager' && (
          <>
            {/* Insights — collapsible */}
            <button
              onClick={() => setInsightsOpen(o => !o)}
              className="flex items-center gap-1 pt-4 pb-1 px-3 w-full text-left group"
            >
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40 flex-1 group-hover:text-white/60 transition-colors">Insights</p>
              <svg className={`w-3 h-3 text-white/30 transition-transform group-hover:text-white/50 ${insightsOpen ? '' : '-rotate-90'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {insightsOpen && insightsNav.filter(i => i.visible).map(({ to, label, icon }) => {
              const Icon = icon === 'poc' ? PocIcon : InsightIcon;
              return (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive ? 'bg-white/10 text-white border-l-2 border-brand-purple-70' : 'text-white/60 hover:text-white hover:bg-white/[0.07]'
                    }`
                  }
                >
                  <Icon />
                  {label}
                </NavLink>
              );
            })}

            {/* Administration — collapsible (Settings + Audit) */}
            <button
              onClick={() => setSettingsOpen(o => !o)}
              className="flex items-center gap-1 pt-4 pb-1 px-3 w-full text-left group"
            >
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40 flex-1 group-hover:text-white/60 transition-colors">Administration</p>
              <svg className={`w-3 h-3 text-white/30 transition-transform group-hover:text-white/50 ${settingsOpen ? '' : '-rotate-90'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {settingsOpen && (
              <>
                <NavLink
                  to="/audit"
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive ? 'bg-white/10 text-white border-l-2 border-brand-purple-70' : 'text-white/60 hover:text-white hover:bg-white/[0.07]'
                    }`
                  }
                >
                  <AuditIcon />
                  Audit
                </NavLink>
                {SETTINGS_NAV.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isActive ? 'bg-white/10 text-white border-l-2 border-brand-purple-70' : 'text-white/60 hover:text-white hover:bg-white/[0.07]'
                      }`
                    }
                  >
                    <Icon />
                    {label}
                  </NavLink>
                ))}
              </>
            )}
          </>
        )}
      </nav>

      {/* User footer */}
      <div className="px-3 pt-3 pb-4 border-t border-white/10">
        {/* Quick Capture */}
        <button
          onClick={openQuickCapture}
          className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-lg text-xs text-white/50 hover:text-white/80 hover:bg-white/10 transition-colors mb-0.5"
        >
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          <span>Quick note or task</span>
          <span className="text-[10px] text-white/30 ml-auto">{isMac ? '⌘K' : 'Ctrl+K'}</span>
        </button>
        {/* How To — full-width, visually distinct */}
        <NavLink
          to="/settings/how-to"
          className={({ isActive }) =>
            `flex items-center gap-2 w-full px-2 py-2 rounded-lg text-xs font-medium transition-colors mb-1 border ${
              isActive
                ? 'text-white bg-white/15 border-white/25'
                : 'text-white/70 border-white/20 hover:text-white hover:bg-white/10 hover:border-white/30'
            }`
          }
        >
          <HowToIcon />
          <span>How To</span>
        </NavLink>

        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg">
          <div className="w-7 h-7 rounded-full bg-brand-purple flex items-center justify-center text-xs font-semibold flex-shrink-0">
            {user?.name?.[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{user?.name}</p>
            <p className="text-[10px] text-white/50 capitalize">{user?.role}</p>
          </div>
          <button
            onClick={logout}
            title="Sign out"
            className="text-white/40 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}

function PipelineIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}


function TasksIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  );
}


function InsightIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}

function ImportIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  );
}

function PocIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  );
}

function SeMappingIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function RfxIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function BackupIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function AuditIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  );
}

function DeployIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  );
}

function HowToIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  );
}
