import { NavLink } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/auth';
import { usePipelineStore } from '../store/pipeline';
import { listClosedLost } from '../api/opportunities';
import { listInboxItems } from '../api/inbox';
import { getInsightsNav, type InsightsNavItem } from '../utils/insightsNav';
import { getMainNav, type MainNavItem } from '../utils/mainNav';
import { useTheme } from '../hooks/useTheme';
import type { ThemePreference } from '../types';

const SETTINGS_NAV = [
  { to: '/settings/users',        label: 'Users',            icon: UsersIcon   },
  { to: '/settings/import',       label: 'Import',           icon: ImportIcon  },
  { to: '/settings/import-history', label: 'Import History', icon: HistoryIcon },
  { to: '/settings/menu-settings', label: 'Menu Settings',   icon: InsightIcon },
  { to: '/settings/backup',       label: 'Backup & Restore', icon: BackupIcon  },
  { to: '/settings/deploy',       label: 'Deploy',           icon: DeployIcon  },
  { to: '/settings/deal-info-layout', label: 'Deal Info Layout', icon: LayoutIcon },
  { to: '/settings/quotas',       label: 'Quotas',           icon: QuotasIcon  },
  { to: '/settings/templates',    label: 'Templates',        icon: TemplatesIcon },
  { to: '/settings/knowledge-base', label: 'Knowledge Base', icon: KbIcon },
  { to: '/settings/role-access',  label: 'Role Access',      icon: RoleAccessIcon },
  { to: '/settings/developer',    label: 'Developer',        icon: InsightIcon },
];

function MainNavIcon({ icon }: { icon: MainNavItem['icon'] }) {
  if (icon === 'pipeline')    return <PipelineIcon />;
  if (icon === 'my-pipeline') return (
    <svg className="w-[15px] h-[15px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
  if (icon === 'favorites')  return (
    <svg className="w-[15px] h-[15px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
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
  const { user, allowedPages } = useAuthStore();
  const { setClosedLostUnread, inboxCount, setInboxCount } = usePipelineStore();
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
    <aside className="flex flex-col w-52 min-h-0 bg-brand-navy text-white flex-shrink-0">
      {/* Nav — logo / app name moved to AppHeader. */}
      <nav className="flex-1 px-3 pt-3 pb-2 space-y-0.5 overflow-y-auto">
        {/* Home — always first */}
        <NavLink
          to="/home"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isActive ? 'bg-white/10 text-white border-l-2 border-brand-purple-70' : 'text-white/60 hover:text-white hover:bg-white/[0.07]'
            }`
          }
        >
          <svg className="w-[15px] h-[15px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          <span className="flex-1">Home</span>
        </NavLink>

        {mainNav.filter(i => {
          if (!i.visible) return false;
          if (allowedPages.length === 0) return true; // fallback: show all if not loaded yet
          return allowedPages.includes(i.to.replace(/^\//, ''));
        }).map(({ to, label, icon }) => (
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

        {/* Insights — show if user has any insights page access */}
        {(allowedPages.length === 0 ? user?.role === 'manager' : allowedPages.some(p => p.startsWith('insights/') && !['insights/se-mapping', 'insights/poc-board', 'insights/rfx-board'].includes(p))) && (
          <>
            <button
              onClick={() => setInsightsOpen(o => !o)}
              className="flex items-center gap-1 pt-4 pb-1 px-3 w-full text-left group"
            >
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40 flex-1 group-hover:text-white/60 transition-colors">Insights</p>
              <svg className={`w-3 h-3 text-white/30 transition-transform group-hover:text-white/50 ${insightsOpen ? '' : '-rotate-90'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {insightsOpen && insightsNav.filter(i => {
              if (!i.visible) return false;
              if (allowedPages.length === 0) return true;
              return allowedPages.includes(i.to.replace(/^\//, ''));
            }).map(({ to, label, icon }) => {
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
          </>
        )}

        {/* Administration — show only for admins */}
        {!!user?.is_admin && (
          <>
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
      {/* Footer — theme toggle lives here next to (future) user avatar. #138 */}
      <div className="flex-shrink-0 border-t border-white/10 px-3 py-2">
        <ThemeToggle />
      </div>
    </aside>
  );
}

// Three-state theme toggle: light → dark → system → light.
// Small icon button matching the sidebar's muted-white chrome; no label
// until hover to keep the footer quiet.
function ThemeToggle() {
  const { preference, effective, setTheme } = useTheme();
  const next: ThemePreference =
    preference === 'light' ? 'dark'
    : preference === 'dark'  ? 'system'
    : 'light';
  const labelFor: Record<ThemePreference, string> = {
    light:  'Light theme',
    dark:   'Dark theme',
    system: 'System theme',
  };
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      title={`${labelFor[preference]} — click for ${labelFor[next].toLowerCase()}`}
      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-white/60 hover:text-white hover:bg-white/[0.07] transition-colors"
    >
      <ThemeIcon preference={preference} />
      <span className="flex-1 text-left">
        {preference === 'system' ? `System (${effective})` : labelFor[preference]}
      </span>
    </button>
  );
}

function ThemeIcon({ preference }: { preference: ThemePreference }) {
  if (preference === 'light') {
    // Sun
    return (
      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="4" />
        <path strokeLinecap="round" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    );
  }
  if (preference === 'dark') {
    // Moon
    return (
      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    );
  }
  // Half-sun / half-moon for 'system'
  return (
    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="4" />
      <path strokeLinecap="round" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M2 12h2M4.93 19.07l1.41-1.41" />
      <path d="M12 8a4 4 0 0 0 0 8z" fill="currentColor" />
    </svg>
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

function LayoutIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
    </svg>
  );
}

function RoleAccessIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function TemplatesIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h16M19 9l3 3-3 3" />
    </svg>
  );
}

function KbIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  );
}

function QuotasIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0-6v4m0 12v4m10-10h-4M6 12H2m15.07-7.07l-2.83 2.83M9.76 14.24l-2.83 2.83m0-12.14l2.83 2.83m4.48 4.48l2.83 2.83" />
    </svg>
  );
}
