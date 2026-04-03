/**
 * Generic multi-select dropdown filter used in Pipeline and SE Mapping filter bars.
 *
 * Semantics: empty selected array = "no filter" (all rows shown).
 * Visually: [] shows nothing checked (unfiltered state).
 * "Select all" → explicitly checks all options ([...options]) so user can uncheck individually.
 * "Deselect all" → clears back to [] (no filter).
 *
 * Props:
 *   options        — list of string options to show
 *   selected       — currently selected values (empty = all shown)
 *   onChange       — called with new selected array on every toggle
 *   placeholder    — label shown when nothing selected (default "All")
 */
import { useState, useRef, useEffect } from 'react';

interface Props {
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}

export default function MultiSelectFilter({ options, selected, onChange, placeholder = 'All' }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter(v => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  const active = selected.length > 0;

  const label = selected.length === 0
    ? placeholder
    : selected.length === 1
      ? selected[0]
      : `${selected.length} selected`;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors whitespace-nowrap ${
          active
            ? 'bg-brand-purple/10 border-brand-purple text-brand-purple font-medium'
            : 'border-brand-navy-30 text-brand-navy'
        }`}
      >
        {label}
        <svg
          className={`w-3.5 h-3.5 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white rounded-xl shadow-xl border border-brand-navy-30/50 py-1 min-w-[200px] max-h-72 overflow-y-auto">
          <div className="flex border-b border-brand-navy-30/30">
            <button
              onClick={() => onChange([...options])}
              className="flex-1 px-3 py-1.5 text-xs font-medium text-brand-purple hover:bg-brand-purple-30/30 text-left"
            >
              Select all
            </button>
            <button
              onClick={() => onChange([])}
              className="flex-1 px-3 py-1.5 text-xs font-medium text-brand-navy-70 hover:bg-gray-50 text-left border-l border-brand-navy-30/30"
            >
              Deselect all
            </button>
          </div>
          {options.map(opt => {
            const checked = selected.includes(opt);
            return (
              <label key={opt} className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-brand-purple-30/30">
                <span className={`flex-shrink-0 flex items-center justify-center w-3.5 h-3.5 rounded border transition-colors ${
                  checked
                    ? 'bg-brand-purple border-brand-purple text-white'
                    : 'border-brand-navy-30 bg-white'
                }`}>
                  {checked && (
                    <svg className="w-2 h-2" fill="none" stroke="currentColor" strokeWidth={3.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggle(opt)} />
                <span className="text-sm text-brand-navy">{opt}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
