# Gotchas

Non-obvious rules, traps, and workarounds. Every entry: symptom → why → what to do. Add a new entry the moment you have to guess at something that isn't evident from the code.

## body-parser default is 100 KB — a long transcript trips `PayloadTooLargeError`

**Symptom:** Process Call Notes (and any other endpoint that accepts a large text blob) fails with a generic "Internal server error" on the client, with no `[process-notes] START` log line anywhere. Server log shows `[unhandled] POST /api/v1/opportunities/…/process-notes` followed by `PayloadTooLargeError: request entity too large`. Short transcripts work; long ones (30-minute+ calls) fail.

**Why it happened:** `express.json()` without a `limit` argument defaults to 100 KB. Body-parser rejects the request **before the route handler runs**, so the route's own try/catch never sees it. The rejection lands in the global error middleware at [server/src/index.ts](../server/src/index.ts), which used to return a plain 500 with no hint about payload size.

**What to do now:** the JSON body limit is set to `5mb` at [server/src/index.ts:36](../server/src/index.ts:36) — plenty for any realistic meeting transcript. The global handler also special-cases `entity.too.large` and returns a 413 with a user-actionable "Transcript is too large" message so the Process Call Notes page can surface something useful. If you add a new route that accepts arbitrarily-large text (RFP uploads, file bodies), revisit the limit — don't rely on the default.

## Never auto-deploy — even when a "deploy sequence" is in front of you

**Symptom:** older versions of `CLAUDE.md` and `docs/deploy.md` contained a "commit → push → deploy" checklist, implying the agent should run `deploy.sh` at the end of every feature. A real-world incident (2026-04-17) had the agent ship a frontend change to CloudFront without being asked, because the checklist was still partially present in the docs.

**Why it happened:** the old constitution's "always commit, push, and deploy" line contradicted the user's memory rule ("never auto-deploy unless explicitly asked"). When docs contradict, agents tend to follow the more specific/actionable instruction — which was the one that said "deploy."

**What to do now:** The hard rule — enforced in [CLAUDE.md § Commit & deploy hygiene](../CLAUDE.md#commit--deploy-hygiene) and repeated in [deploy.md § After any validated feature](deploy.md#after-any-validated-feature) — is: **commit → push → STOP.** The tag on the commit signals which deploy *would* apply when the user decides to ship; it is not permission to execute. If you ever see a checklist elsewhere that implies "run deploy.sh" as a step the agent should do unprompted, that's a bug in the docs — ignore it and fix it in the same turn.

## Adding a new page requires touching THREE places

Role access for pages lives in three separate places. Missing any one of them will make the page either invisible in the sidebar or impossible to configure. Always touch all three in the same commit as the new page:

1. **Sidebar nav** — add the route to `DEFAULT_MENU_CONFIG.items` in `client/src/utils/menuConfig.ts`. Use `sectionId: null` for top-level placement or a section id (e.g. `'sec-insights'`) to drop it into a section. New defaults auto-appear for existing users on next load — the merge layer in `getMenuConfig()` appends items not present in localStorage. Administration pages remain hard-coded in `SETTINGS_NAV` in `client/src/components/Sidebar.tsx` (role-gated, not user-configurable).
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
