import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePipelineStore } from '../store/pipeline';
import {
  quickSearchOpportunities,
  type QuickSwitcherOpp,
  type QuickSwitcherResult,
} from '../api/opportunities';

// ── Formatting helpers ───────────────────────────────────────────────────

function formatArr(arr: number | null): string | null {
  if (arr == null) return null;
  if (arr >= 1_000_000) return `$${(arr / 1_000_000).toFixed(1)}M`;
  if (arr >= 1_000)     return `$${Math.round(arr / 1_000)}k`;
  return `$${arr}`;
}

function formatCloseDate(d: string | null): string | null {
  if (!d) return null;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return null;
  return dt.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-amber-200/70 dark:bg-amber-400/30 text-inherit rounded-sm px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function StageChip({ stage, isClosedWon, isClosedLost }: { stage: string | null; isClosedWon: boolean; isClosedLost: boolean }) {
  if (!stage) return null;
  const cls = isClosedWon
    ? 'bg-status-success/10 dark:bg-status-d-success-soft text-status-success dark:text-status-d-success'
    : isClosedLost
    ? 'bg-status-overdue/10 dark:bg-status-d-overdue-soft text-status-overdue dark:text-status-d-overdue'
    : 'bg-brand-purple/10 dark:bg-accent-purple-soft text-brand-purple dark:text-accent-purple';
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${cls}`}>{stage}</span>;
}

// ── Section label (with icon) ─────────────────────────────────────────────

type SectionKind = 'favorites' | 'territory' | 'other';

function SectionLabel({ kind }: { kind: SectionKind }) {
  const base = 'px-4 py-2 text-[11px] font-semibold text-brand-navy-70 dark:text-fg-2 uppercase tracking-wide flex items-center gap-1.5 border-t border-brand-navy-30/10 dark:border-ink-border-soft';
  if (kind === 'favorites') {
    return (
      <div className={`${base} border-t-0`}>
        <svg className="w-3 h-3 text-amber-500" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
        Favorites
      </div>
    );
  }
  if (kind === 'territory') {
    return (
      <div className={base}>
        <svg className="w-3 h-3 text-brand-purple dark:text-accent-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path d="M12 11a3 3 0 100-6 3 3 0 000 6z" />
          <path d="M12 22c4-6 8-9.5 8-13a8 8 0 10-16 0c0 3.5 4 7 8 13z" />
        </svg>
        Your Territory
      </div>
    );
  }
  return (
    <div className={base}>
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.35-4.35" />
      </svg>
      Everything else
    </div>
  );
}

// ── One result row ────────────────────────────────────────────────────────

function Row({
  opp, active, isFavorite, query, onClick, onMouseEnter,
}: {
  opp: QuickSwitcherOpp;
  active: boolean;
  isFavorite: boolean;
  query: string;
  onClick: () => void;
  onMouseEnter: () => void;
}) {
  const arr = formatArr(opp.arr);
  const close = formatCloseDate(opp.close_date);
  const closed = opp.is_closed_won || opp.is_closed_lost;

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`w-full text-left px-4 py-2.5 flex items-center gap-3 border-l-2 transition-colors ${
        active
          ? 'bg-brand-purple/[0.08] dark:bg-accent-purple-soft border-brand-purple dark:border-accent-purple'
          : 'border-transparent hover:bg-gray-50 dark:hover:bg-ink-2'
      } ${closed ? 'opacity-75' : ''}`}
    >
      <div className="w-3.5 h-3.5 flex-shrink-0 flex items-center justify-center">
        {isFavorite && (
          <svg className="w-3.5 h-3.5 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
          </svg>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-sm font-semibold text-brand-navy dark:text-fg-1 truncate">
            {highlightMatch(opp.account_name ?? '—', query)}
          </span>
          <span className="text-xs text-brand-navy-70 dark:text-fg-2 truncate">
            {highlightMatch(opp.name, query)}
          </span>
        </div>
        <div className="text-[11px] text-brand-navy-70 dark:text-fg-2 mt-0.5 flex items-center gap-2 flex-wrap">
          <StageChip stage={opp.stage} isClosedWon={opp.is_closed_won} isClosedLost={opp.is_closed_lost} />
          {arr && <span>{arr} ARR</span>}
          {arr && close && <span>·</span>}
          {close && <span>Close {close}</span>}
          {opp.team && <><span>·</span><span>{opp.team}</span></>}
          {opp.se_owner_name && <><span>·</span><span>SE: {opp.se_owner_name}</span></>}
        </div>
      </div>
      {active && <span className="text-[11px] text-brand-navy-70 dark:text-fg-2 font-mono">↵</span>}
    </button>
  );
}

// ── Main component ───────────────────────────────────────────────────────

export default function QuickSwitcher() {
  const { quickSwitcherOpen, closeQuickSwitcher } = usePipelineStore();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<QuickSwitcherResult>({ favorites: [], territory: [], other: [] });
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  // Flatten results in tier order for keyboard navigation — ids are unique
  // so the keyboard cursor moves sanely across section boundaries.
  const flat = useMemo(() => [
    ...results.favorites.map(o => ({ opp: o, fromFavorites: true })),
    ...results.territory.map(o => ({ opp: o, fromFavorites: false })),
    ...results.other.map(o => ({ opp: o, fromFavorites: false })),
  ], [results]);

  const favIdSet = useMemo(() => new Set(results.favorites.map(o => o.id)), [results.favorites]);

  // Reset + focus on open
  useEffect(() => {
    if (quickSwitcherOpen) {
      setQuery('');
      setResults({ favorites: [], territory: [], other: [] });
      setActiveIdx(0);
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [quickSwitcherOpen]);

  // Debounced search
  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults({ favorites: [], territory: [], other: [] });
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const r = await quickSearchOpportunities(q.trim());
      setResults(r);
      setActiveIdx(0);
    } catch { /* ignore; keep previous results */ }
    finally { setLoading(false); }
  }, []);

  function onQueryChange(v: string) {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(v), 220);
  }

  const commit = useCallback((opp: QuickSwitcherOpp) => {
    closeQuickSwitcher();
    navigate(`/pipeline?oppId=${encodeURIComponent(opp.sf_opportunity_id)}`);
  }, [closeQuickSwitcher, navigate]);

  // Global keyboard handling while open
  useEffect(() => {
    if (!quickSwitcherOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); closeQuickSwitcher(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx(i => Math.min(i + 1, Math.max(flat.length - 1, 0)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        const pick = flat[activeIdx];
        if (pick) { e.preventDefault(); commit(pick.opp); }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [quickSwitcherOpen, flat, activeIdx, closeQuickSwitcher, commit]);

  if (!quickSwitcherOpen) return null;

  const hasAnyResults = flat.length > 0;
  const favStart = 0;
  const terStart = results.favorites.length;
  const othStart = terStart + results.territory.length;

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-start justify-center pt-24 z-50"
      onClick={closeQuickSwitcher}
    >
      <div
        className="w-full max-w-xl mx-4 bg-white dark:bg-ink-1 rounded-2xl shadow-2xl border border-brand-navy-30/20 dark:border-ink-border-soft overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-brand-navy-30/20 dark:border-ink-border-soft">
          <svg className="w-4 h-4 text-brand-navy-70 dark:text-fg-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => onQueryChange(e.target.value)}
            placeholder="Search opportunities by name, account, or Salesforce ID…"
            className="flex-1 text-sm bg-transparent outline-none placeholder:text-brand-navy-30 dark:placeholder:text-fg-4 text-brand-navy dark:text-fg-1"
          />
          {loading && (
            <svg className="w-4 h-4 animate-spin text-brand-navy-30 dark:text-fg-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          )}
        </div>

        {/* Results */}
        <div className="max-h-[480px] overflow-y-auto">
          {!query.trim() && (
            <div className="px-4 py-10 text-center text-sm text-brand-navy-70 dark:text-fg-2">
              Start typing to find any opportunity.
            </div>
          )}

          {query.trim() && !loading && !hasAnyResults && (
            <div className="px-4 py-10 text-center text-sm text-brand-navy-70 dark:text-fg-2">
              No opportunities match <span className="font-mono">"{query}"</span>.
            </div>
          )}

          {results.favorites.length > 0 && (
            <>
              <SectionLabel kind="favorites" />
              {results.favorites.map((opp, i) => {
                const globalIdx = favStart + i;
                return (
                  <Row
                    key={`f-${opp.id}`}
                    opp={opp}
                    active={globalIdx === activeIdx}
                    isFavorite
                    query={query}
                    onClick={() => commit(opp)}
                    onMouseEnter={() => setActiveIdx(globalIdx)}
                  />
                );
              })}
            </>
          )}

          {results.territory.length > 0 && (
            <>
              <SectionLabel kind="territory" />
              {results.territory.map((opp, i) => {
                const globalIdx = terStart + i;
                return (
                  <Row
                    key={`t-${opp.id}`}
                    opp={opp}
                    active={globalIdx === activeIdx}
                    isFavorite={favIdSet.has(opp.id)}
                    query={query}
                    onClick={() => commit(opp)}
                    onMouseEnter={() => setActiveIdx(globalIdx)}
                  />
                );
              })}
            </>
          )}

          {results.other.length > 0 && (
            <>
              <SectionLabel kind="other" />
              {results.other.map((opp, i) => {
                const globalIdx = othStart + i;
                return (
                  <Row
                    key={`o-${opp.id}`}
                    opp={opp}
                    active={globalIdx === activeIdx}
                    isFavorite={favIdSet.has(opp.id)}
                    query={query}
                    onClick={() => commit(opp)}
                    onMouseEnter={() => setActiveIdx(globalIdx)}
                  />
                );
              })}
            </>
          )}
        </div>

        {/* Footer keyboard hints */}
        <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-brand-navy-30/20 dark:border-ink-border-soft bg-gray-50/60 dark:bg-ink-2/40 text-[11px] text-brand-navy-70 dark:text-fg-2">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><kbd className="px-1 rounded bg-white dark:bg-ink-1 border border-brand-navy-30/40 dark:border-ink-border-soft">↑</kbd><kbd className="px-1 rounded bg-white dark:bg-ink-1 border border-brand-navy-30/40 dark:border-ink-border-soft">↓</kbd> navigate</span>
            <span className="flex items-center gap-1"><kbd className="px-1 rounded bg-white dark:bg-ink-1 border border-brand-navy-30/40 dark:border-ink-border-soft">↵</kbd> open</span>
            <span className="flex items-center gap-1"><kbd className="px-1 rounded bg-white dark:bg-ink-1 border border-brand-navy-30/40 dark:border-ink-border-soft">esc</kbd> close</span>
          </div>
          <div>
            Quick add: <kbd className="px-1 rounded bg-white dark:bg-ink-1 border border-brand-navy-30/40 dark:border-ink-border-soft">Ctrl</kbd>
            <kbd className="px-1 rounded bg-white dark:bg-ink-1 border border-brand-navy-30/40 dark:border-ink-border-soft">I</kbd>
          </div>
        </div>
      </div>
    </div>
  );
}
