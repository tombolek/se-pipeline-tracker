/**
 * Templates settings (Issue #132).
 * Manager-only CRUD for task-pack and note templates.
 * SEs apply templates from the Work tab on the opportunity drawer.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  listTemplates, createTemplate, updateTemplate, deleteTemplate,
  type Template, type TemplateKind, type TaskPackItem,
} from '../../api/templates';

const STAGES = ['Qualify', 'Develop Solution', 'Build Value', 'Proposal Sent', 'Submitted for Booking', 'Negotiate'];

function KindBadge({ kind }: { kind: TemplateKind }) {
  if (kind === 'task_pack') {
    return <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-brand-purple-30 text-brand-navy dark:text-fg-1">Task pack</span>;
  }
  return <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 dark:bg-status-d-success-soft text-status-success dark:text-status-d-success">Note</span>;
}

interface EditorProps {
  initial?: Template;
  onClose: () => void;
  onSaved: () => void;
}

function TemplateEditor({ initial, onClose, onSaved }: EditorProps) {
  const [kind, setKind] = useState<TemplateKind>(initial?.kind ?? 'task_pack');
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [stage, setStage] = useState<string>(initial?.stage ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [items, setItems] = useState<TaskPackItem[]>(
    initial?.items && initial.items.length > 0
      ? initial.items
      : [{ title: '', description: '', is_next_step: false, due_offset_days: 7 }],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateItem(i: number, patch: Partial<TaskPackItem>) {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  }
  function addItem() {
    setItems(prev => [...prev, { title: '', description: '', is_next_step: false, due_offset_days: 7 }]);
  }
  function removeItem(i: number) {
    setItems(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError('Name is required'); return; }
    if (kind === 'note' && !body.trim()) { setError('Note body is required'); return; }
    if (kind === 'task_pack' && items.some(it => !it.title.trim())) {
      setError('Every task in the pack needs a title'); return;
    }
    setSaving(true);
    try {
      const payload = {
        kind,
        name: name.trim(),
        description: description.trim() || undefined,
        body: kind === 'note' ? body : undefined,
        items: kind === 'task_pack' ? items.map(it => ({
          title: it.title.trim(),
          description: it.description?.trim() || undefined,
          is_next_step: !!it.is_next_step,
          due_offset_days: Number.isFinite(it.due_offset_days as number) ? it.due_offset_days : 7,
        })) : undefined,
        stage: stage || null,
      };
      if (initial) await updateTemplate(initial.id, payload);
      else await createTemplate(payload);
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-brand-navy/30 backdrop-blur-[2px] z-40 flex items-center justify-center p-6">
      <form onSubmit={save} className="bg-white dark:bg-ink-1 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-brand-navy-30/40 dark:border-ink-border-soft flex items-center justify-between">
          <h3 className="text-sm font-semibold text-brand-navy dark:text-fg-1">{initial ? 'Edit' : 'New'} template</h3>
          <button type="button" onClick={onClose} className="text-brand-navy-70 dark:text-fg-2 hover:text-brand-navy dark:text-fg-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {error && <p className="text-xs text-status-overdue dark:text-status-d-overdue bg-red-50 dark:bg-status-d-overdue-soft rounded px-2 py-1.5">{error}</p>}

          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold text-brand-navy-70 dark:text-fg-2 uppercase tracking-wide">Kind</label>
            <div className="flex gap-1 bg-gray-100 dark:bg-ink-3 p-0.5 rounded-lg">
              {(['task_pack', 'note'] as TemplateKind[]).map(k => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  disabled={!!initial /* kind is not editable after create */}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    kind === k ? 'bg-white dark:bg-ink-1 text-brand-navy dark:text-fg-1 shadow-sm' : 'text-brand-navy-70 dark:text-fg-2 hover:text-brand-navy'
                  } ${initial ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  {k === 'task_pack' ? 'Task pack' : 'Note'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-brand-navy-70 dark:text-fg-2 uppercase tracking-wide block mb-1">Name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-1.5 rounded border border-brand-navy-30 text-sm text-brand-navy dark:text-fg-1 focus:outline-none focus:ring-2 focus:ring-brand-purple"
                placeholder="e.g. PoC Kickoff"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-brand-navy-70 dark:text-fg-2 uppercase tracking-wide block mb-1">Stage (optional)</label>
              <select
                value={stage}
                onChange={e => setStage(e.target.value)}
                className="w-full px-3 py-1.5 rounded border border-brand-navy-30 text-sm text-brand-navy dark:text-fg-1 focus:outline-none focus:ring-2 focus:ring-brand-purple"
              >
                <option value="">Any stage</option>
                {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-brand-navy-70 dark:text-fg-2 uppercase tracking-wide block mb-1">Description</label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-1.5 rounded border border-brand-navy-30 text-sm text-brand-navy dark:text-fg-1 focus:outline-none focus:ring-2 focus:ring-brand-purple"
              placeholder="What this template is for (shown to SEs)"
            />
          </div>

          {kind === 'note' ? (
            <div>
              <label className="text-xs font-semibold text-brand-navy-70 dark:text-fg-2 uppercase tracking-wide block mb-1">Note body</label>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={10}
                className="w-full px-3 py-2 rounded border border-brand-navy-30 text-sm text-brand-navy dark:text-fg-1 font-mono focus:outline-none focus:ring-2 focus:ring-brand-purple"
                placeholder={`e.g.\n## Call Recap\n\n**Attendees:**\n\n**Discussion:**\n\n**Next Steps:**`}
              />
              <p className="text-[11px] text-brand-navy-70 dark:text-fg-2 mt-1">Free-form text. Applied as a new note on the opportunity.</p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-brand-navy-70 dark:text-fg-2 uppercase tracking-wide">Tasks ({items.length})</label>
                <button type="button" onClick={addItem} className="text-xs text-brand-purple dark:text-accent-purple hover:text-brand-navy dark:text-fg-1 font-medium">+ Add task</button>
              </div>
              <div className="space-y-2">
                {items.map((it, i) => (
                  <div key={i} className="p-3 rounded-lg border border-brand-navy-30 bg-gray-50 dark:bg-ink-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        value={it.title}
                        onChange={e => updateItem(i, { title: e.target.value })}
                        placeholder={`Task ${i + 1} title`}
                        className="flex-1 px-2 py-1 rounded border border-brand-navy-30 text-sm focus:outline-none focus:ring-1 focus:ring-brand-purple"
                      />
                      {items.length > 1 && (
                        <button type="button" onClick={() => removeItem(i)} className="text-brand-navy-30 dark:text-fg-4 hover:text-status-overdue dark:text-status-d-overdue" title="Remove">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <input
                      value={it.description ?? ''}
                      onChange={e => updateItem(i, { description: e.target.value })}
                      placeholder="Description (optional)"
                      className="w-full px-2 py-1 rounded border border-brand-navy-30 text-xs focus:outline-none focus:ring-1 focus:ring-brand-purple"
                    />
                    <div className="flex items-center gap-4 flex-wrap">
                      <label className="flex items-center gap-1.5 text-xs text-brand-navy dark:text-fg-1 cursor-pointer">
                        Due in
                        <input
                          type="number"
                          value={it.due_offset_days ?? 7}
                          onChange={e => updateItem(i, { due_offset_days: parseInt(e.target.value || '0') })}
                          className="w-16 px-1.5 py-0.5 rounded border border-brand-navy-30 text-xs text-right focus:outline-none focus:ring-1 focus:ring-brand-purple"
                        />
                        days
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-brand-navy dark:text-fg-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!it.is_next_step}
                          onChange={e => updateItem(i, { is_next_step: e.target.checked })}
                          className="accent-brand-purple"
                        />
                        Mark as Next Step
                      </label>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-brand-navy-70 dark:text-fg-2 mt-1.5">
                When applied, each task's due date is set to <em>start date + offset days</em>. Start date defaults to today.
              </p>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-brand-navy-30/40 dark:border-ink-border-soft flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs text-brand-navy-70 dark:text-fg-2 hover:text-brand-navy dark:text-fg-1">Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-1.5 bg-brand-purple dark:bg-accent-purple text-white text-xs font-medium rounded hover:bg-brand-purple-70 dark:hover:opacity-90 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Template | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const t = await listTemplates();
      setTemplates(t);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  async function handleDelete(t: Template) {
    if (!confirm(`Delete template "${t.name}"? This cannot be undone.`)) return;
    await deleteTemplate(t.id);
    await reload();
  }

  const taskPacks = templates.filter(t => t.kind === 'task_pack');
  const notes     = templates.filter(t => t.kind === 'note');

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-brand-navy dark:text-fg-1">Templates</h1>
          <p className="text-xs text-brand-navy-70 dark:text-fg-2 mt-0.5">
            Reusable task packs and note templates that SEs can apply to any opportunity from the Work tab.
          </p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowEditor(true); }}
          className="px-3 py-1.5 bg-brand-purple dark:bg-accent-purple text-white text-xs font-medium rounded hover:bg-brand-purple-70 dark:hover:opacity-90"
        >
          + New template
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-brand-navy-70 dark:text-fg-2">Loading…</p>
      ) : templates.length === 0 ? (
        <div className="bg-white dark:bg-ink-1 rounded-2xl border border-brand-navy-30/40 dark:border-ink-border-soft px-6 py-10 text-center">
          <p className="text-sm text-brand-navy-70 dark:text-fg-2">No templates yet.</p>
          <p className="text-xs text-brand-navy-30 dark:text-fg-4 mt-1">Create task packs (e.g. "PoC Kickoff") or note templates (e.g. "Call Recap") to help SEs move fast on new opportunities.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {taskPacks.length > 0 && (
            <TemplateList title="Task packs" items={taskPacks} onEdit={t => { setEditing(t); setShowEditor(true); }} onDelete={handleDelete} />
          )}
          {notes.length > 0 && (
            <TemplateList title="Notes" items={notes} onEdit={t => { setEditing(t); setShowEditor(true); }} onDelete={handleDelete} />
          )}
        </div>
      )}

      {showEditor && (
        <TemplateEditor
          initial={editing ?? undefined}
          onClose={() => setShowEditor(false)}
          onSaved={reload}
        />
      )}
    </div>
  );
}

function TemplateList({
  title, items, onEdit, onDelete,
}: {
  title: string;
  items: Template[];
  onEdit: (t: Template) => void;
  onDelete: (t: Template) => void;
}) {
  return (
    <div className="bg-white dark:bg-ink-1 rounded-2xl border border-brand-navy-30/40 dark:border-ink-border-soft overflow-hidden">
      <div className="px-5 py-3 border-b border-brand-navy-30/40 dark:border-ink-border-soft">
        <h2 className="text-sm font-semibold text-brand-navy dark:text-fg-1">{title} <span className="text-brand-navy-70 dark:text-fg-2 font-normal">({items.length})</span></h2>
      </div>
      <div className="divide-y divide-brand-navy-30/20">
        {items.map(t => (
          <div key={t.id} className="px-5 py-3 hover:bg-gray-50 dark:hover:bg-ink-2">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => onEdit(t)} className="text-sm font-medium text-brand-navy dark:text-fg-1 hover:text-brand-purple dark:text-accent-purple">{t.name}</button>
                  <KindBadge kind={t.kind} />
                  {t.stage && <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-ink-3 text-[10px] font-medium text-brand-navy-70 dark:text-fg-2 uppercase tracking-wide">{t.stage}</span>}
                  {t.kind === 'task_pack' && t.items && <span className="text-[11px] text-brand-navy-70 dark:text-fg-2">· {t.items.length} task{t.items.length !== 1 ? 's' : ''}</span>}
                  {t.created_by_name && (
                    <span className="text-[11px] text-brand-navy-30 dark:text-fg-4">· by {t.created_by_name}</span>
                  )}
                </div>
                {t.description && <p className="text-xs text-brand-navy-70 dark:text-fg-2 mt-0.5">{t.description}</p>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => onEdit(t)} className="text-xs text-brand-purple dark:text-accent-purple hover:text-brand-navy dark:text-fg-1 font-medium">Edit</button>
                <button onClick={() => onDelete(t)} className="text-xs text-brand-navy-30 dark:text-fg-4 hover:text-status-overdue dark:text-status-d-overdue">Delete</button>
              </div>
            </div>

            {/* Inline detail — so the user can see what's inside without opening the editor */}
            {t.kind === 'task_pack' && t.items && t.items.length > 0 && (
              <ol className="mt-2 ml-1 space-y-1 border-l-2 border-brand-navy-30/40 dark:border-ink-border-soft pl-3">
                {t.items.map((it, i) => (
                  <li key={i} className="text-xs text-brand-navy-70 dark:text-fg-2 flex items-center gap-2 flex-wrap">
                    <span className="text-brand-navy-30 dark:text-fg-4 font-mono tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                    <span className="text-brand-navy dark:text-fg-1 font-medium">{it.title}</span>
                    <span className="text-[10px] text-brand-navy-30 dark:text-fg-4">
                      +{it.due_offset_days ?? 7}d
                    </span>
                    {it.is_next_step && (
                      <span className="px-1.5 py-0.5 rounded bg-brand-purple-30 text-[9px] font-semibold uppercase tracking-wide text-brand-purple dark:text-accent-purple">Next step</span>
                    )}
                    {it.description && (
                      <span className="text-[11px] text-brand-navy-70 dark:text-fg-2 font-light italic basis-full pl-6">{it.description}</span>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {t.kind === 'note' && t.body && (
              <pre className="mt-2 ml-1 p-2 rounded bg-gray-50 dark:bg-ink-2 border border-brand-navy-30/40 dark:border-ink-border-soft text-[11px] text-brand-navy-70 dark:text-fg-2 font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">{t.body}</pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
