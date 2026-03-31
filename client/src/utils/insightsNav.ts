export interface InsightsNavItem {
  id: string;
  label: string;
  to: string;
  icon: 'insight' | 'poc';
  visible: boolean;
}

const STORAGE_KEY = 'insights_nav_config';

export const DEFAULT_INSIGHTS_NAV: InsightsNavItem[] = [
  { id: 'stage-movement', label: 'Stage Movement', to: '/insights/stage-movement', icon: 'insight', visible: true },
  { id: 'missing-notes',  label: 'Missing Notes',  to: '/insights/missing-notes',  icon: 'insight', visible: true },
  { id: 'team-workload',  label: 'Team Workload',  to: '/insights/team-workload',  icon: 'insight', visible: true },
  { id: 'overdue-tasks',  label: 'Overdue Tasks',  to: '/insights/overdue-tasks',  icon: 'insight', visible: true },
  { id: 'poc-board',      label: 'PoC Board',      to: '/insights/poc-board',      icon: 'poc',     visible: true },
  { id: 'rfx-board',      label: 'RFx Board',      to: '/insights/rfx-board',      icon: 'poc',     visible: true },
  { id: 'deploy-mode',    label: 'DeployMode',     to: '/insights/deploy-mode',    icon: 'insight', visible: true },
];

export function getInsightsNav(): InsightsNavItem[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_INSIGHTS_NAV;
    const parsed = JSON.parse(stored) as InsightsNavItem[];
    // Merge: preserve stored order/visibility, append new defaults, drop removed items
    const validIds = new Set(DEFAULT_INSIGHTS_NAV.map(d => d.id));
    const storedIds = new Set(parsed.map(i => i.id));
    const merged = parsed.filter(i => validIds.has(i.id));
    for (const d of DEFAULT_INSIGHTS_NAV) {
      if (!storedIds.has(d.id)) merged.push(d);
    }
    return merged;
  } catch {
    return DEFAULT_INSIGHTS_NAV;
  }
}

export function saveInsightsNav(items: InsightsNavItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent('insightsNavChanged'));
}
