/**
 * File an existing discipline's lessons into discipline modules that mirror
 * the OLD platform's course structure — the one-off that gives the library
 * pane its shelves after `import-course.ts` has already brought the content
 * across.
 *
 * Read-only against `OLD_DATABASE_URL`. Against `DATABASE_URL` it writes
 * exactly two things: `discipline_modules` rows, and three columns on
 * lessons that already exist (`discipline_id`, `discipline_module_id`,
 * `library_rank`). It creates no lesson, deletes nothing, and touches no
 * course, placement or blob — the filing decisions and their refusals live
 * in `./import-discipline-modules.ts`, which is unit-tested against a fake
 * `q` because raw `pg` SQL is invisible to tsc.
 *
 * Idempotent and safe to re-run: modules upsert on `(discipline_id, name)`,
 * and a lesson that is already filed — by an earlier run or by an SME
 * dragging it — is left exactly where it is and reported. A run therefore
 * resumes after a crash without ever undoing someone's organising.
 *
 *   pnpm db:import-discipline-library                     # dry run, prints the plan
 *   pnpm db:import-discipline-library --write             # applies it
 *   pnpm db:import-discipline-library --course=<slug> --discipline=<slug>
 *
 * Defaults to the flagship: the old `3d-airmanship` course into the
 * `3d-airmanship` discipline of the active org.
 */
import { Pool } from 'pg';
import { getActiveOrgId } from '../src/lib/active-org.server';
import {
  disciplineModuleName,
  fileLessonsIntoDisciplineModules,
  type OldLessonRow,
  type OldModuleRow,
  upsertDisciplineModules,
} from './import-discipline-modules';

const arg = (name: string, fallback: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ??
  fallback;
const COURSE_SLUG = arg('course', '3d-airmanship');
const DISCIPLINE_SLUG = arg('discipline', '3d-airmanship');
const WRITE = process.argv.includes('--write');

const oldDb = new Pool({ connectionString: process.env.OLD_DATABASE_URL });
const newDb = new Pool({ connectionString: process.env.DATABASE_URL });
const oldQ = async <T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> => (await oldDb.query(sql, params)).rows as T[];
const newQ = async <T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> => (await newDb.query(sql, params)).rows as T[];

async function main() {
  const orgId = getActiveOrgId();

  // The discipline must already exist and belong to the active org: this
  // script files lessons, it does not invent the shelf they go on.
  const [discipline] = await newQ<{ id: number; name: string }>(
    `select id, name from disciplines where slug = $1 and org_id = $2`,
    [DISCIPLINE_SLUG, orgId],
  );
  if (!discipline) {
    throw new Error(
      `no discipline "${DISCIPLINE_SLUG}" in org ${orgId} — create it first`,
    );
  }

  const oldModules = await oldQ<OldModuleRow>(
    `select m.name, m.slug, m.rank::text as rank
       from modules m join courses c on c.id = m.course_id
      where c.slug = $1
      order by m.rank, m.id`,
    [COURSE_SLUG],
  );
  if (oldModules.length === 0) {
    throw new Error(`no modules on old course "${COURSE_SLUG}"`);
  }
  const oldLessons = await oldQ<OldLessonRow>(
    `select l.slug, l.rank::text as rank, m.slug as module_slug
       from lessons l
       join modules m on m.id = l.module_id
       join courses c on c.id = m.course_id
      where c.slug = $1
      order by m.rank, l.rank, l.id`,
    [COURSE_SLUG],
  );

  console.log(
    `${discipline.name} (discipline ${discipline.id}, org ${orgId}) ← old course "${COURSE_SLUG}"`,
  );
  console.log(
    `source: ${oldModules.length} modules, ${oldLessons.length} lessons`,
  );
  for (const m of oldModules) {
    const n = oldLessons.filter((l) => l.module_slug === m.slug).length;
    console.log(`  ${disciplineModuleName(m.name).padEnd(34)} ${n}`);
  }

  if (!WRITE) {
    console.log('\nDry run — nothing written. Re-run with --write to apply.');
    await Promise.all([oldDb.end(), newDb.end()]);
    return;
  }

  const modules = await upsertDisciplineModules(
    newQ,
    discipline.id,
    oldModules,
  );
  const report = await fileLessonsIntoDisciplineModules(
    newQ,
    discipline.id,
    modules.moduleIdByOldSlug,
    oldLessons,
  );

  console.log(
    `\nmodules: ${modules.inserted} created, ${modules.updated} re-ranked`,
  );
  console.log(`lessons filed: ${report.filed}`);
  if (report.alreadyOrganised.length > 0) {
    console.log(
      `left where they were (already filed): ${report.alreadyOrganised.length}`,
    );
  }
  if (report.otherDiscipline.length > 0) {
    console.log(
      `left alone (belong to another discipline): ${report.otherDiscipline
        .map((r) => `${r.slug}→${r.disciplineId}`)
        .join(', ')}`,
    );
  }
  if (report.missing.length > 0) {
    console.log(
      `in the old course but not in this database: ${report.missing.join(', ')}`,
    );
  }

  await Promise.all([oldDb.end(), newDb.end()]);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
