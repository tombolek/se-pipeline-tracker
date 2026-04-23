/**
 * AI hub — tabs: Agents / Jobs / Usage.
 * Replaces three separate sidebar entries with one.
 *
 * Sub-pages mounted here are the same components that used to be routed
 * individually. They all key off pathname prefix, so deep links like
 * /settings/ai/agents/5 and /settings/ai/jobs/12 still work.
 */
import { useLocation } from 'react-router-dom';
import { SettingsTabs } from '../../components/SettingsTabs';
import AgentsPage from './AgentsPage';
import AgentDetailPage from './AgentDetailPage';
import AiJobsPage from './AiJobsPage';
import AiUsagePage from './AiUsagePage';

export default function AiHubPage() {
  const { pathname } = useLocation();

  let content: React.ReactNode;
  if (/^\/settings\/ai\/agents\/\d+/.test(pathname)) {
    content = <AgentDetailPage />;
  } else if (pathname.startsWith('/settings/ai/jobs')) {
    // AiJobsPage handles both list and /jobs/:id detail from pathname.
    content = <AiJobsPage />;
  } else if (pathname.startsWith('/settings/ai/usage')) {
    content = <AiUsagePage />;
  } else {
    // Default (`/settings/ai` or `/settings/ai/agents`) → agents list.
    content = <AgentsPage />;
  }

  return (
    <div>
      <header className="mb-4">
        <h1 className="text-2xl font-semibold text-brand-navy dark:text-fg-1">AI</h1>
        <p className="mt-1 text-sm text-brand-navy-70 dark:text-fg-2">
          Admin surface for every AI feature in the app. Fine-tune agents, watch live calls, audit usage.
        </p>
      </header>

      <SettingsTabs
        tabs={[
          { to: '/settings/ai/agents', label: 'Agents' },
          { to: '/settings/ai/jobs',   label: 'Jobs' },
          { to: '/settings/ai/usage',  label: 'Usage' },
        ]}
      />

      {content}
    </div>
  );
}
