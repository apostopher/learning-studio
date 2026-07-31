import { and, asc, countDistinct, eq, inArray } from 'drizzle-orm';
import { getUserRoleNames } from '#/db/admin';
import { getLastViewedLessonIdsByCourse } from '#/db/course-last-viewed-batch';
import { ADMIN_ROLE } from '#/lib/admin-schemas';
import { resolveCardResume } from '#/lib/course-card-resume';
import { watchedMilestones } from '#/lib/course-milestones';
import { aggregatePercentByCourse } from '#/lib/course-progress-agg';
import type { ResumeTarget } from '#/lib/course-resume';
import { shapeModuleLessons } from '#/lib/course-shaping';
import type { DBLesson, DBModule } from '@/db/schema';
import {
  courseSubscriptionsTable,
  coursesTable,
  lessonDependenciesTable,
  lessonsTable,
  moduleDependenciesTable,
  modulesTable,
  orgLessonsTable,
  orgsTable,
  videoProgressTable,
} from '@/db/schema';
import { cacheWithRedis } from '@/integrations/upstash/redis';
import type {
  CourseLessonDependencies,
  SubscriptionType,
  VideoResponse,
} from '@/types';
import { db } from '.';

type LessonDetails = DBLesson & {
  dependsOn: CourseLessonDependencies;
  videoId: string;
  /**
   * Whether the lesson has a video assigned, derived from the same two
   * columns the playback layer resolves from. This is the field every
   * consumer outside the playback layer should read — the gating predicate
   * (`#/lib/lesson-gating.ts`) and the learner-facing `/api/course/details`
   * payload both key off this instead of `videoId`/`videoProvider`/`videoRef`,
   * so nothing downstream needs to know which video, only whether one exists.
   */
  hasVideo: boolean;
  videoDetails?: VideoResponse;
  organizations: { id: number; name: string }[];
};
type ModuleDetails = DBModule & {
  dependsOn: string[];
  lessons: LessonDetails[];
};

export async function getCourseDetails(slug: string) {
  // 1️⃣ Get course and its modules in a single query
  const courseWithModules = await db
    .select({
      course: coursesTable,
      module: modulesTable,
    })
    .from(coursesTable)
    .leftJoin(modulesTable, eq(modulesTable.courseId, coursesTable.id))
    .where(eq(coursesTable.slug, slug));

  if (!courseWithModules || courseWithModules.length === 0) return null;

  const course = courseWithModules[0].course;

  // 2️⃣ Get all lessons + dependencies + module dependencies in one query
  const modules = courseWithModules
    .map((m) => m.module)
    .filter((module): module is DBModule => Boolean(module));
  const moduleMapWithDependencies = new Map<number, ModuleDetails>();

  // Create moduleMap from modules array
  modules.forEach((module) => {
    moduleMapWithDependencies.set(module.id, {
      ...module,
      requiredSubscriptions: module.requiredSubscriptions as SubscriptionType[],
      dependsOn: [],
      lessons: [],
    });
  });

  const lessonData = await db
    .select({
      lesson: lessonsTable,
      lessonDep: lessonDependenciesTable,
      moduleDep: moduleDependenciesTable,
      orgLesson: orgLessonsTable,
      org: orgsTable,
    })
    .from(lessonsTable)
    .leftJoin(
      lessonDependenciesTable,
      eq(lessonsTable.id, lessonDependenciesTable.lessonId),
    )
    .leftJoin(
      moduleDependenciesTable,
      eq(lessonsTable.moduleId, moduleDependenciesTable.moduleId),
    )
    .leftJoin(orgLessonsTable, eq(lessonsTable.id, orgLessonsTable.lessonId))
    .leftJoin(orgsTable, eq(orgLessonsTable.orgId, orgsTable.id))
    .where(
      inArray(
        lessonsTable.moduleId,
        db
          .select({ id: modulesTable.id })
          .from(modulesTable)
          .where(eq(modulesTable.courseId, course.id)),
      ),
    );

  // 3️⃣ Restructure the result

  const lessonMap = new Map<number, LessonDetails>();

  for (const { lesson, lessonDep, moduleDep, orgLesson, org } of lessonData) {
    // group lessons
    if (!lessonMap.has(lesson.id)) {
      lessonMap.set(lesson.id, {
        ...lesson,
        requiredSubscriptions:
          lesson.requiredSubscriptions as SubscriptionType[],
        videoId: lesson.videoId || '',
        hasVideo: lesson.videoProvider !== null && lesson.videoRef !== null,
        otherVideoIds: lesson.otherVideoIds || [],
        videoDetails: undefined, // will be populated later
        dependsOn: [],
        organizations: [],
      });
    }
    if (lessonDep?.dependsOn) {
      lessonMap.get(lesson.id)?.dependsOn.push(...lessonDep.dependsOn);
    }

    // Add organization information if it exists
    if (orgLesson && org) {
      const lessonDetails = lessonMap.get(lesson.id);
      if (
        lessonDetails &&
        !lessonDetails.organizations.find((o) => o.id === org.id)
      ) {
        lessonDetails.organizations.push({
          id: org.id,
          name: org.name,
        });
      }
    }

    const mod = moduleMapWithDependencies.get(lesson.moduleId);

    if (moduleDep?.dependsOn && mod) {
      moduleDep.dependsOn.forEach((dep) => {
        if (!mod.dependsOn.includes(dep)) {
          mod.dependsOn.push(dep);
        }
      });
    }

    if (mod && !mod.lessons.find((l) => l.id === lesson.id)) {
      const lessonDetails = lessonMap.get(lesson.id);
      if (lessonDetails) {
        mod.lessons.push(lessonDetails);
      }
    }
  }

  // Drop WIP lessons and order by rank. Gating is enforced against the real
  // lesson_dependencies rows only — the synthetic "chain every lesson in
  // module ids 2..5" block that used to live here was demo scaffolding.
  shapeModuleLessons(moduleMapWithDependencies.values());

  return {
    ...course,
    modules: Array.from(moduleMapWithDependencies.values()).sort(
      (a, b) => Number(a.rank) - Number(b.rank),
    ),
  };
}

export type CourseDetails = Awaited<ReturnType<typeof getCourseDetails>>;

// Key prefix carries a version suffix — bump it (v2 -> v3 -> ...) every time
// this function's RETURN SHAPE changes, not just its data. A cached entry is
// raw `JSON.stringify` of whatever this function returned at write time, with
// no schema tag of its own, so a shape change is invisible to `redis.get`: it
// just hands back an object missing the new field(s). That is exactly what
// happened when `hasVideo` was added — for up to the 6h TTL, every warm entry
// would have deserialised WITHOUT `hasVideo`, and `isLessonSatisfied`'s
// `if (!lesson.hasVideo) return true` would have silently opened every
// prerequisite gate platform-wide (and simultaneously blanked every video,
// via compute-lesson-main-state's `if (!lesson.hasVideo)` no-video branch)
// until the cache aged out. Bumping the prefix here makes every pre-existing
// entry unreachable under the new key, so the very first read after deploy is
// a genuine cache miss that repopulates with the current shape — no manual
// Redis flush required, and it cannot be forgotten the way an operator step
// can.
export const getCourseDetailsWithCache = cacheWithRedis<
  string,
  Awaited<ReturnType<typeof getCourseDetails>>
>('course-details-v2', getCourseDetails);

export type MyCourseSummary = {
  id: number;
  name: string;
  slug: string;
  imageUrlAvif: string | null;
  imageUrlWebp: string | null;
  percent: number;
  /** Where a click on this course's card should land. See getMyCourses. */
  resume: ResumeTarget;
};

/**
 * The courses a user is subscribed to, each with its overall progress
 * percent from one batched query rather than one round trip per course.
 *
 * modulesTable is LEFT JOINed (not INNER) so a subscribed course with zero
 * modules still appears in the result, at 0% — see ManyCourseProgressRow's
 * doc comment for why that placeholder row exists.
 */
export async function getMyCourses(userId: string): Promise<MyCourseSummary[]> {
  const rows = await db
    .select({
      courseId: coursesTable.id,
      name: coursesTable.name,
      slug: coursesTable.slug,
      imageUrlAvif: coursesTable.imageUrlAvif,
      imageUrlWebp: coursesTable.imageUrlWebp,
      moduleId: modulesTable.id,
      lessonId: lessonsTable.id,
      watchedHits: countDistinct(videoProgressTable.progress),
    })
    .from(courseSubscriptionsTable)
    .innerJoin(
      coursesTable,
      eq(coursesTable.id, courseSubscriptionsTable.courseId),
    )
    .leftJoin(modulesTable, eq(modulesTable.courseId, coursesTable.id))
    .leftJoin(lessonsTable, eq(lessonsTable.moduleId, modulesTable.id))
    .leftJoin(
      videoProgressTable,
      and(
        eq(videoProgressTable.userId, userId),
        eq(videoProgressTable.lessonId, lessonsTable.id),
        inArray(videoProgressTable.progress, watchedMilestones),
      ),
    )
    .where(eq(courseSubscriptionsTable.userId, userId))
    .groupBy(
      coursesTable.id,
      coursesTable.name,
      coursesTable.slug,
      coursesTable.imageUrlAvif,
      coursesTable.imageUrlWebp,
      modulesTable.id,
      modulesTable.rank,
      lessonsTable.id,
      lessonsTable.rank,
    )
    // courseId as an explicit tiebreak keeps each course's rows contiguous
    // in the result, which the first-seen-wins loop below relies on.
    .orderBy(
      asc(coursesTable.name),
      asc(coursesTable.id),
      asc(modulesTable.rank),
      asc(lessonsTable.rank),
    );

  const percents = aggregatePercentByCourse(
    rows.map((r) => ({
      courseId: r.courseId,
      moduleId: r.moduleId,
      lessonId: r.lessonId,
      watchedHits: Number(r.watchedHits),
    })),
  );

  const courses = new Map<number, Omit<MyCourseSummary, 'resume'>>();
  for (const r of rows) {
    if (courses.has(r.courseId)) continue;
    courses.set(r.courseId, {
      id: r.courseId,
      name: r.name,
      slug: r.slug,
      imageUrlAvif: r.imageUrlAvif,
      imageUrlWebp: r.imageUrlWebp,
      percent: percents.get(r.courseId) ?? 0,
    });
  }

  // Resolve each card's destination here so a click can go straight to the
  // lesson instead of bouncing through /course/$slug's redirect. Cost is one
  // extra batched query plus the already-cached course payloads — not a round
  // trip per course. All the real logic is in resolveCardResume, which is pure
  // and tested; this is just plumbing.
  const [pointers, roles] = await Promise.all([
    getLastViewedLessonIdsByCourse(userId),
    getUserRoleNames(userId),
  ]);
  const bypassLocks = roles.includes(ADMIN_ROLE);

  return Promise.all(
    [...courses.values()].map(async (course): Promise<MyCourseSummary> => {
      // getCourseDetailsWithCache has no internal try/catch, so a Redis outage
      // throws here rather than resolving to null — without this .catch, that
      // throw would reject the surrounding Promise.all and 500 the whole /app
      // grid, a dependency on Redis /app never had before this resume lookup.
      // Caught and logged per-course instead, so one bad course degrades only
      // its own card.
      const details = await getCourseDetailsWithCache(course.slug).catch(
        (error) => {
          console.error(
            `Failed to load course details for resume resolution (slug: ${course.slug}):`,
            error,
          );
          return null;
        },
      );
      // A missing payload (Redis outage, caught above; or a genuine cache
      // miss with no course row) falls back to 'no-lessons', which keeps the
      // card clickable via the /course/$slug route. During a Redis outage
      // that route's own beforeLoad (getCourseResumeTarget) hits the same
      // missing payload and throws, so the learner does not land correctly
      // either way — the course page is broken during a Redis outage, and
      // this branch doesn't change that. The point of falling back here
      // rather than rejecting is narrower: it keeps /app itself rendering
      // and degrades only this card's destination, instead of one bad
      // course's Redis miss 500ing the whole grid via Promise.all.
      if (!details) {
        return { ...course, resume: { kind: 'none', reason: 'no-lessons' } };
      }

      return {
        ...course,
        resume: resolveCardResume({
          details,
          lessonHits: rows
            .filter((r) => r.courseId === course.id && r.lessonId != null)
            .map((r) => ({
              lessonId: r.lessonId as number,
              watchedHits: Number(r.watchedHits),
            })),
          pointerLessonId: pointers.get(course.id) ?? null,
          bypassLocks,
        }),
      };
    }),
  );
}

/**
 * Just the slugs this user is subscribed to, for the course route's
 * enrollment guard.
 *
 * Separate from getMyCourses deliberately: the guard runs on the critical
 * path of every course navigation and needs one column, while getMyCourses
 * joins modules, lessons and video progress to compute a percentage the guard
 * then discards.
 */
export async function getSubscribedCourseSlugs(
  userId: string,
): Promise<string[]> {
  const rows = await db
    .select({ slug: coursesTable.slug })
    .from(courseSubscriptionsTable)
    .innerJoin(
      coursesTable,
      eq(coursesTable.id, courseSubscriptionsTable.courseId),
    )
    .where(eq(courseSubscriptionsTable.userId, userId))
    .orderBy(asc(coursesTable.name));
  return rows.map((r) => r.slug);
}

/**
 * Resolve a course slug to the identity onboarding needs: its id, and the
 * name every onboarding prompt is written around. Returns null for an unknown
 * slug so callers can answer 404 rather than throwing.
 *
 * Renamed from `getCourseIdBySlug` (which had no call sites yet) rather than
 * given a sibling query: the onboarding server glue needs both fields on
 * every request, and two round trips for one row read — or a function called
 * `…IdBySlug` that also returns a name — would both be worse than one honest
 * name. `slug` is uniquely indexed, so destructuring one row is safe.
 */
export async function getCourseIdentityBySlug(
  slug: string,
): Promise<{ id: number; name: string } | null> {
  const [row] = await db
    .select({ id: coursesTable.id, name: coursesTable.name })
    .from(coursesTable)
    .where(eq(coursesTable.slug, slug));
  return row ?? null;
}
