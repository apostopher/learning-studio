/**
 * One-time repair for a bug in the first `import-course.ts` run.
 *
 * The bug: blob idempotency was keyed on `blob_files.name`, which is NOT unique
 * in the source. `!CANDA-SITE SURVEY CHECKLIST v1.21` exists twice — once
 * `.pdf` (old id 12), once `.xlsx` (old id 13) — because the stored name drops
 * the extension. Processing the `.xlsx` found the `.pdf` row already inserted,
 * treated it as "already transferred", and mapped BOTH old ids to the PDF's new
 * row. Result: 91 blob_files instead of 92, and every assignment that should
 * point at the spreadsheet points at the PDF instead. A learner clicking the
 * checklist spreadsheet would silently download the PDF.
 *
 * `import-course.ts` now keys on the blob pathname (which carries the
 * extension), so a fresh run cannot reproduce this. That fix alone does NOT
 * repair the existing rows: re-running would insert the missing `.xlsx`, but
 * the already-written assignments still reference the wrong file and the
 * assignment upsert would consider them present.
 *
 * This script repairs it surgically rather than deleting and re-transferring
 * ~130 MB:
 *   1. upload the missing file and insert its `blob_files` row
 *   2. re-point only the assignments that came from the .xlsx in the source
 *
 * Idempotent: safe to re-run, and a no-op once repaired.
 */
import { put } from '@vercel/blob';
import { Pool } from 'pg';

const UPLOADED_BY = 'import:itps-uas-remote';
const COURSE_SLUG = 'itps-uas-remote';

const oldDb = new Pool({ connectionString: process.env.OLD_DATABASE_URL });
const newDb = new Pool({ connectionString: process.env.DATABASE_URL });
const oldQ = async <T = Record<string, unknown>>(s: string, p: unknown[] = []) =>
  (await oldDb.query(s, p)).rows as T[];
const newQ = async <T = Record<string, unknown>>(s: string, p: unknown[] = []) =>
  (await newDb.query(s, p)).rows as T[];

const pathnameOf = (url: string) => new URL(url).pathname.replace(/^\//, '');

async function main() {
  // Every in-scope source file whose pathname has no counterpart in the target.
  const lessonSlugs = (
    await newQ<{ slug: string }>(
      `select l.slug from lessons l
       join modules m on l.module_id = m.id
       join courses c on m.course_id = c.id
       where c.slug = $1`,
      [COURSE_SLUG],
    )
  ).map((r) => r.slug);
  const moduleSlugs = (
    await newQ<{ slug: string }>(
      `select m.slug from modules m join courses c on m.course_id = c.id where c.slug = $1`,
      [COURSE_SLUG],
    )
  ).map((r) => r.slug);

  const sourceFiles = await oldQ<{
    id: number;
    name: string;
    url: string;
    size: number;
    type: string;
    created_at: Date;
  }>(
    `select distinct bf.id, bf.name, bf.url, bf.size, bf.type, bf.created_at
     from blob_files bf
     join blob_file_assignments bfa on bfa.file_id = bf.id
     where bfa.lesson_slug = any($1::text[]) or bfa.module_slug = any($2::text[])
     order by bf.id`,
    [lessonSlugs, moduleSlugs],
  );

  console.log(`source files in scope: ${sourceFiles.length}`);

  // ---- 1. transfer anything missing, and build old-id -> new-id truthfully
  const fileIdByOldId = new Map<number, number>();
  let transferred = 0;
  for (const f of sourceFiles) {
    const pathname = pathnameOf(f.url);
    const [existing] = await newQ<{ id: number }>(
      `select id from blob_files where url like $1 and "uploadedBy" = $2`,
      [`%/${pathname}`, UPLOADED_BY],
    );
    if (existing) {
      fileIdByOldId.set(f.id, existing.id);
      continue;
    }
    console.log(`  transferring missing file: ${pathname}`);
    const res = await fetch(f.url);
    if (!res.ok) throw new Error(`GET ${f.url} -> ${res.status}`);
    const body = Buffer.from(await res.arrayBuffer());
    const uploaded = await put(pathname, body, {
      access: 'public',
      contentType: f.type,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    const [ins] = await newQ<{ id: number }>(
      `insert into blob_files (name, url, size, type, "uploadedBy", created_at)
       values ($1,$2,$3,$4,$5,$6) returning id`,
      [f.name, uploaded.url, body.byteLength, f.type, UPLOADED_BY, f.created_at],
    );
    if (ins) fileIdByOldId.set(f.id, ins.id);
    transferred++;
  }
  console.log(`transferred: ${transferred}`);

  // ---- 2. rewrite every assignment to the file its SOURCE row named
  const moduleIdBySlug = new Map(
    (
      await newQ<{ slug: string; id: number }>(
        `select m.slug, m.id from modules m join courses c on m.course_id=c.id where c.slug=$1`,
        [COURSE_SLUG],
      )
    ).map((r) => [r.slug, r.id]),
  );
  const lessonIdBySlug = new Map(
    (
      await newQ<{ slug: string; id: number }>(
        `select l.slug, l.id from lessons l join modules m on l.module_id=m.id
         join courses c on m.course_id=c.id where c.slug=$1`,
        [COURSE_SLUG],
      )
    ).map((r) => [r.slug, r.id]),
  );

  const sourceAssignments = await oldQ<{
    file_id: number;
    module_slug: string | null;
    lesson_slug: string | null;
  }>(
    `select file_id, module_slug, lesson_slug from blob_file_assignments
     where lesson_slug = any($1::text[]) or module_slug = any($2::text[])`,
    [lessonSlugs, moduleSlugs],
  );

  let repaired = 0;
  let alreadyCorrect = 0;
  for (const a of sourceAssignments) {
    const wantFileId = fileIdByOldId.get(a.file_id);
    if (wantFileId === undefined) continue;
    const moduleId = a.module_slug
      ? (moduleIdBySlug.get(a.module_slug) ?? null)
      : null;
    const lessonId = a.lesson_slug
      ? (lessonIdBySlug.get(a.lesson_slug) ?? null)
      : null;
    if (moduleId === null && lessonId === null) continue;

    const [correct] = await newQ<{ id: number }>(
      `select id from blob_file_assignments
       where file_id=$1 and module_id is not distinct from $2 and lesson_id is not distinct from $3`,
      [wantFileId, moduleId, lessonId],
    );
    if (correct) {
      alreadyCorrect++;
      continue;
    }
    // The scope exists but points at the wrong file — repoint it.
    const [wrong] = await newQ<{ id: number; file_id: number }>(
      `select id, file_id from blob_file_assignments
       where module_id is not distinct from $1 and lesson_id is not distinct from $2
         and file_id <> $3
         and file_id in (select id from blob_files where "uploadedBy" = $4)
       limit 1`,
      [moduleId, lessonId, wantFileId, UPLOADED_BY],
    );
    if (wrong) {
      await newQ(`update blob_file_assignments set file_id=$2 where id=$1`, [
        wrong.id,
        wantFileId,
      ]);
      console.log(
        `  repointed assignment ${wrong.id}: file ${wrong.file_id} -> ${wantFileId}`,
      );
    } else {
      await newQ(
        `insert into blob_file_assignments (file_id, course_id, module_id, lesson_id)
         values ($1,null,$2,$3)`,
        [wantFileId, moduleId, lessonId],
      );
      console.log(`  inserted missing assignment for file ${wantFileId}`);
    }
    repaired++;
  }

  console.log(`\nassignments already correct: ${alreadyCorrect}`);
  console.log(`assignments repaired:        ${repaired}`);

  const [after] = await newQ<Record<string, string>>(
    `select (select count(*) from blob_files where "uploadedBy"=$1) files,
            (select count(*) from blob_file_assignments) assignments`,
    [UPLOADED_BY],
  );
  console.log('after:', after);
  process.exit(0);
}

main().catch((e) => {
  console.error('REPAIR FAILED:', e);
  process.exit(1);
});
