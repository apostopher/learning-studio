import { and, asc, countDistinct, eq, inArray } from 'drizzle-orm';
import { getUserRoleNames } from '#/db/admin';
import { getLastViewedLessonIdsByCourse } from '#/db/course-last-viewed-batch';
import { getStaffCourseIds, getStaffCourseSlugs } from '#/db/course-staff';
import {
  progressComponentColumns,
  progressComponentGroupBy,
  toComponentFields,
} from '#/db/progress-components';
import { getCurrentLevelsByCourse } from '#/db/user-levels';
import { hasAdminAccess } from '#/lib/admin-schemas';
import { resolveCardResume } from '#/lib/course-card-resume';
import { watchedMilestones } from '#/lib/course-milestones';
import { aggregatePercentByCourse } from '#/lib/course-progress-agg';
import type { ResumeTarget } from '#/lib/course-resume';
import { shapeModuleLessons } from '#/lib/course-shaping';
import { isLessonVisibleAtLevel } from '#/lib/level-visibility';
import type { DBLesson, DBModule } from '@/db/schema';
import {
  courseSubscriptionsTable,
  coursesTable,
  lessonMaterialProgressTable,
  lessonsTable,
  moduleDependenciesTable,
  moduleLessonsTable,
  modulesTable,
  orgLessonsTable,
  orgsTable,
  videoProgressTable,
} from '@/db/schema';
import { cacheWithRedis } from '@/integrations/upstash/redis';
import type {
  CourseLessonDependencies,
  SubscriptionType,
  UserLevel,
} from '@/types';
import { db } from '.';

// Plain `DBLesson &` (no `Omit` needed): `rank` here is ALWAYS the
// placement's rank (see the `lessonMap.set(...)` override below), never a
// lesson-row rank — and now that Task 7 has dropped `lessons.rank` from the
// schema, `DBLesson` no longer carries the field at all, so there is nothing
// left to omit. Declared here independently of `DBLesson` so
// `shapeModuleLessons`'s `ShapeableLesson` constraint (which needs a `rank:
// string`) is satisfied.
type LessonDetails = DBLesson & {
  rank: string;
  dependsOn: CourseLessonDependencies;
  /**
   * Whether the lesson has a video assigned, derived from the same two
   * columns the playback layer resolves from. This is the field every
   * consumer outside the playback layer should read — the gating predicate
   * (`#/lib/lesson-gating.ts`) and the learner-facing `/api/course/details`
   * payload both key off this instead of `videoProvider`/`videoRef` directly,
   * so nothing downstream needs to know which video, only whether one exists.
   */
  hasVideo: boolean;
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

  // Driven from `lessons` INNER JOINed to `module_lessons`, scoped to this
  // course's own modules — this is the membership test itself, not a stray
  // WIP filter, so it is a real INNER join rather than the LEFT-join-in-JOIN
  // pattern used elsewhere in this file: a lesson with no placement in this
  // course must not appear at all. Empty modules do not depend on this query
  // to survive — `moduleMapWithDependencies` above is seeded from every
  // module of the course independent of whether any lesson data comes back
  // for it — so there is no "empty module vanishes" risk here to guard
  // against. `rank` and `dependsOn` come from the placement
  // (`module_lessons`), not the lesson row: a lesson can be third in one
  // course and eighth in another, and the old per-lesson dependency table
  // (one global list per lesson, dropped in Task 7) could never express
  // per-course prerequisites now that one lesson can be taught by several
  // courses — see `module_lessons`' own doc comment in schema.ts.
  //
  // One `module_lessons` row per (lesson, course) is an application-level
  // invariant enforced by `linkLesson` (src/db/placements.ts), not a DB
  // constraint — the unique index is per (module_id, lesson_id). Given that
  // invariant, the INNER JOIN below can add at most one row per lesson for
  // this course's module subquery, so `lessonData` cannot emit the same
  // lesson twice.
  const lessonData = await db
    .select({
      lesson: lessonsTable,
      placement: moduleLessonsTable,
      moduleDep: moduleDependenciesTable,
      orgLesson: orgLessonsTable,
      org: orgsTable,
    })
    .from(lessonsTable)
    .innerJoin(
      moduleLessonsTable,
      eq(moduleLessonsTable.lessonId, lessonsTable.id),
    )
    .leftJoin(
      moduleDependenciesTable,
      eq(moduleLessonsTable.moduleId, moduleDependenciesTable.moduleId),
    )
    .leftJoin(orgLessonsTable, eq(lessonsTable.id, orgLessonsTable.lessonId))
    .leftJoin(orgsTable, eq(orgLessonsTable.orgId, orgsTable.id))
    .where(
      inArray(
        moduleLessonsTable.moduleId,
        db
          .select({ id: modulesTable.id })
          .from(modulesTable)
          .where(eq(modulesTable.courseId, course.id)),
      ),
    );

  // 3️⃣ Restructure the result

  const lessonMap = new Map<number, LessonDetails>();

  for (const { lesson, placement, moduleDep, orgLesson, org } of lessonData) {
    // group lessons
    if (!lessonMap.has(lesson.id)) {
      lessonMap.set(lesson.id, {
        ...lesson,
        // Placement's rank, not the lesson row's own — see the query
        // comment above. `moduleId` isn't carried onto this object at all
        // any more: `lessons.module_id` is gone (Task 7), and the placement
        // itself is looked up by `moduleId` where it's needed (see
        // `moduleMapWithDependencies.get(placement.moduleId)` below), so
        // there is no "which module" ambiguity left to paper over here.
        rank: placement.rank,
        requiredSubscriptions:
          lesson.requiredSubscriptions as SubscriptionType[],
        levels: lesson.levels as UserLevel[],
        hasVideo: lesson.videoProvider !== null && lesson.videoRef !== null,
        otherVideoIds: lesson.otherVideoIds || [],
        dependsOn: [],
        organizations: [],
      });
    }
    if (placement.dependsOn.length > 0) {
      lessonMap.get(lesson.id)?.dependsOn.push(...placement.dependsOn);
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

    const mod = moduleMapWithDependencies.get(placement.moduleId);

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
  // module_lessons.depends_on rows only — the synthetic "chain every lesson
  // in module ids 2..5" block that used to live here was demo scaffolding.
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
  // v2 -> v3: `modules.sequential_lessons` added. Entries written before the
  // column existed deserialise without it, so `sequentialLessons` would read as
  // undefined — falsy — and every module's lesson chain would be silently off
  // for up to the 6h TTL, on a payload that looks otherwise complete.
  //
  // v3 -> v4: `lessons.levels` added. An entry written before this column
  // existed deserialises with `levels` absent, and a level-aware gate reading
  // `undefined` there is exactly the same failure mode as the `hasVideo` and
  // `sequentialLessons` bumps above — either it throws, or a defaulted `[]`
  // reads as "visible to everyone," silently defeating the whole feature for
  // up to the 6h TTL. Bumping the prefix orphans the old entries instead of
  // reading them back as this shape.
>('course-details-v4', getCourseDetails);

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
      // Needed to drop out-of-tier lessons from the card's percentage. Not in
      // GROUP BY because `lessons.id` is, and Postgres treats every other
      // column of that table as functionally dependent on its primary key.
      levels: lessonsTable.levels,
      watchedHits: countDistinct(videoProgressTable.progress),
      ...progressComponentColumns(userId),
    })
    .from(courseSubscriptionsTable)
    .innerJoin(
      coursesTable,
      eq(coursesTable.id, courseSubscriptionsTable.courseId),
    )
    .leftJoin(modulesTable, eq(modulesTable.courseId, coursesTable.id))
    // Two LEFT joins, both deliberate: a module with no placements at all
    // must still carry its module row through to `lessonsTable`'s join (so
    // module_lessons is LEFT, not INNER), and a placed-but-unavailable lesson
    // must still leave the module row standing (so the WIP filter sits
    // inside `lessonsTable`'s join condition, never the WHERE). Either one
    // becoming an inner join, or the WIP check moving to WHERE, would drop a
    // course whose lessons are all unavailable out of this result entirely —
    // its card would vanish from /app instead of reading 0%.
    .leftJoin(
      moduleLessonsTable,
      eq(moduleLessonsTable.moduleId, modulesTable.id),
    )
    .leftJoin(
      lessonsTable,
      and(
        eq(lessonsTable.id, moduleLessonsTable.lessonId),
        eq(lessonsTable.isAvailable, true),
      ),
    )
    .leftJoin(
      videoProgressTable,
      and(
        eq(videoProgressTable.userId, userId),
        eq(videoProgressTable.lessonId, lessonsTable.id),
        inArray(videoProgressTable.progress, watchedMilestones),
      ),
    )
    // Carries both the 'page' visit row and the section-tap rows; see
    // getCourseProgress and progress-components.ts.
    .leftJoin(
      lessonMaterialProgressTable,
      and(
        eq(lessonMaterialProgressTable.userId, userId),
        eq(lessonMaterialProgressTable.lessonSlug, lessonsTable.slug),
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
      moduleLessonsTable.id,
      moduleLessonsTable.rank,
      lessonsTable.id,
      ...progressComponentGroupBy,
    )
    // courseId as an explicit tiebreak keeps each course's rows contiguous
    // in the result, which the first-seen-wins loop below relies on.
    .orderBy(
      asc(coursesTable.name),
      asc(coursesTable.id),
      asc(modulesTable.rank),
      asc(moduleLessonsTable.rank),
    );

  // Resolved up front because BOTH the percentage and the card's destination
  // depend on the pilot's tier: a ring computed over lessons they can never
  // open is permanently capped, and a destination chosen from them is a
  // redirect loop (see resolveResumeTargetForLevel).
  const [pointers, roles, levels] = await Promise.all([
    getLastViewedLessonIdsByCourse(userId),
    getUserRoleNames(userId),
    getCurrentLevelsByCourse(userId),
  ]);
  const bypassLocks = hasAdminAccess(roles);
  // One query for the whole grid, not one per card — and none at all for an
  // admin, who already bypasses on org-wide authority. `subject-expert` and
  // `course-manager` are grants over single courses, so this set is tested
  // per card: staff read their own course as its author and every other card
  // as an ordinary gated learner.
  const staffCourseIds = bypassLocks
    ? new Set<number>()
    : await getStaffCourseIds(userId);
  const viewsAsAuthor = (courseId: number): boolean =>
    bypassLocks || staffCourseIds.has(courseId);
  // Null for an author: they wrote every tier, so none of them filters what
  // they see — the same short-circuit `evaluateLessonGate` makes.
  const levelFor = (courseId: number): UserLevel | null =>
    viewsAsAuthor(courseId) ? null : (levels.get(courseId) ?? 'basic');

  const percents = aggregatePercentByCourse(
    rows
      .filter((r) => {
        // Keep the moduleId/lessonId placeholder rows: they are what keeps a
        // course with no modules (or no visible lessons) in the map at 0%
        // rather than vanishing from it.
        if (r.lessonId === null) return true;
        const level = levelFor(r.courseId);
        return level === null || isLessonVisibleAtLevel(r.levels ?? [], level);
      })
      .map((r) => ({
        courseId: r.courseId,
        moduleId: r.moduleId,
        lessonId: r.lessonId,
        watchedHits: Number(r.watchedHits),
        ...toComponentFields(r),
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
          level: levelFor(course.id),
          bypassLocks: viewsAsAuthor(course.id),
        }),
      };
    }),
  );
}

/**
 * The slugs this user may open, for the course route's enrollment guard:
 * everything they are subscribed to, PLUS every course they are staffed on.
 *
 * Separate from getMyCourses deliberately: the guard runs on the critical
 * path of every course navigation and needs one column, while getMyCourses
 * joins modules, lessons and video progress to compute a percentage the guard
 * then discards.
 *
 * The staff union is what makes spec §6 — "staff view as authors and bypass
 * all gates, but only where they hold authority" — true by construction rather
 * than by side effect. This guard sits IN FRONT of every one of the eight
 * bypass sites: on subscriptions alone, an admin revoking a professor's
 * enrolment (a plain `enrolment:delete`) redirected them off their own course
 * to `/app` with no explanation while `course_staff` still said they authored
 * it, and every bypass behind it became unreachable. It also removes the
 * reason `putCourseStaffHandler` used to auto-enrol everyone it appointed.
 *
 * Two indexed reads rather than one outer-joined scan of `courses`: each side
 * is keyed on `user_id` and the sets are tiny. The result is de-duplicated —
 * a professor is usually enrolled as well — and the caller tests membership,
 * so the appended staff slugs need no place in the name ordering.
 */
export async function getSubscribedCourseSlugs(
  userId: string,
): Promise<string[]> {
  const [subscribed, staffed] = await Promise.all([
    db
      .select({ slug: coursesTable.slug })
      .from(courseSubscriptionsTable)
      .innerJoin(
        coursesTable,
        eq(coursesTable.id, courseSubscriptionsTable.courseId),
      )
      .where(eq(courseSubscriptionsTable.userId, userId))
      .orderBy(asc(coursesTable.name)),
    getStaffCourseSlugs(userId),
  ]);
  return [...new Set([...subscribed.map((r) => r.slug), ...staffed])];
}

/**
 * Whether a course row with this id exists.
 *
 * One boolean, not a row: the admin level route needs it only to answer 404
 * instead of letting `user_levels.course_id`'s foreign key raise and surface
 * as an uncaught 500. A validation failure should read as a validation
 * failure.
 */
export async function courseExists(courseId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: coursesTable.id })
    .from(coursesTable)
    .where(eq(coursesTable.id, courseId))
    .limit(1);
  return row !== undefined;
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
