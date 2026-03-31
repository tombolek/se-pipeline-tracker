import { useLocation } from 'react-router-dom';
import UsersPage from './settings/UsersPage';
import ImportHistoryPage from './settings/ImportHistoryPage';
import InsightsMenuPage from './settings/InsightsMenuPage';

export default function SettingsPage() {
  const { pathname } = useLocation();

  let content;
  if (pathname.includes('import'))         content = <ImportHistoryPage />;
  else if (pathname.includes('insights-menu')) content = <InsightsMenuPage />;
  else                                     content = <UsersPage />;

  return (
    <div className="flex-1 overflow-y-auto bg-[#F5F5F7] px-8 py-6">
      {content}
    </div>
  );
}
