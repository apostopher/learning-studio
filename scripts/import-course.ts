/**
 * One-off import of the old platform's `3d-airmanship` course into this
 * database as a new course.
 *
 * Design notes (see
 * docs/superpowers/specs/2026-07-30-itps-uas-remote-course-import-ledger.md):
 *
 * - **Idempotent and resumable.** Every step upserts on a natural key (slug,
 *   or file name for blobs), so a re-run resumes rather than duplicating. This
 *   matters because the ~130 MB blob transfer is the most likely thing to fail
 *   partway and cannot be rolled back inside a database transaction.
 * - **Raw `pg`, not drizzle.** Two different databases with two different
 *   schema versions, plus `numeric` ranks that must not lose precision and
 *   `vector` embeddings that round-trip as text. Explicit SQL is clearer here
 *   than fighting an ORM mapping over a boundary that exists once.
 * - **Content is copied byte-for-byte.** Lesson material text keeps its
 *   production-script scaffolding rather than being cleaned during import, so
 *   the result is verifiable by hash against the source. Cleanup is a separate
 *   pass with a known-good baseline; see the report this prints at the end.
 *
 * **Targets the post-contract schema** (Task 7,
 * `migrate-drop-lesson-module-id.ts`): `NEW_DATABASE_URL`'s `lessons` no
 * longer has `module_id`/`rank`, and `lesson_dependencies` no longer exists
 * there — a lesson's course/rank/prerequisites are all written to its
 * `module_lessons` placement instead. This is asymmetric: the OLD database
 * (`OLD_DATABASE_URL`, read via `oldQ`) still has the pre-contract shape and
 * is read as such throughout — only the writes against `DATABASE_URL` (via
 * `newQ`) changed.
 *
 * **`lessons.org_id` is also NOT NULL** (Task 5/6). Rather than requiring a
 * separate `pnpm db:seed-org-links` run between "create the course" and
 * "import its lessons" — a real sequencing constraint that would otherwise
 * belong in `docs/deploy-lessons-module-id-drop.md` — this script links the
 * course to the active org (`getActiveOrgId()`) itself, right after
 * resolving `courseId` and before the modules/lessons loops, the same
 * invariant `createCourse` (`src/db/admin.ts`) enforces for courses created
 * through the admin UI ("whatever this deployment administers, it owns
 * what it creates/imports"). A fresh `import → run` needs no extra step.
 * The org actually stamped on each lesson is then read back via the same
 * MIN(org_id) rule `migrate-lesson-placements.ts`'s backfill used, so it
 * agrees with a course that already belonged to some OTHER org too — not
 * necessarily the active one.
 */
import { createHash } from 'node:crypto';
import { put } from '@vercel/blob';
import { Pool } from 'pg';
import { getActiveOrgId } from '#/lib/active-org.server';
import { resolveCourseOrgId } from './resolve-course-org-link';

const OLD_COURSE_SLUG = '3d-airmanship';
const NEW_COURSE_NAME = 'iTPS UAS Remote';
const NEW_COURSE_SLUG = 'itps-uas-remote';

/**
 * Test artifacts, excluded. Both live in `personal-development-and-leadership`,
 * are named "... TEST DEMO", and are `is_available = false`. The second one's
 * slug is a Synthesia share URL that was pasted into the name field and then
 * slugified.
 */
const SKIP_LESSON_SLUGS = [
  'rpas-20-test-demo',
  'rpas-20httpssharesynthesiaio539098ade95c4b1fb3e4c831b684941alanguageen-test-demo',
];

/**
 * `blob_files.uploadedBy` is `not null` with no FK. The old value is a Clerk id
 * from a different identity system, so copying it would plant a reference to a
 * user that does not exist here. A marker is honest and greppable.
 */
const UPLOADED_BY = `import:${NEW_COURSE_SLUG}`;

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

/**
 * Run `fn` against ONE checked-out connection wrapped in `begin`/`commit` —
 * `newQ` above goes through the pool, which hands out a different
 * connection per call, so two `newQ` calls can never share a transaction.
 *
 * Used for the one pair of writes in this script that must be atomic: a
 * `lessons` row and its `module_lessons` placement (fix round 2, Important
 * 4). Under the pre-Task-7 schema `lessons.module_id` was `NOT NULL`, so an
 * unplaced lesson was unrepresentable and this couldn't happen; post-
 * contract it can, and the migration's orphan gate — which only counts
 * rows with a non-null `module_id`, a column that no longer exists by
 * then — cannot detect it. A crash between the two writes without this
 * wrapper would leave exactly that: a lesson with no placement at all.
 */
async function withNewTx<T>(
  fn: (q: <U = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ) => Promise<U[]>) => Promise<T>,
): Promise<T> {
  const client = await newDb.connect();
  const txQ = async <U = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<U[]> => (await client.query(sql, params)).rows as U[];
  try {
    await client.query('begin');
    const result = await fn(txQ);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

const sha = (v: string) => createHash('sha256').update(v, 'utf8').digest('hex');

type Counter = { inserted: number; updated: number; skipped: number };
const tally = (): Counter => ({ inserted: 0, updated: 0, skipped: 0 });
const report = (label: string, c: Counter) =>
  console.log(
    `  ${label.padEnd(24)} inserted=${c.inserted} updated=${c.updated} skipped=${c.skipped}`,
  );

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(
    `\n=== Import "${NEW_COURSE_NAME}" ${dryRun ? '(DRY RUN — no writes)' : ''}\n`,
  );

  // Fix round 4, Minor 8: read (and validate) BEFORE any write and before
  // the dry-run early-exit below — previously this ran after the course
  // INSERT, so a missing/invalid `ACTIVE_ORG_ID` aborted having already
  // created the course, and a `--dry-run` never validated it at all despite
  // dry-run's whole point being to catch what WOULD fail.
  const activeOrgId = getActiveOrgId();

  const [oldCourse] = await oldQ<{ id: number; name: string }>(
    `select id, name from courses where slug = $1`,
    [OLD_COURSE_SLUG],
  );
  if (!oldCourse) throw new Error(`old course ${OLD_COURSE_SLUG} not found`);

  // ---------------------------------------------------------------- course
  let [course] = await newQ<{ id: number }>(
    `select id from courses where slug = $1`,
    [NEW_COURSE_SLUG],
  );
  if (!course) {
    if (dryRun) {
      console.log('  course                   would insert');
    } else {
      [course] = await newQ<{ id: number }>(
        `insert into courses (name, slug) values ($1, $2) returning id`,
        [NEW_COURSE_NAME, NEW_COURSE_SLUG],
      );
      console.log(`  course                   inserted id=${course?.id}`);
    }
  } else {
    console.log(`  course                   exists id=${course.id}`);
  }
  if (dryRun) {
    console.log('\nDry run complete — nothing written.\n');
    process.exit(0);
  }
  const courseId = course?.id;
  if (courseId === undefined) throw new Error('no course id');

  // Whatever this deployment administers, it owns what it imports — same
  // invariant `createCourse` (src/db/admin.ts) enforces via `linkCourseToOrg`
  // when a course is created through the admin UI. Doing this HERE, before
  // the lessons loop below, means a fresh import never needs a separate
  // `pnpm db:seed-org-links` run in between — see the header note. Split
  // into `resolveCourseOrgId` (./resolve-course-org-link.ts) so it can be
  // unit-tested without a real `pg.Pool`.
  const lessonOrgId = await resolveCourseOrgId(
    newQ,
    courseId,
    NEW_COURSE_SLUG,
    activeOrgId,
  );

  // --------------------------------------------------------------- modules
  const oldModules = await oldQ(
    `select id, name, slug, required_subscriptions, rank, created_at, updated_at
     from modules where course_id = $1 order by rank`,
    [oldCourse.id],
  );
  const moduleIdBySlug = new Map<string, number>();
  const mc = tally();
  for (const m of oldModules as Record<string, never>[]) {
    const row = m as unknown as {
      id: number;
      name: string;
      slug: string;
      required_subscriptions: string[];
      rank: string;
      created_at: Date;
      updated_at: Date;
    };
    const [existing] = await newQ<{ id: number }>(
      `select id from modules where slug = $1`,
      [row.slug],
    );
    if (existing) {
      await newQ(
        `update modules set course_id=$2, name=$3, required_subscriptions=$4, rank=$5, updated_at=$6 where id=$1`,
        [
          existing.id,
          courseId,
          row.name,
          row.required_subscriptions,
          row.rank,
          row.updated_at,
        ],
      );
      moduleIdBySlug.set(row.slug, existing.id);
      mc.updated++;
    } else {
      const [ins] = await newQ<{ id: number }>(
        `insert into modules (course_id, name, slug, required_subscriptions, rank, created_at, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7) returning id`,
        [
          courseId,
          row.name,
          row.slug,
          row.required_subscriptions,
          row.rank,
          row.created_at,
          row.updated_at,
        ],
      );
      if (ins) moduleIdBySlug.set(row.slug, ins.id);
      mc.inserted++;
    }
  }
  report('modules', mc);

  // Every module id belonging to THIS course IN THE DESTINATION, per
  // Important 3 (fix round 2) — scopes the placement lookup below to "does
  // this lesson already have a placement IN THIS COURSE", the same scoping
  // `movePlacement` (`src/db/placements.ts`) uses for its own UPDATE via
  // `getModuleIdsForCourse` (a live `select id from modules where
  // course_id = $1` against the real database).
  //
  // Fix round 4, Important 1: this used to be `[...moduleIdBySlug.values
  // ()]` — every module the OLD SOURCE has for this course, not the
  // destination. A module that exists only in the destination (an admin
  // created one, or renamed a slug so the source/destination sets no
  // longer line up 1:1) was invisible to that lookup, so a lesson already
  // placed under it would be missed: the insert branch below would run
  // instead of the move branch, creating the second placement in one
  // course this whole fix exists to prevent. Queried fresh AFTER the
  // modules loop above, so it includes modules this run just inserted too.
  const courseModuleIds = (
    await newQ<{ id: number }>(
      `select id from modules where course_id = $1`,
      [courseId],
    )
  ).map((r) => r.id);

  // --------------------------------------------------------------- lessons
  const oldLessons = await oldQ(
    `select l.id, l.module_id, l.name, l.slug, l.video_id, l.other_video_ids,
            l.required_subscriptions, l.rank, l.is_available, l.exclusive_per_day,
            l.has_debrief, l.needs_video_watch, l.created_at, l.updated_at,
            m.slug as module_slug
     from lessons l join modules m on l.module_id = m.id
     where m.course_id = $1 order by m.rank, l.rank`,
    [oldCourse.id],
  );
  const lessonIdBySlug = new Map<string, number>();
  // Which module each lesson was placed under THIS run — read back by the
  // lesson_dependencies loop below to target the right `module_lessons` row,
  // since a lesson's course now comes from its placement, not a column on
  // the lesson itself.
  const lessonModuleIdBySlug = new Map<string, number>();
  const lc = tally();
  for (const l of oldLessons as Record<string, never>[]) {
    const row = l as unknown as {
      name: string;
      slug: string;
      video_id: string | null;
      other_video_ids: unknown;
      required_subscriptions: string[];
      rank: string;
      is_available: boolean;
      exclusive_per_day: boolean;
      has_debrief: boolean;
      needs_video_watch: boolean;
      created_at: Date;
      updated_at: Date;
      module_slug: string;
    };
    if (SKIP_LESSON_SLUGS.includes(row.slug)) {
      lc.skipped++;
      continue;
    }
    const moduleId = moduleIdBySlug.get(row.module_slug);
    if (moduleId === undefined)
      throw new Error(`no new module for slug ${row.module_slug}`);

    // Videos are Synthesia uuids; playback/captions are fetched live from
    // their API.
    //
    // Only `video_provider`/`video_ref` are written to the destination. The
    // destination schema has already dropped `lessons.video_id` (this
    // migration retired it in favor of provider-agnostic playback shared
    // between the admin preview and the learner player), so it is derived
    // from the SOURCE database's `row.video_id` below and used ONLY to
    // compute `videoProvider`/`videoRef` — never written back out under its
    // old name. Leaving `video_ref` null made `hasVideo` false in
    // video-section-container, so every imported lesson showed the empty
    // "paste a URL" state despite having a video.
    //
    // `videoRef` for Synthesia is the bare uuid — exactly what `video_id`
    // holds. See `synthesiaProvider.detect()`, which returns `{ ref: <uuid> }`.
    const videoProvider = row.video_id ? 'synthesia' : null;
    const videoRef = row.video_id ?? null;
    const otherVideoIds = JSON.stringify(row.other_video_ids ?? []);

    // `lessons.module_id`/`lessons.rank` are gone (Task 7, contract
    // migration) — a lesson's course/position is its `module_lessons`
    // placement now, upserted below for BOTH branches, never a column on
    // this row. The lesson write and its placement write run on ONE
    // connection inside ONE transaction (Important 4, fix round 2): a crash
    // between them would otherwise leave a lesson with no placement at
    // all, which the contract migration's orphan gate cannot detect (it
    // only counts rows with a non-null `module_id` — a column that no
    // longer exists by the time this script runs against a migrated
    // database).
    const placedLessonId = await withNewTx(async (txQ) => {
      const [existing] = await txQ<{ id: number }>(
        `select id from lessons where slug = $1`,
        [row.slug],
      );
      let lessonId: number;
      if (existing) {
        await txQ(
          `update lessons set name=$2, other_video_ids=$3::jsonb,
             video_provider=$4, video_ref=$5, required_subscriptions=$6,
             is_available=$7, exclusive_per_day=$8, has_debrief=$9, needs_video_watch=$10,
             updated_at=$11
           where id=$1`,
          [
            existing.id,
            row.name,
            otherVideoIds,
            videoProvider,
            videoRef,
            row.required_subscriptions,
            row.is_available,
            row.exclusive_per_day,
            row.has_debrief,
            row.needs_video_watch,
            row.updated_at,
          ],
        );
        lessonId = existing.id;
        lc.updated++;
      } else {
        const [ins] = await txQ<{ id: number }>(
          `insert into lessons (name, slug, other_video_ids, video_provider,
             video_ref, required_subscriptions, is_available, exclusive_per_day,
             has_debrief, needs_video_watch, org_id, created_at, updated_at)
           values ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
          [
            row.name,
            row.slug,
            otherVideoIds,
            videoProvider,
            videoRef,
            row.required_subscriptions,
            row.is_available,
            row.exclusive_per_day,
            row.has_debrief,
            row.needs_video_watch,
            lessonOrgId,
            row.created_at,
            row.updated_at,
          ],
        );
        if (!ins) throw new Error(`insert into lessons returned no row for slug ${row.slug}`);
        lessonId = ins.id;
        lc.inserted++;
      }

      // Placement: MOVE the placement that already exists for this lesson
      // IN THIS COURSE, else insert a fresh one (Important 3, fix round 2).
      // `on conflict (module_id, lesson_id)` alone is not enough: if this
      // lesson's existing placement sits under a DIFFERENT module than
      // `moduleId` (an admin moved it, or module slugs remapped between
      // runs), that upsert would INSERT a second row rather than move the
      // first — the same lesson would then have two placements in one
      // course, which `movePlacement` (src/db/placements.ts) assumes can
      // never happen; its own UPDATE would then hit both rows and collide
      // with the unique index. The lookup is scoped to `courseModuleIds`
      // (every module in THIS course), matching how `movePlacement` itself
      // scopes a move.
      //
      // Fix round 4, Important 1 (secondary): ordered and NOT limited to
      // one row, because a PRE-EXISTING duplicate pair — created by the
      // bug above before this fix landed — is healed here rather than left
      // for whichever row an unordered read happened to return first.
      // Kept: the lowest-id row (the original placement). Deleted: every
      // other one, logged so a healed duplicate is visible in the script's
      // own output rather than silently repaired.
      const existingPlacements = await txQ<{ id: number }>(
        `select id from module_lessons
           where lesson_id = $1 and module_id = any($2::int[])
           order by id`,
        [lessonId, courseModuleIds],
      );
      if (existingPlacements.length > 1) {
        const [, ...extras] = existingPlacements;
        await txQ(`delete from module_lessons where id = any($1::int[])`, [
          extras.map((e) => e.id),
        ]);
        console.log(
          `    healed duplicate placement(s) for "${row.slug}": kept id=${existingPlacements[0].id}, deleted [${extras.map((e) => e.id).join(', ')}]`,
        );
      }
      const [existingPlacement] = existingPlacements;
      if (existingPlacement) {
        // `depends_on` is deliberately left alone here — set once by the
        // lesson_dependencies loop below, and must survive a re-run of
        // THIS loop untouched.
        await txQ(
          `update module_lessons set module_id=$2, rank=$3, updated_at=now()
             where id=$1`,
          [existingPlacement.id, moduleId, row.rank],
        );
      } else {
        await txQ(
          `insert into module_lessons (module_id, lesson_id, rank, depends_on)
             values ($1,$2,$3,'[]'::jsonb)`,
          [moduleId, lessonId, row.rank],
        );
      }

      return lessonId;
    });

    lessonIdBySlug.set(row.slug, placedLessonId);
    lessonModuleIdBySlug.set(row.slug, moduleId);
  }
  report('lessons', lc);

  // -------------------------------------------------------- lesson material
  // `lesson_material.lesson_slug` is an FK to `lessons.slug` in BOTH schemas,
  // and slugs are reused verbatim, so this needs no key translation.
  const slugList = [...lessonIdBySlug.keys()];
  const oldMaterial = await oldQ(
    `select lesson_slug, text, key_points, quiz, pro_tips, links, assignments,
            job_of_the_day, created_at, updated_at
     from lesson_material where lesson_slug = any($1::text[])`,
    [slugList],
  );
  const matc = tally();
  for (const mat of oldMaterial as Record<string, never>[]) {
    const row = mat as unknown as {
      lesson_slug: string;
      text: string;
      key_points: unknown;
      quiz: unknown;
      pro_tips: string | null;
      links: string[] | null;
      assignments: string | null;
      job_of_the_day: string | null;
      created_at: Date;
      updated_at: Date;
    };
    const kp = row.key_points === null ? null : JSON.stringify(row.key_points);
    const qz = row.quiz === null ? null : JSON.stringify(row.quiz);
    const [existing] = await newQ<{ id: number }>(
      `select id from lesson_material where lesson_slug = $1`,
      [row.lesson_slug],
    );
    if (existing) {
      await newQ(
        `update lesson_material set text=$2, key_points=$3::json, quiz=$4::json,
           pro_tips=$5, links=$6, assignments=$7, job_of_the_day=$8, updated_at=$9
         where id=$1`,
        [
          existing.id,
          row.text,
          kp,
          qz,
          row.pro_tips,
          row.links,
          row.assignments,
          row.job_of_the_day,
          row.updated_at,
        ],
      );
      matc.updated++;
    } else {
      await newQ(
        `insert into lesson_material (lesson_slug, text, key_points, quiz, pro_tips, links,
           assignments, job_of_the_day, created_at, updated_at)
         values ($1,$2,$3::json,$4::json,$5,$6,$7,$8,$9,$10)`,
        [
          row.lesson_slug,
          row.text,
          kp,
          qz,
          row.pro_tips,
          row.links,
          row.assignments,
          row.job_of_the_day,
          row.created_at,
          row.updated_at,
        ],
      );
      matc.inserted++;
    }
  }
  report('lesson_material', matc);

  // ------------------------------------------------------------ blob files
  // Re-hosted into THIS project's store so the course owns its assets and
  // survives the old project being torn down. The `library-` pathname prefix is
  // preserved: the old app inferred library membership from
  // `url LIKE '%/library-%'`.
  const moduleSlugs = [...moduleIdBySlug.keys()];
  const oldFiles = await oldQ(
    `select distinct bf.id, bf.name, bf.url, bf.size, bf.type, bf.created_at
     from blob_files bf
     join blob_file_assignments bfa on bfa.file_id = bf.id
     where bfa.lesson_slug = any($1::text[]) or bfa.module_slug = any($2::text[])
     order by bf.id`,
    [slugList, moduleSlugs],
  );
  const fileIdByOldId = new Map<number, number>();
  const bc = tally();
  let bytes = 0;
  for (const f of oldFiles as Record<string, never>[]) {
    const row = f as unknown as {
      id: number;
      name: string;
      url: string;
      size: number;
      type: string;
      created_at: Date;
    };
    // Idempotency keyed on the blob PATHNAME, not `name`.
    //
    // `blob_files.name` is NOT unique in the source: `!CANDA-SITE SURVEY
    // CHECKLIST v1.21` exists twice, once as .pdf and once as .xlsx, because
    // the stored name drops the extension. Keying on name made the second file
    // match the first, so it was skipped and every assignment for the
    // spreadsheet silently resolved to the PDF. The pathname carries the
    // extension and uniquely identifies a blob, and we upload to the same
    // pathname, so the new URL always ends with it.
    //
    // DECODED, because `URL.pathname` returns the percent-encoded form and
    // `put()` encodes whatever it is given. Passing the encoded string stores a
    // file whose real name contains the escapes as literal characters
    // (`%2521CANDA…` in the URL), so a download lands as
    // "%21CANDA-SITE%20SURVEY…pdf" instead of "!CANDA-SITE SURVEY….pdf".
    // Decoding first reproduces the source store's actual pathname.
    const pathname = decodeURIComponent(
      new URL(row.url).pathname.replace(/^\//, ''),
    );
    const [existing] = await newQ<{ id: number }>(
      `select id from blob_files where url like $1 and "uploadedBy" = $2`,
      [`%/${encodeURIComponent(pathname).replace(/%2F/g, '/')}`, UPLOADED_BY],
    );
    if (existing) {
      fileIdByOldId.set(row.id, existing.id);
      bc.skipped++;
      continue;
    }
    const res = await fetch(row.url);
    if (!res.ok)
      throw new Error(`GET ${row.url} -> ${res.status} ${res.statusText}`);
    const body = Buffer.from(await res.arrayBuffer());
    bytes += body.byteLength;
    const uploaded = await put(pathname, body, {
      access: 'public',
      contentType: row.type,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    const [ins] = await newQ<{ id: number }>(
      `insert into blob_files (name, url, size, type, "uploadedBy", created_at)
       values ($1,$2,$3,$4,$5,$6) returning id`,
      [
        row.name,
        uploaded.url,
        body.byteLength,
        row.type,
        UPLOADED_BY,
        row.created_at,
      ],
    );
    if (ins) fileIdByOldId.set(row.id, ins.id);
    bc.inserted++;
    if (bc.inserted % 10 === 0)
      console.log(
        `    …${bc.inserted} uploaded (${(bytes / 1e6).toFixed(0)} MB)`,
      );
  }
  report('blob_files', bc);

  // ------------------------------------------------- blob file assignments
  // SCHEMA CHANGE: old scopes by `module_slug`/`lesson_slug` (text); new uses
  // `course_id`/`module_id`/`lesson_id` integer FKs ("immutable, smaller/faster
  // indexes and joins"). Slugs are therefore translated to the ids inserted
  // above. Old rows commonly set BOTH module and lesson; that carries over.
  const oldAssignments = await oldQ(
    `select file_id, module_slug, lesson_slug, created_at from blob_file_assignments
     where lesson_slug = any($1::text[]) or module_slug = any($2::text[])`,
    [slugList, moduleSlugs],
  );
  const ac = tally();
  for (const a of oldAssignments as Record<string, never>[]) {
    const row = a as unknown as {
      file_id: number;
      module_slug: string | null;
      lesson_slug: string | null;
      created_at: Date;
    };
    const fileId = fileIdByOldId.get(row.file_id);
    if (fileId === undefined) {
      ac.skipped++;
      continue;
    }
    const moduleId = row.module_slug
      ? (moduleIdBySlug.get(row.module_slug) ?? null)
      : null;
    const lessonId = row.lesson_slug
      ? (lessonIdBySlug.get(row.lesson_slug) ?? null)
      : null;
    // A row that resolved to neither would be a course-wide assignment, which
    // this import does not create — skip rather than silently widen scope.
    if (moduleId === null && lessonId === null) {
      ac.skipped++;
      continue;
    }
    const [existing] = await newQ<{ id: number }>(
      `select id from blob_file_assignments
       where file_id=$1 and module_id is not distinct from $2 and lesson_id is not distinct from $3`,
      [fileId, moduleId, lessonId],
    );
    if (existing) {
      ac.skipped++;
      continue;
    }
    await newQ(
      `insert into blob_file_assignments (file_id, course_id, module_id, lesson_id, created_at)
       values ($1,null,$2,$3,$4)`,
      [fileId, moduleId, lessonId, row.created_at],
    );
    ac.inserted++;
  }
  report('blob_file_assignments', ac);

  // ---------------------------------------------------------- dependencies
  // Both sides store slugs inside `depends_on`, so reusing slugs means no
  // translation of the payload — only the owning id changes.
  const oldModDeps = await oldQ(
    `select m.slug as module_slug, md.depends_on
     from module_dependencies md join modules m on md.module_id = m.id
     where m.course_id = $1`,
    [oldCourse.id],
  );
  const mdc = tally();
  for (const d of oldModDeps as Record<string, never>[]) {
    const row = d as unknown as { module_slug: string; depends_on: string[] };
    const moduleId = moduleIdBySlug.get(row.module_slug);
    if (moduleId === undefined) {
      mdc.skipped++;
      continue;
    }
    const [existing] = await newQ<{ id: number }>(
      `select id from module_dependencies where module_id = $1`,
      [moduleId],
    );
    if (existing) {
      await newQ(`update module_dependencies set depends_on=$2 where id=$1`, [
        existing.id,
        row.depends_on,
      ]);
      mdc.updated++;
    } else {
      await newQ(
        `insert into module_dependencies (module_id, depends_on) values ($1,$2)`,
        [moduleId, row.depends_on],
      );
      mdc.inserted++;
    }
  }
  report('module_dependencies', mdc);

  const oldLessonDeps = await oldQ(
    `select l.slug as lesson_slug, ld.depends_on
     from lesson_dependencies ld join lessons l on ld.lesson_id = l.id
     join modules m on l.module_id = m.id
     where m.course_id = $1`,
    [oldCourse.id],
  );
  // `lesson_dependencies` (a global, one-per-lesson list) is gone (Task 7).
  // Prerequisites live on the PLACEMENT now (`module_lessons.depends_on`),
  // so each old row is written back to the (module, lesson) placement the
  // lessons loop above already created for it — never a table of its own.
  const ldc = tally();
  for (const d of oldLessonDeps as Record<string, never>[]) {
    const row = d as unknown as { lesson_slug: string; depends_on: unknown };
    const lessonId = lessonIdBySlug.get(row.lesson_slug);
    const placementModuleId = lessonModuleIdBySlug.get(row.lesson_slug);
    if (lessonId === undefined || placementModuleId === undefined) {
      ldc.skipped++;
      continue;
    }
    const payload = JSON.stringify(row.depends_on ?? []);
    const [updated] = await newQ<{ id: number }>(
      `update module_lessons set depends_on=$3::jsonb, updated_at=now()
         where module_id=$1 and lesson_id=$2
       returning id`,
      [placementModuleId, lessonId, payload],
    );
    // The lessons loop above unconditionally upserts a module_lessons row
    // for every lesson it processes, so this should always find its
    // target. If it doesn't, something upstream broke the invariant —
    // failing loudly beats silently leaving prerequisites unset.
    if (!updated) {
      throw new Error(
        `no module_lessons placement for lesson "${row.lesson_slug}" in module ${placementModuleId} — the lessons loop above should have created one`,
      );
    }
    ldc.updated++;
  }
  report('module_lessons.depends_on', ldc);

  // ------------------------------------------------------------ embeddings
  // Copied rather than regenerated: both projects embed with
  // `gemini-embedding-001` at 3072 dimensions, so the vectors occupy the same
  // space. The new `docs` table is course-scoped, so `course_id` is stamped —
  // that is what lets similarity search filter to this course.
  const sourcePaths = slugList.map((s) => `lesson-${s}`);
  const oldDocs = await oldQ(
    `select source_path, heading, chunk, embedding::text as embedding, created_at
     from docs where source_path = any($1::text[])`,
    [sourcePaths],
  );
  const dc = tally();
  for (const d of oldDocs as Record<string, never>[]) {
    const row = d as unknown as {
      source_path: string;
      heading: string | null;
      chunk: string;
      embedding: string;
      created_at: Date;
    };
    const [existing] = await newQ<{ id: number }>(
      `select id from docs
       where course_id=$1 and source_path=$2
         and heading is not distinct from $3 and chunk=$4`,
      [courseId, row.source_path, row.heading, row.chunk],
    );
    if (existing) {
      dc.skipped++;
      continue;
    }
    await newQ(
      `insert into docs (course_id, source_path, heading, chunk, embedding, created_at)
       values ($1,$2,$3,$4,$5::vector,$6)`,
      [
        courseId,
        row.source_path,
        row.heading,
        row.chunk,
        row.embedding,
        row.created_at,
      ],
    );
    dc.inserted++;
  }
  report('docs (embeddings)', dc);

  // ---------------------------------------------------------------- verify
  console.log('\n--- verification ---');
  const [counts] = await newQ<Record<string, string>>(
    // Against the NEW (target) database, so `lessons`' course comes from its
    // `module_lessons` placement, not the removed `lessons.module_id` — see
    // the header note.
    `select
       (select count(*) from modules where course_id=$1) as modules,
       (select count(*) from lessons l
          join module_lessons ml on ml.lesson_id=l.id
          join modules m on ml.module_id=m.id where m.course_id=$1) as lessons,
       (select count(*) from lesson_material lm where lm.lesson_slug in
          (select l.slug from lessons l
             join module_lessons ml on ml.lesson_id=l.id
             join modules m on ml.module_id=m.id where m.course_id=$1)) as material,
       (select count(*) from blob_files where "uploadedBy"=$2) as blob_files,
       (select count(*) from docs where course_id=$1) as doc_chunks`,
    [courseId, UPLOADED_BY],
  );
  console.log('  counts:', counts);

  // Content fidelity: meaningful precisely because text is copied verbatim.
  let mismatches = 0;
  for (const slug of slugList) {
    const [o] = await oldQ<{ text: string }>(
      `select text from lesson_material where lesson_slug=$1`,
      [slug],
    );
    const [n] = await newQ<{ text: string }>(
      `select text from lesson_material where lesson_slug=$1`,
      [slug],
    );
    if (!o && !n) continue;
    if (!o || !n || sha(o.text) !== sha(n.text)) {
      console.log(`  TEXT MISMATCH: ${slug}`);
      mismatches++;
    }
  }
  console.log(
    mismatches === 0
      ? '  text hashes: all match source'
      : `  text hashes: ${mismatches} MISMATCH(ES)`,
  );

  // ---------------------------------------------------------------- report
  console.log('\n--- follow-up worklist ---');
  const scaffolded = await oldQ<{ lesson_slug: string }>(
    `select lesson_slug from lesson_material
     where lesson_slug = any($1::text[])
       and (text like '%<strong>SCRIPT</strong>%' or text like '%SYNTH VIDEO POINTER%' or text like '%Scene 1%')
     order by lesson_slug`,
    [slugList],
  );
  console.log(
    `  ${scaffolded.length} lessons carry production-script scaffolding (imported verbatim by decision):`,
  );
  for (const s of scaffolded) console.log(`    ${s.lesson_slug}`);

  const mojibake = await oldQ<{ lesson_slug: string }>(
    `select lesson_slug from lesson_material
     where lesson_slug = any($1::text[])
       and (text like '%â€%' or pro_tips like '%â€%' or assignments like '%â€%')`,
    [slugList],
  );
  console.log(`  ${mojibake.length} rows with double-encoded UTF-8:`);
  for (const m of mojibake) console.log(`    ${m.lesson_slug}`);

  const noWatch = await oldQ<{ slug: string }>(
    `select l.slug from lessons l join modules m on l.module_id=m.id
     where m.course_id=$1 and l.needs_video_watch = false and l.slug = any($2::text[])
     order by l.slug`,
    [oldCourse.id, slugList],
  );
  console.log(
    `  ${noWatch.length} lessons with needs_video_watch = false (column preserved, no reader yet):`,
  );
  for (const n of noWatch) console.log(`    ${n.slug}`);

  console.log(
    `\n  skipped test artifacts: ${SKIP_LESSON_SLUGS.join(', ')}\n`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('\nIMPORT FAILED:', err);
  console.error('\nRe-run to resume — every step upserts on its natural key.');
  process.exit(1);
});
