import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import type { ApiResponse } from '../types';
import { formatDate } from '../utils/formatters';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PageViewRow {
  page: string;
  views: string;
  unique_users: string;
  last_seen: string;
}

interface FeatureRow {
  action: string;
  entity_type: string;
  count: string;
  last_seen: string;
}

interface UserActivityRow {
  user_id: number;
  name: string;
  total_events: string;
  last_seen: string;
}

interface UsageData {
  pageViews: PageViewRow[];
  featureUsage: FeatureRow[];
  userActivity: UserActivityRow[];
}

interface AuditEntry {
  id: number;
  timestamp: string;
  user_name: string | null;
  user_email: string | null;
  user_role: string;
  action: string;
  resource_type: string;
  resource_id: string;
  resource_name: string | null;
  before_value: Record<string, unknown> | null;
  after_value: Record<string, unknown> | null;
  ip_address: string | null;
  success: boolean;
  failure_reason: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PAGE_LABELS: Record<string, string> = {
  '/pipeline':                    'Pipeline',
  '/closed-lost':                 'Closed Lost',
  '/my-tasks':                    'My Tasks',
  '/calendar':                    'Calendar',
  '/audit':                       'Audit',
  '/insights/stage-movement':     'Insights · Stage Movement',
  '/insights/missing-notes':      'Insights · Missing Notes',
  '/insights/workload':           'Insights · Team Workload',
  '/insights/overdue-tasks':      'Insights · Overdue Tasks',
  '/insights/poc':                'Insights · POC Tracker',
  '/insights/rfx':                'Insights · RFX Tracker',
  '/settings/users':              'Settings · Users',
  '/settings/import':             'Settings · Import',
  '/settings/import-history':     'Settings · Import History',
  '/settings/menu-settings':      'Settings · Menu Settings',
};

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  LOGIN:             { label: 'Login',              color: 'bg-status-success/15 text-status-success dark:text-status-d-success' },
  LOGOUT:            { label: 'Logout',             color: 'bg-brand-navy-30/30 text-brand-navy-70 dark:text-fg-2' },
  CREATE_USER:       { label: 'Create User',        color: 'bg-brand-purple/10 dark:bg-accent-purple-soft text-brand-purple' },
  UPDATE_USER:       { label: 'Update User',        color: 'bg-brand-purple/10 dark:bg-accent-purple-soft text-brand-purple' },
  DELETE_USER:       { label: 'Delete User',        color: 'bg-status-overdue/15 text-status-overdue dark:text-status-d-overdue' },
  RESET_PASSWORD:    { label: 'Reset Password',     color: 'bg-status-warning/15 text-status-warning dark:text-status-d-warning' },
  REASSIGN_WORKLOAD: { label: 'Reassign Workload',  color: 'bg-brand-navy-30/30 text-brand-navy-70 dark:text-fg-2' },
  IMPORT:            { label: 'SF Import',          color: 'bg-status-info/15 text-status-info dark:text-status-d-info' },
  ASSIGN_SE:         { label: 'Assign SE',          color: 'bg-brand-purple/10 dark:bg-accent-purple-soft text-brand-purple' },
  CREATE_TASK:       { label: 'Create Task',        color: 'bg-status-success/15 text-status-success dark:text-status-d-success' },
  UPDATE_TASK:       { label: 'Update Task',        color: 'bg-brand-navy-30/30 text-brand-navy-70 dark:text-fg-2' },
  DELETE_TASK:       { label: 'Delete Task',        color: 'bg-status-overdue/15 text-status-overdue dark:text-status-d-overdue' },
};

const FEATURE_LABELS: Record<string, Record<string, string>> = {
  open:     { opportunity: 'Opportunity Details Opened' },
  generate: { summary: 'AI Summaries Generated' },
  click:    { '': 'Generic Clicks' },
};

function featureLabel(action: string, entityType: string): string {
  return FEATURE_LABELS[action]?.[entityType] ?? `${action}${entityType ? ` · ${entityType}` : ''}`;
}

function ActionBadge({ action }: { action: string }) {
  const cfg = ACTION_LABELS[action] ?? { label: action, color: 'bg-brand-navy-30/30 text-brand-navy-70 dark:text-fg-2' };
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white dark:bg-ink-1 rounded-xl border border-brand-navy-30/40 dark:border-ink-border-soft px-4 py-3">
      <p className="text-[11px] text-brand-navy-70 dark:text-fg-2 font-medium uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-2xl font-semibold text-brand-navy dark:text-fg-1 leading-tight">{value}</p>
      {sub && <p className="text-[11px] text-brand-navy-70 dark:text-fg-2 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Tab: Usage ────────────────────────────────────────────────────────────────

function UsageTab() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<ApiResponse<UsageData>>('/audit/usage')
      .then(r => setData(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="py-16 text-center text-sm text-brand-navy-70 dark:text-fg-2">Loading…</div>;
  if (!data)   return <div className="py-16 text-center text-sm text-status-overdue dark:text-status-d-overdue">Failed to load usage data.</div>;

  const totalViews  = data.pageViews.reduce((s, r) => s + parseInt(r.views), 0);
  const totalEvents = data.userActivity.reduce((s, r) => s + parseInt(r.total_events), 0);
  const oppOpens    = data.featureUsage.find(r => r.action === 'open' && r.entity_type === 'opportunity');
  const aiSummaries = data.featureUsage.find(r => r.action === 'generate' && r.entity_type === 'summary');

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Page Views (180d)" value={totalViews.toLocaleString()} />
        <StatCard label="Total Events (180d)" value={totalEvents.toLocaleString()} />
        <StatCard label="Opp Details Opened" value={oppOpens ? parseInt(oppOpens.count).toLocaleString() : '0'} />
        <StatCard label="AI Summaries" value={aiSummaries ? parseInt(aiSummaries.count).toLocaleString() : '0'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Page views table */}
        <div className="bg-white dark:bg-ink-1 rounded-2xl border border-brand-navy-30/40 dark:border-ink-border-soft overflow-hidden">
          <div className="px-4 py-3 border-b border-brand-navy-30/40 dark:border-ink-border-soft">
            <h3 className="text-sm font-semibold text-brand-navy dark:text-fg-1">Page Views</h3>
            <p className="text-xs text-brand-navy-70 dark:text-fg-2">Last 180 days</p>
          </div>
          {data.pageViews.length === 0 ? (
            <p className="text-sm text-brand-navy-70 dark:text-fg-2 py-8 text-center">No data yet</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-brand-navy-30/40 dark:border-ink-border-soft">
                  <th className="px-4 py-2 text-left text-[11px] font-semibold text-brand-navy-70 dark:text-fg-2 uppercase tracking-wide">Page</th>
                  <th className="px-4 py-2 text-right text-[11px] font-semibold text-brand-navy-70 dark:text-fg-2 uppercase tracking-wide">Views</th>
                  <th className="px-4 py-2 text-right text-[11px] font-semibold text-brand-navy-70 dark:text-fg-2 uppercase tracking-wide">Users</th>
                  <th className="px-4 py-2 text-right text-[11px] font-semibold text-brand-navy-70 dark:text-fg-2 uppercase tracking-wide">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {data.pageViews.map(row => (
                  <tr key={row.page} className="border-b border-brand-navy-30/20 dark:border-ink-border-soft last:border-0">
                    <td className="px-4 py-2.5 text-sm text-brand-navy dark:text-fg-1 font-medium">
                      {PAGE_LABELS[row.page] ?? row.page}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-brand-navy dark:text-fg-1 text-right font-semibold">
                      {parseInt(row.views).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-brand-navy-70 dark:text-fg-2 text-right">
                      {parseInt(row.unique_users).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-brand-navy-70 dark:text-fg-2 text-right">
                      {formatDate(row.last_seen)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Right column: feature usage + per-user activity */}
        <div className="space-y-4">
          {/* Feature usage */}
          <div className="bg-white dark:bg-ink-1 rounded-2xl border border-brand-navy-30/40 dark:border-ink-border-soft overflow-hidden">
            <div className="px-4 py-3 border-b border-brand-navy-30/40 dark:border-ink-border-soft">
              <h3 className="text-sm font-semibold text-brand-navy dark:text-fg-1">Feature Usage</h3>
              <p className="text-xs text-brand-navy-70 dark:text-fg-2">Non-navigation interactions, last 180 days</p>
            </div>
            {data.featureUsage.length === 0 ? (
              <p className="text-sm text-brand-navy-70 dark:text-fg-2 py-6 text-center">No data yet</p>
            ) : (
              <div className="divide-y divide-brand-navy-30/20">
                {data.featureUsage.map((row, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-sm text-brand-navy dark:text-fg-1">
                      {featureLabel(row.action, row.entity_type)}
                    </span>
                    <span className="text-sm font-semibold text-brand-navy dark:text-fg-1">
                      {parseInt(row.count).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Per-user activity */}
          <div className="bg-white dark:bg-ink-1 rounded-2xl border border-brand-navy-30/40 dark:border-ink-border-soft overflow-hidden">
            <div className="px-4 py-3 border-b border-brand-navy-30/40 dark:border-ink-border-soft">
              <h3 className="text-sm font-semibold text-brand-navy dark:text-fg-1">User Activity</h3>
              <p className="text-xs text-brand-navy-70 dark:text-fg-2">Total events per user, last 180 days</p>
            </div>
            {data.userActivity.length === 0 ? (
              <p className="text-sm text-brand-navy-70 dark:text-fg-2 py-6 text-center">No data yet</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-brand-navy-30/40 dark:border-ink-border-soft">
                    <th className="px-4 py-2 text-left text-[11px] font-semibold text-brand-navy-70 dark:text-fg-2 uppercase tracking-wide">User</th>
                    <th className="px-4 py-2 text-right text-[11px] font-semibold text-brand-navy-70 dark:text-fg-2 uppercase tracking-wide">Events</th>
                    <th className="px-4 py-2 text-right text-[11px] font-semibold text-brand-navy-70 dark:text-fg-2 uppercase tracking-wide">Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {data.userActivity.map(row => (
                    <tr key={row.user_id} className="border-b border-brand-navy-30/20 dark:border-ink-border-soft last:border-0">
                      <td className="px-4 py-2.5 text-sm font-medium text-brand-navy dark:text-fg-1">{row.name ?? '—'}</td>
                      <td className="px-4 py-2.5 text-sm font-semibold text-brand-navy dark:text-fg-1 text-right">
                        {parseInt(row.total_events).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-brand-navy-70 dark:text-fg-2 text-right">
                        {formatDate(row.last_seen)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Activity Log ─────────────────────────────────────────────────────────

function ActivityLogTab() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [days,    setDays]    = useState(30);
  const [userId,  setUserId]  = useState<number | ''>('');
  const [action,  setAction]  = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  const [filterUsers,  setFilterUsers]  = useState<{ id: number; name: string }[]>([]);
  const [filterActions, setFilterActions] = useState<string[]>([]);

  useEffect(() => {
    api.get<ApiResponse<{ id: number; name: string }[]>>('/audit/users')
      .then(r => setFilterUsers(r.data.data)).catch(() => {});
    api.get<ApiResponse<string[]>>('/audit/actions')
      .then(r => setFilterActions(r.data.data)).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ days: String(days), limit: '100' });
    if (userId)  params.set('user_id', String(userId));
    if (action)  params.set('action',  action);
    api.get<ApiResponse<{ entries: AuditEntry[]; total: number }>>(`/audit/log?${params}`)
      .then(r => { setEntries(r.data.data.entries); setTotal(r.data.data.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [days, userId, action]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Days */}
        <div className="flex rounded-lg border border-brand-navy-30 overflow-hidden text-xs">
          {[7, 30, 90, 180].map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={`px-2.5 py-1.5 font-medium transition-colors border-r last:border-r-0 border-brand-navy-30 ${
                days === d ? 'bg-brand-navy text-white' : 'bg-white dark:bg-ink-1 text-brand-navy-70 dark:text-fg-2 hover:bg-gray-50 dark:bg-ink-2'
              }`}>
              {d}d
            </button>
          ))}
        </div>

        {/* User filter */}
        {filterUsers.length > 0 && (
          <select value={userId} onChange={e => setUserId(e.target.value ? parseInt(e.target.value) : '')}
            className="px-2.5 py-1.5 rounded-lg border border-brand-navy-30 text-xs text-brand-navy dark:text-fg-1 bg-white dark:bg-ink-1 focus:outline-none focus:ring-1 focus:ring-brand-purple">
            <option value="">All users</option>
            {filterUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}

        {/* Action filter */}
        {filterActions.length > 0 && (
          <select value={action} onChange={e => setAction(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-brand-navy-30 text-xs text-brand-navy dark:text-fg-1 bg-white dark:bg-ink-1 focus:outline-none focus:ring-1 focus:ring-brand-purple">
            <option value="">All actions</option>
            {filterActions.map(a => (
              <option key={a} value={a}>{ACTION_LABELS[a]?.label ?? a}</option>
            ))}
          </select>
        )}

        <span className="text-xs text-brand-navy-70 dark:text-fg-2 ml-auto">
          {loading ? 'Loading…' : `${total.toLocaleString()} entries`}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-ink-1 rounded-2xl border border-brand-navy-30/40 dark:border-ink-border-soft overflow-hidden">
        {entries.length === 0 && !loading ? (
          <p className="text-sm text-brand-navy-70 dark:text-fg-2 py-10 text-center">No audit entries for this filter.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-brand-navy-30/40 dark:border-ink-border-soft">
              <tr>
                {['Time', 'User', 'Action', 'Resource', 'Detail'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 dark:text-fg-2 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <>
                  <tr
                    key={e.id}
                    onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                    className={`border-b border-brand-navy-30/20 dark:border-ink-border-soft last:border-0 cursor-pointer transition-colors ${
                      expanded === e.id ? 'bg-brand-purple-30/20' : 'hover:bg-gray-50 dark:bg-ink-2/50'
                    } ${!e.success ? 'bg-status-overdue/5' : ''}`}
                  >
                    <td className="px-4 py-2.5 text-xs text-brand-navy-70 dark:text-fg-2 whitespace-nowrap">
                      {new Date(e.timestamp).toLocaleString('en-US', {
                        month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="text-sm font-medium text-brand-navy dark:text-fg-1 leading-tight">{e.user_name ?? '—'}</p>
                      <p className="text-[10px] text-brand-navy-70 dark:text-fg-2 capitalize">{e.user_role}</p>
                    </td>
                    <td className="px-4 py-2.5"><ActionBadge action={e.action} /></td>
                    <td className="px-4 py-2.5">
                      <p className="text-sm text-brand-navy dark:text-fg-1">{(e.resource_name ?? e.resource_id) || '—'}</p>
                      <p className="text-[10px] text-brand-navy-70 dark:text-fg-2 capitalize">{e.resource_type}</p>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-brand-navy-70 dark:text-fg-2">
                      {!e.success
                        ? <span className="text-status-overdue dark:text-status-d-overdue font-medium">{e.failure_reason ?? 'Failed'}</span>
                        : e.after_value
                          ? <span className="font-mono text-[10px]">{JSON.stringify(e.after_value).slice(0, 60)}{JSON.stringify(e.after_value).length > 60 ? '…' : ''}</span>
                          : '—'
                      }
                    </td>
                  </tr>
                  {expanded === e.id && (
                    <tr key={`${e.id}-exp`} className="bg-brand-purple-30/10 border-b border-brand-navy-30/20 dark:border-ink-border-soft">
                      <td colSpan={5} className="px-6 py-3">
                        <div className="grid grid-cols-2 gap-4 text-xs">
                          {e.before_value && (
                            <div>
                              <p className="font-semibold text-brand-navy-70 dark:text-fg-2 mb-1">Before</p>
                              <pre className="font-mono text-brand-navy dark:text-fg-1 bg-white dark:bg-ink-1 rounded-lg p-2 border border-brand-navy-30/40 dark:border-ink-border-soft overflow-x-auto">
                                {JSON.stringify(e.before_value, null, 2)}
                              </pre>
                            </div>
                          )}
                          {e.after_value && (
                            <div>
                              <p className="font-semibold text-brand-navy-70 dark:text-fg-2 mb-1">After</p>
                              <pre className="font-mono text-brand-navy dark:text-fg-1 bg-white dark:bg-ink-1 rounded-lg p-2 border border-brand-navy-30/40 dark:border-ink-border-soft overflow-x-auto">
                                {JSON.stringify(e.after_value, null, 2)}
                              </pre>
                            </div>
                          )}
                          <div className="col-span-2 flex gap-6 text-brand-navy-70 dark:text-fg-2 pt-1">
                            {e.ip_address && <span>IP: <span className="font-mono text-brand-navy dark:text-fg-1">{e.ip_address}</span></span>}
                            <span>ID: <span className="font-mono text-brand-navy dark:text-fg-1">#{e.id}</span></span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = 'usage' | 'log';

export default function AuditPage() {
  const [tab, setTab] = useState<Tab>('usage');

  return (
    <div className="flex-1 overflow-auto bg-[#F5F5F7] dark:bg-ink-0 px-8 py-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-brand-navy dark:text-fg-1">Audit</h1>
        <p className="text-sm text-brand-navy-70 dark:text-fg-2 mt-0.5">Usage analytics and activity audit trail — last 180 days</p>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 border-b border-brand-navy-30/40 dark:border-ink-border-soft mb-6">
        {([
          { id: 'usage' as Tab, label: 'Usage' },
          { id: 'log'   as Tab, label: 'Activity Log' },
        ]).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px ${
              tab === t.id
                ? 'border-brand-purple text-brand-purple'
                : 'border-transparent text-brand-navy-70 dark:text-fg-2 hover:text-brand-navy'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'usage' ? <UsageTab /> : <ActivityLogTab />}
    </div>
  );
}
