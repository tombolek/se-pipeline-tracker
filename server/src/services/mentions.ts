/**
 * @-mention parsing for notes (Issue #113).
 *
 * Handle syntax: `@<email-local-part>` — i.e. everything before the `@` in a
 * user's email. This matches the autocomplete UX on the client and sidesteps
 * name collisions (two "Tom"s on the team). Allowed characters: letters,
 * digits, dot, underscore, hyphen — matching real-world Ataccama addresses
 * like `tomas.bolek`.
 *
 * The parser is tolerant: a dangling `@` or an unmatched handle is silently
 * ignored so notes never fail to save because of a typo.
 */
import { query } from '../db/index.js';

const MENTION_RE = /(?:^|[^a-zA-Z0-9._-])@([a-zA-Z0-9._-]+)/g;

export function extractHandles(content: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = MENTION_RE.exec(content)) !== null) {
    out.add(m[1].toLowerCase());
  }
  return [...out];
}

/**
 * Resolve mention handles to user ids. Drops the author's own id (mentioning
 * yourself in your own note creates no useful notification). Inactive users
 * are excluded — they shouldn't show up on the Home feed.
 */
export async function parseMentions(content: string, authorId: number): Promise<number[]> {
  const handles = extractHandles(content);
  if (handles.length === 0) return [];

  // split_part(email, '@', 1) = local-part, lowercased for case-insensitive match.
  const rows = await query<{ id: number }>(
    `SELECT id FROM users
     WHERE is_active = true
       AND id <> $1
       AND lower(split_part(email, '@', 1)) = ANY($2::text[])`,
    [authorId, handles],
  );
  return rows.map(r => r.id);
}
