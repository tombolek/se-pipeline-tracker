import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import api from '../api/client';
import type { ApiResponse } from '../types';
import { useTeamScope } from '../hooks/useTeamScope';
import OutOfTerritoryBanner from '../components/shared/OutOfTerritoryBanner';
import TeamScopeSelector from '../components/shared/TeamScopeSelector';
import Drawer from '../components/Drawer';
import OpportunityDetail from '../components/OpportunityDetail';
import { useOppUrlSync } from '../hooks/useOppUrlSync';
import OfflineUnavailable from '../components/OfflineUnavailable';
import { useConnectionStatus } from '../offline/useConnectionStatus';
import { setMeta, getMeta } from '../offline/db';

// ── Raw API types ─────────────────────────────────────────────────────────────

interface CalPoc {
  id: number;
  name: string;
  account_name: string | null;
  poc_status: string;
  poc_start_date: string | null;
  poc_end_date: string | null;
  poc_type: string | null;
  team: string | null;
  se_owner_id: number | null;
  se_owner_name: string | null;
}

interface CalRfp {
  id: number;
  name: string;
  account_name: string | null;
  rfx_status: string;
  rfx_submission_date: string;
  team: string | null;
  se_owner_id: number | null;
  se_owner_name: string | null;
}

interface CalTask {
  id: number;
  title: string;
  status: string;
  due_date: string;
  opportunity_id: number;
  opportunity_name: string;
  opportunity_team: string | null;
  assigned_to_id: number | null;
  assigned_to_name: string | null;
}

interface CalendarData {
  pocs: CalPoc[];
  rfps: CalRfp[];
  tasks: CalTask[];
}

// ── Unified calendar event ────────────────────────────────────────────────────

interface CalEvent {
  id: string;
  type: 'poc' | 'rfp' | 'task';
  start: Date;
  end: Date;
  isMultiDay: boolean;
  label: string;
  sublabel: string;
  seId: number | null;
  seName: string | null;
  status: string;
  isDone: boolean;
  isEstimatedStart: boolean;
  isEstimatedEnd: boolean;
  opportunityId: number;
  team: string | null;
}

interface LaneItem {
  event: CalEvent;
  lane: number;
  colStart: number;
  colEnd: number;
  isStart: boolean;
  isEnd: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const POC_ESTIMATE_DAYS = 21;
const MAX_CHIPS = 2;
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const SE_PALETTE = [
  '#7c3aed', '#0891b2', '#059669', '#d97706',
  '#dc2626', '#db2777', '#0d9488', '#4f46e5',
  '#7e22ce', '#0e7490', '#b45309', '#1d4ed8',
];

// ── Pure helpers ──────────────────────────────────────────────────────────────

function parseLocalDate(s: string): Date {
  // pg-node serializes DATE as ISO strings like "2026-04-07T00:00:00.000Z"; slice to get YYYY-MM-DD
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function dayDiff(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function startOfWeek(d: Date): Date {
  const r = new Date(d);
  r.setDate(r.getDate() - r.getDay());
  return r;
}

function getWeeks(month: Date): Date[][] {
  const gridStart = startOfWeek(new Date(month.getFullYear(), month.getMonth(), 1));
  const weeks: Date[][] = [];
  let cursor = new Date(gridStart);
  while (weeks.length < 6) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) { week.push(new Date(cursor)); cursor = addDays(cursor, 1); }
    weeks.push(week);
    if (weeks.length >= 4 && cursor.getMonth() !== month.getMonth()) break;
  }
  return weeks;
}

function formatMonthYear(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function format3mRange(start: Date): string {
  const end = addMonths(start, 2);
  const s = start.toLocaleDateString('en-US', { month: 'short' });
  const e = end.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  return `${s} – ${e}`;
}

function initials(name: string | null): string {
  if (!name) return '?';
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

function buildColorMap(seIds: number[]): Map<number, string> {
  const sorted = [...seIds].sort((a, b) => a - b);
  return new Map(sorted.map((id, i) => [id, SE_PALETTE[i % SE_PALETTE.length]]));
}

function getColor(seId: number | null, colorMap: Map<number, string>): string {
  if (!seId) return '#9ca3af';
  return colorMap.get(seId) ?? '#9ca3af';
}

// ── Event normalization ───────────────────────────────────────────────────────

function normalizePoc(p: CalPoc): CalEvent | null {
  if (!p.poc_start_date && !p.poc_end_date) return null;
  let start: Date, end: Date, isEstStart = false, isEstEnd = false;
  if (p.poc_start_date && p.poc_end_date) {
    start = parseLocalDate(p.poc_start_date);
    end   = parseLocalDate(p.poc_end_date);
  } else if (p.poc_start_date) {
    start  = parseLocalDate(p.poc_start_date);
    end    = addDays(start, POC_ESTIMATE_DAYS);
    isEstEnd = true;
  } else {
    end    = parseLocalDate(p.poc_end_date!);
    start  = addDays(end, -POC_ESTIMATE_DAYS);
    isEstStart = true;
  }
  if (end < start) end = start;
  return {
    id: `poc-${p.id}`, type: 'poc', start, end,
    isMultiDay: !isSameDay(start, end),
    label:    p.account_name ?? p.name,
    sublabel: p.poc_status,
    seId: p.se_owner_id, seName: p.se_owner_name,
    status: p.poc_status,
    isDone: /complet|done|finish/i.test(p.poc_status),
    isEstimatedStart: isEstStart, isEstimatedEnd: isEstEnd,
    opportunityId: p.id, team: p.team,
  };
}

function normalizeRfp(r: CalRfp): CalEvent {
  const d = parseLocalDate(r.rfx_submission_date);
  return {
    id: `rfp-${r.id}`, type: 'rfp', start: d, end: d, isMultiDay: false,
    label:    r.account_name ?? r.name,
    sublabel: r.rfx_status,
    seId: r.se_owner_id, seName: r.se_owner_name,
    status: r.rfx_status,
    isDone: /submitted|complet/i.test(r.rfx_status),
    isEstimatedStart: false, isEstimatedEnd: false,
    opportunityId: r.id, team: r.team,
  };
}

function normalizeTask(t: CalTask): CalEvent {
  const d = parseLocalDate(t.due_date);
  return {
    id: `task-${t.id}`, type: 'task', start: d, end: d, isMultiDay: false,
    label:    t.title,
    sublabel: t.opportunity_name,
    seId: t.assigned_to_id, seName: t.assigned_to_name,
    status: t.status,
    isDone: t.status === 'done',
    isEstimatedStart: false, isEstimatedEnd: false,
    opportunityId: t.opportunity_id, team: t.opportunity_team,
  };
}

// ── Lane assignment ───────────────────────────────────────────────────────────

function assignLanes(events: CalEvent[], weekStart: Date, weekEnd: Date): LaneItem[] {
  if (!events.length) return [];
  const items = events.map(evt => {
    const clampedStart = evt.start < weekStart ? weekStart : evt.start;
    const clampedEnd   = evt.end   > weekEnd   ? weekEnd   : evt.end;
    return {
      event: evt,
      colStart: Math.max(0, Math.min(6, dayDiff(weekStart, clampedStart))),
      colEnd:   Math.max(0, Math.min(6, dayDiff(weekStart, clampedEnd))),
      isStart:  evt.start >= weekStart,
      isEnd:    evt.end   <= weekEnd,
    };
  });
  items.sort((a, b) => a.colStart - b.colStart || (b.colEnd - b.colStart) - (a.colEnd - a.colStart));
  const laneEnds: number[] = [];
  return items.map(item => {
    let lane = laneEnds.findIndex(end => end < item.colStart);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(item.colEnd); }
    else { laneEnds[lane] = item.colEnd; }
    return { ...item, lane };
  });
}

// ── EventChip ─────────────────────────────────────────────────────────────────

function typeIcon(type: CalEvent['type'], isDone: boolean) {
  if (type === 'poc') return '🔬';
  if (type === 'rfp') return '📄';
  return isDone ? '✅' : '☐';
}

// Prevents the click handler firing immediately after a drag completes
let _dragJustEnded = false;

function EventChip({ event, colorMap, onEventClick, onTaskDragStart, onTaskDragEnd }: {
  event: CalEvent;
  colorMap: Map<number, string>;
  onEventClick: (oppId: number) => void;
  onTaskDragStart?: (taskId: number) => void;
  onTaskDragEnd?: () => void;
}) {
  const color  = getColor(event.seId, colorMap);
  const icon   = typeIcon(event.type, event.isDone);
  const isTask = event.type === 'task';
  const taskId = isTask ? parseInt(event.id.split('-')[1]) : null;

  return (
    <div
      onClick={() => {
        if (_dragJustEnded) { _dragJustEnded = false; return; }
        onEventClick(event.opportunityId);
      }}
      draggable={isTask}
      onDragStart={isTask && taskId !== null ? e => {
        e.dataTransfer.setData('taskId', String(taskId));
        e.dataTransfer.effectAllowed = 'move';
        onTaskDragStart?.(taskId);
      } : undefined}
      onDragEnd={isTask ? () => { _dragJustEnded = true; onTaskDragEnd?.(); } : undefined}
      className={`flex items-center gap-0.5 px-1 rounded text-white text-[10px] leading-[18px] overflow-hidden whitespace-nowrap hover:opacity-80 ${event.isDone ? 'opacity-50' : ''} ${isTask ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
      style={{ background: color }}
      title={`${event.label} · ${event.sublabel}${isTask ? ' · Drag to reschedule' : ''}`}
    >
      <span className="w-3.5 h-3.5 rounded-full bg-white/25 flex items-center justify-center flex-shrink-0 text-[7px] font-bold">
        {initials(event.seName)}
      </span>
      <span className="flex-shrink-0 mx-px">{icon}</span>
      <span className="truncate">{event.label}</span>
    </div>
  );
}

// ── SpanBar ───────────────────────────────────────────────────────────────────

function SpanBar({ item, colorMap, onEventClick }: {
  item: LaneItem;
  colorMap: Map<number, string>;
  onEventClick: (oppId: number) => void;
}) {
  const { event, colStart, colEnd, isStart, isEnd, lane } = item;
  const color = getColor(event.seId, colorMap);
  const leftPct  = (colStart / 7) * 100;
  const widthPct = ((colEnd - colStart + 1) / 7) * 100;
  const labelSuffix = event.isEstimatedStart || event.isEstimatedEnd ? '*' : '';
  const showLabel = isStart || colStart === 0;

  return (
    <div
      onClick={() => onEventClick(event.opportunityId)}
      className={`absolute flex items-center text-white text-[10px] overflow-hidden cursor-pointer hover:opacity-80 pointer-events-auto ${event.isDone ? 'opacity-50' : ''}`}
      style={{
        left:   `calc(${leftPct}% + ${isStart ? 2 : 0}px)`,
        width:  `calc(${widthPct}% - ${(isStart ? 2 : 0) + (isEnd ? 2 : 0)}px)`,
        top:    lane * 22 + 2,
        height: 18,
        background: color,
        borderRadius: `${isStart ? 3 : 0}px ${isEnd ? 3 : 0}px ${isEnd ? 3 : 0}px ${isStart ? 3 : 0}px`,
      }}
      title={`${event.label} · ${event.sublabel}`}
    >
      {showLabel && (
        <>
          <span className="w-3 h-3 rounded-full bg-white/25 flex items-center justify-center flex-shrink-0 text-[7px] font-bold ml-1">
            {initials(event.seName)}
          </span>
          <span className="mx-0.5 flex-shrink-0">🔬</span>
          <span className="truncate">{event.label}{labelSuffix}</span>
        </>
      )}
    </div>
  );
}

// ── DayPopover ────────────────────────────────────────────────────────────────

function DayPopover({ date, events, colorMap, onClose, onEventClick }: {
  date: Date;
  events: CalEvent[];
  colorMap: Map<number, string>;
  onClose: () => void;
  onEventClick: (oppId: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    function onClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick); };
  }, [onClose]);

  const dateLabel = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div ref={ref} className="bg-white rounded-xl shadow-2xl w-80 max-h-[70vh] flex flex-col border border-brand-navy-30">
        <div className="flex items-center justify-between px-4 py-3 border-b border-brand-navy-30">
          <span className="text-sm font-semibold text-brand-navy">{dateLabel}</span>
          <button onClick={onClose} className="text-brand-navy-70 hover:text-brand-navy transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto p-3 space-y-1.5">
          {events.map(evt => {
            const color = getColor(evt.seId, colorMap);
            const icon  = typeIcon(evt.type, evt.isDone);
            return (
              <div
                key={evt.id}
                onClick={() => { onEventClick(evt.opportunityId); onClose(); }}
                className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer hover:opacity-80 transition-opacity ${evt.isDone ? 'opacity-50' : ''}`}
                style={{ background: color + '18', borderLeft: `3px solid ${color}` }}
              >
                <span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold text-white mt-0.5"
                  style={{ background: color }}>
                  {initials(evt.seName)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className="text-[11px]">{icon}</span>
                    <span className="text-xs font-medium text-brand-navy truncate">{evt.label}</span>
                    {(evt.isEstimatedStart || evt.isEstimatedEnd) && (
                      <span className="text-[9px] text-brand-navy-70 flex-shrink-0">*est.</span>
                    )}
                  </div>
                  <p className="text-[10px] text-brand-navy-70 truncate">{evt.sublabel}</p>
                  {evt.seName && <p className="text-[10px] text-brand-navy-70">{evt.seName}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── WeekRow ───────────────────────────────────────────────────────────────────

function WeekRow({ week, events, viewMonth, colorMap, onMoreClick, onEventClick, stretch, onTaskDrop, draggingTaskId, onTaskDragStart, onTaskDragEnd }: {
  week: Date[];
  events: CalEvent[];
  viewMonth: Date;
  colorMap: Map<number, string>;
  onMoreClick: (date: Date, events: CalEvent[]) => void;
  onEventClick: (oppId: number) => void;
  stretch: boolean;
  onTaskDrop: (taskId: number, date: Date) => void;
  draggingTaskId: number | null;
  onTaskDragStart: (taskId: number) => void;
  onTaskDragEnd: () => void;
}) {
  const [dropTargetDay, setDropTargetDay] = useState<number | null>(null);
  const weekStart = week[0];
  const weekEnd   = week[6];
  const today     = new Date();

  const multiDay  = events.filter(e => e.isMultiDay && e.start <= weekEnd && e.end >= weekStart);
  const laneItems = assignLanes(multiDay, weekStart, weekEnd);
  const numLanes  = laneItems.length > 0 ? Math.max(...laneItems.map(i => i.lane)) + 1 : 0;
  const spansH    = numLanes * 22;

  return (
    <div
      className={`grid grid-cols-7 border-b border-brand-navy-30 relative ${stretch ? 'flex-1' : ''}`}
      style={{ minHeight: 97 + spansH }}
    >
      {/* Span bars layer — pointer-events-none on container, pointer-events-auto on each bar */}
      {numLanes > 0 && (
        <div className="absolute inset-x-0 top-0 pointer-events-none" style={{ height: spansH }}>
          {laneItems.map((item, i) => (
            <SpanBar key={`${item.event.id}-${i}`} item={item} colorMap={colorMap} onEventClick={onEventClick} />
          ))}
        </div>
      )}

      {/* Day cells */}
      {week.map((day, di) => {
        const inMonth  = day.getMonth() === viewMonth.getMonth();
        const isToday  = isSameDay(day, today);
        const dayChips = events.filter(e => !e.isMultiDay && isSameDay(e.start, day));
        const visible  = dayChips.slice(0, MAX_CHIPS);
        const overflow = dayChips.length - MAX_CHIPS;

        const isDragTarget = draggingTaskId !== null && dropTargetDay === di;
        return (
          <div
            key={di}
            onDragOver={draggingTaskId !== null ? e => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setDropTargetDay(di);
            } : undefined}
            onDragLeave={draggingTaskId !== null ? e => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTargetDay(null);
            } : undefined}
            onDrop={draggingTaskId !== null ? e => {
              e.preventDefault();
              const id = parseInt(e.dataTransfer.getData('taskId'));
              if (!isNaN(id)) onTaskDrop(id, day);
              setDropTargetDay(null);
            } : undefined}
            className={`border-r last:border-r-0 border-brand-navy-30 px-1.5 pb-1.5 transition-colors ${!inMonth ? 'bg-gray-50/70' : ''} ${isDragTarget ? 'bg-brand-purple/10 ring-1 ring-inset ring-brand-purple/40' : ''}`}
            style={{ paddingTop: spansH + 4 }}
          >
            <div className={`text-[11px] font-medium w-5 h-5 flex items-center justify-center rounded-full mb-1 ${
              isToday
                ? 'bg-brand-purple text-white font-semibold'
                : inMonth
                  ? 'text-brand-navy-70'
                  : 'text-brand-navy-30'
            }`}>
              {day.getDate()}
            </div>
            <div className="space-y-px">
              {visible.map(evt => (
                <EventChip key={evt.id} event={evt} colorMap={colorMap} onEventClick={onEventClick}
                  onTaskDragStart={onTaskDragStart} onTaskDragEnd={onTaskDragEnd} />
              ))}
              {overflow > 0 && (
                <button
                  onClick={() => onMoreClick(day, dayChips)}
                  className="text-[10px] text-brand-purple hover:underline pl-1 leading-[18px]"
                >
                  +{overflow} more
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type EventType = 'poc' | 'rfp' | 'task';
type ViewMode  = '1m' | '3m';

export default function CalendarPage() {
  const today = useMemo(() => new Date(), []);
  const [month, setMonth]           = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [data, setData]             = useState<CalendarData>({ pocs: [], rfps: [], tasks: [] });
  const [loading, setLoading]       = useState(true);
  const [types, setTypes]           = useState<Set<EventType>>(new Set(['poc', 'rfp', 'task']));
  const [filterSe, setFilterSe]     = useState<number | null>(null);
  const [viewMode, setViewMode]     = useState<ViewMode>('1m');
  const [popover, setPopover]       = useState<{ date: Date; events: CalEvent[] } | null>(null);
  const [selectedOppId, setSelectedOppId] = useState<number | null>(null);
  useOppUrlSync(selectedOppId, setSelectedOppId);
  const [draggingTaskId, setDraggingTaskId] = useState<number | null>(null);

  const { filterOppUnion, isOutOfTerritory, teamNames } = useTeamScope();
  const { online } = useConnectionStatus();

  const [loadError, setLoadError] = useState(false);
  useEffect(() => {
    setLoading(true);
    setLoadError(false);
    api.get<ApiResponse<CalendarData>>('/insights/calendar')
      .then(r => { setData(r.data.data); void setMeta('calendar_data', r.data.data); })
      .catch(async () => {
        // Offline fallback (Issue #117) — serve last successful response if we have one.
        const cached = await getMeta<CalendarData>('calendar_data');
        if (cached) setData(cached);
        else setLoadError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  const colorMap = useMemo(() => {
    const ids = new Set<number>();
    data.pocs.forEach(p => p.se_owner_id    && ids.add(p.se_owner_id));
    data.rfps.forEach(r => r.se_owner_id    && ids.add(r.se_owner_id));
    data.tasks.forEach(t => t.assigned_to_id && ids.add(t.assigned_to_id));
    return buildColorMap([...ids]);
  }, [data]);

  const allSes = useMemo(() => {
    const map = new Map<number, string>();
    data.pocs.forEach(p  => { if (p.se_owner_id   && p.se_owner_name)   map.set(p.se_owner_id,   p.se_owner_name); });
    data.rfps.forEach(r  => { if (r.se_owner_id   && r.se_owner_name)   map.set(r.se_owner_id,   r.se_owner_name); });
    data.tasks.forEach(t => { if (t.assigned_to_id && t.assigned_to_name) map.set(t.assigned_to_id, t.assigned_to_name); });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);

  const allEvents = useMemo<CalEvent[]>(() => {
    const evts: CalEvent[] = [];
    if (types.has('poc'))  data.pocs.forEach(p  => { const e = normalizePoc(p);  if (e) evts.push(e); });
    if (types.has('rfp'))  data.rfps.forEach(r  => evts.push(normalizeRfp(r)));
    if (types.has('task')) data.tasks.forEach(t => evts.push(normalizeTask(t)));
    return evts;
  }, [data, types]);

  const scopedEvents = useMemo(() => {
    let evts = allEvents.filter(e => filterOppUnion({ se_owner_id: e.seId, team: e.team }));
    if (filterSe !== null) {
      evts = evts.filter(e => e.seId === filterSe);
    }
    return evts;
  }, [allEvents, filterOppUnion, filterSe]);

  const outOfTerritoryItems = useMemo(() => {
    if (teamNames.size === 0) return [];
    const seen = new Set<number>();
    const items: { id: number; name: string; team: string }[] = [];
    for (const e of scopedEvents) {
      if (isOutOfTerritory({ team: e.team }) && e.team && !seen.has(e.opportunityId)) {
        seen.add(e.opportunityId);
        items.push({ id: e.opportunityId, name: e.label, team: e.team });
      }
    }
    return items;
  }, [scopedEvents, isOutOfTerritory, teamNames]);

  const outOfTerritoryTeams = useMemo(() => {
    if (teamNames.size === 0) return [];
    return [...new Set(outOfTerritoryItems.map(i => i.team as string).filter(Boolean))].sort();
  }, [outOfTerritoryItems, teamNames]);

  // Week sections: 1 month or 3 months
  const weekSections = useMemo(() => {
    if (viewMode === '1m') return [{ sectionMonth: month, weeks: getWeeks(month) }];
    return [0, 1, 2].map(i => {
      const m = addMonths(month, i);
      return { sectionMonth: m, weeks: getWeeks(m) };
    });
  }, [month, viewMode]);

  const handleMoreClick = useCallback((date: Date, events: CalEvent[]) => {
    setPopover({ date, events });
  }, []);

  const handleEventClick = useCallback((oppId: number) => {
    setSelectedOppId(oppId);
    setPopover(null);
  }, []);

  const handleTaskDragStart = useCallback((taskId: number) => setDraggingTaskId(taskId), []);
  const handleTaskDragEnd   = useCallback(() => setDraggingTaskId(null), []);

  const handleTaskDrop = useCallback(async (taskId: number, date: Date) => {
    setDraggingTaskId(null);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;

    // Optimistic update
    setData(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => t.id === taskId ? { ...t, due_date: dateStr } : t),
    }));

    try {
      await api.patch(`/tasks/${taskId}`, { due_date: dateStr });
    } catch {
      // Revert by reloading
      api.get<ApiResponse<CalendarData>>('/insights/calendar')
        .then(r => setData(r.data.data))
        .catch(() => {});
    }
  }, []);

  const toggleType = (t: EventType) => {
    setTypes(prev => {
      const next = new Set(prev);
      if (next.has(t)) { if (next.size > 1) next.delete(t); }
      else next.add(t);
      return next;
    });
  };

  const is1m = viewMode === '1m';

  if (loadError && !online) return <OfflineUnavailable label="Calendar" />;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white min-h-0 max-h-[95vh]">
      {/* ── Header ── */}
      <div className="flex-shrink-0 flex items-center gap-3 px-6 py-3 border-b border-brand-navy-30 bg-white flex-wrap">
        {/* Month nav */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setMonth(m => addMonths(m, -1))}
            className="w-7 h-7 flex items-center justify-center rounded-lg border border-brand-navy-30 text-brand-navy-70 hover:bg-gray-50 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1))}
            className="text-sm font-semibold text-brand-navy min-w-[150px] text-center hover:text-brand-purple transition-colors"
          >
            {is1m ? formatMonthYear(month) : format3mRange(month)}
          </button>
          <button
            onClick={() => setMonth(m => addMonths(m, 1))}
            className="w-7 h-7 flex items-center justify-center rounded-lg border border-brand-navy-30 text-brand-navy-70 hover:bg-gray-50 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* 1M / 3M toggle */}
        <div className="flex rounded-lg border border-brand-navy-30 overflow-hidden text-xs">
          {(['1m', '3m'] as ViewMode[]).map(v => (
            <button
              key={v}
              onClick={() => setViewMode(v)}
              className={`px-2.5 py-1 font-medium transition-colors ${
                viewMode === v
                  ? 'bg-brand-navy text-white'
                  : 'bg-white text-brand-navy-70 hover:bg-gray-50'
              } ${v === '3m' ? 'border-l border-brand-navy-30' : ''}`}
            >
              {v.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-brand-navy-30" />

        {/* Type toggles */}
        <div className="flex items-center gap-1.5">
          {(['poc', 'rfp', 'task'] as EventType[]).map(t => {
            const labels: Record<EventType, string> = { poc: '🔬 POC', rfp: '📄 RFP', task: '☐ Tasks' };
            return (
              <button
                key={t}
                onClick={() => toggleType(t)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  types.has(t)
                    ? 'bg-brand-purple text-white border-brand-purple'
                    : 'bg-white text-brand-navy-70 border-brand-navy-30 hover:bg-gray-50'
                }`}
              >
                {labels[t]}
              </button>
            );
          })}
        </div>

        <div className="w-px h-5 bg-brand-navy-30" />

        {/* SE filter */}
        {allSes.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            <button
              onClick={() => setFilterSe(null)}
              className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                filterSe === null
                  ? 'bg-brand-navy text-white border-brand-navy'
                  : 'bg-white text-brand-navy-70 border-brand-navy-30 hover:bg-gray-50'
              }`}
            >
              All
            </button>
            {allSes.map(([id, name]) => {
              const color = colorMap.get(id) ?? '#9ca3af';
              return (
                <button
                  key={id}
                  onClick={() => setFilterSe(filterSe === id ? null : id)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                    filterSe === id
                      ? 'text-white border-transparent'
                      : 'bg-white text-brand-navy-70 border-brand-navy-30 hover:bg-gray-50'
                  }`}
                  style={filterSe === id ? { background: color, borderColor: color } : {}}
                >
                  <span
                    className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-bold text-white flex-shrink-0"
                    style={{ background: color }}
                  >
                    {initials(name)}
                  </span>
                  {name.split(' ')[0]}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex-1" />
        <TeamScopeSelector />
      </div>

      {outOfTerritoryTeams.length > 0 && (
        <div className="px-6 py-2 flex-shrink-0">
          <OutOfTerritoryBanner teams={outOfTerritoryTeams} items={outOfTerritoryItems} />
        </div>
      )}

      {/* ── Calendar grid ── */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-sm text-brand-navy-70">Loading…</div>
      ) : (
        <div className={`overflow-auto ${is1m ? 'flex flex-col flex-1' : ''}`}>
          {/* DOW header */}
          <div className="grid grid-cols-7 border-b border-brand-navy-30 sticky top-0 bg-white z-10 flex-shrink-0">
            {DOW.map(d => (
              <div key={d} className="text-center py-2 text-[11px] font-semibold uppercase tracking-wide text-brand-navy-70 border-r last:border-r-0 border-brand-navy-30">
                {d}
              </div>
            ))}
          </div>

          {/* Week sections */}
          <div className={is1m ? 'flex flex-col flex-1 min-h-0' : ''}>
            {weekSections.map(({ sectionMonth, weeks }) => (
              <div key={sectionMonth.toISOString()} className={is1m ? 'flex flex-col flex-1 min-h-0' : ''}>
                {/* Month divider in 3m mode */}
                {!is1m && (
                  <div className="sticky top-[33px] z-[9] px-4 py-1.5 bg-brand-navy-30/30 border-b border-brand-navy-30">
                    <span className="text-xs font-semibold text-brand-navy-70 uppercase tracking-wide">
                      {formatMonthYear(sectionMonth)}
                    </span>
                  </div>
                )}
                {weeks.map((week, wi) => (
                  <WeekRow
                    key={wi}
                    week={week}
                    events={scopedEvents}
                    viewMonth={sectionMonth}
                    colorMap={colorMap}
                    onMoreClick={handleMoreClick}
                    onEventClick={handleEventClick}
                    stretch={is1m}
                    onTaskDrop={handleTaskDrop}
                    draggingTaskId={draggingTaskId}
                    onTaskDragStart={handleTaskDragStart}
                    onTaskDragEnd={handleTaskDragEnd}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 px-6 py-3 border-t border-brand-navy-30 text-[10px] text-brand-navy-70 flex-shrink-0">
            <span className="font-semibold uppercase tracking-wide">Legend:</span>
            <span>🔬 POC span</span>
            <span>📄 RFP submission date</span>
            <span>☐ Task due date</span>
            <span className="ml-2 text-brand-navy-30">|</span>
            <span>* = estimated date (21-day assumption)</span>
            <span className="ml-2 text-brand-navy-30">|</span>
            <span>Click any item to open opportunity detail</span>
            <span className="ml-2 text-brand-navy-30">|</span>
            <span>Drag tasks to reschedule due date</span>
          </div>
        </div>
      )}

      {/* +N more popover */}
      {popover && (
        <DayPopover
          date={popover.date}
          events={popover.events}
          colorMap={colorMap}
          onClose={() => setPopover(null)}
          onEventClick={handleEventClick}
        />
      )}

      {/* Opportunity detail drawer */}
      <Drawer open={selectedOppId !== null} onClose={() => setSelectedOppId(null)}>
        {selectedOppId !== null && (
          <OpportunityDetail key={selectedOppId} oppId={selectedOppId} />
        )}
      </Drawer>
    </div>
  );
}
