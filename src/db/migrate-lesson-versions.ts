import { type SQL, sql } from 'drizzle-orm';
import {
  pinLessons,
  shownUnpinned,
  snapshotLessons,
} from '#/db/lesson-version-sql';
import { DEFAULT_LESSON_VERSION } from '#/lib/lesson-version';

/**
 * Lesson versions: courses pin frozen snapshots of lessons. Adds
 * `lessons.version` and `lessons.content_updated_at`, the `lesson_versions`
 * (snapshots) and `course_lesson_versions` (pins) tables, and
 * `lesson_version_id` on `lesson_knowledge_chunks` and `docs`. Then every
 * (course, lesson) a course shows without a pin gets one, and, on the first
 * run only, existing chunk and lesson doc rows are labelled with their
 * lesson's snapshot (`FIRST_RUN_LABELS`).
 *
 * Run order: MIGRATE -> DEPLOY -> MIGRATE AGAIN. The second run pins whatever
 * the old code placed between the two. It labels nothing: afterwards
 * `pnpm db:index-lesson-versions` embeds snapshots with no search rows, and
 * the debrief regenerates missing chunks. Until the deploy:
 * - do not edit lesson content: a snapshot is already frozen, so an edit made
 *   on the old code stays out of every course until the lesson goes to 1.1;
 * - the old code cannot store newly generated debrief chunks (it upserts on
 *   the unique `lesson_id` index this replaces). Stored chunks keep working.
 *
 * By hand rather than `drizzle-kit push`: push diffs the whole schema and, on
 * this database, offers to truncate `docs` because of unrelated drift. These
 * statements only add, bar one index that is replaced.
 *
 * Re-running is safe: a pin is never moved, a snapshot never changed, and a
 * lesson whose courses all have pins is never snapshotted again (a snapshot
 * would lock the version an author is working on). It gives up after waiting
 * 5s for a lock rather than queue the whole site behind a long-running reader;
 * just run it again.
 *
 * Usage:
 *   pnpm db:migrate-lesson-versions
 */
export const LESSON_VERSIONS_STATEMENTS: SQL[] = [
  // The default is inlined, never bound: DDL takes no parameters.
  sql`alter table "lessons" add column if not exists "version" text not null default ${sql.raw(`'${DEFAULT_LESSON_VERSION}'`)}`,
  // Added without its default, so null marks the rows still to backfill and a
  // re-run finds none.
  sql`alter table "lessons" add column if not exists "content_updated_at" timestamp`,
  sql`update "lessons" l
    set "content_updated_at" = greatest(l."updated_at", (
      select max(m."updated_at") from "lesson_material" m where m."lesson_slug" = l."slug"
    ))
    where l."content_updated_at" is null`,
  sql`alter table "lessons" alter column "content_updated_at" set default now()`,
  sql`alter table "lessons" alter column "content_updated_at" set not null`,

  sql`create table if not exists "lesson_versions" (
    "id" integer generated always as identity primary key,
    "lesson_id" integer not null constraint "lesson_versions_lesson_id_lessons_id_fk" references "lessons"("id") on delete cascade,
    "version" text not null,
    "name" text not null,
    "video_provider" text,
    "video_ref" text,
    "other_video_ids" jsonb,
    "text" text,
    "key_points" json,
    "quiz" json,
    "pro_tips" text,
    "links" json,
    "assignments" text,
    "job_of_the_day" text,
    "test_this" json,
    "extra_tab" text not null,
    "created_at" timestamp not null default now()
  )`,
  sql`create unique index if not exists "lesson_versions_lesson_version_idx" on "lesson_versions" ("lesson_id","version")`,

  sql`create table if not exists "course_lesson_versions" (
    "course_id" integer not null constraint "course_lesson_versions_course_id_courses_id_fk" references "courses"("id") on delete cascade,
    "lesson_id" integer not null constraint "course_lesson_versions_lesson_id_lessons_id_fk" references "lessons"("id") on delete cascade,
    "lesson_version_id" integer not null constraint "course_lesson_versions_lesson_version_id_lesson_versions_id_fk" references "lesson_versions"("id") on delete cascade,
    "updated_at" timestamp not null default now(),
    constraint "course_lesson_versions_course_id_lesson_id_pk" primary key ("course_id","lesson_id")
  )`,
  sql`create index if not exists "course_lesson_versions_lesson_version_id_idx" on "course_lesson_versions" ("lesson_version_id")`,

  sql`alter table "lesson_knowledge_chunks" add column if not exists "lesson_version_id" integer constraint "lesson_knowledge_chunks_lesson_version_id_lesson_versions_id_fk" references "lesson_versions"("id") on delete cascade`,
  // Unique before, plain now: a lesson has one chunk row per snapshot.
  sql`drop index if exists "lesson_knowledge_chunks_lesson_idx"`,
  sql`create index if not exists "lesson_knowledge_chunks_lesson_idx" on "lesson_knowledge_chunks" ("lesson_id")`,
  sql`create unique index if not exists "lesson_knowledge_chunks_lesson_version_idx" on "lesson_knowledge_chunks" ("lesson_version_id")`,

  sql`alter table "docs" add column if not exists "lesson_version_id" integer constraint "docs_lesson_version_id_lesson_versions_id_fk" references "lesson_versions"("id") on delete cascade`,
  sql`create index if not exists "docs_lesson_version_id_idx" on "docs" ("lesson_version_id")`,

  // Only lessons some course shows without a pin.
  snapshotLessons(shownUnpinned()),
  pinLessons(),
];

/**
 * Labels existing rows with their lesson's snapshot: by table, run only by the
 * run that adds that table's `lesson_version_id`. Only then is every snapshot
 * a copy of the content those rows were made from; later, the working copy may
 * have moved on and a label would pass old rows off as the new snapshot's.
 */
export const FIRST_RUN_LABELS: Record<'lesson_knowledge_chunks' | 'docs', SQL> =
  {
    lesson_knowledge_chunks: sql`update "lesson_knowledge_chunks" c set "lesson_version_id" = v."id"
    from "lesson_versions" v
    where v."lesson_id" = c."lesson_id"`,
    docs: sql`update "docs" doc set "lesson_version_id" = v."id"
    from "lessons" l
    join "lesson_versions" v on v."lesson_id" = l."id"
    where l."slug" = doc."lesson_slug"`,
  };

/** One transaction: a failure part-way leaves the database as it was. */
export async function migrateLessonVersions(
  db: Pick<typeof import('#/db').db, 'transaction'>,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local lock_timeout = '5s'`);
    // Asked before the columns exist. A run that rolls back takes them with
    // it, so it does not count.
    const { rows } = await tx.execute<{ table_name: string }>(sql`
      select table_name from information_schema.columns
      where table_schema = current_schema() and column_name = 'lesson_version_id'`);
    const labelled = new Set(rows.map((r) => r.table_name));

    for (const statement of LESSON_VERSIONS_STATEMENTS) {
      await tx.execute(statement);
    }
    for (const [table, label] of Object.entries(FIRST_RUN_LABELS)) {
      if (!labelled.has(table)) await tx.execute(label);
    }
  });
}

async function main() {
  // Imported here so tests can run the migration on their own database without
  // building the client `#/db` opens on DATABASE_URL.
  const { db } = await import('#/db');
  await migrateLessonVersions(db);
  console.log('Lesson versions are in place and every course is pinned.');
  process.exit(0);
}

if (process.argv[1]?.endsWith('migrate-lesson-versions.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
