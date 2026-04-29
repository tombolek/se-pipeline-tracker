import { useLocation, Navigate } from 'react-router-dom';
import HowToPage from './settings/HowToPage';
import BackupPage from './settings/BackupPage';
import DeveloperPage from './settings/DeveloperPage';
import PeopleHubPage from './settings/PeopleHubPage';
import ImportsHubPage from './settings/ImportsHubPage';
import ConfigurationHubPage from './settings/ConfigurationHubPage';
import AiHubPage from './settings/AiHubPage';

/**
 * Administration is structured as four hub pages (People / Imports /
 * Configuration / AI) + two solo pages (Backup / Developer).
 *
 * Every pre-restructure URL redirects here so old bookmarks + audit-log
 * entries resolve cleanly. Keep the redirect map below in sync if you ever
 * add more sub-tabs.
 */
export default function SettingsPage() {
  const { pathname, search } = useLocation();

  // ── Back-compat redirects for legacy flat URLs ──────────────────────────
  // Each entry: { test: RegExp, replace: path } — first match wins.
  const redirect = (target: string) => <Navigate to={target + search} replace />;

  if (pathname === '/settings/users')             return redirect('/settings/people/users');
  if (pathname === '/settings/role-access')       return redirect('/settings/people/roles');
  if (pathname === '/settings/import')            return redirect('/settings/imports/run');
  if (pathname === '/settings/import-history')    return redirect('/settings/imports/history');
  if (pathname === '/settings/menu-settings')     return redirect('/settings/configuration/menu');
  if (pathname === '/settings/insights-menu')     return redirect('/settings/configuration/menu');
  if (pathname === '/settings/deal-info-layout')  return redirect('/settings/configuration/deal-info');
  if (pathname === '/settings/quotas')            return redirect('/settings/configuration/quotas');
  if (pathname === '/settings/templates')         return redirect('/settings/configuration/templates');
  if (pathname === '/settings/knowledge-base')    return redirect('/settings/configuration/knowledge-base');
  if (pathname === '/settings/agents')            return redirect('/settings/ai/agents');
  const agentDetail = /^\/settings\/agents\/(\d+)/.exec(pathname);
  if (agentDetail) return redirect(`/settings/ai/agents/${agentDetail[1]}`);
  if (pathname === '/settings/ai-jobs')           return redirect('/settings/ai/jobs');
  const jobDetail = /^\/settings\/ai-jobs\/(\d+)/.exec(pathname);
  if (jobDetail) return redirect(`/settings/ai/jobs/${jobDetail[1]}`);
  if (pathname === '/settings/ai-usage')          return redirect('/settings/ai/usage');

  // ── Hub defaults: bare `/settings/{hub}` → first tab ─────────────────────
  if (pathname === '/settings/people')          return redirect('/settings/people/users');
  if (pathname === '/settings/imports')         return redirect('/settings/imports/run');
  if (pathname === '/settings/configuration')   return redirect('/settings/configuration/deal-info');
  if (pathname === '/settings/ai')              return redirect('/settings/ai/agents');

  // ── Dispatch ────────────────────────────────────────────────────────────
  let content: React.ReactNode;
  if      (pathname.startsWith('/settings/people/'))        content = <PeopleHubPage />;
  else if (pathname.startsWith('/settings/imports/'))       content = <ImportsHubPage />;
  else if (pathname.startsWith('/settings/configuration/')) content = <ConfigurationHubPage />;
  else if (pathname.startsWith('/settings/ai/'))            content = <AiHubPage />;
  else if (pathname.includes('/settings/backup'))           content = <BackupPage />;
  // /settings/deploy: redirect to settings home — feature retired in favour of
  // GitHub Actions + ECR deploy pipeline (see SE-PIPELINE-MIGRATION-TESTPLAN.md)
  else if (pathname.includes('/settings/deploy'))           return redirect('/settings/people/users');
  else if (pathname.includes('/settings/developer'))        content = <DeveloperPage />;
  else if (pathname.includes('/settings/how-to'))           content = <HowToPage />;
  // Default when someone lands on bare /settings — send to People > Users.
  else                                                      return redirect('/settings/people/users');

  return (
    <div className="flex-1 overflow-y-auto bg-[#F5F5F7] dark:bg-ink-0 px-8 py-6">
      {content}
    </div>
  );
}
