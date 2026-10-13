import { asc } from 'drizzle-orm';
import { generateLessonEmbeddings, lessonMaterialHtml } from '#/ai/embeddings';
import { db } from '#/db';
import { lessonMaterialTable } from '#/db/schema';

/**
 * One-time: index every lesson's material into `docs` (lesson_slug set) so
 * searchKB can retrieve lesson chunks. Afterwards the admin material save
 * keeps the index current. Idempotent — each lesson's chunks are replaced.
 *
 * Run after `pnpm db:migrate-viper-context`.
 *
 * Usage:
 *   pnpm db:migrate-lesson-embeddings
 */
type MaterialRow = { lessonSlug: string; text: string; proTips: string | null };

export async function backfillLessonEmbeddings(
  rows: MaterialRow[],
  embed: typeof generateLessonEmbeddings,
): Promise<{ lessons: number; chunks: number; failed: string[] }> {
  // lesson_slug has no unique constraint; the first row wins, matching
  // getGatedCourseForAgent's first-material-row rule.
  const seen = new Set<string>();
  let lessons = 0;
  let chunks = 0;
  const failed: string[] = [];
  for (const row of rows) {
    if (seen.has(row.lessonSlug)) continue;
    seen.add(row.lessonSlug);
    try {
      const out = await embed({
        lessonSlug: row.lessonSlug,
        html: lessonMaterialHtml(row),
      });
      lessons++;
      chunks += out.chunks;
      console.log(`  ${row.lessonSlug}: ${out.chunks} chunks`);
    } catch (err) {
      failed.push(row.lessonSlug);
      console.error(`  ${row.lessonSlug}: FAILED`, err);
    }
  }
  return { lessons, chunks, failed };
}

async function main() {
  const rows = await db
    .select({
      lessonSlug: lessonMaterialTable.lessonSlug,
      text: lessonMaterialTable.text,
      proTips: lessonMaterialTable.proTips,
    })
    .from(lessonMaterialTable)
    .orderBy(asc(lessonMaterialTable.id));
  const out = await backfillLessonEmbeddings(rows, generateLessonEmbeddings);
  console.log(
    `Indexed ${out.lessons} lessons (${out.chunks} chunks); ${out.failed.length} failed.`,
  );
  process.exit(out.failed.length ? 1 : 0);
}

if (process.argv[1]?.endsWith('migrate-lesson-embeddings.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
