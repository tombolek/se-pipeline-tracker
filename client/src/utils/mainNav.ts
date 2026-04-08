export interface MainNavItem {
  id: string;
  label: string;
  to: string;
  icon: 'pipeline' | 'my-pipeline' | 'tasks' | 'calendar' | 'se-mapping' | 'poc' | 'rfx';
  visible: boolean;
}

const STORAGE_KEY = 'main_nav_config';

export const DEFAULT_MAIN_NAV: MainNavItem[] = [
  { id: 'pipeline',    label: 'Pipeline',    to: '/pipeline',            icon: 'pipeline',    visible: true },
  { id: 'my-pipeline', label: 'My Pipeline', to: '/my-pipeline',         icon: 'my-pipeline', visible: true },
  { id: 'my-tasks',    label: 'My Tasks',    to: '/my-tasks',            icon: 'tasks',       visible: true },
  { id: 'calendar',   label: 'Calendar',   to: '/calendar',            icon: 'calendar',   visible: true },
  { id: 'se-mapping', label: 'SE Mapping', to: '/insights/se-mapping', icon: 'se-mapping', visible: true },
  { id: 'poc-board',  label: 'PoC Board',  to: '/insights/poc-board',  icon: 'poc',        visible: true },
  { id: 'rfx-board',  label: 'RFx Board',  to: '/insights/rfx-board',  icon: 'rfx',        visible: true },
];

export function getMainNav(): MainNavItem[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_MAIN_NAV;
    const parsed = JSON.parse(stored) as MainNavItem[];
    const validIds = new Set(DEFAULT_MAIN_NAV.map(d => d.id));
    const storedIds = new Set(parsed.map(i => i.id));
    const merged = parsed.filter(i => validIds.has(i.id));
    for (const d of DEFAULT_MAIN_NAV) {
      if (!storedIds.has(d.id)) merged.push(d);
    }
    return merged;
  } catch {
    return DEFAULT_MAIN_NAV;
  }
}

export function saveMainNav(items: MainNavItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent('mainNavChanged'));
}
