-- 053: Externalise the 12 feature prompts into the agents table so admins can
-- edit them via /settings/agents/:id. Phase 2 of the AI Agents rework.
--
-- This migration only adds the columns. The actual template bodies live in
-- server/src/services/agentTemplates.ts (the golden baseline — git-traceable
-- and diff-reviewable). On server boot, seedMissingPromptTemplates() fills any
-- agent row whose prompt_template is NULL from that TS baseline. Once an admin
-- edits a template via the UI, the column is non-NULL and the seeder leaves it
-- alone forever.
--
-- agent_prompt_versions also gets a prompt_template column so every settings
-- change captures the template too — making "revert to this version" a full
-- snapshot, not just a partial one.

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS prompt_template TEXT;

ALTER TABLE agent_prompt_versions
  ADD COLUMN IF NOT EXISTS prompt_template TEXT;
