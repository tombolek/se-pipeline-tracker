-- Team-wide default menu configuration (singleton).
-- Admins set this via Settings → Menu Settings → "Save as new default".
-- Users without a personal localStorage menu_config get this as their starting
-- point; "Reset to default" also reads from here.
CREATE TABLE IF NOT EXISTS menu_default_config (
  id          INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  config      JSONB NOT NULL,
  updated_by  INTEGER REFERENCES users(id),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Seed with the same defaults as DEFAULT_MENU_CONFIG in client/src/utils/menuConfig.ts.
-- Keep these in sync if you add new pages: the seed is for fresh installs only;
-- existing rows are not overwritten (ON CONFLICT DO NOTHING).
INSERT INTO menu_default_config (id, config) VALUES (1, '{
  "sections": [
    { "id": "sec-insights", "label": "Insights", "defaultCollapsed": false }
  ],
  "items": [
    { "id": "home",        "label": "Home",        "to": "/home",        "icon": "home",        "sectionId": null },
    { "id": "pipeline",    "label": "Pipeline",    "to": "/pipeline",    "icon": "pipeline",    "sectionId": null },
    { "id": "my-pipeline", "label": "My Pipeline", "to": "/my-pipeline", "icon": "my-pipeline", "sectionId": null },
    { "id": "favorites",   "label": "Favorites",   "to": "/favorites",   "icon": "favorites",   "sectionId": null },
    { "id": "my-tasks",    "label": "My Tasks",    "to": "/my-tasks",    "icon": "tasks",       "sectionId": null },
    { "id": "calendar",    "label": "Calendar",    "to": "/calendar",    "icon": "calendar",    "sectionId": null },
    { "id": "se-mapping",  "label": "SE Mapping",  "to": "/insights/se-mapping", "icon": "se-mapping", "sectionId": null },
    { "id": "poc-board",   "label": "PoC Board",   "to": "/insights/poc-board",  "icon": "poc",        "sectionId": null },
    { "id": "rfx-board",   "label": "RFx Board",   "to": "/insights/rfx-board",  "icon": "rfx",        "sectionId": null },

    { "id": "forecasting-brief", "label": "Forecasting Brief", "to": "/insights/forecasting-brief", "icon": "insight", "sectionId": "sec-insights" },
    { "id": "one-on-one",        "label": "1:1 Prep",          "to": "/insights/one-on-one",        "icon": "insight", "sectionId": "sec-insights" },
    { "id": "weekly-digest",     "label": "Weekly Digest",     "to": "/insights/weekly-digest",     "icon": "insight", "sectionId": "sec-insights" },
    { "id": "stage-movement",    "label": "Stage Movement",    "to": "/insights/stage-movement",    "icon": "insight", "sectionId": "sec-insights" },
    { "id": "missing-notes",     "label": "Missing Notes",     "to": "/insights/missing-notes",     "icon": "insight", "sectionId": "sec-insights" },
    { "id": "team-workload",     "label": "Team Workload",     "to": "/insights/team-workload",     "icon": "insight", "sectionId": "sec-insights" },
    { "id": "overdue-tasks",     "label": "Overdue Tasks",     "to": "/insights/overdue-tasks",     "icon": "insight", "sectionId": "sec-insights" },
    { "id": "team-tasks",        "label": "Team Tasks",        "to": "/insights/team-tasks",        "icon": "insight", "sectionId": "sec-insights" },
    { "id": "deploy-mode",       "label": "DeployMode",        "to": "/insights/deploy-mode",       "icon": "insight", "sectionId": "sec-insights" },
    { "id": "closed-lost-stats", "label": "Loss Analysis",     "to": "/insights/closed-lost-stats", "icon": "insight", "sectionId": "sec-insights" },
    { "id": "closed-won",        "label": "Closed Won",        "to": "/insights/closed-won",        "icon": "insight", "sectionId": "sec-insights" },
    { "id": "percent-to-target", "label": "% to Target",       "to": "/insights/percent-to-target", "icon": "insight", "sectionId": "sec-insights" },
    { "id": "win-rate",          "label": "Win Rate",          "to": "/insights/win-rate",          "icon": "insight", "sectionId": "sec-insights" },
    { "id": "se-contribution",   "label": "SE Contribution",   "to": "/insights/se-contribution",   "icon": "insight", "sectionId": "sec-insights" },
    { "id": "tech-blockers",     "label": "Tech Blockers",     "to": "/insights/tech-blockers",     "icon": "insight", "sectionId": "sec-insights" },
    { "id": "agentic-qual",      "label": "Agentic Qual",      "to": "/insights/agentic-qual",      "icon": "insight", "sectionId": "sec-insights" },
    { "id": "analytics",         "label": "Pipeline Analytics", "to": "/insights/analytics",        "icon": "insight", "sectionId": "sec-insights" }
  ]
}') ON CONFLICT (id) DO NOTHING;
