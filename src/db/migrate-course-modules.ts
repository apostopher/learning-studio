import { sql } from 'drizzle-orm';
import { db } from '#/db';

export type ModuleRow = { id: number; courseId: number; rank: string };
export type CourseModuleRow = {
  courseId: number;
  moduleId: number;
  rank: string;
};

/**
 * One row per module, in the course that owns it, at the rank it already has.
 *
 * Pure so it can be tested without a database. `rank` stays a STRING the whole
 * way: `numeric(30,15)` arrives from pg as a string and parsing it loses the
 * low decimals that repeated drag-and-drop produces.
 */
export function planCourseModuleBackfill(
  modules: readonly ModuleRow[],
): CourseModuleRow[] {
  return modules.map((m) => ({
    courseId: m.courseId,
    moduleId: m.id,
    rank: m.rank,
  }));
}

async function tableExists(name: string): Promise<boolean> {
  const { rows } = await db.execute<{ exists: boolean }>(
    sql`select to_regclass(${`public.${name}`}) is not null as exists`,
  );
  return rows[0]?.exists === true;
}

async function main() {
  if (await tableExists('course_modules')) {
    const { rows } = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from course_modules`,
    );
    console.log(`course_modules already exists with ${rows[0]?.n} rows — nothing to do.`);
    process.exit(0);
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      create table "course_modules" (
        "id" integer primary key generated always as identity,
        "course_id" integer not null references "courses"("id") on delete cascade,
        "module_id" integer not null references "modules"("id") on delete cascade,
        "rank" numeric(30,15) not null,
        "created_at" timestamp not null default now()
      )`);
    await tx.execute(sql`
      create unique index "course_modules_course_module_idx"
        on "course_modules" ("course_id", "module_id")`);
    await tx.execute(sql`
      create index "course_modules_course_id_idx" on "course_modules" ("course_id")`);
    await tx.execute(sql`
      create index "course_modules_module_id_idx" on "course_modules" ("module_id")`);

    // Backfill in SQL rather than round-tripping every row through node: the
    // planner above is the tested statement of intent, and this is the same
    // mapping expressed where the rows already are.
    await tx.execute(sql`
      insert into "course_modules" ("course_id", "module_id", "rank")
      select "course_id", "id", "rank" from "modules"`);
  });

  const { rows } = await db.execute<{ modules: number; placements: number }>(sql`
    select (select count(*) from modules)::int as modules,
           (select count(*) from course_modules)::int as placements`);
  const { modules, placements } = rows[0] ?? { modules: -1, placements: -2 };
  if (modules !== placements) {
    throw new Error(`backfill mismatch: ${modules} modules, ${placements} course_modules rows`);
  }
  console.log(`course_modules created; backfilled ${placements} rows.`);
  process.exit(0);
}

// Guarded so `planCourseModuleBackfill` can be imported (e.g. by its unit
// test) without the import itself running the migration against the live
// database — matches migrate-material-links.ts / migrate-lesson-placements.ts.
if (process.argv[1]?.endsWith('migrate-course-modules.ts')) {
  await main();
}
