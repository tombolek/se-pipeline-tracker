import { useState } from 'react';
import type { Note } from '../../types';
import { formatDateTime } from '../../utils/formatters';

// ── NoteItem ───────────────────────────────────────────────────────────────────

export function NoteItem({ note }: { note: Note }) {
  return (
    <div className="py-3 border-b border-brand-navy-30/40 last:border-0">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-5 h-5 rounded-full bg-brand-purple flex items-center justify-center text-[9px] font-semibold text-white flex-shrink-0">
          {note.author_name?.[0]?.toUpperCase()}
        </div>
        <span className="text-xs font-medium text-brand-navy">{note.author_name}</span>
        <span className="text-[11px] text-brand-navy-70">{formatDateTime(note.created_at)}</span>
      </div>
      <p className="text-sm text-brand-navy leading-relaxed pl-7 whitespace-pre-wrap">{note.content}</p>
    </div>
  );
}

// ── AddNoteForm ────────────────────────────────────────────────────────────────

export function AddNoteForm({ onAdd }: { onAdd: (content: string) => Promise<void> }) {
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSaving(true);
    try {
      await onAdd(content.trim());
      setContent('');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-2">
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder="Add a note… (shift+enter for newline)"
        rows={3}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(e as unknown as React.FormEvent); } }}
        className="w-full px-3 py-2 rounded-lg border border-brand-navy-30 text-sm text-brand-navy placeholder:text-brand-navy-70 resize-none focus:outline-none focus:ring-2 focus:ring-brand-purple"
      />
      <button
        type="submit"
        disabled={saving || !content.trim()}
        className="px-3 py-1.5 bg-brand-purple text-white text-xs font-medium rounded-lg hover:bg-brand-purple-70 disabled:opacity-50 transition-colors"
      >
        {saving ? 'Saving…' : 'Add note'}
      </button>
    </form>
  );
}
