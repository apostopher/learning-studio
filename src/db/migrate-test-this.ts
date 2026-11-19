import { sql } from 'drizzle-orm';
import { db } from '#/db';
import { FLAGSHIP_DISCIPLINE_SLUG } from '#/lib/flagship-course';
import type { MaterialLink } from '#/types';

/**
 * TEST THIS! (see `materialExtraTabFor`): adds `lesson_material.test_this`
 * and moves every non-3D-Airmanship lesson's Job of the Day into it.
 *
 * By hand rather than `drizzle-kit push` for the same reason as
 * migrate-material-links: push diffs the whole schema and offers to truncate
 * unrelated tables.
 *
 * Job of the Day is a 3D Airmanship feature, so on every other lesson —
 * one with no discipline included — its URL becomes the first TEST THIS!
 * link and the old column is cleared. Learners' "opened this tab" records
 * (`lesson_material_progress`) move with it, so nobody's progress drops.
 * A learner who already opened TEST THIS! on the deployed code before this
 * ran has both rows; the Job of the Day one is deleted rather than renamed,
 * which would collide on the (user, lesson, section) unique index.
 *
 * Idempotent: the column is `if not exists`, and a moved lesson's Job of the
 * Day is empty, so a re-run finds nothing to move.
 *
 * Run: pnpm db:migrate-test-this
 */

const decodeEntities = (s: string) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'");

const plainText = (html: string) =>
  decodeEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Turn a stored Job of the Day into links. Three shapes are in the table: a
 * bare URL, an `<a>` (sometimes wrapped in `<p>`/`<mark>`), and a sentence
 * with a link inside it ("How would YOU <a>test these drones</a>").
 *
 * A link's name is its visible text, or — when a single link sits inside a
 * sentence — the whole sentence, which is what the author wrote as the
 * prompt. A name identical to the URL is dropped so the learner view shows
 * the URL once (the convention `parseLegacyLink` set for `links`).
 */
export function parseJobOfTheDayLinks(raw: string): MaterialLink[] {
  const value = raw.trim();
  if (!value) return [];

  const link = (name: string, url: string): MaterialLink => ({
    name: name === url ? '' : name,
    url,
  });

  const anchors = [
    ...value.matchAll(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi),
  ];
  if (anchors.length > 0) {
    const sentence = plainText(value);
    return anchors.map(([, href, inner]) => {
      const url = decodeEntities(href).trim();
      const text = plainText(inner);
      return link(
        anchors.length === 1 && sentence !== text ? sentence : text,
        url,
      );
    });
  }

  return [...plainText(value).matchAll(/(?:https?:\/\/|www\.)\S+/gi)].map(
    ([url]) => link('', url),
  );
}

export type MigrateTestThisResult = {
  moved: Array<{ lessonSlug: string; links: MaterialLink[] }>;
  /** Job of the Day values with no URL in them — cleared, and reported. */
  dropped: Array<{ lessonSlug: string; value: string }>;
};

export async function migrateTestThis(): Promise<MigrateTestThisResult> {
  const result: MigrateTestThisResult = { moved: [], dropped: [] };

  await db.transaction(async (tx) => {
    await tx.execute(
      sql`alter table "lesson_material" add column if not exists "test_this" json`,
    );

    const { rows } = await tx.execute<{
      id: number;
      lesson_slug: string;
      job_of_the_day: string;
      test_this: MaterialLink[] | null;
    }>(sql`
      select m.id, m.lesson_slug, m.job_of_the_day, m.test_this
        from lesson_material m
        join lessons l on l.slug = m.lesson_slug
        left join disciplines d on d.id = l.discipline_id
       where d.slug is distinct from ${FLAGSHIP_DISCIPLINE_SLUG}
         and coalesce(trim(m.job_of_the_day), '') <> ''`);

    for (const row of rows) {
      const parsed = parseJobOfTheDayLinks(row.job_of_the_day);
      if (parsed.length === 0) {
        result.dropped.push({
          lessonSlug: row.lesson_slug,
          value: row.job_of_the_day,
        });
      } else {
        result.moved.push({ lessonSlug: row.lesson_slug, links: parsed });
      }
      // Ahead of anything an admin already added on the deployed code.
      const links = [...parsed, ...(row.test_this ?? [])];
      await tx.execute(sql`
        update "lesson_material"
           set "test_this" = ${JSON.stringify(links)}::json,
               "job_of_the_day" = null
         where "id" = ${row.id}`);
    }

    const nonFlagshipLesson = sql`
      p.lesson_slug in (
        select l.slug from lessons l
          left join disciplines d on d.id = l.discipline_id
         where d.slug is distinct from ${FLAGSHIP_DISCIPLINE_SLUG})`;
    await tx.execute(sql`
      delete from "lesson_material_progress" p
       where p.section_name = 'jobOfTheDay'
         and ${nonFlagshipLesson}
         and exists (
           select 1 from lesson_material_progress t
            where t.user_id = p.user_id
              and t.lesson_slug = p.lesson_slug
              and t.section_name = 'testThis')`);
    await tx.execute(sql`
      update "lesson_material_progress" p
         set section_name = 'testThis'
       where p.section_name = 'jobOfTheDay'
         and ${nonFlagshipLesson}`);
  });

  return result;
}

async function main() {
  const { moved, dropped } = await migrateTestThis();
  console.log(
    `lesson_material.test_this ready — moved ${moved.length} Job of the Day value(s) to TEST THIS!.`,
  );
  for (const m of moved) {
    console.log(`  ${m.lessonSlug}: ${m.links.map((l) => l.url).join(', ')}`);
  }
  if (dropped.length > 0) {
    console.log(`Cleared ${dropped.length} value(s) with no URL:`);
    for (const d of dropped) console.log(`  ${d.lessonSlug}: ${d.value}`);
  }
  process.exit(0);
}

if (process.argv[1]?.endsWith('migrate-test-this.ts')) {
  await main();
}
