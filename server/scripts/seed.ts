import { Client } from 'pg';
import bcrypt from 'bcrypt';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function seed() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log('Connected to database');

  // ── Users ──────────────────────────────────────────────────────────────────
  const managerHash = await bcrypt.hash('manager', 10);
  const seHash = await bcrypt.hash('se123', 10);

  const { rows: [manager] } = await client.query(`
    INSERT INTO users (email, name, password_hash, role)
    VALUES ($1, $2, $3, 'manager')
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash
    RETURNING id
  `, ['tomas.bolek@ataccama.com', 'Tomas Bolek', managerHash]);

  const { rows: [se1] } = await client.query(`
    INSERT INTO users (email, name, password_hash, role)
    VALUES ($1, $2, $3, 'se')
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `, ['alex.rivera@ataccama.com', 'Alex Rivera', seHash]);

  const { rows: [se2] } = await client.query(`
    INSERT INTO users (email, name, password_hash, role)
    VALUES ($1, $2, $3, 'se')
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `, ['jordan.kim@ataccama.com', 'Jordan Kim', seHash]);

  console.log(`  users  manager=${manager.id}  se1=${se1.id}  se2=${se2.id}`);

  // ── Opportunities ──────────────────────────────────────────────────────────
  const opps = [
    {
      sf_opportunity_id: 'SF-001-ACME',
      name: 'ACME Corp — Enterprise Platform',
      account_name: 'ACME Corp',
      account_segment: 'Enterprise',
      account_industry: 'Manufacturing',
      stage: 'Build Value',
      record_type: 'New Logo',
      arr: 240000,
      close_date: '2026-06-30',
      ae_owner_name: 'Mark Johnson',
      team: 'NA Enterprise',
      deploy_mode: 'SaaS',
      se_owner_id: se1.id,
      next_step_sf: 'Schedule technical deep-dive with their data engineering team',
      se_comments: 'Strong champion in CDO. IT security review pending.',
      se_comments_updated_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
      champion: 'Lisa Park (CDO)',
      engaged_competitors: 'Informatica, Talend',
    },
    {
      sf_opportunity_id: 'SF-002-GLOBEX',
      name: 'Globex Financial — Data Governance',
      account_name: 'Globex Financial',
      account_segment: 'Enterprise',
      account_industry: 'Financial Services',
      stage: 'Proposal Sent',
      record_type: 'New Logo',
      arr: 180000,
      close_date: '2026-05-15',
      ae_owner_name: 'Emily Chen',
      team: 'NA Enterprise',
      deploy_mode: 'PaaS+',
      se_owner_id: se1.id,
      next_step_sf: 'Follow up on proposal — waiting for procurement feedback',
      se_comments: 'Demo went very well. Evaluating vs. Collibra. Price sensitivity high.',
      se_comments_updated_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
      champion: 'Robert Kim (VP Data)',
      engaged_competitors: 'Collibra',
      poc_status: 'Completed',
    },
    {
      sf_opportunity_id: 'SF-003-INITECH',
      name: 'Initech — Data Quality Platform',
      account_name: 'Initech',
      account_segment: 'Commercial',
      account_industry: 'Technology',
      stage: 'Develop Solution',
      record_type: 'New Logo',
      arr: 96000,
      close_date: '2026-07-31',
      ae_owner_name: 'James Wilson',
      team: 'NA Commercial',
      deploy_mode: 'SaaS',
      se_owner_id: se2.id,
      next_step_sf: 'Build custom demo for their Snowflake environment',
      se_comments: null,
      se_comments_updated_at: null,
      champion: 'Sandra Lee (Data Architect)',
      engaged_competitors: 'Monte Carlo',
    },
    {
      sf_opportunity_id: 'SF-004-HOOLI',
      name: 'Hooli Inc — MDM Expansion',
      account_name: 'Hooli Inc',
      account_segment: 'Enterprise',
      account_industry: 'Technology',
      stage: 'Negotiate',
      record_type: 'Upsell',
      arr: 320000,
      close_date: '2026-04-30',
      ae_owner_name: 'Patricia Moore',
      team: 'NA Enterprise',
      deploy_mode: 'PaaS+',
      se_owner_id: se2.id,
      next_step_sf: 'Legal reviewing MSA redlines — target sign by Apr 30',
      se_comments: 'Technical validation complete. Waiting on legal and procurement.',
      se_comments_updated_at: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000), // 25 days ago — RED
      champion: 'Chris Evans (CTO)',
      engaged_competitors: null,
      key_deal: true,
    },
    {
      sf_opportunity_id: 'SF-005-UMBRELLA',
      name: 'Umbrella Corp — Compliance & DQ',
      account_name: 'Umbrella Corp',
      account_segment: 'Enterprise',
      account_industry: 'Life Sciences',
      stage: 'Qualify',
      record_type: 'New Logo',
      arr: 150000,
      close_date: '2026-09-30',
      ae_owner_name: 'Diana Prince',
      team: 'NA Enterprise',
      deploy_mode: 'SaaS',
      se_owner_id: null,
      next_step_sf: 'Intro call scheduled for next week',
      se_comments: null,
      se_comments_updated_at: null,
      champion: null,
      engaged_competitors: null,
    },
  ];

  const oppIds: number[] = [];
  for (const opp of opps) {
    const { rows: [row] } = await client.query(`
      INSERT INTO opportunities (
        sf_opportunity_id, name, account_name, account_segment, account_industry,
        stage, record_type, arr, arr_currency, close_date,
        ae_owner_name, team, deploy_mode, se_owner_id,
        next_step_sf, se_comments, se_comments_updated_at,
        champion, engaged_competitors, key_deal,
        poc_status, sf_raw_fields
      ) VALUES (
        $1,$2,$3,$4,$5,
        $6,$7,$8,'USD',$9,
        $10,$11,$12,$13,
        $14,$15,$16,
        $17,$18,$19,
        $20,$21
      )
      ON CONFLICT (sf_opportunity_id) DO UPDATE SET
        name = EXCLUDED.name,
        stage = EXCLUDED.stage,
        updated_at = now()
      RETURNING id
    `, [
      opp.sf_opportunity_id, opp.name, opp.account_name, opp.account_segment, opp.account_industry,
      opp.stage, opp.record_type, opp.arr, opp.close_date,
      opp.ae_owner_name, opp.team, opp.deploy_mode, opp.se_owner_id ?? null,
      opp.next_step_sf, opp.se_comments ?? null, opp.se_comments_updated_at ?? null,
      opp.champion ?? null, opp.engaged_competitors ?? null, opp.key_deal ?? false,
      opp.poc_status ?? null, JSON.stringify({ _seeded: true }),
    ]);
    oppIds.push(row.id);
    console.log(`  opp    [${row.id}] ${opp.name}`);
  }

  // ── Tasks ──────────────────────────────────────────────────────────────────
  const tasks = [
    // ACME Corp
    { opp_idx: 0, title: 'Prepare technical deep-dive deck', is_next_step: true, status: 'open', assigned_to: se1.id, created_by: se1.id, due_date: '2026-04-05' },
    { opp_idx: 0, title: 'Get security questionnaire from IT team', is_next_step: false, status: 'in_progress', assigned_to: se1.id, created_by: se1.id, due_date: '2026-04-10' },
    // Globex Financial
    { opp_idx: 1, title: 'Follow up on proposal feedback', is_next_step: true, status: 'open', assigned_to: se1.id, created_by: se1.id, due_date: '2026-03-28' }, // overdue
    { opp_idx: 1, title: 'Prepare Collibra competitive battle card', is_next_step: false, status: 'done', assigned_to: se1.id, created_by: manager.id, due_date: null },
    // Hooli
    { opp_idx: 3, title: 'Review MSA redlines with legal', is_next_step: true, status: 'open', assigned_to: se2.id, created_by: se2.id, due_date: '2026-04-15' },
    { opp_idx: 3, title: 'Prepare expansion scope doc', is_next_step: false, status: 'open', assigned_to: se2.id, created_by: manager.id, due_date: '2026-03-25' }, // overdue
    // Initech
    { opp_idx: 2, title: 'Build Snowflake demo environment', is_next_step: true, status: 'in_progress', assigned_to: se2.id, created_by: se2.id, due_date: '2026-04-20' },
  ];

  for (const task of tasks) {
    await client.query(`
      INSERT INTO tasks (opportunity_id, title, is_next_step, status, assigned_to_id, created_by_id, due_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [oppIds[task.opp_idx], task.title, task.is_next_step, task.status, task.assigned_to, task.created_by, task.due_date ?? null]);
  }
  console.log(`  tasks  ${tasks.length} created`);

  // ── Notes ──────────────────────────────────────────────────────────────────
  const notes = [
    { opp_idx: 0, author: se1.id, content: 'Had a great intro call with Lisa Park (CDO). She confirmed data quality is a board-level initiative for 2026. Main pain: inconsistent master data across their ERP and CRM systems. Technical decision maker is their Head of Data Engineering, Tom Wu — need to get him on the next call.' },
    { opp_idx: 0, author: manager.id, content: 'Reviewed ACME situation with Alex. This one has real legs — CDO is a strong champion and the budget is pre-approved. Pushing to accelerate to demo before end of Q1.' },
    { opp_idx: 1, author: se1.id, content: 'Demo completed. Walked through DQ rules engine, lineage, and the Snowflake connector. Robert Kim was very engaged on the lineage piece — that seems to be the differentiator vs Collibra for them. Pricing came up; they are expecting us to be competitive.' },
    { opp_idx: 1, author: se1.id, content: 'Sent proposal. Waiting to hear back from procurement. Robert mentioned internal review takes 2-3 weeks. Following up next Friday.' },
    { opp_idx: 3, author: se2.id, content: 'Technical validation session complete. All 12 requirements in their RFP confirmed as met. CTO was in the room and signed off. Now purely commercial — legal is reviewing the MSA.' },
    { opp_idx: 2, author: se2.id, content: 'Discovery call done. Initech is running entirely on Snowflake + dbt. They want to see DQ rules running natively in their Snowflake environment. Will build a tailored demo using their sample data schema.' },
  ];

  for (const note of notes) {
    const { rows: [n] } = await client.query(`
      INSERT INTO notes (opportunity_id, author_id, content)
      VALUES ($1, $2, $3)
      RETURNING id
    `, [oppIds[note.opp_idx], note.author, note.content]);

    // Update last_note_at on the opportunity
    await client.query(`
      UPDATE opportunities SET last_note_at = now(), updated_at = now()
      WHERE id = $1
    `, [oppIds[note.opp_idx]]);

    void n;
  }
  console.log(`  notes  ${notes.length} created`);

  await client.end();
  console.log('\nSeed complete.');
  console.log('\nLogin credentials:');
  console.log('  Manager:  tomas.bolek@ataccama.com  /  manager');
  console.log('  SE 1:     alex.rivera@ataccama.com /  se123');
  console.log('  SE 2:     jordan.kim@ataccama.com  /  se123');
}

seed().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
