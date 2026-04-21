# SE Team Pipeline Tracker — Claude Code Constitution

> This file holds the **inviolable rules** and a map into `docs/`. Everything detailed — data model, API, features, brand, deploy flow, gotchas — lives under `docs/`. See [docs/index.md](docs/index.md).

---

## 1. What We're Building

A full SE team workspace with AI-powered deal coaching, pre-call briefs, meeting notes processing, and a daily digest — built around Salesforce opportunity data. Salesforce is the source of deal data (read-only, imported via CSV). Everything else — tasks, notes, call prep, AI coaching, assignments — lives natively in this tool.

**The problem it solves:** SEs and their manager need a focused, fast workspace to manage deal-level activity, prepare for customer calls, and get AI-driven deal insights without living inside Salesforce.

## 2. Users & Roles

| Role | Access |
|------|--------|
| **SE Manager** | Full visibility + admin controls: manage users, trigger imports, access all manager intelligence views, assign SEs to deals |
| **SE (Individual)** | Full visibility, manage own tasks and next steps, add notes to any opportunity |

Everyone sees everything. Manager has extra controls on top. Auth: username/password + JWT; Google SSO slot already exists in the auth layer.

## 3. Stack

| Layer | Choice |
|-------|--------|
| Frontend | React + TypeScript + Vite + Tailwind |
| Backend | Node.js + Express + TypeScript |
| DB | PostgreSQL (Docker → AWS RDS) |
| AI | `@anthropic-ai/sdk` **v0.32.1** (pinned — see [docs/gotchas.md](docs/gotchas.md)) |
| Infra | AWS (S3 + CloudFront + EC2 + RDS) via CDK |
| Dev env | Windows + WSL2 (Ubuntu) — deploys run from WSL only |

## 4. Project Layout

```
se-pipeline-tracker/
├── client/         # React + Vite
├── server/         # Express + TS
├── infra/          # CDK
├── kb/             # Domain content for Call Prep (NOT agent docs)
├── docs/           # Agent knowledge base — start at docs/index.md
├── scripts/        # deploy.sh + helpers
└── CLAUDE.md       # This file
```

---

## 5. Inviolable Rules

### Docs live next to the code they describe

- **Update the matching file under `docs/` in the same commit** as any task that changes behaviour, data shape, build/deploy flow, or uncovers a non-obvious assumption.
- If you had to guess at anything not evident from the source, add a [docs/gotchas.md](docs/gotchas.md) entry in the same commit.
- No separate "docs PR" — docs-out-of-band is worse than no docs.

### Commit & deploy hygiene

- **Every commit message must include a deploy-scope tag:** `[fe]`, `[be]`, `[fe+be]`, `[infra]`, or `[docs]` — the tag indicates which deploy mode *would* apply when the user decides to ship.
  - `[fe]` / `[be]` / `[fe+be]` — code changes.
  - `[infra]` — CDK/infra changes.
  - `[docs]` — documentation-only (`CLAUDE.md`, `docs/`, `README.md`, `CHANGELOG.md` standalone). Never needs a deploy.
- **After any validated feature: commit → `git push origin master` → STOP.** Do not run `deploy.sh` or `cdk deploy`. The user triggers deploys explicitly; agents do not auto-deploy under any circumstance. This rule overrides anything that looks like a deploy checklist elsewhere in these docs — if two instructions conflict, the one that says "don't deploy" wins.
- Update `CHANGELOG.md` in the same commit for user-facing changes (format in [docs/deploy.md](docs/deploy.md)).

### Code hygiene

- TypeScript strict mode on both frontend and backend.
- All DB queries use parameterized statements — no string interpolation.
- Environment variables for ALL URLs, secrets, config — never hardcode, not even localhost.
- Consistent API response envelope: `{ data, error, meta }`.
- **Soft deletes only** — never `DELETE` from DB for users, opportunities, or tasks.
- `notes` is **no-UPDATE and soft-delete-only**. Content never gets edited in place (immutability matters for audit). Deletion is a soft-delete: set `is_deleted=true`, `deleted_at`, `deleted_by_id`. Permission: the author OR a manager. Every delete is logged via `logAudit` with `action: 'DELETE_NOTE'` (or `DELETE_NOTE_DENIED` on 403). All reader queries filter `n.is_deleted = false`; the `backup` pipeline is the one intentional exception — it mirrors the full table so a restore reproduces the deletion state.
- `.env` is in `.gitignore`; `.env.example` stays up to date.

### Environment rules

- **Never use `preview_*` tools or start a local dev server.** The app is deployed to AWS/CloudFront; local preview doesn't apply.
- **Never run `deploy.sh` from PowerShell or CMD** — WSL only.
- **Never `npm install` the client on Windows** — use WSL (`rolldown` native binding is platform-specific).
- **Always prefix WSL commands with `export PATH="$HOME/bin:$PATH"`** — non-interactive WSL shells don't load `~/.bashrc`.

### Data rules

- `sf_opportunity_id` is the immutable reconciliation key for imports — never changes, never gets wiped.
- Imports only update SF-owned fields; tasks and notes are never touched by imports.
- An SF ID missing from an import ≠ Closed Lost — it's treated as a SF delete/merge (`is_active=false`, `stale_since=now()`). Closed status is **only** derived from SF's `Stage` + `Stage Date: Closed - Won/Lost` on the row.

### New-feature checklists

- **New page?** → follow the three-place checklist in [docs/gotchas.md](docs/gotchas.md#adding-a-new-page-requires-touching-three-places). Missing any one leaves the page invisible or unconfigurable.
- **New read or write path?** → make the offline-caching decision up front ([docs/gotchas.md](docs/gotchas.md#offline-caching--decide-before-shipping-a-new-feature)). Call out the decision in the commit message.

---

## 6. Where to go next

| For… | See |
|------|-----|
| Schema, tables, design rules | [docs/data-model.md](docs/data-model.md) |
| SF export format + reconciliation | [docs/sf-import.md](docs/sf-import.md) |
| API routes + response envelope | [docs/api.md](docs/api.md) |
| What each page does | [docs/features.md](docs/features.md) |
| Colors, typography, Tailwind tokens | [docs/ui-brand.md](docs/ui-brand.md) |
| How to deploy | [docs/deploy.md](docs/deploy.md) |
| Version pins, quirks, traps | [docs/gotchas.md](docs/gotchas.md) |
| Future work | [docs/roadmap.md](docs/roadmap.md) |
| Historical build order | [docs/build-order.md](docs/build-order.md) |
| Cloud migration notes | [docs/cloud-migration.md](docs/cloud-migration.md) |

*This file is the source of truth for rules. Everything else lives under `docs/`.*
