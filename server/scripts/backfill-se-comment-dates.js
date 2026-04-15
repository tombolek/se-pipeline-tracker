"use strict";
/**
 * One-off backfill: set se_comments_updated_at from the date stamp
 * embedded in the comment text, for all existing opportunities.
 *
 * Run with:
 *   npx ts-node --esm scripts/backfill-se-comment-dates.ts
 *   (from the server/ directory)
 *
 * Safe to run multiple times — only updates rows where the parsed date
 * differs from the currently stored se_comments_updated_at.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("../src/db/index.js");
const parseSeCommentDate_js_1 = require("../src/utils/parseSeCommentDate.js");
async function run() {
    const rows = await (0, index_js_1.query)(`SELECT id, se_comments, se_comments_updated_at
     FROM opportunities
     WHERE se_comments IS NOT NULL AND length(se_comments) > 0`);
    console.log(`Found ${rows.length} opportunities with se_comments`);
    let updated = 0;
    let skippedNoParse = 0;
    let skippedSameDate = 0;
    for (const row of rows) {
        const parsed = (0, parseSeCommentDate_js_1.parseSeCommentDate)(row.se_comments);
        if (!parsed) {
            skippedNoParse++;
            continue;
        }
        const newTs = parsed.date.toISOString();
        const existingTs = row.se_comments_updated_at
            ? new Date(row.se_comments_updated_at).toISOString()
            : null;
        if (existingTs === newTs) {
            skippedSameDate++;
            continue;
        }
        await (0, index_js_1.query)(`UPDATE opportunities SET se_comments_updated_at = $1 WHERE id = $2`, [newTs, row.id]);
        updated++;
        const yearNote = parsed.yearInferred ? ' (year inferred)' : '';
        console.log(`  #${row.id}  [${parsed.fmt}]  ${newTs.slice(0, 10)}${yearNote}  ← ${row.se_comments.slice(0, 60)}`);
    }
    console.log(`\nDone.`);
    console.log(`  Updated:          ${updated}`);
    console.log(`  No date found:    ${skippedNoParse}`);
    console.log(`  Already correct:  ${skippedSameDate}`);
    process.exit(0);
}
run().catch(err => { console.error(err); process.exit(1); });
