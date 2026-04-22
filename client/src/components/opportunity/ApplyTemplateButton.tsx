import { useEffect, useRef, useState } from 'react';
import { listTemplates, applyTemplate, type Template, type TemplateKind, type ApplyTemplateResult } from '../../api/templates';

interface Props {
  oppId: number;
  stage: string | null;
  kind: TemplateKind;
  onApplied: (result: ApplyTemplateResult) => void;
  label?: string;
}

export default function ApplyTemplateButton({ oppId, stage, kind, onApplied, label }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Template[] | null>(null);
  const [applying, setApplying] = useState<number | null>(null);
  const [hoverId, setHoverId] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || items !== null) return;
    listTemplates({ kind, stage: stage ?? undefined })
      .then(setItems)
      .catch(() => setItems([]));
  }, [open, items, kind, stage]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function apply(t: Template) {
    setApplying(t.id);
    try {
      const result = await applyTemplate(t.id, { opportunity_id: oppId });
      onApplied(result);
      setOpen(false);
    } finally {
      setApplying(null);
    }
  }

  const defaultLabel = kind === 'task_pack' ? 'Use template' : 'Use template';

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="text-xs text-brand-purple dark:text-accent-purple hover:text-brand-navy dark:text-fg-1 font-medium transition-colors"
      >
        {label ?? defaultLabel}
      </button>

      {open && (
        <div className="absolute right-0 top-6 z-30 w-72 bg-white dark:bg-ink-1 rounded-lg border border-brand-navy-30 shadow-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-brand-navy-30/40 dark:border-ink-border-soft bg-gray-50 dark:bg-ink-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-navy-70 dark:text-fg-2">
              {kind === 'task_pack' ? 'Task pack templates' : 'Note templates'}
            </p>
          </div>
          {items === null ? (
            <p className="px-3 py-4 text-xs text-brand-navy-70 dark:text-fg-2">Loading…</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-4 text-xs text-brand-navy-70 dark:text-fg-2">
              No {kind === 'task_pack' ? 'task pack' : 'note'} templates{stage ? ` for ${stage}` : ''}.
              <span className="block text-[10px] text-brand-navy-30 dark:text-fg-4 mt-1">A manager can create one in Settings → Templates.</span>
            </p>
          ) : (
            <ul className="max-h-64 overflow-y-auto">
              {items.map(t => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => apply(t)}
                    onMouseEnter={() => setHoverId(t.id)}
                    onMouseLeave={() => setHoverId(null)}
                    disabled={applying === t.id}
                    className="w-full px-3 py-2 text-left hover:bg-brand-purple-30/40 dark:hover:bg-accent-purple-soft transition-colors disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-brand-navy dark:text-fg-1">{t.name}</span>
                      {t.kind === 'task_pack' && t.items && (
                        <span className="text-[10px] text-brand-navy-70 dark:text-fg-2">{t.items.length} task{t.items.length !== 1 ? 's' : ''}</span>
                      )}
                    </div>
                    {t.description && <p className="text-[11px] text-brand-navy-70 dark:text-fg-2 mt-0.5">{t.description}</p>}
                    {hoverId === t.id && t.kind === 'task_pack' && t.items && t.items.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5">
                        {t.items.slice(0, 6).map((it, i) => (
                          <li key={i} className="text-[10px] text-brand-navy-70 dark:text-fg-2">• {it.title} <span className="text-brand-navy-30 dark:text-fg-4">({it.due_offset_days ?? 7}d)</span></li>
                        ))}
                        {t.items.length > 6 && <li className="text-[10px] text-brand-navy-30 dark:text-fg-4 italic">+{t.items.length - 6} more</li>}
                      </ul>
                    )}
                    {applying === t.id && <p className="text-[10px] text-brand-purple dark:text-accent-purple mt-0.5">Applying…</p>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
