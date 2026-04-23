/**
 * Configuration hub — tabs: Deal Info Layout / Quotas / Templates /
 * Knowledge Base / Menu Settings. Loosely-related app-wide configuration
 * consolidated behind one sidebar entry.
 */
import { useLocation } from 'react-router-dom';
import { SettingsTabs } from '../../components/SettingsTabs';
import DealInfoConfigPage from './DealInfoConfigPage';
import QuotaSettingsPage from './QuotaSettingsPage';
import TemplatesPage from './TemplatesPage';
import KnowledgeBasePage from './KnowledgeBasePage';
import InsightsMenuPage from './InsightsMenuPage';

export default function ConfigurationHubPage() {
  const { pathname } = useLocation();

  let content: React.ReactNode;
  if (pathname.startsWith('/settings/configuration/quotas')) {
    content = <QuotaSettingsPage />;
  } else if (pathname.startsWith('/settings/configuration/templates')) {
    content = <TemplatesPage />;
  } else if (pathname.startsWith('/settings/configuration/knowledge-base')) {
    content = <KnowledgeBasePage />;
  } else if (pathname.startsWith('/settings/configuration/menu')) {
    content = <InsightsMenuPage />;
  } else {
    content = <DealInfoConfigPage />;
  }

  return (
    <div>
      <header className="mb-4">
        <h1 className="text-2xl font-semibold text-brand-navy dark:text-fg-1">Configuration</h1>
        <p className="mt-1 text-sm text-brand-navy-70 dark:text-fg-2">
          App-wide configuration: how deals render, sales quotas, templates, KB content, sidebar menu entries.
        </p>
      </header>

      <SettingsTabs
        tabs={[
          { to: '/settings/configuration/deal-info',      label: 'Deal Info Layout' },
          { to: '/settings/configuration/quotas',         label: 'Quotas' },
          { to: '/settings/configuration/templates',      label: 'Templates' },
          { to: '/settings/configuration/knowledge-base', label: 'Knowledge Base' },
          { to: '/settings/configuration/menu',           label: 'Menu Settings' },
        ]}
      />

      {content}
    </div>
  );
}
