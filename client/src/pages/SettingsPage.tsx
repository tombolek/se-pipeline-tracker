import { useLocation } from 'react-router-dom';
import UsersPage from './settings/UsersPage';
import ImportPage from './settings/ImportPage';
import ImportHistoryPage from './settings/ImportHistoryPage';
import InsightsMenuPage from './settings/InsightsMenuPage';
import HowToPage from './settings/HowToPage';

export default function SettingsPage() {
  const { pathname } = useLocation();

  let content;
  if (pathname.includes('import-history'))  content = <ImportHistoryPage />;
  else if (pathname.includes('import'))     content = <ImportPage />;
  else if (pathname.includes('menu-settings') || pathname.includes('insights-menu')) content = <InsightsMenuPage />;
  else if (pathname.includes('how-to'))     content = <HowToPage />;
  else                                      content = <UsersPage />;

  return (
    <div className="flex-1 overflow-y-auto bg-[#F5F5F7] px-8 py-6">
      {content}
    </div>
  );
}
