/**
 * Shared tab bar for the Administration hub pages (People, Imports,
 * Configuration, AI). Matches the active tab by URL prefix so deep-linked
 * detail routes like /settings/ai/agents/5 still highlight "Agents".
 */
import { Link, useLocation } from 'react-router-dom';

export interface SettingsTab {
  to: string;         // full path, e.g. "/settings/ai/agents"
  label: string;
  count?: string | number | null;  // optional small pill to the right of the label
}

export function SettingsTabs({ tabs }: { tabs: SettingsTab[] }) {
  const { pathname } = useLocation();

  return (
    <div className="flex gap-1 border-b border-brand-navy-30/40 dark:border-ink-border-soft mb-5">
      {tabs.map(t => {
        const isActive = pathname === t.to || pathname.startsWith(t.to + '/');
        return (
          <Link
            key={t.to}
            to={t.to}
            className={`px-3 py-2 text-sm font-medium capitalize -mb-px border-b-2 transition-colors ${
              isActive
                ? 'text-brand-navy dark:text-fg-1 border-brand-purple font-semibold'
                : 'text-brand-navy-70 dark:text-fg-2 border-transparent hover:text-brand-navy dark:hover:text-fg-1'
            }`}
          >
            {t.label}
            {t.count != null && (
              <span className={`ml-1.5 inline-block text-[10px] font-semibold rounded-full px-1.5 py-0.5 ${
                isActive
                  ? 'bg-brand-purple/10 text-brand-purple dark:bg-accent-purple-soft dark:text-accent-purple'
                  : 'bg-brand-navy-30/40 text-brand-navy-70 dark:bg-ink-2 dark:text-fg-3'
              }`}>{t.count}</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
