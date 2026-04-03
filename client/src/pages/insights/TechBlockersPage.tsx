import { useState, useEffect } from 'react';
import api from '../../api/client';
import type { ApiResponse } from '../../types';
import StageBadge from '../../components/shared/StageBadge';
import { formatDate } from '../../utils/formatters';
import { PageHeader, Empty, Loading } from './shared';

interface BlockerRow {
  id: number;
  name: string;
  account_name: string;
  stage: string;
  deploy_mode: string | null;
  technical_blockers: string;
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

export default function TechBlockersPage() {
  const [tab, setTab] = useState<Tab>('all');
  const [days, setDays] = useState(30);

  const [allRows, setAllRows] = useState<BlockerRow[]>([]);
  const [recentRows, setRecentRows] = useState<RecentRow[]>([]);
  const [loadingAll, setLoadingAll] = useState(true);
  const [loadingRecent, setLoadingRecent] = useState(false);

  const [summary, setSummary] = useState<string | null>(null);
  const [generatingSummary, setGeneratingSummary] = useState(false);

  // Load "all" on mount
  useEffect(() => {
    setLoadingAll(true);
    api.get<ApiResponse<BlockerRow[]>>('/insights/tech-blockers')
      .then(r => setAllRows(r.data.data))
      .finally(() => setLoadingAll(false));
  }, []);

  // Load "recent" when tab or days changes
  useEffect(() => {
    if (tab !== 'recent') return;
    setLoadingRecent(true);
    api.get<ApiResponse<RecentRow[]>>(`/insights/tech-blockers/recent?days=${days}`)
      .then(r => setRecentRows(r.data.data))
      .finally(() => setLoadingRecent(false));
  }, [tab, days]);

  function generateSummary() {
    setGeneratingSummary(true);
    api.post<ApiResponse<{ summary: string; count?: number }>>('/insights/tech-blockers/ai-summary', {})
      .then(r => setSummary(r.data.data.summary))
      .finally(() => setGeneratingSummary(false));
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-5">
        <PageHeader
          title="Technical Risks & Blockers"
          subtitle="Track technical blockers across the active pipeline"
        />
      </div>

      {/* AI Summary */}
      <div className="mb-5 bg-white rounded-2xl border border-brand-navy-30/40 p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-brand-purple flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
            </svg>
            <span className="text-sm font-semibold text-brand-navy">AI Insights</span>
            {allRows.length > 0 && (
              <span className="text-xs text-brand-navy-70">— {allRows.length} active {allRows.length === 1 ? 'blocker' : 'blockers'}</span>
            )}
          </div>
          <button
            onClick={generateSummary}
            disabled={generatingSummary || allRows.length === 0}
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
            ) : (
              <>Generate Summary</>
            )}
          </button>
        </div>

        {summary ? (
          <p className="mt-3 text-sm text-brand-navy-70 leading-relaxed">{summary}</p>
        ) : (
          <p className="mt-2 text-xs text-brand-navy-30">
            {allRows.length === 0
              ? 'No technical blockers recorded yet. This section will populate once the "Technical Blockers / Risk" field is included in your Salesforce export and re-imported.'
              : 'Click Generate Summary for an AI-powered analysis of patterns across all blockers.'}
          </p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4">
        {(['all', 'recent'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === t
                ? 'bg-brand-purple text-white'
                : 'text-brand-navy-70 hover:text-brand-navy hover:bg-brand-purple-30/50'
            }`}
          >
            {t === 'all' ? 'All Blockers' : 'Recently Changed'}
          </button>
        ))}

        {tab === 'recent' && (
          <div className="ml-auto flex items-center gap-2">
            {[14, 30, 60, 90].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
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

      {/* All Blockers Tab */}
      {tab === 'all' && (
        loadingAll ? <Loading /> : allRows.length === 0 ? (
          <div className="text-center py-8">
            <Empty />
            <p className="mt-2 text-sm text-brand-navy-70 max-w-md mx-auto">No technical blockers recorded yet. Once the <span className="font-medium">"Technical Blockers / Risk"</span> column is added to your Salesforce report and re-imported, entries will appear here.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-brand-navy-30/40 overflow-hidden">
            <table className="w-full">
              <thead className="border-b border-brand-navy-30/40">
                <tr>
                  {['Opportunity', 'Stage', 'SE Owner', 'Deploy Mode', 'Technical Blockers'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allRows.map(r => (
                  <tr key={r.id} className="border-b border-brand-navy-30/20 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 min-w-[180px]">
                      <p className="text-sm font-medium text-brand-navy">{r.name}</p>
                      <p className="text-xs text-brand-navy-70">{r.account_name}</p>
                    </td>
                    <td className="px-4 py-3">
                      <StageBadge stage={r.stage} />
                    </td>
                    <td className="px-4 py-3 text-xs text-brand-navy-70 whitespace-nowrap">
                      {r.se_owner_name ?? <span className="text-status-warning">Unassigned</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-brand-navy-70 whitespace-nowrap">
                      {r.deploy_mode ?? <span className="text-brand-navy-30">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-brand-navy max-w-[420px]">
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
            <p className="mt-2 text-sm text-brand-navy-70 max-w-md mx-auto">No technical blocker changes in the last {days} days. Changes will appear here after import once the field is included in the Salesforce export.</p>
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
                  <tr key={i} className="border-b border-brand-navy-30/20 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 min-w-[180px]">
                      <p className="text-sm font-medium text-brand-navy">{r.name}</p>
                      <p className="text-xs text-brand-navy-70">{r.account_name}</p>
                    </td>
                    <td className="px-4 py-3">
                      <StageBadge stage={r.stage} />
                    </td>
                    <td className="px-4 py-3 text-xs text-brand-navy-70 whitespace-nowrap">
                      {r.se_owner_name ?? <span className="text-status-warning">Unassigned</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-brand-navy-70 whitespace-nowrap">
                      {r.deploy_mode ?? <span className="text-brand-navy-30">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-brand-navy-70 max-w-[200px]">
                      {r.old_value
                        ? <p className="line-clamp-3 whitespace-pre-wrap opacity-60">{r.old_value}</p>
                        : <span className="text-brand-navy-30 italic">new entry</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-brand-navy max-w-[240px]">
                      {r.new_value
                        ? <p className="line-clamp-4 whitespace-pre-wrap">{r.new_value}</p>
                        : <span className="text-brand-navy-30 italic">cleared</span>}
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
