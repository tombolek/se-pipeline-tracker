# API Routes

All routes require JWT auth except `/auth/login`. Prefix: `/api/v1/`

> Source of truth for handler behaviour: `server/src/routes/`. This file documents the route surface and contracts; follow the file names to read the handlers.

```
# Auth
POST   /auth/login
POST   /auth/logout
GET    /auth/me

# Opportunities (open pipeline)
GET    /opportunities                    ?stage=&se_owner=&search=&sort=&include_qualify=true|false
GET    /opportunities/:id                (includes tasks + notes)
PATCH  /opportunities/:id                (se_owner only — Manager)
POST   /opportunities/import             (file upload or raw POST — Manager)
GET    /opportunities/import/history     (Manager)

# Closed Lost
GET    /opportunities/closed-lost        sorted by closed_at DESC; includes unread count
POST   /opportunities/closed-lost/mark-read   body: { ids: [...] }  — marks as seen

# Tasks
GET    /tasks                            (my tasks — current user)
POST   /opportunities/:id/tasks
PATCH  /tasks/:id
DELETE /tasks/:id                        (soft delete)

# Notes
GET    /opportunities/:id/notes
POST   /opportunities/:id/notes          (append-only)

# Manager Intelligence
GET    /insights/stage-movement          ?days=7|14|30
GET    /insights/missing-notes           ?threshold_days=
GET    /insights/team-workload
GET    /insights/overdue-tasks

# AI
POST   /opportunities/:id/summary        (calls Claude API)

# Similarity (no AI)
GET    /opportunities/:id/similar-deals  (top closed-won/lost matches, SQL+TS scoring, issue #111)

# Similar Deals — AI fallback (issue #111 lever 3)
GET    /opportunities/:id/kb-playbook/cached     cached playbook + source count
POST   /opportunities/:id/kb-playbook/generate   synthesize from KB via Claude, cache 7d

# Similar Deals — AI re-rank / per-result insights (issue #111 lever 2)
GET    /opportunities/:id/similar-deals/insights/cached     cached insights
POST   /opportunities/:id/similar-deals/insights/generate   per-candidate "why it matches", cache 7d

# Knowledge Base admin (Manager only)
GET    /admin/kb/files                   list KB files with disk + DB metadata
GET    /admin/kb/files/:filename         download raw .md
POST   /admin/kb/files/:filename         upload .md (multipart field "file"); auto-reimports proof-point files
POST   /admin/kb/import                  full re-import of all KB files
GET    /admin/kb/status                  DB counts + per-file import history

# Inbox
GET    /inbox                            (current user's items, status=open)
POST   /inbox                            (create jot — text, type, optional opportunity_id)
PATCH  /inbox/:id                        (edit text, mark done)
POST   /inbox/:id/convert                (link to opp + convert to task or note)
DELETE /inbox/:id                        (soft delete)

# Settings (Manager only)
GET    /users
POST   /users
PATCH  /users/:id
DELETE /users/:id                        (deactivate — soft)

# User preferences
PATCH  /users/me/preferences             body: { show_qualify: true|false }
```

## Response envelope

Use consistently on every endpoint:

```json
{ "data": {}, "error": null, "meta": {} }
```

## Offline-aware writes

Mutating writes that need to be queueable offline use optimistic concurrency — the client sends `expected_updated_at` in the PATCH body, and the server returns **409 with the current row** on mismatch. See the task PATCH handler in `server/src/routes/tasks.ts` for the canonical pattern.
