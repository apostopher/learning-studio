/**
 * Shapes the server's internal course-details object into what a learner
 * client is allowed to see, and declares the resulting TYPE for both sides
 * to share.
 *
 * Declared structurally rather than derived from `CourseDetails`
 * (`#/db/course`) — same reasoning as `lesson-gating-inputs.ts`'s
 * `DetailsCourse`: staying free of drizzle means the browser hook that only
 * needs the TYPE (`#/hooks/data/use-course-details.ts`) never has to
 * type-depend on a server module (drizzle, auth, ...), even via an
 * `import type` that erases at build time. This repo has a documented
 * history of exactly that class of import breaking the client build, so the
 * route (the one place that legitimately needs `CourseDetails`) is the only
 * file that imports it — this module and its consumers do not.
 */

type SecretLessonFields = 'videoProvider' | 'videoRef' | 'otherVideoIds';

function omitLessonSecrets<
  T extends Partial<Record<SecretLessonFields, unknown>>,
>(lesson: T): Omit<T, SecretLessonFields> {
  const {
    videoProvider: _videoProvider,
    videoRef: _videoRef,
    otherVideoIds: _otherVideoIds,
    ...rest
  } = lesson;
  return rest;
}

type LessonWithSecrets = Partial<Record<SecretLessonFields, unknown>>;
type CourseShape = {
  modules: readonly { lessons: readonly LessonWithSecrets[] }[];
};

/**
 * Drops every video-identifying field from each lesson before the payload
 * leaves the server: `videoProvider`, `videoRef`, `otherVideoIds`.
 *
 * `videoProvider`/`videoRef` matter most: this route has no zod
 * parse on the way out, only a cast, so whatever ships here lands in the
 * client object and the network tab both. A signed-but-publicly-policied Mux
 * asset is directly streamable from its bare `videoRef` alone
 * (`https://stream.mux.com/{ref}.m3u8`) — that "publicly policied" setting
 * lives in the Mux console, not in code this repo controls, so it cannot be
 * treated as a guarantee. Shipping `videoRef` would let any subscribed
 * learner stream a lesson's video before satisfying its prerequisites,
 * bypassing the gate this migration exists to enforce. Generic over a single
 * type parameter (rather than three mutually-constrained ones for
 * lesson/module/course) so this file never has to import `CourseDetails`
 * (see the module doc comment above) while still keeping TypeScript's
 * inference reliable — a single parameter inferred from a single argument is
 * the case TS solves precisely; splitting it into nested constraints let
 * inference silently fall back to the (narrower) constraint types instead of
 * the real argument type, which would have quietly dropped `id`/`slug`/`name`
 * from the return type. The real `CourseDetails` satisfies the constraint via
 * structural typing at the one call site that matters,
 * `routes/api/course/details.ts`.
 */
export function toLearnerCourseDetails<C extends CourseShape>(
  course: C,
  viewingAsAuthor: boolean,
) {
  return {
    ...course,
    // Required, not optional, and taken as an argument rather than defaulted:
    // the sidebar draws a filtered, locked tree whenever this is false, so a
    // caller that forgot to answer would silently hide an author's own
    // lessons from them. Making it impossible to shape the payload without
    // answering is the only version of this that cannot rot.
    viewingAsAuthor,
    modules: course.modules.map((mod) => ({
      ...mod,
      lessons: mod.lessons.map(omitLessonSecrets),
    })),
  };
}

/**
 * The module/lesson tree the learner UI renders — the actual shape
 * `/api/course/details` serves after `toLearnerCourseDetails`. `null` for an
 * unknown/uncached slug, mirroring `getCourseDetailsWithCache`'s own
 * nullability; every consumer already guards on that (`course.isLoading`/
 * `isError`/`data == null` in `course-sidebar-wrapper.tsx`,
 * `course.data ?? undefined` in the lesson-main/lesson-header wrappers).
 *
 * Lists only the fields real consumers read (see `find-lesson.ts`,
 * `compute-lesson-main-state.ts`, `lesson-gating-inputs.ts`'s
 * `DetailsLesson`, and the sidebar's `LessonLike`/`ModuleLike` types) — the
 * actual server object carries more DB columns than this, which is fine:
 * every consumer narrows further with its own local structural type, the
 * same pattern `DetailsLesson` already uses.
 */
export type LearnerCourseDetails = {
  id: number;
  slug: string;
  name: string;
  /**
   * Whether THIS viewer reads THIS course as its author: an org `owner`/
   * `admin`, or a `subject-expert`/`course-manager` staffed on this course.
   *
   * Per-request, never cached — `getCourseDetailsWithCache`'s Redis entry is
   * keyed by course slug and shared across every student, so this is attached
   * by the route after the shared payload comes back.
   *
   * The client must learn this from the server rather than from its own roles:
   * "am I an admin" and "am I viewing this course as its author" are different
   * questions that only coincided while staff roles did not exist. A sidebar
   * that answers the first one hides a subject expert's own out-of-tier
   * lessons and paints locks on rows that open when clicked — the lessons they
   * are there to author, unreachable through navigation.
   */
  viewingAsAuthor: boolean;
  modules: LearnerCourseModule[];
} | null;

export type LearnerCourseModule = {
  id: number;
  slug: string;
  name: string;
  dependsOn: readonly string[];
  /** Whether this module's lessons must be taken in rank order. */
  sequentialLessons: boolean;
  lessons: LearnerCourseLesson[];
};

export type LearnerCourseLesson = {
  id: number;
  slug: string;
  name: string;
  hasVideo: boolean;
  isAvailable: boolean;
  needsVideoWatch: boolean;
  /**
   * Whether tab 2 of the material panel is the Debrief rather than the
   * authored Quiz. Already carried by the payload (it is a `lessons` column,
   * and only video fields are stripped) — declared here now that the material
   * panel reads it, so no cache-key bump is involved.
   */
  hasDebrief: boolean;
  /** Tiers that see this lesson. Empty means all. */
  levels: readonly string[];
  dependsOn: readonly { lessonSlug: string; moduleSlug?: string }[];
};
