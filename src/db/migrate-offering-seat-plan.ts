import { sql } from 'drizzle-orm';
import { db } from '#/db';

/**
 * Adds `offering_users.plan`: whether this seat is paid or free. Every
 * existing seat becomes `paid`, so nobody's videos change on rollout.
 *
 * Run BEFORE deploying the code that reads it: the schedule and the lesson
 * playback both select the column, so they fail without it. The code before it
 * never names the column, so there is no hurry after.
 *
 * By hand rather than `drizzle-kit push`: push diffs the whole schema and, on
 * this database, offers to truncate `docs` because of unrelated drift.
 *
 * Re-running is a no-op.
 *
 * Usage:
 *   pnpm db:migrate-offering-seat-plan
 */
export const OFFERING_SEAT_PLAN_STATEMENTS = [
  sql`alter table "offering_users" add column if not exists "plan" text not null default 'paid'`,
];

async function main() {
  for (const statement of OFFERING_SEAT_PLAN_STATEMENTS) {
    await db.execute(statement);
  }
  console.log('offering_users.plan is in place.');
  process.exit(0);
}

if (process.argv[1]?.endsWith('migrate-offering-seat-plan.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
