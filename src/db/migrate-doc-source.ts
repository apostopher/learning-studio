import { sql } from 'drizzle-orm';
import { db } from '#/db';

/**
 * Adds `docs.source` ('itps' | '3d-airmanship') so training documents carry a
 * label. Existing rows take the default, '3d-airmanship'.
 *
 * By hand rather than `drizzle-kit push`: push diffs the whole schema and, on
 * this database, offers to truncate `docs` (thousands of embedding rows)
 * because of unrelated drift. These statements only add.
 *
 * Re-running is a no-op.
 *
 * Usage:
 *   pnpm db:migrate-doc-source
 */
export const DOC_SOURCE_STATEMENTS = [
  sql`alter table "docs" add column if not exists "source" text not null default '3d-airmanship'`,
  sql`do $$
  begin
    if not exists (select 1 from pg_constraint where conname = 'docs_source_check') then
      alter table "docs" add constraint "docs_source_check" check ("source" in ('itps', '3d-airmanship'));
    end if;
  end
  $$`,
];

async function main() {
  await db.transaction(async (tx) => {
    for (const statement of DOC_SOURCE_STATEMENTS) {
      await tx.execute(statement);
    }
  });
  console.log('docs.source is in place.');
  process.exit(0);
}

if (process.argv[1]?.endsWith('migrate-doc-source.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
