-- Deal Info tab layout configuration (singleton)
CREATE TABLE IF NOT EXISTS deal_info_config (
  id          INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  config      JSONB NOT NULL,
  updated_by  INTEGER REFERENCES users(id),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Seed default config matching the current hardcoded layout
INSERT INTO deal_info_config (id, config) VALUES (1, '{
  "sections": [
    {
      "id": "deal-info-grid",
      "label": "Deal Info",
      "type": "grid",
      "defaultOpen": true,
      "fields": [
        { "key": "stage", "label": "Stage", "source": "column" },
        { "key": "arr", "label": "ARR", "source": "column", "format": "arr" },
        { "key": "close_date", "label": "Close", "source": "column", "format": "date" },
        { "key": "ae_owner_name", "label": "AE Owner", "source": "column" },
        { "key": "se_owner", "label": "SE Owner", "source": "column", "format": "se_owner" },
        { "key": "team", "label": "Team", "source": "column" },
        { "key": "record_type", "label": "Record Type", "source": "column" },
        { "key": "deploy_mode", "label": "Deploy", "source": "column" },
        { "key": "poc_status", "label": "PoC Status", "source": "column" },
        { "key": "rfx_status", "label": "RFx Status", "source": "column" },
        { "key": "engaged_competitors", "label": "Competitors", "source": "column" },
        { "key": "products", "label": "Products", "source": "column", "format": "products" }
      ]
    },
    {
      "id": "sf-next-step",
      "label": "SF Next Step",
      "type": "collapsible",
      "defaultOpen": true,
      "fields": [
        { "key": "next_step_sf", "label": "Next Step", "source": "column" }
      ],
      "extras": ["field_history:next_step_sf"]
    },
    {
      "id": "se-comments",
      "label": "SE Comments",
      "type": "collapsible",
      "defaultOpen": true,
      "fields": [
        { "key": "se_comments", "label": "SE Comments", "source": "column" }
      ],
      "extras": ["freshness:se_comments_updated_at", "field_history:se_comments"]
    },
    {
      "id": "manager-comments",
      "label": "Manager Comments",
      "type": "collapsible",
      "defaultOpen": false,
      "fields": [
        { "key": "manager_comments", "label": "Manager Comments", "source": "column" }
      ],
      "visibility": "manager_or_has_value"
    },
    {
      "id": "stage-history",
      "label": "Stage History",
      "type": "collapsible",
      "defaultOpen": false,
      "fields": [
        { "key": "previous_stage", "label": "Previous", "source": "column" },
        { "key": "stage_changed_at", "label": "Changed", "source": "column", "format": "date" }
      ],
      "visibility": "has_value:previous_stage"
    },
    {
      "id": "health-breakdown",
      "label": "Health Score Breakdown",
      "type": "computed",
      "defaultOpen": true
    },
    {
      "id": "meddpicc",
      "label": "MEDDPICC",
      "type": "computed",
      "defaultOpen": true
    },
    {
      "id": "see-all-fields",
      "label": "See All Fields",
      "type": "computed",
      "defaultOpen": false
    }
  ]
}') ON CONFLICT (id) DO NOTHING;
