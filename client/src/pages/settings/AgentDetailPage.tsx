/**
 * Agent detail — admin fine-tuning.
 *
 * Layout:
 *   Header with enable/disable + log-IO toggle and model/max-tokens knobs
 *   System-prompt-extra editor (the admin-authored guidance appended to the
 *     ground-rules system prompt) — saving creates a new version row
 *   Tabs: Recent jobs / Version history / 30-day usage
 *
 * The feature's main prompt template lives in code (routes/*.ts) and is not
 * editable here. What IS editable: extra system-level instructions that
 * layer on top of that template.
 */
import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  getAgent, updateAgent, listAgentVersions, getAgentUsage, killAiJob, previewAgentTemplate,
  type Agent, type AgentJob, type AgentPromptVersion, type AgentDailyUsage,
} from '../../api/agents';
import { formatDateTime } from '../../utils/formatters';

const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString();

function StatusPill({ status }: { status: AgentJob['status'] }) {
  const cls = {
    done:    'bg-emerald-50 dark:bg-status-d-success-soft text-status-success dark:text-status-d-success',
    running: 'bg-amber-50 dark:bg-status-d-warning-soft text-status-warning dark:text-status-d-warning',
    failed:  'bg-red-50 dark:bg-status-d-overdue-soft text-status-overdue dark:text-status-d-overdue',
    killed:  'bg-brand-navy-30/60 text-brand-navy dark:bg-ink-2 dark:text-fg-2',
  }[status];
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${cls}`}>{status}</span>;
}

export default function AgentDetailPage() {
  const { id } = useParams();
  const agentId = Number(id);
  const navigate = useNavigate();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [jobs, setJobs] = useState<AgentJob[]>([]);
  const [versions, setVersions] = useState<AgentPromptVersion[]>([]);
  const [usage, setUsage] = useState<AgentDailyUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editedExtra, setEditedExtra] = useState('');
  const [editedTemplate, setEditedTemplate] = useState('');
  const [editedModel, setEditedModel] = useState('');
  const [editedMaxTokens, setEditedMaxTokens] = useState<number>(800);
  const [editedEnabled, setEditedEnabled] = useState(true);
  const [editedLogIO, setEditedLogIO] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState<'jobs' | 'versions' | 'usage'>('jobs');
  const [previewOpen, setPreviewOpen] = useState(false);

  async function refresh() {
    const [{ agent, recent_jobs }, vs, us] = await Promise.all([
      getAgent(agentId),
      listAgentVersions(agentId),
      getAgentUsage(agentId),
    ]);
    setAgent(agent);
    setJobs(recent_jobs);
    setVersions(vs);
    setUsage(us);
    // Seed the editor from the freshly-loaded agent
    setEditedExtra(agent.system_prompt_extra);
    setEditedTemplate(agent.prompt_template ?? '');
    setEditedModel(agent.default_model);
    setEditedMaxTokens(agent.default_max_tokens);
    setEditedEnabled(agent.is_enabled);
    setEditedLogIO(agent.log_io);
  }

  useEffect(() => {
    if (!Number.isFinite(agentId)) { navigate('/settings/agents'); return; }
    setLoading(true);
    refresh()
      .catch(e => setError((e as Error).message || 'Failed to load agent'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  const dirty =
    !!agent && (
      editedExtra       !== agent.system_prompt_extra ||
      editedTemplate    !== (agent.prompt_template ?? '') ||
      editedModel       !== agent.default_model ||
      editedMaxTokens   !== agent.default_max_tokens ||
      editedEnabled     !== agent.is_enabled ||
      editedLogIO       !== agent.log_io
    );

  async function save() {
    if (!agent) return;
    // Explicit confirm before saving an empty template — the agent's next call
    // will throw AgentPromptMissingError. Accidentally blanking the editor is a
    // very easy mistake (Ctrl-A, Delete) and silent at save time otherwise.
    if (editedTemplate.trim() === '') {
      const ok = confirm(
        `The prompt template is empty. Saving will break this agent: the next call to "${agent.feature}" will throw AgentPromptMissingError until a template is restored.\n\nContinue anyway?`
      );
      if (!ok) return;
    }
    setSaving(true); setSaveError(null);
    try {
      await updateAgent(agent.id, {
        default_model: editedModel,
        default_max_tokens: editedMaxTokens,
        is_enabled: editedEnabled,
        log_io: editedLogIO,
        system_prompt_extra: editedExtra,
        prompt_template: editedTemplate,
        note: note.trim() || null,
      });
      setNote('');
      await refresh();
      setToast('Saved. New version recorded.');
      setTimeout(() => setToast(null), 2500);
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? (e as Error).message ?? 'Save failed';
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function kill(jobId: number) {
    if (!confirm(`Kill job #${jobId}? This aborts the in-flight request to Anthropic.`)) return;
    try {
      await killAiJob(jobId);
      await refresh();
    } catch (e) {
      alert((e as Error).message || 'Failed to kill job');
    }
  }

  if (loading) return <p className="text-sm text-brand-navy-70 dark:text-fg-2">Loading…</p>;
  if (error || !agent) return <p className="text-sm text-status-overdue dark:text-status-d-overdue">{error ?? 'Not found'}</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/settings/agents" className="text-[12px] text-brand-navy-70 dark:text-fg-2 hover:text-brand-navy dark:hover:text-fg-1">← All agents</Link>
        <h1 className="mt-2 text-2xl font-semibold text-brand-navy dark:text-fg-1">{agent.name}</h1>
        <p className="text-sm text-brand-navy-70 dark:text-fg-2">{agent.description}</p>
        <p className="mt-1 text-[11px] font-mono text-brand-navy-70 dark:text-fg-2">feature: {agent.feature}</p>
      </div>

      {/* Settings card */}
      <section className="bg-white dark:bg-ink-1 rounded-xl shadow-sm border border-brand-navy-30/40 dark:border-ink-border-soft p-5 space-y-4">
        <h2 className="text-sm font-semibold text-brand-navy dark:text-fg-1">Settings</h2>

        <div className="grid grid-cols-4 gap-4">
          <label className="text-xs text-brand-navy-70 dark:text-fg-2 col-span-2">
            Model
            <input
              value={editedModel}
              onChange={e => setEditedModel(e.target.value)}
              className="mt-1 w-full rounded border border-brand-navy-30/60 dark:border-ink-border-soft bg-white dark:bg-ink-0 px-2 py-1.5 text-sm text-brand-navy dark:text-fg-1"
            />
          </label>
          <label className="text-xs text-brand-navy-70 dark:text-fg-2">
            Max tokens
            <input
              type="number"
              value={editedMaxTokens}
              onChange={e => setEditedMaxTokens(Number(e.target.value))}
              min={100}
              max={16000}
              className="mt-1 w-full rounded border border-brand-navy-30/60 dark:border-ink-border-soft bg-white dark:bg-ink-0 px-2 py-1.5 text-sm text-brand-navy dark:text-fg-1"
            />
          </label>
          <div className="flex flex-col gap-2 text-xs text-brand-navy-70 dark:text-fg-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={editedEnabled} onChange={e => setEditedEnabled(e.target.checked)} />
              Enabled
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={editedLogIO} onChange={e => setEditedLogIO(e.target.checked)} />
              Log prompts & responses
            </label>
          </div>
        </div>

        <div>
          <label className="text-xs text-brand-navy-70 dark:text-fg-2">
            Extra system instructions
            <span className="ml-2 font-normal text-brand-navy-70/80 dark:text-fg-3">
              — appended to the shared ground-rules prompt for every call to this agent.
            </span>
          </label>
          <textarea
            value={editedExtra}
            onChange={e => setEditedExtra(e.target.value)}
            rows={6}
            placeholder="e.g. Prefer bullet points. Only mention competitive intel if explicitly present in the sources."
            className="mt-1 w-full rounded border border-brand-navy-30/60 dark:border-ink-border-soft bg-white dark:bg-ink-0 px-2 py-2 text-sm font-mono text-brand-navy dark:text-fg-1"
          />
        </div>

        <div>
          <label className="text-xs text-brand-navy-70 dark:text-fg-2">
            Prompt template
            <span className="ml-2 font-normal text-brand-navy-70/80 dark:text-fg-3">
              — Handlebars template. <code className="text-[11px]">{'{{var}}'}</code> pulls from the vars built by the feature's route handler; <code className="text-[11px]">{'{{#if}}'}</code>/<code className="text-[11px]">{'{{#each}}'}</code> work too. Renames a var and the call breaks — check version history before shipping.
            </span>
          </label>
          <textarea
            value={editedTemplate}
            onChange={e => setEditedTemplate(e.target.value)}
            rows={18}
            spellCheck={false}
            placeholder="Blank means this agent has no template — its route will throw AgentPromptMissingError. Seed it from agentTemplates.ts via a restart."
            className="mt-1 w-full rounded border border-brand-navy-30/60 dark:border-ink-border-soft bg-white dark:bg-ink-0 px-2 py-2 text-[12px] font-mono leading-relaxed text-brand-navy dark:text-fg-1"
          />
          <div className="mt-1 flex items-center gap-3">
            <p className="text-[11px] text-brand-navy-70 dark:text-fg-2">
              Length: {editedTemplate.length.toLocaleString()} chars. Changes save as a new version — revert via the Version history tab.
            </p>
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="ml-auto text-[12px] px-2 py-1 rounded border border-brand-navy-30/60 dark:border-ink-border-soft text-brand-navy dark:text-fg-1 hover:bg-brand-navy-30/20 dark:hover:bg-ink-2"
              title="Render this template against sample vars without calling Anthropic"
            >
              Preview rendered output
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Optional note — why this change? (shown in version history)"
            className="flex-1 rounded border border-brand-navy-30/60 dark:border-ink-border-soft bg-white dark:bg-ink-0 px-2 py-1.5 text-sm text-brand-navy dark:text-fg-1"
          />
          <button
            onClick={save}
            disabled={!dirty || saving}
            className={`px-3 py-1.5 rounded text-sm font-medium ${
              dirty && !saving
                ? 'bg-brand-purple text-white hover:bg-brand-purple-70'
                : 'bg-brand-navy-30/60 text-brand-navy-70 dark:bg-ink-2 dark:text-fg-3 cursor-not-allowed'
            }`}
          >
            {saving ? 'Saving…' : 'Save (creates new version)'}
          </button>
        </div>
        {saveError && <p className="text-xs text-status-overdue dark:text-status-d-overdue">{saveError}</p>}
        {toast && <p className="text-xs text-status-success dark:text-status-d-success">{toast}</p>}
      </section>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-brand-navy-30/40 dark:border-ink-border-soft">
        {(['jobs', 'versions', 'usage'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium capitalize ${
              tab === t
                ? 'text-brand-navy dark:text-fg-1 border-b-2 border-brand-purple'
                : 'text-brand-navy-70 dark:text-fg-2 hover:text-brand-navy dark:hover:text-fg-1'
            }`}
          >
            {t === 'jobs' ? 'Recent jobs' : t === 'versions' ? 'Version history' : '30-day usage'}
          </button>
        ))}
      </div>

      {tab === 'jobs' && (
        <div className="bg-white dark:bg-ink-1 rounded-xl shadow-sm border border-brand-navy-30/40 dark:border-ink-border-soft overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-brand-navy-30/20 dark:bg-ink-2 text-[11px] uppercase tracking-wider text-brand-navy-70 dark:text-fg-2">
              <tr>
                <th className="text-left px-4 py-2">ID</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">Started</th>
                <th className="text-right px-4 py-2">Duration</th>
                <th className="text-right px-4 py-2">In / Out</th>
                <th className="text-left px-4 py-2">User</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-navy-30/30 dark:divide-ink-border-soft">
              {jobs.map(j => (
                <tr key={j.id} className="hover:bg-brand-navy-30/10 dark:hover:bg-ink-2">
                  <td className="px-4 py-2">
                    <Link to={`/settings/ai-jobs/${j.id}`} className="text-brand-purple hover:underline font-mono text-[12px]">#{j.id}</Link>
                  </td>
                  <td className="px-4 py-2"><StatusPill status={j.status} /></td>
                  <td className="px-4 py-2 text-[12px] text-brand-navy-70 dark:text-fg-2">{formatDateTime(j.started_at)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-[12px] text-brand-navy-70 dark:text-fg-2">
                    {j.duration_ms != null ? `${(j.duration_ms / 1000).toFixed(1)}s` : '—'}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-[12px] text-brand-navy-70 dark:text-fg-2">
                    {fmt(j.input_tokens)} / {fmt(j.output_tokens)}
                  </td>
                  <td className="px-4 py-2 text-[12px] text-brand-navy-70 dark:text-fg-2">{j.started_by_name ?? '—'}</td>
                  <td className="px-4 py-2 text-right">
                    {j.status === 'running' && (
                      <button
                        onClick={() => kill(j.id)}
                        className="text-[12px] text-status-overdue dark:text-status-d-overdue hover:underline"
                      >Kill</button>
                    )}
                  </td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-brand-navy-70 dark:text-fg-2">No jobs yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'versions' && (
        <div className="bg-white dark:bg-ink-1 rounded-xl shadow-sm border border-brand-navy-30/40 dark:border-ink-border-soft p-4 space-y-3">
          {versions.map(v => (
            <div key={v.id} className="border-b border-brand-navy-30/30 dark:border-ink-border-soft pb-3 last:border-0 last:pb-0">
              <div className="flex items-center justify-between text-[12px] text-brand-navy-70 dark:text-fg-2">
                <span>{formatDateTime(v.created_at)} · {v.created_by_name ?? 'system'}</span>
                <span className="font-mono">#{v.id}</span>
              </div>
              {v.note && <p className="text-sm text-brand-navy dark:text-fg-1 mt-1">{v.note}</p>}
              <div className="mt-1 flex gap-3 text-[11px] text-brand-navy-70 dark:text-fg-2">
                <span>model: <span className="font-mono">{v.default_model}</span></span>
                <span>max_tokens: <span className="font-mono">{v.default_max_tokens}</span></span>
                <span>enabled: <span className="font-mono">{String(v.is_enabled)}</span></span>
                <span>log_io: <span className="font-mono">{String(v.log_io)}</span></span>
              </div>
              {v.system_prompt_extra && (
                <details className="mt-2">
                  <summary className="text-[11px] text-brand-navy-70 dark:text-fg-2 cursor-pointer">system_prompt_extra</summary>
                  <pre className="mt-1 text-[12px] font-mono bg-brand-navy-30/20 dark:bg-ink-0 rounded p-2 whitespace-pre-wrap text-brand-navy dark:text-fg-1">
                    {v.system_prompt_extra}
                  </pre>
                </details>
              )}
              {v.prompt_template && (
                <details className="mt-2">
                  <summary className="text-[11px] text-brand-navy-70 dark:text-fg-2 cursor-pointer">prompt_template ({v.prompt_template.length.toLocaleString()} chars)</summary>
                  <pre className="mt-1 text-[12px] font-mono bg-brand-navy-30/20 dark:bg-ink-0 rounded p-2 whitespace-pre-wrap text-brand-navy dark:text-fg-1">
                    {v.prompt_template}
                  </pre>
                </details>
              )}
            </div>
          ))}
          {versions.length === 0 && <p className="text-sm text-brand-navy-70 dark:text-fg-2">No history yet.</p>}
        </div>
      )}

      {previewOpen && (
        <TemplatePreviewModal
          agentId={agent.id}
          template={editedTemplate}
          onClose={() => setPreviewOpen(false)}
        />
      )}

      {tab === 'usage' && (
        <div className="bg-white dark:bg-ink-1 rounded-xl shadow-sm border border-brand-navy-30/40 dark:border-ink-border-soft overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-brand-navy-30/20 dark:bg-ink-2 text-[11px] uppercase tracking-wider text-brand-navy-70 dark:text-fg-2">
              <tr>
                <th className="text-left px-4 py-2">Day</th>
                <th className="text-right px-4 py-2">Calls</th>
                <th className="text-right px-4 py-2">Input tokens</th>
                <th className="text-right px-4 py-2">Output tokens</th>
                <th className="text-right px-4 py-2">Failed</th>
                <th className="text-right px-4 py-2">Killed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-navy-30/30 dark:divide-ink-border-soft">
              {usage.map(u => (
                <tr key={u.day}>
                  <td className="px-4 py-2 font-mono text-[12px] text-brand-navy-70 dark:text-fg-2">{u.day}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmt(u.calls)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmt(u.input_tokens)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmt(u.output_tokens)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-brand-navy-70 dark:text-fg-2">{u.failed}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-brand-navy-70 dark:text-fg-2">{u.killed}</td>
                </tr>
              ))}
              {usage.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-brand-navy-70 dark:text-fg-2">No usage in the last 30 days.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Extract `{{var}}` placeholder names from a Handlebars template for prefilling
 *  the vars editor. Captures simple mustache interpolations; skips block helpers
 *  (`{{#if}}` / `{{#each}}` / `{{else}}` / `{{/…}}`) since those aren't vars. */
function extractTemplateVars(template: string): string[] {
  const re = /\{\{\{?\s*([#/]?)([\w.-]+)[^}]*\}?\}\}/g;
  const vars = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) {
    const kind = m[1];
    const name = m[2];
    if (kind === '#' || kind === '/') continue; // block helpers
    if (name === 'else' || name === 'this') continue;
    vars.add(name);
  }
  return Array.from(vars).sort();
}

interface TemplatePreviewModalProps {
  agentId: number;
  template: string;
  onClose: () => void;
}

function TemplatePreviewModal({ agentId, template, onClose }: TemplatePreviewModalProps) {
  const initialVars = (() => {
    const names = extractTemplateVars(template);
    const obj: Record<string, string> = {};
    for (const n of names) obj[n] = `[${n}]`;
    return obj;
  })();

  const [varsJson, setVarsJson] = useState<string>(JSON.stringify(initialVars, null, 2));
  const [rendered, setRendered] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function render() {
    setLoading(true); setError(null); setRendered(null);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(varsJson);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('Vars must be a JSON object.');
      }
    } catch (e) {
      setError(`Invalid vars JSON: ${(e as Error).message}`);
      setLoading(false);
      return;
    }
    try {
      const r = await previewAgentTemplate(agentId, template, parsed);
      if (r.error) setError(r.error);
      else setRendered(r.rendered);
    } catch (e) {
      setError((e as Error).message || 'Preview failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-brand-navy/40 dark:bg-black/60 backdrop-blur-[2px] z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="bg-white dark:bg-ink-1 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-brand-navy-30/40 dark:border-ink-border-soft flex items-center justify-between">
          <h3 className="text-sm font-semibold text-brand-navy dark:text-fg-1">Preview rendered output</h3>
          <button onClick={onClose} className="text-brand-navy-70 dark:text-fg-2 hover:text-brand-navy dark:hover:text-fg-1 text-lg leading-none">×</button>
        </div>

        <div className="px-5 py-4 grid grid-cols-2 gap-4 flex-1 min-h-0 overflow-hidden">
          <div className="flex flex-col min-h-0">
            <label className="text-xs text-brand-navy-70 dark:text-fg-2 mb-1">
              Sample vars (JSON) — prefilled from <code className="text-[11px]">{'{{var}}'}</code> placeholders in the template.
            </label>
            <textarea
              value={varsJson}
              onChange={e => setVarsJson(e.target.value)}
              spellCheck={false}
              className="flex-1 rounded border border-brand-navy-30/60 dark:border-ink-border-soft bg-white dark:bg-ink-0 px-2 py-2 text-[12px] font-mono text-brand-navy dark:text-fg-1 resize-none"
            />
            <div className="mt-2">
              <button
                onClick={render}
                disabled={loading}
                className="px-3 py-1.5 rounded bg-brand-purple text-white text-sm font-medium hover:bg-brand-purple-70 disabled:opacity-50"
              >
                {loading ? 'Rendering…' : 'Render'}
              </button>
              <span className="ml-3 text-[11px] text-brand-navy-70 dark:text-fg-2">Local render only — does not call Anthropic.</span>
            </div>
          </div>

          <div className="flex flex-col min-h-0">
            <label className="text-xs text-brand-navy-70 dark:text-fg-2 mb-1">Rendered prompt</label>
            <div className="flex-1 rounded border border-brand-navy-30/60 dark:border-ink-border-soft bg-brand-navy-30/20 dark:bg-ink-0 p-2 overflow-auto text-[12px] font-mono text-brand-navy dark:text-fg-1 whitespace-pre-wrap">
              {error && <span className="text-status-overdue dark:text-status-d-overdue">{error}</span>}
              {!error && rendered !== null && rendered}
              {!error && rendered === null && !loading && (
                <span className="text-brand-navy-70 dark:text-fg-2 italic">Click Render to see output.</span>
              )}
            </div>
            {rendered !== null && !error && (
              <p className="mt-1 text-[11px] text-brand-navy-70 dark:text-fg-2">
                Rendered: {rendered.length.toLocaleString()} chars.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
