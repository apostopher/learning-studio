import { watchedMilestones } from './course-milestones';

/**
 * Milestones that count toward completion (10..95 — every milestone except the
 * final 100). A lesson's video is 100% / "watched" once all of these are hit;
 * see course-milestones.ts for why 100 is excluded.
 */
const WATCHED_TOTAL = watchedMilestones.length;

/**
 * One DB row per lesson: everything needed to decide which components that
 * lesson asks of the learner, and how far through each they are.
 * `lessonId: null` is a placeholder for a module with no available lessons.
 *
 * Callers supply WIP-filtered rows (`is_available = true`); nothing here
 * re-checks availability.
 *
 * See docs/superpowers/specs/2026-08-01-lesson-completion-ledger.md.
 */
export type LessonProgressRow = {
  moduleId: number;
  lessonId: number | null;

  /** Distinct watched-milestones hit for this lesson's video. */
  watchedHits: number;
  hasVideo: boolean;
  needsVideoWatch: boolean;

  /** Material tabs this lesson actually has content behind (D12). */
  applicableSections: number;
  /** Of those, how many the learner has selected at least once. */
  tappedSections: number;

  /**
   * Tab 2 is Quiz XOR Debrief, decided by `hasDebrief` alone (D21). When it is
   * true the authored quiz is never rendered, so it never counts — even if
   * `canDebrief` is false and the learner ends up with no tab 2 at all.
   */
  hasDebrief: boolean;
  /** The authored quiz has at least one question. */
  hasQuiz: boolean;
  /** The debrief generator has what it needs: key points and body text. */
  canDebrief: boolean;
  quizPlayed: boolean;
  debriefAnswered: boolean;

  /** The learner has opened this lesson's page at least once. */
  visited: boolean;
};

export type LessonProgress = {
  lessonId: number;
  moduleId: number;
  percent: number;
  watched: boolean;
};

export type ModuleProgress = {
  moduleId: number;
  percent: number;
  watchedLessons: number;
  totalLessons: number;
};

export type CourseProgress = {
  slug: string;
  percent: number;
  watchedLessons: number;
  totalLessons: number;
  modules: ModuleProgress[];
  lessons: LessonProgress[];
};

/**
 * Each component this lesson asks of the learner, as a 0..1 fraction.
 *
 * A component is included only when the lesson has it AND the learner can act
 * on it — the same principle `isLessonSatisfied` applies to prerequisites: a
 * requirement no action can satisfy must never count against you. Concretely:
 * a lesson with no video is not asked to watch one, a tab with nothing behind
 * it is not asked to be opened, and a debrief with no key points to generate
 * from is not asked to be answered.
 *
 * Continuous, not discrete (D10): video contributes its milestone fraction and
 * sections their tapped fraction, because both have a real partial state. Quiz
 * and debrief are 0 or 1 — no partial attempt is persisted for either.
 */
function componentFractions(row: LessonProgressRow): number[] {
  const out: number[] = [];

  if (row.hasVideo && row.needsVideoWatch) {
    out.push(Math.min(row.watchedHits, WATCHED_TOTAL) / WATCHED_TOTAL);
  }

  if (row.applicableSections > 0) {
    // Clamped because a section tapped while it had content stays recorded
    // after an admin empties that tab, which would otherwise push the fraction
    // above 1 and the lesson above 100%.
    const tapped = Math.min(row.tappedSections, row.applicableSections);
    out.push(tapped / row.applicableSections);
  }

  // Quiz XOR debrief, never both — `hasDebrief` alone decides which tab
  // renders, so the other component is not merely unfinished, it is unreachable.
  if (row.hasDebrief) {
    if (row.canDebrief) out.push(row.debriefAnswered ? 1 : 0);
  } else if (row.hasQuiz) {
    out.push(row.quizPlayed ? 1 : 0);
  }

  return out;
}

/**
 * A lesson's percentage: the mean of the components that apply to it.
 *
 * A lesson that asks nothing at all — no video, no material, no quiz or
 * debrief — is complete once opened. Without that fallback it would divide by
 * zero, and stranding an empty-but-published lesson at 0% forever is the
 * original bug this whole change exists to fix.
 */
function lessonPercent(row: LessonProgressRow): number {
  const parts = componentFractions(row);
  if (parts.length === 0) return row.visited ? 100 : 0;
  const mean = parts.reduce((s, p) => s + p, 0) / parts.length;
  return Math.round(mean * 100);
}

/**
 * Whether this lesson's VIDEO is fully watched — deliberately NOT "is the
 * lesson complete" (D19).
 *
 * This feeds `watchedLessonSlugs` and so the prerequisite gate, which must not
 * change (D1). Tying it to `percent === 100` would silently turn sections, the
 * quiz and the debrief into unlock requirements — none of which any of
 * `LessonLock`'s three kinds can explain to a student. So `watched` and
 * `percent === 100` diverge, and `watchedLessons` counts videos watched rather
 * than lessons finished.
 */
function lessonWatched(row: LessonProgressRow): boolean {
  return row.watchedHits >= WATCHED_TOTAL;
}

/**
 * Roll per-lesson component rows up into lesson / module / course percentages.
 * Pure — the DB layer supplies `rows`, pre-ordered by module then lesson rank
 * so the output arrays are stable.
 *
 * - lesson%  = round(mean of the components that apply · 100); see lessonPercent.
 * - module%  = round(avg of its lessons' %); 0 for a module with no lessons.
 * - course%  = round(avg of the modules that HAVE lessons); 0 when none do.
 */
export function aggregateCourseProgress(
  slug: string,
  rows: LessonProgressRow[],
): CourseProgress {
  const moduleOrder: number[] = [];
  const lessonsByModule = new Map<number, LessonProgress[]>();

  for (const row of rows) {
    let moduleLessons = lessonsByModule.get(row.moduleId);
    if (!moduleLessons) {
      moduleLessons = [];
      lessonsByModule.set(row.moduleId, moduleLessons);
      moduleOrder.push(row.moduleId);
    }
    if (row.lessonId === null) continue; // empty-module placeholder
    moduleLessons.push({
      lessonId: row.lessonId,
      moduleId: row.moduleId,
      percent: lessonPercent(row),
      watched: lessonWatched(row),
    });
  }

  const modules: ModuleProgress[] = [];
  const lessons: LessonProgress[] = [];
  for (const moduleId of moduleOrder) {
    const moduleLessons = lessonsByModule.get(moduleId) ?? [];
    lessons.push(...moduleLessons);
    const totalLessons = moduleLessons.length;
    const watchedLessons = moduleLessons.reduce(
      (n, l) => n + (l.watched ? 1 : 0),
      0,
    );
    const percent =
      totalLessons === 0
        ? 0
        : Math.round(
            moduleLessons.reduce((s, l) => s + l.percent, 0) / totalLessons,
          );
    modules.push({ moduleId, percent, watchedLessons, totalLessons });
  }

  const totalLessons = modules.reduce((n, m) => n + m.totalLessons, 0);
  const watchedLessons = modules.reduce((n, m) => n + m.watchedLessons, 0);

  // A module with no available lessons is excluded from the course average
  // rather than averaged in at 0%. It is still returned (the sidebar renders
  // its heading and needs a percent for it), it just does not vote.
  //
  // Scoring it 100 instead — which is what the old platform did — would make
  // every course that is still being built read 100% complete, since a course
  // with no published lessons is nothing BUT empty modules. Excluding gives
  // the case that matters (some modules done, one still empty) a course
  // percentage that reflects only the lessons that actually exist.
  const counted = modules.filter((m) => m.totalLessons > 0);
  const percent =
    counted.length === 0
      ? 0
      : Math.round(counted.reduce((s, m) => s + m.percent, 0) / counted.length);

  return { slug, percent, watchedLessons, totalLessons, modules, lessons };
}

/**
 * One flat row tagged with which course it belongs to — the input shape for
 * a query that spans multiple courses at once (see getMyCourses). `moduleId`
 * is nullable here, unlike LessonProgressRow: a LEFT JOIN on modules yields
 * exactly one placeholder row (moduleId: null) for a subscribed course that
 * has zero modules, so that course still appears in the result rather than
 * silently vanishing from a multi-course query.
 */
export type ManyCourseProgressRow = Omit<LessonProgressRow, 'moduleId'> & {
  courseId: number;
  moduleId: number | null;
};

/**
 * Percent complete per course from a flat, course-tagged row set — the
 * multi-course counterpart to aggregateCourseProgress, which it reuses
 * per-group so the two stay in agreement on what "percent" means.
 *
 * A course is registered in the returned map as soon as any row for it is
 * seen, even a moduleId: null placeholder — that is what keeps a
 * zero-module course in the list at 0% instead of being omitted.
 */
export function aggregatePercentByCourse(
  rows: ManyCourseProgressRow[],
): Map<number, number> {
  const byCourse = new Map<number, LessonProgressRow[]>();

  for (const row of rows) {
    if (!byCourse.has(row.courseId)) byCourse.set(row.courseId, []);
    if (row.moduleId === null) continue;
    byCourse.get(row.courseId)?.push({ ...row, moduleId: row.moduleId });
  }

  const percents = new Map<number, number>();
  for (const [courseId, courseRows] of byCourse) {
    // The slug argument only affects aggregateCourseProgress's own `slug`
    // output field, which this function discards — courseId is the key here.
    percents.set(courseId, aggregateCourseProgress('', courseRows).percent);
  }
  return percents;
}
