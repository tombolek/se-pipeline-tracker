import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getChangelog, markChangelogSeen, type ChangelogEntry } from '../api/changelog';

interface Props {
  open: boolean;
  onClose: () => void;
}

function sectionColor(kind: string): string {
  const k = kind.toLowerCase();
  if (k === 'added')   return 'text-status-success dark:text-status-d-success bg-emerald-50 dark:bg-status-d-success-soft';
  if (k === 'changed') return 'text-brand-purple dark:text-accent-purple bg-brand-purple-30';
  if (k === 'fixed')   return 'text-status-info dark:text-status-d-info bg-sky-50 dark:bg-status-d-info-soft';
  if (k === 'removed' || k === 'deprecated') return 'text-status-overdue dark:text-status-d-overdue bg-red-50 dark:bg-status-d-overdue-soft';
  if (k === 'security') return 'text-status-warning dark:text-status-d-warning bg-amber-50 dark:bg-status-d-warning-soft';
  return 'text-brand-navy dark:text-fg-1 bg-gray-100 dark:bg-ink-3';
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

// Minimal inline markdown: **bold** and `code`. Leaves the rest as-is.
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const m = match[0];
    if (m.startsWith('**')) {
      parts.push(<strong key={i++} className="font-semibold">{m.slice(2, -2)}</strong>);
    } else {
      parts.push(<code key={i++} className="px-1 py-0.5 rounded bg-gray-100 dark:bg-ink-3 text-[11px] font-mono">{m.slice(1, -1)}</code>);
    }
    last = match.index + m.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function EntryCard({ entry, isNew }: { entry: ChangelogEntry; isNew: boolean }) {
  return (
    <div className="bg-white dark:bg-ink-1 rounded-2xl border border-brand-navy-30/40 dark:border-ink-border-soft overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-brand-navy-30/40 dark:border-ink-border-soft">
        <span className="text-sm font-semibold text-brand-navy dark:text-fg-1">{formatDate(entry.date)}</span>
        {isNew && (
          <span className="text-[10px] font-semibold text-white bg-brand-purple px-1.5 py-0.5 rounded uppercase tracking-wide">New</span>
        )}
      </div>
      <div className="px-5 py-4 space-y-4">
        {entry.sections.map((s, i) => (
          <div key={i}>
            <span className={`inline-block text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${sectionColor(s.kind)}`}>
              {s.kind}
            </span>
            <ul className="mt-2 space-y-1.5 ml-0.5">
              {s.bullets.map((b, j) => (
                <li key={j} className="text-xs text-brand-navy-70 dark:text-fg-2 leading-relaxed flex gap-2">
                  <span className="text-brand-navy-30 dark:text-fg-4 flex-shrink-0 mt-0.5">•</span>
                  <span>{renderInline(b.text)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ChangelogModal({ open, onClose }: Props) {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markedSeen, setMarkedSeen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setMarkedSeen(false);
    getChangelog()
      .then(r => {
        setEntries(r.entries);
        setLastSeenAt(r.last_seen_at);
      })
      .catch(e => {
        setError((e as Error).message || 'Failed to load changelog');
      })
      .finally(() => setLoading(false));
  }, [open]);

  // Mark as seen once the modal has opened and we've shown the content.
  // Keep the "New" badges visible for this session — they're computed from the
  // last_seen_at loaded at mount time, so reopening later will clear them.
  useEffect(() => {
    if (!open || loading || markedSeen) return;
    markChangelogSeen().then(() => setMarkedSeen(true)).catch(() => {});
  }, [open, loading, markedSeen]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const newCutoff = useMemo(() => (lastSeenAt ? lastSeenAt.slice(0, 10) : null), [lastSeenAt]);

  if (!open) return null;

  return createPortal(
    <>
      <div onClick={onClose} className="fixed inset-0 bg-brand-navy/30 backdrop-blur-[2px] z-40" />
      <div className="fixed top-0 right-0 h-full w-[560px] max-w-[95vw] bg-gray-50 dark:bg-ink-2 shadow-2xl z-50 flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 bg-white dark:bg-ink-1 border-b border-brand-navy-30/40 dark:border-ink-border-soft flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-brand-navy dark:text-fg-1">What's New</h2>
            <p className="text-[11px] text-brand-navy-70 dark:text-fg-2 mt-0.5">Recent changes to Pipeline Tracker</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-brand-navy-30/50 hover:bg-brand-navy-30 flex items-center justify-center text-brand-navy-70 dark:text-fg-2 hover:text-brand-navy dark:text-fg-1 transition-colors"
            aria-label="Close"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {loading ? (
            <p className="text-xs text-brand-navy-70 dark:text-fg-2 text-center py-8">Loading…</p>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-xs text-status-overdue dark:text-status-d-overdue">Couldn't load changelog.</p>
              <p className="text-[11px] text-brand-navy-30 dark:text-fg-4 mt-1">{error}</p>
            </div>
          ) : entries.length === 0 ? (
            <p className="text-xs text-brand-navy-70 dark:text-fg-2 text-center py-8">No changelog entries available.</p>
          ) : (
            entries.map(e => (
              <EntryCard key={e.date} entry={e} isNew={!!newCutoff ? e.date > newCutoff : true} />
            ))
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
