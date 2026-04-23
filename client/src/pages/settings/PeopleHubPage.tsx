/**
 * People hub — tabs: Users / Roles / Audit.
 * Collapses three separate sidebar entries (and the top-level /audit route).
 */
import { useLocation } from 'react-router-dom';
import { SettingsTabs } from '../../components/SettingsTabs';
import UsersPage from './UsersPage';
import RoleAccessPage from './RoleAccessPage';
import AuditPage from '../AuditPage';

export default function PeopleHubPage() {
  const { pathname } = useLocation();

  let content: React.ReactNode;
  if (pathname.startsWith('/settings/people/roles')) {
    content = <RoleAccessPage />;
  } else if (pathname.startsWith('/settings/people/audit')) {
    content = <AuditPage />;
  } else {
    content = <UsersPage />;
  }

  return (
    <div>
      <header className="mb-4">
        <h1 className="text-2xl font-semibold text-brand-navy dark:text-fg-1">People</h1>
        <p className="mt-1 text-sm text-brand-navy-70 dark:text-fg-2">
          Accounts, role-based page access, and the activity audit log in one place.
        </p>
      </header>

      <SettingsTabs
        tabs={[
          { to: '/settings/people/users', label: 'Users' },
          { to: '/settings/people/roles', label: 'Roles' },
          { to: '/settings/people/audit', label: 'Audit' },
        ]}
      />

      {content}
    </div>
  );
}
