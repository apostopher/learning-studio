import { watchedMilestones } from './course-milestones';
import type { DebriefFacts } from './debrief-schedule';
import type { TrackedLessonSection } from './lesson-visit-section';

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

  /** Material tabs this lesson has content behind (D12), in canonical order. */
  applicableSectionNames: TrackedLessonSection[];
  /** Tabs the learner has selected at least once (may include now-empty tabs). */
  tappedSectionNames: TrackedLessonSection[];

  /** The lesson has the debrief switch on. */
  hasDebrief: boolean;
  /** The authored quiz has at least one question. */
  hasQuiz: boolean;
  quizPlayed: boolean;

  /**
   * The debrief counts toward the course percent: switch on AND either authored
   * body text, or the server has already produced one for this pilot (so
   * unusable captions never block course-done).
   */
  debriefBearing: boolean;
  debriefPassed: boolean;
  /** ISO. Latest below-par attempt. */
  lastFailedDebriefAt: string | null;
  /** ISO. When the lesson first reached 100% (sticky), from lesson_completions. */
  doneAt: string | null;

  /** The learner has opened this lesson's page at least once. */
  visited: boolean;
};

export type OutstandingItem =
  | { kind: 'video' }
  | { kind: 'quiz' }
  | { kind: 'visit' }
  | { kind: 'section'; section: TrackedLessonSection };

export type LessonProgress = {
  lessonId: number;
  moduleId: number;
  percent: number;
  watched: boolean;
  /** `doneAt !== null` — sticky, unlike `percent === 100`. */
  done: boolean;
  /** What is still missing; empty iff percent === 100. */
  outstanding: OutstandingItem[];
  debrief: DebriefFacts & { bearing: boolean };
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

/** Applicable sections the learner has tapped (intersection, so an emptied-then-tapped tab cannot overshoot). */
function tappedApplicable(row: LessonProgressRow): TrackedLessonSection[] {
  const tapped = new Set(row.tappedSectionNames);
  return row.applicableSectionNames.filter((n) => tapped.has(n));
}

/**
 * Each component this lesson asks of the learner, as a 0..1 fraction.
 *
 * A component is included only when the lesson has it AND the learner can act
 * on it: a lesson with no video is not asked to watch one, a tab with nothing
 * behind it is not asked to be opened.
 *
 * The debrief is NOT a component: it opens 24h after the lesson is done, so it
 * counts toward the course percent instead (see coursePercent). The authored
 * quiz always counts.
 *
 * Continuous, not discrete (D10): video and sections have a real partial
 * state; the quiz is 0 or 1.
 */
function componentFractions(row: LessonProgressRow): number[] {
  const out: number[] = [];

  if (row.hasVideo && row.needsVideoWatch) {
    out.push(Math.min(row.watchedHits, WATCHED_TOTAL) / WATCHED_TOTAL);
  }

  if (row.applicableSectionNames.length > 0) {
    out.push(tappedApplicable(row).length / row.applicableSectionNames.length);
  }

  if (row.hasQuiz) out.push(row.quizPlayed ? 1 : 0);

  return out;
}

/**
 * What is still missing, mirroring `componentFractions` component for
 * component: video, quiz, each untapped applicable section, and the visit only
 * when no component applies. Empty iff the lesson is at 100%.
 */
export function lessonOutstanding(row: LessonProgressRow): OutstandingItem[] {
  const out: OutstandingItem[] = [];
  let components = 0;

  if (row.hasVideo && row.needsVideoWatch) {
    components++;
    if (row.watchedHits < WATCHED_TOTAL) out.push({ kind: 'video' });
  }

  if (row.hasQuiz) {
    components++;
    if (!row.quizPlayed) out.push({ kind: 'quiz' });
  }

  if (row.applicableSectionNames.length > 0) {
    components++;
    const tapped = new Set(row.tappedSectionNames);
    for (const section of row.applicableSectionNames) {
      if (!tapped.has(section)) out.push({ kind: 'section', section });
    }
  }

  if (components === 0 && !row.visited) out.push({ kind: 'visit' });
  return out;
}

/**
 * Course percent: a flat mean over every lesson's percent plus one item per
 * debrief-bearing lesson (100 if passed, else 0). Non-bearing lessons add no
 * debrief item.
 */
export function coursePercent(
  lessons: readonly {
    percent: number;
    debrief: { bearing: boolean; passed: boolean };
  }[],
): number {
  const items: number[] = [];
  for (const l of lessons) {
    items.push(l.percent);
    if (l.debrief.bearing) items.push(l.debrief.passed ? 100 : 0);
  }
  if (items.length === 0) return 0;
  return Math.round(items.reduce((s, p) => s + p, 0) / items.length);
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
 * - course%  = coursePercent: flat mean over lessons plus bearing debriefs.
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
      done: row.doneAt !== null,
      outstanding: lessonOutstanding(row),
      debrief: {
        doneAt: row.doneAt,
        passed: row.debriefPassed,
        lastFailedAt: row.lastFailedDebriefAt,
        bearing: row.debriefBearing,
      },
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

  // Modules still report their own (lesson-mean) percent, empty ones at 0, but
  // the course percent is flat over lessons, so an empty module simply
  // contributes nothing — and a course of only empty modules reads 0, never 100.
  const percent = coursePercent(lessons);

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
