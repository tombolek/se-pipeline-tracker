import { useState, useEffect, useMemo } from 'react';
import api from '../../api/client';
import type { ApiResponse } from '../../types';
import { useTeamScope } from '../../hooks/useTeamScope';
import { useAiJobAttach } from '../../hooks/useAiJob';
import StageBadge from '../../components/shared/StageBadge';
import MultiSelectFilter from '../../components/shared/MultiSelectFilter';
import { formatDate } from '../../utils/formatters';
import { PageHeader, Empty, Loading } from './shared';

interface AgenticRow {
  id: number;
  name: string;
  account_name: string;
  stage: string;
  deploy_mode: string | null;
  team: string | null;
  record_type: string | null;
  agentic_qual: string;
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

/** Converts a subset of markdown to JSX */
function MarkdownContent({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-3 text-sm text-brand-navy leading-relaxed">
      {blocks.map((block, i) => {
        const lines = block.trim().split('\n');
        if (lines[0].startsWith('## ')) {
          return <h3 key={i} className="font-semibold text-brand-navy text-sm mt-2 mb-0.5">{lines[0].replace(/^## /, '')}</h3>;
        }
        if (lines[0].startsWith('### ')) {
          return <h4 key={i} className="font-medium text-brand-navy text-sm mt-1">{lines[0].replace(/^### /, '')}</h4>;
        }
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
        if (lines.every(l => /^\d+\. /.test(l))) {
          return (
            <ol key={i} className="list-decimal ml-4 space-y-1">
              {lines.map((l, j) => (
                <li key={j} dangerouslySetInnerHTML={{ __html: inlineMd(l.replace(/^\d+\. /, '')) }} />
              ))}
            </ol>
          );
        }
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

export default function AgenticQualPage() {
  const [tab, setTab] = useState<Tab>('all');
  const [days, setDays] = useState(30);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const [allRows, setAllRows] = useState<AgenticRow[]>([]);
  const [recentRows, setRecentRows] = useState<RecentRow[]>([]);
  const [loadingAll, setLoadingAll] = useState(true);
  const [loadingRecent, setLoadingRecent] = useState(false);

  const [deployFilter, setDeployFilter] = useState<string[]>([]);
  const [seFilter, setSeFilter] = useState<string[]>([]);
  const [stageFilter, setStageFilter] = useState<string[]>([]);
  const [teamFilter, setTeamFilter] = useState<string[]>(['EMEA', 'NA Enterprise', 'NA Strategic', 'ANZ']);
  const [recordTypeFilter, setRecordTypeFilter] = useState<string[]>([]);

  const [summary, setSummary] = useState<string | null>(null);
  const [summaryGeneratedAt, setSummaryGeneratedAt] = useState<string | null>(null);
  const [generatingSummary, setGeneratingSummary] = useState(false);

  function resetFilters() {
    setDeployFilter([]);
    setSeFilter([]);
    setStageFilter([]);
    setTeamFilter(['EMEA', 'NA Enterprise', 'NA Strategic', 'ANZ']);
    setRecordTypeFilter([]);
  }

  const { filterOpp } = useTeamScope();
  const scopedRows = useMemo(() => allRows.filter(filterOpp), [allRows, filterOpp]);

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

  useEffect(() => {
    setLoadingAll(true);
    api.get<ApiResponse<AgenticRow[]>>('/insights/agentic-qual')
      .then(r => setAllRows(r.data.data))
      .finally(() => setLoadingAll(false));
    api.get<ApiResponse<{ summary: string; generated_at: string } | null>>('/insights/agentic-qual/ai-summary/cached')
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
    api.get<ApiResponse<RecentRow[]>>(`/insights/agentic-qual/recent?days=${days}`)
      .then(r => setRecentRows(r.data.data))
      .finally(() => setLoadingRecent(false));
  }, [tab, days]);

  // Re-attach to in-flight AI summary generation if user navigates back mid-generation.
  useAiJobAttach({
    key: 'agentic-qual',
    currentGeneratedAt: summaryGeneratedAt,
    fetchCached: async () => {
      const r = await api.get<ApiResponse<{ summary: string; generated_at: string } | null>>(
        '/insights/agentic-qual/ai-summary/cached'
      );
      return { generatedAt: r.data.data?.generated_at ?? null };
    },
    onRunning: () => setGeneratingSummary(true),
    onFresh: async () => {
      const r = await api.get<ApiResponse<{ summary: string; generated_at: string } | null>>(
        '/insights/agentic-qual/ai-summary/cached'
      );
      if (r.data.data) {
        setSummary(r.data.data.summary);
        setSummaryGeneratedAt(r.data.data.generated_at);
      }
      setGeneratingSummary(false);
    },
    onTimeout: () => setGeneratingSummary(false),
  });

  function generateSummary() {
    setGeneratingSummary(true);
    api.post<ApiResponse<{ summary: string; generated_at: string; count?: number }>>('/insights/agentic-qual/ai-summary', {})
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

  const filteredRows = scopedRows.filter(r => {
    if (deployFilter.length > 0 && !deployFilter.includes(r.deploy_mode ?? '—')) return false;
    if (seFilter.length > 0 && !seFilter.includes(r.se_owner_name ?? 'Unassigned')) return false;
    if (stageFilter.length > 0 && !stageFilter.includes(r.stage)) return false;
    if (teamFilter.length > 0 && !teamFilter.includes(r.team ?? '—')) return false;
    if (recordTypeFilter.length > 0 && !recordTypeFilter.includes(r.record_type ?? '')) return false;
    return true;
  });

  return (
    <div>
      <div className="flex items-center gap-4 mb-5">
        <PageHeader
          title="Agentic Qualification"
          subtitle={`${allRows.length} opportunit${allRows.length !== 1 ? 'ies' : 'y'} with Agentic Qual notes`}
        />
      </div>

      {/* AI Summary */}
      <div className="mb-5 bg-white rounded-2xl border border-brand-navy-30/40 overflow-hidden">
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
                <span className="text-xs text-brand-navy-70">— Agentic qualification analysis</span>
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

        {summaryOpen && (
          <div className="px-4 pb-4 border-t border-brand-navy-30/30">
            {summary ? (
              <>
                <div className="mt-4"><MarkdownContent text={summary} /></div>
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={generateSummary}
                    disabled={generatingSummary}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-purple text-white hover:bg-brand-purple-70 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {generatingSummary ? (
                      <><svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>Generating…</>
                    ) : 'Regenerate'}
                  </button>
                </div>
              </>
            ) : (
              <div className="mt-4 flex items-center justify-between gap-4">
                <p className="text-xs text-brand-navy-70">
                  Analyses all {allRows.length} entries to surface why deals aren't qualifying as Agentic.
                </p>
                <button
                  onClick={generateSummary}
                  disabled={generatingSummary || allRows.length === 0}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-purple text-white hover:bg-brand-purple-70 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {generatingSummary ? (
                    <><svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>Generating…</>
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
            {t === 'all' ? 'All Entries' : 'Recently Changed'}
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

      {/* Filters (All tab only) */}
      {tab === 'all' && !loadingAll && allRows.length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <MultiSelectFilter options={deployOptions}     selected={deployFilter}     onChange={setDeployFilter}     placeholder="Deploy Mode" />
          <MultiSelectFilter options={seOptions}         selected={seFilter}         onChange={setSeFilter}         placeholder="SE Owner" />
          <MultiSelectFilter options={stageOptions}      selected={stageFilter}      onChange={setStageFilter}      placeholder="Stage" />
          <MultiSelectFilter options={teamOptions}       selected={teamFilter}       onChange={setTeamFilter}       placeholder="All teams" />
          <MultiSelectFilter options={recordTypeOptions} selected={recordTypeFilter} onChange={setRecordTypeFilter} placeholder="All types" />
          {(deployFilter.length > 0 || seFilter.length > 0 || stageFilter.length > 0 || recordTypeFilter.length > 0 ||
            JSON.stringify(teamFilter.slice().sort()) !== JSON.stringify(['ANZ', 'EMEA', 'NA Enterprise', 'NA Strategic'])) && (
            <button
              onClick={resetFilters}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-brand-navy-30 text-brand-navy-70 hover:border-brand-navy hover:text-brand-navy transition-colors"
            >
              Reset filters
            </button>
          )}
        </div>
      )}

      {/* All Entries Tab */}
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
                  {['Opportunity', 'Stage', 'SE Owner', 'Deploy Mode', 'Agentic Qualification Notes'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(r => (
                  <tr key={r.id} className="border-b border-brand-navy-30/20 last:border-0 hover:bg-gray-50 align-top">
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
                    <td className="px-4 py-3 text-sm text-brand-navy max-w-[480px]">
                      <p className="whitespace-pre-wrap leading-relaxed">{r.agentic_qual}</p>
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
              No Agentic Qual changes in the last {days} days. Changes are tracked from the next import onwards.
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
