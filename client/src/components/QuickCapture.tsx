import { useState, useEffect, useRef, useCallback } from 'react';
import { usePipelineStore } from '../store/pipeline';
import { useAuthStore } from '../store/auth';
import { listOpportunities } from '../api/opportunities';
import { createNote } from '../api/notes';
import { createTask } from '../api/tasks';
import { createInboxItem } from '../api/inbox';
import type { Opportunity } from '../types';

type CaptureType = 'note' | 'task';

function defaultDueDate() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split('T')[0];
}

export default function QuickCapture() {
  const { quickCaptureOpen, closeQuickCapture } = usePipelineStore();
  const { user } = useAuthStore();
  const defaultType: CaptureType = user?.role === 'manager' ? 'task' : 'note';

  const [type, setType] = useState<CaptureType>(defaultType);
  const [text, setText] = useState('');
  const [dueDate, setDueDate] = useState(() => defaultDueDate());
  const [oppSearch, setOppSearch] = useState('');
  const [oppResults, setOppResults] = useState<Opportunity[]>([]);
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset state on open — focus the opportunity search first so the typical
  // flow is: Ctrl-K → type → ↓ → Enter (selects opp + jumps to textarea) → type note.
  useEffect(() => {
    if (quickCaptureOpen) {
      setText('');
      setType(defaultType);
      setDueDate(defaultDueDate());
      setOppSearch('');
      setOppResults([]);
      setSelectedOpp(null);
      setShowDropdown(false);
      setHighlightIdx(0);
      setSaved(false);
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [quickCaptureOpen]);

  // Escape key
  useEffect(() => {
    if (!quickCaptureOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeQuickCapture();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [quickCaptureOpen, closeQuickCapture]);

  // Debounced opp search
  const handleOppSearchChange = useCallback((value: string) => {
    setOppSearch(value);
    setSelectedOpp(null);
    setHighlightIdx(0);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) { setOppResults([]); setShowDropdown(false); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await listOpportunities({ search: value, include_qualify: true, limit: 20 });
        setOppResults(results.slice(0, 8));
        setShowDropdown(results.length > 0);
        setHighlightIdx(0);
      } catch { /* ignore */ }
    }, 300);
  }, []);

  function selectOpp(opp: Opportunity) {
    setSelectedOpp(opp);
    setOppSearch('');
    setOppResults([]);
    setShowDropdown(false);
    // Auto-jump to the note/task text so the user can start typing immediately.
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown || oppResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(i => Math.min(i + 1, oppResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opp = oppResults[highlightIdx];
      if (opp) selectOpp(opp);
    }
  }

  function clearOpp() {
    setSelectedOpp(null);
    setOppSearch('');
    setTimeout(() => searchRef.current?.focus(), 50);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      if (selectedOpp) {
        if (type === 'note') {
          await createNote(selectedOpp.id, text.trim());
        } else {
          await createTask(selectedOpp.id, { title: text.trim(), due_date: dueDate });
        }
      } else {
        await createInboxItem(text.trim(), type === 'task' ? 'todo' : 'note');
      }
      setSaved(true);
      setTimeout(() => closeQuickCapture(), 600);
    } catch {
      setSaving(false);
    }
  }

  if (!quickCaptureOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-brand-navy/40 backdrop-blur-[2px] z-50"
        onClick={closeQuickCapture}
      />

      {/* Modal card */}
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <div
          className="w-full max-w-lg bg-white rounded-lg shadow-lg pointer-events-auto"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 className="text-sm font-semibold text-brand-navy">Quick Capture</h2>
            <button
              onClick={closeQuickCapture}
              className="w-6 h-6 rounded-full bg-brand-navy-30/50 hover:bg-brand-navy-30 flex items-center justify-center text-brand-navy-70 hover:text-brand-navy transition-colors"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="px-5 pb-5 space-y-3">
            {/* Type toggle */}
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
              {(['note', 'task'] as CaptureType[]).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`px-4 py-1 rounded-md text-xs font-semibold transition-colors ${
                    type === t
                      ? 'bg-white text-brand-navy shadow-sm'
                      : 'text-brand-navy-70 hover:text-brand-navy'
                  }`}
                >
                  {t === 'note' ? 'Note on deal' : 'Task for someone'}
                </button>
              ))}
            </div>

            {/* Opportunity link — first field, focused on open */}
            <div>
              <p className="text-[11px] text-brand-navy-70 font-medium mb-1.5">
                Link to opportunity <span className="font-normal">(optional — Tab to skip)</span>
              </p>

              {selectedOpp ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-brand-purple-30/40 rounded-lg border border-brand-purple/20">
                  <svg className="w-3.5 h-3.5 text-brand-purple flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  <span className="text-xs font-medium text-brand-navy flex-1 min-w-0 truncate">{selectedOpp.name}</span>
                  <button type="button" onClick={clearOpp} className="text-brand-navy-70 hover:text-brand-navy">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    ref={searchRef}
                    type="text"
                    value={oppSearch}
                    onChange={e => handleOppSearchChange(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                    onFocus={() => oppResults.length > 0 && setShowDropdown(true)}
                    placeholder="Search opportunities… (↓ then Enter to pick)"
                    className="w-full px-3 py-2 rounded-lg border border-brand-navy-30 text-sm text-brand-navy placeholder:text-brand-navy-70 focus:outline-none focus:ring-[3px] focus:ring-brand-purple/15 focus:border-brand-purple"
                  />
                  {showDropdown && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-brand-navy-30 rounded-lg shadow-lg overflow-hidden">
                      {oppResults.map((opp, i) => (
                        <button
                          key={opp.id}
                          type="button"
                          onMouseDown={() => selectOpp(opp)}
                          onMouseEnter={() => setHighlightIdx(i)}
                          className={`w-full text-left px-3 py-2.5 transition-colors border-b border-brand-navy-30/30 last:border-0 ${
                            i === highlightIdx ? 'bg-brand-purple-30/50' : 'hover:bg-brand-purple-30/30'
                          }`}
                        >
                          <p className="text-sm font-medium text-brand-navy truncate">{opp.name}</p>
                          <p className="text-xs text-brand-navy-70 truncate">{opp.account_name ?? ''}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Text area */}
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSubmit(e as unknown as React.FormEvent);
                }
              }}
              placeholder={type === 'note' ? 'SE comments, next steps, context…' : 'What needs doing…'}
              rows={4}
              className="w-full px-3 py-2.5 rounded-lg border border-brand-navy-30 text-sm text-brand-navy placeholder:text-brand-navy-70 resize-none focus:outline-none focus:ring-[3px] focus:ring-brand-purple/15 focus:border-brand-purple"
            />

            {/* Due date (task only) */}
            {type === 'task' && (
              <div>
                <p className="text-[11px] text-brand-navy-70 font-medium mb-1.5">Due date</p>
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-brand-navy-30 text-sm text-brand-navy focus:outline-none focus:ring-[3px] focus:ring-brand-purple/15 focus:border-brand-purple"
                />
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-1">
              <p className="text-[11px] text-brand-navy-70">
                {selectedOpp
                  ? `Saves as ${type} on ${selectedOpp.name}`
                  : 'Saves to Inbox'}
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={closeQuickCapture}
                  className="text-xs text-brand-navy-70 hover:text-brand-navy transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!text.trim() || saving || saved}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    saved
                      ? 'bg-status-success text-white'
                      : 'bg-brand-purple text-white hover:bg-brand-purple-70 disabled:opacity-40'
                  }`}
                >
                  {saved ? 'Saved!' : saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
