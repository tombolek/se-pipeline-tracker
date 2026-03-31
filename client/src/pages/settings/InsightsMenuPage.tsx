import { useState } from 'react';
import { getInsightsNav, saveInsightsNav, DEFAULT_INSIGHTS_NAV, type InsightsNavItem } from '../../utils/insightsNav';

export default function InsightsMenuPage() {
  const [items, setItems] = useState<InsightsNavItem[]>(() => getInsightsNav());
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  function update(next: InsightsNavItem[]) {
    setItems(next);
    saveInsightsNav(next);
  }

  function toggleVisible(id: string) {
    update(items.map(item => item.id === id ? { ...item, visible: !item.visible } : item));
  }

  function moveUp(idx: number) {
    if (idx === 0) return;
    const next = [...items];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    update(next);
  }

  function moveDown(idx: number) {
    if (idx === items.length - 1) return;
    const next = [...items];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    update(next);
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
    setItems(next);
  }

  function onDragEnd() {
    setDragIdx(null);
    saveInsightsNav(items);
  }

  function resetToDefault() {
    update(DEFAULT_INSIGHTS_NAV.map(i => ({ ...i })));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-brand-navy">Insights Menu</h1>
          <p className="text-sm text-brand-navy-70 mt-0.5">Reorder and show/hide pages in the Insights section</p>
        </div>
        <button
          onClick={resetToDefault}
          className="text-xs text-brand-navy-70 hover:text-brand-navy border border-brand-navy-30 rounded-lg px-3 py-1.5 transition-colors"
        >
          Reset to default
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-brand-navy-30/40 overflow-hidden max-w-lg">
        {items.map((item, idx) => (
          <div
            key={item.id}
            draggable
            onDragStart={() => onDragStart(idx)}
            onDragOver={e => onDragOver(e, idx)}
            onDragEnd={onDragEnd}
            className={`flex items-center gap-3 px-4 py-3 border-b border-brand-navy-30/20 last:border-0 select-none ${
              dragIdx === idx ? 'opacity-40 bg-brand-purple-30/20' : 'hover:bg-gray-50/80 cursor-grab'
            }`}
          >
            {/* Drag handle */}
            <svg className="w-4 h-4 text-brand-navy-30 flex-shrink-0 cursor-grab" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h16M4 16h16" />
            </svg>

            {/* Visible toggle */}
            <input
              type="checkbox"
              checked={item.visible}
              onChange={() => toggleVisible(item.id)}
              className="accent-brand-purple w-3.5 h-3.5 flex-shrink-0 cursor-pointer"
            />

            {/* Label */}
            <span className={`flex-1 text-sm font-medium ${item.visible ? 'text-brand-navy' : 'text-brand-navy-30 line-through'}`}>
              {item.label}
            </span>

            {/* Up / Down */}
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => moveUp(idx)}
                disabled={idx === 0}
                className="p-1 text-brand-navy-30 hover:text-brand-navy disabled:opacity-20 transition-colors rounded"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                </svg>
              </button>
              <button
                onClick={() => moveDown(idx)}
                disabled={idx === items.length - 1}
                className="p-1 text-brand-navy-30 hover:text-brand-navy disabled:opacity-20 transition-colors rounded"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-brand-navy-70 mt-3">Drag rows or use arrows to reorder. Changes take effect immediately.</p>
    </div>
  );
}
