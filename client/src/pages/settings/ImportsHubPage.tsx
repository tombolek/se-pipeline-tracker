/**
 * Imports hub — tabs: Run Import / History.
 * An SE manager typically kicks off an import, then moves to History to watch
 * the pipeline land — that flow lives on one page now.
 */
import { useLocation } from 'react-router-dom';
import { SettingsTabs } from '../../components/SettingsTabs';
import ImportPage from './ImportPage';
import ImportHistoryPage from './ImportHistoryPage';

export default function ImportsHubPage() {
  const { pathname } = useLocation();

  const content = pathname.startsWith('/settings/imports/history')
    ? <ImportHistoryPage />
    : <ImportPage />;

  return (
    <div>
      <header className="mb-4">
        <h1 className="text-2xl font-semibold text-brand-navy dark:text-fg-1">Imports</h1>
        <p className="mt-1 text-sm text-brand-navy-70 dark:text-fg-2">
          Upload a Salesforce CSV export and review how each import landed.
        </p>
      </header>

      <SettingsTabs
        tabs={[
          { to: '/settings/imports/run',     label: 'Run Import' },
          { to: '/settings/imports/history', label: 'History' },
        ]}
      />

      {content}
    </div>
  );
}
