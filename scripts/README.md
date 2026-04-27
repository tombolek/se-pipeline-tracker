# scripts/

Operational scripts and one-off SQL seeds.

| File | Purpose |
|------|---------|
| `deploy.sh` | WSL-only deploy entrypoint. See [`docs/deploy.md`](../docs/deploy.md). |
| `backup.sh` | Snapshot pipeline. |
| `seed-calendar-demo.sql` | One-off demo seed: POCs, RFPs, and tasks scattered across April 2026 to populate the Calendar view. Run manually against a non-prod DB before demoing the calendar feature. Inserts opportunities prefixed with `DUMMY-CAL-` so they can be cleaned up by SF ID prefix. |
| `seed-cross-territory.sql` | One-off demo seed: creates an NA Enterprise opportunity assigned to an SE outside the manager's EMEA territory, to trigger the "out of territory" banner on Calendar / PoC / RFx boards. Run manually before demoing cross-territory visibility. |

Both seed scripts are idempotent-unsafe (re-runs will create duplicates). They are **not** wired into CI, dev bootstrap, or the import flow — keep them as snippets to copy/paste into `psql` when needed. Delete the corresponding rows after the demo.
