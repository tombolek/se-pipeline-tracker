/**
 * Agent prompt rendering.
 *
 * Takes an agent's stored Handlebars template and a plain `vars` object built
 * by the route handler, and returns the fully rendered prompt string that
 * callAnthropic() will send. Route handlers use this instead of constructing
 * inline template literals, so admins can edit the prompt text via the UI
 * without a code change.
 *
 * Handlebars is configured with `noEscape: true` so `&`, `<`, `>` pass through
 * untouched — these prompts are sent to an LLM, not rendered as HTML.
 *
 * Compiled templates are cached keyed by the template string itself. Admin
 * edits produce a new string → cache miss → recompile. No explicit
 * invalidation needed.
 */

import Handlebars from 'handlebars';
import { getAgentByFeature } from './agents.js';

export class AgentPromptMissingError extends Error {
  constructor(feature: string) {
    super(`Agent '${feature}' has no prompt_template set — cannot render. Seed it via agentTemplates.ts or set one via the admin UI.`);
    this.name = 'AgentPromptMissingError';
  }
}

const compileCache = new Map<string, Handlebars.TemplateDelegate>();

function compile(template: string): Handlebars.TemplateDelegate {
  const hit = compileCache.get(template);
  if (hit) return hit;
  const fn = Handlebars.compile(template, { noEscape: true, strict: false });
  compileCache.set(template, fn);
  return fn;
}

/**
 * Render `feature`'s current template with the provided vars. Throws if the
 * agent has no template stored — callers are expected to fall back to their
 * pre-template inline prompt path during the transition, or surface the
 * error to the admin if we're past Phase 2.
 */
export async function renderAgentPrompt(
  feature: string,
  vars: Record<string, unknown>,
): Promise<string> {
  const agent = await getAgentByFeature(feature);
  const template = agent?.prompt_template;
  if (!template || template.trim() === '') {
    throw new AgentPromptMissingError(feature);
  }
  return compile(template)(vars);
}

/** Exposed for admins who want to preview the rendered prompt for a template
 *  string that hasn't been saved yet (e.g. while editing in the UI). */
export function renderTemplateStandalone(template: string, vars: Record<string, unknown>): string {
  return compile(template)(vars);
}
