/**
 * One-off: give every pilot a `lesson_completions` row for each lesson they
 * had already taken to 100% before that table existed. `done_at` is when the
 * lesson's last required component was finished (see
 * ./backfill-lesson-completions.ts). A lesson with no derivable timestamp is
 * reported and skipped, never stamped with now().
 *
 * Idempotent: `on conflict do nothing` on (user_id, lesson_id).
 * Rollout order: db:migrate-debrief-review, then this, then deploy. Deploying
 * first locks pilots out of everything past each module's first lesson.
 *
 *   pnpm db:backfill-lesson-completions --dry-run   # counts only, no writes
 *   pnpm db:backfill-lesson-completions             # writes
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "#/db";
import { getCourseProgress } from "#/db/course-progress";
import {
  progressComponentColumns,
  progressComponentGroupBy,
  toComponentFields,
} from "#/db/progress-components";
import {
  courseSubscriptionsTable,
  coursesTable,
  lessonCompletionsTable,
  lessonMaterialProgressTable,
  lessonQuizAnswersTable,
  lessonsTable,
  videoProgressTable,
} from "#/db/schema";
import { watchedMilestones } from "#/lib/course-milestones";
import { LESSON_VISIT_SECTION } from "#/lib/lesson-visit-section";
import { resolveDoneAt, videoWatchedAt } from "./backfill-lesson-completions";

const DRY_RUN = process.argv.includes("--dry-run");

type Candidate = { userId: string; lessonId: number; doneAt: Date };

async function candidatesFor(
  userId: string,
  courseSlug: string,
  lessonIds: number[],
  skipped: string[],
): Promise<Candidate[]> {
  // What each lesson asks of this learner, from the same columns the progress
  // ring reads, so "needed" cannot drift from "100%".
  const lessonRows = await db
    .select({
      lessonId: lessonsTable.id,
      slug: lessonsTable.slug,
      ...progressComponentColumns(userId),
    })
    .from(lessonsTable)
    .leftJoin(
      lessonMaterialProgressTable,
      and(
        eq(lessonMaterialProgressTable.userId, userId),
        eq(lessonMaterialProgressTable.lessonSlug, lessonsTable.slug),
      ),
    )
    .where(inArray(lessonsTable.id, lessonIds))
    .groupBy(lessonsTable.id, ...progressComponentGroupBy);
  const slugs = lessonRows.map((r) => r.slug);

  // First time each watched milestone was reported, per lesson.
  const videoRows = await db
    .select({
      lessonId: videoProgressTable.lessonId,
      progress: videoProgressTable.progress,
      at: sql`min(${videoProgressTable.createdAt})`.mapWith(
        videoProgressTable.createdAt,
      ),
    })
    .from(videoProgressTable)
    .where(
      and(
        eq(videoProgressTable.userId, userId),
        inArray(videoProgressTable.lessonId, lessonIds),
        inArray(videoProgressTable.progress, watchedMilestones),
      ),
    )
    .groupBy(videoProgressTable.lessonId, videoProgressTable.progress);

  // Material rows: one per (lesson, tab) plus the 'page' visit row.
  const materialRows = await db
    .select({
      slug: lessonMaterialProgressTable.lessonSlug,
      section: lessonMaterialProgressTable.sectionName,
      at: lessonMaterialProgressTable.createdAt,
    })
    .from(lessonMaterialProgressTable)
    .where(
      and(
        eq(lessonMaterialProgressTable.userId, userId),
        inArray(lessonMaterialProgressTable.lessonSlug, slugs),
        eq(lessonMaterialProgressTable.completed, true),
      ),
    );

  const quizRows = await db
    .select({
      slug: lessonQuizAnswersTable.lessonSlug,
      at: sql`min(${lessonQuizAnswersTable.createdAt})`.mapWith(
        lessonQuizAnswersTable.createdAt,
      ),
    })
    .from(lessonQuizAnswersTable)
    .where(
      and(
        eq(lessonQuizAnswersTable.userId, userId),
        inArray(lessonQuizAnswersTable.lessonSlug, slugs),
      ),
    )
    .groupBy(lessonQuizAnswersTable.lessonSlug);

  const out: Candidate[] = [];
  for (const row of lessonRows) {
    const c = toComponentFields(row);
    const video = c.hasVideo && c.needsVideoWatch;
    const needs = {
      video,
      sections: c.applicableSectionNames.length,
      quiz: c.hasQuiz,
      visit: !video && !c.hasQuiz && c.applicableSectionNames.length === 0,
    };

    const hits = new Map<number, Date>();
    for (const v of videoRows) {
      if (v.lessonId === row.lessonId) hits.set(v.progress, v.at);
    }
    const mine = materialRows.filter((m) => m.slug === row.slug);
    const doneAt = resolveDoneAt(needs, {
      videoWatchedAt: videoWatchedAt(hits, watchedMilestones),
      sectionTappedAt: mine
        .filter((m) =>
          (c.applicableSectionNames as string[]).includes(m.section),
        )
        .map((m) => m.at),
      quizFirstAt: quizRows.find((q) => q.slug === row.slug)?.at ?? null,
      visitedAt:
        mine.find((m) => m.section === LESSON_VISIT_SECTION)?.at ?? null,
    });

    if (doneAt) out.push({ userId, lessonId: row.lessonId, doneAt });
    else
      skipped.push(
        `${userId} ${courseSlug} lesson ${row.lessonId} (${row.slug})`,
      );
  }
  return out;
}

async function main(): Promise<void> {
  const subs = await db
    .select({
      userId: courseSubscriptionsTable.userId,
      slug: coursesTable.slug,
    })
    .from(courseSubscriptionsTable)
    .innerJoin(
      coursesTable,
      eq(coursesTable.id, courseSubscriptionsTable.courseId),
    );

  const courses = new Set<string>();
  const skipped: string[] = [];
  let toBackfill = 0;
  let alreadyDone = 0;

  for (const { userId, slug } of subs) {
    courses.add(slug);
    const progress = await getCourseProgress({ userId, slug });
    alreadyDone += progress.lessons.filter((l) => l.done).length;
    const ids = progress.lessons
      .filter((l) => l.percent === 100 && !l.done)
      .map((l) => l.lessonId);
    if (ids.length === 0) continue;

    const rows = await candidatesFor(userId, slug, ids, skipped);
    toBackfill += rows.length;
    if (!DRY_RUN && rows.length > 0) {
      await db
        .insert(lessonCompletionsTable)
        .values(rows)
        .onConflictDoNothing();
    }
  }

  console.log(DRY_RUN ? "DRY RUN, nothing written" : "WRITTEN");
  console.log(`subscriptions scanned:      ${subs.length}`);
  console.log(`courses scanned:            ${courses.size}`);
  console.log(`lessons already done:       ${alreadyDone}`);
  console.log(`lessons to backfill:        ${toBackfill}`);
  console.log(`skipped (no timestamp):     ${skipped.length}`);
  for (const s of skipped) console.log(`  - ${s}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
