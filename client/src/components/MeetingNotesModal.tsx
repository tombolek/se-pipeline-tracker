import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { Opportunity } from '../types';
import api from '../api/client';
import { createTask } from '../api/tasks';
import { createNote } from '../api/notes';
import type { ApiResponse } from '../types';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ProcessResult {
  saved_note_id: number | null;
  tasks: Array<{ title: string; due_days: number }>;
  meddpicc_updates: Array<{ field: string; current: string; suggested: string }>;
  se_comment_draft: string;
  tech_blockers: string[];
  next_step: string;
}

interface Props {
  opp: Opportunity;
  onClose: () => void;
  onRefresh: () => void;
}

const MEDDPICC_LABELS: Record<string, string> = {
  metrics: 'Metrics', economic_buyer: 'Economic Buyer', decision_criteria: 'Decision Criteria',
  decision_process: 'Decision Process', paper_process: 'Paper Process',
  implicate_pain: 'Implicate the Pain', champion: 'Champion',
  engaged_competitors: 'Competitors', budget: 'Budget', authority: 'Authority',
  need: 'Need', timeline: 'Timeline', agentic_qual: 'Agentic Qual',
};

function dueDateStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StepDots({ step }: { step: 'input' | 'processing' | 'results' }) {
  return (
    <div className="flex items-center gap-1.5 px-6 pt-2">
      {(['input', 'processing', 'results'] as const).map((s, i) => {
        const isDone = (step === 'processing' && i === 0) || (step === 'results' && i <= 1);
        const isActive = step === s;
        return (
          <div key={s} className={`h-1.5 rounded-full transition-all ${
            isDone    ? 'w-1.5 bg-status-success' :
            isActive  ? 'w-4 bg-brand-purple' :
                        'w-1.5 bg-brand-navy-30'
          }`} />
        );
      })}
    </div>
  );
}

function SectionHeader({
  icon, label, count, action,
}: { icon: React.ReactNode; label: string; count?: number; action: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-6 py-3">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-brand-navy">
        {icon}
        {label}
        {count !== undefined && (
          <span className="text-[10px] font-medium px-1.5 py-px rounded-full bg-brand-navy-30/40 text-brand-navy-70">{count}</span>
        )}
      </div>
      <div className="flex items-center gap-2">{action}</div>
    </div>
  );
}

function ConfirmedBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-status-success">
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
      {label}
    </span>
  );
}

function ActionBtn({
  onClick, disabled, children,
}: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-brand-navy-30 text-brand-navy-70 text-[11px] font-medium hover:border-brand-navy hover:text-brand-navy transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function MeetingNotesModal({ opp, onClose, onRefresh }: Props) {
  const [step, setStep] = useState<'input' | 'processing' | 'results'>('input');
  const [sourceUrl, setSourceUrl] = useState('');
  const [rawNotes, setRawNotes] = useState('');
  const [processError, setProcessError] = useState<string | null>(null);
  const [result, setResult] = useState<ProcessResult | null>(null);

  // Editable result fields
  const [editedTasks, setEditedTasks] = useState<Array<{ title: string; due_days: number; selected: boolean }>>([]);
  const [editedComment, setEditedComment] = useState('');
  const [editedBlockers, setEditedBlockers] = useState<string[]>([]);
  const [editedNextStep, setEditedNextStep] = useState('');

  // Confirmation state per section
  const [tasksConfirmed, setTasksConfirmed] = useState(false);
  const [meddpiccConfirmed, setMeddpiccConfirmed] = useState(false);
  const [commentCopied, setCommentCopied] = useState(false);
  const [blockersConfirmed, setBlockersConfirmed] = useState(false);
  const [nextStepConfirmed, setNextStepConfirmed] = useState(false);

  // Loading per section
  const [busySection, setBusySection] = useState<string | null>(null);

  const notesRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Focus notes textarea on mount
  useEffect(() => { notesRef.current?.focus(); }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Populate editable fields when result arrives
  useEffect(() => {
    if (!result) return;
    setEditedTasks(result.tasks.map(t => ({ ...t, selected: true })));
    setEditedComment(result.se_comment_draft);
    setEditedBlockers(result.tech_blockers);
    setEditedNextStep(result.next_step);
    // Scroll modal to top on results
    setTimeout(() => { scrollRef.current?.scrollTo({ top: 0 }); }, 50);
  }, [result]);

  async function handleProcess() {
    if (!rawNotes.trim()) return;
    setStep('processing');
    setProcessError(null);
    try {
      const { data } = await api.post<ApiResponse<ProcessResult>>(
        `/opportunities/${opp.id}/process-notes`,
        { raw_notes: rawNotes.trim(), source_url: sourceUrl.trim() || undefined },
      );
      setResult(data.data);
      setStep('results');
      onRefresh(); // note was auto-saved server-side
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to process notes — please try again.';
      setProcessError(msg);
      setStep('input');
    }
  }

  async function handleConfirmTasks() {
    const selected = editedTasks.filter(t => t.selected);
    if (selected.length === 0) return;
    setBusySection('tasks');
    try {
      await Promise.all(selected.map(t =>
        createTask(opp.id, { title: t.title.trim(), due_date: dueDateStr(t.due_days) })
      ));
      setTasksConfirmed(true);
      onRefresh();
    } finally { setBusySection(null); }
  }

  async function handleConfirmMeddpicc() {
    if (!result || result.meddpicc_updates.length === 0) return;
    setBusySection('meddpicc');
    try {
      // 1. PATCH the actual fields so MEDDPICC bar updates immediately
      const patch: Record<string, string> = {};
      result.meddpicc_updates.forEach(u => { patch[u.field] = u.suggested; });
      await api.patch(`/opportunities/${opp.id}/fields`, patch);

      // 2. Save a structured note as a permanent record
      const lines = result.meddpicc_updates.map(
        u => `${MEDDPICC_LABELS[u.field] ?? u.field}: ${u.suggested}`
      ).join('\n');
      await createNote(opp.id, `📋 MEDDPICC update from call\n\n${lines}`);

      setMeddpiccConfirmed(true);
      onRefresh();
    } finally { setBusySection(null); }
  }

  async function handleCopyComment() {
    try { await navigator.clipboard.writeText(editedComment); } catch { /* ignore */ }
    setCommentCopied(true);
  }

  async function handleConfirmBlockers() {
    const text = editedBlockers.filter(b => b.trim()).join('\n');
    if (!text) return;
    setBusySection('blockers');
    try {
      // Append to existing technical_blockers (prepend new items)
      const existing = opp.technical_blockers?.trim() ?? '';
      const combined = existing ? `${text}\n\n${existing}` : text;
      await api.patch(`/opportunities/${opp.id}/fields`, { technical_blockers: combined });
      setBlockersConfirmed(true);
      onRefresh();
    } finally { setBusySection(null); }
  }

  async function handleConfirmNextStep() {
    if (!editedNextStep.trim()) return;
    setBusySection('nextstep');
    try {
      await createTask(opp.id, {
        title: editedNextStep.trim(),
        is_next_step: true,
        due_date: dueDateStr(3),
      });
      setNextStepConfirmed(true);
      onRefresh();
    } finally { setBusySection(null); }
  }

  async function handleConfirmAll() {
    const work: Array<() => Promise<void>> = [];
    if (!tasksConfirmed && editedTasks.some(t => t.selected)) work.push(handleConfirmTasks);
    if (!meddpiccConfirmed && result?.meddpicc_updates.length) work.push(handleConfirmMeddpicc);
    if (!commentCopied) work.push(handleCopyComment);
    if (!blockersConfirmed && editedBlockers.some(b => b.trim())) work.push(handleConfirmBlockers);
    if (!nextStepConfirmed && editedNextStep.trim()) work.push(handleConfirmNextStep);
    setBusySection('all');
    try { await Promise.all(work.map(fn => fn())); } finally { setBusySection(null); onClose(); }
  }

  const allConfirmed =
    (tasksConfirmed    || editedTasks.length === 0) &&
    (meddpiccConfirmed || !result?.meddpicc_updates.length) &&
    (commentCopied     || !editedComment) &&
    (blockersConfirmed || editedBlockers.length === 0) &&
    (nextStepConfirmed || !editedNextStep);

  // ── Render ──────────────────────────────────────────────────────────────────
  // Rendered via portal so that `position:fixed` escapes the Drawer's CSS
  // transform stacking context (translate-x-* on the Drawer panel would
  // otherwise constrain fixed descendants to the drawer's bounds).

  return createPortal(
    <div
      className="fixed inset-0 bg-brand-navy/40 backdrop-blur-[3px] flex items-start justify-center p-8 z-50 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[680px] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-brand-navy-30/40">
          <div>
            <h2 className="text-[15px] font-semibold text-brand-navy">Process Call Notes</h2>
            <p className="text-[12px] text-brand-navy-70 mt-0.5">{opp.name} · {opp.account_name}</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-brand-navy-30/25 hover:bg-brand-navy-30/50 text-brand-navy-70 transition-colors flex-shrink-0"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <StepDots step={step} />

        {/* ── Input state ── */}
        {step === 'input' && (
          <>
            <div className="px-6 py-4 flex flex-col gap-4" ref={scrollRef}>
              {/* Source URL */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-widest text-brand-navy-70 mb-1.5">
                  Meeting notes source <span className="text-brand-navy-30 font-normal normal-case tracking-normal">optional</span>
                </label>
                <div className="relative">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-brand-navy-30 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  <input
                    type="url"
                    value={sourceUrl}
                    onChange={e => setSourceUrl(e.target.value)}
                    placeholder="Notion page, Slack canvas, recording transcript URL…"
                    className="w-full pl-8 pr-3 py-2 border border-brand-navy-30 rounded-lg text-[13px] text-brand-navy placeholder:text-brand-navy-30 focus:outline-none focus:ring-[3px] focus:ring-brand-purple/15 focus:border-brand-purple"
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-brand-navy-30">Saved alongside the auto-captured note · Notion · Slack canvas · Any URL</p>
              </div>

              <div className="h-px bg-brand-navy-30/30" />

              {/* Raw notes */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-widest text-brand-navy-70 mb-1.5">
                  Raw call notes
                </label>
                <textarea
                  ref={notesRef}
                  value={rawNotes}
                  onChange={e => setRawNotes(e.target.value)}
                  placeholder="Paste rough notes, bullet points, or transcript snippets from the call…"
                  rows={9}
                  className="w-full px-3 py-2.5 border border-brand-navy-30 rounded-lg text-[13px] text-brand-navy placeholder:text-brand-navy-30 resize-y focus:outline-none focus:ring-[3px] focus:ring-brand-purple/15 focus:border-brand-purple leading-relaxed"
                />
              </div>

              {processError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-2.5">
                  <svg className="w-4 h-4 text-status-overdue flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <div>
                    <p className="text-[12px] font-semibold text-red-700">Processing failed</p>
                    <p className="text-[12px] text-red-600 mt-0.5">{processError}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-6 py-3 border-t border-brand-navy-30/40 bg-white">
              <p className="text-[11px] text-brand-navy-30">Claude extracts tasks · MEDDPICC · SE comment · blockers · next step</p>
              <div className="flex items-center gap-2">
                <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-brand-navy-30 text-[12px] font-medium text-brand-navy-70 hover:text-brand-navy hover:border-brand-navy transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleProcess}
                  disabled={!rawNotes.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-purple text-white text-[12px] font-medium hover:bg-brand-purple-70 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Process with Claude
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Processing state ── */}
        {step === 'processing' && (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <div className="w-8 h-8 rounded-full border-[3px] border-brand-purple-30 border-t-brand-purple animate-spin" />
            <p className="text-[13px] font-medium text-brand-navy-70">Claude is reading your notes…</p>
            <p className="text-[11px] text-brand-navy-30">Extracting tasks · MEDDPICC · SE comment · Tech blockers · Next step</p>
          </div>
        )}

        {/* ── Results state ── */}
        {step === 'results' && result && (
          <div className="flex flex-col max-h-[78vh] overflow-y-auto" ref={scrollRef}>

            {/* Auto-saved banner */}
            <div className="mx-6 mt-4 mb-1 px-3.5 py-2.5 bg-status-success/8 border border-status-success/25 rounded-xl flex items-start gap-2.5">
              <svg className="w-4 h-4 text-status-success flex-shrink-0 mt-px" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-[12px]">
                <span className="font-semibold text-[#009e75]">Raw notes auto-saved as a note on this opportunity</span>
                {sourceUrl && (
                  <div className="flex items-center gap-1 mt-0.5 text-brand-navy-70">
                    <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    Source: <a href={sourceUrl} target="_blank" rel="noreferrer" className="text-brand-purple hover:underline ml-0.5 truncate max-w-[340px] inline-block align-bottom">{sourceUrl}</a>
                  </div>
                )}
              </div>
            </div>

            {/* ── 1. Extracted Tasks ── */}
            {editedTasks.length > 0 && (
              <div className="border-b border-brand-navy-30/35 mt-2">
                <SectionHeader
                  icon={<div className="w-6 h-6 rounded-lg bg-status-success/15 flex items-center justify-center"><svg className="w-3.5 h-3.5 text-[#009e75]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>}
                  label="Extracted Tasks" count={editedTasks.length}
                  action={tasksConfirmed
                    ? <ConfirmedBadge label={`${editedTasks.filter(t => t.selected).length} task${editedTasks.filter(t => t.selected).length !== 1 ? 's' : ''} added`} />
                    : <ActionBtn onClick={handleConfirmTasks} disabled={busySection === 'tasks' || !editedTasks.some(t => t.selected)}>
                        {busySection === 'tasks' ? 'Adding…' : 'Add selected to opportunity'}
                      </ActionBtn>
                  }
                />
                <div className="px-6 pb-3 flex flex-col gap-2">
                  {editedTasks.map((t, i) => (
                    <div key={i} className={`flex items-start gap-2.5 px-3 py-2.5 border rounded-xl transition-colors ${t.selected ? 'border-brand-navy-30 bg-gray-50/80' : 'border-brand-navy-30/40 bg-white opacity-50'}`}>
                      <input type="checkbox" checked={t.selected} onChange={e => setEditedTasks(prev => prev.map((x, j) => j === i ? { ...x, selected: e.target.checked } : x))}
                        className="mt-0.5 accent-brand-purple cursor-pointer flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <input
                          value={t.title}
                          onChange={e => setEditedTasks(prev => prev.map((x, j) => j === i ? { ...x, title: e.target.value } : x))}
                          className="w-full bg-transparent text-[13px] font-medium text-brand-navy outline-none border-none"
                          disabled={tasksConfirmed}
                        />
                        <p className="text-[10px] text-brand-navy-70 mt-0.5">Due in {t.due_days} days</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── 2. MEDDPICC Updates ── */}
            {result.meddpicc_updates.length > 0 && (
              <div className="border-b border-brand-navy-30/35">
                <SectionHeader
                  icon={<div className="w-6 h-6 rounded-lg bg-brand-purple/10 flex items-center justify-center"><svg className="w-3.5 h-3.5 text-brand-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg></div>}
                  label="MEDDPICC Updates" count={result.meddpicc_updates.length}
                  action={meddpiccConfirmed
                    ? <ConfirmedBadge label="Saved" />
                    : <ActionBtn onClick={handleConfirmMeddpicc} disabled={busySection === 'meddpicc'}>
                        {busySection === 'meddpicc' ? 'Saving…' : 'Apply to opportunity'}
                      </ActionBtn>
                  }
                />
                <div className="px-6 pb-3 flex flex-col gap-2">
                  {result.meddpicc_updates.map((u, i) => (
                    <div key={i} className="px-3 py-2.5 border border-brand-navy-30/50 rounded-xl bg-gray-50/80">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-purple mb-1.5">{MEDDPICC_LABELS[u.field] ?? u.field}</p>
                      {u.current ? <p className="text-[12px] text-brand-navy-30 line-through leading-relaxed mb-1">{u.current}</p>
                        : <p className="text-[11px] text-brand-navy-30 italic mb-1">— not set</p>}
                      <p className="text-[12px] text-brand-navy leading-relaxed bg-status-success/10 border-l-2 border-status-success px-2 py-1 rounded-r-lg">{u.suggested}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── 3. Draft SE Comment ── */}
            {editedComment && (
              <div className="border-b border-brand-navy-30/35">
                <SectionHeader
                  icon={<div className="w-6 h-6 rounded-lg bg-status-warning/15 flex items-center justify-center"><svg className="w-3.5 h-3.5 text-[#b87800]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"/></svg></div>}
                  label="Draft SE Comment"
                  action={commentCopied
                    ? <ConfirmedBadge label="Copied" />
                    : <ActionBtn onClick={handleCopyComment}>
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2"/><path strokeLinecap="round" strokeLinejoin="round" d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                        Copy to clipboard
                      </ActionBtn>
                  }
                />
                <div className="px-6 pb-3">
                  <textarea
                    value={editedComment}
                    onChange={e => setEditedComment(e.target.value)}
                    rows={3}
                    disabled={commentCopied}
                    className="w-full px-3 py-2.5 border border-brand-navy-30 rounded-xl text-[13px] text-brand-navy bg-gray-50/80 resize-none focus:outline-none focus:ring-[3px] focus:ring-brand-purple/15 focus:border-brand-purple leading-relaxed disabled:opacity-60"
                  />
                  <p className="mt-1.5 text-[11px] text-brand-navy-30">Paste directly into Salesforce SE Comments</p>
                </div>
              </div>
            )}

            {/* ── 4. Technical Blockers ── */}
            {editedBlockers.length > 0 && (
              <div className="border-b border-brand-navy-30/35">
                <SectionHeader
                  icon={<div className="w-6 h-6 rounded-lg bg-status-overdue/10 flex items-center justify-center"><svg className="w-3.5 h-3.5 text-status-overdue" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg></div>}
                  label="Technical Blockers / Risks" count={editedBlockers.length}
                  action={blockersConfirmed
                    ? <ConfirmedBadge label="Saved to opportunity" />
                    : <ActionBtn onClick={handleConfirmBlockers} disabled={busySection === 'blockers'}>
                        {busySection === 'blockers' ? 'Saving…' : 'Save to opportunity'}
                      </ActionBtn>
                  }
                />
                <div className="px-6 pb-3 flex flex-col gap-2">
                  {editedBlockers.map((b, i) => (
                    <div key={i} className="flex items-start gap-2.5 px-3 py-2.5 border border-status-overdue/20 rounded-xl bg-status-overdue/[0.03]">
                      <div className="w-4 h-4 rounded-md bg-status-overdue/12 flex items-center justify-center flex-shrink-0 mt-px">
                        <svg className="w-2.5 h-2.5 text-status-overdue" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01" />
                        </svg>
                      </div>
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
            )}

            {/* ── 5. Suggested Next Step ── */}
            {editedNextStep && (
              <div>
                <SectionHeader
                  icon={<div className="w-6 h-6 rounded-lg bg-status-info/12 flex items-center justify-center"><svg className="w-3.5 h-3.5 text-[#0088a8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg></div>}
                  label="Suggested Next Step"
                  action={nextStepConfirmed
                    ? <ConfirmedBadge label="Task created" />
                    : <ActionBtn onClick={handleConfirmNextStep} disabled={busySection === 'nextstep' || !editedNextStep.trim()}>
                        {busySection === 'nextstep' ? 'Creating…' : 'Create as next step task'}
                      </ActionBtn>
                  }
                />
                <div className="px-6 pb-3">
                  <input
                    value={editedNextStep}
                    onChange={e => setEditedNextStep(e.target.value)}
                    disabled={nextStepConfirmed}
                    className="w-full px-3 py-2.5 border border-brand-navy-30 rounded-xl text-[13px] text-brand-navy bg-gray-50/80 focus:outline-none focus:ring-[3px] focus:ring-brand-purple/15 focus:border-brand-purple disabled:opacity-60"
                  />
                  <p className="mt-1.5 text-[11px] text-brand-navy-30">Will be flagged as a next step task on this opportunity</p>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-3 border-t border-brand-navy-30/40 bg-white sticky bottom-0">
              <p className="text-[11px] text-brand-navy-30">
                Notes + source link saved · <button onClick={onClose} className="text-brand-purple hover:underline">View in notes tab</button>
              </p>
              <div className="flex items-center gap-2">
                <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-brand-navy-30 text-[12px] font-medium text-brand-navy-70 hover:text-brand-navy hover:border-brand-navy transition-colors">
                  Done
                </button>
                {!allConfirmed && (
                  <button
                    onClick={handleConfirmAll}
                    disabled={busySection === 'all'}
                    className="px-3 py-1.5 rounded-lg bg-brand-purple text-white text-[12px] font-medium hover:bg-brand-purple-70 disabled:opacity-40 transition-colors"
                  >
                    {busySection === 'all' ? 'Applying…' : 'Confirm all & close'}
                  </button>
                )}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
