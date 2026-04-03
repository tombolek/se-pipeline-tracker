/**
 * ColumnPicker — reusable column visibility + ordering popover
 *
 * Two-section layout:
 *   Top  — "Active columns": draggable list of visible columns; drag to reorder, ✕ to hide
 *   Bottom — "Add columns": grouped checkboxes for discovery / toggling
 *
 * Column order is now fully user-controlled (no longer forced into ALL_COLUMNS canonical order).
 * When a new column is checked it is appended to the end of the visible list.
 */
import { useState, useRef, useEffect } from 'react';
import { ALL_COLUMNS, COLUMN_GROUPS } from '../../constants/columnDefs';
import type { ColumnGroup } from '../../constants/columnDefs';

interface Props {
  visibleColumns: string[];
  defaultColumns: readonly string[];
  onChange: (cols: string[]) => void;
  excludeKeys?: string[];
}

// ── Icons ────────────────────────────────────────────────────────────────────

function GridIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-3 h-3 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
      fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function DragHandle() {
  return (
    <svg className="w-3 h-3 text-brand-navy-30 flex-shrink-0" viewBox="0 0 10 16" fill="currentColor">
      <circle cx="3" cy="2" r="1.2" />
      <circle cx="7" cy="2" r="1.2" />
      <circle cx="3" cy="8" r="1.2" />
      <circle cx="7" cy="8" r="1.2" />
      <circle cx="3" cy="14" r="1.2" />
      <circle cx="7" cy="14" r="1.2" />
    </svg>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildColumnsByGroup(excludeKeys: string[]) {
  return COLUMN_GROUPS.map(group => ({
    group,
    columns: ALL_COLUMNS.filter(c => c.group === group && !excludeKeys.includes(c.key)),
  })).filter(g => g.columns.length > 0);
}

function labelFor(key: string) {
  return ALL_COLUMNS.find(c => c.key === key)?.label ?? key;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ColumnPicker({ visibleColumns, defaultColumns, onChange, excludeKeys = [] }: Props) {
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<ColumnGroup>>(
    () => new Set(COLUMN_GROUPS)
  );
  // Drag state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  const COLUMNS_BY_GROUP = buildColumnsByGroup(excludeKeys);
  const visibleSet = new Set(visibleColumns);

  // ── Column visibility ──────────────────────────────────────────────────────

  function showColumn(key: string) {
    if (visibleSet.has(key)) return;
    onChange([...visibleColumns, key]); // append to end
  }

  function hideColumn(key: string) {
    if (visibleColumns.length <= 1) return;
    onChange(visibleColumns.filter(k => k !== key));
  }

  function toggleColumn(key: string) {
    visibleSet.has(key) ? hideColumn(key) : showColumn(key);
  }

  function toggleGroup(group: ColumnGroup) {
    const groupKeys = ALL_COLUMNS
      .filter(c => c.group === group && !excludeKeys.includes(c.key))
      .map(c => c.key);
    const allVisible = groupKeys.every(k => visibleSet.has(k));
    if (allVisible) {
      const next = visibleColumns.filter(k => !groupKeys.includes(k));
      if (next.length === 0) return;
      onChange(next);
    } else {
      const toAdd = groupKeys.filter(k => !visibleSet.has(k));
      onChange([...visibleColumns, ...toAdd]);
    }
  }

  function resetToDefaults() {
    onChange([...defaultColumns]);
  }

  function toggleGroupExpanded(group: ColumnGroup) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(group) ? next.delete(group) : next.add(group);
      return next;
    });
  }

  // ── Drag to reorder ────────────────────────────────────────────────────────

  function handleDragStart(e: React.DragEvent, index: number) {
    e.dataTransfer.effectAllowed = 'move';
    setDragIndex(index);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverIndex(index);
  }

  function handleDrop(e: React.DragEvent, dropIndex: number) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }
    const next = [...visibleColumns];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(dropIndex, 0, moved);
    onChange(next);
    setDragIndex(null);
    setOverIndex(null);
  }

  function handleDragEnd() {
    setDragIndex(null);
    setOverIndex(null);
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const isDefault =
    visibleColumns.length === defaultColumns.length &&
    visibleColumns.every((k, i) => k === defaultColumns[i]);

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        ref={triggerRef}
        onClick={() => setOpen(v => !v)}
        className={`
          flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium
          border transition-colors duration-150
          ${open
            ? 'bg-brand-purple text-white border-brand-purple'
            : 'bg-white text-brand-navy-70 border-brand-navy-30 hover:border-brand-purple hover:text-brand-purple'
          }
        `}
      >
        <GridIcon />
        Columns
        {!isDefault && (
          <span className="ml-0.5 bg-brand-pink text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
            ●
          </span>
        )}
        <ChevronIcon open={open} />
      </button>

      {/* Popover */}
      {open && (
        <div
          ref={popoverRef}
          className="absolute right-0 top-full mt-1.5 z-50 w-72 bg-white rounded-xl shadow-xl border border-brand-navy-30/50 flex flex-col overflow-hidden"
          style={{ maxHeight: '80vh' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-brand-navy-30/40 flex-shrink-0">
            <span className="text-xs font-semibold text-brand-navy">
              Visible columns
              <span className="ml-1.5 text-brand-navy-70 font-normal">
                ({visibleColumns.length} of {ALL_COLUMNS.filter(c => !excludeKeys.includes(c.key)).length})
              </span>
            </span>
            <button
              onClick={resetToDefaults}
              disabled={isDefault}
              className="text-[11px] font-medium text-brand-purple hover:text-brand-purple-70 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
            >
              Reset to defaults
            </button>
          </div>

          <div className="overflow-y-auto flex-1">
            {/* ── Section 1: Active columns (draggable) ── */}
            <div className="border-b border-brand-navy-30/40 pb-1">
              <p className="px-3 pt-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-brand-navy-30">
                Active — drag to reorder
              </p>
              {visibleColumns.map((key, index) => {
                const isDragging = dragIndex === index;
                const isOver = overIndex === index && dragIndex !== null && dragIndex !== index;
                return (
                  <div
                    key={key}
                    draggable
                    onDragStart={e => handleDragStart(e, index)}
                    onDragOver={e => handleDragOver(e, index)}
                    onDrop={e => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center gap-2 px-3 py-1.5 group transition-colors select-none ${
                      isDragging
                        ? 'opacity-40 bg-brand-purple-30/20'
                        : isOver
                          ? 'bg-brand-purple-30/40 border-t-2 border-brand-purple'
                          : 'hover:bg-brand-purple-30/20'
                    }`}
                  >
                    <span className="cursor-grab active:cursor-grabbing text-brand-navy-30 group-hover:text-brand-navy-70 transition-colors">
                      <DragHandle />
                    </span>
                    <span className="flex-1 text-xs text-brand-navy truncate">{labelFor(key)}</span>
                    <button
                      onClick={() => hideColumn(key)}
                      disabled={visibleColumns.length <= 1}
                      title="Hide column"
                      className="opacity-0 group-hover:opacity-100 text-brand-navy-30 hover:text-brand-pink disabled:opacity-0 transition-opacity flex-shrink-0"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>

            {/* ── Section 2: Add columns (grouped checkboxes) ── */}
            <div>
              {/* Collapsible toggle */}
              <button
                onClick={() => setAddOpen(v => !v)}
                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 transition-colors"
              >
                <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-navy-30">
                  Add columns
                </p>
                <ChevronIcon open={addOpen} />
              </button>

              {addOpen && COLUMNS_BY_GROUP.map(({ group, columns }) => {
                const groupKeys = columns.map(c => c.key);
                const visibleCount = groupKeys.filter(k => visibleSet.has(k)).length;
                const allChecked = visibleCount === groupKeys.length;
                const someChecked = visibleCount > 0 && !allChecked;
                const expanded = expandedGroups.has(group);

                return (
                  <div key={group} className="border-t border-brand-navy-30/20">
                    {/* Group header */}
                    <div className="flex items-center px-3 py-2 gap-2 hover:bg-gray-50">
                      <button
                        onClick={() => toggleGroup(group)}
                        className="flex-shrink-0"
                        aria-label={`Toggle all ${group} columns`}
                      >
                        <span className={`flex items-center justify-center w-4 h-4 rounded border transition-colors ${
                          allChecked
                            ? 'bg-brand-purple border-brand-purple text-white'
                            : someChecked
                              ? 'bg-brand-purple-30 border-brand-purple'
                              : 'border-brand-navy-30 bg-white'
                        }`}>
                          {allChecked && (
                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                          {someChecked && <span className="w-2 h-0.5 bg-brand-purple rounded-full block" />}
                        </span>
                      </button>
                      <button
                        onClick={() => toggleGroupExpanded(group)}
                        className="flex-1 flex items-center justify-between text-left"
                      >
                        <span className="text-[11px] font-semibold text-brand-navy-70 uppercase tracking-wide">
                          {group}
                        </span>
                        <span className="flex items-center gap-1.5 text-[10px] text-brand-navy-30">
                          {visibleCount}/{groupKeys.length}
                          <ChevronIcon open={expanded} />
                        </span>
                      </button>
                    </div>

                    {/* Column rows */}
                    {expanded && (
                      <div className="pb-1">
                        {columns.map(col => {
                          const checked = visibleSet.has(col.key);
                          return (
                            <label
                              key={col.key}
                              className="flex items-center gap-2.5 px-3 py-1.5 pl-9 cursor-pointer hover:bg-brand-purple-30/30 transition-colors"
                            >
                              <span className={`flex-shrink-0 flex items-center justify-center w-3.5 h-3.5 rounded border transition-colors ${
                                checked ? 'bg-brand-purple border-brand-purple text-white' : 'border-brand-navy-30 bg-white'
                              }`}>
                                {checked && (
                                  <svg className="w-2 h-2" fill="none" stroke="currentColor" strokeWidth={3.5} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </span>
                              <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggleColumn(col.key)} />
                              <span className="text-xs text-brand-navy-70 leading-tight">
                                {col.label}
                                {col.truncate && (
                                  <span className="ml-1 text-[9px] text-brand-navy-30 font-medium">long text</span>
                                )}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
