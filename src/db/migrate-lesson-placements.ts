/**
 * Expand migration: introduce `module_lessons` and `lessons.org_id`.
 *
 * Hand-written rather than generated: `drizzle-kit push` diffs the whole schema
 * and offers to truncate `docs` (6917 embedding rows) over unrelated
 * pre-existing drift. Every statement here is safe to re-run.
 *
 * Safe to re-run means SAFE, not merely idempotent-looking. Two things earn
 * that. The backfill skips lessons with a NULL `module_id`, which is the state
 * every library-created lesson is in once the app is deployed — without the
 * filter a re-run aborts on a NOT NULL violation, and `migrate-drop-lesson
 * -module-id.ts` explicitly instructs a re-run as its remediation. And the
 * whole run is ONE transaction, so a failure part-way leaves the database in
 * the state it started in rather than half-expanded: Postgres DDL is
 * transactional, so `create table` and `create index` roll back with
 * everything else.
 *
 * What it will NOT do is resurrect a deliberately removed placement:
 * `unlinkLesson` deletes the `module_lessons` row and leaves the stale
 * `lessons.module_id` behind, so a re-run past the deploy would re-create it.
 * That is why the contract migration exists and why the runbook's ordering
 * (relax -> deploy -> contract) is not optional — see
 * `docs/deploy-lessons-module-id-drop.md`.
 *
 * This migration ONLY expands. `lessons.module_id`, `lessons.rank` and
 * `lesson_dependencies` are still present and still authoritative afterwards —
 * `migrate-drop-lesson-module-id.ts` removes them once every reader has moved.
 *
 * Run: pnpm db:migrate-lesson-placements
 */
import { sql } from 'drizzle-orm';
import { db } from '#/db';

export async function migrateLessonPlacements(): Promise<void> {
  // ONE transaction. Postgres DDL is transactional, so a failure part-way
  // — the NOT NULL gate below, a lost connection — rolls the whole run back
  // rather than leaving the database half-expanded, which is the state a
  // re-run is least able to reason about.
  await db.transaction(async (tx) => {
    console.info('Creating disciplines…');
    await tx.execute(sql`
      create table if not exists "disciplines" (
        "id"         integer primary key generated always as identity,
        "org_id"     integer not null references "organizations"("id") on delete cascade,
        "name"       text not null,
        "slug"       text not null unique,
        "created_at" timestamp not null default now(),
        "updated_at" timestamp not null default now()
      );
    `);
    await tx.execute(sql`
      alter table "lessons"
        add column if not exists "discipline_id" integer references "disciplines"("id") on delete no action;
    `);

    console.info('Creating module_lessons…');
    await tx.execute(sql`
      create table if not exists "module_lessons" (
        "id"         integer primary key generated always as identity,
        "module_id"  integer not null references "modules"("id") on delete cascade,
        "lesson_id"  integer not null references "lessons"("id") on delete cascade,
        "rank"       numeric(30,15) not null,
        "depends_on" jsonb not null default '[]'::jsonb,
        "created_at" timestamp not null default now(),
        "updated_at" timestamp not null default now()
      );
    `);
    await tx.execute(sql`
      create unique index if not exists "module_lessons_module_lesson_idx"
        on "module_lessons" ("module_id", "lesson_id");
    `);
    await tx.execute(sql`
      create index if not exists "module_lessons_module_id_idx"
        on "module_lessons" ("module_id");
    `);
    await tx.execute(sql`
      create index if not exists "module_lessons_lesson_id_idx"
        on "module_lessons" ("lesson_id");
    `);

    console.info('Backfilling one placement per existing lesson…');
    // `where "module_id" is not null` is what makes this re-runnable.
    //
    // `migrate-drop-lesson-module-id.ts` tells the operator to re-run this
    // migration when its orphan gate trips, and by then the app has been
    // deployed — so `createLibraryLesson` has been creating lessons with a NULL
    // `module_id` (it writes no placement by design; a library lesson exists
    // before any course teaches it). Selected unfiltered, those NULLs hit
    // `module_lessons.module_id NOT NULL`, the whole statement aborts with a
    // 23502, and `on conflict` cannot help — it only catches a unique
    // violation. The remediation the other migration prints was therefore
    // unusable at exactly the moment it was printed.
    //
    // Filtering them out is also the CORRECT backfill, not just a survivable
    // one: a lesson with no `module_id` has no placement to carry across.
    await tx.execute(sql`
      insert into "module_lessons" ("module_id", "lesson_id", "rank")
      select "module_id", "id", "rank" from "lessons"
      where "module_id" is not null
      on conflict ("module_id", "lesson_id") do nothing;
    `);

    console.info('Carrying lesson_dependencies across…');
    await tx.execute(sql`
      update "module_lessons" ml
      set "depends_on" = ld."depends_on"
      from "lesson_dependencies" ld
      where ld."lesson_id" = ml."lesson_id"
        and ml."depends_on" = '[]'::jsonb;
    `);

    console.info('Adding lessons.org_id…');
    await tx.execute(sql`
      alter table "lessons"
        add column if not exists "org_id" integer references "organizations"("id") on delete cascade;
    `);

    console.info(
      'Backfilling lessons.org_id via module → course → course_orgs…',
    );
    await tx.execute(sql`
      update "lessons" l
      set "org_id" = sub."org_id"
      from (
        select m."id" as "module_id", min(co."org_id") as "org_id"
        from "modules" m
        join "course_orgs" co on co."course_id" = m."course_id"
        group by m."id"
      ) sub
      where sub."module_id" = l."module_id"
        and l."org_id" is null;
    `);

    // The gate. A lesson with no org would have to be invented, so stop instead.
    const { rows } = await tx.execute<{ n: number }>(sql`
      select count(*)::int as "n" from "lessons" where "org_id" is null;
    `);
    const n = rows[0]?.n ?? 0;
    if (n > 0) {
      throw new Error(
        `${n} lesson(s) have no org — their course has no course_orgs row. ` +
          `Seed those links (pnpm db:seed-org-links) and re-run. ` +
          `Refusing to set org_id NOT NULL.`,
      );
    }

    console.info('Setting lessons.org_id NOT NULL…');
    await tx.execute(sql`
      alter table "lessons" alter column "org_id" set not null;
    `);
    await tx.execute(sql`
      create index if not exists "lessons_org_id_idx" on "lessons" ("org_id");
    `);
    await tx.execute(sql`
      create index if not exists "lessons_discipline_id_idx"
        on "lessons" ("discipline_id");
    `);
  });

  console.info('Done.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrateLessonPlacements()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
