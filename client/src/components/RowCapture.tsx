import { useState, useRef, useEffect, useCallback } from 'react';
import { createNote } from '../api/notes';
import { createTask } from '../api/tasks';
import { listUsers } from '../api/users';
import { useAuthStore } from '../store/auth';
import type { User } from '../types';

type CaptureType = 'note' | 'task';

function defaultDueDate() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split('T')[0];
}

interface Props {
  oppId: number;
  oppName: string;
  seOwnerId?: number | null;
  onSaved?: () => void;
}

export default function RowCapture({ oppId, oppName, seOwnerId, onSaved }: Props) {
  const { user } = useAuthStore();
  const defaultType: CaptureType = user?.role === 'manager' ? 'task' : 'note';
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<CaptureType>(defaultType);
  const [text, setText] = useState('');
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [assignedTo, setAssignedTo] = useState<number | null>(seOwnerId ?? null);
  const [users, setUsers] = useState<User[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const btnRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function openPopover(e: React.MouseEvent) {
    e.stopPropagation();
    const rect = btnRef.current!.getBoundingClientRect();
    const left = Math.min(rect.right - 280, window.innerWidth - 296);
    setPos({ top: rect.bottom + 6, left: Math.max(8, left) });
    setText('');
    setType(defaultType);
    setDueDate(defaultDueDate());
    setAssignedTo(seOwnerId ?? null);
    setSaved(false);
    setOpen(true);
    // Lazy-load users for assignee selector
    if (users.length === 0) {
      listUsers().then(setUsers).catch(() => {});
    }
  }

  function close() {
    setOpen(false);
    setSaving(false);
  }

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  const onKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  }, []);
  useEffect(() => {
    if (!open) return;
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onKey]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      if (type === 'note') {
        await createNote(oppId, text.trim());
      } else {
        await createTask(oppId, {
          title: text.trim(),
          due_date: dueDate,
          ...(assignedTo != null ? { assigned_to_id: assignedTo } : {}),
        });
      }
      setSaved(true);
      onSaved?.();
      setTimeout(() => close(), 500);
    } catch {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Trigger button — always visible */}
      <button
        ref={btnRef}
        type="button"
        onClick={openPopover}
        title="Quick capture"
        className="w-6 h-6 rounded-md flex items-center justify-center text-brand-navy-70 hover:bg-brand-purple/10 hover:text-brand-purple transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {/* Popover + backdrop */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />

          <div
            className="fixed z-50 w-72 bg-white rounded-xl shadow-xl border border-brand-navy-30/40 p-3"
            style={{ top: pos.top, left: pos.left }}
            onClick={e => e.stopPropagation()}
          >
            {/* Type toggle */}
            <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 w-fit mb-2.5">
              {(['note', 'task'] as CaptureType[]).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`px-3 py-0.5 rounded-md text-[11px] font-semibold transition-colors capitalize ${
                    type === t
                      ? 'bg-white text-brand-navy shadow-sm'
                      : 'text-brand-navy-70 hover:text-brand-navy'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <form onSubmit={handleSave}>
              <input
                ref={inputRef}
                type="text"
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder={type === 'note' ? 'Write a note…' : 'Task title…'}
                className="w-full px-2.5 py-1.5 rounded-lg border border-brand-navy-30 text-sm text-brand-navy placeholder:text-brand-navy-70 focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-transparent mb-2"
              />

              {type === 'task' && (
                <>
                  {/* Due date */}
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-brand-navy-30 text-xs text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-transparent mb-2"
                  />

                  {/* Assignee */}
                  <select
                    value={assignedTo ?? ''}
                    onChange={e => setAssignedTo(e.target.value ? Number(e.target.value) : null)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-brand-navy-30 text-xs text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-transparent mb-2 bg-white"
                  >
                    <option value="">Unassigned</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </>
              )}

              <div className="flex items-center justify-between">
                <p className="text-[10px] text-brand-navy-70 truncate max-w-[140px]" title={oppName}>
                  → {oppName}
                </p>
                <button
                  type="submit"
                  disabled={!text.trim() || saving || saved}
                  className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                    saved
                      ? 'bg-status-success text-white'
                      : 'bg-brand-purple text-white hover:bg-brand-purple-70 disabled:opacity-40'
                  }`}
                >
                  {saved ? 'Saved ✓' : saving ? '…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </>
  );
}
