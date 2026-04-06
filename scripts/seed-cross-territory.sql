-- Seed: cross-territory demo opportunity
-- Creates an NA Enterprise opportunity with PoC + RFx status assigned to Alex Rivera
-- (an SE under tomas.bolek@ataccama.com who manages EMEA territory).
-- This triggers the "out of territory" info banner on Calendar, PoC Board, RFx Board.

DO $$
DECLARE
  v_se_id  INTEGER;
  v_opp_id INTEGER;
BEGIN
  SELECT id INTO v_se_id
  FROM users
  WHERE email = 'alex.rivera@ataccama.com' AND is_deleted = false;

  IF v_se_id IS NULL THEN
    RAISE NOTICE 'alex.rivera@ataccama.com not found — skipping';
    RETURN;
  END IF;

  INSERT INTO opportunities (
    sf_opportunity_id, name, account_name, stage, team,
    arr, arr_currency,
    se_owner_id,
    poc_status, poc_start_date, poc_end_date,
    rfx_status,
    close_date,
    is_active, is_closed_lost, first_seen_at
  ) VALUES (
    'DEMO-CROSS-TERRITORY-001',
    '[NA] TechCorp — Data Platform (Cross-territory demo)',
    'TechCorp Inc.',
    'Build Value',
    'NA Enterprise',
    350000, 'USD',
    v_se_id,
    'In Progress',
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '30 days',
    'In Progress',
    CURRENT_DATE + INTERVAL '60 days',
    true, false, now()
  )
  ON CONFLICT (sf_opportunity_id) DO UPDATE SET
    se_owner_id    = EXCLUDED.se_owner_id,
    poc_status     = EXCLUDED.poc_status,
    poc_start_date = EXCLUDED.poc_start_date,
    poc_end_date   = EXCLUDED.poc_end_date,
    rfx_status     = EXCLUDED.rfx_status,
    team           = EXCLUDED.team;

  SELECT id INTO v_opp_id FROM opportunities WHERE sf_opportunity_id = 'DEMO-CROSS-TERRITORY-001';

  -- Add a task so it also shows in the Calendar
  INSERT INTO tasks (opportunity_id, title, due_date, status, assigned_to_id, created_by_id, is_next_step)
  SELECT v_opp_id, 'NA cross-territory PoC kick-off call', CURRENT_DATE + INTERVAL '7 days', 'open', v_se_id, v_se_id, true
  WHERE NOT EXISTS (
    SELECT 1 FROM tasks WHERE opportunity_id = v_opp_id AND title = 'NA cross-territory PoC kick-off call'
  );

  RAISE NOTICE 'Cross-territory demo opportunity seeded (id=%, se_id=%)', v_opp_id, v_se_id;
END $$;
