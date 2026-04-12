-- Add forecast_category column for pipeline forecasting
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS forecast_category TEXT;

CREATE INDEX IF NOT EXISTS idx_opportunities_forecast_category ON opportunities(forecast_category);

-- Backfill from sf_raw_fields if available from prior imports
UPDATE opportunities
SET forecast_category = sf_raw_fields->>'Forecast Category'
WHERE forecast_category IS NULL
  AND sf_raw_fields->>'Forecast Category' IS NOT NULL
  AND sf_raw_fields->>'Forecast Category' != '';
