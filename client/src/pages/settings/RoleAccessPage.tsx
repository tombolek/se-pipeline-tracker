/**
 * Role Access settings page — admin only.
 * Configures which roles can see which pages/menu items.
 */
import { useState, useEffect, useMemo } from 'react';
import { getRoleAccessMappings, updateRoleAccessMappings, type RolePageMapping } from '../../api/settings';
import { useAuthStore } from '../../store/auth';

const ROLES = ['manager', 'se', 'viewer'] as const;
const ROLE_LABELS: Record<string, string> = { manager: 'Manager', se: 'SE', viewer: 'Viewer' };

interface PageDef {
  key: string;
  label: string;
  section: string;
}

const PAGE_REGISTRY: PageDef[] = [
  // Main Navigation
  { key: 'home', label: 'Home', section: 'Main Navigation' },
  { key: 'pipeline', label: 'Pipeline', section: 'Main Navigation' },
  { key: 'my-pipeline', label: 'My Pipeline', section: 'Main Navigation' },
  { key: 'favorites', label: 'Favorites', section: 'Main Navigation' },
  { key: 'my-tasks', label: 'My Tasks', section: 'Main Navigation' },
  { key: 'calendar', label: 'Calendar', section: 'Main Navigation' },
  { key: 'closed-lost', label: 'Closed Lost', section: 'Main Navigation' },
  { key: 'insights/se-mapping', label: 'SE Mapping', section: 'Main Navigation' },
  { key: 'insights/poc-board', label: 'PoC Board', section: 'Main Navigation' },
  { key: 'insights/rfx-board', label: 'RFx Board', section: 'Main Navigation' },
  // Insights
  { key: 'insights/forecasting-brief', label: 'Forecasting Brief', section: 'Insights' },
  { key: 'insights/one-on-one', label: '1:1 Prep', section: 'Insights' },
  { key: 'insights/weekly-digest', label: 'Weekly Digest', section: 'Insights' },
  { key: 'insights/stage-movement', label: 'Stage Movement', section: 'Insights' },
  { key: 'insights/missing-notes', label: 'Missing Notes', section: 'Insights' },
  { key: 'insights/team-workload', label: 'Team Workload', section: 'Insights' },
  { key: 'insights/overdue-tasks', label: 'Overdue Tasks', section: 'Insights' },
  { key: 'insights/team-tasks', label: 'Team Tasks', section: 'Insights' },
  { key: 'insights/deploy-mode', label: 'DeployMode', section: 'Insights' },
  { key: 'insights/closed-lost-stats', label: 'Loss Analysis', section: 'Insights' },
  { key: 'insights/closed-won', label: 'Closed Won', section: 'Insights' },
  { key: 'insights/percent-to-target', label: '% to Target', section: 'Insights' },
  { key: 'insights/win-rate', label: 'Win Rate', section: 'Insights' },
  { key: 'insights/se-contribution', label: 'SE Contribution', section: 'Insights' },
  { key: 'insights/tech-blockers', label: 'Tech Blockers', section: 'Insights' },
  { key: 'insights/agentic-qual', label: 'Agentic Qual', section: 'Insights' },
  { key: 'insights/analytics', label: 'Pipeline Analytics', section: 'Insights' },
  // Administration
  { key: 'audit', label: 'Audit', section: 'Administration' },
  { key: 'settings/users', label: 'Users', section: 'Administration' },
  { key: 'settings/import', label: 'Import', section: 'Administration' },
  { key: 'settings/import-history', label: 'Import History', section: 'Administration' },
  { key: 'settings/menu-settings', label: 'Menu Settings', section: 'Administration' },
  { key: 'settings/backup', label: 'Backup & Restore', section: 'Administration' },
  { key: 'settings/deploy', label: 'Deploy', section: 'Administration' },
  { key: 'settings/deal-info-layout', label: 'Deal Info Layout', section: 'Administration' },
  { key: 'settings/quotas', label: 'Quotas', section: 'Administration' },
  { key: 'settings/templates', label: 'Templates', section: 'Administration' },
  { key: 'settings/knowledge-base', label: 'Knowledge Base', section: 'Administration' },
  { key: 'settings/role-access', label: 'Role Access', section: 'Administration' },
];

const SECTIONS = ['Main Navigation', 'Insights', 'Administration'] as const;

function toKey(pageKey: string, role: string) { return `${pageKey}::${role}`; }

export default function RoleAccessPage() {
  const { user, fetchAllowedPages } = useAuthStore();
  const [accessSet, setAccessSet] = useState<Set<string>>(new Set());
  const [initialSet, setInitialSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    getRoleAccessMappings()
      .then(mappings => {
        const s = new Set(mappings.map(m => toKey(m.page_key, m.role)));
        setAccessSet(s);
        setInitialSet(new Set(s));
      })
      .catch(() => setToast('Failed to load role access config'))
      .finally(() => setLoading(false));
  }, []);

  const isDirty = useMemo(() => {
    if (accessSet.size !== initialSet.size) return true;
    for (const k of accessSet) { if (!initialSet.has(k)) return true; }
    return false;
  }, [accessSet, initialSet]);

  function toggle(pageKey: string, role: string) {
    const k = toKey(pageKey, role);
    setAccessSet(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }

  function toggleSection(section: string, role: string) {
    const pages = PAGE_REGISTRY.filter(p => p.section === section);
    const allChecked = pages.every(p => accessSet.has(toKey(p.key, role)));
    setAccessSet(prev => {
      const next = new Set(prev);
      for (const p of pages) {
        const k = toKey(p.key, role);
        if (allChecked) next.delete(k); else next.add(k);
      }
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      const mappings: RolePageMapping[] = [];
      for (const k of accessSet) {
        const [page_key, role] = k.split('::');
        mappings.push({ page_key, role });
      }
      await updateRoleAccessMappings(mappings);
      setInitialSet(new Set(accessSet));
      setToast('Role access saved');
      // Refresh current user's allowed pages
      await fetchAllowedPages();
    } catch {
      setToast('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!user?.is_admin) {
    return <div className="p-8 text-brand-navy-70">Admin access required.</div>;
  }

  if (loading) {
    return <div className="p-8 text-brand-navy-70">Loading...</div>;
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-brand-navy">Role Access</h1>
          <p className="text-sm text-brand-navy-70 mt-1">Configure which roles can see each page. Admin users always see Administration pages.</p>
        </div>
        <button
          onClick={save}
          disabled={!isDirty || saving}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-brand-purple hover:bg-brand-purple-70 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {toast && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-status-success/10 text-sm text-brand-navy border border-status-success/30">
          {toast}
        </div>
      )}

      <div className="bg-white rounded-xl border border-brand-navy-30/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#F5F5F7]">
              <th className="text-left px-4 py-3 font-medium text-brand-navy">Page</th>
              {ROLES.map(r => (
                <th key={r} className="text-center px-4 py-3 font-medium text-brand-navy w-28">{ROLE_LABELS[r]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SECTIONS.map(section => {
              const pages = PAGE_REGISTRY.filter(p => p.section === section);
              return (
                <SectionGroup
                  key={section}
                  section={section}
                  pages={pages}
                  accessSet={accessSet}
                  onToggle={toggle}
                  onToggleSection={toggleSection}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SectionGroup({
  section, pages, accessSet, onToggle, onToggleSection,
}: {
  section: string;
  pages: PageDef[];
  accessSet: Set<string>;
  onToggle: (pageKey: string, role: string) => void;
  onToggleSection: (section: string, role: string) => void;
}) {
  return (
    <>
      {/* Section header */}
      <tr className="bg-brand-navy/[0.03]">
        <td className="px-4 py-2 font-semibold text-xs uppercase tracking-wider text-brand-navy-70">{section}</td>
        {ROLES.map(role => {
          const allChecked = pages.every(p => accessSet.has(toKey(p.key, role)));
          const someChecked = pages.some(p => accessSet.has(toKey(p.key, role)));
          return (
            <td key={role} className="text-center px-4 py-2">
              <input
                type="checkbox"
                checked={allChecked}
                ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }}
                onChange={() => onToggleSection(section, role)}
                className="w-4 h-4 rounded border-brand-navy-30 text-brand-purple focus:ring-brand-purple cursor-pointer accent-brand-purple"
              />
            </td>
          );
        })}
      </tr>
      {/* Page rows */}
      {pages.map(page => (
        <tr key={page.key} className="border-t border-brand-navy-30/30 hover:bg-brand-purple-30/10 transition-colors">
          <td className="px-4 py-2 pl-8 text-brand-navy">{page.label}</td>
          {ROLES.map(role => (
            <td key={role} className="text-center px-4 py-2">
              <input
                type="checkbox"
                checked={accessSet.has(toKey(page.key, role))}
                onChange={() => onToggle(page.key, role)}
                className="w-4 h-4 rounded border-brand-navy-30 text-brand-purple focus:ring-brand-purple cursor-pointer accent-brand-purple"
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
