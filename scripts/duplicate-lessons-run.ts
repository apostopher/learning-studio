/**
 * One-off: DUPLICATE every lesson a course teaches into a discipline, as new
 * lessons filed in one discipline module named after the course's module.
 * The originals — and the course's own placements — are untouched: the
 * copies are an independent, separately editable set.
 *
 * Copied per lesson: the `lessons` row (video, other-language videos, gates,
 * flags) under a new slug, and its `lesson_material` rows (keyed by slug).
 * Attachments (`blob_file_assignments`) are re-pointed at the SAME blob.
 * Never copied: placements, progress, quiz answers, results, last-viewed —
 * learner state belongs to the original.
 *
 *   pnpm db:duplicate-lessons --course=2 --discipline=uas            # dry run
 *   pnpm db:duplicate-lessons --course=2 --discipline=uas --write
 */
import { Pool } from 'pg';
import { planCopySlugs } from './duplicate-lessons';

const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const COURSE_ID = Number(arg('course'));
const disciplineArg = arg('discipline');
const WRITE = process.argv.includes('--write');
if (!Number.isInteger(COURSE_ID) || !disciplineArg) {
  throw new Error('usage: --course=<id> --discipline=<slug> [--write]');
}
const DISCIPLINE_SLUG: string = disciplineArg;

const db = new Pool({ connectionString: process.env.DATABASE_URL });

type LessonRow = {
  id: number;
  name: string;
  slug: string;
  other_video_ids: unknown;
  video_provider: string | null;
  video_ref: string | null;
  required_subscriptions: string[];
  levels: string[];
  is_available: boolean;
  exclusive_per_day: boolean;
  has_debrief: boolean;
  needs_video_watch: boolean;
  org_id: number;
  module_name: string;
};

async function main() {
  const { rows: disciplines } = await db.query<{ id: number; name: string }>(
    `select id, name from disciplines where slug = $1`,
    [DISCIPLINE_SLUG],
  );
  const discipline = disciplines[0];
  if (!discipline) throw new Error(`no discipline with slug ${DISCIPLINE_SLUG}`);

  const { rows: lessons } = await db.query<LessonRow>(
    `select l.id, l.name, l.slug, l.other_video_ids, l.video_provider, l.video_ref,
            l.required_subscriptions, l.levels, l.is_available, l.exclusive_per_day,
            l.has_debrief, l.needs_video_watch, l.org_id, m.name as module_name
       from course_modules cm
       join modules m on m.id = cm.module_id
       join module_lessons ml on ml.module_id = cm.module_id
       join lessons l on l.id = ml.lesson_id
      where cm.course_id = $1
      order by cm.rank, ml.rank`,
    [COURSE_ID],
  );
  if (lessons.length === 0) throw new Error(`course ${COURSE_ID} teaches no lessons`);
  const moduleName = lessons[0].module_name;

  const { rows: taken } = await db.query<{ slug: string }>(`select slug from lessons`);
  const slugPlan = planCopySlugs(
    lessons.map((l) => l.slug),
    DISCIPLINE_SLUG,
    new Set(taken.map((t) => t.slug)),
  );

  console.log(
    `${lessons.length} lessons taught by course ${COURSE_ID} → discipline "${discipline.name}" (${discipline.id}), module "${moduleName}"`,
  );
  for (const [i, l] of lessons.entries()) {
    console.log(`  ${l.slug} → ${slugPlan[i].to}`);
  }
  if (!WRITE) {
    console.log('\ndry run — nothing written. Re-run with --write.');
    await db.end();
    return;
  }

  const client = await db.connect();
  try {
    await client.query('begin');
    const {
      rows: [mod],
    } = await client.query<{ id: number }>(
      `insert into discipline_modules (discipline_id, name, rank)
       values ($1, $2, (select coalesce(max(rank), 0) + 1 from discipline_modules where discipline_id = $1))
       returning id`,
      [discipline.id, moduleName],
    );
    let copied = 0;
    let materials = 0;
    let attachments = 0;
    for (const [i, l] of lessons.entries()) {
      const to = slugPlan[i].to;
      const {
        rows: [copy],
      } = await client.query<{ id: number }>(
        `insert into lessons (name, slug, other_video_ids, video_provider, video_ref,
                              required_subscriptions, levels, is_available, exclusive_per_day,
                              has_debrief, needs_video_watch, org_id,
                              discipline_id, discipline_module_id, library_rank)
         values ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         returning id`,
        [
          l.name,
          to,
          JSON.stringify(l.other_video_ids ?? []),
          l.video_provider,
          l.video_ref,
          l.required_subscriptions,
          l.levels,
          l.is_available,
          l.exclusive_per_day,
          l.has_debrief,
          l.needs_video_watch,
          l.org_id,
          discipline.id,
          mod.id,
          i + 1,
        ],
      );
      copied += 1;
      const mat = await client.query(
        `insert into lesson_material (lesson_slug, text, key_points, quiz, pro_tips, links, assignments, job_of_the_day)
         select $2, text, key_points, quiz, pro_tips, links, assignments, job_of_the_day
           from lesson_material where lesson_slug = $1`,
        [l.slug, to],
      );
      materials += mat.rowCount ?? 0;
      const att = await client.query(
        `insert into blob_file_assignments (file_id, lesson_id)
         select file_id, $2 from blob_file_assignments where lesson_id = $1`,
        [l.id, copy.id],
      );
      attachments += att.rowCount ?? 0;
    }
    await client.query('commit');
    console.log(
      `\nwritten: module ${mod.id} "${moduleName}", ${copied} lessons, ${materials} material rows, ${attachments} attachments`,
    );
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
    await db.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
