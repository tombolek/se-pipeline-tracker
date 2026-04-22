-- Migration 050: Add `theme` preference to users for dark-mode rollout (#138).
--
-- Three valid values:
--   'light'  — force the light palette (current behaviour, default for
--              existing rows so nothing regresses).
--   'dark'   — force the dark palette.
--   'system' — follow the browser's prefers-color-scheme media query.
--
-- Stored as TEXT with a CHECK rather than a PG enum so future values
-- (e.g. high-contrast variants) can be added via ALTER TABLE without the
-- enum-rewrite dance.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'light'
    CHECK (theme IN ('light', 'dark', 'system'));
