-- 048: Seed role_page_access for the new SE Contribution insight (Issue #73).
--
-- Manager-only: the page shows per-SE conversion and ARR aggregates used for
-- performance-review prep, headcount conversations, and top-performer
-- recognition. SEs should not see each other's comparative numbers.

INSERT INTO role_page_access (page_key, role) VALUES
  ('insights/se-contribution', 'manager')
ON CONFLICT DO NOTHING;
