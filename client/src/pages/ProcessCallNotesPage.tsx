/**
 * Process Call Notes — full-page redesign (replaces MeetingNotesModal).
 *
 * Route: /opportunities/:sfid/process-notes
 *
 * Flow:
 *   1. Configure  — section selector + save-as-note toggle + paste notes
 *   2. Processing — Claude is extracting
 *   3. Results    — review + accept, three layout modes (Tabs / Wizard / Scroll)
 *   4. Success    — "Applied N proposals" with one-click back to opp detail
 *
 * Preferences (selected sections, save-as-note, layout mode) persist in
 * localStorage per user so the SE doesn't re-configure each time. A leave
 * guard prevents accidental loss of unconfirmed AI proposals — `beforeunload`
 * for browser nav, and an in-page overlay for the back button.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import { getOpportunity } from '../api/opportunities';
import { createTask } from '../api/tasks';
import { createNote } from '../api/notes';
import type { Opportunity, ApiResponse } from '../types';
import { useAuthStore } from '../store/auth';

// ── Types ───────────────────────────────────────────────────────────────────

type Section = 'tasks' | 'se_comment' | 'tech_blockers' | 'tech_discovery' | 'meddpicc' | 'next_step';

const ALL_SECTIONS: Section[] = ['tasks', 'se_comment', 'tech_blockers', 'tech_discovery', 'meddpicc', 'next_step'];
const DEFAULT_SECTIONS: Section[] = ['tasks', 'se_comment', 'tech_blockers', 'tech_discovery', 'next_step'];

const SECTION_LABELS: Record<Section, string> = {
  tasks:          'Tasks',
  se_comment:     'SE Comment',
  tech_blockers:  'Tech Blockers',
  tech_discovery: 'Tech Discovery',
  meddpicc:       'MEDDPICC',
  next_step:      'Next Step',
};

const SECTION_HINTS: Record<Section, string> = {
  tasks:          'Action items with suggested due dates. You pick which to create (default: none selected).',
  se_comment:     'A 1–2 sentence update prefixed with your initials, ready to paste into Salesforce.',
  tech_blockers:  'Technical, integration, connector, security, or capability gaps. Saved to the Technical Blockers field.',
  tech_discovery: 'Stack items detected, enterprise-system / DMG tool names, and prose proposals for the 9 Discovery Notes fields.',
  meddpicc:       'Saved as a structured note on the opportunity, flagged to consider updating in Salesforce. SF is not modified.',
  next_step:      'A single sentence for the most important follow-up, created as a next-step task.',
};

interface TechDiscoveryProposals {
  tech_stack_additions: Record<string, string[]>;
  enterprise_systems_additions: Record<string, string>;
  existing_dmg_additions: Record<string, string>;
  prose_proposals: Array<{ field: string; current: string; suggested: string; mode: 'replace' | 'append' }>;
}

interface ProcessResult {
  saved_note_id: number | null;
  sections_requested: Section[];
  tasks: Array<{ title: string; due_days: number }>;
  meddpicc_updates: Array<{ field: string; current: string; suggested: string }>;
  se_comment_draft: string;
  tech_blockers: string[];
  next_step: string;
  tech_discovery: TechDiscoveryProposals;
}

const MEDDPICC_LABELS: Record<string, string> = {
  metrics: 'Metrics', economic_buyer: 'Economic Buyer', decision_criteria: 'Decision Criteria',
  decision_process: 'Decision Process', paper_process: 'Paper Process',
  implicate_pain: 'Implicate the Pain', champion: 'Champion',
  engaged_competitors: 'Competitors', budget: 'Budget', authority: 'Authority',
  need: 'Need', timeline: 'Timeline', agentic_qual: 'Agentic Qual',
};

const TECH_STACK_CATEGORY_LABELS: Record<string, string> = {
  data_infrastructure: 'Data Infra',  data_lake: 'Data Lake',  data_lake_metastore: 'Metastore',
  data_warehouse: 'Data Warehouse',   database: 'Database',    datalake_processing: 'Processing',
  etl: 'ETL/ELT',                     business_intelligence: 'BI',
  nosql: 'NoSQL',                     streaming: 'Streaming',
};

const ENTERPRISE_SYSTEM_LABELS: Record<string, string> = {
  crm: 'CRM', erp: 'ERP', finance: 'Finance', hr: 'HR', claims: 'Claims',
  marketing: 'Marketing', procurement: 'Procurement',
  inventory_management: 'Inventory Mgmt', order_management: 'Order Mgmt',
};

const DMG_LABELS: Record<string, string> = { catalog: 'Catalog', dq: 'DQ', mdm: 'MDM', lineage: 'Lineage' };

const PROSE_FIELD_LABELS: Record<string, string> = {
  current_incumbent_solutions: 'Current & Incumbent Solutions',
  tier1_integrations: 'Priority (Tier 1) Integrations',
  data_details_and_users: 'Data Details & Users',
  ingestion_sources: 'Ingestion Sources',
  planned_ingestion_sources: 'Planned Ingestion Sources',
  data_cleansing_remediation: 'Data Cleansing & Remediation',
  deployment_preference: 'Deployment Preference',
  technical_constraints: 'Technical Constraints',
  open_technical_requirements: 'Open Technical Requirements',
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function dueDateStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

type ViewMode = 'tabs' | 'wizard' | 'scroll';
const PREFS_KEY = 'process-call-notes-prefs-v1';
interface Prefs {
  sections: Section[];
  save_raw_notes: boolean;
  view_mode: ViewMode;
}
function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { sections: [...DEFAULT_SECTIONS], save_raw_notes: true, view_mode: 'wizard' };
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    const sections = Array.isArray(parsed.sections) && parsed.sections.length > 0
      ? (parsed.sections.filter((s): s is Section => ALL_SECTIONS.includes(s as Section)))
      : [...DEFAULT_SECTIONS];
    return {
      sections,
      save_raw_notes: parsed.save_raw_notes !== false,
      view_mode: parsed.view_mode === 'tabs' || parsed.view_mode === 'scroll' ? parsed.view_mode : 'wizard',
    };
  } catch { return { sections: [...DEFAULT_SECTIONS], save_raw_notes: true, view_mode: 'wizard' }; }
}
function savePrefs(prefs: Prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}

// ── Small UI primitives ─────────────────────────────────────────────────────

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white border border-brand-navy-30/60 rounded-2xl overflow-hidden ${className}`}>{children}</div>;
}

function SectionHeading({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
      <div>
        <h3 className="text-sm font-semibold text-brand-navy">{title}</h3>
        {subtitle && <div className="text-[11px] text-brand-navy-70 mt-0.5">{subtitle}</div>}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}

function ConfirmedChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-status-success">
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
      {label}
    </span>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export default function ProcessCallNotesPage() {
  const { sfid } = useParams<{ sfid: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [opp, setOpp] = useState<Opportunity | null>(null);
  const [oppLoading, setOppLoading] = useState(true);
  const [oppError, setOppError] = useState<string | null>(null);

  // Preferences (persisted)
  const initialPrefs = useMemo(() => loadPrefs(), []);
  const [sections, setSections] = useState<Section[]>(initialPrefs.sections);
  const [saveRawNotes, setSaveRawNotes] = useState(initialPrefs.save_raw_notes);
  const [viewMode, setViewMode] = useState<ViewMode>(initialPrefs.view_mode);

  // Configure step
  const [sourceUrl, setSourceUrl] = useState('');
  const [rawNotes, setRawNotes] = useState('');
  const [processError, setProcessError] = useState<string | null>(null);

  // Flow
  const [phase, setPhase] = useState<'configure' | 'processing' | 'results' | 'success'>('configure');
  const [result, setResult] = useState<ProcessResult | null>(null);

  // Editable results
  const [editedTasks, setEditedTasks] = useState<Array<{ title: string; due_days: number; selected: boolean }>>([]);
  const [editedComment, setEditedComment] = useState('');
  const [editedBlockers, setEditedBlockers] = useState<string[]>([]);
  const [editedNextStep, setEditedNextStep] = useState('');
  const [techRejects, setTechRejects] = useState<Set<string>>(new Set());

  // Per-section confirmed + busy
  const [tasksConfirmed, setTasksConfirmed] = useState(false);
  const [meddpiccConfirmed, setMeddpiccConfirmed] = useState(false);
  const [commentCopied, setCommentCopied] = useState(false);
  const [blockersConfirmed, setBlockersConfirmed] = useState(false);
  const [nextStepConfirmed, setNextStepConfirmed] = useState(false);
  const [techDiscoveryConfirmed, setTechDiscoveryConfirmed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  // Tabs / Wizard indices
  const [activeTab, setActiveTab] = useState<Section>('tasks');
  // Tabs mode is forced-linear: we track the furthest section reached so the
  // user can backtrack to a previous section but can't jump ahead. Advances
  // only via the "Next section →" footer button.
  const [maxTabIndex, setMaxTabIndex] = useState(0);
  const [wizardStep, setWizardStep] = useState(0);

  // Summary of what was applied (for the success screen)
  const [appliedSummary, setAppliedSummary] = useState<string[]>([]);

  // Leave guard overlay
  const [showLeaveGuard, setShowLeaveGuard] = useState(false);
  const pendingNavRef = useRef<null | (() => void)>(null);

  // Persist prefs whenever they change
  useEffect(() => { savePrefs({ sections, save_raw_notes: saveRawNotes, view_mode: viewMode }); }, [sections, saveRawNotes, viewMode]);

  // Load opportunity
  useEffect(() => {
    if (!sfid) return;
    let cancelled = false;
    (async () => {
      try {
        setOppLoading(true);
        const o = await getOpportunity(sfid);
        if (!cancelled) setOpp(o);
      } catch (e) {
        if (!cancelled) setOppError((e as Error).message ?? 'Failed to load opportunity');
      } finally {
        if (!cancelled) setOppLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sfid]);

  // Populate editable fields when the result arrives
  useEffect(() => {
    if (!result) return;
    setEditedTasks(result.tasks.map(t => ({ ...t, selected: false })));  // ← default unselected
    setEditedComment(result.se_comment_draft);
    setEditedBlockers(result.tech_blockers);
    setEditedNextStep(result.next_step);
    setTechRejects(new Set());
    setTasksConfirmed(false);
    setMeddpiccConfirmed(false);
    setCommentCopied(false);
    setBlockersConfirmed(false);
    setNextStepConfirmed(false);
    setTechDiscoveryConfirmed(false);
    // Reset tab / wizard to the first selected section
    const firstSel = result.sections_requested.find(s => ALL_SECTIONS.includes(s));
    if (firstSel) setActiveTab(firstSel);
    setMaxTabIndex(0);
    setWizardStep(0);
  }, [result]);

  // ── Dirty tracking for leave guard ────────────────────────────────────────
  const isDirty = phase === 'results' && !!result && (
    (sections.includes('tasks')          && !tasksConfirmed        && editedTasks.some(t => t.selected)) ||
    (sections.includes('meddpicc')       && !meddpiccConfirmed     && result.meddpicc_updates.length > 0) ||
    (sections.includes('se_comment')     && !commentCopied         && !!editedComment.trim()) ||
    (sections.includes('tech_blockers')  && !blockersConfirmed     && editedBlockers.some(b => b.trim())) ||
    (sections.includes('next_step')      && !nextStepConfirmed     && !!editedNextStep.trim()) ||
    (sections.includes('tech_discovery') && !techDiscoveryConfirmed && techDiscoveryHasContent(result.tech_discovery, techRejects))
  );

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  function tryNavigate(fn: () => void) {
    if (isDirty) {
      pendingNavRef.current = fn;
      setShowLeaveGuard(true);
    } else {
      fn();
    }
  }

  function backToOpp() {
    tryNavigate(() => navigate(`/home?oppId=${sfid}`));
  }

  // ── Section toggles for configure step ───────────────────────────────────
  function toggleSection(key: Section) {
    setSections(prev => prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key]);
  }

  // ── Process ──────────────────────────────────────────────────────────────
  async function handleProcess() {
    if (!rawNotes.trim() || !opp) return;
    setPhase('processing');
    setProcessError(null);
    try {
      const { data } = await api.post<ApiResponse<ProcessResult>>(
        `/opportunities/${opp.id}/process-notes`,
        {
          raw_notes: rawNotes.trim(),
          source_url: sourceUrl.trim() || undefined,
          sections,
          save_raw_notes: saveRawNotes,
        },
      );
      setResult(data.data);
      setPhase('results');
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to process notes — please try again.';
      setProcessError(msg);
      setPhase('configure');
    }
  }

  // ── Per-section confirm handlers ─────────────────────────────────────────
  async function confirmTasks() {
    const selected = editedTasks.filter(t => t.selected);
    if (selected.length === 0 || !opp) return;
    setBusy('tasks');
    try {
      await Promise.all(selected.map(t =>
        createTask(opp.id, { title: t.title.trim(), due_date: dueDateStr(t.due_days) })
      ));
      setTasksConfirmed(true);
      setAppliedSummary(prev => [...prev, `${selected.length} task${selected.length === 1 ? '' : 's'} created`]);
    } finally { setBusy(null); }
  }

  async function confirmMeddpiccAsNote() {
    if (!result || !opp || result.meddpicc_updates.length === 0) return;
    setBusy('meddpicc');
    try {
      const lines = result.meddpicc_updates.map(
        u => `• ${MEDDPICC_LABELS[u.field] ?? u.field}: ${u.suggested}`
      ).join('\n');
      const body = `📋 MEDDPICC — proposed update from call notes\n\n(Salesforce was NOT modified. Review and update SF where appropriate.)\n\n${lines}`;
      await createNote(opp.id, body);
      setMeddpiccConfirmed(true);
      setAppliedSummary(prev => [...prev, `MEDDPICC note saved (${result.meddpicc_updates.length} field${result.meddpicc_updates.length === 1 ? '' : 's'})`]);
    } finally { setBusy(null); }
  }

  async function copyComment() {
    try { await navigator.clipboard.writeText(editedComment); } catch { /* ignore */ }
    setCommentCopied(true);
    setAppliedSummary(prev => [...prev, 'SE comment copied to clipboard']);
  }

  async function confirmBlockers() {
    if (!opp) return;
    const text = editedBlockers.filter(b => b.trim()).join('\n');
    if (!text) return;
    setBusy('blockers');
    try {
      const existing = opp.technical_blockers?.trim() ?? '';
      const combined = existing ? `${text}\n\n${existing}` : text;
      await api.patch(`/opportunities/${opp.id}/fields`, { technical_blockers: combined });
      setBlockersConfirmed(true);
      setAppliedSummary(prev => [...prev, `Tech blockers saved (${editedBlockers.filter(b => b.trim()).length} item${editedBlockers.filter(b => b.trim()).length === 1 ? '' : 's'})`]);
    } finally { setBusy(null); }
  }

  async function confirmNextStep() {
    if (!opp || !editedNextStep.trim()) return;
    setBusy('nextstep');
    try {
      await createTask(opp.id, {
        title: editedNextStep.trim(),
        is_next_step: true,
        due_date: dueDateStr(3),
      });
      setNextStepConfirmed(true);
      setAppliedSummary(prev => [...prev, 'Next step task created']);
    } finally { setBusy(null); }
  }

  async function confirmTechDiscovery() {
    if (!result || !opp) return;
    const td = result.tech_discovery;
    setBusy('techdiscovery');
    try {
      const currentResp = await api.get<ApiResponse<{
        tech_stack: Record<string, string[] | Record<string, string>>;
        enterprise_systems: Record<string, string>;
        existing_dmg: Record<string, string>;
      }>>(`/opportunities/${opp.id}/tech-discovery`);
      const current = currentResp.data.data;

      const nextStack = { ...(current.tech_stack ?? {}) } as Record<string, string[] | Record<string, string>>;
      for (const [cat, items] of Object.entries(td.tech_stack_additions ?? {})) {
        const accepted = (items ?? []).filter(it => !techRejects.has(`stack:${cat}:${it}`));
        if (accepted.length === 0) continue;
        const existingArr = Array.isArray(nextStack[cat]) ? (nextStack[cat] as string[]) : [];
        nextStack[cat] = Array.from(new Set([...existingArr, ...accepted]));
      }

      const nextEnterprise = { ...(current.enterprise_systems ?? {}) };
      for (const [k, v] of Object.entries(td.enterprise_systems_additions ?? {})) {
        if (techRejects.has(`es:${k}`)) continue;
        if (v && v.trim() && !nextEnterprise[k]) nextEnterprise[k] = v.trim();
      }

      const nextDmg = { ...(current.existing_dmg ?? {}) };
      for (const [k, v] of Object.entries(td.existing_dmg_additions ?? {})) {
        if (techRejects.has(`dmg:${k}`)) continue;
        if (v && v.trim() && !nextDmg[k]) nextDmg[k] = v.trim();
      }

      const proseUpdates: Record<string, string> = {};
      for (const p of td.prose_proposals ?? []) {
        if (techRejects.has(`prose:${p.field}`)) continue;
        if (p.suggested && p.suggested.trim()) proseUpdates[p.field] = p.suggested.trim();
      }

      await api.patch(`/opportunities/${opp.id}/tech-discovery`, {
        tech_stack: nextStack,
        enterprise_systems: nextEnterprise,
        existing_dmg: nextDmg,
        ...proseUpdates,
      });

      setTechDiscoveryConfirmed(true);

      const stackCount = Object.values(td.tech_stack_additions ?? {}).flat()
        .filter(it => !techRejects.has(`stack:${Object.entries(td.tech_stack_additions ?? {}).find(([, items]) => (items ?? []).includes(it))?.[0] ?? ''}:${it}`)).length;
      const acceptedTotal = stackCount
        + Object.entries(td.enterprise_systems_additions ?? {}).filter(([k]) => !techRejects.has(`es:${k}`)).length
        + Object.entries(td.existing_dmg_additions ?? {}).filter(([k]) => !techRejects.has(`dmg:${k}`)).length
        + (td.prose_proposals ?? []).filter(p => !techRejects.has(`prose:${p.field}`)).length;
      setAppliedSummary(prev => [...prev, `Tech Discovery — ${acceptedTotal} signal${acceptedTotal === 1 ? '' : 's'} applied`]);
    } finally { setBusy(null); }
  }

  async function confirmAllAndFinish() {
    const work: Array<() => Promise<void>> = [];
    if (sections.includes('tasks')          && !tasksConfirmed        && editedTasks.some(t => t.selected))  work.push(confirmTasks);
    if (sections.includes('meddpicc')       && !meddpiccConfirmed     && result && result.meddpicc_updates.length > 0) work.push(confirmMeddpiccAsNote);
    if (sections.includes('se_comment')     && !commentCopied         && !!editedComment.trim())            work.push(copyComment);
    if (sections.includes('tech_blockers')  && !blockersConfirmed     && editedBlockers.some(b => b.trim())) work.push(confirmBlockers);
    if (sections.includes('next_step')      && !nextStepConfirmed     && !!editedNextStep.trim())            work.push(confirmNextStep);
    if (sections.includes('tech_discovery') && !techDiscoveryConfirmed && result && techDiscoveryHasContent(result.tech_discovery, techRejects)) work.push(confirmTechDiscovery);
    setBusy('all');
    try {
      for (const fn of work) { await fn(); }
    } finally {
      setBusy(null);
    }
    setPhase('success');
  }

  function toggleTechReject(key: string) {
    setTechRejects(prev => {
      const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next;
    });
  }

  // ── Render pieces ─────────────────────────────────────────────────────────

  // Header — back button + title + view-mode toggle (only on results).
  const header = (
    <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={backToOpp}
          className="w-9 h-9 rounded-xl border border-brand-navy-30 bg-white flex items-center justify-center hover:border-brand-navy hover:text-brand-navy text-brand-navy-70 transition-colors"
          title="Back to opportunity"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <div>
          <h1 className="text-lg font-semibold text-brand-navy">Process Call Notes</h1>
          <div className="text-[12px] text-brand-navy-70 flex items-center gap-2 flex-wrap mt-0.5">
            {opp ? (
              <>
                <span className="inline-flex items-center gap-1.5 bg-brand-purple-30 text-brand-purple px-2 py-0.5 rounded-full text-[11px] font-medium">{opp.name}</span>
                <span className="text-brand-navy-30">·</span>
                <span>{opp.account_name ?? '—'}</span>
                <span className="text-brand-navy-30">·</span>
                <span>{opp.stage}</span>
              </>
            ) : oppLoading ? 'Loading…' : <span className="text-status-overdue">{oppError}</span>}
          </div>
        </div>
      </div>

      {phase === 'results' && (
        <div className="inline-flex items-center bg-white border border-brand-navy-30 rounded-xl p-0.5 gap-0.5">
          {([['tabs','Tabs'], ['wizard','Wizard'], ['scroll','Scroll']] as const).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${viewMode === m ? 'bg-brand-purple text-white' : 'text-brand-navy-70 hover:text-brand-navy'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  // Configure phase renderer
  const configureView = (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <Card>
        <div className="px-5 py-4 border-b border-brand-navy-30/50">
          <h2 className="text-[13px] font-semibold text-brand-navy flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-brand-purple text-white flex items-center justify-center text-[10px] font-bold">1</span>What would you like to extract?</h2>
        </div>
        <div className="px-5 py-4 space-y-1">
          {ALL_SECTIONS.map(s => (
            <label key={s} className="flex items-start gap-3 py-2 px-2 rounded-lg cursor-pointer hover:bg-brand-purple-30/10 transition-colors">
              <input
                type="checkbox"
                checked={sections.includes(s)}
                onChange={() => toggleSection(s)}
                className="mt-1 w-4 h-4 accent-brand-purple cursor-pointer flex-shrink-0"
              />
              <div className="min-w-0">
                <div className="text-[12px] font-medium text-brand-navy">
                  {SECTION_LABELS[s]}
                  {s === 'meddpicc' && <span className="ml-2 text-[9px] font-semibold uppercase tracking-wide text-brand-navy-70 bg-brand-navy-30/40 px-1.5 py-0.5 rounded">note-only</span>}
                </div>
                <div className="text-[11px] text-brand-navy-70 mt-0.5 leading-relaxed">{SECTION_HINTS[s]}</div>
              </div>
            </label>
          ))}
          <div className="h-px bg-brand-navy-30/50 my-3"></div>
          <label className="flex items-start gap-3 py-2 px-2 rounded-lg cursor-pointer hover:bg-brand-purple-30/10 transition-colors">
            <input
              type="checkbox"
              checked={saveRawNotes}
              onChange={e => setSaveRawNotes(e.target.checked)}
              className="mt-1 w-4 h-4 accent-brand-purple cursor-pointer flex-shrink-0"
            />
            <div>
              <div className="text-[12px] font-medium text-brand-navy">Save raw notes as a note on the opportunity</div>
              <div className="text-[11px] text-brand-navy-70 mt-0.5 leading-relaxed">Attaches the pasted notes + source URL to this deal's Notes tab. Turn off for throwaway processing.</div>
            </div>
          </label>
          <p className="text-[10px] text-brand-navy-30 mt-2 px-2">Your choices are remembered for next time.</p>
        </div>
      </Card>

      <Card>
        <div className="px-5 py-4 border-b border-brand-navy-30/50">
          <h2 className="text-[13px] font-semibold text-brand-navy flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-brand-purple text-white flex items-center justify-center text-[10px] font-bold">2</span>Paste the call notes</h2>
        </div>
        <div className="px-5 py-4">
          <label className="block text-[10px] font-semibold uppercase tracking-widest text-brand-navy-70 mb-1.5">Source URL <span className="text-brand-navy-30 font-normal normal-case tracking-normal">optional</span></label>
          <input
            type="url"
            value={sourceUrl}
            onChange={e => setSourceUrl(e.target.value)}
            placeholder="Notion page, Slack canvas, recording transcript URL…"
            className="w-full px-3 py-2 border border-brand-navy-30 rounded-lg text-[13px] text-brand-navy placeholder:text-brand-navy-30 focus:outline-none focus:ring-[3px] focus:ring-brand-purple/15 focus:border-brand-purple"
          />
          <p className="text-[10px] text-brand-navy-30 mt-1">Saved with the note when the save-as-note toggle is on.</p>
          <div className="h-3"></div>
          <label className="block text-[10px] font-semibold uppercase tracking-widest text-brand-navy-70 mb-1.5">Raw call notes</label>
          <textarea
            value={rawNotes}
            onChange={e => setRawNotes(e.target.value)}
            placeholder="Paste rough notes, bullet points, or transcript snippets from the call…"
            style={{ minHeight: 360 }}
            className="w-full px-3 py-3 border border-brand-navy-30 rounded-lg text-[13px] text-brand-navy placeholder:text-brand-navy-30 resize-y focus:outline-none focus:ring-[3px] focus:ring-brand-purple/15 focus:border-brand-purple leading-relaxed"
          />

          {processError && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12px] text-red-700">
              <strong>Processing failed.</strong> {processError}
            </div>
          )}
        </div>
        <div className="px-5 py-3 bg-[#F5F5F7] border-t border-brand-navy-30/40 flex items-center justify-between">
          <p className="text-[11px] text-brand-navy-70">{sections.length} of {ALL_SECTIONS.length} extraction types selected</p>
          <div className="flex items-center gap-2">
            <button onClick={backToOpp} className="px-3 py-1.5 rounded-lg border border-brand-navy-30 text-[12px] font-medium text-brand-navy-70 hover:text-brand-navy hover:border-brand-navy transition-colors">Cancel</button>
            <button
              onClick={handleProcess}
              disabled={!rawNotes.trim() || !opp || sections.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-purple text-white text-[12px] font-medium hover:bg-brand-purple-70 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
              Process with Claude
            </button>
          </div>
        </div>
      </Card>
    </div>
  );

  // Processing phase renderer
  const processingView = (
    <Card className="py-20 flex flex-col items-center gap-3">
      <div className="w-9 h-9 rounded-full border-[3px] border-brand-purple-30 border-t-brand-purple animate-spin" />
      <p className="text-[13px] font-medium text-brand-navy-70">Claude is reading your notes…</p>
      <p className="text-[11px] text-brand-navy-30">Extracting {sections.map(s => SECTION_LABELS[s]).join(' · ')}</p>
      {sections.length < ALL_SECTIONS.length && (
        <p className="text-[10px] text-brand-navy-30">
          Skipped: {ALL_SECTIONS.filter(s => !sections.includes(s)).map(s => SECTION_LABELS[s]).join(', ')}
        </p>
      )}
    </Card>
  );

  // Success view
  const successView = opp && (
    <Card className="px-8 py-10 text-center">
      <div className="w-14 h-14 rounded-full bg-status-success/15 flex items-center justify-center mx-auto mb-3">
        <svg className="w-7 h-7 text-status-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
      </div>
      <h2 className="text-lg font-semibold text-brand-navy">All applied</h2>
      <p className="text-[12px] text-brand-navy-70 mt-1">Your accepted proposals are saved on <strong>{opp.name}</strong>.</p>
      {appliedSummary.length > 0 && (
        <ul className="mt-4 inline-block text-left text-[12px] text-brand-navy-70 space-y-1.5">
          {appliedSummary.map((line, i) => (
            <li key={i} className="flex items-center gap-2">
              <svg className="w-3 h-3 text-status-success flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
              {line}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-6 flex items-center justify-center gap-2">
        <button
          onClick={() => { setPhase('configure'); setRawNotes(''); setResult(null); setAppliedSummary([]); }}
          className="px-4 py-2 rounded-xl border border-brand-navy-30 text-[12px] font-medium text-brand-navy-70 hover:text-brand-navy hover:border-brand-navy transition-colors"
        >
          Process more notes
        </button>
        <button
          onClick={() => navigate(`/home?oppId=${sfid}`)}
          className="px-4 py-2 rounded-xl bg-brand-purple text-white text-[12px] font-medium hover:bg-brand-purple-70 transition-colors inline-flex items-center gap-1.5"
        >
          View deal
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
        </button>
      </div>
    </Card>
  );

  // Section renderers — extracted so Tabs / Wizard / Scroll share them.
  const renderTasks = () => result && result.tasks.length > 0 && (
    <div>
      <SectionHeading
        title={`Extracted Tasks (${editedTasks.filter(t => t.selected).length} of ${editedTasks.length} selected)`}
        subtitle="Pick any you want to create on this deal — none selected by default."
        action={tasksConfirmed
          ? <ConfirmedChip label="Added" />
          : (
            <>
              <button
                onClick={() => setEditedTasks(prev => prev.map(t => ({ ...t, selected: true })))}
                className="text-[11px] font-medium text-brand-purple hover:text-brand-purple-70"
              >
                Select all
              </button>
              <button
                onClick={confirmTasks}
                disabled={busy === 'tasks' || !editedTasks.some(t => t.selected)}
                className="px-3 py-1.5 rounded-lg bg-brand-purple text-white text-[11px] font-medium hover:bg-brand-purple-70 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {busy === 'tasks' ? 'Adding…' : `Add ${editedTasks.filter(t => t.selected).length} task${editedTasks.filter(t => t.selected).length === 1 ? '' : 's'}`}
              </button>
            </>
          )
        }
      />
      <div className="space-y-2">
        {editedTasks.map((t, i) => (
          <label key={i} className={`flex items-start gap-3 px-3 py-2.5 border rounded-xl cursor-pointer transition-colors ${t.selected ? 'border-brand-purple bg-brand-purple-30/10' : 'border-brand-navy-30 bg-gray-50/80 hover:border-brand-navy-70'}`}>
            <input
              type="checkbox"
              checked={t.selected}
              onChange={e => setEditedTasks(prev => prev.map((x, j) => j === i ? { ...x, selected: e.target.checked } : x))}
              className="mt-0.5 accent-brand-purple cursor-pointer flex-shrink-0"
              disabled={tasksConfirmed}
            />
            <div className="flex-1 min-w-0">
              <input
                value={t.title}
                onChange={e => setEditedTasks(prev => prev.map((x, j) => j === i ? { ...x, title: e.target.value } : x))}
                className="w-full bg-transparent text-[13px] font-medium text-brand-navy outline-none border-none"
                disabled={tasksConfirmed}
              />
              <p className="text-[10px] text-brand-navy-70 mt-0.5">Due in {t.due_days} days</p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );

  const renderSeComment = () => result && editedComment && (
    <div>
      <SectionHeading
        title="Draft SE Comment"
        subtitle="Prefix uses your initials. Review and copy for Salesforce."
        action={commentCopied
          ? <ConfirmedChip label="Copied" />
          : <button onClick={copyComment} className="px-3 py-1.5 rounded-lg border border-brand-navy-30 text-[11px] font-medium text-brand-navy-70 hover:text-brand-navy hover:border-brand-navy transition-colors">Copy to clipboard</button>
        }
      />
      <textarea
        value={editedComment}
        onChange={e => setEditedComment(e.target.value)}
        rows={3}
        disabled={commentCopied}
        className="w-full px-3 py-2.5 border border-brand-navy-30 rounded-xl text-[13px] text-brand-navy bg-gray-50/80 resize-none focus:outline-none focus:ring-[3px] focus:ring-brand-purple/15 focus:border-brand-purple leading-relaxed disabled:opacity-60"
      />
    </div>
  );

  const renderBlockers = () => result && editedBlockers.length > 0 && (
    <div>
      <SectionHeading
        title={`Technical Blockers (${editedBlockers.filter(b => b.trim()).length})`}
        subtitle="Prepended to the Technical Blockers field on the opportunity."
        action={blockersConfirmed
          ? <ConfirmedChip label="Saved" />
          : <button onClick={confirmBlockers} disabled={busy === 'blockers'} className="px-3 py-1.5 rounded-lg bg-brand-purple text-white text-[11px] font-medium hover:bg-brand-purple-70 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">{busy === 'blockers' ? 'Saving…' : 'Save to opportunity'}</button>
        }
      />
      <div className="space-y-2">
        {editedBlockers.map((b, i) => (
          <div key={i} className="flex items-start gap-3 px-3 py-2.5 border border-status-overdue/25 rounded-xl bg-status-overdue/[0.03]">
            <div className="w-4 h-4 rounded-md bg-status-overdue/12 flex items-center justify-center flex-shrink-0 mt-0.5"><svg className="w-2.5 h-2.5 text-status-overdue" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01"/></svg></div>
            <input
              value={b}
              onChange={e => setEditedBlockers(prev => prev.map((x, j) => j === i ? e.target.value : x))}
              disabled={blockersConfirmed}
              className="flex-1 bg-transparent text-[13px] text-brand-navy outline-none border-none min-w-0 disabled:opacity-60"
            />
          </div>
        ))}
      </div>
    </div>
  );

  const renderNextStep = () => result && editedNextStep && (
    <div>
      <SectionHeading
        title="Suggested Next Step"
        subtitle="Will be flagged as a next-step task on this opportunity."
        action={nextStepConfirmed
          ? <ConfirmedChip label="Created" />
          : <button onClick={confirmNextStep} disabled={busy === 'nextstep' || !editedNextStep.trim()} className="px-3 py-1.5 rounded-lg bg-brand-purple text-white text-[11px] font-medium hover:bg-brand-purple-70 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">{busy === 'nextstep' ? 'Creating…' : 'Create as next-step task'}</button>
        }
      />
      <input
        value={editedNextStep}
        onChange={e => setEditedNextStep(e.target.value)}
        disabled={nextStepConfirmed}
        className="w-full px-3 py-2.5 border border-brand-navy-30 rounded-xl text-[13px] text-brand-navy bg-gray-50/80 focus:outline-none focus:ring-[3px] focus:ring-brand-purple/15 focus:border-brand-purple disabled:opacity-60"
      />
    </div>
  );

  const renderTechDiscovery = () => {
    if (!result) return null;
    const td = result.tech_discovery;
    if (!techDiscoveryHasContent(td, new Set())) return null;
    const stackEntries = Object.entries(td.tech_stack_additions ?? {}).filter(([, items]) => (items ?? []).length > 0);
    const esEntries = Object.entries(td.enterprise_systems_additions ?? {}).filter(([, v]) => v && v.trim());
    const dmgEntries = Object.entries(td.existing_dmg_additions ?? {}).filter(([, v]) => v && v.trim());
    const prose = td.prose_proposals ?? [];
    const totalSignals = stackEntries.reduce((s, [, items]) => s + items.length, 0) + esEntries.length + dmgEntries.length + prose.length;
    return (
      <div>
        <SectionHeading
          title={`Tech Discovery (${totalSignals} signal${totalSignals === 1 ? '' : 's'})`}
          subtitle="Stack chips, enterprise systems, existing DMG tools, and prose proposals. Click to dismiss any item."
          action={techDiscoveryConfirmed
            ? <ConfirmedChip label="Saved" />
            : <button onClick={confirmTechDiscovery} disabled={busy === 'techdiscovery'} className="px-3 py-1.5 rounded-lg bg-brand-purple text-white text-[11px] font-medium hover:bg-brand-purple-70 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">{busy === 'techdiscovery' ? 'Saving…' : 'Apply accepted items'}</button>
          }
        />

        {stackEntries.length > 0 && (
          <div className="mb-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-purple mb-1.5">Technology stack detected</p>
            <div className="flex flex-wrap gap-1.5">
              {stackEntries.flatMap(([cat, items]) =>
                items.map(it => {
                  const key = `stack:${cat}:${it}`;
                  const rejected = techRejects.has(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={techDiscoveryConfirmed}
                      onClick={() => toggleTechReject(key)}
                      className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${rejected ? 'border-brand-navy-30 bg-white text-brand-navy-30 line-through' : 'border-brand-purple/40 bg-brand-purple-30/40 text-brand-purple font-medium'} disabled:opacity-60 disabled:cursor-not-allowed`}
                    >
                      <span className="text-brand-navy-70 font-normal mr-1">{TECH_STACK_CATEGORY_LABELS[cat] ?? cat}</span>
                      {it}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {(esEntries.length + dmgEntries.length) > 0 && (
          <div className="mb-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-purple mb-1.5">Enterprise systems &amp; existing tools</p>
            <div className="flex flex-col gap-1.5">
              {[...esEntries.map(([k, v]) => ({ cat: 'es', label: ENTERPRISE_SYSTEM_LABELS[k] ?? k, k, v })),
                ...dmgEntries.map(([k, v]) => ({ cat: 'dmg', label: DMG_LABELS[k] ?? k, k, v }))].map(({ cat, label, k, v }) => {
                const key = `${cat}:${k}`;
                const rejected = techRejects.has(key);
                return (
                  <div key={key} className={`grid grid-cols-[110px,1fr,auto] items-center gap-2 px-3 py-2 rounded-lg border ${rejected ? 'border-brand-navy-30 bg-white opacity-50' : 'border-brand-navy-30 bg-gray-50/80'}`}>
                    <span className="text-[11px] text-brand-navy-70">{label}</span>
                    <span className={`text-[12px] ${rejected ? 'line-through text-brand-navy-30' : 'text-brand-navy font-medium'}`}>{v}</span>
                    <button
                      type="button"
                      disabled={techDiscoveryConfirmed}
                      onClick={() => toggleTechReject(key)}
                      className="text-[10px] text-brand-navy-70 hover:text-brand-navy disabled:opacity-50"
                    >
                      {rejected ? 'Accept' : 'Dismiss'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {prose.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-purple mb-1.5">Discovery notes proposed</p>
            <div className="flex flex-col gap-2">
              {prose.map(p => {
                const key = `prose:${p.field}`;
                const rejected = techRejects.has(key);
                return (
                  <div key={key} className={`px-3 py-2.5 border rounded-xl ${rejected ? 'border-brand-navy-30/50 bg-white opacity-50' : 'border-brand-navy-30/60 bg-gray-50/80'}`}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-purple">
                        {PROSE_FIELD_LABELS[p.field] ?? p.field}
                        <span className={`ml-2 text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${p.mode === 'replace' ? 'bg-brand-purple-30/60 text-brand-purple' : 'bg-status-info/15 text-[#0088a8]'}`}>{p.mode === 'replace' ? 'new' : 'append'}</span>
                      </p>
                      <button type="button" disabled={techDiscoveryConfirmed} onClick={() => toggleTechReject(key)} className="text-[10px] text-brand-navy-70 hover:text-brand-navy disabled:opacity-50">{rejected ? 'Accept' : 'Dismiss'}</button>
                    </div>
                    {p.mode === 'append' && p.current && (
                      <p className="text-[11px] text-brand-navy-30 italic leading-relaxed mb-1 border-l-2 border-brand-navy-30 pl-2">{p.current}</p>
                    )}
                    <p className={`text-[12px] leading-relaxed ${rejected ? 'line-through text-brand-navy-30' : 'text-brand-navy bg-status-success/10 border-l-2 border-status-success px-2 py-1 rounded-r-lg'}`}>{p.suggested}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderMeddpicc = () => result && result.meddpicc_updates.length > 0 && (
    <div>
      <SectionHeading
        title="MEDDPICC — proposed updates"
        subtitle="Saved as a structured note on the opp. Salesforce is NOT modified."
        action={meddpiccConfirmed
          ? <ConfirmedChip label="Saved as note" />
          : <button onClick={confirmMeddpiccAsNote} disabled={busy === 'meddpicc'} className="px-3 py-1.5 rounded-lg bg-brand-purple text-white text-[11px] font-medium hover:bg-brand-purple-70 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">{busy === 'meddpicc' ? 'Saving…' : 'Save as note'}</button>
        }
      />
      <div className="mb-3 rounded-lg bg-status-info/10 border border-status-info/30 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#0088a8]">Salesforce is not modified</p>
        <p className="text-[11px] text-brand-navy-70 leading-relaxed mt-0.5">MEDDPICC in this app mirrors SF. Accepted proposals are saved as a structured note flagged <em>"Consider updating SF"</em>. The score/pill won't shift until the SF edit is made separately.</p>
      </div>
      <div className="space-y-2">
        {result.meddpicc_updates.map((u, i) => (
          <div key={i} className="px-3 py-2.5 border border-brand-navy-30/50 rounded-xl bg-gray-50/80">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-purple mb-1">{MEDDPICC_LABELS[u.field] ?? u.field}</p>
            {u.current
              ? <p className="text-[11px] text-brand-navy-30 italic line-through leading-relaxed mb-1">{u.current}</p>
              : <p className="text-[11px] text-brand-navy-30 italic mb-1">— not set</p>}
            <p className="text-[12px] text-brand-navy leading-relaxed bg-status-success/10 border-l-2 border-status-success px-2 py-1 rounded-r-lg">{u.suggested}</p>
          </div>
        ))}
      </div>
    </div>
  );

  // Map section key → rendered element (may be null when empty)
  const sectionRenderers: Record<Section, () => React.ReactNode> = {
    tasks: renderTasks,
    se_comment: renderSeComment,
    tech_blockers: renderBlockers,
    tech_discovery: renderTechDiscovery,
    meddpicc: renderMeddpicc,
    next_step: renderNextStep,
  };

  // Compute which requested sections actually have content
  const sectionsWithContent: Section[] = result
    ? sections.filter(s => {
        if (!ALL_SECTIONS.includes(s)) return false;
        if (!result.sections_requested.includes(s)) return false;
        switch (s) {
          case 'tasks':          return result.tasks.length > 0;
          case 'se_comment':     return !!result.se_comment_draft.trim();
          case 'tech_blockers':  return result.tech_blockers.length > 0;
          case 'tech_discovery': return techDiscoveryHasContent(result.tech_discovery, new Set());
          case 'meddpicc':       return result.meddpicc_updates.length > 0;
          case 'next_step':      return !!result.next_step.trim();
        }
      })
    : [];

  const sectionConfirmed: Record<Section, boolean> = {
    tasks: tasksConfirmed || editedTasks.filter(t => t.selected).length === 0,
    se_comment: commentCopied,
    tech_blockers: blockersConfirmed,
    tech_discovery: techDiscoveryConfirmed,
    meddpicc: meddpiccConfirmed,
    next_step: nextStepConfirmed,
  };

  // Tabs view — forced-linear progression. User can click any tab at or
  // before the furthest reached (`maxTabIndex`) for backward review, but must
  // advance through sections one at a time via the "Next section →" button.
  const currentTabIndex = Math.max(0, sectionsWithContent.findIndex(s => s === activeTab));
  const isLastTab = currentTabIndex === sectionsWithContent.length - 1;
  const tabsView = (
    <Card>
      <div className="flex items-center gap-0.5 px-3 pt-3 border-b border-brand-navy-30/50 overflow-x-auto flex-nowrap">
        {sectionsWithContent.map((s, i) => {
          const active = activeTab === s;
          const unlocked = i <= maxTabIndex;
          return (
            <button
              key={s}
              onClick={() => { if (unlocked) setActiveTab(s); }}
              disabled={!unlocked}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-t-lg text-[12px] font-medium whitespace-nowrap transition-colors ${
                active
                  ? 'bg-white text-brand-purple border border-brand-navy-30/50 border-b-0 -mb-px'
                  : unlocked
                    ? 'text-brand-navy-70 hover:text-brand-navy hover:bg-brand-purple-30/10'
                    : 'text-brand-navy-30 cursor-not-allowed'
              }`}
              title={unlocked ? undefined : 'Complete the current section first'}
            >
              {SECTION_LABELS[s]}
              {sectionConfirmed[s]
                ? <svg className="w-3 h-3 text-status-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                : !unlocked
                  ? <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                  : null}
            </button>
          );
        })}
      </div>
      <div className="px-5 py-5">
        {sectionsWithContent.length === 0
          ? <p className="text-[12px] text-brand-navy-70 text-center py-8">Claude didn't find content for any of the selected sections.</p>
          : sectionRenderers[activeTab]()}
      </div>
      <div className="px-5 py-3 bg-[#F5F5F7] border-t border-brand-navy-30/40 flex items-center justify-between">
        <p className="text-[11px] text-brand-navy-70">
          Section {currentTabIndex + 1} of {sectionsWithContent.length}
          {' · '}
          {sectionsWithContent.filter(s => sectionConfirmed[s]).length} confirmed
        </p>
        <div className="flex items-center gap-2">
          <button onClick={backToOpp} className="px-3 py-1.5 rounded-lg border border-brand-navy-30 text-[12px] font-medium text-brand-navy-70 hover:text-brand-navy hover:border-brand-navy transition-colors">Leave</button>
          {!isLastTab
            ? (
              <button
                onClick={() => {
                  const nextIdx = currentTabIndex + 1;
                  const nextSection = sectionsWithContent[nextIdx];
                  if (!nextSection) return;
                  setActiveTab(nextSection);
                  setMaxTabIndex(prev => Math.max(prev, nextIdx));
                }}
                className="px-4 py-1.5 rounded-lg bg-brand-purple text-white text-[12px] font-medium hover:bg-brand-purple-70 transition-colors inline-flex items-center gap-1.5"
              >
                Next section
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
              </button>
            )
            : (
              <button
                onClick={confirmAllAndFinish}
                disabled={busy === 'all'}
                className="px-4 py-1.5 rounded-lg bg-brand-purple text-white text-[12px] font-medium hover:bg-brand-purple-70 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {busy === 'all' ? 'Applying…' : 'Apply all & finish'}
              </button>
            )
          }
        </div>
      </div>
    </Card>
  );

  // Wizard view
  const wizardStepClamped = Math.min(wizardStep, Math.max(0, sectionsWithContent.length - 1));
  const currentWizardSection = sectionsWithContent[wizardStepClamped];
  const wizardView = (
    <Card>
      <div className="flex items-center gap-2 px-5 py-3 border-b border-brand-navy-30/50 flex-wrap">
        {sectionsWithContent.map((s, i) => {
          const active = i === wizardStepClamped;
          const done = i < wizardStepClamped || sectionConfirmed[s];
          return (
            <div key={s} className="flex items-center gap-2">
              <button
                onClick={() => setWizardStep(i)}
                className={`text-[11px] font-medium px-2.5 py-1 rounded-full inline-flex items-center gap-1.5 transition-colors ${active ? 'bg-brand-purple text-white' : done ? 'bg-status-success/15 text-[#009e75]' : 'bg-[#F5F5F7] text-brand-navy-70 hover:text-brand-navy'}`}
              >
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${active ? 'bg-white/25' : done ? 'bg-status-success/25' : 'bg-brand-navy-30 text-white'}`}>{done ? '✓' : i + 1}</span>
                {SECTION_LABELS[s]}
              </button>
              {i < sectionsWithContent.length - 1 && <span className="text-brand-navy-30 text-[11px]">›</span>}
            </div>
          );
        })}
      </div>
      <div className="px-5 py-5 min-h-[200px]">
        {currentWizardSection ? sectionRenderers[currentWizardSection]() : <p className="text-[12px] text-brand-navy-70 text-center py-8">Nothing to review.</p>}
      </div>
      <div className="px-5 py-3 bg-[#F5F5F7] border-t border-brand-navy-30/40 flex items-center justify-between">
        <p className="text-[11px] text-brand-navy-70">Step {wizardStepClamped + 1} of {sectionsWithContent.length}</p>
        <div className="flex items-center gap-2">
          <button onClick={() => setWizardStep(Math.max(0, wizardStepClamped - 1))} disabled={wizardStepClamped === 0} className="px-3 py-1.5 rounded-lg border border-brand-navy-30 text-[12px] font-medium text-brand-navy-70 hover:text-brand-navy hover:border-brand-navy disabled:opacity-40 disabled:cursor-not-allowed transition-colors">← Previous</button>
          {wizardStepClamped < sectionsWithContent.length - 1
            ? <button onClick={() => setWizardStep(wizardStepClamped + 1)} className="px-4 py-1.5 rounded-lg bg-brand-purple text-white text-[12px] font-medium hover:bg-brand-purple-70 transition-colors">Next →</button>
            : <button onClick={confirmAllAndFinish} disabled={busy === 'all'} className="px-4 py-1.5 rounded-lg bg-brand-purple text-white text-[12px] font-medium hover:bg-brand-purple-70 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">{busy === 'all' ? 'Applying…' : 'Apply all & finish'}</button>
          }
        </div>
      </div>
    </Card>
  );

  // Scroll view
  const scrollView = (
    <Card>
      {sectionsWithContent.length === 0 && <p className="text-[12px] text-brand-navy-70 text-center py-8 px-5">Claude didn't find content for any of the selected sections.</p>}
      {sectionsWithContent.map((s, i) => (
        <div key={s} className={`px-5 py-5 ${i < sectionsWithContent.length - 1 ? 'border-b border-brand-navy-30/40' : ''}`}>
          {sectionRenderers[s]()}
        </div>
      ))}
      <div className="px-5 py-3 bg-[#F5F5F7] border-t border-brand-navy-30/40 flex items-center justify-between sticky bottom-0">
        <p className="text-[11px] text-brand-navy-70">{sectionsWithContent.length} section{sectionsWithContent.length === 1 ? '' : 's'} · {sectionsWithContent.filter(s => sectionConfirmed[s]).length} confirmed</p>
        <div className="flex items-center gap-2">
          <button onClick={backToOpp} className="px-3 py-1.5 rounded-lg border border-brand-navy-30 text-[12px] font-medium text-brand-navy-70 hover:text-brand-navy hover:border-brand-navy transition-colors">Leave</button>
          <button onClick={confirmAllAndFinish} disabled={busy === 'all'} className="px-4 py-1.5 rounded-lg bg-brand-purple text-white text-[12px] font-medium hover:bg-brand-purple-70 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">{busy === 'all' ? 'Applying…' : 'Apply all accepted'}</button>
        </div>
      </div>
    </Card>
  );

  // ── Leave guard overlay ──────────────────────────────────────────────────
  const leaveGuard = showLeaveGuard && (
    <div className="fixed inset-0 bg-brand-navy/55 backdrop-blur-[3px] flex items-center justify-center p-6 z-40">
      <div className="max-w-[440px] bg-white rounded-2xl overflow-hidden shadow-2xl">
        <div className="p-6">
          <div className="w-9 h-9 rounded-xl bg-status-warning/20 flex items-center justify-center mb-3">
            <svg className="w-5 h-5 text-status-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>
          </div>
          <h2 className="text-[15px] font-semibold text-brand-navy">Unsaved proposals</h2>
          <p className="text-[12px] text-brand-navy-70 mt-1.5 leading-relaxed">You have AI proposals that haven't been applied yet. Leaving will discard them. {saveRawNotes && <>Your raw notes are already saved on the deal — only the proposals would be lost.</>}</p>
        </div>
        <div className="px-6 py-3 bg-[#F5F5F7] flex items-center justify-end gap-2">
          <button
            onClick={() => {
              const fn = pendingNavRef.current; pendingNavRef.current = null; setShowLeaveGuard(false); if (fn) fn();
            }}
            className="px-3 py-1.5 text-[12px] text-brand-navy-70 hover:text-brand-navy transition-colors"
          >
            Discard &amp; leave
          </button>
          <button
            onClick={async () => {
              setShowLeaveGuard(false);
              pendingNavRef.current = null;
              await confirmAllAndFinish();
            }}
            className="px-3 py-1.5 rounded-lg border border-brand-navy-30 text-[12px] font-medium text-brand-navy-70 hover:text-brand-navy hover:border-brand-navy transition-colors"
          >
            Apply all, then leave
          </button>
          <button
            onClick={() => { pendingNavRef.current = null; setShowLeaveGuard(false); }}
            className="px-4 py-1.5 rounded-lg bg-brand-purple text-white text-[12px] font-medium hover:bg-brand-purple-70 transition-colors"
          >
            Stay &amp; review
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto bg-[#F5F5F7] px-6 py-6">
      <div className="max-w-[1160px] mx-auto">
        {header}
        {phase === 'configure' && configureView}
        {phase === 'processing' && processingView}
        {phase === 'results' && (viewMode === 'tabs' ? tabsView : viewMode === 'wizard' ? wizardView : scrollView)}
        {phase === 'success' && successView}
      </div>
      {leaveGuard}
      {/* Viewer-role hint: we're operating with the user's own name for initials. */}
      {!user && phase === 'configure' && (
        <p className="hidden">{/* no-op — keeps useAuthStore used */}</p>
      )}
    </div>
  );
}

// ── Small helpers used in JSX but hoisted ───────────────────────────────────

function techDiscoveryHasContent(td: TechDiscoveryProposals | undefined, techRejects: Set<string>): boolean {
  if (!td) return false;
  const stackAny = Object.entries(td.tech_stack_additions ?? {}).some(([cat, items]) =>
    (items ?? []).some(it => !techRejects.has(`stack:${cat}:${it}`))
  );
  const esAny = Object.entries(td.enterprise_systems_additions ?? {}).some(([k, v]) => v && v.trim() && !techRejects.has(`es:${k}`));
  const dmgAny = Object.entries(td.existing_dmg_additions ?? {}).some(([k, v]) => v && v.trim() && !techRejects.has(`dmg:${k}`));
  const proseAny = (td.prose_proposals ?? []).some(p => !techRejects.has(`prose:${p.field}`));
  return stackAny || esAny || dmgAny || proseAny;
}
