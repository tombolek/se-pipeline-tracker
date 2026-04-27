import { useState } from 'react';
import {
  getMenuConfig, saveMenuConfig, resetMenuConfig, setCachedTeamDefault,
  type MenuConfig, type MenuItem, type MenuSection,
} from '../../utils/menuConfig';
import { saveMenuDefault } from '../../api/settings';
import { useAuthStore } from '../../store/auth';

type DragKind = 'item' | 'section' | null;

function uid(prefix = 'sec'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function ItemRow({
  item,
  onDragStart,
  onDragEnd,
  isDragging,
}: {
  item: MenuItem;
  onDragStart: () => void;
  onDragEnd: () => void;
  isDragging: boolean;
}) {
  return (
    <div
      data-item-id={item.id}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg border bg-white dark:bg-ink-1 select-none cursor-grab active:cursor-grabbing transition-colors ${
        isDragging
          ? 'opacity-40 border-brand-purple bg-brand-purple-30/30'
          : 'border-transparent hover:border-brand-navy-30 dark:border-ink-border-soft'
      }`}
    >
      <svg className="w-3.5 h-3.5 text-brand-navy-30 dark:text-fg-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h16M4 16h16" />
      </svg>
      <span className="flex-1 text-sm font-medium text-brand-navy dark:text-fg-1">{item.label}</span>
      <span className="text-xs text-brand-navy-70 dark:text-fg-3 hidden md:inline">{item.to}</span>
    </div>
  );
}

function Toggle({ on, onClick, title }: { on: boolean; onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`relative inline-block w-9 h-5 rounded-full transition-colors ${on ? 'bg-brand-purple' : 'bg-brand-navy-30'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : ''}`} />
    </button>
  );
}

type SaveStatus = { kind: 'idle' } | { kind: 'saving' } | { kind: 'ok'; msg: string } | { kind: 'err'; msg: string };

export default function MenuSettingsPage() {
  const { user } = useAuthStore();
  const isAdmin = !!user?.is_admin;
  const [config, setConfig] = useState<MenuConfig>(() => getMenuConfig());
  const [drag, setDrag] = useState<{ kind: DragKind; id: string | null }>({ kind: null, id: null });
  const [dropTarget, setDropTarget] = useState<string | null>(null); // section id or 'top' or null
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ kind: 'idle' });

  function update(next: MenuConfig) {
    setConfig(next);
    saveMenuConfig(next);
  }

  function itemsIn(sectionId: string | null): MenuItem[] {
    return config.items.filter(i => i.sectionId === sectionId);
  }

  function startItemDrag(id: string) {
    setDrag({ kind: 'item', id });
  }
  function startSectionDrag(id: string) {
    setDrag({ kind: 'section', id });
  }
  function endDrag() {
    setDrag({ kind: null, id: null });
    setDropTarget(null);
  }

  function onZoneDragOver(e: React.DragEvent, zoneId: string) {
    if (drag.kind !== 'item') return;
    e.preventDefault();
    setDropTarget(zoneId);
  }

  function onZoneDrop(e: React.DragEvent, sectionId: string | null) {
    e.preventDefault();
    if (drag.kind !== 'item' || !drag.id) { endDrag(); return; }

    const zoneEl = e.currentTarget as HTMLElement;
    const siblings = Array.from(zoneEl.querySelectorAll<HTMLElement>('[data-item-id]'))
      .filter(el => el.dataset.itemId !== drag.id);

    let insertBeforeId: string | null = null;
    for (const el of siblings) {
      const r = el.getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) {
        insertBeforeId = el.dataset.itemId ?? null;
        break;
      }
    }

    const dragId = drag.id;
    const dragged = config.items.find(i => i.id === dragId);
    if (!dragged) { endDrag(); return; }

    const others = config.items.filter(i => i.id !== dragId);
    const moved: MenuItem = { ...dragged, sectionId };

    let nextItems: MenuItem[];
    if (insertBeforeId) {
      const idx = others.findIndex(i => i.id === insertBeforeId);
      nextItems = [...others.slice(0, idx), moved, ...others.slice(idx)];
    } else {
      // Append after the last item already in this zone
      let lastIdx = -1;
      others.forEach((i, idx) => { if (i.sectionId === sectionId) lastIdx = idx; });
      nextItems = [...others.slice(0, lastIdx + 1), moved, ...others.slice(lastIdx + 1)];
    }
    update({ ...config, items: nextItems });
    endDrag();
  }

  function onSectionListDrop(e: React.DragEvent) {
    if (drag.kind !== 'section' || !drag.id) return;
    e.preventDefault();
    const list = e.currentTarget as HTMLElement;
    const cards = Array.from(list.querySelectorAll<HTMLElement>('[data-section-card]'))
      .filter(c => c.dataset.sectionCard !== drag.id);

    let insertBeforeId: string | null = null;
    for (const c of cards) {
      const r = c.getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) {
        insertBeforeId = c.dataset.sectionCard ?? null;
        break;
      }
    }

    const moving = config.sections.find(s => s.id === drag.id);
    if (!moving) { endDrag(); return; }
    const others = config.sections.filter(s => s.id !== drag.id);
    const nextSections = insertBeforeId
      ? (() => {
          const idx = others.findIndex(s => s.id === insertBeforeId);
          return [...others.slice(0, idx), moving, ...others.slice(idx)];
        })()
      : [...others, moving];

    update({ ...config, sections: nextSections });
    endDrag();
  }

  function toggleSectionDefault(id: string) {
    update({
      ...config,
      sections: config.sections.map(s => s.id === id ? { ...s, defaultCollapsed: !s.defaultCollapsed } : s),
    });
  }

  function renameSection(id: string, label: string) {
    const trimmed = label.trim();
    if (!trimmed) return;
    update({
      ...config,
      sections: config.sections.map(s => s.id === id ? { ...s, label: trimmed } : s),
    });
  }

  function deleteSection(id: string) {
    if (!confirm('Delete this section? Items inside will move to the top level.')) return;
    update({
      sections: config.sections.filter(s => s.id !== id),
      items: config.items.map(i => i.sectionId === id ? { ...i, sectionId: null } : i),
    });
  }

  function addSection() {
    const newSection: MenuSection = { id: uid('sec'), label: 'New section', defaultCollapsed: false };
    update({ ...config, sections: [...config.sections, newSection] });
  }

  function reset() {
    if (!confirm('Reset menu to default?')) return;
    setConfig(resetMenuConfig());
  }

  async function saveAsNewDefault() {
    if (!isAdmin) return;
    if (!confirm('Save the current layout as the team-wide default? New users (and anyone clicking Reset) will get this layout.')) return;
    setSaveStatus({ kind: 'saving' });
    try {
      const saved = await saveMenuDefault(config);
      setCachedTeamDefault(saved);
      setSaveStatus({ kind: 'ok', msg: 'Saved as new team default.' });
      setTimeout(() => setSaveStatus(s => s.kind === 'ok' ? { kind: 'idle' } : s), 3000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save default.';
      setSaveStatus({ kind: 'err', msg });
    }
  }

  const topItems = itemsIn(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-brand-navy dark:text-fg-1">Menu Settings</h1>
          <p className="text-sm text-brand-navy-70 dark:text-fg-2 mt-0.5">
            Configure top-level items, sections, and where each item lives.
            Page visibility is controlled separately under <span className="font-medium">People → Role Access</span>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={addSection}
            className="text-sm font-medium bg-brand-purple text-white rounded-lg px-3.5 py-2 hover:bg-brand-purple-70 transition"
          >
            + Add section
          </button>
          {isAdmin && (
            <button
              onClick={saveAsNewDefault}
              disabled={saveStatus.kind === 'saving'}
              className="text-xs font-medium text-brand-purple border border-brand-purple rounded-lg px-3 py-2 hover:bg-brand-purple-30/30 transition-colors disabled:opacity-50"
              title="Save current layout as the team-wide default"
            >
              {saveStatus.kind === 'saving' ? 'Saving…' : 'Save as new default'}
            </button>
          )}
          <button
            onClick={reset}
            className="text-xs text-brand-navy-70 dark:text-fg-2 hover:text-brand-navy dark:text-fg-1 border border-brand-navy-30 dark:border-ink-border-soft rounded-lg px-3 py-2 transition-colors"
          >
            Reset to default
          </button>
        </div>
      </div>

      {(saveStatus.kind === 'ok' || saveStatus.kind === 'err') && (
        <div className={`mb-4 text-xs rounded-lg px-3 py-2 ${
          saveStatus.kind === 'ok'
            ? 'bg-status-success/10 text-status-success border border-status-success/30'
            : 'bg-status-overdue/10 text-status-overdue border border-status-overdue/30'
        }`}>
          {saveStatus.msg}
        </div>
      )}

      {/* Top-level zone */}
      <section className="mb-6 max-w-3xl">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-brand-navy-70 dark:text-fg-3">Top-level items</h2>
          <span className="text-xs text-brand-navy-70 dark:text-fg-3">Always shown directly in the sidebar (no collapsing).</span>
        </div>
        <div
          data-zone="top"
          onDragOver={(e) => onZoneDragOver(e, 'top')}
          onDragLeave={() => setDropTarget(t => t === 'top' ? null : t)}
          onDrop={(e) => onZoneDrop(e, null)}
          className={`bg-white dark:bg-ink-1 rounded-2xl border min-h-[64px] p-2 space-y-1 transition-colors ${
            dropTarget === 'top'
              ? 'border-brand-purple bg-brand-purple-30/20'
              : 'border-brand-navy-30 dark:border-ink-border-soft'
          }`}
        >
          {topItems.length === 0 ? (
            <div className="text-xs text-brand-navy-70 dark:text-fg-3 italic px-3 py-3">Drop items here to keep them at the top level.</div>
          ) : topItems.map(item => (
            <ItemRow
              key={item.id}
              item={item}
              isDragging={drag.kind === 'item' && drag.id === item.id}
              onDragStart={() => startItemDrag(item.id)}
              onDragEnd={endDrag}
            />
          ))}
        </div>
      </section>

      {/* Sections */}
      <section className="max-w-3xl">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-brand-navy-70 dark:text-fg-3">Sections</h2>
          <span className="text-xs text-brand-navy-70 dark:text-fg-3">Drag items between zones · drag the section header to reorder sections.</span>
        </div>
        <div
          className="space-y-3"
          onDragOver={(e) => { if (drag.kind === 'section') e.preventDefault(); }}
          onDrop={onSectionListDrop}
        >
          {config.sections.map(section => {
            const items = itemsIn(section.id);
            const isDropping = dropTarget === section.id;
            return (
              <div
                key={section.id}
                data-section-card={section.id}
                className={`bg-white dark:bg-ink-1 rounded-2xl border overflow-hidden transition-colors ${
                  drag.kind === 'section' && drag.id === section.id
                    ? 'opacity-40 border-brand-purple'
                    : 'border-brand-navy-30 dark:border-ink-border-soft'
                }`}
              >
                <div className="flex items-center gap-3 px-3 py-2.5 bg-brand-purple-30/40 dark:bg-brand-purple-30/15 border-b border-brand-navy-30 dark:border-ink-border-soft">
                  <span
                    draggable
                    onDragStart={() => startSectionDrag(section.id)}
                    onDragEnd={endDrag}
                    className="text-brand-navy-70 dark:text-fg-3 cursor-grab active:cursor-grabbing select-none px-1"
                    title="Drag to reorder section"
                  >
                    ⠿
                  </span>
                  <input
                    type="text"
                    defaultValue={section.label}
                    onBlur={(e) => renameSection(section.id, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    className="flex-1 bg-transparent text-sm font-semibold text-brand-navy dark:text-fg-1 outline-none focus:bg-white dark:focus:bg-ink-2 focus:border focus:border-brand-purple rounded px-2 py-1"
                  />
                  <span className="text-xs text-brand-navy-70 dark:text-fg-3">
                    {items.length} item{items.length === 1 ? '' : 's'}
                  </span>
                  <label className="flex items-center gap-2 text-xs text-brand-navy-70 dark:text-fg-3">
                    <span>Default {section.defaultCollapsed ? 'collapsed' : 'open'}</span>
                    <Toggle
                      on={!section.defaultCollapsed}
                      onClick={() => toggleSectionDefault(section.id)}
                      title="Default state in sidebar"
                    />
                  </label>
                  <button
                    onClick={() => deleteSection(section.id)}
                    className="text-brand-navy-70 dark:text-fg-3 hover:text-brand-pink p-1 rounded transition-colors"
                    title="Delete section"
                    aria-label="Delete section"
                  >
                    ✕
                  </button>
                </div>
                <div
                  data-zone={section.id}
                  onDragOver={(e) => onZoneDragOver(e, section.id)}
                  onDragLeave={() => setDropTarget(t => t === section.id ? null : t)}
                  onDrop={(e) => onZoneDrop(e, section.id)}
                  className={`p-2 min-h-[56px] space-y-1 transition-colors ${
                    isDropping ? 'bg-brand-purple-30/20' : ''
                  }`}
                >
                  {items.length === 0 ? (
                    <div className="text-xs text-brand-navy-70 dark:text-fg-3 italic px-3 py-3">Drop items here</div>
                  ) : items.map(item => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      isDragging={drag.kind === 'item' && drag.id === item.id}
                      onDragStart={() => startItemDrag(item.id)}
                      onDragEnd={endDrag}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <p className="text-xs text-brand-navy-70 dark:text-fg-2 mt-6">Changes apply immediately.</p>
    </div>
  );
}
