import { sql } from 'drizzle-orm';
import { db } from '#/db';

/**
 * Adds `offerings.arrive_at`: the day students report to the training center.
 * Empty on every existing offering.
 *
 * Run BEFORE deploying the code that reads it: the schedule selects the column,
 * so it fails without it. The code before it never names the column, so there
 * is no hurry after.
 *
 * By hand rather than `drizzle-kit push`: push diffs the whole schema and, on
 * this database, offers to truncate `docs` because of unrelated drift.
 *
 * Re-running is a no-op.
 *
 * Usage:
 *   pnpm db:migrate-offering-arrive-at
 */
export const OFFERING_ARRIVE_AT_STATEMENTS = [
  sql`alter table "offerings" add column if not exists "arrive_at" date`,
];

async function main() {
  for (const statement of OFFERING_ARRIVE_AT_STATEMENTS) {
    await db.execute(statement);
  }
  console.log('offerings.arrive_at is in place.');
  process.exit(0);
}

if (process.argv[1]?.endsWith('migrate-offering-arrive-at.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
