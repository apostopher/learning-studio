import { asc, eq } from 'drizzle-orm';
import { db } from '#/db';
import { getUserRoleNames } from '#/db/admin';
import { getCourseDetailsWithCache } from '#/db/course';
import { getCourseProgress } from '#/db/course-progress';
import { isCourseStaff } from '#/db/course-staff';
import { isSubscribedToCourseSlug } from '#/db/lesson-access';
import {
  coursesTable,
  lessonMaterialTable,
  lessonsTable,
  modulesTable,
} from '#/db/schema';
import { getCurrentLevel } from '#/db/user-levels';
import { hasAdminAccess } from '#/lib/admin-schemas';
import {
  type CourseContent,
  courseContentToHtml,
  type ModuleContent,
} from '#/lib/course-content';
import {
  evaluateLessonLock,
  evaluateMaterialLock,
  type GateCourse,
} from '#/lib/lesson-gating';
import { toGateCourse, watchedLessonSlugs } from '#/lib/lesson-gating-inputs';
import {
  filterCourseToLevel,
  isLessonVisibleAtLevel,
} from '#/lib/level-visibility';

type GatedRow = { lessonSlug: string };

/**
 * Drop rows for lessons this user cannot read.
 *
 * The chat widget is mounted app-wide and its knowledge base is assembled from
 * lesson_material, so without this a student locked out of a lesson can simply
 * ask the assistant for its key points.
 *
 * `watchedLessonSlugsSet` is required, not nullable: the previous "null means
 * no user context, keep everything" escape had no production call site and
 * existed only as a fail-open branch a future caller could stumble into.
 * Viewing-as-author is the one and only bypass, and it is explicit — the
 * caller decides who qualifies (org `owner`/`admin`, or staff on this very
 * course), this function just honours the answer.
 */
export function filterGatedLessons<T extends GatedRow>(
  rows: T[],
  course: GateCourse,
  watchedLessonSlugsSet: ReadonlySet<string>,
  viewingAsAuthor: boolean,
): T[] {
  if (viewingAsAuthor) return rows;
  return rows.filter((r) => {
    const lessonLock = evaluateLessonLock(
      course,
      r.lessonSlug,
      watchedLessonSlugsSet,
    );
    if (lessonLock.kind !== 'open') return false;
    return (
      evaluateMaterialLock(course, r.lessonSlug, watchedLessonSlugsSet).kind ===
      'open'
    );
  });
}

/**
 * getCourseDetails (src/db/course.ts) does not carry lesson_material text, so
 * this is a minimal, focused reader dedicated to agent RAG enrichment: it
 * selects courses→modules→lessons left-joined to lesson_material (matched by
 * lessons.slug = lesson_material.lesson_slug), ordered by rank, and hands the
 * assembled shape to the pure builder in src/lib/course-content.ts.
 *
 * Four filters run before any content is assembled, in this order:
 *
 * 1. **WIP lessons** (`is_available = false`) are dropped outright. The gate
 *    predicate cannot do this job: `getCourseDetailsWithCache` no longer
 *    carries unavailable lessons at all (`shapeModuleLessons` strips them), so
 *    `evaluateLessonLock` cannot locate them and answers "open" by contract —
 *    every draft lesson would sail through filter 3 straight into the model's
 *    context. Applied for admins too: the cached course payload hides WIP
 *    lessons from them as well, and the admin *editor* — the surface decision
 *    #28 keeps unfiltered — reads `getCourseBoard`, not this function.
 * 2. **Subscription.** A non-admin who is not subscribed to `slug` gets
 *    nothing at all — the same empty result as when no course is in context —
 *    because `evaluateLessonLock`/`evaluateMaterialLock` alone only prove a
 *    lesson's prerequisites are satisfied, never that the caller is allowed in
 *    the course to begin with (`getCourseProgress` happily returns an
 *    all-unwatched result for a user with no subscription, so skipping this
 *    check would let a subscriber of Course A ask about a lesson in Course B
 *    that merely has no unmet prerequisites and no video).
 * 3. **Level visibility.** A lesson outside the pilot's tier for this course
 *    is dropped before the locks run. Without it the assistant was the widest
 *    hole in the level feature: `/api/lesson/material` refuses an out-of-tier
 *    lesson, and the pilot could then ask the chat widget for the same text
 *    and proTips — the exact failure this file's header exists to prevent,
 *    reached by a different door.
 * 4. **Per-lesson locks**, via `filterGatedLessons`, so a locked lesson's
 *    text/proTips never reach the caller either.
 *
 * `userId` is required. It used to be optional, and calling without it skipped
 * filters 2, 3 and 4 entirely — full course content for anyone who called it the
 * short way. The sole caller always had a session, so nothing needed that
 * escape, and now no future caller can reach it by omission.
 */
export async function getCourseContentForAgent(
  slug: string,
  { userId }: { userId: string },
): Promise<string> {
  const rows = await db
    .select({
      courseId: coursesTable.id,
      courseName: coursesTable.name,
      moduleId: modulesTable.id,
      moduleName: modulesTable.name,
      lessonId: lessonsTable.id,
      lessonSlug: lessonsTable.slug,
      lessonName: lessonsTable.name,
      isAvailable: lessonsTable.isAvailable,
      text: lessonMaterialTable.text,
      proTips: lessonMaterialTable.proTips,
    })
    .from(coursesTable)
    .leftJoin(modulesTable, eq(modulesTable.courseId, coursesTable.id))
    .leftJoin(lessonsTable, eq(lessonsTable.moduleId, modulesTable.id))
    .leftJoin(
      lessonMaterialTable,
      eq(lessonMaterialTable.lessonSlug, lessonsTable.slug),
    )
    .where(eq(coursesTable.slug, slug))
    .orderBy(asc(modulesTable.rank), asc(lessonsTable.rank));

  if (rows.length === 0) return '';

  // Filter 1: WIP lessons, before any gate runs. `isAvailable` is notNull on
  // lessonsTable, so it is only ever null for a module-only row (no lesson
  // matched by the left join) — those carry no lesson material and are kept so
  // an empty module still renders its heading, exactly as before.
  const availableRows = rows.filter(
    (r) => r.lessonId === null || r.isAvailable === true,
  );

  const [roles, subscribed] = await Promise.all([
    getUserRoleNames(userId),
    isSubscribedToCourseSlug(userId, slug),
  ]);
  // Org `owner`/`admin` first so they never pay the staff query; a
  // `subject-expert`/`course-manager` reads their OWN course as its author
  // and every other course as an ordinary gated learner.
  const viewingAsAuthor =
    hasAdminAccess(roles) || (await isCourseStaff(userId, rows[0].courseId));

  // Filter 2: subscription, checked BEFORE any lock is evaluated and before
  // any course content is assembled. The lock predicates only prove a lesson's
  // prerequisites are satisfied, they say nothing about whether this user is
  // allowed in the course at all. `getCourseProgress` does not error for a
  // non-enrolled user — it left-joins by userId and simply returns an
  // all-unwatched result — so without this check, a lesson with no unmet
  // module/lesson prerequisites and no video would pass both locks for a
  // subscriber of an entirely different course. Fail toward NO content, never
  // partial content: a non-admin, non-subscriber gets nothing from this
  // course's corpus, same as when no courseSlug is in context at all.
  if (!viewingAsAuthor && !subscribed) {
    return '';
  }

  const [details, progress] = await Promise.all([
    getCourseDetailsWithCache(slug),
    getCourseProgress({ userId, slug }),
  ]);

  // A gate that cannot be evaluated must never fail open — mirrors
  // evaluateLessonGate's server-side rule (src/lib/lesson-gating.server.ts):
  // a missing cached payload means something is genuinely wrong (e.g. a
  // Redis outage), and silently serving unfiltered material would leak
  // locked lessons to the agent exactly the way this filter exists to stop.
  if (!details) {
    throw new Error(`Course payload unavailable for ${slug}`);
  }

  // Filter 3: level visibility. An author has no tier — they wrote every one
  // — so they skip it, exactly as they skip every gate in
  // `evaluateLessonGate`.
  const level = viewingAsAuthor
    ? null
    : await getCurrentLevel(userId, rows[0].courseId);

  // Two halves, for the same reason `evaluateLessonGate` needs two: the
  // explicit slug set below is what actually withholds an out-of-tier lesson,
  // and the filtered course is only there so a hidden lesson cannot gate a
  // visible one. Neither substitutes for the other — filtering ALONE would
  // make an out-of-tier lesson unlocatable, and `evaluateLessonLock` answers
  // "open" for lessons it cannot locate, so the filter meant to hide a lesson
  // would be the very thing that released it.
  const gateCourse = toGateCourse(
    level === null ? details : filterCourseToLevel(details, level),
  );
  const watched = watchedLessonSlugs(details, progress);

  // Built from the UNFILTERED payload, and a slug the payload does not contain
  // is simply absent from it — so an unknown lesson is dropped rather than
  // waved through. Fail closed, matching the gate.
  const visibleLessonSlugs =
    level === null
      ? null
      : new Set(
          details.modules.flatMap((mod) =>
            mod.lessons
              .filter((lesson) => isLessonVisibleAtLevel(lesson.levels, level))
              .map((lesson) => lesson.slug),
          ),
        );

  // Filter 4: per-lesson locks. Gate on the distinct lesson slugs rather than
  // the raw (possibly duplicated, possibly lesson-less) rows, then filter the
  // rows by the resulting allow-list — this keeps the module/lesson rank
  // ordering intact and leaves module-only rows alone, since they carry no
  // lesson material to leak.
  const distinctLessonRows = [
    ...new Set(
      availableRows
        .map((r) => r.lessonSlug)
        .filter((lessonSlug): lessonSlug is string => lessonSlug !== null),
    ),
  ]
    .filter(
      (lessonSlug) =>
        visibleLessonSlugs === null || visibleLessonSlugs.has(lessonSlug),
    )
    .map((lessonSlug) => ({ lessonSlug }));
  const allowedLessonSlugs = new Set(
    filterGatedLessons(
      distinctLessonRows,
      gateCourse,
      watched,
      viewingAsAuthor,
    ).map((r) => r.lessonSlug),
  );
  const gatedRows = availableRows.filter(
    (r) => r.lessonSlug === null || allowedLessonSlugs.has(r.lessonSlug),
  );

  // `rows[0]` (not `gatedRows[0]`) — a user with every lesson locked still
  // gets a course name back, just with no modules underneath it.
  const courseName = rows[0].courseName;
  const modules: ModuleContent[] = [];
  const moduleMap = new Map<number, ModuleContent>();
  // lesson_material.lesson_slug has no unique constraint, so the left-join
  // above can return >1 material row per lesson — key lessons by lessons.id
  // and keep only the first material row seen for each, so a lesson never
  // appears twice in the rendered output.
  const seenLessonIds = new Set<number>();

  for (const row of gatedRows) {
    if (row.moduleId === null || row.moduleName === null) continue;
    let mod = moduleMap.get(row.moduleId);
    if (!mod) {
      mod = { name: row.moduleName, lessons: [] };
      moduleMap.set(row.moduleId, mod);
      modules.push(mod);
    }
    if (row.lessonId === null || row.lessonName === null) continue;
    if (seenLessonIds.has(row.lessonId)) continue;
    seenLessonIds.add(row.lessonId);
    mod.lessons.push({
      name: row.lessonName,
      text: row.text,
      proTips: row.proTips,
    });
  }

  const course: CourseContent = { name: courseName, modules };
  return courseContentToHtml(course);
}
