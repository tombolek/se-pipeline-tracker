import { NavLink } from 'react-router-dom';
import { useEffect, useState, useMemo } from 'react';
import { useAuthStore } from '../store/auth';
import { usePipelineStore } from '../store/pipeline';
import { listClosedLost } from '../api/opportunities';
import { listInboxItems } from '../api/inbox';
import { getMenuConfig, setCachedTeamDefault, type MenuConfig, type MenuItem, type MenuIcon } from '../utils/menuConfig';
import { getMenuDefault } from '../api/settings';

const SETTINGS_NAV = [
  { to: '/settings/people',        label: 'People',         icon: UsersIcon },
  { to: '/settings/imports',       label: 'Imports',        icon: ImportIcon },
  { to: '/settings/configuration', label: 'Configuration',  icon: LayoutIcon },
  { to: '/settings/ai',            label: 'AI',             icon: AiAgentsIcon },
  { to: '/settings/backup',        label: 'Backup & Restore', icon: BackupIcon },
  { to: '/settings/deploy',        label: 'Deploy',         icon: DeployIcon },
  { to: '/settings/developer',     label: 'Developer',      icon: InsightIcon },
];

function NavIcon({ icon }: { icon: MenuIcon }) {
  if (icon === 'home') return (
    <svg className="w-[15px] h-[15px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
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

function ItemLink({ item, badge }: { item: MenuItem; badge?: number }) {
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          isActive ? 'bg-white/10 text-white border-l-2 border-brand-purple-70' : 'text-white/60 hover:text-white hover:bg-white/[0.07]'
        }`
      }
    >
      <NavIcon icon={item.icon} />
      <span className="flex-1">{item.label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="text-[10px] font-semibold bg-white/10 text-white/60 rounded px-1.5 py-px min-w-[18px] text-center leading-tight">
          {badge}
        </span>
      )}
    </NavLink>
  );
}

export default function Sidebar() {
  const { user, allowedPages } = useAuthStore();
  const { setClosedLostUnread, inboxCount, setInboxCount } = usePipelineStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [config, setConfig] = useState<MenuConfig>(() => getMenuConfig());
  // Per-section expand/collapse state, keyed by section id. Falls back to defaultCollapsed.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    listClosedLost()
      .then(({ unreadCount }) => setClosedLostUnread(unreadCount))
      .catch(() => {});
    listInboxItems()
      .then(items => setInboxCount(items.filter(i => i.status === 'open').length))
      .catch(() => {});
    // Refresh the cached team-default menu layout. If this user hasn't customized
    // their menu yet (no menu_config in localStorage), re-render so they pick up
    // the team default instead of the hardcoded fallback.
    getMenuDefault()
      .then(cfg => {
        const hadPersonal = localStorage.getItem('menu_config') !== null;
        setCachedTeamDefault(cfg);
        if (!hadPersonal) setConfig(getMenuConfig());
      })
      .catch(() => {});
  }, [setClosedLostUnread, setInboxCount]);

  useEffect(() => {
    function onChanged() { setConfig(getMenuConfig()); }
    window.addEventListener('menuConfigChanged', onChanged);
    return () => window.removeEventListener('menuConfigChanged', onChanged);
  }, []);

  function isAllowed(to: string): boolean {
    if (allowedPages.length === 0) return true; // not loaded yet — show, gate happens at route
    return allowedPages.includes(to.replace(/^\//, ''));
  }

  const visibleItems = useMemo(() => config.items.filter(i => isAllowed(i.to)), [config.items, allowedPages]);
  const topLevel = useMemo(() => visibleItems.filter(i => i.sectionId === null), [visibleItems]);
  const sectionsWithItems = useMemo(() =>
    config.sections
      .map(s => ({ section: s, items: visibleItems.filter(i => i.sectionId === s.id) }))
      .filter(g => g.items.length > 0),
    [config.sections, visibleItems]
  );

  function isSectionOpen(id: string, defaultCollapsed: boolean): boolean {
    return openSections[id] ?? !defaultCollapsed;
  }

  return (
    <aside className="flex flex-col w-52 min-h-0 bg-brand-navy dark:bg-[#0E1115] text-white flex-shrink-0 dark:border-r dark:border-ink-border-soft">
      <nav className="flex-1 px-3 pt-3 pb-2 space-y-0.5 overflow-y-auto">
        {topLevel.map(item => (
          <ItemLink
            key={item.id}
            item={item}
            badge={item.to === '/my-tasks' ? inboxCount : undefined}
          />
        ))}

        {sectionsWithItems.map(({ section, items }) => {
          const open = isSectionOpen(section.id, section.defaultCollapsed);
          return (
            <div key={section.id}>
              <button
                onClick={() => setOpenSections(s => ({ ...s, [section.id]: !open }))}
                className="flex items-center gap-1 pt-4 pb-1 px-3 w-full text-left group"
              >
                <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40 flex-1 group-hover:text-white/60 transition-colors">{section.label}</p>
                <svg className={`w-3 h-3 text-white/30 transition-transform group-hover:text-white/50 ${open ? '' : '-rotate-90'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {open && items.map(item => <ItemLink key={item.id} item={item} />)}
            </div>
          );
        })}

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

function AiAgentsIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}
