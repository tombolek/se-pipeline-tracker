import { useState } from 'react';
import { getInsightsNav, saveInsightsNav, DEFAULT_INSIGHTS_NAV, type InsightsNavItem } from '../../utils/insightsNav';
import { getMainNav, saveMainNav, DEFAULT_MAIN_NAV, type MainNavItem } from '../../utils/mainNav';

function DraggableList<T extends { id: string; label: string; visible: boolean }>({
  items,
  onUpdate,
}: {
  items: T[];
  onUpdate: (next: T[]) => void;
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  function toggleVisible(id: string) {
    onUpdate(items.map(item => item.id === id ? { ...item, visible: !item.visible } : item));
  }

  function moveUp(idx: number) {
    if (idx === 0) return;
    const next = [...items];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    onUpdate(next);
  }

  function moveDown(idx: number) {
    if (idx === items.length - 1) return;
    const next = [...items];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    onUpdate(next);
  }

  function onDragStart(idx: number) {
    setDragIdx(idx);
  }

  function onDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const next = [...items];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(idx, 0, moved);
    setDragIdx(idx);
    onUpdate(next);
  }

  function onDragEnd() {
    setDragIdx(null);
  }

  return (
    <div className="bg-white dark:bg-ink-1 rounded-2xl border border-brand-navy-30/40 dark:border-ink-border-soft overflow-hidden max-w-lg">
      {items.map((item, idx) => (
        <div
          key={item.id}
          draggable
          onDragStart={() => onDragStart(idx)}
          onDragOver={e => onDragOver(e, idx)}
          onDragEnd={onDragEnd}
          className={`flex items-center gap-3 px-4 py-3 border-b border-brand-navy-30/20 dark:border-ink-border-soft last:border-0 select-none ${
            dragIdx === idx ? 'opacity-40 bg-brand-purple-30/20' : 'hover:bg-gray-50 dark:hover:bg-ink-2/80 cursor-grab'
          }`}
        >
          <svg className="w-4 h-4 text-brand-navy-30 dark:text-fg-4 flex-shrink-0 cursor-grab" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h16M4 16h16" />
          </svg>
          <input
            type="checkbox"
            checked={item.visible}
            onChange={() => toggleVisible(item.id)}
            className="accent-brand-purple w-3.5 h-3.5 flex-shrink-0 cursor-pointer"
          />
          <span className={`flex-1 text-sm font-medium ${item.visible ? 'text-brand-navy' : 'text-brand-navy-30 dark:text-fg-4 line-through'}`}>
            {item.label}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => moveUp(idx)}
              disabled={idx === 0}
              className="p-1 text-brand-navy-30 dark:text-fg-4 hover:text-brand-navy dark:text-fg-1 disabled:opacity-20 transition-colors rounded"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
              </svg>
            </button>
            <button
              onClick={() => moveDown(idx)}
              disabled={idx === items.length - 1}
              className="p-1 text-brand-navy-30 dark:text-fg-4 hover:text-brand-navy dark:text-fg-1 disabled:opacity-20 transition-colors rounded"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function MenuSettingsPage() {
  const [mainItems, setMainItems] = useState<MainNavItem[]>(() => getMainNav());
  const [insightsItems, setInsightsItems] = useState<InsightsNavItem[]>(() => getInsightsNav());

  function updateMain(next: MainNavItem[]) {
    setMainItems(next);
    saveMainNav(next);
  }

  function updateInsights(next: InsightsNavItem[]) {
    setInsightsItems(next);
    saveInsightsNav(next);
  }

  function resetToDefault() {
    const nextMain = DEFAULT_MAIN_NAV.map(i => ({ ...i }));
    const nextInsights = DEFAULT_INSIGHTS_NAV.map(i => ({ ...i }));
    setMainItems(nextMain);
    setInsightsItems(nextInsights);
    saveMainNav(nextMain);
    saveInsightsNav(nextInsights);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-brand-navy dark:text-fg-1">Menu Settings</h1>
          <p className="text-sm text-brand-navy-70 dark:text-fg-2 mt-0.5">Reorder and show/hide items in the sidebar navigation</p>
        </div>
        <button
          onClick={resetToDefault}
          className="text-xs text-brand-navy-70 dark:text-fg-2 hover:text-brand-navy dark:text-fg-1 border border-brand-navy-30 rounded-lg px-3 py-1.5 transition-colors"
        >
          Reset to default
        </button>
      </div>

      <div className="space-y-8">
        {/* Main menu section */}
        <div>
          <h2 className="text-sm font-semibold text-brand-navy dark:text-fg-1 mb-2">Main menu</h2>
          <DraggableList items={mainItems} onUpdate={updateMain} />
        </div>

        {/* Insights section */}
        <div>
          <h2 className="text-sm font-semibold text-brand-navy dark:text-fg-1 mb-2">Insights</h2>
          <DraggableList items={insightsItems} onUpdate={updateInsights} />
        </div>
      </div>

      <p className="text-xs text-brand-navy-70 dark:text-fg-2 mt-3">Drag rows or use arrows to reorder. Changes take effect immediately.</p>
    </div>
  );
}
