import Anthropic from '@anthropic-ai/sdk';

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

let sharedClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!sharedClient) {
    sharedClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return sharedClient;
}

export interface AiCallOpts {
  /** Short feature identifier for logging (e.g. 'summary', 'meddpicc-coach'). */
  feature: string;
  /** The user prompt. Include all feature-specific rules, sources, and instructions here. */
  prompt: string;
  /** Maximum response tokens. */
  maxTokens: number;
  /** Optional model override. Defaults to claude-sonnet-4-6. */
  model?: string;
  /** Optional system-prompt text appended after the shared ground rules. */
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
 * system prompt, extracts the text block, and emits a structured log line.
 */
export async function callAnthropic(opts: AiCallOpts): Promise<AiCallResult> {
  const model = opts.model ?? DEFAULT_MODEL;
  const system = opts.systemPromptExtra
    ? `${SYSTEM_PROMPT}\n\n${opts.systemPromptExtra}`
    : SYSTEM_PROMPT;

  const response = await getClient().messages.create({
    model,
    max_tokens: opts.maxTokens,
    system,
    messages: [{ role: 'user', content: opts.prompt }],
  });

  const block = response.content.find(b => b.type === 'text');
  const text = block && block.type === 'text' ? block.text : '';
  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;
  const stopReason = response.stop_reason ?? null;

  console.log(
    `[ai] feature=${opts.feature} model=${model} max_tokens=${opts.maxTokens} ` +
    `input=${inputTokens} output=${outputTokens} stop=${stopReason}`,
  );

  return { text, stopReason, inputTokens, outputTokens };
}
