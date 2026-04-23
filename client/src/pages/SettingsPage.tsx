import { useLocation } from 'react-router-dom';
import UsersPage from './settings/UsersPage';
import ImportPage from './settings/ImportPage';
import ImportHistoryPage from './settings/ImportHistoryPage';
import InsightsMenuPage from './settings/InsightsMenuPage';
import HowToPage from './settings/HowToPage';
import BackupPage from './settings/BackupPage';
import DeployPage from './settings/DeployPage';
import DealInfoConfigPage from './settings/DealInfoConfigPage';
import QuotaSettingsPage from './settings/QuotaSettingsPage';
import RoleAccessPage from './settings/RoleAccessPage';
import TemplatesPage from './settings/TemplatesPage';
import DeveloperPage from './settings/DeveloperPage';
import KnowledgeBasePage from './settings/KnowledgeBasePage';
import AgentsPage from './settings/AgentsPage';
import AgentDetailPage from './settings/AgentDetailPage';
import AiJobsPage from './settings/AiJobsPage';
import AiUsagePage from './settings/AiUsagePage';

export default function SettingsPage() {
  const { pathname } = useLocation();

  let content;
  // Order matters — specific (.../agents/:id, .../ai-jobs/:id) before list paths.
  if      (/^\/settings\/agents\/\d+/.test(pathname)) content = <AgentDetailPage />;
  else if (pathname.includes('/settings/agents'))     content = <AgentsPage />;
  else if (/^\/settings\/ai-jobs\/\d+/.test(pathname)) content = <AiJobsPage />;
  else if (pathname.includes('/settings/ai-jobs'))    content = <AiJobsPage />;
  else if (pathname.includes('/settings/ai-usage'))   content = <AiUsagePage />;
  else if (pathname.includes('import-history'))  content = <ImportHistoryPage />;
  else if (pathname.includes('import'))     content = <ImportPage />;
  else if (pathname.includes('menu-settings') || pathname.includes('insights-menu')) content = <InsightsMenuPage />;
  else if (pathname.includes('how-to'))     content = <HowToPage />;
  else if (pathname.includes('backup'))     content = <BackupPage />;
  else if (pathname.includes('deploy'))     content = <DeployPage />;
  else if (pathname.includes('deal-info-layout')) content = <DealInfoConfigPage />;
  else if (pathname.includes('quotas'))       content = <QuotaSettingsPage />;
  else if (pathname.includes('role-access')) content = <RoleAccessPage />;
  else if (pathname.includes('templates'))   content = <TemplatesPage />;
  else if (pathname.includes('developer'))   content = <DeveloperPage />;
  else if (pathname.includes('knowledge-base')) content = <KnowledgeBasePage />;
  else                                       content = <UsersPage />;

  return (
    <div className="flex-1 overflow-y-auto bg-[#F5F5F7] dark:bg-ink-0 px-8 py-6">
      {content}
    </div>
  );
}
