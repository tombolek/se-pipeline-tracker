-- Migration 021: Add source_url to notes (for meeting notes processor — Notion, Slack canvas, etc.)
ALTER TABLE notes ADD COLUMN IF NOT EXISTS source_url TEXT;
