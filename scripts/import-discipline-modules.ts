/**
 * Filing phase of `import-discipline-library.ts`, split out (like
 * `import-course-modules.ts`) so it can be unit-tested with a fake `q` —
 * the runner constructs live `pg.Pool`s and runs `main()` at import time,
 * so importing it in a test would open a real connection.
 *
 * What this writes, and nothing else: `discipline_modules` rows, and three
 * columns on an already-existing lesson (`discipline_id`,
 * `discipline_module_id`, `library_rank`). No lesson is created, moved
 * between courses, or deleted — the library is a way of FILING lessons that
 * already exist, and the old database is only ever read.
 *
 * Raw `pg` SQL, invisible to tsc — the test next to this file reads the
 * statements handed to `q`, because nothing else would catch a stray column
 * or a missing `where` on an UPDATE that touches production lessons.
 */

type Q = <T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) => Promise<T[]>;

/** One old-database `modules` row, as the source still shapes it. */
export type OldModuleRow = {
  name: string;
  slug: string;
  /** `numeric` — kept as a string end to end so no decimals are lost. */
  rank: string;
};

/** One old-database `lessons` row, with the module it sat in. */
export type OldLessonRow = {
  slug: string;
  /** `numeric`, as a string. Becomes the lesson's `library_rank`. */
  rank: string;
  module_slug: string;
};

/**
 * The teaching order lives in `rank`, so a leading "3 - " in the name is the
 * same fact written twice — and the one that goes stale the moment a module
 * is dragged. Stripped on the way in: "3 - Prepared to Fly" files as
 * "Prepared to Fly". A name that merely starts with a digit ("3D Airmanship
 * Intro") is untouched — the separator is required.
 */
export function disciplineModuleName(oldName: string): string {
  return oldName.replace(/^\s*\d+\s*-\s*/, '').trim();
}

/**
 * Upsert one discipline module per source module, at the source rank.
 *
 * Natural key: `(discipline_id, name)`. A discipline module has no slug — it
 * is a folder, not an addressable thing — so the name is what a re-run
 * recognises, and renaming a module in the admin UI makes the next run
 * create it again rather than silently renaming the SME's box back.
 */
export async function upsertDisciplineModules(
  q: Q,
  disciplineId: number,
  oldModules: readonly OldModuleRow[],
): Promise<{
  moduleIdByOldSlug: Map<string, number>;
  inserted: number;
  updated: number;
}> {
  const moduleIdByOldSlug = new Map<string, number>();
  let inserted = 0;
  let updated = 0;
  for (const row of oldModules) {
    const name = disciplineModuleName(row.name);
    const [existing] = await q<{ id: number }>(
      `select id from discipline_modules where discipline_id = $1 and name = $2`,
      [disciplineId, name],
    );
    if (existing) {
      // Rank only: the name IS the key, and nothing else about a discipline
      // module comes from the source.
      await q(
        `update discipline_modules set rank = $2, updated_at = now() where id = $1`,
        [existing.id, row.rank],
      );
      moduleIdByOldSlug.set(row.slug, existing.id);
      updated++;
      continue;
    }
    const [ins] = await q<{ id: number }>(
      `insert into discipline_modules (discipline_id, name, rank) values ($1,$2,$3) returning id`,
      [disciplineId, name, row.rank],
    );
    if (!ins) {
      throw new Error(
        `insert into discipline_modules returned no row for ${name}`,
      );
    }
    moduleIdByOldSlug.set(row.slug, ins.id);
    inserted++;
  }
  return { moduleIdByOldSlug, inserted, updated };
}

export type FilingReport = {
  filed: number;
  /** Source lessons whose slug exists in no destination lesson. */
  missing: string[];
  /** Destination lessons already filed — by an SME, or by an earlier run. */
  alreadyOrganised: string[];
  /** Destination lessons belonging to a DIFFERENT discipline. */
  otherDiscipline: { slug: string; disciplineId: number }[];
};

/**
 * File each source lesson into its discipline module, by slug.
 *
 * Three refusals, all reported rather than forced, because this script runs
 * against a library people are already organising by hand:
 *
 * - a lesson already filed (any `discipline_id` or `discipline_module_id`)
 *   is LEFT ALONE — a re-run must not undo an SME's dragging, and a resumed
 *   run does not need to: the rows it already filed are the rows it wanted;
 * - a lesson under another discipline is reported, never re-filed, since a
 *   lesson has exactly one discipline and stealing it is not this script's
 *   call;
 * - a source slug with no destination lesson is reported, never created.
 */
export async function fileLessonsIntoDisciplineModules(
  q: Q,
  disciplineId: number,
  moduleIdByOldSlug: ReadonlyMap<string, number>,
  oldLessons: readonly OldLessonRow[],
): Promise<FilingReport> {
  const report: FilingReport = {
    filed: 0,
    missing: [],
    alreadyOrganised: [],
    otherDiscipline: [],
  };
  for (const row of oldLessons) {
    const moduleId = moduleIdByOldSlug.get(row.module_slug);
    if (moduleId === undefined) {
      throw new Error(
        `no discipline module for source module ${row.module_slug}`,
      );
    }
    const [lesson] = await q<{
      id: number;
      discipline_id: number | null;
      discipline_module_id: number | null;
    }>(
      `select id, discipline_id, discipline_module_id from lessons where slug = $1`,
      [row.slug],
    );
    if (!lesson) {
      report.missing.push(row.slug);
      continue;
    }
    if (lesson.discipline_id !== null && lesson.discipline_id !== disciplineId) {
      report.otherDiscipline.push({
        slug: row.slug,
        disciplineId: lesson.discipline_id,
      });
      continue;
    }
    if (lesson.discipline_id !== null || lesson.discipline_module_id !== null) {
      report.alreadyOrganised.push(row.slug);
      continue;
    }
    // Pinned by id, three columns, no delete: the whole blast radius of this
    // script on the lessons table.
    await q(
      `update lessons set discipline_id = $2, discipline_module_id = $3, library_rank = $4, updated_at = now() where id = $1`,
      [lesson.id, disciplineId, moduleId, row.rank],
    );
    report.filed++;
  }
  return report;
}
