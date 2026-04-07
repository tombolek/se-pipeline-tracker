import { useState, useEffect, useMemo } from 'react';
import api from '../api/client';
import type { ApiResponse } from '../types';
import StageBadge from './shared/StageBadge';
import { formatDate } from '../utils/formatters';

// ── Types ──────────────────────────────────────────────────────────────────────

type EventType = 'note' | 'task_created' | 'task_completed' | 'stage_change' | 'import_update' | 'owner_change' | 'first_seen';

interface TimelineEvent {
  id: string;
  type: EventType;
  timestamp: string;
  payload: Record<string, unknown>;
}

interface ImportField {
  field: string;
  old_value: string | null;
  new_value: string | null;
}

const FIELD_LABELS: Record<string, string> = {
  se_comments:      'SE Comments',
  manager_comments: 'Manager Comments',
  next_step_sf:     'Next Step',
  technical_blockers: 'Technical Blockers',
  close_date:       'Close Date',
  poc_status:       'PoC Status',
  agentic_qual:     'Agentic Qual',
};

// ── Filter chips config ────────────────────────────────────────────────────────

const FILTERS: { type: EventType | 'all'; label: string; dot?: string }[] = [
  { type: 'all',          label: 'All' },
  { type: 'note',         label: 'Notes',        dot: 'bg-status-info' },
  { type: 'task_created', label: 'Tasks',         dot: 'bg-status-success' },
  { type: 'stage_change', label: 'Stage',         dot: 'bg-brand-purple' },
  { type: 'import_update',label: 'SF Import',     dot: 'bg-status-warning' },
  { type: 'owner_change', label: 'Owner',         dot: 'bg-brand-pink' },
];

// Normalise task_completed → task_created for the filter (both toggle with "Tasks")
function filterType(e: TimelineEvent): EventType | 'all' {
  return e.type === 'task_completed' ? 'task_created' : e.type === 'first_seen' ? 'stage_change' : e.type;
}

// ── Icon per event type ────────────────────────────────────────────────────────

function EventIcon({ type }: { type: EventType }) {
  const configs: Record<EventType, { bg: string; icon: React.ReactNode }> = {
    note: {
      bg: 'bg-sky-50 text-status-info',
      icon: <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h6m-6 4h10M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />,
    },
    task_created: {
      bg: 'bg-emerald-50 text-status-success',
      icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />,
    },
    task_completed: {
      bg: 'bg-emerald-50 text-status-success',
      icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />,
    },
    stage_change: {
      bg: 'bg-brand-purple-30 text-brand-purple',
      icon: <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />,
    },
    import_update: {
      bg: 'bg-amber-50 text-status-warning',
      icon: <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />,
    },
    owner_change: {
      bg: 'bg-brand-pink-30 text-brand-pink',
      icon: <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />,
    },
    first_seen: {
      bg: 'bg-brand-purple-30 text-brand-purple',
      icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />,
    },
  };

  const { bg, icon } = configs[type];
  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 relative ${bg}`}>
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        {icon}
      </svg>
    </div>
  );
}

// ── Relative timestamp ─────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}

function isSameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Individual event cards ─────────────────────────────────────────────────────

function NoteCard({ event }: { event: TimelineEvent }) {
  const [expanded, setExpanded] = useState(false);
  const content = event.payload.content as string;
  const preview = content.length > 160 ? content.slice(0, 160) + '…' : content;
  const hasMore = content.length > 160;

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-navy-70">Note</span>
        <span className="text-xs font-light text-brand-navy-70">
          by <strong className="font-medium text-brand-navy">{event.payload.author as string}</strong>
          {' · '}{relativeTime(event.timestamp)}
        </span>
      </div>
      <p className="text-sm text-brand-navy-70 font-light leading-relaxed border-l-2 border-brand-navy-30 pl-3">
        {expanded ? content : preview}
      </p>
      {hasMore && (
        <button onClick={() => setExpanded(!expanded)} className="text-[11px] text-brand-purple font-medium mt-1 hover:text-brand-purple-70">
          {expanded ? 'Show less ↑' : 'Show more ↓'}
        </button>
      )}
    </div>
  );
}

function TaskCreatedCard({ event }: { event: TimelineEvent }) {
  const statusColors: Record<string, string> = {
    open:        'bg-brand-purple-30 text-brand-purple',
    in_progress: 'bg-sky-50 text-status-info',
    done:        'bg-emerald-50 text-status-success',
    blocked:     'bg-red-50 text-status-overdue',
  };
  const status = event.payload.status as string;
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-navy-70">Task created</span>
        <span className="text-xs font-light text-brand-navy-70">{relativeTime(event.timestamp)}</span>
      </div>
      <p className="text-sm font-medium text-brand-navy">{event.payload.title as string}</p>
      <div className="flex items-center gap-2 mt-1.5">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${statusColors[status] ?? 'bg-gray-100 text-gray-600'}`}>
          {status.replace('_', ' ')}
        </span>
        {Boolean(event.payload.is_next_step) && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-yellow-50 text-yellow-700">Next Step</span>
        )}
        {(event.payload.assigned_to as string | null) && (
          <span className="text-xs text-brand-navy-70 font-light">{event.payload.assigned_to as string}</span>
        )}
      </div>
    </div>
  );
}

function TaskCompletedCard({ event }: { event: TimelineEvent }) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-status-success">Task completed</span>
        <span className="text-xs font-light text-brand-navy-70">{relativeTime(event.timestamp)}</span>
      </div>
      <p className="text-sm font-medium text-brand-navy line-through opacity-60">{event.payload.title as string}</p>
      {(event.payload.assigned_to as string | null) && (
        <p className="text-xs text-brand-navy-70 font-light mt-0.5">{event.payload.assigned_to as string}</p>
      )}
    </div>
  );
}

function StageChangeCard({ event }: { event: TimelineEvent }) {
  const from = event.payload.from as string | null;
  const to   = event.payload.to as string;
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-navy-70">Stage change</span>
        <span className="text-xs font-light text-brand-navy-70">{relativeTime(event.timestamp)}</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {from ? (
          <>
            <span className="text-xs text-brand-navy-70">{from}</span>
            <svg className="w-3 h-3 text-brand-navy-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </>
        ) : null}
        <StageBadge stage={to} />
      </div>
    </div>
  );
}

function ImportUpdateCard({ event }: { event: TimelineEvent }) {
  const [expanded, setExpanded] = useState(false);
  const fields = event.payload.fields as ImportField[];
  const visible = expanded ? fields : fields.slice(0, 2);
  const hasMore = fields.length > 2;

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-navy-70">SF import update</span>
        <span className="text-xs font-light text-brand-navy-70">{relativeTime(event.timestamp)}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {visible.map((f, i) => (
          <div key={i} className="text-xs text-brand-navy-70 font-light">
            <span className="font-medium text-brand-navy">{FIELD_LABELS[f.field] ?? f.field}</span>
            {f.new_value ? (
              <>
                {' — '}
                <span className="italic">"{f.new_value.length > 80 ? f.new_value.slice(0, 80) + '…' : f.new_value}"</span>
              </>
            ) : (
              <span className="italic text-brand-navy-70"> cleared</span>
            )}
          </div>
        ))}
      </div>
      {hasMore && (
        <button onClick={() => setExpanded(!expanded)} className="text-[11px] text-brand-purple font-medium mt-1.5 hover:text-brand-purple-70">
          {expanded ? `Show less ↑` : `+${fields.length - 2} more fields ↓`}
        </button>
      )}
    </div>
  );
}

function OwnerChangeCard({ event }: { event: TimelineEvent }) {
  const name = event.payload.se_owner_name as string | null;
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-navy-70">SE Owner</span>
        <span className="text-xs font-light text-brand-navy-70">{relativeTime(event.timestamp)}</span>
      </div>
      <p className="text-sm text-brand-navy">
        {name
          ? <>Assigned to <strong className="font-semibold">{name}</strong></>
          : <span className="text-brand-navy-70 italic">Unassigned</span>
        }
      </p>
    </div>
  );
}

function FirstSeenCard({ event }: { event: TimelineEvent }) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-navy-70">First seen in import</span>
        <span className="text-xs font-light text-brand-navy-70">{relativeTime(event.timestamp)}</span>
      </div>
      <StageBadge stage={event.payload.stage as string} />
    </div>
  );
}

function EventCard({ event }: { event: TimelineEvent }) {
  switch (event.type) {
    case 'note':           return <NoteCard event={event} />;
    case 'task_created':   return <TaskCreatedCard event={event} />;
    case 'task_completed': return <TaskCompletedCard event={event} />;
    case 'stage_change':   return <StageChangeCard event={event} />;
    case 'import_update':  return <ImportUpdateCard event={event} />;
    case 'owner_change':   return <OwnerChangeCard event={event} />;
    case 'first_seen':     return <FirstSeenCard event={event} />;
  }
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function OpportunityTimeline({ oppId }: { oppId: number }) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<EventType | 'all'>('all');

  useEffect(() => {
    setLoading(true);
    api.get<ApiResponse<TimelineEvent[]>>(`/opportunities/${oppId}/timeline`)
      .then(r => setEvents(r.data.data))
      .finally(() => setLoading(false));
  }, [oppId]);

  const filtered = useMemo(() =>
    filter === 'all' ? events : events.filter(e => filterType(e) === filter),
    [events, filter]
  );

  if (loading) {
    return <p className="text-sm text-brand-navy-70 py-8 text-center">Loading…</p>;
  }

  if (events.length === 0) {
    return <p className="text-sm text-brand-navy-70 py-8 text-center italic">No activity recorded yet.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filter chips */}
      <div className="flex gap-1.5 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f.type}
            onClick={() => setFilter(f.type as EventType | 'all')}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium border transition-colors ${
              filter === f.type
                ? 'bg-brand-purple-30 text-brand-purple border-brand-purple'
                : 'bg-white text-brand-navy-70 border-brand-navy-30 hover:border-brand-navy hover:text-brand-navy'
            }`}
          >
            {f.dot && <span className={`w-1.5 h-1.5 rounded-full ${f.dot}`} />}
            {f.label}
            {f.type === 'all' && (
              <span className="ml-0.5 bg-brand-navy-30/50 text-brand-navy-70 rounded-full px-1 text-[10px]">{events.length}</span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-brand-navy-70 py-6 text-center italic">No events of this type.</p>
      )}

      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-4 top-5 bottom-5 w-px bg-brand-navy-30/40" />

        <div className="flex flex-col gap-1">
          {filtered.map((event, idx) => {
            const prevEvent = filtered[idx - 1];
            const showDateSep = !prevEvent || !isSameDay(event.timestamp, prevEvent.timestamp);
            const label = showDateSep ? dayLabel(event.timestamp) : null;

            return (
              <div key={event.id}>
                {label && (
                  <div className="flex items-center gap-3 py-2 pl-10">
                    <hr className="flex-1 border-brand-navy-30/30" />
                    <span className="text-[11px] font-medium text-brand-navy-70 whitespace-nowrap">{label}</span>
                    <hr className="flex-1 border-brand-navy-30/30" />
                  </div>
                )}
                <div className="flex gap-3 items-start">
                  <EventIcon type={event.type} />
                  <div className="flex-1 bg-white border border-brand-navy-30/40 rounded-xl px-4 py-3 mb-1">
                    <EventCard event={event} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
