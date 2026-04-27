export type MenuIcon =
  | 'home' | 'pipeline' | 'my-pipeline' | 'favorites' | 'tasks' | 'calendar'
  | 'se-mapping' | 'poc' | 'rfx' | 'insight';

export interface MenuSection {
  id: string;
  label: string;
  defaultCollapsed: boolean;
}

export interface MenuItem {
  id: string;
  label: string;
  to: string;
  icon: MenuIcon;
  sectionId: string | null;
}

export interface MenuConfig {
  sections: MenuSection[];
  items: MenuItem[];
}

const STORAGE_KEY = 'menu_config';
const SEC_INSIGHTS = 'sec-insights';

export const DEFAULT_MENU_CONFIG: MenuConfig = {
  sections: [
    { id: SEC_INSIGHTS, label: 'Insights', defaultCollapsed: false },
  ],
  items: [
    { id: 'home',        label: 'Home',        to: '/home',        icon: 'home',        sectionId: null },
    { id: 'pipeline',    label: 'Pipeline',    to: '/pipeline',    icon: 'pipeline',    sectionId: null },
    { id: 'my-pipeline', label: 'My Pipeline', to: '/my-pipeline', icon: 'my-pipeline', sectionId: null },
    { id: 'favorites',   label: 'Favorites',   to: '/favorites',   icon: 'favorites',   sectionId: null },
    { id: 'my-tasks',    label: 'My Tasks',    to: '/my-tasks',    icon: 'tasks',       sectionId: null },
    { id: 'calendar',    label: 'Calendar',    to: '/calendar',    icon: 'calendar',    sectionId: null },
    { id: 'se-mapping',  label: 'SE Mapping',  to: '/insights/se-mapping', icon: 'se-mapping', sectionId: null },
    { id: 'poc-board',   label: 'PoC Board',   to: '/insights/poc-board',  icon: 'poc',        sectionId: null },
    { id: 'rfx-board',   label: 'RFx Board',   to: '/insights/rfx-board',  icon: 'rfx',        sectionId: null },

    { id: 'forecasting-brief', label: 'Forecasting Brief', to: '/insights/forecasting-brief', icon: 'insight', sectionId: SEC_INSIGHTS },
    { id: 'one-on-one',        label: '1:1 Prep',          to: '/insights/one-on-one',        icon: 'insight', sectionId: SEC_INSIGHTS },
    { id: 'weekly-digest',     label: 'Weekly Digest',     to: '/insights/weekly-digest',     icon: 'insight', sectionId: SEC_INSIGHTS },
    { id: 'stage-movement',    label: 'Stage Movement',    to: '/insights/stage-movement',    icon: 'insight', sectionId: SEC_INSIGHTS },
    { id: 'missing-notes',     label: 'Missing Notes',     to: '/insights/missing-notes',     icon: 'insight', sectionId: SEC_INSIGHTS },
    { id: 'team-workload',     label: 'Team Workload',     to: '/insights/team-workload',     icon: 'insight', sectionId: SEC_INSIGHTS },
    { id: 'overdue-tasks',     label: 'Overdue Tasks',     to: '/insights/overdue-tasks',     icon: 'insight', sectionId: SEC_INSIGHTS },
    { id: 'team-tasks',        label: 'Team Tasks',        to: '/insights/team-tasks',        icon: 'insight', sectionId: SEC_INSIGHTS },
    { id: 'deploy-mode',       label: 'DeployMode',        to: '/insights/deploy-mode',       icon: 'insight', sectionId: SEC_INSIGHTS },
    { id: 'closed-lost-stats', label: 'Loss Analysis',     to: '/insights/closed-lost-stats', icon: 'insight', sectionId: SEC_INSIGHTS },
    { id: 'closed-won',        label: 'Closed Won',        to: '/insights/closed-won',        icon: 'insight', sectionId: SEC_INSIGHTS },
    { id: 'percent-to-target', label: '% to Target',       to: '/insights/percent-to-target', icon: 'insight', sectionId: SEC_INSIGHTS },
    { id: 'win-rate',          label: 'Win Rate',          to: '/insights/win-rate',          icon: 'insight', sectionId: SEC_INSIGHTS },
    { id: 'se-contribution',   label: 'SE Contribution',   to: '/insights/se-contribution',   icon: 'insight', sectionId: SEC_INSIGHTS },
    { id: 'tech-blockers',     label: 'Tech Blockers',     to: '/insights/tech-blockers',     icon: 'insight', sectionId: SEC_INSIGHTS },
    { id: 'agentic-qual',      label: 'Agentic Qual',      to: '/insights/agentic-qual',      icon: 'insight', sectionId: SEC_INSIGHTS },
    { id: 'analytics',         label: 'Pipeline Analytics', to: '/insights/analytics',        icon: 'insight', sectionId: SEC_INSIGHTS },
  ],
};

function clone(c: MenuConfig): MenuConfig {
  return { sections: c.sections.map(s => ({ ...s })), items: c.items.map(i => ({ ...i })) };
}

export function getMenuConfig(): MenuConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return clone(DEFAULT_MENU_CONFIG);
    const stored = JSON.parse(raw) as MenuConfig;
    if (!stored?.items || !stored?.sections) return clone(DEFAULT_MENU_CONFIG);

    const defaultsById = new Map(DEFAULT_MENU_CONFIG.items.map(i => [i.id, i]));
    const validSectionIds = new Set(stored.sections.map(s => s.id));
    const seen = new Set<string>();

    // Preserve stored order; refresh canonical fields (label/to/icon) from defaults; repair orphan sectionIds.
    const items: MenuItem[] = [];
    for (const s of stored.items) {
      const def = defaultsById.get(s.id);
      if (!def) continue;
      seen.add(s.id);
      const sectionId =
        s.sectionId === null || validSectionIds.has(s.sectionId) ? s.sectionId : null;
      items.push({ ...def, sectionId });
    }
    // Append items added in defaults since last save (new pages auto-appear in their default location).
    for (const d of DEFAULT_MENU_CONFIG.items) if (!seen.has(d.id)) items.push({ ...d });

    return { sections: stored.sections.map(s => ({ ...s })), items };
  } catch {
    return clone(DEFAULT_MENU_CONFIG);
  }
}

export function saveMenuConfig(config: MenuConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  window.dispatchEvent(new CustomEvent('menuConfigChanged'));
}

export function resetMenuConfig(): MenuConfig {
  const fresh = clone(DEFAULT_MENU_CONFIG);
  saveMenuConfig(fresh);
  return fresh;
}
