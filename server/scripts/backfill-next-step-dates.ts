/**
 * One-off backfill: populate next_step_updated_at from the date stamp
 * embedded in the existing next_step_sf text, for rows where migration 051
 * couldn't recover a timestamp from opportunity_field_history.
 *
 * Why it's needed: migration 051's backfill only fills rows that had a
 * PRIOR change recorded in field_history. Deals where the Next Step has
 * appeared in imports but never CHANGED between imports (so no history
 * row) were left with NULL timestamps — making them look stale even
 * when the AE wrote a recent Next Step. This script reparses the text
 * with parseSeCommentDate (same util that covers se_comments) and sets
 * the timestamp where a date is parseable.
 *
 * Run with:
 *   npx ts-node --esm scripts/backfill-next-step-dates.ts
 *   (from the server/ directory, inside the app-server container)
 *
 * Safe to run multiple times. Skips rows where a timestamp already exists
 * or the text has no parseable date. Issue #136-adjacent follow-up.
 */

import { query } from '../src/db/index.js';
import { parseSeCommentDate } from '../src/utils/parseSeCommentDate.js';

interface OppRow {
  id: number;
  next_step_sf: string;
  next_step_updated_at: string | null;
}

async function run() {
  const rows = await query<OppRow>(
    `SELECT id, next_step_sf, next_step_updated_at
     FROM opportunities
     WHERE next_step_sf IS NOT NULL AND length(next_step_sf) > 0
       AND next_step_updated_at IS NULL`
  );

  console.log(`Found ${rows.length} opportunities with next_step_sf text but no timestamp`);

  let updated = 0;
  let skippedNoParse = 0;

  for (const row of rows) {
    const parsed = parseSeCommentDate(row.next_step_sf);
    if (!parsed) {
      skippedNoParse++;
      continue;
    }

    const newTs = parsed.date.toISOString();
    await query(
      `UPDATE opportunities SET next_step_updated_at = $1 WHERE id = $2`,
      [newTs, row.id]
    );
    updated++;

    const yearNote = parsed.yearInferred ? ' (year inferred)' : '';
    console.log(`  #${row.id}  [${parsed.fmt}]  ${newTs.slice(0, 10)}${yearNote}  ← ${row.next_step_sf.slice(0, 60)}`);
  }

  console.log(`\nDone.`);
  console.log(`  Updated:       ${updated}`);
  console.log(`  No date found: ${skippedNoParse}`);
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
