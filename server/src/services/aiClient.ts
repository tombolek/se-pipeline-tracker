import Anthropic from '@anthropic-ai/sdk';
import { getAgentByFeature } from './agents.js';
import { getCurrentJobContext, getAbortSignalForJob } from './aiJobContext.js';
import { recordAiCall } from './aiJobs.js';

const DEFAULT_MODEL = 'claude-sonnet-4-6';

/**
 * Ground-rule system prompt applied to every AI call made through callAnthropic().
 *
 * Reinforces the per-feature CITATION_INSTRUCTIONS and the "do not invent …" text
 * already present in individual prompts. The goal is a consistent "don't speculate"
 * posture across all AI surfaces so a single hallucinated champion / quote / number
 * doesn't make it into an SE brief.
 *
 * Issue #136 — hallucination guardrails.
 */
const SYSTEM_PROMPT = `You are an AI assistant embedded in an SE team's pipeline-tracker workspace. SEs and their manager rely on your output before customer calls and during deal reviews, so getting things wrong has real consequences.

Ground rules:
1. Work only from the sources supplied in the user prompt. Do not add information that isn't there.
2. When the sources don't cover something, say so explicitly — "unknown", "not recorded in notes", "no MEDDPICC entry yet" — rather than guess, infer, or extrapolate.
3. Prefer understatement to confident speculation. A cautious "looks like" beats a confident fabrication.
4. Never invent customer names, champions, competitor names, deal sizes, stages, dates, or direct quotes. If a specific detail isn't in the sources, omit it or explicitly flag it as missing.
5. Per-feature formatting rules (citations, JSON schema, tone, length) are specified in the user prompt — follow those on top of these ground rules.`;

// ── PII redaction ────────────────────────────────────────────────────────────
//
// Scrub obvious PII from prompts before they hit Anthropic. Narrowly scoped:
// only email addresses and phone numbers. Names (champion, EB, account, AE/SE)
// are intentionally NOT redacted — they're the core signal every AI feature
// relies on.
//
// False-positive guards:
//  • Phone regex requires at least one explicit separator (space/dot/dash) so
//    raw digit strings like SF IDs or `2026-04-22` year strings don't match.
//    Bare 10-digit runs are left alone (ambiguous, too risky to redact blind).
//  • Email regex uses a conservative RFC-leaning shape.

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
// Phone shapes we scrub:
//   +1 555 123 4567    555-123-4567    (555) 123-4567    555.123.4567
// Intentionally NOT matched: `5551234567` (bare 10 digits), `2026-04-22` (4-2-2).
const PHONE_RE = /\b(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g;

export interface RedactResult {
  redacted: string;
  counts: { email: number; phone: number };
}

export function redactPii(text: string): RedactResult {
  const counts = { email: 0, phone: 0 };
  const afterEmail = text.replace(EMAIL_RE, () => { counts.email++; return '[email]'; });
  const afterPhone = afterEmail.replace(PHONE_RE, () => { counts.phone++; return '[phone]'; });
  return { redacted: afterPhone, counts };
}

let sharedClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!sharedClient) {
    sharedClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return sharedClient;
}

export class AgentDisabledError extends Error {
  constructor(feature: string) {
    super(`AI feature '${feature}' is disabled by admin`);
    this.name = 'AgentDisabledError';
  }
}

export interface AiCallOpts {
  /** Short feature identifier for logging + agent lookup (e.g. 'summary', 'meddpicc-coach'). */
  feature: string;
  /** The user prompt. Include all feature-specific rules, sources, and instructions here. */
  prompt: string;
  /** Maximum response tokens. Falls back to the agent's default_max_tokens when that's defined. */
  maxTokens: number;
  /** Optional model override. Falls back to the agent's default_model, then DEFAULT_MODEL. */
  model?: string;
  /** Optional system-prompt text appended after the shared ground rules (stacked on top of the agent's system_prompt_extra). */
  systemPromptExtra?: string;
}

export interface AiCallResult {
  text: string;
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Shared wrapper around `anthropic.messages.create`. Applies the "don't speculate"
 * system prompt, extracts the text block, emits a structured log line, and —
 * when called from inside runAiJob() — persists telemetry into the job row
 * (including prompt/response text when the owning agent has log_io = true).
 *
 * Refuses to call if the agent has been disabled by admin. Honours the
 * in-memory AbortController registered by runAiJob(), so an admin "kill"
 * action aborts the in-flight HTTP request to Anthropic.
 */
export async function callAnthropic(opts: AiCallOpts): Promise<AiCallResult> {
  const agent = await getAgentByFeature(opts.feature);

  if (agent && !agent.is_enabled) {
    throw new AgentDisabledError(opts.feature);
  }

  const model = opts.model ?? agent?.default_model ?? DEFAULT_MODEL;
  const maxTokens = opts.maxTokens ?? agent?.default_max_tokens ?? 800;

  // System prompt: ground rules + agent-level admin-authored extra + optional
  // per-call extra. All three are authored inside this codebase, not user data,
  // so no redaction needed there.
  const extras = [agent?.system_prompt_extra?.trim(), opts.systemPromptExtra?.trim()]
    .filter((s): s is string => !!s && s.length > 0);
  const system = extras.length > 0 ? `${SYSTEM_PROMPT}\n\n${extras.join('\n\n')}` : SYSTEM_PROMPT;

  // PII redaction on the user prompt.
  const { redacted, counts } = redactPii(opts.prompt);

  // Pull the job context (if any). When callAnthropic is invoked inside
  // runAiJob(), `ctx` is non-null and we can both persist telemetry and honour
  // the kill signal attached to this job. When called outside (unlikely, but
  // supported — e.g. a future admin "test this agent" button could call this
  // directly), we skip both.
  const ctx = getCurrentJobContext();
  const signal = ctx ? getAbortSignalForJob(ctx.jobId) : undefined;

  const response = await getClient().messages.create(
    {
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: redacted }],
    },
    signal ? { signal } : undefined,
  );

  const block = response.content.find(b => b.type === 'text');
  const text = block && block.type === 'text' ? block.text : '';
  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;
  const stopReason = response.stop_reason ?? null;

  const redactionSuffix = (counts.email + counts.phone) > 0
    ? ` redacted=email:${counts.email},phone:${counts.phone}`
    : '';

  console.log(
    `[ai] feature=${opts.feature} model=${model} max_tokens=${maxTokens} ` +
    `input=${inputTokens} output=${outputTokens} stop=${stopReason}${redactionSuffix}`,
  );

  if (ctx) {
    // Per-agent switch: only store prompt/response when log_io is on.
    const shouldLogIO = !!agent?.log_io;
    await recordAiCall(ctx.jobId, {
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      stop_reason: stopReason,
      pii_counts: counts,
      prompt_text: shouldLogIO ? redacted : null,
      response_text: shouldLogIO ? text : null,
    }).catch(err => {
      console.error(`[ai] failed to persist job telemetry for job=${ctx.jobId}: ${err?.message ?? err}`);
    });
  }

  return { text, stopReason, inputTokens, outputTokens };
}

