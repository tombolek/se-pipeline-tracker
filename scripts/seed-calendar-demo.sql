-- Calendar demo seed: POCs, RFPs, Tasks for April 2026

INSERT INTO opportunities (
  sf_opportunity_id, name, account_name, stage, arr, arr_currency,
  se_owner_id, is_active, is_closed_lost,
  poc_status, poc_start_date, poc_end_date, poc_type,
  rfx_status, rfx_submission_date,
  ae_owner_name, team, record_type, close_date
) VALUES
('DUMMY-CAL-001','Meridian Analytics — Data Quality Platform','Meridian Analytics','Build Value',180000,'USD',2,true,false,'In Progress','2026-04-07','2026-04-21','Technical',NULL,NULL,'Dana Patel','NA Enterprise','New Logo','2026-06-30'),
('DUMMY-CAL-002','Vertex Systems — MDM Consolidation','Vertex Systems','Proposal Sent',340000,'USD',3,true,false,'In Progress','2026-04-14','2026-05-12','Technical',NULL,NULL,'Chris Wallace','EMEA','New Logo','2026-07-31'),
('DUMMY-CAL-003','Cascade Financial — Data Governance RFP','Cascade Financial','Proposal Sent',220000,'USD',1,true,false,NULL,NULL,NULL,NULL,'RFP In Progress','2026-04-10','Morgan Hayes','NA Enterprise','New Logo','2026-05-31'),
('DUMMY-CAL-004','Northgate Technology — DataOps Platform','Northgate Technology','Develop Solution',95000,'USD',8,true,false,NULL,NULL,NULL,NULL,'RFP Submitted','2026-04-17','Taylor Brooks','EMEA','Upsell','2026-06-30'),
('DUMMY-CAL-005','Summit Insurance Group — Master Data Platform','Summit Insurance Group','Build Value',310000,'USD',2,true,false,NULL,NULL,NULL,NULL,'RFP In Progress','2026-04-25','Jamie Anderson','NA Enterprise','New Logo','2026-08-31')
ON CONFLICT (sf_opportunity_id) DO NOTHING;

INSERT INTO tasks (opportunity_id, title, status, due_date, assigned_to_id, created_by_id, is_next_step)
SELECT o.id, v.title, v.status, v.due_date::date, v.se_id, 4, v.nxt
FROM (VALUES
  ('DUMMY-CAL-001','Set up POC environment in sandbox',        'open',        '2026-04-08', 2, true),
  ('DUMMY-CAL-001','Prepare data quality demo dataset',        'open',        '2026-04-11', 2, false),
  ('DUMMY-CAL-001','POC success criteria sign-off with AE',   'open',        '2026-04-21', 2, false),
  ('DUMMY-CAL-001','Architecture documentation for handoff',  'open',        '2026-04-30', 2, false),
  ('DUMMY-CAL-002','POC kickoff call — align on scope',       'in_progress', '2026-04-14', 3, true),
  ('DUMMY-CAL-002','Weekly POC check-in #1',                  'open',        '2026-04-22', 3, false),
  ('DUMMY-CAL-002','POC mid-point review with champion',      'open',        '2026-04-28', 3, false),
  ('DUMMY-CAL-003','Complete technical sections of RFP',      'in_progress', '2026-04-08', 1, true),
  ('DUMMY-CAL-003','Security questionnaire response',         'open',        '2026-04-10', 1, false),
  ('DUMMY-CAL-003','Competitive positioning analysis',        'open',        '2026-04-24', 1, false),
  ('DUMMY-CAL-004','Draft RFP response — architecture',       'in_progress', '2026-04-12', 8, true),
  ('DUMMY-CAL-004','Internal review of RFP draft',            'open',        '2026-04-15', 8, false),
  ('DUMMY-CAL-004','Submit final RFP response',               'done',        '2026-04-17', 8, false),
  ('DUMMY-CAL-005','Gather reference customer examples',      'open',        '2026-04-18', 2, false),
  ('DUMMY-CAL-005','TCO analysis for proposal',               'open',        '2026-04-23', 2, false)
) AS v(sf_id, title, status, due_date, se_id, nxt)
JOIN opportunities o ON o.sf_opportunity_id = v.sf_id;

SELECT 'Opportunities' AS entity, count(*) FROM opportunities WHERE sf_opportunity_id LIKE 'DUMMY-CAL-%'
UNION ALL
SELECT 'Tasks', count(*) FROM tasks t
JOIN opportunities o ON o.id = t.opportunity_id
WHERE o.sf_opportunity_id LIKE 'DUMMY-CAL-%';
