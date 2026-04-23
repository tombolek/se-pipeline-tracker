# AI Agents — Architecture & Admin Surface

Every AI feature in the app runs through `callAnthropic()` in [server/src/services/aiClient.ts](../server/src/services/aiClient.ts), tagged by a `feature` string. Migration 052 turns each of those feature strings into a first-class **Agent** with an editable config, a version history, and a per-call job audit trail.

## Data model

Three tables work together:

| Table | Purpose |
|-------|---------|
| `agents` | One row per feature. Holds current `default_model`, `default_max_tokens`, `is_enabled`, `log_io`, `system_prompt_extra`, and a pointer to the active version. |
| `agent_prompt_versions` | Every admin save creates a new row — `who`, `when`, `note`, plus a full snapshot of the resulting settings. Powers the audit + revert UI. |
| `ai_jobs` (extended) | Already existed (mig 031). Extended with `agent_id`, `model`, `input_tokens`, `output_tokens`, `duration_ms`, `stop_reason`, `pii_counts`, `prompt_text`, `response_text`, `killed_at`, `killed_by_user_id`. Status extended with `killed`. |

`ai_jobs.prompt_text` and `response_text` are only populated when the owning agent has `log_io = true` at call time — this is the per-agent **I/O logging toggle** the admin controls from `/settings/agents/:id`.

## Runtime flow

```
route handler
  └─ runAiJob({ feature, … })              aiJobs.ts
       ├─ INSERT ai_jobs (status='running', agent_id=agent.id)
       ├─ registerAbort(jobId) → stored in in-memory controllers Map
       └─ runWithJobContext({ jobId, feature, agentId, userId })
            └─ work()                      (feature-specific logic)
                  └─ callAnthropic({ feature, prompt, maxTokens })   aiClient.ts
                        ├─ getAgentByFeature(feature)   (cached 60s)
                        ├─ if !agent.is_enabled → throw AgentDisabledError
                        ├─ system = SYSTEM_PROMPT + agent.system_prompt_extra
                        ├─ PII redact prompt
                        ├─ signal = getAbortSignalForJob(jobId)
                        ├─ anthropic.messages.create({ …, signal })
                        └─ recordAiCall(jobId, { model, tokens, … ,
                              prompt_text: agent.log_io ? redacted : null,
                              response_text: agent.log_io ? text : null })
       ├─ completeJob(jobId)   (or failJob on throw)
       └─ clearAbort(jobId)
```

Three pieces of plumbing make this work without changing the 12 existing route handlers:

1. **`AsyncLocalStorage` job context** — `runAiJob` enters a context carrying the jobId. `callAnthropic` reads it back to write telemetry and pick up the kill signal. Legacy route handlers keep the exact same signatures.
2. **In-process AbortController registry** — a `Map<jobId, AbortController>` in `services/aiJobContext.ts`. The admin "kill" action on `/settings/ai-jobs` calls `abortJob(id)`, which aborts the in-flight HTTP request to Anthropic and lets `failJob` record the row as `killed` rather than `failed`.
3. **Stale-job sweep on boot** — `sweepStaleRunningJobs()` runs from `index.ts` on startup. The AbortController Map is process-local, so a server crash leaves orphaned `running` rows that no one can ever finish. The sweep flips anything older than 10 minutes to `failed` with `error = 'orphaned on server restart'`.

## Admin surface

See [features.md](features.md) for the user-visible behaviour of `/settings/agents`, `/settings/ai-jobs`, and `/settings/ai-usage`. Server routes live in [routes/agents.ts](../server/src/routes/agents.ts) and [routes/aiJobs.ts](../server/src/routes/aiJobs.ts) — both gated by `requireAdmin`.

## Seeded agents

All 12 features present in the codebase at the time of migration 052:

`summary`, `meddpicc-coach`, `process-notes`, `call-prep`, `demo-prep`, `similar-deals-insights`, `kb-playbook`, `tech-blockers`, `agentic-qual`, `one-on-one-narrative`, `forecast-narrative`, `forecast-bulk-summary`.

Adding a new AI feature = `INSERT INTO agents (…)` in a later migration with the same `feature` string used in `callAnthropic({ feature: … })`. The runtime picks it up on the next cache tick (60s) without any code changes.

## Log-I/O toggle — how to think about retention

`log_io = false` everywhere by default. Turn it on per-agent when you're actively debugging that agent, then off again once the investigation closes. Reasons:

- `ai_jobs.prompt_text` and `response_text` are `TEXT` (no length cap). Leaving every agent logging forever grows the table fast — especially `process-notes` and `call-prep`, which carry full transcripts.
- Prompts pass through the PII redaction in `redactPii()` before being stored (emails and phones → `[email]`/`[phone]`), but names, account data, deal values, and note content are NOT redacted. Stored I/O therefore contains sales-sensitive material.

If/when retention becomes a concern, a daily purge of `ai_jobs.prompt_text/response_text > N days old` is the cleanest fix — keep the telemetry columns (tokens, duration, status) and drop just the text.

## Editing prompts — what's actually editable

The feature's main user-prompt template still lives inline in the feature route (e.g. the summary template in `routes/opportunities.ts`). What's admin-editable today is the **`system_prompt_extra`** — an additional block appended to the shared ground-rules system prompt for every call this agent makes. That gives admins fine-tuning leverage ("always cite sources even in bullet lists", "for this SE team, prefer technical framing") without needing to move every feature's template into the DB.

A future migration can externalize the user-prompt templates into `agents` (a `prompt_template` column + a `{{var}}` render step) — the registry and audit trail are already in place to make that a local change.
