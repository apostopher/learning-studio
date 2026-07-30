import { asc, eq } from 'drizzle-orm';
import { db } from '#/db';
import { getUserRoleNames } from '#/db/admin';
import { getCourseDetailsWithCache } from '#/db/course';
import { getCourseProgress } from '#/db/course-progress';
import {
  coursesTable,
  lessonMaterialTable,
  lessonsTable,
  modulesTable,
} from '#/db/schema';
import { ADMIN_ROLE } from '#/lib/admin-schemas';
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

type GatedRow = { lessonSlug: string };

/**
 * Drop rows for lessons this user cannot read.
 *
 * The chat widget is mounted app-wide and its knowledge base is assembled from
 * lesson_material, so without this a student locked out of a lesson can simply
 * ask the assistant for its key points. A null `watched` set means "no user
 * context" (an unauthenticated or system caller) and keeps everything —
 * callers that need gating must pass a set.
 */
export function filterGatedLessons<T extends GatedRow>(
  rows: T[],
  course: GateCourse,
  watchedLessonSlugsSet: ReadonlySet<string> | null,
  isAdmin: boolean,
): T[] {
  if (isAdmin || watchedLessonSlugsSet === null) return rows;
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
 * When `opts.userId` is supplied, rows are run through `filterGatedLessons`
 * first so a locked lesson's text/proTips never reach the caller (the chat
 * agent's searchKB tool). Without a `userId` — an unauthenticated or system
 * caller — gating is skipped entirely and every lesson's material is
 * returned, same as before this filter existed.
 */
export async function getCourseContentForAgent(
  slug: string,
  opts?: { userId?: string },
): Promise<string> {
  const rows = await db
    .select({
      courseName: coursesTable.name,
      moduleId: modulesTable.id,
      moduleName: modulesTable.name,
      lessonId: lessonsTable.id,
      lessonSlug: lessonsTable.slug,
      lessonName: lessonsTable.name,
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

  let gatedRows = rows;
  if (opts?.userId) {
    const userId = opts.userId;
    const [roles, details, progress] = await Promise.all([
      getUserRoleNames(userId),
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

    const isAdmin = roles.includes(ADMIN_ROLE);
    const gateCourse = toGateCourse(details);
    const watched = watchedLessonSlugs(details, progress);

    // Gate on the distinct lesson slugs rather than the raw (possibly
    // duplicated, possibly lesson-less) rows, then filter the original rows
    // by the resulting allow-list — this keeps `rows`' module/lesson rank
    // ordering intact and leaves module-only rows (no matched lesson) alone,
    // since they carry no lesson material to leak.
    const distinctLessonRows = [
      ...new Set(
        rows
          .map((r) => r.lessonSlug)
          .filter((slug): slug is string => slug !== null),
      ),
    ].map((lessonSlug) => ({ lessonSlug }));
    const allowedLessonSlugs = new Set(
      filterGatedLessons(distinctLessonRows, gateCourse, watched, isAdmin).map(
        (r) => r.lessonSlug,
      ),
    );
    gatedRows = rows.filter(
      (r) => r.lessonSlug === null || allowedLessonSlugs.has(r.lessonSlug),
    );
  }

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
