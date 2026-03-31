import { useLocation } from 'react-router-dom';
import StageMovementPage from './insights/StageMovementPage';
import MissingNotesPage from './insights/MissingNotesPage';
import TeamWorkloadPage from './insights/TeamWorkloadPage';
import OverdueTasksPage from './insights/OverdueTasksPage';
import PocBoardPage from './insights/PocBoardPage';
import RfxBoardPage from './insights/RfxBoardPage';
import DeployModePage from './insights/DeployModePage';

export default function InsightsPage() {
  const { pathname } = useLocation();

  // Kanban boards need horizontal scroll — render with their own layout
  if (pathname.includes('poc-board')) {
    return (
      <div className="flex-1 overflow-hidden bg-[#F5F5F7] flex flex-col relative">
        <PocBoardPage />
      </div>
    );
  }
  if (pathname.includes('rfx-board')) {
    return (
      <div className="flex-1 overflow-hidden bg-[#F5F5F7] flex flex-col relative">
        <RfxBoardPage />
      </div>
    );
  }

  if (pathname.includes('missing-notes')) {
    return (
      <div className="flex-1 overflow-hidden bg-[#F5F5F7] flex flex-col relative">
        <MissingNotesPage />
      </div>
    );
  }

  if (pathname.includes('deploy-mode')) {
    return (
      <div className="flex-1 overflow-hidden bg-[#F5F5F7] flex flex-col relative">
        <DeployModePage />
      </div>
    );
  }

  let content;
  if (pathname.includes('team-workload')) content = <TeamWorkloadPage />;
  else if (pathname.includes('overdue-tasks')) content = <OverdueTasksPage />;
  else content = <StageMovementPage />;

  return (
    <div className="flex-1 overflow-y-auto bg-[#F5F5F7] px-8 py-6">
      {content}
    </div>
  );
}
