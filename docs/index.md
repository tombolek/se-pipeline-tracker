# Agent Knowledge Base — Index

This directory is the agent-facing knowledge base for the project. It is **not** public documentation and **not** user onboarding — it exists so a fresh Claude Code session can work efficiently without re-deriving facts from the code.

`CLAUDE.md` at the repo root is the **constitution** (inviolable rules + pointers). This directory is the **encyclopaedia** (details a fresh session needs to do competent work).

## Map

| File | What lives there |
|------|------------------|
| [data-model.md](data-model.md) | Tables, columns, design rules, reconciliation keys |
| [sf-import.md](sf-import.md) | Salesforce export format, column mapping, import pipeline behaviour |
| [api.md](api.md) | API routes, auth, response envelope |
| [features.md](features.md) | Feature catalogue per page/route, behaviours, filters |
| [ai-agents.md](ai-agents.md) | Agents registry, prompt-version history, job I/O logging, kill switch |
| [ui-brand.md](ui-brand.md) | Ataccama palette, typography, Tailwind tokens, layout conventions |
| [deploy.md](deploy.md) | WSL-based deploy flow, CDK, script internals |
| [gotchas.md](gotchas.md) | Non-obvious rules, traps, workarounds, version pins |
| [build-order.md](build-order.md) | Original greenfield build sequence (historical reference) |
| [cloud-migration.md](cloud-migration.md) | Forward-looking migration notes |
| [roadmap.md](roadmap.md) | Done-later-than-planned + still-pending items |

## Update rule

Update the relevant file under `docs/` **in the same commit** as any task that changes behaviour, data shape, build/deploy flow, or uncovers a non-obvious assumption. If you had to guess at something that isn't evident from the code, add a `docs/gotchas.md` entry. No separate "docs PR" — docs-out-of-band is worse than no docs.

## What does NOT belong here

- **Human onboarding / tutorials** — that's `README.md` territory.
- **The changelog** — lives at `CHANGELOG.md`, don't duplicate.
- **Generated / derivable info** — link the source of truth (migrations, routers) instead of re-listing columns or handlers. Document *design rules*, not column dumps.
- **`kb/` sales content** — that's domain data the Call Prep feature reads; different audience, different lifecycle.
- **Aspirational "maybe someday" notes** — keep `roadmap.md` tight.
- **Anything that could go stale without anyone noticing** — if no behaviour-changing task would ever touch it, it probably shouldn't be here.
