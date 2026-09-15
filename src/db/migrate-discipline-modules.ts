import { sql } from 'drizzle-orm';
import { db } from '#/db';

/**
 * Discipline modules (spec: docs/superpowers/specs/2026-09-15-discipline-
 * modules-design.md): one new table and two NULLABLE lesson columns.
 *
 * Purely additive — no row is updated or deleted, no default is written —
 * so every existing lesson simply appears in its discipline's Untitled
 * group afterwards, and this can run before or after the code deploys.
 * Idempotent: `to_regclass` on the table, `if not exists` on the columns
 * and index, matching `migrate-course-remixes.ts`.
 *
 * Run: pnpm db:migrate-discipline-modules
 */
export async function migrateDisciplineModules(): Promise<
  'created' | 'exists'
> {
  const { rows } = await db.execute<{ exists: boolean }>(
    sql`select to_regclass(${'public.discipline_modules'}) is not null as exists`,
  );
  if (rows[0]?.exists === true) return 'exists';

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      create table "discipline_modules" (
        "id" integer primary key generated always as identity,
        "discipline_id" integer not null references "disciplines"("id") on delete cascade,
        "name" text not null,
        "rank" numeric(30,15) not null,
        "created_at" timestamp not null default now(),
        "updated_at" timestamp not null default now()
      )`);
    await tx.execute(sql`
      create index "discipline_modules_discipline_id_idx" on "discipline_modules" ("discipline_id")`);
    await tx.execute(sql`
      alter table "lessons" add column if not exists "discipline_module_id" integer references "discipline_modules"("id") on delete set null`);
    await tx.execute(sql`
      alter table "lessons" add column if not exists "library_rank" numeric(30,15)`);
    await tx.execute(sql`
      create index if not exists "lessons_discipline_module_id_idx" on "lessons" ("discipline_module_id")`);
  });
  return 'created';
}

async function main() {
  const outcome = await migrateDisciplineModules();
  console.log(
    outcome === 'exists'
      ? 'discipline_modules already exists — nothing to do.'
      : 'discipline_modules created; lessons.discipline_module_id and lessons.library_rank added.',
  );
  process.exit(0);
}

if (process.argv[1]?.endsWith('migrate-discipline-modules.ts')) {
  await main();
}
