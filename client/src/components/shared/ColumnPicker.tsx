/**
 * ColumnPicker — reusable column visibility popover (Issue #11 / #8b)
 *
 * Props:
 *   visibleColumns  — currently active column keys
 *   defaultColumns  — the page's default set (used for "Reset to defaults")
 *   onChange        — called with the new full column key array on every change
 *
 * The caller is responsible for persisting changes via updateMyPreferences().
 */
import { useState, useRef, useEffect } from 'react';
import { ALL_COLUMNS, COLUMN_GROUPS } from '../../constants/columnDefs';
import type { ColumnGroup } from '../../constants/columnDefs';

interface Props {
  visibleColumns: string[];
  defaultColumns: readonly string[];
  onChange: (cols: string[]) => void;
}

// Grid icon
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

// Chevron icon
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

// Group the full column list by group label
const COLUMNS_BY_GROUP = COLUMN_GROUPS.map(group => ({
  group,
  columns: ALL_COLUMNS.filter(c => c.group === group),
}));

export default function ColumnPicker({ visibleColumns, defaultColumns, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<ColumnGroup>>(
    () => new Set(COLUMN_GROUPS)
  );
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
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  const visibleSet = new Set(visibleColumns);

  function toggleColumn(key: string) {
    const next = new Set(visibleSet);
    if (next.has(key)) {
      // don't allow deselecting the last column
      if (next.size <= 1) return;
      next.delete(key);
    } else {
      next.add(key);
    }
    // Preserve the canonical order from ALL_COLUMNS
    onChange(ALL_COLUMNS.map(c => c.key).filter(k => next.has(k)));
  }

  function toggleGroup(group: ColumnGroup) {
    const groupKeys = ALL_COLUMNS.filter(c => c.group === group).map(c => c.key);
    const allVisible = groupKeys.every(k => visibleSet.has(k));
    const next = new Set(visibleSet);
    if (allVisible) {
      // deselect all in group, but keep at least 1 column total
      groupKeys.forEach(k => next.delete(k));
      if (next.size === 0) return;
    } else {
      groupKeys.forEach(k => next.add(k));
    }
    onChange(ALL_COLUMNS.map(c => c.key).filter(k => next.has(k)));
  }

  function resetToDefaults() {
    onChange([...defaultColumns]);
  }

  function toggleGroupExpanded(group: ColumnGroup) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  const isDefault =
    visibleColumns.length === defaultColumns.length &&
    visibleColumns.every((k, i) => k === defaultColumns[i]);

  return (
    <div className="relative">
      {/* Trigger button */}
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
          className="
            absolute right-0 top-full mt-1.5 z-50
            w-72 bg-white rounded-xl shadow-xl
            border border-brand-navy-30/50
            flex flex-col overflow-hidden
          "
          style={{ maxHeight: '70vh' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-brand-navy-30/40">
            <span className="text-xs font-semibold text-brand-navy">
              Visible columns
              <span className="ml-1.5 text-brand-navy-70 font-normal">
                ({visibleColumns.length} of {ALL_COLUMNS.length})
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

          {/* Groups + columns */}
          <div className="overflow-y-auto flex-1">
            {COLUMNS_BY_GROUP.map(({ group, columns }) => {
              const groupKeys = columns.map(c => c.key);
              const visibleCount = groupKeys.filter(k => visibleSet.has(k)).length;
              const allChecked = visibleCount === groupKeys.length;
              const someChecked = visibleCount > 0 && !allChecked;
              const expanded = expandedGroups.has(group);

              return (
                <div key={group} className="border-b border-brand-navy-30/20 last:border-0">
                  {/* Group header row */}
                  <div className="flex items-center px-3 py-2 gap-2 hover:bg-gray-50">
                    {/* Group checkbox */}
                    <button
                      onClick={() => toggleGroup(group)}
                      className="flex-shrink-0"
                      aria-label={`Toggle all ${group} columns`}
                    >
                      <span className={`
                        flex items-center justify-center w-4 h-4 rounded border transition-colors
                        ${allChecked
                          ? 'bg-brand-purple border-brand-purple text-white'
                          : someChecked
                          ? 'bg-brand-purple-30 border-brand-purple'
                          : 'border-brand-navy-30 bg-white'
                        }
                      `}>
                        {allChecked && (
                          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        {someChecked && (
                          <span className="w-2 h-0.5 bg-brand-purple rounded-full block" />
                        )}
                      </span>
                    </button>

                    {/* Group label — click to expand/collapse */}
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
                            <span className={`
                              flex-shrink-0 flex items-center justify-center w-3.5 h-3.5 rounded border transition-colors
                              ${checked
                                ? 'bg-brand-purple border-brand-purple text-white'
                                : 'border-brand-navy-30 bg-white'
                              }
                            `}>
                              {checked && (
                                <svg className="w-2 h-2" fill="none" stroke="currentColor" strokeWidth={3.5} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </span>
                            <input
                              type="checkbox"
                              className="sr-only"
                              checked={checked}
                              onChange={() => toggleColumn(col.key)}
                            />
                            <span className="text-xs text-brand-navy-70 leading-tight">
                              {col.label}
                              {col.truncate && (
                                <span className="ml-1 text-[9px] text-brand-navy-30 font-medium">
                                  long text
                                </span>
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
      )}
    </div>
  );
}
