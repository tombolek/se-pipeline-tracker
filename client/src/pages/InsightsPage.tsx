import { useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import TeamScopeSelector from '../components/shared/TeamScopeSelector';
import StageMovementPage from './insights/StageMovementPage';
import MissingNotesPage from './insights/MissingNotesPage';
import TeamWorkloadPage from './insights/TeamWorkloadPage';
import OverdueTasksPage from './insights/OverdueTasksPage';
import PocBoardPage from './insights/PocBoardPage';
import RfxBoardPage from './insights/RfxBoardPage';
import DeployModePage from './insights/DeployModePage';
import SeDealMappingPage from './insights/SeDealMappingPage';
import ClosedLostStatsPage from './insights/ClosedLostStatsPage';
import ClosedWonPage from './insights/ClosedWonPage';
import PercentToTargetPage from './insights/PercentToTargetPage';
import TechBlockersPage from './insights/TechBlockersPage';
import AgenticQualPage from './insights/AgenticQualPage';
import WeeklyDigestPage from './insights/WeeklyDigestPage';
import TeamTasksPage from './insights/TeamTasksPage';
import ForecastingBriefPage from './insights/ForecastingBriefPage';
import OneOnOnePrepPage from './insights/OneOnOnePrepPage';
import AnalyticsDashboardPage from './insights/AnalyticsDashboardPage';

function ScopeBar() {
  const { user } = useAuthStore();
  if (user?.role !== 'manager') return null;
  return (
    <div className="flex-shrink-0 flex justify-end px-8 pt-3 pb-0">
      <TeamScopeSelector />
    </div>
  );
}

export default function InsightsPage() {
  const { pathname } = useLocation();

  // Full-height pages (kanban boards + scroll-managed pages) get their own flex container
  if (pathname.includes('forecasting-brief')) {
    return (
      <div className="flex-1 overflow-hidden bg-[#F5F5F7] flex flex-col relative">
        {/* No ScopeBar — ForecastingBriefPage has its own NA/INTL region toggle */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <ForecastingBriefPage />
        </div>
      </div>
    );
  }
  if (pathname.includes('poc-board')) {
    return (
      <div className="flex-1 overflow-hidden bg-[#F5F5F7] flex flex-col relative">
        <div className="flex-1 overflow-hidden flex flex-col">
          <PocBoardPage />
        </div>
      </div>
    );
  }
  if (pathname.includes('rfx-board')) {
    return (
      <div className="flex-1 overflow-hidden bg-[#F5F5F7] flex flex-col relative">
        <div className="flex-1 overflow-hidden flex flex-col">
          <RfxBoardPage />
        </div>
      </div>
    );
  }
  if (pathname.includes('missing-notes')) {
    return (
      <div className="flex-1 overflow-hidden bg-[#F5F5F7] flex flex-col relative">
        <ScopeBar />
        <div className="flex-1 overflow-hidden flex flex-col">
          <MissingNotesPage />
        </div>
      </div>
    );
  }
  if (pathname.includes('deploy-mode')) {
    return (
      <div className="flex-1 overflow-hidden bg-[#F5F5F7] flex flex-col relative">
        <ScopeBar />
        <div className="flex-1 overflow-hidden flex flex-col">
          <DeployModePage />
        </div>
      </div>
    );
  }
  if (pathname.includes('closed-lost-stats')) {
    return (
      <div className="flex-1 overflow-hidden bg-[#F5F5F7] flex flex-col relative">
        <ScopeBar />
        <div className="flex-1 overflow-hidden flex flex-col">
          <ClosedLostStatsPage />
        </div>
      </div>
    );
  }
  if (pathname.includes('percent-to-target')) {
    return (
      <div className="flex-1 bg-[#F5F5F7] flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <PercentToTargetPage />
        </div>
      </div>
    );
  }
  if (pathname.includes('closed-won')) {
    // No ScopeBar — this report is by territory/SE by design; showing all teams is the point.
    return (
      <div className="flex-1 bg-[#F5F5F7] flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <ClosedWonPage />
        </div>
      </div>
    );
  }
  if (pathname.includes('se-mapping')) {
    return (
      <div className="flex-1 overflow-hidden bg-[#F5F5F7] flex flex-col relative">
        <ScopeBar />
        <div className="flex-1 overflow-hidden flex flex-col">
          <SeDealMappingPage />
        </div>
      </div>
    );
  }

  if (pathname.includes('team-tasks')) {
    return (
      <div className="flex-1 overflow-hidden bg-[#F5F5F7] flex flex-col relative">
        <div className="flex-1 overflow-hidden flex flex-col">
          <TeamTasksPage />
        </div>
      </div>
    );
  }

  if (pathname.includes('analytics')) {
    return (
      <div className="flex-1 bg-[#F5F5F7] flex flex-col overflow-hidden">
        <ScopeBar />
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <AnalyticsDashboardPage />
        </div>
      </div>
    );
  }

  let content;
  if (pathname.includes('one-on-one')) content = <OneOnOnePrepPage />;
  else if (pathname.includes('weekly-digest')) content = <WeeklyDigestPage />;
  else if (pathname.includes('team-workload')) content = <TeamWorkloadPage />;
  else if (pathname.includes('overdue-tasks')) content = <OverdueTasksPage />;
  else if (pathname.includes('tech-blockers')) content = <TechBlockersPage />;
  else if (pathname.includes('agentic-qual')) content = <AgenticQualPage />;
  else content = <StageMovementPage />;

  return (
    <div className="flex-1 bg-[#F5F5F7] flex flex-col overflow-hidden">
      <ScopeBar />
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {content}
      </div>
    </div>
  );
}
