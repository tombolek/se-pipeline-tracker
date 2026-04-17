# Gotchas

Non-obvious rules, traps, and workarounds. Every entry: symptom → why → what to do. Add a new entry the moment you have to guess at something that isn't evident from the code.

## Adding a new page requires touching THREE places

Role access for pages lives in three separate places. Missing any one of them will make the page either invisible in the sidebar or impossible to configure. Always touch all three in the same commit as the new page:

1. **Sidebar nav** — add the route to the relevant nav list so it shows up:
   - Insights pages → `DEFAULT_INSIGHTS_NAV` in `client/src/utils/insightsNav.ts`
   - Main nav pages → `DEFAULT_MAIN_NAV` in `client/src/utils/mainNav.ts`
   - Administration pages → `SETTINGS_NAV` in `client/src/components/Sidebar.tsx`
2. **Role Access admin UI** — add the page to `PAGE_REGISTRY` in `client/src/pages/settings/RoleAccessPage.tsx` so admins can toggle per-role visibility. The `key` must match the route minus the leading slash (e.g. `insights/win-rate`).
3. **Seed the DB** — add a new migration that `INSERT … ON CONFLICT DO NOTHING` into `role_page_access` for every role that should see the page by default. See `server/migrations/041_seed_role_access_for_new_pages.sql` for the pattern. Without this row, the sidebar filter in `Sidebar.tsx` (lines ~152–156) drops the entry even though it's in the nav config.

Forget step 3 → existing users never see the page. Forget step 2 → admins can't grant access. Forget step 1 → nothing ever shows up.

## Offline caching — decide before shipping a new feature

The app ships with offline / PWA support (Issue #117). The cache holds favorites, opportunities, notes, tasks, mentions, Home digest, Calendar, PoC Board, RFx Board, SE Mapping, and the user directory. Anything else is **not** offline-available unless you deliberately wire it in.

When you add a notable user-facing feature (a new page, a new data source, a new write path), decide what the offline behaviour should be before shipping:

1. **Should the read data be cached?**
   - Small per-user data (lists, dashboards, feeds) useful off VPN → yes, wrap fetch with `cacheRead()` + mirror to IndexedDB (pattern: `client/src/api/opportunities.ts`, `client/src/pages/CalendarPage.tsx`).
   - Expensive / sensitive / rarely-viewed (audit logs, AI generations, file attachments, admin-only reports) → deliberate decision. Defaults: AI generations = network-only, admin pages = network-only, file attachments = on-demand (pinning via favorites).
   - Uncached pages should render `<OfflineUnavailable label="…" />` on fetch failure, not leave the user on a broken loader or red error banner.

2. **Should a new write be queueable offline?**
   - Append-only (notes, audit events) → always queueable, no conflict risk. Pattern: `createNote` in `client/src/api/notes.ts`.
   - Mutating (edits, reassigns) → queueable ONLY with server-side version guard (`expected_updated_at` in PATCH body + 409 with current state on mismatch). Pattern: `server/src/routes/tasks.ts` PATCH handler.
   - Destructive (deletes, admin actions, import triggers) → default network-only. The risk/reward rarely justifies queueing them.
   - In doubt → ask the user before implementing, especially for multi-user or hard-to-reverse writes.

3. **Storage / bandwidth cost** — anything that could push per-user cache over ~10 MB (large binaries, long transcripts, hundreds of rows) needs explicit opt-in rather than automatic caching. The 500 MB cap exists but no single feature should eat a meaningful share.

Call out the offline decision in the commit message, e.g. `[fe+be] Win Rate page — network-only, no cache (admin insights small, rarely needed off VPN)`.

## `npx tsc` doesn't work in this environment

Use an inline node script instead, from the `client/` directory:

```
node -e "const ts = require('typescript'); ..."
```

## Anthropic SDK is pinned at v0.32.1

Server uses `@anthropic-ai/sdk` v0.32.1 (older). Check API compatibility before using newer SDK features.

## Never `npm install` the client on Windows

The `rolldown` native binding is platform-specific — install from inside WSL only:

```
wsl -e bash -ic 'cd /mnt/c/... && npm install'
```

## Non-interactive WSL shells don't load `~/.bashrc`

Always prefix WSL commands with `export PATH="$HOME/bin:$PATH"` so `aws` resolves to the Windows symlink:

```
wsl -e bash -ic 'export PATH="$HOME/bin:$PATH" && ...'
```

## SF ID missing from an import ≠ Closed Lost

If an SF ID disappears from the feed while the deal is still open, it's treated as a SF delete/merge — soft-hidden via `is_active=false` + `stale_since=now()`. Closed Lost status is **only** derived from SF's own `Stage = 'Closed Lost'` + `Stage Date: Closed - Won/Lost` on the row. Stale opps are **not** marked Closed Lost.

## `sf_raw_fields` JSONB — add first, promote later

New SF columns land automatically in `sf_raw_fields`. To promote one to a dedicated column later: add a migration, backfill from `sf_raw_fields`, update the import mapper. No data is ever lost.

## First import must be open-only

The very first import into an empty database must contain **open opportunities only** — no Closed Lost. This establishes the baseline. From the second import onwards, any SF ID absent from the feed is treated as newly Closed Lost and triggers the unread badge.

## Append-only writes: no UPDATE or DELETE on `notes`

Notes are immutable by design. Never issue UPDATE or DELETE on the `notes` table. Append only.

## Soft deletes only

Users, opportunities, tasks — never `DELETE` from DB. Use `is_active=false` (users/opportunities) or `is_deleted=true` (tasks, inbox).

## The import endpoint is dual-mode

`POST /api/v1/opportunities/import` accepts both manual file upload (multipart/form-data) AND programmatic POST. Future automation (Cowork/scheduled script) can trigger it directly — don't assume it's UI-only.

## Salesforce `.xls` exports are HTML, not XLS binary

The SF export parser uses an HTML table reader, not a binary XLS parser. Don't swap in a binary XLS library without re-checking the export format.
