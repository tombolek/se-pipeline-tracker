import { useState, useEffect, useMemo } from 'react';
import api from '../../api/client';
import type { ApiResponse } from '../../types';
import { useTeamScope } from '../../hooks/useTeamScope';
import StageBadge from '../../components/shared/StageBadge';
import MultiSelectFilter from '../../components/shared/MultiSelectFilter';
import { formatDate } from '../../utils/formatters';
import { PageHeader, Empty, Loading } from './shared';

type BlockerStatus = 'red' | 'orange' | 'yellow' | 'green' | 'none';

interface BlockerRow {
  id: number;
  name: string;
  account_name: string;
  stage: string;
  deploy_mode: string | null;
  team: string | null;
  record_type: string | null;
  technical_blockers: string;
  blocker_status: BlockerStatus;
  se_owner_id: number | null;
  se_owner_name: string | null;
  updated_at: string;
}

interface RecentRow {
  id: number;
  name: string;
  account_name: string;
  stage: string;
  deploy_mode: string | null;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
  se_owner_name: string | null;
}

type Tab = 'all' | 'recent';
type StatusFilter = 'active' | 'all' | BlockerStatus;

const STATUS_CONFIG: Record<BlockerStatus, { label: string; dot: string; badge: string }> = {
  red:    { label: '🔴 Critical',  dot: 'bg-status-overdue',  badge: 'bg-red-100 text-red-700' },
  orange: { label: '🟠 High',      dot: 'bg-orange-400',      badge: 'bg-orange-100 text-orange-700' },
  yellow: { label: '🟡 Medium',    dot: 'bg-status-warning',  badge: 'bg-yellow-100 text-yellow-700' },
  green:  { label: '🟢 Low/None',  dot: 'bg-status-success',  badge: 'bg-green-100 text-green-700' },
  none:   { label: 'No status',    dot: 'bg-brand-navy-30',   badge: 'bg-gray-100 text-gray-600' },
};

function StatusBadge({ status }: { status: BlockerStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

/** Returns true for entries that are genuine "no blockers" noise */
function isNoBlocker(row: BlockerRow): boolean {
  return (
    row.blocker_status === 'green' ||
    /^no (technical )?(blocker|risk)/i.test(row.technical_blockers) ||
    /^none/i.test(row.technical_blockers) ||
    /^n\/a/i.test(row.technical_blockers) ||
    /^no (known|detailed) (requirement|blocker|risk)/i.test(row.technical_blockers)
  );
}

/** Converts a subset of markdown to JSX — handles ##/### headers, **bold**, - bullets, blank-line paragraphs */
function MarkdownContent({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-3 text-sm text-brand-navy leading-relaxed">
      {blocks.map((block, i) => {
        const lines = block.trim().split('\n');

        // Heading
        if (lines[0].startsWith('## ')) {
          return <h3 key={i} className="font-semibold text-brand-navy text-sm mt-2 mb-0.5">{lines[0].replace(/^## /, '')}</h3>;
        }
        if (lines[0].startsWith('### ')) {
          return <h4 key={i} className="font-medium text-brand-navy text-sm mt-1">{lines[0].replace(/^### /, '')}</h4>;
        }

        // All lines are list items
        const listLines = lines.filter(l => /^[-*•\d+\.] /.test(l));
        if (listLines.length === lines.length) {
          return (
            <ul key={i} className="list-disc ml-4 space-y-1">
              {lines.map((l, j) => (
                <li key={j} dangerouslySetInnerHTML={{ __html: inlineMd(l.replace(/^[-*•\d+\.] /, '')) }} />
              ))}
            </ul>
          );
        }

        // Numbered list
        if (lines.every(l => /^\d+\. /.test(l))) {
          return (
            <ol key={i} className="list-decimal ml-4 space-y-1">
              {lines.map((l, j) => (
                <li key={j} dangerouslySetInnerHTML={{ __html: inlineMd(l.replace(/^\d+\. /, '')) }} />
              ))}
            </ol>
          );
        }

        // Mixed block (paragraph + possible inline list)
        return (
          <p key={i} dangerouslySetInnerHTML={{
            __html: lines.map(l =>
              /^[-*•] /.test(l) ? `<span class="block ml-4">• ${inlineMd(l.replace(/^[-*•] /, ''))}</span>` : inlineMd(l)
            ).join('<br>')
          }} />
        );
      })}
    </div>
  );
}

function inlineMd(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

export default function TechBlockersPage() {
  const [tab, setTab] = useState<Tab>('all');
  const [days, setDays] = useState(30);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [summaryOpen, setSummaryOpen] = useState(false);

  const [allRows, setAllRows] = useState<BlockerRow[]>([]);
  const [recentRows, setRecentRows] = useState<RecentRow[]>([]);
  const [loadingAll, setLoadingAll] = useState(true);
  const [loadingRecent, setLoadingRecent] = useState(false);

  // Multi-select filters ([] = all shown, except teamFilter which defaults to 4 teams)
  const [deployFilter, setDeployFilter] = useState<string[]>([]);
  const [seFilter, setSeFilter] = useState<string[]>([]);
  const [stageFilter, setStageFilter] = useState<string[]>([]);
  const [teamFilter, setTeamFilter] = useState<string[]>(['EMEA', 'NA Enterprise', 'NA Strategic', 'ANZ']);
  const [recordTypeFilter, setRecordTypeFilter] = useState<string[]>([]);

  function resetFilters() {
    setDeployFilter([]);
    setSeFilter([]);
    setStageFilter([]);
    setTeamFilter(['EMEA', 'NA Enterprise', 'NA Strategic', 'ANZ']);
    setRecordTypeFilter([]);
    setStatusFilter('active');
  }

  const { seIds } = useTeamScope();
  const scopedRows = useMemo(() =>
    seIds.size > 0 ? allRows.filter(r => r.se_owner_id !== null && seIds.has(r.se_owner_id)) : allRows,
    [allRows, seIds]
  );

  const deployOptions = useMemo(() =>
    [...new Set(scopedRows.map(r => r.deploy_mode ?? '—'))].sort(), [scopedRows]);
  const seOptions = useMemo(() =>
    [...new Set(scopedRows.map(r => r.se_owner_name ?? 'Unassigned'))].sort(), [scopedRows]);
  const stageOptions = useMemo(() =>
    [...new Set(scopedRows.map(r => r.stage))].sort(), [scopedRows]);
  const teamOptions = useMemo(() =>
    [...new Set(scopedRows.map(r => r.team ?? '—'))].sort(), [scopedRows]);
  const recordTypeOptions = useMemo(() =>
    [...new Set(scopedRows.map(r => r.record_type).filter(Boolean) as string[])].sort(), [scopedRows]);

  const [summary, setSummary] = useState<string | null>(null);
  const [summaryGeneratedAt, setSummaryGeneratedAt] = useState<string | null>(null);
  const [generatingSummary, setGeneratingSummary] = useState(false);

  useEffect(() => {
    setLoadingAll(true);
    api.get<ApiResponse<BlockerRow[]>>('/insights/tech-blockers')
      .then(r => setAllRows(r.data.data))
      .finally(() => setLoadingAll(false));
    // Load cached summary
    api.get<ApiResponse<{ summary: string; generated_at: string } | null>>('/insights/tech-blockers/ai-summary/cached')
      .then(r => {
        if (r.data.data) {
          setSummary(r.data.data.summary);
          setSummaryGeneratedAt(r.data.data.generated_at);
        }
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    if (tab !== 'recent') return;
    setLoadingRecent(true);
    api.get<ApiResponse<RecentRow[]>>(`/insights/tech-blockers/recent?days=${days}`)
      .then(r => setRecentRows(r.data.data))
      .finally(() => setLoadingRecent(false));
  }, [tab, days]);

  function generateSummary() {
    setGeneratingSummary(true);
    api.post<ApiResponse<{ summary: string; generated_at: string; count?: number }>>('/insights/tech-blockers/ai-summary', {})
      .then(r => {
        setSummary(r.data.data.summary);
        setSummaryGeneratedAt(r.data.data.generated_at);
      })
      .finally(() => setGeneratingSummary(false));
  }

  function summaryAgeDays(): number | null {
    if (!summaryGeneratedAt) return null;
    const diff = Date.now() - new Date(summaryGeneratedAt).getTime();
    return Math.floor(diff / 86_400_000);
  }

  // Apply all filters
  const filteredRows = scopedRows.filter(r => {
    // Status filter
    if (statusFilter === 'active' && isNoBlocker(r)) return false;
    if (statusFilter !== 'active' && statusFilter !== 'all' && r.blocker_status !== statusFilter) return false;
    // Deploy mode filter
    if (deployFilter.length > 0 && !deployFilter.includes(r.deploy_mode ?? '—')) return false;
    // SE owner filter
    if (seFilter.length > 0 && !seFilter.includes(r.se_owner_name ?? 'Unassigned')) return false;
    // Stage filter
    if (stageFilter.length > 0 && !stageFilter.includes(r.stage)) return false;
    // Team filter
    if (teamFilter.length > 0 && !teamFilter.includes(r.team ?? '—')) return false;
    // Record type filter
    if (recordTypeFilter.length > 0 && !recordTypeFilter.includes(r.record_type ?? '')) return false;
    return true;
  });

  // Status counts for filter buttons
  const counts = {
    active: allRows.filter(r => !isNoBlocker(r)).length,
    all: allRows.length,
    red: allRows.filter(r => r.blocker_status === 'red').length,
    orange: allRows.filter(r => r.blocker_status === 'orange').length,
    yellow: allRows.filter(r => r.blocker_status === 'yellow').length,
    green: allRows.filter(r => isNoBlocker(r)).length,
    none: allRows.filter(r => r.blocker_status === 'none' && !isNoBlocker(r)).length,
  };

  return (
    <div>
      <div className="flex items-center gap-4 mb-5">
        <PageHeader
          title="Technical Risks & Blockers"
          subtitle={`${counts.active} active blockers across the pipeline`}
        />
      </div>

      {/* AI Summary — collapsible */}
      <div className="mb-5 bg-white rounded-2xl border border-brand-navy-30/40 overflow-hidden">
        {/* Header row — always visible, click to expand/collapse */}
        <button
          onClick={() => setSummaryOpen(o => !o)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <svg className="w-4 h-4 text-brand-purple flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
            </svg>
            <span className="text-sm font-semibold text-brand-navy">AI Insights</span>
            {summary ? (
              <>
                <span className="text-xs text-brand-navy-70">— pipeline blocker analysis</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  summaryAgeDays() === 0 ? 'bg-green-100 text-green-700'
                  : summaryAgeDays()! <= 3 ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-red-100 text-red-700'
                }`}>
                  {summaryAgeDays() === 0 ? 'Generated today' : `${summaryAgeDays()}d old`}
                </span>
              </>
            ) : (
              <span className="text-xs text-brand-navy-30">— no summary yet</span>
            )}
          </div>
          <svg
            className={`w-4 h-4 text-brand-navy-70 flex-shrink-0 transition-transform ${summaryOpen ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
          </svg>
        </button>

        {/* Expanded body */}
        {summaryOpen && (
          <div className="px-4 pb-4 border-t border-brand-navy-30/30">
            {summary ? (
              <>
                <div className="mt-4">
                  <MarkdownContent text={summary} />
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={generateSummary}
                    disabled={generatingSummary}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-purple text-white hover:bg-brand-purple-70 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {generatingSummary ? (
                      <>
                        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                        </svg>
                        Generating…
                      </>
                    ) : 'Regenerate'}
                  </button>
                </div>
              </>
            ) : (
              <div className="mt-4 flex items-center justify-between gap-4">
                <p className="text-xs text-brand-navy-70">
                  Analyses all {counts.all} entries weighted by severity — critical and high blockers drive the conclusions.
                </p>
                <button
                  onClick={generateSummary}
                  disabled={generatingSummary || counts.all === 0}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-purple text-white hover:bg-brand-purple-70 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {generatingSummary ? (
                    <>
                      <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      Generating…
                    </>
                  ) : 'Generate Summary'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4">
        {(['all', 'recent'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === t ? 'bg-brand-purple text-white' : 'text-brand-navy-70 hover:text-brand-navy hover:bg-brand-purple-30/50'
            }`}
          >
            {t === 'all' ? 'All Blockers' : 'Recently Changed'}
          </button>
        ))}
        {tab === 'recent' && (
          <div className="ml-auto flex items-center gap-2">
            {[14, 30, 60, 90].map(d => (
              <button key={d} onClick={() => setDays(d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  days === d
                    ? 'bg-brand-purple text-white border-brand-purple'
                    : 'border-brand-navy-30 text-brand-navy-70 hover:border-brand-navy hover:text-brand-navy'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Multi-select filters (All tab only) */}
      {tab === 'all' && !loadingAll && allRows.length > 0 && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <MultiSelectFilter
            options={deployOptions}
            selected={deployFilter}
            onChange={setDeployFilter}
            placeholder="Deploy Mode"
          />
          <MultiSelectFilter
            options={seOptions}
            selected={seFilter}
            onChange={setSeFilter}
            placeholder="SE Owner"
          />
          <MultiSelectFilter
            options={stageOptions}
            selected={stageFilter}
            onChange={setStageFilter}
            placeholder="Stage"
          />
          <MultiSelectFilter
            options={teamOptions}
            selected={teamFilter}
            onChange={setTeamFilter}
            placeholder="All teams"
          />
          <MultiSelectFilter
            options={recordTypeOptions}
            selected={recordTypeFilter}
            onChange={setRecordTypeFilter}
            placeholder="All types"
          />
          {(deployFilter.length > 0 || seFilter.length > 0 || stageFilter.length > 0 || recordTypeFilter.length > 0 ||
            JSON.stringify(teamFilter.slice().sort()) !== JSON.stringify(['ANZ', 'EMEA', 'NA Enterprise', 'NA Strategic']) ||
            statusFilter !== 'active') && (
            <button
              onClick={resetFilters}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-brand-navy-30 text-brand-navy-70 hover:border-brand-navy hover:text-brand-navy transition-colors"
            >
              Reset filters
            </button>
          )}
        </div>
      )}

      {/* Status filter bar (All tab only) */}
      {tab === 'all' && !loadingAll && allRows.length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {([
            ['active', `Active blockers (${counts.active})`],
            ['red',    `🔴 Critical (${counts.red})`],
            ['orange', `🟠 High (${counts.orange})`],
            ['yellow', `🟡 Medium (${counts.yellow})`],
            ['none',   `No status (${counts.none})`],
            ['green',  `🟢 Low/None (${counts.green})`],
            ['all',    `All (${counts.all})`],
          ] as [StatusFilter, string][]).map(([key, label]) => (
            <button key={key} onClick={() => setStatusFilter(key)}
              className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                statusFilter === key
                  ? 'bg-brand-purple text-white border-brand-purple'
                  : 'border-brand-navy-30 text-brand-navy-70 hover:border-brand-navy hover:text-brand-navy'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* All Blockers Tab */}
      {tab === 'all' && (
        loadingAll ? <Loading /> : allRows.length === 0 ? (
          <Empty />
        ) : filteredRows.length === 0 ? (
          <div className="text-center py-12 text-sm text-brand-navy-70">No entries match this filter.</div>
        ) : (
          <div className="bg-white rounded-2xl border border-brand-navy-30/40 overflow-hidden">
            <table className="w-full">
              <thead className="border-b border-brand-navy-30/40">
                <tr>
                  {['Status', 'Opportunity', 'Stage', 'SE Owner', 'Deploy Mode', 'Technical Blockers / Risk'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(r => (
                  <tr key={r.id} className="border-b border-brand-navy-30/20 last:border-0 hover:bg-gray-50 align-top">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge status={r.blocker_status} />
                    </td>
                    <td className="px-4 py-3 min-w-[160px]">
                      <p className="text-sm font-medium text-brand-navy">{r.name}</p>
                      <p className="text-xs text-brand-navy-70">{r.account_name}</p>
                    </td>
                    <td className="px-4 py-3"><StageBadge stage={r.stage} /></td>
                    <td className="px-4 py-3 text-xs text-brand-navy-70 whitespace-nowrap">
                      {r.se_owner_name ?? <span className="text-status-warning">Unassigned</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-brand-navy-70 whitespace-nowrap">
                      {r.deploy_mode ?? <span className="text-brand-navy-30">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-brand-navy max-w-[400px]">
                      <p className="whitespace-pre-wrap leading-relaxed">{r.technical_blockers}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Recently Changed Tab */}
      {tab === 'recent' && (
        loadingRecent ? <Loading /> : recentRows.length === 0 ? (
          <div className="text-center py-8">
            <Empty />
            <p className="mt-2 text-sm text-brand-navy-70 max-w-md mx-auto">
              No technical blocker changes in the last {days} days. Changes are tracked from the next import onwards.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-brand-navy-30/40 overflow-hidden">
            <table className="w-full">
              <thead className="border-b border-brand-navy-30/40">
                <tr>
                  {['Opportunity', 'Stage', 'SE Owner', 'Deploy Mode', 'Previous', 'New Value', 'Changed'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentRows.map((r, i) => (
                  <tr key={i} className="border-b border-brand-navy-30/20 last:border-0 hover:bg-gray-50 align-top">
                    <td className="px-4 py-3 min-w-[160px]">
                      <p className="text-sm font-medium text-brand-navy">{r.name}</p>
                      <p className="text-xs text-brand-navy-70">{r.account_name}</p>
                    </td>
                    <td className="px-4 py-3"><StageBadge stage={r.stage} /></td>
                    <td className="px-4 py-3 text-xs text-brand-navy-70 whitespace-nowrap">
                      {r.se_owner_name ?? <span className="text-status-warning">Unassigned</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-brand-navy-70 whitespace-nowrap">
                      {r.deploy_mode ?? <span className="text-brand-navy-30">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-brand-navy-70 max-w-[200px]">
                      {r.old_value
                        ? <p className="line-clamp-3 whitespace-pre-wrap opacity-60">{r.old_value}</p>
                        : <span className="italic text-brand-navy-30">new entry</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-brand-navy max-w-[240px]">
                      {r.new_value
                        ? <p className="line-clamp-4 whitespace-pre-wrap">{r.new_value}</p>
                        : <span className="italic text-brand-navy-30">cleared</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-brand-navy-70 whitespace-nowrap">
                      {formatDate(r.changed_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
