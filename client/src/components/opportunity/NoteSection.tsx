import { useEffect, useMemo, useRef, useState } from 'react';
import type { Note, NoteMention, User } from '../../types';
import { formatDateTime } from '../../utils/formatters';
import { useUsers } from '../../hooks/useUsers';

// ── NoteItem ───────────────────────────────────────────────────────────────────

/**
 * Renders note content with `@handle` tokens highlighted as pill-style chips
 * when the handle resolves to a known mentioned user. Unresolved handles stay
 * as plain text so there's no misleading styling.
 */
function renderContentWithMentions(content: string, mentions: NoteMention[] | undefined): React.ReactNode {
  if (!mentions || mentions.length === 0) return content;
  const byHandle = new Map<string, NoteMention>();
  for (const m of mentions) {
    const local = m.email.split('@')[0].toLowerCase();
    byHandle.set(local, m);
  }
  // Same regex as server-side parser — keep in sync.
  const re = /(^|[^a-zA-Z0-9._-])@([a-zA-Z0-9._-]+)/g;
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const full = m[0];
    const lead = m[1];
    const handle = m[2].toLowerCase();
    const user = byHandle.get(handle);
    const start = m.index;
    if (start > last) out.push(content.slice(last, start));
    if (user) {
      if (lead) out.push(lead);
      out.push(
        <span
          key={`mention-${start}`}
          className="inline-block px-1 rounded bg-brand-purple-30 text-brand-purple dark:text-accent-purple font-medium"
          title={user.email}
        >
          @{user.name}
        </span>,
      );
    } else {
      out.push(full);
    }
    last = start + full.length;
  }
  if (last < content.length) out.push(content.slice(last));
  return out;
}

export function NoteItem({
  note,
  canDelete = false,
  onDelete,
}: {
  note: Note;
  /** Whether the current user may delete this note (author or manager). */
  canDelete?: boolean;
  onDelete?: (id: number) => void | Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  return (
    <div className="group py-3 px-2 -mx-2 border-b border-brand-navy-30/40 dark:border-ink-border-soft last:border-0" data-cite-target={`note:${note.id}`}>
      <div className="flex items-center gap-2 mb-1">
        <div className="w-5 h-5 rounded-full bg-brand-purple dark:bg-accent-purple flex items-center justify-center text-[9px] font-semibold text-white flex-shrink-0">
          {note.author_name?.[0]?.toUpperCase()}
        </div>
        <span className="text-xs font-medium text-brand-navy dark:text-fg-1">{note.author_name}</span>
        <span className="text-[11px] text-brand-navy-70 dark:text-fg-2">{formatDateTime(note.created_at)}</span>
        {canDelete && onDelete && (
          <div className="ml-auto flex items-center gap-2">
            {confirming ? (
              <>
                <span className="text-[10px] text-brand-navy-70 dark:text-fg-2">Delete this note?</span>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={async () => {
                    setDeleting(true);
                    try { await onDelete(note.id); } finally { setDeleting(false); setConfirming(false); }
                  }}
                  className="text-[10px] font-semibold text-status-overdue dark:text-status-d-overdue hover:underline disabled:opacity-50"
                >
                  {deleting ? 'Deleting…' : 'Yes, delete'}
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setConfirming(false)}
                  className="text-[10px] text-brand-navy-70 dark:text-fg-2 hover:text-brand-navy dark:text-fg-1 disabled:opacity-50"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="text-[10px] text-brand-navy-30 dark:text-fg-4 hover:text-status-overdue dark:text-status-d-overdue transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                title="Delete this note"
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>
      <p className="text-sm text-brand-navy dark:text-fg-1 leading-relaxed pl-7 whitespace-pre-wrap">
        {renderContentWithMentions(note.content, note.mentions)}
      </p>
    </div>
  );
}

// ── AddNoteForm ────────────────────────────────────────────────────────────────

interface MentionState {
  /** Character index where the current `@` sits in the textarea value. */
  anchor: number;
  /** Text after the `@` up to the cursor (filter query). */
  query: string;
  /** Highlighted suggestion row. */
  index: number;
}

/**
 * Detects an in-progress mention: a `@` with no whitespace between it and
 * the cursor. Returns null if the cursor isn't inside a mention token.
 */
function detectMention(value: string, cursor: number): { anchor: number; query: string } | null {
  if (cursor <= 0) return null;
  // Walk backwards from the cursor looking for `@`. Stop on whitespace or
  // newline — at that point we're clearly not in a handle.
  let i = cursor - 1;
  while (i >= 0) {
    const ch = value[i];
    if (ch === '@') {
      const before = i === 0 ? ' ' : value[i - 1];
      // Only trigger when `@` starts the string or follows whitespace, so
      // email addresses (`user@host`) don't kick off the popover.
      if (!/[\s(\[{]/.test(before) && i !== 0) return null;
      const query = value.slice(i + 1, cursor);
      if (!/^[a-zA-Z0-9._-]*$/.test(query)) return null;
      return { anchor: i, query };
    }
    if (/\s/.test(ch)) return null;
    i--;
  }
  return null;
}

export function AddNoteForm({ onAdd, onCancel }: { onAdd: (content: string) => Promise<void>; onCancel: () => void }) {
  const { users } = useUsers();
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [mention, setMention] = useState<MentionState | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Rank candidates: active users whose handle OR name matches the query,
  // sorted so exact-prefix handle matches float to the top.
  const candidates = useMemo(() => {
    if (!mention) return [] as User[];
    const q = mention.query.toLowerCase();
    const scored = users
      .filter(u => u.is_active)
      .map(u => {
        const handle = u.email.split('@')[0].toLowerCase();
        const name = u.name.toLowerCase();
        let score = -1;
        if (!q) score = 0;
        else if (handle.startsWith(q)) score = 3;
        else if (name.startsWith(q)) score = 2;
        else if (handle.includes(q) || name.includes(q)) score = 1;
        return { u, score };
      })
      .filter(s => s.score >= 0)
      .sort((a, b) => b.score - a.score || a.u.name.localeCompare(b.u.name))
      .slice(0, 6)
      .map(s => s.u);
    return scored;
  }, [users, mention]);

  // Keep the highlighted index in-range as the candidate list shrinks while
  // the user types.
  useEffect(() => {
    if (!mention) return;
    if (mention.index >= candidates.length && candidates.length > 0) {
      setMention({ ...mention, index: 0 });
    }
  }, [candidates, mention]);

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setContent(value);
    const cursor = e.target.selectionStart ?? value.length;
    const hit = detectMention(value, cursor);
    setMention(hit ? { anchor: hit.anchor, query: hit.query, index: 0 } : null);
  }

  function applyMention(u: User) {
    if (!mention) return;
    const handle = u.email.split('@')[0];
    const before = content.slice(0, mention.anchor);
    const after = content.slice(mention.anchor + 1 + mention.query.length);
    const insert = `@${handle} `;
    const next = before + insert + after;
    setContent(next);
    setMention(null);
    // Move cursor to just after the inserted handle.
    const pos = (before + insert).length;
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) { ta.focus(); ta.setSelectionRange(pos, pos); }
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mention && candidates.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMention({ ...mention, index: (mention.index + 1) % candidates.length });
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMention({ ...mention, index: (mention.index - 1 + candidates.length) % candidates.length });
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        applyMention(candidates[mention.index]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMention(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit(e as unknown as React.FormEvent);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSaving(true);
    try {
      await onAdd(content.trim());
      setContent('');
      setMention(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-2 p-3 bg-gray-50 dark:bg-ink-0 rounded-lg border border-brand-navy-30 space-y-2">
      <div className="relative">
        <textarea
          ref={textareaRef}
          autoFocus
          value={content}
          onChange={onChange}
          placeholder="Add a note… use @ to mention a teammate (shift+enter for newline)"
          rows={3}
          onKeyDown={onKeyDown}
          className="w-full px-3 py-2 rounded border border-brand-navy-30 text-sm text-brand-navy dark:text-fg-1 placeholder:text-brand-navy-70 dark:text-fg-2 resize-none focus:outline-none focus:ring-2 focus:ring-brand-purple"
        />
        {mention && candidates.length > 0 && (
          <ul
            className="absolute left-2 bottom-full mb-1 z-30 w-64 bg-white dark:bg-ink-1 rounded-lg border border-brand-navy-30 shadow-xl overflow-hidden"
            onMouseDown={e => e.preventDefault() /* keep textarea focus */}
          >
            {candidates.map((u, i) => {
              const handle = u.email.split('@')[0];
              return (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => applyMention(u)}
                    onMouseEnter={() => setMention(m => m ? { ...m, index: i } : m)}
                    className={`w-full px-3 py-1.5 text-left text-xs transition-colors ${
                      i === mention.index ? 'bg-brand-purple-30/40 dark:bg-accent-purple-soft' : 'hover:bg-gray-50 dark:bg-ink-0'
                    }`}
                  >
                    <div className="font-medium text-brand-navy dark:text-fg-1">{u.name}</div>
                    <div className="text-brand-navy-70 dark:text-fg-2">@{handle}</div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving || !content.trim()}
          className="px-3 py-1 bg-brand-purple dark:bg-accent-purple text-white text-xs font-medium rounded hover:bg-brand-purple-70 dark:hover:opacity-90 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Add note'}
        </button>
        <button type="button" onClick={onCancel} className="px-3 py-1 text-xs text-brand-navy-70 dark:text-fg-2 hover:text-brand-navy dark:text-fg-1 transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}
