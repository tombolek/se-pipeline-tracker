import fs from 'fs';
import path from 'path';

export interface ChangelogBullet {
  text: string;
}

export interface ChangelogSection {
  kind: 'Added' | 'Changed' | 'Fixed' | 'Removed' | 'Deprecated' | 'Security' | string;
  bullets: ChangelogBullet[];
}

export interface ChangelogEntry {
  date: string;            // ISO yyyy-mm-dd
  sections: ChangelogSection[];
}

export interface Changelog {
  entries: ChangelogEntry[];
  latest_date: string | null;
}

// CHANGELOG.md can live next to the server working dir (dev runs `npm run dev` from server/),
// one level up (monorepo root), or in /app when containerized (we mount it as a volume in prod).
function resolveChangelogPath(): string | null {
  const candidates = [
    path.resolve(process.cwd(), 'CHANGELOG.md'),        // /app/CHANGELOG.md in container
    path.resolve(process.cwd(), '../CHANGELOG.md'),     // server cwd → ../CHANGELOG.md (dev)
    path.resolve(__dirname, '../../CHANGELOG.md'),      // dist/services → server/../
    path.resolve(__dirname, '../../../CHANGELOG.md'),   // src/services → project root
  ];
  for (const p of candidates) {
    // existsSync returns true for directories too — Docker creates an empty
    // directory at the mount path if the host file is missing, so reject
    // anything that isn't a plain file.
    try {
      const stat = fs.statSync(p);
      if (stat.isFile()) return p;
    } catch {
      // path doesn't exist — try the next candidate
    }
  }
  return null;
}

const DATE_HEADER_RE = /^##\s+(\d{4}-\d{2}-\d{2})\s*$/;
const SECTION_HEADER_RE = /^###\s+(.+?)\s*$/;
const BULLET_RE = /^[-*]\s+(.+)$/;

export function parseChangelogMarkdown(md: string): Changelog {
  const lines = md.split(/\r?\n/);
  const entries: ChangelogEntry[] = [];
  let currentEntry: ChangelogEntry | null = null;
  let currentSection: ChangelogSection | null = null;
  let currentBullet: ChangelogBullet | null = null;

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');

    const dateMatch = DATE_HEADER_RE.exec(line);
    if (dateMatch) {
      currentEntry = { date: dateMatch[1], sections: [] };
      entries.push(currentEntry);
      currentSection = null;
      currentBullet = null;
      continue;
    }

    if (!currentEntry) continue;

    const sectionMatch = SECTION_HEADER_RE.exec(line);
    if (sectionMatch) {
      currentSection = { kind: sectionMatch[1], bullets: [] };
      currentEntry.sections.push(currentSection);
      currentBullet = null;
      continue;
    }

    if (!currentSection) continue;

    const bulletMatch = BULLET_RE.exec(line);
    if (bulletMatch) {
      currentBullet = { text: bulletMatch[1].trim() };
      currentSection.bullets.push(currentBullet);
      continue;
    }

    // Continuation line for the previous bullet (indented or plain-text continuation)
    if (currentBullet && line.trim().length > 0 && /^\s/.test(raw)) {
      currentBullet.text += ' ' + line.trim();
    }
  }

  const latest_date = entries[0]?.date ?? null;
  return { entries, latest_date };
}

let cache: { loadedAt: number; changelog: Changelog } | null = null;
const CACHE_MS = 60_000; // re-read the file at most once per minute

export function loadChangelog(): Changelog {
  if (cache && Date.now() - cache.loadedAt < CACHE_MS) return cache.changelog;
  const filePath = resolveChangelogPath();
  if (!filePath) {
    console.warn('[changelog] CHANGELOG.md not found; serving empty list');
    const empty: Changelog = { entries: [], latest_date: null };
    cache = { loadedAt: Date.now(), changelog: empty };
    return empty;
  }
  try {
    const md = fs.readFileSync(filePath, 'utf8');
    const changelog = parseChangelogMarkdown(md);
    cache = { loadedAt: Date.now(), changelog };
    return changelog;
  } catch (e) {
    console.error(`[changelog] Failed to read ${filePath}:`, (e as Error).message);
    const empty: Changelog = { entries: [], latest_date: null };
    // Cache the failure briefly so we don't hammer the filesystem on every
    // request, but use a shorter TTL so a fix is picked up quickly.
    cache = { loadedAt: Date.now(), changelog: empty };
    return empty;
  }
}
