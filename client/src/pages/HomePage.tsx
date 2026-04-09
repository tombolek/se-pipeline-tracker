import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import type { ApiResponse } from '../types';
import { useAuthStore } from '../store/auth';
import { formatARR } from '../utils/formatters';
import Drawer from '../components/Drawer';
import OpportunityDetail from '../components/OpportunityDetail';

interface DigestTask {
  id: number; title: string; status: string; due_date: string | null;
  is_next_step: boolean; opportunity_id: number; opportunity_name: string;
}
interface PocAlert {
  id: number; name: string; account_name: string | null; poc_status: string;
  poc_end_date: string; days_remaining: number;
}
interface Activity {
  activity_type: 'note' | 'stage_change' | 'manager_comment';
  activity_at: string; actor_name: string | null;
  opportunity_id: number; opportunity_name: string;
  detail: string | null; extra: string | null;
}
interface ClosedLostItem {
  id: number; name: string; account_name: string | null;
  arr: number | null; arr_currency: string;
  last_stage: string; closed_at: string;
}
interface StaleDeal {
  id: number; name: string; account_name: string | null;
  stage: string; arr: number | null; arr_currency: string;
  last_activity_at: string | null;
}
interface UpcomingEvent {
  event_type: 'task' | 'poc_end' | 'rfx_submission';
  event_date: string; label: string; is_next_step: boolean;
  opportunity_id: number; opportunity_name: string;
}
interface DigestData {
  summary: { overdue: number; due_today: number; poc_alerts: number; closed_lost_unread: number; stale_deals: number };
  tasks: DigestTask[];
  poc_alerts: PocAlert[];
  recent_activity: Activity[];
  closed_lost: ClosedLostItem[];
  stale_deals: StaleDeal[];
  upcoming: UpcomingEvent[];
}

function dueLabel(d: string | null): { text: string; cls: string } {
  if (!d) return { text: 'No date', cls: 'text-brand-navy-30' };
  const today = new Date(new Date().toDateString());
  const due = new Date(d);
  const diff = Math.floor((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return { text: `${Math.abs(diff)}d overdue`, cls: 'text-status-overdue font-semibold' };
  if (diff === 0) return { text: 'Due today', cls: 'text-status-warning font-semibold' };
  return { text: `${diff}d`, cls: 'text-brand-navy-70' };
}

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function formatEventDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function dayOfWeek(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// ── Summary Card ────────────────────────────────────────────────────────────
function SummaryCard({ count, label, color, icon }: { count: number; label: string; color: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-brand-navy-30/40 p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center`}>{icon}</div>
      <div>
        <p className={`text-2xl font-semibold ${count > 0 ? '' : 'text-brand-navy-30'}`}>{count}</p>
        <p className="text-[10px] text-brand-navy-70 uppercase tracking-wide">{label}</p>
      </div>
    </div>
  );
}

// ── Section Card ────────────────────────────────────────────────────────────
function SectionCard({ icon, title, badge, children, footer }: {
  icon: React.ReactNode; title: string; badge?: React.ReactNode;
  children: React.ReactNode; footer?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-brand-navy-30/40 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-brand-navy-30/20 flex items-center gap-2">
        {icon}
        <h2 className="text-xs font-semibold uppercase tracking-widest text-brand-navy-70">{title}</h2>
        {badge}
      </div>
      {children}
      {footer && (
        <div className="px-5 py-2.5 border-t border-brand-navy-30/20">{footer}</div>
      )}
    </div>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────────
function AllClear({ text }: { text: string }) {
  return (
    <div className="px-5 py-8 text-center">
      <div className="w-10 h-10 mx-auto rounded-full bg-status-success/10 flex items-center justify-center mb-2">
        <svg className="w-5 h-5 text-status-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <p className="text-xs text-brand-navy-70">{text}</p>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function HomePage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [data, setData] = useState<DigestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedOppId, setSelectedOppId] = useState<number | null>(null);

  useEffect(() => {
    api.get<ApiResponse<DigestData>>('/home/digest')
      .then(r => setData(r.data.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return <div className="flex items-center justify-center flex-1 text-sm text-brand-navy-70">Loading your daily digest...</div>;
  }

  const firstName = user?.name?.split(' ')[0] ?? 'there';
  const s = data.summary;

  return (
    <div className="flex-1 bg-[#F5F5F7] overflow-y-auto">
      <div className="max-w-[1200px] mx-auto px-8 py-6">

        {/* Greeting */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-brand-navy">{greeting()}, {firstName}</h1>
          <p className="text-sm text-brand-navy-70 mt-0.5">{dayOfWeek()} — here's what needs your attention today</p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <SummaryCard count={s.overdue} label="Overdue" color="bg-status-overdue/10"
            icon={<svg className="w-5 h-5 text-status-overdue" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>} />
          <SummaryCard count={s.due_today} label="Due Today" color="bg-status-warning/10"
            icon={<svg className="w-5 h-5 text-status-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>} />
          <SummaryCard count={s.poc_alerts} label="PoC Alerts" color="bg-brand-purple/10"
            icon={<svg className="w-5 h-5 text-brand-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>} />
          <SummaryCard count={s.closed_lost_unread} label="New Closed Lost" color="bg-brand-pink/10"
            icon={<svg className="w-5 h-5 text-brand-pink" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>} />
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-2 gap-6">

          {/* LEFT */}
          <div className="space-y-6">

            {/* Today's Tasks */}
            <SectionCard
              icon={<svg className="w-4 h-4 text-status-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>}
              title="Today's Tasks"
              badge={data.tasks.length > 0 ? <span className="text-[10px] font-semibold bg-status-overdue/10 text-status-overdue px-1.5 py-0.5 rounded-full">{data.tasks.length}</span> : undefined}
              footer={<button onClick={() => navigate('/my-tasks')} className="text-[11px] font-medium text-brand-purple hover:text-brand-purple-70 transition-colors">View all my tasks &rarr;</button>}
            >
              {data.tasks.length === 0 ? (
                <AllClear text="No tasks due today or overdue" />
              ) : (
                <div className="divide-y divide-brand-navy-30/15">
                  {data.tasks.slice(0, 8).map(t => {
                    const due = dueLabel(t.due_date);
                    const dotColor = due.text.includes('overdue') ? 'bg-status-overdue ring-status-overdue/20'
                      : due.text === 'Due today' ? 'bg-status-warning ring-status-warning/20'
                      : 'bg-blue-400 ring-blue-400/20';
                    return (
                      <div key={t.id} onClick={() => setSelectedOppId(t.opportunity_id)} className="px-5 py-3 hover:bg-brand-purple-30/20 cursor-pointer transition-colors">
                        <div className="flex items-start gap-3">
                          <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ring-2 ${dotColor}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-brand-navy leading-snug">{t.title}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] text-brand-navy-70 truncate">{t.opportunity_name}</span>
                              <span className={`text-[10px] ${due.cls}`}>{due.text}</span>
                            </div>
                          </div>
                          {t.status === 'blocked' && (
                            <span className="text-[9px] font-semibold uppercase tracking-wide text-status-overdue bg-status-overdue/10 px-1.5 py-0.5 rounded flex-shrink-0">Blocked</span>
                          )}
                          {t.is_next_step && (
                            <span className="text-[9px] font-semibold uppercase tracking-wide text-brand-purple bg-brand-purple-30/50 px-1.5 py-0.5 rounded flex-shrink-0">Next Step</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>

            {/* PoC Alerts */}
            <SectionCard
              icon={<svg className="w-4 h-4 text-brand-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>}
              title="PoC Alerts"
              badge={data.poc_alerts.length > 0 ? <span className="text-[10px] font-semibold bg-brand-purple/10 text-brand-purple px-1.5 py-0.5 rounded-full">{data.poc_alerts.length}</span> : undefined}
            >
              {data.poc_alerts.length === 0 ? (
                <AllClear text="No PoCs ending soon" />
              ) : (
                <div className="divide-y divide-brand-navy-30/15">
                  {data.poc_alerts.map(p => (
                    <div key={p.id} onClick={() => setSelectedOppId(p.id)} className="px-5 py-3 hover:bg-brand-purple-30/20 cursor-pointer transition-colors">
                      <div className="flex items-start gap-3">
                        <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ring-2 ${p.days_remaining <= 0 ? 'bg-status-overdue ring-status-overdue/20' : p.days_remaining <= 3 ? 'bg-status-warning ring-status-warning/20' : 'bg-brand-purple ring-brand-purple/20'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-brand-navy leading-snug">{p.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-brand-navy-70">PoC ends {formatEventDate(p.poc_end_date)}</span>
                            <span className={`text-[10px] font-semibold ${p.days_remaining <= 0 ? 'text-status-overdue' : p.days_remaining <= 3 ? 'text-status-warning' : 'text-brand-navy-70'}`}>
                              {p.days_remaining <= 0 ? `${Math.abs(p.days_remaining)}d overdue` : `${p.days_remaining}d left`}
                            </span>
                            <span className="text-brand-navy-30">&middot;</span>
                            <span className="text-[10px] text-brand-navy-70">{p.poc_status}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* Stale Deals */}
            <SectionCard
              icon={<svg className="w-4 h-4 text-brand-navy-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
              title="Stale Deals"
              badge={<span className="text-[10px] text-brand-navy-70">No activity in 21+ days</span>}
            >
              {data.stale_deals.length === 0 ? (
                <AllClear text="All clear — all your deals have recent activity" />
              ) : (
                <div className="divide-y divide-brand-navy-30/15">
                  {data.stale_deals.map(d => {
                    const daysSince = d.last_activity_at ? Math.floor((Date.now() - new Date(d.last_activity_at).getTime()) / 86400000) : null;
                    return (
                      <div key={d.id} onClick={() => setSelectedOppId(d.id)} className="px-5 py-3 hover:bg-brand-purple-30/20 cursor-pointer transition-colors">
                        <div className="flex items-start gap-3">
                          <span className="mt-1 w-2 h-2 rounded-full bg-brand-navy-30 flex-shrink-0 ring-2 ring-brand-navy-30/20" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-brand-navy leading-snug">{d.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] text-brand-navy-70">{d.stage}</span>
                              {d.arr != null && <><span className="text-brand-navy-30">&middot;</span><span className="text-[10px] text-brand-navy-70">{formatARR(d.arr)}</span></>}
                              <span className="text-brand-navy-30">&middot;</span>
                              <span className="text-[10px] text-status-overdue font-medium">{daysSince ? `${daysSince}d silent` : 'Never updated'}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>
          </div>

          {/* RIGHT */}
          <div className="space-y-6">

            {/* Recent Activity */}
            <SectionCard
              icon={<svg className="w-4 h-4 text-status-info" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
              title="Recent Activity on My Deals"
            >
              {data.recent_activity.length === 0 ? (
                <AllClear text="No recent activity from others on your deals" />
              ) : (
                <div className="divide-y divide-brand-navy-30/15">
                  {data.recent_activity.slice(0, 6).map((a, i) => {
                    const initials = a.actor_name ? a.actor_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : '';
                    return (
                      <div key={i} onClick={() => setSelectedOppId(a.opportunity_id)} className="px-5 py-3 hover:bg-brand-purple-30/20 cursor-pointer transition-colors">
                        <div className="flex items-start gap-3">
                          {a.activity_type === 'note' && (
                            <div className="mt-0.5 w-6 h-6 rounded-full bg-brand-purple flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0">{initials}</div>
                          )}
                          {a.activity_type === 'stage_change' && (
                            <div className="mt-0.5 w-6 h-6 rounded-full bg-brand-purple-30 flex items-center justify-center text-[9px] font-bold text-brand-purple flex-shrink-0">SF</div>
                          )}
                          {a.activity_type === 'manager_comment' && (
                            <div className="mt-0.5 w-6 h-6 rounded-full bg-brand-pink/20 flex items-center justify-center text-[9px] font-bold text-brand-pink flex-shrink-0">MG</div>
                          )}
                          <div className="flex-1 min-w-0">
                            {a.activity_type === 'note' && (
                              <>
                                <p className="text-xs text-brand-navy leading-snug"><span className="font-medium">{a.actor_name}</span> added a note on <span className="font-medium">{a.opportunity_name}</span></p>
                                {a.detail && <p className="text-[11px] text-brand-navy-70 mt-1 line-clamp-2 italic">&ldquo;{a.detail}&rdquo;</p>}
                              </>
                            )}
                            {a.activity_type === 'stage_change' && (
                              <p className="text-xs text-brand-navy leading-snug"><span className="font-medium">{a.opportunity_name}</span> moved from <span className="font-medium">{a.extra}</span> &rarr; <span className="font-medium">{a.detail}</span></p>
                            )}
                            {a.activity_type === 'manager_comment' && (
                              <>
                                <p className="text-xs text-brand-navy leading-snug"><span className="font-medium">Manager</span> updated comments on <span className="font-medium">{a.opportunity_name}</span></p>
                                {a.detail && <p className="text-[11px] text-brand-navy-70 mt-1 line-clamp-2 italic">&ldquo;{a.detail}&rdquo;</p>}
                              </>
                            )}
                            <span className="text-[10px] text-brand-navy-70 mt-0.5 block">{timeAgo(a.activity_at)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>

            {/* Closed Lost */}
            {data.closed_lost.length > 0 && (
              <SectionCard
                icon={<svg className="w-4 h-4 text-brand-pink" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>}
                title="New Closed Lost"
                badge={<span className="text-[10px] font-semibold bg-brand-pink/10 text-brand-pink px-1.5 py-0.5 rounded-full">{data.closed_lost.length} unread</span>}
                footer={<button onClick={() => navigate('/closed-lost')} className="text-[11px] font-medium text-brand-purple hover:text-brand-purple-70 transition-colors">View all closed lost &rarr;</button>}
              >
                <div className="divide-y divide-brand-navy-30/15">
                  {data.closed_lost.map(cl => (
                    <div key={cl.id} onClick={() => setSelectedOppId(cl.id)} className="px-5 py-3 hover:bg-brand-purple-30/20 cursor-pointer transition-colors">
                      <div className="flex items-start gap-3">
                        <span className="mt-1 w-2 h-2 rounded-full bg-brand-pink flex-shrink-0 ring-2 ring-brand-pink/20" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-brand-navy leading-snug">{cl.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {cl.arr != null && <span className="text-[10px] text-brand-navy-70">{formatARR(cl.arr)}</span>}
                            <span className="text-brand-navy-30">&middot;</span>
                            <span className="text-[10px] text-brand-navy-70">Was at {cl.last_stage}</span>
                            {cl.closed_at && <><span className="text-brand-navy-30">&middot;</span><span className="text-[10px] text-brand-navy-70">Closed {formatEventDate(cl.closed_at)}</span></>}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* Upcoming This Week */}
            <SectionCard
              icon={<svg className="w-4 h-4 text-brand-navy-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>}
              title="Upcoming This Week"
              footer={<button onClick={() => navigate('/calendar')} className="text-[11px] font-medium text-brand-purple hover:text-brand-purple-70 transition-colors">Open calendar &rarr;</button>}
            >
              {data.upcoming.length === 0 ? (
                <AllClear text="Nothing upcoming this week" />
              ) : (
                <div className="divide-y divide-brand-navy-30/15">
                  {data.upcoming.map((ev, i) => {
                    const typeBadge = ev.event_type === 'poc_end'
                      ? { text: 'PoC', cls: 'text-status-overdue bg-status-overdue/10' }
                      : ev.event_type === 'rfx_submission'
                      ? { text: 'RFx', cls: 'text-status-warning bg-status-warning/10' }
                      : ev.is_next_step
                      ? { text: 'Next Step', cls: 'text-brand-purple bg-brand-purple-30/50' }
                      : null;
                    return (
                      <div key={i} onClick={() => setSelectedOppId(ev.opportunity_id)} className="px-5 py-3 hover:bg-brand-purple-30/20 cursor-pointer transition-colors">
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-semibold text-brand-navy-70 w-12 flex-shrink-0">{formatEventDate(ev.event_date)}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-brand-navy">{ev.label}</p>
                            <span className="text-[10px] text-brand-navy-70">{ev.opportunity_name}</span>
                          </div>
                          {typeBadge && (
                            <span className={`text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded flex-shrink-0 ${typeBadge.cls}`}>{typeBadge.text}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>
          </div>
        </div>
      </div>

      {/* Opportunity Drawer */}
      <Drawer open={selectedOppId !== null} onClose={() => setSelectedOppId(null)}>
        {selectedOppId && <OpportunityDetail oppId={selectedOppId} />}
      </Drawer>
    </div>
  );
}
